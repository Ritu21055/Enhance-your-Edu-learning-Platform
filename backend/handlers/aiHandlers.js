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
 * Validate transcript before storing
 * Rejects empty, low-confidence, filler words, and noise
 */
function isValidTranscript(transcript, confidence) {
  if (!transcript || typeof transcript !== 'string') {
    return false;
  }
  
  const trimmed = transcript.trim();
  
  // Reject empty or very short transcripts
  if (trimmed.length < 3) {
    return false;
  }
  
  // Reject low confidence transcripts (if confidence is provided)
  if (confidence !== undefined && confidence !== null && confidence < 0.3) {
    return false;
  }
  
  // Reject common filler words and noise
  const fillerWords = ['um', 'uh', 'ah', 'er', 'hmm', 'mm', 'mhm', 'eh', 'oh'];
  const lowerText = trimmed.toLowerCase();
  
  // Reject if it's just a filler word
  if (fillerWords.includes(lowerText)) {
    return false;
  }
  
  // Reject if it's just punctuation or special characters
  if (/^[^\w\s]+$/.test(trimmed)) {
    return false;
  }
  
  // Reject if it's mostly numbers or special characters
  const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount === 0) {
    return false;
  }
  
  // Reject if it's just repeated characters (like "aaa", "mmm")
  if (/^(.)\1{2,}$/.test(trimmed)) {
    return false;
  }
  
  // Reject if it contains only numbers
  if (/^\d+$/.test(trimmed)) {
    return false;
  }
  
  return true;
}

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

  // REMOVED: Google Cloud Speech-to-Text audio_data handler
  // Transcription is now handled by Web Speech API (FreeTranscription component) on the client side
  // The transcript_update event is used instead of audio_data

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
        
        // Get ALL participants from meeting (not just those with emotions)
        const meeting = activeMeetings.get(meetingId);
        const allParticipants = meeting?.participants || [];
        const hostId = meeting?.hostId;

        // Get facial expression sentiment data (for participants with video ON)
        const meetingSentimentData = sentimentData.get(meetingId);
        const allParticipantsWithEmotions = [];
        const participantEmotions = {};
        const participantNames = {};

        // First, collect participants WITH emotions (video ON)
        if (meetingSentimentData && meetingSentimentData.participants) {
          meetingSentimentData.participants.forEach((data, participantId) => {
            // EXCLUDE HOST - only count actual participants' emotions
            if (participantId === hostId) {
              console.log('🚫 Skipping host emotions for question generation');
              return;
            }
            
            participantEmotions[participantId] = data.emotion;
            
            // CRITICAL FIX: Get participant name - try multiple sources
            let participantName = null;
            
            // First try: from participantNames map (if already set)
            if (participantNames[participantId]) {
              participantName = participantNames[participantId];
            }
            // Second try: from meeting.participants
            else if (meeting && meeting.participants) {
              const participant = meeting.participants.find(p => p.id === participantId);
              if (participant && participant.name) {
                participantName = participant.name.replace(' (Host)', '').trim();
                participantNames[participantId] = participantName; // Cache it
              }
            }
            
            // CRITICAL FIX: If still no name, try to get from allParticipants array
            if (!participantName && allParticipants) {
              const participant = allParticipants.find(p => p.id === participantId);
              if (participant && participant.name) {
                participantName = participant.name.replace(' (Host)', '').trim();
                participantNames[participantId] = participantName; // Cache it
              }
            }
            
            // CRITICAL FIX: Only use participant ID prefix as last resort, log warning
            if (!participantName) {
              console.warn(`⚠️ Could not find participant name for ${participantId}, using ID prefix`);
              participantName = `Participant ${participantId.slice(0, 8)}`; // Use participant ID prefix instead of 'a participant'
            }
            
            // Collect participants with emotions (video ON)
            allParticipantsWithEmotions.push({
              id: participantId,
              name: participantName, // Use the properly fetched name
              emotion: data.emotion,
              timestamp: data.timestamp
            });
          });
        }

        // CRITICAL: Also include participants WITHOUT emotions (video OFF)
        // These participants should still get topic-related questions
        const participantsWithoutEmotions = allParticipants
          .filter(p => p.id !== hostId) // Exclude host
          .filter(p => !participantEmotions[p.id]) // Only those without emotions (video off)
          .map(p => {
            // CRITICAL FIX: Ensure participant name is properly set
            let participantName = p.name;
            
            // Remove " (Host)" suffix if present
            if (participantName) {
              participantName = participantName.replace(' (Host)', '').trim();
            }
            
            // If no name, use participant ID prefix instead of 'a participant'
            if (!participantName || participantName === '') {
              console.warn(`⚠️ Participant ${p.id} has no name, using ID prefix`);
              participantName = `Participant ${p.id.slice(0, 8)}`;
            }
            
            // Cache the name in participantNames map
            participantNames[p.id] = participantName;
            
            return {
              id: p.id,
              name: participantName, // Use properly formatted name
              emotion: 'unknown', // Video off, emotion unknown
              timestamp: Date.now()
            };
          });

        // Combine both: participants with emotions (video ON) and without emotions (video OFF)
        const allParticipantsForQuestions = [
          ...allParticipantsWithEmotions,
          ...participantsWithoutEmotions
        ];

        // Check if we have any participants (with or without emotions)
        const hasAnyParticipants = allParticipantsForQuestions.length > 0;
        const hasParticipantEmotions = allParticipantsWithEmotions.length > 0;
        
        console.log('🤖 Participant check:', {
          totalParticipants: allParticipants.length,
          participantsWithEmotions: allParticipantsWithEmotions.length,
          participantsWithoutEmotions: participantsWithoutEmotions.length,
          totalForQuestions: allParticipantsForQuestions.length,
          hasParticipantEmotions,
          hasAnyParticipants,
          participantsList: allParticipantsForQuestions.map(p => `${p.name} (${p.emotion === 'unknown' ? 'video off' : p.emotion})`)
        });

        // Progressive validation based on conversation length
        const contextLength = recentContext.length        // RELAXED: Reduced minimum conversation requirement (200+ chars instead of 500+)
        // Face expressions sirf tab use karein jab conversation substantial ho
        if (contextLength < 200) {
          console.log('📝 Skipping question generation - conversation not substantial enough (need at least 200 chars)');
          return; // Don't generate questions even with emotions if conversation is too short
        }

        // Early conversation (200-1000 chars): Relaxed requirements
        if (contextLength < 1000) {
          const meaningfulWords = recentContext.split(/\s+/).filter(word => word.length > 2).length;
          const uniqueWords = new Set(recentContext.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          const sentences = recentContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
          
          // RELAXED: Require at least 30 words, 15 unique words, 2 sentences (reduced from 50/20/3)
          // Even with emotions, need some conversation
          if (meaningfulWords < 30 || uniqueWords.size < 15 || sentences.length < 2) {
            console.log('📝 Skipping question generation - insufficient conversation quality (need at least 30 words, 15 unique, 2 sentences)');
            return;
          }
          
          // Now check if we have participants (with or without emotions)
          if (!hasAnyParticipants) {
            console.log('📝 Conversation substantial but no participants found');
            return;
          }
          
          if (hasParticipantEmotions) {
            console.log('📝 Conversation substantial with participant emotions - will generate personalized question');
          } else {
            console.log('📝 Conversation substantial but no emotions (video off) - will generate topic-related question for participants');
          }
        }
        // Medium conversation (1000+ chars): Good quality
        else {
          const meaningfulWords = recentContext.split(/\s+/).filter(word => word.length > 2).length;
          const uniqueWords = new Set(recentContext.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          const sentences = recentContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
          
          // RELAXED: Require at least 40 words, 20 unique words, 3 sentences (reduced from 60/25/5)
          if (meaningfulWords < 40 || uniqueWords.size < 20 || sentences.length < 3) {
            console.log('📝 Skipping question generation - insufficient conversation quality (need at least 40 words, 20 unique, 3 sentences)');
            return;
          }
          
          if (!hasAnyParticipants) {
            console.log('📝 Conversation substantial but no participants found');
            return;
          }
          
          if (hasParticipantEmotions) {
            console.log('📝 Substantial conversation with participant emotions - will generate personalized question');
          } else {
            console.log('📝 Substantial conversation but no emotions (video off) - will generate topic-related question');
          }
        }

        // Use intelligent question generation trigger (passes emotion info)
        if (!llmService.shouldGenerateQuestionIntelligently(meetingId, recentContext, hasParticipantEmotions)) {
          console.log('⏰ Skipping question generation - not a good time for questions');
          return;
        }

        // Categorize emotions for better context (only for participants with emotions)
        const emotionCategories = {
          positive: allParticipantsWithEmotions.filter(p => ['happy', 'surprised', 'excited'].includes(p.emotion)),
          negative: allParticipantsWithEmotions.filter(p => ['confused', 'sad', 'fear', 'angry', 'disgusted'].includes(p.emotion)),
          neutral: allParticipantsWithEmotions.filter(p => ['neutral', 'calm'].includes(p.emotion))
        };
        
        console.log('🤖 Question generation with participant context:', {
          meetingId,
          participantsWithEmotions: allParticipantsWithEmotions.length,
          participantsWithoutEmotions: participantsWithoutEmotions.length,
          totalParticipants: allParticipantsForQuestions.length,
          positive: emotionCategories.positive.length,
          negative: emotionCategories.negative.length,
          neutral: emotionCategories.neutral.length,
          allParticipants: allParticipantsForQuestions.map(p => `${p.name} (${p.emotion === 'unknown' ? 'video off' : p.emotion})`)
        });
        
        // CRITICAL: Pass ALL participants (with and without emotions) for question generation
        // This ensures participants with video off also get topic-related questions
        const questionResult = await llmService.generateFollowUpQuestion(
          recentContext, 
          meetingId,
          allParticipantsForQuestions, // Pass ALL participants (video ON + video OFF)
          participantEmotions, // Pass emotions (only for video ON participants)
          participantNames, // Pass participant names
          emotionCategories // Pass emotion categories
        );
        
        // CRITICAL: Only send question if it's not empty and is meaningful
        if (questionResult && questionResult.question && questionResult.question.trim().length > 10) {
          const questionText = questionResult.question.trim();
          
          // CRITICAL: Validate that question includes participant name if participants exist
          if (hasAnyParticipants && allParticipantsForQuestions.length > 0) {
            const participantNames = allParticipantsForQuestions.map(p => p.name);
            const hasParticipantName = participantNames.some(name => 
              questionText.toLowerCase().startsWith(name.toLowerCase()) || 
              questionText.toLowerCase().includes(name.toLowerCase() + ',')
            );
            
            if (!hasParticipantName) {
              console.log('⚠️ Question generated without participant name despite participants existing. Skipping.');
              return; // Don't send question if it doesn't include participant name
            }
            
            console.log('✅ Question includes participant name:', questionText);
          }
          
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
     }, 60000); // Check every 60 seconds (1 minute) - faster checking for better responsiveness
    
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
      
      // VALIDATE TRANSCRIPT BEFORE STORING
      if (!isValidTranscript(transcript, confidence)) {
        console.log('⚠️ Invalid transcript rejected:', {
          transcript: transcript?.substring(0, 30),
          confidence,
          participantId,
          reason: 'Failed validation - empty, low confidence, or noise'
        });
        return; // Don't store invalid transcripts
      }
      
      console.log('✅ Valid transcript received:', { 
        meetingId, 
        participantId, 
        participantName, 
        transcript: transcript.substring(0, 50) + '...', 
        confidence 
      });
      
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
        transcript: transcript.trim(), // Store trimmed version
        language,
        confidence,
        id: uuidv4()
      };
      
      transcriptData.get(meetingId).push(transcriptEntry);
      
      // Also add to LLM service for AI question generation
      llmService.addToTranscriptHistory(meetingId, transcript.trim());
      
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

