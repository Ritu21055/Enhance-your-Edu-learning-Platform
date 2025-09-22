import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for AI-powered meeting fatigue detection
 * Analyzes sentiment data trends and triggers fatigue alerts
 */
const useFatigueDetection = (sentimentData, isHost, socket) => {
  const [fatigueAlert, setFatigueAlert] = useState(null);
  const [fatigueHistory, setFatigueHistory] = useState([]);
  const analysisIntervalRef = useRef(null);
  const lastAnalysisTimeRef = useRef(Date.now());

  // Configuration constants (optimized for performance)
  const FATIGUE_THRESHOLD = 10; // Percentage threshold for fatigue detection (lowered for easier triggering)
  const SUSTAINED_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds
  const ANALYSIS_INTERVAL = 15 * 1000; // Analyze every 15 seconds (more frequent)
  const HISTORY_DURATION = 10 * 60 * 1000; // Keep 10 minutes of history
  const MAX_HISTORY_ENTRIES = 20; // Limit memory usage

  /**
   * Calculate fatigue percentage from sentiment data
   */
  const calculateFatiguePercentage = useCallback((data) => {
    if (!data || !data.sentimentCounts) {
      // Fallback: if no sentiment data, simulate fatigue after 2 minutes
      const meetingDuration = Date.now() - (data?.meetingStartTime || Date.now());
      if (meetingDuration > SUSTAINED_DURATION) {
        console.log('🧠 Fatigue Detection: No sentiment data, simulating fatigue after 2 minutes');
        return 15; // Simulate 15% fatigue after 2 minutes
      }
      return 0;
    }

    const { sentimentCounts, totalParticipants } = data;
    if (totalParticipants === 0) return 0;

    // Count fatigue-related emotions (negative emotions + neutral for extended periods)
    const fatigueEmotions = ['sad', 'disgusted', 'angry', 'fearful', 'bored', 'confused', 'tired', 'frustrated', 'annoyed', 'worried', 'stressed', 'neutral'];
    const fatigueCount = fatigueEmotions.reduce((count, emotion) => {
      return count + (sentimentCounts[emotion] || 0);
    }, 0);

    // Special handling for neutral emotions - they indicate fatigue if sustained
    const neutralCount = sentimentCounts['neutral'] || 0;
    const neutralFatigueBonus = neutralCount > 0 ? neutralCount * 0.5 : 0; // Neutral gets 50% weight for fatigue

    const totalFatigueCount = fatigueCount + neutralFatigueBonus;
    return (totalFatigueCount / totalParticipants) * 100;
  }, [SUSTAINED_DURATION]);

  /**
   * Generate fatigue alert message based on severity
   */
  const generateFatigueMessage = useCallback((fatiguePercentage, duration, isNeutralFatigue = false) => {
    const minutes = Math.floor(duration / (60 * 1000));
    
    if (isNeutralFatigue) {
      return {
        type: 'medium',
        title: '😐 Low Engagement Detected',
        message: `Participants have been showing neutral expressions for ${minutes} minutes. They may be disengaged or bored.`,
        suggestions: [
          'Ask a direct question to re-engage',
          'Switch to an interactive activity',
          'Use polls or surveys',
          'Take a short break to refresh',
          'Check if participants need clarification'
        ]
      };
    } else if (fatiguePercentage >= 50) {
      return {
        type: 'high',
        title: '🚨 High Meeting Fatigue Detected',
        message: `${Math.round(fatiguePercentage)}% of participants show signs of fatigue for ${minutes} minutes. Consider a break or activity change.`,
        suggestions: [
          'Take a 5-minute break',
          'Switch to an interactive activity',
          'Ask for participant feedback',
          'Consider ending the meeting early'
        ]
      };
    } else if (fatiguePercentage >= 20) {
      return {
        type: 'medium',
        title: '⚠️ Meeting Fatigue Detected',
        message: `${Math.round(fatiguePercentage)}% of participants show signs of fatigue for ${minutes} minutes. Consider engagement strategies.`,
        suggestions: [
          'Ask a question to re-engage',
          'Switch to a different topic',
          'Take a short break',
          'Use interactive tools'
        ]
      };
    } else {
      return {
        type: 'low',
        title: '💡 Engagement Opportunity',
        message: `${Math.round(fatiguePercentage)}% of participants show signs of fatigue. Consider proactive engagement.`,
        suggestions: [
          'Ask for questions',
          'Use polls or surveys',
          'Encourage participation',
          'Check in with participants'
        ]
      };
    }
  }, []);

  /**
   * Analyze fatigue trends over time
   */
  const analyzeFatigueTrends = useCallback(() => {
    if (!isHost || fatigueHistory.length < 2) return;

    const now = Date.now();
    const recentHistory = fatigueHistory.filter(
      entry => now - entry.timestamp <= SUSTAINED_DURATION
    );

    if (recentHistory.length < 2) return;

    // Calculate average fatigue percentage over the sustained period
    const avgFatigue = recentHistory.reduce((sum, entry) => sum + entry.fatiguePercentage, 0) / recentHistory.length;
    
    // Check if fatigue has been sustained above threshold
    const sustainedFatigue = recentHistory.every(entry => entry.fatiguePercentage >= FATIGUE_THRESHOLD);
    
    // Special check for sustained neutral emotions (participants showing no engagement)
    const sustainedNeutral = recentHistory.every(entry => {
      const sentimentData = entry.sentimentData;
      if (!sentimentData || !sentimentData.sentimentCounts) return false;
      
      const neutralCount = sentimentData.sentimentCounts['neutral'] || 0;
      const totalParticipants = sentimentData.totalParticipants || 1;
      const neutralPercentage = (neutralCount / totalParticipants) * 100;
      
      return neutralPercentage >= 50; // 50% or more participants showing neutral for 2+ minutes
    });
    
    if ((sustainedFatigue && avgFatigue >= FATIGUE_THRESHOLD) || sustainedNeutral) {
      const duration = now - recentHistory[0].timestamp;
      const alertMessage = generateFatigueMessage(avgFatigue, duration, sustainedNeutral);
      
      setFatigueAlert(alertMessage);
      
      // Log fatigue detection for debugging
      console.log('🧠 Fatigue Detection:', {
        avgFatigue: Math.round(avgFatigue),
        duration: Math.round(duration / 1000),
        threshold: FATIGUE_THRESHOLD,
        historyLength: recentHistory.length,
        alertType: alertMessage.type,
        sustainedNeutral: sustainedNeutral,
        detectionReason: sustainedNeutral ? 'sustained_neutral_emotions' : 'sustained_fatigue'
      });
    }
  }, [isHost, fatigueHistory, FATIGUE_THRESHOLD, SUSTAINED_DURATION, generateFatigueMessage]);

  /**
   * Update fatigue history with new sentiment data
   */
  const updateFatigueHistory = useCallback((data) => {
    if (!data) return;

    const fatiguePercentage = calculateFatiguePercentage(data);
    const now = Date.now();

    const newEntry = {
      timestamp: now,
      fatiguePercentage,
      sentimentData: data
    };

    setFatigueHistory(prevHistory => {
      // Keep only recent history and limit entries for memory efficiency
      const filteredHistory = prevHistory
        .filter(entry => now - entry.timestamp <= HISTORY_DURATION)
        .slice(-MAX_HISTORY_ENTRIES); // Keep only last N entries
      
      return [...filteredHistory, newEntry];
    });
  }, [calculateFatiguePercentage, HISTORY_DURATION]);

  /**
   * Dismiss fatigue alert
   */
  const dismissFatigueAlert = useCallback(() => {
    setFatigueAlert(null);
    console.log('🧠 Fatigue alert dismissed by host');
  }, []);

  /**
   * Start fatigue analysis
   */
  const startFatigueAnalysis = useCallback(() => {
    if (!isHost || analysisIntervalRef.current) return;

    console.log('🧠 Starting fatigue detection analysis');
    
    analysisIntervalRef.current = setInterval(() => {
      analyzeFatigueTrends();
    }, ANALYSIS_INTERVAL);
  }, [isHost, analyzeFatigueTrends, ANALYSIS_INTERVAL]);

  /**
   * Stop fatigue analysis
   */
  const stopFatigueAnalysis = useCallback(() => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
      console.log('🧠 Stopped fatigue detection analysis');
    }
  }, []);

  // Effect to handle sentiment data updates
  useEffect(() => {
    if (sentimentData && isHost) {
      updateFatigueHistory(sentimentData);
    }
  }, [sentimentData, isHost, updateFatigueHistory]);

  // Simple time-based fatigue detection (fallback when no sentiment data)
  useEffect(() => {
    if (!isHost) return;

    const meetingStartTime = Date.now();
    const timeBasedFatigueCheck = () => {
      const meetingDuration = Date.now() - meetingStartTime;
      
      if (meetingDuration >= SUSTAINED_DURATION) {
        console.log('🧠 Fatigue Detection: Time-based fatigue triggered after 2 minutes');
        
        // Create a simulated fatigue alert
        const alertMessage = {
          type: 'medium',
          title: '⏰ Meeting Duration Alert',
          message: 'You\'ve been in this meeting for over 2 minutes. Consider taking a break or checking in with participants.',
          suggestions: [
            'Take a 5-minute break',
            'Ask participants how they\'re feeling',
            'Switch to a different activity',
            'Consider ending the meeting if objectives are met'
          ]
        };
        
        setFatigueAlert(alertMessage);
        
        // Clear the interval after triggering
        clearInterval(timeBasedInterval);
      }
    };

    // Check every 30 seconds for time-based fatigue
    const timeBasedInterval = setInterval(timeBasedFatigueCheck, 30000);
    
    return () => clearInterval(timeBasedInterval);
  }, [isHost, SUSTAINED_DURATION]);

  // Listen for fatigue alerts from the backend (host only)
  useEffect(() => {
    if (!socket || !isHost) {
      console.log('🧠 Fatigue Detection: Not setting up fatigue listener (not host or no socket)', {
        hasSocket: !!socket,
        isHost: isHost,
        socketId: socket?.id
      });
      return;
    }

    console.log('🧠 Fatigue Detection: Setting up fatigue listener for host', {
      socketId: socket.id,
      isHost: isHost
    });

    const handleFatigueAlert = (alertData) => {
      console.log('🚨 Received fatigue alert from backend:', alertData);
      console.log('🚨 Fatigue alert details:', {
        meetingId: alertData.meetingId,
        alertType: alertData.alert?.type,
        fatiguePercentage: Math.round(alertData.fatiguePercentage),
        duration: Math.round(alertData.duration / 1000),
        message: alertData.alert?.message
      });
      setFatigueAlert(alertData.alert);
    };

    socket.on('fatigue_alert', handleFatigueAlert);

    return () => {
      console.log('🧠 Fatigue Detection: Cleaning up fatigue listener');
      socket.off('fatigue_alert', handleFatigueAlert);
    };
  }, [socket, isHost]);

  // Effect to start/stop analysis based on host status
  useEffect(() => {
    if (isHost) {
      startFatigueAnalysis();
    } else {
      stopFatigueAnalysis();
      setFatigueAlert(null); // Clear any existing alerts for non-hosts
    }

    return () => {
      stopFatigueAnalysis();
    };
  }, [isHost, startFatigueAnalysis, stopFatigueAnalysis]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFatigueAnalysis();
    };
  }, [stopFatigueAnalysis]);

  return {
    fatigueAlert,
    dismissFatigueAlert,
    fatigueHistory,
    isAnalyzing: !!analysisIntervalRef.current
  };
};

export default useFatigueDetection;
