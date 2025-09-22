import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert
} from '@mui/material';
import {
  Videocam,
  Mic,
  Timer,
  Send,
  Close
} from '@mui/icons-material';

const HostCameraRequest = ({ 
  isHost, 
  socket, 
  meetingId, 
  participants 
}) => {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(3);
  const [requestType, setRequestType] = useState('both'); // 'camera', 'mic', 'both'
  const [message, setMessage] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);

  const handleOpenDialog = () => {
    setOpen(true);
    setMessage('');
    setDuration(3);
    setRequestType('both');
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setIsRequesting(false);
  };

  const handleSendRequest = () => {
    if (!socket || !meetingId) {
      console.error('❌ HostCameraRequest: Missing socket or meetingId');
      return;
    }

    setIsRequesting(true);

    const requestData = {
      meetingId,
      duration: duration * 60, // Convert minutes to seconds
      requestType,
      message: message.trim() || getDefaultMessage(),
      timestamp: Date.now()
    };

    console.log('📤 HostCameraRequest: Sending camera/mic request:', requestData);

    // Emit request to backend
    socket.emit('host-request-camera-mic', requestData);

    // Show success message briefly
    setTimeout(() => {
      setIsRequesting(false);
      setOpen(false);
    }, 1000);
  };

  const getDefaultMessage = () => {
    switch (requestType) {
      case 'camera':
        return `Please turn on your camera for ${duration} minutes for better interaction.`;
      case 'mic':
        return `Please turn on your microphone for ${duration} minutes for Q&A session.`;
      case 'both':
        return `Please turn on your camera and microphone for ${duration} minutes for interactive discussion.`;
      default:
        return `Please enable your camera and microphone for ${duration} minutes.`;
    }
  };

  const getRequestTypeLabel = () => {
    switch (requestType) {
      case 'camera':
        return 'Camera Only';
      case 'mic':
        return 'Microphone Only';
      case 'both':
        return 'Camera & Microphone';
      default:
        return 'Camera & Microphone';
    }
  };

  const getRequestTypeIcon = () => {
    switch (requestType) {
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

  // Don't render if not host
  if (!isHost) {
    return null;
  }

  return (
    <>
      {/* Request Button */}
      <Button
        variant="contained"
        color="secondary"
        startIcon={<Videocam />}
        onClick={handleOpenDialog}
        sx={{
          borderRadius: '12px',
          textTransform: 'none',
          fontWeight: 600,
          px: 3,
          py: 1,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
          '&:hover': {
            background: 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)',
            boxShadow: '0 6px 20px rgba(102, 126, 234, 0.4)',
            transform: 'translateY(-2px)'
          },
          transition: 'all 0.3s ease'
        }}
      >
        Request Camera/Mic
      </Button>

      {/* Request Dialog */}
      <Dialog 
        open={open} 
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.9))',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.2)'
          }
        }}
      >
        <DialogTitle sx={{ 
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          color: 'white',
          borderRadius: '16px 16px 0 0',
          pb: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {getRequestTypeIcon()}
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Request Camera & Microphone Access
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          <Alert severity="info" sx={{ mb: 3, borderRadius: '12px' }}>
            This feature respects participant privacy. Participants must approve the request before their camera/microphone is activated.
          </Alert>

          {/* Request Type Selection */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Request Type</InputLabel>
            <Select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              label="Request Type"
            >
              <MenuItem value="camera">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Videocam />
                  <span>Camera Only</span>
                </Box>
              </MenuItem>
              <MenuItem value="mic">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Mic />
                  <span>Microphone Only</span>
                </Box>
              </MenuItem>
              <MenuItem value="both">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Videocam />
                  <Mic />
                  <span>Camera & Microphone</span>
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {/* Duration Selection */}
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Duration</InputLabel>
            <Select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              label="Duration"
            >
              <MenuItem value={1}>1 minute</MenuItem>
              <MenuItem value={2}>2 minutes</MenuItem>
              <MenuItem value={3}>3 minutes</MenuItem>
              <MenuItem value={5}>5 minutes</MenuItem>
              <MenuItem value={10}>10 minutes</MenuItem>
            </Select>
          </FormControl>

          {/* Custom Message */}
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Custom Message (Optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={getDefaultMessage()}
            sx={{ mb: 2 }}
          />

          {/* Preview */}
          <Box sx={{ 
            p: 2, 
            borderRadius: '12px', 
            background: 'rgba(102, 126, 234, 0.1)',
            border: '1px solid rgba(102, 126, 234, 0.2)'
          }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Request Preview:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {getDefaultMessage()}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Chip 
                icon={<Timer />} 
                label={`${duration} min`} 
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
        </DialogContent>

        <DialogActions sx={{ p: 3, gap: 2 }}>
          <Button
            onClick={handleCloseDialog}
            startIcon={<Close />}
            sx={{ borderRadius: '12px' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSendRequest}
            variant="contained"
            startIcon={<Send />}
            disabled={isRequesting}
            sx={{
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a6fd8, #6a4190)'
              }
            }}
          >
            {isRequesting ? 'Sending...' : 'Send Request'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default HostCameraRequest;
