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
  // DEBUG: Log when handler is registered
  console.log('📝 AI Handlers registered for socket:', socket.id);
  
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
    
    // CRITICAL: Check if timer already exists for this meeting
    if (llmService.questionGenerationTimer.has(meetingId)) {
      console.log('⚠️ Timer already exists for meeting:', meetingId, '- clearing old timer');
      clearInterval(llmService.questionGenerationTimer.get(meetingId));
      llmService.questionGenerationTimer.delete(meetingId);
    }
    
    // Create timer reference first (will be set later)
    let questionTimerRef = null;
    
    // Function to check and generate questions
    const checkAndGenerateQuestion = async () => {
      const tickStartTime = Date.now();
      const tickId = `tick-${tickStartTime}`;
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🔵 [${tickId}] Question generation timer tick STARTED for meeting: ${meetingId}`);
      console.log(`🔵 [${tickId}] Timer reference exists: ${!!questionTimerRef}`);
      console.log(`🔵 [${tickId}] Timer in llmService map: ${llmService.questionGenerationTimer.has(meetingId)}`);
      
      try {
        // Verify meeting still exists
        const currentMeeting = activeMeetings.get(meetingId);
        if (!currentMeeting) {
          console.log(`⚠️ [${tickId}] Meeting no longer exists, stopping timer for: ${meetingId}`);
          if (questionTimerRef) {
            clearInterval(questionTimerRef);
            console.log(`🛑 [${tickId}] Cleared interval timer`);
          }
          llmService.questionGenerationTimer.delete(meetingId);
          console.log(`🛑 [${tickId}] Removed timer from llmService map`);
          return;
        }
        
        console.log(`⏰ [${tickId}] Meeting exists - continuing question generation check:`, {
          meetingId,
          participantsCount: currentMeeting.participants?.length || 0,
          hostId: currentMeeting.hostId,
          hostName: currentMeeting.host
        });
        
        // DEBUG: Check transcript history BEFORE getting context
        const hasHistory = llmService.transcriptHistory.has(meetingId);
        const rawHistory = hasHistory ? llmService.transcriptHistory.get(meetingId) : null;
        const transcriptHistoryCount = rawHistory ? rawHistory.length : 0;
        
        console.log(`🔍 [${tickId}] PRE-CHECK: Transcript history status:`, {
          meetingId,
          hasHistory,
          transcriptHistoryCount,
          rawHistorySample: rawHistory ? rawHistory.slice(0, 2).map(e => ({
            transcript: e.transcript?.substring(0, 30),
            timestamp: e.timestamp,
            timestampISO: new Date(e.timestamp).toISOString()
          })) : null
        });
        
        // Get recent transcript context (INCREASED: 10 minutes instead of 5 for better context)
        const recentContext = llmService.getRecentTranscriptContext(meetingId, 10);
        
        console.log(`🤖 [${tickId}] Question generation check:`, {
          meetingId,
          contextLength: recentContext.length,
          transcriptHistoryCount,
          context: recentContext.substring(0, 100) + (recentContext.length > 100 ? '...' : ''),
          hasContext: recentContext.length > 0,
          isEmpty: recentContext.trim().length === 0
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
            
            // CRITICAL FIX: Also check sentimentData participants for name
            if (!participantName && meetingSentimentData && meetingSentimentData.participants) {
              const sentimentParticipant = meetingSentimentData.participants.get(participantId);
              if (sentimentParticipant && sentimentParticipant.participantName) {
                participantName = sentimentParticipant.participantName;
                participantNames[participantId] = participantName; // Cache it
              }
            }
            
            // CRITICAL FIX: Only use participant ID prefix as last resort, log warning
            if (!participantName) {
              console.warn(`⚠️ Could not find participant name for ${participantId}, using ID prefix`);
              // FIX: Try to extract name from participantId if it contains name info
              // Otherwise use a more descriptive fallback
              participantName = `Participant ${participantId.slice(0, 8)}`;
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
        const contextLength = recentContext.length;
        
        console.log('🤖 Question generation validation:', {
          contextLength,
          hasAnyParticipants,
          hasParticipantEmotions,
          participantsCount: allParticipantsForQuestions.length,
          contextPreview: recentContext.substring(0, 100) + (recentContext.length > 100 ? '...' : '')
        });
        
        // FURTHER RELAXED: Reduced minimum conversation requirement (50+ chars instead of 70+)
        // Face expressions sirf tab use karein jab conversation substantial ho
        if (contextLength < 50) {
          console.log(`📝 [${tickId}] SKIPPING question generation - conversation too short (need at least 50 chars, got ${contextLength})`);
          console.log(`📝 [${tickId}] Context preview: "${recentContext.substring(0, 100)}${recentContext.length > 100 ? '...' : ''}"`);
          console.log(`🔵 [${tickId}] Timer will continue - next check in 30 seconds`);
          console.log(`${'='.repeat(80)}\n`);
          return; // Don't generate questions even with emotions if conversation is too short
        }

        // Early conversation (50-500 chars): Very relaxed requirements
        if (contextLength < 500) {
          const meaningfulWords = recentContext.split(/\s+/).filter(word => word.length > 2).length;
          const uniqueWords = new Set(recentContext.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          let sentences = recentContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
          
          // FIX: Web Speech API often doesn't add punctuation, so estimate sentences if count is low
          if (sentences.length === 0 && meaningfulWords >= 10) {
            // Estimate: ~10-15 words per sentence
            const estimatedSentences = Math.max(1, Math.floor(meaningfulWords / 12));
            sentences = Array(estimatedSentences).fill('');
            console.log(`📝 No explicit sentences found, estimating ${estimatedSentences} sentences from ${meaningfulWords} words`);
          }
          
          // FURTHER RELAXED: Require at least 10 words, 6 unique words, 0-1 sentence (very relaxed for early conversation)
          // Web Speech API often doesn't add punctuation, so sentence count might be 0
          if (meaningfulWords < 10 || uniqueWords.size < 6) {
            console.log('📝 Skipping question generation - insufficient conversation quality:', {
              meaningfulWords,
              uniqueWords: uniqueWords.size,
              sentences: sentences.length,
              required: '10 words, 6 unique (sentence requirement relaxed for Web Speech API)'
            });
            return;
          }
          
          // FIXED: Make participants check optional - generate general questions even without participants
          if (!hasAnyParticipants) {
            console.log('📝 Early conversation but no participants found - will generate general topic-related question');
          } else if (hasParticipantEmotions) {
            console.log('📝 Early conversation with participant emotions - will generate personalized question');
          } else {
            console.log('📝 Early conversation but no emotions (video off) - will generate topic-related question for participants');
          }
        }
        // Medium conversation (500-1000 chars): Relaxed requirements
        else if (contextLength < 1000) {
          const meaningfulWords = recentContext.split(/\s+/).filter(word => word.length > 2).length;
          const uniqueWords = new Set(recentContext.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          let sentences = recentContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
          
          // FIX: Better sentence detection for transcripts without proper punctuation
          if (sentences.length < 2 && contextLength >= 500) {
            // Estimate sentences based on word count
            const wordBasedEstimate = Math.floor(meaningfulWords / 15);
            const commaBasedSentences = recentContext.split(/,/).filter(s => s.trim().length > 20);
            const estimatedSentences = Math.max(
              wordBasedEstimate,
              Math.floor(commaBasedSentences.length / 2),
              sentences.length
            );
            sentences = Array(Math.max(estimatedSentences, 1)).fill('');
            console.log(`📝 Using estimated sentence count: ${estimatedSentences} (words: ${meaningfulWords})`);
          }
          
          // RELAXED: Require at least 25 words, 12 unique words, 1 sentence (reduced from 2)
          // For medium conversations, if words/unique words are sufficient, allow with 1 sentence
          if (meaningfulWords < 25 || uniqueWords.size < 12 || sentences.length < 1) {
            console.log('📝 Skipping question generation - insufficient conversation quality:', {
              meaningfulWords,
              uniqueWords: uniqueWords.size,
              sentences: sentences.length,
              required: '25 words, 12 unique, 1 sentence'
            });
            return;
          }
          
          // FIXED: Make participants check optional - generate general questions even without participants
          if (!hasAnyParticipants) {
            console.log('📝 Medium conversation but no participants found - will generate general topic-related question');
          } else if (hasParticipantEmotions) {
            console.log('📝 Medium conversation with participant emotions - will generate personalized question');
          } else {
            console.log('📝 Medium conversation but no emotions (video off) - will generate topic-related question');
          }
        }
        // Substantial conversation (1000+ chars): Good quality
        else {
          const meaningfulWords = recentContext.split(/\s+/).filter(word => word.length > 2).length;
          const uniqueWords = new Set(recentContext.toLowerCase().split(/\s+/).filter(w => w.length > 3));
          let sentences = recentContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
          
          // FIX: Better sentence detection for transcripts without proper punctuation
          // Web Speech API often doesn't add periods, so estimate sentences if count is low
          if (sentences.length < 3 && contextLength >= 1000) {
            // Method 1: Estimate based on word count (~15-20 words per sentence)
            const wordBasedEstimate = Math.floor(meaningfulWords / 15);
            
            // Method 2: Count based on commas (common in speech)
            const commaBasedSentences = recentContext.split(/,/).filter(s => s.trim().length > 20);
            
            // Method 3: Count based on "and", "but", "so" (common connectors)
            const connectorBased = (recentContext.match(/\b(and|but|so|because|when|if|then)\b/gi) || []).length;
            
            // Use the maximum of all methods
            const estimatedSentences = Math.max(
              wordBasedEstimate,
              Math.floor(commaBasedSentences.length / 2), // Comma-based (divide by 2 as commas are more frequent)
              Math.floor(connectorBased / 2), // Connector-based
              sentences.length // Original count
            );
            
            // Create array for count (we just need the length)
            sentences = Array(Math.max(estimatedSentences, 2)).fill('');
            
            console.log(`📝 Using estimated sentence count: ${estimatedSentences} (words: ${meaningfulWords}, word-based: ${wordBasedEstimate}, commas: ${commaBasedSentences.length}, connectors: ${connectorBased})`);
          }
          
          // RELAXED: Require at least 35 words, 18 unique words, 2 sentences (reduced from 3)
          // For substantial conversations, if words/unique words are sufficient, allow with 2 sentences
          if (meaningfulWords < 35 || uniqueWords.size < 18) {
            console.log('📝 Skipping question generation - insufficient conversation quality:', {
              meaningfulWords,
              uniqueWords: uniqueWords.size,
              sentences: sentences.length,
              required: '35 words, 18 unique, 2 sentences'
            });
            return;
          }
          
          // Sentence check: Allow if we have at least 2 sentences (or 1 if words are very high)
          if (sentences.length < 2) {
            // If we have very high word count, allow with 1 sentence
            if (meaningfulWords >= 100 && uniqueWords.size >= 50) {
              console.log('✅ Allowing question generation with 1 sentence due to high word/unique word count');
            } else {
              console.log('📝 Skipping question generation - insufficient sentences:', {
                meaningfulWords,
                uniqueWords: uniqueWords.size,
                sentences: sentences.length,
                required: '2 sentences (or 1 if 100+ words and 50+ unique)'
              });
              return;
            }
          }
          
          // FIXED: Make participants check optional - generate general questions even without participants
          if (!hasAnyParticipants) {
            console.log('📝 Substantial conversation but no participants found - will generate general topic-related question');
          } else if (hasParticipantEmotions) {
            console.log('📝 Substantial conversation with participant emotions - will generate personalized question');
          } else {
            console.log('📝 Substantial conversation but no emotions (video off) - will generate topic-related question');
          }
        }

        // FIXED: Use intelligent question generation trigger ONLY for time interval check (not double validation)
        // Check time interval first
        const timeInterval = 1; // 1 minute minimum between questions
        if (!llmService.shouldGenerateQuestion(meetingId, timeInterval)) {
          const lastQuestionTime = llmService.lastQuestionTime.get(meetingId);
          const timeSinceLastQuestion = lastQuestionTime ? (Date.now() - lastQuestionTime) / 1000 : 0;
          console.log(`⏰ Skipping question generation - time interval not met (need ${timeInterval} minutes, last question was ${timeSinceLastQuestion.toFixed(0)} seconds ago)`);
          return;
        }
        
        // Additional check: Only use intelligent trigger for very early conversations (< 200 chars)
        // For longer conversations, skip the double validation
        if (contextLength < 200) {
          if (!llmService.shouldGenerateQuestionIntelligently(meetingId, recentContext, hasParticipantEmotions)) {
            console.log('⏰ Skipping question generation - very early conversation requirements not met');
            return;
          }
        } else {
          console.log('✅ Conversation length sufficient, skipping intelligent trigger double-check');
        }

        // Categorize emotions for better context (only for participants with emotions)
        const emotionCategories = {
          positive: allParticipantsWithEmotions.filter(p => ['happy', 'surprised', 'excited'].includes(p.emotion)),
          negative: allParticipantsWithEmotions.filter(p => ['confused', 'sad', 'fear', 'angry', 'disgusted'].includes(p.emotion)),
          neutral: allParticipantsWithEmotions.filter(p => ['neutral', 'calm'].includes(p.emotion))
        };
        
        // CRITICAL: Log question generation status BEFORE generating
        console.log('🤖 Question generation status - ALL VALIDATIONS PASSED:', {
          meetingId,
          contextLength,
          hasAnyParticipants,
          hasParticipantEmotions,
          participantsWithEmotions: allParticipantsWithEmotions.length,
          participantsWithoutEmotions: participantsWithoutEmotions.length,
          totalParticipants: allParticipantsForQuestions.length,
          positive: emotionCategories.positive.length,
          negative: emotionCategories.negative.length,
          neutral: emotionCategories.neutral.length,
          participantsList: allParticipantsForQuestions.map(p => `${p.name} (${p.emotion === 'unknown' ? 'video off' : p.emotion})`),
          willGenerate: true,
          reason: 'All validation checks passed'
        });
        
        console.log('✅ All validation checks passed! Generating question...', {
          meetingId,
          contextLength,
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
          
          // FIXED: Validate that question includes participant name if participants exist
          // But allow general questions if no participants
          // RELAXED: Allow questions even if name isn't at the start - just check if name appears anywhere
          if (hasAnyParticipants && allParticipantsForQuestions.length > 0) {
            const participantNames = allParticipantsForQuestions.map(p => p.name);
            const hasParticipantName = participantNames.some(name => {
              const lowerName = name.toLowerCase();
              const lowerQuestion = questionText.toLowerCase();
              // Check if name appears anywhere in the question (not just at start)
              return lowerQuestion.includes(lowerName) || 
                     lowerQuestion.includes(lowerName + ',') ||
                     lowerQuestion.includes(lowerName + '?') ||
                     lowerQuestion.includes(lowerName + '.');
            });
            
            if (!hasParticipantName) {
              console.log('⚠️ Question generated without participant name. Allowing anyway for better UX:', {
                question: questionText.substring(0, 50),
                participants: participantNames
              });
              // RELAXED: Don't skip - allow question even without explicit name
              // The LLM might generate a good question that doesn't need a name
            } else {
              console.log('✅ Question includes participant name:', questionText);
            }
          }
          
          // Update last question time
          llmService.updateLastQuestionTime(meetingId);
          
          // Send question suggestion to host
          const meeting = activeMeetings.get(meetingId);
          if (meeting && meeting.hostId) {
            // CRITICAL FIX: Verify host socket is still connected before emitting
            const hostSocket = io.sockets.sockets.get(meeting.hostId);
            const isHostConnected = !!hostSocket && hostSocket.connected;
            const meetingRoom = io.sockets.adapter.rooms.get(meetingId);
            const isHostInRoom = meetingRoom ? meetingRoom.has(meeting.hostId) : false;
            
            console.log(`\n${'='.repeat(80)}`);
            console.log(`❓ [${tickId}] PRE-CHECK: Host connection verification:`, {
              meetingId,
              hostId: meeting.hostId,
              hostName: meeting.host,
              hasHostSocket: !!hostSocket,
              isHostConnected,
              isHostInRoom,
              meetingRoomSize: meetingRoom ? meetingRoom.size : 0,
              roomSocketIds: meetingRoom ? Array.from(meetingRoom) : []
            });
            
            if (!isHostConnected || !isHostInRoom) {
              console.log(`⚠️ [${tickId}] Host socket NOT CONNECTED or NOT IN ROOM - skipping question emission:`, {
                hostId: meeting.hostId,
                isHostConnected,
                isHostInRoom,
                reason: !isHostConnected ? 'Host socket disconnected' : 'Host not in meeting room'
              });
              console.log(`⚠️ [${tickId}] Question generated but NOT sent - host disconnected during generation`);
              console.log(`${'='.repeat(80)}\n`);
              return; // Skip emitting if host is not connected
            }
            
            const questionData = {
              meetingId,
              question: questionResult.question,
              topics: questionResult.topics,
              sentiment: questionResult.sentiment,
              confidence: questionResult.confidence,
              timestamp: questionResult.timestamp,
              model: questionResult.model || 'rule-based', // Include model name (gemini, ollama, or rule-based)
              responseTime: questionResult.responseTime || 0 // Include response time in milliseconds
            };
            
            console.log(`❓ [${tickId}] SENDING question to frontend:`, {
              meetingId,
              hostId: meeting.hostId,
              hostName: meeting.host,
              question: questionResult.question,
              questionLength: questionResult.question.length,
              model: questionResult.model || 'rule-based',
              responseTime: questionResult.responseTime || 0,
              topics: questionResult.topics,
              sentiment: questionResult.sentiment,
              confidence: questionResult.confidence
            });
            
            io.to(meeting.hostId).emit('follow_up_suggestion', questionData);
            
            console.log(`✅ [${tickId}] Question EMITTED to host socket: ${meeting.hostId}`);
            console.log(`✅ [${tickId}] Event name: 'follow_up_suggestion'`);
            console.log(`✅ [${tickId}] Host verified as connected and in room`);
            console.log(`${'='.repeat(80)}\n`);
          } else {
            console.log(`❌ [${tickId}] Cannot send question - meeting or hostId missing:`, {
              hasMeeting: !!meeting,
              hostId: meeting?.hostId,
              meetingId
            });
          }
        } else {
          console.log(`📝 [${tickId}] SKIPPING question - empty or too short:`, questionResult?.question);
          console.log(`🔵 [${tickId}] Timer will continue - next check in 30 seconds`);
        }
        
        const tickDuration = Date.now() - tickStartTime;
        console.log(`✅ [${tickId}] Question generation tick COMPLETED in ${tickDuration}ms`);
        console.log(`${'='.repeat(80)}\n`);
        
      } catch (error) {
        const tickDuration = Date.now() - tickStartTime;
        console.error(`❌ [${tickId}] Question generation FAILED after ${tickDuration}ms:`, error);
        console.error(`❌ [${tickId}] Error stack:`, error.stack);
        console.log(`🔵 [${tickId}] Timer will continue despite error - next check in 30 seconds`);
        console.log(`${'='.repeat(80)}\n`);
      }
    };
    
    // Run immediately on start (don't wait 30 seconds)
    console.log('\n🚀 Starting question generation for meeting:', meetingId);
    console.log('🚀 Running initial question check immediately...');
    checkAndGenerateQuestion();
    
    // Then set up interval to check every 30 seconds
    questionTimerRef = setInterval(() => {
      console.log(`\n⏰ [INTERVAL] Timer tick triggered for meeting: ${meetingId}`);
      checkAndGenerateQuestion();
    }, 30000);
    
    // Store timer for cleanup
    llmService.questionGenerationTimer.set(meetingId, questionTimerRef);
    
    console.log('✅ Question generation timer STARTED and stored for meeting:', meetingId, {
      timerId: questionTimerRef,
      interval: '30 seconds',
      initialCheck: 'completed',
      nextCheck: 'in 30 seconds',
      timerStored: llmService.questionGenerationTimer.has(meetingId),
      totalActiveTimers: llmService.questionGenerationTimer.size
    });
    console.log(`${'='.repeat(80)}\n`);
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
    
    console.log('\n🛑 STOPPING question generation for meeting:', meetingId);
    console.log('🛑 Reason: stop_question_generation event received from host');
    console.log('🛑 Host socket ID:', socket.id);
    console.log('🛑 Meeting host ID:', meeting.hostId);
    
    const timerExists = llmService.questionGenerationTimer.has(meetingId);
    console.log('🛑 Timer exists in map:', timerExists);
    
    if (timerExists) {
      const timerRef = llmService.questionGenerationTimer.get(meetingId);
      console.log('🛑 Timer reference:', timerRef);
      clearInterval(timerRef);
      console.log('🛑 Interval cleared');
      llmService.questionGenerationTimer.delete(meetingId);
      console.log('🛑 Timer removed from map');
    } else {
      console.log('⚠️ No timer found in map - may have already been stopped');
    }
    
    // CRITICAL FIX: Emit event to frontend to clear displayed question
    io.to(meeting.hostId).emit('clear_question', {
      meetingId,
      reason: 'Question generation stopped'
    });
    
    console.log('✅ Question generation STOPPED and frontend notified for meeting:', meetingId);
    console.log('✅ Remaining active timers:', llmService.questionGenerationTimer.size);
    console.log(`${'='.repeat(80)}\n`);
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
    // DEBUG: Log that event was received
    console.log('📥 transcript_update event received:', {
      meetingId: data?.meetingId,
      participantId: data?.participantId,
      hasTranscript: !!data?.transcript,
      transcriptLength: data?.transcript?.length,
      confidence: data?.confidence,
      socketId: socket.id
    });
    
    try {
      const { meetingId, participantId, transcript, timestamp, language, confidence, participantName } = data;
      
      // Validate required fields
      if (!meetingId || !participantId || !transcript) {
        console.log('⚠️ transcript_update rejected - missing required fields:', {
          hasMeetingId: !!meetingId,
          hasParticipantId: !!participantId,
          hasTranscript: !!transcript
        });
        return;
      }
      
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
      
      // Debug: Log transcript history status
      const historyCount = llmService.transcriptHistory.has(meetingId) 
        ? llmService.transcriptHistory.get(meetingId).length 
        : 0;
      if (historyCount % 5 === 0 || historyCount === 1) {
        console.log(`📝 Transcript history status for ${meetingId}: ${historyCount} entries stored`);
      }
      
      // AUTO-RESTART: Check if question generation should be restarted
      // Only check if timer is stopped AND we have enough transcripts (optimization: check every 3rd transcript or when crossing threshold)
      const isQuestionGenerationStopped = !llmService.questionGenerationTimer.has(meetingId);
      if (isQuestionGenerationStopped && (historyCount % 3 === 0 || historyCount >= 3)) {
        // Get recent context to check if sufficient
        const recentContext = llmService.getRecentTranscriptContext(meetingId, 10);
        const contextLength = recentContext.length;
        
        // Check if we have sufficient context now (at least 50 chars)
        if (contextLength >= 50) {
          const meeting = activeMeetings.get(meetingId);
          if (meeting && meeting.hostId) {
            // Verify host is still connected
            const hostSocket = io.sockets.sockets.get(meeting.hostId);
            const isHostConnected = !!hostSocket && hostSocket.connected;
            const meetingRoom = io.sockets.adapter.rooms.get(meetingId);
            const isHostInRoom = meetingRoom ? meetingRoom.has(meeting.hostId) : false;
            
            if (isHostConnected && isHostInRoom) {
              console.log(`\n${'='.repeat(80)}`);
              console.log(`🔄 AUTO-RESTART: Question generation stopped but sufficient context now available`);
              console.log(`🔄 Context length: ${contextLength} chars (minimum: 50)`);
              console.log(`🔄 Transcript entries: ${historyCount}`);
              console.log(`🔄 Host verified as connected: ${meeting.hostId}`);
              console.log(`🔄 Automatically restarting question generation for meeting: ${meetingId}`);
              console.log(`${'='.repeat(80)}\n`);
              
              // Emit start_question_generation event as if host requested it
              // We'll trigger it by calling the handler logic directly
              // But we need to be careful - we can't directly call socket.on handlers
              // Instead, we'll emit an internal event or call the start logic
              
              // CRITICAL: Check if timer already exists (shouldn't, but double-check)
              if (llmService.questionGenerationTimer.has(meetingId)) {
                console.log('⚠️ AUTO-RESTART: Timer already exists, skipping restart');
                return;
              }
              
              // Create timer reference
              let questionTimerRef = null;
              
              // Reuse the same checkAndGenerateQuestion function logic
              // We'll create a simplified version that runs immediately
              const checkAndGenerateQuestion = async () => {
                const tickStartTime = Date.now();
                const tickId = `auto-restart-${tickStartTime}`;
                
                console.log(`\n${'='.repeat(80)}`);
                console.log(`🔄 [${tickId}] AUTO-RESTARTED question generation tick for meeting: ${meetingId}`);
                
                try {
                  const currentMeeting = activeMeetings.get(meetingId);
                  if (!currentMeeting) {
                    console.log(`⚠️ [${tickId}] Meeting no longer exists, stopping auto-restarted timer`);
                    if (questionTimerRef) {
                      clearInterval(questionTimerRef);
                    }
                    llmService.questionGenerationTimer.delete(meetingId);
                    return;
                  }
                  
                  // Get recent context
                  const recentContext = llmService.getRecentTranscriptContext(meetingId, 10);
                  const contextLength = recentContext.length;
                  
                  if (contextLength < 50) {
                    console.log(`📝 [${tickId}] AUTO-RESTART: Context too short (${contextLength} chars), will check again later`);
                    return;
                  }
                  
                  // Get participants and generate question (reuse existing logic)
                  const allParticipants = currentMeeting?.participants || [];
                  const hostId = currentMeeting?.hostId;
                  
                  // Get sentiment data for participants
                  const sentimentDataForMeeting = sentimentData.get(meetingId);
                  const allParticipantsWithEmotions = [];
                  const participantEmotions = {};
                  const participantNames = {};
                  
                  if (sentimentDataForMeeting && sentimentDataForMeeting.participants) {
                    sentimentDataForMeeting.participants.forEach((data, key) => {
                      const participant = allParticipants.find(p => p.id === key || p.name === key);
                      if (participant) {
                        allParticipantsWithEmotions.push({
                          id: participant.id,
                          name: participant.name.replace(' (Host)', '').trim(),
                          emotion: data.emotion,
                          timestamp: data.timestamp
                        });
                        participantEmotions[participant.id] = data.emotion;
                        participantNames[participant.id] = participant.name.replace(' (Host)', '').trim();
                      }
                    });
                  }
                  
                  // Generate question
                  const questionResult = await llmService.generateFollowUpQuestion(
                    recentContext,
                    meetingId,
                    allParticipantsWithEmotions,
                    participantEmotions,
                    participantNames
                  );
                  
                  if (questionResult && questionResult.question && questionResult.question.trim().length > 10) {
                    // Update last question time
                    llmService.updateLastQuestionTime(meetingId);
                    
                    // Send question to host
                    if (currentMeeting && currentMeeting.hostId) {
                      const hostSocket = io.sockets.sockets.get(currentMeeting.hostId);
                      const isHostConnected = !!hostSocket && hostSocket.connected;
                      const meetingRoom = io.sockets.adapter.rooms.get(meetingId);
                      const isHostInRoom = meetingRoom ? meetingRoom.has(currentMeeting.hostId) : false;
                      
                      if (isHostConnected && isHostInRoom) {
                        const questionData = {
                          meetingId,
                          question: questionResult.question,
                          topics: questionResult.topics,
                          sentiment: questionResult.sentiment,
                          confidence: questionResult.confidence,
                          timestamp: questionResult.timestamp,
                          model: questionResult.model || 'rule-based',
                          responseTime: questionResult.responseTime || 0
                        };
                        
                        io.to(currentMeeting.hostId).emit('follow_up_suggestion', questionData);
                        console.log(`✅ [${tickId}] AUTO-RESTART: Question sent to host: ${questionResult.question.substring(0, 50)}...`);
                      } else {
                        console.log(`⚠️ [${tickId}] AUTO-RESTART: Host not connected, skipping question emission`);
                      }
                    }
                  }
                } catch (error) {
                  console.error(`❌ [${tickId}] AUTO-RESTART: Question generation failed:`, error);
                }
              };
              
              // Run immediately
              checkAndGenerateQuestion();
              
              // Set up interval for future checks
              questionTimerRef = setInterval(() => {
                checkAndGenerateQuestion();
              }, 30000);
              
              // Store timer
              llmService.questionGenerationTimer.set(meetingId, questionTimerRef);
              
              console.log(`✅ AUTO-RESTART: Question generation timer restarted for meeting: ${meetingId}`);
              console.log(`${'='.repeat(80)}\n`);
            } else {
              console.log(`⚠️ AUTO-RESTART: Host not connected, cannot auto-restart question generation`);
            }
          }
        }
      }
      
      // CRITICAL FIX: Broadcast transcript to all other participants in real-time
      const meeting = activeMeetings.get(meetingId);
      if (meeting && meeting.participants) {
        meeting.participants.forEach(p => {
          // Don't send back to the sender (they already have it)
          // Use p.id as socket ID (participants use their socket.id as their participant id)
          const targetSocketId = p.id || p.socketId;
          // Check both participantId and socket.id to avoid sending to sender
          if (targetSocketId && targetSocketId !== participantId && targetSocketId !== socket?.id) {
            io.to(targetSocketId).emit('transcript_received', {
              meetingId,
              participantId,
              participantName: finalParticipantName,
              transcript: transcript.trim(),
              timestamp,
              language,
              confidence
            });
            console.log(`📤 Broadcasted transcript to ${p.name} (${targetSocketId}) from ${finalParticipantName}`);
          }
        });
      }
      
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
      
      // CRITICAL FIX: Generate meeting notes from transcriptData BEFORE saving
      // Try transcriptData first, then fallback to llmService.transcriptHistory
      let notes = null;
      let transcripts = null;
      let transcriptSource = 'none';
      
      // Debug: Check all transcript sources
      console.log(`🔍 Debug transcript sources for meeting ${meetingId}:`, {
        hasTranscriptData: transcriptData.has(meetingId),
        transcriptDataCount: transcriptData.has(meetingId) ? transcriptData.get(meetingId).length : 0,
        hasLLMTranscriptHistory: llmService.transcriptHistory.has(meetingId),
        llmTranscriptCount: llmService.transcriptHistory.has(meetingId) ? llmService.transcriptHistory.get(meetingId).length : 0
      });
      
      // Try transcriptData first
      if (transcriptData.has(meetingId)) {
        const transcriptDataArray = transcriptData.get(meetingId);
        if (transcriptDataArray && transcriptDataArray.length > 0) {
          transcripts = transcriptDataArray;
          transcriptSource = 'transcriptData';
        }
      }
      
      // FALLBACK: If transcriptData is empty, try llmService.transcriptHistory
      if (!transcripts || transcripts.length === 0) {
        if (llmService.transcriptHistory.has(meetingId)) {
          const llmHistory = llmService.transcriptHistory.get(meetingId);
          if (llmHistory && llmHistory.length > 0) {
            // Convert llmHistory format to transcriptData format for notes generation
            transcripts = llmHistory.map(entry => ({
              timestamp: entry.timestamp || Date.now(),
              participantId: entry.participantId || 'unknown',
              participantName: entry.participantName || 'Unknown',
              transcript: entry.transcript || entry.text || '',
              language: entry.language || 'en-US',
              confidence: entry.confidence || 0.8,
              id: entry.id || `fallback-${Date.now()}-${Math.random()}`
            }));
            transcriptSource = 'llmService.transcriptHistory';
            console.log(`📝 Using fallback transcript source (llmService.transcriptHistory) for meeting ${meetingId}: ${transcripts.length} entries`);
          }
        }
      }
      
      if (transcripts && transcripts.length > 0) {
        console.log(`📝 Generating meeting notes for meeting ${meetingId}...`, { 
          transcriptCount: transcripts.length,
          source: transcriptSource,
          sampleTranscript: transcripts[0]?.transcript?.substring(0, 50) + '...'
        });
        try {
          notes = await llmService.generateMeetingNotes(transcripts, meetingId);
          console.log(`✅ Meeting notes generated for meeting ${meetingId}`, {
            hasSummary: !!notes?.summary,
            hasImportantPoints: !!notes?.importantPoints,
            importantPointsCount: notes?.importantPoints?.length || 0
          });
          
          // Save notes to meeting history
          await meetingHistoryManager.saveMeetingNotes(meetingId, notes);
          console.log(`💾 Meeting notes saved to history for meeting ${meetingId}`);
        } catch (error) {
          console.error(`❌ Error generating/saving meeting notes for meeting ${meetingId}:`, error);
          console.error(`❌ Error stack:`, error.stack);
          // Continue even if notes generation fails
        }
      } else {
        console.log(`⚠️ No transcripts found for meeting ${meetingId} - cannot generate notes`, {
          hasTranscriptData: transcriptData.has(meetingId),
          transcriptDataCount: transcriptData.has(meetingId) ? transcriptData.get(meetingId).length : 0,
          hasLLMHistory: llmService.transcriptHistory.has(meetingId),
          llmHistoryCount: llmService.transcriptHistory.has(meetingId) ? llmService.transcriptHistory.get(meetingId).length : 0
        });
      }
      
      // REMOVED: Highlight detection feature - no longer getting highlights
      const existingRecordingSession = recordingSessions.get(meetingId);
      
      // Get transcript history
      const transcriptHistory = (llmService.transcriptHistory.has(meetingId) 
        ? llmService.transcriptHistory.get(meetingId) 
        : []) || [];
      
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
      // CRITICAL FIX: Use transcriptData instead of llmService.getTranscriptHistory for meeting history
      // transcriptData has the full transcript with participant names needed for notes
      const transcriptHistoryForSave = transcriptData.has(meetingId) ? transcriptData.get(meetingId) : (transcriptHistory || []);
      
      console.log('💾 Saving meeting to history:', {
        meetingId,
        transcriptDataCount: transcriptData.has(meetingId) ? transcriptData.get(meetingId).length : 0,
        transcriptHistoryCount: transcriptHistory.length,
        transcriptHistoryForSaveCount: transcriptHistoryForSave.length,
        hasNotes: !!notes
      });
      
      try {
        // Function signature: saveMeetingToHistory(meetingData, recordingSession, transcriptHistory, sentimentData)
        const historyPath = await meetingHistoryManager.saveMeetingToHistory(
          meeting,
          existingRecordingSession,
          transcriptHistoryForSave,
          meetingSentimentData
        );
        console.log('💾 Meeting saved to history:', historyPath);
        
        // Emit history saved event
        io.to(meetingId).emit('meeting_saved_to_history', {
          meetingId,
          historyPath,
          transcriptEntries: transcriptHistory.length,
          hasRecording: !!existingRecordingSession,
          notesGenerated: !!notes
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

