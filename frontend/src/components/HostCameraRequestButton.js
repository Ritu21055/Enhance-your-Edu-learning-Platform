import React, { useState } from 'react';
import {
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Select,
  FormControl,
  InputLabel,
  MenuItem,
  TextField,
  Box,
  Typography,
  Chip
} from '@mui/material';
import { VideocamOff, MicOff, Send } from '@mui/icons-material';

const HostCameraRequestButton = ({ 
  participant, 
  socket, 
  meetingId, 
  participantMediaState 
}) => {
  const [showDialog, setShowDialog] = useState(false);
  const [requestType, setRequestType] = useState('both');
  const [duration, setDuration] = useState(60);
  const [customMessage, setCustomMessage] = useState('');

  const isVideoOff = !participantMediaState[participant.id]?.videoEnabled;
  const isAudioOff = !participantMediaState[participant.id]?.audioEnabled;
  
  if (!isVideoOff && !isAudioOff) return null;

  const handleRequest = () => {
    if (!socket) {
      console.log('📸 HostCameraRequestButton: No socket available');
      return;
    }

    const requestData = {
      meetingId,
      participantId: participant.id,
      requestType,
      duration,
      customMessage: customMessage.trim() || undefined
    };

    console.log('📸 HostCameraRequestButton: Sending request:', requestData);
    console.log('📸 HostCameraRequestButton: Participant details:', {
      id: participant.id,
      name: participant.name,
      socketId: socket.id
    });

    socket.emit('host-request-camera-mic', requestData);

    setShowDialog(false);
    setCustomMessage('');
    setRequestType('both');
    setDuration(60);
  };

  const getRequestTypeOptions = () => {
    const options = [];
    if (isVideoOff) options.push({ value: 'camera', label: 'Camera Only' });
    if (isAudioOff) options.push({ value: 'audio', label: 'Audio Only' });
    if (isVideoOff && isAudioOff) options.push({ value: 'both', label: 'Both Camera & Audio' });
    return options;
  };

  return (
    <>
      <IconButton
        size="small"
        onClick={() => setShowDialog(true)}
        title="Request Camera/Audio Access"
        sx={{ color: isVideoOff || isAudioOff ? '#ff9800' : 'inherit' }}
      >
        {isVideoOff && <VideocamOff fontSize="small" />}
        {isAudioOff && <MicOff fontSize="small" />}
      </IconButton>

      <Dialog 
        open={showDialog} 
        onClose={() => {
          setShowDialog(false);
          setCustomMessage('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Request Camera/Audio Access
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
            Requesting from: {participant.name}
          </Typography>
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Request Type</InputLabel>
              <Select 
                value={requestType} 
                onChange={(e) => setRequestType(e.target.value)}
                label="Request Type"
              >
                {getRequestTypeOptions().map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <FormControl fullWidth>
              <InputLabel>Duration</InputLabel>
              <Select 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)}
                label="Duration"
              >
                <MenuItem value={30}>30 seconds</MenuItem>
                <MenuItem value={60}>1 minute</MenuItem>
                <MenuItem value={120}>2 minutes</MenuItem>
                <MenuItem value={300}>5 minutes</MenuItem>
                <MenuItem value={600}>10 minutes</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Custom Message (Optional)"
              placeholder="e.g., Please turn on camera for presentation..."
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              helperText="Add a message to explain why you need access."
              inputProps={{ maxLength: 200 }}
            />
            
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip 
                label={duration >= 60 ? `${duration / 60} min` : `${duration}s`} 
                size="small" 
                color="primary" 
                variant="outlined"
              />
              {customMessage && (
                <Chip 
                  label="With message" 
                  size="small" 
                  color="success" 
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={() => {
            setShowDialog(false);
            setCustomMessage('');
          }}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleRequest}
            startIcon={<Send />}
          >
            Send Request
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default HostCameraRequestButton;

