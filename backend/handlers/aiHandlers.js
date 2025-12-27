// AI-related socket event handlers (sentiment, fatigue, highlights, AI questions, performance)
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { activeMeetings, sentimentData, fatigueData, transcriptData, recordingSessions } from '../config/stores.js';
// REMOVED: highlightData - Highlight detection feature removed
import { performanceData, updatePerformanceData } from '../utils/performanceUtils.js';
import { calculateFatiguePercentage, checkFatigue, HISTORY_DURATION } from '../utils/fatigueUtils.js';
// REMOVED: detectImportantMoments - Highlight detection feature removed
// import { detectImportantMoments } from '../utils/meetingUtils.js';
import llmService from '../src/utils/llmService.js';
// REMOVED: Highlight reel feature
// import mediaProcessor from '../src/utils/mediaProcessor.js';
// import mediaRecorder from '../src/utils/mediaRecorder.js';
// REMOVED: Highlight detection feature
// import AIHighlightDetector from '../src/utils/aiHighlightDetector.js';
import meetingHistoryManager from '../src/utils/meetingHistory.js';

// REMOVED: AI Highlight Detector initialization

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
        
        // STRICT validation - require substantial conversation
        // Minimum 500 characters to ensure real conversation, not just noise
        if (recentContext.length < 500) {
          console.log('📝 Skipping question generation - insufficient transcript context (need at least 500 chars)');
          return;
        }
        
        // Check if context contains actual meaningful conversation (not just empty strings or noise)
        const meaningfulWords = recentContext.split(/\s+/).filter(word => word.length > 2).length;
        if (meaningfulWords < 50) {
          console.log('📝 Skipping question generation - insufficient meaningful words (need at least 50 words)');
          return;
        }
        
        // Check for actual speech patterns - ensure it's not just silence or noise
        const sentences = recentContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length < 3) {
          console.log('📝 Skipping question generation - insufficient complete sentences (need at least 3 sentences)');
          return;
        }
        
        // Check for variety in words - ensure it's not repetitive noise
        const uniqueWords = new Set(recentContext.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        if (uniqueWords.size < 20) {
          console.log('📝 Skipping question generation - insufficient word variety (need at least 20 unique words)');
          return;
        }
        
        // Use intelligent question generation trigger
        if (!llmService.shouldGenerateQuestionIntelligently(meetingId, recentContext)) {
          console.log('⏰ Skipping question generation - not a good time for questions');
          return;
        }
        
        // Get facial expression sentiment data for intelligent question generation
        const meetingSentimentData = sentimentData.get(meetingId);
        const allParticipantsWithEmotions = [];
        const participantEmotions = {};
        const participantNames = {};
        
        if (meetingSentimentData && meetingSentimentData.participants) {
          const meeting = activeMeetings.get(meetingId);
          
          meetingSentimentData.participants.forEach((data, participantId) => {
            participantEmotions[participantId] = data.emotion;
            
            // Get participant name
            if (meeting && meeting.participants) {
              const participant = meeting.participants.find(p => p.id === participantId);
              if (participant) {
                participantNames[participantId] = participant.name;
              }
            }
            
            // Collect ALL participants with their emotions (not just negative ones)
            allParticipantsWithEmotions.push({
              id: participantId,
              name: participantNames[participantId] || 'a participant',
              emotion: data.emotion,
              timestamp: data.timestamp
            });
          });
        }
        
        // Categorize emotions for better context
        const emotionCategories = {
          positive: allParticipantsWithEmotions.filter(p => ['happy', 'surprised', 'excited'].includes(p.emotion)),
          negative: allParticipantsWithEmotions.filter(p => ['confused', 'sad', 'fear', 'angry', 'disgusted'].includes(p.emotion)),
          neutral: allParticipantsWithEmotions.filter(p => ['neutral', 'calm'].includes(p.emotion))
        };
        
        console.log('🤖 Question generation with sentiment context:', {
          meetingId,
          totalParticipants: allParticipantsWithEmotions.length,
          positive: emotionCategories.positive.length,
          negative: emotionCategories.negative.length,
          neutral: emotionCategories.neutral.length,
          emotions: allParticipantsWithEmotions.map(p => `${p.name}: ${p.emotion}`)
        });
        
        // Generate follow-up question with ALL facial sentiment context
        const questionResult = await llmService.generateFollowUpQuestion(
          recentContext, 
          meetingId,
          allParticipantsWithEmotions, // Pass ALL participants with emotions
          participantEmotions, // Pass all participant emotions
          participantNames, // Pass participant names
          emotionCategories // Pass emotion categories
        );
        
        // CRITICAL: Only send question if it's not empty and is meaningful
        if (questionResult && questionResult.question && questionResult.question.trim().length > 10) {
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
        } else {
          console.log('📝 Skipping question - empty or too short:', questionResult?.question);
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

  // Transcript Update Event - Store with participant name for meeting notes
  socket.on('transcript_update', (data) => {
    try {
      const { meetingId, participantId, transcript, timestamp, language, confidence, participantName } = data;
      console.log('📝 Transcript update received:', { meetingId, participantId, participantName, transcript: transcript.substring(0, 50) + '...', confidence });
      
      // Get meeting to find participant name if not provided
      let finalParticipantName = participantName;
      if (!finalParticipantName) {
        const meeting = activeMeetings.get(meetingId);
        if (meeting) {
          const participant = meeting.participants.find(p => p.id === participantId);
          if (participant) {
            finalParticipantName = participant.name.replace(' (Host)', '').trim();
          }
        }
      }
      
      // Initialize transcript data for meeting if not exists
      if (!transcriptData.has(meetingId)) {
        transcriptData.set(meetingId, []);
      }
      
      // Store transcript entry WITH participant name
      const transcriptEntry = {
        timestamp,
        participantId,
        participantName: finalParticipantName || `Participant ${participantId.slice(0, 8)}`,
        transcript,
        language,
        confidence,
        id: uuidv4()
      };
      
      transcriptData.get(meetingId).push(transcriptEntry);
      
      // Also add to LLM service for AI question generation
      llmService.addToTranscriptHistory(meetingId, transcript);
      
      // REMOVED: Highlight detection feature - no longer analyzing for highlights
      
    } catch (error) {
      console.error('❌ Error processing transcript update:', error);
    }
  });

  // Meeting End Event - Save to History (Highlight Reel Feature Removed)
  socket.on('end_meeting', async (data) => {
    try {
      const { meetingId } = data;
      console.log('🏁 Meeting ended, saving to history for:', meetingId);
      
      // Get meeting data
      const meeting = activeMeetings.get(meetingId);
      if (!meeting) {
        console.log('❌ Meeting not found:', meetingId);
        return;
      }
      
      // REMOVED: Highlight detection feature - no longer getting highlights
      const existingRecordingSession = recordingSessions.get(meetingId);
      
      // Get transcript history
      const transcriptHistory = llmService.getTranscriptHistory(meetingId) || [];
      
      // Get sentiment data
      const meetingSentimentData = sentimentData.get(meetingId);
      
      // Calculate meeting duration
      const meetingDuration = existingRecordingSession ? 
        (existingRecordingSession.endTime - existingRecordingSession.startTime) : 
        (Date.now() - new Date(meeting.createdAt).getTime());
      
      // Update meeting data with duration
      meeting.duration = meetingDuration;
      meeting.endedAt = new Date().toISOString();
      meeting.status = 'completed';
      
      // Save meeting to history (without highlights)
      try {
        const historyPath = await meetingHistoryManager.saveMeetingToHistory(
          meeting,
          [], // No highlights - feature removed
          existingRecordingSession,
          transcriptHistory,
          meetingSentimentData
        );
        console.log('💾 Meeting saved to history:', historyPath);
        
        // Emit history saved event
        io.to(meetingId).emit('meeting_saved_to_history', {
          meetingId,
          historyPath,
          transcriptEntries: transcriptHistory.length,
          hasRecording: !!existingRecordingSession
        });
      } catch (historyError) {
        console.error('❌ Failed to save meeting to history:', historyError);
        socket.emit('meeting_save_error', {
          meetingId,
          error: historyError.message
        });
      }
      
    } catch (error) {
      console.error('❌ Error processing meeting end:', error);
      socket.emit('meeting_save_error', {
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

