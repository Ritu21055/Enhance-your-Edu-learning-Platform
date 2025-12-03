import { useState, useEffect, useRef } from 'react';

/**
 * Meeting Password Hook
 * Manages password state and socket events for meeting password system
 * 
 * @param {object} socket - Socket.IO socket instance
 * @param {string} meetingId - Meeting ID
 * @param {boolean} isHost - Whether current user is host
 * @returns {object} - Password state and handlers
 */
const useMeetingPassword = (socket, meetingId, isHost) => {
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const passwordAttemptsRef = useRef(0);
  const maxAttempts = 3;

  // Listen for password required event
  useEffect(() => {
    if (!socket) return;

    const handlePasswordRequired = (data) => {
      console.log('🔒 Password required event received:', data);
      setIsPasswordRequired(true);
      setShowPasswordDialog(true);
      setPasswordError(data.error || 'This meeting requires a password');
      setPasswordVerified(false);
    };

    const handlePasswordVerified = (data) => {
      console.log('✅ Password verified:', data);
      setPasswordVerified(true);
      setShowPasswordDialog(false);
      setIsPasswordRequired(false);
      setPasswordError('');
      passwordAttemptsRef.current = 0;
    };

    const handlePasswordError = (data) => {
      console.log('❌ Password error:', data);
      passwordAttemptsRef.current += 1;
      
      if (passwordAttemptsRef.current >= maxAttempts) {
        setPasswordError('Too many incorrect attempts. Please try again later.');
        setShowPasswordDialog(false);
        // Reset after 30 seconds
        setTimeout(() => {
          passwordAttemptsRef.current = 0;
          setPasswordError('');
        }, 30000);
      } else {
        setPasswordError(data.error || `Incorrect password. ${maxAttempts - passwordAttemptsRef.current} attempts remaining.`);
      }
    };

    socket.on('meeting-password-required', handlePasswordRequired);
    socket.on('meeting-password-verified', handlePasswordVerified);
    socket.on('meeting-password-error', handlePasswordError);

    return () => {
      socket.off('meeting-password-required', handlePasswordRequired);
      socket.off('meeting-password-verified', handlePasswordVerified);
      socket.off('meeting-password-error', handlePasswordError);
    };
  }, [socket]);

  /**
   * Submit password for verification
   * @param {string} inputPassword - Password entered by user
   */
  const submitPassword = (inputPassword) => {
    if (!socket || !meetingId || !inputPassword) {
      setPasswordError('Please enter a password');
      return;
    }

    setPasswordError('');
    
    // Emit password for verification
    socket.emit('verify-meeting-password', {
      meetingId,
      password: inputPassword.trim()
    });
  };

  /**
   * Set meeting password (for host)
   * @param {string} newPassword - Password to set
   */
  const setMeetingPassword = (newPassword) => {
    if (!socket || !meetingId || !isHost) {
      console.error('Cannot set password: not host or socket not available');
      return;
    }

    socket.emit('set-meeting-password', {
      meetingId,
      password: newPassword ? newPassword.trim() : null
    });
  };

  /**
   * Clear password state
   */
  const clearPassword = () => {
    setPassword('');
    setPasswordError('');
    setIsPasswordRequired(false);
    setShowPasswordDialog(false);
    setPasswordVerified(false);
    passwordAttemptsRef.current = 0;
  };

  return {
    // State
    password,
    passwordError,
    isPasswordRequired,
    showPasswordDialog,
    passwordVerified,
    
    // Setters
    setPassword,
    setPasswordError,
    setShowPasswordDialog,
    
    // Actions
    submitPassword,
    setMeetingPassword,
    clearPassword
  };
};

export default useMeetingPassword;

