import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook to manage media requests (camera & mic) from host
 */
export const useMediaRequest = (socket, meetingId, isHost, localStream) => {
  const [pendingRequest, setPendingRequest] = useState(null);
  const [activeRequest, setActiveRequest] = useState(null);
  const requestTimerRef = useRef(null);

  // Debug: Log hook initialization
  useEffect(() => {
    console.log('🔧 useMediaRequest: Hook initialized', {
      hasSocket: !!socket,
      socketId: socket?.id,
      meetingId,
      isHost,
      hasLocalStream: !!localStream
    });
  }, []);

  // Listen for media requests (participant side)
  useEffect(() => {
    console.log('🔧 useMediaRequest: useEffect triggered', {
      hasSocket: !!socket,
      socketId: socket?.id,
      socketConnected: socket?.connected,
      isHost,
      meetingId
    });

    if (!socket) {
      console.warn('⚠️ useMediaRequest: No socket available');
      return;
    }

    // Wait for socket to connect and get ID
    if (!socket.connected || !socket.id) {
      console.log('⏳ useMediaRequest: Socket not connected yet, waiting...', {
        connected: socket.connected,
        socketId: socket.id
      });
      
      const handleConnect = () => {
        console.log('✅ useMediaRequest: Socket connected, setting up listeners', socket.id);
        setupListeners();
      };

      socket.on('connect', handleConnect);
      
      return () => {
        socket.off('connect', handleConnect);
      };
    }
    
    if (isHost) {
      console.log('ℹ️ useMediaRequest: Host detected, not listening for requests');
      return;
    }

    setupListeners();

    function setupListeners() {
      if (!socket || !socket.id) {
        console.error('❌ useMediaRequest: Cannot setup listeners - socket or socket.id missing', {
          hasSocket: !!socket,
          socketId: socket?.id,
          socketConnected: socket?.connected
        });
        return;
      }

      console.log('👂 useMediaRequest: Setting up listeners for participant', socket.id);

      const handleMediaRequest = (requestData) => {
      console.log('📹 ========== MEDIA REQUEST RECEIVED ==========');
      console.log('📹 Full request data:', requestData);
      console.log('📹 Participant socket ID:', socket.id);
      console.log('📹 Request participant ID:', requestData.participantId);
      console.log('📹 Request type:', requestData.requestType);
      console.log('📹 Duration:', requestData.duration);
      console.log('📹 Host name:', requestData.hostName);
      
      // Verify this request is for this participant
      if (requestData.participantId === socket.id) {
        console.log('✅ Request participant ID matches socket ID - Setting as pending');
        setPendingRequest(requestData);
      } else {
        console.error('❌ Request participant ID does NOT match socket ID!');
        console.error('❌ Expected:', socket.id);
        console.error('❌ Received:', requestData.participantId);
      }
    };

    const handleRequestExpired = () => {
      console.log('⏰ Media request expired (from backend)');
      
      if (activeRequest) {
        // CRITICAL: Disable tracks FIRST before updating UI state
        if (localStream) {
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = false;
            console.log('✅ Video track disabled on expiration');
          }

          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = false;
            console.log('✅ Audio track disabled on expiration');
          }
        }

        // Update UI state after tracks are disabled
        setTimeout(() => {
          if (window.setIsVideoEnabled) {
            window.setIsVideoEnabled(false);
          }
          if (window.setIsAudioEnabled) {
            window.setIsAudioEnabled(false);
          }

          // Emit media state change to notify other participants
          if (socket && meetingId && socket.connected) {
            const participantId = socket.id;
            socket.emit('media-state-change', {
              meetingId,
              participantId,
              audioEnabled: false,
              videoEnabled: false,
              timestamp: Date.now()
            });
            console.log('✅ Expiration media state change emitted to socket');
          }

          setActiveRequest(null);
          if (requestTimerRef.current) {
            clearTimeout(requestTimerRef.current);
            requestTimerRef.current = null;
          }
        }, 100);
      }
    };

      socket.on('media-request-received', handleMediaRequest);
      socket.on('media-request-expired', handleRequestExpired);
      
      console.log('✅ useMediaRequest: Event listeners registered for participant', socket.id);
    }

    // Cleanup function
    return () => {
      if (socket) {
        console.log('🧹 useMediaRequest: Cleaning up event listeners');
        socket.off('media-request-received');
        socket.off('media-request-expired');
        socket.off('connect');
      }
    };
  }, [socket, isHost, activeRequest]);

  // Handle accepting request
  const acceptRequest = useCallback(() => {
    if (!pendingRequest || !socket) return;

    console.log('✅ Accepting media request:', {
      requestType: pendingRequest.requestType,
      duration: pendingRequest.duration,
      hasLocalStream: !!localStream
    });

    // Send acceptance
    socket.emit('media-request-response', {
      meetingId,
      requestId: pendingRequest.participantId,
      accepted: true
    });

    // CRITICAL: Enable tracks FIRST before updating state
    if (localStream) {
      // Enable video track
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = true;
        console.log('✅ Video track enabled:', {
          trackId: videoTrack.id,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState
        });
      }

      // Enable audio track
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
        console.log('✅ Audio track enabled:', {
          trackId: audioTrack.id,
          enabled: audioTrack.enabled,
          readyState: audioTrack.readyState
        });
      }

      // Force stream to be active
      if (!localStream.active) {
        console.warn('⚠️ Local stream not active, attempting to reactivate');
      }
    }

    // Turn on both camera and mic (update state)
    // Use setTimeout to ensure tracks are enabled first
    setTimeout(() => {
      if (window.setIsVideoEnabled) {
        window.setIsVideoEnabled(true);
        console.log('✅ Video state set to enabled via window.setIsVideoEnabled');
      }
      if (window.setIsAudioEnabled) {
        window.setIsAudioEnabled(true);
        console.log('✅ Audio state set to enabled via window.setIsAudioEnabled');
      }

      // CRITICAL: Enable tracks in peer connections
      // Note: If tracks are already in peer connections, just enabling them should be enough
      // WebRTC will automatically start sending enabled tracks
      // Only replace tracks if they're not already in the connection
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];
        
        console.log('🔄 Enabling tracks in peer connections:', {
          hasVideoTrack: !!videoTrack,
          hasAudioTrack: !!audioTrack,
          videoTrackEnabled: videoTrack?.enabled,
          audioTrackEnabled: audioTrack?.enabled
        });
        
        // ROOT CAUSE FIX: Enable tracks directly without triggering renegotiation
        // This prevents host's video from disappearing when participant accepts
        if (window.peersRef && localStream) {
          const videoTrack = localStream.getVideoTracks()[0];
          const audioTrack = localStream.getAudioTracks()[0];
          
          Object.entries(window.peersRef.current || {}).forEach(([participantId, peer]) => {
            if (!peer || !peer._pc) return;
            
            try {
              const pc = peer._pc;
              const senders = pc.getSenders();
              
              if (videoTrack) {
                const videoSender = senders.find(s => s.track?.kind === 'video');
                if (videoSender?.track && !videoSender.track.enabled) {
                  videoSender.track.enabled = true;
                }
              }
              
              if (audioTrack) {
                const audioSender = senders.find(s => s.track?.kind === 'audio');
                if (audioSender?.track && !audioSender.track.enabled) {
                  audioSender.track.enabled = true;
                }
              }
            } catch (err) {
              // Silent fail - tracks will be enabled via media-state-change
            }
          });
        }
      }

      // Emit media state change to notify other participants
      if (socket && meetingId && socket.connected) {
        const participantId = socket.id;
        socket.emit('media-state-change', {
          meetingId,
          participantId,
          audioEnabled: true,
          videoEnabled: true,
          timestamp: Date.now()
        });
        console.log('✅ Media state change emitted to socket');
      }
    }, 200); // Increased delay to ensure tracks are ready

    // Force video element to play if available
    // Handle both ref object and direct ref
    const videoRef = window.localVideoRef?.current || window.localVideoRef;
    if (videoRef) {
      const videoEl = typeof videoRef === 'object' && 'current' in videoRef ? videoRef.current : videoRef;
      if (videoEl && videoEl.srcObject) {
        // Ensure srcObject is set
        if (localStream && videoEl.srcObject !== localStream) {
          videoEl.srcObject = localStream;
        }
        // Force play
        videoEl.play().catch(err => {
          console.warn('⚠️ Failed to play video after accepting request:', err);
        });
        console.log('✅ Video element play() called');
      }
    }

    // Set active request and timer
    setActiveRequest(pendingRequest);
    setPendingRequest(null);

    // Set timer to auto-turn off
    const remainingTime = pendingRequest.expiresAt - Date.now();
    requestTimerRef.current = setTimeout(() => {
      console.log('⏰ Media request auto-expiration triggered');
      
      // CRITICAL: Disable tracks FIRST before updating UI state
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = false;
          console.log('✅ Video track disabled:', {
            trackId: videoTrack.id,
            enabled: videoTrack.enabled,
            readyState: videoTrack.readyState
          });
        }

        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
          console.log('✅ Audio track disabled:', {
            trackId: audioTrack.id,
            enabled: audioTrack.enabled,
            readyState: audioTrack.readyState
          });
        }
      }

      // CRITICAL: Hide participant's own local video element immediately to prevent freeze
      // DON'T replace with blank stream - just hide it, this prevents freezing
      const videoRef = window.localVideoRef?.current || window.localVideoRef;
      if (videoRef) {
        const videoEl = typeof videoRef === 'object' && 'current' in videoRef ? videoRef.current : videoRef;
        if (videoEl) {
          console.log('📹 Hiding participant local video element on timer expiration');
          videoEl.style.opacity = '0';
          videoEl.style.visibility = 'hidden';
          videoEl.style.display = 'none';
          videoEl.pause();
          // Keep the original stream - don't replace with blank stream (causes freezing)
        }
      }

      // Update UI state after tracks are disabled
      // CRITICAL: Update state immediately to trigger video hiding
      if (window.setIsVideoEnabled) {
        window.setIsVideoEnabled(false);
        console.log('✅ Video state set to disabled via window.setIsVideoEnabled');
      }
      if (window.setIsAudioEnabled) {
        window.setIsAudioEnabled(false);
        console.log('✅ Audio state set to disabled via window.setIsAudioEnabled');
      }
      
      // Force updateVideo to run immediately to hide video
      // This ensures the video element is hidden right away
      setTimeout(() => {
        // Trigger updateVideo by dispatching a custom event or calling it directly
        if (window.updateVideoCallLocalVideo) {
          window.updateVideoCallLocalVideo();
          console.log('✅ Called updateVideoCallLocalVideo to force video hiding');
        }

        // Emit media state change to notify other participants about auto-off
        if (socket && meetingId && socket.connected) {
          const participantId = socket.id;
          socket.emit('media-state-change', {
            meetingId,
            participantId,
            audioEnabled: false,
            videoEnabled: false,
            timestamp: Date.now()
          });
          console.log('✅ Auto-off media state change emitted to socket');
        }

        setActiveRequest(null);
        if (requestTimerRef.current) {
          clearTimeout(requestTimerRef.current);
          requestTimerRef.current = null;
        }
      }, 100); // Small delay to ensure tracks are disabled first
    }, remainingTime);

    console.log('✅ Media request accepted, will auto-turn off in', remainingTime, 'ms');
  }, [pendingRequest, socket, meetingId, localStream]);

  // Handle denying request
  const denyRequest = useCallback(() => {
    if (!pendingRequest || !socket) return;

    socket.emit('media-request-response', {
      meetingId,
      requestId: pendingRequest.participantId,
      accepted: false
    });

    setPendingRequest(null);
    console.log('❌ Media request denied');
  }, [pendingRequest, socket, meetingId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (requestTimerRef.current) {
        clearTimeout(requestTimerRef.current);
      }
    };
  }, []);

  return {
    pendingRequest,
    activeRequest,
    acceptRequest,
    denyRequest
  };
};

