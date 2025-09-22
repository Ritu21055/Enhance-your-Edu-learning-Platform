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
  // Screen sharing props
  screenStream,
  remoteScreenStreams,
  forceRender: hookForceRender,
  // Participant management
  onRemoveParticipant
}) => {
  const remoteVideoRefs = useRef({});
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [forceRender, setForceRender] = useState(0);
  const [layoutKey, setLayoutKey] = useState(0);
  
  // Use the hook's forceRender if available, otherwise use local state
  const effectiveForceRender = hookForceRender !== undefined ? hookForceRender : forceRender;
  
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

  // Monitor and fix screen share video elements
  useEffect(() => {
    const fixScreenShareVideos = () => {
      const screenShareVideos = document.querySelectorAll('video[data-screen-share="true"]');
      screenShareVideos.forEach(video => {
        if (video.style.transform !== 'none' || video.style.webkitTransform !== 'none') {
          console.log('🖥️ UltraSimpleVideo: Fixing screen share video transform');
          video.style.setProperty('transform', 'none', 'important');
          video.style.setProperty('-webkit-transform', 'none', 'important');
          video.style.setProperty('-moz-transform', 'none', 'important');
          video.style.setProperty('-ms-transform', 'none', 'important');
          video.style.setProperty('-o-transform', 'none', 'important');
        }
      });
    };

    // Fix immediately
    fixScreenShareVideos();

    // Set up interval to continuously monitor and fix
    const interval = setInterval(fixScreenShareVideos, 1000);

    return () => clearInterval(interval);
  }, [remoteScreenStreams]);

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
          el.srcObject = remoteStreams[participantId];
          el.play().catch(err => {
            console.log(`❌ UltraSimpleVideo: Video play failed for ${participantId}:`, err);
          });
        }
        
        // Force stream assignment after a short delay to ensure element is ready
        // Only if stream is not already assigned
        setTimeout(() => {
          if (remoteStreams[participantId] && el.srcObject !== remoteStreams[participantId]) {
            console.log(`🔄 UltraSimpleVideo: Force assigning stream after delay for ${participantId}`);
            el.srcObject = remoteStreams[participantId];
            el.play().then(() => {
              console.log(`✅ UltraSimpleVideo: Force video play successful for ${participantId}`);
            }).catch(err => {
              console.log(`❌ UltraSimpleVideo: Force video play failed for ${participantId}:`, err);
            });
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
      localVideoRef.current.play().catch(err => {
        console.log('🎥 UltraSimpleVideo: Local video play failed:', err);
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
            localVideoRef.current.play().catch(err => {
              console.log('🎥 UltraSimpleVideo: Local video play failed (retry):', err);
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
    console.log('🎥 UltraSimpleVideo: Remote streams changed:', Object.keys(remoteStreams));
    console.log('🎥 UltraSimpleVideo: Remote streams details:', remoteStreams);
    console.log('🎥 UltraSimpleVideo: Current user ID:', currentUserId);
    
    // Clean up video elements for streams that no longer exist
    Object.keys(remoteVideoRefs.current).forEach(participantId => {
      if (!remoteStreams[participantId]) {
        console.log(`🧹 UltraSimpleVideo: Cleaning up video element for removed stream: ${participantId}`);
        const videoElement = remoteVideoRefs.current[participantId];
        if (videoElement) {
          videoElement.srcObject = null;
          delete remoteVideoRefs.current[participantId];
        }
      }
    });
    
    Object.keys(remoteStreams).forEach(participantId => {
      // Skip if this is the current user's own stream (prevent self-duplication)
      if (participantId === currentUserId) {
        console.log(`🎥 UltraSimpleVideo: Skipping own stream for ${participantId}`);
        return;
      }
      
      const videoEl = remoteVideoRefs.current[participantId];
      const stream = remoteStreams[participantId];
      
      console.log(`🔍 UltraSimpleVideo: Processing participant ${participantId}:`, {
        hasVideoEl: !!videoEl,
        hasStream: !!stream,
        streamId: stream?.id,
        streamActive: stream?.active,
        videoElSrcObject: videoEl?.srcObject?.id,
        streamTracks: stream?.getTracks().length
      });
      
      if (videoEl && stream) {
        // Only set the stream if it's different from what's already set
        if (videoEl.srcObject !== stream) {
        console.log(`🎥 UltraSimpleVideo: Setting remote stream for ${participantId}`);
          console.log(`🎥 UltraSimpleVideo: Stream details:`, {
            streamId: stream.id,
            active: stream.active,
            tracks: stream.getTracks().length,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length
          });
          
          // Check if stream is stable before assigning
          if (stream.active && stream.getTracks().length > 0) {
            // Clear any existing timeout for this participant
            if (streamAssignmentTimeouts.current[participantId]) {
              clearTimeout(streamAssignmentTimeouts.current[participantId]);
            }
            
            // Debounce stream assignment to prevent blinking
            streamAssignmentTimeouts.current[participantId] = setTimeout(() => {
              console.log(`🎥 UltraSimpleVideo: Debounced stream assignment for ${participantId}`);
              videoEl.srcObject = stream;
              delete streamAssignmentTimeouts.current[participantId];
            }, 50); // Small delay to prevent rapid reassignments
          } else {
            console.log(`⚠️ UltraSimpleVideo: Stream not ready for ${participantId}, waiting...`);
            return;
          }
          videoEl.play().then(() => {
            console.log(`✅ UltraSimpleVideo: Remote video playing successfully for ${participantId}`);
          }).catch(err => {
            console.log(`❌ UltraSimpleVideo: Remote video play failed for ${participantId}:`, err);
            // Try again after a short delay
            setTimeout(() => {
              console.log(`🔄 UltraSimpleVideo: Retrying video play for ${participantId}`);
              videoEl.srcObject = stream;
              videoEl.play().catch(retryErr => {
                console.log(`❌ UltraSimpleVideo: Retry video play failed for ${participantId}:`, retryErr);
              });
            }, 500);
          });
        } else {
          console.log(`🎥 UltraSimpleVideo: Stream already set for ${participantId}, skipping`);
        }
      } else {
        console.log(`❌ UltraSimpleVideo: Missing video element or stream for ${participantId}:`, {
          hasVideoEl: !!videoEl,
          hasStream: !!stream
        });
      }
    });
  }, [remoteStreams, currentUserId]);

  // Filter out current user from participants
  const otherParticipants = participants.filter(p => p.id !== currentUserId);
  const totalVideos = otherParticipants.length + 1; // +1 for local video
  
  console.log('🎥 UltraSimpleVideo: Total videos:', totalVideos, 'Local + Remote:', otherParticipants.length);
  console.log('🎥 UltraSimpleVideo: Scrollable mode:', totalVideos > 2 ? 'YES' : 'NO');
  console.log('🎥 UltraSimpleVideo: User name:', userName);
  console.log('🎥 UltraSimpleVideo: Is host:', isHost);
  console.log('🎥 UltraSimpleVideo: Rendering video overlay for user:', userName || 'You');
  console.log('🎥 UltraSimpleVideo: Bold name text with subtle border positioned at BOTTOM-LEFT (60px from bottom)');
  console.log('🎥 UltraSimpleVideo: Other participants:', otherParticipants.map(p => ({ id: p.id, name: p.name, audioEnabled: p.audioEnabled, videoEnabled: p.videoEnabled })));
  console.log('🎥 UltraSimpleVideo: Remote streams available:', Object.keys(remoteStreams));
  console.log('🎥 UltraSimpleVideo: Remote streams details:', remoteStreams);
  
  // Debug media state changes
  console.log('🎥 UltraSimpleVideo: MEDIA STATE DEBUG - All participants media state:');
  otherParticipants.forEach(participant => {
    console.log(`🎥 UltraSimpleVideo: - ${participant.name} (${participant.id}): Audio=${participant.audioEnabled}, Video=${participant.videoEnabled}`);
  });
  
  // Debug media state indicators
  otherParticipants.forEach(participant => {
    console.log(`🎥 UltraSimpleVideo: Participant ${participant.name} media state:`, {
      audioEnabled: participant.audioEnabled,
      videoEnabled: participant.videoEnabled,
      audioIndicator: participant.audioEnabled === true ? '🎤' : '🔇',
      videoIndicator: participant.videoEnabled === true ? '📹' : '📷'
    });
    
    // Additional debugging for media state changes
    if (participant.audioEnabled === false) {
      console.log(`🔇 UltraSimpleVideo: Participant ${participant.name} has audio DISABLED`);
    }
    if (participant.videoEnabled === false) {
      console.log(`📷 UltraSimpleVideo: Participant ${participant.name} has video DISABLED`);
    }
    
    // Log media state changes for debugging
    if (!participant.videoEnabled && remoteStreams[participant.id]) {
      console.log(`🎥 UltraSimpleVideo: Participant ${participant.name} video is disabled, overlay will be shown`);
    } else if (participant.videoEnabled && remoteStreams[participant.id]) {
      console.log(`🎥 UltraSimpleVideo: Participant ${participant.name} video is enabled, video will be shown`);
    }
  });
  

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
                />
                
                {/* Debug info for camera state */}
                {console.log(`🎥 UltraSimpleVideo: Participant ${participant.name} camera state:`, {
                  videoEnabled: participant.videoEnabled,
                  shouldShowVideo: participant.videoEnabled,
                  shouldShowOverlay: !participant.videoEnabled
                })}
                
                {/* Camera Off Overlay - Always show when video is disabled */}
                {!participant.videoEnabled && (
                  <Box className="camera-off-overlay">
                    <Box>
                      <Typography variant="h4" className="camera-off-icon">
                        📷
                      </Typography>
                      <Typography variant="caption" className="camera-off-text">
                        Camera Off
                      </Typography>
                    </Box>
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
                    
                    {/* Video indicator */}
                    <Box
                      className={`media-indicator ${participant.videoEnabled === true ? 'video-enabled' : 'video-disabled'}`}
                      title={participant.videoEnabled === true ? 'Camera On' : 'Camera Off'}
                    >
                      <Typography variant="caption" className="media-indicator-icon">
                        {participant.videoEnabled === true ? '📹' : '📷'}
                      </Typography>
                    </Box>
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
            
            {/* Screen Sharing Streams */}
            {screenStream && (
              <Box 
                className={`screen-share-container ${totalVideos > 2 ? 'video-item-scrollable' : ''}`}>
                <video
                  ref={(el) => {
                    if (el && screenStream) {
                      el.srcObject = screenStream;
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  data-local="true"
                  data-screen-share="true"
                  className="video-element"
                />
                <Box className="screen-share-header">
                  <Typography variant="body2" className="screen-share-title">
                    🖥️ {userName}'s Screen
                  </Typography>
                </Box>
              </Box>
            )}
            
            {/* Remote Screen Sharing Streams */}
            {Object.keys(remoteScreenStreams).map(participantId => {
              const screenStream = remoteScreenStreams[participantId];
              const participant = participants.find(p => p.id === participantId);
              
              console.log('🖥️ UltraSimpleVideo: Rendering screen share for participant:', {
                participantId,
                participantName: participant?.name,
                hasScreenStream: !!screenStream,
                streamActive: screenStream?.active
              });
              
              // Only render if we have a valid screen stream
              if (!screenStream || !screenStream.active) {
                console.log('🖥️ UltraSimpleVideo: Skipping screen share render - no valid stream for', participantId);
                return null;
              }
              
              return (
                <Box 
                  key={`screen-${participantId}`}
                  className={`screen-share-container ${totalVideos > 2 ? 'video-item-scrollable' : ''}`}>
                  <video
                    ref={(el) => {
                      if (el) {
                        if (screenStream) {
                          console.log('🖥️ UltraSimpleVideo: Setting screen share stream for', participantId);
                          console.log('🖥️ UltraSimpleVideo: Screen stream details:', {
                            streamId: screenStream.id,
                            active: screenStream.active,
                            trackCount: screenStream.getTracks().length,
                            videoTracks: screenStream.getVideoTracks().length
                          });
                          el.srcObject = screenStream;
                          
                          console.log('🖥️ UltraSimpleVideo: Applied aggressive no-transform to screen share video');
                          console.log('🖥️ UltraSimpleVideo: Video element computed style:', {
                            transform: window.getComputedStyle(el).transform,
                            webkitTransform: window.getComputedStyle(el).webkitTransform
                          });
                        } else {
                          // Clear the video element when screen sharing stops
                          console.log('🖥️ UltraSimpleVideo: Clearing screen share stream for', participantId);
                          el.srcObject = null;
                          el.pause();
                        }
                      }
                    }}
                    autoPlay
                    playsInline
                    data-screen-share="true"
                    className="video-element"
                  />
                  <Box className="screen-share-header">
                    <Typography variant="body2" className="screen-share-name">
                      🖥️ {participant?.name || 'Participant'}'s Screen
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