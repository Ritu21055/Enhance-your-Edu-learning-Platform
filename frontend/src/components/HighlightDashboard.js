import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
  Collapse
} from '@mui/material';
import {
  Star,
  Gavel,
  Assignment,
  Help,
  Summarize,
  ExpandMore,
  ExpandLess,
  Timeline,
  PlayArrow
} from '@mui/icons-material';
import '../css/HighlightDashboard.css';

const HighlightDashboard = ({ 
  highlights = [], 
  meetingDuration = 0,
  onPlayHighlight,
  isExpanded = false,
  onToggleExpanded 
}) => {
  const [highlightStats, setHighlightStats] = useState({
    total: 0,
    byType: {},
    timeline: []
  });

  useEffect(() => {
    if (highlights.length === 0) return;

    // Calculate statistics
    const stats = {
      total: highlights.length,
      byType: {},
      timeline: []
    };

    // Count by type
    highlights.forEach(highlight => {
      const type = highlight.type || 'general';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });

    // Create timeline
    stats.timeline = highlights
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((highlight, index) => ({
        ...highlight,
        index: index + 1,
        timeInMeeting: Math.floor((highlight.timestamp - (Date.now() - meetingDuration)) / 1000 / 60)
      }));

    setHighlightStats(stats);
  }, [highlights, meetingDuration]);

  const getTypeIcon = (type) => {
    switch (type) {
      case 'important': return <Star />;
      case 'decision': return <Gavel />;
      case 'action': return <Assignment />;
      case 'question': return <Help />;
      case 'summary': return <Summarize />;
      default: return <Star />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'important': return '#FFD700';
      case 'decision': return '#4CAF50';
      case 'action': return '#2196F3';
      case 'question': return '#FF9800';
      case 'summary': return '#9C27B0';
      default: return '#757575';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'important': return 'Important';
      case 'decision': return 'Decisions';
      case 'action': return 'Actions';
      case 'question': return 'Questions';
      case 'summary': return 'Summaries';
      case 'auto_engagement': return 'Auto-Engagement';
      case 'auto_question': return 'Auto-Questions';
      case 'auto_meeting_start': return 'Meeting Start';
      case 'auto_meeting_end': return 'Meeting End';
      default: return 'General';
    }
  };

  const calculateCoverage = () => {
    if (meetingDuration === 0) return 0;
    const expectedHighlights = Math.max(1, Math.floor(meetingDuration / 300000)); // 1 per 5 minutes
    return Math.min(100, (highlightStats.total / expectedHighlights) * 100);
  };

  const coverage = calculateCoverage();
  const coverageColor = coverage >= 80 ? '#4CAF50' : coverage >= 50 ? '#FF9800' : '#F44336';

  return (
    <Paper className="highlight-dashboard" elevation={3}>
      <Box className="dashboard-header">
        <Box className="dashboard-title">
          <Timeline className="dashboard-icon" />
          <Typography variant="h6" className="dashboard-title-text">
            Highlight Dashboard
          </Typography>
        </Box>
        <IconButton
          onClick={onToggleExpanded}
          className="expand-button"
          size="small"
        >
          {isExpanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      {/* Summary Stats */}
      <Box className="dashboard-summary">
        <Box className="summary-item">
          <Typography variant="h4" className="summary-number">
            {highlightStats.total}
          </Typography>
          <Typography variant="body2" className="summary-label">
            Total Highlights
          </Typography>
        </Box>
        
        <Box className="summary-item">
          <Typography variant="h4" className="summary-number" style={{ color: coverageColor }}>
            {coverage.toFixed(0)}%
          </Typography>
          <Typography variant="body2" className="summary-label">
            Coverage
          </Typography>
        </Box>
      </Box>

      {/* Coverage Progress */}
      <Box className="coverage-section">
        <Typography variant="body2" className="coverage-label">
          Meeting Coverage
        </Typography>
        <LinearProgress
          variant="determinate"
          value={coverage}
          className="coverage-progress"
          sx={{
            '& .MuiLinearProgress-bar': {
              backgroundColor: coverageColor
            }
          }}
        />
        <Typography variant="caption" className="coverage-text">
          {coverage >= 80 ? 'Excellent coverage!' : 
           coverage >= 50 ? 'Good coverage' : 
           'Consider marking more highlights'}
        </Typography>
      </Box>

      {/* Type Breakdown */}
      <Box className="type-breakdown">
        <Typography variant="subtitle2" className="breakdown-title">
          By Type
        </Typography>
        <Box className="type-chips">
          {Object.entries(highlightStats.byType).map(([type, count]) => (
            <Chip
              key={type}
              icon={getTypeIcon(type)}
              label={`${getTypeLabel(type)} (${count})`}
              className="type-chip"
              style={{
                backgroundColor: `${getTypeColor(type)}20`,
                color: getTypeColor(type),
                borderColor: getTypeColor(type)
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Timeline */}
      <Collapse in={isExpanded}>
        <Box className="timeline-section">
          <Typography variant="subtitle2" className="timeline-title">
            Timeline
          </Typography>
          <Box className="timeline-list">
            {highlightStats.timeline.map((highlight, index) => (
              <Box key={highlight.id} className="timeline-item">
                <Box className="timeline-marker">
                  <Box 
                    className="timeline-dot"
                    style={{ backgroundColor: getTypeColor(highlight.type) }}
                  >
                    {getTypeIcon(highlight.type)}
                  </Box>
                  {index < highlightStats.timeline.length - 1 && (
                    <Box className="timeline-line" />
                  )}
                </Box>
                <Box className="timeline-content">
                  <Typography variant="body2" className="timeline-time">
                    {highlight.timeInMeeting}min
                  </Typography>
                  <Typography variant="body2" className="timeline-description">
                    {highlight.description || `${getTypeLabel(highlight.type)} marked`}
                  </Typography>
                  <Tooltip title="Play this highlight">
                    <IconButton
                      size="small"
                      onClick={() => onPlayHighlight && onPlayHighlight(highlight)}
                      className="play-highlight-button"
                    >
                      <PlayArrow fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default HighlightDashboard;
