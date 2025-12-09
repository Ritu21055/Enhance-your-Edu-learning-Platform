import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  LinearProgress,
  Alert,
  Box,
  Chip
} from '@mui/material';
import { AccessTime, Videocam, Mic, Message, Lock } from '@mui/icons-material';

const ParticipantConsentDialog = ({ socket, meetingId, currentUserId, onSessionStateChange }) => {
  const [request, setRequest] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningShown, setWarningShown] = useState(false);

  useEffect(() => {
    if (!socket) {
      console.log('📸 ParticipantConsentDialog: No socket available');
      return;
    }

    console.log('📸 ParticipantConsentDialog: Setting up socket listeners');

    const handleCameraMicRequest = (data) => {
      console.log('📸 ParticipantConsentDialog: Received camera-mic-request:', data);
      setRequest(data);
      setWarningShown(false);
      setShowWarning(false);
    };

    const handleRequestExpired = ({ requestId }) => {
      console.log('📸 ParticipantConsentDialog: Request expired:', requestId);
      if (request?.requestId === requestId) {
        setRequest(null);
        if (onSessionStateChange) {
          onSessionStateChange(null);
        }
      }
    };

    socket.on('camera-mic-request', handleCameraMicRequest);
    socket.on('camera-mic-request-expired', handleRequestExpired);

    return () => {
      console.log('📸 ParticipantConsentDialog: Cleaning up socket listeners');
      socket.off('camera-mic-request', handleCameraMicRequest);
      socket.off('camera-mic-request-expired', handleRequestExpired);
    };
  }, [socket, onSessionStateChange]);

  useEffect(() => {
    if (!request || !request.approved) return;

    let timer = setInterval(() => {
      const elapsed = (Date.now() - request.startTime) / 1000;
      const remaining = request.duration - elapsed;
      
      if (remaining <= 10 && remaining > 0 && !warningShown) {
        setShowWarning(true);
        setWarningShown(true);
      }
      
      if (remaining <= 0) {
        handleSessionEnd();
        clearInterval(timer);
      } else {
        setTimeRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [request, warningShown]);

  const handleApprove = async () => {
    const constraints = {
      video: request.requestType === 'camera' || request.requestType === 'both',
      audio: request.requestType === 'audio' || request.requestType === 'both'
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (window.updateVideoCallPeerConnections) {
        window.updateVideoCallPeerConnections(stream, 'both');
      }

      socket.emit('camera-mic-request-response', {
        requestId: request.requestId,
        participantId: currentUserId,
        approved: true,
        meetingId
      });

      const approvedRequest = { 
        ...request, 
        approved: true, 
        startTime: Date.now() 
      };
      setRequest(approvedRequest);
      
      if (onSessionStateChange) {
        onSessionStateChange({
          requestType: request.requestType,
          duration: request.duration,
          startTime: Date.now()
        });
      }
    } catch (error) {
      console.error('Error accessing media:', error);
      socket.emit('camera-mic-request-response', {
        requestId: request.requestId,
        participantId: currentUserId,
        approved: false,
        meetingId
      });
      setRequest(null);
    }
  };

  const handleDeny = () => {
    socket.emit('camera-mic-request-response', {
      requestId: request.requestId,
      participantId: currentUserId,
      approved: false,
      meetingId
    });
    setRequest(null);
  };

  const handleSessionEnd = () => {
    if (window.localStreamRef?.current) {
      window.localStreamRef.current.getTracks().forEach(track => {
        if (track.kind === 'video' && (request.requestType === 'camera' || request.requestType === 'both')) {
          track.stop();
        }
        if (track.kind === 'audio' && (request.requestType === 'audio' || request.requestType === 'both')) {
          track.stop();
        }
      });
    }
    
    if (onSessionStateChange) {
      onSessionStateChange(null);
    }
    
    setRequest(null);
    setShowWarning(false);
    setWarningShown(false);
  };

  const handleExtend = () => {
    socket.emit('request-extension', {
      requestId: request.requestId,
      participantId: currentUserId,
      meetingId
    });
    setShowWarning(false);
  };

  if (!request) return null;

  const getRequestTypeLabel = () => {
    if (request.requestType === 'both') return 'Camera & Audio';
    if (request.requestType === 'camera') return 'Camera';
    return 'Audio';
  };

  return (
    <>
      <Dialog 
        open={!!request && !request.approved} 
        onClose={handleDeny}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Message color="primary" />
          Camera/Audio Access Request
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ mb: 1, fontWeight: 'bold' }}>
              {request.hostName} requests {getRequestTypeLabel()} access
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <AccessTime fontSize="small" />
              <Typography variant="body2" color="text.secondary">
                Duration: {request.duration >= 60 ? `${request.duration / 60} minutes` : `${request.duration} seconds`}
              </Typography>
            </Box>

            {request.customMessage && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  Message from Host:
                </Typography>
                <Typography variant="body2">
                  {request.customMessage}
                </Typography>
              </Alert>
            )}

            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <Lock fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                <strong>Note:</strong> During this session, you will not be able to turn off {getRequestTypeLabel().toLowerCase()} until the time limit expires.
              </Typography>
            </Alert>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {(request.requestType === 'camera' || request.requestType === 'both') && (
                <Chip 
                  icon={<Videocam />} 
                  label="Camera" 
                  color="primary" 
                  size="small" 
                />
              )}
              {(request.requestType === 'audio' || request.requestType === 'both') && (
                <Chip 
                  icon={<Mic />} 
                  label="Audio" 
                  color="primary" 
                  size="small" 
                />
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeny} color="error">
            Deny
          </Button>
          <Button onClick={handleApprove} variant="contained" color="primary">
            Approve
          </Button>
        </DialogActions>
      </Dialog>

      {request.approved && (
        <Dialog 
          open={!!request} 
          onClose={() => {}}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Lock color="primary" />
            Active Session (Locked)
          </DialogTitle>
          <DialogContent>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {getRequestTypeLabel()} access is active and locked
              </Typography>

              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" color="primary" sx={{ mb: 1 }}>
                  {Math.floor(timeRemaining)}s remaining
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(timeRemaining / request.duration) * 100} 
                  sx={{ height: 8, borderRadius: 4 }}
                  color={timeRemaining <= 10 ? 'error' : 'primary'}
                />
              </Box>

              {showWarning && timeRemaining <= 10 && (
                <Alert 
                  severity="warning" 
                  sx={{ mb: 2 }}
                  action={
                    <Button 
                      size="small" 
                      onClick={handleExtend}
                      color="inherit"
                    >
                      Request Extension
                    </Button>
                  }
                >
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    ⚠️ Session ending in {Math.floor(timeRemaining)} seconds!
                  </Typography>
                </Alert>
              )}

              <Alert severity="info">
                <Typography variant="body2">
                  <Lock fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  You cannot turn off {getRequestTypeLabel().toLowerCase()} until the session ends.
                </Typography>
              </Alert>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button 
              onClick={handleSessionEnd} 
              color="error"
              variant="outlined"
            >
              End Session Now
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
};

export default ParticipantConsentDialog;

