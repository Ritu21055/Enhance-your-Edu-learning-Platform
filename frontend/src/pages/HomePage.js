import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent,
  Container,
  Grid,
  TextField
} from '@mui/material';
import { 
  History,
  Logout,
  Person,
  Refresh
} from '@mui/icons-material';
import '../css/HomePage.css';
import { isAuthenticated, clearAuthentication, debugAuthState } from '../services/authService';
import { generateUniqueMeetingCode } from '../services/meetingCodeService';

const HomePage = () => {
  const navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState('');
  const [isUserAuthenticated, setIsUserAuthenticated] = useState(false);

  // Check authentication status on component mount
  useEffect(() => {
    const checkAuth = () => {
      const authenticated = isAuthenticated();
      setIsUserAuthenticated(authenticated);
    };
    
    checkAuth();
  }, []);

  const handleJoinMeeting = () => {
    if (meetingCode.trim()) {
      navigate(`/lobby/${meetingCode.trim()}`);
    }
  };

  const handleHistory = () => {
    navigate('/history');
  };

  const handleLogout = () => {
    // Clear authentication and navigate to landing page
    clearAuthentication();
    setIsUserAuthenticated(false);
    navigate('/');
  };


  return (
    <Box className="home-page">
      {/* Header with purple gradient */}
      <Box className="app-header">
        <Typography variant="h6" className="header-title">
          Enhance your Edu-learning Ecosystem
        </Typography>
        <Box className="header-buttons">
          <Button 
            variant="contained" 
            className="header-btn history-btn"
            onClick={handleHistory}
            startIcon={<History />}
          >
            History
          </Button>
          {/* Only show logout button if user is authenticated */}
          {isUserAuthenticated && (
            <>
              <Button 
                variant="outlined" 
                className="header-btn debug-btn"
                onClick={debugAuthState}
                size="small"
              >
                Debug Auth
              </Button>
              <Button 
                variant="contained" 
                className="header-btn logout-btn"
                onClick={handleLogout}
                startIcon={<Logout />}
              >
                Logout
            </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Main Content */}
      <Container maxWidth="xl" className="main-content">
        <Grid container spacing={4} alignItems="flex-start">
          {/* Left Side - Content */}
          <Grid item xs={12} md={6}>
            <Box className="content-wrapper">
              {/* Hero Section */}
              <Box className="hero-section">
                <Typography variant="h2" className="main-title">
                  Transforming Edu-learning with AI-Powered Real-time Insights
                </Typography>
                <Typography variant="h6" className="subtitle">
                  Join virtual classrooms, collaborate in real-time, and experience the future of education with our advanced video conferencing platform.
                </Typography>
              </Box>

              {/* Join Meeting Card */}
              <Box className="join-meeting-section">
                <Card className="join-meeting-card">
                  <CardContent className="join-meeting-content">
                    <Typography variant="h5" className="join-meeting-title">
                      Join a Meeting
                    </Typography>
                    <Box className="meeting-input-container">
                      <Box className="meeting-code-input-wrapper">
                        <TextField
                          fullWidth
                          variant="outlined"
                          placeholder="Enter meeting code (e.g., ABC123)"
                          value={meetingCode}
                          onChange={(e) => setMeetingCode(e.target.value)}
                          className="meeting-code-input"
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => {
                            const newCode = generateUniqueMeetingCode();
                            setMeetingCode(newCode);
                          }}
                          className="generate-code-btn"
                          title="Generate meeting code"
                        >
                          <Refresh />
                        </Button>
                      </Box>
                      <Button
                        variant="contained"
                        size="large"
                        onClick={handleJoinMeeting}
                        disabled={!meetingCode.trim()}
                        className="join-meeting-btn"
                      >
                        Join Meeting
                      </Button>
                    </Box>
                    <Typography variant="body2" className="meeting-instruction">
                      Enter the meeting code provided by your instructor or meeting host.
                    </Typography>
                  </CardContent>
                </Card>
              </Box>

            </Box>
          </Grid>

          {/* Right Side - Phone Illustration */}
          <Grid item xs={12} md={6}>
            <Box className="phone-illustration-section">
              <Card className="phone-illustration-card">
                <CardContent className="phone-illustration-content">
                  <Box className="phone-container">
                    <Box className="phone-device">
                      <Box className="phone-screen">
                        <Box className="video-call-frame">
                          <Person className="video-call-person" />
                        </Box>
                      </Box>
                    </Box>
                    <Box className="person-standing">
                      <Person className="standing-person" />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default HomePage;
