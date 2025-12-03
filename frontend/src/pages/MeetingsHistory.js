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
import { getMeetingHistory, getAllMeetingHistories } from '../services/meetingHistoryApi';

const MeetingsHistory = () => {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [highlightReels, setHighlightReels] = useState(new Map());
  const [expandedMeeting, setExpandedMeeting] = useState(null);

  // Load meetings data from backend API
  useEffect(() => {
    const loadMeetings = async () => {
      try {
        console.log('📋 Loading meeting histories from backend...');
        // Load meeting histories from backend API
        const histories = await getAllMeetingHistories();
        
        if (histories && histories.length > 0) {
          // Convert backend meeting history format to frontend meeting format
          const meetingsData = histories.map(history => {
            const meeting = history.meeting;
            const highlightReel = history.highlightReel;
            
            // Format date and time
            const createdAt = new Date(meeting.createdAt);
            const endedAt = meeting.endedAt ? new Date(meeting.endedAt) : createdAt;
            
            return {
              id: meeting.id,
              title: meeting.title || `Meeting ${meeting.id}`,
              date: meeting.createdAt,
              time: createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              duration: Math.round((meeting.duration || 0) / 1000 / 60), // Convert from ms to minutes
              participants: meeting.participants?.length || 0,
              status: meeting.status || 'completed',
              highlightReel: highlightReel ? {
                path: highlightReel.path,
                url: highlightReel.url,
                generatedAt: highlightReel.generatedAt,
                highlightCount: highlightReel.highlightCount || history.highlights?.total || 0
              } : null,
              highlights: history.highlights?.total || 0,
              recording: history.recording,
              transcript: history.transcript?.totalEntries || 0
            };
          });
          
          setMeetings(meetingsData);
          console.log(`✅ Loaded ${meetingsData.length} meetings from backend`);
        } else {
          // Fallback to local meetings if backend has no data
          const localMeetings = getMeetings();
          setMeetings(localMeetings);
          console.log(`⚠️ No backend history found, using ${localMeetings.length} local meetings`);
        }
        
      } catch (error) {
        console.error('❌ Error loading meeting histories:', error);
        // Fallback to local meetings on error
        try {
          const localMeetings = getMeetings();
          setMeetings(localMeetings);
        } catch (localError) {
          console.error('❌ Error loading local meetings:', localError);
          setMeetings([]);
        }
      } finally {
        setLoading(false);
      }
    };

    loadMeetings();
  }, []);

  const handleBack = () => {
    navigate('/home');
  };

  const handleJoinMeeting = (meetingId) => {
    console.log('🔄 Rejoining meeting from history:', meetingId);
    navigate(`/lobby/${meetingId}`);
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      // Reload from backend API
      const histories = await getAllMeetingHistories();
      
      if (histories && histories.length > 0) {
        const meetingsData = histories.map(history => {
          const meeting = history.meeting;
          const highlightReel = history.highlightReel;
          const createdAt = new Date(meeting.createdAt);
          
          return {
            id: meeting.id,
            title: meeting.title || `Meeting ${meeting.id}`,
            date: meeting.createdAt,
            time: createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            duration: Math.round((meeting.duration || 0) / 1000 / 60),
            participants: meeting.participants?.length || 0,
            status: meeting.status || 'completed',
            highlightReel: highlightReel ? {
              path: highlightReel.path,
              url: highlightReel.url,
              generatedAt: highlightReel.generatedAt,
              highlightCount: highlightReel.highlightCount || history.highlights?.total || 0
            } : null,
            highlights: history.highlights?.total || 0,
            recording: history.recording,
            transcript: history.transcript?.totalEntries || 0
          };
        });
        
        setMeetings(meetingsData);
        setHighlightReels(new Map());
      } else {
        // Fallback to local meetings
        const localMeetings = getMeetings();
        setMeetings(localMeetings);
        setHighlightReels(new Map());
      }
    } catch (error) {
      console.error('❌ Error refreshing meetings:', error);
      // Fallback to local meetings on error
      const localMeetings = getMeetings();
      setMeetings(localMeetings);
      setHighlightReels(new Map());
    } finally {
      setLoading(false);
    }
  };

  // Load highlight reel data for meetings
  const loadHighlightReelData = async (meetingId) => {
    try {
      const history = await getMeetingHistory(meetingId);
      if (history && history.highlightReel) {
        return history.highlightReel;
      }
    } catch (error) {
      console.error('Error loading highlight reel data:', error);
    }
    return null;
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
                        {meeting.highlightReel ? (
                          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                            <Chip
                              icon={<Star />}
                              label={`${meeting.highlightReel.highlightCount || meeting.highlights || 0} highlights`}
                              color="primary"
                              size="small"
                              className="highlights-chip"
                            />
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              startIcon={<PlayArrow />}
                              onClick={() => {
                                const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://192.168.0.108:5000';
                                // Construct URL: use provided URL or construct from filename/path
                                let reelUrl = meeting.highlightReel.url;
                                if (!reelUrl.startsWith('http')) {
                                  // Relative URL - prepend API base URL
                                  reelUrl = `${API_BASE_URL}${reelUrl}`;
                                } else if (meeting.highlightReel.filename) {
                                  // Construct from filename
                                  reelUrl = `${API_BASE_URL}/output/${meeting.highlightReel.filename}`;
                                } else if (meeting.highlightReel.path) {
                                  // Extract filename from path
                                  const filename = meeting.highlightReel.path.split(/[/\\]/).pop();
                                  reelUrl = `${API_BASE_URL}/output/${filename}`;
                                }
                                console.log('🎬 Opening highlight reel:', reelUrl);
                                window.open(reelUrl, '_blank');
                              }}
                            >
                              Play Reel
                            </Button>
                          </Box>
                        ) : meeting.highlights > 0 ? (
                          <Chip
                            icon={<Star />}
                            label={`${meeting.highlights} highlights (processing)`}
                            size="small"
                            color="warning"
                            variant="outlined"
                            className="highlights-chip"
                          />
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
