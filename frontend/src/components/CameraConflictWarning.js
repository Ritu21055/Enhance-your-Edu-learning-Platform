import React from 'react';
import { Box, Typography, Button, Alert, AlertTitle } from '@mui/material';
import { CameraAlt, Refresh } from '@mui/icons-material';

const CameraConflictWarning = ({ onRetry, onClose }) => {
  return (
    <Box sx={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.8)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <Box sx={{ 
        backgroundColor: 'white', 
        borderRadius: 2, 
        p: 3, 
        maxWidth: 500, 
        mx: 2 
      }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Camera Already in Use</AlertTitle>
          Another browser or application is currently using your camera.
        </Alert>
        
        <Typography variant="h6" gutterBottom>
          <CameraAlt sx={{ mr: 1, verticalAlign: 'middle' }} />
          Camera Access Issue
        </Typography>
        
        <Typography variant="body1" paragraph>
          To use multiple browsers for testing:
        </Typography>
        
        <Box component="ul" sx={{ pl: 2, mb: 2 }}>
          <Typography component="li" variant="body2">
            Close all other browser tabs using the camera
          </Typography>
          <Typography component="li" variant="body2">
            Close any other applications using the camera (Zoom, Skype, etc.)
          </Typography>
          <Typography component="li" variant="body2">
            Try using different devices for testing instead
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button 
            variant="outlined" 
            onClick={onClose}
          >
            Close
          </Button>
          <Button 
            variant="contained" 
            startIcon={<Refresh />}
            onClick={onRetry}
          >
            Try Again
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default CameraConflictWarning;
