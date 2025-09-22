import { useState, useCallback } from 'react';

/**
 * Custom hook for marking highlights during meetings
 * Provides real-time highlight marking with visual feedback
 */
const useHighlightMarker = (socket, meetingId, participantId) => {
  const [showHighlightFeedback, setShowHighlightFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  /**
   * Mark a highlight moment in the meeting
   * Emits a socket event with timestamp and participant info
   */
  const markHighlight = useCallback((highlightType = 'important', description = '') => {
    if (!socket || !meetingId || !participantId) {
      console.warn('useHighlightMarker: Missing required parameters');
      return;
    }

    const timestamp = Date.now();
    const highlightData = {
      timestamp,
      meetingId,
      participantId,
      date: new Date().toISOString(),
      highlightType,
      description
    };

    try {
      // Emit highlight event to backend
      socket.emit('mark_highlight', highlightData);
      
      // Show visual feedback with type-specific message
      const typeMessages = {
        'decision': '🎯 Decision point marked!',
        'action': '📋 Action item marked!',
        'important': '⭐ Important moment marked!',
        'question': '❓ Key question marked!',
        'summary': '📝 Summary point marked!'
      };
      
      setFeedbackMessage(typeMessages[highlightType] || '✨ Highlight marked!');
      setShowHighlightFeedback(true);
      
      // Hide feedback after 3 seconds
      setTimeout(() => {
        setShowHighlightFeedback(false);
        setFeedbackMessage('');
      }, 3000);

      console.log('Highlight marked:', highlightData);
    } catch (error) {
      console.error('Error marking highlight:', error);
      setFeedbackMessage('❌ Failed to mark highlight');
      setShowHighlightFeedback(true);
      
      setTimeout(() => {
        setShowHighlightFeedback(false);
        setFeedbackMessage('');
      }, 3000);
    }
  }, [socket, meetingId, participantId]);

  /**
   * Clear the highlight feedback
   */
  const clearFeedback = useCallback(() => {
    setShowHighlightFeedback(false);
    setFeedbackMessage('');
  }, []);

  return {
    markHighlight,
    showHighlightFeedback,
    feedbackMessage,
    clearFeedback
  };
};

export default useHighlightMarker;
