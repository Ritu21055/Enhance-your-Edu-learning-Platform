import React, { useState, useEffect } from 'react';
import { Alert, AlertTitle, Button, Box, Typography } from '@mui/material';
import { Star, Gavel, Assignment, Help, Summarize, Close } from '@mui/icons-material';
import '../css/HighlightReminder.css';

const HighlightReminder = ({ 
  meetingDuration, 
  highlightCount, 
  onMarkHighlight,
  isVisible = true 
}) => {
  const [showReminder, setShowReminder] = useState(false);
  const [reminderType, setReminderType] = useState('general');
  const [lastReminderTime, setLastReminderTime] = useState(0);

  // Smart reminder logic based on meeting duration and highlight frequency
  useEffect(() => {
    if (!isVisible || meetingDuration < 60000) return; // Don't show in first minute

    const now = Date.now();
    const timeSinceLastReminder = now - lastReminderTime;
    
    // Show reminder every 5 minutes if no highlights marked
    if (highlightCount === 0 && meetingDuration > 300000) { // 5 minutes
      setReminderType('first_highlight');
      setShowReminder(true);
      setLastReminderTime(now);
    }
    // Show reminder every 10 minutes if highlights are sparse
    else if (highlightCount > 0 && timeSinceLastReminder > 600000) { // 10 minutes
      const expectedHighlights = Math.floor(meetingDuration / 300000); // 1 per 5 minutes
      if (highlightCount < expectedHighlights) {
        setReminderType('more_highlights');
        setShowReminder(true);
        setLastReminderTime(now);
      }
    }
    // Show type-specific reminders
    else if (timeSinceLastReminder > 900000) { // 15 minutes
      const types = ['decision', 'action', 'question', 'summary'];
      const randomType = types[Math.floor(Math.random() * types.length)];
      setReminderType(randomType);
      setShowReminder(true);
      setLastReminderTime(now);
    }
  }, [meetingDuration, highlightCount, isVisible, lastReminderTime]);

  const getReminderMessage = () => {
    switch (reminderType) {
      case 'first_highlight':
        return {
          title: '⭐ Mark Your First Highlight!',
          message: 'You\'ve been in the meeting for 5 minutes. Mark important moments to create a great highlight reel!',
          icon: <Star />,
          color: 'warning'
        };
      case 'more_highlights':
        return {
          title: '📝 More Highlights Needed',
          message: `You have ${highlightCount} highlight(s). Consider marking more important moments for a comprehensive reel.`,
          icon: <Star />,
          color: 'info'
        };
      case 'decision':
        return {
          title: '🎯 Important Decision?',
          message: 'Did someone just make an important decision? Mark it as a highlight!',
          icon: <Star />,
          color: 'success'
        };
      case 'action':
        return {
          title: '📋 Action Item?',
          message: 'Was a task or action item assigned? Mark it as a highlight!',
          icon: <Star />,
          color: 'primary'
        };
      case 'question':
        return {
          title: '❓ Key Question?',
          message: 'Did someone ask an important question? Mark it as a highlight!',
          icon: <Star />,
          color: 'warning'
        };
      case 'summary':
        return {
          title: '📝 Summary Point?',
          message: 'Is someone summarizing key points? Mark it as a highlight!',
          icon: <Star />,
          color: 'secondary'
        };
      default:
        return {
          title: '⭐ Mark Highlights!',
          message: 'Remember to mark important moments during your meeting!',
          icon: <Star />,
          color: 'info'
        };
    }
  };

  const handleMarkHighlight = (type) => {
    onMarkHighlight(type);
    setShowReminder(false);
  };

  const handleDismiss = () => {
    setShowReminder(false);
  };

  if (!showReminder) return null;

  const reminder = getReminderMessage();

  return (
    <Box className="highlight-reminder-container">
      <Alert 
        severity={reminder.color}
        className="highlight-reminder"
        action={
          <Box className="reminder-actions">
            <Button
              size="small"
              onClick={() => handleMarkHighlight('important')}
              startIcon={reminder.icon}
              variant="contained"
              className="reminder-mark-button"
            >
              Mark Highlight
            </Button>
            <Button
              size="small"
              onClick={handleDismiss}
              startIcon={<Close />}
              variant="outlined"
              className="reminder-dismiss-button"
            >
              Dismiss
            </Button>
          </Box>
        }
      >
        <AlertTitle>{reminder.title}</AlertTitle>
        <Typography variant="body2">
          {reminder.message}
        </Typography>
      </Alert>
    </Box>
  );
};

export default HighlightReminder;
