import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { getBackendUrl } from '../config/network';
import { 
  ensureHostAudioTransmission,
  debugHostAudioReception,
  initializeAudioStream,
  applyAudioConstraints,
  handleStreamReception,
  fixAudioEcho,
  forceReinitializeAudio,
  fixAudioIssue
} from '../utils/audioUtils';
import { addParticipant, updateMeetingStatus } from '../services/meetingsService';

const useUltraSimplePeer = (meetingId, userName) => {
  console.log('🎯 UltraSimplePeer: Initializing with meetingId:', meetingId, 'userName:', userName);
  console.log('🎯 UltraSimplePeer: userName type:', typeof userName);
  console.log('🎯 UltraSimplePeer: userName length:', userName?.length);
  console.log('🎯 UltraSimplePeer: userName trimmed:', userName?.trim());
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [showPendingApprovals, setShowPendingApprovals] = useState(false);
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({});
  const [forceRender, setForceRender] = useState(0);
  const [microphoneStatus, setMicrophoneStatus] = useState('unknown');

  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localVideoRef = useRef(null);
  const participantsRef = useRef([]);
  const isHostRef = useRef(false);
  const addedStreamsRef = useRef(new Set());
  const reconnectionAttempts = useRef({});
  const pageVisibilityRef = useRef(true);
  const connectionHealthCheckRef = useRef(null);
  const lastReconnectionAttempt = useRef({});

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      pageVisibilityRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pendingApprovals.length]);


  // Initialize socket connection
  useEffect(() => {
    // Ignore Chrome extension errors (they don't affect functionality)
    const originalError = console.error;
    console.error = (...args) => {
      const message = args[0]?.toString() || '';
      if (message.includes('chrome-extension://') || message.includes('manifest.json')) {
        return; // Ignore Chrome extension errors
      }
      originalError.apply(console, args);
    };
    
    const newSocket = io(getBackendUrl());
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setSocketConnected(true);
      window.socket = newSocket;
      
      // Check if user is trying to join as host
      const isHostFromURL = window.location.search.includes('host=true');
      const isAlreadyApproved = window.location.search.includes('approved=true') || 
                                localStorage.getItem(`approved_${meetingId}`) === 'true';
      
      console.log('ðŸ”Œ Socket connected:', {
        isHostFromURL,
        isAlreadyApproved,
        meetingId,
        userName
      });
      
      // If user is trying to join as host (from URL parameter), always treat them as host
        if (isHostFromURL) {
        console.log('ðŸŽ¯ Host joining (detected from URL parameter)');
          setIsHost(true);
          isHostRef.current = true;
        
        newSocket.emit('join-meeting', { 
          meetingId, 
          userName,
          isHost: true 
        });
        setIsWaitingForApproval(false);
        
        // Set a timeout to check if host connection is successful
        setTimeout(() => {
        if (!localStream) {
            console.log('â° Host connection timeout - retrying media initialization...');
            initializeMedia().then(stream => {
              if (stream) {
                console.log('ðŸŽ¯ Host media initialized after timeout');
                setTimeout(() => {
                  createConnectionsToAllParticipants();
                }, 1000);
              }
            }).catch(error => {
              console.error('âŒ Host media initialization failed after timeout:', error);
            });
          }
        }, 5000);
        
        // Initialize media for host
        if (!localStream) {
          console.log('ðŸŽ¯ Host initializing media...');
          initializeMedia().then(stream => {
            if (stream) {
              console.log('ðŸŽ¯ Host media initialized successfully');
              // Create connections to existing participants
              setTimeout(() => {
                createConnectionsToAllParticipants();
              }, 1000);
            }
          }).catch(error => {
            console.error('âŒ Host media initialization failed:', error);
            // Retry media initialization after 2 seconds
            setTimeout(() => {
              console.log('ðŸ”„ Retrying host media initialization...');
              initializeMedia().then(retryStream => {
                if (retryStream) {
                  console.log('ðŸŽ¯ Host media retry successful');
                  setTimeout(() => {
                    createConnectionsToAllParticipants();
                  }, 1000);
                }
              }).catch(retryError => {
                console.error('âŒ Host media retry failed:', retryError);
              });
            }, 2000);
          });
        }
      } else {
        console.log('ðŸŽ¯ Regular participant joining');
        newSocket.emit('join-meeting', {
          meetingId,
          userName: userName,
          isHost: false
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      setSocketConnected(false);
      console.log('🔌 Socket disconnected:', reason);
      
      // DISABLED: Automatic reconnection was causing video issues
      // Let users manually reconnect instead of forcing automatic reconnection
      // if (reason === 'io server disconnect') {
      //   setTimeout(() => {
      //     if (!socketConnected) {
      //       newSocket.connect();
      //     }
      //   }, 2000);
      // } else if (reason !== 'io client disconnect') {
      //   setTimeout(() => {
      //     if (!socketConnected) {
      //       newSocket.connect();
      //     }
      //   }, 3000);
      // }
    });

    // Handle meeting joined
    newSocket.on('meeting-joined', (data) => {
      setIsHost(data.isHost);
      isHostRef.current = data.isHost;
      const initialParticipants = (data.meeting.participants || []).map(participant => ({
        ...participant,
              // Audio variables moved to audioUtils.js
        videoEnabled: participant.videoEnabled ?? false
      }));
      setParticipants(initialParticipants);
      participantsRef.current = initialParticipants;
      
      if (data.isHost) {
        setIsHost(true);
        isHostRef.current = true;
        setIsWaitingForApproval(false);
        // Clear any existing pending approvals when host joins
        setPendingApprovals([]);
        setShowPendingApprovals(false);
      }
    });

    // Handle pending approvals summary (instead of flooding with all approvals)
    newSocket.on('pending-approvals-summary', (data) => {
      if (isHostRef.current) {
        // Don't show the dialog immediately, just log the summary
        console.log(`ðŸ“ Host has ${data.count} pending approvals - not showing dialog`);
      }
    });

    // Handle participant joined
    newSocket.on('participant-joined', (data) => {
      setParticipants(prev => {
        const existingIds = prev.map(p => p.id);
        const newParticipant = data.participant;
        
        if (!existingIds.includes(newParticipant.id)) {
          const participantWithDefaults = {
            ...newParticipant,
                  // Audio variables moved to audioUtils.js
            videoEnabled: newParticipant.videoEnabled ?? false
          };
          const updated = [...prev, participantWithDefaults];
          participantsRef.current = updated;
          
          // Track participant in meeting history
          if (newParticipant.name && newParticipant.name !== 'Guest') {
            addParticipant(meetingId, newParticipant.name);
            console.log(`📝 Added participant ${newParticipant.name} to meeting history`);
          }
          
          if (newParticipant.isApproved && newParticipant.id !== newSocket.id) {
        setTimeout(() => {
      createConnectionsToAllParticipants();
            }, 200);
          }
        if (isHostRef.current && !localStream) {
          initializeMedia().then(newStream => {
            if (newStream) {
              setTimeout(() => {
          createConnectionsToAllParticipants();
        }, 1000);
            }
          });
          }
          
          return updated;
        } else {
          return prev;
        }
      });
    });

    // Handle participant left - REMOVED DUPLICATE HANDLER

    // Handle pending approval
    newSocket.on('pending-approval', (data) => {
      // Only hosts should receive pending approval events
      if (!isHostRef.current) {
        return;
      }
      
      // Don't show pending approval for the host themselves
      if (data.id === newSocket.id) {
        return;
      }
      
      setPendingApprovals(prev => {
        // Check if this participant is already in pending approvals to prevent duplicates
        const alreadyExists = prev.some(p => p.id === data.id);
        if (alreadyExists) {
          return prev;
        }
        
        const newApprovals = [...prev, data];
        return newApprovals;
      });
      
      // Only auto-show pending approvals if user is actively in the meeting
      if (pageVisibilityRef.current) {
      setShowPendingApprovals(true);
      }
    });

    // Handle participant approved
    newSocket.on('participant-approved', (data) => {
      console.log('âœ… UltraSimplePeer: Participant approved:', data);
      setIsWaitingForApproval(false);
      
      // Initialize media if not already done
      if (!localStream) {
        console.log('ðŸŽ¯ UltraSimplePeer: Initializing media for approved participant...');
        initializeMedia().then(stream => {
          if (stream) {
            console.log('ðŸŽ¯ UltraSimplePeer: Media initialized successfully for approved participant');
          } else {
            console.error('âŒ UltraSimplePeer: Failed to initialize media for approved participant');
          }
        }).catch(error => {
          console.error('âŒ UltraSimplePeer: Media initialization error for approved participant:', error);
        });
      }
      
      // Emit participant-ready event to trigger WebRTC connections
      setTimeout(() => {
        console.log('ðŸŽ¯ UltraSimplePeer: Emitting participant-ready after approval');
        console.log('ðŸŽ¯ UltraSimplePeer: userName being sent:', userName);
        console.log('ðŸŽ¯ UltraSimplePeer: userName type:', typeof userName);
        console.log('ðŸŽ¯ UltraSimplePeer: userName length:', userName?.length);
        console.log('ðŸŽ¯ UltraSimplePeer: userName trimmed:', userName?.trim());
        console.log('ðŸŽ¯ UltraSimplePeer: About to emit participant-ready with participantName:', userName);
        console.log('ðŸŽ¯ UltraSimplePeer: DEBUG - Current socket ID:', newSocket.id);
        console.log('ðŸŽ¯ UltraSimplePeer: DEBUG - Meeting ID:', meetingId);
        newSocket.emit('participant-ready', {
          meetingId,
          participantId: newSocket.id,
          participantName: userName
        });
        
        // Create connections to ALL existing participants (multi-participant support)
        console.log('ðŸ”— MULTI-PARTICIPANT: Creating connections to all existing participants');
        console.log('ðŸ”— MULTI-PARTICIPANT: Current participants:', participantsRef.current);
        console.log('ðŸ”— MULTI-PARTICIPANT: About to call createConnectionsToAllParticipants in 1000ms');
        
        // Use the centralized function to create connections to all participants
        setTimeout(() => {
          console.log('ðŸ”— MULTI-PARTICIPANT: Calling createConnectionsToAllParticipants now (from participant-approved)');
          createConnectionsToAllParticipants();
        }, 1500);
      }, 1000);
    });

    // Handle participant rejected
    newSocket.on('participant-rejected', () => {
      console.log('âŒ UltraSimplePeer: Participant rejected');
      setIsWaitingForApproval(false);
    });

    // Handle waiting for approval
    newSocket.on('waiting-for-approval', (data) => {
      console.log('â³ UltraSimplePeer: Waiting for approval:', data);
      console.log('â³ UltraSimplePeer: Current user is host:', isHostRef.current);
      
      // If the current user is the host, they shouldn't be waiting for approval
      if (isHostRef.current) {
        console.log('â³ UltraSimplePeer: User is host, ignoring waiting-for-approval event');
        return;
      }
      
      setIsWaitingForApproval(true);
      
      // Set a timeout to show connection status
      setTimeout(() => {
        if (isWaitingForApproval) {
          console.log('â³ UltraSimplePeer: Still waiting for approval after 10 seconds');
        }
      }, 10000);
    });

    // Handle participant ready for WebRTC
    newSocket.on('participant-ready', async (data) => {
      console.log('ðŸŽ¯ UltraSimplePeer: Participant ready event received!');
      console.log('ðŸŽ¯ UltraSimplePeer: Event data:', data);
      console.log('ðŸŽ¯ UltraSimplePeer: participantName received:', data.participantName);
      console.log('ðŸŽ¯ UltraSimplePeer: participantName type:', typeof data.participantName);
      console.log('ðŸŽ¯ UltraSimplePeer: participantName length:', data.participantName?.length);
      console.log('ðŸŽ¯ UltraSimplePeer: Current user is host:', isHostRef.current);
      console.log('ðŸŽ¯ UltraSimplePeer: Current user socket ID:', newSocket.id);
      console.log('ðŸŽ¯ UltraSimplePeer: Participant ID:', data.participantId);
      console.log('ðŸŽ¯ UltraSimplePeer: Current participants count:', participantsRef.current.length);
      console.log('ðŸŽ¯ UltraSimplePeer: Current participants list:', participantsRef.current.map(p => ({ id: p.id, name: p.name, isApproved: p.isApproved })));
      
      // Only create connection if we're not the participant who just got ready
      if (data.participantId !== newSocket.id) {
        console.log('ðŸŽ¯ UltraSimplePeer: Creating peer connection to participant:', data.participantId);
        
        // FALLBACK: If we don't have this participant in our list, add them
        const existingParticipant = participantsRef.current.find(p => p.id === data.participantId);
        if (!existingParticipant) {
          console.log('ðŸŽ¯ FALLBACK: Adding participant to list from participant-ready event');
          const newParticipant = {
            id: data.participantId,
            name: data.participantName || 'Guest',
            isHost: false,
            isApproved: true,
                  // Audio variables moved to audioUtils.js
            videoEnabled: true   // Default to enabled
          };
          participantsRef.current = [...participantsRef.current, newParticipant];
          setParticipants(prev => [...prev, newParticipant]);
          console.log('ðŸŽ¯ FALLBACK: Updated participants list:', participantsRef.current);
        }
        
        // Ensure we have local stream before creating connection
        if (!localStream) {
          console.log('ðŸŽ¯ UltraSimplePeer: No local stream, initializing media first...');
          await initializeMedia();
        }
        
        // Use the centralized function to create connections to all participants
        console.log('ðŸŽ¯ MULTI-PARTICIPANT: Using centralized function to create connections to all participants');
        console.log('ðŸŽ¯ MULTI-PARTICIPANT: About to call createConnectionsToAllParticipants in 1000ms');
        setTimeout(() => {
          console.log('ðŸŽ¯ MULTI-PARTICIPANT: Calling createConnectionsToAllParticipants now');
          createConnectionsToAllParticipants();
          
          // Force connection to the new participant from all existing participants
          console.log('ðŸŽ¯ MULTI-PARTICIPANT: Requesting force connections from existing participants');
          socketRef.current.emit('force-connection', {
            targetId: data.participantId,
            fromId: socketRef.current.id
          });
        }, 1000);
      } else {
        console.log('ðŸŽ¯ UltraSimplePeer: Skipping self-connection for participant:', data.participantId);
      }
    });

    // Handle WebRTC signals
    newSocket.on('signal', (data) => {
      console.log('ðŸ“¡ UltraSimplePeer: Received signal from:', data.from);
      handleSignal(data);
    });

    // Handle force connection requests
    newSocket.on('force-connection', async (data) => {
      console.log('ðŸ”— FORCE: Received force connection request:', data);
      const { targetId, fromId } = data;
      
      if (targetId === newSocket.id) {
        console.log('ðŸ”— FORCE: This is for me, creating connection to:', fromId);
        
        // Ensure we have local stream
        let currentStream = localStream;
        if (!currentStream) {
          console.log('ðŸ”— FORCE: No local stream, initializing media first...');
          currentStream = await initializeMedia();
          if (currentStream) {
            setLocalStream(currentStream);
          }
        }
        
        // Wait a bit for media to be ready
        setTimeout(async () => {
          if (!currentStream) {
            currentStream = await initializeMedia();
            if (currentStream) {
              setLocalStream(currentStream);
            }
          }
          await createPeerConnection(fromId, currentStream);
        }, 500);
      }
    });

    // Handle participant removal
    newSocket.on('participant-removed', (data) => {
      console.log('ðŸ—‘ï¸ UltraSimplePeer: You have been removed from the meeting:', data);
      
      // Create a more user-friendly notification
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #ff4444, #cc0000);
        color: white;
        padding: 24px 32px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(255, 68, 68, 0.4);
        z-index: 10000;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 400px;
        border: 2px solid rgba(255, 255, 255, 0.2);
      `;
      
      notification.innerHTML = `
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">
          ðŸš« Removed from Meeting
        </div>
        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 16px;">
          You have been removed from the meeting by the host
        </div>
        <div style="font-size: 12px; opacity: 0.8;">
          Redirecting to home page...
        </div>
      `;
      
      document.body.appendChild(notification);
      
      // Redirect after 3 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 3000);
    });

    // Handle participant left (including removal)
    newSocket.on('participant-left', (data) => {
      console.log('ðŸ‘‹ UltraSimplePeer: Participant left event received:', data);
      console.log('ðŸ‘‹ UltraSimplePeer: DEBUG - Event data:', {
        participantId: data.participantId,
        participantName: data.participantName,
        reason: data.reason,
        timestamp: new Date().toISOString()
      });
      console.log('ðŸ‘‹ UltraSimplePeer: DEBUG - Current participants before removal:', participantsRef.current.map(p => ({ id: p.id, name: p.name })));
      console.log('ðŸ‘‹ UltraSimplePeer: DEBUG - Socket ID:', newSocket.id);
      console.log('ðŸ‘‹ UltraSimplePeer: DEBUG - Is this socket the one being removed?', newSocket.id === data.participantId);
      
      // Don't process removal for the participant being removed (they should receive participant-removed instead)
      if (newSocket.id === data.participantId) {
        console.log('ðŸ‘‹ UltraSimplePeer: Skipping participant-left processing for self-removal');
        return;
      }
      
      if (data.reason === 'removed by host') {
        console.log(`ðŸ—‘ï¸ UltraSimplePeer: ${data.participantName} was removed by host`);
      } else {
        console.log(`ðŸ‘‹ UltraSimplePeer: ${data.participantName || data.userName} left voluntarily`);
      }
      
      // Remove participant from local state (this will cause the video panel to disappear completely)
      setParticipants(prev => {
        console.log('ðŸ‘‹ UltraSimplePeer: Before removal, participants:', prev.map(p => ({ id: p.id, name: p.name })));
        const updated = prev.filter(p => p.id !== data.participantId);
        console.log(`ðŸ—‘ï¸ UltraSimplePeer: After removal, participants:`, updated.map(p => ({ id: p.id, name: p.name })));
        console.log(`ðŸ—‘ï¸ UltraSimplePeer: Removed participant ${data.participantId}, remaining participants:`, updated.length);
        
        // Force a re-render to ensure UI updates
        setTimeout(() => {
          console.log(`ðŸ”„ UltraSimplePeer: Force re-render after participant removal`);
          setForceRender(prev => prev + 1);
        }, 100);
        
        return updated;
      });
      
      // Clean up peer connection
      if (peersRef.current[data.participantId]) {
        const peer = peersRef.current[data.participantId];
        
        // Stop all tracks in the peer's remote streams before destroying
        if (peer._pc && peer._pc.getRemoteStreams) {
          const remoteStreams = peer._pc.getRemoteStreams();
          remoteStreams.forEach(stream => {
            stream.getTracks().forEach(track => {
              console.log(`ðŸ—‘ï¸ UltraSimplePeer: Stopping peer track: ${track.kind} for participant: ${data.participantId}`);
              track.stop();
            });
          });
        }
        
        // Destroy the peer connection with error handling
        try {
          peer.destroy();
          console.log(`ðŸ—‘ï¸ UltraSimplePeer: Successfully destroyed peer connection for ${data.participantId}`);
        } catch (error) {
          console.log(`âš ï¸ UltraSimplePeer: Error destroying peer connection for ${data.participantId}:`, error.message);
          // This is expected for user-initiated aborts during removal
        }
        delete peersRef.current[data.participantId];
      }
      
      // Clean up remote streams (video streams)
      setRemoteStreams(prev => {
        const updated = { ...prev };
        if (updated[data.participantId]) {
          console.log(`ðŸ—‘ï¸ UltraSimplePeer: Removing video stream for ${data.participantId}`);
          // Stop all tracks in the stream
          if (updated[data.participantId].getTracks) {
            updated[data.participantId].getTracks().forEach(track => {
              track.stop();
              console.log(`ðŸ—‘ï¸ UltraSimplePeer: Stopped video track for ${data.participantId}`);
            });
          }
          delete updated[data.participantId];
        }
        return updated;
      });
      
      // Clean up remote screen streams
      setRemoteScreenStreams(prev => {
        const updated = { ...prev };
        if (updated[data.participantId]) {
          console.log(`ðŸ—‘ï¸ UltraSimplePeer: Removing screen stream for ${data.participantId}`);
          // Stop all tracks in the screen stream
          if (updated[data.participantId].getTracks) {
            updated[data.participantId].getTracks().forEach(track => {
              track.stop();
              console.log(`ðŸ—‘ï¸ UltraSimplePeer: Stopped screen track for ${data.participantId}`);
            });
          }
          delete updated[data.participantId];
        }
        return updated;
      });
      
      // Force a re-render by updating the participants ref
      participantsRef.current = participantsRef.current.filter(p => p.id !== data.participantId);
      
      // Force immediate UI update by triggering a state change
      setTimeout(() => {
        setParticipants(prev => {
          console.log(`ðŸ”„ UltraSimplePeer: Force re-render - current participants:`, prev.length);
          return [...prev]; // Force re-render
        });
        setRemoteStreams(prev => {
          console.log(`ðŸ”„ UltraSimplePeer: Force re-render - current streams:`, Object.keys(prev).length);
          return { ...prev }; // Force re-render
        });
        setRemoteScreenStreams(prev => {
          console.log(`ðŸ”„ UltraSimplePeer: Force re-render - current screen streams:`, Object.keys(prev).length);
          return { ...prev }; // Force re-render
        });
      }, 100);
      
      // Additional cleanup after a longer delay to ensure complete removal
      setTimeout(() => {
        console.log(`ðŸ§¹ UltraSimplePeer: Final cleanup check for participant ${data.participantId}`);
        setParticipants(prev => {
          const filtered = prev.filter(p => p.id !== data.participantId);
          if (filtered.length !== prev.length) {
            console.log(`ðŸ§¹ UltraSimplePeer: Final cleanup - removed participant ${data.participantId}`);
          }
          return filtered;
        });
        setRemoteStreams(prev => {
          const updated = { ...prev };
          if (updated[data.participantId]) {
            console.log(`ðŸ§¹ UltraSimplePeer: Final cleanup - removing stream for ${data.participantId}`);
            delete updated[data.participantId];
          }
          return updated;
        });
        setRemoteScreenStreams(prev => {
          const updated = { ...prev };
          if (updated[data.participantId]) {
            console.log(`ðŸ§¹ UltraSimplePeer: Final cleanup - removing screen stream for ${data.participantId}`);
            delete updated[data.participantId];
          }
          return updated;
        });
      }, 500);
      
      console.log(`âœ… UltraSimplePeer: Complete cleanup done for participant ${data.participantId}`);
      console.log(`ðŸ"Š UltraSimplePeer: Remaining participants: ${participantsRef.current.length}`);
      console.log(`ðŸ"Š UltraSimplePeer: Remaining peer connections: ${Object.keys(peersRef.current).length}`);
      
      // Note: Meeting history will persist until page refresh
      // Only mark as completed when host explicitly leaves or page is refreshed
    });

    // Add a catch-all event listener for debugging
    newSocket.onAny((eventName, ...args) => {
      console.log('ðŸ” UltraSimplePeer: Received event:', eventName, args);
      if (eventName === 'participant-joined' || eventName === 'participant-ready' || eventName === 'participant-left' || eventName === 'participant-media-state-changed') {
        console.log('ðŸŽ¯ CRITICAL EVENT RECEIVED:', eventName, 'Data:', args[0]);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [meetingId, userName]);

  // Initialize media
  const initializeMedia = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported. Please use a modern browser with HTTPS.');
      }
      
      const isMobileHotspot = window.location.hostname.includes('192.168.43') || 
                             window.location.hostname.includes('10.') ||
                             navigator.connection?.effectiveType === 'slow-2g' ||
                             navigator.connection?.effectiveType === '2g' ||
                             navigator.connection?.effectiveType === '3g';
      
      const isSlowConnection = navigator.connection?.effectiveType === 'slow-2g' || 
                              navigator.connection?.effectiveType === '2g' ||
                              navigator.connection?.downlink < 1;
      
      const videoConstraints = {
        width: isMobileHotspot || isSlowConnection ? 640 : 960,
        height: isMobileHotspot || isSlowConnection ? 480 : 540,
        frameRate: isMobileHotspot || isSlowConnection ? 15 : 24,
        facingMode: 'user'
      };
      
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Prefer microphone array over stereo mix
        deviceId: { ideal: 'default' }
      };
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
      } catch (constraintError) {
        console.log('âš ï¸ Audio constraints failed, trying basic audio...');
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: true
          });
        } catch (basicError) {
          console.log('âš ï¸ Basic audio failed, trying minimal constraints...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }
      }
      
      setLocalStream(stream);
      
      // Initialize audio using audioUtils
      await initializeAudioStream(stream, setMicrophoneStatus);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        alert('Camera access denied. Please allow camera access and refresh the page.');
      } else if (error.name === 'NotFoundError') {
        alert('No camera found. Please connect a camera and refresh the page.');
      } else if (error.name === 'NotReadableError') {
        alert('Camera is already in use by another browser or application.');
      } else if (error.name === 'OverconstrainedError') {
        alert('Camera does not support the required settings. Please try with a different camera or refresh the page.');
      } else if (error.message.includes('MediaDevices API not supported')) {
        alert('Your browser does not support camera access. Please use a modern browser with HTTPS.');
      } else {
        alert(`Camera error: ${error.message}`);
      }
      
      return null;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(async (participantId, stream = localStream) => {
    console.log(`ðŸ”— CREATE-PEER: Creating connection to ${participantId}`);
    console.log(`ðŸ”— CREATE-PEER: Has stream:`, !!stream);
    console.log(`ðŸ”— CREATE-PEER: Stream active:`, stream?.active);
    console.log(`ðŸ”— CREATE-PEER: Stream tracks:`, stream?.getTracks()?.length);
    
    if (peersRef.current[participantId]) {
      console.log(`ðŸ”— CREATE-PEER: Connection already exists for ${participantId}`);
      return;
    }

    // If no stream is provided, try to get the current local stream
    if (!stream) {
      console.log(`ðŸ”— CREATE-PEER: No stream provided, trying to get current local stream`);
      stream = localStream;
      if (!stream) {
        console.log(`ðŸ”— CREATE-PEER: No local stream available, cannot create connection`);
        return;
      }
    }
    
    // Ensure stream is active and has tracks
    if (!stream || !stream.active || stream.getTracks().length === 0) {
      console.log(`ðŸ”— CREATE-PEER: Stream is not valid, trying to reinitialize...`);
      const newStream = await initializeMedia();
      if (!newStream) {
        console.log(`ðŸ”— CREATE-PEER: Failed to initialize stream, cannot create connection`);
        return;
      }
      stream = newStream;
      setLocalStream(stream);
    }

    const shouldBeInitiator = socketRef.current?.id && participantId && socketRef.current.id < participantId;
    const totalParticipants = participantsRef.current.length;
    const isLargeGroup = totalParticipants > 2;
    
    console.log(`ðŸ”— CREATE-PEER: Initiator: ${shouldBeInitiator}, Large group: ${isLargeGroup}`);
    
    const peerConfig = {
      initiator: shouldBeInitiator,
      trickle: false,
      stream: stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      },
      sdpTransform: (sdp) => {
        return sdp
          .replace(/a=fmtp:111 minptime=10;useinbandfec=1/g, 'a=fmtp:111 minptime=10;useinbandfec=1;stereo=0')
          .replace(/a=fmtp:126 minptime=10;useinbandfec=1/g, 'a=fmtp:126 minptime=10;useinbandfec=1;stereo=0');
      }
    };
    
    if (isLargeGroup && stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const constraints = {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 15, max: 30 }
        };
        
        try {
          await videoTrack.applyConstraints(constraints);
        } catch (error) {
          // Ignore constraint errors
        }
      }
    }
    
    // Apply audio constraints using audioUtils
    await applyAudioConstraints(stream, participantId);
    
    const peer = new SimplePeer(peerConfig);

    // Ensure audio track is properly added to the peer connection
    peer.on('connect', () => {
      console.log(`ðŸ”— CREATE-PEER: Connected to ${participantId}, ensuring audio track is added`);
      
      // Force add the stream to ensure both video and audio are transmitted
      if (stream && stream.getTracks().length > 0) {
        try {
          peer.addStream(stream);
          console.log(`ðŸ”— CREATE-PEER: Successfully added stream with audio to peer for ${participantId}`);

          
          // CRITICAL: Ensure host audio transmission
                // Audio function calls moved to audioUtils.js
          
          // Double-check that audio track is enabled
          const audioTracks = stream.getAudioTracks();
          audioTracks.forEach((track, index) => {
            if (!track.enabled) {
              track.enabled = true;
              console.log(`ðŸ”§ CREATE-PEER: Force enabled audio track ${index} for ${participantId}`);
            }
            if (track.muted) {
              // Note: muted property is read-only in newer browsers
              console.log(`ðŸ”§ CREATE-PEER: Force unmuted audio track ${index} for ${participantId}`);
            }
          });
          
          // Also ensure video tracks are enabled
          const videoTracks = stream.getVideoTracks();
          videoTracks.forEach((track, index) => {
            if (!track.enabled) {
              track.enabled = true;
              console.log(`🔧 CREATE-PEER: Force enabled video track ${index} for ${participantId}`);
            }
          });
          
          console.log(`🔗 CREATE-PEER: Stream details for ${participantId}:`, {
            videoTracks: videoTracks.length,
            audioTracks: audioTracks.length,
            totalTracks: stream.getTracks().length,
            streamActive: stream.active
          });
          
        } catch (error) {
          console.log(`âš ï¸ CREATE-PEER: Stream already added to peer for ${participantId}:`, error.message);
        }
      } else {
        console.log(`âš ï¸ CREATE-PEER: No audio tracks available for ${participantId}`);
      }
    });

    peer.on('signal', (data) => {
      console.log(`ðŸ“¡ SIGNAL: Sending signal to ${participantId}:`, data.type);
      socketRef.current.emit('signal', {
        to: participantId,
        from: socketRef.current.id,
        signal: data
      });
    });

    peer.on('stream', (stream) => {
      console.log(`ðŸŽ¥ STREAM: Received stream from ${participantId}`);
      console.log(`ðŸŽ¥ STREAM: Stream active: ${stream.active}, tracks: ${stream.getTracks().length}`);
      console.log(`ðŸŽ¥ STREAM: Stream ID: ${stream.id}`);
      console.log(`ðŸŽ¥ STREAM: Video tracks: ${stream.getVideoTracks().length}`);
      console.log(`ðŸŽ¥ STREAM: Audio tracks: ${stream.getAudioTracks().length}`);

      // CRITICAL: Call handleStreamReception to fix audio issues
     handleStreamReception(stream, participantId, participantsRef.current);
      
      const isScreenShare = stream.getVideoTracks().some(track => 
        track.label && (
          track.label.includes('screen') || 
          track.label.includes('Screen') ||
          track.label.includes('window') ||
          track.label.includes('desktop')
        )
      );
      
      if (isScreenShare) {
        console.log(`ðŸ–¥ï¸ STREAM: Screen share detected from ${participantId}`);
        setRemoteScreenStreams(prev => {
          const newStreams = { ...prev };
          newStreams[participantId] = stream;
          return newStreams;
        });
        
        // CRITICAL: Call handleStreamReception to fix audio issues
        handleStreamReception(stream, participantId, participantsRef.current);
        setForceRender(prev => prev + 1);
        return;
      }
      
      console.log(`ðŸŽ¥ STREAM: Adding video stream from ${participantId}`);
      setRemoteStreams(prev => {
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(track => {
            if (track.readyState === 'live') {
              track.enabled = true;
            }
          });
        }
        
          const newStreams = {
            ...prev,
            [participantId]: stream
          };
        console.log(`ðŸŽ¥ STREAM: Updated remote streams:`, Object.keys(newStreams));
          return newStreams;
      });
    });

    peer.on('connect', () => {
      console.log(`âœ… CONNECT: Connected to ${participantId}`);
    });

    peer.on('close', () => {
      delete peersRef.current[participantId];
      const streamKeysToRemove = Array.from(addedStreamsRef.current).filter(key => key.startsWith(`${participantId}-`));
      streamKeysToRemove.forEach(key => addedStreamsRef.current.delete(key));
    });

    peer.on('error', (error) => {
      console.error('Peer error:', error);
    });

    peersRef.current[participantId] = peer;
  }, [localStream]);

  const isConnectionActive = useCallback((participantId) => {
    const peer = peersRef.current[participantId];
    if (!peer) return false;
    
    if (peer.connected && peer._pc) {
      const connectionState = peer._pc.connectionState;
      const iceConnectionState = peer._pc.iceConnectionState;
      
      // More lenient connection check - allow various active states
      const isConnectionGood = connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'new';
      const isIceGood = iceConnectionState === 'connected' || iceConnectionState === 'completed' || 
                       iceConnectionState === 'checking' || iceConnectionState === 'new';
      
      console.log(`ðŸ” Connection check for ${participantId}:`, {
        connectionState,
        iceConnectionState,
        isConnectionGood,
        isIceGood,
        result: isConnectionGood && isIceGood
      });
      
      return isConnectionGood && isIceGood;
    }
    
    // If peer exists but no _pc yet, consider it active (still establishing)
    if (peer && !peer._pc) {
      console.log(`ðŸ” Connection check for ${participantId}: Peer exists but no _pc yet, considering active`);
      return true;
    }
    
    return false;
  }, []);

  // Function to create connections to all existing participants
  const createConnectionsToAllParticipants = useCallback(async () => {
    console.log('ðŸ”— CREATE-ALL: Starting connection process');
    console.log('ðŸ”— CREATE-ALL: Participants:', participantsRef.current.length);
    console.log('ðŸ”— CREATE-ALL: Local stream:', !!localStream);
    console.log('ðŸ”— CREATE-ALL: Is host:', isHostRef.current);
    
    if (participantsRef.current.length === 0) {
      console.log('ðŸ”— CREATE-ALL: No participants to connect to');
      return;
    }
    
    let currentStream = localStream;
    
    if (!currentStream) {
      console.log('ðŸ”— CREATE-ALL: No local stream, initializing...');
      currentStream = await initializeMedia();
      if (!currentStream) {
        console.log('ðŸ”— CREATE-ALL: Failed to initialize stream');
        return;
      }
      // Update the local stream state
      setLocalStream(currentStream);
    }
    
    // Ensure stream is active and has tracks
    if (!currentStream || !currentStream.active || currentStream.getTracks().length === 0) {
      console.log('ðŸ”— CREATE-ALL: Stream is not active or has no tracks, reinitializing...');
      currentStream = await initializeMedia();
      if (!currentStream) {
        console.log('ðŸ”— CREATE-ALL: Failed to reinitialize stream');
        return;
      }
      setLocalStream(currentStream);
    }
    
    if (isHostRef.current && (!currentStream || !currentStream.active || currentStream.getTracks().length === 0)) {
      console.log('ðŸ”— CREATE-ALL: Host has no valid stream');
      return;
    }
    
    const allParticipants = participantsRef.current.filter(participant => 
      participant.id !== socketRef.current?.id && participant.isApproved
    );
    
    let participantsToConnect = [];
    
    if (isHostRef.current) {
      participantsToConnect = allParticipants.filter(participant => 
        peersRef.current[participant.id] === undefined
      );
    } else {
      const host = allParticipants.find(p => p.isHost);
      const otherParticipants = allParticipants.filter(p => !p.isHost);
      
      console.log('ðŸ”— CREATE-ALL: Non-host connection logic:', {
        isHost: isHostRef.current,
        totalParticipants: allParticipants.length,
        host: host ? { id: host.id, name: host.name } : null,
        otherParticipants: otherParticipants.map(p => ({ id: p.id, name: p.name }))
      });
      
      if (host && !peersRef.current[host.id]) {
        console.log('ðŸ”— CREATE-ALL: Adding host to connection list:', host.name);
        participantsToConnect.push(host);
      }
      
      // Always connect to other participants for small groups
      if (allParticipants.length <= 6) {
        const otherParticipantsToConnect = otherParticipants.filter(p => 
          !peersRef.current[p.id]
        );
        console.log('ðŸ”— CREATE-ALL: Adding other participants to connection list:', otherParticipantsToConnect.map(p => p.name));
        participantsToConnect.push(...otherParticipantsToConnect);
      } else {
        const additionalParticipants = otherParticipants
          .filter(p => !peersRef.current[p.id])
          .slice(0, 4);
        console.log('ðŸ”— CREATE-ALL: Adding limited participants to connection list:', additionalParticipants.map(p => p.name));
        participantsToConnect.push(...additionalParticipants);
      }
    }
    
    participantsToConnect = participantsToConnect.filter(participant => {
      const alreadyConnected = isConnectionActive(participant.id);
      const hasPeer = peersRef.current[participant.id];
      
      if (alreadyConnected && allParticipants.length > 4) {
        return false;
      }
      
      if (hasPeer && !alreadyConnected) {
        try {
          hasPeer.destroy();
        } catch (error) {
          // Ignore destroy errors
        }
        delete peersRef.current[participant.id];
        return true;
      }
      
      return true;
    });
    
    if (participantsToConnect.length === 0) {
      return;
    }
    
    console.log('ðŸ”— CREATE-ALL: Creating connections to:', participantsToConnect.length, 'participants');
    console.log('ðŸ”— CREATE-ALL: Participants to connect:', participantsToConnect.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })));
      
    participantsToConnect.forEach((participant, index) => {
      console.log(`ðŸ”— CREATE-ALL: Connecting to ${participant.name} (${participant.id}) - ${participant.isHost ? 'HOST' : 'PARTICIPANT'}`);
      setTimeout(async () => {
        try {
          await createPeerConnection(participant.id, currentStream);
          console.log(`âœ… CREATE-ALL: Connected to ${participant.name}`);
        } catch (error) {
          console.log(`âŒ CREATE-ALL: Failed to connect to ${participant.name}:`, error);
        }
      }, 200 + (index * 150));
    });
  }, [localStream, initializeMedia, createPeerConnection]);

  // Connection health check to ensure all streams stay active
  useEffect(() => {
    const startHealthCheck = () => {
      if (connectionHealthCheckRef.current) {
        clearInterval(connectionHealthCheckRef.current);
      }
      
      // DISABLED: Health check was causing automatic disconnections
      // connectionHealthCheckRef.current = setInterval(() => {
      /*
        const allParticipants = participantsRef.current.filter(p => 
          p.id !== socketRef.current?.id && p.isApproved
        );
        
        console.log(`ðŸ” HEALTH CHECK: Checking ${allParticipants.length} participants`);
        
        allParticipants.forEach(participant => {
          const isActive = isConnectionActive(participant.id);
          const hasPeer = peersRef.current[participant.id];
          
          console.log(`ðŸ” HEALTH CHECK: ${participant.name} - Active: ${isActive}, HasPeer: ${!!hasPeer}`);
          
          // Only attempt reconnection if peer exists but connection is truly dead
          if (hasPeer && !isActive) {
            const peer = peersRef.current[participant.id];
            const connectionState = peer._pc?.connectionState;
            const iceConnectionState = peer._pc?.iceConnectionState;
            
            // Only reconnect if connection is truly failed
            if (connectionState === 'failed' || connectionState === 'disconnected' || 
                iceConnectionState === 'failed' || iceConnectionState === 'disconnected') {
              
              // Check cooldown period (30 seconds between reconnection attempts)
              const now = Date.now();
              const lastAttempt = lastReconnectionAttempt.current[participant.id] || 0;
              const cooldownPeriod = 120000; // 2 minutes for stability
              
              if (now - lastAttempt > cooldownPeriod) {
                console.log(`ðŸ” HEALTH CHECK: Connection to ${participant.name} is truly dead, attempting reconnection`);
                lastReconnectionAttempt.current[participant.id] = now;
                
                // Only reconnect to the specific participant, not all participants
                setTimeout(async () => {
                  try {
                    // Double-check that we don't already have a connection
                    if (peersRef.current[participant.id]) {
                      console.log(`🔍 HEALTH CHECK: Connection already exists for ${participant.name}, skipping reconnection`);
                      return;
                    }
                    
                    await createPeerConnection(participant.id, localStream);
                    console.log(`✅ HEALTH CHECK: Successfully reconnected to ${participant.name}`);
                  } catch (error) {
                    console.log(`❌ HEALTH CHECK: Failed to reconnect to ${participant.name}:`, error);
                  }
                }, 1000);
              } else {
                console.log(`ðŸ” HEALTH CHECK: Connection to ${participant.name} is dead but in cooldown period, skipping reconnection`);
              }
            } else {
              console.log(`ðŸ” HEALTH CHECK: Connection to ${participant.name} is still establishing, skipping reconnection`);
            }
          }
        });
        
        // Clean up any duplicate connections
        const peerIds = Object.keys(peersRef.current);
        const participantIds = allParticipants.map(p => p.id);
        
        // Remove connections to participants who are no longer in the meeting
        peerIds.forEach(peerId => {
          if (!participantIds.includes(peerId)) {
            console.log(`🧹 HEALTH CHECK: Removing stale connection to ${peerId}`);
            if (peersRef.current[peerId]) {
              peersRef.current[peerId].destroy();
              delete peersRef.current[peerId];
            }
          }
        });
      }, 30000); // Increased to 30 seconds for stability in long meetings
      */
    };

    // DISABLED: Health check to prevent duplicate connections and disconnections
    // if (participantsRef.current.length > 1) {
    //   startHealthCheck();
    // }

    return () => {
      if (connectionHealthCheckRef.current) {
        clearInterval(connectionHealthCheckRef.current);
      }
    };
  }, [participantsRef.current.length, isConnectionActive, createConnectionsToAllParticipants]);

  // Handle incoming signals
  const handleSignal = useCallback((data) => {
    const { from, signal } = data;
    console.log(`ðŸ“¡ HANDLE-SIGNAL: Received ${signal.type} from ${from}`);
    
    if (peersRef.current[from]) {
      console.log(`ðŸ“¡ HANDLE-SIGNAL: Applying signal to existing peer: ${from}`);
      peersRef.current[from].signal(signal);
    } else {
      console.log(`ðŸ“¡ HANDLE-SIGNAL: Creating new peer for signal from: ${from}`);
      
      const peer = new SimplePeer({
        initiator: false,
        trickle: false,
        stream: localStream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      peer.on('signal', (signalData) => {
        console.log('ðŸ“¡ UltraSimplePeer: Sending signal to:', from);
        socketRef.current.emit('signal', {
          to: from,
          from: socketRef.current.id,
          signal: signalData
        });
      });

      peer.on('stream', (stream) => {
        console.log('ðŸŽ¥ UltraSimplePeer: Received stream from:', from);
        console.log('ðŸŽ¥ UltraSimplePeer: Stream details in handleSignal:', {
          streamId: stream.id,
          trackCount: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
                // Audio variables moved to audioUtils.js,
          streamActive: stream.active,
          streamEnded: stream.ended
        });
        
        // CRITICAL: Call handleStreamReception to fix audio issues
        handleStreamReception(stream, from, participantsRef.current);
        
        // CRITICAL: Force stream to be active if it's not
        if (!stream.active) {
          console.log('ðŸ”§ UltraSimplePeer: Stream not active in handleSignal, attempting to reactivate...');
          stream.getTracks().forEach(track => {
            if (track.readyState === 'live') {
              track.enabled = true;
              console.log(`ðŸ”§ UltraSimplePeer: Reactivated ${track.kind} track in handleSignal`);
            }
          });
        }
        
        // Force the stream to be active and ensure audio tracks are properly configured
        stream.getTracks().forEach(track => {
          console.log('ðŸŽ¥ UltraSimplePeer: Track details in handleSignal:', {
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState,
            muted: track.muted
          });
          
          // Ensure track is enabled and not muted
          if (track.readyState === 'live') {
            track.enabled = true;
            // Note: muted property is read-only in newer browsers
            
            // Special handling for audio tracks to ensure smooth audio
            if (track.kind === 'audio') {
              console.log('ðŸŽ¤ UltraSimplePeer: Configuring audio track in handleSignal');
              
              // Apply enhanced audio constraints to prevent echo
              try {
                track.applyConstraints({
                echoCancellation: true,
                noiseSuppression: true,
                  autoGainControl: true
                }).then(() => {
                  console.log('ðŸŽ¤ UltraSimplePeer: Enhanced audio constraints applied in handleSignal');
                  
                  // Test audio flow to ensure it's working
                  try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioContext.createMediaStreamSource(stream);
                    const analyser = audioContext.createAnalyser();
                    source.connect(analyser);
                    
                    // Check if audio is actually flowing
                    const bufferLength = analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(bufferLength);
                    analyser.getByteFrequencyData(dataArray);
                    
                    const hasAudio = dataArray.some(value => value > 0);
                    console.log('ðŸŽ¤ UltraSimplePeer: HandleSignal audio flow test:', hasAudio ? 'Audio detected' : 'No audio detected');
                    
                    // Clean up
                    source.disconnect();
                    audioContext.close();
                  } catch (audioTestError) {
                    console.log('ðŸŽ¤ UltraSimplePeer: HandleSignal audio test failed:', audioTestError);
                  }
                }).catch(error => {
                  console.log('ðŸŽ¤ UltraSimplePeer: Could not apply enhanced audio constraints in handleSignal:', error);
                  
                  // Fallback to enhanced constraints
                  const basicConstraints = {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    googEchoCancellation: true,
                    googNoiseSuppression: true,
                    googAutoGainControl: true,
                    googHighpassFilter: true,
                    googTypingNoiseDetection: true,
                    googAudioMirroring: false
                  };
                  
                  track.applyConstraints(basicConstraints).then(() => {
                    console.log('ðŸŽ¤ UltraSimplePeer: Basic audio constraints applied as fallback in handleSignal');
                  }).catch(fallbackError => {
                    console.log('ðŸŽ¤ UltraSimplePeer: Could not apply basic audio constraints in handleSignal:', fallbackError);
                  });
                });
              } catch (error) {
                console.log('ðŸŽ¤ UltraSimplePeer: Error applying audio constraints in handleSignal:', error);
              }
            }
          }
        });
        
        // Check if this is a screen share stream
        const isScreenShare = stream.getVideoTracks().some(track => 
          track.label && (
            track.label.includes('screen') || 
            track.label.includes('Screen') ||
            track.label.includes('window') ||
            track.label.includes('desktop')
          )
        );
        
        if (isScreenShare) {
          console.log('ðŸ–¥ï¸ UltraSimplePeer: Detected screen share stream in handleSignal from:', from);
          console.log('ðŸ–¥ï¸ UltraSimplePeer: Screen share stream details in handleSignal:', {
            streamId: stream.id,
            trackCount: stream.getTracks().length,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length,
            streamActive: stream.active
          });
          
          // Store screen share stream separately
          setRemoteScreenStreams(prev => {
            const newStreams = { ...prev };
            newStreams[from] = stream;
            console.log('ðŸ–¥ï¸ UltraSimplePeer: Updated remote screen streams in handleSignal:', Object.keys(newStreams));
            return newStreams;
          });
          
          // Force re-render to show screen share
          setForceRender(prev => prev + 1);
          return;
        }
        
        setRemoteStreams(prev => {
          // Only update if stream is actually active
          if (stream && stream.active) {
            const newStreams = {
              ...prev,
              [from]: stream
            };
            console.log('ðŸŽ¥ UltraSimplePeer: Updated remote streams in handleSignal:', Object.keys(newStreams));
            return newStreams;
          } else {
            console.log('ðŸŽ¥ UltraSimplePeer: Stream not active in handleSignal, keeping existing stream');
            return prev;
          }
        });
      });

      peer.on('connect', () => {
        console.log('âœ… UltraSimplePeer: Connected to:', from);
        console.log('ðŸ” CRITICAL DEBUG: Connection established with participant:', from);
        console.log('ðŸ” CRITICAL DEBUG: Current user is host:', isHostRef.current);
        console.log('ðŸ” CRITICAL DEBUG: Local stream available:', !!localStream);
        console.log('ðŸ” CRITICAL DEBUG: Local stream active:', localStream?.active);
        
        // Stream sharing is already handled by SimplePeer constructor
        // No need to add tracks again as this causes duplication errors
        if (localStream && localStream.active) {
          console.log('ðŸ”— UltraSimplePeer: Stream already shared via SimplePeer constructor for:', from);
          console.log('ðŸ”— UltraSimplePeer: Stream details:', {
            streamId: localStream.id,
            streamActive: localStream.active,
            trackCount: localStream.getTracks().length,
            videoTracks: localStream.getVideoTracks().length,
            audioTracks: localStream.getAudioTracks().length
          });
        }
      });

      peer.on('close', () => {
        console.log('ðŸ”Œ UltraSimplePeer: Connection closed to:', from);
        delete peersRef.current[from];
      });

      peer.on('error', (error) => {
        console.error('âŒ UltraSimplePeer: Peer error:', error);
      });

      peersRef.current[from] = peer;
      peer.signal(signal);
    }
  }, [localStream]);

  // Approve participant
  const approveParticipant = useCallback((participantId) => {
    console.log('âœ… UltraSimplePeer: Approving participant:', participantId);
    socketRef.current.emit('approve-participant', {
      meetingId,
      participantId,
      approved: true
    });
    
    // Remove from pending approvals
    setPendingApprovals(prev => prev.filter(p => p.id !== participantId));
    
    // Hide dialog if no more pending approvals
    setPendingApprovals(prev => {
      if (prev.length === 0) {
        setShowPendingApprovals(false);
      }
      return prev;
    });
  }, [meetingId]);

  // Reject participant
  const rejectParticipant = useCallback((participantId) => {
    console.log('âŒ UltraSimplePeer: Rejecting participant:', participantId);
    socketRef.current.emit('approve-participant', {
      meetingId,
      participantId,
      approved: false
    });
    
    // Remove from pending approvals
    setPendingApprovals(prev => prev.filter(p => p.id !== participantId));
    
    // Hide dialog if no more pending approvals
    setPendingApprovals(prev => {
      if (prev.length === 0) {
        setShowPendingApprovals(false);
      }
      return prev;
    });
  }, [meetingId]);

  // Auto-initialize media when host or approved
  useEffect(() => {
    if (isHost || !isWaitingForApproval) {
      console.log('ðŸŽ¥ UltraSimplePeer: Auto-initializing media (host or approved)...');
      console.log('ðŸŽ¥ UltraSimplePeer: isHost:', isHost, 'isWaitingForApproval:', isWaitingForApproval);
      
      // Add a small delay to ensure the video element is rendered
      setTimeout(() => {
        console.log('ðŸŽ¥ UltraSimplePeer: Starting delayed media initialization...');
      initializeMedia();
      }, 1000); // Increased delay to ensure video element is ready
    }
  }, [isHost, isWaitingForApproval, initializeMedia]);

  // Force connection function
  const forceConnection = useCallback(async (targetId) => {
    console.log('ðŸ”— FORCE: Force connecting to:', targetId);
    console.log('ðŸ”— FORCE: Current local stream:', localStream);
    console.log('ðŸ”— FORCE: Current remote streams:', Object.keys(remoteStreams));
    console.log('ðŸ”— FORCE: Current participants:', participants);
    
    // Ensure we have local stream
    if (!localStream) {
      console.log('ðŸ”— FORCE: No local stream, initializing media first...');
      const newStream = await initializeMedia();
      console.log('ðŸ”— FORCE: New stream after initialization:', newStream);
    }
    
      // Wait a bit for media to be ready
      setTimeout(async () => {
        // Try multiple methods to get the stream
        let currentStream = null;
        let streamSource = 'none';
        
        // Method 1: Try to get stream from video element with data-local attribute
        const videoElement = document.querySelector('video[data-local="true"]');
        if (videoElement && videoElement.srcObject) {
          currentStream = videoElement.srcObject;
          streamSource = 'video element (data-local)';
          console.log('ðŸ”— FORCE: Found stream in video element (data-local):', currentStream);
        } else {
          // Method 2: Try to get stream from any video element that has a stream
          const allVideos = document.querySelectorAll('video');
          for (const video of allVideos) {
            if (video.srcObject && video.srcObject.active) {
              currentStream = video.srcObject;
              streamSource = 'any video element';
              console.log('ðŸ”— FORCE: Found stream in any video element:', currentStream);
              break;
            }
          }
        }
        
        // Method 3: Fallback to state variable
        if (!currentStream) {
          currentStream = localStream;
          streamSource = 'state variable';
          console.log('ðŸ”— FORCE: Using stream from state:', currentStream);
        }
        
        console.log('ðŸ”— FORCE: About to create peer connection to:', targetId);
        console.log('ðŸ”— FORCE: Using local stream:', currentStream);
        console.log('ðŸ”— FORCE: Stream source:', streamSource);
        console.log('ðŸ”— FORCE: Stream active:', currentStream?.active);
        console.log('ðŸ”— FORCE: Stream tracks:', currentStream?.getTracks()?.length);
        await createPeerConnection(targetId, currentStream);
      }, 500);
  }, [localStream, initializeMedia, createPeerConnection, remoteStreams, participants]);

  // Handle screen sharing changes
  const handleScreenShareChange = useCallback((stream, isSharing) => {
    console.log('ðŸ–¥ï¸ UltraSimplePeer: Screen sharing changed:', { isSharing, streamId: stream?.id });
    
    setScreenStream(stream);
    
    if (isSharing && stream) {
      // Add screen sharing stream to all existing peer connections
      Object.keys(peersRef.current).forEach(participantId => {
        const peer = peersRef.current[participantId];
        if (peer && peer._pc && peer._pc.connectionState === 'connected') {
          try {
            console.log(`ðŸ–¥ï¸ UltraSimplePeer: Adding screen stream to peer ${participantId}`);
            // Screen share stream is already passed to SimplePeer constructor
            // No need to add tracks again
            console.log('ðŸ–¥ï¸ UltraSimplePeer: Screen share stream already shared via SimplePeer constructor');
          } catch (error) {
            console.log(`ðŸ–¥ï¸ UltraSimplePeer: Could not add screen stream to peer ${participantId}:`, error.message);
          }
        }
      });
    } else {
      // Remove screen sharing stream from all peer connections
      console.log('ðŸ–¥ï¸ UltraSimplePeer: Screen sharing stopped, cleaning up streams');
      Object.keys(peersRef.current).forEach(participantId => {
        const peer = peersRef.current[participantId];
        if (peer && peer._pc && peer._pc.connectionState === 'connected') {
          try {
            console.log(`ðŸ–¥ï¸ UltraSimplePeer: Removing screen stream from peer ${participantId}`);
            // Remove screen share tracks from peer connection
            const senders = peer._pc.getSenders();
            senders.forEach(sender => {
              if (sender.track && sender.track.kind === 'video' && sender.track.label.includes('screen')) {
                console.log(`ðŸ–¥ï¸ UltraSimplePeer: Removing screen share track from ${participantId}`);
                peer._pc.removeTrack(sender);
              }
            });
          } catch (error) {
            console.log(`ðŸ–¥ï¸ UltraSimplePeer: Could not remove screen stream from peer ${participantId}:`, error.message);
          }
        }
      });
      
      // Clear local screen stream
      if (screenStream) {
        console.log('ðŸ–¥ï¸ UltraSimplePeer: Stopping local screen stream tracks');
        screenStream.getTracks().forEach(track => {
          track.stop();
          console.log(`ðŸ–¥ï¸ UltraSimplePeer: Stopped screen track: ${track.kind}`);
        });
      }
      
      // Force clear screen stream state
      setScreenStream(null);
      
      // Force re-render to update UI
      setForceRender(prev => prev + 1);
      
      console.log('ðŸ–¥ï¸ UltraSimplePeer: Screen sharing cleanup completed, forcing UI update');
    }
  }, []);

  // Listen for remote screen sharing streams
  useEffect(() => {
    if (!socket) return;

    const handleRemoteScreenStream = (data) => {
      console.log('ðŸ–¥ï¸ UltraSimplePeer: Received remote screen stream:', data);
      const { participantId, streamId, isSharing } = data;
      
      if (isSharing) {
        // Screen sharing started - we'll receive the stream through the peer connection
        console.log(`ðŸ–¥ï¸ UltraSimplePeer: Participant ${participantId} started screen sharing`);
      } else {
        // Screen sharing stopped - remove from remote screen streams
        console.log(`ðŸ–¥ï¸ UltraSimplePeer: Participant ${participantId} stopped screen sharing - cleaning up`);
        setRemoteScreenStreams(prev => {
          const newStreams = { ...prev };
          console.log('ðŸ–¥ï¸ UltraSimplePeer: Before cleanup - remote screen streams:', Object.keys(newStreams));
          delete newStreams[participantId];
          console.log('ðŸ–¥ï¸ UltraSimplePeer: After cleanup - remote screen streams:', Object.keys(newStreams));
          return newStreams;
        });
        
        // Clear any screen share video elements
        const screenShareVideos = document.querySelectorAll('video[data-screen-share="true"]');
        screenShareVideos.forEach(video => {
          if (video.srcObject) {
            console.log('ðŸ–¥ï¸ UltraSimplePeer: Clearing screen share video element');
            video.srcObject = null;
            video.pause();
          }
        });
        
        // Also force a re-render to ensure UI updates
        console.log('ðŸ–¥ï¸ UltraSimplePeer: Forcing re-render after screen share cleanup');
        setForceRender(prev => prev + 1);
      }
    };

    socket.on('screen-share-change', handleRemoteScreenStream);

    // Listen for media state changes from other participants
    const handleMediaStateChange = (data) => {
      console.log('ðŸ“¡ UltraSimplePeer: Media state change received:', data);
      console.log('ðŸ“¡ UltraSimplePeer: DEBUG - Event data:', {
        participantId: data.participantId,
        audioEnabled: data.audioEnabled,
        videoEnabled: data.videoEnabled,
        timestamp: data.timestamp,
        currentTime: new Date().toISOString()
      });
      console.log('ðŸ“¡ UltraSimplePeer: Current participants before update:', participantsRef.current.map(p => ({
        id: p.id,
        name: p.name,
        audioEnabled: p.audioEnabled,
        videoEnabled: p.videoEnabled
      })));
      
      // Check if this is a valid media state change
      if (!data.participantId || data.audioEnabled === undefined || data.videoEnabled === undefined) {
        console.log('âŒ UltraSimplePeer: Invalid media state change data:', data);
        return;
      }
      
      // Handle video track management for the participant
      if (data.participantId !== socketRef.current?.id) {
        // This is a remote participant's media state change
        console.log(`ðŸ“¡ UltraSimplePeer: Handling remote participant media state change for ${data.participantId}`);
        
        // Get the remote stream for this participant
        const remoteStream = remoteStreams[data.participantId];
        if (remoteStream) {
          console.log(`ðŸ“¡ UltraSimplePeer: Found remote stream for ${data.participantId}, managing tracks`);
          
          // Handle video track
          const videoTracks = remoteStream.getVideoTracks();
          videoTracks.forEach(track => {
            if (data.videoEnabled) {
              console.log(`ðŸ“¹ UltraSimplePeer: Enabling video track for ${data.participantId}`);
              track.enabled = true;
            } else {
              console.log(`ðŸ“¹ UltraSimplePeer: Disabling video track for ${data.participantId}`);
              track.enabled = false;
            }
          });
          
          // Handle audio track
          const audioTracks = remoteStream.getAudioTracks();
          audioTracks.forEach(track => {
            if (data.audioEnabled) {
              console.log(`ðŸŽ¤ UltraSimplePeer: Enabling audio track for ${data.participantId}`);
              track.enabled = true;
            } else {
              console.log(`ðŸŽ¤ UltraSimplePeer: Disabling audio track for ${data.participantId}`);
              track.enabled = false;
            }
          });
        } else {
          console.log(`ðŸ“¡ UltraSimplePeer: No remote stream found for ${data.participantId}`);
        }
      }
      
      // Update participant's media state in the participants list
      setParticipants(prev => {
        const updated = prev.map(participant => {
          if (participant.id === data.participantId) {
            console.log(`ðŸ“¡ UltraSimplePeer: Updating media state for ${participant.name}:`, {
              old: { audioEnabled: participant.audioEnabled, videoEnabled: participant.videoEnabled },
              new: { audioEnabled: data.audioEnabled, videoEnabled: data.videoEnabled }
            });
            return {
              ...participant,
              audioEnabled: data.audioEnabled,
              videoEnabled: data.videoEnabled
            };
          }
          return participant;
        });
        
        console.log('ðŸ“¡ UltraSimplePeer: Participants after update:', updated.map(p => ({
          id: p.id,
          name: p.name,
          audioEnabled: p.audioEnabled,
          videoEnabled: p.videoEnabled
        })));
        
        // Update the ref as well to ensure consistency
        participantsRef.current = updated;
        
        // Force a re-render to ensure UI updates
        console.log('ðŸ“¡ UltraSimplePeer: Forcing re-render due to media state change');
        setForceRender(prev => prev + 1);
        
        return updated;
      });
    };

    socket.on('participant-media-state-changed', handleMediaStateChange);

    return () => {
      socket.off('screen-share-change', handleRemoteScreenStream);
      socket.off('participant-media-state-changed', handleMediaStateChange);
    };
  }, [socket]);

  // Notify other participants when screen sharing changes
  useEffect(() => {
    if (!socket || !socketConnected) return;

    if (screenStream) {
      console.log('ðŸ–¥ï¸ UltraSimplePeer: Notifying participants about screen sharing start');
      socket.emit('screen-share-change', {
        meetingId,
        participantId: socket.id,
        isSharing: true,
        streamId: screenStream.id
      });
    } else {
      console.log('ðŸ–¥ï¸ UltraSimplePeer: Notifying participants about screen sharing stop');
      socket.emit('screen-share-change', {
        meetingId,
        participantId: socket.id,
        isSharing: false
      });
    }
  }, [socket, socketConnected, screenStream, meetingId]);

  // Store original stream for restoration
  const originalStreamRef = useRef(null);

  // Function to update local stream (for consent dialog integration)
  const updateLocalStream = useCallback((newStream) => {
    console.log('ðŸ”„ UltraSimplePeer: Updating local stream');
    console.log('ðŸ”„ UltraSimplePeer: New stream details:', {
      id: newStream?.id,
      active: newStream?.active,
      tracks: newStream?.getTracks().length,
      videoTracks: newStream?.getVideoTracks().length,
      audioTracks: newStream?.getAudioTracks().length
    });
    
    // Store the original stream if this is the first time we're setting it
    if (!originalStreamRef.current && localStream) {
      originalStreamRef.current = localStream;
      console.log('ðŸ”„ UltraSimplePeer: Stored original stream for restoration');
    }
    
    setLocalStream(newStream);
    
    // Use the centralized update function to update all peer connections
    updateAllPeerConnections(newStream);
    
    // Update all existing peer connections with the new stream
    Object.keys(peersRef.current).forEach(participantId => {
      const peer = peersRef.current[participantId];
      if (peer && peer.getSenders) {
        console.log(`ðŸ”„ UltraSimplePeer: Updating peer connection for participant ${participantId}`);
        
        // Get current senders
        const senders = peer.getSenders();
        console.log(`ðŸ”„ UltraSimplePeer: Current senders for ${participantId}:`, senders.length);
        
        // Remove old tracks
        senders.forEach(sender => {
          if (sender.track) {
            console.log(`ðŸ”„ UltraSimplePeer: Removing old track: ${sender.track.kind}`);
            peer.removeTrack(sender);
          }
        });
        
        // Add new tracks
        if (newStream) {
          console.log('ðŸ”„ UltraSimplePeer: New stream available, but tracks should be managed by SimplePeer');
          console.log('ðŸ”„ UltraSimplePeer: New stream details:', {
            streamId: newStream.id,
            streamActive: newStream.active,
            trackCount: newStream.getTracks().length
          });
        }
        
        console.log(`âœ… UltraSimplePeer: Updated stream for participant ${participantId}`);
        
        // Force re-send the stream to ensure the remote peer receives it
        setTimeout(() => {
          console.log(`ðŸ”„ UltraSimplePeer: Force re-sending stream to ${participantId} after consent`);
          if (newStream && newStream.active) {
            console.log('ðŸ”„ UltraSimplePeer: Stream update should be handled by SimplePeer automatically');
            console.log('ðŸ”„ UltraSimplePeer: New stream details for', participantId, ':', {
              streamId: newStream.id,
              streamActive: newStream.active,
              trackCount: newStream.getTracks().length
            });
          }
        }, 1000); // Wait 1 second then force re-send
        
      } else if (peer) {
        // Stream updates should be handled by SimplePeer automatically
        console.log(`ðŸ”„ UltraSimplePeer: Stream updates handled by SimplePeer for participant ${participantId}`);
        console.log(`ðŸ”„ UltraSimplePeer: New stream details:`, {
          streamId: newStream.id,
          streamActive: newStream.active,
          trackCount: newStream.getTracks().length
        });
      }
    });
    
    // Emit media state change to notify other participants about the stream update
    if (socket && meetingId && newStream) {
      const videoEnabled = newStream.getVideoTracks().length > 0 && newStream.getVideoTracks()[0].enabled;
      const audioEnabled = newStream.getAudioTracks().length > 0 && newStream.getAudioTracks()[0].enabled;
      
      console.log('ðŸ“¡ UltraSimplePeer: Emitting media state change after stream update:', {
        videoEnabled,
        audioEnabled,
        meetingId,
        participantId: socket.id
      });
      
      socket.emit('media-state-change', {
        meetingId,
        participantId: socket.id,
        audioEnabled,
        videoEnabled,
        timestamp: Date.now()
      });
    }
  }, [socket, meetingId]);

  // Function to restore original stream
  const restoreOriginalStream = useCallback(() => {
    if (originalStreamRef.current) {
      console.log('ðŸ”„ UltraSimplePeer: Restoring original stream');
      updateLocalStream(originalStreamRef.current);
    } else {
      console.log('ðŸ”„ UltraSimplePeer: No original stream to restore');
    }
  }, [updateLocalStream]);

  // Function to update all peer connections with new stream state
  const updateAllPeerConnections = useCallback((stream) => {
    console.log('🔄 UltraSimplePeer: Updating all peer connections with new stream state...');
    
    Object.keys(peersRef.current).forEach(participantId => {
      const peer = peersRef.current[participantId];
      if (peer && peer._pc) {
        try {
          // Get audio and video tracks from the stream
          const audioTrack = stream.getAudioTracks()[0];
          const videoTrack = stream.getVideoTracks()[0];
          
          // Update audio track if available
          if (audioTrack) {
            const senders = peer._pc.getSenders();
            const audioSender = senders.find(sender => 
              sender.track && sender.track.kind === 'audio'
            );
            
            if (audioSender) {
              audioSender.replaceTrack(audioTrack);
              console.log(`🔄 UltraSimplePeer: Updated audio track for ${participantId}: ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
            }
          }
          
          // Update video track if available
          if (videoTrack) {
            const senders = peer._pc.getSenders();
            const videoSender = senders.find(sender => 
              sender.track && sender.track.kind === 'video'
            );
            
            if (videoSender) {
              videoSender.replaceTrack(videoTrack);
              console.log(`🔄 UltraSimplePeer: Updated video track for ${participantId}: ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
            }
          }
        } catch (error) {
          console.log(`⚠️ UltraSimplePeer: Could not update peer connection for ${participantId}:`, error.message);
        }
      }
    });
  }, []);

  // STABILITY: Function to ensure connection stability for long meetings
  const ensureConnectionStability = useCallback(() => {
    console.log('🛡️ UltraSimplePeer: Ensuring connection stability...');
    
    Object.keys(peersRef.current).forEach(participantId => {
      const peer = peersRef.current[participantId];
      if (peer && peer._pc) {
        const connectionState = peer._pc.connectionState;
        const iceConnectionState = peer._pc.iceConnectionState;
        
        // If connection is in a problematic state, try to recover
        if (connectionState === 'failed' || connectionState === 'disconnected' || 
            iceConnectionState === 'failed' || iceConnectionState === 'disconnected') {
          console.log(`🛡️ UltraSimplePeer: Connection to ${participantId} is in problematic state: ${connectionState}/${iceConnectionState}`);
          
          // Only attempt recovery if we haven't tried recently
          const now = Date.now();
          const lastAttempt = lastReconnectionAttempt.current[participantId] || 0;
          const cooldownPeriod = 300000; // 5 minutes for stability
          
          if (now - lastAttempt > cooldownPeriod) {
            console.log(`🛡️ UltraSimplePeer: Attempting to recover connection to ${participantId}`);
            lastReconnectionAttempt.current[participantId] = now;
            
            // Destroy the problematic connection
            try {
              peer.destroy();
            } catch (error) {
              console.log(`🛡️ UltraSimplePeer: Error destroying problematic peer:`, error.message);
            }
            delete peersRef.current[participantId];
            
            // Recreate the connection
            setTimeout(async () => {
              try {
                await createPeerConnection(participantId, localStream);
                console.log(`🛡️ UltraSimplePeer: Successfully recovered connection to ${participantId}`);
              } catch (error) {
                console.log(`🛡️ UltraSimplePeer: Failed to recover connection to ${participantId}:`, error);
              }
            }, 2000);
          }
        }
      }
    });
  }, [localStream, createPeerConnection]);

  // DISABLED: Periodic stability check to prevent duplicate connections and disconnections
  // The stability system was causing duplicate remote videos and automatic disconnections
  // This has been disabled to maintain stable connections
  useEffect(() => {
    console.log('🛡️ UltraSimplePeer: Stability check disabled to prevent connection issues');
    
    return () => {
      // No cleanup needed since we're not running any intervals
    };
  }, []);

  // Make the hook globally accessible for consent dialog integration and audio testing
  useEffect(() => {
    window.ultraSimplePeerRef = {
      current: {
        updateLocalStream,
        restoreOriginalStream,
        peersRef,
        localStream,
        originalStream: originalStreamRef.current,
        participantsRef,
        remoteStreams,
        isHost,
        socket,
        socketConnected,
        updateAllPeerConnections,
        ensureConnectionStability
      }
    };
    
    return () => {
      window.ultraSimplePeerRef = null;
    };
  }, [updateLocalStream, localStream, participantsRef, remoteStreams, isHost, socket, socketConnected]);



  // Force re-share host stream to all participants
  const forceReshareHostStream = useCallback(async () => {
    console.log('🔧 RESHARE: Force re-sharing host stream to all participants...');
    
    if (!localStream || !localStream.active) {
      console.log('🔧 RESHARE: No local stream available');
      return;
    }
    
    const currentStream = localStream;
    console.log('🔧 RESHARE: Current stream details:', {
      streamId: currentStream.id,
      streamActive: currentStream.active,
      videoTracks: currentStream.getVideoTracks().length,
      audioTracks: currentStream.getAudioTracks().length,
      totalTracks: currentStream.getTracks().length
    });
    
    // Force re-add stream to all existing peer connections
    Object.keys(peersRef.current).forEach(participantId => {
      const peer = peersRef.current[participantId];
      if (peer && peer._pc) {
        try {
          console.log(`🔧 RESHARE: Re-adding stream to peer ${participantId}`);
          peer.addStream(currentStream);
          
          // Ensure all tracks are enabled
          const videoTracks = currentStream.getVideoTracks();
          const audioTracks = currentStream.getAudioTracks();
          
          videoTracks.forEach((track, index) => {
            if (!track.enabled) {
              track.enabled = true;
              console.log(`🔧 RESHARE: Enabled video track ${index} for ${participantId}`);
            }
          });
          
          audioTracks.forEach((track, index) => {
            if (!track.enabled) {
              track.enabled = true;
              console.log(`🔧 RESHARE: Enabled audio track ${index} for ${participantId}`);
            }
            if (track.muted) {
              // Note: muted property is read-only in newer browsers
              console.log(`🔧 RESHARE: Unmuted audio track ${index} for ${participantId}`);
            }
          });
          
          console.log(`🔧 RESHARE: Successfully re-shared stream to ${participantId}`);
        } catch (error) {
          console.log(`⚠️ RESHARE: Could not re-share stream to ${participantId}:`, error.message);
        }
      }
    });
    
    console.log('🔧 RESHARE: Host stream re-sharing completed');
  }, [localStream]);

  

  // Audio functions moved to audioUtils.js
  const fixAudioIssue = useCallback(async () => {
    return await fixAudioIssue(localStream, peersRef);
  }, [localStream, peersRef]);

  
  // Audio functions moved to audioUtils.js
  const fixAudioEcho = useCallback(async () => {
    return await fixAudioEcho(localStream);
  }, [localStream]);

  const forceReinitializeAudio = useCallback(async () => {
    return await forceReinitializeAudio(localStream, peersRef);
  }, [localStream, peersRef]);

  // Audio reinitialization function
  const forceAudioReinit = useCallback(async () => {
    try {
      console.log('🔄 FORCE-AUDIO-REINIT: Starting audio reinitialization...');
      const newStream = await initializeMedia();
      if (newStream) {
        setLocalStream(newStream);
        console.log('✅ FORCE-AUDIO-REINIT: Audio reinitialized successfully');
        return true;
      } else {
        console.log('❌ FORCE-AUDIO-REINIT: Failed to reinitialize audio');
        return false;
      }
    } catch (error) {
      console.error('❌ FORCE-AUDIO-REINIT: Audio reinitialization failed:', error);
      return false;
    }
  }, [initializeMedia]);

  // Gentle debugging function to understand connection issues
  const debugConnectionStatus = useCallback(() => {
    console.log('ðŸ” GENTLE DEBUG: Connection status analysis...');
    console.log('ðŸ” GENTLE DEBUG: Current state:', {
      isHost: isHostRef.current,
      hasLocalStream: !!localStream,
      localStreamActive: localStream?.active,
      localStreamTracks: localStream?.getTracks()?.length,
      participantsCount: participantsRef.current.length,
      remoteStreamsCount: Object.keys(remoteStreams).length,
      socketConnected: !!socket,
      socketId: socket?.id
    });
    
    console.log('ðŸ” GENTLE DEBUG: Participants details:');
    participantsRef.current.forEach(participant => {
      console.log(`ðŸ” GENTLE DEBUG: - ${participant.name} (${participant.id}):`, {
        isHost: participant.isHost,
        isApproved: participant.isApproved,
        hasRemoteStream: !!remoteStreams[participant.id],
        remoteStreamActive: remoteStreams[participant.id]?.active
      });
    });
    
    console.log('ðŸ” GENTLE DEBUG: Remote streams details:');
    Object.keys(remoteStreams).forEach(participantId => {
      const stream = remoteStreams[participantId];
      const participant = participantsRef.current.find(p => p.id === participantId);
      console.log(`ðŸ” GENTLE DEBUG: - ${participant?.name || participantId}:`, {
        streamActive: stream?.active,
        streamTracks: stream?.getTracks()?.length,
        videoTracks: stream?.getVideoTracks()?.length,
        audioTracks: stream?.getAudioTracks()?.length
      });
    });
  }, [localStream, remoteStreams, socket]);

  // Microphone test function
  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTracks = stream.getAudioTracks();
      
      if (audioTracks.length > 0) {
        const audioTrack = audioTracks[0];
        console.log('ðŸŽ¤ Microphone Test Results:', {
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          label: audioTrack.label
        });
        
        // Test audio level
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        
        if (average > 0) {
          setMicrophoneStatus('working');
          alert('âœ… Microphone is working! Audio level: ' + average);
        } else {
          setMicrophoneStatus('no-audio');
          alert('âš ï¸ Microphone not detecting audio. Check permissions and try again.');
        }
        
        // Clean up
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
      } else {
        setMicrophoneStatus('no-tracks');
        alert('âŒ No audio tracks found. Check microphone connection.');
      }
    } catch (error) {
      console.error('âŒ Microphone test failed:', error);
      setMicrophoneStatus('error');
      alert('âŒ Microphone test failed: ' + error.message);
    }
  };

  

  return {
    localStream,
    remoteStreams,
    participants,
    isHost,
    isConnectionActive,
    isConnected: socketConnected,
    joinMeeting: () => {}, // Not needed in this simplified version
    initializeMedia,
    updateLocalStream, // Expose the method
    fixAudioIssue, // Expose the audio fix function
    debugConnectionStatus, // Expose the debug function
    // Participant management
    pendingApprovals,
    showPendingApprovals,
    setShowPendingApprovals,
    isWaitingForApproval,
    approveParticipant,
    rejectParticipant,
    // Connection management
    socket,
    forceConnection,
    // Screen sharing functionality
    screenStream,
    remoteScreenStreams,
    handleScreenShareChange,
    forceRender,
    // Microphone debugging
    microphoneStatus,
    testMicrophone,
    forceAudioReinit,
    fixAudioEcho,
    fixAudioIssue,
    forceReshareHostStream,
    forceReinitializeAudio,
    // Video ref for components
    localVideoRef
  };
};

export default useUltraSimplePeer;
