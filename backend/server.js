import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
// AI features removed - will be reimplemented based on new requirements

// Import LLM Service for AI-Driven Smart Follow-up Question Generation
import llmService from './src/utils/llmService.js';

// Import Media Processor for AI-Generated Meeting Highlights
import mediaProcessor from './src/utils/mediaProcessor.js';

// Import Media Recorder for Real-Time Meeting Recording
import mediaRecorder from './src/utils/mediaRecorder.js';

// Import AI Highlight Detector for Free Automatic Highlight Detection
import AIHighlightDetector from './src/utils/aiHighlightDetector.js';

// Import Meeting History Manager for persistent storage
import meetingHistoryManager from './src/utils/meetingHistory.js';

// Load persistent meeting history on server startup
let persistentMeetings = new Map();
let persistentHighlights = new Map();
let persistentTranscripts = new Map();

// Load existing meeting history on startup
(async () => {
  try {
    const activeMeetings = await meetingHistoryManager.getActiveMeetings();
    console.log('📋 Loaded persistent meeting history:', activeMeetings.length, 'meetings');
    
    // Populate in-memory maps for quick access
    for (const meeting of activeMeetings) {
      persistentMeetings.set(meeting.id, meeting);
    }
  } catch (error) {
    console.error('❌ Failed to load persistent meeting history:', error);
  }
})();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for cross-device compatibility
    methods: ["GET", "POST"]
  }
});


// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (highlight reels)
app.use('/output', express.static('output'));

// Store active meetings
const activeMeetings = new Map();

// Store sentiment data for each meeting
const sentimentData = new Map();

// Store fatigue detection data for each meeting
const fatigueData = new Map();

// Store highlight timestamps for each meeting
const highlightData = new Map();

// Store recording sessions for each meeting
const recordingSessions = new Map();

// Initialize AI Highlight Detector for automatic highlight detection
const aiHighlightDetector = new AIHighlightDetector();


// Store transcript data for AI analysis
const transcriptData = new Map();

// Performance monitoring data
const performanceData = {
  llmService: null,
  sentimentAnalysis: {
    activeParticipants: 0,
    analysisInterval: 3000,
    totalAnalyses: 0,
    successfulAnalyses: 0
  },
  fatigueDetection: {
    currentFatigueLevel: 0,
    alertsGenerated: 0,
    activeMeetings: 0
  },
  systemResources: {
    memoryUsage: 'N/A',
    cpuUsage: 'N/A'
  },
  overallStatus: 'good'
};

/**
 * Update performance data
 */
function updatePerformanceData() {
  // Update LLM service performance
  performanceData.llmService = llmService.getPerformanceStats();
  
  // Update sentiment analysis data
  performanceData.sentimentAnalysis.activeParticipants = sentimentData.size;
  
  // Update fatigue detection data
  performanceData.fatigueDetection.activeMeetings = fatigueData.size;
  
  // Calculate overall status
  const llmSuccessRate = parseFloat(performanceData.llmService?.successRate || '0');
  const sentimentSuccessRate = performanceData.sentimentAnalysis.totalAnalyses > 0 
    ? (performanceData.sentimentAnalysis.successfulAnalyses / performanceData.sentimentAnalysis.totalAnalyses * 100)
    : 100;
  
  if (llmSuccessRate >= 90 && sentimentSuccessRate >= 90) {
    performanceData.overallStatus = 'excellent';
  } else if (llmSuccessRate >= 75 && sentimentSuccessRate >= 75) {
    performanceData.overallStatus = 'good';
  } else if (llmSuccessRate >= 50 && sentimentSuccessRate >= 50) {
    performanceData.overallStatus = 'fair';
  } else {
    performanceData.overallStatus = 'poor';
  }
}

/**
 * Auto-detect important moments in a meeting
 * This function analyzes chat messages, sentiment data, and other signals
 * to identify potentially important moments that weren't manually marked
 */
async function detectImportantMoments(meetingId, existingHighlights) {
  const autoHighlights = [];
  
  try {
    // Get meeting data
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) return autoHighlights;
    
    // Get sentiment data for the meeting
    const sentimentData = sentimentData.get(meetingId);
    
    // Get LLM transcript history for analysis
    const transcriptHistory = llmService.getRecentTranscriptContext(meetingId, 10); // Last 10 minutes
    
    // Auto-detect based on various signals
    const currentTime = Date.now();
    
    // 1. Detect high engagement moments (based on sentiment spikes)
    if (sentimentData && sentimentData.participants) {
      sentimentData.participants.forEach((data, participantId) => {
        if (data.sentimentHistory && data.sentimentHistory.length > 0) {
          // Look for emotion spikes (excitement, surprise, etc.)
          const recentEmotions = data.emotionHistory.slice(-10); // Last 10 entries
          recentEmotions.forEach((emotion, index) => {
            if (emotion.confidence > 0.8 && 
                (emotion.emotion === 'surprised' || emotion.emotion === 'happy')) {
              
              const timestamp = currentTime - (recentEmotions.length - index) * 30000; // 30 seconds per entry
              
              // Check if this timestamp is already covered by existing highlights
              const isAlreadyCovered = existingHighlights.some(h => 
                Math.abs(h.timestamp - timestamp) < 30000 // Within 30 seconds
              );
              
              if (!isAlreadyCovered) {
                autoHighlights.push({
                  timestamp,
                  participantId,
                  date: new Date(timestamp).toISOString(),
                  id: uuidv4(),
                  type: 'auto_engagement',
                  description: `High engagement moment - ${emotion.emotion}`,
                  priority: 'medium',
                  confidence: emotion.confidence
                });
              }
            }
          });
        }
      });
    }
    
    // 2. Enhanced transcript analysis for important moments
    if (transcriptHistory && transcriptHistory.length > 0) {
      transcriptHistory.forEach((entry, index) => {
        const text = entry.transcript.toLowerCase();
        const timestamp = currentTime - (transcriptHistory.length - index) * 30000;
        
        // Check if already covered
        const isAlreadyCovered = existingHighlights.some(h => 
          Math.abs(h.timestamp - timestamp) < 30000
        );
        
        if (isAlreadyCovered) return;
        
        // Detect decision moments
        const decisionKeywords = ['decided', 'agreed', 'concluded', 'final', 'approved', 'rejected', 'chosen', 'selected'];
        if (decisionKeywords.some(keyword => text.includes(keyword))) {
          autoHighlights.push({
            timestamp,
            participantId: 'auto-detected',
            date: new Date(timestamp).toISOString(),
            id: uuidv4(),
            type: 'auto_decision',
            description: 'Important decision made',
            priority: 'high',
            confidence: 0.9
          });
          return;
        }
        
        // Detect problem mentions
        const problemKeywords = ['problem', 'issue', 'challenge', 'concern', 'difficult', 'trouble', 'error', 'bug'];
        if (problemKeywords.some(keyword => text.includes(keyword))) {
          autoHighlights.push({
            timestamp,
            participantId: 'auto-detected',
            date: new Date(timestamp).toISOString(),
            id: uuidv4(),
            type: 'auto_problem',
            description: 'Problem or issue identified',
            priority: 'high',
            confidence: 0.8
          });
          return;
        }
        
        // Detect solution proposals
        const solutionKeywords = ['solution', 'fix', 'resolve', 'solve', 'propose', 'suggest', 'recommend', 'idea'];
        if (solutionKeywords.some(keyword => text.includes(keyword))) {
          autoHighlights.push({
            timestamp,
            participantId: 'auto-detected',
            date: new Date(timestamp).toISOString(),
            id: uuidv4(),
            type: 'auto_solution',
            description: 'Solution or approach proposed',
            priority: 'high',
            confidence: 0.8
          });
          return;
        }
        
        // Detect action items
        const actionKeywords = ['action', 'task', 'todo', 'assign', 'responsible', 'deadline', 'due', 'next step'];
        if (actionKeywords.some(keyword => text.includes(keyword))) {
          autoHighlights.push({
            timestamp,
            participantId: 'auto-detected',
            date: new Date(timestamp).toISOString(),
            id: uuidv4(),
            type: 'auto_action',
            description: 'Action item or task assigned',
            priority: 'medium',
            confidence: 0.7
          });
          return;
        }
        
        // Detect questions (lower priority)
        if (text.includes('?') || 
            text.includes('what') || 
            text.includes('how') || 
            text.includes('why') || 
            text.includes('when') || 
            text.includes('where')) {
            autoHighlights.push({
              timestamp,
              participantId: 'auto-detected',
              date: new Date(timestamp).toISOString(),
              id: uuidv4(),
              type: 'auto_question',
            description: 'Important question asked',
              priority: 'medium',
            confidence: 0.6
            });
        }
      });
    }
    
    // 3. Add meeting start and end moments if not already covered
    const meetingStartTime = meeting.startTime || (currentTime - 3600000); // Assume 1 hour ago if no start time
    const meetingEndTime = currentTime;
    
    // Meeting start highlight
    const startCovered = existingHighlights.some(h => 
      Math.abs(h.timestamp - meetingStartTime) < 60000 // Within 1 minute
    );
    
    if (!startCovered) {
      autoHighlights.push({
        timestamp: meetingStartTime,
        participantId: 'system',
        date: new Date(meetingStartTime).toISOString(),
        id: uuidv4(),
        type: 'auto_meeting_start',
        description: 'Meeting started',
        priority: 'low',
        confidence: 1.0
      });
    }
    
    // Meeting end highlight
    const endCovered = existingHighlights.some(h => 
      Math.abs(h.timestamp - meetingEndTime) < 60000
    );
    
    if (!endCovered) {
      autoHighlights.push({
        timestamp: meetingEndTime,
        participantId: 'system',
        date: new Date(meetingEndTime).toISOString(),
        id: uuidv4(),
        type: 'auto_meeting_end',
        description: 'Meeting ended',
        priority: 'low',
        confidence: 1.0
      });
    }
    
    // Sort by timestamp and limit to reasonable number
    autoHighlights.sort((a, b) => a.timestamp - b.timestamp);
    
    // Limit to maximum 5 auto-detected highlights to avoid overwhelming the reel
    return autoHighlights.slice(0, 5);
    
  } catch (error) {
    console.error('❌ Error in auto-detection:', error);
    return autoHighlights;
  }
}

