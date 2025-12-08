import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Paper,
  Button
} from '@mui/material';
import '../css/ScreenShare.css';
import {
  ScreenShare as ScreenShareIcon,
  Stop as StopIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon
} from '@mui/icons-material';

/**
 * Screen Share Viewer Component
 * Displays screen sharing streams with controls
 */
const ScreenShareViewer = ({ 
  isScreenSharing, 
  screenStream, 
  remoteScreenStream, 
  screenShareParticipants,
  onStartScreenShare,
  onStopScreenShare,
  userName 
}) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Handle local screen stream
  useEffect(() => {
    if (screenStream && localVideoRef.current) {
      console.log('🖥️ ScreenShareViewer: Setting local screen stream');
      localVideoRef.current.srcObject = screenStream;
      localVideoRef.current.play().catch(err => {
        console.log('🖥️ ScreenShareViewer: Local video play error:', err);
      });
    }
  }, [screenStream]);

  // Handle remote screen stream
  useEffect(() => {
    if (remoteScreenStream && remoteVideoRef.current) {
      console.log('🖥️ ScreenShareViewer: Setting remote screen stream');
      console.log('🖥️ ScreenShareViewer: Stream details:', {
        id: remoteScreenStream.id,
        active: remoteScreenStream.active,
        tracks: remoteScreenStream.getTracks().length,
        videoTracks: remoteScreenStream.getVideoTracks().length,
        audioTracks: remoteScreenStream.getAudioTracks().length,
        videoTrackEnabled: remoteScreenStream.getVideoTracks()[0]?.enabled,
        videoTrackReady: remoteScreenStream.getVideoTracks()[0]?.readyState,
        videoTrackLabel: remoteScreenStream.getVideoTracks()[0]?.label
      });
      
      const videoElement = remoteVideoRef.current;
      const videoTrack = remoteScreenStream.getVideoTracks()[0];
      
      // CRITICAL: Verify stream has video tracks
      if (!videoTrack) {
        console.error('🖥️ ScreenShareViewer: Remote stream has no video tracks!');
        return;
      }
      
      // CRITICAL: Ensure video track is enabled
      if (!videoTrack.enabled) {
        console.warn('🖥️ ScreenShareViewer: Video track is disabled, enabling it');
        videoTrack.enabled = true;
      }
      
      // CRITICAL: Ensure video element is visible and ready
      videoElement.style.opacity = '1';
      videoElement.style.visibility = 'visible';
      videoElement.style.display = 'block';
      videoElement.style.zIndex = '1';
      
      // Set the stream
      if (videoElement.srcObject !== remoteScreenStream) {
        console.log('🖥️ ScreenShareViewer: Setting srcObject for remote screen stream');
        videoElement.srcObject = remoteScreenStream;
      }
      
      // Play video with retry mechanism
      const playVideo = () => {
        if (videoElement && remoteScreenStream.active && videoTrack?.enabled) {
          videoElement.play().then(() => {
            console.log('🖥️ ScreenShareViewer: Remote screen stream playing successfully');
          }).catch(err => {
            console.warn('🖥️ ScreenShareViewer: Remote video play error (will retry):', err);
            setTimeout(playVideo, 500); // Retry playing
          });
        } else {
          console.warn('🖥️ ScreenShareViewer: Remote stream not active or video track not enabled, retrying...', {
            streamActive: remoteScreenStream.active,
            trackEnabled: videoTrack?.enabled,
            hasElement: !!videoElement
          });
          setTimeout(playVideo, 500); // Retry if not active or enabled
        }
      };
      
      // Start playing
      playVideo();
      
      // Also listen for track enabled/disabled events
      const handleTrackEnabled = () => {
        console.log('🖥️ ScreenShareViewer: Video track enabled event');
        playVideo();
      };
      
      const handleTrackDisabled = () => {
        console.warn('🖥️ ScreenShareViewer: Video track disabled event');
      };
      
      videoTrack.addEventListener('enabled', handleTrackEnabled);
      videoTrack.addEventListener('disabled', handleTrackDisabled);
      
      // Cleanup
      return () => {
        videoTrack.removeEventListener('enabled', handleTrackEnabled);
        videoTrack.removeEventListener('disabled', handleTrackDisabled);
      };
    } else {
      console.log('🖥️ ScreenShareViewer: No remote screen stream or video element', {
        hasStream: !!remoteScreenStream,
        hasElement: !!remoteVideoRef.current
      });
    }
  }, [remoteScreenStream]);

  // Handle fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const container = document.getElementById('screen-share-container');
      if (container) {
        container.requestFullscreen().then(() => {
          setIsFullscreen(true);
        }).catch(err => {
          console.log('🖥️ ScreenShareViewer: Fullscreen error:', err);
        });
      }
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.log('🖥️ ScreenShareViewer: Exit fullscreen error:', err);
      });
    }
  };

  // Handle mute toggle
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (localVideoRef.current) {
      localVideoRef.current.muted = !isMuted;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !isMuted;
    }
  };

  // Auto-hide controls
  useEffect(() => {
    let timeout;
    const resetTimeout = () => {
      clearTimeout(timeout);
      setShowControls(true);
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    if (isScreenSharing || remoteScreenStream) {
      resetTimeout();
      document.addEventListener('mousemove', resetTimeout);
      document.addEventListener('keydown', resetTimeout);
    }

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousemove', resetTimeout);
      document.removeEventListener('keydown', resetTimeout);
    };
  }, [isScreenSharing, remoteScreenStream]);

  // Handle escape key for fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  return (
    <Box
      id="screen-share-container"
      className={`screen-share-container ${isScreenSharing ? 'active-sharer' : 'active-viewer'}`}
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000',
        zIndex: 9999,
        display: isScreenSharing || remoteScreenStream ? 'block' : 'none',
        // Minimize interface when sharing to prevent recursive capture
        ...(isScreenSharing && {
          transform: 'scale(0.1)',
          transformOrigin: 'top right',
          opacity: 0.1,
          pointerEvents: 'none'
        })
      }}
    >
      {/* Local Screen Share */}
      {isScreenSharing && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted={isMuted}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#000'
            }}
          />
        </Box>
      )}

      {/* Remote Screen Share */}
      {remoteScreenStream && !isScreenSharing && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000',
            zIndex: 1
          }}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={isMuted}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              backgroundColor: '#000',
              opacity: 1,
              visibility: 'visible',
              display: 'block',
              zIndex: 1
            }}
          />
        </Box>
      )}

      {/* Controls Overlay - Minimized when sharing to avoid recursive capture */}
      {(isScreenSharing || remoteScreenStream) && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            pointerEvents: 'none',
            opacity: showControls ? 1 : 0,
            transition: 'opacity 0.3s ease',
            // Minimize interface when sharing to prevent recursive capture
            ...(isScreenSharing && {
              transform: 'scale(0.1)',
              transformOrigin: 'top right',
              opacity: 0.1
            })
          }}
        >
          {/* Top Controls */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 2,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
              pointerEvents: 'auto'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <ScreenShareIcon sx={{ color: 'white' }} />
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>
                {isScreenSharing ? 'You are sharing your screen' : 'Screen sharing'}
              </Typography>
              {screenShareParticipants.length > 0 && (
                <Chip
                  label={`${screenShareParticipants.length} viewing`}
                  size="small"
                  sx={{ 
                    backgroundColor: 'rgba(255,255,255,0.2)', 
                    color: 'white',
                    fontWeight: 'bold'
                  }}
                />
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton
                onClick={toggleMute}
                sx={{ 
                  color: 'white',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' }
                }}
              >
                {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
              </IconButton>

              <IconButton
                onClick={toggleFullscreen}
                sx={{ 
                  color: 'white',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' }
                }}
              >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Box>
          </Box>

          {/* Bottom Controls */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              p: 2,
              background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
              pointerEvents: 'auto'
            }}
          >
            {isScreenSharing ? (
              <Button
                variant="contained"
                color="error"
                startIcon={<StopIcon />}
                onClick={onStopScreenShare}
                sx={{
                  px: 3,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  borderRadius: 2,
                  boxShadow: '0 4px 20px rgba(244, 67, 54, 0.4)'
                }}
              >
                Stop Sharing
              </Button>
            ) : (
              <Button
                variant="contained"
                color="primary"
                startIcon={<ScreenShareIcon />}
                onClick={onStartScreenShare}
                sx={{
                  px: 3,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  borderRadius: 2,
                  boxShadow: '0 4px 20px rgba(33, 150, 243, 0.4)'
                }}
              >
                Share Your Screen
              </Button>
            )}
          </Box>
        </Box>
      )}

      {/* Screen Share Info */}
      {!isScreenSharing && !remoteScreenStream && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: 'white'
          }}
        >
          <ScreenShareIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>
            No Screen Sharing
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.7, mb: 3 }}>
            Start sharing your screen to begin
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<ScreenShareIcon />}
            onClick={onStartScreenShare}
            size="large"
            sx={{
              px: 4,
              py: 2,
              fontSize: '1.2rem',
              fontWeight: 'bold',
              borderRadius: 3,
              boxShadow: '0 6px 24px rgba(33, 150, 243, 0.4)'
            }}
          >
            Start Screen Sharing
          </Button>
          
          {/* Debug Info */}
          <Box sx={{ mt: 3, p: 2, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 2 }}>
            <Typography variant="body2" sx={{ color: 'white', mb: 1 }}>
              Debug Info:
            </Typography>
            <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
              Screen Sharing: {isScreenSharing ? 'Yes' : 'No'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
              Remote Stream: {remoteScreenStream ? 'Yes' : 'No'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
              Participants: {screenShareParticipants.length}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ScreenShareViewer;
