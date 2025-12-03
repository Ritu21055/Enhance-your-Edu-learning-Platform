import { activeMeetings, fatigueData, sentimentData } from '../config/stores.js';

// Fatigue Detection Configuration
export const FATIGUE_THRESHOLD = 20;
export const SUSTAINED_DURATION = 2 * 60 * 1000;
export const HISTORY_DURATION = 5 * 60 * 1000;
export const FATIGUE_CHECK_INTERVAL = 30 * 1000;

/**
 * Calculate fatigue percentage from sentiment data
 */
export function calculateFatiguePercentage(sentimentCounts, totalParticipants) {
  if (totalParticipants === 0) return 0;
  
  const fatigueEmotions = ['sad', 'disgusted', 'angry', 'fearful', 'bored', 'confused', 'tired', 'frustrated', 'annoyed', 'worried', 'stressed'];
  const fatigueCount = fatigueEmotions.reduce((count, emotion) => {
    return count + (sentimentCounts[emotion] || 0);
  }, 0);
  
  return (fatigueCount / totalParticipants) * 100;
}

/**
 * Get the dominant fatigue emotion from sentiment counts
 */
function getDominantFatigueEmotion(sentimentCounts) {
  const fatigueEmotions = ['sad', 'disgusted', 'angry', 'fearful'];
  let dominantEmotion = null;
  let maxCount = 0;
  
  fatigueEmotions.forEach(emotion => {
    const count = sentimentCounts[emotion] || 0;
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  });
  
  return dominantEmotion;
}

/**
 * Get emotion-specific suggestions based on the dominant emotion
 */
function getEmotionSpecificSuggestions(emotion) {
  const suggestions = {
    sad: {
      title: 'Some participants appear sad',
      actions: [
        'Check if anyone needs support or clarification',
        'Use encouraging and positive language',
        'Share a light moment or success story',
        'Ask if there are any concerns to address'
      ]
    },
    angry: {
      title: 'Some participants appear frustrated',
      actions: [
        'Acknowledge any frustrations openly',
        'Take a step back and clarify objectives',
        'Ask for specific feedback on what\'s not working',
        'Consider adjusting the meeting approach'
      ]
    },
    fearful: {
      title: 'Some participants appear anxious',
      actions: [
        'Create a more supportive environment',
        'Clarify expectations and next steps',
        'Encourage questions and open discussion',
        'Reassure about the meeting\'s purpose'
      ]
    },
    disgusted: {
      title: 'Some participants appear displeased',
      actions: [
        'Check if the content is appropriate',
        'Ask for feedback on the current topic',
        'Consider changing the discussion direction',
        'Ensure everyone feels heard and valued'
      ]
    }
  };
  
  return suggestions[emotion] || {
    title: 'Some participants show fatigue',
    actions: [
      'Check in with participants',
      'Ask for questions or feedback',
      'Consider a brief break',
      'Adjust the meeting pace'
    ]
  };
}

/**
 * Generate fatigue alert message based on severity with detailed suggestions
 */
