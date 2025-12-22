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
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import io from 'socket.io-client';
import { getBackendUrl, testBackendConnection, findBackendServer, setStoredBackendIP } from './config/network';
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
  const [showIPDialog, setShowIPDialog] = useState(false);
  const [manualIP, setManualIP] = useState('');
  
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
    let newSocket = null;
    let connectionTimeout = null;
    let isMounted = true;

    const connectToBackend = async (url) => {
      if (!isMounted) return;
      
      console.log('🔍 Lobby: Connecting to backend URL:', url);
      console.log('🔍 Lobby: Current hostname:', window.location.hostname);
      console.log('🔍 Lobby: Current protocol:', window.location.protocol);
      
      // Test backend connection first
      const testResult = await testBackendConnection(url);
      if (!testResult.success) {
        console.error('❌ Backend connection test failed:', testResult.error);
        
        // Try to find backend server automatically
        if (isMounted) {
          setError(`Cannot connect to server at ${url}. Trying to find server...`);
          console.log('🔍 Attempting to auto-discover backend server...');
          
          const discoveryResult = await findBackendServer();
          if (discoveryResult.success && isMounted) {
            console.log('✅ Found backend server at:', discoveryResult.url);
            setError(''); // Clear error
            // Reconnect with discovered URL
            connectToBackend(discoveryResult.url);
            return;
          } else {
            // Show helpful error message and offer manual IP input
            const currentHostname = window.location.hostname;
            const isLocalhost = currentHostname === 'localhost' || currentHostname === '127.0.0.1';
            
            let errorMsg = `Cannot connect to backend server at ${url}\n\n`;
            
            if (isLocalhost) {
              errorMsg += `⚠️ IMPORTANT: You are accessing via localhost!\n\n` +
                `✅ SOLUTION: Access the app using the HOST's IP address instead:\n` +
                `   Instead of: http://localhost:3000\n` +
                `   Use: http://192.168.0.107:3000\n\n` +
                `   (Replace 192.168.0.107 with the actual host IP)\n\n` +
                `Or enter the host IP below to connect:\n\n`;
            } else {
              errorMsg += `Please check:\n` +
                `1. Backend server is running on host (cd backend && npm start)\n` +
                `2. Both devices are on the same network\n` +
                `3. Firewall allows port 5000 on host\n` +
                `4. Host IP is correct (current: ${url})\n\n` +
                `Or enter the correct host IP below:\n\n`;
            }
            
            setError(errorMsg);
            setShowIPDialog(true); // Show manual IP input dialog
            return;
          }
        }
        return;
      }
      
      console.log('✅ Backend connection test passed');
      
      if (!isMounted) return;
      
      // Create socket connection
      newSocket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 15000, // Increased timeout
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        if (!isMounted) return;
        console.log('✅ Lobby: Connected to server at:', url);
        console.log('✅ Lobby: Socket ID:', newSocket.id);
        setIsConnected(true);
        setError(''); // Clear any previous errors
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
      });

      newSocket.on('connect_error', (error) => {
        if (!isMounted) return;
        console.error('❌ Lobby: Connection error:', error);
        console.error('❌ Lobby: Failed to connect to:', url);
        setIsConnected(false);
        
        // Try auto-discovery on connection error
        findBackendServer().then(discoveryResult => {
          if (discoveryResult.success && isMounted && !newSocket?.connected) {
            console.log('✅ Found backend server at:', discoveryResult.url);
            setError(''); // Clear error
            // Reconnect with discovered URL
            if (newSocket) {
              newSocket.disconnect();
            }
            connectToBackend(discoveryResult.url);
          } else if (isMounted) {
            setError(`Failed to connect to server at ${url}. Please ensure the server is running and accessible. Error: ${error.message}`);
          }
        });
      });

      newSocket.on('disconnect', (reason) => {
        if (!isMounted) return;
        console.log('⚠️ Lobby: Disconnected from server:', reason);
        setIsConnected(false);
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          setError('Disconnected from server. Attempting to reconnect...');
        }
      });
      
      // Set a connection timeout
      connectionTimeout = setTimeout(() => {
        if (newSocket && !newSocket.connected && isMounted) {
          console.error('❌ Lobby: Connection timeout - socket not connected after 15 seconds');
          setError(`Connection timeout. Cannot reach server at ${url}. Please check your network connection and ensure the server is running.`);
          setIsConnected(false);
        }
      }, 15000);

      // Socket event handlers
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
        console.log('🔒 Current state before update:', { showPasswordDialog, hasJoined, isHost });
        setShowPasswordDialog(true);
        setError(data.error || 'This meeting requires a password');
        setHasJoined(false);
        console.log('🔒 Password dialog should now be open');
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
    };

    // Initialize connection
    const backendUrl = getBackendUrl();
    connectToBackend(backendUrl);

    // Cleanup function
    return () => {
      isMounted = false;
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      if (newSocket) {
        newSocket.removeAllListeners();
        newSocket.disconnect();
      }
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

    // Check if socket is connected
    if (!socket) {
      setError('Socket not initialized. Please wait a moment and try again.');
      return;
    }
    
    if (!socket.connected) {
      setError(`Not connected to server. Please wait for connection to ${socket.io?.uri || 'server'}. 
        If this persists, check:
        1. Backend server is running on host laptop
        2. Both laptops are on the same network
        3. Firewall allows connections`);
      setHasJoined(false);
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
      isHost,
      socketConnected: socket?.connected,
      participantPassword: participantPassword ? 'provided' : 'not provided'
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
      
      {/* Manual IP Input Dialog */}
      <Dialog 
        open={showIPDialog} 
        onClose={() => setShowIPDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Enter Host IP Address</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Cannot connect to the backend server. 
            {window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? (
              <>
                <br /><br />
                <strong>⚠️ You are accessing via localhost!</strong>
                <br /><br />
                <strong>✅ Solution:</strong> Instead of using <code>http://localhost:3000</code>, 
                access the app using the host's IP address: <code>http://192.168.0.107:3000</code>
                <br /><br />
                Or enter the host IP below and we'll update the connection:
              </>
            ) : (
              <>
                <br /><br />
                Please ask the host for their IP address and enter it below.
              </>
            )}
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="IP Address"
            type="text"
            fullWidth
            variant="outlined"
            placeholder="e.g., 192.168.0.107"
            value={manualIP}
            onChange={(e) => {
              const value = e.target.value.trim();
              // Only allow valid IP format
              if (value === '' || /^(\d{1,3}\.){0,3}\d{0,3}$/.test(value)) {
                setManualIP(value);
              }
            }}
            helperText="Enter the host computer's IP address (e.g., 192.168.0.107)"
            error={manualIP && !/^(\d{1,3}\.){3}\d{1,3}$/.test(manualIP)}
          />
          <Typography variant="caption" sx={{ mt: 2, display: 'block', color: 'text.secondary' }}>
            💡 To find the host IP: On host computer, run: <code>cd backend && node scripts/get-ip.js</code> or <code>ipconfig</code>
            {window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? (
              <><br /><strong style={{ color: '#d32f2f' }}>⚠️ After entering IP, you'll be redirected to: http://[HOST_IP]:3000</strong></>
            ) : null}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowIPDialog(false)}>Cancel</Button>
          <Button 
            onClick={async () => {
              if (!manualIP || !/^(\d{1,3}\.){3}\d{1,3}$/.test(manualIP)) {
                setError('Please enter a valid IP address (e.g., 192.168.0.107)');
                return;
              }
              
              // Store the IP
              setStoredBackendIP(manualIP);
              
              // Test connection
              const testUrl = `http://${manualIP}:5000`;
              const { testBackendConnection } = await import('./config/network');
              const result = await testBackendConnection(testUrl);
              
              if (result.success) {
                setError('');
                setShowIPDialog(false);
                // Reconnect with new IP
                if (socket) {
                  socket.disconnect();
                }
                
                // If accessing via localhost, redirect to host IP
                const currentHostname = window.location.hostname;
                if (currentHostname === 'localhost' || currentHostname === '127.0.0.1') {
                  // Redirect to host IP for proper access
                  const currentPath = window.location.pathname;
                  const currentSearch = window.location.search;
                  window.location.href = `http://${manualIP}:3000${currentPath}${currentSearch}`;
                } else {
                  // Just update URL params for backend IP
                  window.location.search = `?backend_ip=${manualIP}`;
                }
              } else {
                setError(`Still cannot connect to ${testUrl}.\n\nPlease verify:\n1. Backend server is running on host (cd backend && npm start)\n2. IP address is correct (${manualIP})\n3. Firewall allows port 5000 on host\n4. Both devices are on the same network`);
              }
            }}
            variant="contained"
            disabled={!manualIP || !/^(\d{1,3}\.){3}\d{1,3}$/.test(manualIP)}
          >
            Connect
          </Button>
        </DialogActions>
      </Dialog>

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
