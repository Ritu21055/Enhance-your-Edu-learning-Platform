// AI-related socket event handlers (sentiment, fatigue, highlights, AI questions, performance)
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { activeMeetings, sentimentData, fatigueData, highlightData, transcriptData, recordingSessions } from '../config/stores.js';
import { performanceData, updatePerformanceData } from '../utils/performanceUtils.js';
import { calculateFatiguePercentage, checkFatigue, HISTORY_DURATION } from '../utils/fatigueUtils.js';
import { detectImportantMoments } from '../utils/meetingUtils.js';
import llmService from '../src/utils/llmService.js';
import mediaProcessor from '../src/utils/mediaProcessor.js';
import mediaRecorder from '../src/utils/mediaRecorder.js';
import AIHighlightDetector from '../src/utils/aiHighlightDetector.js';
import meetingHistoryManager from '../src/utils/meetingHistory.js';

// Initialize AI Highlight Detector
const aiHighlightDetector = new AIHighlightDetector();

/**
 * Register AI-related socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
export default function registerAIHandlers(socket, io) {
  // Handle sentiment updates from participants
  socket.on('sentiment_update', ({ participantId, meetingId, sentimentData: receivedSentimentData }) => {
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
    
    // Send aggregated data to host only
    const meeting = activeMeetings.get(meetingId);
    if (meeting && meeting.hostId) {
      const hostSocket = io.sockets.sockets.get(meeting.hostId);
      if (hostSocket) {
        hostSocket.emit('sentiment_dashboard_update', aggregatedData);
      }
    }
    
    // Check for fatigue after updating sentiment data
    checkFatigue(meetingId, io);
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
    
    // Check if user is the host
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) {
      console.log('❌ Meeting not found:', meetingId);
      socket.emit('question_generation_error', {
        meetingId,
        error: 'Meeting not found'
      });
      return;
    }
    
    if (meeting.hostId !== socket.id) {
      console.log('❌ Unauthorized: Only host can start question generation');
      socket.emit('question_generation_error', {
        meetingId,
        error: 'Only the host can start question generation'
      });
      return;
    }
    
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
        
        // Basic validation - require minimal conversation
        if (recentContext.length < 100) {
          console.log('📝 Skipping question generation - insufficient transcript context (need at least 100 chars)');
          return;
        }
        
        // Check if context contains actual conversation (not just empty strings)
        const meaningfulWords = recentContext.split(/\s+/).filter(word => word.length > 2).length;
        if (meaningfulWords < 10) {
          console.log('📝 Skipping question generation - insufficient meaningful words (need at least 10 words)');
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
    
    // Check if user is the host
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) {
      console.log('❌ Meeting not found:', meetingId);
      socket.emit('question_generation_error', {
        meetingId,
        error: 'Meeting not found'
      });
      return;
    }
    
    if (meeting.hostId !== socket.id) {
      console.log('❌ Unauthorized: Only host can stop question generation');
      socket.emit('question_generation_error', {
        meetingId,
        error: 'Only the host can stop question generation'
      });
      return;
    }
    
    console.log('🛑 Stopping question generation for meeting:', meetingId);
    
    if (llmService.questionGenerationTimer.has(meetingId)) {
      clearInterval(llmService.questionGenerationTimer.get(meetingId));
      llmService.questionGenerationTimer.delete(meetingId);
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
      console.log('🤖 AI Highlight: Analyzing transcript for highlights:', {
        meetingId,
        transcript: transcript.substring(0, 100) + '...',
        timestamp
      });
      
      const highlight = aiHighlightDetector.analyzeAudioChunk(
        null, // No audio data for now, just text analysis
        timestamp,
        transcript
      );
      
      console.log('🤖 AI Highlight: Analysis result:', {
        hasHighlight: !!highlight,
        highlight: highlight
      });
      
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
      const existingRecordingSession = recordingSessions.get(meetingId);
      
      // Get transcript history
      const transcriptHistory = llmService.getTranscriptHistory(meetingId) || [];
      
      // Get sentiment data
      const meetingSentimentData = sentimentData.get(meetingId);
      
      // Auto-detect additional important moments if few highlights were marked
      if (highlights.length < 3) {
        console.log('🔍 Auto-detecting additional important moments...');
        const autoHighlights = await detectImportantMoments(meetingId, highlights);
        highlights = [...highlights, ...autoHighlights];
        console.log(`🎯 Auto-detected ${autoHighlights.length} additional highlights`);
      }
      
      // Calculate meeting duration
      const meetingDuration = existingRecordingSession ? 
        (existingRecordingSession.endTime - existingRecordingSession.startTime) : 
        (Date.now() - new Date(meeting.createdAt).getTime());
      
      // Update meeting data with duration
      meeting.duration = meetingDuration;
      meeting.endedAt = new Date().toISOString();
      meeting.status = 'completed';
      
      if (highlights.length === 0) {
        console.log('📝 No highlights found for meeting:', meetingId);
        io.to(meetingId).emit('highlight_reel_status', {
          meetingId,
          status: 'no_highlights',
          message: 'No highlights were marked during this meeting'
        });
        
        // Save meeting to history without highlight reel
        try {
          const historyPath = await meetingHistoryManager.saveMeetingToHistory(
            meeting,
            highlights,
            existingRecordingSession,
            transcriptHistory,
            meetingSentimentData,
            null // No highlight reel path
          );
          console.log('💾 Meeting saved to history:', historyPath);
          
          // Emit history saved event
          io.to(meetingId).emit('meeting_saved_to_history', {
            meetingId,
            historyPath,
            highlights: highlights.length,
            transcriptEntries: transcriptHistory.length,
            hasRecording: !!existingRecordingSession,
            highlightReelPath: null
          });
        } catch (historyError) {
          console.error('❌ Failed to save meeting to history:', historyError);
        }
        return;
      }
      
      // Check if FFmpeg is available
      const ffmpegAvailable = await mediaProcessor.isFFmpegAvailable();
      
      if (!ffmpegAvailable) {
        console.error('❌ FFmpeg is not available. Cannot generate highlight reel.');
        io.to(meetingId).emit('highlight_reel_error', {
          meetingId,
          status: 'error',
          error: 'FFmpeg is not installed. Please install FFmpeg to generate highlight reels.',
          message: 'Highlight reel generation requires FFmpeg. Install FFmpeg and try again.'
        });
        return;
      }
      
      // Get real meeting recording - required for highlight reel
      let recordingSession = existingRecordingSession || mediaRecorder.getRecordingSession(meetingId);
      let recordingPath;
      
      if (!recordingSession) {
        console.log('📹 No recording session found for meeting:', meetingId);
        io.to(meetingId).emit('highlight_reel_error', {
          meetingId,
          status: 'error',
          error: 'No meeting recording available. Cannot generate highlight reel without a recording.',
          message: 'Highlight reel generation requires a meeting recording. Ensure the meeting was recorded.'
        });
        return;
      }
      
      if (recordingSession && recordingSession.recordingPath) {
        // Use real meeting recording
        recordingPath = recordingSession.recordingPath;
        console.log('🎬 Using real meeting recording:', recordingPath);
      } else {
        // Try to create real meeting recording from collected data
        try {
          console.log('🎬 Creating real meeting recording from collected data');
          recordingPath = await mediaRecorder.createRealMeetingRecording(meetingId);
          console.log('🎬 Real meeting recording created:', recordingPath);
        } catch (recordingError) {
          console.error('❌ Error creating meeting recording:', recordingError);
          io.to(meetingId).emit('highlight_reel_error', {
            meetingId,
            status: 'error',
            error: 'No meeting recording available. Cannot generate highlight reel without a recording.',
            message: 'Highlight reel generation requires a meeting recording. Ensure the meeting was recorded.'
          });
          return;
        }
      }
      
      // Check if recording file exists
      try {
        await fs.access(recordingPath);
      } catch (accessError) {
        console.error('❌ Meeting recording file not found:', recordingPath);
        io.to(meetingId).emit('highlight_reel_error', {
          meetingId,
          status: 'error',
          error: `Recording file not found: ${recordingPath}`,
          message: 'Meeting recording file is missing. Cannot generate highlight reel.'
        });
        return;
      }
      
      // Generate actual highlight reel from real meeting recording
      const outputPath = `./output/highlight_reel_${meetingId}_${Date.now()}.mp4`;
      
      try {
        // Prepare meeting information for intelligent highlight reel
        const meetingInfo = {
          title: meeting.title || `Meeting ${meetingId}`,
          participants: meeting.participants?.length || 0,
          duration: meetingDuration,
          highlightCount: highlights.length,
          date: meeting.createdAt
        };
        
        const highlightReelPath = await mediaProcessor.generateHighlightReel(
          recordingPath,
          highlights,
          outputPath,
          meetingInfo
        );
        
        console.log('✅ Highlight reel generated successfully from real meeting recording:', highlightReelPath);
        
        // Save meeting to history with highlight reel path
        try {
          const historyPath = await meetingHistoryManager.saveMeetingToHistory(
            meeting,
            highlights,
            recordingSession,
            transcriptHistory,
            meetingSentimentData,
            highlightReelPath // Include highlight reel path
          );
          console.log('💾 Meeting saved to history with highlight reel:', historyPath);
          
          // Emit history saved event
          io.to(meetingId).emit('meeting_saved_to_history', {
            meetingId,
            historyPath,
            highlights: highlights.length,
            transcriptEntries: transcriptHistory.length,
            hasRecording: !!recordingSession,
            highlightReelPath: highlightReelPath
          });
        } catch (historyError) {
          console.error('❌ Failed to save meeting to history:', historyError);
        }
        
        io.to(meetingId).emit('highlight_reel_generated', {
          meetingId,
          status: 'success',
          highlightReelPath,
          highlightCount: highlights.length,
          message: 'Highlight reel generated successfully from meeting recording'
        });
        
      } catch (error) {
        console.error('❌ Error generating highlight reel from meeting recording:', error);
        
        // Save meeting to history without highlight reel (due to error)
        try {
          const historyPath = await meetingHistoryManager.saveMeetingToHistory(
            meeting,
            highlights,
            recordingSession,
            transcriptHistory,
            meetingSentimentData,
            null // No highlight reel path due to error
          );
          console.log('💾 Meeting saved to history (without highlight reel):', historyPath);
          
          // Emit history saved event
          io.to(meetingId).emit('meeting_saved_to_history', {
            meetingId,
            historyPath,
            highlights: highlights.length,
            transcriptEntries: transcriptHistory.length,
            hasRecording: !!recordingSession,
            highlightReelPath: null
          });
        } catch (historyError) {
          console.error('❌ Failed to save meeting to history:', historyError);
        }
        
        io.to(meetingId).emit('highlight_reel_error', {
          meetingId,
          status: 'error',
          error: error.message,
          message: 'Failed to generate highlight reel from meeting recording. Check FFmpeg configuration and recording file.'
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
}

