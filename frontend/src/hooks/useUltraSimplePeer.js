import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { getBackendUrl } from '../config/network';

const useUltraSimplePeer = (meetingId, userName) => {
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
      
      // Check if user is already approved by looking at URL or localStorage
      const isHostFromURL = window.location.search.includes('host=true');
      const isAlreadyApproved = window.location.search.includes('approved=true') || 
                                localStorage.getItem(`approved_${meetingId}`) === 'true';
      
      console.log('🔌 Socket connected:', {
        isHostFromURL,
        isAlreadyApproved,
        meetingId,
        userName
      });
      
      if (isAlreadyApproved && isHostFromURL) {
        console.log('🎯 Host joining with approval');
        setIsHost(true);
        isHostRef.current = true;
        
        newSocket.emit('join-meeting', { 
          meetingId, 
          userName,
          isHost: true 
        });
        setIsWaitingForApproval(false);
        
        // Initialize media for host
        if (!localStream) {
          console.log('🎯 Host initializing media...');
          initializeMedia().then(stream => {
            if (stream) {
              console.log('🎯 Host media initialized successfully');
              // Create connections to existing participants
              setTimeout(() => {
                createConnectionsToAllParticipants();
              }, 1000);
            }
          }).catch(error => {
            console.error('❌ Host media initialization failed:', error);
          });
        }
      } else {
        console.log('🎯 Regular participant joining');
        newSocket.emit('join-meeting', {
          meetingId,
          userName: userName,
          isHost: false
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      setSocketConnected(false);
      
      // Enhanced reconnection logic for multiple laptops
      if (reason === 'io server disconnect') {
        setTimeout(() => {
          if (!socketConnected) {
            newSocket.connect();
          }
        }, 2000);
      } else if (reason !== 'io client disconnect') {
        setTimeout(() => {
          if (!socketConnected) {
            newSocket.connect();
          }
        }, 3000);
      }
    });

    // Handle meeting joined
    newSocket.on('meeting-joined', (data) => {
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
        console.log(`📝 Host has ${data.count} pending approvals - not showing dialog`);
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
            audioEnabled: newParticipant.audioEnabled ?? false,
            videoEnabled: newParticipant.videoEnabled ?? false
          };
          const updated = [...prev, participantWithDefaults];
          participantsRef.current = updated;
          
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
          
          // Force connection to the new participant from all existing participants
          console.log('🎯 MULTI-PARTICIPANT: Requesting force connections from existing participants');
          socketRef.current.emit('force-connection', {
            targetId: data.participantId,
            fromId: socketRef.current.id
          });
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
        let currentStream = localStream;
        if (!currentStream) {
          console.log('🔗 FORCE: No local stream, initializing media first...');
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
        sampleRate: isMobileHotspot || isSlowConnection ? 16000 : 48000,
        channelCount: 1
      };
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
      } catch (constraintError) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }
      
      setLocalStream(stream);
      
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
    console.log(`🔗 CREATE-PEER: Creating connection to ${participantId}`);
    console.log(`🔗 CREATE-PEER: Has stream:`, !!stream);
    console.log(`🔗 CREATE-PEER: Stream active:`, stream?.active);
    console.log(`🔗 CREATE-PEER: Stream tracks:`, stream?.getTracks()?.length);
    
    if (peersRef.current[participantId]) {
      console.log(`🔗 CREATE-PEER: Connection already exists for ${participantId}`);
      return;
    }

    // If no stream is provided, try to get the current local stream
    if (!stream) {
      console.log(`🔗 CREATE-PEER: No stream provided, trying to get current local stream`);
      stream = localStream;
      if (!stream) {
        console.log(`🔗 CREATE-PEER: No local stream available, cannot create connection`);
        return;
      }
    }
    
    // Ensure stream is active and has tracks
    if (!stream || !stream.active || stream.getTracks().length === 0) {
      console.log(`🔗 CREATE-PEER: Stream is not valid, trying to reinitialize...`);
      const newStream = await initializeMedia();
      if (!newStream) {
        console.log(`🔗 CREATE-PEER: Failed to initialize stream, cannot create connection`);
        return;
      }
      stream = newStream;
      setLocalStream(stream);
    }

    const shouldBeInitiator = socketRef.current?.id && participantId && socketRef.current.id < participantId;
    const totalParticipants = participantsRef.current.length;
    const isLargeGroup = totalParticipants > 2;
    
    console.log(`🔗 CREATE-PEER: Initiator: ${shouldBeInitiator}, Large group: ${isLargeGroup}`);
    
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
          frameRate: { ideal: 10, max: 15 }
        };
        
        try {
          await videoTrack.applyConstraints(constraints);
        } catch (error) {
          // Ignore constraint errors
        }
      }
      
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
        } catch (error) {
          // Ignore constraint errors
        }
      }
    }
    
    const peer = new SimplePeer(peerConfig);

    peer.on('signal', (data) => {
      console.log(`📡 SIGNAL: Sending signal to ${participantId}:`, data.type);
      socketRef.current.emit('signal', {
        to: participantId,
        from: socketRef.current.id,
        signal: data
      });
    });

    peer.on('stream', (stream) => {
      console.log(`🎥 STREAM: Received stream from ${participantId}`);
      console.log(`🎥 STREAM: Stream active: ${stream.active}, tracks: ${stream.getTracks().length}`);
      console.log(`🎥 STREAM: Stream ID: ${stream.id}`);
      console.log(`🎥 STREAM: Video tracks: ${stream.getVideoTracks().length}`);
      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);
      
      const isScreenShare = stream.getVideoTracks().some(track => 
        track.label && (
          track.label.includes('screen') || 
          track.label.includes('Screen') ||
          track.label.includes('window') ||
          track.label.includes('desktop')
        )
      );
      
      if (isScreenShare) {
        console.log(`🖥️ STREAM: Screen share detected from ${participantId}`);
        setRemoteScreenStreams(prev => {
          const newStreams = { ...prev };
          newStreams[participantId] = stream;
          return newStreams;
        });
        setForceRender(prev => prev + 1);
        return;
      }
      
      console.log(`🎥 STREAM: Adding video stream from ${participantId}`);
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
        console.log(`🎥 STREAM: Updated remote streams:`, Object.keys(newStreams));
          return newStreams;
      });
    });

    peer.on('connect', () => {
      console.log(`✅ CONNECT: Connected to ${participantId}`);
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
      
      console.log(`🔍 Connection check for ${participantId}:`, {
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
      console.log(`🔍 Connection check for ${participantId}: Peer exists but no _pc yet, considering active`);
      return true;
    }
    
    return false;
  }, []);

  // Function to create connections to all existing participants
  const createConnectionsToAllParticipants = useCallback(async () => {
    console.log('🔗 CREATE-ALL: Starting connection process');
    console.log('🔗 CREATE-ALL: Participants:', participantsRef.current.length);
    console.log('🔗 CREATE-ALL: Local stream:', !!localStream);
    console.log('🔗 CREATE-ALL: Is host:', isHostRef.current);
    
    if (participantsRef.current.length === 0) {
      console.log('🔗 CREATE-ALL: No participants to connect to');
      return;
    }
    
    let currentStream = localStream;
    
    if (!currentStream) {
      console.log('🔗 CREATE-ALL: No local stream, initializing...');
      currentStream = await initializeMedia();
      if (!currentStream) {
        console.log('🔗 CREATE-ALL: Failed to initialize stream');
        return;
      }
      // Update the local stream state
      setLocalStream(currentStream);
    }
    
    // Ensure stream is active and has tracks
    if (!currentStream || !currentStream.active || currentStream.getTracks().length === 0) {
      console.log('🔗 CREATE-ALL: Stream is not active or has no tracks, reinitializing...');
      currentStream = await initializeMedia();
      if (!currentStream) {
        console.log('🔗 CREATE-ALL: Failed to reinitialize stream');
        return;
      }
      setLocalStream(currentStream);
    }
    
    if (isHostRef.current && (!currentStream || !currentStream.active || currentStream.getTracks().length === 0)) {
      console.log('🔗 CREATE-ALL: Host has no valid stream');
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
      
      console.log('🔗 CREATE-ALL: Non-host connection logic:', {
        isHost: isHostRef.current,
        totalParticipants: allParticipants.length,
        host: host ? { id: host.id, name: host.name } : null,
        otherParticipants: otherParticipants.map(p => ({ id: p.id, name: p.name }))
      });
      
      if (host && !peersRef.current[host.id]) {
        console.log('🔗 CREATE-ALL: Adding host to connection list:', host.name);
        participantsToConnect.push(host);
      }
      
      // Always connect to other participants for small groups
      if (allParticipants.length <= 6) {
        const otherParticipantsToConnect = otherParticipants.filter(p => 
          !peersRef.current[p.id]
        );
        console.log('🔗 CREATE-ALL: Adding other participants to connection list:', otherParticipantsToConnect.map(p => p.name));
        participantsToConnect.push(...otherParticipantsToConnect);
      } else {
        const additionalParticipants = otherParticipants
          .filter(p => !peersRef.current[p.id])
          .slice(0, 4);
        console.log('🔗 CREATE-ALL: Adding limited participants to connection list:', additionalParticipants.map(p => p.name));
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
    
    console.log('🔗 CREATE-ALL: Creating connections to:', participantsToConnect.length, 'participants');
    console.log('🔗 CREATE-ALL: Participants to connect:', participantsToConnect.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })));
      
    participantsToConnect.forEach((participant, index) => {
      console.log(`🔗 CREATE-ALL: Connecting to ${participant.name} (${participant.id}) - ${participant.isHost ? 'HOST' : 'PARTICIPANT'}`);
      setTimeout(async () => {
        try {
          await createPeerConnection(participant.id, currentStream);
          console.log(`✅ CREATE-ALL: Connected to ${participant.name}`);
        } catch (error) {
          console.log(`❌ CREATE-ALL: Failed to connect to ${participant.name}:`, error);
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
      
      // Reduced frequency and more lenient health check
      connectionHealthCheckRef.current = setInterval(() => {
        const allParticipants = participantsRef.current.filter(p => 
          p.id !== socketRef.current?.id && p.isApproved
        );
        
        console.log(`🔍 HEALTH CHECK: Checking ${allParticipants.length} participants`);
        
        allParticipants.forEach(participant => {
          const isActive = isConnectionActive(participant.id);
          const hasPeer = peersRef.current[participant.id];
          
          console.log(`🔍 HEALTH CHECK: ${participant.name} - Active: ${isActive}, HasPeer: ${!!hasPeer}`);
          
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
              const cooldownPeriod = 30000; // 30 seconds
              
              if (now - lastAttempt > cooldownPeriod) {
                console.log(`🔍 HEALTH CHECK: Connection to ${participant.name} is truly dead, attempting reconnection`);
                lastReconnectionAttempt.current[participant.id] = now;
                createConnectionsToAllParticipants();
              } else {
                console.log(`🔍 HEALTH CHECK: Connection to ${participant.name} is dead but in cooldown period, skipping reconnection`);
              }
            } else {
              console.log(`🔍 HEALTH CHECK: Connection to ${participant.name} is still establishing, skipping reconnection`);
            }
          }
        });
      }, 15000); // Increased to 15 seconds to reduce aggressive reconnections
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
    console.log(`📡 HANDLE-SIGNAL: Received ${signal.type} from ${from}`);
    
    if (peersRef.current[from]) {
      console.log(`📡 HANDLE-SIGNAL: Applying signal to existing peer: ${from}`);
      peersRef.current[from].signal(signal);
    } else {
      console.log(`📡 HANDLE-SIGNAL: Creating new peer for signal from: ${from}`);
      
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
          console.log('🖥️ UltraSimplePeer: Detected screen share stream in handleSignal from:', from);
          console.log('🖥️ UltraSimplePeer: Screen share stream details in handleSignal:', {
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
            console.log('🖥️ UltraSimplePeer: Updated remote screen streams in handleSignal:', Object.keys(newStreams));
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
        console.log('🔍 CRITICAL DEBUG: Connection established with participant:', from);
        console.log('🔍 CRITICAL DEBUG: Current user is host:', isHostRef.current);
        console.log('🔍 CRITICAL DEBUG: Local stream available:', !!localStream);
        console.log('🔍 CRITICAL DEBUG: Local stream active:', localStream?.active);
        
        // Stream sharing is already handled by SimplePeer constructor
        // No need to add tracks again as this causes duplication errors
        if (localStream && localStream.active) {
          console.log('🔗 UltraSimplePeer: Stream already shared via SimplePeer constructor for:', from);
          console.log('🔗 UltraSimplePeer: Stream details:', {
            streamId: localStream.id,
            streamActive: localStream.active,
            trackCount: localStream.getTracks().length,
            videoTracks: localStream.getVideoTracks().length,
            audioTracks: localStream.getAudioTracks().length
          });
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
            // Screen share stream is already passed to SimplePeer constructor
            // No need to add tracks again
            console.log('🖥️ UltraSimplePeer: Screen share stream already shared via SimplePeer constructor');
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
      
      // Force clear screen stream state
      setScreenStream(null);
      
      // Force re-render to update UI
      setForceRender(prev => prev + 1);
      
      console.log('🖥️ UltraSimplePeer: Screen sharing cleanup completed, forcing UI update');
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
        
        // Clear any screen share video elements
        const screenShareVideos = document.querySelectorAll('video[data-screen-share="true"]');
        screenShareVideos.forEach(video => {
          if (video.srcObject) {
            console.log('🖥️ UltraSimplePeer: Clearing screen share video element');
            video.srcObject = null;
            video.pause();
          }
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
          console.log('🔄 UltraSimplePeer: New stream available, but tracks should be managed by SimplePeer');
          console.log('🔄 UltraSimplePeer: New stream details:', {
            streamId: newStream.id,
            streamActive: newStream.active,
            trackCount: newStream.getTracks().length
          });
        }
        
        console.log(`✅ UltraSimplePeer: Updated stream for participant ${participantId}`);
        
        // Force re-send the stream to ensure the remote peer receives it
        setTimeout(() => {
          console.log(`🔄 UltraSimplePeer: Force re-sending stream to ${participantId} after consent`);
          if (newStream && newStream.active) {
            console.log('🔄 UltraSimplePeer: Stream update should be handled by SimplePeer automatically');
            console.log('🔄 UltraSimplePeer: New stream details for', participantId, ':', {
              streamId: newStream.id,
              streamActive: newStream.active,
              trackCount: newStream.getTracks().length
            });
          }
        }, 1000); // Wait 1 second then force re-send
        
      } else if (peer) {
        // Stream updates should be handled by SimplePeer automatically
        console.log(`🔄 UltraSimplePeer: Stream updates handled by SimplePeer for participant ${participantId}`);
        console.log(`🔄 UltraSimplePeer: New stream details:`, {
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

  // Gentle debugging function to understand connection issues
  const debugConnectionStatus = useCallback(() => {
    console.log('🔍 GENTLE DEBUG: Connection status analysis...');
    console.log('🔍 GENTLE DEBUG: Current state:', {
      isHost: isHostRef.current,
      hasLocalStream: !!localStream,
      localStreamActive: localStream?.active,
      localStreamTracks: localStream?.getTracks()?.length,
      participantsCount: participantsRef.current.length,
      remoteStreamsCount: Object.keys(remoteStreams).length,
      socketConnected: !!socket,
      socketId: socket?.id
    });
    
    console.log('🔍 GENTLE DEBUG: Participants details:');
    participantsRef.current.forEach(participant => {
      console.log(`🔍 GENTLE DEBUG: - ${participant.name} (${participant.id}):`, {
        isHost: participant.isHost,
        isApproved: participant.isApproved,
        hasRemoteStream: !!remoteStreams[participant.id],
        remoteStreamActive: remoteStreams[participant.id]?.active
      });
    });
    
    console.log('🔍 GENTLE DEBUG: Remote streams details:');
    Object.keys(remoteStreams).forEach(participantId => {
      const stream = remoteStreams[participantId];
      const participant = participantsRef.current.find(p => p.id === participantId);
      console.log(`🔍 GENTLE DEBUG: - ${participant?.name || participantId}:`, {
        streamActive: stream?.active,
        streamTracks: stream?.getTracks()?.length,
        videoTracks: stream?.getVideoTracks()?.length,
        audioTracks: stream?.getAudioTracks()?.length
      });
    });
  }, [localStream, remoteStreams, socket]);

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
    debugConnectionStatus, // Expose the debug function
    // Screen sharing functionality
    screenStream,
    remoteScreenStreams,
    handleScreenShareChange,
    forceRender
  };
};

export default useUltraSimplePeer;
