import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  IconButton
} from '@mui/material';
import { Lock, Visibility, VisibilityOff, Close } from '@mui/icons-material';
import { validatePassword } from '../services/meetingPasswordService';

/**
 * Password Dialog Component
 * Shows password input dialog for participants joining password-protected meetings
 * 
 * @param {boolean} open - Whether dialog is open
 * @param {function} onClose - Close handler
 * @param {function} onSubmit - Submit handler (receives password)
 * @param {string} error - Error message to display
 * @param {string} meetingId - Meeting ID (for display)
 */
const PasswordDialog = ({ 
  open, 
  onClose, 
  onSubmit, 
  error = '', 
  meetingId = '' 
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setPassword('');
      setLocalError('');
      setShowPassword(false);
    }
  }, [open]);

  // Update local error when prop error changes
  useEffect(() => {
    setLocalError(error);
  }, [error]);

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    setLocalError(''); // Clear error when user types
  };

  const handleSubmit = () => {
    // Validate password
    const validation = validatePassword(password);
    
    if (!validation.isValid) {
      setLocalError(validation.error);
      return;
    }

    // Submit password
    if (onSubmit) {
      onSubmit(password);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handleClose = () => {
    setPassword('');
    setLocalError('');
    if (onClose) {
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white'
        }
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <Lock sx={{ fontSize: 28 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Meeting Password Required
            </Typography>
          </Box>
          <IconButton
            onClick={handleClose}
            sx={{ color: 'white' }}
            size="small"
          >
            <Close />
          </IconButton>
        </Box>
        {meetingId && (
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
            Meeting: {meetingId}
          </Typography>
        )}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
            This meeting is password protected. Please enter the password to join.
          </Typography>
          
          <TextField
            fullWidth
            type={showPassword ? 'text' : 'password'}
            label="Meeting Password"
            value={password}
            onChange={handlePasswordChange}
            onKeyPress={handleKeyPress}
            error={!!localError}
            helperText={localError || 'Enter the password provided by the meeting host'}
            autoFocus
            InputProps={{
              endAdornment: (
                <IconButton
                  onClick={() => setShowPassword(!showPassword)}
                  edge="end"
                  sx={{ color: 'rgba(255, 255, 255, 0.7)' }}
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              ),
              sx: {
                color: 'white',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(255, 255, 255, 0.3)'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(255, 255, 255, 0.5)'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'white'
                }
              }
            }}
            InputLabelProps={{
              sx: { color: 'rgba(255, 255, 255, 0.7)' }
            }}
            FormHelperTextProps={{
              sx: { color: 'rgba(255, 255, 255, 0.8)' }
            }}
          />
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, pt: 1 }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{
            color: 'white',
            borderColor: 'rgba(255, 255, 255, 0.5)',
            '&:hover': {
              borderColor: 'white',
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          sx={{
            backgroundColor: 'white',
            color: '#667eea',
            fontWeight: 600,
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.9)'
            }
          }}
        >
          Join Meeting
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PasswordDialog;

