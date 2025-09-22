import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent,
  Container,
  Grid,
  Avatar
} from '@mui/material';
import { 
  TrendingUp, 
  Lightbulb, 
  Bolt
} from '@mui/icons-material';
import '../css/LandingPage.css';

const LandingPage = () => {
  const navigate = useNavigate();

  const handleJoinAsGuest = () => {
    navigate('/home');
  };

  const handleRegister = () => {
    navigate('/register');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <Box className="landing-page">
      {/* Organic flowing shapes */}
      <div className="organic-shape organic-shape-1"></div>
      <div className="organic-shape organic-shape-2"></div>
      <div className="organic-shape organic-shape-3"></div>
      
      {/* Header Navigation */}
      <Box className="header-nav">
        <Box className="nav-links">
          <Button 
            variant="text" 
            className="nav-link"
            onClick={handleJoinAsGuest}
          >
            Join as Guest
          </Button>
          <Button 
            variant="text" 
            className="nav-link"
            onClick={handleRegister}
          >
            Register
          </Button>
          <Button 
            variant="text" 
            className="nav-link"
            onClick={handleLogin}
          >
            Login
          </Button>
        </Box>
      </Box>

      {/* Main Content */}
      <Container maxWidth="xl" className="main-content">
        <Grid container spacing={4} alignItems="center">
          {/* Left Side - Content */}
          <Grid item xs={12} md={6}>
            <Box className="content-wrapper">
              {/* Hero Section */}
              <Box className="hero-section">
                <Typography variant="h1" className="main-title">
                  <span className="highlight-orange">Enhance</span> Your Edu-<br/>
                  learning <span className="highlight-white">Echo</span> System
                </Typography>
                <Typography variant="h5" className="subtitle">
                  Unlock intelligent insights, empower collaborative learning
                </Typography>
              </Box>

              {/* Feature Cards */}
              <Box className="feature-cards">
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={4}>
                    <Card className="feature-card">
                      <CardContent className="feature-content">
                        <Avatar className="feature-icon blue">
                          <TrendingUp />
                        </Avatar>
                        <Typography variant="h6" className="feature-title">
                          Live Engagement Insights
                        </Typography>
                        <Typography variant="body2" className="feature-description">
                        Live feedback on audience engagement and understanding.
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={4}>
                    <Card className="feature-card">
                      <CardContent className="feature-content">
                        <Avatar className="feature-icon yellow">
                          <Lightbulb />
                        </Avatar>
                        <Typography variant="h6" className="feature-title">
                          AI-Powered Learning Assistance
                        </Typography>
                        <Typography variant="body2" className="feature-description">
                        Get smart questions from AI to guide the conversation.
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={4}>
                    <Card className="feature-card">
                      <CardContent className="feature-content">
                        <Avatar className="feature-icon orange">
                          <Bolt />
                        </Avatar>
                        <Typography variant="h6" className="feature-title">
                          Automated Meeting Productivity
                        </Typography>
                        <Typography variant="body2" className="feature-description">
                        Never miss a key moment with AI-powered meeting summaries.
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            </Box>
          </Grid>

          {/* Right Side - Phone Visualization */}
          <Grid item xs={12} md={6}>
            <Box className="visual-section">
              <Box className="phones-container">
                {/* Phone 1 */}
                <Box className="phone phone-1">
                  <Box className="phone-screen">
                    <Typography variant="caption" className="phone-status">
                      Connected
                    </Typography>
                    <Avatar className="phone-avatar">
                      <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50&h=50&fit=crop&crop=face" alt="User 1" />
                    </Avatar>
                    <Box className="phone-controls">
                      <div className="control-btn mic-btn"></div>
                      <div className="control-btn video-btn"></div>
                      <div className="control-btn hangup-btn"></div>
                    </Box>
                  </Box>
                </Box>

                {/* Phone 2 */}
                <Box className="phone phone-2">
                  <Box className="phone-screen">
                    <Typography variant="caption" className="phone-status">
                      Connected
                    </Typography>
                    <Avatar className="phone-avatar">
                      <img src="https://images.unsplash.com/photo-1494790108755-2616b612b786?w=50&h=50&fit=crop&crop=face" alt="User 2" />
                    </Avatar>
                    <Box className="phone-controls">
                      <div className="control-btn mic-btn"></div>
                      <div className="control-btn video-btn"></div>
                      <div className="control-btn hangup-btn"></div>
                    </Box>
                  </Box>
                </Box>

                {/* Phone 3 - Main central phone */}
                <Box className="phone phone-3">
                  <Box className="phone-screen">
                    <Typography variant="caption" className="phone-status">
                      Connected
                    </Typography>
                    <Avatar className="phone-avatar main-avatar">
                      <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=50&h=50&fit=crop&crop=face" alt="Main User" />
                    </Avatar>
                    <Box className="phone-controls">
                      <div className="control-btn mic-btn"></div>
                      <div className="control-btn video-btn"></div>
                      <div className="control-btn hangup-btn"></div>
                    </Box>
                  </Box>
                </Box>

                {/* Phone 4 */}
                <Box className="phone phone-4">
                  <Box className="phone-screen">
                    <Typography variant="caption" className="phone-status">
                      Connected
                    </Typography>
                    <Avatar className="phone-avatar">
                      <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=50&h=50&fit=crop&crop=face" alt="User 4" />
                    </Avatar>
                    <Box className="phone-controls">
                      <div className="control-btn mic-btn"></div>
                      <div className="control-btn video-btn"></div>
                      <div className="control-btn hangup-btn"></div>
                    </Box>
                  </Box>
                </Box>

                {/* Phone 5 */}
                <Box className="phone phone-5">
                  <Box className="phone-screen">
                    <Typography variant="caption" className="phone-status">
                      Connected
                    </Typography>
                    <Avatar className="phone-avatar">
                      <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=50&h=50&fit=crop&crop=face" alt="User 5" />
                    </Avatar>
                    <Box className="phone-controls">
                      <div className="control-btn mic-btn"></div>
                      <div className="control-btn video-btn"></div>
                      <div className="control-btn hangup-btn"></div>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default LandingPage;