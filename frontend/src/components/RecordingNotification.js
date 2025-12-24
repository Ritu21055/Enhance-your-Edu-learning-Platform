import React, { useEffect } from 'react';
import {
  Snackbar,
  Alert,
  Box,
  Typography
} from '@mui/material';
import { FiberManualRecord, Stop } from '@mui/icons-material';

const RecordingNotification = ({ 
  open, 
  isRecording,
  onClose
}) => {
  // Auto-close after 5 seconds
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Snackbar
      open={open}
      autoHideDuration={5000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{
        top: '80px !important', // Position below top bar
        zIndex: 10000
      }}
    >
      <Alert
        severity={isRecording ? 'warning' : 'info'}
        icon={isRecording ? <FiberManualRecord sx={{ color: '#f44336' }} /> : <Stop />}
        onClose={onClose}
        sx={{
          minWidth: '300px',
          backgroundColor: isRecording ? '#fff3cd' : '#e3f2fd',
          color: isRecording ? '#856404' : '#1565c0',
          '& .MuiAlert-icon': {
            color: isRecording ? '#f44336' : '#1565c0'
          },
          '& .MuiAlert-message': {
            fontWeight: 500
          }
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {isRecording 
              ? '🎬 Meeting is being recorded by the host' 
              : '🛑 Recording stopped by the host'}
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '0.85rem', opacity: 0.8 }}>
            {isRecording 
              ? 'Your audio and video are being recorded.' 
              : 'Recording has been stopped.'}
          </Typography>
        </Box>
      </Alert>
    </Snackbar>
  );
};

export default RecordingNotification;

