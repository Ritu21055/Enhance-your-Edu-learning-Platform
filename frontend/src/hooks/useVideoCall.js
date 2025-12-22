import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { getBackendUrl } from '../config/network';

/**
 * Clean Video Call Hook
 * Handles only video/audio streaming between participants
 * No duplicates, clean implementation
 */
const useVideoCall = (meetingId, userName) => {
  // State
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  
  // Check URL params to determine initial host status
  const urlParams = new URLSearchParams(window.location.search);
  const urlIsHost = urlParams.get('host') === 'true';
  const [isHost, setIsHost] = useState(urlIsHost); // Initialize from URL
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Refs
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const isInitializedRef = useRef(false);
  const createPeerConnectionRef = useRef(null);
  const participantsRef = useRef([]);
  const hostIdRef = useRef(null);
  const usernameToSocketIdRef = useRef({}); // Map username to current socket ID
  const signalQueueRef = useRef([]); // Queue signals if socket isn't ready
  const earlySignalQueueRef = useRef([]); // Queue signals that arrive before media is ready
  const reconnectingUsersRef = useRef(new Set()); // Track users currently reconnecting
  const remoteStreamsRef = useRef({}); // Track remote streams for debugging
  const participantMediaStateRef = useRef({}); // Track video/audio enabled state for each participant

  // Initialize Socket Connection
  useEffect(() => {
    const newSocket = io(getBackendUrl());
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setSocketConnected(true);
      
      // Process queued signals now that socket is ready
      if (signalQueueRef.current.length > 0) {
        signalQueueRef.current.forEach(({ to, from, signal }) => {
          if (socketRef.current && socketRef.current.id) {
            socketRef.current.emit('signal', { to, from: socketRef.current.id, signal });
          }
        });
        signalQueueRef.current = [];
      }
      
      // CRITICAL: Don't emit join-meeting here - user already joined from MeetingLobby
      // The backend will handle reconnection automatically
      // Only emit if we're not already in the meeting (check URL params)
      const urlParams = new URLSearchParams(window.location.search);
      const isApproved = urlParams.get('approved') === 'true';
      const isWaiting = urlParams.get('waiting') === 'true';
      
      // CRITICAL: Always emit join-meeting with new socket
      // The backend will handle reconnection and recognize the user
      // If user came from lobby, we still need to join with the new socket ID
      
      // Check if password was verified in lobby (stored in sessionStorage) - for participants
      const verifiedPassword = sessionStorage.getItem(`meeting_password_${meetingId}`);
      const hasVerifiedPassword = !!verifiedPassword;
      
      // CRITICAL: Check if host password was set in lobby (stored in sessionStorage) - for hosts
      const hostPassword = sessionStorage.getItem(`meeting_host_password_${meetingId}`);
      const hasHostPassword = hostPassword !== null; // null means not set, empty string means host set empty password
      
      // CRITICAL: If password was verified in lobby, include it and set isHost to false
      // Password verification means user is a participant, not host
      const joinData = { 
        meetingId, 
        userName,
        isHost: hasVerifiedPassword ? false : urlIsHost // If password verified, user is participant
      };
      
      if (hasVerifiedPassword) {
        joinData.password = verifiedPassword;
      }
      
      // CRITICAL: If host password was set in lobby, include it as setPassword
      // This allows the host to reclaim their meeting when they reconnect
      if (hasHostPassword && urlIsHost && !hasVerifiedPassword) {
        joinData.setPassword = hostPassword || null; // Empty string becomes null, actual password stays as is
      }
      
      newSocket.emit('join-meeting', joinData);
    });

    // Handle meeting joined
    newSocket.on('meeting-joined', async (data) => {
      // Clear verified password from sessionStorage after successful join
      if (sessionStorage.getItem(`meeting_password_${meetingId}`)) {
        sessionStorage.removeItem(`meeting_password_${meetingId}`);
      }
      const { meeting, isHost: userIsHost } = data;
      
      // CRITICAL: Double-check host status - only set as host if actually the host
      // Check if this socket ID matches the hostId from meeting
      const actualHostId = meeting?.hostId;
      const isActuallyHost = actualHostId === newSocket.id;
      
      // Use actual host check, not just the provided value
      const hostStatus = isActuallyHost;
      
      setIsHost(hostStatus);
      isHostRef.current = hostStatus;
      
      const meetingParticipants = meeting?.participants || [];
      setParticipants(meetingParticipants);
      participantsRef.current = meetingParticipants; // Update ref for signal handler
      hostIdRef.current = meeting?.hostId || null; // Store hostId for signal handler
      
      // CRITICAL: Initialize media if not already initialized
      // Both host and participant need media to establish connections
      if (!isInitializedRef.current || !streamRef.current) {
        try {
          const stream = await initializeMedia();
          
          // CRITICAL: Ensure local stream state is updated
          if (stream && stream !== streamRef.current) {
            setLocalStream(stream);
          }
          
          // CRITICAL: Process any signals that arrived before media was ready
          if (earlySignalQueueRef.current.length > 0) {
            // Sort signals: offers first, then answers, then ICE candidates
            const sortedSignals = earlySignalQueueRef.current.sort((a, b) => {
              const typeOrder = { offer: 0, answer: 1, candidate: 2 };
              return (typeOrder[a.signal.type] || 99) - (typeOrder[b.signal.type] || 99);
            });
            
            for (const { from, signal } of sortedSignals) {
              // Check if peer already exists (might have been created by meeting-joined handler)
              if (peersRef.current[from]) {
                try {
                  peersRef.current[from].signal(signal);
                } catch (error) {
                  console.error(`Error processing queued signal for ${from}:`, error);
                }
              } else {
                // Create peer connection and process signal
                const currentParticipants = participantsRef.current;
                const senderParticipant = currentParticipants.find(p => p.id === from);
                const senderIsHost = senderParticipant?.isHost || (from === hostIdRef.current);
                let isInitiator = false;
                
                if (isHostRef.current) {
                  isInitiator = true;
                } else if (senderIsHost) {
                  isInitiator = false;
                } else {
                  isInitiator = newSocket.id < from;
                }
                
                if (createPeerConnectionRef.current) {
                  createPeerConnectionRef.current(from, isInitiator);
                  // Process signal after peer is created
                  setTimeout(() => {
                    if (peersRef.current[from]) {
                      try {
                        peersRef.current[from].signal(signal);
                      } catch (error) {
                        console.error(`Error processing queued signal after peer creation:`, error);
                      }
                    }
                  }, 200);
                }
              }
            }
            
            // Clear the queue
            earlySignalQueueRef.current = [];
            console.log(`✅ Finished processing queued signals`);
          }
        } catch (error) {
          console.error('❌ Failed to initialize media:', error);
        }
      }
      
      // CRITICAL: Create peer connections to all existing participants
      // This ensures that when a participant joins, they can see/hear the host and vice versa
      if (meetingParticipants.length > 0) {
        console.log('🔗 Creating peer connections to existing participants:', meetingParticipants.length);
        
        // Wait for local stream to be ready (reduced attempts and faster polling)
        const waitForStream = async (maxAttempts = 10) => {
          for (let i = 0; i < maxAttempts; i++) {
            if (streamRef.current && isInitializedRef.current) {
              console.log(`✅ Stream ready after ${i + 1} attempts`);
              return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduced from 300ms to 100ms
          }
          console.warn('⚠️ Stream not ready after max attempts, creating connections anyway');
          return false; // Return false but still try to create connections
        };
        
        const streamReady = await waitForStream();
        
        // Create connections even if stream is not ready (it will be ready soon)
        if (createPeerConnectionRef.current) {
          // Create connections to all existing participants (except self)
          meetingParticipants.forEach((participant) => {
            if (participant.id !== newSocket.id && !peersRef.current[participant.id]) {
              console.log(`🔗 Creating peer connection to existing participant: ${participant.name} (${participant.id})`);
              
              // Determine initiator: host is always initiator, or use socket ID comparison
              // CRITICAL: If I'm the host, I'm always initiator
              // If I'm a participant and connecting to host, I'm NOT initiator
              // If both are participants, lower socket ID is initiator
              let isInitiator = false;
              const participantIsHost = participant.isHost;
              
              if (hostStatus) {
                // I'm the host, so I'm always initiator
                isInitiator = true;
              } else if (participantIsHost) {
                // I'm a participant connecting to host, so I'm NOT initiator
                isInitiator = false;
              } else {
                // Both are participants, use socket ID comparison
                isInitiator = newSocket.id < participant.id;
              }
              
              // Create connection immediately if stream is ready, otherwise wait
              const createConnection = () => {
                if (createPeerConnectionRef.current) {
                  createPeerConnectionRef.current(participant.id, isInitiator);
                } else {
                  console.error('createPeerConnection not available!');
                }
              };
              
              if (streamReady) {
                // Stream is ready, create immediately
                createConnection();
              } else {
                // Stream not ready, wait a bit
                setTimeout(createConnection, 300);
              }
            }
          });
        } else {
          // Retry when function becomes available (faster polling)
          const checkStream = setInterval(() => {
            if (createPeerConnectionRef.current) {
              clearInterval(checkStream);
              meetingParticipants.forEach((participant) => {
                if (participant.id !== newSocket.id && !peersRef.current[participant.id]) {
                  let isInitiator = false;
                  if (hostStatus) {
                    isInitiator = true;
                  } else {
                    isInitiator = newSocket.id < participant.id;
                  }
                  // Create immediately without delay
                  createPeerConnectionRef.current(participant.id, isInitiator);
                }
              });
            }
          }, 100);
          
          // Clear interval after 10 seconds
          setTimeout(() => {
            clearInterval(checkStream);
          }, 10000);
        }
      }
      
      // CRITICAL FALLBACK: If hostId exists but host is not in participants list, create connection to host
      // This can happen if the host set the password but hasn't fully joined yet, or if there's a backend issue
      if (!hostStatus && actualHostId && actualHostId !== newSocket.id) {
        const hostInParticipants = meetingParticipants.find(p => p.id === actualHostId);
        if (!hostInParticipants) {
          // Wait for stream and create connection to host
          const waitForStream = async (maxAttempts = 10) => {
            for (let i = 0; i < maxAttempts; i++) {
              if (streamRef.current && isInitializedRef.current) {
                return true;
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            return false;
          };
          
          const streamReady = await waitForStream();
          if (createPeerConnectionRef.current && !peersRef.current[actualHostId]) {
            // Participant connects to host, so participant is NOT initiator
            setTimeout(() => {
              if (createPeerConnectionRef.current) {
                createPeerConnectionRef.current(actualHostId, false);
              }
            }, streamReady ? 100 : 300);
          }
        }
      }
    });

    // Handle meeting info (for reconnections when socket ID changes)
    newSocket.on('meeting-info', (data) => {
      const { hostId, isHost: userIsHost, participants: meetingParticipants } = data;
      
      // Check if this socket is the host
      const isActuallyHost = hostId === newSocket.id;
      
      setIsHost(isActuallyHost);
      isHostRef.current = isActuallyHost;
      const updatedParticipants = meetingParticipants || [];
      setParticipants(updatedParticipants);
      participantsRef.current = updatedParticipants; // Update ref
      hostIdRef.current = hostId; // Update hostId ref
    });

    // Handle new participant joining (only approved participants)
    newSocket.on('participant-joined', async (data) => {
      const { participant, meeting } = data;
      
      if (participant) {
        // Only process approved participants or hosts
        // CRITICAL: Hosts don't need approval, they're always approved
        // CRITICAL: If isApproved is undefined but participant is not host, 
        // assume they're approved if they're in the meeting (they verified password)
        const isApproved = participant.isApproved !== undefined 
          ? participant.isApproved 
          : !participant.isHost; // If undefined, assume approved if not host (they joined with password)
        
        if (!isApproved && !participant.isHost) {
          return;
        }

        // CRITICAL: Check if this is a reconnection (same username, different socket ID)
        const previousSocketId = usernameToSocketIdRef.current[participant.name];
        const isReconnection = previousSocketId && previousSocketId !== participant.id;
        
        // Check if this user is already in the process of reconnecting
        if (reconnectingUsersRef.current.has(participant.name)) {
          return;
        }
        
        if (isReconnection) {
          // Mark user as reconnecting
          reconnectingUsersRef.current.add(participant.name);
          
          // Clean up old peer connection
          if (peersRef.current[previousSocketId]) {
            try {
              peersRef.current[previousSocketId].destroy();
            } catch (error) {
              console.warn(`Error destroying old peer:`, error);
            }
            delete peersRef.current[previousSocketId];
          }
          
          // Clean up old remote stream
          setRemoteStreams(prev => {
            const updated = { ...prev };
            delete updated[previousSocketId];
            remoteStreamsRef.current = updated; // Update ref
            return updated;
          });
          
          // Remove old participant from list (but keep the new one)
          setParticipants(prev => {
            const filtered = prev.filter(p => p.id !== previousSocketId);
            // Check if new participant is already in list
            const exists = filtered.find(p => p.id === participant.id);
            if (exists) {
              console.log('⏭️ New participant already in list after cleanup:', participant.name);
              participantsRef.current = filtered; // Update ref
              return filtered;
            }
            console.log('✅ Adding reconnected participant to list:', participant.name);
            const updated = [...filtered, participant];
            participantsRef.current = updated; // Update ref
            return updated;
          });
        } else {
          // Not a reconnection, just add to list normally
          setParticipants(prev => {
            const exists = prev.find(p => p.id === participant.id);
            if (exists) {
              console.log('⏭️ Participant already in list:', participant.name);
              return prev;
            }
            console.log('✅ Adding new participant to list:', participant.name);
            const updated = [...prev, participant];
            participantsRef.current = updated; // Update ref
            return updated;
          });
        }

        // Update username to socket ID mapping
        usernameToSocketIdRef.current[participant.name] = participant.id;

        // Don't create connection to self
        if (participant.id === newSocket.id) {
          console.log('⏭️ Skipping self connection');
          return;
        }

        // Check if connection already exists for this socket ID
        if (peersRef.current[participant.id]) {
          console.log('⏭️ Connection already exists to:', participant.name, `(${participant.id})`);
          return;
        }
        
        // Helper function to create connection (used for both normal and reconnection cases)
        const createConnectionForParticipant = async () => {
          // CRITICAL: PERMANENT FIX - NEVER touch host's stream when participant joins/accepts
          // This prevents host's video from disappearing when participants join or approve
          const isHost = isHostRef.current;
          const hasExistingStream = isInitializedRef.current && streamRef.current;
          
          if (isHost && hasExistingStream) {
            console.log('⏭️ PERMANENT FIX: Host already has stream, COMPLETELY SKIPPING any media operations');
            // CRITICAL: Host already has stream - PROTECT IT COMPLETELY
            // DO NOT re-initialize, DO NOT modify, DO NOT touch the stream in any way
            const currentStream = streamRef.current;
            
            // CRITICAL: Only ensure stream is in state (non-destructive operation)
            if (!localStream || localStream.id !== currentStream.id) {
              console.log('🔄 Updating local stream state to match current stream (non-destructive)');
              setLocalStream(currentStream);
            }
            
            // CRITICAL: Verify tracks are enabled but DON'T modify them unless absolutely necessary
            const videoTrack = currentStream.getVideoTracks()[0];
            const audioTrack = currentStream.getAudioTracks()[0];
            
            // Only log if there's an issue, but don't aggressively fix (let protection system handle it)
            if (videoTrack && !videoTrack.enabled) {
              console.warn('🎥 Host video track was disabled - protection system should handle this');
            }
            if (audioTrack && !audioTrack.enabled) {
              console.warn('🎥 Host audio track was disabled - protection system should handle this');
            }
            
            // CRITICAL: Skip ALL media initialization and proceed directly to connection creation
            // This ensures host's stream is NEVER touched
          } else if (!isHost && !hasExistingStream) {
            // CRITICAL FIX: Participant must initialize media BEFORE creating connection
            console.log('🎥 Participant: Media not initialized, initializing now...');
            try {
              await initializeMedia();
              console.log('✅ Participant: Media initialized successfully');
            } catch (error) {
              console.error('❌ Participant: Failed to initialize media:', error);
              return; // Don't create connection if media fails
            }
          }

          // Wait for stream to be ready before creating connection (faster)
          const waitForStream = async (maxAttempts = 10) => {
            for (let i = 0; i < maxAttempts; i++) {
              if (streamRef.current && isInitializedRef.current) {
                console.log(`✅ Stream ready after ${i + 1} attempts`);
                return true;
              }
              await new Promise(resolve => setTimeout(resolve, 100)); // Reduced from 300ms to 100ms
            }
            console.warn('⚠️ Stream not ready after max attempts, creating connection anyway');
            return false; // Still try to create connection
          };

          const streamReady = await waitForStream();
          if (!streamReady) {
            console.warn('⚠️ Stream not ready, will retry connection creation...');
            // Retry after a shorter delay
            setTimeout(() => {
              if (streamRef.current && isInitializedRef.current && createPeerConnectionRef.current) {
                // Determine initiator correctly
                const participantIsHost = participant.isHost;
                let isInitiator = false;
                if (isHostRef.current) {
                  isInitiator = true;
                } else if (participantIsHost) {
                  isInitiator = false;
                } else {
                  isInitiator = newSocket.id < participant.id;
                }
                console.log(`🔗 Retry: Creating connection to ${participant.name}, initiator: ${isInitiator}`);
                createPeerConnectionRef.current(participant.id, isInitiator);
              }
            }, 500); // Reduced from 1500ms to 500ms
            return;
          }

          // Determine initiator: host is always initiator, or use socket ID comparison
          // CRITICAL: If I'm the host, I'm always initiator
          // If I'm a participant and connecting to host, I'm NOT initiator
          // If both are participants, lower socket ID is initiator
          let isInitiator = false;
          const participantIsHost = participant.isHost;
          
          if (isHostRef.current) {
            // I'm the host, so I'm always initiator
            isInitiator = true;
          } else if (participantIsHost) {
            // I'm a participant connecting to host, so I'm NOT initiator
            isInitiator = false;
          } else {
            // Both are participants, use socket ID comparison
            isInitiator = newSocket.id < participant.id;
          }
          
          console.log(`🔗 Creating peer connection to new participant:`, {
            participantName: participant.name,
            participantId: participant.id,
            mySocketId: newSocket.id,
            isInitiator: isInitiator,
            iAmHost: isHostRef.current,
            theyAreHost: participantIsHost,
            streamReady: streamReady
          });

          // Create connection immediately if stream is ready
          const createConnection = () => {
            if (createPeerConnectionRef.current) {
              console.log(`🚀 Creating connection NOW to new participant ${participant.name} (${participant.id})`);
              createPeerConnectionRef.current(participant.id, isInitiator);
            } else {
              console.error('❌ createPeerConnection not available!');
            }
          };
          
          if (streamReady) {
            // Stream is ready, create immediately
            createConnection();
          } else {
            // Stream not ready, wait a bit
            setTimeout(createConnection, 200);
          }
        };
        
        // For reconnections, add a small delay to ensure old connection is fully cleaned up
        if (isReconnection) {
          console.log(`⏸️ Reconnection detected, waiting 200ms before creating new connection for ${participant.name}`);
          setTimeout(() => {
            // Double-check that we still don't have a connection and participant is still in list
            if (!peersRef.current[participant.id] && participantsRef.current.find(p => p.id === participant.id)) {
              // Continue with connection creation
              createConnectionForParticipant().finally(() => {
                // Remove from reconnecting set after connection attempt completes
                reconnectingUsersRef.current.delete(participant.name);
              });
            } else {
              console.log(`⏭️ Skipping connection creation for ${participant.name} - already exists or participant removed`);
              // Remove from reconnecting set
              reconnectingUsersRef.current.delete(participant.name);
            }
          }, 200);
          return;
        }
        
        // For normal (non-reconnection) case, create connection immediately
        createConnectionForParticipant();
      }
    });

    // Handle participant leaving
    newSocket.on('participant-left', (data) => {
      const { participantId } = data;
      
      // Find participant name for cleanup
      const participant = participantsRef.current.find(p => p.id === participantId);
      if (participant) {
        // Remove from username mapping
        delete usernameToSocketIdRef.current[participant.name];
      }
      
      // Close peer connection
      if (peersRef.current[participantId]) {
        try {
          peersRef.current[participantId].destroy();
        } catch (error) {
          console.warn(`⚠️ Error destroying peer on leave:`, error);
        }
        delete peersRef.current[participantId];
      }

      // Remove from remote streams
      setRemoteStreams(prev => {
        const updated = { ...prev };
        delete updated[participantId];
        remoteStreamsRef.current = updated; // Update ref
        return updated;
      });

      // Remove from participants
      setParticipants(prev => prev.filter(p => p.id !== participantId));
    });

    // Handle media state changes (when participant toggles video/audio)
    const handleMediaStateChange = (data) => {
      const { participantId, videoEnabled, audioEnabled } = data;
      
      // Update media state tracking
      if (!participantMediaStateRef.current[participantId]) {
        participantMediaStateRef.current[participantId] = {};
      }
      participantMediaStateRef.current[participantId].videoEnabled = videoEnabled;
      participantMediaStateRef.current[participantId].audioEnabled = audioEnabled;
      
      // Update video element DOM - simple and clean approach
      setTimeout(() => {
        const stream = remoteStreamsRef.current[participantId];
        if (stream) {
          const videoElement = document.querySelector(`video[data-participant-id="${participantId}"]`);
          if (videoElement) {
            const videoTrack = stream.getVideoTracks()[0];
            const trackReady = videoTrack?.readyState === 'live';
            const trackEnded = videoTrack?.readyState === 'ended';
            const trackEnabled = videoTrack?.enabled ?? false;
            
            // CRITICAL: Show video if:
            // 1. Socket says videoEnabled is true (explicitly enabled)
            // 2. OR socket says undefined/unknown AND track exists and is not ended
            // Don't hide just because track.enabled is false - it might be temporarily disabled
            const shouldShow = videoEnabled === true || 
                              (videoEnabled !== false && videoTrack && !trackEnded && trackReady);
            
            console.log(`📹 Media state change for ${participantId}:`, {
              videoEnabled,
              trackReady,
              trackEnded,
              trackEnabled,
              shouldShow,
              streamActive: stream.active,
              hasVideoTrack: !!videoTrack
            });
            
            if (shouldShow) {
              // Video is enabled - restore stream if needed
              // CRITICAL: Always restore actual stream when video should be shown
              if (videoElement.srcObject !== stream) {
                console.log(`📹 Restoring actual stream for ${participantId}`);
                videoElement.srcObject = stream;
              }
              
              // Ensure track is enabled if it exists
              if (videoTrack && !videoTrack.enabled) {
                videoTrack.enabled = true;
                console.log(`📹 Re-enabled video track for ${participantId}`);
              }
              
              videoElement.style.opacity = '1';
              videoElement.style.visibility = 'visible';
              videoElement.style.display = 'block';
              if (videoElement.paused && stream.active) {
                videoElement.play().catch(() => {});
              }
            } else {
              // Video is disabled - hide but don't destroy the stream connection
              videoElement.style.opacity = '0';
              videoElement.style.visibility = 'hidden';
              videoElement.style.display = 'none';
              videoElement.pause();
              
              // Only replace with blank if explicitly disabled (not just track ended or temporarily disabled)
              if (videoEnabled === false) {
                try {
                  const canvas = document.createElement('canvas');
                  canvas.width = 1;
                  canvas.height = 1;
                  const blankStream = canvas.captureStream(0);
                  videoElement.srcObject = blankStream;
                } catch (e) {
                  // If blank stream fails, just leave it as is
                }
              }
            }
          }
          
          // Update audio tracks - strict: only enable if explicitly true
          const audioTracks = stream.getAudioTracks();
          audioTracks.forEach((audioTrack) => {
            // Only enable if audioEnabled is explicitly true, otherwise disable
            const shouldEnableAudio = audioEnabled === true;
            if (audioTrack.enabled !== shouldEnableAudio) {
              audioTrack.enabled = shouldEnableAudio;
            }
          });
        }
      }, 0);
      
      // Force update remote streams to trigger re-render
      setRemoteStreams(prev => {
        const updated = { ...prev };
        if (updated[participantId]) {
          updated[participantId] = updated[participantId]; // Trigger re-render
        }
        return updated;
      });
    };
    
    // Listen for the broadcast event from backend
    newSocket.on('participant-media-state-changed', handleMediaStateChange);
    
    // Also listen for direct media-state-change (in case it's used)
    newSocket.on('media-state-change', handleMediaStateChange);

    // Handle signaling data
    newSocket.on('signal', (data) => {
      let { from, signal } = data;
      
      // CRITICAL: If from is undefined, try to find the host from meeting data
      if (!from || from === 'undefined') {
        console.warn(`⚠️ Received signal with undefined from field, attempting to identify sender...`);
        // Try to find the host from participants list (use ref to get latest)
        const currentParticipants = participantsRef.current;
        const hostParticipant = currentParticipants.find(p => p.isHost && p.id !== newSocket.id);
        if (hostParticipant) {
          from = hostParticipant.id;
          console.log(`✅ Identified sender as host: ${from}`);
        } else if (hostIdRef.current && hostIdRef.current !== newSocket.id) {
          // Use stored hostId if available
          from = hostIdRef.current;
          console.log(`✅ Using stored hostId as sender: ${from}`);
        } else {
          // Try to find any participant that's not self
          const otherParticipant = currentParticipants.find(p => p.id !== newSocket.id);
          if (otherParticipant) {
            from = otherParticipant.id;
            console.log(`✅ Identified sender as participant: ${from}`);
          } else {
            console.error(`❌ Cannot identify signal sender, ignoring signal`);
            return;
          }
        }
      }
      
      console.log(`📥📥📥 Received signal from ${from} to ${newSocket.id}:`);
      console.log(`  - signalType: ${signal.type}`);
      console.log(`  - hasSDP: ${!!signal.sdp}`);
      console.log(`  - hasCandidate: ${!!signal.candidate}`);
      console.log(`  - hasPeer: ${!!peersRef.current[from]}`);
      console.log(`  - mySocketId: ${newSocket.id}`);
      console.log(`  - from: ${from}`);
      
      if (peersRef.current[from]) {
        console.log(`✅✅✅ Processing signal for existing peer: ${from}`);
        console.log(`  - Signal type: ${signal.type}`);
        try {
          peersRef.current[from].signal(signal);
          console.log(`✅✅✅ Signal processed successfully for ${from}`);
          console.log(`  - Peer ready: ${peersRef.current[from].ready}`);
          console.log(`  - Peer destroyed: ${peersRef.current[from].destroyed}`);
        } catch (error) {
          console.error(`❌❌❌ Error processing signal for ${from}:`, error);
          console.error(`  - Error message: ${error.message}`);
          console.error(`  - Error stack: ${error.stack}`);
        }
      } else {
        console.log(`⚠️ No peer connection exists for ${from}, creating one...`);
        // If we receive a signal but don't have a peer connection, create one
        // This can happen if signals arrive before the connection is created
        if (streamRef.current && isInitializedRef.current && createPeerConnectionRef.current) {
          // Determine initiator: if I'm participant and they're host, I'm NOT initiator
          // If both are participants, use socket ID comparison
          const currentParticipants = participantsRef.current;
          const senderParticipant = currentParticipants.find(p => p.id === from);
          const senderIsHost = senderParticipant?.isHost || (from === hostIdRef.current);
          let isInitiator = false;
          
          if (isHostRef.current) {
            // I'm host, so I'm initiator
            isInitiator = true;
          } else if (senderIsHost) {
            // They're host, I'm participant, so I'm NOT initiator
            isInitiator = false;
          } else {
            // Both are participants, use socket ID comparison
            isInitiator = newSocket.id < from;
          }
          
          console.log(`🔗 Creating peer connection from signal:`, {
            from,
            mySocketId: newSocket.id,
            isInitiator,
            signalType: signal.type,
            senderIsHost,
            iAmHost: isHostRef.current
          });
          createPeerConnectionRef.current(from, isInitiator);
          // Process the signal after peer is created
          setTimeout(() => {
            if (peersRef.current[from]) {
              console.log(`✅ Processing signal after peer creation: ${from}`);
              try {
                peersRef.current[from].signal(signal);
                console.log(`✅ Signal processed after peer creation for ${from}`);
              } catch (error) {
                console.error(`❌ Error processing signal after peer creation:`, error);
              }
            } else {
              console.error(`❌ Peer still not created after delay: ${from}`);
            }
          }, 100); // Reduced delay
        } else {
          // CRITICAL: Queue signal if media isn't ready yet
          console.log(`📦 Queueing signal from ${from} - media not ready yet:`, {
            hasStream: !!streamRef.current,
            isInitialized: isInitializedRef.current,
            hasCreateFunction: !!createPeerConnectionRef.current,
            signalType: signal.type,
            from,
            mySocketId: newSocket.id
          });
          earlySignalQueueRef.current.push({ from, signal, timestamp: Date.now() });
          console.log(`📦 Early signal queue now has ${earlySignalQueueRef.current.length} signals`);
        }
      }
    });


    // Cleanup
    return () => {
      // Close all peer connections
      Object.values(peersRef.current).forEach(peer => {
        if (peer && !peer.destroyed) {
          try {
            peer.destroy();
          } catch (error) {
            console.warn(`⚠️ Error destroying peer on cleanup:`, error);
          }
        }
      });
      peersRef.current = {};
      usernameToSocketIdRef.current = {};
      signalQueueRef.current = [];
      earlySignalQueueRef.current = [];
      reconnectingUsersRef.current.clear();
      
      // Stop local stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      newSocket.disconnect();
    };
  }, [meetingId, userName]);

  // Track host status
  const isHostRef = useRef(false);
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  // Initialize Media (Camera + Microphone)
  const initializeMedia = useCallback(async () => {
    try {
      if (isInitializedRef.current && streamRef.current) {
        console.log('🎥 Media already initialized, returning existing stream');
        // CRITICAL: Ensure state is updated even if stream already exists
        if (streamRef.current && !localStream) {
          console.log('🔄 Updating local stream state from existing stream');
          setLocalStream(streamRef.current);
        }
        return streamRef.current;
      }
      
      console.log('🎥 Requesting user media...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ User media obtained:', {
        streamId: stream.id,
        active: stream.active,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });

      streamRef.current = stream;
      setLocalStream(stream);
      isInitializedRef.current = true;
      
      console.log('✅ Media initialization complete, local stream state updated');

      return stream;
    } catch (error) {
      console.error('❌ VideoCall: Failed to initialize media', error);
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        constraint: error.constraint
      });
      throw error;
    }
  }, [meetingId, localStream]);

  // Create Peer Connection
  const createPeerConnection = useCallback((participantId, initiator) => {
    const participantName = participantsRef.current.find(p => p.id === participantId)?.name || participantId;
    console.log(`🔗🔗🔗🔗🔗 CREATE PEER CONNECTION CALLED 🔗🔗🔗🔗🔗`);
    console.log(`🔗 createPeerConnection called:`, {
      participantId,
      participantName,
      initiator,
      hasStream: !!streamRef.current,
      streamActive: streamRef.current?.active || false,
      streamTracks: streamRef.current ? streamRef.current.getTracks().length : 0,
      hasExistingPeer: !!peersRef.current[participantId],
      socketId: socketRef.current?.id,
      isHost: isHostRef.current
    });
    
    // Don't create duplicate connections
    if (peersRef.current[participantId]) {
      console.log(`⏭️ Connection already exists to ${participantId}`);
      return;
    }

    if (!streamRef.current) {
      console.error(`❌ Cannot create connection: no local stream`);
      return;
    }

    console.log(`✅ Creating new peer connection to ${participantId}, initiator: ${initiator}`);
    console.log(`  - Stream available: ${!!streamRef.current}`);
    console.log(`  - Stream active: ${streamRef.current?.active || false}`);
    console.log(`  - Stream tracks: ${streamRef.current ? streamRef.current.getTracks().length : 0}`);
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      const audioTracks = streamRef.current.getAudioTracks();
      console.log(`  - Video tracks: ${videoTracks.length}, enabled: ${videoTracks[0]?.enabled || false}`);
      console.log(`  - Audio tracks: ${audioTracks.length}, enabled: ${audioTracks[0]?.enabled || false}`);
    }
    
    // CRITICAL: Ensure stream is ready before creating peer
    if (!streamRef.current || !streamRef.current.active) {
      console.error(`❌ Cannot create peer: stream not ready!`);
      console.error(`  - Stream exists: ${!!streamRef.current}`);
      console.error(`  - Stream active: ${streamRef.current?.active || false}`);
      return;
    }
    
    // CRITICAL: Ensure stream tracks are ready before creating peer
    const videoTracks = streamRef.current.getVideoTracks();
    const audioTracks = streamRef.current.getAudioTracks();
    if (videoTracks.length === 0 && audioTracks.length === 0) {
      console.error(`❌ Cannot create peer: stream has no tracks!`);
      return;
    }
    
    // CRITICAL: Wait a tiny bit to ensure stream is fully ready
    // SimplePeer needs the stream to be in a stable state
    const peer = new SimplePeer({
      initiator,
      trickle: true, // Changed to true for immediate signals (offer/answer), ICE candidates trickle in
      stream: streamRef.current, // CRITICAL: Stream must be active and ready
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });
    
    // CRITICAL: Verify stream was added to peer
    if (peer._pc) {
      const senders = peer._pc.getSenders();
      console.log(`  - RTCRtpSenders: ${senders.length}`);
      senders.forEach((sender, idx) => {
        console.log(`    Sender ${idx}: track=${sender.track?.kind || 'none'}, enabled=${sender.track?.enabled || false}`);
      });
      
      // CRITICAL: Double-check that stream tracks are actually added

      const videoSender = senders.find(s => s.track?.kind === 'video');
      const audioSender = senders.find(s => s.track?.kind === 'audio');
      const videoTrack = streamRef.current.getVideoTracks()[0];
      const audioTrack = streamRef.current.getAudioTracks()[0];
      
      if (senders.length === 0) {
        console.error(`❌❌❌ CRITICAL: No senders found in peer connection! Stream may not be added properly.`);
        console.error(`  - Stream tracks: ${streamRef.current.getTracks().length}`);
        console.error(`  - Video tracks: ${streamRef.current.getVideoTracks().length}`);
        console.error(`  - Audio tracks: ${streamRef.current.getAudioTracks().length}`);
        
        // Try to manually add tracks
        console.log(`🔄 Attempting to manually add tracks to peer connection...`);
        streamRef.current.getTracks().forEach(track => {
          try {
            peer._pc.addTrack(track, streamRef.current);
            console.log(`✅ Added ${track.kind} track manually`);
          } catch (error) {
            console.error(`❌ Error adding ${track.kind} track:`, error);
          }
        });
      } else {
        // CRITICAL: Check if audio track is missing (common issue)
        if (audioTrack && !audioSender) {
          console.warn(`⚠️⚠️⚠️ Audio track exists but no audio sender found! Adding audio track manually...`);
          try {
            peer._pc.addTrack(audioTrack, streamRef.current);
            console.log(`✅✅✅ Added missing audio track to peer connection for ${participantId}`);
          } catch (error) {
            console.error(`❌ Failed to add audio track:`, error);
          }
        }
        
        // Also check video track
        if (videoTrack && !videoSender) {
          console.warn(`⚠️ Video track exists but no video sender found! Adding video track manually...`);
          try {
            peer._pc.addTrack(videoTrack, streamRef.current);
            console.log(`✅ Added missing video track to peer connection for ${participantId}`);
          } catch (error) {
            console.error(`❌ Failed to add video track:`, error);
          }
        }
      }
    }

    // Store peer immediately
    peersRef.current[participantId] = peer;
    console.log(`✅ Peer stored for ${participantId}`);
    console.log(`  - Peer ready: ${peer.ready}`);
    console.log(`  - Peer destroyed: ${peer.destroyed}`);
    console.log(`  - Initiator: ${initiator}`);
    console.log(`  - Stream ID: ${streamRef.current?.id}`);
    console.log(`  - Stream active: ${streamRef.current?.active}`);
    
    // CRITICAL: Add error handler immediately to catch any peer creation issues
    peer.on('error', (error) => {
      console.error(`❌❌❌ Peer error for ${participantId}:`, error);
      console.error(`  - Error message: ${error.message}`);
      console.error(`  - Error stack: ${error.stack}`);
    });

    // Handle signal data
    // CRITICAL: SimplePeer emits 'signal' events when:
    // 1. Initiator creates offer (immediately after peer creation)
    // 2. Non-initiator creates answer (after receiving offer)
    // 3. ICE candidates are generated (if trickle: true)
    peer.on('signal', (signal) => {
      const participantName = participantsRef.current.find(p => p.id === participantId)?.name || participantId;
      console.log(`📡📡📡 Sending signal to ${participantName} (${participantId}):`);
      console.log(`  - signalType: ${signal.type}`);
      console.log(`  - hasSDP: ${!!signal.sdp}`);
      console.log(`  - hasCandidate: ${!!signal.candidate}`);
      console.log(`  - initiator: ${initiator}`);
      console.log(`  - participantId: ${participantId}`);
      console.log(`  - peerReady: ${peer.ready}`);
      console.log(`  - peerDestroyed: ${peer.destroyed}`);
      console.log(`  - socketId: ${socketRef.current?.id}`);
      
      if (socketRef.current && socketRef.current.id) {
        const fromId = socketRef.current.id;
        console.log(`📡📡📡 Emitting signal with from: ${fromId}, to: ${participantId}`);
        try {
          socketRef.current.emit('signal', {
            to: participantId,
            from: fromId,
            signal
          });
          console.log(`✅✅✅ Signal emitted successfully`);
        } catch (error) {
          console.error(`❌❌❌ Error emitting signal:`, error);
          // Queue signal for retry
          signalQueueRef.current.push({
            to: participantId,
            from: fromId,
            signal
          });
        }
      } else {
        // Queue signal if socket isn't ready yet (during reconnection)
        console.warn(`⚠️ Socket not ready, queueing signal for ${participantId}`);
        signalQueueRef.current.push({
          to: participantId,
          from: null, // Will be set when socket is ready
          signal
        });
        // Try to process queue after a short delay
        setTimeout(() => {
          if (socketRef.current && socketRef.current.id && signalQueueRef.current.length > 0) {
            console.log(`📤 Processing queued signals after delay`);
            signalQueueRef.current.forEach(({ to, signal }) => {
              try {
                socketRef.current.emit('signal', {
                  to,
                  from: socketRef.current.id,
                  signal
                });
              } catch (error) {
                console.error(`❌ Error emitting queued signal:`, error);
              }
            });
            signalQueueRef.current = [];
          }
        }, 500);
      }
    });
    
    // CRITICAL: Log when signal handler is attached
    console.log(`✅ Signal handler attached for ${participantId}, waiting for signals...`);
    
    // CRITICAL: For initiator, signal should fire immediately
    // For non-initiator, signal fires after receiving offer
    // Add a timeout to detect if signals are not being generated
    let signalGenerated = false;
    const originalSignalHandler = peer.listeners('signal')[0] || null;
    
    const signalTimeout = setTimeout(() => {
      if (!signalGenerated && !peer.destroyed && initiator) {
        console.warn(`⚠️⚠️⚠️ No signals generated for ${participantId} after 2 seconds!`);
        console.warn(`  - Peer ready: ${peer.ready}`);
        console.warn(`  - Peer destroyed: ${peer.destroyed}`);
        console.warn(`  - Initiator: ${initiator}`);
        console.warn(`  - Has stream: ${!!streamRef.current}`);
        console.warn(`  - Stream active: ${streamRef.current?.active || false}`);
        console.warn(`  - Peer signalingState: ${peer._pc?.signalingState || 'N/A'}`);
        console.warn(`  - Peer ICE gathering state: ${peer._pc?.iceGatheringState || 'N/A'}`);
        
        // CRITICAL: If we're the initiator and no signal was generated, try to force it
        if (initiator && peer._pc && peer._pc.signalingState === 'stable') {
          console.log(`🔄 Attempting to force signal generation for ${participantId}...`);
          try {
            // Check if we can manually create an offer
            if (peer._pc.localDescription === null) {
              console.log(`  - No local description, creating offer manually...`);
              peer._pc.createOffer()
                .then(offer => {
                  console.log(`  - Offer created, setting local description...`);
                  return peer._pc.setLocalDescription(offer);
                })
                .then(() => {
                  console.log(`  - Local description set, signal should be generated now`);
                  // The signal event should fire after setLocalDescription
                })
                .catch(error => {
                  console.error(`  - Error forcing offer creation:`, error);
                });
            } else {
              console.log(`  - Local description already exists:`, peer._pc.localDescription.type);
            }
          } catch (error) {
            console.error(`  - Error attempting to force signal:`, error);
          }
        }
      }
    }, 2000);
    
    // Clear timeout when signal is generated
    peer.on('signal', () => {
      signalGenerated = true;
      clearTimeout(signalTimeout);
    });

    // Handle incoming stream
    peer.on('stream', (stream) => {
      const participantName = participantsRef.current.find(p => p.id === participantId)?.name || participantId;
      console.log(`📹📹📹📹📹📹📹📹📹 RECEIVED REMOTE STREAM FROM ${participantName} (${participantId}) 📹📹📹📹📹📹📹📹📹`);
      console.log(`  - streamId: ${stream.id}`);
      console.log(`  - active: ${stream.active}`);
      console.log(`  - videoTracks: ${stream.getVideoTracks().length}`);
      console.log(`  - audioTracks: ${stream.getAudioTracks().length}`);
      console.log(`  - videoTrackEnabled: ${stream.getVideoTracks()[0]?.enabled}`);
      console.log(`  - audioTrackEnabled: ${stream.getAudioTracks()[0]?.enabled}`);
      console.log(`  - peerReady: ${peer.ready}`);
      console.log(`  - peerDestroyed: ${peer.destroyed}`);
      console.log(`  - peerSignalingState: ${peer.signalingState}`);
      console.log(`  - peerIceConnectionState: ${peer._pc?.iceConnectionState || 'N/A'}`);
      console.log(`  - My socket ID: ${socketRef.current?.id}`);
      console.log(`  - Is host: ${isHostRef.current}`);
      
      // CRITICAL: Verify stream tracks are actually working
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (videoTrack) {
        console.log(`  - Video track details:`, {
          id: videoTrack.id,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState,
          muted: videoTrack.muted,
          kind: videoTrack.kind,
          label: videoTrack.label
        });
      }
      if (audioTrack) {
        console.log(`  - Audio track details:`, {
          id: audioTrack.id,
          enabled: audioTrack.enabled,
          readyState: audioTrack.readyState,
          muted: audioTrack.muted,
          kind: audioTrack.kind,
          label: audioTrack.label
        });
        
        // CRITICAL: Ensure audio track is enabled when received
        if (!audioTrack.enabled) {
          console.log(`🔊 Enabling audio track for ${participantName} (was disabled)`);
          audioTrack.enabled = true;
        }
      } else {
        console.warn(`⚠️ No audio track in stream from ${participantName}`);
      }
      
      // CRITICAL: Listen for track enabled/disabled changes
      if (videoTrack) {
        // Listen for track enabled state changes
        const handleTrackEnabledChange = () => {
          console.log(`🎥🎥🎥 Video track enabled state changed for ${participantName} (${participantId}): ${videoTrack.enabled}`);
          // Force a re-render by updating the stream reference
          setRemoteStreams(prev => {
            const updated = { ...prev };
            // Create a new stream reference to trigger re-render
            if (updated[participantId]) {
              updated[participantId] = stream;
            }
            return updated;
          });
        };
        
        // CRITICAL: Listen for track being added (when participant enables camera after approval)
        const handleTrackAdded = (event) => {
          console.log(`➕ Video track added for ${participantName} (${participantId}):`, {
            trackId: event.track?.id,
            trackKind: event.track?.kind,
            trackEnabled: event.track?.enabled,
            trackReadyState: event.track?.readyState
          });
          // Force update remote streams to trigger re-render
          setRemoteStreams(prev => {
            const updated = { ...prev };
            if (updated[participantId]) {
              updated[participantId] = stream;
            }
            return updated;
          });
        };
        
        // Listen for track mute changes (when camera is turned off)
        videoTrack.addEventListener('mute', () => {
          console.log(`🔇 Video track muted for ${participantName} (${participantId})`);
          handleTrackEnabledChange();
        });
        
        videoTrack.addEventListener('unmute', () => {
          console.log(`🔊 Video track unmuted for ${participantName} (${participantId})`);
          handleTrackEnabledChange();
        });
        
        // CRITICAL: Listen for track being added to stream
        stream.addEventListener('addtrack', handleTrackAdded);
        
        // Also check enabled state periodically (as a fallback)
        const enabledCheckInterval = setInterval(() => {
          const currentEnabled = videoTrack.enabled;
          const lastEnabled = videoTrack._lastEnabledState;
          if (currentEnabled !== lastEnabled) {
            console.log(`🔄 Video track enabled state changed (detected via polling) for ${participantName}: ${lastEnabled} -> ${currentEnabled}`);
            videoTrack._lastEnabledState = currentEnabled;
            handleTrackEnabledChange();
          }
        }, 500);
        
        // Store initial state
        videoTrack._lastEnabledState = videoTrack.enabled;
        
        // Clean up interval and listeners when stream is removed
        stream.addEventListener('removetrack', () => {
          clearInterval(enabledCheckInterval);
          stream.removeEventListener('addtrack', handleTrackAdded);
        });
      }
      
      // CRITICAL: Ensure stream is active before setting it
      if (stream.active) {
        setRemoteStreams(prev => {
          const updated = {
            ...prev,
            [participantId]: stream
          };
          remoteStreamsRef.current = updated; // Update ref for debugging
          console.log(`✅✅✅ Remote stream set for ${participantName} (${participantId})`);
          console.log(`  - Total remote streams now: ${Object.keys(updated).length}`);
          console.log(`  - Remote stream IDs: ${Object.keys(updated).join(', ')}`);
          console.log(`  - Participants in list: ${participantsRef.current.map(p => `${p.name} (${p.id})`).join(', ')}`);
          return updated;
        });
      } else {
        console.warn(`⚠️ Stream from ${participantName} (${participantId}) is not active yet, waiting...`);
        // Wait for stream to become active
        const checkActive = setInterval(() => {
          if (stream.active) {
            clearInterval(checkActive);
            setRemoteStreams(prev => {
              const updated = {
                ...prev,
                [participantId]: stream
              };
              remoteStreamsRef.current = updated; // Update ref for debugging
              console.log(`✅✅✅ Remote stream became active for ${participantName} (${participantId})`);
              console.log(`  - Total remote streams now: ${Object.keys(updated).length}`);
              return updated;
            });
          }
        }, 100);
        
        // Clear after 5 seconds
        setTimeout(() => clearInterval(checkActive), 5000);
      }
    });

    // CRITICAL: Listen for track additions on the peer connection (when participant adds video after approval)
    if (peer._pc) {
      // Store the original ontrack handler if it exists
      const originalOntrack = peer._pc.ontrack;
      
      peer._pc.ontrack = (event) => {
        const participantName = participantsRef.current.find(p => p.id === participantId)?.name || participantId;
        console.log(`➕➕➕ TRACK ADDED TO PEER CONNECTION for ${participantName} (${participantId}) ➕➕➕`, {
          trackId: event.track?.id,
          trackKind: event.track?.kind,
          trackEnabled: event.track?.enabled,
          trackReadyState: event.track?.readyState,
          streams: event.streams?.length || 0,
          streamIds: event.streams?.map(s => s.id) || []
        });
        
        // Call original handler if it exists (SimplePeer might have its own)
        if (originalOntrack) {
          originalOntrack(event);
        }
        
        // Handle both video and audio tracks
        if (event.track) {
          const currentStream = remoteStreamsRef.current[participantId];
          const trackKind = event.track.kind;
          
          if (trackKind === 'video') {
            if (currentStream) {
              // Stream exists, check if this track is already in it
              const existingVideoTrack = currentStream.getVideoTracks()[0];
              if (!existingVideoTrack || existingVideoTrack.id !== event.track.id) {
                // New video track added - add it to the existing stream
                console.log(`📹 New video track added to existing stream for ${participantName}`);
                currentStream.addTrack(event.track);
                // Force update to trigger re-render
                setRemoteStreams(prev => {
                  const updated = { ...prev };
                  if (updated[participantId]) {
                    updated[participantId] = currentStream; // Trigger re-render
                  }
                  remoteStreamsRef.current = updated;
                  return updated;
                });
              }
            } else if (event.streams && event.streams.length > 0) {
              // New stream with video track
              const newStream = event.streams[0];
              console.log(`📹 New stream received with video track for ${participantName}`);
              setRemoteStreams(prev => {
                const updated = {
                  ...prev,
                  [participantId]: newStream
                };
                remoteStreamsRef.current = updated;
                return updated;
              });
            } else {
              // Track added but no stream - create a new stream
              console.log(`📹 Creating new stream for video track from ${participantName}`);
              const newStream = new MediaStream([event.track]);
              setRemoteStreams(prev => {
                const updated = {
                  ...prev,
                  [participantId]: newStream
                };
                remoteStreamsRef.current = updated;
                return updated;
              });
            }
          } else if (trackKind === 'audio') {
            // Handle audio track addition
            if (currentStream) {
              // Stream exists, check if this track is already in it
              const existingAudioTracks = currentStream.getAudioTracks();
              const trackExists = existingAudioTracks.some(t => t.id === event.track.id);
              if (!trackExists) {
                // New audio track added - add it to the existing stream
                console.log(`🔊 New audio track added to existing stream for ${participantName}`);
                currentStream.addTrack(event.track);
                // Ensure audio track is enabled
                if (!event.track.enabled) {
                  event.track.enabled = true;
                  console.log(`🔊 Enabled audio track for ${participantName}`);
                }
                // Force update to trigger re-render
                setRemoteStreams(prev => {
                  const updated = { ...prev };
                  if (updated[participantId]) {
                    updated[participantId] = currentStream; // Trigger re-render
                  }
                  remoteStreamsRef.current = updated;
                  return updated;
                });
              }
            } else if (event.streams && event.streams.length > 0) {
              // New stream with audio track
              const newStream = event.streams[0];
              console.log(`🔊 New stream received with audio track for ${participantName}`);
              // Ensure audio track is enabled
              const audioTracks = newStream.getAudioTracks();
              audioTracks.forEach(track => {
                if (!track.enabled) {
                  track.enabled = true;
                  console.log(`🔊 Enabled audio track in new stream for ${participantName}`);
                }
              });
              setRemoteStreams(prev => {
                const updated = {
                  ...prev,
                  [participantId]: newStream
                };
                remoteStreamsRef.current = updated;
                return updated;
              });
            } else {
              // Track added but no stream - create a new stream
              console.log(`🔊 Creating new stream for audio track from ${participantName}`);
              const newStream = new MediaStream([event.track]);
              // Ensure audio track is enabled
              if (!event.track.enabled) {
                event.track.enabled = true;
                console.log(`🔊 Enabled audio track in new stream for ${participantName}`);
              }
              setRemoteStreams(prev => {
                const updated = {
                  ...prev,
                  [participantId]: newStream
                };
                remoteStreamsRef.current = updated;
                return updated;
              });
            }
          }
        }
      };
      
      // Also monitor receivers for new tracks (fallback)
      const checkReceivers = setInterval(() => {
        if (peer._pc && !peer.destroyed) {
          const receivers = peer._pc.getReceivers();
          const videoReceiver = receivers.find(r => r.track && r.track.kind === 'video');
          if (videoReceiver && videoReceiver.track) {
            const currentStream = remoteStreamsRef.current[participantId];
            const existingVideoTrack = currentStream?.getVideoTracks()[0];
            if (!existingVideoTrack || existingVideoTrack.id !== videoReceiver.track.id) {
              console.log(`📹 Detected new video track via receiver polling for ${participantId}`);
              if (currentStream) {
                currentStream.addTrack(videoReceiver.track);
                setRemoteStreams(prev => {
                  const updated = { ...prev };
                  if (updated[participantId]) {
                    updated[participantId] = currentStream;
                  }
                  remoteStreamsRef.current = updated;
                  return updated;
                });
              } else {
                const newStream = new MediaStream([videoReceiver.track]);
                setRemoteStreams(prev => {
                  const updated = {
                    ...prev,
                    [participantId]: newStream
                  };
                  remoteStreamsRef.current = updated;
                  return updated;
                });
              }
            }
          }
        } else {
          clearInterval(checkReceivers);
        }
      }, 1000);
      
      // Clean up interval when peer is destroyed
      peer.on('close', () => {
        clearInterval(checkReceivers);
      });
    }
    
    // Handle connection established
    peer.on('connect', () => {
      const participantName = participantsRef.current.find(p => p.id === participantId)?.name || participantId;
      console.log(`✅✅✅✅✅✅✅✅✅ PEER CONNECTION ESTABLISHED with ${participantName} (${participantId}) ✅✅✅✅✅✅✅✅✅`);
      console.log(`  - Participant: ${participantName} (${participantId})`);
      console.log(`  - My socket ID: ${socketRef.current?.id}`);
      console.log(`  - Is host: ${isHostRef.current}`);
      console.log(`  - Initiator: ${initiator}`);
      console.log(`  - Peer destroyed: ${peer.destroyed}`);
      console.log(`  - Peer ready: ${peer.ready}`);
      console.log(`  - Peer signalingState: ${peer.signalingState}`);
      console.log(`  - Peer ICE connection state: ${peer._pc?.iceConnectionState || 'N/A'}`);
      
      // CRITICAL: Check if we're sending our stream
      if (peer._pc) {
        const senders = peer._pc.getSenders();
        console.log(`  - Sending tracks: ${senders.length}`);
        senders.forEach((sender, idx) => {
          console.log(`    Sender ${idx}: ${sender.track?.kind || 'none'}, enabled=${sender.track?.enabled || false}`);
        });
        
        // CRITICAL: Check receiving tracks
        const receivers = peer._pc.getReceivers();
        console.log(`  - Receiving tracks: ${receivers.length}`);
        receivers.forEach((receiver, idx) => {
          console.log(`    Receiver ${idx}: ${receiver.track?.kind || 'none'}, enabled=${receiver.track?.enabled || false}, readyState=${receiver.track?.readyState || 'N/A'}`);
        });
      }
      // Use ref to get current remote streams state
      const currentStreams = remoteStreamsRef.current;
      console.log(`  - Remote streams count: ${Object.keys(currentStreams).length}`);
      console.log(`  - Has stream for this participant: ${!!currentStreams[participantId]}`);
      if (currentStreams[participantId]) {
        console.log(`  - Stream active: ${currentStreams[participantId].active}`);
        console.log(`  - Stream video tracks: ${currentStreams[participantId].getVideoTracks().length}`);
        console.log(`  - Stream audio tracks: ${currentStreams[participantId].getAudioTracks().length}`);
      } else {
        console.warn(`  - ⚠️ No stream found for ${participantName} (${participantId}) yet - stream may arrive soon`);
      }
    });

    // Handle errors
    peer.on('error', (error) => {
      console.error(`❌ Peer error with ${participantId}:`, error);
      // Try to recreate connection on error
      if (error.message && error.message.includes('ICE')) {
        console.log(`🔄 ICE error detected, will retry connection to ${participantId}`);
      }
    });
    
    // Handle ICE connection state changes
    if (peer._pc) {
      peer._pc.oniceconnectionstatechange = () => {
        const state = peer._pc.iceConnectionState;
        const participantName = participantsRef.current.find(p => p.id === participantId)?.name || participantId;
        console.log(`🧊 ICE connection state for ${participantName} (${participantId}): ${state}`);
        if (state === 'connected' || state === 'completed') {
          console.log(`✅✅✅ ICE CONNECTED for ${participantName} (${participantId}) - video should work!`);
          console.log(`  - Remote stream exists: ${!!remoteStreams[participantId]}`);
          console.log(`  - Remote stream active: ${remoteStreams[participantId]?.active || false}`);
          console.log(`  - Video tracks: ${remoteStreams[participantId]?.getVideoTracks().length || 0}`);
        } else if (state === 'failed' || state === 'disconnected') {
          console.warn(`⚠️ ICE ${state} for ${participantName} (${participantId})`);
          console.warn(`  - This may indicate a network issue or firewall blocking WebRTC`);
          console.warn(`  - Remote stream exists: ${!!remoteStreams[participantId]}`);
          console.warn(`  - Remote stream active: ${remoteStreams[participantId]?.active || false}`);
          if (state === 'failed') {
            console.warn(`  - Attempting to reconnect...`);
            // Don't auto-reconnect here, let the user know there's an issue
            // The connection might recover on its own
          }
        }
      };
      
      // Also monitor connection state
      peer._pc.onconnectionstatechange = () => {
        const state = peer._pc.connectionState;
        const participantName = participantsRef.current.find(p => p.id === participantId)?.name || participantId;
        console.log(`🔗 Connection state for ${participantName} (${participantId}): ${state}`);
        if (state === 'connected') {
          console.log(`✅✅✅ WebRTC CONNECTION ESTABLISHED for ${participantName} (${participantId})`);
        }
      };
    }

    // Handle close
    peer.on('close', () => {
      delete peersRef.current[participantId];
      setRemoteStreams(prev => {
        const updated = { ...prev };
        delete updated[participantId];
        remoteStreamsRef.current = updated; // Update ref
        return updated;
      });
    });
  }, []);
  
  // Update ref when createPeerConnection changes
  useEffect(() => {
    createPeerConnectionRef.current = createPeerConnection;
  }, [createPeerConnection]);

  // Handle ready to connect - emit when media is ready
  useEffect(() => {
    if (socket && streamRef.current && isInitializedRef.current) {
      // Notify that we're ready to connect
      socket.emit('ready-to-connect', { meetingId });
    }
  }, [socket, meetingId, streamRef.current, isInitializedRef.current]);

  // Auto-initialize media for host
  useEffect(() => {
    if (isHost && socketConnected && !isInitializedRef.current) {
      setTimeout(() => {
        initializeMedia();
      }, 1000);
    }
  }, [isHost, socketConnected, initializeMedia]);

  // Auto-initialize media for participants
  useEffect(() => {
    if (!isHost && socketConnected && !isInitializedRef.current) {
      setTimeout(() => {
        initializeMedia();
      }, 1000);
    }
  }, [isHost, socketConnected, initializeMedia]);


  // Force connection (for debugging)
  const forceConnection = useCallback(() => {
    if (streamRef.current && socket) {
      socket.emit('ready-to-connect', { meetingId });
    }
  }, [socket, meetingId]);

  // Update all peer connections with new stream state (for video/audio toggle)
  const updateAllPeerConnections = useCallback((newStream, trackType = 'both') => {
    // CRITICAL: PERMANENT FIX - Never replace stream if we're the host and already have one
    // This prevents host's video from being affected when participant accepts request
    const isHost = isHostRef.current;
    const hasExistingStream = streamRef.current;
    
    if (isHost && hasExistingStream && newStream && newStream !== streamRef.current) {
      console.warn('🛡️ PERMANENT FIX: Host already has stream, ignoring new stream to prevent video loss');
      // Don't replace host's stream, just use the existing one
      // But still update tracks if needed
    } else if (newStream && newStream !== streamRef.current) {
      // Only replace stream if we're not the host or don't have an existing stream
      const oldStream = streamRef.current;
      if (oldStream) {
        oldStream.getTracks().forEach(track => track.stop());
      }
      streamRef.current = newStream;
      setLocalStream(newStream);
      if (window.localStreamRef) {
        window.localStreamRef.current = newStream;
      }
    }
    
    const streamToUse = streamRef.current;
    if (!streamToUse) return;

    const videoTrack = streamToUse.getVideoTracks()[0];
    const audioTrack = streamToUse.getAudioTracks()[0];
    const videoWasEnabled = videoTrack?.enabled ?? true;
    
    // Helper to trigger renegotiation - with better state checking
    const triggerRenegotiation = (pc, participantId) => {
      // CRITICAL: Check signaling state more carefully
      // Only renegotiate if we're in a stable state and connection is established
      if (pc.signalingState !== 'stable') {
        console.log(`⏸️ Skipping renegotiation for ${participantId} - signaling state is ${pc.signalingState}, not stable`);
        return;
      }
      
      if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
        console.log(`⏸️ Skipping renegotiation for ${participantId} - ICE connection state is ${pc.iceConnectionState}, not connected`);
        return;
      }
      
      // Check if renegotiation is already in progress
      if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'have-remote-offer') {
        console.log(`⏸️ Skipping renegotiation for ${participantId} - renegotiation already in progress (${pc.signalingState})`);
        return;
      }
      
      console.log(`🔄 Triggering renegotiation for ${participantId}`, {
        signalingState: pc.signalingState,
        iceConnectionState: pc.iceConnectionState
      });
      
      pc.createOffer()
        .then(offer => {
          // Double-check state before setting local description
          if (pc.signalingState === 'stable') {
            return pc.setLocalDescription(offer);
          } else {
            console.warn(`⚠️ Signaling state changed to ${pc.signalingState} before setLocalDescription, skipping`);
            throw new Error('Signaling state changed');
          }
        })
        .then(() => {
          const localDescription = pc.localDescription;
          if (localDescription && socketRef.current?.id) {
            socketRef.current.emit('signal', {
              to: participantId,
              from: socketRef.current.id,
              signal: { type: localDescription.type, sdp: localDescription.sdp }
            });
            console.log(`✅ Renegotiation offer sent to ${participantId}`);
          }
        })
        .catch(err => {
          console.error(`❌ Failed to renegotiate with ${participantId}:`, err);
          // Don't break the connection on renegotiation error
        });
    };
    
    // CRITICAL: PERMANENT FIX - Protect host's incoming video streams
    // When updating peer connections, only update OUTGOING tracks (senders)
    // NEVER modify or renegotiate connections that might affect INCOMING streams from host
    // Note: isHost is already declared above, reusing it here
    
    // Update all peer connections
    Object.entries(peersRef.current).forEach(([participantId, peer]) => {
      if (!peer || peer.destroyed || !peer._pc) return;
      
      try {
        const pc = peer._pc;
        
        // CRITICAL: If we're a participant and this is the host's connection,
        // be extra careful not to trigger renegotiation that might affect host's incoming video
        const participantIsHost = participantsRef.current.find(p => p.id === participantId)?.isHost;
        if (!isHost && participantIsHost) {
          console.log(`🛡️ PERMANENT FIX: Updating participant's outgoing tracks to host (won't affect host's incoming video)`);
        }
        
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        const audioSender = senders.find(s => s.track?.kind === 'audio');
        
        // Update video track
        if ((trackType === 'video' || trackType === 'both') && videoTrack) {
          // Enable track first
          if (!videoTrack.enabled) {
            videoTrack.enabled = true;
            console.log(`✅ Enabled video track for ${participantId}`);
          }
          
          if (videoSender) {
            // Check if track needs to be replaced (different track ID)
            const currentTrack = videoSender.track;
            if (currentTrack && currentTrack.id === videoTrack.id) {
              // Same track, ensure it's enabled - WebRTC handles enabled/disabled without renegotiation
              if (!currentTrack.enabled) {
                currentTrack.enabled = true;
                console.log(`✅ Re-enabled video track in sender for ${participantId}`);
              }
              console.log(`ℹ️ Video track already in sender for ${participantId}, track enabled: ${currentTrack.enabled}`);
            } else {
              // Different track, replace it - but only if connection is stable
              // ROOT CAUSE FIX: Don't trigger renegotiation if this is just enabling tracks after accept
              const shouldReplace = pc.signalingState === 'stable' && 
                                   (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
              
              if (shouldReplace) {
                console.log(`🔄 Replacing video track for ${participantId} (track ID changed)`);
                videoSender.replaceTrack(videoTrack)
                  .then(() => {
                    console.log(`✅ Video track replaced for ${participantId}, triggering renegotiation`);
                    triggerRenegotiation(pc, participantId);
                  })
                  .catch(err => console.error(`❌ Failed to replace video track for ${participantId}:`, err));
              } else {
                // Connection not stable, just enable existing track
                if (currentTrack && !currentTrack.enabled) {
                  currentTrack.enabled = true;
                }
              }
            }
          } else {
            // No sender, add track
            console.log(`➕ Adding video track to peer connection for ${participantId}`);
            pc.addTrack(videoTrack, streamToUse);
            triggerRenegotiation(pc, participantId);
          }
        }
        
        // Update audio track
        if ((trackType === 'audio' || trackType === 'both') && audioTrack) {
          // Enable track first
          if (!audioTrack.enabled) {
            audioTrack.enabled = true;
            console.log(`✅ Enabled audio track for ${participantId}`);
          }
          
          if (audioSender) {
            // Check if track needs to be replaced (different track ID)
            const currentTrack = audioSender.track;
            if (currentTrack && currentTrack.id === audioTrack.id) {
              // Same track, ensure it's enabled - WebRTC handles enabled/disabled without renegotiation
              if (!currentTrack.enabled) {
                currentTrack.enabled = true;
                console.log(`✅ Re-enabled audio track in sender for ${participantId}`);
              }
              console.log(`ℹ️ Audio track already in sender for ${participantId}, track enabled: ${currentTrack.enabled}`);
            } else {
              // Different track, replace it - but only if connection is stable
              // ROOT CAUSE FIX: Don't trigger renegotiation if this is just enabling tracks after accept
              const shouldReplace = pc.signalingState === 'stable' && 
                                   (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
              
              if (shouldReplace) {
                console.log(`🔄 Replacing audio track for ${participantId} (track ID changed)`);
                audioSender.replaceTrack(audioTrack)
                  .then(() => {
                    if (trackType === 'audio' && videoTrack && videoWasEnabled && !videoTrack.enabled) {
                      videoTrack.enabled = true;
                    }
                    console.log(`✅ Audio track replaced for ${participantId}, triggering renegotiation`);
                    triggerRenegotiation(pc, participantId);
                  })
                  .catch(err => console.error(`❌ Failed to replace audio track for ${participantId}:`, err));
              } else {
                // Connection not stable, just enable existing track
                if (currentTrack && !currentTrack.enabled) {
                  currentTrack.enabled = true;
                }
              }
            }
          } else {
            // No sender, add track
            console.log(`➕ Adding audio track to peer connection for ${participantId}`);
            pc.addTrack(audioTrack, streamToUse);
            triggerRenegotiation(pc, participantId);
          }
        }
        
        // Add both tracks if neither exists
        if (trackType === 'both' && !videoSender && !audioSender && videoTrack && audioTrack) {
          pc.addTrack(videoTrack, streamToUse);
          pc.addTrack(audioTrack, streamToUse);
          triggerRenegotiation(pc, participantId);
        }
      } catch (error) {
        console.error(`Failed to update peer ${participantId}:`, error);
      }
    });
    
    // Ensure video track is still enabled after audio-only update
    if (trackType === 'audio' && videoTrack && videoWasEnabled && !videoTrack.enabled) {
      videoTrack.enabled = true;
    }
  }, []);

  // Expose peersRef to window for useMediaRequest to access
  useEffect(() => {
    window.peersRef = peersRef;
    return () => {
      // Keep ref available
    };
  }, []);

  return {
    // Streams
    localStream,
    remoteStreams,
    localVideoRef,
    
    // Participants
    participants,
    isHost,
    
    // Connection
    socket,
    isConnected: socketConnected,
    
    // Media state tracking
    participantMediaState: participantMediaStateRef.current,
    
    // Functions
    initializeMedia,
    forceConnection,
    updateAllPeerConnections
  };
};

export default useVideoCall;

