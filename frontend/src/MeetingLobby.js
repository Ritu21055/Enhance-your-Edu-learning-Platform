import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card, 
  CardContent, 
  Avatar,
  Chip,
  CircularProgress,
  TextField
} from '@mui/material';
import io from 'socket.io-client';
import { getBackendUrl, testBackendConnection } from './config/network';
import { createMeeting, storeMeeting } from './services/meetingsService';
import { formatMeetingCode } from './services/meetingCodeService';
import PasswordDialog from './components/PasswordDialog';
import { validatePassword } from './services/meetingPasswordService';
import './css/MeetingLobby.css';

const MeetingLobby = () => {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [username, setUsername] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [hostPassword, setHostPassword] = useState('');
  const [hostPasswordError, setHostPasswordError] = useState('');
  const [participantPassword, setParticipantPassword] = useState('');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  
  // Use ref to store username persistently
  const usernameRef = useRef('');

  
  // Preserve meeting title when switching roles
  const meetingTitleRef = useRef('');
  
  // Update meeting title ref when meeting title changes
  useEffect(() => {
    meetingTitleRef.current = meetingTitle;
  }, [meetingTitle]);

  // Debug: Log password dialog state changes
  useEffect(() => {
    console.log('🔒 Password dialog state changed:', { showPasswordDialog, hasJoined, isHost });
  }, [showPasswordDialog, hasJoined, isHost]);

  useEffect(() => {
    // Initialize socket connection
    const backendUrl = getBackendUrl();
    console.log('🔍 Lobby: Connecting to backend URL:', backendUrl);
    console.log('🔍 Lobby: Current hostname:', window.location.hostname);
    console.log('🔍 Lobby: Current protocol:', window.location.protocol);
    
    const newSocket = io(backendUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Lobby: Connected to server at:', backendUrl);
      setIsConnected(true);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Lobby: Connection error:', error);
      console.error('❌ Lobby: Failed to connect to:', backendUrl);
      setError(`Failed to connect to server: ${error.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('⚠️ Lobby: Disconnected from server:', reason);
      setIsConnected(false);
    });

    // REMOVED: Connection timeout was causing unnecessary errors

    // Add debugging for all socket events
    const originalEmit = newSocket.emit;
    newSocket.emit = function(event, ...args) {
      console.log('🔍 Lobby emitting:', event, args);
      return originalEmit.call(this, event, ...args);
    };

    newSocket.on('meeting-joined', (data) => {
      // CRITICAL: Verify host status by checking if socket ID matches hostId
      const actualHostId = data.meeting?.hostId;
      const isActuallyHost = actualHostId === newSocket.id;
      
      setMeetingInfo(data);
      
      const currentUsername = usernameRef.current || username;
      
      if (!currentUsername || currentUsername.trim() === '') {
        setError('Username is required to join the meeting');
        return;
      }
      
      const finalUsername = currentUsername.trim();
      localStorage.setItem(`approved_${meetingId}`, 'true');
      
      const titleForStorage = meetingTitleRef.current || meetingTitle;
      const finalMeetingTitle = titleForStorage.trim() || `Meeting ${meetingId}`;
      
      const meeting = createMeeting(meetingId, finalMeetingTitle, [finalUsername]);
      storeMeeting(meeting).catch(error => {
        console.error('Failed to store meeting:', error);
      });
      
      // Host navigates directly, participants join directly (password already verified if required)
      if (isActuallyHost) {
        setIsHost(true);
        navigate(`/meeting/${meetingId}?user=${finalUsername}&approved=true&host=true`);
      } else {
        setIsHost(false);
        // Participant navigates to meeting room (password was already verified if meeting had one)
        navigate(`/meeting/${meetingId}?user=${finalUsername}&approved=true`);
      }
    });

    // Handle password required
    newSocket.on('meeting-password-required', (data) => {
      console.log('🔒 Password required event received:', data);
      console.log('🔒 Setting showPasswordDialog to true');
      setShowPasswordDialog(true);
      setError(data.error || 'This meeting requires a password');
      setHasJoined(false);
    });

    // NOTE: Password verification is now handled directly in PasswordDialog onSubmit
    // This handler is kept for backward compatibility but may not be used
    newSocket.on('meeting-password-verified', (data) => {
      console.log('✅ Password verified event received (may not be used):', data);
      // Password verification is now handled directly in PasswordDialog onSubmit
      // which retries join-meeting with the password
    });

    // Handle password error
    newSocket.on('meeting-password-error', (data) => {
      console.log('❌ Password error:', data);
      setError(data.error || 'Password verification failed');
    });

    newSocket.on('meeting-not-found', () => {
      console.log('Meeting not found');
      setError('Meeting not found. Please check the meeting ID.');
    });

    newSocket.on('meeting-full', () => {
      console.log('Meeting is full');
      setError('Meeting is full. Cannot join at this time.');
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
      setError(`Connection error: ${error.message}`);
    });

    return () => {
      newSocket.close();
    };
  }, [meetingId, navigate]);


  const handleJoinMeeting = () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (username.trim().length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }

    // If joining as host, require meeting title
    const titleForValidation = meetingTitleRef.current || meetingTitle;
    console.log('🔍 Lobby: Checking meeting title for host:', { isHost, meetingTitle: titleForValidation, trimmed: titleForValidation.trim() });
    if (isHost && !titleForValidation.trim()) {
      setError('Please enter a meeting title');
      return;
    }

    setError('');
    setHasJoined(true);
    
    // Ensure username ref is updated
    const trimmedUsername = username.trim();
    usernameRef.current = trimmedUsername;
    
    
    // Join the meeting
    const titleForSending = meetingTitleRef.current || meetingTitle;
    const meetingTitleToSend = isHost ? titleForSending.trim() : null;
    console.log('🔍 Lobby: About to emit join-meeting with:', { 
      meetingId, 
      userName: trimmedUsername,
      meetingTitle: meetingTitleToSend,
      isHost
    });
    console.log('🔍 Lobby: Username value:', username);
    console.log('🔍 Lobby: Username ref value:', usernameRef.current);
    console.log('🔍 Lobby: Meeting title to send:', meetingTitleToSend);
    
    // Validate host password if provided
    if (isHost && hostPassword.trim() !== '') {
      const validation = validatePassword(hostPassword);
      if (!validation.isValid) {
        setHostPasswordError(validation.error);
        setError(validation.error);
        setHasJoined(false);
        return;
      }
    }
    
    // CRITICAL: Store host password in sessionStorage for useVideoCall hook
    // This ensures the host can reclaim their meeting when they reconnect
    if (isHost && hostPassword.trim() !== '') {
      sessionStorage.setItem(`meeting_host_password_${meetingId}`, hostPassword.trim());
      console.log('🔒 Stored host password in sessionStorage for meeting:', meetingId);
    } else if (isHost) {
      // Even if password is empty, store null to indicate host is setting password (even if empty)
      sessionStorage.setItem(`meeting_host_password_${meetingId}`, '');
      console.log('🔒 Stored empty host password in sessionStorage (host setting no password)');
    }
    
    socket.emit('join-meeting', { 
      meetingId, 
      userName: trimmedUsername,
      meetingTitle: meetingTitleToSend,
      isHost: isHost,
      setPassword: isHost ? (hostPassword.trim() || null) : undefined, // Host sets password
      // CRITICAL: Participants should NOT send password on first join
      // Password will be requested by backend if meeting has one
      // Only send password if it was already verified (from password dialog)
      password: !isHost ? (participantPassword.trim() || undefined) : undefined // Participant provides password (only if already verified)
    });
  };

  const handleLeaveLobby = () => {
    if (socket) {
      socket.emit('leave-meeting', { meetingId });
      socket.close();
    }
    navigate('/');
  };

  return (
    <Box className="lobby-container">
      <Card className="lobby-card">
        <CardContent className="lobby-content">
          <Avatar className="lobby-avatar">
            {hasJoined ? username.charAt(0).toUpperCase() : '👤'}
          </Avatar>

          <Typography variant="h4" className="lobby-title">
            {hasJoined ? username : 'Join Meeting'}
          </Typography>
          
          <Typography variant="h6" className="lobby-meeting-id">
            Meeting Code: {formatMeetingCode(meetingId)}
          </Typography>

          {!hasJoined ? (
            // Username Entry Form
            <Box component="form" className="lobby-form">
            <TextField
              fullWidth
                label="Enter your username"
                value={username}
                onChange={(e) => {
                  const value = e.target.value;
                  console.log('🔍 Lobby: Username input changed to:', value);
                  console.log('🔍 Lobby: Username input type:', typeof value);
                  console.log('🔍 Lobby: Username input length:', value?.length);
                  setUsername(value);
                  usernameRef.current = value; // Also store in ref
                  console.log('🔍 Lobby: Username state updated, ref updated');
                }}
                error={!!error}
                helperText={error}
                className="lobby-textfield"
                placeholder="e.g., John, Sarah, Mike"
                inputProps={{ maxLength: 20 }}
              />

              {/* Meeting Title Input - Only show when joining as host */}
              {isHost && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ mb: 1, color: '#7c3aed', fontWeight: 500 }}>
                    👑 As a host, please enter a meeting title
                  </Typography>
                  <TextField
                    fullWidth
                    label="Meeting Title"
                    value={meetingTitle}
                    onChange={(e) => {
                      console.log('🔍 Lobby: Meeting title changed to:', e.target.value);
                      setMeetingTitle(e.target.value);
                    }}
                    className="lobby-textfield"
                    placeholder="e.g., Weekly Team Standup, Project Review"
                    inputProps={{ maxLength: 50 }}
                  />
                  
                  {/* Password Input for Host */}
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ mb: 1, color: '#7c3aed', fontWeight: 500 }}>
                      🔒 Set Meeting Password (Optional but Recommended)
                    </Typography>
                    <TextField
                      fullWidth
                      type="password"
                      label="Meeting Password"
                      value={hostPassword}
                      onChange={(e) => {
                        setHostPassword(e.target.value);
                        setHostPasswordError('');
                        setError('');
                      }}
                      error={!!hostPasswordError}
                      helperText={hostPasswordError || 'Participants will need this password to join. Leave empty for no password.'}
                      className="lobby-textfield"
                      placeholder="Enter password (min 4 characters) or leave empty"
                      inputProps={{ maxLength: 50 }}
                    />
                  </Box>
                </Box>
              )}

              <Box className="lobby-role-buttons">
                <Button
                  variant={isHost ? "contained" : "outlined"}
                  onClick={() => setIsHost(true)}
                  className={`lobby-role-button ${isHost ? 'host' : ''}`}
                >
                  👑 Join as Host
                </Button>
                
                <Button
                  variant={!isHost ? "contained" : "outlined"}
                  onClick={() => setIsHost(false)}
                  className={`lobby-role-button ${!isHost ? 'participant' : ''}`}
                >
                  👥 Join as Participant
                </Button>
          </Box>

            <Button
                onClick={handleJoinMeeting}
              variant="contained"
                fullWidth
              size="large"
                className="lobby-join-button"
              >
                {isHost ? '👑 Start Meeting as Host' : '👥 Join Meeting'}
            </Button>
            </Box>
          ) : null}


          {hasJoined ? (
            // Connecting to Meeting
            <Typography variant="body1" className="lobby-connecting-text">
              Connecting to meeting...
            </Typography>
          ) : null}

          {isHost && hasJoined && (
            <Chip
              label="👑 You are the meeting host"
              className="lobby-host-chip"
            />
          )}

          <Box className="lobby-controls">
            <Button
              variant="outlined"
              onClick={handleLeaveLobby}
              className="lobby-leave-button"
            >
              Leave Lobby
            </Button>
          </Box>

          {!isConnected && (
            <Box className="lobby-status-container">
              <Chip
                label="Connecting..."
                color="warning"
                size="small"
                className="lobby-connecting-chip"
              />
              <Button
                variant="outlined"
                size="small"
                onClick={async () => {
                  console.log('🔍 Lobby Debug: Testing backend connection...');
                  const result = await testBackendConnection();
                  
                  if (result.success) {
                    console.log('✅ Lobby Debug: Backend is reachable!');
                    setError('');
                  } else {
                    console.log('❌ Lobby Debug: Backend connection failed:', result.error);
                    setError(`Backend not reachable: ${result.error} (URL: ${result.url})`);
                  }
                }}
                style={{ marginTop: '8px' }}
              >
                🔍 Test Backend Connection
              </Button>
              </Box>
          )}
        </CardContent>
      </Card>
      
      {/* Password Dialog for Participants */}
      <PasswordDialog
        open={showPasswordDialog}
        onClose={() => {
          setShowPasswordDialog(false);
          setHasJoined(false);
          setParticipantPassword('');
          setError('');
        }}
        onSubmit={(inputPassword) => {
          // Store password and retry join-meeting with password
          setParticipantPassword(inputPassword);
          setError('');
          
          if (socket) {
            const currentUsername = usernameRef.current || username;
            // Store verified password in sessionStorage for useVideoCall hook
            sessionStorage.setItem(`meeting_password_${meetingId}`, inputPassword);
            console.log('🔒 Stored verified password in sessionStorage for meeting:', meetingId);
            
            // Retry join-meeting with password
            // CRITICAL: Always send isHost: false when password is provided
            // Password verification means user is a participant, not host
            socket.emit('join-meeting', {
              meetingId,
              userName: currentUsername,
              meetingTitle: null, // Participants don't set meeting title
              isHost: false, // Password verification = participant, not host
              password: inputPassword // Send the verified password
            });
          }
        }}
        error={error}
        meetingId={meetingId}
      />
      </Box>
  );
};

export default MeetingLobby;
