import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Grid,
  Paper,
  Divider
} from '@mui/material';
import {
  SentimentSatisfied,
  SentimentDissatisfied,
  SentimentNeutral,
  SentimentVeryDissatisfied,
  SentimentVerySatisfied,
  Psychology,
  HelpOutline,
  EmojiEmotions,
  MoodBad,
  Favorite,
  ThumbUp,
  ThumbDown
} from '@mui/icons-material';

const SentimentDashboard = ({ sentimentData, isVisible }) => {
  console.log('📊 SentimentDashboard render:', { isVisible, sentimentData });
  
  if (!isVisible) {
    console.log('📊 Dashboard not visible, returning null');
    return null;
  }
  
  // Hide dashboard when no participants (no sentiment data)
  if (!sentimentData) {
    console.log('📊 No sentiment data yet, hiding dashboard');
    return null;
  }

  const { sentimentCounts, totalParticipants, lastUpdated } = sentimentData;

  // Sentiment configuration with colors and icons
  const sentimentConfig = {
    happy: {
      label: 'Happy',
      color: '#4caf50',
      icon: <SentimentVerySatisfied />,
      bgColor: 'rgba(76, 175, 80, 0.1)'
    },
    excited: {
      label: 'Excited',
      color: '#ff9800',
      icon: <EmojiEmotions />,
      bgColor: 'rgba(255, 152, 0, 0.1)'
    },
    neutral: {
      label: 'Neutral',
      color: '#9e9e9e',
      icon: <SentimentNeutral />,
      bgColor: 'rgba(158, 158, 158, 0.1)'
    },
    confused: {
      label: 'Confused',
      color: '#ff5722',
      icon: <HelpOutline />,
      bgColor: 'rgba(255, 87, 34, 0.1)'
    },
    surprised: {
      label: 'Surprised',
      color: '#9c27b0',
      icon: <EmojiEmotions />,
      bgColor: 'rgba(156, 39, 176, 0.1)'
    },
    disgusted: {
      label: 'Disgusted',
      color: '#795548',
      icon: <MoodBad />,
      bgColor: 'rgba(121, 85, 72, 0.1)'
    },
    sad: {
      label: 'Sad',
      color: '#2196f3',
      icon: <SentimentDissatisfied />,
      bgColor: 'rgba(33, 150, 243, 0.1)'
    },
    angry: {
      label: 'Angry',
      color: '#f44336',
      icon: <SentimentVeryDissatisfied />,
      bgColor: 'rgba(244, 67, 54, 0.1)'
    },
    // Additional sentiments for future expansion
    interested: {
      label: 'Interested',
      color: '#00bcd4',
      icon: <Favorite />,
      bgColor: 'rgba(0, 188, 212, 0.1)'
    },
    engaged: {
      label: 'Engaged',
      color: '#8bc34a',
      icon: <ThumbUp />,
      bgColor: 'rgba(139, 195, 74, 0.1)'
    },
    bored: {
      label: 'Bored',
      color: '#607d8b',
      icon: <ThumbDown />,
      bgColor: 'rgba(96, 125, 139, 0.1)'
    },
    tired: {
      label: 'Tired',
      color: '#795548',
      icon: <MoodBad />,
      bgColor: 'rgba(121, 85, 72, 0.1)'
    },
    frustrated: {
      label: 'Frustrated',
      color: '#ff5722',
      icon: <SentimentVeryDissatisfied />,
      bgColor: 'rgba(255, 87, 34, 0.1)'
    },
    annoyed: {
      label: 'Annoyed',
      color: '#e91e63',
      icon: <MoodBad />,
      bgColor: 'rgba(233, 30, 99, 0.1)'
    },
    worried: {
      label: 'Worried',
      color: '#ff9800',
      icon: <HelpOutline />,
      bgColor: 'rgba(255, 152, 0, 0.1)'
    },
    stressed: {
      label: 'Stressed',
      color: '#d32f2f',
      icon: <SentimentVeryDissatisfied />,
      bgColor: 'rgba(211, 47, 47, 0.1)'
    },
    fearful: {
      label: 'Fearful',
      color: '#673ab7',
      icon: <HelpOutline />,
      bgColor: 'rgba(103, 58, 183, 0.1)'
    },
    // Backend sentiment mappings
    positive: {
      label: 'Positive',
      color: '#4caf50',
      icon: <SentimentVerySatisfied />,
      bgColor: 'rgba(76, 175, 80, 0.1)'
    },
    negative: {
      label: 'Negative',
      color: '#f44336',
      icon: <SentimentVeryDissatisfied />,
      bgColor: 'rgba(244, 67, 54, 0.1)'
    },
    // Additional fatigue-related emotions
    fearful: {
      label: 'Fearful',
      color: '#ff9800',
      icon: <MoodBad />,
      bgColor: 'rgba(255, 152, 0, 0.1)'
    }
  };

  // Calculate percentages
  const getPercentage = (count) => {
    return totalParticipants > 0 ? Math.round((count / totalParticipants) * 100) : 0;
  };

  // Get overall engagement level
  const getEngagementLevel = () => {
    const positiveSentiments = (sentimentCounts.happy || 0) + (sentimentCounts.surprised || 0) + (sentimentCounts.positive || 0);
    const negativeSentiments = (sentimentCounts.sad || 0) + (sentimentCounts.angry || 0) + (sentimentCounts.disgusted || 0) + (sentimentCounts.fearful || 0) + (sentimentCounts.negative || 0);
    const neutralCount = (sentimentCounts.neutral || 0);
    
    if (positiveSentiments > negativeSentiments + neutralCount) {
      return { level: 'High', color: '#4caf50' };
    } else if (negativeSentiments > positiveSentiments + neutralCount) {
      return { level: 'Low', color: '#f44336' };
    } else {
      return { level: 'Medium', color: '#ff9800' };
    }
  };

  const engagement = getEngagementLevel();

  // Fatigue suggestions removed - now handled by popup notifications

  return (
    <Card sx={{ 
      maxWidth: 300, 
      width: '100%',
      position: 'fixed',
      top: 20,
      left: 20,
      zIndex: 1000,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      maxHeight: '60vh',
      overflow: 'auto',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
    }}>
      <CardContent sx={{ p: 2 }}>
        <Box display="flex" alignItems="center" mb={1}>
          <Psychology sx={{ mr: 1, fontSize: 20 }} />
          <Typography variant="h6" component="h2" fontWeight="bold">
            Sentiment Analysis
          </Typography>
        </Box>

        <Divider sx={{ bgcolor: 'rgba(255,255,255,0.3)', mb: 2 }} />

        {/* Engagement Level - Compact */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="body2" color="rgba(255,255,255,0.8)">
            Engagement: {engagement.level}
          </Typography>
          <Typography variant="body2" color="rgba(255,255,255,0.8)">
            {totalParticipants} participants
          </Typography>
        </Box>

        {/* Sentiment Distribution */}
        <Typography variant="subtitle1" gutterBottom>
          Sentiment Distribution
        </Typography>
        
        <Grid container spacing={0.5}>
          {Object.entries(sentimentCounts).map(([sentiment, count]) => {
            const config = sentimentConfig[sentiment];
            if (!config || count === 0) return null;

            return (
              <Grid item xs={6} key={sentiment}>
                <Paper sx={{ 
                  p: 0.5, 
                  bgcolor: config.bgColor,
                  border: `1px solid ${config.color}`,
                  textAlign: 'center'
                }}>
                  <Box display="flex" flexDirection="column" alignItems="center" gap={0.5}>
                    <Box color={config.color} sx={{ fontSize: 16 }}>
                      {config.icon}
                    </Box>
                    <Typography variant="h6" fontWeight="bold" color={config.color}>
                      {count}
                    </Typography>
                    <Typography variant="caption" color="rgba(255,255,255,0.8)" sx={{ fontSize: 10 }}>
                      {config.label}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>

        {/* Fatigue Suggestions - Removed to use popup notifications instead */}

        {/* Last Updated */}
        <Box mt={1} textAlign="center">
          <Typography variant="caption" color="rgba(255,255,255,0.7)">
            Updated: {new Date(lastUpdated).toLocaleTimeString()}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default SentimentDashboard;