export function generateFatigueMessage(fatiguePercentage, duration, sentimentCounts = {}) {
  const minutes = Math.floor(duration / (60 * 1000));
  const dominantEmotion = getDominantFatigueEmotion(sentimentCounts);
  
  if (fatiguePercentage >= 61) {
    return {
      type: 'urgent',
      icon: '🚨',
      title: 'High Fatigue Detected',
      message: `${Math.round(fatiguePercentage)}% of participants showing fatigue for ${minutes} minutes`,
      suggestions: [
        'Take a 5-10 minute break immediately',
        'Switch to a lighter, more interactive topic',
        'Ask participants to stretch or move around',
        'Consider ending the meeting early if possible',
        'Use breakout rooms for smaller group discussions',
        'Check if anyone needs support or clarification'
      ],
      dominantEmotion,
      urgency: 'high'
    };
  } else if (fatiguePercentage >= 31) {
    return {
      type: 'warning',
      icon: '⚠️',
      title: 'Medium Fatigue Detected',
      message: `${Math.round(fatiguePercentage)}% of participants showing fatigue for ${minutes} minutes`,
      suggestions: [
        'Take a short 2-3 minute break',
        'Ask an engaging question to re-energize',
        'Switch to a more visual or interactive format',
        'Encourage participants to share their thoughts',
        'Consider using polls or quick activities',
        'Use encouraging and positive language'
      ],
      dominantEmotion,
      urgency: 'medium'
    };
  } else if (fatiguePercentage > 0) {
    const emotionSpecificSuggestions = getEmotionSpecificSuggestions(dominantEmotion);
    return {
      type: 'info',
      icon: '💡',
      title: emotionSpecificSuggestions.title,
      message: `Detected ${sentimentCounts[dominantEmotion] || 0} participant(s) with this emotion`,
      suggestions: emotionSpecificSuggestions.actions,
      dominantEmotion,
      urgency: 'low'
    };
  } else {
    return {
      type: 'success',
      icon: '🎉',
      title: 'Excellent Engagement!',
      message: 'Participants are highly engaged and positive',
      suggestions: [
        'Keep the momentum going with interactive content',
        'Encourage participants to share their enthusiasm',
        'Consider extending productive discussions',
        'Capture key insights while energy is high'
      ],
      urgency: 'none'
    };
  }
}

/**
 * Check for fatigue in a specific meeting
 */
export function checkFatigue(meetingId, io) {
  const meeting = activeMeetings.get(meetingId);
  if (!meeting) {
    console.log('🧠 checkFatigue: No meeting found for', meetingId);
    return;
  }
  
  const meetingFatigueData = fatigueData.get(meetingId);
  if (!meetingFatigueData) {
    console.log('🧠 checkFatigue: No fatigue data for meeting', meetingId);
    return;
  }
  
  if (meetingFatigueData.history.length < 2) {
    console.log('🧠 checkFatigue: Not enough history data for meeting', meetingId, 'history length:', meetingFatigueData.history.length);
    return;
  }
  
  const now = Date.now();
  const recentHistory = meetingFatigueData.history.filter(
    entry => now - entry.timestamp <= SUSTAINED_DURATION
  );
  
  if (recentHistory.length < 2) {
    console.log('🧠 checkFatigue: Not enough recent history for meeting', meetingId);
    return;
  }
  
  const avgFatigue = recentHistory.reduce((sum, entry) => sum + entry.fatiguePercentage, 0) / recentHistory.length;
  const sustainedFatigue = recentHistory.every(entry => entry.fatiguePercentage >= FATIGUE_THRESHOLD);
  
  if (sustainedFatigue && avgFatigue >= FATIGUE_THRESHOLD) {
    const duration = now - recentHistory[0].timestamp;
    const latestSentimentCounts = recentHistory[recentHistory.length - 1]?.sentimentCounts || {};
    const alertMessage = generateFatigueMessage(avgFatigue, duration, latestSentimentCounts);
    
    const hostSocketId = meeting.hostId;
    if (hostSocketId) {
      io.to(hostSocketId).emit('fatigue_alert', {
        meetingId,
        alert: alertMessage,
        fatiguePercentage: avgFatigue,
        duration,
        timestamp: now
      });
      
      console.log('🚨 Fatigue alert sent to host:', {
        meetingId,
        hostId: hostSocketId,
        fatiguePercentage: Math.round(avgFatigue),
        duration: Math.round(duration / 1000),
        alertType: alertMessage.type
      });
    }
  }
}

/**
 * Start fatigue monitoring for all active meetings
 */
export function startFatigueMonitoring(io) {
  setInterval(() => {
    console.log('🧠 Fatigue monitoring check - Active meetings:', activeMeetings.size);
    activeMeetings.forEach((meeting, meetingId) => {
      console.log('🧠 Checking fatigue for meeting:', meetingId, 'participants:', meeting.participants.length);
      checkFatigue(meetingId, io);
    });
  }, FATIGUE_CHECK_INTERVAL);
  
  console.log('🧠 Started fatigue monitoring for all meetings - checking every', FATIGUE_CHECK_INTERVAL / 1000, 'seconds');
}

