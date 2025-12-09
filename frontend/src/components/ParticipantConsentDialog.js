import React, { useState, useEffect, useRef } from 'react';
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
  const [showActiveSessionDialog, setShowActiveSessionDialog] = useState(true);
  
  // Use ref to track current request in timer callbacks
  const requestRef = useRef(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

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
      console.log('📸 ParticipantConsentDialog: Request expired event received:', requestId);
      // Use setTimeout to avoid setState during render warning
      setTimeout(() => {
        setRequest(prevRequest => {
          if (prevRequest?.requestId === requestId) {
            // CRITICAL: If request is already approved and session is active,
            // ignore the backend expired event - let the local timer handle expiration
            if (prevRequest?.approved && prevRequest?.startTime) {
              console.log('📸 ParticipantConsentDialog: Request already approved, ignoring backend expired event. Local timer will handle expiration.');
              return prevRequest; // Keep the request, don't clear it
            }
            
            // Only clear if request is not approved (pending request expired)
            console.log('📸 ParticipantConsentDialog: Clearing unapproved expired request');
            if (onSessionStateChange) {
              onSessionStateChange(null);
            }
            return null;
          }
          return prevRequest;
        });
      }, 0);
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

    // Store request data in a ref to avoid stale closure
    const requestData = request;
    const requestId = requestData.requestId;
    const duration = requestData.duration;
    const startTime = requestData.startTime;

    // Initialize timeRemaining immediately
    const calculateRemaining = () => {
      if (!startTime) return 0;
      const elapsed = (Date.now() - startTime) / 1000;
      return Math.max(0, duration - elapsed);
    };

    // Set initial time remaining
    const initialRemaining = calculateRemaining();
    setTimeRemaining(initialRemaining);

    // If already expired, end session immediately
    if (initialRemaining <= 0) {
      console.log('📸 ParticipantConsentDialog: Session already expired, ending immediately', {
        requestId,
        duration,
        startTime,
        elapsed: (Date.now() - startTime) / 1000
      });
      handleSessionEnd();
      return;
    }

    console.log('📸 ParticipantConsentDialog: Starting countdown timer', {
      requestId,
      duration,
      startTime,
      initialRemaining: initialRemaining,
      currentTime: Date.now()
    });

    let timer = setInterval(() => {
      // Use ref to get current request state (avoids stale closure)
      const currentRequest = requestRef.current;
      
      // Re-check request to ensure it's still valid
      if (!currentRequest || !currentRequest.approved || currentRequest.requestId !== requestId) {
        console.log('📸 ParticipantConsentDialog: Request changed or cleared, stopping timer', {
          hasRequest: !!currentRequest,
          isApproved: currentRequest?.approved,
          requestIdMatch: currentRequest?.requestId === requestId
        });
        clearInterval(timer);
        return;
      }
      
      const remaining = calculateRemaining();
      
      console.log('📸 ParticipantConsentDialog: Timer tick', {
        requestId,
        remaining: remaining.toFixed(1),
        duration,
        startTime,
        currentTime: Date.now(),
        elapsed: (Date.now() - startTime) / 1000
      });
      
      if (remaining <= 10 && remaining > 0 && !warningShown) {
        console.log('📸 ParticipantConsentDialog: ⚠️⚠️⚠️ WARNING: Time running out! ⚠️⚠️⚠️', {
          remaining: remaining.toFixed(1),
          requestId
        });
        setShowWarning(true);
        setWarningShown(true);
        // Auto-open dialog to show warning
        setShowActiveSessionDialog(true);
        
        // Get request type label for notification
        let requestTypeLabel = 'Camera/Audio';
        if (currentRequest.requestType === 'camera') {
          requestTypeLabel = 'Camera';
        } else if (currentRequest.requestType === 'audio') {
          requestTypeLabel = 'Audio';
        } else if (currentRequest.requestType === 'both') {
          requestTypeLabel = 'Camera & Audio';
        }
        
        // Show browser notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Session Ending Soon', {
              body: `Your ${requestTypeLabel} access will end in ${Math.floor(remaining)} seconds!`,
              icon: '/favicon.ico',
              tag: 'session-warning'
            });
          } catch (error) {
            console.warn('📸 ParticipantConsentDialog: Failed to show notification:', error);
          }
        } else if ('Notification' in window && Notification.permission === 'default') {
          // Request permission for future notifications
          Notification.requestPermission().then(permission => {
            if (permission === 'granted' && remaining > 0) {
              try {
                new Notification('Session Ending Soon', {
                  body: `Your ${requestTypeLabel} access will end in ${Math.floor(remaining)} seconds!`,
                  icon: '/favicon.ico',
                  tag: 'session-warning'
                });
              } catch (error) {
                console.warn('📸 ParticipantConsentDialog: Failed to show notification:', error);
              }
            }
          });
        }
      }
      
      if (remaining <= 0) {
        console.log('📸 ParticipantConsentDialog: ⏰⏰⏰ TIMER REACHED 0 - ENDING SESSION ⏰⏰⏰', {
          requestId,
          duration,
          startTime,
          elapsed: (Date.now() - startTime) / 1000
        });
        clearInterval(timer);
        handleSessionEnd();
      } else {
        setTimeRemaining(remaining);
      }
    }, 1000);

    return () => {
      console.log('📸 ParticipantConsentDialog: Cleaning up timer', { requestId });
      clearInterval(timer);
    };
  }, [request?.requestId, request?.approved, request?.startTime, request?.duration, warningShown]);

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
    setShowActiveSessionDialog(true); // Show active session dialog initially
    
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
      
      console.log('📸 ParticipantConsentDialog: Media access granted successfully', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        requestType: requestData.requestType
      });
      
      // CRITICAL: Enable tracks based on request type
      if (requestData.requestType === 'camera' || requestData.requestType === 'both') {
        const videoTracks = stream.getVideoTracks();
        videoTracks.forEach(track => {
          track.enabled = true;
          console.log('📸 ParticipantConsentDialog: Video track enabled:', track.id);
        });
        
        // Update video state in useMediaControls
        if (window.setIsVideoEnabled) {
          window.setIsVideoEnabled(true);
          console.log('📸 ParticipantConsentDialog: Video state set to enabled');
        }
      }
      
      if (requestData.requestType === 'audio' || requestData.requestType === 'both') {
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = true;
          console.log('📸 ParticipantConsentDialog: Audio track enabled:', track.id);
        });
        
        // Update audio state in useMediaControls
        if (window.setIsAudioEnabled) {
          window.setIsAudioEnabled(true);
          console.log('📸 ParticipantConsentDialog: Audio state set to enabled');
        } else {
          console.warn('📸 ParticipantConsentDialog: setIsAudioEnabled not available on window');
        }
      }
      
      // CRITICAL: Update localStreamRef FIRST so video element can access it
      if (window.localStreamRef) {
        window.localStreamRef.current = stream;
        console.log('📸 ParticipantConsentDialog: Updated window.localStreamRef with new stream');
      }
      
      // Also update streamRef if it exists
      if (window.streamRef) {
        window.streamRef.current = stream;
        console.log('📸 ParticipantConsentDialog: Updated window.streamRef with new stream');
      }
      
      // Update peer connections with the new stream
      // CRITICAL: Pass the correct track type based on request type
      const trackType = requestData.requestType === 'camera' ? 'video' : 
                       requestData.requestType === 'audio' ? 'audio' : 'both';
      
      if (window.updateVideoCallPeerConnections) {
        console.log('📸 ParticipantConsentDialog: Updating peer connections with new stream', {
          trackType,
          requestType: requestData.requestType,
          hasVideo: stream.getVideoTracks().length > 0,
          hasAudio: stream.getAudioTracks().length > 0
        });
        window.updateVideoCallPeerConnections(stream, trackType);
        
        // CRITICAL: For audio-only, wait a bit for stream merge to complete before emitting media-state-change
        if (trackType === 'audio') {
          setTimeout(() => {
            // Re-check the merged stream after merge
            const mergedStream = window.localStreamRef?.current;
            if (mergedStream) {
              console.log('📸 ParticipantConsentDialog: Merged stream ready, will emit media-state-change');
            }
          }, 100);
        }
      } else {
        console.error('📸 ParticipantConsentDialog: updateVideoCallPeerConnections not available!');
      }
      
      // CRITICAL: Only set stream on video element if video is requested
      // For audio-only requests, we don't need to update the video element
      if (requestData.requestType === 'camera' || requestData.requestType === 'both') {
        const setVideoElementStream = (attempt = 0) => {
          if (window.localVideoRef && window.localVideoRef.current) {
            const videoElement = window.localVideoRef.current;
            if (videoElement.srcObject !== stream) {
              videoElement.srcObject = stream;
              console.log('📸 ParticipantConsentDialog: Set stream directly on localVideoRef element');
              
              // Force video to play
              videoElement.play().catch(err => {
                console.warn('📸 ParticipantConsentDialog: Video play failed:', err);
              });
            } else {
              console.log('📸 ParticipantConsentDialog: Video element already has the stream');
            }
          } else if (attempt < 5) {
            // Retry after a short delay if element isn't ready
            setTimeout(() => setVideoElementStream(attempt + 1), 200);
          } else {
            console.warn('📸 ParticipantConsentDialog: Video element not available after retries');
          }
        };
        
        // Try immediately, then retry if needed
        setVideoElementStream();
      } else {
        console.log('📸 ParticipantConsentDialog: Audio-only request, skipping video element update');
      }
      
      // Emit media state change to notify other participants
      // CRITICAL: For audio-only requests, preserve the actual video state (don't turn it off)
      // For video/camera requests, set video based on request
      // For both, set both based on request
      const emitMediaStateChange = () => {
        // Get final stream (merged for audio-only, or new stream for others)
        const finalStream = window.localStreamRef?.current || stream;
        const videoTrack = finalStream.getVideoTracks()[0];
        const audioTrack = finalStream.getAudioTracks()[0];
        
        let videoStateToEmit;
        if (requestData.requestType === 'audio') {
          // Audio-only: Preserve actual video state from merged stream
          videoStateToEmit = videoTrack?.enabled ?? false;
          console.log('📸 ParticipantConsentDialog: Audio-only request, preserving video state', {
            videoStateToEmit,
            hasVideoTrack: !!videoTrack,
            videoTrackEnabled: videoTrack?.enabled,
            videoTrackReadyState: videoTrack?.readyState
          });
        } else {
          // Video or both: Set based on request
          videoStateToEmit = requestData.requestType === 'camera' || requestData.requestType === 'both';
        }
        
        const audioStateToEmit = requestData.requestType === 'audio' || requestData.requestType === 'both';
        
        if (socket && socket.connected) {
          socket.emit('media-state-change', {
            meetingId,
            participantId: currentUserId,
            videoEnabled: videoStateToEmit,
            audioEnabled: audioStateToEmit,
            hasVideo: finalStream.getVideoTracks().length > 0,
            hasAudio: finalStream.getAudioTracks().length > 0,
            timestamp: Date.now()
          });
          console.log('📸 ParticipantConsentDialog: Media state change emitted', {
            videoEnabled: videoStateToEmit,
            audioEnabled: audioStateToEmit,
            requestType: requestData.requestType,
            finalStreamHasVideo: finalStream.getVideoTracks().length > 0,
            finalStreamHasAudio: finalStream.getAudioTracks().length > 0,
            videoTrackEnabled: videoTrack?.enabled,
            audioTrackEnabled: audioTrack?.enabled
          });
        }
      };
      
      // For audio-only, wait for stream merge to complete
      if (requestData.requestType === 'audio') {
        setTimeout(emitMediaStateChange, 200);
      } else {
        emitMediaStateChange();
      }
      
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
    // Use ref to get current request (avoids stale closure)
    const currentRequest = requestRef.current;
    
    console.log('📸 ParticipantConsentDialog: Ending session', {
      requestType: currentRequest?.requestType,
      hasStream: !!window.localStreamRef?.current,
      requestId: currentRequest?.requestId
    });
    
    // CRITICAL: Disable tracks first (turn off video/audio)
    if (window.localStreamRef?.current && currentRequest) {
      const stream = window.localStreamRef.current;
      const tracks = stream.getTracks();
      
      console.log('📸 ParticipantConsentDialog: Processing tracks for session end', {
        totalTracks: tracks.length,
        requestType: currentRequest.requestType
      });
      
      // CRITICAL: Hide video element BEFORE stopping tracks to prevent frozen frame
      if (currentRequest.requestType === 'camera' || currentRequest.requestType === 'both') {
        if (window.localVideoRef && window.localVideoRef.current) {
          const videoElement = window.localVideoRef.current;
          console.log('📸 ParticipantConsentDialog: Hiding video element BEFORE stopping track');
          
          // CRITICAL: Replace srcObject with blank canvas stream to clear frozen frame
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const blankStream = canvas.captureStream(0);
            // Replace srcObject with blank stream to clear the frame
            videoElement.srcObject = blankStream;
            console.log('📸 ParticipantConsentDialog: Replaced video srcObject with blank stream');
          } catch (e) {
            console.warn('📸 ParticipantConsentDialog: Could not create blank stream, using null:', e);
            // Fallback: set srcObject to null
            videoElement.srcObject = null;
          }
          
          // Hide with CSS
          videoElement.style.opacity = '0';
          videoElement.style.visibility = 'hidden';
          videoElement.style.display = 'none';
          videoElement.pause();
        }
      }
      
      tracks.forEach(track => {
        if (track.kind === 'video' && (currentRequest.requestType === 'camera' || currentRequest.requestType === 'both')) {
          console.log('📸 ParticipantConsentDialog: Disabling and stopping video track:', track.id);
          track.enabled = false; // Disable first
          
          // CRITICAL: Remove video track from stream before stopping to prevent frozen frame
          try {
            stream.removeTrack(track);
            console.log('📸 ParticipantConsentDialog: Removed video track from stream');
          } catch (e) {
            console.warn('📸 ParticipantConsentDialog: Could not remove track from stream:', e);
          }
          
          // Small delay before stopping to ensure video is hidden first
          setTimeout(() => {
            if (track.readyState !== 'ended') {
              track.stop(); // Then stop
            }
          }, 100);
        }
        if (track.kind === 'audio' && (currentRequest.requestType === 'audio' || currentRequest.requestType === 'both')) {
          console.log('📸 ParticipantConsentDialog: Disabling and stopping audio track:', track.id);
          track.enabled = false; // Disable first
          track.stop(); // Then stop
        }
      });
      
      // Update video state in useMediaControls
      if (currentRequest.requestType === 'camera' || currentRequest.requestType === 'both') {
        if (window.setIsVideoEnabled) {
          window.setIsVideoEnabled(false);
          console.log('📸 ParticipantConsentDialog: Set video state to disabled');
        } else {
          console.warn('📸 ParticipantConsentDialog: setIsVideoEnabled not available!');
        }
        
        // CRITICAL: Also directly hide the local video element immediately
        if (window.localVideoRef && window.localVideoRef.current) {
          const videoElement = window.localVideoRef.current;
          console.log('📸 ParticipantConsentDialog: Hiding local video element directly');
          
          // Hide immediately with multiple methods to ensure it's hidden
          videoElement.style.opacity = '0';
          videoElement.style.visibility = 'hidden';
          videoElement.style.display = 'none';
          videoElement.pause();
          
          // Also try to load empty source to clear the frozen frame
          // But keep the stream for audio if needed
          const videoTracks = stream.getVideoTracks();
          if (videoTracks.length > 0 && videoTracks[0].readyState === 'ended') {
            console.log('📸 ParticipantConsentDialog: Video track ended, ensuring video is hidden');
            // Force hide again after a short delay to catch any delayed updates
            setTimeout(() => {
              if (videoElement) {
                videoElement.style.opacity = '0';
                videoElement.style.visibility = 'hidden';
                videoElement.style.display = 'none';
                videoElement.pause();
              }
            }, 100);
          }
        }
      }
      
      // Update audio state in useMediaControls
      if (currentRequest.requestType === 'audio' || currentRequest.requestType === 'both') {
        if (window.setIsAudioEnabled) {
          window.setIsAudioEnabled(false);
          console.log('📸 ParticipantConsentDialog: Set audio state to disabled');
        } else {
          console.warn('📸 ParticipantConsentDialog: setIsAudioEnabled not available!');
        }
      }
      
      // Emit media state change to notify others
      // CRITICAL: For audio-only requests, preserve video state (don't turn it off)
      if (socket && socket.connected) {
        let videoEnabled;
        if (currentRequest.requestType === 'audio') {
          // Audio-only: Preserve actual video state
          const videoTrack = stream.getVideoTracks()[0];
          videoEnabled = videoTrack?.enabled ?? false;
          console.log('📸 ParticipantConsentDialog: Audio-only session ended, preserving video state', {
            videoEnabled,
            hasVideoTrack: !!videoTrack
          });
        } else {
          // Camera or both: Video should be disabled
          videoEnabled = !(currentRequest.requestType === 'camera' || currentRequest.requestType === 'both');
        }
        
        const audioEnabled = !(currentRequest.requestType === 'audio' || currentRequest.requestType === 'both');
        
        socket.emit('media-state-change', {
          meetingId,
          participantId: currentUserId,
          videoEnabled: videoEnabled,
          audioEnabled: audioEnabled,
          hasVideo: stream.getVideoTracks().length > 0 && videoEnabled,
          hasAudio: stream.getAudioTracks().length > 0 && audioEnabled,
          timestamp: Date.now()
        });
        console.log('📸 ParticipantConsentDialog: Emitted media state change after session end', {
          videoEnabled,
          audioEnabled,
          requestType: currentRequest.requestType
        });
      }
    } else {
      console.warn('📸 ParticipantConsentDialog: Cannot end session - missing stream or request', {
        hasStream: !!window.localStreamRef?.current,
        hasRequest: !!currentRequest
      });
    }
    
    // Clear active session in parent component
    if (onSessionStateChange) {
      console.log('📸 ParticipantConsentDialog: Clearing active session in parent');
      onSessionStateChange(null);
    }
    
    // Reset all state
    setRequest(null);
    setTimeRemaining(0);
    setShowWarning(false);
    setWarningShown(false);
    setShowActiveSessionDialog(false);
    
    console.log('📸 ParticipantConsentDialog: Session ended successfully');
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
      {/* Approval Request Dialog - Only show when request exists and NOT approved */}
      <Dialog 
        open={!!request && !request.approved} 
        onClose={handleDeny}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={false}
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
          open={!!request && request.approved && showActiveSessionDialog} 
          onClose={() => {
            // Allow closing the dialog, but keep the session active
            // The session will still be locked until time expires
            console.log('📸 ParticipantConsentDialog: Active session dialog closed by user, but session remains active');
            setShowActiveSessionDialog(false);
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

              {showWarning && timeRemaining <= 10 && timeRemaining > 0 && (
                <Alert 
                  severity="error" 
                  sx={{ 
                    mb: 2,
                    animation: 'pulse 1s infinite',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.7 }
                    }
                  }}
                  action={
                    <Button 
                      size="small" 
                      onClick={handleExtend}
                      color="inherit"
                      variant="outlined"
                    >
                      Request Extension
                    </Button>
                  }
                >
                  <Typography variant="body1" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                    ⚠️⚠️⚠️ WARNING: Session ending in {Math.floor(timeRemaining)} seconds! ⚠️⚠️⚠️
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Your {getRequestTypeLabel().toLowerCase()} will be turned off automatically when time expires.
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
              onClick={() => {
                // Just minimize the dialog, don't end the session
                console.log('📸 ParticipantConsentDialog: Minimizing active session dialog');
                setShowActiveSessionDialog(false);
              }}
              variant="outlined"
            >
              Minimize
            </Button>
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