// Fatigue Detection Configuration
const FATIGUE_THRESHOLD = 20; // Percentage threshold for fatigue detection (lowered for testing)
const SUSTAINED_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds (reduced for testing)
const HISTORY_DURATION = 5 * 60 * 1000; // Keep 5 minutes of history
const FATIGUE_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds (faster for testing)

/**
 * Calculate fatigue percentage from sentiment data
 */
function calculateFatiguePercentage(sentimentCounts, totalParticipants) {
  if (totalParticipants === 0) return 0;
  
  // Count fatigue-related emotions (all negative emotions that indicate fatigue/discomfort)
  const fatigueEmotions = ['sad', 'disgusted', 'angry', 'fearful', 'bored', 'confused', 'tired', 'frustrated', 'annoyed', 'worried', 'stressed'];
  const fatigueCount = fatigueEmotions.reduce((count, emotion) => {
    return count + (sentimentCounts[emotion] || 0);
  }, 0);
  
  return (fatigueCount / totalParticipants) * 100;
}

/**
 * Generate fatigue alert message based on severity with detailed suggestions
 */
function generateFatigueMessage(fatiguePercentage, duration, sentimentCounts = {}) {
  const minutes = Math.floor(duration / (60 * 1000));
  
  // Analyze specific emotions to provide targeted suggestions
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
 * Check for fatigue in a specific meeting
 */
function checkFatigue(meetingId) {
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
  
  console.log('🧠 checkFatigue: Meeting', meetingId, {
    totalHistory: meetingFatigueData.history.length,
    recentHistory: recentHistory.length,
    historyData: meetingFatigueData.history.map(h => ({
      fatigue: Math.round(h.fatiguePercentage),
      time: new Date(h.timestamp).toLocaleTimeString()
    }))
  });
  
  if (recentHistory.length < 2) {
    console.log('🧠 checkFatigue: Not enough recent history for meeting', meetingId);
    return;
  }
  
  // Calculate average fatigue percentage over the sustained period
  const avgFatigue = recentHistory.reduce((sum, entry) => sum + entry.fatiguePercentage, 0) / recentHistory.length;
  
  // Check if fatigue has been sustained above threshold
  const sustainedFatigue = recentHistory.every(entry => entry.fatiguePercentage >= FATIGUE_THRESHOLD);
  
  console.log('🧠 checkFatigue: Analysis for meeting', meetingId, {
    avgFatigue: Math.round(avgFatigue),
    threshold: FATIGUE_THRESHOLD,
    sustainedFatigue,
    recentHistory: recentHistory.map(h => Math.round(h.fatiguePercentage))
  });
  
  if (sustainedFatigue && avgFatigue >= FATIGUE_THRESHOLD) {
    const duration = now - recentHistory[0].timestamp;
    const latestSentimentCounts = recentHistory[recentHistory.length - 1]?.sentimentCounts || {};
    const alertMessage = generateFatigueMessage(avgFatigue, duration, latestSentimentCounts);
    
    // Send fatigue alert to host only
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
    } else {
      console.log('🧠 checkFatigue: No host found for meeting', meetingId, 'hostId:', meeting.hostId, 'participants:', meeting.participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })));
    }
  } else {
    console.log('🧠 checkFatigue: No fatigue alert triggered for meeting', meetingId, {
      avgFatigue: Math.round(avgFatigue),
      threshold: FATIGUE_THRESHOLD,
      sustainedFatigue
    });
  }
}

/**
 * Start fatigue monitoring for all active meetings
 */
function startFatigueMonitoring() {
  setInterval(() => {
    console.log('🧠 Fatigue monitoring check - Active meetings:', activeMeetings.size);
    activeMeetings.forEach((meeting, meetingId) => {
      console.log('🧠 Checking fatigue for meeting:', meetingId, 'participants:', meeting.participants.length);
      checkFatigue(meetingId);
    });
  }, FATIGUE_CHECK_INTERVAL);
  
  console.log('🧠 Started fatigue monitoring for all meetings - checking every', FATIGUE_CHECK_INTERVAL / 1000, 'seconds');
}

// Start fatigue monitoring
startFatigueMonitoring();

// Test function to manually trigger fatigue detection (for debugging)
function testFatigueDetection(meetingId, participantCount = 1) {
  console.log('🧪 Testing fatigue detection for meeting:', meetingId, 'with', participantCount, 'participants');
  
  // Create test participants based on count
  const testParticipants = [];
  for (let i = 1; i <= participantCount; i++) {
    testParticipants.push({
      id: `test-participant-${i}`,
      name: `Test Participant ${i}`,
      isHost: false,
      isApproved: true
    });
  }
  
  // Create a test meeting entry if it doesn't exist
  if (!activeMeetings.has(meetingId)) {
    activeMeetings.set(meetingId, {
      id: meetingId,
      hostId: 'test-host-socket-id', // Test host ID
      participants: testParticipants,
      pendingApprovals: [],
      createdAt: Date.now()
    });
    console.log('🧪 Created test meeting entry for:', meetingId, 'with', participantCount, 'participants');
  }
  
  if (!fatigueData.has(meetingId)) {
    console.log('🧪 No fatigue data found, creating test data...');
    fatigueData.set(meetingId, {
      history: [],
      lastUpdated: Date.now()
    });
  }
  
  const meetingFatigueData = fatigueData.get(meetingId);
  const now = Date.now();
  
  // Calculate fatigue based on participant count
  // For testing: 50% of participants show fatigue (diverse negative emotions)
  const fatiguedCount = Math.ceil(participantCount * 0.5); // At least 1 if participantCount > 0
  const fatiguePercentage = (fatiguedCount / participantCount) * 100;
  
  // Create realistic sentiment counts with diverse negative emotions
  const negativeEmotions = ['sad', 'angry', 'disgusted', 'fearful', 'bored', 'confused', 'tired', 'frustrated', 'annoyed', 'worried', 'stressed'];
  const sentimentCounts = {
    sad: 0,
    angry: 0,
    disgusted: 0,
    fearful: 0,
    bored: 0,
    confused: 0,
    tired: 0,
    frustrated: 0,
    annoyed: 0,
    worried: 0,
    stressed: 0,
    happy: Math.max(0, participantCount - fatiguedCount),
    neutral: 0,
    surprised: 0
  };
  
  // Distribute fatigued participants across different negative emotions
  for (let i = 0; i < fatiguedCount; i++) {
    const emotion = negativeEmotions[i % negativeEmotions.length];
    sentimentCounts[emotion] = (sentimentCounts[emotion] || 0) + 1;
  }
  
  // Add test fatigue data for 2 minutes
  for (let i = 0; i < 4; i++) {
    meetingFatigueData.history.push({
      timestamp: now - (i * 30 * 1000), // Every 30 seconds for 2 minutes
      fatiguePercentage: fatiguePercentage,
      sentimentCounts: { ...sentimentCounts },
      totalParticipants: participantCount
    });
  }
  
  console.log('🧪 Test fatigue data created:', {
    meetingId,
    participantCount,
    fatiguedCount,
    fatiguePercentage: Math.round(fatiguePercentage),
    sentimentCounts,
    historyLength: meetingFatigueData.history.length
  });
  
  // Trigger immediate fatigue check
  checkFatigue(meetingId);
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'VideoMeet server is running' });
});

// Test endpoint for fatigue detection
app.post('/api/test-fatigue/:meetingId', (req, res) => {
  const { meetingId } = req.params;
  const { participants = 1 } = req.body; // Default to 1 participant if not specified
  console.log('🧪 Test fatigue endpoint called for meeting:', meetingId, 'with', participants, 'participants');
  
  testFatigueDetection(meetingId, participants);
  
  res.json({ 
    status: 'OK', 
    message: `Fatigue test triggered for meeting ${meetingId} with ${participants} participants`,
    meetingId: meetingId,
    participantCount: participants
  });
});

