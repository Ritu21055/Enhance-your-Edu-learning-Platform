import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { getBackendUrl } from '../config/network';
import PeerOptimizer from '../utils/peerOptimizer';

const useSimplePeer = (meetingId, userName) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
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

  // Auto-initialize media
  useEffect(() => {
    const initMedia = async () => {
      console.log('🎥 SimplePeer: Auto-initializing media...');
      await initializeMedia();
    };
    
    initMedia();
  }, [isHost]);

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
      // Start with lower quality for better stability with multiple participants
      let videoWidth = 640;
      let videoHeight = 480;
      let frameRate = 24; // Lower frame rate for smoother playback
      let videoBitrate = 1000000; // 1 Mbps - lower for stability
      
      if (participantCount === 1) {
        // Only host - can use higher quality
        videoWidth = 960;
        videoHeight = 540;
        frameRate = 25;
        videoBitrate = 1500000; // 1.5 Mbps
      } else if (participantCount === 2) {
        // 2 participants - lower quality for stability
        videoWidth = 480;
        videoHeight = 360;
        frameRate = 20;
        videoBitrate = 600000; // 600 kbps - lower for stability
      } else if (participantCount <= 4) {
        // 3-4 participants - lower quality (OPTIMIZED)
        videoWidth = 480;
        videoHeight = 360;
        frameRate = 18; // Changed from 20 to 18 for better stability
        videoBitrate = 500000; // Changed from 800000 to 500000 - better stability
      } else {
        // 5+ participants - lowest quality
        videoWidth = 320;
        videoHeight = 240;
        frameRate = 15;
        videoBitrate = 500000; // 500 kbps
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
          facingMode: 'user',
          // Add latency constraints for smoother playback
          latency: 0.1
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Lower sample rate for better performance
          channelCount: 1,
          latency: 0.1
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
              width: videoWidth,
              height: videoHeight,
              frameRate: frameRate
            });
            console.log('✅ SimplePeer: Applied video constraints');
          } catch (constraintError) {
            console.warn('⚠️ SimplePeer: Could not apply all video constraints:', constraintError);
          }
        }
      }
      
      // Store bitrate for later use in peer connections
      if (videoTrack) {
        videoTrack._targetBitrate = videoBitrate;
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
    
    // CRITICAL: Ensure audio track is enabled in local stream before creating peer
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track, index) => {
        if (!track.enabled) {
          track.enabled = true;
          console.log(`🔊 SimplePeer: Pre-enabled audio track ${index} before creating peer for ${participantId}`);
        }
        console.log(`🔊 SimplePeer: Audio track ${index} state before peer creation:`, {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          label: track.label
        });
      });
    }
    
    const peer = new SimplePeer({
      initiator,
      trickle: true, // Enable trickle ICE for faster connection
      stream: localStream, // Always pass the local stream
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 3, // Reduced from 5 to 3 for better performance
        bundlePolicy: 'max-bundle', // Optimize for multiple streams
        rtcpMuxPolicy: 'require' // Reduce connections
      }
    });
    
    // Apply bitrate constraints to RTCRtpSender after peer connection is established
    // Also ensure audio tracks are enabled
    if (peer._pc && localStream) {
      peer._pc.addEventListener('track', (event) => {
        if (event.track.kind === 'video') {
          const sender = peer._pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender && sender.setParameters) {
            try {
              const params = sender.getParameters();
              if (!params.encodings) {
                params.encodings = [{}];
              }
              const videoTrack = localStream.getVideoTracks()[0];
              const targetBitrate = videoTrack?._targetBitrate || 500000; // Default 500 kbps for stability
              params.encodings[0].maxBitrate = targetBitrate;
              params.encodings[0].maxFramerate = 18; // Lower framerate for stability (changed from 20 to 18)
              sender.setParameters(params);
              console.log(`✅ SimplePeer: Applied bitrate constraint (${targetBitrate / 1000} kbps) for ${participantId}`);
            } catch (error) {
              console.warn(`⚠️ SimplePeer: Could not set bitrate for ${participantId}:`, error);
            }
          }
        }
      });
      
      // CRITICAL: Monitor and ensure audio tracks are enabled in senders
      const checkAudioSenders = () => {
        if (!peer._pc) return;
        const senders = peer._pc.getSenders();
        const audioSenders = senders.filter(s => s.track && s.track.kind === 'audio');
        audioSenders.forEach((sender, index) => {
          if (sender.track && !sender.track.enabled) {
            sender.track.enabled = true;
            console.log(`🔊 SimplePeer: Force enabled audio track in sender ${index} for ${participantId}`);
          }
        });
      };
      
      // Check immediately and after a short delay
      setTimeout(checkAudioSenders, 100);
      setTimeout(checkAudioSenders, 1000);
    }
    
    // Initialize connection monitoring (minimal tracking)
    connectionMonitoringRef.current[participantId] = {
      lastConnectionState: 'new',
      lastIceState: 'new',
      reconnectAttempts: 0,
      monitoringInterval: null,
      hasAttemptedReconnect: false
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
        const videoTrack = videoTracks[0];
        console.log(`🎥 SimplePeer: Video track details for ${participantId}:`, {
          trackId: videoTrack.id,
          trackKind: videoTrack.kind,
          trackEnabled: videoTrack.enabled,
          trackMuted: videoTrack.muted,
          trackReadyState: videoTrack.readyState
        });
        
        // Add event listeners to monitor track state
        videoTrack.addEventListener('ended', () => {
          console.warn(`⚠️ SimplePeer: Video track ended for ${participantId}`);
        });
        
        videoTrack.addEventListener('mute', () => {
          console.log(`🔇 SimplePeer: Video track muted for ${participantId}`);
        });
        
        videoTrack.addEventListener('unmute', () => {
          console.log(`🔊 SimplePeer: Video track unmuted for ${participantId}`);
        });
      } else {
        console.warn(`⚠️ SimplePeer: No video tracks in stream from ${participantId}`);
      }
      
      // Monitor audio tracks too
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].addEventListener('ended', () => {
          console.warn(`⚠️ SimplePeer: Audio track ended for ${participantId}`);
        });
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
        
        // CRITICAL: Ensure audio track is enabled before adding stream
        const audioTracks = localStream.getAudioTracks();
        audioTracks.forEach((track, index) => {
          if (!track.enabled) {
            track.enabled = true;
            console.log(`🔊 SimplePeer: Force enabled audio track ${index} for ${participantId}`);
          }
          console.log(`🔊 SimplePeer: Audio track ${index} state for ${participantId}:`, {
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            label: track.label
          });
        });
        
        try {
          peer.addStream(localStream);
          console.log(`🔗 SimplePeer: Successfully added local stream to peer for ${participantId}`);
          
          // CRITICAL: Verify audio track is in peer connection and enabled
          if (peer._pc) {
            const senders = peer._pc.getSenders();
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
            if (audioSender && audioSender.track) {
              if (!audioSender.track.enabled) {
                audioSender.track.enabled = true;
                console.log(`🔊 SimplePeer: Force enabled audio track in sender for ${participantId}`);
              }
              console.log(`🔊 SimplePeer: Audio sender verified for ${participantId}:`, {
                trackId: audioSender.track.id,
                enabled: audioSender.track.enabled,
                muted: audioSender.track.muted,
                readyState: audioSender.track.readyState
              });
            } else {
              console.warn(`⚠️ SimplePeer: No audio sender found for ${participantId}, attempting to add audio track...`);
              // Try to add audio track directly if missing
              const audioTrack = localStream.getAudioTracks()[0];
              if (audioTrack) {
                try {
                  peer._pc.addTrack(audioTrack, localStream);
                  console.log(`✅ SimplePeer: Added audio track directly to peer connection for ${participantId}`);
                } catch (err) {
                  console.error(`❌ SimplePeer: Failed to add audio track for ${participantId}:`, err);
                }
              }
            }
          }
        } catch (error) {
          console.log(`🔗 SimplePeer: Stream already added to peer for ${participantId}:`, error.message);
          
          // Even if stream is already added, ensure audio track is enabled
          if (peer._pc) {
            const senders = peer._pc.getSenders();
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
            if (audioSender && audioSender.track && !audioSender.track.enabled) {
              audioSender.track.enabled = true;
              console.log(`🔊 SimplePeer: Force enabled existing audio track in sender for ${participantId}`);
            }
          }
        }
      } else {
        console.log(`🔗 SimplePeer: No local stream available for ${participantId}`);
      }
      
      // Disable aggressive connection monitoring - let WebRTC handle it naturally
      // Only monitor for critical failures, not temporary disconnects
      // if (peer._pc) {
      //   startConnectionMonitoring(participantId, peer);
      // }
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
        
        // Only handle actual failures, not temporary disconnects
        // WebRTC will automatically recover from temporary disconnects
        if (connectionState === 'failed' || iceState === 'failed') {
          // Only reconnect on actual failure, and only once
          const monitoring = connectionMonitoringRef.current[pid];
          if (!monitoring.hasAttemptedReconnect) {
            monitoring.hasAttemptedReconnect = true;
            console.warn(`⚠️ SimplePeer: Connection failed for ${pid}, will attempt reconnection once...`);
            // Wait 10 seconds before attempting reconnection
            setTimeout(() => {
              if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
                if (attemptReconnectionRef.current) {
                  attemptReconnectionRef.current(pid);
                }
              }
            }, 10000);
          }
        } else if (connectionState === 'connected' && iceState === 'connected') {
          // Connection is healthy - reset failure tracking
          const monitoring = connectionMonitoringRef.current[pid];
          if (monitoring) {
            monitoring.hasAttemptedReconnect = false;
          }
          reconnectionAttemptsRef.current[pid] = 0;
        }
        // Don't reconnect on 'disconnected' - let WebRTC recover naturally
      };
      
      // Check connection state every 15 seconds (much less frequent to avoid performance issues)
      const interval = setInterval(checkConnection, 15000);
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
      
      // Don't automatically reconnect on close - let the natural flow handle it
      // Automatic reconnection can cause connection loops and performance issues
      console.log(`🔌 SimplePeer: Connection closed with ${participantId} - will reconnect naturally if needed`);
    });

    return peer;
  }, [localStream]);

  // Define attemptReconnection after createPeer to avoid circular dependency
  const attemptReconnection = useCallback((pid) => {
    const maxAttempts = 1; // Changed from 3 to 1 - better stability
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
        if (participant && !peersRef.current[pid]) {
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

  // Handle participant joined
  const handleParticipantJoined = useCallback((data) => {
    const { participant } = data;
    console.log('👋 SimplePeer: New participant joined:', participant);
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

    // Create peer connections for all participants
    if (localStream && participant.id !== socketRef.current.id) {
      console.log('🔗 SimplePeer: Creating peer connection for participant:', participant.name);
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
      if (participant.id !== socketRef.current.id && !peersRef.current[participant.id]) {
        console.log('🔗 SimplePeer: Creating connection to participant:', participant.name, participant.id);
        const peer = createPeer(participant.id, true); // Both sides are initiators
        peersRef.current[participant.id] = peer;
        connectionsCreated++;
      }
    });
    
    console.log('🔗 SimplePeer: Created', connectionsCreated, 'new connections');
  }, [localStream, participants, createPeer, isHost]);


  // Auto-create connections when participants list changes
  useEffect(() => {
    if (participants.length > 0 && localStream) {
      console.log('🔗 SimplePeer: Participants list changed, creating connections');
      console.log('🔗 SimplePeer: Local stream available for connections:', !!localStream);
      createConnectionsToAllParticipants();
    } else {
      console.log('🔗 SimplePeer: Not creating connections - conditions not met:', {
        participantsCount: participants.length,
        hasLocalStream: !!localStream
      });
    }
  }, [participants, localStream, createConnectionsToAllParticipants]);

  // CRITICAL: Periodically ensure audio tracks are enabled in all peer connections
  useEffect(() => {
    if (!localStream || !isHost) return; // Only for host
    
    const ensureAudioEnabled = () => {
      // Ensure audio tracks in local stream are enabled
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track, index) => {
        if (!track.enabled) {
          track.enabled = true;
          console.log(`🔊 SimplePeer: Periodic check - enabled audio track ${index} in local stream`);
        }
      });
      
      // Ensure audio tracks in all peer connections are enabled
      Object.entries(peersRef.current).forEach(([participantId, peer]) => {
        if (peer && peer._pc) {
          const senders = peer._pc.getSenders();
          const audioSenders = senders.filter(s => s.track && s.track.kind === 'audio');
          audioSenders.forEach((sender, index) => {
            if (sender.track && !sender.track.enabled) {
              sender.track.enabled = true;
              console.log(`🔊 SimplePeer: Periodic check - enabled audio track in sender ${index} for ${participantId}`);
            }
          });
        }
      });
    };
    
    // Check immediately and then every 5 seconds
    ensureAudioEnabled();
    const interval = setInterval(ensureAudioEnabled, 5000);
    
    return () => clearInterval(interval);
  }, [localStream, isHost]);

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

    return () => {
      socket.off('meeting-joined');
      socket.off('participant-joined');
      socket.off('participant-left');
      socket.off('signal');
    };
  }, [handleParticipantJoined, handleParticipantLeft, handleSignal]);

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
    isHost,
    participants: participants.length
  });

  return {
    localStream,
    remoteStreams,
    participants,
    isConnected,
    localVideoRef,
    joinMeeting,
    initializeMedia,
    isHost,
    socket: socketRef.current
  };
};

export default useSimplePeer;
