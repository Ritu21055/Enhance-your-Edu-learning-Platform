import { useState, useEffect, useRef } from 'react';

/**
 * Clean Media Controls Hook
 * Simple, reliable audio/video/screen share controls
 */
export const useMediaControls = (localStream, onScreenShareChange, socket, meetingId, participantId) => {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabledState, setIsVideoEnabledState] = useState(true);
  
  // Alias for compatibility
  const isVideoEnabled = isVideoEnabledState;
  const setIsVideoEnabled = (value) => {
    const stack = new Error().stack;
    const caller = stack?.split('\n')[2]?.trim() || 'unknown';
    
    console.log('🔍🔍🔍 setIsVideoEnabled CALLED', {
      newValue: value,
      currentValue: isVideoEnabledState,
      currentRef: isVideoEnabledRef.current,
      caller: caller,
      timestamp: Date.now(),
      stackTrace: stack
    });
    
    // CRITICAL: If video is being disabled, check if it's during audio toggle
    // BUT: Ignore if it's from user's explicit video toggle action
    if (value === false && isVideoEnabledState === true) {
      const timeSinceAudioToggle = Date.now() - lastToggleTimeRef.current;
      const isUserVideoToggle = stack.includes('toggleVideo') || caller.includes('toggleVideo');
      
      if (timeSinceAudioToggle < 5000 && !isUserVideoToggle) {
        console.error('🔍🔍🔍 ❌❌❌ CRITICAL: setIsVideoEnabled(false) called during/after audio toggle!', {
          timeSinceAudioToggle,
          caller: caller,
          isUserVideoToggle: false,
          stackTrace: stack
        });
      } else if (isUserVideoToggle) {
        console.log('🔍🔍🔍 ✅ User explicitly toggling video (not audio-related)', {
          timeSinceAudioToggle,
          caller: caller
        });
      }
    }
    
    isVideoEnabledRef.current = value;
    setIsVideoEnabledState(value);
  };
  
  // CRITICAL: Keep ref in sync with state
  useEffect(() => {
    console.log('🔍🔍🔍 isVideoEnabledState CHANGED', {
      newValue: isVideoEnabledState,
      oldRefValue: isVideoEnabledRef.current,
      stackTrace: new Error().stack
    });
    isVideoEnabledRef.current = isVideoEnabledState;
  }, [isVideoEnabledState]);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const screenVideoRef = useRef();
  // CRITICAL: Ref to lock video state during audio toggle
  const videoStateLockRef = useRef(false);
  // CRITICAL: Ref to track if video toggle was explicitly called by user
  const videoToggleCalledRef = useRef(false);
  // CRITICAL: Track last toggle time to prevent sync interference
  const lastToggleTimeRef = useRef(0);
  // CRITICAL: Ref to store current video enabled state for access in callbacks
  const isVideoEnabledRef = useRef(true);
  // CRITICAL: Ref to store localStream to avoid stale closures
  const localStreamRef = useRef(localStream);
  
  // Update localStream ref when it changes
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);
  
  // CRITICAL: Protected setter for video state - prevents accidental disabling
  const setVideoEnabledSafe = (value, isUserAction = false) => {
    if (isUserAction) {
      // User action - always allow
      videoToggleCalledRef.current = true;
      setIsVideoEnabled(value);
      setTimeout(() => {
        videoToggleCalledRef.current = false;
      }, 100);
    } else {
      // Not a user action
      // CRITICAL: Block disabling video unless it's a user action
      if (!value && !videoToggleCalledRef.current) {
        console.warn('🔇 useMediaControls: Attempt to disable video blocked (not user action)');
        return; // Block the disable
      }
      // Allow enabling or if video toggle was just called
      setIsVideoEnabled(value);
    }
  };

  // CRITICAL: Only sync ONCE when stream is first created
  // NEVER sync video state after that - let user actions control it completely
  const hasSyncedRef = useRef(false);
  
  useEffect(() => {
    if (!localStream || hasSyncedRef.current) return;

    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];

    // Only sync audio from track (audio can be controlled by track)
    if (audioTrack) {
      setIsAudioEnabled(audioTrack.enabled);
    }
    
    // CRITICAL: Only sync video ONCE when stream is first created
    // After that, NEVER sync video - user actions control it
    if (videoTrack) {
      // Initial sync - set state from track (this is initial setup, so allow it)
      const initialVideoState = videoTrack.enabled;
      setIsVideoEnabled(initialVideoState);
      isVideoEnabledRef.current = initialVideoState;
      console.log('🔧 useMediaControls: Initial video sync from track:', initialVideoState);
    }
    
    hasSyncedRef.current = true;
  }, [localStream?.id]); // ONLY run when stream ID changes (new stream)
  
  // CRITICAL: ONE-WAY sync: STATE -> TRACK only
  // This effect ONLY ensures track matches state when state changes
  // CRITICAL: Skip sync if it's immediately after a toggle (prevent race conditions)
  useEffect(() => {
    console.log('🔧🔧🔧 SYNC EFFECT TRIGGERED', {
      hasLocalStream: !!localStream,
      hasSynced: hasSyncedRef.current,
      isVideoEnabled: isVideoEnabled,
      isVideoEnabledRef: isVideoEnabledRef.current,
      localStreamId: localStream?.id,
      stackTrace: new Error().stack
    });
    
    if (!localStream || !hasSyncedRef.current) {
      console.log('🔧 SYNC: Skipped - no stream or not synced');
      return;
    }
    
    // CRITICAL: Skip sync if toggle just happened (within last 2000ms)
    // Increased time to prevent interference with audio toggle
    const timeSinceToggle = Date.now() - lastToggleTimeRef.current;
    console.log('🔧 SYNC: Time since last toggle:', timeSinceToggle, 'ms');
    
    if (timeSinceToggle < 2000) {
      console.log('🔧 SYNC: ✅ Skipped - toggle too recent (', timeSinceToggle, 'ms)');
      return;
    }
    
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) {
      console.log('🔧 SYNC: Skipped - no video track');
      return;
    }
    
    console.log('🔧 SYNC: Running sync check', {
      isVideoEnabled: isVideoEnabled,
      isVideoEnabledRef: isVideoEnabledRef.current,
      videoTrackEnabled: videoTrack.enabled,
      timeSinceToggle: timeSinceToggle,
      lastToggleTime: lastToggleTimeRef.current
    });
    
    // CRITICAL: ONE-WAY sync: If state says enabled, ensure track is enabled
    // If state says disabled, ensure track is disabled
    // This is a simple one-way sync - state controls track
    // CRITICAL: Only disable if state is explicitly false AND enough time has passed
    if (isVideoEnabled && !videoTrack.enabled) {
      console.warn('🔧 SYNC: ⚠️ State says enabled but track disabled - enabling track');
      console.trace('🔧 SYNC: Where is track being disabled?');
      videoTrack.enabled = true;
    } else if (!isVideoEnabled && videoTrack.enabled) {
      // CRITICAL: Only disable if enough time has passed since last toggle
      // This prevents accidental disabling during audio toggle
      if (timeSinceToggle >= 2000) {
        console.log('🔧 SYNC: State says disabled and enough time passed - disabling track');
        videoTrack.enabled = false;
      } else {
        console.error('🔧 SYNC: ❌❌❌ State says disabled but toggle too recent - SKIPPING disable', {
          timeSinceToggle,
          isVideoEnabled,
          videoTrackEnabled: videoTrack.enabled,
          lastToggleTime: lastToggleTimeRef.current,
          currentTime: Date.now()
        });
        console.trace('🔧 SYNC: Why is state false?');
        
        // CRITICAL: If state is false but toggle was recent, restore it
        // This might be an accidental state change during audio toggle
        if (timeSinceToggle < 2000) {
          console.error('🔧 SYNC: ❌❌❌ RESTORING video state - it was disabled too soon after toggle');
          setIsVideoEnabled(true);
          videoTrack.enabled = true;
        }
      }
    } else {
      console.log('🔧 SYNC: ✅ State and track are in sync');
    }
  }, [isVideoEnabled, localStream?.id]); // Run when video state changes

  // Emit media state to server
  const emitMediaState = (audioEnabled, videoEnabled) => {
    if (socket && meetingId && participantId && socket.connected) {
      socket.emit('media-state-change', {
        meetingId,
        participantId,
        audioEnabled,
        videoEnabled,
        timestamp: Date.now()
      });
    }
  };

  // Toggle Audio - SIMPLE: Only touch audio, protect video
  const toggleAudio = () => {
    // Check if audio is locked by host request
    if (window.isAudioLocked) {
      console.warn('🔇 Audio is locked by host request - cannot toggle');
      return;
    }
    
    console.log('🔇🔇🔇🔇 AUDIO TOGGLE START - DETAILED DEBUG');
    console.trace('🔇 Stack trace at audio toggle start');
    
    if (!localStream) {
      console.warn('🔇 useMediaControls: No local stream for audio toggle');
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn('🔇 useMediaControls: No audio track found');
      return;
    }

    // CRITICAL: Capture video state BEFORE any operations
    const videoTrack = localStream.getVideoTracks()[0];
    const videoWasEnabled = isVideoEnabledRef.current; // Use ref for current value
    const videoTrackWasEnabled = videoTrack?.enabled ?? false;
    const videoStateFromState = isVideoEnabled; // Also check state
    
    console.log('🔇🔇 BEFORE AUDIO TOGGLE:', {
      audioCurrent: audioTrack.enabled,
      videoState: videoWasEnabled,
      videoStateFromState: videoStateFromState,
      videoTrackEnabled: videoTrackWasEnabled,
      isVideoEnabledRef: isVideoEnabledRef.current,
      videoTrackId: videoTrack?.id,
      lastToggleTime: lastToggleTimeRef.current,
      timeSinceLastToggle: Date.now() - lastToggleTimeRef.current
    });
    
    // CRITICAL: Mark that we're toggling audio - prevent sync effect from interfering
    const toggleStartTime = Date.now();
    lastToggleTimeRef.current = toggleStartTime;
    // CRITICAL: Store in window for VideoCall to check
    window.lastAudioToggleTime = toggleStartTime;
    console.log('🔇🔇 Marked toggle time:', toggleStartTime);

    // ONLY toggle audio track
    const newAudioState = !audioTrack.enabled;
    console.log('🔇🔇 About to toggle audio from', audioTrack.enabled, 'to', newAudioState);
    
    audioTrack.enabled = newAudioState;
    console.log('🔇🔇 Audio track toggled, new state:', audioTrack.enabled);
    
    setIsAudioEnabled(newAudioState);
    console.log('🔇🔇 Audio state updated to:', newAudioState);

    // CRITICAL: Check video IMMEDIATELY after audio toggle
    console.log('🔇🔇 IMMEDIATELY AFTER AUDIO TOGGLE:', {
      videoTrackEnabled: videoTrack?.enabled,
      videoState: isVideoEnabled,
      videoStateRef: isVideoEnabledRef.current,
      videoWasEnabled: videoWasEnabled,
      videoTrackWasEnabled: videoTrackWasEnabled
    });

    // CRITICAL: Protect video if it was enabled
    if (videoTrack && videoWasEnabled) {
      console.log('🔇🔇 Video should be enabled, checking...');
      
      // Check track
      if (!videoTrack.enabled) {
        console.error('🔇🔇 ❌❌❌ VIDEO TRACK WAS DISABLED! Re-enabling immediately');
        console.trace('🔇🔇 Where did video track get disabled?');
        videoTrack.enabled = true;
        console.log('🔇🔇 ✅ Video track re-enabled');
      } else {
        console.log('🔇🔇 ✅ Video track is still enabled');
      }
      
      // Check state
      if (!isVideoEnabledRef.current) {
        console.error('🔇🔇 ❌❌❌ VIDEO STATE WAS CHANGED TO FALSE! Restoring immediately');
        console.trace('🔇🔇 Where did video state get changed?');
        setIsVideoEnabled(true);
        console.log('🔇🔇 ✅ Video state restored');
      } else {
        console.log('🔇🔇 ✅ Video state is still enabled');
      }
      
      // CRITICAL: Immediately force video element to be visible and playing (SYNCHRONOUS)
      // This fixes the black screen issue where state is correct but video element is hidden
      const videoElement = document.querySelector('video.local-video');
      const currentStream = localStreamRef.current || localStream;
      if (videoElement && currentStream) {
        // Force visibility immediately
        videoElement.style.opacity = '1';
        videoElement.style.visibility = 'visible';
        videoElement.style.display = 'block';
        
        // Ensure srcObject is set
        if (videoElement.srcObject !== currentStream) {
          console.warn('🔇🔇 ❌ IMMEDIATE: Video element lost srcObject, restoring');
          videoElement.srcObject = currentStream;
        }
        
        // Force play if paused
        if (videoElement.paused && videoElement.srcObject) {
          videoElement.play().catch(err => {
            console.error('🔇🔇 ❌ IMMEDIATE: Error playing video', err);
          });
        }
        console.log('🔇🔇 ✅ Video element forced visible immediately');
      }
      
      // CRITICAL: Also check in next frame to catch any delayed changes
      requestAnimationFrame(() => {
        // Find video element - use fresh stream reference
        const videoElement = document.querySelector('video.local-video');
        const currentStream = localStreamRef.current || localStream;
        if (videoElement && videoWasEnabled && currentStream) {
          // Force video element to be visible
          videoElement.style.opacity = '1';
          videoElement.style.visibility = 'visible';
          videoElement.style.display = 'block';
          
          // Ensure srcObject is set
          if (videoElement.srcObject !== currentStream) {
            console.warn('🔇🔇 ❌ RAF: Video element lost srcObject, restoring');
            videoElement.srcObject = currentStream;
          }
          
          // Force play if paused
          if (videoElement.paused && videoElement.srcObject) {
            videoElement.play().catch(err => {
              console.error('🔇🔇 ❌ RAF: Error playing video element', err);
            });
          }
        }
        
        console.log('🔇🔇 RAF check after audio toggle:', {
          videoTrackEnabled: videoTrack?.enabled,
          videoStateRef: isVideoEnabledRef.current,
          videoState: isVideoEnabledState,
          videoWasEnabled: videoWasEnabled,
          videoElementFound: !!videoElement,
          videoElementPaused: videoElement?.paused,
          videoElementSrcObject: !!videoElement?.srcObject
        });
        
        if (videoTrack && videoWasEnabled) {
          if (!videoTrack.enabled) {
            console.error('🔇🔇 ❌ RAF: Video track disabled, re-enabling');
            videoTrack.enabled = true;
          }
          if (!isVideoEnabledRef.current) {
            console.error('🔇🔇 ❌ RAF: Video state ref changed, restoring');
            setIsVideoEnabled(true);
          }
          if (!isVideoEnabledState) {
            console.error('🔇🔇 ❌ RAF: Video state changed, restoring');
            setIsVideoEnabled(true);
          }
        }
      });
      
      // Additional checks after delays to catch any delayed state changes
      // CRITICAL: Also force video element to be visible at each check
      const checkDelays = [100, 200, 500, 1000, 2000];
      checkDelays.forEach(delay => {
        setTimeout(() => {
          const currentTrackEnabled = videoTrack?.enabled;
          const currentStateRef = isVideoEnabledRef.current;
          const currentState = isVideoEnabledState;
          
          // CRITICAL: Force video element to be visible
          const videoElement = document.querySelector('video.local-video');
          const currentStream = localStreamRef.current || localStream;
          if (videoElement && videoWasEnabled && currentStream) {
            // Force visibility
            videoElement.style.opacity = '1';
            videoElement.style.visibility = 'visible';
            videoElement.style.display = 'block';
            
            // Ensure srcObject
            if (videoElement.srcObject !== currentStream) {
              console.warn(`🔇🔇 ❌ ${delay}ms: Video element lost srcObject, restoring`);
              videoElement.srcObject = currentStream;
            }
            
            // Force play
            if (videoElement.paused && videoElement.srcObject) {
              videoElement.play().catch(err => {
                console.error(`🔇🔇 ❌ ${delay}ms: Error playing video`, err);
              });
            }
          }
          
          console.log(`🔇🔇 ${delay}ms check after audio toggle:`, {
            videoTrackEnabled: currentTrackEnabled,
            videoStateRef: currentStateRef,
            videoState: currentState,
            videoWasEnabled: videoWasEnabled,
            timeSinceToggle: Date.now() - lastToggleTimeRef.current,
            videoElementFound: !!videoElement,
            videoElementPaused: videoElement?.paused,
            videoElementSrcObject: !!videoElement?.srcObject
          });
          
          if (videoTrack && videoWasEnabled) {
            if (!currentTrackEnabled) {
              console.error(`🔇🔇 ❌ ${delay}ms: Video track disabled, re-enabling`);
              console.trace(`🔇🔇 Where did track get disabled at ${delay}ms?`);
              videoTrack.enabled = true;
            }
            if (!currentStateRef) {
              console.error(`🔇🔇 ❌ ${delay}ms: Video state ref changed to false, restoring`);
              console.trace(`🔇🔇 Where did ref get changed at ${delay}ms?`);
              setIsVideoEnabled(true);
            }
            if (!currentState) {
              console.error(`🔇🔇 ❌ ${delay}ms: Video state changed to false, restoring`);
              console.trace(`🔇🔇 Where did state get changed at ${delay}ms?`);
              setIsVideoEnabled(true);
            }
          }
        }, delay);
      });
    } else {
      console.log('🔇🔇 Video was not enabled, skipping protection');
    }

    // Emit state - use preserved video state
    console.log('🔇🔇 Emitting media state:', { audio: newAudioState, video: videoWasEnabled });
    emitMediaState(newAudioState, videoWasEnabled);
    
    console.log('🔇🔇🔇🔇 AUDIO TOGGLE END');
  };

  // Toggle Video - COMPLETELY ISOLATED: No effects, no sync, just toggle
  const toggleVideo = () => {
    // Check if video is locked by host request
    if (window.isVideoLocked) {
      console.warn('🎥 Video is locked by host request - cannot toggle');
      return;
    }
    
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    // CRITICAL: Toggle based on CURRENT STATE only
    const newState = !isVideoEnabled;
    
    // CRITICAL: Mark toggle time to prevent sync effect from interfering
    lastToggleTimeRef.current = Date.now();
    
    console.log('🎥 Video Toggle: Starting', { 
      from: isVideoEnabled, 
      to: newState,
      trackBefore: videoTrack.enabled
    });
    
    // CRITICAL: Set BOTH state and track immediately and synchronously
    // Don't use protected setter - just set directly
    setIsVideoEnabled(newState);
    videoTrack.enabled = newState;
    
    console.log('🎥 Video Toggle: Completed', { 
      state: newState,
      track: videoTrack.enabled
    });

    // Get current audio state from track (not state)
    const audioTrack = localStream.getAudioTracks()[0];
    const currentAudioState = audioTrack?.enabled ?? isAudioEnabled;
    
    emitMediaState(currentAudioState, newState);
  };

  // Toggle Screen Share - DOES NOT affect local video track
  const toggleScreenShare = async () => {
    console.log('🖥️🖥️🖥️🖥️ SCREEN SHARE TOGGLE START - DETAILED DEBUG');
    console.trace('🖥️ Stack trace at start');
    
    if (isScreenSharing) {
      console.log('🖥️🖥️ Stopping screen share');
      
      // CRITICAL: Capture video state BEFORE stopping screen share
      const videoTrack = localStream?.getVideoTracks()[0];
      const videoWasEnabled = isVideoEnabled;
      const videoTrackWasEnabled = videoTrack?.enabled ?? false;
      const videoStateFromRef = isVideoEnabledRef.current;
      
      console.log('🖥️🖥️ BEFORE STOPPING SCREEN SHARE:', {
        videoState: videoWasEnabled,
        videoStateRef: videoStateFromRef,
        videoTrackEnabled: videoTrackWasEnabled,
        isVideoEnabledState: isVideoEnabled,
        isVideoEnabledRef: isVideoEnabledRef.current,
        videoTrackId: videoTrack?.id
      });
      
      // Stop screen sharing
      if (screenStream) {
        console.log('🖥️🖥️ Stopping screen stream tracks');
        screenStream.getTracks().forEach(track => track.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);

      if (onScreenShareChange) {
        onScreenShareChange(null, false);
      }

      if (socket && meetingId && participantId) {
        socket.emit('screen-share-change', {
          meetingId,
          participantId,
          isSharing: false,
          streamId: null
        });
      }
      
      // CRITICAL: Protect video after stopping screen share
      console.log('🖥️🖥️ AFTER STOPPING SCREEN SHARE:', {
        videoState: isVideoEnabled,
        videoStateRef: isVideoEnabledRef.current,
        videoTrackEnabled: videoTrack?.enabled,
        videoWasEnabled: videoWasEnabled
      });
      
      if (videoTrack && videoWasEnabled) {
        // Force track enabled immediately
        if (!videoTrack.enabled) {
          console.error('🖥️🖥️ ❌❌❌ VIDEO TRACK WAS DISABLED AFTER STOPPING SCREEN SHARE! Re-enabling...');
          console.trace('🖥️🖥️ Where did video track get disabled?');
          videoTrack.enabled = true;
        }
        
        // Force state to stay enabled
        if (!isVideoEnabledRef.current) {
          console.error('🖥️🖥️ ❌❌❌ VIDEO STATE WAS CHANGED TO FALSE AFTER STOPPING SCREEN SHARE! Restoring...');
          console.trace('🖥️🖥️ Where did video state get changed?');
          setIsVideoEnabled(true);
        }
      }
      
      // Multiple checks
      setTimeout(() => {
        console.log('🖥️🖥️ 100ms check after stop:', {
          videoTrackEnabled: videoTrack?.enabled,
          videoStateRef: isVideoEnabledRef.current,
          videoWasEnabled: videoWasEnabled
        });
        
        if (videoTrack && videoWasEnabled) {
          if (!videoTrack.enabled) {
            console.error('🖥️🖥️ ❌ 100ms: Video track disabled, re-enabling');
            videoTrack.enabled = true;
          }
          if (!isVideoEnabledRef.current) {
            console.error('🖥️🖥️ ❌ 100ms: Video state changed, restoring');
            setIsVideoEnabled(true);
          }
        }
      }, 100);
      
      setTimeout(() => {
        if (videoTrack && videoWasEnabled) {
          if (!videoTrack.enabled) {
            console.error('🖥️🖥️ ❌ 500ms: Video track disabled, re-enabling');
            videoTrack.enabled = true;
          }
          if (!isVideoEnabledRef.current) {
            console.error('🖥️🖥️ ❌ 500ms: Video state changed, restoring');
            setIsVideoEnabled(true);
          }
        }
      }, 500);
      
      setTimeout(() => {
        if (videoTrack && videoWasEnabled) {
          if (!videoTrack.enabled) {
            console.error('🖥️🖥️ ❌ 1000ms: Video track disabled, re-enabling');
            videoTrack.enabled = true;
          }
          if (!isVideoEnabledRef.current) {
            console.error('🖥️🖥️ ❌ 1000ms: Video state changed, restoring');
            setIsVideoEnabled(true);
          }
        }
      }, 1000);
      
    } else {
      console.log('🖥️🖥️ Starting screen share');
      
      // Start screen sharing
      // CRITICAL: Lock video state BEFORE starting screen share
      const videoTrack = localStream?.getVideoTracks()[0];
      const videoWasEnabled = videoTrack?.enabled ?? isVideoEnabled;
      const videoStateFromRef = isVideoEnabledRef.current;
      
      console.log('🖥️🖥️ BEFORE STARTING SCREEN SHARE:', {
        videoState: isVideoEnabled,
        videoStateRef: videoStateFromRef,
        videoTrackEnabled: videoTrack?.enabled,
        videoWasEnabled: videoWasEnabled,
        isVideoEnabledState: isVideoEnabled,
        isVideoEnabledRef: isVideoEnabledRef.current,
        videoTrackId: videoTrack?.id,
        hasLocalStream: !!localStream
      });

      try {
        console.log('🖥️🖥️ Calling getDisplayMedia...');
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            mediaSource: 'screen',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: true
        });
        
        console.log('🖥️🖥️ getDisplayMedia SUCCESS:', {
          streamId: stream.id,
          tracks: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length
        });
        
        // CRITICAL: Check video IMMEDIATELY after getDisplayMedia
        console.log('🖥️🖥️ IMMEDIATELY AFTER getDisplayMedia:', {
          videoTrackEnabled: videoTrack?.enabled,
          videoState: isVideoEnabled,
          videoStateRef: isVideoEnabledRef.current,
          videoWasEnabled: videoWasEnabled
        });

        // CRITICAL: Verify video track is still enabled after screen share starts
        if (videoTrack && videoWasEnabled && !videoTrack.enabled) {
          console.error('🖥️🖥️ ❌❌❌ VIDEO TRACK WAS DISABLED DURING SCREEN SHARE START! Re-enabling...');
          console.trace('🖥️🖥️ Where did video track get disabled?');
          videoTrack.enabled = true;
          if (!isVideoEnabled) {
            console.error('🖥️🖥️ ❌ Video state also false, restoring...');
            setVideoEnabledSafe(true, false);
          }
        }
        
        // Force state to stay enabled
        if (videoTrack && videoWasEnabled && !isVideoEnabledRef.current) {
          console.error('🖥️🖥️ ❌❌❌ VIDEO STATE WAS CHANGED TO FALSE DURING SCREEN SHARE START! Restoring...');
          console.trace('🖥️🖥️ Where did video state get changed?');
          setIsVideoEnabled(true);
        }

        setScreenStream(stream);
        setIsScreenSharing(true);

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }

        if (onScreenShareChange) {
          onScreenShareChange(stream, true);
        }

        if (socket && meetingId && participantId) {
          socket.emit('screen-share-change', {
            meetingId,
            participantId,
            isSharing: true,
            streamId: stream.id
          });
        }
        
        // CRITICAL: Multiple checks after screen share starts
        setTimeout(() => {
          console.log('🖥️🖥️ 100ms check after start:', {
            videoTrackEnabled: videoTrack?.enabled,
            videoStateRef: isVideoEnabledRef.current,
            videoWasEnabled: videoWasEnabled
          });
          
          if (videoTrack && videoWasEnabled) {
            if (!videoTrack.enabled) {
              console.error('🖥️🖥️ ❌ 100ms: Video track disabled, re-enabling');
              console.trace('🖥️🖥️ Stack trace at 100ms');
              videoTrack.enabled = true;
            }
            if (!isVideoEnabledRef.current) {
              console.error('🖥️🖥️ ❌ 100ms: Video state changed, restoring');
              console.trace('🖥️🖥️ Stack trace at 100ms');
              setIsVideoEnabled(true);
            }
          }
        }, 100);
        
        setTimeout(() => {
          if (videoTrack && videoWasEnabled) {
            if (!videoTrack.enabled) {
              console.error('🖥️🖥️ ❌ 500ms: Video track disabled, re-enabling');
              videoTrack.enabled = true;
            }
            if (!isVideoEnabledRef.current) {
              console.error('🖥️🖥️ ❌ 500ms: Video state changed, restoring');
              setIsVideoEnabled(true);
            }
          }
        }, 500);
        
        setTimeout(() => {
          if (videoTrack && videoWasEnabled) {
            if (!videoTrack.enabled) {
              console.error('🖥️🖥️ ❌ 1000ms: Video track disabled, re-enabling');
              videoTrack.enabled = true;
            }
            if (!isVideoEnabledRef.current) {
              console.error('🖥️🖥️ ❌ 1000ms: Video state changed, restoring');
              setIsVideoEnabled(true);
            }
          }
        }, 1000);

        // Handle screen sharing end
        stream.getVideoTracks()[0].onended = () => {
          console.log('🖥️🖥️🖥️ SCREEN SHARE ENDED (onended event)');
          console.trace('🖥️🖥️ Stack trace at onended');
          
          // CRITICAL: Capture video state when screen share ends
          const videoTrackAtEnd = localStream?.getVideoTracks()[0];
          const videoStateAtEnd = isVideoEnabled;
          const videoStateRefAtEnd = isVideoEnabledRef.current;
          const videoTrackEnabledAtEnd = videoTrackAtEnd?.enabled ?? false;
          
          console.log('🖥️🖥️ WHEN SCREEN SHARE ENDED:', {
            videoState: videoStateAtEnd,
            videoStateRef: videoStateRefAtEnd,
            videoTrackEnabled: videoTrackEnabledAtEnd,
            videoWasEnabled: videoWasEnabled,
            videoTrackId: videoTrackAtEnd?.id
          });
          
          setScreenStream(null);
          setIsScreenSharing(false);
          
          // CRITICAL: Verify video track is still enabled when screen share ends
          if (videoTrack && videoWasEnabled && !videoTrack.enabled) {
            console.error('🖥️🖥️ ❌❌❌ VIDEO TRACK WAS DISABLED WHEN SCREEN SHARE ENDED! Re-enabling...');
            console.trace('🖥️🖥️ Where did video track get disabled?');
            videoTrack.enabled = true;
            if (!isVideoEnabled) {
              console.error('🖥️🖥️ ❌ Video state also false, restoring...');
              setVideoEnabledSafe(true, false);
            }
          }
          
          // Force state to stay enabled
          if (videoTrack && videoWasEnabled && !isVideoEnabledRef.current) {
            console.error('🖥️🖥️ ❌❌❌ VIDEO STATE WAS CHANGED TO FALSE WHEN SCREEN SHARE ENDED! Restoring...');
            console.trace('🖥️🖥️ Where did video state get changed?');
            setIsVideoEnabled(true);
          }
          
          if (onScreenShareChange) {
            onScreenShareChange(null, false);
          }

          if (socket && meetingId && participantId) {
            socket.emit('screen-share-change', {
              meetingId,
              participantId,
              isSharing: false,
              streamId: null
            });
          }
          
          // Multiple checks after screen share ends
          setTimeout(() => {
            console.log('🖥️🖥️ 100ms check after onended:', {
              videoTrackEnabled: videoTrack?.enabled,
              videoStateRef: isVideoEnabledRef.current,
              videoWasEnabled: videoWasEnabled
            });
            
            if (videoTrack && videoWasEnabled) {
              if (!videoTrack.enabled) {
                console.error('🖥️🖥️ ❌ 100ms after onended: Video track disabled, re-enabling');
                videoTrack.enabled = true;
              }
              if (!isVideoEnabledRef.current) {
                console.error('🖥️🖥️ ❌ 100ms after onended: Video state changed, restoring');
                setIsVideoEnabled(true);
              }
            }
          }, 100);
          
          setTimeout(() => {
            if (videoTrack && videoWasEnabled) {
              if (!videoTrack.enabled) {
                console.error('🖥️🖥️ ❌ 500ms after onended: Video track disabled, re-enabling');
                videoTrack.enabled = true;
              }
              if (!isVideoEnabledRef.current) {
                console.error('🖥️🖥️ ❌ 500ms after onended: Video state changed, restoring');
                setIsVideoEnabled(true);
              }
            }
          }, 500);
          
          setTimeout(() => {
            if (videoTrack && videoWasEnabled) {
              if (!videoTrack.enabled) {
                console.error('🖥️🖥️ ❌ 1000ms after onended: Video track disabled, re-enabling');
                videoTrack.enabled = true;
              }
              if (!isVideoEnabledRef.current) {
                console.error('🖥️🖥️ ❌ 1000ms after onended: Video state changed, restoring');
                setIsVideoEnabled(true);
              }
            }
          }, 1000);
        };

        // Final verification after screen share starts
        setTimeout(() => {
          if (videoTrack && videoWasEnabled && !videoTrack.enabled) {
            console.error('🖥️ Screen Share: Final check - video still disabled, forcing enabled');
            videoTrack.enabled = true;
            if (!isVideoEnabled) {
              setVideoEnabledSafe(true, false);
            }
          }
        }, 100);
      } catch (error) {
        console.error('🖥️🖥️❌❌❌ SCREEN SHARE ERROR:', error);
        console.trace('🖥️🖥️ Stack trace at error');
        
        // CRITICAL: Protect video even if screen share fails
        const videoTrack = localStream?.getVideoTracks()[0];
        const videoWasEnabled = isVideoEnabled;
        
        console.log('🖥️🖥️ AFTER SCREEN SHARE ERROR:', {
          videoState: isVideoEnabled,
          videoStateRef: isVideoEnabledRef.current,
          videoTrackEnabled: videoTrack?.enabled,
          videoWasEnabled: videoWasEnabled
        });
        
        if (videoTrack && videoWasEnabled) {
          if (!videoTrack.enabled) {
            console.error('🖥️🖥️ ❌ Video track disabled after error, re-enabling');
            videoTrack.enabled = true;
          }
          if (!isVideoEnabledRef.current) {
            console.error('🖥️🖥️ ❌ Video state changed after error, restoring');
            setIsVideoEnabled(true);
          }
        }
        
        setIsScreenSharing(false);
        if (onScreenShareChange) {
          onScreenShareChange(null, false);
        }
      }
      
      console.log('🖥️🖥️🖥️🖥️ SCREEN SHARE TOGGLE END');
    }
  };

  // Emit initial state
  useEffect(() => {
    if (socket && meetingId && participantId && localStream && socket.connected) {
      const timer = setTimeout(() => {
        emitMediaState(isAudioEnabled, isVideoEnabled);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [socket, meetingId, participantId, localStream]);

  // CRITICAL: Expose video state refs to window for useScreenShare protection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.isVideoEnabledRef = isVideoEnabledRef;
      window.isVideoEnabled = isVideoEnabled; // Current state value
      window.setIsVideoEnabled = setIsVideoEnabled; // Setter function
      window.isAudioEnabled = isAudioEnabled; // Current audio state value
      window.setIsAudioEnabled = setIsAudioEnabled; // Audio setter function
    }
    return () => {
      // Keep refs available even after cleanup
    };
  }, [isVideoEnabled, setIsVideoEnabled, isAudioEnabled, setIsAudioEnabled]);

  return {
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenStream,
    screenVideoRef,
    toggleAudio,
    toggleVideo,
    toggleScreenShare
  };
};

