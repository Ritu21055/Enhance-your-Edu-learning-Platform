import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Box, IconButton, Typography, Paper, Divider } from '@mui/material';
import '../css/UltraSimpleVideo.css';
import { 
  Videocam, 
  VideocamOff, 
  Mic, 
  MicOff, 
  BugReport, 
  Close,
  PersonRemove
} from '@mui/icons-material';

// Helper functions for responsive grid layout
const getGridColumns = (totalVideos) => {
  if (totalVideos === 1) return '1fr';
  if (totalVideos === 2) return '1fr 1fr';
  // For more than 2 videos, use scrollable layout with fixed column count
  return 'repeat(auto-fit, minmax(300px, 1fr))';
};

const getGridRows = (totalVideos) => {
  if (totalVideos === 1) return '1fr';
  if (totalVideos === 2) return '1fr';
  // For more than 2 videos, use auto rows for scrolling
  return 'repeat(auto-fit, minmax(200px, 1fr))';
};

const getGridLayout = (totalVideos) => {
  if (totalVideos === 1) {
    return {
      display: 'flex',
      height: '100%',
      width: '100%'
    };
  } else if (totalVideos === 2) {
    return {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr',
      height: '100%',
      gap: 2
    };
  } else {
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gridTemplateRows: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 2,
      overflowY: 'auto',
      maxHeight: '100%',
      paddingRight: 1 // Space for scrollbar
    };
  }
};

