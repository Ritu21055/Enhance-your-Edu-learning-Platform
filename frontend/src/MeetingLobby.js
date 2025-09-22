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
import { getBackendUrl } from './config/network';
import { createMeeting, storeMeeting } from './services/meetingsService';
import { formatMeetingCode } from './services/meetingCodeService';
import './css/MeetingLobby.css';

const MeetingLobby = () => {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [username, setUsername] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  
  // Use ref to store username persistently
  const usernameRef = useRef('');
  
  // Preserve meeting title when switching roles
  const meetingTitleRef = useRef('');
  
  // Update meeting title ref when meeting title changes
  useEffect(() => {
    meetingTitleRef.current = meetingTitle;
  }, [meetingTitle]);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(getBackendUrl());
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    // Add debugging for all socket events
    const originalEmit = newSocket.emit;
    newSocket.emit = function(event, ...args) {
      console.log('🔍 Lobby emitting:', event, args);
      return originalEmit.call(this, event, ...args);
    };


    newSocket.on('meeting-joined', (data) => {
      console.log('Meeting joined received:', data);
      console.log('🔍 Lobby: isHost from server:', data.isHost);
      setMeetingInfo(data);
      
      if (data.isHost) {
        // If user is host, set host state and clear waiting state
        setIsHost(true);
        setIsWaiting(false); // Clear waiting state for hosts
        
        // Use ref to get the most current username value
        const currentUsername = usernameRef.current || username;
        console.log('🔍 Lobby: Host detected, navigating with username:', currentUsername);
        console.log('🔍 Lobby: Username from ref:', usernameRef.current);
        console.log('🔍 Lobby: Username from state:', username);
        console.log('🔍 Lobby: Username length:', currentUsername?.length);
        
        // Ensure username is not empty
        if (!currentUsername || currentUsername.trim() === '') {
          console.error('❌ Lobby: Username is empty, cannot navigate!');
          setError('Username is required to join as host');
      return;
    }
    
        // Double-check username before navigation
        const finalUsername = currentUsername.trim();
        console.log('🔍 Lobby: Final username for navigation:', finalUsername);
        
        localStorage.setItem(`approved_${meetingId}`, 'true');
        
        // Store meeting in history with proper title
        const titleForStorage = meetingTitleRef.current || meetingTitle;
        console.log('🔍 Lobby: Creating meeting with title:', titleForStorage);
        console.log('🔍 Lobby: Meeting title trimmed:', titleForStorage.trim());
        console.log('🔍 Lobby: Meeting title length:', titleForStorage.trim().length);
        
        const finalMeetingTitle = titleForStorage.trim() || `Meeting ${meetingId}`;
        console.log('🔍 Lobby: Final meeting title:', finalMeetingTitle);
        
        const meeting = createMeeting(meetingId, finalMeetingTitle, [finalUsername]);
        storeMeeting(meeting);
        
        navigate(`/meeting/${meetingId}?user=${finalUsername}&approved=true&host=true`);
      } else {
        // If user is participant, show waiting message
        setIsWaiting(true);
        setIsHost(false); // Ensure host state is cleared for participants
      }
    });

    newSocket.on('waiting-for-approval', (data) => {
      console.log('Waiting for approval:', data);
      // Only set waiting if user is not a host
      if (!isHost) {
        setIsWaiting(true);
      }
    });

    newSocket.on('participant-approved', (data) => {
      console.log('Participant approved:', data);
      // Set approval flag in localStorage
      localStorage.setItem(`approved_${meetingId}`, 'true');
      
      // Use ref to get the most current username value
      const currentUsername = usernameRef.current || username;
      console.log('🔍 Participant approved - navigating with username:', currentUsername);
      
      // Ensure we have a valid username
      if (!currentUsername || currentUsername.trim() === '') {
        console.error('❌ No username available for participant approval!');
        console.log('🔍 Available data:', { 
          usernameRef: usernameRef.current, 
          usernameState: username,
          hasJoined: hasJoined 
        });
        // Use a fallback or show error
        alert('Error: Username not found. Please refresh and try again.');
        return;
      }
      
      // Navigate to meeting room when approved
      navigate(`/meeting/${meetingId}?user=${currentUsername.trim()}&approved=true`);
    });

    newSocket.on('participant-rejected', () => {
      console.log('Participant rejected');
      alert('You have been rejected from the meeting');
      navigate('/');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
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
    
    socket.emit('join-meeting', { 
      meetingId, 
      userName: trimmedUsername,
      meetingTitle: meetingTitleToSend
      // Backend will determine if user becomes host based on being first participant
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
                  setUsername(value);
                  usernameRef.current = value; // Also store in ref
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
          ) : isWaiting ? (
            // Waiting for Approval
            <>
              <Box className="lobby-waiting-container">
                <CircularProgress size={24} />
                <Typography variant="body1" className="lobby-waiting-text">
                  Waiting for host approval...
                </Typography>
              </Box>

              <Chip
                label="Waiting for Approval"
                className="lobby-waiting-chip"
              />

              <Typography variant="body2" className="lobby-waiting-description">
                The host will review your request and approve you to join the meeting.
              </Typography>
            </>
          ) : (
            // Connecting to Meeting
            <Typography variant="body1" className="lobby-connecting-text">
              Connecting to meeting...
            </Typography>
          )}

          {isHost && hasJoined && !isWaiting && (
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
              </Box>
          )}
        </CardContent>
      </Card>
      </Box>
  );
};

export default MeetingLobby;