// Test endpoint to simulate real sentiment data
app.post('/api/test-sentiment/:meetingId', (req, res) => {
  const { meetingId } = req.params;
  const { participants = 1, fatiguedParticipants = 1 } = req.body; // Default values
  console.log('🧪 Test sentiment endpoint called for meeting:', meetingId, 'with', participants, 'participants,', fatiguedParticipants, 'fatigued');
  
  // Create test participants based on count
  const testParticipants = [];
  for (let i = 1; i <= participants; i++) {
    testParticipants.push({
      id: `test-participant-${i}`,
      name: `Test Participant ${i}`,
      isHost: false,
      isApproved: true
    });
  }
  
  // Create meeting if it doesn't exist
  if (!activeMeetings.has(meetingId)) {
    activeMeetings.set(meetingId, {
      id: meetingId,
      hostId: 'test-host-socket-id',
      participants: testParticipants,
      pendingApprovals: [],
      createdAt: Date.now()
    });
  }
  
  // Simulate receiving sentiment data from multiple participants with diverse emotions
  const negativeEmotions = ['sad', 'angry', 'disgusted', 'fearful', 'bored', 'confused', 'tired', 'frustrated', 'annoyed', 'worried', 'stressed'];
  const testSentimentDataArray = [];
  
  for (let i = 1; i <= participants; i++) {
    const isFatigued = i <= fatiguedParticipants;
    const fatigueEmotion = isFatigued ? negativeEmotions[(i - 1) % negativeEmotions.length] : 'happy';
    
    // Create emotion distribution based on the selected emotion
    const emotions = {};
    if (isFatigued) {
      emotions[fatigueEmotion] = 0.85;
      emotions.happy = 0.05;
      emotions.neutral = 0.05;
      emotions.angry = 0.02;
      emotions.fearful = 0.02;
      emotions.disgusted = 0.01;
    } else {
      emotions.happy = 0.75;
      emotions.neutral = 0.15;
      emotions.sad = 0.05;
      emotions.angry = 0.02;
      emotions.fearful = 0.02;
      emotions.disgusted = 0.01;
    }
    
    testSentimentDataArray.push({
      participantId: `test-participant-${i}`,
      meetingId: meetingId,
      sentimentData: {
        emotion: fatigueEmotion,
        confidence: isFatigued ? 0.85 : 0.75,
        emotions: emotions,
        timestamp: Date.now(),
        participantId: `test-participant-${i}`
      }
    });
  }
  
  // Simulate the sentiment_update event for all participants
  console.log('🧪 Simulating sentiment updates for', testSentimentDataArray.length, 'participants');
  
  // Initialize sentiment data for meeting if it doesn't exist
  if (!sentimentData.has(meetingId)) {
    sentimentData.set(meetingId, {
      participants: new Map(),
      lastUpdated: Date.now()
    });
  }
  
  const meetingSentimentData = sentimentData.get(meetingId);
  
  // Process sentiment data for all participants
  testSentimentDataArray.forEach(({ participantId, sentimentData: receivedSentimentData }) => {
    const emotion = receivedSentimentData?.emotion || 'neutral';
    
    // Update participant emotion
    meetingSentimentData.participants.set(participantId, {
      emotion,
      timestamp: Date.now(),
      participantId
    });
    
    console.log('🧪 Updated sentiment for participant:', participantId, 'emotion:', emotion);
  });
  
  meetingSentimentData.lastUpdated = Date.now();
  
  // Aggregate emotion data
  const sentimentCounts = {};
  meetingSentimentData.participants.forEach((data) => {
    sentimentCounts[data.emotion] = (sentimentCounts[data.emotion] || 0) + 1;
  });
  
  const aggregatedData = {
    meetingId,
    totalParticipants: meetingSentimentData.participants.size,
    sentimentCounts,
    lastUpdated: meetingSentimentData.lastUpdated,
    participants: Array.from(meetingSentimentData.participants.values())
  };
  
  console.log('📊 Aggregated sentiment data:', aggregatedData);
  
  // Store fatigue data for historical analysis
  if (!fatigueData.has(meetingId)) {
    fatigueData.set(meetingId, {
      history: [],
      lastUpdated: Date.now()
    });
  }
  
  const meetingFatigueData = fatigueData.get(meetingId);
  const fatiguePercentage = calculateFatiguePercentage(sentimentCounts, meetingSentimentData.participants.size);
  
  // Add to fatigue history
  meetingFatigueData.history.push({
    timestamp: Date.now(),
    fatiguePercentage,
    sentimentCounts,
    totalParticipants: meetingSentimentData.participants.size
  });
  
  // Keep only last 5 minutes of fatigue history
  meetingFatigueData.history = meetingFatigueData.history.filter(
    entry => Date.now() - entry.timestamp <= HISTORY_DURATION
  );
  
  meetingFatigueData.lastUpdated = Date.now();
  
  console.log('🧠 Updated fatigue data:', {
    meetingId,
    fatiguePercentage: Math.round(fatiguePercentage),
    historyLength: meetingFatigueData.history.length,
    sentimentCounts,
    totalParticipants: meetingSentimentData.participants.size
  });
  
  // Check for fatigue after updating sentiment data
  checkFatigue(meetingId);
  
  res.json({ 
    status: 'OK', 
    message: `Sentiment test completed for meeting ${meetingId} with ${participants} participants (${fatiguedParticipants} fatigued)`,
    meetingId,
    participantCount: participants,
    fatiguedCount: fatiguedParticipants,
    fatiguePercentage: Math.round(fatiguePercentage),
    sentimentCounts
  });
});

// Debug endpoint to see active meetings
app.get('/api/debug/meetings', (req, res) => {
  const meetings = Array.from(activeMeetings.entries()).map(([id, meeting]) => ({
    meetingId: id,
    host: meeting.host,
    hostId: meeting.hostId,
    participants: meeting.participants.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isApproved: p.isApproved
    }))
  }));
  
  res.json({ 
    activeMeetings: meetings,
    totalMeetings: activeMeetings.size
  });
});

// Test endpoint to send a simple message to host
app.post('/api/test-socket/:meetingId', (req, res) => {
  const { meetingId } = req.params;
  const meeting = activeMeetings.get(meetingId);
  
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }
  
  const hostSocketId = meeting.hostId;
  if (hostSocketId) {
    io.to(hostSocketId).emit('test_message', {
      message: 'Hello from backend!',
      timestamp: Date.now()
    });
    
    console.log('🧪 Test message sent to host:', {
      meetingId,
      hostId: hostSocketId
    });
    
    res.json({ 
      status: 'OK', 
      message: 'Test message sent to host',
      hostId: hostSocketId
    });
  } else {
    res.status(404).json({ error: 'Host not found' });
  }
});

app.post('/api/meetings', (req, res) => {
  const { hostName } = req.body;
  const meetingId = uuidv4().substring(0, 8).toUpperCase();
  
  activeMeetings.set(meetingId, {
    id: meetingId,
    host: hostName,
    participants: [],
    createdAt: new Date(),
    status: 'waiting'
  });
  
  res.json({ 
    meetingId, 
    message: 'Meeting created successfully',
    meeting: activeMeetings.get(meetingId)
  });
});

app.get('/api/meetings/:meetingId', (req, res) => {
  const { meetingId } = req.params;
  const meeting = activeMeetings.get(meetingId);
  
  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }
  
  res.json({ meeting });
});

// Meeting History API Endpoints
app.get('/api/meetings/:meetingId/history', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const history = await meetingHistoryManager.getMeetingHistory(meetingId);
    
    if (!history) {
      return res.status(404).json({ error: 'Meeting history not found' });
    }
    
    res.json({ meetingHistory: history });
  } catch (error) {
    console.error('❌ Error getting meeting history:', error);
    res.status(500).json({ error: 'Failed to get meeting history' });
  }
});

app.get('/api/meetings/history/all', async (req, res) => {
  try {
    const histories = await meetingHistoryManager.getAllMeetingHistories();
    res.json({ meetingHistories: histories });
  } catch (error) {
    console.error('❌ Error getting all meeting histories:', error);
    res.status(500).json({ error: 'Failed to get meeting histories' });
  }
});

app.get('/api/meetings/history/statistics', async (req, res) => {
  try {
    const statistics = await meetingHistoryManager.getMeetingStatistics();
    res.json({ statistics });
  } catch (error) {
    console.error('❌ Error getting meeting statistics:', error);
    res.status(500).json({ error: 'Failed to get meeting statistics' });
  }
});

app.delete('/api/meetings/:meetingId/history', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const success = await meetingHistoryManager.deleteMeetingHistory(meetingId);
    
    if (!success) {
      return res.status(404).json({ error: 'Meeting history not found' });
    }
    
    // Also remove from active meetings index
    await meetingHistoryManager.removeFromActiveMeetings(meetingId);
    
    res.json({ message: 'Meeting history deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting meeting history:', error);
    res.status(500).json({ error: 'Failed to delete meeting history' });
  }
});

app.post('/api/meetings/history/cleanup', async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.body;
    const deletedCount = await meetingHistoryManager.cleanupOldHistories(daysToKeep);
    
    res.json({ 
      message: `Cleanup completed: ${deletedCount} old meeting histories deleted`,
      deletedCount 
    });
  } catch (error) {
    console.error('❌ Error cleaning up meeting histories:', error);
    res.status(500).json({ error: 'Failed to cleanup meeting histories' });
  }
});

// API endpoint to get all active meetings (persistent)
app.get('/api/meetings/active', async (req, res) => {
  try {
    const activeMeetings = await meetingHistoryManager.getActiveMeetings();
    
    res.json({
      success: true,
      data: activeMeetings,
      count: activeMeetings.length
    });
  } catch (error) {
    console.error('❌ Failed to get active meetings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active meetings'
    });
  }
});

