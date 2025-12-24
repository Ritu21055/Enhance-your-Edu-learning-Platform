import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { getBackendUrl } from '../config/network';

const useSimplePeer = (meetingId, userName) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [showPendingApprovals, setShowPendingApprovals] = useState(false);
  const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localVideoRef = useRef(null);
  const isHostRef = useRef(false);

  // Update host ref when isHost changes
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  // Initialize socket connection and auto-join meeting
  useEffect(() => {
    console.log('🔌 Initializing SimplePeer socket connection...');
    socketRef.current = io(getBackendUrl());

    socketRef.current.on('connect', () => {
      console.log('✅ SimplePeer Socket connected with ID:', socketRef.current.id);
      setIsConnected(true);
      
      // Auto-join meeting when connected
      console.log('🎉 Auto-joining meeting with SimplePeer...');
      socketRef.current.emit('join-meeting', { meetingId, userName });
    });

    socketRef.current.on('disconnect', () => {
      console.log('🔌 SimplePeer Socket disconnected');
      setIsConnected(false);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [meetingId, userName]);

  // Auto-initialize media only for hosts or after approval
  useEffect(() => {
    const initMedia = async () => {
      // Only initialize media if we're a host or if we're already approved
      if (isHost || !isWaitingForApproval) {
        console.log('🎥 SimplePeer: Auto-initializing media (host or approved)...');
        await initializeMedia();
      } else {
        console.log('🎥 SimplePeer: Skipping media initialization - waiting for approval');
      }
    };
    
    initMedia();
  }, [isHost, isWaitingForApproval]);

  // Join meeting
  const joinMeeting = useCallback(() => {
    if (socketRef.current && socketRef.current.connected) {
      console.log('🎉 Joining meeting with SimplePeer...');
      socketRef.current.emit('join-meeting', { meetingId, userName });
    }
  }, [meetingId, userName]);

  // Initialize media with optimized quality settings
  const initializeMedia = useCallback(async () => {
    try {
      console.log('🎥 SimplePeer: Starting media initialization with optimized quality...');
      
      // Get participant count to adjust quality
      const participantCount = participants.length + 1; // +1 for self
      
      // Adaptive quality based on participant count
      // More participants = slightly lower quality to maintain stability
      let videoWidth = 1280;
      let videoHeight = 720;
      let frameRate = 30;
      let videoBitrate = 2500000; // 2.5 Mbps
      
      if (participantCount > 3) {
        // For 4+ participants, reduce quality slightly
        videoWidth = 960;
        videoHeight = 540;
        frameRate = 25;
        videoBitrate = 2000000; // 2 Mbps
      } else if (participantCount > 5) {
        // For 6+ participants, further reduce
        videoWidth = 640;
        videoHeight = 480;
        frameRate = 20;
        videoBitrate = 1500000; // 1.5 Mbps
      }
      
      console.log('🎥 SimplePeer: Quality settings:', {
        participantCount,
        videoWidth,
        videoHeight,
        frameRate,
        videoBitrate: `${videoBitrate / 1000000} Mbps`
      });
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: videoWidth, max: videoWidth },
          height: { ideal: videoHeight, max: videoHeight },
          frameRate: { ideal: frameRate, max: frameRate },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }
      });
      
      // Apply bitrate constraints to video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.getSettings) {
        const settings = videoTrack.getSettings();
        console.log('🎥 SimplePeer: Video track settings:', settings);
        
        // Try to apply bitrate constraint if supported
        if (videoTrack.applyConstraints) {
          try {
            await videoTrack.applyConstraints({
              advanced: [
                { width: videoWidth },
                { height: videoHeight },
                { frameRate: frameRate }
              ]
            });
            console.log('✅ SimplePeer: Applied video constraints');
          } catch (constraintError) {
            console.warn('⚠️ SimplePeer: Could not apply all video constraints:', constraintError);
          }
        }
      }
      
      console.log('🎥 SimplePeer: Media stream obtained:', {
        streamId: stream.id,
        trackCount: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        videoWidth: videoTrack?.getSettings()?.width,
        videoHeight: videoTrack?.getSettings()?.height,
        frameRate: videoTrack?.getSettings()?.frameRate
      });

      setLocalStream(stream);
      
      // Set local video stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('🎥 SimplePeer: Local video stream set on video element');
      }

      return stream;
    } catch (error) {
      console.error('❌ SimplePeer: Failed to get media:', error);
      // Fallback to basic constraints if advanced constraints fail
      try {
        console.log('🔄 SimplePeer: Trying fallback with basic constraints...');
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        setLocalStream(fallbackStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = fallbackStream;
        }
        return fallbackStream;
      } catch (fallbackError) {
        console.error('❌ SimplePeer: Fallback also failed:', fallbackError);
        return null;
      }
    }
  }, [participants.length]);

  // Connection monitoring refs
  const connectionMonitoringRef = useRef({});
  const reconnectionAttemptsRef = useRef({});

  // Attempt to reconnect a failed connection (defined after createPeer to avoid circular dependency)
  const attemptReconnectionRef = useRef(null);

  // Create peer connection with improved stability
  const createPeer = useCallback((participantId, initiator = false) => {
    // Don't create duplicate connections
    if (peersRef.current[participantId]) {
      console.log(`⚠️ SimplePeer: Connection to ${participantId} already exists, skipping...`);
      return peersRef.current[participantId];
    }
    
    console.log(`🔗 SimplePeer: Creating peer connection for ${participantId}, initiator: ${initiator}`);
    
    const peer = new SimplePeer({
      initiator,
      trickle: true, // Enable trickle ICE for faster connection
      stream: localStream, // Always pass the local stream
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10 // Pre-gather ICE candidates for faster connection
      }
    });
    
    // Initialize connection monitoring
    connectionMonitoringRef.current[participantId] = {
      lastConnectionState: 'new',
      lastIceState: 'new',
      reconnectAttempts: 0,
      monitoringInterval: null
    };
    reconnectionAttemptsRef.current[participantId] = 0;

    peer.on('signal', (data) => {
      console.log(`📡 SimplePeer: Sending signal to ${participantId}`);
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('signal', {
          to: participantId,
          from: socketRef.current.id,
          signal: data
        });
      }
    });

    peer.on('stream', (stream) => {
      console.log(`🎥 SimplePeer: Received stream from ${participantId}:`, {
        streamId: stream.id,
        trackCount: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        currentSocketId: socketRef.current?.id,
        streamActive: stream.active,
        streamEnded: stream.ended
      });
      
      // Check if stream has video tracks
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        console.log(`🎥 SimplePeer: Video track details for ${participantId}:`, {
          trackId: videoTracks[0].id,
          trackKind: videoTracks[0].kind,
          trackEnabled: videoTracks[0].enabled,
          trackMuted: videoTracks[0].muted,
          trackReadyState: videoTracks[0].readyState
        });
      } else {
        console.warn(`⚠️ SimplePeer: No video tracks in stream from ${participantId}`);
      }
      
      setRemoteStreams(prev => {
        const newStreams = {
          ...prev,
          [participantId]: stream
        };
        console.log(`🎥 SimplePeer: Updated remote streams:`, Object.keys(newStreams));
        console.log(`🎥 SimplePeer: Stream details for ${participantId}:`, {
          streamId: stream.id,
          active: stream.active,
          ended: stream.ended,
          trackCount: stream.getTracks().length
        });
        return newStreams;
      });
    });

    peer.on('connect', () => {
      console.log(`✅ SimplePeer: Connected to ${participantId}`, {
        currentSocketId: socketRef.current?.id,
        hasLocalStream: !!localStream,
        peerInitiator: initiator,
        localStreamTracks: localStream?.getTracks()?.length,
        localVideoTracks: localStream?.getVideoTracks()?.length,
        localAudioTracks: localStream?.getAudioTracks()?.length,
        peerConnectionState: peer._pc?.connectionState,
        peerIceConnectionState: peer._pc?.iceConnectionState
      });
      
      // Reset reconnection attempts on successful connection
      reconnectionAttemptsRef.current[participantId] = 0;
      
      // Ensure local stream is added to the peer connection
      if (localStream) {
        console.log(`🔗 SimplePeer: Ensuring local stream is added to peer for ${participantId}`);
        try {
          peer.addStream(localStream);
          console.log(`🔗 SimplePeer: Successfully added local stream to peer for ${participantId}`);
        } catch (error) {
          console.log(`🔗 SimplePeer: Stream already added to peer for ${participantId}:`, error.message);
        }
      } else {
        console.log(`🔗 SimplePeer: No local stream available for ${participantId}`);
      }
      
      // Start monitoring connection state
      if (peer._pc) {
        startConnectionMonitoring(participantId, peer);
      }
    });
    
    // Monitor connection state changes
    const startConnectionMonitoring = (pid, peerConnection) => {
      if (!peerConnection._pc) return;
      
      const pc = peerConnection._pc;
      
      // Monitor connection state
      const checkConnection = () => {
        const connectionState = pc.connectionState;
        const iceState = pc.iceConnectionState;
        const monitoring = connectionMonitoringRef.current[pid];
        
        if (!monitoring) return;
        
        // Log state changes
        if (monitoring.lastConnectionState !== connectionState) {
          console.log(`📊 SimplePeer: Connection state changed for ${pid}:`, {
            from: monitoring.lastConnectionState,
            to: connectionState,
            iceState: iceState
          });
          monitoring.lastConnectionState = connectionState;
        }
        
        if (monitoring.lastIceState !== iceState) {
          console.log(`📊 SimplePeer: ICE state changed for ${pid}:`, {
            from: monitoring.lastIceState,
            to: iceState,
            connectionState: connectionState
          });
          monitoring.lastIceState = iceState;
        }
        
        // Handle connection failures
        if (connectionState === 'failed' || iceState === 'failed') {
          console.warn(`⚠️ SimplePeer: Connection failed for ${pid}, attempting reconnection...`);
          if (attemptReconnectionRef.current) {
            attemptReconnectionRef.current(pid);
          }
        } else if (connectionState === 'disconnected' && iceState === 'disconnected') {
          console.warn(`⚠️ SimplePeer: Connection disconnected for ${pid}, monitoring for recovery...`);
          // Wait a bit before attempting reconnection
          setTimeout(() => {
            if (pc.connectionState === 'disconnected' && pc.iceConnectionState === 'disconnected') {
              if (attemptReconnectionRef.current) {
                attemptReconnectionRef.current(pid);
              }
            }
          }, 3000);
        } else if (connectionState === 'connected' && iceState === 'connected') {
          // Connection is healthy
          reconnectionAttemptsRef.current[pid] = 0;
        }
      };
      
      // Check connection state every 2 seconds
      const interval = setInterval(checkConnection, 2000);
      connectionMonitoringRef.current[pid].monitoringInterval = interval;
      
      // Also listen to statechange events
      pc.addEventListener('connectionstatechange', () => {
        checkConnection();
      });
      
      pc.addEventListener('iceconnectionstatechange', () => {
        checkConnection();
      });
    };

    peer.on('error', (error) => {
      console.error(`❌ SimplePeer: Error with ${participantId}:`, error);
      
      // Don't immediately destroy on error - try to recover
      if (peer._pc) {
        const connectionState = peer._pc.connectionState;
        const iceState = peer._pc.iceConnectionState;
        
        // Only attempt reconnection if connection is actually failed
        if (connectionState === 'failed' || iceState === 'failed') {
          console.log(`🔄 SimplePeer: Connection failed for ${participantId}, will attempt reconnection...`);
          setTimeout(() => {
            if (attemptReconnectionRef.current) {
              attemptReconnectionRef.current(participantId);
            }
          }, 1000);
        }
      }
    });

    peer.on('close', () => {
      console.log(`🔌 SimplePeer: Connection closed with ${participantId}`);
      
      // Clean up monitoring
      if (connectionMonitoringRef.current[participantId]?.monitoringInterval) {
        clearInterval(connectionMonitoringRef.current[participantId].monitoringInterval);
      }
      delete connectionMonitoringRef.current[participantId];
      delete reconnectionAttemptsRef.current[participantId];
      
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[participantId];
        return newStreams;
      });
      
      // Clean up processed signals for this participant
      const signalsToRemove = Array.from(processedSignalsRef.current).filter(key => key.startsWith(participantId));
      signalsToRemove.forEach(signal => processedSignalsRef.current.delete(signal));
      
      // Attempt reconnection if socket is still connected
      if (socketRef.current?.connected && localStream) {
        const participant = participants.find(p => p.id === participantId);
        if (participant && participant.isApproved) {
          console.log(`🔄 SimplePeer: Attempting to reconnect to ${participantId} after close...`);
          setTimeout(() => {
            if (!peersRef.current[participantId] && attemptReconnectionRef.current) {
              attemptReconnectionRef.current(participantId);
            }
          }, 2000);
        }
      }
    });

    return peer;
  }, [localStream]);

  // Define attemptReconnection after createPeer to avoid circular dependency
  const attemptReconnection = useCallback((pid) => {
    const maxAttempts = 3;
    const attempts = reconnectionAttemptsRef.current[pid] || 0;
    
    if (attempts >= maxAttempts) {
      console.error(`❌ SimplePeer: Max reconnection attempts reached for ${pid}`);
      return;
    }
    
    reconnectionAttemptsRef.current[pid] = attempts + 1;
    console.log(`🔄 SimplePeer: Reconnection attempt ${attempts + 1}/${maxAttempts} for ${pid}`);
    
    // Destroy existing peer
    if (peersRef.current[pid]) {
      try {
        peersRef.current[pid].destroy();
      } catch (e) {
        console.warn(`⚠️ SimplePeer: Error destroying peer for ${pid}:`, e);
      }
      delete peersRef.current[pid];
    }
    
    // Remove from remote streams
    setRemoteStreams(prev => {
      const newStreams = { ...prev };
      delete newStreams[pid];
      return newStreams;
    });
    
    // Clean up monitoring
    if (connectionMonitoringRef.current[pid]?.monitoringInterval) {
      clearInterval(connectionMonitoringRef.current[pid].monitoringInterval);
    }
    delete connectionMonitoringRef.current[pid];
    
    // Recreate connection after a delay
    setTimeout(() => {
      if (localStream && socketRef.current?.connected) {
        console.log(`🔄 SimplePeer: Recreating connection to ${pid}`);
        const participant = participants.find(p => p.id === pid);
        if (participant && participant.isApproved && !peersRef.current[pid]) {
          const newPeer = createPeer(pid, true);
          peersRef.current[pid] = newPeer;
        }
      }
    }, 2000);
  }, [localStream, participants, createPeer]);

  // Assign to ref for use in createPeer
  attemptReconnectionRef.current = attemptReconnection;

  // Track processed signals to avoid duplicates
  const processedSignalsRef = useRef(new Set());

  // Handle incoming signals
  const handleSignal = useCallback((data) => {
    const { from, signal } = data;
    const signalKey = `${from}-${signal.type}-${signal.sdp ? signal.sdp.substring(0, 50) : signal.candidate ? signal.candidate.substring(0, 50) : 'unknown'}`;
    
    // Check if we've already processed this signal
    if (processedSignalsRef.current.has(signalKey)) {
      console.log(`📡 SimplePeer: Ignoring duplicate signal from ${from}:`, signal.type);
      return;
    }
    
    processedSignalsRef.current.add(signalKey);
    
    console.log(`📡 SimplePeer: Received signal from ${from}:`, {
      signalType: signal.type,
      hasPeer: !!peersRef.current[from],
      currentSocketId: socketRef.current?.id
    });

    if (peersRef.current[from]) {
      // Existing peer, add signal
      console.log(`📡 SimplePeer: Applying signal to existing peer ${from}`);
      try {
        peersRef.current[from].signal(signal);
      } catch (error) {
        console.error(`❌ SimplePeer: Error applying signal to ${from}:`, error);
        // If there's an error, try to recreate the peer
        console.log(`🔄 SimplePeer: Recreating peer for ${from}`);
        peersRef.current[from].destroy();
        const peer = createPeer(from, false);
        peersRef.current[from] = peer;
        peer.signal(signal);
      }
    } else {
      // New peer, create and add signal
      console.log(`📡 SimplePeer: Creating new peer for ${from} and applying signal`);
      const peer = createPeer(from, false);
      peersRef.current[from] = peer;
      peer.signal(signal);
    }
  }, [createPeer]);

  // Handle participant joined (only for approved participants)
  const handleParticipantJoined = useCallback((data) => {
    const { participant } = data;
    console.log('👋 SimplePeer: New approved participant joined:', participant);
    console.log('👋 SimplePeer: handleParticipantJoined called with data:', data);
    
    // Don't add the current user to the participants list
    if (participant.id === socketRef.current?.id) {
      console.log(`👋 SimplePeer: Skipping adding current user (${participant.name}) to participants list`);
      return;
    }
    
    setParticipants(prev => {
      const exists = prev.find(p => p.id === participant.id);
      if (exists) {
        console.log(`👋 SimplePeer: Participant ${participant.name} (${participant.id}) already exists in participants list`);
        return prev;
      }
      console.log(`👋 SimplePeer: Adding new participant ${participant.name} (${participant.id}) to participants list`);
      return [...prev, participant];
    });

    // Only create peer connections for approved participants
    if (localStream && participant.id !== socketRef.current.id && participant.isApproved) {
      console.log('🔗 SimplePeer: Creating peer connection for approved participant:', participant.name);
      const peer = createPeer(participant.id, true);
      peersRef.current[participant.id] = peer;
    }
  }, [localStream, createPeer]);

  // Handle participant left
  const handleParticipantLeft = useCallback((participantId) => {
    console.log('👋 SimplePeer: Participant left:', participantId);
    
    setParticipants(prev => prev.filter(p => p.id !== participantId));
    
    if (peersRef.current[participantId]) {
      peersRef.current[participantId].destroy();
      delete peersRef.current[participantId];
    }
  }, []);

  // Handle pending approval
  const handlePendingApproval = useCallback((participant) => {
    console.log('⏳ SimplePeer: Pending approval for:', participant);
    
    if (isHostRef.current) {
      setPendingApprovals(prev => [...prev, participant]);
      setShowPendingApprovals(true);
    } else {
      setIsWaitingForApproval(true);
    }
  }, []);

  // Approve participant
  const approveParticipant = useCallback((participantId, isApproved = true) => {
    console.log('✅ SimplePeer: Approving participant:', participantId, 'approved:', isApproved);
    
    // Immediately remove from pending approvals to prevent duplicate approvals
    setPendingApprovals(prev => {
      const filtered = prev.filter(p => p.id !== participantId);
      console.log('✅ SimplePeer: Removed participant from pending approvals:', {
        participantId,
        beforeCount: prev.length,
        afterCount: filtered.length
      });
      
      // If no more pending approvals, hide the dialog
      if (filtered.length === 0) {
        setShowPendingApprovals(false);
        console.log('✅ SimplePeer: No more pending approvals, hiding dialog');
      }
      
      return filtered;
    });
    
    if (socketRef.current && socketRef.current.connected) {
      if (isApproved) {
        socketRef.current.emit('approve-participant', { 
          meetingId, 
          participantId, 
          approved: true 
        });
      } else {
        socketRef.current.emit('reject-participant', { 
          meetingId, 
          participantId 
        });
      }
    }
  }, [meetingId]);

  // Reject participant
  const rejectParticipant = useCallback((participantId) => {
    console.log('❌ SimplePeer: Rejecting participant:', participantId);
    
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('reject-participant', { 
        meetingId, 
        participantId 
      });
    }
    
    setPendingApprovals(prev => prev.filter(p => p.id !== participantId));
  }, [meetingId]);

  // Create connections to all existing participants
  const createConnectionsToAllParticipants = useCallback(() => {
    if (!localStream || !socketRef.current) {
      console.log('🔗 SimplePeer: Cannot create connections - no local stream or socket');
      return;
    }
    
    console.log('🔗 SimplePeer: Creating connections to all existing participants');
    console.log('🔗 Current participants:', participants);
    console.log('🔗 Current socket ID:', socketRef.current.id);
    console.log('🔗 Local stream available:', !!localStream);
    console.log('🔗 Existing peer connections:', Object.keys(peersRef.current));
    console.log('🔗 Is host:', isHost);
    
    let connectionsCreated = 0;
    participants.forEach(participant => {
      console.log('🔗 Checking participant:', {
        id: participant.id,
        name: participant.name,
        isApproved: participant.isApproved,
        isNotSelf: participant.id !== socketRef.current.id,
        hasExistingConnection: !!peersRef.current[participant.id]
      });
      
      // Both host and participant should create connections to each other
      if (participant.id !== socketRef.current.id && participant.isApproved && !peersRef.current[participant.id]) {
        console.log('🔗 SimplePeer: Creating connection to participant:', participant.name, participant.id);
        const peer = createPeer(participant.id, true); // Both sides are initiators
        peersRef.current[participant.id] = peer;
        connectionsCreated++;
      }
    });
    
    console.log('🔗 SimplePeer: Created', connectionsCreated, 'new connections');
  }, [localStream, participants, createPeer, isHost]);

  // Handle participant approved
  const handleParticipantApproved = useCallback(async (data) => {
    console.log('✅ SimplePeer: Participant approved:', data);
    setIsWaitingForApproval(false);
    
    // Initialize media now that we're approved
    if (!localStream) {
      console.log('🎥 SimplePeer: Initializing media after approval...');
      await initializeMedia();
    }
    
    // Create connection to host specifically
    if (data.hostId && data.hostId !== socketRef.current.id) {
      console.log('🔗 SimplePeer: Creating connection to host:', data.hostName, data.hostId);
      setTimeout(() => {
        if (!peersRef.current[data.hostId]) {
          console.log('🔗 SimplePeer: Creating peer connection to host:', data.hostId);
          // Both sides should be initiators to ensure bidirectional connection
          const peer = createPeer(data.hostId, true);
          peersRef.current[data.hostId] = peer;
        } else {
          console.log('🔗 SimplePeer: Connection to host already exists:', data.hostId);
        }
      }, 1000);
    } else {
      console.log('🔗 SimplePeer: Not creating connection to host:', {
        hasHostId: !!data.hostId,
        isNotSelf: data.hostId !== socketRef.current.id,
        currentSocketId: socketRef.current?.id
      });
    }
    
    // Create connections to all existing participants after approval
    console.log('🔗 SimplePeer: Creating peer connections now that we are approved');
    setTimeout(() => {
      createConnectionsToAllParticipants();
    }, 1500); // Increased delay to ensure media is fully initialized
  }, [localStream, createConnectionsToAllParticipants, initializeMedia, createPeer]);

  // Handle participant rejected
  const handleParticipantRejected = useCallback(() => {
    console.log('❌ SimplePeer: Participant rejected');
    setIsWaitingForApproval(false);
  }, []);

  // Handle participant ready (when someone gets approved and is ready for WebRTC)
  const handleParticipantReady = useCallback((data) => {
    const { participantId, participantName } = data;
    console.log('🎯 SimplePeer: Participant ready for WebRTC:', participantId, participantName);
    console.log('🎯 SimplePeer: Conditions check:', {
      hasLocalStream: !!localStream,
      isNotSelf: participantId !== socketRef.current.id,
      hasExistingConnection: !!peersRef.current[participantId],
      currentSocketId: socketRef.current?.id,
      isHost: isHost
    });
    
    // Both host and participant should create connections to each other
    if (localStream && participantId !== socketRef.current.id && !peersRef.current[participantId]) {
      console.log('🔗 SimplePeer: Creating peer connection to approved participant:', participantName);
      const peer = createPeer(participantId, true); // Both sides are initiators
      peersRef.current[participantId] = peer;
    } else {
      console.log('🔗 SimplePeer: Not creating connection - conditions not met:', {
        hasLocalStream: !!localStream,
        isNotSelf: participantId !== socketRef.current.id,
        hasExistingConnection: !!peersRef.current[participantId]
      });
    }
  }, [localStream, createPeer, isHost]);

  // Auto-create connections when participants list changes
  useEffect(() => {
    if (participants.length > 0 && localStream && !isWaitingForApproval) {
      console.log('🔗 SimplePeer: Participants list changed, creating connections');
      console.log('🔗 SimplePeer: Local stream available for connections:', !!localStream);
      createConnectionsToAllParticipants();
    } else {
      console.log('🔗 SimplePeer: Not creating connections - conditions not met:', {
        participantsCount: participants.length,
        hasLocalStream: !!localStream,
        isWaitingForApproval
      });
    }
  }, [participants, localStream, isWaitingForApproval, createConnectionsToAllParticipants]);

  // Set up socket event listeners
  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    socket.on('meeting-joined', (data) => {
      console.log('🎉 SimplePeer: Meeting joined successfully!', data);
      if (data.isHost) {
        console.log('👑 SimplePeer: First participant - becoming host');
        setIsHost(true);
        isHostRef.current = true;
      } else {
        console.log('👤 SimplePeer: Joining as participant');
        setIsHost(false);
        isHostRef.current = false;
      }
      
      // Don't add current user to participants list - handled separately in SimpleVideoGrid
      console.log('👤 SimplePeer: Current user info:', {
        id: socketRef.current.id,
        name: userName,
        isHost: data.isHost
      });
    });

    console.log('🔌 SimplePeer: Setting up participant-joined event listener');
    socket.on('participant-joined', (data) => {
      console.log('🔌 SimplePeer: Received participant-joined event:', data);
      handleParticipantJoined(data);
    });
    socket.on('participant-left', handleParticipantLeft);
    socket.on('signal', handleSignal);
    socket.on('pending-approval', handlePendingApproval);
    socket.on('participant-approved', handleParticipantApproved);
    socket.on('participant-rejected', handleParticipantRejected);
    socket.on('participant-ready', handleParticipantReady);

    return () => {
      socket.off('meeting-joined');
      socket.off('participant-joined');
      socket.off('participant-left');
      socket.off('signal');
      socket.off('pending-approval');
      socket.off('participant-approved');
      socket.off('participant-rejected');
      socket.off('participant-ready');
    };
  }, [handleParticipantJoined, handleParticipantLeft, handleSignal, handlePendingApproval, handleParticipantApproved, handleParticipantRejected, handleParticipantReady]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Destroy all peer connections
      Object.values(peersRef.current).forEach(peer => {
        peer.destroy();
      });
      
      // Stop local stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [localStream]);

  // Debug logging
  console.log('🔍 useSimplePeer Debug:', {
    socket: !!socketRef.current,
    socketConnected: socketRef.current?.connected,
    pendingApprovals: pendingApprovals.length,
    showPendingApprovals,
    isHost,
    participants: participants.length
  });

  return {
    localStream,
    remoteStreams,
    participants,
    isConnected,
    pendingApprovals,
    showPendingApprovals,
    setShowPendingApprovals,
    isWaitingForApproval,
    localVideoRef,
    joinMeeting,
    initializeMedia,
    approveParticipant,
    rejectParticipant,
    isHost,
    socket: socketRef.current
  };
};

export default useSimplePeer;
