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

    let isSetup = false;

    const handleCameraMicRequest = (data) => {
      console.log('📸 ParticipantConsentDialog: ✅✅✅ Received camera-mic-request:', data);
      
      // If request includes targetSocketId, only process if it matches current user's socket ID
      if (data.targetSocketId && data.targetSocketId !== currentUserId && data.targetSocketId !== socket.id) {
        console.log('📸 ParticipantConsentDialog: Request is for different participant, ignoring', {
          targetSocketId: data.targetSocketId,
          currentUserId,
          socketId: socket.id
        });
        return;
      }
      
      console.log('📸 ParticipantConsentDialog: Processing request for this participant');
      setRequest(data);
      setWarningShown(false);
      setShowWarning(false);
    };

    const handleRequestExpired = ({ requestId }) => {
      console.log('📸 ParticipantConsentDialog: Request expired:', requestId);
      setRequest(prevRequest => {
        if (prevRequest?.requestId === requestId) {
          if (onSessionStateChange) {
            onSessionStateChange(null);
          }
          return null;
        }
        return prevRequest;
      });
    };

    const handleAnyEvent = (eventName, ...args) => {
      if (eventName === 'camera-mic-request' || eventName === 'camera-mic-request-expired') {
        console.log(`📸 ParticipantConsentDialog: Socket event received: ${eventName}`, args);
      }
    };

    const setupListeners = () => {
      if (!socket.connected) {
        console.log('📸 ParticipantConsentDialog: Socket not connected, waiting...', {
          socketId: socket.id,
          connected: socket.connected
        });
        return false;
      }

      if (isSetup) {
        console.log('📸 ParticipantConsentDialog: Listeners already set up, skipping');
        return true;
      }

      console.log('📸 ParticipantConsentDialog: Setting up socket listeners', {
        socketId: socket.id,
        connected: socket.connected,
        meetingId,
        currentUserId
      });

      // Remove any existing listeners first to avoid duplicates
      socket.off('camera-mic-request', handleCameraMicRequest);
      socket.off('camera-mic-request-expired', handleRequestExpired);
      socket.offAny(handleAnyEvent);

      // Set up new listeners
      socket.on('camera-mic-request', handleCameraMicRequest);
      socket.on('camera-mic-request-expired', handleRequestExpired);
      socket.onAny(handleAnyEvent);

      isSetup = true;
      return true;
    };

    // Set up listeners immediately if socket is connected
    setupListeners();

    // Also listen for socket connection events
    const handleConnect = () => {
      console.log('📸 ParticipantConsentDialog: Socket connected, setting up listeners');
      setupListeners();
    };

    socket.on('connect', handleConnect);

    // Also try to set up listeners after a short delay in case socket connects asynchronously
    const timeoutId = setTimeout(() => {
      if (socket.connected && !isSetup) {
        console.log('📸 ParticipantConsentDialog: Socket connected after delay, setting up listeners');
        setupListeners();
      }
    }, 1000);

    return () => {
      console.log('📸 ParticipantConsentDialog: Cleaning up socket listeners');
      socket.off('camera-mic-request', handleCameraMicRequest);
      socket.off('camera-mic-request-expired', handleRequestExpired);
      socket.off('connect', handleConnect);
      socket.offAny(handleAnyEvent);
      clearTimeout(timeoutId);
      isSetup = false;
    };
  }, [socket, meetingId, currentUserId, onSessionStateChange]);

  useEffect(() => {
    if (!request || !request.approved || !request.startTime) {
      // Reset time remaining if request is not approved or doesn't have startTime
      if (!request || !request.approved) {
        setTimeRemaining(0);
      }
      return;
    }

    // Initialize timeRemaining immediately
    const calculateRemaining = () => {
      if (!request.startTime) return 0;
      const elapsed = (Date.now() - request.startTime) / 1000;
      return Math.max(0, request.duration - elapsed);
    };

    // Set initial time remaining
    const initialRemaining = calculateRemaining();
    setTimeRemaining(initialRemaining);

    // If already expired, end session immediately
    if (initialRemaining <= 0) {
      console.log('📸 ParticipantConsentDialog: Session already expired, ending immediately');
      handleSessionEnd();
      return;
    }

    console.log('📸 ParticipantConsentDialog: Starting countdown timer', {
      duration: request.duration,
      startTime: request.startTime,
      initialRemaining: initialRemaining
    });

    let timer = setInterval(() => {
      const remaining = calculateRemaining();
      
      if (remaining <= 10 && remaining > 0 && !warningShown) {
        setShowWarning(true);
        setWarningShown(true);
      }
      
      if (remaining <= 0) {
        console.log('📸 ParticipantConsentDialog: Timer reached 0, ending session');
        clearInterval(timer);
        handleSessionEnd();
      } else {
        setTimeRemaining(remaining);
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [request, warningShown]);

  const handleApprove = async () => {
    // Store request data before closing dialog
    const requestData = { ...request };
    
    // Close the request dialog immediately
    const startTime = Date.now();
    const approvedRequest = { 
      ...requestData, 
      approved: true, 
      startTime: startTime
    };
    
    console.log('📸 ParticipantConsentDialog: Request approved, closing dialog and starting session', {
      requestId: requestData.requestId,
      duration: requestData.duration,
      startTime: startTime
    });
    
    // Update state immediately to close request dialog and show active session dialog
    setRequest(approvedRequest);
    setTimeRemaining(requestData.duration); // Initialize time remaining
    
    // Emit response immediately
    socket.emit('camera-mic-request-response', {
      requestId: requestData.requestId,
      participantId: currentUserId,
      approved: true,
      meetingId
    });
    
    // Notify parent component immediately
    if (onSessionStateChange) {
      onSessionStateChange({
        requestType: requestData.requestType,
        duration: requestData.duration,
        startTime: startTime
      });
    }
    
    // Get user media asynchronously (don't block dialog closing)
    const constraints = {
      video: requestData.requestType === 'camera' || requestData.requestType === 'both',
      audio: requestData.requestType === 'audio' || requestData.requestType === 'both'
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (window.updateVideoCallPeerConnections) {
        window.updateVideoCallPeerConnections(stream, 'both');
      }
      
      console.log('📸 ParticipantConsentDialog: Media access granted successfully');
    } catch (error) {
      console.error('📸 ParticipantConsentDialog: Error accessing media:', error);
      // If media access fails, end the session
      socket.emit('camera-mic-request-response', {
        requestId: requestData.requestId,
        participantId: currentUserId,
        approved: false,
        meetingId
      });
      handleSessionEnd();
    }
  };

  const handleDeny = () => {
    console.log('📸 ParticipantConsentDialog: Request denied, closing dialog immediately');
    
    // Emit response
    socket.emit('camera-mic-request-response', {
      requestId: request.requestId,
      participantId: currentUserId,
      approved: false,
      meetingId
    });
    
    // Close dialog immediately
    setRequest(null);
    setTimeRemaining(0);
    setShowWarning(false);
    setWarningShown(false);
    
    // Notify parent component
    if (onSessionStateChange) {
      onSessionStateChange(null);
    }
  };

  const handleSessionEnd = () => {
    console.log('📸 ParticipantConsentDialog: Ending session');
    
    if (window.localStreamRef?.current && request) {
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
    setTimeRemaining(0);
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
          open={!!request && request.approved} 
          onClose={() => {
            // Allow closing the dialog, but keep the session active
            // The session will still be locked until time expires
            console.log('📸 ParticipantConsentDialog: Dialog closed by user, but session remains active');
          }}
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
                  {timeRemaining > 0 ? `${Math.floor(timeRemaining)}s remaining` : 'Session ended'}
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={request.duration > 0 ? (timeRemaining / request.duration) * 100 : 0} 
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

