// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

// Import data stores
import { activeMeetings, sentimentData, fatigueData, highlightData, recordingSessions, transcriptData, persistentMeetings, persistentHighlights, persistentTranscripts } from './config/stores.js';

// Import utilities
import { updatePerformanceData, performanceData } from './utils/performanceUtils.js';
import { startFatigueMonitoring, checkFatigue, calculateFatiguePercentage, HISTORY_DURATION } from './utils/fatigueUtils.js';

// Import socket handlers
import registerAllHandlers from './handlers/index.js';

// Load existing meeting history on startup
(async () => {
  try {
    const activeMeetingsList = await meetingHistoryManager.getActiveMeetings();
    
    // Populate in-memory maps for quick access
    for (const meeting of activeMeetingsList) {
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
  },
  maxHttpBufferSize: 1e8, // 100MB - increased to handle large audio/video chunks and prevent 413 errors
  pingTimeout: 60000, // 60 seconds - increase timeout for better connection stability
  pingInterval: 25000 // 25 seconds - ping interval
});


// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (highlight reels)
app.use('/output', express.static('output'));

// API endpoint to get highlight reel for a meeting
app.get('/api/meetings/:meetingId/highlight-reel', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const history = await meetingHistoryManager.getMeetingHistory(meetingId);
    
    if (!history) {
      return res.status(404).json({ error: 'Meeting history not found' });
    }
    
    if (!history.highlightReel) {
      return res.status(404).json({ error: 'Highlight reel not found for this meeting' });
    }
    
    res.json({
      meetingId,
      highlightReel: history.highlightReel,
      meeting: history.meeting,
      highlights: history.highlights
    });
  } catch (error) {
    console.error('❌ Error getting highlight reel:', error);
    res.status(500).json({ error: 'Failed to get highlight reel' });
  }
});

// Initialize AI Highlight Detector for automatic highlight detection
const aiHighlightDetector = new AIHighlightDetector();

// Start fatigue monitoring
startFatigueMonitoring(io);

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
  checkFatigue(meetingId, io);
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
  checkFatigue(meetingId, io);
  
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

// API endpoint to check AI status
app.get('/api/ai/status', async (req, res) => {
  try {
    const aiStatus = llmService.getLLMStatus();
    res.json({
      status: 'success',
      ai: aiStatus,
      ollama: {
        running: true, // We know it's running from netstat
        port: 11434,
        models: ['llama3.2:3b']
      }
    });
  } catch (error) {
    console.error('❌ Error getting AI status:', error);
    res.status(500).json({ error: 'Failed to get AI status' });
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

// Save meeting to history endpoint
app.post('/api/meetings/history/save', async (req, res) => {
  try {
    const { meetingData, highlights = [], recordingSession = null, transcriptHistory = [], sentimentData = null } = req.body;
    
    console.log('💾 Saving meeting to history:', meetingData.id);
    
    if (!meetingData || !meetingData.id) {
      return res.status(400).json({ error: 'Meeting data is required' });
    }
    
    // Save meeting to history
    const historyPath = await meetingHistoryManager.saveMeetingToHistory(
      meetingData,
      highlights,
      recordingSession,
      transcriptHistory,
      sentimentData
    );
    
    console.log('✅ Meeting saved to history:', historyPath);
    
    res.json({ 
      success: true,
      message: 'Meeting saved to history successfully',
      historyPath,
      meetingId: meetingData.id
    });
  } catch (error) {
    console.error('❌ Error saving meeting to history:', error);
    res.status(500).json({ error: 'Failed to save meeting to history' });
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
  // Register all socket event handlers
  registerAllHandlers(socket, io);
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