// API endpoint to get persistent meeting statistics
app.get('/api/meetings/persistent/statistics', async (req, res) => {
  try {
    const stats = await meetingHistoryManager.getMeetingStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Failed to get persistent meeting statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get meeting statistics'
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Handle ping for connection testing
  socket.on('ping', (data) => {
    console.log('Ping received from:', socket.id, data);
    socket.emit('pong', { message: 'pong', timestamp: new Date().toISOString() });
  });

  // Join meeting room
  socket.on('join-meeting', ({ meetingId, userName, meetingTitle, isHost }) => {
    console.log(`👤 ${userName} (${socket.id}) joining meeting ${meetingId}`);
    console.log(`🔍 Join data:`, { meetingId, userName, meetingTitle, isHost });
    console.log('🔍 userName type:', typeof userName, 'length:', userName?.length);
    console.log('🔍 meetingTitle type:', typeof meetingTitle, 'value:', meetingTitle);
    console.log('🔍 isHost type:', typeof isHost, 'value:', isHost);
    console.log('🔍 Current meeting state before join:', {
      meetingExists: !!activeMeetings.get(meetingId),
      hostId: activeMeetings.get(meetingId)?.hostId,
      participants: activeMeetings.get(meetingId)?.participants?.length || 0,
      pendingApprovals: activeMeetings.get(meetingId)?.pendingApprovals?.length || 0
    });
    
    // Handle empty or undefined userName
    if (!userName || userName.trim() === '') {
      console.log('⚠️ Empty userName detected, using default name');
      userName = 'Guest';
    }

    let meeting = activeMeetings.get(meetingId);
    
    // Check if participant already exists in this meeting (by socket ID)
    if (meeting) {
      const existingParticipant = meeting.participants.find(p => p.id === socket.id);
      if (existingParticipant) {
        console.log(`⚠️ Participant ${userName} (${socket.id}) already exists in meeting ${meetingId}, skipping duplicate join`);
        
        // Just send meeting info without adding to pending approvals
        socket.emit('meeting-info', {
          meetingId,
          hostId: meeting.hostId,
          hostName: meeting.host,
          participants: meeting.participants,
          isHost: existingParticipant.isHost
        });
        
        // If already approved, send approval notification
        if (existingParticipant.isApproved) {
          socket.emit('participant-approved', {
            message: 'You have been approved to join the meeting',
            meetingId,
            hostId: meeting.hostId,
            hostName: meeting.host
          });
        }
        return;
      }
      
      // Check if same user name already exists (for multi-tab scenarios)
      const existingUser = meeting.participants.find(p => p.name === userName && p.id !== socket.id);
      if (existingUser) {
        console.log(`⚠️ User ${userName} already exists in meeting ${meetingId} with different socket ID`);
        console.log(`⚠️ Existing: ${existingUser.id}, New: ${socket.id}`);
        
        // For multi-tab scenarios, add a simple number suffix
        const uniqueUserName = `${userName} (${meeting.participants.length + 1})`;
        console.log(`🔄 Renaming new participant to: ${uniqueUserName}`);
        userName = uniqueUserName;
      }
    }
    
    // If meeting doesn't exist, create it automatically
    if (!meeting) {
      console.log(`🆕 Creating new meeting ${meetingId} for ${userName}`);
      const finalTitle = meetingTitle || `Meeting ${meetingId}`;
      console.log('🔍 Backend: Creating meeting with title:', finalTitle);
      console.log('🔍 Backend: Original meetingTitle:', meetingTitle);
      
      meeting = {
        id: meetingId,
        title: finalTitle, // Use provided title or default
        host: null, // Will be set later if user becomes host
        hostId: null, // Will be set later if user becomes host
        participants: [],
        createdAt: new Date(),
        status: 'active',
        pendingApprovals: []
      };
      activeMeetings.set(meetingId, meeting);
    } else {
      console.log(`♻️ Using existing meeting ${meetingId} with ${meeting.participants.length} participants`);
    }
    
    // Use the isHost parameter from frontend, with fallback logic
    const isFirstParticipant = meeting.participants.length === 0 && !meeting.hostId;
    
    // Check if this user is the original host reconnecting (by username)
    const isOriginalHostReconnecting = meeting.hostId && 
      meeting.host && 
      meeting.host.includes(userName) && 
      meeting.host.includes('(Host)');
    
    // Use frontend isHost parameter, or fallback to first participant logic
    const becomesHost = isHost === true || isFirstParticipant || isOriginalHostReconnecting;
    
    console.log('🔍 SIMPLE Host detection logic:');
    console.log('  - isHost parameter:', isHost);
    console.log('  - isFirstParticipant:', isFirstParticipant, '(participants.length:', meeting.participants.length, ')');
    console.log('  - meeting.hostId:', meeting.hostId);
    console.log('  - meeting.host:', meeting.host);
    console.log('  - userName:', userName);
    console.log('  - isOriginalHostReconnecting:', isOriginalHostReconnecting);
    console.log('  - Final becomesHost:', becomesHost);
    console.log('  - Meeting exists:', !!meeting);
    console.log('  - Meeting participants before adding:', meeting.participants.map(p => ({ name: p.name, id: p.id, isHost: p.isHost })));
    
    // Add participant to meeting
    const participant = {
      id: socket.id,
      name: becomesHost ? `${userName} (Host)` : userName,
      joinedAt: new Date(),
      isHost: becomesHost,
      isApproved: becomesHost // Host is auto-approved
    };
    
    meeting.participants.push(participant);
    
    
    // If this user is the host, set them as host
    if (becomesHost) {
      meeting.host = `${userName} (Host)`;
      meeting.hostId = socket.id;
      console.log(`👑 ${userName} is now the host of meeting ${meetingId} with socket ID: ${socket.id}`);
      console.log(`👑 Host name set to: "${meeting.host}"`);
      
      // Initialize AI features for this meeting
      console.log(`🤖 Initializing AI features for meeting ${meetingId}...`);
      llmService.reinitializeForMeeting(meetingId).then((aiAvailable) => {
        if (aiAvailable) {
          console.log(`✅ AI features are ready for meeting ${meetingId}`);
          // Notify host that AI is ready
          socket.emit('ai_status', {
            meetingId,
            status: 'ready',
            message: 'AI-powered features are active'
          });
        } else {
          console.log(`⚠️ AI features are limited for meeting ${meetingId} (using fallback)`);
          // Notify host that AI is limited
          socket.emit('ai_status', {
            meetingId,
            status: 'limited',
            message: 'AI features are limited (using basic mode)'
          });
        }
      }).catch((error) => {
        console.error(`❌ Failed to initialize AI for meeting ${meetingId}:`, error);
        socket.emit('ai_status', {
          meetingId,
          status: 'error',
          message: 'AI features are not available'
        });
      });
    }
    
    socket.join(meetingId);
    
    // If user is not the host, add to pending approval list
    if (!becomesHost) {
      meeting.pendingApprovals = meeting.pendingApprovals || [];
      meeting.pendingApprovals.push(participant);
      
      // Notify host about pending approval
      console.log(`📤 Emitting pending-approval to host ${meeting.hostId} for participant ${participant.name}`);
      
      // Check if host is still connected
      const hostSocket = io.sockets.sockets.get(meeting.hostId);
      console.log(`🔍 Debug: Looking for host socket ID: ${meeting.hostId}`);
      console.log(`🔍 Debug: Available socket IDs:`, Array.from(io.sockets.sockets.keys()));
      
      if (hostSocket) {
        hostSocket.emit('pending-approval', participant);
        console.log(`✅ Host ${meeting.hostId} is connected, sent pending-approval`);
      } else {
        console.log(`❌ Host ${meeting.hostId} is not connected, pending approval stored for when host reconnects`);
        console.log(`🔍 Debug: Host socket not found in active sockets`);
        console.log(`📝 Pending approval stored: ${participant.name} (${participant.id})`);
      }
      
      // Send waiting for approval message to participant
      socket.emit('waiting-for-approval', { 
        message: 'Waiting for host approval to join the meeting',
        participantId: socket.id
      });
      
      console.log(`${userName} is waiting for approval in meeting ${meetingId}`);
      return;
    }
    
    // Update all participants with the latest meeting state
    const updatedMeeting = activeMeetings.get(meetingId);
    
    // Notify others in the meeting with updated participant list (only if there are other participants)
    console.log(`📊 Host joined - participants count: ${updatedMeeting.participants.length}`);
    if (updatedMeeting.participants.length > 1) {
      console.log(`📤 Emitting participant-joined for host joining`);
      socket.to(meetingId).emit('participant-joined', { participant, meeting: updatedMeeting });
    } else {
      console.log(`📊 Host is first participant, no participant-joined event needed`);
    }
    
    // Send meeting info to the new participant (including all participants)
    const meetingForClient = {
      ...updatedMeeting,
      participants: updatedMeeting.participants // Include all participants, including current user
    };
    
    socket.emit('meeting-joined', { 
      meeting: meetingForClient, 
      participantId: socket.id,
      isHost: participant.isHost
    });

    // If this is the host, update the hostId in case they reconnected
    if (participant.isHost) {
      console.log(`🔄 Host reconnected, updating hostId from ${meeting.hostId} to ${socket.id}`);
      meeting.hostId = socket.id;
      
      // Send individual pending approvals to host
      if (meeting.pendingApprovals && meeting.pendingApprovals.length > 0) {
        console.log(`📝 Host has ${meeting.pendingApprovals.length} pending approvals - sending individual approvals`);
        // Send each pending approval individually
        meeting.pendingApprovals.forEach(pendingParticipant => {
          console.log(`📤 Sending pending-approval to host for: ${pendingParticipant.name}`);
          socket.emit('pending-approval', pendingParticipant);
        });
      } else {
        console.log(`📝 No pending approvals to send to reconnected host`);
      }
    }
    
    console.log(`${userName} joined meeting ${meetingId}${isFirstParticipant ? ' as HOST' : ''}`);
    console.log(`📊 Meeting ${meetingId} now has ${meeting.participants.length} participants`);
    console.log(`👥 Participants:`, meeting.participants.map(p => ({ name: p.name, id: p.id, isHost: p.isHost })));
  });

  // Handle WebRTC signaling
  socket.on('offer', ({ to, offer }) => {
    console.log(`📤 Offer from ${socket.id} to ${to}`);
    console.log(`📊 Offer SDP length: ${offer?.sdp?.length || 'unknown'}`);
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    console.log(`📤 Answer from ${socket.id} to ${to}`);
    console.log(`📊 Answer SDP length: ${answer?.sdp?.length || 'unknown'}`);
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    console.log(`🧊 ICE candidate from ${socket.id} to ${to}`);
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Handle SimplePeer signaling
  socket.on('signal', ({ to, from, signal }) => {
    console.log(`📡 SimplePeer signal from ${from} to ${to}:`, {
      signalType: signal.type,
      hasSDP: !!signal.sdp,
      hasCandidate: !!signal.candidate
    });
    socket.to(to).emit('signal', { from, signal });
  });

  // Handle force connection requests
  socket.on('force-connection', ({ targetId, fromId, meetingId }) => {
    console.log(`🔗 FORCE: Force connection request from ${fromId} to ${targetId} in meeting ${meetingId}`);
    
    // Forward the force connection request to the target
    socket.to(targetId).emit('force-connection', {
      targetId,
      fromId,
      meetingId
    });
    
    console.log(`🔗 FORCE: Forwarded force connection request to ${targetId}`);
  });

  // Handle new participant joining - notify existing participants
  socket.on('participant-ready', ({ meetingId, participantId }) => {
    console.log(`🎯 Participant ${participantId} ready in meeting ${meetingId}`);
    
    // Find the meeting and participant
    const meeting = activeMeetings.get(meetingId);
    if (meeting) {
      const participant = meeting.participants.find(p => p.id === participantId);
      if (participant) {
        // Only allow approved participants to trigger WebRTC connections
        if (participant.isApproved) {
          console.log(`👤 ${participant.name} (${participantId}) is ready for WebRTC connections`);
          console.log(`📊 Total participants in meeting: ${meeting.participants.length}`);
          console.log(`📊 Forwarding participant-ready to meeting room: ${meetingId}`);
          console.log(`📊 Meeting participants:`, meeting.participants.map(p => ({ name: p.name, id: p.id, isApproved: p.isApproved })));
          
          // Forward the event to ALL other participants (multi-participant support)
          const otherParticipants = meeting.participants.filter(p => p.id !== participantId && p.isApproved);
          console.log(`📤 MULTI-PARTICIPANT: Participant ${participant.name} is ready, notifying ${otherParticipants.length} other participants`);
          console.log(`📤 MULTI-PARTICIPANT: Other participants:`, otherParticipants.map(p => ({ id: p.id, name: p.name })));
          
          otherParticipants.forEach(otherParticipant => {
            console.log(`📤 MULTI-PARTICIPANT: Notifying ${otherParticipant.name} (${otherParticipant.id}) that ${participant.name} is ready`);
            socket.to(otherParticipant.id).emit('participant-ready', { 
              participantId, 
              participantName: participant.name 
            });
          });
          
          console.log(`📤 MULTI-PARTICIPANT: Emitted participant-ready to ${otherParticipants.length} participants`);
        } else {
          console.log(`⚠️ Participant ${participant.name} (${participantId}) is not approved yet, ignoring participant-ready`);
        }
      } else {
        console.log(`❌ Participant ${participantId} not found in meeting ${meetingId}`);
      }
    } else {
      console.log(`❌ Meeting ${meetingId} not found`);
    }
  });

  // Handle participant removal by host
  socket.on('remove-participant', ({ meetingId, participantId }) => {
    console.log(`🗑️ Host ${socket.id} requesting to remove participant ${participantId} from meeting ${meetingId}`);
    const meeting = activeMeetings.get(meetingId);
    
    console.log(`🗑️ DEBUG: Current meeting state before removal:`, {
      meetingId,
      hostId: meeting?.hostId,
      participants: meeting?.participants?.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
      requesterSocketId: socket.id
    });
    if (!meeting) {
      console.log(`❌ Meeting ${meetingId} not found`);
      return;
    }
    
    // Check if the requester is the host
    if (meeting.hostId !== socket.id) {
      console.log(`❌ Only host can remove participants. Requester: ${socket.id}, Host: ${meeting.hostId}`);
      return;
    }
    
    // Find the participant to remove
    const participantIndex = meeting.participants.findIndex(p => p.id === participantId);
    if (participantIndex === -1) {
      console.log(`❌ Participant ${participantId} not found in meeting ${meetingId}`);
      console.log(`❌ Available participants:`, meeting.participants.map(p => ({ id: p.id, name: p.name })));
      return;
    }
    
    const participant = meeting.participants[participantIndex];
    console.log(`🗑️ Removing participant: ${participant.name} (${participantId})`);
    
    // Remove participant from meeting
    meeting.participants.splice(participantIndex, 1);
    
    // Remove from pending approvals if exists
    if (meeting.pendingApprovals) {
      meeting.pendingApprovals = meeting.pendingApprovals.filter(p => p.id !== participantId);
    }
    
    // Notify the removed participant
    console.log(`🗑️ DEBUG: Notifying removed participant ${participantId}`);
    socket.to(participantId).emit('participant-removed', {
      message: 'You have been removed from the meeting by the host',
      meetingId,
      hostName: meeting.host
    });
    
    // Notify all remaining participants (including the host who initiated the removal)
    console.log(`🗑️ DEBUG: Notifying all participants in meeting ${meetingId} about removal`);
    console.log(`🗑️ DEBUG: Remaining participants:`, meeting.participants.map(p => ({ id: p.id, name: p.name })));
    console.log(`🗑️ DEBUG: Emitting participant-left event to meeting room ${meetingId}`);
    console.log(`🗑️ DEBUG: Event data:`, {
      participantId,
      participantName: participant.name,
      reason: 'removed by host'
    });
    
    // Emit to ALL participants in the meeting room (including the host)
    io.to(meetingId).emit('participant-left', {
      participantId,
      participantName: participant.name,
      reason: 'removed by host'
    });
    
    console.log(`🗑️ DEBUG: participant-left event emitted to meeting room ${meetingId} (including host)`);
    
    // Update meeting state
    activeMeetings.set(meetingId, meeting);
    
    console.log(`✅ Participant ${participant.name} removed successfully. Remaining participants: ${meeting.participants.length}`);
    console.log(`✅ DEBUG: Final meeting state:`, {
      meetingId,
      participants: meeting.participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
    });
  });

  // Handle host camera/mic requests
  socket.on('host-request-camera-mic', (data) => {
    console.log(`📤 Host ${socket.id} requesting camera/mic access:`, data);
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found`);
      return;
    }
    
    // Check if the requester is the host
    if (meeting.hostId !== socket.id) {
      console.log(`❌ Only host can request camera/mic access. Requester: ${socket.id}, Host: ${meeting.hostId}`);
      return;
    }
    
    // Send request to all participants except host
    const participants = meeting.participants.filter(p => p.id !== meeting.hostId && p.isApproved);
    console.log(`📤 Sending camera/mic request to ${participants.length} participants`);
    
    participants.forEach(participant => {
      socket.to(participant.id).emit('host-camera-mic-request', {
        ...data,
        requestId: data.timestamp,
        hostName: meeting.host
      });
    });
    
    // Set timeout to expire the request
    setTimeout(() => {
      participants.forEach(participant => {
        socket.to(participant.id).emit('camera-mic-request-expired', {
          requestId: data.timestamp
        });
      });
    }, 30000); // 30 seconds to respond
  });

  // Handle media state changes (camera/audio toggle) with intelligent recording
  socket.on('media-state-change', (data) => {
    console.log(`📡 Media state change from ${data.participantId}:`, {
      audioEnabled: data.audioEnabled,
      videoEnabled: data.videoEnabled
    });
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found for media state change`);
      return;
    }
    
    // Update participant's media state in meeting data
    const participant = meeting.participants.find(p => p.id === data.participantId);
    if (participant) {
      participant.audioEnabled = data.audioEnabled;
      participant.videoEnabled = data.videoEnabled;
      console.log(`✅ Updated media state for participant ${participant.name}:`, {
        audioEnabled: data.audioEnabled,
        videoEnabled: data.videoEnabled
      });
    }
    
    // Update intelligent recording with media state
    const mediaState = {
      videoEnabled: data.videoEnabled,
      audioEnabled: data.audioEnabled,
      hasVideo: data.hasVideo || false,
      hasAudio: data.hasAudio || false
    };
    
    mediaRecorder.updateParticipantMediaState(data.meetingId, data.participantId, mediaState);
    
    // Get intelligent recording configuration
    const recordingConfig = mediaRecorder.getIntelligentRecordingConfig(data.meetingId);
    if (recordingConfig) {
      console.log(`🎬 Recording strategy updated for meeting ${data.meetingId}:`, recordingConfig.strategy);
      
      // Emit recording strategy update to host
      io.to(meeting.hostId).emit('recording_strategy_updated', {
        meetingId: data.meetingId,
        strategy: recordingConfig.strategy,
        hasVideo: recordingConfig.hasVideo,
        hasAudio: recordingConfig.hasAudio,
        videoStreamCount: recordingConfig.videoStreamCount,
        audioStreamCount: recordingConfig.audioStreamCount
      });
    }
    
    // Broadcast media state change to all participants (including the host)
    console.log(`📡 Broadcasting media state change to meeting ${data.meetingId}:`, {
      participantId: data.participantId,
      audioEnabled: data.audioEnabled,
      videoEnabled: data.videoEnabled
    });
    
    io.to(data.meetingId).emit('participant-media-state-changed', {
      participantId: data.participantId,
      audioEnabled: data.audioEnabled,
      videoEnabled: data.videoEnabled,
      timestamp: data.timestamp
    });
    
    console.log(`📡 Media state change broadcasted to meeting ${data.meetingId}`);
  });

  // Handle participant approval of camera/mic request
  socket.on('camera-mic-request-approved', (data) => {
    console.log(`✅ Participant ${data.participantId} approved camera/mic request:`, data);
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found`);
      return;
    }
    
    // Notify host about approval
    socket.to(meeting.hostId).emit('participant-camera-mic-approved', {
      participantId: data.participantId,
      requestId: data.requestId,
      streamId: data.streamId
    });
    
    // Set timeout to automatically end the session
    setTimeout(() => {
      socket.to(meeting.hostId).emit('participant-camera-mic-session-ended', {
        participantId: data.participantId,
        requestId: data.requestId
      });
      
      socket.to(data.participantId).emit('camera-mic-session-ended', {
        requestId: data.requestId
      });
    }, data.duration * 1000); // Convert seconds to milliseconds
  });

  // Handle participant denial of camera/mic request
  socket.on('camera-mic-request-denied', (data) => {
    console.log(`❌ Participant ${data.participantId} denied camera/mic request:`, data);
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found`);
      return;
    }
    
    // Notify host about denial
    socket.to(meeting.hostId).emit('participant-camera-mic-denied', {
      participantId: data.participantId,
      requestId: data.requestId
    });
  });

  // Handle camera/mic session ended
  socket.on('camera-mic-session-ended', (data) => {
    console.log(`⏰ Camera/mic session ended for participant ${data.participantId}:`, data);
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found`);
      return;
    }
    
    // Notify host that session ended
    socket.to(meeting.hostId).emit('participant-camera-mic-session-ended', {
      participantId: data.participantId,
      requestId: data.requestId
    });
  });

  // Handle host approval of participants
  socket.on('approve-participant', ({ meetingId, participantId, approved }) => {
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) return;
    
    const participant = meeting.participants.find(p => p.id === participantId);
    if (!participant) return;
    
    if (approved) {
      // Approve participant
      participant.isApproved = true;
      
      // Remove from pending approvals
      if (meeting.pendingApprovals) {
        meeting.pendingApprovals = meeting.pendingApprovals.filter(p => p.id !== participantId);
      }
      
      // Notify participant they're approved
      console.log(`📤 APPROVAL: Sending participant-approved to ${participantId}`);
      console.log(`📤 APPROVAL: Host name: "${meeting.host}"`);
      socket.to(participantId).emit('participant-approved', { 
        message: 'You have been approved to join the meeting',
        meetingId,
        hostId: meeting.hostId,
        hostName: meeting.host
      });
      
      // Notify all participants about new approved participant (excluding the approved participant themselves)
      console.log(`📤 Emitting participant-joined to meeting room ${meetingId} for participant ${participant.name}`);
      console.log(`📤 Socket rooms for current socket:`, Array.from(socket.rooms));
      
      // Emit to all participants in the meeting room (including host) but exclude the approved participant
      console.log(`📤 Emitting participant-joined to meeting room ${meetingId} (excluding participant ${participantId})`);
      console.log(`📤 Meeting participants before emission:`, meeting.participants.map(p => ({ name: p.name, id: p.id, isHost: p.isHost, isApproved: p.isApproved })));
      console.log(`📤 Host ID: ${meeting.hostId}`);
      
      // Check if host is in the meeting room
      const hostSocket = io.sockets.sockets.get(meeting.hostId);
      if (hostSocket) {
        console.log(`📤 Host socket found: ${meeting.hostId}, rooms:`, Array.from(hostSocket.rooms));
        const isHostInMeetingRoom = Array.from(hostSocket.rooms).includes(meetingId);
        console.log(`📤 Host is in meeting room ${meetingId}:`, isHostInMeetingRoom);
      } else {
        console.log(`❌ Host socket not found: ${meeting.hostId}`);
      }
      
      // Emit to ALL existing participants about the new participant
      console.log(`📤 MULTI-PARTICIPANT: Notifying all participants about new participant: ${participant.name}`);
      console.log(`📤 MULTI-PARTICIPANT: Participant data:`, { id: participant.id, name: participant.name, isApproved: participant.isApproved });
      
      // Notify all existing participants (excluding the new participant) about the new participant
      const existingParticipants = meeting.participants.filter(p => p.id !== participantId);
      console.log(`📤 MULTI-PARTICIPANT: Existing participants to notify:`, existingParticipants.map(p => ({ id: p.id, name: p.name })));
      
      // Emit to the meeting room (all participants except the new one)
      console.log(`📤 MULTI-PARTICIPANT: Emitting participant-joined to meeting room ${meetingId} (excluding ${participantId})`);
      socket.to(meetingId).emit('participant-joined', { participant, meeting });
      
      // Also send info about all existing participants to the new participant
      console.log(`📤 MULTI-PARTICIPANT: Sending existing participants info to new participant: ${participantId}`);
      existingParticipants.forEach(existingParticipant => {
        console.log(`📤 MULTI-PARTICIPANT: Sending info about ${existingParticipant.name} (${existingParticipant.id}) to new participant`);
        socket.to(participantId).emit('participant-joined', { participant: existingParticipant, meeting });
      });
      
      console.log(`📤 Participant-joined event sent to meeting room ${meetingId}`);
      console.log(`📤 Participant will emit their own participant-ready event after approval`);
      
      console.log(`Participant ${participant.name} approved in meeting ${meetingId}`);
    } else {
      // Reject participant
      meeting.participants = meeting.participants.filter(p => p.id !== participantId);
      
      // Remove from pending approvals
      if (meeting.pendingApprovals) {
        meeting.pendingApprovals = meeting.pendingApprovals.filter(p => p.id !== participantId);
      }
      
      // Notify participant they're rejected
      socket.to(participantId).emit('participant-rejected', { 
        message: 'Your request to join the meeting was rejected'
      });
      
      // Remove from meeting room
      socket.to(participantId).emit('leave-meeting', { meetingId });
      
      console.log(`Participant ${participant.name} rejected from meeting ${meetingId}`);
    }
  });

  // Handle screen sharing
  socket.on('screen-share-start', ({ meetingId }) => {
    socket.to(meetingId).emit('screen-share-start', { from: socket.id });
  });

  socket.on('screen-share-stop', ({ meetingId }) => {
    socket.to(meetingId).emit('screen-share-stop', { from: socket.id });
  });

  // Handle screen sharing changes (start/stop with stream info)
  socket.on('screen-share-change', ({ meetingId, participantId, isSharing, streamId }) => {
    console.log('🖥️ Screen sharing change:', { meetingId, participantId, isSharing, streamId });
    socket.to(meetingId).emit('screen-share-change', { 
      participantId, 
      isSharing, 
      streamId 
    });
  });

  // Handle chat messages
  socket.on('chat-message', ({ meetingId, message }) => {
    console.log('💬 Backend received chat message:', { meetingId, message });
    
    // Extract userName from the message object if it exists
    const userName = message.userName || 'Unknown User';
    const messageText = message.message || message;
    
    const chatMessage = {
      from: socket.id,
      userName,
      message: messageText,
      timestamp: new Date()
    };
    
    console.log('💬 Backend broadcasting chat message:', chatMessage);
    io.to(meetingId).emit('chat-message', chatMessage);
  });

  // Handle sentiment updates from participants
  socket.on('sentiment_update', ({ participantId, meetingId, sentimentData: receivedSentimentData }) => {
    console.log('🧠 Received sentiment update:', { participantId, meetingId, sentimentData: receivedSentimentData });
    
    // Extract emotion from sentimentData object (now using actual facial expressions)
    const emotion = receivedSentimentData?.emotion || 'neutral';
    
    // Initialize sentiment data for meeting if it doesn't exist
    if (!sentimentData.has(meetingId)) {
      sentimentData.set(meetingId, {
        participants: new Map(),
        lastUpdated: Date.now()
      });
    }
    
    const meetingSentimentData = sentimentData.get(meetingId);
    
    // Update participant emotion
    meetingSentimentData.participants.set(participantId, {
      emotion,
      timestamp: Date.now(),
      participantId
    });
    meetingSentimentData.lastUpdated = Date.now();
    
    // Clean up stale sentiment data (older than 30 seconds)
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds
    meetingSentimentData.participants.forEach((data, key) => {
      if (now - data.timestamp > staleThreshold) {
        console.log('🧹 Removing stale sentiment data for participant:', key);
        meetingSentimentData.participants.delete(key);
      }
    });
    
    // Aggregate emotion data
    const sentimentCounts = {};
    meetingSentimentData.participants.forEach((data) => {
      sentimentCounts[data.emotion] = (sentimentCounts[data.emotion] || 0) + 1;
    });
    
    const aggregatedData = {
      meetingId,
      totalParticipants: meetingSentimentData.participants.size,
      sentimentCounts,
      lastUpdated: meetingSentimentData.lastUpdated,
      participants: Array.from(meetingSentimentData.participants.values())
    };
    
    console.log('📊 Aggregated sentiment data:', aggregatedData);
    
    // Store fatigue data for historical analysis
    if (!fatigueData.has(meetingId)) {
      fatigueData.set(meetingId, {
        history: [],
        lastUpdated: Date.now()
      });
    }
    
    const meetingFatigueData = fatigueData.get(meetingId);
    const fatiguePercentage = calculateFatiguePercentage(sentimentCounts, meetingSentimentData.participants.size);
    
    // Add to fatigue history
    meetingFatigueData.history.push({
      timestamp: now,
      fatiguePercentage,
      sentimentCounts,
      totalParticipants: meetingSentimentData.participants.size
    });
    
    // Keep only last 5 minutes of fatigue history
    meetingFatigueData.history = meetingFatigueData.history.filter(
      entry => now - entry.timestamp <= HISTORY_DURATION
    );
    
    meetingFatigueData.lastUpdated = now;
    
    console.log('🧠 Updated fatigue data:', {
      meetingId,
      fatiguePercentage: Math.round(fatiguePercentage),
      historyLength: meetingFatigueData.history.length,
      sentimentCounts,
      totalParticipants: meetingSentimentData.participants.size,
      fatigueEmotions: ['sad', 'disgusted', 'angry', 'fearful'].map(e => ({ emotion: e, count: sentimentCounts[e] || 0 }))
    });
    
    // Send aggregated data to host only
    const meeting = activeMeetings.get(meetingId);
    if (meeting && meeting.hostId) {
      const hostSocket = io.sockets.sockets.get(meeting.hostId);
      if (hostSocket) {
        hostSocket.emit('sentiment_dashboard_update', aggregatedData);
        console.log('📤 Sent sentiment dashboard update to host:', meeting.hostId);
      }
    }
    
    // Check for fatigue after updating sentiment data
    checkFatigue(meetingId);
  });


  // Handle participant leaving
  socket.on('leave-meeting', ({ meetingId, userName }) => {
    const meeting = activeMeetings.get(meetingId);
    if (meeting) {
      const leavingParticipant = meeting.participants.find(p => p.id === socket.id);
      meeting.participants = meeting.participants.filter(p => p.id !== socket.id);
      
      // If host is leaving and there are other participants, transfer host role
      if (leavingParticipant && leavingParticipant.isHost && meeting.participants.length > 0) {
        const newHost = meeting.participants[0];
        newHost.isHost = true;
        meeting.host = newHost.name;
        meeting.hostId = newHost.id;
        
        // Notify all participants about host change
        io.to(meetingId).emit('host-changed', {
          newHost: newHost.name,
          newHostId: newHost.id
        });
        
        console.log(`Host transferred from ${userName} to ${newHost.name} in meeting ${meetingId}`);
      }
      
      if (meeting.participants.length === 0) {
        // Only remove meeting if there are no pending approvals either
        const hasPendingApprovals = meeting.pendingApprovals && meeting.pendingApprovals.length > 0;
        
        if (!hasPendingApprovals) {
          
          // Keep meeting alive for 5 minutes to allow participants to join
          console.log(`Meeting ${meetingId} will be deleted in 5 minutes - no participants and no pending approvals`);
          setTimeout(() => {
            const currentMeeting = activeMeetings.get(meetingId);
            if (currentMeeting && currentMeeting.participants.length === 0) {
              activeMeetings.delete(meetingId);
              console.log(`Meeting ${meetingId} ended after 5 minutes - no participants and no pending approvals`);
            }
          }, 300000); // 5 minutes instead of 30 seconds
        } else {
          console.log(`Meeting ${meetingId} kept alive - has ${meeting.pendingApprovals.length} pending approvals`);
        }
      }
    }
    
    socket.to(meetingId).emit('participant-left', { 
      participantId: socket.id, 
      userName 
    });
    
    socket.leave(meetingId);
    console.log(`${userName} left meeting ${meetingId}`);
  });

  // AI-Driven Smart Follow-up Question Generation - Audio Data Handler with Intelligent Recording
  socket.on('audio_data', async (data) => {
    try {
      console.log('🎤 Received audio data:', { meetingId: data.meetingId, chunkIndex: data.chunkIndex });
      
      // Process audio with intelligent stream handling
      mediaRecorder.processAudioChunk(data.meetingId, socket.id, data.audioChunk, data.timestamp);
      
      // Process audio for transcription
      const transcriptionResult = await llmService.getTranscription(data.audioChunk, data.meetingId);
      
      if (transcriptionResult && transcriptionResult.transcript) {
        // Add to transcript history
        llmService.addToTranscriptHistory(data.meetingId, transcriptionResult.transcript);
        
        // Send transcription result back to client
        socket.emit('transcription_result', {
          meetingId: data.meetingId,
          transcript: transcriptionResult.transcript,
          confidence: transcriptionResult.confidence,
          timestamp: transcriptionResult.timestamp
        });
        
        console.log('📝 Sent transcription result:', transcriptionResult.transcript);
      }
      
    } catch (error) {
      console.error('❌ Audio processing failed:', error);
      socket.emit('transcription_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // AI-Driven Smart Follow-up Question Generation - Question Generation Timer
  socket.on('start_question_generation', (data) => {
    const { meetingId } = data;
    console.log('🤖 Starting question generation for meeting:', meetingId);
    
    // Set up intelligent question generation (every 60 seconds - reduced frequency)
    const questionTimer = setInterval(async () => {
      try {
        // Get recent transcript context
        const recentContext = llmService.getRecentTranscriptContext(meetingId, 5);
        
        console.log('🤖 Question generation check:', {
          meetingId,
          contextLength: recentContext.length,
          context: recentContext.substring(0, 100) + '...'
        });
        
        // More strict validation - require substantial conversation
        if (recentContext.length < 200) {
          console.log('📝 Skipping question generation - insufficient transcript context (need at least 200 chars)');
          return;
        }
        
        // Check if context contains actual conversation (not just empty strings)
        const meaningfulWords = recentContext.split(/\s+/).filter(word => word.length > 2).length;
        if (meaningfulWords < 20) {
          console.log('📝 Skipping question generation - insufficient meaningful words (need at least 20 words)');
          return;
        }
        
        // Use intelligent question generation trigger
        if (!llmService.shouldGenerateQuestionIntelligently(meetingId, recentContext)) {
          console.log('⏰ Skipping question generation - not a good time for questions');
          return;
        }
        
        // Generate follow-up question
        const questionResult = await llmService.generateFollowUpQuestion(recentContext, meetingId);
        
        if (questionResult && questionResult.question) {
          // Update last question time
          llmService.updateLastQuestionTime(meetingId);
          
          // Send question suggestion to host
          const meeting = activeMeetings.get(meetingId);
          if (meeting && meeting.hostId) {
            io.to(meeting.hostId).emit('follow_up_suggestion', {
              meetingId,
              question: questionResult.question,
              topics: questionResult.topics,
              sentiment: questionResult.sentiment,
              confidence: questionResult.confidence,
              timestamp: questionResult.timestamp
            });
            
            console.log('❓ Sent intelligent follow-up question to host:', questionResult.question);
          }
        }
        
      } catch (error) {
        console.error('❌ Question generation failed:', error);
      }
    }, 60000); // Check every 60 seconds - reduced frequency
    
    // Store timer for cleanup
    llmService.questionGenerationTimer.set(meetingId, questionTimer);
  });

  // Stop question generation
  socket.on('stop_question_generation', (data) => {
    const { meetingId } = data;
    console.log('🛑 Stopping question generation for meeting:', meetingId);
    
    if (llmService.questionGenerationTimer.has(meetingId)) {
      clearInterval(llmService.questionGenerationTimer.get(meetingId));
      llmService.questionGenerationTimer.delete(meetingId);
    }
  });

  // Real-Time Meeting Recording - Start Recording
  socket.on('start_recording', async (data) => {
    try {
      const { meetingId, options } = data;
      console.log('🎬 Starting recording for meeting:', meetingId);
      
      const sessionId = await mediaRecorder.startRecording(meetingId, options);
      
      // Notify all participants that recording has started
      io.to(meetingId).emit('recording_started', {
        meetingId,
        sessionId,
        timestamp: Date.now()
      });
      
      console.log('✅ Recording started successfully:', sessionId);
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      socket.emit('recording_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // Real-Time Meeting Recording - Stop Recording
  socket.on('stop_recording', async (data) => {
    try {
      const { meetingId } = data;
      console.log('🛑 Stopping recording for meeting:', meetingId);
      
      const recordingPath = await mediaRecorder.stopRecording(meetingId);
      
      // Notify all participants that recording has stopped
      io.to(meetingId).emit('recording_stopped', {
        meetingId,
        recordingPath,
        timestamp: Date.now()
      });
      
      console.log('✅ Recording stopped successfully:', recordingPath);
      
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      socket.emit('recording_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // Real-Time Meeting Recording - Add Audio Chunk
  socket.on('audio_chunk', async (data) => {
    try {
      const { meetingId, audioChunk } = data;
      
      // Add to media recorder if recording is active
      if (mediaRecorder.isRecording(meetingId)) {
        await mediaRecorder.addAudioChunk(meetingId, Buffer.from(audioChunk));
      }
      
    } catch (error) {
      console.error('❌ Failed to process audio chunk:', error);
    }
  });

  // Real-Time Meeting Recording - Add Video Frame
  socket.on('video_frame', async (data) => {
    try {
      const { meetingId, videoFrame } = data;
      
      // Add to media recorder if recording is active
      if (mediaRecorder.isRecording(meetingId)) {
        await mediaRecorder.addVideoFrame(meetingId, Buffer.from(videoFrame));
      }
      
    } catch (error) {
      console.error('❌ Failed to process video frame:', error);
    }
  });

  // AI-Generated Meeting Highlights - Mark Highlight Event
  socket.on('mark_highlight', (data) => {
    try {
      const { timestamp, meetingId, participantId, date, highlightType, description } = data;
      console.log('⭐ Highlight marked:', { meetingId, participantId, timestamp, date, highlightType, description });
      
      // Initialize highlight data for meeting if not exists
      if (!highlightData.has(meetingId)) {
        highlightData.set(meetingId, []);
      }
      
      // Add highlight timestamp with enhanced metadata
      const highlightEntry = {
        timestamp,
        participantId,
        date,
        id: uuidv4(),
        type: highlightType || 'general', // decision, action, important, question, etc.
        description: description || '',
        priority: 'high' // All manually marked highlights are high priority
      };
      
      highlightData.get(meetingId).push(highlightEntry);
      
      // Emit confirmation to all participants in the meeting
      io.to(meetingId).emit('highlight_marked', {
        meetingId,
        participantId,
        timestamp,
        totalHighlights: highlightData.get(meetingId).length,
        highlightType,
        description
      });
      
      console.log(`⭐ Total highlights for meeting ${meetingId}:`, highlightData.get(meetingId).length);
      
    } catch (error) {
      console.error('❌ Error marking highlight:', error);
      socket.emit('highlight_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // Free AI-Powered Automatic Highlight Detection - Transcript Update Event
  socket.on('transcript_update', (data) => {
    try {
      const { meetingId, participantId, transcript, timestamp, language, confidence } = data;
      console.log('📝 Transcript update received:', { meetingId, participantId, transcript: transcript.substring(0, 50) + '...', confidence });
      
      // Initialize transcript data for meeting if not exists
      if (!transcriptData.has(meetingId)) {
        transcriptData.set(meetingId, []);
      }
      
      // Store transcript entry
      const transcriptEntry = {
        timestamp,
        participantId,
        transcript,
        language,
        confidence,
        id: uuidv4()
      };
      
      transcriptData.get(meetingId).push(transcriptEntry);
      
      // Also add to LLM service for AI question generation
      llmService.addToTranscriptHistory(meetingId, transcript);
      
      // Analyze transcript for automatic highlight detection
      const highlight = aiHighlightDetector.analyzeAudioChunk(
        null, // No audio data for now, just text analysis
        timestamp,
        transcript
      );
      
      if (highlight) {
        console.log('🤖 AI detected highlight:', highlight);
        
        // Initialize highlight data for meeting if not exists
        if (!highlightData.has(meetingId)) {
          highlightData.set(meetingId, []);
        }
        
        // Add AI-detected highlight
        const highlightEntry = {
          timestamp: highlight.timestamp,
          participantId,
          date: new Date().toISOString(),
          id: uuidv4(),
          type: highlight.type,
          description: highlight.description,
          priority: 'medium', // AI-detected highlights are medium priority
          source: 'ai', // Mark as AI-generated
          confidence: highlight.importanceScore,
          context: highlight.context
        };
        
        highlightData.get(meetingId).push(highlightEntry);
        
        // Emit AI highlight to all participants
        io.to(meetingId).emit('ai_highlight_detected', {
          meetingId,
          participantId,
          timestamp: highlight.timestamp,
          type: highlight.type,
          description: highlight.description,
          confidence: highlight.importanceScore,
          totalHighlights: highlightData.get(meetingId).length
        });
        
        console.log(`🤖 AI highlight added for meeting ${meetingId}. Total highlights:`, highlightData.get(meetingId).length);
      }
      
    } catch (error) {
      console.error('❌ Error processing transcript update:', error);
    }
  });

  // AI-Generated Meeting Highlights - Start Recording Event
  socket.on('start_recording', (data) => {
    try {
      const { meetingId } = data;
      console.log('🎥 Starting recording for meeting:', meetingId);
      
      // Initialize recording session
      const recordingSession = {
        meetingId,
        startTime: Date.now(),
        isRecording: true,
        filePath: null
      };
      
      recordingSessions.set(meetingId, recordingSession);
      
      // Emit recording started event
      io.to(meetingId).emit('recording_started', {
        meetingId,
        startTime: recordingSession.startTime
      });
      
      console.log('🎥 Recording session started for meeting:', meetingId);
      
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      socket.emit('recording_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // AI-Generated Meeting Highlights - Stop Recording Event
  socket.on('stop_recording', (data) => {
    try {
      const { meetingId } = data;
      console.log('🛑 Stopping recording for meeting:', meetingId);
      
      const recordingSession = recordingSessions.get(meetingId);
      if (recordingSession) {
        recordingSession.isRecording = false;
        recordingSession.endTime = Date.now();
        
        // Emit recording stopped event
        io.to(meetingId).emit('recording_stopped', {
          meetingId,
          endTime: recordingSession.endTime,
          duration: recordingSession.endTime - recordingSession.startTime
        });
        
        console.log('🛑 Recording session stopped for meeting:', meetingId);
      }
      
    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      socket.emit('recording_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // AI-Generated Meeting Highlights - End Meeting Event
  socket.on('end_meeting', async (data) => {
    try {
      const { meetingId } = data;
      console.log('🏁 Meeting ended, generating highlight reel and saving to history for:', meetingId);
      
      // Get meeting data
      const meeting = activeMeetings.get(meetingId);
      if (!meeting) {
        console.log('❌ Meeting not found:', meetingId);
        return;
      }
      
      // Get highlight timestamps for this meeting
      let highlights = highlightData.get(meetingId) || [];
      const recordingSession = recordingSessions.get(meetingId);
      
      // Get transcript history
      const transcriptHistory = llmService.getTranscriptHistory(meetingId) || [];
      
      // Get sentiment data
      const sentimentData = sentimentData.get(meetingId);
      
      // Auto-detect additional important moments if few highlights were marked
      if (highlights.length < 3) {
        console.log('🔍 Auto-detecting additional important moments...');
        const autoHighlights = await detectImportantMoments(meetingId, highlights);
        highlights = [...highlights, ...autoHighlights];
        console.log(`🎯 Auto-detected ${autoHighlights.length} additional highlights`);
      }
      
      // Calculate meeting duration
      const meetingDuration = recordingSession ? 
        (recordingSession.endTime - recordingSession.startTime) : 
        (Date.now() - new Date(meeting.createdAt).getTime());
      
      // Update meeting data with duration
      meeting.duration = meetingDuration;
      meeting.endedAt = new Date().toISOString();
      meeting.status = 'completed';
      
      // Save meeting to history
      try {
        const historyPath = await meetingHistoryManager.saveMeetingToHistory(
          meeting,
          highlights,
          recordingSession,
          transcriptHistory,
          sentimentData
        );
        console.log('💾 Meeting saved to history:', historyPath);
        
        // Emit history saved event
        io.to(meetingId).emit('meeting_saved_to_history', {
          meetingId,
          historyPath,
          highlights: highlights.length,
          transcriptEntries: transcriptHistory.length,
          hasRecording: !!recordingSession
        });
      } catch (historyError) {
        console.error('❌ Failed to save meeting to history:', historyError);
      }
      
      if (highlights.length === 0) {
        console.log('📝 No highlights found for meeting:', meetingId);
        io.to(meetingId).emit('highlight_reel_status', {
          meetingId,
          status: 'no_highlights',
          message: 'No highlights were marked during this meeting'
        });
        return;
      }
      
      if (!recordingSession) {
        console.log('📹 No recording session found for meeting:', meetingId);
        io.to(meetingId).emit('highlight_reel_status', {
          meetingId,
          status: 'no_recording',
          message: 'No recording was found for this meeting'
        });
        return;
      }
      
      // Check if FFmpeg is available
      const ffmpegAvailable = await mediaProcessor.isFFmpegAvailable();
      
      let highlightReelPath;
      
      if (ffmpegAvailable) {
        // Generate actual highlight reel
        const outputPath = `./output/highlight_reel_${meetingId}_${Date.now()}.mp4`;
        
        try {
          // Try to use real meeting recording if available
          const recordingSession = mediaRecorder.getRecordingSession(meetingId);
          let recordingPath;
          
          if (recordingSession && recordingSession.recordingPath) {
            // Use real meeting recording
            recordingPath = recordingSession.recordingPath;
            console.log('🎬 Using real meeting recording:', recordingPath);
          } else {
            // Create real meeting recording from collected data
            console.log('🎬 Creating real meeting recording from collected data');
            recordingPath = await mediaRecorder.createRealMeetingRecording(meetingId);
            console.log('🎬 Real meeting recording created:', recordingPath);
          }
          
          // Prepare meeting information for intelligent highlight reel
          const meetingInfo = {
            title: meeting.title || `Meeting ${meetingId}`,
            participants: meeting.participants?.length || 0,
            duration: meetingDuration,
            highlightCount: highlights.length,
            date: meeting.createdAt
          };
          
          highlightReelPath = await mediaProcessor.generateHighlightReel(
            recordingPath,
            highlights,
            outputPath,
            meetingInfo
          );
          
          console.log('✅ Highlight reel generated successfully:', highlightReelPath);
          
          io.to(meetingId).emit('highlight_reel_generated', {
            meetingId,
            status: 'success',
            highlightReelPath,
            highlightCount: highlights.length,
            message: 'Highlight reel generated successfully'
          });
          
        } catch (error) {
          console.error('❌ Error generating highlight reel:', error);
          
          // Fallback to mock generation
          highlightReelPath = await mediaProcessor.generateMockHighlightReel(meetingId, highlights);
          
          io.to(meetingId).emit('highlight_reel_generated', {
            meetingId,
            status: 'mock',
            highlightReelPath,
            highlightCount: highlights.length,
            message: 'Mock highlight reel generated (FFmpeg error)'
          });
        }
      } else {
        // Generate mock highlight reel
        highlightReelPath = await mediaProcessor.generateMockHighlightReel(meetingId, highlights);
        
        io.to(meetingId).emit('highlight_reel_generated', {
          meetingId,
          status: 'mock',
          highlightReelPath,
          highlightCount: highlights.length,
          message: 'Mock highlight reel generated (FFmpeg not available)'
        });
      }
      
      console.log('🎬 Highlight reel processing completed for meeting:', meetingId);
      
    } catch (error) {
      console.error('❌ Error processing meeting end:', error);
      socket.emit('highlight_reel_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // Performance monitoring handlers
  socket.on('get_ai_performance', ({ meetingId }) => {
    updatePerformanceData();
    socket.emit('ai_performance_update', performanceData);
  });

  socket.on('request_performance_stats', () => {
    updatePerformanceData();
    socket.emit('performance_stats', performanceData);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove participant from all meetings
    activeMeetings.forEach((meeting, meetingId) => {
      const participantIndex = meeting.participants.findIndex(p => p.id === socket.id);
      if (participantIndex !== -1) {
        const participant = meeting.participants[participantIndex];
        meeting.participants.splice(participantIndex, 1);
        
        // Remove participant from sentiment data
        if (sentimentData.has(meetingId)) {
          const meetingSentimentData = sentimentData.get(meetingId);
          
          // Find and remove participant by socket.id or by name
          let participantToRemove = null;
          meetingSentimentData.participants.forEach((data, key) => {
            if (key === socket.id || data.participantId === participant.name) {
              participantToRemove = key;
            }
          });
          
          if (participantToRemove) {
            meetingSentimentData.participants.delete(participantToRemove);
            console.log('🧹 Removed participant from sentiment data:', participantToRemove);
          }
          
          // If no participants left, clean up sentiment data
          if (meetingSentimentData.participants.size === 0) {
            sentimentData.delete(meetingId);
            console.log('🧹 Cleaned up sentiment data for meeting:', meetingId);
          }
        }
        
        // Clean up fatigue data if no participants left
        if (meeting.participants.length === 0) {
          if (fatigueData.has(meetingId)) {
            fatigueData.delete(meetingId);
            console.log('🧹 Cleaned up fatigue data for meeting:', meetingId);
          }
        }
        
        // If host disconnected and there are other participants, transfer host role
        if (participant.isHost && meeting.participants.length > 0) {
          const newHost = meeting.participants[0];
          newHost.isHost = true;
          meeting.host = newHost.name;
          meeting.hostId = newHost.id;
          
          // Notify all participants about host change
          io.to(meetingId).emit('host-changed', {
            newHost: newHost.name,
            newHostId: newHost.id
          });
          
          console.log(`Host transferred from ${participant.name} to ${newHost.name} in meeting ${meetingId} (disconnect)`);
        }
        
        socket.to(meetingId).emit('participant-left', { 
          participantId: socket.id, 
          userName: participant.name 
        });
        
        if (meeting.participants.length === 0) {
          // Clear host information when meeting becomes empty
          meeting.host = null;
          meeting.hostId = null;
          console.log(`Meeting ${meetingId} is now empty - cleared host information`);
          
          // Clean up LLM service data for this meeting
          llmService.cleanupMeeting(meetingId);
          
          // Clean up highlight and recording data for this meeting
          if (highlightData.has(meetingId)) {
            highlightData.delete(meetingId);
            console.log('🧹 Cleaned up highlight data for meeting:', meetingId);
          }
          
          if (recordingSessions.has(meetingId)) {
            recordingSessions.delete(meetingId);
            console.log('🧹 Cleaned up recording session for meeting:', meetingId);
          }
          
          if (transcriptData.has(meetingId)) {
            transcriptData.delete(meetingId);
            console.log('🧹 Cleaned up transcript data for meeting:', meetingId);
          }
          
          // Only remove meeting if there are no pending approvals either
          const hasPendingApprovals = meeting.pendingApprovals && meeting.pendingApprovals.length > 0;
          
          if (!hasPendingApprovals) {
            // Keep meeting alive for 5 minutes to allow participants to join
            console.log(`Meeting ${meetingId} will be deleted in 5 minutes - no participants and no pending approvals`);
            setTimeout(() => {
              const currentMeeting = activeMeetings.get(meetingId);
              if (currentMeeting && currentMeeting.participants.length === 0) {
                activeMeetings.delete(meetingId);
                console.log(`Meeting ${meetingId} ended after 5 minutes - no participants and no pending approvals`);
              }
            }, 300000); // 5 minutes instead of 30 seconds
          } else {
            console.log(`Meeting ${meetingId} kept alive - has ${meeting.pendingApprovals.length} pending approvals`);
          }
        }
      }
    });
  });
});


// Periodic performance updates
setInterval(() => {
  updatePerformanceData();
  // Broadcast performance updates to all connected clients
  io.emit('ai_performance_update', performanceData);
}, 30000); // Update every 30 seconds

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VideoMeet server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready for WebRTC connections`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Server accessible from all network interfaces (0.0.0.0:${PORT})`);
  console.log(`📱 For cross-device access, use your computer's IP address instead of localhost`);
  console.log(`🤖 AI Performance monitoring enabled`);
});
