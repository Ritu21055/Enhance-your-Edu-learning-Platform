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
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { 
  ArrowBack,
  History,
  VideoCall,
  Group,
  Schedule,
  AccessTime,
  Description,
  CheckCircle,
  Cancel
} from '@mui/icons-material';
import '../css/MeetingsHistory.css';
import { getMeetings } from '../services/meetingsService';
import { deleteAllMeetingHistories, getMeetingNotes, getAllMeetingHistories } from '../services/meetingHistoryApi';
import MeetingNotes from '../components/MeetingNotes';

const MeetingsHistory = () => {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeetingNotes, setSelectedMeetingNotes] = useState(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [notesAvailability, setNotesAvailability] = useState(new Map()); // meetingId -> hasNotes

  // Load meetings data from backend API
  useEffect(() => {
    const loadMeetings = async () => {
      try {
        console.log('📋 Loading meeting histories from backend (optimized)...');
        // OPTIMIZATION: Use lightweight mode for faster initial load
        const histories = await getAllMeetingHistories({ lightweight: true });
        
        if (histories && histories.length > 0) {
          // Convert backend meeting history format to frontend meeting format
          const meetingsData = histories.map(history => {
            const meeting = history.meeting;
            const highlightReel = history.highlightReel;
            
            // Format date and time - handle invalid dates
            let createdAt;
            let dateString = meeting.createdAt;
            let timeString = 'Time not available';
            
            if (meeting.createdAt) {
              try {
                createdAt = new Date(meeting.createdAt);
                // Check if date is valid
                if (!isNaN(createdAt.getTime())) {
                  timeString = createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                } else {
                  console.warn('Invalid createdAt date:', meeting.createdAt);
                  dateString = meeting.createdAt; // Keep original string
                }
              } catch (error) {
                console.error('Error parsing createdAt:', error, meeting.createdAt);
                dateString = meeting.createdAt || 'Date not available';
              }
            } else {
              dateString = 'Date not available';
            }
            
            return {
              id: meeting.id,
              title: meeting.title || `Meeting ${meeting.id}`,
              date: dateString,
              time: timeString,
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
          
          // CRITICAL FIX: Deduplicate meetings by meeting ID (keep the most recent one)
          // Use original history data to get proper endedAt timestamp for comparison
          const meetingsMap = new Map();
          histories.forEach((history, index) => {
            const meeting = meetingsData[index];
            const existing = meetingsMap.get(meeting.id);
            
            // Use endedAt from history if available, otherwise use createdAt
            const currentEndTime = history.meeting?.endedAt || history.meeting?.createdAt;
            const existingEndTime = existing?.originalEndTime;
            
            if (!existing) {
              // Store original end time for comparison
              meeting.originalEndTime = currentEndTime;
              meetingsMap.set(meeting.id, meeting);
            } else {
              // Compare timestamps - keep the most recent one
              if (currentEndTime && existingEndTime) {
                const currentTime = new Date(currentEndTime).getTime();
                const existingTime = new Date(existingEndTime).getTime();
                if (currentTime > existingTime) {
                  meeting.originalEndTime = currentEndTime;
                  meetingsMap.set(meeting.id, meeting);
                }
              } else if (currentEndTime) {
                // If existing has no end time but current does, use current
                meeting.originalEndTime = currentEndTime;
                meetingsMap.set(meeting.id, meeting);
              }
            }
          });
          
          // Convert map back to array and sort by date (newest first)
          const uniqueMeetings = Array.from(meetingsMap.values())
            .map(m => {
              // Remove temporary originalEndTime property
              const { originalEndTime, ...meeting } = m;
              return meeting;
            })
            .sort((a, b) => {
              const dateA = new Date(a.date + ' ' + a.time);
              const dateB = new Date(b.date + ' ' + b.time);
              return dateB - dateA;
            });
          
          setMeetings(uniqueMeetings);
          console.log(`✅ Loaded ${uniqueMeetings.length} unique meetings from ${meetingsData.length} history files`);
          
          // Check notes availability in background (non-blocking)
          // Don't wait for this - load meetings first, then update notes status
          // Use uniqueMeetings instead of meetingsData to avoid duplicate checks
          (async () => {
            const availabilityMap = new Map();
            // Check notes in parallel for faster loading - only for unique meetings
            const notesChecks = uniqueMeetings.map(async (meeting) => {
              try {
                const notes = await getMeetingNotes(meeting.id);
                return { id: meeting.id, hasNotes: !!notes };
              } catch (error) {
                return { id: meeting.id, hasNotes: false };
              }
            });
            
            const results = await Promise.all(notesChecks);
            results.forEach(({ id, hasNotes }) => {
              availabilityMap.set(id, hasNotes);
            });
            setNotesAvailability(availabilityMap);
          })();
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

  const handleClearAll = async () => {
    // Confirm before deleting
    const confirmed = window.confirm('Are you sure you want to delete ALL meeting histories? This action cannot be undone.');
    if (!confirmed) {
      return;
    }
    
    setLoading(true);
    try {
      console.log('🗑️ Deleting all meeting histories...');
      const result = await deleteAllMeetingHistories();
      
      if (result.success) {
        console.log(`✅ Deleted ${result.deletedCount} meeting histories`);
        
        // IMPORTANT: Reload meetings from backend after deletion to ensure fresh data
        // This prevents showing old meetings that might still be cached
        try {
          const histories = await getAllMeetingHistories({ lightweight: true });
          
          if (histories && histories.length > 0) {
            // Convert backend format to frontend format (same as in useEffect)
            const meetingsData = histories.map(history => {
              const meeting = history.meeting;
              const highlightReel = history.highlightReel;
              
              let dateString = meeting.createdAt;
              let timeString = 'Time not available';
              
              if (meeting.createdAt) {
                try {
                  const createdAt = new Date(meeting.createdAt);
                  if (!isNaN(createdAt.getTime())) {
                    timeString = createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  } else {
                    dateString = meeting.createdAt;
                  }
                } catch (error) {
                  dateString = meeting.createdAt || 'Date not available';
                }
              } else {
                dateString = 'Date not available';
              }
              
              return {
                id: meeting.id,
                title: meeting.title || `Meeting ${meeting.id}`,
                date: dateString,
                time: timeString,
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
            
            // Deduplicate meetings (same logic as in useEffect)
            const meetingsMap = new Map();
            histories.forEach((history, index) => {
              const meeting = meetingsData[index];
              const existing = meetingsMap.get(meeting.id);
              const currentEndTime = history.meeting?.endedAt || history.meeting?.createdAt;
              const existingEndTime = existing?.originalEndTime;
              
              if (!existing) {
                meeting.originalEndTime = currentEndTime;
                meetingsMap.set(meeting.id, meeting);
              } else {
                if (currentEndTime && existingEndTime) {
                  const currentTime = new Date(currentEndTime).getTime();
                  const existingTime = new Date(existingEndTime).getTime();
                  if (currentTime > existingTime) {
                    meeting.originalEndTime = currentEndTime;
                    meetingsMap.set(meeting.id, meeting);
                  }
                } else if (currentEndTime) {
                  meeting.originalEndTime = currentEndTime;
                  meetingsMap.set(meeting.id, meeting);
                }
              }
            });
            
            const uniqueMeetings = Array.from(meetingsMap.values())
              .map(m => {
                const { originalEndTime, ...meeting } = m;
                return meeting;
              })
              .sort((a, b) => {
                const dateA = new Date(a.date + ' ' + a.time);
                const dateB = new Date(b.date + ' ' + b.time);
                return dateB - dateA;
              });
            
            setMeetings(uniqueMeetings);
            console.log(`✅ Reloaded ${uniqueMeetings.length} unique meetings after deletion`);
          } else {
            // No meetings found - clear state
            setMeetings([]);
            setNotesAvailability(new Map());
            console.log('✅ All meetings deleted, state cleared');
          }
        } catch (reloadError) {
          console.error('⚠️ Error reloading meetings after deletion:', reloadError);
          // Still clear the state even if reload fails
          setMeetings([]);
          setNotesAvailability(new Map());
        }
        
        // Show success message
        alert(`Successfully deleted ${result.deletedCount} meeting history file(s).`);
      } else {
        console.error('❌ Failed to delete all meetings:', result.message);
        // Show more detailed error message
        const errorMsg = result.message || 'Unknown error occurred';
        alert(`Failed to delete all meetings.\n\nError: ${errorMsg}\n\nPlease check:\n1. Backend server is running\n2. Network connection is active\n3. Console for more details.`);
      }
    } catch (error) {
      console.error('❌ Error deleting all meetings:', error);
      const errorMsg = error.message || 'Unknown error occurred';
      let userMessage = `Error deleting all meetings.\n\n${errorMsg}`;
      
      if (errorMsg.includes('Failed to fetch') || error.name === 'TypeError') {
        userMessage = `Failed to connect to server.\n\nPlease make sure:\n1. Backend server is running on port 5000\n2. Check the backend URL in network config\n3. Check console for more details.`;
      }
      
      alert(`${userMessage}\n\nPlease check the console for more details.`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      // OPTIMIZATION: Use lightweight mode for faster refresh
      const histories = await getAllMeetingHistories({ lightweight: true });
      
      if (histories && histories.length > 0) {
        const meetingsData = histories.map(history => {
          const meeting = history.meeting;
          const highlightReel = history.highlightReel;
          
          // Format date and time - handle invalid dates
          let dateString = meeting.createdAt;
          let timeString = 'Time not available';
          
          if (meeting.createdAt) {
            try {
              const createdAt = new Date(meeting.createdAt);
              // Check if date is valid
              if (!isNaN(createdAt.getTime())) {
                timeString = createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              } else {
                console.warn('Invalid createdAt date:', meeting.createdAt);
                dateString = meeting.createdAt; // Keep original string
              }
            } catch (error) {
              console.error('Error parsing createdAt:', error, meeting.createdAt);
              dateString = meeting.createdAt || 'Date not available';
            }
          } else {
            dateString = 'Date not available';
          }
          
          return {
            id: meeting.id,
            title: meeting.title || `Meeting ${meeting.id}`,
            date: dateString,
            time: timeString,
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
        
        // CRITICAL FIX: Deduplicate meetings by meeting ID (keep the most recent one)
        // Use original history data to get proper endedAt timestamp for comparison
        const meetingsMap = new Map();
        histories.forEach((history, index) => {
          const meeting = meetingsData[index];
          const existing = meetingsMap.get(meeting.id);
          
          // Use endedAt from history if available, otherwise use createdAt
          const currentEndTime = history.meeting?.endedAt || history.meeting?.createdAt;
          const existingEndTime = existing?.originalEndTime;
          
          if (!existing) {
            // Store original end time for comparison
            meeting.originalEndTime = currentEndTime;
            meetingsMap.set(meeting.id, meeting);
          } else {
            // Compare timestamps - keep the most recent one
            if (currentEndTime && existingEndTime) {
              const currentTime = new Date(currentEndTime).getTime();
              const existingTime = new Date(existingEndTime).getTime();
              if (currentTime > existingTime) {
                meeting.originalEndTime = currentEndTime;
                meetingsMap.set(meeting.id, meeting);
              }
            } else if (currentEndTime) {
              // If existing has no end time but current does, use current
              meeting.originalEndTime = currentEndTime;
              meetingsMap.set(meeting.id, meeting);
            }
          }
        });
        
        // Convert map back to array and sort by date (newest first)
        const uniqueMeetings = Array.from(meetingsMap.values())
          .map(m => {
            // Remove temporary originalEndTime property
            const { originalEndTime, ...meeting } = m;
            return meeting;
          })
          .sort((a, b) => {
            const dateA = new Date(a.date + ' ' + a.time);
            const dateB = new Date(b.date + ' ' + b.time);
            return dateB - dateA;
          });
        
        setMeetings(uniqueMeetings);
        console.log(`✅ Refreshed ${uniqueMeetings.length} unique meetings from ${meetingsData.length} history files`);
        
        // Check notes availability in background (non-blocking)
        // Use uniqueMeetings instead of meetingsData to avoid duplicate checks
        (async () => {
          const availabilityMap = new Map();
          // Check notes in parallel for faster loading - only for unique meetings
          const notesChecks = uniqueMeetings.map(async (meeting) => {
            try {
              const notes = await getMeetingNotes(meeting.id);
              return { id: meeting.id, hasNotes: !!notes };
            } catch (error) {
              return { id: meeting.id, hasNotes: false };
            }
          });
          
          const results = await Promise.all(notesChecks);
          results.forEach(({ id, hasNotes }) => {
            availabilityMap.set(id, hasNotes);
          });
          setNotesAvailability(availabilityMap);
        })();
      } else {
        // No meetings found - clear state
        setMeetings([]);
        setNotesAvailability(new Map());
      }
    } catch (error) {
      console.error('❌ Error refreshing meetings:', error);
      // On error, clear meetings
      setMeetings([]);
      setNotesAvailability(new Map());
    } finally {
      setLoading(false);
    }
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
    if (!dateString) {
      return 'Date not available';
    }
    
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date string:', dateString);
        return 'Invalid Date';
      }
      
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error, dateString);
      return 'Invalid Date';
    }
  };

  const handleViewNotes = async (meetingId) => {
    setNotesLoading(true);
    setNotesError(null);
    setSelectedMeetingNotes(null);
    
    try {
      const notes = await getMeetingNotes(meetingId);
      if (notes) {
        setSelectedMeetingNotes(notes);
      } else {
        setNotesError('No meeting notes available for this meeting. Notes are automatically generated when a meeting ends with transcript data. This meeting may have ended before the notes feature was enabled, or it may not have had sufficient transcript data.');
      }
    } catch (error) {
      console.error('Error loading meeting notes:', error);
      setNotesError(`Failed to load meeting notes: ${error.message || 'Unknown error'}`);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleCloseNotes = () => {
    setSelectedMeetingNotes(null);
    setNotesError(null);
  };

  if (loading) {
    return (
      <Box className="history-page">
        <Container maxWidth="lg">
          <Box className="loading-container" sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '60vh',
            gap: 2
          }}>
            <Typography variant="h6" sx={{ color: 'white' }}>
              Loading meetings history...
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              This may take a few seconds
            </Typography>
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            onClick={handleRefresh}
            className="refresh-button"
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={handleClearAll}
            className="clear-all-button"
            disabled={loading || meetings.length === 0}
          >
            Clear All
          </Button>
        </Box>
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
                    <TableCell>Notes</TableCell>
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
                        <Box display="flex" alignItems="center" gap={1}>
                          {notesAvailability.get(meeting.id) ? (
                            <Chip
                              icon={<CheckCircle />}
                              label="Available"
                              color="success"
                              size="small"
                              sx={{ 
                                fontWeight: 600,
                                backgroundColor: 'rgba(76, 175, 80, 0.2)',
                                color: '#4caf50',
                                border: '1px solid #4caf50'
                              }}
                            />
                          ) : notesAvailability.get(meeting.id) === false ? (
                            <Chip
                              icon={<Cancel />}
                              label="Not Available"
                              color="default"
                              size="small"
                              sx={{ 
                                fontWeight: 500,
                                backgroundColor: 'rgba(158, 158, 158, 0.2)',
                                color: '#9e9e9e'
                              }}
                            />
                          ) : (
                            <Chip
                              label="Checking..."
                              size="small"
                              sx={{ 
                                fontWeight: 500,
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                color: 'rgba(255, 255, 255, 0.7)'
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box display="flex" gap={1} flexWrap="wrap">
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleViewNotes(meeting.id)}
                            className="view-notes-button"
                            startIcon={<Description />}
                            disabled={notesAvailability.get(meeting.id) === false}
                          >
                            View Notes
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => handleJoinMeeting(meeting.id)}
                            className="join-button"
                            startIcon={<VideoCall />}
                          >
                            Join Again
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Meeting Notes Dialog */}
        <Dialog
          open={selectedMeetingNotes !== null || notesLoading || notesError !== null}
          onClose={handleCloseNotes}
          maxWidth="lg"
          fullWidth
          PaperProps={{
            sx: {
              maxHeight: '90vh',
              backgroundColor: '#1a1a1a',
              color: 'white'
            }
          }}
        >
          <DialogTitle>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Meeting Notes</Typography>
              <IconButton onClick={handleCloseNotes} sx={{ color: 'white' }}>
                <ArrowBack />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent>
            <MeetingNotes
              notes={selectedMeetingNotes}
              loading={notesLoading}
              error={notesError}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseNotes} variant="contained">
              Close
            </Button>
          </DialogActions>
        </Dialog>

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
