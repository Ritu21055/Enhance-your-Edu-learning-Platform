import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip
} from '@mui/material';
import { Videocam, Mic, AccessTime } from '@mui/icons-material';

const MediaRequestNotification = ({ 
  open, 
  request, 
  onAccept, 
  onDeny 
}) => {
  if (!request) return null;

  const getDurationMinutes = () => {
    return Math.floor((request.expiresAt - request.requestedAt) / 60000);
  };

  return (
    <Dialog open={open} onClose={onDeny} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Videocam />
          <Mic />
          Camera & Microphone Access Request
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body1">
            <strong>{request.hostName}</strong> is requesting access to your camera and microphone.
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip icon={<Videocam />} label="Camera" color="primary" />
            <Chip icon={<Mic />} label="Microphone" color="primary" />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <AccessTime />
            <Typography variant="body2" color="text.secondary">
              Duration: {getDurationMinutes()} minute(s)
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Your camera and microphone will automatically turn off after the time expires.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onDeny} color="error">
          Deny
        </Button>
        <Button onClick={onAccept} variant="contained" color="primary" startIcon={<><Videocam /><Mic /></>}>
          Accept
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MediaRequestNotification;

