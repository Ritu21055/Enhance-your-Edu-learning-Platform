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
      const trackNotEnded = videoTrack.readyState !== 'ended'; // Check if track is not ended
      
      // CRITICAL: Show video if:
      // 1. State says video should be enabled
      // 2. Track is enabled
      // 3. Track is not ended (allow 'live' or other states)
      if (shouldBeEnabled && trackEnabled && trackNotEnded) {
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
        
        // Ensure srcObject is set (restore if it was cleared when disabled)
        if (videoElement.srcObject !== currentStream && currentStream) {
          videoElement.srcObject = currentStream;
          console.log('🎥 VideoCall: Restored srcObject when video enabled');
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
        
        // CRITICAL: Hide video element immediately to prevent frozen frame
        videoElement.style.opacity = '0';
        videoElement.style.visibility = 'hidden';
        videoElement.style.display = 'none'; // Use display: none to completely hide
        videoElement.pause(); // Pause the video
        
        // CRITICAL: If video is disabled (not just track disabled), clear srcObject to prevent frozen frame
        // Only do this if explicitly disabled by user/timer, not if track is just temporarily disabled
        if (!shouldBeEnabled) {
          // Video is explicitly disabled - clear srcObject to prevent showing last frame
          // But keep the stream reference so we can restore it later
          if (videoElement.srcObject && videoElement.srcObject === currentStream) {
            // Temporarily clear srcObject to clear the frozen frame
            // We'll restore it when video is enabled again
            videoElement.srcObject = null;
            console.log('🎥 VideoCall: Cleared srcObject to prevent frozen frame');
          }
        } else if (videoTrack && videoTrack.readyState === 'ended') {
          // Track ended - replace with blank stream
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
    // OPTIMIZED: Reduced frequency to prevent lag (was 300ms, now 2000ms)
    const checkInterval = setInterval(() => {
      const shouldBeEnabled = isVideoEnabled;
      const currentStream = localStream;
      
      if (!videoElement || !currentStream) return;
      
      const isHostVideo = window.isHost === true || window.isHostRef?.current === true;
      
      if (shouldBeEnabled) {
        const trackReady = videoTrack.readyState === 'live';
        
        if (!trackReady) {
          videoElement.style.opacity = '0';
          videoElement.style.visibility = 'hidden';
          videoElement.style.display = 'none';
          videoElement.pause();
          return;
        }
        
        const isExplicitlyHidden = videoElement.style.display === 'none' && 
                                   videoElement.style.opacity === '0' &&
                                   videoElement.style.visibility === 'hidden';
        
        if (!videoTrack.enabled && !isExplicitlyHidden) {
          videoTrack.enabled = true;
        } else if (!videoTrack.enabled && isExplicitlyHidden) {
          return;
        }
        
        if (videoElement.srcObject !== currentStream) {
          videoElement.srcObject = currentStream;
        }
        
        if (videoTrack.enabled && trackReady) {
          if (videoElement.style.opacity !== '1' || 
              videoElement.style.visibility !== 'visible' || 
              videoElement.style.display !== 'block') {
            videoElement.style.opacity = '1';
            videoElement.style.visibility = 'visible';
            videoElement.style.display = 'block';
          }
          
          if (videoElement.paused && videoElement.srcObject) {
            videoElement.play().catch(() => {});
          }
        }
      } else {
        if (videoElement.style.display !== 'none') {
          videoElement.style.opacity = '0';
          videoElement.style.visibility = 'hidden';
          videoElement.style.display = 'none';
          videoElement.pause();
        }
      }
    }, 2000); // Reduced from 300ms to 2000ms to prevent lag

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
    // Function to update video display for all participants
    const updateVideoDisplays = () => {
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
        
        // Determine if video should be shown
        // CRITICAL: Check both socket state AND track enabled state
        // Priority: socket state > track enabled state > track existence
        // Show video ONLY if:
        // 1. Socket explicitly says enabled (true) AND track is enabled, OR
        // 2. Socket state is unknown/undefined AND track exists, is live, AND is enabled
        // Hide video if:
        // 1. Socket explicitly says disabled (false), OR
        // 2. Track is disabled (even if socket state is undefined), OR
        // 3. Track doesn't exist or track is ended
        const shouldShowVideo = (socketVideoEnabled === true && videoTrack?.enabled) ||
                                (socketVideoEnabled === undefined && videoTrack && !trackEnded && videoTrack.enabled);

        if (shouldShowVideo) {
          // Video should be shown - ensure actual stream is set and track is enabled
          if (videoElement.srcObject !== stream) {
            console.log(`📹 Restoring actual stream for ${participantId}`);
            videoElement.srcObject = stream;
          }
          
          // Ensure video track is enabled
          if (videoTrack && !videoTrack.enabled) {
            videoTrack.enabled = true;
            console.log(`📹 Re-enabled video track for ${participantId}`);
          }

          // Show and play
          videoElement.style.opacity = '1';
          videoElement.style.visibility = 'visible';
          videoElement.style.display = 'block';

          if (videoElement.paused && stream.active) {
            videoElement.play().catch(() => {});
          }
        } else {
          // Video should be hidden - hide the video element IMMEDIATELY
          console.log(`📹 Hiding video for ${participantId}:`, {
            socketVideoEnabled,
            trackEnabled: videoTrack?.enabled,
            trackReady,
            trackEnded,
            socketAudioEnabled
          });
          
          videoElement.style.opacity = '0';
          videoElement.style.visibility = 'hidden';
          videoElement.style.display = 'none';
          
          // CRITICAL: Only pause if audio is also disabled
          // If audio is enabled, keep the element playing (but hidden) so audio continues
          // BUT: Don't call play() here - let the audio section handle it to avoid conflicts
          const shouldPause = socketAudioEnabled === false;
          if (shouldPause && !videoElement.paused) {
            videoElement.pause();
          }
          // Note: If audio is enabled, we'll handle play() in the audio section below

          // DON'T replace with blank stream - this causes freezing
          // Just hide the element and pause it, keep the original stream
          // The stream will be properly restored when video is enabled again
        }
        
        // CRITICAL: Mute/unmute audio tracks based on participant's audio state
        const audioTracks = stream.getAudioTracks();
        
        // CRITICAL: Always ensure video element muted state matches audio state
        // Audio plays through video element, so it must be unmuted when audio is enabled
        const shouldMuteVideoElement = socketAudioEnabled === false;
        if (videoElement.muted !== shouldMuteVideoElement) {
          videoElement.muted = shouldMuteVideoElement;
          videoElement.volume = 1.0;
          console.log(`🔊 Video element ${shouldMuteVideoElement ? 'muted' : 'unmuted'} for ${participantId} (audioEnabled: ${socketAudioEnabled})`);
        }
        
        audioTracks.forEach((audioTrack) => {
          // CRITICAL FIX: Only change audio state if explicitly set
          // If socketAudioEnabled is undefined, keep current state (don't disable)
          if (socketAudioEnabled !== undefined) {
            const shouldEnableAudio = socketAudioEnabled === true;
            if (audioTrack.enabled !== shouldEnableAudio) {
              audioTrack.enabled = shouldEnableAudio;
              console.log(`🔊 Audio track ${shouldEnableAudio ? 'enabled' : 'disabled'} for ${participantId}:`, {
                trackId: audioTrack.id,
                enabled: audioTrack.enabled,
                readyState: audioTrack.readyState,
                socketAudioEnabled,
                videoElementMuted: videoElement.muted
              });
            }
          } else {
            // socketAudioEnabled is undefined - preserve current state
            console.log(`🔊 Audio state undefined for ${participantId}, preserving current state:`, audioTrack.enabled);
          }
        });
        
        // CRITICAL: Ensure muted state is correct for audio
        // Audio plays through video element, so element must be playing
        if (socketAudioEnabled === true && audioTracks.length > 0) {
          // Ensure muted state is correct
          if (videoElement.muted) {
            videoElement.muted = false;
            videoElement.volume = 1.0;
          }
          
          // CRITICAL FIX: Ensure video element is playing when audio is enabled
          // Even if video is hidden, element must play for audio to work
          if (videoElement.paused && stream.active) {
            videoElement.play().catch(() => {});
          }
        }
        
        // CRITICAL: Listen for track ended event to immediately hide video when track stops
        if (videoTrack && !videoElement._trackEndedListener) {
          const handleTrackEnded = () => {
            const currentElement = remoteVideoRefs.current[participantId];
            if (currentElement) {
              // Check current track state (from the element's srcObject if available)
              const currentStream = currentElement.srcObject;
              const currentVideoTrack = currentStream?.getVideoTracks()?.[0];
              
              // If track is actually ended, hide the video
              if (!currentVideoTrack || currentVideoTrack.readyState === 'ended') {
                currentElement.style.opacity = '0';
                currentElement.style.visibility = 'hidden';
                currentElement.style.display = 'none';
                
                // CRITICAL FIX: Only pause if audio is also disabled
                // Check if audio track exists and is enabled
                const currentAudioTrack = currentStream?.getAudioTracks()?.[0];
                const audioEnabled = currentAudioTrack?.enabled && currentAudioTrack?.readyState === 'live';
                
                if (!audioEnabled) {
                  // Audio disabled - safe to pause
                  currentElement.pause();
                } else {
                  // Audio enabled - keep playing (but hidden) so audio continues
                  if (currentElement.paused && currentStream?.active) {
                    currentElement.play().catch(() => {});
                  }
                }
                
                // CRITICAL FIX: Never replace with blank stream - it stops audio playback!
                // Only replace if audio is also disabled (track fully ended)
                // But even then, it's safer to just hide and keep the stream
                // Blank stream replacement removed - it was causing audio to stop
              }
            }
          };
          
          videoTrack.addEventListener('ended', handleTrackEnded);
          videoElement._trackEndedListener = handleTrackEnded;
          console.log(`📹 VideoCall: Added track ended listener for ${participantId}`);
        }
      }
    });
    };

    // Initial update
    updateVideoDisplays();

    // OPTIMIZED: Reduced frequency to prevent lag (was 500ms, now 3000ms)
    // Only check when needed, not constantly
    const checkInterval = setInterval(() => {
      updateVideoDisplays();
      
      const participantsList = window.participantsRef?.current || [];
      Object.entries(remoteStreams).forEach(([participantId, stream]) => {
        const participant = participantsList.find(p => p.id === participantId);
        const isHostVideo = participant?.isHost === true;
        
        if (isHostVideo) {
          const videoElement = remoteVideoRefs.current[participantId];
          if (videoElement && stream && stream.active) {
            const videoTrack = stream.getVideoTracks()[0];
            const mediaState = participantMediaState[participantId];
            const shouldShowVideo = mediaState?.videoEnabled !== false && videoTrack && videoTrack.readyState === 'live';
            
            if (shouldShowVideo) {
              if (videoElement.style.display === 'none' || 
                  videoElement.style.opacity === '0' || 
                  videoElement.style.visibility === 'hidden') {
                videoElement.style.opacity = '1';
                videoElement.style.visibility = 'visible';
                videoElement.style.display = 'block';
                
                if (videoElement.srcObject !== stream) {
                  videoElement.srcObject = stream;
                }
                
                if (videoElement.paused) {
                  videoElement.play().catch(() => {});
                }
              }
            }
          }
        }
      });
    }, 3000); // Reduced from 500ms to 3000ms to prevent lag // Check every 500ms
    
    // Cleanup function to remove event listeners and interval
    return () => {
      clearInterval(checkInterval);
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
    
    // If video should be enabled, check if track exists and is enabled
    if (videoTrack) {
      const trackEnabled = videoTrack.enabled;
      const trackNotEnded = videoTrack.readyState !== 'ended'; // Only check if track is NOT ended
      // Show video if:
      // 1. isVideoEnabled prop is true
      // 2. Track is enabled
      // 3. Track is not ended (allow 'live' or other states)
      return trackEnabled && trackNotEnded;
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
                                     videoTrack.readyState !== 'ended';
                    
                    // Force play function - defined outside if/else so it's accessible in both blocks
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
                    
                    if (shouldShow) {
                      // CRITICAL: Ensure video track is enabled (protection against accidental disabling)
                      if (videoTrack && !videoTrack.enabled) {
                        console.warn('🎥 VideoCall: Track disabled in ref callback, re-enabling');
                        videoTrack.enabled = true;
                      }
                      
                      // CRITICAL: Force visibility only if should be shown
                      // Use !important values to prevent other code from hiding it
                      el.style.setProperty('opacity', '1', 'important');
                      el.style.setProperty('visibility', 'visible', 'important');
                      el.style.setProperty('display', 'block', 'important');
                      
                      // Try playing immediately
                      setTimeout(playVideo, 100);
                    } else {
                      // Video should be hidden - but only if explicitly disabled by user
                      // Don't hide if track is just temporarily disabled
                      if (!isVideoEnabled) {
                        // User explicitly disabled video - respect that
                        el.style.opacity = '0';
                        el.style.visibility = 'hidden';
                        el.style.display = 'none';
                        el.pause();
                      } else if (videoTrack && !videoTrack.enabled) {
                        // Track disabled but user wants video on - re-enable it
                        console.warn('🎥 VideoCall: Track disabled but isVideoEnabled=true, re-enabling');
                        videoTrack.enabled = true;
                        el.style.setProperty('opacity', '1', 'important');
                        el.style.setProperty('visibility', 'visible', 'important');
                        el.style.setProperty('display', 'block', 'important');
                        setTimeout(playVideo, 100);
                      } else if (videoTrack && videoTrack.readyState !== 'live') {
                        // Track not ready - but if user wants video on, try to restore
                        console.warn('🎥 VideoCall: Track not live but isVideoEnabled=true, track state:', videoTrack.readyState);
                        // Don't hide if user wants video on - let the protection interval handle it
                        el.style.setProperty('opacity', '1', 'important');
                        el.style.setProperty('visibility', 'visible', 'important');
                        el.style.setProperty('display', 'block', 'important');
                      } else {
                        // Unknown state but isVideoEnabled is true - show video anyway
                        console.warn('🎥 VideoCall: Unknown state but isVideoEnabled=true, forcing visibility');
                        el.style.setProperty('opacity', '1', 'important');
                        el.style.setProperty('visibility', 'visible', 'important');
                        el.style.setProperty('display', 'block', 'important');
                        setTimeout(playVideo, 100);
                      }
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
              preload="auto"
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
                autoPlay
                playsInline
                muted={false}
                preload="auto"
                ref={(el) => {
                  if (el) {
                    const wasNew = !remoteVideoRefs.current[participantId];
                    remoteVideoRefs.current[participantId] = el;
                    
                    // Set data attribute for instant DOM updates
                    el.setAttribute('data-participant-id', participantId);
                    
                    // CRITICAL: Ensure video element is NOT muted to allow audio playback
                    el.muted = false;
                    el.volume = 1.0;
                    
                    // Optimize for smoother playback
                    el.preload = 'auto';
                    el.playsInline = true;
                    el.autoplay = true;
                    
                    // Add buffering optimizations
                    if (el.buffered && el.buffered.length > 0) {
                      // Video is buffering - ensure smooth playback
                      el.playbackRate = 1.0;
                    }
                    
                    if (el.srcObject !== stream) {
                      el.srcObject = stream;
                      // Force play after setting srcObject for smoother start
                      setTimeout(() => {
                        if (el && el.paused && el.srcObject) {
                          el.play().catch(err => {
                            console.warn(`⚠️ Failed to play video for ${participantId}:`, err);
                          });
                        }
                      }, 100);
                    }
                    
                    // CRITICAL: Check if video track is enabled AND check media state from socket
                    const videoTrack = stream.getVideoTracks()[0];
                    const trackEnabled = videoTrack?.enabled ?? false;
                    const trackNotEnded = videoTrack?.readyState !== 'ended'; // Only check if track is NOT ended
                    
                    // CRITICAL: Check media state from socket events (most reliable)
                    // When participant turns off camera, socket event is more reliable than track.enabled
                    const socketMediaState = participantMediaState[participantId];
                    const socketVideoEnabled = socketMediaState?.videoEnabled;
                    const socketAudioEnabled = socketMediaState?.audioEnabled;
                    
                    // Use socket state if available, otherwise fall back to track state
                    // If socket says video is disabled, hide it regardless of track state
                    const shouldShowVideo = socketVideoEnabled !== undefined 
                      ? socketVideoEnabled && trackNotEnded
                      : trackEnabled && trackNotEnded;
                    
                    if (shouldShowVideo) {
                      // Video is enabled - show and play
                      el.style.opacity = '1';
                      el.style.visibility = 'visible';
                      el.style.display = 'block';
                      
                      // Ensure video plays (only if paused to avoid stuttering)
                      if (stream.active && el.paused) {
                        el.play().catch(() => {});
                      }
                    } else {
                      // Video is disabled - hide the video element
                      // Only pause if video is actually playing to avoid unnecessary pause/play cycles
                      if (!el.paused) {
                        el.pause();
                      }
                      el.style.opacity = '0';
                      el.style.visibility = 'hidden';
                    }
                    
                    // CRITICAL: Handle audio tracks based on participant's audio state
                    const audioTracks = stream.getAudioTracks();
                    
                    // CRITICAL: Always ensure video element muted state matches audio state
                    // Audio plays through the video element, so it must be unmuted when audio is enabled
                    // Default: If socketAudioEnabled is undefined, assume audio is enabled (unless explicitly disabled)
                    const shouldMuteVideoElement = socketAudioEnabled === false;
                    if (el.muted !== shouldMuteVideoElement) {
                      el.muted = shouldMuteVideoElement;
                      el.volume = 1.0;
                      console.log(`🔊 Video element ${shouldMuteVideoElement ? 'muted' : 'unmuted'} for ${participantId} (audioEnabled: ${socketAudioEnabled})`);
                    }
                    
                    audioTracks.forEach((audioTrack) => {
                      // Simple logic: Enable audio unless socket explicitly says false
                      // If socketAudioEnabled is undefined, enable audio (default behavior)
                      const shouldEnableAudio = socketAudioEnabled !== false;
                      if (!audioTrack.enabled && shouldEnableAudio) {
                        audioTrack.enabled = true;
                        console.log(`🔊 Audio track enabled for ${participantId}:`, {
                          trackId: audioTrack.id,
                          enabled: audioTrack.enabled,
                          readyState: audioTrack.readyState,
                          socketAudioEnabled,
                          videoElementMuted: el.muted
                        });
                      } else if (audioTrack.enabled && !shouldEnableAudio) {
                        audioTrack.enabled = false;
                        console.log(`🔊 Audio track disabled for ${participantId}:`, {
                          trackId: audioTrack.id,
                          enabled: audioTrack.enabled,
                          readyState: audioTrack.readyState,
                          socketAudioEnabled,
                          videoElementMuted: el.muted
                        });
                      }
                    });
                    
                    // CRITICAL: Force play video element if audio is enabled (audio plays through video element)
                    // Simple: Audio is enabled unless socket explicitly says false
                    const audioIsEnabled = socketAudioEnabled !== false;
                    if (audioIsEnabled && audioTracks.length > 0) {
                      if (el.paused && stream.active) {
                        el.play().catch(err => {
                          console.warn(`🔊 Failed to play audio for ${participantId}:`, err);
                        });
                      }
                      
                      // Double-check muted state after play attempt
                      if (el.muted) {
                        console.warn(`🔊 Video element still muted after play attempt, forcing unmute for ${participantId}`);
                        el.muted = false;
                        el.volume = 1.0;
                      }
                    }
                    
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
