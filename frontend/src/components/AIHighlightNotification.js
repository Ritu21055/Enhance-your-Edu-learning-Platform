/**
 * AI Highlight Notification Component
 * Shows notifications when AI automatically detects important moments
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Collapse,
  Alert,
  AlertTitle
} from '@mui/material';
import {
  AutoAwesome,
  Close,
  ExpandMore,
  ExpandLess,
  Psychology,
  Star,
  Gavel,
  Assignment,
  Help,
  Summarize
} from '@mui/icons-material';

const AIHighlightNotification = ({ socket, meetingId }) => {
  const [aiHighlights, setAiHighlights] = useState([]);
  const [showNotifications, setShowNotifications] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleAIHighlight = (data) => {
      console.log('🤖 AI highlight detected:', data);
      
      const newHighlight = {
        id: Date.now() + Math.random(),
        timestamp: data.timestamp,
        type: data.type,
        description: data.description,
        confidence: data.confidence,
        participantId: data.participantId,
        time: new Date().toLocaleTimeString()
      };
      
      setAiHighlights(prev => [newHighlight, ...prev.slice(0, 9)]); // Keep last 10
    };

    socket.on('ai_highlight_detected', handleAIHighlight);

    return () => {
      socket.off('ai_highlight_detected', handleAIHighlight);
    };
  }, [socket, meetingId]);

  const getHighlightIcon = (type) => {
    switch (type) {
      case 'educational':
        return <Assignment color="primary" />;
      case 'important':
        return <Star color="warning" />;
      case 'decision':
        return <Gavel color="success" />;
      case 'question':
        return <Help color="info" />;
      case 'summary':
        return <Summarize color="secondary" />;
      default:
        return <AutoAwesome color="primary" />;
    }
  };

  const getHighlightColor = (type) => {
    switch (type) {
      case 'educational':
        return 'primary';
      case 'important':
        return 'warning';
      case 'decision':
        return 'success';
      case 'question':
        return 'info';
      case 'summary':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  const removeHighlight = (id) => {
    setAiHighlights(prev => prev.filter(h => h.id !== id));
  };

  const clearAllHighlights = () => {
    setAiHighlights([]);
  };

  if (!showNotifications || aiHighlights.length === 0) {
    return null;
  }

  return (
    <Box sx={{ position: 'fixed', top: 80, right: 20, zIndex: 1000, maxWidth: 400 }}>
      <Paper 
        elevation={6} 
        sx={{ 
          p: 2, 
          backgroundColor: '#f8f9fa',
          border: '1px solid #e9ecef',
          borderRadius: 2
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Box display="flex" alignItems="center" gap={1}>
            <Psychology color="primary" />
            <Typography variant="h6" color="primary">
              AI Highlights
            </Typography>
            <Chip 
              label={aiHighlights.length} 
              size="small" 
              color="primary" 
              variant="outlined"
            />
          </Box>
          <Box display="flex" gap={1}>
            <IconButton 
              size="small" 
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
            <IconButton 
              size="small" 
              onClick={() => setShowNotifications(false)}
            >
              <Close />
            </IconButton>
          </Box>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          🤖 AI automatically detected {aiHighlights.length} important moment{aiHighlights.length !== 1 ? 's' : ''}
        </Typography>

        <Collapse in={expanded}>
          <Box maxHeight={300} overflow="auto">
            {aiHighlights.map((highlight) => (
              <Alert
                key={highlight.id}
                severity="info"
                variant="outlined"
                sx={{ 
                  mb: 1, 
                  '& .MuiAlert-message': { width: '100%' }
                }}
                action={
                  <IconButton
                    size="small"
                    onClick={() => removeHighlight(highlight.id)}
                  >
                    <Close fontSize="small" />
                  </IconButton>
                }
              >
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  {getHighlightIcon(highlight.type)}
                  <Chip 
                    label={highlight.type} 
                    size="small" 
                    color={getHighlightColor(highlight.type)}
                    variant="outlined"
                  />
                  <Chip 
                    label={`${Math.round(highlight.confidence * 100)}%`}
                    size="small"
                    color={getConfidenceColor(highlight.confidence)}
                    variant="filled"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {highlight.time}
                  </Typography>
                </Box>
                
                <Typography variant="body2">
                  {highlight.description}
                </Typography>
              </Alert>
            ))}
          </Box>
        </Collapse>

        {!expanded && aiHighlights.length > 0 && (
          <Box>
            <Alert severity="info" variant="outlined" sx={{ mb: 1 }}>
              <AlertTitle>Latest AI Detection</AlertTitle>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                {getHighlightIcon(aiHighlights[0].type)}
                <Chip 
                  label={aiHighlights[0].type} 
                  size="small" 
                  color={getHighlightColor(aiHighlights[0].type)}
                  variant="outlined"
                />
                <Typography variant="caption" color="text.secondary">
                  {aiHighlights[0].time}
                </Typography>
              </Box>
              <Typography variant="body2">
                {aiHighlights[0].description}
              </Typography>
            </Alert>
          </Box>
        )}

        <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
          <Typography variant="caption" color="text.secondary">
            💡 AI analyzes speech patterns and keywords
          </Typography>
          {aiHighlights.length > 1 && (
            <IconButton 
              size="small" 
              onClick={clearAllHighlights}
              color="error"
            >
              <Close fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default AIHighlightNotification;