const UltraSimpleVideo = ({ 
  userName, 
  participants, 
  remoteStreams, 
  localStream,
  localVideoRef,
  isHost,
  currentUserId,
  forceConnection,
  createConnectionsToAllParticipants,
  initializeMedia,
  // Screen sharing props (kept for future implementation)
  screenStream,
  remoteScreenStreams,
  forceRender: hookForceRender,
  // Participant management
  onRemoveParticipant,
  // Debug function
  debugConnectionStatus
}) => {
  const remoteVideoRefs = useRef({});
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [forceRender, setForceRender] = useState(0);
  const [layoutKey, setLayoutKey] = useState(0);
  
  // Use the hook's forceRender if available, otherwise use local state
  const effectiveForceRender = hookForceRender !== undefined ? hookForceRender : forceRender;
  
  // Filter out current user from participants - MOVED TO TOP to prevent hoisting issues
  const otherParticipants = participants.filter(p => p.id !== currentUserId);
  const totalVideos = otherParticipants.length + 1; // +1 for local video
  
  // Debounce stream assignments to prevent blinking
  const streamAssignmentTimeouts = useRef({});
  
  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(streamAssignmentTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
      if (reRenderTimeout.current) {
        clearTimeout(reRenderTimeout.current);
      }
    };
  }, []);

  // Monitor participants data changes for debugging
  useEffect(() => {
    console.log('🎥 UltraSimpleVideo: Participants data changed:', participants.map(p => ({
      id: p.id,
      name: p.name,
      audioEnabled: p.audioEnabled,
      videoEnabled: p.videoEnabled
    })));
  }, [participants]);

  // ROBUST Media State Monitoring & Video Mirroring
  useEffect(() => {
    const fixVideoMirroringAndMediaStates = () => {
      // Find ALL video elements
      const allVideos = document.querySelectorAll('video');
      
      console.log(`📹 UltraSimpleVideo: Found ${allVideos.length} total videos`);
      
      // Fix camera videos - should be mirrored like a mirror
      allVideos.forEach((video, index) => {
        console.log(`📹 UltraSimpleVideo: Fixing camera video ${index + 1}`);
        
        // CAMERA: Mirror like a mirror (scaleX(-1))
        video.style.setProperty('transform', 'scaleX(-1)', 'important');
        video.style.setProperty('-webkit-transform', 'scaleX(-1)', 'important');
        video.style.setProperty('-moz-transform', 'scaleX(-1)', 'important');
        video.style.setProperty('-ms-transform', 'scaleX(-1)', 'important');
        video.style.setProperty('-o-transform', 'scaleX(-1)', 'important');
        
        // CAMERA: Force proper sizing
        video.style.setProperty('object-fit', 'cover', 'important');
        video.style.setProperty('background', 'transparent', 'important');
        video.style.setProperty('width', '100%', 'important');
        video.style.setProperty('height', '100%', 'important');
        video.style.setProperty('display', 'block', 'important');
        video.style.setProperty('border-radius', '0', 'important');
        
        console.log(`📹 UltraSimpleVideo: Applied camera mirroring to video ${index + 1}`);
      });
      
      // ROBUST: Continuously monitor and fix media states
      otherParticipants.forEach(participant => {
        const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
        if (videoElement) {
          // Force apply media state changes
          if (!participant.videoEnabled) {
            console.log(`🔒 UltraSimpleVideo: FORCE HIDING video for ${participant.name} (camera off)`);
            videoElement.style.setProperty('display', 'none', 'important');
            videoElement.style.setProperty('visibility', 'hidden', 'important');
            videoElement.style.setProperty('opacity', '0', 'important');
            videoElement.style.setProperty('pointer-events', 'none', 'important');
            videoElement.style.setProperty('z-index', '-1', 'important');
          } else {
            console.log(`🔓 UltraSimpleVideo: FORCE SHOWING video for ${participant.name} (camera on)`);
            videoElement.style.setProperty('display', 'block', 'important');
            videoElement.style.setProperty('visibility', 'visible', 'important');
            videoElement.style.setProperty('opacity', '1', 'important');
            videoElement.style.setProperty('pointer-events', 'auto', 'important');
            videoElement.style.setProperty('z-index', '1', 'important');
          }
        }
      });
    };

    // Fix immediately
    fixVideoMirroringAndMediaStates();

    // Set up interval to continuously monitor and fix (more frequent for robustness)
    const interval = setInterval(fixVideoMirroringAndMediaStates, 50);

    return () => clearInterval(interval);
  }, [forceRender, otherParticipants]);

  // DEDICATED Media State Monitoring - Runs independently to prevent issues
  useEffect(() => {
    const monitorMediaStates = () => {
      console.log('🔍 UltraSimpleVideo: Monitoring media states...');
      
      otherParticipants.forEach(participant => {
        const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
        
        if (videoElement) {
          const currentDisplay = window.getComputedStyle(videoElement).display;
          const currentVisibility = window.getComputedStyle(videoElement).visibility;
          const currentOpacity = window.getComputedStyle(videoElement).opacity;
          
          console.log(`🔍 UltraSimpleVideo: ${participant.name} media state check:`, {
            videoEnabled: participant.videoEnabled,
            currentDisplay,
            currentVisibility,
            currentOpacity,
            shouldBeVisible: participant.videoEnabled
          });
          
          // Force correct media state if there's a mismatch
          if (!participant.videoEnabled && (currentDisplay !== 'none' || currentVisibility !== 'hidden' || currentOpacity !== '0')) {
            console.log(`🔒 UltraSimpleVideo: CORRECTING - Force hiding ${participant.name} video`);
            videoElement.style.setProperty('display', 'none', 'important');
            videoElement.style.setProperty('visibility', 'hidden', 'important');
            videoElement.style.setProperty('opacity', '0', 'important');
            videoElement.style.setProperty('pointer-events', 'none', 'important');
            videoElement.style.setProperty('z-index', '-1', 'important');
          } else if (participant.videoEnabled && (currentDisplay === 'none' || currentVisibility === 'hidden' || currentOpacity === '0')) {
            console.log(`🔓 UltraSimpleVideo: GENTLY showing ${participant.name} video`);
            videoElement.style.setProperty('display', 'block', 'important');
            videoElement.style.setProperty('visibility', 'visible', 'important');
            videoElement.style.setProperty('opacity', '1', 'important');
            videoElement.style.setProperty('pointer-events', 'auto', 'important');
            videoElement.style.setProperty('z-index', '1', 'important');
          }
        }
      });
    };

    // Monitor immediately
    monitorMediaStates();

    // GENTLE MONITORING: Reduce monitoring frequency to prevent camera issues
    const interval = setInterval(monitorMediaStates, 500); // Reduced to 500ms for stability

    return () => clearInterval(interval);
  }, [otherParticipants]);

  // Stable video element creation callback to prevent recreation
  const createVideoElement = useCallback((participantId) => {
    console.log(`🎥 UltraSimpleVideo: Creating stable video element for ${participantId}`);
    return (el) => {
      if (el && participantId) {
        // Check if this is a new element or the same one
        const existingElement = remoteVideoRefs.current[participantId];
        if (existingElement && existingElement === el) {
          console.log(`🎥 UltraSimpleVideo: Video element already exists for ${participantId}, skipping recreation`);
          return;
        }
        
        remoteVideoRefs.current[participantId] = el;
        
        if (remoteStreams[participantId]) {
          const stream = remoteStreams[participantId];
          // Validate stream before assignment
          if (stream && stream.active && stream.getTracks().length > 0) {
            console.log(`✅ UltraSimpleVideo: Valid stream for ${participantId}, assigning...`);
            el.srcObject = stream;
            el.play().catch(err => {
              console.log(`❌ UltraSimpleVideo: Video play failed for ${participantId}:`, err);
              // Retry play after a short delay
              setTimeout(() => {
                el.play().catch(retryErr => {
                  console.log(`❌ UltraSimpleVideo: Video play retry failed for ${participantId}:`, retryErr);
                });
              }, 500);
            });
          } else {
            console.log(`❌ UltraSimpleVideo: Invalid stream for ${participantId}:`, {
              stream: !!stream,
              active: stream?.active,
              tracks: stream?.getTracks?.()?.length
            });
          }
        }
        
        // Force stream assignment after a short delay to ensure element is ready
        // Only if stream is not already assigned
        setTimeout(() => {
          if (remoteStreams[participantId] && el.srcObject !== remoteStreams[participantId]) {
            const stream = remoteStreams[participantId];
            // Validate stream before force assignment
            if (stream && stream.active && stream.getTracks().length > 0) {
              console.log(`🔄 UltraSimpleVideo: Force assigning valid stream after delay for ${participantId}`);
              el.srcObject = stream;
              el.play().then(() => {
                console.log(`✅ UltraSimpleVideo: Force video play successful for ${participantId}`);
              }).catch(err => {
                console.log(`❌ UltraSimpleVideo: Force video play failed for ${participantId}:`, err);
                // Retry force play after a short delay
                setTimeout(() => {
                  el.play().catch(retryErr => {
                    console.log(`❌ UltraSimpleVideo: Force video play retry failed for ${participantId}:`, retryErr);
                  });
                }, 1000);
              });
            } else {
              console.log(`❌ UltraSimpleVideo: Invalid stream for force assignment ${participantId}:`, {
                stream: !!stream,
                active: stream?.active,
                tracks: stream?.getTracks?.()?.length
              });
            }
          } else if (remoteStreams[participantId] && el.srcObject === remoteStreams[participantId]) {
            console.log(`✅ UltraSimpleVideo: Stream already assigned for ${participantId}, skipping force assignment`);
          }
        }, 100);
      }
    };
  }, [remoteStreams]);

  // Set up local video
  useEffect(() => {
    console.log('🎥 UltraSimpleVideo: Local stream effect triggered');
    console.log('🎥 UltraSimpleVideo: Local stream:', localStream);
    console.log('🎥 UltraSimpleVideo: Local video ref:', localVideoRef.current);
    
    if (localStream && localVideoRef.current) {
      // Only set the stream if it's different from what's already set
      if (localVideoRef.current.srcObject !== localStream) {
      console.log('🎥 UltraSimpleVideo: Setting local stream');
      console.log('🎥 UltraSimpleVideo: Stream details:', {
        id: localStream.id,
        active: localStream.active,
        tracks: localStream.getTracks().length,
        videoTracks: localStream.getVideoTracks().length,
        audioTracks: localStream.getAudioTracks().length
      });
      
      localVideoRef.current.srcObject = localStream;
      
      // Force video element to be visible and properly configured
      localVideoRef.current.style.width = '100%';
      localVideoRef.current.style.height = '100%';
      localVideoRef.current.style.objectFit = 'cover';
      localVideoRef.current.style.backgroundColor = 'transparent';
      localVideoRef.current.style.display = 'block';
      
      // Force video to load and play
      localVideoRef.current.load();
      localVideoRef.current.play().catch(err => {
        console.log('🎥 UltraSimpleVideo: Local video play failed:', err);
        // Retry local video play after a short delay
        setTimeout(() => {
          localVideoRef.current.load();
          localVideoRef.current.play().catch(retryErr => {
            console.log('🎥 UltraSimpleVideo: Local video play retry failed:', retryErr);
          });
        }, 500);
      });
      } else {
        console.log('🎥 UltraSimpleVideo: Local stream already set, skipping');
      }
    } else {
      console.log('🎥 UltraSimpleVideo: Cannot set local stream - missing stream or ref');
      if (!localStream) console.log('🎥 UltraSimpleVideo: No local stream available');
      if (!localVideoRef.current) console.log('🎥 UltraSimpleVideo: No local video ref available');
      
      // If we have a stream but no video ref, wait and try again
      if (localStream && !localVideoRef.current) {
        console.log('🎥 UltraSimpleVideo: Stream available but video ref not ready, retrying...');
        const retrySetStream = () => {
          if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
            
            // Force video element to be visible and properly configured
            localVideoRef.current.style.width = '100%';
            localVideoRef.current.style.height = '100%';
            localVideoRef.current.style.objectFit = 'cover';
            localVideoRef.current.style.backgroundColor = 'transparent';
            localVideoRef.current.style.display = 'block';
            
            // Force video to load and play
            localVideoRef.current.load();
            localVideoRef.current.play().catch(err => {
              console.log('🎥 UltraSimpleVideo: Local video play failed (retry):', err);
              // Retry play after a short delay
              setTimeout(() => {
                localVideoRef.current.load();
                localVideoRef.current.play().catch(retryErr => {
                  console.log('🎥 UltraSimpleVideo: Local video play retry failed (retry):', retryErr);
                });
              }, 500);
            });
            console.log('🎥 UltraSimpleVideo: Local video stream set on video element (retry)');
          } else {
            setTimeout(retrySetStream, 100);
          }
        };
        setTimeout(retrySetStream, 100);
      }
    }
  }, [localStream]);

  // Aggressive fix for white screens - continuously check and fix video elements
  useEffect(() => {
    const fixWhiteScreens = () => {
      // Fix local video
      if (localVideoRef.current && localStream) {
        const video = localVideoRef.current;
        if (video.srcObject !== localStream || !video.videoWidth || !video.videoHeight) {
          console.log('🔧 UltraSimpleVideo: Fixing local video white screen');
          video.srcObject = localStream;
          video.load();
          video.play().catch(err => console.log('🔧 Local video play failed:', err));
        }
      }
      
      // Fix remote videos
      Object.keys(remoteVideoRefs.current).forEach(participantId => {
        const video = remoteVideoRefs.current[participantId];
        const stream = remoteStreams[participantId];
        
        if (video && stream && stream.active) {
          if (video.srcObject !== stream || !video.videoWidth || !video.videoHeight) {
            console.log(`🔧 UltraSimpleVideo: Fixing remote video white screen for ${participantId}`);
            video.srcObject = stream;
            video.load();
            video.play().catch(err => console.log(`🔧 Remote video play failed for ${participantId}:`, err));
          }
        }
      });
    };
    
    // Run immediately
    fixWhiteScreens();
    
    // Run every 2 seconds to catch any missed fixes
    const interval = setInterval(fixWhiteScreens, 2000);
    
    return () => clearInterval(interval);
  }, [localStream, remoteStreams]);

  // Memoize participants to prevent unnecessary re-renders
  const memoizedParticipants = useMemo(() => {
    console.log('🔄 UltraSimpleVideo: Memoizing participants');
    return participants;
  }, [participants.map(p => `${p.id}-${p.audioEnabled}-${p.videoEnabled}`).join(',')]);

  // Throttle re-renders to prevent excessive updates
  const reRenderTimeout = useRef(null);
  
  // Force re-render when participants change (for media state updates)
  useEffect(() => {
    console.log('🔄 UltraSimpleVideo: Participants changed, checking if re-render needed');
    console.log('🔄 UltraSimpleVideo: Participants data:', participants.map(p => ({ 
      id: p.id, 
      name: p.name, 
      audioEnabled: p.audioEnabled, 
      videoEnabled: p.videoEnabled 
    })));
    
    // Clear existing timeout
    if (reRenderTimeout.current) {
      clearTimeout(reRenderTimeout.current);
    }
    
    // Only force re-render if there are actual media state changes
    const hasMediaStateChanges = participants.some(p => 
      p.audioEnabled !== undefined || p.videoEnabled !== undefined
    );
    
    if (hasMediaStateChanges) {
      console.log('🔄 UltraSimpleVideo: Media state changes detected, throttling re-render');
      // Throttle re-renders to prevent excessive updates
      reRenderTimeout.current = setTimeout(() => {
        console.log('🔄 UltraSimpleVideo: Executing throttled re-render');
        setForceRender(prev => prev + 1);
      }, 100); // 100ms throttle
    } else {
      console.log('🔄 UltraSimpleVideo: No media state changes, skipping re-render');
    }
  }, [participants]);

  // Clean up video elements when participants are removed
  useEffect(() => {
    console.log('🧹 UltraSimpleVideo: Cleaning up video elements for removed participants');
    console.log('🧹 UltraSimpleVideo: Current participants:', participants.map(p => ({ id: p.id, name: p.name })));
    
    // Get current participant IDs
    const currentParticipantIds = participants.map(p => p.id);
    
    // Clean up video refs for participants that no longer exist
    Object.keys(remoteVideoRefs.current).forEach(participantId => {
      if (!currentParticipantIds.includes(participantId)) {
        console.log(`🧹 UltraSimpleVideo: Cleaning up video ref for removed participant: ${participantId}`);
        const videoElement = remoteVideoRefs.current[participantId];
        if (videoElement) {
          // Clear the video source
          videoElement.srcObject = null;
          // Remove the video element from the ref
          delete remoteVideoRefs.current[participantId];
        }
      }
    });
    
    // Force a re-render to ensure the UI updates
    setTimeout(() => {
      console.log('🔄 UltraSimpleVideo: Force re-render after participant cleanup');
      setLayoutKey(prev => prev + 1);
      setForceRender(prev => prev + 1);
    }, 50);
  }, [participants]);

  // Set up remote videos
  useEffect(() => {
    // Clean up video elements for streams that no longer exist
    Object.keys(remoteVideoRefs.current).forEach(participantId => {
      if (!remoteStreams[participantId]) {
        const videoElement = remoteVideoRefs.current[participantId];
        if (videoElement) {
          videoElement.srcObject = null;
          delete remoteVideoRefs.current[participantId];
        }
      }
    });
    
    Object.keys(remoteStreams).forEach(participantId => {
      if (participantId === currentUserId) {
        return;
      }
      
      const videoEl = remoteVideoRefs.current[participantId];
      const stream = remoteStreams[participantId];
      
      if (videoEl && stream) {
        if (videoEl.srcObject !== stream) {
          if (stream.active && stream.getTracks().length > 0) {
            if (streamAssignmentTimeouts.current[participantId]) {
              clearTimeout(streamAssignmentTimeouts.current[participantId]);
            }
            
            streamAssignmentTimeouts.current[participantId] = setTimeout(() => {
              videoEl.srcObject = stream;
              delete streamAssignmentTimeouts.current[participantId];
            }, 50);
          }
          
          videoEl.play().catch(err => {
            setTimeout(() => {
              videoEl.srcObject = stream;
              videoEl.play().catch(retryErr => {
                // Ignore play errors
              });
            }, 500);
          });
        }
      }
    });
  }, [remoteStreams, currentUserId]);

  useEffect(() => {
    const forceCorrectMediaStates = () => {
      otherParticipants.forEach(participant => {
        const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
        if (videoElement) {
          videoElement.setAttribute('data-video-enabled', participant.videoEnabled);
          videoElement.setAttribute('data-audio-enabled', participant.audioEnabled);
          
          if (!participant.videoEnabled) {
            videoElement.style.setProperty('display', 'none', 'important');
            videoElement.style.setProperty('visibility', 'hidden', 'important');
            videoElement.style.setProperty('opacity', '0', 'important');
            videoElement.style.setProperty('pointer-events', 'none', 'important');
            videoElement.style.setProperty('z-index', '-1', 'important');
          } else {
            videoElement.style.setProperty('display', 'block', 'important');
            videoElement.style.setProperty('visibility', 'visible', 'important');
            videoElement.style.setProperty('opacity', '1', 'important');
            videoElement.style.setProperty('pointer-events', 'auto', 'important');
            videoElement.style.setProperty('z-index', '1', 'important');
          }
        }
      });
    };

    forceCorrectMediaStates();
  }, [otherParticipants, forceRender]);
  

  return (
    <Box className="ultra-simple-video-container">
      {/* Floating Control Bar */}
      <Box className="debug-panel-toggle">
        {/* Debug Panel Toggle */}
        <IconButton 
          className={`debug-toggle-button ${debugPanelOpen ? 'active' : ''}`}
          onClick={() => setDebugPanelOpen(!debugPanelOpen)}
        >
          <BugReport className="debug-icon" />
        </IconButton>
      </Box>

      {/* Main Video Area */}
      <Box 
        key={`video-area-${totalVideos}-${otherParticipants.length}-${layoutKey}`}
        className={`main-video-area ${totalVideos > 2 ? 'video-scrollable' : ''} ${totalVideos === 1 ? 'single-video' : ''}`}
        style={getGridLayout(totalVideos)}>
        {/* Local Video */}
        <Box 
          key={`local-video-${totalVideos}`}
          className={`video-item ${totalVideos > 2 ? 'video-item-scrollable' : ''} ${totalVideos === 1 ? 'single-video' : ''} ${isHost ? 'host-video' : ''}`}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            data-local="true"
            className="video-element"
            style={{
              position: 'relative',
              zIndex: 1,
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
          <Typography 
            variant="body2" 
            className={`participant-name ${isHost ? 'host' : 'participant'}`}
            style={{
            position: 'absolute',
              bottom: '60px',
              left: '20px',
              color: isHost ? '#FFD700' : '#FFFFFF',
              fontWeight: 700,
              fontSize: '1.1rem',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '0.3px',
              zIndex: 100,
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              padding: '4px 8px',
              borderRadius: '6px',
              margin: '0'
            }}
          >
            {isHost && '👑 '}{userName || 'You'}
            </Typography>
          
        </Box>

        {/* Remote Videos - Now integrated into main grid */}
            {otherParticipants.map(participant => (
              <Box 
                key={`${participant.id}-${participant.audioEnabled}-${participant.videoEnabled}-${totalVideos}`}
                className={`video-item ${totalVideos > 2 ? 'video-item-scrollable' : ''} ${participant.isHost ? 'host-video' : ''}`}>
                
                {/* Remove participant button - completely removed to maintain perfect video layout */}

                <video
                  ref={createVideoElement(participant.id)}
                  autoPlay
                  playsInline
                  className="video-element"
                  data-participant-id={participant.id}
                  data-video-enabled={participant.videoEnabled}
                  data-audio-enabled={participant.audioEnabled}
                  style={{
                    display: participant.videoEnabled ? 'block' : 'none',
                    visibility: participant.videoEnabled ? 'visible' : 'hidden',
                    opacity: participant.videoEnabled ? 1 : 0,
                    pointerEvents: participant.videoEnabled ? 'auto' : 'none'
                  }}
                />
                
                {/* Debug info for camera state */}
                {console.log(`🎥 UltraSimpleVideo: Participant ${participant.name} camera state:`, {
                  videoEnabled: participant.videoEnabled,
                  shouldShowVideo: participant.videoEnabled,
                  shouldShowOverlay: !participant.videoEnabled
                })}
                
                {/* Camera Off Overlay - Simplified Design */}
                {!participant.videoEnabled && (
                  <Box className="camera-off-overlay">
                    <Box className="camera-off-avatar">
                      <Typography variant="h4" className="camera-off-avatar-initials">
                        {participant.name ? participant.name.charAt(0).toUpperCase() : '?'}
                      </Typography>
                    </Box>
                    <Typography variant="body2" className="camera-off-subtitle">
                      {participant.name} has turned off their camera
                    </Typography>
                  </Box>
                )}
                
                {/* Audio Off Indicator */}
                {!participant.audioEnabled && (
                  <Box className="audio-off-indicator">
                    <Typography variant="caption" className="audio-off-icon">
                      🔇
                    </Typography>
                  </Box>
                )}

                <Box className="video-overlay">
                  {/* Only show crown for local user (current user), not for remote participants */}
                  {participant.isHost && isHost && (
                    <Box className="host-crown">
                      👑
                    </Box>
                  )}
                  <Box className="participant-name-container">
                    <Typography variant="body1" className={`participant-name ${participant.isHost ? 'host' : 'participant'}`}>
                    {participant.name || 'Participant'}
                  </Typography>
                    
                    {/* Debug info for remove button */}
                    {console.log(`🗑️ DEBUG: Remove button conditions for ${participant.name}:`, {
                      isHost,
                      hasOnRemoveParticipant: !!onRemoveParticipant,
                      participantId: participant.id,
                      participantName: participant.name
                    })}
                    
                    {/* Remove participant button - only show for host */}
                    {isHost && onRemoveParticipant && (
                      <IconButton
                        className="remove-participant-button-inline"
                        onClick={() => {
                          console.log('🗑️ Remove button clicked for:', participant.name, participant.id);
                          console.log('🗑️ onRemoveParticipant function:', onRemoveParticipant);
                          console.log('🗑️ isHost:', isHost);
                          const confirmed = window.confirm(`Remove ${participant.name} from the meeting?`);
                          if (confirmed) {
                            console.log('🗑️ Confirmed removal, calling onRemoveParticipant');
                            onRemoveParticipant(participant.id, participant.name);
                          } else {
                            console.log('🗑️ Removal cancelled by user');
                          }
                        }}
                        size="small"
                        style={{
                          color: '#ffffff',
                          backgroundColor: '#ff4444',
                          border: '2px solid #ffffff',
                          width: '32px',
                          height: '32px',
                          marginLeft: '8px',
                          boxShadow: '0 4px 12px rgba(255, 68, 68, 0.8)',
                          zIndex: 9999
                        }}
                      >
                        <PersonRemove style={{ fontSize: '14px' }} />
                      </IconButton>
                    )}
                  </Box>
                  
                  {/* Media state indicators */}
                  <Box className="media-status-indicators">
                    {/* Audio indicator */}
                    <Box
                      className={`media-indicator ${participant.audioEnabled === true ? 'audio-enabled' : 'audio-disabled'}`}
                      title={participant.audioEnabled === true ? 'Audio On' : 'Audio Off'}
                    >
                      <Typography variant="caption" className="media-indicator-icon">
                        {participant.audioEnabled === true ? '🎤' : '🔇'}
                      </Typography>
                    </Box>
                    
                    {/* Video indicator - only show when camera is on */}
                    {participant.videoEnabled && (
                      <Box
                        className="media-indicator video-enabled"
                        title="Camera On"
                      >
                        <Typography variant="caption" className="media-indicator-icon">
                          📹
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  
                  {/* Debug info for media state */}
                  {console.log(`🎥 UltraSimpleVideo: Participant ${participant.name} media state:`, {
                    audioEnabled: participant.audioEnabled,
                    videoEnabled: participant.videoEnabled,
                    id: participant.id
                  })}
                </Box>
              </Box>
            ))}
            
            {/* Remote streams without participant info */}
            {Object.keys(remoteStreams).map(streamId => {
              const hasParticipant = otherParticipants.some(p => p.id === streamId);
              if (hasParticipant) return null;
              
              return (
                <Box 
                  key={streamId}
                  className={`video-item ${totalVideos > 2 ? 'video-item-scrollable' : ''}`}>
                  <video
                    ref={(el) => {
                      if (el) {
                        remoteVideoRefs.current[streamId] = el;
                      }
                    }}
                    autoPlay
                    playsInline
                    className="video-element"
                  />
                  <Box className="video-overlay">
                    <Typography variant="body1" className="participant-name participant">
                      Remote User
                    </Typography>
                  </Box>
                </Box>
              );
            })}
            
            
      </Box>

      {/* Debug Panel */}
      {debugPanelOpen && (
        <Paper className="debug-panel open">
          {/* Debug Panel Header */}
          <Box className="debug-panel-header">
            <Typography variant="h6" className="debug-panel-title">
              <BugReport /> Connection Tools
            </Typography>
            <Typography variant="body2" style={{ color: '#FF6B35', marginTop: '4px' }}>
              All Videos: {document.querySelectorAll('video').length}
            </Typography>
            <IconButton 
              className="debug-panel-close"
              onClick={() => setDebugPanelOpen(false)}
            >
              <Close />
            </IconButton>
          </Box>

          {/* Connection Buttons */}
          <Box className="debug-section">
            <Typography variant="subtitle2" className="debug-section-title">
              Media & Connection Actions
            </Typography>
            
            <button 
              className="debug-button"
              onClick={async () => {
                console.log('🎥 INIT: Manually initializing media...');
                console.log('🎥 INIT: Current local stream:', localStream);
                console.log('🎥 INIT: Current local video ref:', localVideoRef.current);
                
                try {
                  if (initializeMedia) {
                    console.log('🎥 INIT: Calling initializeMedia function...');
                    await initializeMedia();
                    console.log('🎥 INIT: Media initialization completed');
                  } else {
                    console.log('🎥 INIT: initializeMedia function not available');
                  }
                } catch (error) {
                  console.error('🎥 INIT: Media initialization failed:', error);
                }
              }}
            >
              🎥 Initialize Media
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🧪 TEST: Forcing WebRTC connection test');
                console.log('🧪 TEST: Local stream:', localStream);
                console.log('🧪 TEST: Remote streams:', remoteStreams);
                console.log('🧪 TEST: Participants:', participants);
                console.log('🧪 TEST: Socket connected:', !!window.socket);
                console.log('🧪 TEST: Socket ID:', window.socket?.id);
                
                // Test socket communication
                if (window.socket) {
                  console.log('🧪 TEST: Emitting test event...');
                  window.socket.emit('ping', { test: 'connection test' });
                  
                  // Test participant-ready event
                  console.log('🧪 TEST: Emitting participant-ready test...');
                  window.socket.emit('participant-ready', { 
                    meetingId: '123',
                    participantId: currentUserId,
                    streamId: localStream?.id || 'test-stream'
                  });
                }
                
                // Test force connection
                if (forceConnection) {
                  console.log('🧪 TEST: Calling forceConnection...');
                  forceConnection();
                }
              }}
            >
              🧪 Test Connection
            </button>

            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔗 FORCE: Forcing connection to all participants...');
                if (forceConnection) {
                  forceConnection();
                }
              }}
            >
              🔗 Force Connection
            </button>

            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔄 REFRESH: Refreshing all streams...');
                console.log('🔄 REFRESH: Local stream:', localStream);
                console.log('🔄 REFRESH: Remote streams:', remoteStreams);
                console.log('🔄 REFRESH: Participants:', participants);
                
                // Force re-render of video elements
                Object.keys(remoteVideoRefs.current).forEach(participantId => {
                  const videoEl = remoteVideoRefs.current[participantId];
                  if (videoEl && remoteStreams[participantId]) {
                    console.log(`🔄 REFRESH: Refreshing video for ${participantId}`);
                    videoEl.srcObject = remoteStreams[participantId];
                    videoEl.load();
                  }
                });
                
                // Refresh local video
                if (localVideoRef.current && localStream) {
                  console.log('🔄 REFRESH: Refreshing local video');
                  localVideoRef.current.srcObject = localStream;
                  localVideoRef.current.load();
                }
              }}
            >
              🔄 Refresh Streams
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('📡 TEST: Testing media state change...');
                console.log('📡 TEST: Current participants:', otherParticipants.map(p => ({
                  id: p.id,
                  name: p.name,
                  audioEnabled: p.audioEnabled,
                  videoEnabled: p.videoEnabled
                })));
                
                // Force a re-render to test if the UI updates
                setForceRender(prev => prev + 1);
                console.log('📡 TEST: Forced re-render triggered');
              }}
            >
              📡 Test Media State
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🗑️ TEST: Testing remove participant functionality...');
                console.log('🗑️ TEST: Current participants:', otherParticipants.map(p => ({
                  id: p.id,
                  name: p.name,
                  isHost: p.isHost
                })));
                console.log('🗑️ TEST: onRemoveParticipant function:', !!onRemoveParticipant);
                console.log('🗑️ TEST: isHost:', isHost);
                
                // Test the remove participant function if available
                if (onRemoveParticipant && otherParticipants.length > 0) {
                  const testParticipant = otherParticipants[0];
                  console.log('🗑️ TEST: Testing remove participant for:', testParticipant.name);
                  onRemoveParticipant(testParticipant.id, testParticipant.name);
                } else {
                  console.log('🗑️ TEST: Cannot test remove participant - no function or participants');
                }
              }}
            >
              🗑️ Test Remove Participant
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('📹 FIX: Force fixing camera mirroring...');
                const allVideos = document.querySelectorAll('video');
                
                console.log(`📹 FIX: Found ${allVideos.length} total videos`);
                
                // Fix camera videos - mirror like a mirror
                allVideos.forEach((video, index) => {
                  console.log(`📹 FIX: Fixing camera video ${index + 1}`);
                  video.style.setProperty('transform', 'scaleX(-1)', 'important');
                  video.style.setProperty('-webkit-transform', 'scaleX(-1)', 'important');
                  video.style.setProperty('object-fit', 'cover', 'important');
                  video.style.setProperty('background', 'transparent', 'important');
                  video.style.setProperty('width', '100%', 'important');
                  video.style.setProperty('height', '100%', 'important');
                  console.log(`📹 FIX: Applied camera mirroring to video ${index + 1}`);
                });
                
                setForceRender(prev => prev + 1);
                console.log('📹 FIX: Camera mirroring fix completed');
              }}
            >
              📹 Fix Camera Mirroring
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('📱 FIX: Force updating media states...');
                console.log('📱 FIX: Current participants media state:');
                otherParticipants.forEach(participant => {
                  console.log(`📱 FIX: - ${participant.name}: Audio=${participant.audioEnabled}, Video=${participant.videoEnabled}`);
                });
                
                // Force re-render to update media states
                setForceRender(prev => prev + 1);
                
                // Force hide videos for participants with camera off
                otherParticipants.forEach(participant => {
                  if (!participant.videoEnabled) {
                    const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
                    if (videoElement) {
                      videoElement.style.setProperty('display', 'none', 'important');
                      videoElement.style.setProperty('visibility', 'hidden', 'important');
                      videoElement.style.setProperty('opacity', '0', 'important');
                      videoElement.style.setProperty('pointer-events', 'none', 'important');
                      console.log(`📱 FIX: Hidden video for ${participant.name} (camera off)`);
                    }
                  }
                });
                
                console.log('📱 FIX: Media state update completed');
              }}
            >
              📱 Fix Media States
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🎥 FIX: Force hiding all camera-off videos...');
                const allVideos = document.querySelectorAll('video');
                console.log(`🎥 FIX: Found ${allVideos.length} total video elements`);
                
                allVideos.forEach((video, index) => {
                  const participantId = video.getAttribute('data-participant-id');
                  if (participantId) {
                    const participant = otherParticipants.find(p => p.id === participantId);
                    if (participant && !participant.videoEnabled) {
                      console.log(`🎥 FIX: Force hiding video for ${participant.name} (camera off)`);
                      video.style.setProperty('display', 'none', 'important');
                      video.style.setProperty('visibility', 'hidden', 'important');
                      video.style.setProperty('opacity', '0', 'important');
                      video.style.setProperty('pointer-events', 'none', 'important');
                      video.style.setProperty('z-index', '-1', 'important');
                    }
                  }
                });
                
                // Force re-render
                setForceRender(prev => prev + 1);
                console.log('🎥 FIX: Force hide completed');
              }}
            >
              🎥 Force Hide Camera-Off Videos
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔗 GENTLE FIX: Checking host stream sharing...');
                console.log('🔗 GENTLE FIX: Current local stream:', localStream);
                console.log('🔗 GENTLE FIX: Current remote streams:', Object.keys(remoteStreams));
                console.log('🔗 GENTLE FIX: Current participants:', otherParticipants.map(p => ({ id: p.id, name: p.name })));
                
                // GENTLE: Only try connection once if needed
                if (forceConnection && otherParticipants.length > 0) {
                  console.log('🔗 GENTLE FIX: Attempting gentle connection to participants...');
                  otherParticipants.forEach(participant => {
                    console.log(`🔗 GENTLE FIX: Connecting to ${participant.name} (${participant.id})`);
                    forceConnection(participant.id);
                  });
                }
                
                // Force re-render
                setForceRender(prev => prev + 1);
                console.log('🔗 GENTLE FIX: Gentle connection attempt completed');
              }}
            >
              🔗 Gentle Share Host Stream
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔗 GENTLE CONNECTION: Testing gentle connection approach...');
                console.log('🔗 GENTLE CONNECTION: Current state:', {
                  isHost,
                  hasLocalStream: !!localStream,
                  localStreamActive: localStream?.active,
                  participantsCount: otherParticipants.length,
                  remoteStreamsCount: Object.keys(remoteStreams).length
                });
                
                // Test if we need to create connections
                if (createConnectionsToAllParticipants && otherParticipants.length > 0) {
                  console.log('🔗 GENTLE CONNECTION: Attempting to create connections to all participants...');
                  createConnectionsToAllParticipants().then(() => {
                    console.log('🔗 GENTLE CONNECTION: Connection creation completed');
                  }).catch(error => {
                    console.log('🔗 GENTLE CONNECTION: Connection creation failed:', error);
                  });
                } else {
                  console.log('🔗 GENTLE CONNECTION: No participants to connect to or function not available');
                }
              }}
            >
              🔗 Test Gentle Connection
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔍 STREAM ANALYSIS: Analyzing current stream state...');
                console.log('🔍 STREAM ANALYSIS: Local stream analysis:', {
                  exists: !!localStream,
                  active: localStream?.active,
                  id: localStream?.id,
                  tracks: localStream?.getTracks()?.length,
                  videoTracks: localStream?.getVideoTracks()?.length,
                  audioTracks: localStream?.getAudioTracks()?.length
                });
                
                console.log('🔍 STREAM ANALYSIS: Remote streams analysis:');
                Object.keys(remoteStreams).forEach(participantId => {
                  const stream = remoteStreams[participantId];
                  const participant = otherParticipants.find(p => p.id === participantId);
                  console.log(`🔍 STREAM ANALYSIS: ${participant?.name || participantId}:`, {
                    exists: !!stream,
                    active: stream?.active,
                    id: stream?.id,
                    tracks: stream?.getTracks()?.length,
                    videoTracks: stream?.getVideoTracks()?.length,
                    audioTracks: stream?.getAudioTracks()?.length
                  });
                });
                
                console.log('🔍 STREAM ANALYSIS: Video elements analysis:');
                const allVideos = document.querySelectorAll('video');
                allVideos.forEach((video, index) => {
                  const participantId = video.getAttribute('data-participant-id');
                  const isLocal = video.getAttribute('data-local') === 'true';
                  console.log(`🔍 STREAM ANALYSIS: Video ${index + 1} (${isLocal ? 'LOCAL' : participantId}):`, {
                    hasSrcObject: !!video.srcObject,
                    srcObjectId: video.srcObject?.id,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    paused: video.paused,
                    muted: video.muted
                  });
                });
              }}
            >
              🔍 Analyze Streams
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔍 GENTLE DEBUG: Using hook debug function...');
                if (debugConnectionStatus) {
                  debugConnectionStatus();
                } else {
                  console.log('🔍 GENTLE DEBUG: Debug function not available');
                }
              }}
            >
              🔍 Gentle Debug (Hook)
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔍 CONNECTION DEBUG: Checking connection status...');
                console.log('🔍 CONNECTION DEBUG: Local stream status:', {
                  hasStream: !!localStream,
                  streamActive: localStream?.active,
                  trackCount: localStream?.getTracks()?.length,
                  videoTracks: localStream?.getVideoTracks()?.length,
                  audioTracks: localStream?.getAudioTracks()?.length
                });
                console.log('🔍 CONNECTION DEBUG: Remote streams:', Object.keys(remoteStreams));
                console.log('🔍 CONNECTION DEBUG: Participants:', otherParticipants.map(p => ({
                  id: p.id,
                  name: p.name,
                  isHost: p.isHost,
                  isApproved: p.isApproved
                })));
                console.log('🔍 CONNECTION DEBUG: Total video elements:', document.querySelectorAll('video').length);
                console.log('🔍 CONNECTION DEBUG: Video elements with srcObject:', 
                  Array.from(document.querySelectorAll('video')).filter(v => v.srcObject).length
                );
                
                // Check if we can see each other
                console.log('🔍 CONNECTION DEBUG: Checking if participants can see each other...');
                otherParticipants.forEach(participant => {
                  const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
                  const hasStream = !!remoteStreams[participant.id];
                  const hasVideoElement = !!videoElement;
                  const videoHasSrcObject = videoElement?.srcObject;
                  
                  console.log(`🔍 CONNECTION DEBUG: ${participant.name}:`, {
                    hasStream,
                    hasVideoElement,
                    videoHasSrcObject,
                    streamActive: remoteStreams[participant.id]?.active,
                    streamTracks: remoteStreams[participant.id]?.getTracks()?.length
                  });
                });
              }}
            >
              🔍 Debug Connection Status
            </button>
            
            
            {/* Individual Remove Buttons for Testing */}
            {otherParticipants.map(participant => (
              <button 
                key={`test-remove-${participant.id}`}
                className="debug-button"
                onClick={() => {
                  console.log('🗑️ TEST: Direct removal test for:', participant.name);
                  if (onRemoveParticipant) {
                    onRemoveParticipant(participant.id, participant.name);
                  }
                }}
                style={{ 
                  backgroundColor: '#ff4444', 
                  color: 'white',
                  margin: '2px',
                  fontSize: '12px',
                  padding: '4px 8px'
                }}
              >
                🗑️ Remove {participant.name}
              </button>
            ))}
            
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default UltraSimpleVideo;