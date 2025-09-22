import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Alert,
  IconButton
} from '@mui/material';
import {
  Videocam,
  Mic,
  Timer,
  CheckCircle,
  Cancel,
  Close
} from '@mui/icons-material';

const ParticipantConsentDialog = ({ 
  socket, 
  meetingId, 
  currentUserId,
  onCameraMicToggle 
}) => {
  const [open, setOpen] = useState(false);
  const [requestData, setRequestData] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Listen for host requests
  useEffect(() => {
    if (!socket) return;

    const handleHostRequest = (data) => {
      console.log('📥 ParticipantConsentDialog: Received host request:', data);
      setRequestData(data);
      setOpen(true);
      setTimeRemaining(data.duration);
      setIsActive(false);
      setCountdown(10); // 10 second countdown to respond
    };

    const handleRequestExpired = () => {
      console.log('⏰ ParticipantConsentDialog: Request expired');
      setOpen(false);
      setIsActive(false);
      setRequestData(null);
    };

    socket.on('host-camera-mic-request', handleHostRequest);
    socket.on('camera-mic-request-expired', handleRequestExpired);

    return () => {
      socket.off('host-camera-mic-request', handleHostRequest);
      socket.off('camera-mic-request-expired', handleRequestExpired);
    };
  }, [socket]);

  // Countdown timer for response
  useEffect(() => {
    if (!open || isActive) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          handleDeny();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, isActive]);

  // Timer for active session
  useEffect(() => {
    if (!isActive || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleSessionEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, timeRemaining]);

  const handleApprove = async () => {
    if (!socket || !meetingId || !requestData) return;

    console.log('✅ ParticipantConsentDialog: Approving request');

    try {
      // Request camera/mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: requestData.requestType === 'camera' || requestData.requestType === 'both',
        audio: requestData.requestType === 'mic' || requestData.requestType === 'both'
      });

      // Notify backend of approval
      socket.emit('camera-mic-request-approved', {
        meetingId,
        requestId: requestData.timestamp,
        participantId: currentUserId,
        streamId: stream.id
      });

      // Emit media state change to notify host about the updated media state
      const audioEnabled = requestData.requestType === 'mic' || requestData.requestType === 'both';
      const videoEnabled = requestData.requestType === 'camera' || requestData.requestType === 'both';
      
      console.log('📡 ParticipantConsentDialog: Emitting media state change after approval:', {
        audioEnabled,
        videoEnabled,
        meetingId,
        participantId: currentUserId
      });
      
      socket.emit('media-state-change', {
        meetingId,
        participantId: currentUserId,
        audioEnabled,
        videoEnabled,
        timestamp: Date.now()
      });

      // Start the session
      setIsActive(true);
      setCountdown(0);

      // Notify parent component to update media
      if (onCameraMicToggle) {
        onCameraMicToggle(true, stream);
      }

      // Store the stream globally so it can be accessed by the peer connection system
      window.consentStream = stream;

      // Close the dialog after a short delay to show the success state briefly
      setTimeout(() => {
        setOpen(false);
        setRequestData(null);
        setIsActive(false);
      }, 2000); // Show success state for 2 seconds then close

      console.log('✅ ParticipantConsentDialog: Camera/mic activated successfully');

    } catch (error) {
      console.error('❌ ParticipantConsentDialog: Failed to access camera/mic:', error);
      handleDeny();
    }
  };

  const handleDeny = () => {
    if (!socket || !meetingId || !requestData) return;

    console.log('❌ ParticipantConsentDialog: Denying request');

    // Notify backend of denial
    socket.emit('camera-mic-request-denied', {
      meetingId,
      requestId: requestData.timestamp,
      participantId: currentUserId
    });

    setOpen(false);
    setRequestData(null);
    setIsActive(false);
  };

  const handleSessionEnd = () => {
    console.log('⏰ ParticipantConsentDialog: Session ended - turning off camera/mic');

    // Notify backend that session ended
    if (socket && meetingId && requestData) {
      socket.emit('camera-mic-session-ended', {
        meetingId,
        requestId: requestData.timestamp,
        participantId: currentUserId
      });
    }

    // Stop the consent stream
    if (window.consentStream) {
      console.log('🔄 Stopping consent stream tracks');
      window.consentStream.getTracks().forEach(track => {
        track.stop();
        console.log(`🔄 Stopped track: ${track.kind}`);
      });
      window.consentStream = null;
    }

    // Emit media state change to notify host that media has been turned off
    if (socket && meetingId && requestData) {
      const audioEnabled = requestData.requestType === 'mic' || requestData.requestType === 'both' ? false : undefined;
      const videoEnabled = requestData.requestType === 'camera' || requestData.requestType === 'both' ? false : undefined;
      
      console.log('📡 ParticipantConsentDialog: Emitting media state change after session end:', {
        audioEnabled,
        videoEnabled,
        meetingId,
        participantId: currentUserId
      });
      
      socket.emit('media-state-change', {
        meetingId,
        participantId: currentUserId,
        audioEnabled,
        videoEnabled,
        timestamp: Date.now()
      });
    }

    // Notify parent component to turn off media
    if (onCameraMicToggle) {
      onCameraMicToggle(false, null);
    }

    // Close the dialog
    setOpen(false);
    setRequestData(null);
    setIsActive(false);
    setTimeRemaining(0);

    console.log('✅ ParticipantConsentDialog: Camera/mic session ended and turned off');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRequestTypeIcon = () => {
    if (!requestData) return null;
    
    switch (requestData.requestType) {
      case 'camera':
        return <Videocam />;
      case 'mic':
        return <Mic />;
      case 'both':
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Videocam />
            <Mic />
          </Box>
        );
      default:
        return <Videocam />;
    }
  };

  const getRequestTypeLabel = () => {
    if (!requestData) return '';
    
    switch (requestData.requestType) {
      case 'camera':
        return 'Camera';
      case 'mic':
        return 'Microphone';
      case 'both':
        return 'Camera & Microphone';
      default:
        return 'Camera & Microphone';
    }
  };

  if (!requestData) return null;

  return (
    <Dialog
      open={open}
      onClose={isActive ? undefined : handleDeny}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isActive}
      PaperProps={{
        sx: {
          borderRadius: '16px',
          background: isActive 
            ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.95), rgba(56, 142, 60, 0.9))'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9))',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)',
          color: isActive ? 'white' : 'inherit'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: isActive 
          ? 'rgba(255, 255, 255, 0.1)'
          : 'linear-gradient(135deg, #667eea, #764ba2)',
        color: 'white',
        borderRadius: '16px 16px 0 0',
        pb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {getRequestTypeIcon()}
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {isActive ? 'Camera & Microphone Active' : 'Host Request'}
            </Typography>
          </Box>
          {!isActive && (
            <IconButton onClick={handleDeny} sx={{ color: 'white' }}>
              <Close />
            </IconButton>
          )}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {isActive ? (
          // Active Session View
          <Box sx={{ textAlign: 'center' }}>
            <CheckCircle sx={{ fontSize: 64, mb: 2, color: 'white' }} />
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
              Your {getRequestTypeLabel()} is Active
            </Typography>
            <Typography variant="body1" sx={{ mb: 3, opacity: 0.9 }}>
              The host has requested access to your {getRequestTypeLabel().toLowerCase()} for better interaction.
            </Typography>
            
            <Box sx={{ mb: 3 }}>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                {formatTime(timeRemaining)}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Time remaining
              </Typography>
            </Box>

            <LinearProgress 
              variant="determinate" 
              value={(timeRemaining / (requestData.duration / 60)) * 100}
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: 'rgba(255, 255, 255, 0.3)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: 'white'
                }
              }}
            />
          </Box>
        ) : (
          // Request View
          <>
            <Alert severity="info" sx={{ mb: 3, borderRadius: '12px' }}>
              The host is requesting temporary access to your {getRequestTypeLabel().toLowerCase()} for better interaction.
            </Alert>

            <Typography variant="body1" sx={{ mb: 3 }}>
              {requestData.message}
            </Typography>

            <Box sx={{ 
              p: 2, 
              borderRadius: '12px', 
              background: 'rgba(102, 126, 234, 0.1)',
              border: '1px solid rgba(102, 126, 234, 0.2)',
              mb: 3
            }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Request Details:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  icon={<Timer />} 
                  label={`${requestData.duration / 60} minutes`} 
                  size="small" 
                  color="primary" 
                />
                <Chip 
                  icon={getRequestTypeIcon()} 
                  label={getRequestTypeLabel()} 
                  size="small" 
                  color="secondary" 
                />
              </Box>
            </Box>

            {countdown > 0 && (
              <Alert severity="warning" sx={{ borderRadius: '12px' }}>
                Auto-decline in {countdown} seconds if no response
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      {!isActive && (
        <DialogActions sx={{ p: 3, gap: 2 }}>
          <Button
            onClick={handleDeny}
            variant="outlined"
            startIcon={<Cancel />}
            sx={{ borderRadius: '12px' }}
          >
            Deny
          </Button>
          <Button
            onClick={handleApprove}
            variant="contained"
            startIcon={<CheckCircle />}
            sx={{
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #4caf50, #388e3c)',
              '&:hover': {
                background: 'linear-gradient(135deg, #45a049, #2e7d32)'
              }
            }}
          >
            Approve
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default ParticipantConsentDialog;
