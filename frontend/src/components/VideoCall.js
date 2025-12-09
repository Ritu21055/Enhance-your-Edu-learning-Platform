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
  isVideoEnabled = true,
  participantMediaState = {}
}) => {
  const remoteVideoRefs = useRef({});
  
  // CRITICAL: Use stable refs that never change
  const localStreamRef = useRef(localStream);
  const isVideoEnabledRef = useRef(isVideoEnabled);
  
  // Update refs when props change (but don't cause re-renders)
  useEffect(() => {
    localStreamRef.current = localStream;
    isVideoEnabledRef.current = isVideoEnabled;
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
      videoElement.srcObject = stream;
    }

    // Ensure track is enabled if it should be
    if (shouldBeEnabled && !videoTrack.enabled) {
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
      // BUT: Only if video should be enabled (respect user's choice to turn off)
      const currentShouldBeEnabled = isVideoEnabledRef.current;
      if (currentShouldBeEnabled && videoTrack && videoElement) {
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
      } else if (!currentShouldBeEnabled && videoTrack && videoElement) {
        // CRITICAL: If video should be disabled, ensure it stays disabled
        if (videoTrack.enabled) {
          videoTrack.enabled = false;
        }
        if (!videoElement.paused) {
          videoElement.pause();
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
    // CRITICAL: Update global protection system with new state
    // This ensures protection system respects user's choice to turn off video
    setVideoEnabled(isVideoEnabled);
    isVideoEnabledRef.current = isVideoEnabled;
    
    // CRITICAL: If video is disabled, also disable the track immediately
    if (!isVideoEnabled && localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack && videoTrack.enabled) {
        videoTrack.enabled = false;
      }
      
      // Also pause the video element
      if (localVideoRef.current && !localVideoRef.current.paused) {
        localVideoRef.current.pause();
      }
    }
  }, [isVideoEnabled, localStream, localVideoRef]);

  // Simple local video display - direct approach
  // CRITICAL: Use props directly for initial setup to ensure video starts
  useEffect(() => {
    if (!localStream || !localVideoRef.current) {
      return;
    }

    const videoElement = localVideoRef.current;
    const videoTrack = localStream.getVideoTracks()[0];
    
    if (!videoTrack) {
      return;
    }

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
      const trackReady = videoTrack.readyState === 'live'; // Check if track is still active
      
      // CRITICAL: Show video only if ALL conditions are met:
      // 1. State says video should be enabled
      // 2. Track is enabled
      // 3. Track is still live (not stopped/ended)
      if (shouldBeEnabled && trackEnabled && trackReady) {
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
          videoElement.srcObject = currentStream;
        }
        
        // Play if paused
        if (videoElement.paused && videoElement.srcObject) {
          videoElement.play().catch(() => {});
        }
      } else {
        // Hide video - completely hide when disabled or track stopped
        console.log('🎥 VideoCall: updateVideo - Hiding local video', {
          shouldBeEnabled,
          trackEnabled,
          trackReady: videoTrack.readyState,
          trackState: videoTrack.readyState
        });
        
        // CRITICAL: If track is ended, replace srcObject with blank stream to clear frozen frame
        if (videoTrack && videoTrack.readyState === 'ended') {
          console.log('🎥 VideoCall: Local video track ended, replacing srcObject with blank stream');
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const blankStream = canvas.captureStream(0);
            videoElement.srcObject = blankStream;
            console.log('🎥 VideoCall: Replaced local video srcObject with blank stream in updateVideo');
          } catch (e) {
            console.warn('🎥 VideoCall: Could not create blank stream in updateVideo:', e);
            videoElement.srcObject = null;
          }
        }
        
        videoElement.style.opacity = '0';
        videoElement.style.visibility = 'hidden';
        videoElement.style.display = 'none'; // Use display: none to completely hide
        videoElement.pause(); // Pause the video
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
    
        // CRITICAL: Listen for track ended event to immediately hide video when track stops
        const handleTrackEnded = () => {
          console.log('🎥 VideoCall: Local video track ended, hiding video immediately');
          if (videoElement) {
            // CRITICAL: Replace srcObject with blank canvas stream to clear frozen frame
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 1;
              canvas.height = 1;
              const blankStream = canvas.captureStream(0);
              videoElement.srcObject = blankStream;
              console.log('🎥 VideoCall: Replaced local video srcObject with blank stream');
            } catch (e) {
              console.warn('🎥 VideoCall: Could not create blank stream, using null:', e);
              videoElement.srcObject = null;
            }
            
            // Hide immediately with multiple methods - do this FIRST before anything else
            videoElement.style.opacity = '0';
            videoElement.style.visibility = 'hidden';
            videoElement.style.display = 'none';
            videoElement.pause();
            
            // Force hide multiple times to ensure it stays hidden
            const forceHide = () => {
              if (videoElement) {
                videoElement.style.opacity = '0';
                videoElement.style.visibility = 'hidden';
                videoElement.style.display = 'none';
                videoElement.pause();
              }
            };
            
            // Hide immediately and again after delays
            requestAnimationFrame(forceHide);
            setTimeout(forceHide, 10);
            setTimeout(forceHide, 50);
            setTimeout(forceHide, 100);
            setTimeout(forceHide, 200);
          }
          updateVideo();
        };

    // Listen to track events
    videoTrack.addEventListener('mute', handleMute);
    videoTrack.addEventListener('unmute', handleUnmute);
    videoTrack.addEventListener('ended', handleTrackEnded);

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
        // CRITICAL: Also check if track is still live (not ended/stopped)
        const trackReady = videoTrack.readyState === 'live';
        
        if (!trackReady) {
          console.log('🎥 VideoCall: Track not ready, hiding video', {
            readyState: videoTrack.readyState,
            shouldBeEnabled
          });
          // Track is stopped/ended, hide video
          videoElement.style.opacity = '0';
          videoElement.style.visibility = 'hidden';
          videoElement.style.display = 'none';
          videoElement.pause();
          return; // Don't protect if track is stopped
        }
        
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
            videoElement.style.display = 'block';
          }
          if (videoElement.paused && videoElement.srcObject) {
            videoElement.play().catch(() => {});
          }
        }
      } else {
        // Video should be disabled - ensure it's hidden
        if (videoElement.style.display !== 'none' && 
            (videoElement.style.opacity !== '0' || videoElement.style.visibility !== 'hidden')) {
          console.log('🎥 VideoCall: Video should be disabled, hiding it');
          videoElement.style.opacity = '0';
          videoElement.style.visibility = 'hidden';
          videoElement.style.display = 'none';
          videoElement.pause();
        }
      }
      
      // Update display
      updateVideo();
    }, 500); // Check every 500ms - not too aggressive

    return () => {
      clearInterval(checkInterval);
      videoTrack.removeEventListener('mute', handleMute);
      videoTrack.removeEventListener('unmute', handleUnmute);
      videoTrack.removeEventListener('ended', handleTrackEnded);
    };
    // CRITICAL: Depend on props for initial setup, but use refs inside for updates
    // This ensures video starts properly but doesn't re-run when chat opens
  }, [localStream, localVideoRef, isVideoEnabled]);

  // Update remote video streams
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([participantId, stream]) => {
      const videoElement = remoteVideoRefs.current[participantId];
      if (videoElement) {
        // CRITICAL: Check if video track is enabled AND check media state from socket
        const videoTrack = stream.getVideoTracks()[0];
        const trackEnabled = videoTrack?.enabled ?? false;
        const trackReady = videoTrack?.readyState === 'live';
        const trackEnded = videoTrack?.readyState === 'ended';
        
        // CRITICAL: Check media state from socket events (most reliable)
        // When participant turns off camera, socket event is more reliable than track.enabled
        const socketMediaState = participantMediaState[participantId];
        const socketVideoEnabled = socketMediaState?.videoEnabled;
        const socketAudioEnabled = socketMediaState?.audioEnabled;
        
        // CRITICAL: If track is ended OR socket says video is disabled, replace srcObject with blank stream IMMEDIATELY to prevent frozen frame
        const shouldReplaceWithBlank = trackEnded || socketVideoEnabled === false;
        
        if (shouldReplaceWithBlank && videoElement.srcObject === stream) {
          console.log(`📹 VideoCall: Track ended or video disabled for ${participantId}, replacing srcObject with blank stream in useEffect`, {
            trackEnded,
            socketVideoEnabled
          });
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const blankStream = canvas.captureStream(0);
            videoElement.srcObject = blankStream;
            console.log(`📹 VideoCall: Replaced remote video srcObject with blank stream for ${participantId} in useEffect`);
          } catch (e) {
            console.warn(`📹 VideoCall: Could not create blank stream for ${participantId} in useEffect:`, e);
            videoElement.srcObject = null;
          }
        } else if (!shouldReplaceWithBlank && videoElement.srcObject !== stream) {
          // Only set srcObject if track is not ended and video is enabled
          videoElement.srcObject = stream;
        }
        
        // Use socket state if available, otherwise fall back to track state
        // CRITICAL: If socket says video is disabled, hide it immediately
        // If socket says video is enabled, show it (but still check track is ready AND enabled)
        // Also hide if track is stopped/ended (readyState !== 'live')
        const isVideoEnabled = socketVideoEnabled !== undefined 
          ? socketVideoEnabled !== false && trackReady && trackEnabled  // If socket says enabled, show (unless track not ready or disabled)
          : trackEnabled && trackReady;  // Fallback to track state
        
        console.log(`📹 VideoCall: Updating video for ${participantId}`, {
          socketVideoEnabled,
          trackEnabled,
          trackReady,
          trackState: videoTrack?.readyState,
          isVideoEnabled,
          streamActive: stream.active
        });
        
        if (isVideoEnabled) {
          // Video is enabled - show and play
          videoElement.style.opacity = '1';
          videoElement.style.visibility = 'visible';
          videoElement.style.display = 'block';
          
          // Ensure video is playing
          if (videoElement.paused && stream.active) {
            videoElement.play().catch(() => {});
          }
        } else {
          // Video is disabled or track stopped - hide the video element IMMEDIATELY
          // CRITICAL: If track is ended, replace srcObject with blank stream to clear frozen frame
          if (videoTrack && videoTrack.readyState === 'ended') {
            console.log(`📹 VideoCall: Track ended for ${participantId}, replacing srcObject with blank stream`);
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 1;
              canvas.height = 1;
              const blankStream = canvas.captureStream(0);
              videoElement.srcObject = blankStream;
              console.log(`📹 VideoCall: Replaced remote video srcObject with blank stream for ${participantId}`);
            } catch (e) {
              console.warn(`📹 VideoCall: Could not create blank stream for ${participantId}:`, e);
              videoElement.srcObject = null;
            }
          }
          
          // CRITICAL: Use display: none to completely hide and prevent frozen frame
          videoElement.style.opacity = '0';
          videoElement.style.visibility = 'hidden';
          videoElement.style.display = 'none'; // Also set display to none for complete hiding
          videoElement.pause();
        }
        
        // CRITICAL: Mute/unmute audio tracks based on participant's audio state
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach((audioTrack) => {
          // Use socket state if available, otherwise fall back to track state
          const shouldEnableAudio = socketAudioEnabled !== undefined
            ? socketAudioEnabled !== false  // If socket says enabled, enable (unless explicitly false)
            : audioTrack.enabled;  // Fallback to current track state
          
          if (audioTrack.enabled !== shouldEnableAudio) {
            audioTrack.enabled = shouldEnableAudio;
          }
        });
        
        // CRITICAL: Listen for track ended event to immediately hide video when track stops
        if (videoTrack && !videoElement._trackEndedListener) {
          const handleTrackEnded = () => {
            console.log(`📹 VideoCall: Video track ended for ${participantId}, hiding video element immediately`);
            const currentElement = remoteVideoRefs.current[participantId];
            if (currentElement) {
              // CRITICAL: Replace srcObject with blank canvas stream to clear frozen frame
              try {
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const blankStream = canvas.captureStream(0);
                currentElement.srcObject = blankStream;
                console.log(`📹 VideoCall: Replaced remote video srcObject with blank stream for ${participantId}`);
              } catch (e) {
                console.warn(`📹 VideoCall: Could not create blank stream for ${participantId}, using null:`, e);
                currentElement.srcObject = null;
              }
              
              // Hide immediately with multiple methods
              currentElement.style.opacity = '0';
              currentElement.style.visibility = 'hidden';
              currentElement.style.display = 'none';
              currentElement.pause();
              
              // Force hide multiple times to ensure it stays hidden
              const forceHide = () => {
                const el = remoteVideoRefs.current[participantId];
                if (el) {
                  el.style.opacity = '0';
                  el.style.visibility = 'hidden';
                  el.style.display = 'none';
                  el.pause();
                }
              };
              
              // Hide immediately and again after delays
              requestAnimationFrame(forceHide);
              setTimeout(forceHide, 10);
              setTimeout(forceHide, 50);
              setTimeout(forceHide, 100);
              setTimeout(forceHide, 200);
            }
          };
          
          videoTrack.addEventListener('ended', handleTrackEnded);
          videoElement._trackEndedListener = handleTrackEnded;
          console.log(`📹 VideoCall: Added track ended listener for ${participantId}`);
        }
      }
    });
    
    // Cleanup function to remove event listeners
    return () => {
      Object.entries(remoteStreams).forEach(([participantId, stream]) => {
        const videoElement = remoteVideoRefs.current[participantId];
        if (videoElement) {
          if (videoElement._cleanupTrackListener) {
            videoElement._cleanupTrackListener();
            videoElement._cleanupTrackListener = null;
          }
          if (videoElement._trackEndedListener) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
              videoTrack.removeEventListener('ended', videoElement._trackEndedListener);
            }
            videoElement._trackEndedListener = null;
          }
        }
      });
    };
  }, [remoteStreams, participantMediaState]);

  // Get participant name
  const getParticipantName = (participantId) => {
    // CRITICAL: Search in participants list
    const participant = participants.find(p => p.id === participantId);
    
    if (participant && participant.name) {
      // Remove "(Host)" suffix if present for cleaner display
      const name = participant.name.replace(' (Host)', '').trim();
      return name;
    }
    
    // Debug: Log when participant is not found
    if (participantId) {
      console.warn(`⚠️ VideoCall: Participant ${participantId} not found in participants list. Available participants:`, 
        participants.map(p => ({ id: p.id, name: p.name }))
      );
    }
    
    // Fallback: use generic name
    return `Participant ${participantId.slice(0, 8)}`;
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
  // CRITICAL: Use isVideoEnabled prop as the primary source of truth
  // Only check track state as a fallback or for debugging
  const videoTrack = localStream?.getVideoTracks()[0];
  const isLocalVideoEnabled = useMemo(() => {
    if (!localStream) return false;
    
    // CRITICAL: isVideoEnabled prop is the primary source of truth
    // If user explicitly turned off video, respect that regardless of track state
    if (!isVideoEnabled) {
      return false;
    }
    
    // If video should be enabled, check if track exists, is enabled, AND is still live
    if (videoTrack) {
      const trackEnabled = videoTrack.enabled;
      const trackReady = videoTrack.readyState === 'live'; // Track must be active, not stopped
      // Show video only if ALL conditions are met:
      // 1. isVideoEnabled prop is true
      // 2. Track is enabled
      // 3. Track is still live (not stopped/ended)
      return trackEnabled && isVideoEnabled && trackReady;
    }
    // No video track - use prop value
    return isVideoEnabled;
  }, [localStream, videoTrack, isVideoEnabled]);
  const hasLocalStream = !!localStream;
  
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
                  // Always set srcObject if stream exists, even if it's the same (handles stream replacement)
                  if (localStream) {
                    const videoTrack = localStream.getVideoTracks()[0];
                    const needsUpdate = el.srcObject !== localStream;
                    
                    if (needsUpdate) {
                      el.srcObject = localStream;
                    }
                    
                    // CRITICAL: Only force visibility if video should be enabled
                    // Check both isVideoEnabled prop and track state
                    const shouldShow = isVideoEnabled && 
                                     videoTrack && 
                                     videoTrack.enabled && 
                                     videoTrack.readyState === 'live';
                    
                    if (shouldShow) {
                      // Ensure video track is enabled
                      if (videoTrack && !videoTrack.enabled) {
                        videoTrack.enabled = true;
                      }
                      
                      // Force visibility only if should be shown
                      el.style.opacity = '1';
                      el.style.visibility = 'visible';
                      el.style.display = 'block';
                      
                      // Force play immediately with retry
                      const playVideo = () => {
                        if (el && el.srcObject && localStream.active) {
                          el.play().catch(() => {
                            // Retry after a short delay
                            setTimeout(() => {
                              if (el && !el.paused) return;
                              playVideo();
                            }, 300);
                          });
                        }
                      };
                      
                      // Try playing immediately
                      setTimeout(playVideo, 100);
                    } else {
                      // Video should be hidden
                      el.style.opacity = '0';
                      el.style.visibility = 'hidden';
                      el.style.display = 'none';
                      el.pause();
                    }
                  }
                  
                  // Set dimensions
                  el.style.width = '100%';
                  el.style.height = '100%';
                }
              }}
              className="local-video"
              autoPlay
              playsInline
              muted
              style={{
                // CRITICAL: Conditional visibility based on isLocalVideoEnabled
                position: 'relative',
                zIndex: 1,
                width: '100%',
                height: '100%',
                minWidth: '100%',
                minHeight: '100%',
                objectFit: 'cover',
                // CRITICAL: Show/hide based on video enabled state (no !important to allow updateVideo to control it)
                opacity: isLocalVideoEnabled ? 1 : 0,
                visibility: isLocalVideoEnabled ? 'visible' : 'hidden',
                display: isLocalVideoEnabled ? 'block' : 'none'
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
          // Try to find participant in the list
          let participant = participants.find(p => p.id === participantId);
          
          // If not found, try to find by matching socket ID patterns or check if it's a known participant
          if (!participant) {
            // Debug: Log when participant is not found
            console.warn(`⚠️ VideoCall: Participant ${participantId} not found in participants list when rendering video.`, {
              participantId,
              availableParticipants: participants.map(p => ({ id: p.id, name: p.name })),
              remoteStreamIds: Object.keys(remoteStreams)
            });
            
            // Try to find by partial match (in case of socket ID changes)
            participant = participants.find(p => 
              p.id && participantId && (
                p.id.includes(participantId.slice(0, 8)) || 
                participantId.includes(p.id.slice(0, 8))
              )
            );
          }
          
          const participantName = participant?.name 
            ? participant.name.replace(' (Host)', '').trim()
            : getParticipantName(participantId);
          const isHost = participant?.isHost || false;
          
          // Add "(Host)" suffix for host participants
          const displayName = isHost ? `${participantName} (Host)` : participantName;
          
          return (
            <Box 
              key={`remote-video-${participantId}`} 
              className="remote-video-wrapper"
            >
              <video
                data-participant-id={participantId}
                ref={(el) => {
                  if (el) {
                    const wasNew = !remoteVideoRefs.current[participantId];
                    remoteVideoRefs.current[participantId] = el;
                    
                    // Set data attribute for instant DOM updates
                    el.setAttribute('data-participant-id', participantId);
                    
                    if (el.srcObject !== stream) {
                      el.srcObject = stream;
                    }
                    
                    // CRITICAL: Check if video track is enabled AND check media state from socket
                    const videoTrack = stream.getVideoTracks()[0];
                    const trackEnabled = videoTrack?.enabled ?? false;
                    const trackReady = videoTrack?.readyState === 'live';
                    
                    // CRITICAL: Check media state from socket events (most reliable)
                    // When participant turns off camera, socket event is more reliable than track.enabled
                    const socketMediaState = participantMediaState[participantId];
                    const socketVideoEnabled = socketMediaState?.videoEnabled;
                    
                    // Use socket state if available, otherwise fall back to track state
                    // If socket says video is disabled, hide it regardless of track state
                    const isVideoEnabled = socketVideoEnabled !== undefined 
                      ? socketVideoEnabled && trackReady
                      : trackEnabled && trackReady;
                    
                    if (isVideoEnabled) {
                      // Video is enabled - show and play
                      el.style.opacity = '1';
                      el.style.visibility = 'visible';
                      el.style.display = 'block';
                      
                      // Ensure video plays
                      if (stream.active) {
                        el.play().catch(() => {});
                      }
                    } else {
                      // Video is disabled - hide the video element
                      el.style.opacity = '0';
                      el.style.visibility = 'hidden';
                      el.pause();
                    }
                    
                    // CRITICAL: Handle audio tracks based on participant's audio state
                    const audioTracks = stream.getAudioTracks();
                    const socketAudioEnabled = socketMediaState?.audioEnabled;
                    
                    audioTracks.forEach((audioTrack) => {
                      // Use socket state if available, otherwise fall back to track state
                      const shouldEnableAudio = socketAudioEnabled !== undefined
                        ? socketAudioEnabled !== false  // If socket says enabled, enable (unless explicitly false)
                        : audioTrack.enabled;  // Fallback to current track state
                      
                      if (audioTrack.enabled !== shouldEnableAudio) {
                        audioTrack.enabled = shouldEnableAudio;
                      }
                    });
                    
                    if (wasNew && videoTrack) {
                      // Set up listener for track enabled state changes
                      const handleEnabledChange = () => {
                        const enabled = videoTrack.enabled;
                        const socketVideoEnabled = socketMediaState?.videoEnabled;
                        const shouldShow = socketVideoEnabled !== undefined 
                          ? socketVideoEnabled && videoTrack.readyState === 'live'
                          : enabled && videoTrack.readyState === 'live';
                        
                        if (shouldShow) {
                          el.style.opacity = '1';
                          el.style.visibility = 'visible';
                          el.style.display = 'block';
                          el.play().catch(() => {});
                        } else {
                          el.style.opacity = '0';
                          el.style.visibility = 'hidden';
                          el.pause();
                        }
                      };
                      
                      // Listen for mute/unmute events (when camera is toggled)
                      videoTrack.addEventListener('mute', handleEnabledChange);
                      videoTrack.addEventListener('unmute', handleEnabledChange);
                      
                      // Also check enabled property periodically (faster check for responsiveness)
                      const checkInterval = setInterval(() => {
                        const currentEnabled = videoTrack.enabled;
                        const lastEnabled = videoTrack._lastEnabledState ?? currentEnabled;
                        
                        // Also check socket media state
                        const socketVideoEnabled = socketMediaState?.videoEnabled;
                        const lastSocketState = videoTrack._lastSocketVideoEnabled;
                        
                        if (currentEnabled !== lastEnabled || socketVideoEnabled !== lastSocketState) {
                          videoTrack._lastEnabledState = currentEnabled;
                          videoTrack._lastSocketVideoEnabled = socketVideoEnabled;
                          
                          // Use socket state if available, otherwise use track state
                          const shouldShow = socketVideoEnabled !== undefined 
                            ? socketVideoEnabled && videoTrack.readyState === 'live'
                            : currentEnabled && videoTrack.readyState === 'live';
                          
                          if (shouldShow) {
                            el.style.opacity = '1';
                            el.style.visibility = 'visible';
                            el.style.display = 'block';
                            el.play().catch(() => {});
                          } else {
                            el.style.opacity = '0';
                            el.style.visibility = 'hidden';
                            el.pause();
                          }
                        }
                      }, 100); // Check every 100ms for faster response
                      
                      videoTrack._lastEnabledState = videoTrack.enabled;
                      
                      // Clean up on unmount
                      el._cleanupTrackListener = () => {
                        videoTrack.removeEventListener('mute', handleEnabledChange);
                        videoTrack.removeEventListener('unmute', handleEnabledChange);
                        clearInterval(checkInterval);
                      };
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
                  opacity: stream.getVideoTracks()[0]?.enabled ? 1 : 0,
                  visibility: stream.getVideoTracks()[0]?.enabled ? 'visible' : 'hidden',
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
