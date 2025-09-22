import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { getBackendUrl } from '../config/network';

const useUltraSimplePeer = (meetingId, userName) => {
  console.log('🔌 UltraSimplePeer: Parameters received:', { meetingId, userName });
  console.log('🔌 UltraSimplePeer: userName value:', userName);
  console.log('🔌 UltraSimplePeer: userName type:', typeof userName);
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

  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localVideoRef = useRef(null);
  const participantsRef = useRef([]);
  const isHostRef = useRef(false);
  const addedStreamsRef = useRef(new Set());
  const reconnectionAttempts = useRef({});
  const pageVisibilityRef = useRef(true);
  const connectionHealthCheckRef = useRef(null);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      pageVisibilityRef.current = !document.hidden;
      console.log('👁️ Page visibility changed:', pageVisibilityRef.current ? 'visible' : 'hidden');
      
      // If user returns to page and there are pending approvals, don't auto-show dialog
      if (pageVisibilityRef.current && pendingApprovals.length > 0) {
        console.log('👁️ User returned to page with pending approvals, not auto-showing dialog');
        // Keep the pending approvals count but don't show the dialog automatically
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pendingApprovals.length]);


  // Initialize socket connection
  useEffect(() => {
    console.log('🔌 UltraSimplePeer: Initializing socket connection...');
    
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
      console.log('✅ UltraSimplePeer: Socket connected with ID:', newSocket.id);
      setSocketConnected(true);
      
      // Make socket globally available for debugging
      window.socket = newSocket;
      
      // Auto-join meeting (only if not already approved)
      console.log('🎉 Auto-joining meeting with UltraSimplePeer...');
      console.log('🔍 Checking if user is already approved...');
      
      // Check if user is already approved by looking at URL or localStorage
      // Only skip auto-join if user is actually a host (has host=true in URL)
      const isHostFromURL = window.location.search.includes('host=true');
      const isAlreadyApproved = window.location.search.includes('approved=true') || 
                                localStorage.getItem(`approved_${meetingId}`) === 'true';
      
      if (isAlreadyApproved && isHostFromURL) {
        console.log('✅ User is already approved, but still need to join meeting to update socket ID');
        
        // For approved users, we need to determine if they're the host
        // isHostFromURL is already defined above
        
        console.log('🔍 Checking host status from URL:', isHostFromURL);
        console.log('🔍 URL search params:', window.location.search);
        
        if (isHostFromURL) {
          console.log('👑 User is host based on URL parameters');
          setIsHost(true);
          isHostRef.current = true;
        } else {
          console.log('👥 User is participant based on URL parameters');
          setIsHost(false);
          isHostRef.current = false;
        }
        
        // Even if already approved, we need to join the meeting to update socket ID
        console.log('🔄 Joining meeting to update socket ID for reconnected host');
        newSocket.emit('join-meeting', { meetingId, userName });
        
        setIsWaitingForApproval(false);
        
        // Just initialize media without joining
        if (!localStream) {
          initializeMedia();
        }
      } else {
        console.log('🔄 User not approved yet or not a host, joining meeting...');
        console.log('🔍 isAlreadyApproved:', isAlreadyApproved);
        console.log('🔍 isHostFromURL:', isHostFromURL);
        newSocket.emit('join-meeting', {
          meetingId,
          userName: userName,
          isHost: false  // Always false for auto-join, backend will determine if first participant
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ UltraSimplePeer: Socket disconnected, reason:', reason);
      setSocketConnected(false);
      
      // Enhanced reconnection logic for multiple laptops
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        console.log('🔄 UltraSimplePeer: Server disconnect, attempting reconnection...');
        setTimeout(() => {
          if (!socketConnected) {
            console.log('🔄 UltraSimplePeer: Reconnecting to server...');
            newSocket.connect();
          }
        }, 2000);
      } else if (reason === 'io client disconnect') {
        // Client initiated disconnect, don't auto-reconnect
        console.log('🔄 UltraSimplePeer: Client disconnect, not auto-reconnecting');
      } else {
        // Network issues, try to reconnect
        console.log('🔄 UltraSimplePeer: Network disconnect, attempting reconnection...');
        setTimeout(() => {
          if (!socketConnected) {
            console.log('🔄 UltraSimplePeer: Reconnecting after network issue...');
            newSocket.connect();
          }
        }, 3000);
      }
    });

    // Handle meeting joined
    newSocket.on('meeting-joined', (data) => {
      console.log('🎉 UltraSimplePeer: Meeting joined successfully!', data);
      setIsHost(data.isHost);
      isHostRef.current = data.isHost;
      const initialParticipants = (data.meeting.participants || []).map(participant => ({
        ...participant,
        audioEnabled: participant.audioEnabled ?? false,
        videoEnabled: participant.videoEnabled ?? false
      }));
      setParticipants(initialParticipants);
      participantsRef.current = initialParticipants;
      
      if (data.isHost) {
        console.log('👑 UltraSimplePeer: First participant - becoming host');
        setIsHost(true);
        isHostRef.current = true;
        setIsWaitingForApproval(false); // Hosts don't wait for approval
      }
      
      console.log('👤 UltraSimplePeer: Current user info:', {
        id: newSocket.id,
        name: userName,
        isHost: data.isHost
      });
    });

    // Handle participant joined
    newSocket.on('participant-joined', (data) => {
      console.log('👥 UltraSimplePeer: Participant joined event received!');
      console.log('👥 UltraSimplePeer: Event data:', data);
      console.log('👥 UltraSimplePeer: Current user socket ID:', newSocket.id);
      console.log('👥 UltraSimplePeer: Current participants before update:', participantsRef.current);
      console.log('👥 UltraSimplePeer: New participant data:', data.participant);
      console.log('👥 UltraSimplePeer: Meeting participants:', data.meeting.participants);
      console.log('👥 UltraSimplePeer: Socket ID:', newSocket.id);
      console.log('👥 UltraSimplePeer: Is Host:', isHost);
      
      // Add the new participant to the existing participants list
      setParticipants(prev => {
        const existingIds = prev.map(p => p.id);
        const newParticipant = data.participant;
        
        console.log('👥 UltraSimplePeer: New participant data:', {
          id: newParticipant?.id,
          name: newParticipant?.name,
          isHost: newParticipant?.isHost,
          isApproved: newParticipant?.isApproved
        });
        
        // Only add if not already in the list
        if (!existingIds.includes(newParticipant.id)) {
          // Add default media states if not present
          const participantWithDefaults = {
            ...newParticipant,
            audioEnabled: newParticipant.audioEnabled ?? false,
            videoEnabled: newParticipant.videoEnabled ?? false
          };
          const updated = [...prev, participantWithDefaults];
          participantsRef.current = updated;
          console.log('👥 UltraSimplePeer: Added new participant, updated list:', updated);
          
          // Create WebRTC connection to the new participant (multi-participant support)
          if (newParticipant.isApproved && newParticipant.id !== newSocket.id) {
            console.log('🔗 MULTI-PARTICIPANT: Creating connection to new participant:', newParticipant.id);
            
        // Use the centralized function to create connections to all participants
        console.log('👥 MULTI-PARTICIPANT: About to call createConnectionsToAllParticipants in 1000ms (from participant-joined)');
        setTimeout(() => {
          console.log('👥 MULTI-PARTICIPANT: Calling createConnectionsToAllParticipants now (from participant-joined)');
          createConnectionsToAllParticipants();
        }, 1000);
        
        // Also ensure host's stream is immediately available for sharing
        if (isHostRef.current && localStream) {
          console.log('👥 MULTI-PARTICIPANT: Host has local stream, ensuring it\'s ready for sharing');
          console.log('👥 MULTI-PARTICIPANT: Host stream details:', {
            streamId: localStream.id,
            active: localStream.active,
            trackCount: localStream.getTracks().length,
            videoTracks: localStream.getVideoTracks().length,
            audioTracks: localStream.getAudioTracks().length
          });
        } else if (isHostRef.current && !localStream) {
          console.log('👥 MULTI-PARTICIPANT: Host has no local stream, this may cause issues');
        }
          }
          
          return updated;
        } else {
          console.log('👥 UltraSimplePeer: Participant already exists, no update needed');
          return prev;
        }
      });
    });

    // Handle participant left
    newSocket.on('participant-left', (data) => {
      console.log('👋 UltraSimplePeer: Participant left:', data);
      setParticipants(prev => {
        const updated = prev.filter(p => p.id !== data.participantId);
        participantsRef.current = updated;
        return updated;
      });
      
      // Clean up peer connection
      if (peersRef.current[data.participantId]) {
        peersRef.current[data.participantId].destroy();
        delete peersRef.current[data.participantId];
      }
      
      // Remove remote stream
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[data.participantId];
        return newStreams;
      });
    });

    // Handle pending approval
    newSocket.on('pending-approval', (data) => {
      console.log('⏳ UltraSimplePeer: Pending approval for:', data);
      console.log('⏳ UltraSimplePeer: Data structure:', {
        id: data?.id,
        name: data?.name,
        isHost: data?.isHost,
        joinedAt: data?.joinedAt
      });
      console.log('⏳ UltraSimplePeer: Current user is host:', isHostRef.current);
      console.log('⏳ UltraSimplePeer: Socket ID:', newSocket.id);
      console.log('⏳ UltraSimplePeer: URL search params:', window.location.search);
      console.log('⏳ UltraSimplePeer: Current pendingApprovals state:', pendingApprovals);
      console.log('⏳ UltraSimplePeer: Current showPendingApprovals state:', showPendingApprovals);
      
      // Only hosts should receive pending approval events
      if (!isHostRef.current) {
        console.log('⏳ UltraSimplePeer: User is not host, ignoring pending-approval event');
        return;
      }
      
      console.log('⏳ UltraSimplePeer: User is host, processing pending approval');
      setPendingApprovals(prev => {
        const newApprovals = [...prev, data];
        console.log('⏳ UltraSimplePeer: Updated pending approvals:', newApprovals);
        return newApprovals;
      });
      // Only auto-show pending approvals if user is actively in the meeting
      // Don't auto-show if user is just returning to the page
      if (pageVisibilityRef.current) {
        console.log('⏳ UltraSimplePeer: Setting showPendingApprovals to true (user is active)');
      setShowPendingApprovals(true);
      } else {
        console.log('⏳ UltraSimplePeer: Not auto-showing pending approvals (user not active)');
        // Just update the pending approvals count, don't show dialog
      }
    });

    // Handle participant approved
    newSocket.on('participant-approved', (data) => {
      console.log('✅ UltraSimplePeer: Participant approved:', data);
      setIsWaitingForApproval(false);
      
      // Initialize media if not already done
      if (!localStream) {
        initializeMedia();
      }
      
      // Emit participant-ready event to trigger WebRTC connections
      setTimeout(() => {
        console.log('🎯 UltraSimplePeer: Emitting participant-ready after approval');
        newSocket.emit('participant-ready', {
          meetingId,
          participantId: newSocket.id,
          participantName: userName
        });
        
        // Create connections to ALL existing participants (multi-participant support)
        console.log('🔗 MULTI-PARTICIPANT: Creating connections to all existing participants');
        console.log('🔗 MULTI-PARTICIPANT: Current participants:', participantsRef.current);
        console.log('🔗 MULTI-PARTICIPANT: About to call createConnectionsToAllParticipants in 1000ms');
        
        // Use the centralized function to create connections to all participants
        setTimeout(() => {
          console.log('🔗 MULTI-PARTICIPANT: Calling createConnectionsToAllParticipants now (from participant-approved)');
          createConnectionsToAllParticipants();
        }, 1500);
      }, 1000);
    });

    // Handle participant rejected
    newSocket.on('participant-rejected', () => {
      console.log('❌ UltraSimplePeer: Participant rejected');
      setIsWaitingForApproval(false);
    });

    // Handle waiting for approval
    newSocket.on('waiting-for-approval', (data) => {
      console.log('⏳ UltraSimplePeer: Waiting for approval:', data);
      console.log('⏳ UltraSimplePeer: Current user is host:', isHostRef.current);
      
      // If the current user is the host, they shouldn't be waiting for approval
      if (isHostRef.current) {
        console.log('⏳ UltraSimplePeer: User is host, ignoring waiting-for-approval event');
        return;
      }
      
      setIsWaitingForApproval(true);
    });

    // Handle participant ready for WebRTC
    newSocket.on('participant-ready', async (data) => {
      console.log('🎯 UltraSimplePeer: Participant ready event received!');
      console.log('🎯 UltraSimplePeer: Event data:', data);
      console.log('🎯 UltraSimplePeer: Current user is host:', isHostRef.current);
      console.log('🎯 UltraSimplePeer: Current user socket ID:', newSocket.id);
      console.log('🎯 UltraSimplePeer: Participant ID:', data.participantId);
      console.log('🎯 UltraSimplePeer: Current participants count:', participantsRef.current.length);
      console.log('🎯 UltraSimplePeer: Current participants list:', participantsRef.current.map(p => ({ id: p.id, name: p.name, isApproved: p.isApproved })));
      
      // Only create connection if we're not the participant who just got ready
      if (data.participantId !== newSocket.id) {
        console.log('🎯 UltraSimplePeer: Creating peer connection to participant:', data.participantId);
        
        // FALLBACK: If we don't have this participant in our list, add them
        const existingParticipant = participantsRef.current.find(p => p.id === data.participantId);
        if (!existingParticipant) {
          console.log('🎯 FALLBACK: Adding participant to list from participant-ready event');
          const newParticipant = {
            id: data.participantId,
            name: data.participantName || 'Guest',
            isHost: false,
            isApproved: true,
            audioEnabled: true,  // Default to enabled
            videoEnabled: true   // Default to enabled
          };
          participantsRef.current = [...participantsRef.current, newParticipant];
          setParticipants(prev => [...prev, newParticipant]);
          console.log('🎯 FALLBACK: Updated participants list:', participantsRef.current);
        }
        
        // Ensure we have local stream before creating connection
        if (!localStream) {
          console.log('🎯 UltraSimplePeer: No local stream, initializing media first...');
          await initializeMedia();
        }
        
        // Use the centralized function to create connections to all participants
        console.log('🎯 MULTI-PARTICIPANT: Using centralized function to create connections to all participants');
        console.log('🎯 MULTI-PARTICIPANT: About to call createConnectionsToAllParticipants in 1000ms');
        setTimeout(() => {
          console.log('🎯 MULTI-PARTICIPANT: Calling createConnectionsToAllParticipants now');
          createConnectionsToAllParticipants();
        }, 1000);
      } else {
        console.log('🎯 UltraSimplePeer: Skipping self-connection for participant:', data.participantId);
      }
    });

    // Handle WebRTC signals
    newSocket.on('signal', (data) => {
      console.log('📡 UltraSimplePeer: Received signal from:', data.from);
      handleSignal(data);
    });

    // Handle force connection requests
    newSocket.on('force-connection', async (data) => {
      console.log('🔗 FORCE: Received force connection request:', data);
      const { targetId, fromId } = data;
      
      if (targetId === newSocket.id) {
        console.log('🔗 FORCE: This is for me, creating connection to:', fromId);
        
        // Ensure we have local stream
        if (!localStream) {
          console.log('🔗 FORCE: No local stream, initializing media first...');
          await initializeMedia();
        }
        
        // Wait a bit for media to be ready
        setTimeout(async () => {
          await createPeerConnection(fromId, localStream);
        }, 500);
      }
    });

    // Handle participant removal
    newSocket.on('participant-removed', (data) => {
      console.log('🗑️ UltraSimplePeer: You have been removed from the meeting:', data);
      
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
          🚫 Removed from Meeting
        </div>
        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 16px;">
          You have been removed from the meeting by <strong>${data.hostName}</strong>
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
      console.log('👋 UltraSimplePeer: Participant left event received:', data);
      console.log('👋 UltraSimplePeer: DEBUG - Event data:', {
        participantId: data.participantId,
        participantName: data.participantName,
        reason: data.reason,
        timestamp: new Date().toISOString()
      });
      console.log('👋 UltraSimplePeer: DEBUG - Current participants before removal:', participantsRef.current.map(p => ({ id: p.id, name: p.name })));
      console.log('👋 UltraSimplePeer: DEBUG - Socket ID:', newSocket.id);
      console.log('👋 UltraSimplePeer: DEBUG - Is this socket the one being removed?', newSocket.id === data.participantId);
      
      // Don't process removal for the participant being removed (they should receive participant-removed instead)
      if (newSocket.id === data.participantId) {
        console.log('👋 UltraSimplePeer: Skipping participant-left processing for self-removal');
        return;
      }
      
      if (data.reason === 'removed by host') {
        console.log(`🗑️ UltraSimplePeer: ${data.participantName} was removed by host`);
      } else {
        console.log(`👋 UltraSimplePeer: ${data.participantName || data.userName} left voluntarily`);
      }
      
      // Remove participant from local state (this will cause the video panel to disappear completely)
      setParticipants(prev => {
        console.log('👋 UltraSimplePeer: Before removal, participants:', prev.map(p => ({ id: p.id, name: p.name })));
        const updated = prev.filter(p => p.id !== data.participantId);
        console.log(`🗑️ UltraSimplePeer: After removal, participants:`, updated.map(p => ({ id: p.id, name: p.name })));
        console.log(`🗑️ UltraSimplePeer: Removed participant ${data.participantId}, remaining participants:`, updated.length);
        
        // Force a re-render to ensure UI updates
        setTimeout(() => {
          console.log(`🔄 UltraSimplePeer: Force re-render after participant removal`);
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
              console.log(`🗑️ UltraSimplePeer: Stopping peer track: ${track.kind} for participant: ${data.participantId}`);
              track.stop();
            });
          });
        }
        
        // Destroy the peer connection with error handling
        try {
          peer.destroy();
          console.log(`🗑️ UltraSimplePeer: Successfully destroyed peer connection for ${data.participantId}`);
        } catch (error) {
          console.log(`⚠️ UltraSimplePeer: Error destroying peer connection for ${data.participantId}:`, error.message);
          // This is expected for user-initiated aborts during removal
        }
        delete peersRef.current[data.participantId];
      }
      
      // Clean up remote streams (video streams)
      setRemoteStreams(prev => {
        const updated = { ...prev };
        if (updated[data.participantId]) {
          console.log(`🗑️ UltraSimplePeer: Removing video stream for ${data.participantId}`);
          // Stop all tracks in the stream
          if (updated[data.participantId].getTracks) {
            updated[data.participantId].getTracks().forEach(track => {
              track.stop();
              console.log(`🗑️ UltraSimplePeer: Stopped video track for ${data.participantId}`);
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
          console.log(`🗑️ UltraSimplePeer: Removing screen stream for ${data.participantId}`);
          // Stop all tracks in the screen stream
          if (updated[data.participantId].getTracks) {
            updated[data.participantId].getTracks().forEach(track => {
              track.stop();
              console.log(`🗑️ UltraSimplePeer: Stopped screen track for ${data.participantId}`);
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
          console.log(`🔄 UltraSimplePeer: Force re-render - current participants:`, prev.length);
          return [...prev]; // Force re-render
        });
        setRemoteStreams(prev => {
          console.log(`🔄 UltraSimplePeer: Force re-render - current streams:`, Object.keys(prev).length);
          return { ...prev }; // Force re-render
        });
        setRemoteScreenStreams(prev => {
          console.log(`🔄 UltraSimplePeer: Force re-render - current screen streams:`, Object.keys(prev).length);
          return { ...prev }; // Force re-render
        });
      }, 100);
      
      // Additional cleanup after a longer delay to ensure complete removal
      setTimeout(() => {
        console.log(`🧹 UltraSimplePeer: Final cleanup check for participant ${data.participantId}`);
        setParticipants(prev => {
          const filtered = prev.filter(p => p.id !== data.participantId);
          if (filtered.length !== prev.length) {
            console.log(`🧹 UltraSimplePeer: Final cleanup - removed participant ${data.participantId}`);
          }
          return filtered;
        });
        setRemoteStreams(prev => {
          const updated = { ...prev };
          if (updated[data.participantId]) {
            console.log(`🧹 UltraSimplePeer: Final cleanup - removing stream for ${data.participantId}`);
            delete updated[data.participantId];
          }
          return updated;
        });
        setRemoteScreenStreams(prev => {
          const updated = { ...prev };
          if (updated[data.participantId]) {
            console.log(`🧹 UltraSimplePeer: Final cleanup - removing screen stream for ${data.participantId}`);
            delete updated[data.participantId];
          }
          return updated;
        });
      }, 500);
      
      console.log(`✅ UltraSimplePeer: Complete cleanup done for participant ${data.participantId}`);
      console.log(`📊 UltraSimplePeer: Remaining participants: ${participantsRef.current.length}`);
      console.log(`📊 UltraSimplePeer: Remaining peer connections: ${Object.keys(peersRef.current).length}`);
    });

    // Add a catch-all event listener for debugging
    newSocket.onAny((eventName, ...args) => {
      console.log('🔍 UltraSimplePeer: Received event:', eventName, args);
      if (eventName === 'participant-joined' || eventName === 'participant-ready' || eventName === 'participant-left' || eventName === 'participant-media-state-changed') {
        console.log('🎯 CRITICAL EVENT RECEIVED:', eventName, 'Data:', args[0]);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [meetingId, userName]);

  // Initialize media
  const initializeMedia = useCallback(async () => {
    try {
      console.log('🎥 UltraSimplePeer: Starting media initialization...');
      
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported. Please use a modern browser with HTTPS.');
      }
      
      // Detect network conditions for optimal quality
      const isMobileHotspot = window.location.hostname.includes('192.168.43') || 
                             window.location.hostname.includes('10.') ||
                             navigator.connection?.effectiveType === 'slow-2g' ||
                             navigator.connection?.effectiveType === '2g' ||
                             navigator.connection?.effectiveType === '3g';
      
      // Optimize for multiple participants
      const isSlowConnection = navigator.connection?.effectiveType === 'slow-2g' || 
                              navigator.connection?.effectiveType === '2g' ||
                              navigator.connection?.downlink < 1; // Less than 1 Mbps
      
      console.log('📱 Network conditions:', {
        isMobileHotspot,
        isSlowConnection,
        effectiveType: navigator.connection?.effectiveType,
        downlink: navigator.connection?.downlink
      });
      
      // Adaptive quality based on network conditions
      const videoConstraints = {
        width: isMobileHotspot || isSlowConnection ? 640 : 960, // Reduced from 1280
        height: isMobileHotspot || isSlowConnection ? 480 : 540, // Reduced from 720
        frameRate: isMobileHotspot || isSlowConnection ? 15 : 24, // Reduced from 30
        facingMode: 'user'
      };
      
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: isMobileHotspot || isSlowConnection ? 16000 : 48000,
        channelCount: 1,
        latency: 0.01,
        volume: 0.8, // Reduced volume to prevent echo
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        googTypingNoiseDetection: true,
        googAudioMirroring: false, // Prevent audio feedback
        googDAEchoCancellation: true, // Advanced echo cancellation
        googNoiseReduction: true, // Advanced noise reduction
        googAudioMirroring: false, // Disable audio mirroring
        googEchoCancellation2: true, // Additional echo cancellation
        googAutoGainControl2: true, // Additional AGC
        googNoiseSuppression2: true, // Additional noise suppression
        googHighpassFilter2: true, // Additional high-pass filter
        googTypingNoiseDetection2: true, // Additional typing noise detection
        googAudioMirroring2: false, // Additional audio mirroring prevention
        googDAEchoCancellation2: true, // Additional advanced echo cancellation
        googNoiseReduction2: true, // Additional advanced noise reduction
        googEchoCancellation3: true, // Triple echo cancellation
        googAutoGainControl3: true, // Triple AGC
        googNoiseSuppression3: true, // Triple noise suppression
        googHighpassFilter3: true, // Triple high-pass filter
        googTypingNoiseDetection3: true, // Triple typing noise detection
        googAudioMirroring3: false, // Triple audio mirroring prevention
        googDAEchoCancellation3: true, // Triple advanced echo cancellation
        googNoiseReduction3: true // Triple advanced noise reduction
      };
      
      console.log('🎥 Using optimized constraints:', { videoConstraints, audioConstraints });
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
      } catch (constraintError) {
        console.warn('⚠️ Enhanced constraints failed, trying basic constraints:', constraintError);
        // Fallback to basic constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }
      
      console.log('🎥 UltraSimplePeer: Media stream obtained:', {
        streamId: stream.id,
        trackCount: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });
      
      // Ensure audio tracks are properly configured with enhanced settings
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => {
        console.log('🎤 UltraSimplePeer: Local audio track configured:', {
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          constraints: track.getConstraints?.()
        });
        
        // Ensure audio track is enabled and not muted
        if (track.readyState === 'live') {
          track.enabled = true;
          
          // Apply enhanced audio constraints for better quality
          const enhancedAudioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: isMobileHotspot || isSlowConnection ? 16000 : 48000,
            channelCount: 1,
            latency: 0.01,
            volume: 1.0,
            googEchoCancellation: true,
            googAutoGainControl: true,
            googNoiseSuppression: true,
            googHighpassFilter: true,
            googTypingNoiseDetection: true,
            googAudioMirroring: false,
            googDAEchoCancellation: true,
            googNoiseReduction: true
          };
          
          try {
            track.applyConstraints(enhancedAudioConstraints).then(() => {
              console.log('🎤 UltraSimplePeer: Enhanced audio constraints applied to local track');
            }).catch(error => {
              console.log('🎤 UltraSimplePeer: Could not apply enhanced audio constraints:', error);
              
              // Fallback to basic constraints
              const basicConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              };
              
              track.applyConstraints(basicConstraints).then(() => {
                console.log('🎤 UltraSimplePeer: Basic audio constraints applied as fallback');
              }).catch(fallbackError => {
                console.log('🎤 UltraSimplePeer: Could not apply basic audio constraints:', fallbackError);
              });
            });
          } catch (error) {
            console.log('🎤 UltraSimplePeer: Error applying audio constraints:', error);
          }
          
          // Note: muted property is read-only in newer browsers
          // The track will be unmuted by default when enabled
        }
      });
      
      setLocalStream(stream);
      console.log('🎥 UltraSimplePeer: Local stream set in state:', stream);
      
      // Wait for video element to be ready, then set the stream
      const setStreamOnVideoElement = () => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('🎥 UltraSimplePeer: Local video stream set on video element');
          return true;
        }
        return false;
      };
      
      // Try immediately
      if (!setStreamOnVideoElement()) {
        // If video element not ready, wait and try again
        console.log('🎥 UltraSimplePeer: Video element not ready, waiting...');
        const checkVideoElement = () => {
          if (setStreamOnVideoElement()) {
            console.log('🎥 UltraSimplePeer: Video element ready, stream set successfully');
          } else {
            console.log('🎥 UltraSimplePeer: Video element still not ready, retrying...');
            setTimeout(checkVideoElement, 100);
          }
        };
        setTimeout(checkVideoElement, 100);
      }
      
      return stream;
    } catch (error) {
      console.error('❌ UltraSimplePeer: Failed to get media:', error);
      
      // Handle specific camera access errors
      if (error.name === 'NotAllowedError') {
        console.error('🚫 Camera access denied by user');
        alert('Camera access denied. Please allow camera access and refresh the page.');
      } else if (error.name === 'NotFoundError') {
        console.error('📹 No camera found');
        alert('No camera found. Please connect a camera and refresh the page.');
      } else if (error.name === 'NotReadableError') {
        console.error('📹 Camera already in use by another application');
        console.log('💡 Tip: For testing multiple participants, use different devices or close other camera applications');
        alert('Camera is already in use by another browser or application.\n\nFor testing multiple participants:\n• Use different devices (laptop + phone)\n• Close other camera applications\n• Close other browser tabs using the camera');
      } else if (error.name === 'OverconstrainedError') {
        console.error('📹 Camera constraints not supported');
        alert('Camera does not support the required settings. Please try with a different camera or refresh the page.');
      } else if (error.message.includes('MediaDevices API not supported')) {
        console.error('📹 MediaDevices API not supported');
        alert('Your browser does not support camera access.\n\nPlease try:\n• Using a modern browser (Chrome, Firefox, Edge)\n• Accessing via HTTPS (https://)\n• Enabling camera permissions in browser settings');
      } else {
        console.error('📹 Unknown camera error:', error.message);
        alert(`Camera error: ${error.message}\n\nPlease try:\n• Refreshing the page\n• Allowing camera permissions\n• Using a different browser\n• Checking if camera is connected`);
      }
      
      return null;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(async (participantId, stream = localStream) => {
    if (peersRef.current[participantId]) {
      console.log('🔗 UltraSimplePeer: Peer connection already exists for:', participantId);
      return;
    }

    console.log('🔗 UltraSimplePeer: Creating peer connection for:', participantId);
    console.log('🔗 UltraSimplePeer: Current user is host:', isHostRef.current);
    console.log('🔗 UltraSimplePeer: Current user socket ID:', socketRef.current?.id);
    console.log('🔗 UltraSimplePeer: Target participant ID:', participantId);
    console.log('🔗 UltraSimplePeer: Stream provided:', stream);
    console.log('🔗 UltraSimplePeer: Stream active:', stream?.active);
    console.log('🔗 UltraSimplePeer: Stream tracks:', stream?.getTracks()?.length);
    
    // Host should be initiator when connecting to participants
    // In a mesh network, we need to ensure only one side initiates
    // Use socket ID comparison to determine initiator consistently
    // The side with the LOWER socket ID should be the initiator
    const shouldBeInitiator = socketRef.current?.id && participantId && socketRef.current.id < participantId;
    
    console.log('🔗 UltraSimplePeer: Creating peer as initiator:', shouldBeInitiator);
    console.log('🔗 UltraSimplePeer: Socket ID comparison:', {
      mySocketId: socketRef.current?.id,
      targetSocketId: participantId,
      myIdSmaller: socketRef.current?.id < participantId,
      shouldBeInitiator: shouldBeInitiator
    });
    
    // Performance optimization: reduce video quality for large groups
    const totalParticipants = participantsRef.current.length;
    const isLargeGroup = totalParticipants > 2; // Reduced threshold for better performance
    
    // Enhanced WebRTC configuration for stability and performance
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
        // Optimize SDP for better performance
        return sdp
          .replace(/a=fmtp:111 minptime=10;useinbandfec=1/g, 'a=fmtp:111 minptime=10;useinbandfec=1;stereo=0')
          .replace(/a=fmtp:126 minptime=10;useinbandfec=1/g, 'a=fmtp:126 minptime=10;useinbandfec=1;stereo=0');
      }
    };
    
    // Add video quality constraints for large groups
    if (isLargeGroup && stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const constraints = {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 10, max: 15 }
        };
        
        try {
          await videoTrack.applyConstraints(constraints);
          console.log('🔗 UltraSimplePeer: Applied performance constraints for large group');
        } catch (error) {
          console.log('🔗 UltraSimplePeer: Could not apply constraints:', error);
        }
      }
      
      // Also reduce audio quality for better performance
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioConstraints = {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        };
        
        try {
          await audioTrack.applyConstraints(audioConstraints);
          console.log('🔗 UltraSimplePeer: Applied audio constraints for large group');
        } catch (error) {
          console.log('🔗 UltraSimplePeer: Could not apply audio constraints:', error);
        }
      }
    }
    
    const peer = new SimplePeer(peerConfig);

    // Ensure stream is added to the peer connection using modern WebRTC API
    if (stream && stream.active) {
      const streamKey = `${participantId}-${stream.id}`;
      if (!addedStreamsRef.current.has(streamKey)) {
        console.log('🔗 UltraSimplePeer: Adding stream to peer connection using modern API');
        console.log('🔗 UltraSimplePeer: Stream details for sharing:', {
          streamId: stream.id,
          streamActive: stream.active,
          trackCount: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length,
          participantId: participantId
        });
        try {
          // Use modern WebRTC API instead of deprecated addStream
          stream.getTracks().forEach(track => {
            console.log(`🔗 UltraSimplePeer: Adding ${track.kind} track to peer connection for ${participantId}`);
            peer.addTrack(track, stream);
          });
          addedStreamsRef.current.add(streamKey);
          console.log('🔗 UltraSimplePeer: Stream added successfully to peer connection for', participantId);
        } catch (error) {
          console.log('🔗 UltraSimplePeer: Stream already added to peer connection:', error.message);
        }
      } else {
        console.log('🔗 UltraSimplePeer: Stream already added to this peer connection');
      }
    } else {
      console.log('🔗 UltraSimplePeer: No active stream to add to peer connection');
      console.log('🔗 UltraSimplePeer: Stream status:', {
        hasStream: !!stream,
        streamActive: stream?.active,
        participantId: participantId
      });
    }

    peer.on('signal', (data) => {
      console.log('📡 UltraSimplePeer: Sending signal to:', participantId);
      socketRef.current.emit('signal', {
        to: participantId,
        from: socketRef.current.id,
        signal: data
      });
    });

    peer.on('stream', (stream) => {
      console.log('🎥 UltraSimplePeer: Received stream from:', participantId);
      console.log('🎥 UltraSimplePeer: Stream details:', {
        streamId: stream.id,
        trackCount: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        streamActive: stream.active,
        streamEnded: stream.ended
      });
      
      // Check if this is the host's stream
      const isHostStream = participantsRef.current.find(p => p.id === participantId)?.isHost;
      if (isHostStream) {
        console.log('🎥 UltraSimplePeer: Received HOST stream from:', participantId);
        console.log('🎥 UltraSimplePeer: Host stream details:', {
          streamId: stream.id,
          streamActive: stream.active,
          trackCount: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length
        });
      }
      
      // Additional debugging for stream issues
      if (stream.getTracks().length === 0) {
        console.error('❌ UltraSimplePeer: Stream has no tracks!');
      }
      if (!stream.active) {
        console.error('❌ UltraSimplePeer: Stream is not active!');
      }
      
      // Force stream processing
      console.log('🔧 UltraSimplePeer: Force processing received stream');
      stream.getTracks().forEach(track => {
        console.log('🔧 UltraSimplePeer: Track details:', {
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted
        });
      });
      
      // Additional debugging for consent stream issues
      console.log('🔧 UltraSimplePeer: Checking if this is a consent stream update');
      console.log('🔧 UltraSimplePeer: Stream ID:', stream.id);
      console.log('🔧 UltraSimplePeer: Stream active:', stream.active);
      console.log('🔧 UltraSimplePeer: Video tracks:', stream.getVideoTracks().length);
      console.log('🔧 UltraSimplePeer: Audio tracks:', stream.getAudioTracks().length);
      
      // Always update the stream (in case of reconnection or stream refresh)
      setRemoteStreams(prev => {
        console.log('🎥 UltraSimplePeer: Updating stream for participant:', participantId);
        
        // Force the stream to be active and ensure tracks are enabled
        if (stream && stream.getTracks) {
          stream.getTracks().forEach(track => {
            console.log('🎥 UltraSimplePeer: Track details:', {
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
                console.log('🎤 UltraSimplePeer: Ensuring audio track is properly configured');
                
                // Apply enhanced audio constraints for better quality and stability
                const isMobileHotspot = window.location.hostname.includes('192.168.43') || 
                                       window.location.hostname.includes('10.');
                
                const audioConstraints = {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                  sampleRate: isMobileHotspot ? 16000 : 48000, // Increased quality
                  channelCount: 1,
                  latency: 0.01,
                  volume: 1.0,
                  googEchoCancellation: true,
                  googAutoGainControl: true,
                  googNoiseSuppression: true,
                  googHighpassFilter: true,
                  googTypingNoiseDetection: true,
                  googAudioMirroring: false,
                  googDAEchoCancellation: true,
                  googNoiseReduction: true
                };
                
                try {
                  track.applyConstraints(audioConstraints).then(() => {
                    console.log('🎤 UltraSimplePeer: Enhanced audio constraints applied successfully');
                    
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
                      console.log('🎤 UltraSimplePeer: Remote audio flow test:', hasAudio ? 'Audio detected' : 'No audio detected');
                      
                      // Clean up
                      source.disconnect();
                      audioContext.close();
                    } catch (audioTestError) {
                      console.log('🎤 UltraSimplePeer: Audio test failed:', audioTestError);
                    }
                  }).catch(error => {
                    console.log('🎤 UltraSimplePeer: Could not apply enhanced audio constraints:', error);
                    
                    // Fallback to basic constraints
                    const basicConstraints = {
                      echoCancellation: true,
                      noiseSuppression: true,
                      autoGainControl: true
                    };
                    
                    track.applyConstraints(basicConstraints).then(() => {
                      console.log('🎤 UltraSimplePeer: Basic audio constraints applied as fallback');
                    }).catch(fallbackError => {
                      console.log('🎤 UltraSimplePeer: Could not apply basic audio constraints:', fallbackError);
                    });
                  });
                } catch (error) {
                  console.log('🎤 UltraSimplePeer: Error applying audio constraints:', error);
                }
              }
            }
          });
        }
        
        // Only update if stream is actually active
        if (stream && stream.active) {
          const newStreams = {
            ...prev,
            [participantId]: stream
          };
          console.log('🎥 UltraSimplePeer: Updated remote streams:', Object.keys(newStreams));
          console.log('🎥 UltraSimplePeer: All remote streams now:', newStreams);
          return newStreams;
        } else {
          console.log('🎥 UltraSimplePeer: Stream not active, keeping existing stream');
          return prev;
        }
      });
    });

    peer.on('connect', () => {
      console.log('✅ UltraSimplePeer: Connected to:', participantId);
      
      // Ensure stream is added after connection is established
      if (stream && stream.active) {
        const streamKey = `${participantId}-${stream.id}`;
        if (!addedStreamsRef.current.has(streamKey)) {
          console.log('🔗 UltraSimplePeer: Adding stream after connection established');
          try {
            // Use modern WebRTC API instead of deprecated addStream
            stream.getTracks().forEach(track => {
              console.log(`🔗 UltraSimplePeer: Adding ${track.kind} track after connection established`);
              peer.addTrack(track, stream);
            });
            addedStreamsRef.current.add(streamKey);
            console.log('🔗 UltraSimplePeer: Stream added successfully after connection');
          } catch (error) {
            console.log('🔗 UltraSimplePeer: Stream already added after connection:', error.message);
          }
        } else {
          console.log('🔗 UltraSimplePeer: Stream already added to this peer connection');
        }
        
        // Ensure bidirectional stream sharing
        if (peer.getSenders && peer.addTrack) {
          console.log('🔗 UltraSimplePeer: Ensuring bidirectional stream sharing for:', participantId);
          try {
            // Check current senders
            const senders = peer.getSenders();
            const hasVideoTrack = senders.some(sender => sender.track && sender.track.kind === 'video');
            const hasAudioTrack = senders.some(sender => sender.track && sender.track.kind === 'audio');
            
            console.log('🔗 UltraSimplePeer: Current tracks - Video:', hasVideoTrack, 'Audio:', hasAudioTrack);
            
            // Force re-add all tracks to ensure bidirectional sharing
            console.log('🔗 UltraSimplePeer: Force re-adding all tracks for bidirectional sharing');
            stream.getTracks().forEach(track => {
              console.log('🔗 UltraSimplePeer: Force adding track:', track.kind, 'enabled:', track.enabled);
              try {
                peer.addTrack(track, stream);
                console.log('🔗 UltraSimplePeer: Successfully added track:', track.kind);
              } catch (error) {
                console.log('🔗 UltraSimplePeer: Track already added or error:', track.kind, error.message);
              }
            });
          } catch (error) {
            console.log('🔗 UltraSimplePeer: Error in bidirectional stream sharing:', error.message);
          }
        }
      } else {
        // Try to get stream from video element as fallback
        console.log('🔗 UltraSimplePeer: No stream passed, trying to get from video element');
        const videoElement = document.querySelector('video[data-local="true"]');
        if (videoElement && videoElement.srcObject) {
          const streamKey = `${participantId}-${videoElement.srcObject.id}`;
          if (!addedStreamsRef.current.has(streamKey)) {
            console.log('🔗 UltraSimplePeer: Found stream in video element, adding to peer');
            try {
              // Use modern WebRTC API instead of deprecated addStream
              videoElement.srcObject.getTracks().forEach(track => {
                console.log(`🔗 UltraSimplePeer: Adding ${track.kind} track from video element`);
                peer.addTrack(track, videoElement.srcObject);
              });
              addedStreamsRef.current.add(streamKey);
              console.log('🔗 UltraSimplePeer: Stream from video element added successfully');
            } catch (error) {
              console.log('🔗 UltraSimplePeer: Stream from video element already added:', error.message);
            }
          } else {
            console.log('🔗 UltraSimplePeer: Stream from video element already added to this peer');
          }
        } else {
          console.log('🔗 UltraSimplePeer: No stream found anywhere');
        }
      }
      
      // Force a connection check
      setTimeout(() => {
        if (peer._pc) {
          console.log('🔍 CONNECTION CHECK: Connection state:', peer._pc.connectionState);
          console.log('🔍 CONNECTION CHECK: ICE connection state:', peer._pc.iceConnectionState);
        }
      }, 1000);
      
      // Start enhanced connection monitoring for stability
      startConnectionMonitoring(participantId, peer);
    });

    peer.on('close', () => {
      console.log('🔌 UltraSimplePeer: Connection closed to:', participantId);
      
      // Clean up monitoring interval
      if (peer._monitorInterval) {
        clearInterval(peer._monitorInterval);
        delete peer._monitorInterval;
      }
      
      delete peersRef.current[participantId];
      
      // Clean up added streams tracking for this participant
      const streamKeysToRemove = Array.from(addedStreamsRef.current).filter(key => key.startsWith(`${participantId}-`));
      streamKeysToRemove.forEach(key => addedStreamsRef.current.delete(key));
      console.log('🔌 UltraSimplePeer: Cleaned up stream tracking for:', participantId);
    });

    peer.on('error', (error) => {
      console.error('❌ UltraSimplePeer: Peer error:', error);
    });

    peersRef.current[participantId] = peer;
  }, [localStream]);

  // Enhanced connection monitoring for stability
  const startConnectionMonitoring = useCallback((participantId, peer) => {
    console.log(`🔍 CONNECTION MONITOR: Starting enhanced monitoring for ${participantId}`);
    
    // Light monitoring for connection health without interfering with streams
    const monitorInterval = setInterval(() => {
      if (!peersRef.current[participantId]) {
        clearInterval(monitorInterval);
        return;
      }
      
      const currentPeer = peersRef.current[participantId];
      if (currentPeer && currentPeer._pc) {
        const connectionState = currentPeer._pc.connectionState;
        const iceConnectionState = currentPeer._pc.iceConnectionState;
        
        // Only log if there are issues, don't interfere with working connections
        if (connectionState === 'failed' || iceConnectionState === 'failed') {
          console.log(`🔍 CONNECTION MONITOR: ${participantId} connection failed, attempting gentle recovery`);
          
          // Gentle recovery - only if connection is truly failed
          setTimeout(() => {
            if (peersRef.current[participantId] && 
                peersRef.current[participantId]._pc &&
                peersRef.current[participantId]._pc.connectionState === 'failed') {
              console.log(`🔄 CONNECTION MONITOR: Reconnecting to ${participantId}`);
              // Clean restart of the connection
              const failedPeer = peersRef.current[participantId];
              failedPeer.destroy();
              delete peersRef.current[participantId];
              
              // Recreate connection after a delay
              setTimeout(() => {
                if (localStream) {
                  createPeerConnection(participantId, localStream);
                }
              }, 2000);
            }
          }, 5000);
        }
      }
    }, 30000); // Check every 30 seconds - less aggressive
    
    // Store interval for cleanup
    peer._monitorInterval = monitorInterval;
  }, [localStream, createPeerConnection]);

  // Function to prevent duplicate connections
  const isConnectionActive = useCallback((participantId) => {
    const peer = peersRef.current[participantId];
    if (!peer) return false;
    
    // Check if peer is connected and has active connection
    if (peer.connected && peer._pc) {
      const connectionState = peer._pc.connectionState;
      const iceConnectionState = peer._pc.iceConnectionState;
      
      // More lenient connection check - allow various active states
      const isConnectionGood = connectionState === 'connected' || connectionState === 'connecting';
      const isIceGood = iceConnectionState === 'connected' || iceConnectionState === 'completed' || iceConnectionState === 'checking';
      
      console.log(`🔍 Connection check for ${participantId}:`, {
        connectionState,
        iceConnectionState,
        isConnectionGood,
        isIceGood,
        result: isConnectionGood && isIceGood
      });
      
      return isConnectionGood && isIceGood;
    }
    
    return false;
  }, []);

  // Function to create connections to all existing participants
  const createConnectionsToAllParticipants = useCallback(async () => {
    console.log('🔗 CREATE-ALL: ===== STARTING CREATE-ALL FUNCTION =====');
    console.log('🔗 CREATE-ALL: Current participants:', participantsRef.current);
    console.log('🔗 CREATE-ALL: Current user socket ID:', socketRef.current?.id);
    console.log('🔗 CREATE-ALL: Current user is host:', isHostRef.current);
    
    // Ensure we have local stream
    if (!localStream) {
      console.log('🔗 CREATE-ALL: No local stream, initializing media first...');
      const newStream = await initializeMedia();
      console.log('🔗 CREATE-ALL: Stream initialization result:', newStream);
      if (!newStream) {
        console.log('🔗 CREATE-ALL: Failed to initialize stream, aborting connections');
        return;
      }
    }
    
    console.log('🔗 CREATE-ALL: Local stream status:', {
      hasStream: !!localStream,
      streamActive: localStream?.active,
      trackCount: localStream?.getTracks()?.length,
      videoTracks: localStream?.getVideoTracks()?.length,
      audioTracks: localStream?.getAudioTracks()?.length
    });
    
    // PERFORMANCE OPTIMIZATION: Use selective connection strategy
    const allParticipants = participantsRef.current.filter(participant => 
      participant.id !== socketRef.current?.id && participant.isApproved
    );
    
    // Performance threshold: optimize connection strategy based on participant count
    const PERFORMANCE_THRESHOLD = 6; // Increased for better multi-participant support
    const MAX_CONNECTIONS = 8; // Increased maximum connections for stability
    
    let participantsToConnect = [];
    
    if (isHostRef.current) {
      // HOST: Connect to all participants (act as relay)
      participantsToConnect = allParticipants.filter(participant => 
        peersRef.current[participant.id] === undefined
      );
      console.log('🔗 CREATE-ALL: HOST MODE - Connecting to all participants:', participantsToConnect.length);
      console.log('🔗 CREATE-ALL: HOST MODE - Host stream details:', {
        hasStream: !!localStream,
        streamActive: localStream?.active,
        trackCount: localStream?.getTracks()?.length,
        videoTracks: localStream?.getVideoTracks()?.length,
        audioTracks: localStream?.getAudioTracks()?.length
      });
    } else {
      // PARTICIPANT: Connect primarily to host, optionally to other participants
      const host = allParticipants.find(p => p.isHost);
      const otherParticipants = allParticipants.filter(p => !p.isHost);
      
      console.log('🔗 CREATE-ALL: PARTICIPANT MODE - Looking for host:', {
        hostFound: !!host,
        hostId: host?.id,
        hostName: host?.name,
        isHostApproved: host?.isApproved
      });
      
      // Always connect to host first
      if (host && !peersRef.current[host.id]) {
        participantsToConnect.push(host);
        console.log('🔗 CREATE-ALL: PARTICIPANT MODE - Will connect to host:', host.name);
      }
      
      // Connect to other participants with improved strategy for multiple browsers
      if (allParticipants.length <= PERFORMANCE_THRESHOLD) {
        // For small groups (up to 6 participants), connect to everyone
        const otherParticipantsToConnect = otherParticipants.filter(p => 
          !peersRef.current[p.id]
        );
        participantsToConnect.push(...otherParticipantsToConnect);
        console.log('🔗 CREATE-ALL: PARTICIPANT MODE - Small group, connecting to all:', participantsToConnect.length);
      } else {
        // For larger groups, prioritize host + recent participants
        const additionalParticipants = otherParticipants
          .filter(p => !peersRef.current[p.id])
          .slice(0, 4); // Increased to 4 additional participants
        participantsToConnect.push(...additionalParticipants);
        console.log('🔗 CREATE-ALL: PARTICIPANT MODE - Large group, connecting to host + 4 others:', participantsToConnect.length);
      }
    }
    
    // Filter out already connected participants, but allow reconnection for failed streams
    participantsToConnect = participantsToConnect.filter(participant => {
      const alreadyConnected = isConnectionActive(participant.id);
      const hasPeer = peersRef.current[participant.id];
      
      console.log(`🔗 CREATE-ALL: Participant ${participant.name} (${participant.id}): shouldConnect=true, isApproved=${participant.isApproved}, isSelf=${participant.id === socketRef.current?.id}, alreadyConnected=${alreadyConnected}, hasPeer=${!!hasPeer}`);
      
      // For small groups (3-4 participants), be more aggressive about connections
      const isSmallGroup = allParticipants.length <= 4;
      
      if (alreadyConnected && !isSmallGroup) {
        console.log(`🔗 CREATE-ALL: Skipping ${participant.name} - already connected`);
        return false;
      }
      
      // If peer exists but connection is not active, allow reconnection
      if (hasPeer && !alreadyConnected) {
        console.log(`🔗 CREATE-ALL: Reconnecting to ${participant.name} - connection failed`);
        // Clean up the failed peer
        try {
          hasPeer.destroy();
        } catch (error) {
          console.log(`🔗 CREATE-ALL: Error destroying failed peer for ${participant.name}:`, error);
        }
        delete peersRef.current[participant.id];
        return true;
      }
      
      // For small groups, always try to connect even if peer exists
      if (isSmallGroup && hasPeer && alreadyConnected) {
        console.log(`🔗 CREATE-ALL: Small group - ensuring connection to ${participant.name}`);
        return true;
      }
      
      return true;
    });
    
    console.log('🔗 CREATE-ALL: Participants to connect to:', participantsToConnect.length);
    console.log('🔗 CREATE-ALL: Participants to connect to details:', participantsToConnect.map(p => ({ id: p.id, name: p.name, isApproved: p.isApproved })));
    
    if (participantsToConnect.length === 0) {
      console.log('🔗 CREATE-ALL: No participants to connect to, exiting');
      console.log('🔗 CREATE-ALL: Existing peer connections:', Object.keys(peersRef.current));
      console.log('🔗 CREATE-ALL: Checking existing peer connection states...');
      
      // Check the state of existing peer connections
      Object.entries(peersRef.current).forEach(([participantId, peer]) => {
        console.log(`🔗 CREATE-ALL: Peer ${participantId} state:`, {
          connected: peer.connected,
          destroyed: peer.destroyed,
          readyState: peer._pc ? peer._pc.connectionState : 'no _pc',
          hasStream: peer._pc && peer._pc.getSenders ? peer._pc.getSenders().length : 'no _pc',
          hasReceivers: peer._pc && peer._pc.getReceivers ? peer._pc.getReceivers().length : 'no _pc'
        });
        
        // If peer is not connected, try to understand why
        if (!peer.connected && peer._pc) {
          console.log(`🔗 CREATE-ALL: Peer ${participantId} not connected - checking connection state:`, {
            connectionState: peer._pc.connectionState,
            iceConnectionState: peer._pc.iceConnectionState,
            iceGatheringState: peer._pc.iceGatheringState,
            signalingState: peer._pc.signalingState
          });
        }
      });
      
      // Try to retry connections for peers that are not connected (less aggressive)
      const disconnectedPeers = Object.entries(peersRef.current).filter(([participantId, peer]) => 
        !peer.connected && !peer.destroyed && peer._pc && 
        peer._pc.connectionState === 'failed' && peer._pc.iceConnectionState === 'failed'
      );
      
      if (disconnectedPeers.length > 0) {
        console.log(`🔗 CREATE-ALL: Found ${disconnectedPeers.length} truly failed peers, attempting to retry connections...`);
        disconnectedPeers.forEach(([participantId, peer]) => {
          console.log(`🔗 CREATE-ALL: Retrying connection to ${participantId}...`);
          // Force a new connection attempt with longer delay
          setTimeout(async () => {
            if (peersRef.current[participantId] && !isConnectionActive(participantId)) {
              console.log(`🔗 CREATE-ALL: Creating new connection to ${participantId} (retry)`);
              // Clean up the failed connection first
              peersRef.current[participantId].destroy();
              delete peersRef.current[participantId];
              await createPeerConnection(participantId, localStream);
            }
          }, 5000); // Increased delay to 5 seconds
        });
      }
      
      return;
    }
    
    // Create connections to all other participants
    participantsToConnect.forEach((participant, index) => {
      console.log(`🔗 CREATE-ALL: [${index + 1}/${participantsToConnect.length}] Creating connection to participant:`, participant.id);
      
      setTimeout(async () => {
        // Try multiple methods to get the stream
        let currentStream = null;
        let streamSource = 'none';
        
        // Method 1: Try to get stream from video element with data-local attribute
        const videoElement = document.querySelector('video[data-local="true"]');
        if (videoElement && videoElement.srcObject) {
          currentStream = videoElement.srcObject;
          streamSource = 'video element (data-local)';
          console.log('🔗 CREATE-ALL: Found stream in video element (data-local):', currentStream);
        } else {
          // Method 2: Try to get stream from any video element that has a stream
          const allVideos = document.querySelectorAll('video');
          for (const video of allVideos) {
            if (video.srcObject && video.srcObject.active) {
              currentStream = video.srcObject;
              streamSource = 'any video element';
              console.log('🔗 CREATE-ALL: Found stream in any video element:', currentStream);
              break;
            }
          }
        }
        
        // Method 3: Fallback to state variable
        if (!currentStream) {
          currentStream = localStream;
          streamSource = 'state variable';
          console.log('🔗 CREATE-ALL: Using stream from state:', currentStream);
        }
        
        console.log('🔗 CREATE-ALL: About to create peer connection with stream:', currentStream);
        console.log('🔗 CREATE-ALL: Stream source:', streamSource);
        console.log('🔗 CREATE-ALL: Stream active:', currentStream?.active);
        console.log('🔗 CREATE-ALL: Stream tracks:', currentStream?.getTracks()?.length);
        
        try {
          await createPeerConnection(participant.id, currentStream);
          console.log(`✅ CREATE-ALL: Successfully connected to ${participant.name}`);
        } catch (error) {
          console.error(`❌ CREATE-ALL: Failed to connect to ${participant.name}:`, error);
          // Retry connection after delay
          setTimeout(async () => {
            try {
              await createPeerConnection(participant.id, currentStream);
              console.log(`✅ CREATE-ALL: Retry successful for ${participant.name}`);
            } catch (retryError) {
              console.error(`❌ CREATE-ALL: Retry failed for ${participant.name}:`, retryError);
            }
          }, allParticipants.length <= 4 ? 1500 : 3000); // Faster retry for small groups
        }
      }, 200 + (index * 150)); // Optimized stagger time for multi-device support
    });
    
    console.log('🔗 CREATE-ALL: ===== FINISHED CREATE-ALL FUNCTION =====');
  }, [localStream, initializeMedia, createPeerConnection]);

  // Connection health check to ensure all streams stay active
  useEffect(() => {
    const startHealthCheck = () => {
      if (connectionHealthCheckRef.current) {
        clearInterval(connectionHealthCheckRef.current);
      }
      
      connectionHealthCheckRef.current = setInterval(() => {
        const allParticipants = participantsRef.current.filter(p => 
          p.id !== socketRef.current?.id && p.isApproved
        );
        
        allParticipants.forEach(participant => {
          const isActive = isConnectionActive(participant.id);
          if (!isActive && peersRef.current[participant.id]) {
            console.log(`🔍 HEALTH CHECK: Connection to ${participant.name} is inactive, attempting reconnection`);
            // Trigger reconnection
            createConnectionsToAllParticipants();
          }
        });
      }, participantsRef.current.length <= 4 ? 5000 : 10000); // More frequent checks for small groups
    };

    // Start health check when we have participants
    if (participantsRef.current.length > 1) {
      startHealthCheck();
    }

    return () => {
      if (connectionHealthCheckRef.current) {
        clearInterval(connectionHealthCheckRef.current);
      }
    };
  }, [participantsRef.current.length, isConnectionActive, createConnectionsToAllParticipants]);

  // Handle incoming signals
  const handleSignal = useCallback((data) => {
    const { from, signal } = data;
    
    if (peersRef.current[from]) {
      console.log('📡 UltraSimplePeer: Applying signal to existing peer:', from);
      peersRef.current[from].signal(signal);
    } else {
      console.log('📡 UltraSimplePeer: Creating new peer for signal from:', from);
      
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
        console.log('📡 UltraSimplePeer: Sending signal to:', from);
        socketRef.current.emit('signal', {
          to: from,
          from: socketRef.current.id,
          signal: signalData
        });
      });

      peer.on('stream', (stream) => {
        console.log('🎥 UltraSimplePeer: Received stream from:', from);
        console.log('🎥 UltraSimplePeer: Stream details in handleSignal:', {
          streamId: stream.id,
          trackCount: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length,
          streamActive: stream.active,
          streamEnded: stream.ended
        });
        
        // CRITICAL: Force stream to be active if it's not
        if (!stream.active) {
          console.log('🔧 UltraSimplePeer: Stream not active in handleSignal, attempting to reactivate...');
          stream.getTracks().forEach(track => {
            if (track.readyState === 'live') {
              track.enabled = true;
              console.log(`🔧 UltraSimplePeer: Reactivated ${track.kind} track in handleSignal`);
            }
          });
        }
        
        // Force the stream to be active and ensure audio tracks are properly configured
        stream.getTracks().forEach(track => {
          console.log('🎥 UltraSimplePeer: Track details in handleSignal:', {
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
              console.log('🎤 UltraSimplePeer: Configuring audio track in handleSignal');
              
              // Apply enhanced audio constraints for better quality and stability
              const audioConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000, // Increased quality
                channelCount: 1,
                latency: 0.01,
                volume: 1.0,
                googEchoCancellation: true,
                googAutoGainControl: true,
                googNoiseSuppression: true,
                googHighpassFilter: true,
                googTypingNoiseDetection: true,
                googAudioMirroring: false,
                googDAEchoCancellation: true,
                googNoiseReduction: true
              };
              
              try {
                track.applyConstraints(audioConstraints).then(() => {
                  console.log('🎤 UltraSimplePeer: Enhanced audio constraints applied in handleSignal');
                  
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
                    console.log('🎤 UltraSimplePeer: HandleSignal audio flow test:', hasAudio ? 'Audio detected' : 'No audio detected');
                    
                    // Clean up
                    source.disconnect();
                    audioContext.close();
                  } catch (audioTestError) {
                    console.log('🎤 UltraSimplePeer: HandleSignal audio test failed:', audioTestError);
                  }
                }).catch(error => {
                  console.log('🎤 UltraSimplePeer: Could not apply enhanced audio constraints in handleSignal:', error);
                  
                  // Fallback to basic constraints
                  const basicConstraints = {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                  };
                  
                  track.applyConstraints(basicConstraints).then(() => {
                    console.log('🎤 UltraSimplePeer: Basic audio constraints applied as fallback in handleSignal');
                  }).catch(fallbackError => {
                    console.log('🎤 UltraSimplePeer: Could not apply basic audio constraints in handleSignal:', fallbackError);
                  });
                });
              } catch (error) {
                console.log('🎤 UltraSimplePeer: Error applying audio constraints in handleSignal:', error);
              }
            }
          }
        });
        
        setRemoteStreams(prev => {
          // Only update if stream is actually active
          if (stream && stream.active) {
            const newStreams = {
              ...prev,
              [from]: stream
            };
            console.log('🎥 UltraSimplePeer: Updated remote streams in handleSignal:', Object.keys(newStreams));
            return newStreams;
          } else {
            console.log('🎥 UltraSimplePeer: Stream not active in handleSignal, keeping existing stream');
            return prev;
          }
        });
      });

      peer.on('connect', () => {
        console.log('✅ UltraSimplePeer: Connected to:', from);
        
        // Ensure bidirectional stream sharing in handleSignal
        if (localStream && localStream.active && peer.getSenders && peer.addTrack) {
          console.log('🔗 UltraSimplePeer: Ensuring bidirectional stream sharing in handleSignal for:', from);
          try {
            // Check current senders
            const senders = peer.getSenders();
            const hasVideoTrack = senders.some(sender => sender.track && sender.track.kind === 'video');
            const hasAudioTrack = senders.some(sender => sender.track && sender.track.kind === 'audio');
            
            console.log('🔗 UltraSimplePeer: Current tracks in handleSignal - Video:', hasVideoTrack, 'Audio:', hasAudioTrack);
            
            // Force re-add all tracks to ensure bidirectional sharing
            console.log('🔗 UltraSimplePeer: Force re-adding all tracks in handleSignal for bidirectional sharing');
            localStream.getTracks().forEach(track => {
              console.log('🔗 UltraSimplePeer: Force adding track in handleSignal:', track.kind, 'enabled:', track.enabled);
              try {
                peer.addTrack(track, localStream);
                console.log('🔗 UltraSimplePeer: Successfully added track in handleSignal:', track.kind);
              } catch (error) {
                console.log('🔗 UltraSimplePeer: Track already added or error in handleSignal:', track.kind, error.message);
              }
            });
          } catch (error) {
            console.log('🔗 UltraSimplePeer: Error in bidirectional stream sharing in handleSignal:', error.message);
          }
        }
      });

      peer.on('close', () => {
        console.log('🔌 UltraSimplePeer: Connection closed to:', from);
        delete peersRef.current[from];
      });

      peer.on('error', (error) => {
        console.error('❌ UltraSimplePeer: Peer error:', error);
      });

      peersRef.current[from] = peer;
      peer.signal(signal);
    }
  }, [localStream]);

  // Approve participant
  const approveParticipant = useCallback((participantId) => {
    console.log('✅ UltraSimplePeer: Approving participant:', participantId);
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
    console.log('❌ UltraSimplePeer: Rejecting participant:', participantId);
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
      console.log('🎥 UltraSimplePeer: Auto-initializing media (host or approved)...');
      console.log('🎥 UltraSimplePeer: isHost:', isHost, 'isWaitingForApproval:', isWaitingForApproval);
      
      // Add a small delay to ensure the video element is rendered
      setTimeout(() => {
        console.log('🎥 UltraSimplePeer: Starting delayed media initialization...');
        initializeMedia();
      }, 1000); // Increased delay to ensure video element is ready
    }
  }, [isHost, isWaitingForApproval, initializeMedia]);

  // Force connection function
  const forceConnection = useCallback(async (targetId) => {
    console.log('🔗 FORCE: Force connecting to:', targetId);
    console.log('🔗 FORCE: Current local stream:', localStream);
    console.log('🔗 FORCE: Current remote streams:', Object.keys(remoteStreams));
    console.log('🔗 FORCE: Current participants:', participants);
    
    // Ensure we have local stream
    if (!localStream) {
      console.log('🔗 FORCE: No local stream, initializing media first...');
      const newStream = await initializeMedia();
      console.log('🔗 FORCE: New stream after initialization:', newStream);
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
          console.log('🔗 FORCE: Found stream in video element (data-local):', currentStream);
        } else {
          // Method 2: Try to get stream from any video element that has a stream
          const allVideos = document.querySelectorAll('video');
          for (const video of allVideos) {
            if (video.srcObject && video.srcObject.active) {
              currentStream = video.srcObject;
              streamSource = 'any video element';
              console.log('🔗 FORCE: Found stream in any video element:', currentStream);
              break;
            }
          }
        }
        
        // Method 3: Fallback to state variable
        if (!currentStream) {
          currentStream = localStream;
          streamSource = 'state variable';
          console.log('🔗 FORCE: Using stream from state:', currentStream);
        }
        
        console.log('🔗 FORCE: About to create peer connection to:', targetId);
        console.log('🔗 FORCE: Using local stream:', currentStream);
        console.log('🔗 FORCE: Stream source:', streamSource);
        console.log('🔗 FORCE: Stream active:', currentStream?.active);
        console.log('🔗 FORCE: Stream tracks:', currentStream?.getTracks()?.length);
        await createPeerConnection(targetId, currentStream);
      }, 500);
  }, [localStream, initializeMedia, createPeerConnection, remoteStreams, participants]);

  // Handle screen sharing changes
  const handleScreenShareChange = useCallback((stream, isSharing) => {
    console.log('🖥️ UltraSimplePeer: Screen sharing changed:', { isSharing, streamId: stream?.id });
    
    setScreenStream(stream);
    
    if (isSharing && stream) {
      // Add screen sharing stream to all existing peer connections
      Object.keys(peersRef.current).forEach(participantId => {
        const peer = peersRef.current[participantId];
        if (peer && peer._pc && peer._pc.connectionState === 'connected') {
          try {
            console.log(`🖥️ UltraSimplePeer: Adding screen stream to peer ${participantId}`);
            // Use modern WebRTC API instead of deprecated addStream
            stream.getTracks().forEach(track => {
              console.log(`🖥️ UltraSimplePeer: Adding ${track.kind} track for screen share`);
              peer.addTrack(track, stream);
            });
          } catch (error) {
            console.log(`🖥️ UltraSimplePeer: Could not add screen stream to peer ${participantId}:`, error.message);
          }
        }
      });
    } else {
      // Remove screen sharing stream from all peer connections
      console.log('🖥️ UltraSimplePeer: Screen sharing stopped, cleaning up streams');
      Object.keys(peersRef.current).forEach(participantId => {
        const peer = peersRef.current[participantId];
        if (peer && peer._pc && peer._pc.connectionState === 'connected') {
          try {
            console.log(`🖥️ UltraSimplePeer: Removing screen stream from peer ${participantId}`);
            // Remove screen share tracks from peer connection
            const senders = peer._pc.getSenders();
            senders.forEach(sender => {
              if (sender.track && sender.track.kind === 'video' && sender.track.label.includes('screen')) {
                console.log(`🖥️ UltraSimplePeer: Removing screen share track from ${participantId}`);
                peer._pc.removeTrack(sender);
              }
            });
          } catch (error) {
            console.log(`🖥️ UltraSimplePeer: Could not remove screen stream from peer ${participantId}:`, error.message);
          }
        }
      });
      
      // Clear local screen stream
      if (screenStream) {
        console.log('🖥️ UltraSimplePeer: Stopping local screen stream tracks');
        screenStream.getTracks().forEach(track => {
          track.stop();
          console.log(`🖥️ UltraSimplePeer: Stopped screen track: ${track.kind}`);
        });
      }
    }
  }, []);

  // Listen for remote screen sharing streams
  useEffect(() => {
    if (!socket) return;

    const handleRemoteScreenStream = (data) => {
      console.log('🖥️ UltraSimplePeer: Received remote screen stream:', data);
      const { participantId, streamId, isSharing } = data;
      
      if (isSharing) {
        // Screen sharing started - we'll receive the stream through the peer connection
        console.log(`🖥️ UltraSimplePeer: Participant ${participantId} started screen sharing`);
      } else {
        // Screen sharing stopped - remove from remote screen streams
        console.log(`🖥️ UltraSimplePeer: Participant ${participantId} stopped screen sharing - cleaning up`);
        setRemoteScreenStreams(prev => {
          const newStreams = { ...prev };
          console.log('🖥️ UltraSimplePeer: Before cleanup - remote screen streams:', Object.keys(newStreams));
          delete newStreams[participantId];
          console.log('🖥️ UltraSimplePeer: After cleanup - remote screen streams:', Object.keys(newStreams));
          return newStreams;
        });
        
        // Also force a re-render to ensure UI updates
        console.log('🖥️ UltraSimplePeer: Forcing re-render after screen share cleanup');
        setForceRender(prev => prev + 1);
      }
    };

    socket.on('screen-share-change', handleRemoteScreenStream);

    // Listen for media state changes from other participants
    const handleMediaStateChange = (data) => {
      console.log('📡 UltraSimplePeer: Media state change received:', data);
      console.log('📡 UltraSimplePeer: DEBUG - Event data:', {
        participantId: data.participantId,
        audioEnabled: data.audioEnabled,
        videoEnabled: data.videoEnabled,
        timestamp: data.timestamp,
        currentTime: new Date().toISOString()
      });
      console.log('📡 UltraSimplePeer: Current participants before update:', participantsRef.current.map(p => ({
        id: p.id,
        name: p.name,
        audioEnabled: p.audioEnabled,
        videoEnabled: p.videoEnabled
      })));
      
      // Check if this is a valid media state change
      if (!data.participantId || data.audioEnabled === undefined || data.videoEnabled === undefined) {
        console.log('❌ UltraSimplePeer: Invalid media state change data:', data);
        return;
      }
      
      // Handle video track management for the participant
      if (data.participantId !== socketRef.current?.id) {
        // This is a remote participant's media state change
        console.log(`📡 UltraSimplePeer: Handling remote participant media state change for ${data.participantId}`);
        
        // Get the remote stream for this participant
        const remoteStream = remoteStreams[data.participantId];
        if (remoteStream) {
          console.log(`📡 UltraSimplePeer: Found remote stream for ${data.participantId}, managing tracks`);
          
          // Handle video track
          const videoTracks = remoteStream.getVideoTracks();
          videoTracks.forEach(track => {
            if (data.videoEnabled) {
              console.log(`📹 UltraSimplePeer: Enabling video track for ${data.participantId}`);
              track.enabled = true;
            } else {
              console.log(`📹 UltraSimplePeer: Disabling video track for ${data.participantId}`);
              track.enabled = false;
            }
          });
          
          // Handle audio track
          const audioTracks = remoteStream.getAudioTracks();
          audioTracks.forEach(track => {
            if (data.audioEnabled) {
              console.log(`🎤 UltraSimplePeer: Enabling audio track for ${data.participantId}`);
              track.enabled = true;
            } else {
              console.log(`🎤 UltraSimplePeer: Disabling audio track for ${data.participantId}`);
              track.enabled = false;
            }
          });
        } else {
          console.log(`📡 UltraSimplePeer: No remote stream found for ${data.participantId}`);
        }
      }
      
      // Update participant's media state in the participants list
      setParticipants(prev => {
        const updated = prev.map(participant => {
          if (participant.id === data.participantId) {
            console.log(`📡 UltraSimplePeer: Updating media state for ${participant.name}:`, {
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
        
        console.log('📡 UltraSimplePeer: Participants after update:', updated.map(p => ({
          id: p.id,
          name: p.name,
          audioEnabled: p.audioEnabled,
          videoEnabled: p.videoEnabled
        })));
        
        // Update the ref as well to ensure consistency
        participantsRef.current = updated;
        
        // Force a re-render to ensure UI updates
        console.log('📡 UltraSimplePeer: Forcing re-render due to media state change');
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
      console.log('🖥️ UltraSimplePeer: Notifying participants about screen sharing start');
      socket.emit('screen-share-change', {
        meetingId,
        participantId: socket.id,
        isSharing: true,
        streamId: screenStream.id
      });
    } else {
      console.log('🖥️ UltraSimplePeer: Notifying participants about screen sharing stop');
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
    console.log('🔄 UltraSimplePeer: Updating local stream');
    console.log('🔄 UltraSimplePeer: New stream details:', {
      id: newStream?.id,
      active: newStream?.active,
      tracks: newStream?.getTracks().length,
      videoTracks: newStream?.getVideoTracks().length,
      audioTracks: newStream?.getAudioTracks().length
    });
    
    // Store the original stream if this is the first time we're setting it
    if (!originalStreamRef.current && localStream) {
      originalStreamRef.current = localStream;
      console.log('🔄 UltraSimplePeer: Stored original stream for restoration');
    }
    
    setLocalStream(newStream);
    
    // Update all existing peer connections with the new stream
    Object.keys(peersRef.current).forEach(participantId => {
      const peer = peersRef.current[participantId];
      if (peer && peer.getSenders) {
        console.log(`🔄 UltraSimplePeer: Updating peer connection for participant ${participantId}`);
        
        // Get current senders
        const senders = peer.getSenders();
        console.log(`🔄 UltraSimplePeer: Current senders for ${participantId}:`, senders.length);
        
        // Remove old tracks
        senders.forEach(sender => {
          if (sender.track) {
            console.log(`🔄 UltraSimplePeer: Removing old track: ${sender.track.kind}`);
            peer.removeTrack(sender);
          }
        });
        
        // Add new tracks
        if (newStream) {
          newStream.getTracks().forEach(track => {
            console.log(`🔄 UltraSimplePeer: Adding new track: ${track.kind}`);
            peer.addTrack(track, newStream);
          });
        }
        
        console.log(`✅ UltraSimplePeer: Updated stream for participant ${participantId}`);
        
        // Force re-send the stream to ensure the remote peer receives it
        setTimeout(() => {
          console.log(`🔄 UltraSimplePeer: Force re-sending stream to ${participantId} after consent`);
          if (newStream && newStream.active) {
            newStream.getTracks().forEach(track => {
              console.log(`🔄 UltraSimplePeer: Force re-adding track ${track.kind} to ${participantId}`);
              try {
                peer.addTrack(track, newStream);
                console.log(`✅ UltraSimplePeer: Successfully re-added track ${track.kind} to ${participantId}`);
              } catch (error) {
                console.log(`⚠️ UltraSimplePeer: Track ${track.kind} already added to ${participantId}:`, error.message);
              }
            });
          }
        }, 1000); // Wait 1 second then force re-send
        
      } else if (peer && peer.addTrack) {
        // Use modern WebRTC API
        console.log(`🔄 UltraSimplePeer: Using modern addTrack API for participant ${participantId}`);
        newStream.getTracks().forEach(track => {
          console.log(`🔄 UltraSimplePeer: Adding ${track.kind} track using modern API`);
          peer.addTrack(track, newStream);
        });
      }
    });
    
    // Emit media state change to notify other participants about the stream update
    if (socket && meetingId && newStream) {
      const videoEnabled = newStream.getVideoTracks().length > 0 && newStream.getVideoTracks()[0].enabled;
      const audioEnabled = newStream.getAudioTracks().length > 0 && newStream.getAudioTracks()[0].enabled;
      
      console.log('📡 UltraSimplePeer: Emitting media state change after stream update:', {
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
      console.log('🔄 UltraSimplePeer: Restoring original stream');
      updateLocalStream(originalStreamRef.current);
    } else {
      console.log('🔄 UltraSimplePeer: No original stream to restore');
    }
  }, [updateLocalStream]);

  // Make the hook globally accessible for consent dialog integration
  useEffect(() => {
    window.ultraSimplePeerRef = {
      current: {
        updateLocalStream,
        restoreOriginalStream,
        peersRef,
        localStream,
        originalStream: originalStreamRef.current
      }
    };
    
    return () => {
      window.ultraSimplePeerRef = null;
    };
  }, [updateLocalStream, localStream]);

  return {
    localStream,
    remoteStreams,
    participants,
    isHost,
    isWaitingForApproval,
    pendingApprovals,
    showPendingApprovals,
    setShowPendingApprovals,
    socket,
    socketConnected,
    localVideoRef,
    approveParticipant,
    rejectParticipant,
    forceConnection,
    createConnectionsToAllParticipants,
    isConnectionActive,
    isConnected: socketConnected,
    joinMeeting: () => {}, // Not needed in this simplified version
    initializeMedia,
    updateLocalStream, // Expose the method
    // Screen sharing functionality
    screenStream,
    remoteScreenStreams,
    handleScreenShareChange,
    forceRender
  };
};

export default useUltraSimplePeer;
