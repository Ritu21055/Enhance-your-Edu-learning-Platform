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
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { 
  ArrowBack,
  History,
  VideoCall,
  Group,
  Schedule,
  AccessTime,
  PlayArrow,
  Star
} from '@mui/icons-material';
import '../css/MeetingsHistory.css';
import { getMeetings, getMeetingStats, clearAllMeetings } from '../services/meetingsService';

const MeetingsHistory = () => {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [highlightReels, setHighlightReels] = useState(new Map());
  const [expandedMeeting, setExpandedMeeting] = useState(null);

  // Load meetings data from service
  useEffect(() => {
    const loadMeetings = () => {
      try {
        // Clear old test data on first load
        const meetingsData = getMeetings();
        if (meetingsData.length > 10) {
          console.log('Clearing old test data...');
          clearAllMeetings();
          setMeetings([]);
          setHighlightReels(new Map());
          return;
        }
        
        setMeetings(meetingsData);
        
        // Mock highlight reel data for testing
        const mockHighlightReels = new Map();
        if (meetingsData.length > 0) {
          // Add highlight reel for first meeting as example
          mockHighlightReels.set(meetingsData[0].id, {
            url: 'http://localhost:5000/output/edu_learning_highlights.mp4',
            highlightCount: 5,
            duration: '30 seconds',
            status: 'success'
          });
        }
        setHighlightReels(mockHighlightReels);
        
      } catch (error) {
        console.error('Error loading meetings:', error);
        setMeetings([]);
      } finally {
        setLoading(false);
      }
    };

    // Simulate loading for better UX
    setTimeout(loadMeetings, 500);
  }, []);

  const handleBack = () => {
    navigate('/home');
  };

  const handleJoinMeeting = (meetingId) => {
    navigate(`/lobby?meetingId=${meetingId}`);
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      // Clear all meetings and reload
      clearAllMeetings();
      const meetingsData = getMeetings();
      setMeetings(meetingsData);
      setHighlightReels(new Map()); // Clear highlight reels too
      setLoading(false);
    }, 300);
  };

  const handlePlayHighlightReel = (meetingId) => {
    const highlightReel = highlightReels.get(meetingId);
    if (highlightReel) {
      // Open highlight reel in new tab or modal
      window.open(highlightReel.url, '_blank');
    }
  };

  const handleToggleExpanded = (meetingId) => {
    setExpandedMeeting(expandedMeeting === meetingId ? null : meetingId);
  };

  const hasHighlightReel = (meetingId) => {
    return highlightReels.has(meetingId);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'ongoing':
        return 'warning';
      case 'scheduled':
        return 'info';
      default:
        return 'default';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Box className="history-page">
        <Container maxWidth="lg">
          <Box className="loading-container">
            <Typography variant="h6">Loading meetings history...</Typography>
          </Box>
        </Container>
      </Box>
    );
  }

  return (
    <Box className="history-page">
      {/* Header */}
      <Box className="history-header">
        <IconButton onClick={handleBack} className="back-button">
          <ArrowBack />
        </IconButton>
        <Box className="header-content">
          <History className="header-icon" />
          <Typography variant="h4" className="page-title">
            Meetings History
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={handleRefresh}
          className="refresh-button"
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      <Container maxWidth="lg" className="history-container">
        {/* Summary Cards */}
        <Grid container spacing={3} className="summary-cards">
          <Grid item xs={12} sm={6} md={3}>
            <Card className="summary-card">
              <CardContent>
                <Box className="summary-content">
                  <VideoCall className="summary-icon" />
                  <Box>
                    <Typography variant="h4" className="summary-number">
                      {meetings.length}
                    </Typography>
                    <Typography variant="body2" className="summary-label">
                      Total Meetings
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card className="summary-card">
              <CardContent>
                <Box className="summary-content">
                  <Group className="summary-icon" />
                  <Box>
                    <Typography variant="h4" className="summary-number">
                      {meetings.reduce((total, meeting) => total + meeting.participants, 0)}
                    </Typography>
                    <Typography variant="body2" className="summary-label">
                      Total Participants
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card className="summary-card">
              <CardContent>
                <Box className="summary-content">
                  <Schedule className="summary-icon" />
                  <Box>
                    <Typography variant="h4" className="summary-number">
                      {meetings.filter(m => m.status === 'completed').length}
                    </Typography>
                    <Typography variant="body2" className="summary-label">
                      Completed
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} sm={6} md={3}>
            <Card className="summary-card">
              <CardContent>
                <Box className="summary-content">
                  <AccessTime className="summary-icon" />
                  <Box>
                    <Typography variant="h4" className="summary-number">
                      {meetings.reduce((total, meeting) => total + (meeting.duration || 0), 0)} min
                    </Typography>
                    <Typography variant="body2" className="summary-label">
                      Total Duration
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>



        {/* Meetings Table - Show when there are meetings */}
        {meetings.length > 0 && (
          <Paper className="meetings-table-container" elevation={2}>
            <Box className="table-header">
              <Typography variant="h6" className="table-title">
                Recent Meetings
              </Typography>
            </Box>
            
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Meeting ID</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Date & Time</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Participants</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Highlights</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {meetings.map((meeting) => (
                    <TableRow key={meeting.id} className="meeting-row">
                      <TableCell>
                        <Typography variant="body2" className="meeting-id">
                          {meeting.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body1" className="meeting-title">
                          {meeting.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" className="meeting-date">
                            {formatDate(meeting.date)}
                          </Typography>
                          <Typography variant="caption" className="meeting-time">
                            {meeting.time}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {meeting.status === 'ongoing' ? 'Ongoing' : `${meeting.duration || 0} min`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {meeting.participants} people
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={meeting.status} 
                          color={getStatusColor(meeting.status)}
                          size="small"
                          className="status-chip"
                        />
                      </TableCell>
                      <TableCell>
                        {hasHighlightReel(meeting.id) ? (
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => handlePlayHighlightReel(meeting.id)}
                            className="highlight-button"
                            startIcon={<PlayArrow />}
                            color="warning"
                          >
                            {highlightReels.get(meeting.id)?.status === 'mock' ? 'View Demo' : 'Watch Highlights'}
                          </Button>
                        ) : (
                          <Chip
                            icon={<Star />}
                            label="No Highlights"
                            size="small"
                            variant="outlined"
                            className="no-highlights-chip"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleJoinMeeting(meeting.id)}
                          className="join-button"
                          startIcon={<VideoCall />}
                        >
                          Join Again
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* No Meetings Message - Show when there are no meetings */}
        {meetings.length === 0 && (
          <Box className="no-meetings">
            <Typography variant="h4" className="no-meetings-title">
              No Meetings Yet
            </Typography>
            <Typography variant="h6" className="no-meetings-subtitle">
              You haven't joined any meetings yet
            </Typography>
            <Typography variant="body1" className="no-meetings-description">
              Once you join meetings through the home page, they will appear here with detailed information including meeting duration, participants, and the ability to rejoin.
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={handleBack}
              className="start-meeting-btn"
              startIcon={<VideoCall />}
            >
              Go to Home Page
            </Button>
          </Box>
        )}
      </Container>
    </Box>
  );
};

export default MeetingsHistory;
