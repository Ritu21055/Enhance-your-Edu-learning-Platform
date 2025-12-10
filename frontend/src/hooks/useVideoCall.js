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
          // CRITICAL: Initialize media if not ready
          if (!isInitializedRef.current || !streamRef.current) {
            console.log('🎥 Media not initialized, initializing now...');
            try {
              await initializeMedia();
              console.log('✅ Media initialized for participant connection');
            } catch (error) {
              console.error('❌ Failed to initialize media:', error);
              return;
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
    // Listen for both the direct event and the broadcast event
    const handleMediaStateChange = (data) => {
      const { participantId, videoEnabled, audioEnabled } = data;
      console.log(`📡📡📡 Media state change received for ${participantId}:`, {
        videoEnabled,
        audioEnabled,
        participantId
      });
      
      // Update media state tracking
      if (!participantMediaStateRef.current[participantId]) {
        participantMediaStateRef.current[participantId] = {};
      }
      participantMediaStateRef.current[participantId].videoEnabled = videoEnabled;
      participantMediaStateRef.current[participantId].audioEnabled = audioEnabled;
      
      // CRITICAL: Immediately update video element DOM (don't wait for React re-render)
      // This makes the change instant
      setTimeout(() => {
        const stream = remoteStreamsRef.current[participantId];
        if (stream) {
          const videoElement = document.querySelector(`video[data-participant-id="${participantId}"]`);
          if (videoElement) {
            const videoTrack = stream.getVideoTracks()[0];
            const trackReady = videoTrack?.readyState === 'live';
            const trackEnabled = videoTrack?.enabled ?? false;
            // CRITICAL: Hide if video is disabled OR track is not ready (stopped/ended)
            const shouldShow = videoEnabled !== false && trackReady && trackEnabled;
            
            console.log(`⚡⚡⚡ INSTANT UPDATE: ${participantId} video ${shouldShow ? 'SHOW' : 'HIDE'}`, {
              videoEnabled,
              trackReady,
              trackEnabled,
              trackState: videoTrack?.readyState,
              shouldShow
            });
            
            if (shouldShow) {
              videoElement.style.opacity = '1';
              videoElement.style.visibility = 'visible';
              videoElement.style.display = 'block';
              if (videoElement.paused && stream.active) {
                videoElement.play().catch(() => {});
              }
            } else {
              // CRITICAL: If video is disabled OR track is ended, replace srcObject with blank stream to clear frozen frame
              if (videoEnabled === false || (videoTrack && videoTrack.readyState === 'ended')) {
                console.log(`⚡⚡⚡ Video disabled or track ended for ${participantId}, replacing srcObject with blank stream to prevent frozen frame`, {
                  videoEnabled,
                  trackState: videoTrack?.readyState
                });
                try {
                  const canvas = document.createElement('canvas');
                  canvas.width = 1;
                  canvas.height = 1;
                  const blankStream = canvas.captureStream(0);
                  videoElement.srcObject = blankStream;
                  console.log(`⚡⚡⚡ Replaced video srcObject with blank stream for ${participantId}`);
                } catch (e) {
                  console.warn(`⚡⚡⚡ Could not create blank stream for ${participantId}, using null:`, e);
                  videoElement.srcObject = null;
                }
              }
              
              // CRITICAL: Completely hide video when disabled or track stopped
              videoElement.style.opacity = '0';
              videoElement.style.visibility = 'hidden';
              videoElement.style.display = 'none'; // Also set display to none
              videoElement.pause();
            }
          }
          
          // CRITICAL: Immediately mute/unmute audio tracks based on audioEnabled state
          const audioTracks = stream.getAudioTracks();
          audioTracks.forEach((audioTrack, index) => {
            const shouldEnableAudio = audioEnabled !== false;
            const currentEnabled = audioTrack.enabled;
            
            if (currentEnabled !== shouldEnableAudio) {
              console.log(`🔊⚡⚡⚡ INSTANT AUDIO UPDATE: ${participantId} audio track ${index} ${shouldEnableAudio ? 'UNMUTE' : 'MUTE'}`, {
                audioEnabled,
                currentEnabled,
                shouldEnableAudio,
                trackReady: audioTrack.readyState === 'live'
              });
              
              audioTrack.enabled = shouldEnableAudio;
              
              // Also set muted property if possible (though it's usually read-only)
              if (audioTrack.muted !== !shouldEnableAudio) {
                console.log(`🔊 Audio track muted state: ${audioTrack.muted}, should be: ${!shouldEnableAudio}`);
              }
            }
          });
        }
      }, 0);
      
      // CRITICAL: Force update remote streams to trigger re-render with new media state
      // Create a new object reference to ensure React detects the change
      setRemoteStreams(prev => {
        const updated = { ...prev };
        if (updated[participantId]) {
          // Keep the same stream but create new object to trigger re-render
          // This ensures VideoCall.js useEffect runs and updates the video element
          const stream = updated[participantId];
          updated[participantId] = stream; // Same stream, but new object key triggers update
          console.log(`🔄 Force updating remote stream reference for ${participantId} to trigger re-render`, {
            videoEnabled,
            audioEnabled,
            hasVideoTrack: stream.getVideoTracks().length > 0,
            hasAudioTrack: stream.getAudioTracks().length > 0,
            videoTrackEnabled: stream.getVideoTracks()[0]?.enabled,
            audioTrackEnabled: stream.getAudioTracks()[0]?.enabled
          });
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
        
        // If this is a video track and we don't have a stream yet, or the stream doesn't have this track
        if (event.track && event.track.kind === 'video') {
          const currentStream = remoteStreamsRef.current[participantId];
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
  // trackType: 'audio' | 'video' | 'both' - specifies which track to update
  // If stream is provided, it will replace the current local stream (for camera/mic requests)
  const updateAllPeerConnections = useCallback((newStream, trackType = 'both') => {
    console.log(`🔄🔄🔄 updateAllPeerConnections CALLED 🔄🔄🔄`, {
      hasNewStream: !!newStream,
      trackType,
      currentStreamRef: !!streamRef.current,
      peersCount: Object.keys(peersRef.current).length,
      peerIds: Object.keys(peersRef.current)
    });
    
    // If a new stream is provided (e.g., from camera/mic request approval), update the local stream
    if (newStream && newStream !== streamRef.current) {
      const oldStream = streamRef.current;
      
      // CRITICAL: For audio-only requests, merge audio from new stream with video from old stream
      // For video-only or both, replace the entire stream
      if (trackType === 'audio' && oldStream) {
        const oldVideoTrack = oldStream.getVideoTracks()[0];
        const newAudioTrack = newStream.getAudioTracks()[0];
        
        if (oldVideoTrack && newAudioTrack) {
          // Create a new stream with old video + new audio
          const mergedStream = new MediaStream();
          mergedStream.addTrack(oldVideoTrack);
          mergedStream.addTrack(newAudioTrack);
          
          // Stop only the old audio track (keep video track)
          const oldAudioTracks = oldStream.getAudioTracks();
          oldAudioTracks.forEach(track => track.stop());
          
          // Stop video track from new stream if it exists (we don't need it)
          const newVideoTracks = newStream.getVideoTracks();
          newVideoTracks.forEach(track => track.stop());
          
          console.log('📸 useVideoCall: Merged streams - kept old video, added new audio', {
            hasVideo: mergedStream.getVideoTracks().length > 0,
            hasAudio: mergedStream.getAudioTracks().length > 0
          });
          
          streamRef.current = mergedStream;
          setLocalStream(mergedStream);
          
          // CRITICAL: Update window.localStreamRef with merged stream
          if (window.localStreamRef) {
            window.localStreamRef.current = mergedStream;
            console.log('📸 useVideoCall: Updated window.localStreamRef with merged stream');
          }
        } else {
          // Fallback: if we can't merge, just use new stream
          console.warn('📸 useVideoCall: Cannot merge streams, using new stream', {
            hasOldVideo: !!oldVideoTrack,
            hasNewAudio: !!newAudioTrack
          });
          if (oldStream) {
            oldStream.getTracks().forEach(track => track.stop());
          }
          streamRef.current = newStream;
          setLocalStream(newStream);
        }
      } else {
        // For video-only or both, replace entire stream
        // Stop old tracks to free up resources
        if (oldStream) {
          oldStream.getTracks().forEach(track => track.stop());
        }
        
        // Update stream ref and state
        streamRef.current = newStream;
        setLocalStream(newStream);
        
        // CRITICAL: Update window.localStreamRef with new stream
        if (window.localStreamRef) {
          window.localStreamRef.current = newStream;
          console.log('📸 useVideoCall: Updated window.localStreamRef with new stream');
        }
      }
    }
    
    // Always use current streamRef - never change stream reference during toggles
    // This prevents sync effects from running and interfering with user actions
    const streamToUse = streamRef.current;
    
    if (!streamToUse) {
      return;
    }

    // CRITICAL: When updating audio only, protect video track state
    const videoTrack = streamToUse.getVideoTracks()[0];
    const videoWasEnabled = videoTrack?.enabled ?? true;
    
    // Update all existing peer connections using replaceTrack
    const peerEntries = Object.entries(peersRef.current);
    console.log(`🔄 updateAllPeerConnections: Updating ${peerEntries.length} peer connections`);
    
    Object.entries(peersRef.current).forEach(([participantId, peer]) => {
      if (peer && !peer.destroyed && peer._pc) {
        try {
          const pc = peer._pc;
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          console.log(`🔄 updateAllPeerConnections: Processing peer ${participantId}`, {
            hasPeer: !!peer,
            peerDestroyed: peer.destroyed,
            hasPC: !!pc,
            sendersCount: senders.length,
            senderKinds: senders.map(s => s.track?.kind || 'none'),
            hasVideoSender: !!videoSender,
            hasAudioSender: !!audioSender,
            trackType,
            streamHasVideo: streamToUse.getVideoTracks().length > 0,
            streamHasAudio: streamToUse.getAudioTracks().length > 0,
            signalingState: pc.signalingState,
            iceConnectionState: pc.iceConnectionState,
            peerInitiator: peer.initiator,
            peerReady: peer.ready
          });
          
          // CRITICAL: Only replace video track if explicitly requested
          // When trackType is 'audio', we MUST NOT touch video track
          if (trackType === 'video' || trackType === 'both') {
            const currentVideoTrack = streamToUse.getVideoTracks()[0];
            if (currentVideoTrack) {
              // CRITICAL: Ensure video track is enabled
              if (!currentVideoTrack.enabled) {
                currentVideoTrack.enabled = true;
                console.log(`📸 VideoCall: Enabled video track for ${participantId}`);
              }
              
              const videoSender = senders.find(s => s.track && s.track.kind === 'video');
              if (videoSender) {
                videoSender.replaceTrack(currentVideoTrack).then(() => {
                  console.log(`✅ VideoCall: Video track replaced for ${participantId}`, {
                    trackId: currentVideoTrack.id,
                    trackEnabled: currentVideoTrack.enabled,
                    trackReadyState: currentVideoTrack.readyState,
                    signalingState: pc.signalingState,
                    iceConnectionState: pc.iceConnectionState
                  });
                  
                  // CRITICAL: After replacing track, ensure renegotiation happens if connection is stable
                  // replaceTrack should trigger renegotiation automatically, but we'll ensure it happens
                  // Either side can create an offer to trigger renegotiation
                  if (pc.signalingState === 'stable' && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')) {
                    console.log(`🔄 VideoCall: Connection is stable after track replacement, ensuring renegotiation for ${participantId}`, {
                      isInitiator: peer.initiator,
                      signalingState: pc.signalingState,
                      iceConnectionState: pc.iceConnectionState
                    });
                    // Either side can create an offer to trigger renegotiation
                    pc.createOffer().then(offer => {
                      console.log(`📤 VideoCall: Created offer after video track replacement for ${participantId}`, {
                        offerType: offer.type,
                        hasVideo: offer.sdp.includes('m=video'),
                        hasAudio: offer.sdp.includes('m=audio'),
                        isInitiator: peer.initiator
                      });
                      return pc.setLocalDescription(offer);
                    }).then(() => {
                      // SimplePeer will automatically send the offer via signaling
                      console.log(`✅ VideoCall: Set local description (offer) after video track replacement for ${participantId}, signaling will be sent automatically`);
                    }).catch(err => {
                      console.error(`❌ VideoCall: Failed to create/set offer after video track replacement for ${participantId}:`, err);
                    });
                  }
                }).catch(err => {
                  console.error(`❌ VideoCall: Failed to replace video track for ${participantId}:`, err);
                });
              } else {
                // No video sender exists, need to add track
                // CRITICAL: For 'both' case, check if audio sender also doesn't exist
                // If audio sender exists, we'll add video track here; if not, we'll add entire stream in audio section
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                const needsBothTracks = trackType === 'both' && !audioSender;
                
                if (trackType === 'video' || (trackType === 'both' && audioSender)) {
                  // Add video track now (either video-only request, or both with audio already present)
                  console.log(`📸 VideoCall: No video sender found for ${participantId}, adding video track to trigger renegotiation`);
                  try {
                    // CRITICAL: Use native addTrack instead of SimplePeer's addStream for better control
                    pc.addTrack(currentVideoTrack, streamToUse);
                    console.log(`✅ VideoCall: Video track added via native addTrack for ${participantId}`, {
                      trackId: currentVideoTrack.id,
                      trackEnabled: currentVideoTrack.enabled,
                      trackReadyState: currentVideoTrack.readyState
                    });
                    
                    // CRITICAL: Always trigger renegotiation when adding tracks to established connection
                    if (pc.signalingState === 'stable') {
                      console.log(`🔄 updateAllPeerConnections: Connection is stable, triggering renegotiation for ${participantId}`, {
                        isInitiator: peer.initiator,
                        signalingState: pc.signalingState,
                        iceConnectionState: pc.iceConnectionState
                      });
                      
                      if (peer.initiator) {
                        // We're the initiator, create a new offer
                        pc.createOffer().then(offer => {
                          console.log(`📤 VideoCall: Created offer for ${participantId}`, {
                            offerType: offer.type,
                            hasVideo: offer.sdp.includes('m=video'),
                            hasAudio: offer.sdp.includes('m=audio')
                          });
                          return pc.setLocalDescription(offer);
                        }).then(() => {
                          console.log(`✅ VideoCall: Set local description (offer) for ${participantId}, signaling will be sent automatically`);
                        }).catch(err => {
                          console.error(`❌ VideoCall: Failed to create/set offer for ${participantId}:`, err);
                        });
                      } else {
                        // We're not the initiator, but we can still create an offer to trigger renegotiation
                        pc.createOffer().then(offer => {
                          console.log(`📤 VideoCall: Created offer (non-initiator) for ${participantId}`, {
                            offerType: offer.type,
                            hasVideo: offer.sdp.includes('m=video'),
                            hasAudio: offer.sdp.includes('m=audio')
                          });
                          return pc.setLocalDescription(offer);
                        }).then(() => {
                          console.log(`✅ VideoCall: Set local description (offer) for ${participantId}, signaling will be sent automatically`);
                        }).catch(err => {
                          console.error(`❌ VideoCall: Failed to create/set offer for ${participantId}:`, err);
                        });
                      }
                    } else {
                      console.log(`⚠️ VideoCall: Signaling state is not stable for ${participantId}, renegotiation will happen automatically`, {
                        signalingState: pc.signalingState
                      });
                    }
                  } catch (err) {
                    console.error(`❌ VideoCall: Failed to add video track for ${participantId}:`, err);
                  }
                } else if (trackType === 'both' && !audioSender) {
                  // Both tracks needed, but neither sender exists - will be handled in audio section
                  console.log(`📸 VideoCall: No video sender found for ${participantId}, will add entire stream in audio section`);
                }
              }
            } else {
              console.warn(`⚠️ VideoCall: No video track found in stream for ${participantId}`);
            }
          }
          
          // Only replace audio track if requested
          if (trackType === 'audio' || trackType === 'both') {
            const audioTrack = streamToUse.getAudioTracks()[0];
            if (audioTrack) {
              // CRITICAL: Ensure audio track is enabled
              if (!audioTrack.enabled) {
                audioTrack.enabled = true;
                console.log(`📸 VideoCall: Enabled audio track for ${participantId}`);
              }
              
              const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
              if (audioSender) {
                // Replace existing audio track
                audioSender.replaceTrack(audioTrack).then(() => {
                  console.log(`✅ VideoCall: Audio track replaced for ${participantId}`, {
                    trackId: audioTrack.id,
                    trackEnabled: audioTrack.enabled,
                    trackReadyState: audioTrack.readyState,
                    signalingState: pc.signalingState,
                    iceConnectionState: pc.iceConnectionState
                  });
                  // CRITICAL: After audio track replacement, verify video track wasn't affected
                  if (trackType === 'audio' && videoTrack && videoWasEnabled && !videoTrack.enabled) {
                    videoTrack.enabled = true;
                  }
                  
                  // CRITICAL: After replacing track, ensure renegotiation happens if connection is stable
                  // This is especially important when trackType is 'both' to ensure both tracks are sent
                  // Either side can create an offer to trigger renegotiation
                  if (pc.signalingState === 'stable' && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')) {
                    console.log(`🔄 VideoCall: Connection is stable after audio track replacement, ensuring renegotiation for ${participantId}`, {
                      trackType,
                      isInitiator: peer.initiator,
                      signalingState: pc.signalingState,
                      iceConnectionState: pc.iceConnectionState
                    });
                    // Either side can create an offer to trigger renegotiation
                    pc.createOffer().then(offer => {
                      console.log(`📤 VideoCall: Created offer after audio track replacement for ${participantId}`, {
                        offerType: offer.type,
                        hasVideo: offer.sdp.includes('m=video'),
                        hasAudio: offer.sdp.includes('m=audio'),
                        isInitiator: peer.initiator
                      });
                      return pc.setLocalDescription(offer);
                    }).then(() => {
                      // SimplePeer will automatically send the offer via signaling
                      console.log(`✅ VideoCall: Set local description (offer) after audio track replacement for ${participantId}, signaling will be sent automatically`);
                    }).catch(err => {
                      console.error(`❌ VideoCall: Failed to create/set offer after audio track replacement for ${participantId}:`, err);
                    });
                  }
                }).catch(err => {
                  console.error(`❌ VideoCall: Failed to replace audio track for ${participantId}:`, err);
                });
              } else {
                // No audio sender exists, need to add track
                // CRITICAL: For 'both' case, check if video sender also doesn't exist
                // If both are missing, add entire stream at once
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                const needsBothTracks = trackType === 'both' && !videoSender;
                
                if (needsBothTracks) {
                  // Add entire stream at once for 'both' case when neither sender exists
                  console.log(`📸 VideoCall: No video or audio sender found for ${participantId}, adding entire stream to trigger renegotiation`);
                  try {
                    const videoTrack = streamToUse.getVideoTracks()[0];
                    
                    // CRITICAL: Use native addTrack instead of SimplePeer's addStream for better control
                    // SimplePeer's addStream might not work correctly on already-established connections
                    if (videoTrack) {
                      pc.addTrack(videoTrack, streamToUse);
                      console.log(`✅ VideoCall: Video track added via native addTrack for ${participantId}`, {
                        trackId: videoTrack.id,
                        trackEnabled: videoTrack.enabled,
                        trackReadyState: videoTrack.readyState
                      });
                    }
                    pc.addTrack(audioTrack, streamToUse);
                    console.log(`✅ VideoCall: Audio track added via native addTrack for ${participantId}`, {
                      trackId: audioTrack.id,
                      trackEnabled: audioTrack.enabled,
                      trackReadyState: audioTrack.readyState
                    });
                    
                    // CRITICAL: Always trigger renegotiation when adding tracks to established connection
                    // Create offer if we're the initiator, or wait for offer if we're not
                    if (pc.signalingState === 'stable') {
                      console.log(`🔄 updateAllPeerConnections: Connection is stable, triggering renegotiation for ${participantId}`, {
                        isInitiator: peer.initiator,
                        signalingState: pc.signalingState,
                        iceConnectionState: pc.iceConnectionState
                      });
                      
                      if (peer.initiator) {
                        // We're the initiator, create a new offer
                        pc.createOffer().then(offer => {
                          console.log(`📤 VideoCall: Created offer for ${participantId}`, {
                            offerType: offer.type,
                            hasVideo: offer.sdp.includes('m=video'),
                            hasAudio: offer.sdp.includes('m=audio')
                          });
                          return pc.setLocalDescription(offer);
                        }).then(() => {
                          // SimplePeer will automatically send the offer via signaling
                          console.log(`✅ VideoCall: Set local description (offer) for ${participantId}, signaling will be sent automatically`);
                        }).catch(err => {
                          console.error(`❌ VideoCall: Failed to create/set offer for ${participantId}:`, err);
                        });
                      } else {
                        // We're not the initiator, but we can still create an offer to trigger renegotiation
                        // This is less common but should work
                        pc.createOffer().then(offer => {
                          console.log(`📤 VideoCall: Created offer (non-initiator) for ${participantId}`, {
                            offerType: offer.type,
                            hasVideo: offer.sdp.includes('m=video'),
                            hasAudio: offer.sdp.includes('m=audio')
                          });
                          return pc.setLocalDescription(offer);
                        }).then(() => {
                          console.log(`✅ VideoCall: Set local description (offer) for ${participantId}, signaling will be sent automatically`);
                        }).catch(err => {
                          console.error(`❌ VideoCall: Failed to create/set offer for ${participantId}:`, err);
                        });
                      }
                    } else {
                      console.log(`⚠️ VideoCall: Signaling state is not stable for ${participantId}, renegotiation will happen automatically`, {
                        signalingState: pc.signalingState
                      });
                    }
                    
                    console.log(`✅ VideoCall: Both tracks added for ${participantId}`, {
                      audioTrackId: audioTrack.id,
                      audioTrackEnabled: audioTrack.enabled,
                      videoTrackId: videoTrack?.id,
                      videoTrackEnabled: videoTrack?.enabled,
                      streamHasVideo: streamToUse.getVideoTracks().length > 0,
                      streamHasAudio: streamToUse.getAudioTracks().length > 0
                    });
                  } catch (err) {
                    console.error(`❌ VideoCall: Failed to add stream for ${participantId}:`, err);
                  }
                } else {
                  // Only audio sender is missing, add audio track
                  console.log(`📸 VideoCall: No audio sender found for ${participantId}, adding audio track to trigger renegotiation`);
                  try {
                    // CRITICAL: Use native addTrack instead of SimplePeer's addStream for better control
                    pc.addTrack(audioTrack, streamToUse);
                    console.log(`✅ VideoCall: Audio track added via native addTrack for ${participantId}`, {
                      trackId: audioTrack.id,
                      trackEnabled: audioTrack.enabled,
                      trackReadyState: audioTrack.readyState
                    });
                    
                    // CRITICAL: Always trigger renegotiation when adding tracks to established connection
                    if (pc.signalingState === 'stable') {
                      console.log(`🔄 updateAllPeerConnections: Connection is stable, triggering renegotiation for ${participantId}`, {
                        isInitiator: peer.initiator,
                        signalingState: pc.signalingState,
                        iceConnectionState: pc.iceConnectionState
                      });
                      
                      if (peer.initiator) {
                        // We're the initiator, create a new offer
                        pc.createOffer().then(offer => {
                          console.log(`📤 VideoCall: Created offer for ${participantId}`, {
                            offerType: offer.type,
                            hasVideo: offer.sdp.includes('m=video'),
                            hasAudio: offer.sdp.includes('m=audio')
                          });
                          return pc.setLocalDescription(offer);
                        }).then(() => {
                          console.log(`✅ VideoCall: Set local description (offer) for ${participantId}, signaling will be sent automatically`);
                        }).catch(err => {
                          console.error(`❌ VideoCall: Failed to create/set offer for ${participantId}:`, err);
                        });
                      } else {
                        // We're not the initiator, but we can still create an offer to trigger renegotiation
                        pc.createOffer().then(offer => {
                          console.log(`📤 VideoCall: Created offer (non-initiator) for ${participantId}`, {
                            offerType: offer.type,
                            hasVideo: offer.sdp.includes('m=video'),
                            hasAudio: offer.sdp.includes('m=audio')
                          });
                          return pc.setLocalDescription(offer); 
                        }).then(() => {
                          console.log(`✅ VideoCall: Set local description (offer) for ${participantId}, signaling will be sent automatically`);
                        }).catch(err => {
                          console.error(`❌ VideoCall: Failed to create/set offer for ${participantId}:`, err);
                        });
                      }
                    } else {
                      console.log(`⚠️ VideoCall: Signaling state is not stable for ${participantId}, renegotiation will happen automatically`, {
                        signalingState: pc.signalingState
                      });
                    }
                  } catch (err) {
                    console.error(`❌ VideoCall: Failed to add audio track for ${participantId}:`, err);
                  }
                }
              }
            } else {
              console.warn(`⚠️ VideoCall: No audio track found in stream for ${participantId}`);
            }
          }
        } catch (error) {
          console.error(`VideoCall: Failed to update peer ${participantId}:`, error);
        }
      }
    });
    
    // Final verification: if we only updated audio, ensure video track is still enabled
    if (trackType === 'audio' && videoTrack && videoWasEnabled && !videoTrack.enabled) {
      videoTrack.enabled = true;
    }
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

