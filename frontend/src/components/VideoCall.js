import React, { useRef, useEffect, useMemo, memo } from 'react';
import { Box } from '@mui/material';
import '../css/VideoCall.css';
import { registerVideoElement, unregisterVideoElement, setVideoEnabled } from '../utils/videoProtection';

/**
 * Clean Video Call Component
 * Simple, direct approach - no complex polling or protection
 * MEMOIZED to prevent re-renders when chat or other UI elements change
 */
const VideoCallComponent = memo(({
  localStream,
  remoteStreams,
  localVideoRef,
  participants,
  currentUserId,
  isVideoEnabled = true
}) => {
  const remoteVideoRefs = useRef({});
  
  // CRITICAL: Use stable refs that never change
  const localStreamRef = useRef(localStream);
  const isVideoEnabledRef = useRef(isVideoEnabled);
  
  // Update refs when props change (but don't cause re-renders)
  useEffect(() => {
    // CRITICAL: Log prop changes to detect unexpected changes
    console.log('🎥🎥🎥 VideoCall: Component props changed', {
      isVideoEnabled,
      previousRefValue: isVideoEnabledRef.current,
      hasStream: !!localStream,
      streamId: localStream?.id,
      timestamp: Date.now()
    });
    
    // CRITICAL: Check if video is being disabled unexpectedly
    if (isVideoEnabledRef.current === true && isVideoEnabled === false) {
      console.error('🎥🎥🎥 ❌❌❌ VIDEO PROP CHANGED FROM TRUE TO FALSE IN REFS UPDATE!', {
        previousValue: isVideoEnabledRef.current,
        newValue: isVideoEnabled,
        stackTrace: new Error().stack
      });
    }
    
    localStreamRef.current = localStream;
    isVideoEnabledRef.current = isVideoEnabled;
    console.log('🎥 VideoCall: Refs updated', { 
      hasStream: !!localStream, 
      isEnabled: isVideoEnabled 
    });
  }, [localStream, isVideoEnabled]);

  // GLOBAL PROTECTION: Register video element for global protection
  // CRITICAL: Use refs to avoid re-running when unrelated props change
  useEffect(() => {
    const stream = localStreamRef.current;
    const shouldBeEnabled = isVideoEnabledRef.current;
    
    if (!stream || !localVideoRef.current) {
      unregisterVideoElement();
      return;
    }

    const videoElement = localVideoRef.current;
    const videoTrack = stream.getVideoTracks()[0];
    
    if (!videoTrack) {
      unregisterVideoElement();
      return;
    }

    // Register with global protection system
    registerVideoElement(videoElement, videoTrack, stream);
    setVideoEnabled(shouldBeEnabled);

    // CRITICAL: Force immediate setup
    if (videoElement.srcObject !== stream) {
      console.log('🛡️ VideoCall: Force setting srcObject in protection');
      videoElement.srcObject = stream;
    }

    // Ensure track is enabled if it should be
    if (shouldBeEnabled && !videoTrack.enabled) {
      console.log('🛡️ VideoCall: Force enabling track in protection');
      videoTrack.enabled = true;
    }

    // CRITICAL: Force play immediately
    if (shouldBeEnabled && videoTrack.enabled && videoElement.srcObject) {
      videoElement.play().catch(err => {
        console.warn('🛡️ VideoCall: Protection play failed', err);
      });
    }

    // CRITICAL: Add a MutationObserver to detect layout changes
    const observer = new MutationObserver(() => {
      // When layout changes (like chat opening), immediately protect video
      if (shouldBeEnabled && videoTrack && videoElement) {
        if (!videoTrack.enabled) {
          console.warn('🛡️ VideoCall: Layout change detected - track disabled, re-enabling');
          videoTrack.enabled = true;
        }
        if (videoElement.srcObject !== stream) {
          console.warn('🛡️ VideoCall: Layout change detected - srcObject lost, restoring');
          videoElement.srcObject = stream;
        }
        if (videoElement.paused && videoElement.srcObject) {
          videoElement.play().catch(() => {});
        }
      }
    });

    // Observe the video element and its parent for changes
    if (videoElement.parentElement) {
      observer.observe(videoElement.parentElement, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        childList: false,
        subtree: false
      });
    }
    observer.observe(videoElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: false,
      subtree: false
    });

    return () => {
      observer.disconnect();
      // Don't unregister on cleanup - keep protection active
      // unregisterVideoElement();
    };
    // CRITICAL: Only depend on localVideoRef - use refs for stream/enabled
  }, [localVideoRef]);

  // Update global enabled state when prop changes
  useEffect(() => {
    console.log('🎥🎥🎥 VideoCall: isVideoEnabled prop changed', {
      newValue: isVideoEnabled,
      previousValue: isVideoEnabledRef.current,
      stackTrace: new Error().stack,
      timestamp: Date.now()
    });
    
    // CRITICAL: Check if video is being disabled unexpectedly
    if (isVideoEnabledRef.current === true && isVideoEnabled === false) {
      console.error('🎥🎥🎥 ❌❌❌ VIDEO PROP CHANGED FROM TRUE TO FALSE!', {
        previousValue: isVideoEnabledRef.current,
        newValue: isVideoEnabled,
        stackTrace: new Error().stack
      });
    }
    
    setVideoEnabled(isVideoEnabled);
    isVideoEnabledRef.current = isVideoEnabled;
  }, [isVideoEnabled]);

  // Simple local video display - direct approach
  // CRITICAL: Use props directly for initial setup to ensure video starts
  useEffect(() => {
    if (!localStream || !localVideoRef.current) {
      console.log('🎥 VideoCall: No stream or video element yet', {
        hasStream: !!localStream,
        hasElement: !!localVideoRef.current
      });
      return;
    }

    const videoElement = localVideoRef.current;
    const videoTrack = localStream.getVideoTracks()[0];
    
    if (!videoTrack) {
      console.log('🎥 VideoCall: No video track found in stream');
      return;
    }

    console.log('🎥 VideoCall: Initial setup', {
      trackEnabled: videoTrack.enabled,
      isVideoEnabled: isVideoEnabled,
      hasSrcObject: !!videoElement.srcObject,
      streamId: localStream.id
    });

    // CRITICAL: Set srcObject first - this is the most important
    if (videoElement.srcObject !== localStream) {
      videoElement.srcObject = localStream;
    }

    // CRITICAL: Ensure track is enabled if it should be
    if (isVideoEnabled && !videoTrack.enabled) {
      videoTrack.enabled = true;
    }

    // CRITICAL: Force video element to be visible on initial setup
    if (isVideoEnabled && videoTrack.enabled) {
      videoElement.style.opacity = '1';
      videoElement.style.visibility = 'visible';
      videoElement.style.display = 'block';
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
    }

    // Try to play immediately
    if (isVideoEnabled && videoTrack.enabled) {
      videoElement.play().catch(err => {
        console.warn('🎥 VideoCall: Initial play failed', err);
      });
    }
    
    // CRITICAL: Multiple immediate checks to ensure video stays visible
    // This catches any delayed hiding that might occur
    const immediateChecks = [
      () => requestAnimationFrame(() => {
        if (isVideoEnabled && videoTrack.enabled && videoElement) {
          if (videoElement.style.opacity === '0' || videoElement.style.visibility === 'hidden') {
            videoElement.style.opacity = '1';
            videoElement.style.visibility = 'visible';
            videoElement.style.display = 'block';
          }
          if (videoElement.srcObject !== localStream) {
            videoElement.srcObject = localStream;
          }
          if (videoElement.paused && videoElement.srcObject) {
            videoElement.play().catch(() => {});
          }
        }
      }),
      () => setTimeout(() => {
        if (isVideoEnabled && videoTrack.enabled && videoElement) {
          if (videoElement.style.opacity === '0' || videoElement.style.visibility === 'hidden') {
            videoElement.style.opacity = '1';
            videoElement.style.visibility = 'visible';
            videoElement.style.display = 'block';
          }
          if (videoElement.srcObject !== localStream) {
            videoElement.srcObject = localStream;
          }
          if (videoElement.paused && videoElement.srcObject) {
            videoElement.play().catch(() => {});
          }
        }
      }, 50),
      () => setTimeout(() => {
        if (isVideoEnabled && videoTrack.enabled && videoElement) {
          if (videoElement.style.opacity === '0' || videoElement.style.visibility === 'hidden') {
            videoElement.style.opacity = '1';
            videoElement.style.visibility = 'visible';
            videoElement.style.display = 'block';
          }
          if (videoElement.srcObject !== localStream) {
            videoElement.srcObject = localStream;
          }
          if (videoElement.paused && videoElement.srcObject) {
            videoElement.play().catch(() => {});
          }
        }
      }, 200)
    ];
    
    immediateChecks.forEach(check => check());

    // Simple function to update video display
    // CRITICAL: Use opacity/visibility only - keeps layout stable
    // CRITICAL: Use props directly to avoid stale closure issues
    const updateVideo = () => {
      // CRITICAL: Use props directly (not refs) to get current values
      // This ensures we always have the latest state from React
      const shouldBeEnabled = isVideoEnabled; // Use prop directly
      const currentStream = localStream; // Use prop directly
      const trackEnabled = videoTrack.enabled;
      
      // CRITICAL: Also check refs for debugging
      const refValue = isVideoEnabledRef.current;
      const streamRef = localStreamRef.current;
      
      // CRITICAL: Track when updateVideo is called and what values it receives
      // This will help us catch when video is being hidden unexpectedly
      const updateVideoCallId = Math.random().toString(36).substr(2, 9);
      const timestamp = Date.now();
      
      // CRITICAL: Always log when hiding video to catch the issue
      if (!shouldBeEnabled || !trackEnabled) {
        console.error('🎥🎥🎥❌❌❌ VideoCall: updateVideo - HIDING VIDEO', {
          callId: updateVideoCallId,
          shouldBeEnabled,
          trackEnabled,
          refValue,
          hasStream: !!currentStream,
          hasStreamRef: !!streamRef,
          hasSrcObject: !!videoElement.srcObject,
          reason: !shouldBeEnabled ? 'state is false' : 'track is disabled',
          isVideoEnabledProp: isVideoEnabled,
          isVideoEnabledRef: isVideoEnabledRef.current,
          videoTrackEnabled: videoTrack.enabled,
          timestamp: timestamp,
          stackTrace: new Error().stack
        });
        
        // CRITICAL: If video should be enabled but is being hidden, check if it's after audio toggle
        if (refValue === true && shouldBeEnabled === false) {
          const timeSinceAudioToggle = Date.now() - (window.lastAudioToggleTime || 0);
          if (timeSinceAudioToggle < 5000) {
            console.error('🎥🎥🎥 ❌❌❌ CRITICAL: updateVideo hiding video after audio toggle!', {
              timeSinceAudioToggle,
              shouldBeEnabled,
              refValue,
              trackEnabled,
              stackTrace: new Error().stack
            });
          }
        }
      } else {
        // CRITICAL: Always log when showing video if it's after audio toggle
        const timeSinceAudioToggle = window.lastAudioToggleTime ? (timestamp - window.lastAudioToggleTime) : Infinity;
        const isAfterAudioToggle = timeSinceAudioToggle < 5000;
        
        if (isAfterAudioToggle || Math.random() < 0.1) {
          console.log('🎥🎥🎥 VideoCall: updateVideo - SHOWING VIDEO', {
            callId: updateVideoCallId,
            shouldBeEnabled,
            trackEnabled,
            refValue,
            hasStream: !!currentStream,
            hasSrcObject: !!videoElement.srcObject,
            timestamp: timestamp,
            timeSinceAudioToggle: timeSinceAudioToggle < 5000 ? timeSinceAudioToggle : null,
            currentOpacity: videoElement.style.opacity,
            currentVisibility: videoElement.style.visibility,
            computedOpacity: window.getComputedStyle(videoElement).opacity,
            computedVisibility: window.getComputedStyle(videoElement).visibility,
            videoPaused: videoElement.paused,
            videoReadyState: videoElement.readyState
          });
        }
      }
      
      if (shouldBeEnabled && trackEnabled) {
        // CRITICAL: Check if video is actually visible before showing
        const wasHidden = videoElement.style.opacity === '0' || 
                         videoElement.style.visibility === 'hidden' ||
                         window.getComputedStyle(videoElement).opacity === '0' ||
                         window.getComputedStyle(videoElement).visibility === 'hidden';
        
        // Show video - use opacity/visibility only (no layout change)
        videoElement.style.opacity = '1';
        videoElement.style.visibility = 'visible';
        videoElement.style.display = 'block';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
        
        // Ensure srcObject is set
        if (videoElement.srcObject !== currentStream && currentStream) {
          console.warn('🎥 VideoCall: Restoring srcObject in updateVideo', {
            hadSrcObject: !!videoElement.srcObject,
            newStreamId: currentStream.id,
            callId: updateVideoCallId
          });
          videoElement.srcObject = currentStream;
        }
        
        // Play if paused
        if (videoElement.paused && videoElement.srcObject) {
          const playPromise = videoElement.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              console.error('🎥 VideoCall: Error playing video after show', {
                error: err,
                callId: updateVideoCallId,
                hasSrcObject: !!videoElement.srcObject,
                readyState: videoElement.readyState
              });
            });
          }
        }
        
        // CRITICAL: If video was hidden and we're showing it after audio toggle, log it
        if (wasHidden) {
          const timeSinceAudioToggle = window.lastAudioToggleTime ? (Date.now() - window.lastAudioToggleTime) : Infinity;
          if (timeSinceAudioToggle < 5000) {
            console.warn('🎥🎥🎥 VideoCall: Video was hidden, now showing after audio toggle', {
              callId: updateVideoCallId,
              timeSinceAudioToggle,
              wasHidden,
              nowVisible: true
            });
          }
        }
      } else {
        // Hide video - opacity/visibility only (element still takes space - no layout shift)
        videoElement.style.opacity = '0';
        videoElement.style.visibility = 'hidden';
        videoElement.style.display = 'block';
        videoElement.style.width = '100%';
        videoElement.style.height = '100%';
      }
    };

    // Initial update
    updateVideo();

    // Use track's mute/unmute events (more reliable than polling)
    const handleMute = () => {
      if (!videoTrack.enabled) {
        updateVideo();
      }
    };

    const handleUnmute = () => {
      if (videoTrack.enabled) {
        updateVideo();
      }
    };

    // Listen to track events
    videoTrack.addEventListener('mute', handleMute);
    videoTrack.addEventListener('unmute', handleUnmute);

    // Simple protection - only protect if video should be enabled
    // CRITICAL: Use a function that reads props directly to avoid stale closures
    const checkInterval = setInterval(() => {
      // CRITICAL: Read props directly from closure (they're in dependency array)
      // This ensures we always have the latest state from React
      const shouldBeEnabled = isVideoEnabled; // Use prop directly
      const currentStream = localStream; // Use prop directly
      
      // CRITICAL: Also check refs for debugging
      const refValue = isVideoEnabledRef.current;
      const streamRef = localStreamRef.current;
      
      // CRITICAL: Log when there's a mismatch between prop and ref
      if (shouldBeEnabled !== refValue) {
        console.warn('🎥🎥🎥 VideoCall: checkInterval - PROP/REF MISMATCH!', {
          propValue: shouldBeEnabled,
          refValue: refValue,
          trackEnabled: videoTrack.enabled,
          timestamp: Date.now()
        });
      }
      
      // Only protect if video should be enabled (respect user's choice to turn off)
      if (shouldBeEnabled) {
        // Ensure track is enabled
        if (!videoTrack.enabled) {
          console.warn('🎥 VideoCall: Track was disabled, re-enabling');
          videoTrack.enabled = true;
        }
        
        // Ensure srcObject is set
        if (videoElement.srcObject !== currentStream && currentStream) {
          console.warn('🎥 VideoCall: srcObject lost, restoring');
          videoElement.srcObject = currentStream;
        }
        
        // Ensure video is visible and playing
        if (videoTrack.enabled) {
          if (videoElement.style.opacity === '0' || videoElement.style.visibility === 'hidden') {
            console.warn('🎥 VideoCall: Video was hidden, making visible');
            videoElement.style.opacity = '1';
            videoElement.style.visibility = 'visible';
          }
          if (videoElement.paused && videoElement.srcObject) {
            videoElement.play().catch(() => {});
          }
        }
      }
      
      // Update display
      updateVideo();
    }, 500); // Check every 500ms - not too aggressive

    return () => {
      clearInterval(checkInterval);
      videoTrack.removeEventListener('mute', handleMute);
      videoTrack.removeEventListener('unmute', handleUnmute);
    };
    // CRITICAL: Depend on props for initial setup, but use refs inside for updates
    // This ensures video starts properly but doesn't re-run when chat opens
  }, [localStream, localVideoRef, isVideoEnabled]);

  // Update remote video streams
  useEffect(() => {
    console.log('📹 Updating remote video streams:', {
      streamCount: Object.keys(remoteStreams).length,
      participantIds: Object.keys(remoteStreams)
    });
    
    Object.entries(remoteStreams).forEach(([participantId, stream]) => {
      const videoElement = remoteVideoRefs.current[participantId];
      if (videoElement) {
        if (videoElement.srcObject !== stream) {
          console.log(`📹 Setting srcObject for ${participantId}:`, {
            streamId: stream.id,
            active: stream.active,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length
          });
          videoElement.srcObject = stream;
        }
        
        // Ensure video is playing
        if (videoElement.paused && stream.active) {
          console.log(`▶️ Playing remote video for ${participantId}`);
          videoElement.play().catch(err => {
            console.error(`❌ Error playing remote video for ${participantId}:`, err);
          });
        }
        
        // Ensure video is visible
        if (videoElement.style.opacity === '0' || videoElement.style.visibility === 'hidden') {
          videoElement.style.opacity = '1';
          videoElement.style.visibility = 'visible';
          console.log(`👁️ Making remote video visible for ${participantId}`);
        }
      } else {
        console.warn(`⚠️ No video element found for participant ${participantId}`);
      }
    });
  }, [remoteStreams]);

  // Get participant name
  const getParticipantName = (participantId) => {
    console.log(`🔍🔍🔍 DEBUG: getParticipantName called for ${participantId}:`, {
      participantId,
      participantsCount: participants.length,
      participantsList: participants.map(p => ({ id: p.id, name: p.name })),
      currentUserId,
      searchingFor: participantId
    });
    
    // CRITICAL: Search in participants list
    const participant = participants.find(p => p.id === participantId);
    console.log(`🔍🔍🔍 DEBUG: Participant search result:`, {
      found: !!participant,
      participant: participant ? { id: participant.id, name: participant.name } : null
    });
    
    if (participant && participant.name) {
      // Remove "(Host)" suffix if present for cleaner display
      const name = participant.name.replace(' (Host)', '').trim();
      console.log(`✅✅✅ Found participant name for ${participantId}: "${name}"`);
      return name;
    }
    
    // Fallback: try to find in remoteStreams metadata or use generic name
    console.warn(`⚠️⚠️⚠️ Participant name not found for ${participantId}`, {
      participantId,
      participantsList: participants.map(p => ({ id: p.id, name: p.name })),
      participantIds: participants.map(p => p.id),
      currentUserId,
      allParticipants: participants
    });
    
    // Try to extract name from participantId or use generic name
    const fallbackName = `Participant ${participantId.slice(0, 8)}`;
    console.log(`📝 Using fallback name for ${participantId}: ${fallbackName}`);
    return fallbackName;
  };

  // Filter out current user
  const otherParticipants = useMemo(() => {
    return participants.filter(p => p.id !== currentUserId);
  }, [participants, currentUserId]);

  // Resolve local participant name (for host label)
  const localParticipant = useMemo(() => {
    if (!currentUserId) return null;
    return participants.find(p => p.id === currentUserId) || null;
  }, [participants, currentUserId]);

  const localDisplayName = useMemo(() => {
    if (!localParticipant) return 'You';
    const rawName = localParticipant.name || 'You';
    // Strip any "(Host)" suffix for a cleaner label
    return rawName.replace(' (Host)', '').trim() || 'You';
  }, [localParticipant]);

  // Calculate grid layout
  // CRITICAL: Count remote streams, not just participants
  // This ensures videos show even if participant list is not updated yet
  // ALWAYS include local video if stream exists
  const totalVideos = useMemo(() => {
    const remoteStreamCount = Object.keys(remoteStreams).length;
    const participantCount = otherParticipants.length;
    const hasLocal = !!localStream; // Always count local video if stream exists
    // Use the maximum to ensure all videos are shown
    const count = Math.max(remoteStreamCount, participantCount) + (hasLocal ? 1 : 0);
    // Expanded logging for debugging
    console.log('📊 Video count calculation:');
    console.log('  - remoteStreamCount:', remoteStreamCount);
    console.log('  - participantCount:', participantCount);
    console.log('  - hasLocalStream:', hasLocal);
    console.log('  - localStreamId:', localStream?.id);
    console.log('  - localStreamTracks:', localStream ? {
      video: localStream.getVideoTracks().length,
      audio: localStream.getAudioTracks().length,
      videoEnabled: localStream.getVideoTracks()[0]?.enabled
    } : null);
    console.log('  - totalVideos:', count);
    console.log('  - remoteStreamIds:', Object.keys(remoteStreams));
    console.log('  - participantIds:', otherParticipants.map(p => p.id));
    console.log('  - currentUserId:', currentUserId);
    console.log('  - allParticipants:', participants.map(p => ({ id: p.id, name: p.name })));
    return count;
  }, [otherParticipants.length, remoteStreams, localStream, currentUserId, participants]);

  const gridLayoutClass = useMemo(() => {
    if (totalVideos === 1) return 'grid-1';
    if (totalVideos === 2) return 'grid-2';
    return 'grid-multiple';
  }, [totalVideos]);

  const gridKey = useMemo(() => {
    return `video-grid-${totalVideos}-${otherParticipants.map(p => p.id).join('-')}`;
  }, [totalVideos, otherParticipants]);

  // Check if local video is actually enabled
  const isLocalVideoEnabled = localStream?.getVideoTracks()[0]?.enabled ?? isVideoEnabled;
  const hasLocalStream = !!localStream;
  
  // DEBUG: Log rendering state - expanded for visibility
  console.log('🎬 VideoCall Render State:');
  console.log('  - hasLocalStream:', hasLocalStream);
  console.log('  - isLocalVideoEnabled:', isLocalVideoEnabled);
  console.log('  - localStreamId:', localStream?.id);
  console.log('  - remoteStreamCount:', Object.keys(remoteStreams).length);
  console.log('  - remoteStreamIds:', Object.keys(remoteStreams));
  console.log('  - totalVideos:', totalVideos);
  console.log('  - gridLayoutClass:', gridLayoutClass);
  console.log('  - participantsCount:', participants.length);
  console.log('  - participants:', participants.map(p => ({ id: p.id, name: p.name })));
  console.log('  - currentUserId:', currentUserId);
  console.log('  - Will render local video?', hasLocalStream);
  console.log('  - Will render remote videos?', Object.keys(remoteStreams).length > 0);
  
  // DEBUG: Check participant name matching for remote streams
  Object.keys(remoteStreams).forEach(participantId => {
    const participant = participants.find(p => p.id === participantId);
    console.log(`🔍🔍🔍 DEBUG: Participant name lookup for remote stream ${participantId}:`, {
      found: !!participant,
      participant: participant ? { id: participant.id, name: participant.name, isHost: participant.isHost } : null,
      allParticipantIds: participants.map(p => p.id),
      allParticipantNames: participants.map(p => p.name),
      remoteStreamIds: Object.keys(remoteStreams),
      currentUserId
    });
  });
  
  return (
    <Box className="video-call-container">
      <Box 
        key={gridKey}
        className={`video-call-grid ${gridLayoutClass}`}
      >
        {/* Local Video - Always render if stream exists */}
        {hasLocalStream && (
          <Box className="local-video-wrapper">
            <video
              ref={(el) => {
                if (el) {
                  // CRITICAL: Set the ref first so useEffect can use it
                  if (localVideoRef) {
                    if (typeof localVideoRef === 'function') {
                      localVideoRef(el);
                    } else if (localVideoRef.current !== el) {
                      localVideoRef.current = el;
                    }
                  }
                  
                  // CRITICAL: Ensure srcObject is set immediately when element is available
                  if (localStream && el.srcObject !== localStream) {
                    console.log('🎥🎥🎥 Setting local video srcObject:', {
                      streamId: localStream.id,
                      hasVideoTrack: localStream.getVideoTracks().length > 0,
                      videoTrackEnabled: localStream.getVideoTracks()[0]?.enabled,
                      elementReady: !!el,
                      currentSrcObject: el.srcObject?.id
                    });
                    el.srcObject = localStream;
                    // Force play immediately
                    setTimeout(() => {
                      if (el && el.srcObject) {
                        el.play().catch(err => {
                          console.warn('🎥 Local video play error:', err);
                        });
                      }
                    }, 100);
                  }
                  
                  // CRITICAL: Force visibility - check computed styles too
                  const computedStyle = window.getComputedStyle(el);
                  
                  if (computedStyle.opacity === '0' || computedStyle.visibility === 'hidden' ||
                      el.style.opacity === '0' || el.style.visibility === 'hidden') {
                    console.log('🎥🎥🎥 Local video was hidden, forcing visibility');
                    el.style.opacity = '1';
                    el.style.visibility = 'visible';
                    el.style.display = 'block';
                  }
                  el.style.width = '100%';
                  el.style.height = '100%';
                }
              }}
              className="local-video"
              autoPlay
              playsInline
              muted
              style={{
                // CRITICAL: Force video to always be visible if stream exists
                position: 'relative',
                zIndex: 1,
                width: '100%',
                height: '100%',
                minWidth: '100%',
                minHeight: '100%',
                objectFit: 'cover',
                // CRITICAL: Always show video element if stream exists, even if track is disabled
                opacity: '1 !important',
                visibility: 'visible !important',
                display: 'block !important'
              }}
            />
            {!isLocalVideoEnabled && (
              <Box className="video-off-placeholder">
                📹 Video Off
              </Box>
            )}
            <Box 
              className={`video-label ${localParticipant?.isHost ? 'video-label-host' : ''}`}
              sx={{
                display: 'block',
                visibility: 'visible',
                opacity: 1,
                zIndex: 9999
              }}
            >
              {localDisplayName || 'You'}
            </Box>
          </Box>
        )}

        {/* Remote Videos */}
        {Object.entries(remoteStreams).map(([participantId, stream]) => {
          console.log(`🔍🔍🔍 DEBUG: Rendering remote video for participantId: ${participantId}`);
          console.log(`  - All participants:`, participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })));
          console.log(`  - Current user ID: ${currentUserId}`);
          console.log(`  - Remote stream IDs:`, Object.keys(remoteStreams));
          console.log(`  - Looking for participant with ID: ${participantId}`);
          
          const participantName = getParticipantName(participantId);
          const participant = participants.find(p => p.id === participantId);
          const isHost = participant?.isHost || false;
          
          // Add "(Host)" suffix for host participants
          const displayName = isHost ? `${participantName} (Host)` : participantName;
          
          console.log(`🎥🎥🎥 Rendering remote video for ${participantName} (${participantId}):`);
          console.log(`  - streamId: ${stream.id}`);
          console.log(`  - active: ${stream.active}`);
          console.log(`  - videoTracks: ${stream.getVideoTracks().length}`);
          console.log(`  - audioTracks: ${stream.getAudioTracks().length}`);
          console.log(`  - participantName: "${participantName}"`);
          console.log(`  - isHost: ${isHost}`);
          console.log(`  - displayName: "${displayName}"`);
          console.log(`  - participantsList:`, participants.map(p => ({ id: p.id, name: p.name })));
          console.log(`  - Will render label with text: "${displayName || `Participant ${participantId.slice(0, 8)}`}"`);
          
          return (
            <Box 
              key={`remote-video-${participantId}`} 
              className="remote-video-wrapper"
            >
              <video
                ref={(el) => {
                  if (el) {
                    const wasNew = !remoteVideoRefs.current[participantId];
                    remoteVideoRefs.current[participantId] = el;
                    
                    if (el.srcObject !== stream) {
                      console.log(`📹 Setting srcObject for ${participantName} (${participantId})`);
                      el.srcObject = stream;
                    }
                    
                    // Ensure video plays
                    if (stream.active) {
                      el.play().catch(err => {
                        console.error(`❌ Error playing remote video for ${participantName}:`, err);
                      });
                    } else {
                      console.warn(`⚠️ Stream for ${participantName} is not active yet`);
                    }
                    
                    if (wasNew) {
                      console.log(`✅ Remote video element created for ${participantName}`);
                    }
                    
                    // CRITICAL: Ensure remote video is un-mirrored (remote cameras also provide mirrored feed)
                    // Force scaleX(-1) to un-mirror remote video
                    el.style.transform = 'scaleX(-1)';
                  }
                }}
                className="remote-video"
                autoPlay
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 1,
                  visibility: 'visible',
                  // Remote cameras also provide mirrored feed - flip it back
                  transform: 'scaleX(-1)'
                }}
              />
              <Box 
                className={`video-label ${isHost ? 'video-label-host' : ''}`}
                sx={{
                  display: 'block',
                  visibility: 'visible',
                  opacity: 1,
                  zIndex: 9999
                }}
              >
                {displayName || `Participant ${participantId.slice(0, 8)}`}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  // Ignore other prop changes (like showChat, etc.)
  const prevParticipantCount = prevProps.participants?.length || 0;
  const nextParticipantCount = nextProps.participants?.length || 0;
  const prevRemoteCount = Object.keys(prevProps.remoteStreams || {}).length;
  const nextRemoteCount = Object.keys(nextProps.remoteStreams || {}).length;
  
  const prevParticipantIds = (prevProps.participants || []).map(p => p.id).sort().join(',');
  const nextParticipantIds = (nextProps.participants || []).map(p => p.id).sort().join(',');
  
  const isVideoEnabledChanged = prevProps.isVideoEnabled !== nextProps.isVideoEnabled;

  const shouldSkipRender = prevParticipantCount === nextParticipantCount && 
                            prevRemoteCount === nextRemoteCount &&
                            prevParticipantIds === nextParticipantIds &&
                            prevProps.localStream === nextProps.localStream &&
                            prevProps.currentUserId === nextProps.currentUserId &&
                            !isVideoEnabledChanged;
  
  return shouldSkipRender;
});

VideoCallComponent.displayName = 'VideoCallComponent';

export default VideoCallComponent;
