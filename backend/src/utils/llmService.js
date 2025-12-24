// LLM Service for AI-Driven Smart Follow-up Question Generation
// This service handles audio transcription and question generation

import speech from '@google-cloud/speech';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Using Google Gemini 2.5 Flash (fallback to gemini-1.5-flash if not available)

class LLMService {
  constructor() {
    this.transcriptionBuffer = new Map(); // meetingId -> audio chunks
    this.transcriptHistory = new Map(); // meetingId -> transcript history
    this.questionGenerationTimer = new Map(); // meetingId -> timer
    this.lastQuestionTime = new Map(); // meetingId -> timestamp
    
    // Performance monitoring
    this.performanceStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: null
    };
    
    // Gemini configuration
    this.geminiApiKey = process.env.GEMINI_API_KEY || null;
    this.geminiModel = 'models/gemini-2.5-flash'; // Use Gemini 2.5 Flash (latest fast model)
    this.geminiClient = null;
    
    // Initialize Speech-to-Text client
    this.initializeSpeechClient();
    
    // Initialize LLM - Try multiple options in order of preference
    this.initializeLLMAsync();
  }

  // Async initialization method
  async initializeLLMAsync() {
    try {
      console.log('🤖 LLM: Starting initialization...');
      await this.initializeLLM();
      console.log('🤖 LLM initialization completed:', this.llmType);
      
      // Test Gemini if it's being used
      if (this.llmType === 'gemini') {
        console.log('🤖 LLM: Testing Gemini connection...');
        const testResult = await this.testGeminiConnection();
        if (testResult) {
          console.log('✅ Gemini is working correctly');
        } else {
          console.log('⚠️ Gemini test failed, but will continue with fallback');
        }
      }
    } catch (error) {
      console.error('❌ LLM initialization failed:', error);
      this.llmType = 'rule-based';
      console.log('🤖 Falling back to rule-based question generation');
    }
  }

  // Re-initialize LLM when meeting starts (to ensure Gemini is available)
  async reinitializeForMeeting(meetingId) {
    try {
      console.log(`🤖 Re-initializing LLM for meeting ${meetingId}...`);
      
      // Re-initialize LLM
      await this.initializeLLM();
      console.log(`🤖 LLM re-initialization completed for meeting ${meetingId}:`, this.llmType);
      
      // Test Gemini if it's being used
      if (this.llmType === 'gemini') {
        console.log(`🤖 Testing Gemini connection for meeting ${meetingId}...`);
        const testResult = await this.testGeminiConnection();
        if (testResult) {
          console.log(`✅ Gemini is working correctly for meeting ${meetingId}`);
          return true;
        } else {
          console.log(`⚠️ Gemini test failed for meeting ${meetingId}, but keeping Gemini enabled`);
          // Keep Gemini enabled even if test fails - it might work during actual use
          console.log(`🤖 Gemini will be retried during question generation for meeting ${meetingId}`);
          return true; // Return true to enable AI features, Gemini will be retried
        }
      }
      
      // If not Gemini, still return true to enable basic AI features
      console.log(`🤖 AI features enabled for meeting ${meetingId} with ${this.llmType}`);
      return true;
    } catch (error) {
      console.error(`❌ LLM re-initialization failed for meeting ${meetingId}:`, error);
      console.log(`🤖 AI features will use fallback mode for meeting ${meetingId}`);
      return true; // Return true to enable basic AI features even if LLM fails
    }
  }

  // Test Gemini connection and model availability
  async testGeminiConnection() {
    try {
      console.log('🤖 Gemini: Testing connection and model...');
      
      if (!this.geminiApiKey) {
        console.log('🤖 Gemini: API key not configured');
        return false;
      }
      
      if (!this.geminiClient) {
        this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
      }
      
      // Try to get the model with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        // Use gemini-2.5-flash (latest fast model)
        const model = this.geminiClient.getGenerativeModel({ model: 'models/gemini-2.5-flash' });
        this.geminiModel = 'models/gemini-2.5-flash';
        
        // Test with a simple prompt
        const testResult = await Promise.race([
          model.generateContent('Hi'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        
        clearTimeout(timeoutId);
        
        if (testResult && testResult.response) {
          console.log('🤖 Gemini: Test successful, model is working');
          return true;
        } else {
          console.error('🤖 Gemini: Test failed - no response');
          return false;
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.message === 'Timeout' || error.name === 'AbortError') {
          console.error('🤖 Gemini: Test timed out after 10 seconds');
        } else {
          console.error('🤖 Gemini: Test failed:', error.message);
        }
        // gemini-pro should work, so if it fails, return false
        return false;
      }
    } catch (error) {
      console.error('🤖 Gemini: Test failed:', error.message);
      return false;
    }
  }

  // Get current LLM status for debugging
  getLLMStatus() {
    return {
      llmType: this.llmType,
      geminiModel: this.geminiModel,
      hasApiKey: !!this.geminiApiKey,
      isInitialized: !!this.llmType,
      performanceStats: this.performanceStats
    };
  }

  // Initialize Google Cloud Speech-to-Text client
  initializeSpeechClient() {
    try {
      // Check if Google Cloud credentials are available
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT) {
        this.speechClient = new speech.SpeechClient();
        this.speechEnabled = true;
        console.log('🎤 Google Cloud Speech-to-Text initialized');
      } else {
        this.speechClient = null;
        this.speechEnabled = false;
        console.log('🎤 Google Cloud Speech-to-Text not configured (using mock transcription)');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Speech-to-Text:', error.message);
      this.speechClient = null;
      this.speechEnabled = false;
    }
  }

  // Initialize LLM with fallback options
  async initializeLLM() {
    // Option 1: Google Gemini 2.5 Flash
    if (this.geminiApiKey) {
      try {
        this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
        // Use gemini-2.5-flash (latest fast model)
        const model = this.geminiClient.getGenerativeModel({ model: 'models/gemini-2.5-flash' });
        this.geminiModel = 'models/gemini-2.5-flash';
        this.llmType = 'gemini';
        console.log('🤖 Using Google Gemini 2.5 Flash for question generation');
        return;
      } catch (error) {
        console.error('🤖 Gemini initialization failed:', error.message);
        // Fall through to rule-based
      }
    }

    // Option 2: Fallback to rule-based (always available)
    this.llmType = 'rule-based';
    console.log('🤖 Using rule-based question generation (fallback)');
  }


  // Real-time audio transcription using Google Cloud Speech-to-Text
  async getTranscription(audioStream, meetingId) {
    try {
      console.log('🎤 Processing audio for transcription...', { meetingId, audioSize: audioStream.length });
      
      if (this.speechEnabled && this.speechClient) {
        // Use real Google Cloud Speech-to-Text
        return await this.transcribeWithGoogleCloud(audioStream, meetingId);
      } else {
        // Fallback to mock transcription
        return await this.mockTranscription(audioStream, meetingId);
      }
      
    } catch (error) {
      console.error('❌ Transcription failed:', error);
      // Fallback to mock transcription on error
      return await this.mockTranscription(audioStream, meetingId);
    }
  }

  // Real Google Cloud Speech-to-Text transcription
  async transcribeWithGoogleCloud(audioStream, meetingId) {
    try {
      const request = {
        audio: {
          content: audioStream.toString('base64'),
        },
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          enableSpeakerDiarization: true,
          diarizationSpeakerCount: 2,
          model: 'latest_long',
        },
      };

      const [response] = await this.speechClient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      if (transcription) {
        console.log('📝 Google Cloud transcription:', transcription);
        return {
          transcript: transcription,
          confidence: response.results[0]?.alternatives[0]?.confidence || 0.8,
          timestamp: Date.now(),
          source: 'google-cloud'
        };
      } else {
        throw new Error('No transcription result');
      }
    } catch (error) {
      console.error('❌ Google Cloud transcription failed:', error);
      throw error;
    }
  }

  // Mock transcription fallback
  async mockTranscription(audioStream, meetingId) {
    // Simulate transcription processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Placeholder transcription - in production, this would call the actual STT API
    const mockTranscriptions = [
      "Let's discuss the quarterly results",
      "I think we need to focus on user engagement",
      "The new feature implementation looks promising",
      "We should consider the budget implications",
      "What are your thoughts on the timeline?",
      "I'm concerned about the technical challenges",
      "The team has been working hard on this project",
      "We need to prioritize the most important features",
      "Let's schedule a follow-up meeting next week",
      "I'd like to hear more about the implementation details"
    ];
    
    // Return a random mock transcription for demonstration
    const randomTranscript = mockTranscriptions[Math.floor(Math.random() * mockTranscriptions.length)];
    
    console.log('📝 Mock transcription:', randomTranscript);
    return {
      transcript: randomTranscript,
      confidence: 0.85,
      timestamp: Date.now(),
      source: 'mock'
    };
  }

  // Generate follow-up questions using available LLM
  async generateFollowUpQuestion(transcriptContext, meetingId, allParticipantsWithEmotions = [], participantEmotions = {}, participantNames = {}, emotionCategories = {}) {
    const startTime = Date.now();
    this.performanceStats.totalRequests++;
    this.performanceStats.lastRequestTime = startTime;
    
    try {
      console.log(`🤖 Generating follow-up question with ${this.llmType}...`, { 
        meetingId, 
        contextLength: transcriptContext.length,
        totalParticipants: allParticipantsWithEmotions.length,
        negativeEmotions: emotionCategories.negative?.length || 0,
        positiveEmotions: emotionCategories.positive?.length || 0,
        neutralEmotions: emotionCategories.neutral?.length || 0,
        participantEmotionsCount: Object.keys(participantEmotions).length
      });
      
      // Analyze transcript context for topic detection
      const topics = this.detectTopics(transcriptContext);
      const sentiment = this.analyzeSentiment(transcriptContext);
      
      let generatedQuestion;
      let modelName;
      let confidence;

      // Try different LLM options based on availability
      if (this.llmType === 'gemini') {
        try {
        const result = await this.generateWithGemini(
          transcriptContext, 
          topics, 
          sentiment,
          allParticipantsWithEmotions,
          participantEmotions,
          participantNames,
          emotionCategories
        );
        generatedQuestion = result.question;
        modelName = this.geminiModel;
        confidence = 0.9;
        } catch (error) {
          console.log('🤖 Gemini failed, falling back to rule-based:', error.message);
          const result = this.generateWithRuleBased(topics, sentiment, transcriptContext, allParticipantsWithEmotions, participantNames, emotionCategories);
          generatedQuestion = result.question;
          modelName = 'rule-based-fallback';
          confidence = 0.6;
        }
      } else {
        // Fallback to rule-based
        const result = this.generateWithRuleBased(topics, sentiment, transcriptContext, allParticipantsWithEmotions, participantNames, emotionCategories);
        generatedQuestion = result.question;
        modelName = 'rule-based';
        confidence = 0.6;
      }
      
      // Update performance stats
      const responseTime = Date.now() - startTime;
      this.performanceStats.successfulRequests++;
      this.performanceStats.averageResponseTime = 
        (this.performanceStats.averageResponseTime * (this.performanceStats.successfulRequests - 1) + responseTime) / 
        this.performanceStats.successfulRequests;
      
      console.log(`❓ ${this.llmType} generated follow-up question:`, generatedQuestion);
      console.log(`⏱️ Response time: ${responseTime}ms`);
      
      return {
        question: generatedQuestion,
        topics: topics,
        sentiment: sentiment,
        timestamp: Date.now(),
        confidence: confidence,
        model: modelName,
        responseTime: responseTime
      };
      
    } catch (error) {
      this.performanceStats.failedRequests++;
      console.error(`❌ ${this.llmType} question generation failed:`, error);
      
      // Fallback to rule-based questions
      console.log('🔄 Falling back to rule-based question generation...');
      const topics = this.detectTopics(transcriptContext);
      const sentiment = this.analyzeSentiment(transcriptContext);
      const result = this.generateWithRuleBased(topics, sentiment, transcriptContext, allParticipantsWithEmotions, participantNames, emotionCategories);
      
      return {
        question: result.question,
        topics: topics,
        sentiment: sentiment,
        timestamp: Date.now(),
        confidence: 0.5, // Lower confidence for error fallback
        model: 'fallback-rule-based',
        responseTime: Date.now() - startTime
      };
    }
  }

  // Generate question using Google Gemini 2.5 Flash (or 1.5 Flash fallback)
  async generateWithGemini(transcriptContext, topics, sentiment, allParticipantsWithEmotions = [], participantEmotions = {}, participantNames = {}, emotionCategories = {}) {
    console.log('🤖 Gemini: Generating question with context:', {
      transcriptLength: transcriptContext?.length || 0,
      topicsCount: topics?.length || 0,
      sentiment: sentiment,
      totalParticipants: allParticipantsWithEmotions.length,
      negativeEmotions: emotionCategories.negative?.length || 0,
      positiveEmotions: emotionCategories.positive?.length || 0,
      neutralEmotions: emotionCategories.neutral?.length || 0,
      model: this.geminiModel
    });

    if (!this.geminiClient || !this.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Detect language from transcript context
    const detectedLanguage = this.detectLanguageFromContext(transcriptContext);
    
    // Analyze conversation context more deeply
    const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
    
    // Build participant state context based on ALL emotions (not just confused)
    let participantStateContext = '';
    if (allParticipantsWithEmotions.length > 0) {
      const emotionDetails = allParticipantsWithEmotions.map(p => `${p.name}: ${p.emotion}`).join(', ');
      
      let emotionSummary = [];
      if (emotionCategories.negative && emotionCategories.negative.length > 0) {
        const negativeNames = emotionCategories.negative.map(p => p.name).join(', ');
        const negativeEmotions = emotionCategories.negative.map(p => p.emotion).join(', ');
        emotionSummary.push(`- Negative emotions (${negativeEmotions}): ${negativeNames}`);
      }
      if (emotionCategories.positive && emotionCategories.positive.length > 0) {
        const positiveNames = emotionCategories.positive.map(p => p.name).join(', ');
        const positiveEmotions = emotionCategories.positive.map(p => p.emotion).join(', ');
        emotionSummary.push(`- Positive emotions (${positiveEmotions}): ${positiveNames}`);
      }
      if (emotionCategories.neutral && emotionCategories.neutral.length > 0) {
        const neutralNames = emotionCategories.neutral.map(p => p.name).join(', ');
        emotionSummary.push(`- Neutral emotions: ${neutralNames}`);
      }
      
      participantStateContext = `\n\nPARTICIPANT STATE (IMPORTANT):
${emotionSummary.join('\n')}
- All participant emotions: ${emotionDetails}
- Generate questions that:
  * For negative emotions (confused, sad, fear, angry): Help clarify or address concerns
  * For positive emotions (happy, surprised): Build on their engagement or excitement
  * For neutral emotions: Maintain engagement or check understanding
- Consider the overall emotional state when generating the question`;
    }
    
    const prompt = `You are an intelligent meeting facilitator. Analyze this conversation and generate ONE highly relevant follow-up question that will advance the discussion.

CONVERSATION CONTEXT:
"${transcriptContext}"

ANALYSIS:
- Main Topics: ${topics.map(t => t.topic).join(', ')}
- Sentiment: ${sentiment}
- Language: ${detectedLanguage}
- Key Points: ${conversationAnalysis.keyPoints.join(', ')}
- Unresolved Issues: ${conversationAnalysis.unresolvedIssues.join(', ')}
- Recent Focus: ${conversationAnalysis.recentFocus}${participantStateContext}

CRITICAL REQUIREMENTS:
1. The question MUST be DIRECTLY related to what was discussed in the conversation above
2. The question MUST reference specific topics, points, or issues mentioned in the conversation
3. ${allParticipantsWithEmotions.length > 0 ? `Consider participant emotions when generating questions:
   - For negative emotions (confused, sad, fear, angry): Generate questions that help clarify or address concerns
   - For positive emotions (happy, surprised, excited): Generate questions that build on their engagement or excitement
   - For neutral emotions: Generate questions that maintain engagement or check understanding` : ''}
4. DO NOT generate generic questions that could apply to any meeting
5. DO NOT generate questions about topics NOT mentioned in the conversation
6. If the conversation is unclear or too short, DO NOT generate a question
7. The question should build on the LAST 2-3 sentences or main points discussed
8. Use the same language as the conversation (${detectedLanguage})
9. Keep it concise (one sentence, maximum 20 words)

EXAMPLES OF GOOD QUESTIONS:
- If conversation mentions "budget", ask: "What is the total budget allocated for this project?"
- If conversation mentions "timeline", ask: "When do we need to complete this by?"
- If conversation mentions "team", ask: "Who will be responsible for this task?"
${allParticipantsWithEmotions.length > 0 ? `- If participants show negative emotions: "Would you like to clarify ${emotionCategories.negative && emotionCategories.negative.length > 0 ? emotionCategories.negative[0].name + '\'s' : 'the'} question about [specific topic]?"
- If participants show positive emotions: "What aspects of [topic] are you most excited about?"
- If participants show neutral emotions: "How do you feel about [topic]? Any questions?"` : ''}

EXAMPLES OF BAD QUESTIONS (DO NOT GENERATE THESE):
- "Are there any dependencies we need to consider?" (too generic, not specific to conversation)
- "What are your thoughts on this?" (too vague)
- "Can you elaborate?" (not specific enough)

Generate ONLY the question, no explanations or additional text.`;

    try {
      // Get the model (try primary model, fallback if needed)
      let model;
      try {
        model = this.geminiClient.getGenerativeModel({ model: this.geminiModel });
      } catch (e) {
        // If gemini-pro fails, throw the error
        throw e;
      }
      
      console.log('🤖 Gemini: Sending request to Gemini API...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
      ]);
      
      clearTimeout(timeoutId);
      
      if (!result || !result.response) {
        throw new Error('Gemini API returned no response');
      }
      
      const responseText = result.response.text();
      console.log('🤖 Gemini: Generated question:', responseText);
      
      return { question: responseText.trim() };
    } catch (error) {
      console.error('🤖 Gemini: Error generating question:', error);
      if (error.message === 'Timeout' || error.name === 'AbortError') {
        throw new Error('Gemini request timeout');
      }
      throw error;
    }
  }

  /**
   * Detect language from transcript context
   * @param {string} text - Text to analyze
   * @returns {string} Detected language
   */
  detectLanguageFromContext(text) {
    if (!text || text.length < 10) return 'english';
    
    const lowerText = text.toLowerCase();
    const languagePatterns = {
      'spanish': /[ñáéíóúü]/i,
      'french': /[àâäéèêëïîôöùûüÿç]/i,
      'german': /[äöüß]/i,
      'hindi': /[अ-ह]/,
      'english': /[a-z]/i
    };
    
    let maxMatches = 0;
    let detectedLang = 'english';
    
    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      const matches = (lowerText.match(pattern) || []).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedLang = lang;
      }
    }
    
    console.log(`🌍 LLM Language detected: ${detectedLang}`);
    return detectedLang;
  }

  // Analyze conversation context for better question generation
  analyzeConversationContext(transcriptContext) {
    if (!transcriptContext || transcriptContext.length < 20) {
      return {
        keyPoints: [],
        unresolvedIssues: [],
        recentFocus: 'General discussion'
      };
    }

    const text = transcriptContext.toLowerCase();
    const sentences = transcriptContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Extract key points from the conversation
    const keyPoints = [];
    const unresolvedIssues = [];
    
    // Look for decision points, problems, and important statements
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      
      // Key points - decisions, conclusions, important statements
      if (lowerSentence.includes('decided') || lowerSentence.includes('agreed') || 
          lowerSentence.includes('concluded') || lowerSentence.includes('important') ||
          lowerSentence.includes('key') || lowerSentence.includes('main')) {
        keyPoints.push(sentence.trim());
      }
      
      // Unresolved issues - problems, concerns, questions
      if (lowerSentence.includes('problem') || lowerSentence.includes('issue') || 
          lowerSentence.includes('concern') || lowerSentence.includes('challenge') ||
          lowerSentence.includes('difficult') || lowerSentence.includes('unclear') ||
          lowerSentence.includes('need to') || lowerSentence.includes('should we')) {
        unresolvedIssues.push(sentence.trim());
      }
    });
    
    // Determine recent focus from the last few sentences
    const recentSentences = sentences.slice(-3);
    let recentFocus = 'General discussion';
    
    if (recentSentences.length > 0) {
      const lastSentence = recentSentences[recentSentences.length - 1];
      if (lastSentence.toLowerCase().includes('budget') || lastSentence.toLowerCase().includes('cost')) {
        recentFocus = 'Budget and financial planning';
      } else if (lastSentence.toLowerCase().includes('timeline') || lastSentence.toLowerCase().includes('schedule')) {
        recentFocus = 'Timeline and scheduling';
      } else if (lastSentence.toLowerCase().includes('team') || lastSentence.toLowerCase().includes('people')) {
        recentFocus = 'Team and resources';
      } else if (lastSentence.toLowerCase().includes('technical') || lastSentence.toLowerCase().includes('implementation')) {
        recentFocus = 'Technical implementation';
      } else if (lastSentence.toLowerCase().includes('customer') || lastSentence.toLowerCase().includes('user')) {
        recentFocus = 'Customer/user experience';
      }
    }
    
    return {
      keyPoints: keyPoints.slice(0, 3), // Limit to 3 most relevant
      unresolvedIssues: unresolvedIssues.slice(0, 3), // Limit to 3 most relevant
      recentFocus: recentFocus
    };
  }

  // Generate question using rule-based system
  generateWithRuleBased(topics, sentiment, transcriptContext) {
    // Use conversation analysis for better rule-based questions
    const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
    const followUpQuestions = this.generateContextualQuestions(topics, sentiment, transcriptContext, conversationAnalysis);
    
    // Filter out empty questions
    const validQuestions = followUpQuestions.filter(q => q && q.trim().length > 0);
    
    if (validQuestions.length === 0) {
      console.log('📝 No valid context-specific questions - conversation not specific enough');
      // Return a very generic question only as last resort, but this should rarely happen
      return { question: '' };
    }
    
    const selectedQuestion = validQuestions[Math.floor(Math.random() * validQuestions.length)];
    return { question: selectedQuestion };
  }

  // Detect topics from transcript
  detectTopics(transcript) {
    const topicKeywords = {
      'budget': ['budget', 'cost', 'money', 'financial', 'expense', 'revenue'],
      'timeline': ['timeline', 'schedule', 'deadline', 'time', 'when', 'due'],
      'technical': ['technical', 'implementation', 'code', 'development', 'technology'],
      'team': ['team', 'collaboration', 'work', 'people', 'staff', 'members'],
      'features': ['features', 'functionality', 'requirements', 'specifications'],
      'user': ['user', 'customer', 'client', 'audience', 'experience'],
      'project': ['project', 'initiative', 'program', 'campaign']
    };

    const detectedTopics = [];
    const lowerTranscript = transcript.toLowerCase();

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const matches = keywords.filter(keyword => lowerTranscript.includes(keyword));
      if (matches.length > 0) {
        detectedTopics.push({
          topic,
          matches,
          confidence: matches.length / keywords.length
        });
      }
    }

    return detectedTopics;
  }

  // Analyze sentiment of transcript
  analyzeSentiment(transcript) {
    const positiveWords = ['good', 'great', 'excellent', 'positive', 'success', 'improve', 'better', 'promising'];
    const negativeWords = ['bad', 'poor', 'concern', 'problem', 'issue', 'challenge', 'difficult', 'worry'];
    const neutralWords = ['discuss', 'consider', 'think', 'plan', 'review', 'analyze'];

    const lowerTranscript = transcript.toLowerCase();
    
    const positiveCount = positiveWords.filter(word => lowerTranscript.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerTranscript.includes(word)).length;
    const neutralCount = neutralWords.filter(word => lowerTranscript.includes(word)).length;

    if (positiveCount > negativeCount && positiveCount > neutralCount) {
      return 'positive';
    } else if (negativeCount > positiveCount && negativeCount > neutralCount) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  // Generate question using rule-based system
  generateWithRuleBased(topics, sentiment, transcriptContext, allParticipantsWithEmotions = [], participantNames = {}, emotionCategories = {}) {
    // Use conversation analysis for better rule-based questions
    const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
    const followUpQuestions = this.generateContextualQuestions(topics, sentiment, transcriptContext, conversationAnalysis, allParticipantsWithEmotions, participantNames, emotionCategories);
    
    // Filter out empty questions
    const validQuestions = followUpQuestions.filter(q => q && q.trim().length > 0);
    
    if (validQuestions.length === 0) {
      console.log('📝 No valid context-specific questions - conversation not specific enough');
      // Return a very generic question only as last resort, but this should rarely happen
      return { question: '' };
    }
    
    const selectedQuestion = validQuestions[Math.floor(Math.random() * validQuestions.length)];
    return { question: selectedQuestion };
  }

  // Generate contextual follow-up questions - STRICT: Only questions directly related to conversation
  generateContextualQuestions(topics, sentiment, transcript, conversationAnalysis = null, allParticipantsWithEmotions = [], participantNames = {}, emotionCategories = {}) {
    const questions = [];
    const lowerTranscript = transcript.toLowerCase();

    // CRITICAL: Only generate questions if we have clear topics or issues from the conversation
    if (topics.length === 0 && (!conversationAnalysis || conversationAnalysis.unresolvedIssues.length === 0)) {
      console.log('📝 No clear topics or issues found - skipping question generation');
      return ['']; // Return empty to prevent generic questions
    }

    // If we have conversation analysis, use it for more specific questions
    if (conversationAnalysis && conversationAnalysis.unresolvedIssues.length > 0) {
      // Generate questions based on unresolved issues - MUST reference specific issue
      conversationAnalysis.unresolvedIssues.forEach(issue => {
        const lowerIssue = issue.toLowerCase();
        // Only generate if the issue is actually mentioned in transcript
        if (!lowerTranscript.includes(lowerIssue.substring(0, 10))) {
          return; // Skip if issue not in transcript
        }
        
        if (lowerIssue.includes('budget') || lowerIssue.includes('cost') || lowerIssue.includes('money')) {
          // Extract specific budget/cost mention from transcript
          const budgetMention = this.extractSpecificMention(transcript, ['budget', 'cost', 'money', 'financial']);
          if (budgetMention) {
            questions.push(`What's the budget for ${budgetMention}?`);
            questions.push(`How much will ${budgetMention} cost?`);
          }
        } else if (lowerIssue.includes('timeline') || lowerIssue.includes('schedule') || lowerIssue.includes('deadline')) {
          const timelineMention = this.extractSpecificMention(transcript, ['timeline', 'schedule', 'deadline', 'when']);
          if (timelineMention) {
            questions.push(`When do we need to complete ${timelineMention}?`);
            questions.push(`What's the deadline for ${timelineMention}?`);
          }
        } else if (lowerIssue.includes('team') || lowerIssue.includes('people') || lowerIssue.includes('resource')) {
          const teamMention = this.extractSpecificMention(transcript, ['team', 'people', 'resource', 'who']);
          if (teamMention) {
            questions.push(`Who will handle ${teamMention}?`);
            questions.push(`What resources do we need for ${teamMention}?`);
          }
        } else {
          // Generic but still related to the specific issue
          const issueWords = issue.split(/\s+/).slice(0, 3).join(' ');
          questions.push(`How do we resolve the ${issueWords} issue?`);
        }
      });
    }

    // Topic-based questions - ONLY if topic is clearly mentioned
    topics.forEach(topicData => {
      // Verify topic is actually in transcript
      const topicKeywords = topicData.matches || [];
      if (topicKeywords.length === 0) return;
      
      // Extract specific mention of the topic
      const specificMention = this.extractSpecificMention(transcript, topicKeywords);
      if (!specificMention) return; // Skip if no specific mention found
      
      switch (topicData.topic) {
        case 'budget':
          questions.push(`What's the budget for ${specificMention}?`);
          questions.push(`How much does ${specificMention} cost?`);
          break;
        case 'timeline':
          questions.push(`What's the timeline for ${specificMention}?`);
          questions.push(`When will ${specificMention} be completed?`);
          break;
        case 'technical':
          questions.push(`What are the technical challenges for ${specificMention}?`);
          questions.push(`How will we implement ${specificMention}?`);
          break;
        case 'team':
          questions.push(`Who will work on ${specificMention}?`);
          questions.push(`What team is needed for ${specificMention}?`);
          break;
        case 'features':
          questions.push(`What features are needed for ${specificMention}?`);
          questions.push(`Which features are most important for ${specificMention}?`);
          break;
        case 'user':
          questions.push(`How will ${specificMention} affect users?`);
          questions.push(`What do users need from ${specificMention}?`);
          break;
      }
    });

    // Add participant-specific questions based on ALL emotions (not just confused)
    if (allParticipantsWithEmotions.length > 0) {
      const mainTopic = topics.length > 0 ? topics[0].topic : 'the current topic';
      
      // Questions for negative emotions (confused, sad, fear, angry)
      if (emotionCategories.negative && emotionCategories.negative.length > 0) {
        const negativeNames = emotionCategories.negative.map(p => p.name).join(', ');
        if (emotionCategories.negative.length === 1) {
          const participant = emotionCategories.negative[0];
          questions.push(`Would you like to clarify ${participant.name}'s question about ${mainTopic}?`);
          questions.push(`${participant.name} appears ${participant.emotion}. Should we revisit ${mainTopic}?`);
        } else {
          questions.push(`Would you like to clarify the discussion for ${negativeNames}?`);
          questions.push(`Some participants appear concerned. Should we revisit ${mainTopic}?`);
        }
      }
      
      // Questions for positive emotions (happy, surprised, excited)
      if (emotionCategories.positive && emotionCategories.positive.length > 0) {
        const positiveNames = emotionCategories.positive.map(p => p.name).join(', ');
        if (emotionCategories.positive.length === 1) {
          questions.push(`What aspects of ${mainTopic} is ${positiveNames} most excited about?`);
          questions.push(`Should we explore ${mainTopic} further based on ${positiveNames}'s interest?`);
        } else {
          questions.push(`What aspects of ${mainTopic} are ${positiveNames} most excited about?`);
          questions.push(`Should we build on the positive engagement around ${mainTopic}?`);
        }
      }
      
      // Questions for neutral emotions
      if (emotionCategories.neutral && emotionCategories.neutral.length > 0) {
        const neutralNames = emotionCategories.neutral.map(p => p.name).join(', ');
        if (emotionCategories.neutral.length === 1) {
          questions.push(`How does ${neutralNames} feel about ${mainTopic}?`);
          questions.push(`Any questions from ${neutralNames} about ${mainTopic}?`);
        } else {
          questions.push(`How do ${neutralNames} feel about ${mainTopic}?`);
          questions.push(`Any questions from the participants about ${mainTopic}?`);
        }
      }
    }

    // REMOVED: Sentiment-based and general questions - they're too generic
    // Only use questions that reference specific topics from the conversation

    // If no specific questions generated, return empty array to prevent generic questions
    if (questions.length === 0) {
      console.log('📝 No context-specific questions generated - conversation too generic');
      return [''];
    }

    return questions;
  }

  // Helper function to extract specific mention from transcript
  extractSpecificMention(transcript, keywords) {
    if (!transcript || !keywords || keywords.length === 0) return null;
    
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const lowerTranscript = transcript.toLowerCase();
    
    // Find sentence containing the keyword
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerTranscript.includes(lowerKeyword)) {
        // Find the sentence with the keyword
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(lowerKeyword)) {
            // Extract 3-5 words around the keyword
            const words = sentence.trim().split(/\s+/);
            const keywordIndex = words.findIndex(w => w.toLowerCase().includes(lowerKeyword));
            if (keywordIndex >= 0) {
              const start = Math.max(0, keywordIndex - 2);
              const end = Math.min(words.length, keywordIndex + 3);
              const mention = words.slice(start, end).join(' ');
              // Clean up mention (remove punctuation at start/end)
              return mention.replace(/^[^\w]+|[^\w]+$/g, '').trim() || keyword;
            }
          }
        }
        // Fallback: return the keyword itself
        return keyword;
      }
    }
    
    return null;
    questions.push(
      "What are the next steps we should take?",
      "Is there anything else we should consider?",
      "How can we ensure this stays on track?",
      "What support do you need to move forward?",
      "Are there any risks we should be aware of?"
    );

    return questions;
  }

  // Add transcript to history
  addToTranscriptHistory(meetingId, transcript) {
    if (!this.transcriptHistory.has(meetingId)) {
      this.transcriptHistory.set(meetingId, []);
    }
    
    const history = this.transcriptHistory.get(meetingId);
    history.push({
      transcript,
      timestamp: Date.now()
    });
    
    // Keep only last 10 transcripts to manage memory
    if (history.length > 10) {
      history.shift();
    }
  }

  // Get recent transcript context
  getRecentTranscriptContext(meetingId, minutes = 5) {
    if (!this.transcriptHistory.has(meetingId)) {
      return '';
    }
    
    const history = this.transcriptHistory.get(meetingId);
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    
    const recentTranscripts = history
      .filter(entry => entry.timestamp > cutoffTime)
      .map(entry => entry.transcript)
      .join(' ');
    
    return recentTranscripts;
  }

  // Get full transcript history for a meeting
  getTranscriptHistory(meetingId) {
    if (!this.transcriptHistory.has(meetingId)) {
      return [];
    }
    
    return this.transcriptHistory.get(meetingId);
  }

  // Check if enough time has passed since last question
  shouldGenerateQuestion(meetingId, intervalMinutes = 2) {
    const lastTime = this.lastQuestionTime.get(meetingId) || 0;
    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;
    
    return (now - lastTime) > intervalMs;
  }

  // Intelligent question generation trigger based on conversation flow
  shouldGenerateQuestionIntelligently(meetingId, transcriptContext) {
    // First check basic time interval - exactly 5 minutes minimum (increased from 3)
    // This ensures questions only appear after substantial conversation time
    if (!this.shouldGenerateQuestion(meetingId, 5)) {
      console.log('🤖 Question trigger: Time interval not met (need 5 minutes)');
      return false;
    }

    // STRICT validation - require substantial conversation (increased from 200 to 800 characters)
    if (!transcriptContext || transcriptContext.length < 800) {
      console.log('🤖 Question trigger: Insufficient conversation content (need at least 800 chars)');
      return false;
    }
    
    // Check for meaningful conversation with higher requirements
    const words = transcriptContext.split(/\s+/).filter(word => word.length > 2);
    const uniqueWords = new Set(words.map(word => word.toLowerCase()));
    
    // Increased requirements: at least 60 words and 25 unique words
    if (words.length < 60 || uniqueWords.size < 25) {
      console.log('🤖 Question trigger: Insufficient meaningful conversation (need at least 60 words, 25 unique)');
      return false;
    }
    
    // Check for complete sentences - ensure it's actual conversation
    const sentences = transcriptContext.split(/[.!?]+/).filter(s => s.trim().length > 15);
    if (sentences.length < 5) {
      console.log('🤖 Question trigger: Insufficient complete sentences (need at least 5 sentences)');
      return false;
    }

    // Only generate questions if there's substantial, meaningful conversation
    console.log('🤖 Question trigger: Time interval met with substantial conversation - generating question');
    return true;
  }

  // Update last question time
  updateLastQuestionTime(meetingId) {
    this.lastQuestionTime.set(meetingId, Date.now());
  }

  // Get performance statistics
  getPerformanceStats() {
    return {
      ...this.performanceStats,
      successRate: this.performanceStats.totalRequests > 0 
        ? (this.performanceStats.successfulRequests / this.performanceStats.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      llmType: this.llmType,
      activeMeetings: this.transcriptHistory.size
    };
  }

  // Generate meeting summary using Gemini
  async generateMeetingSummary(meetingId, transcriptContext = null) {
    try {
      console.log(`📝 Generating meeting summary for meeting: ${meetingId}`);
      
      // Get full transcript if not provided
      if (!transcriptContext) {
        transcriptContext = this.getRecentTranscriptContext(meetingId, 999); // Get all transcripts
      }
      
      if (!transcriptContext || transcriptContext.length < 50) {
        console.log('⚠️ Insufficient transcript content for summary generation');
        return {
          summary: 'Insufficient transcript content to generate a meaningful summary.',
          keyPoints: [],
          actionItems: [],
          decisions: [],
          timestamp: Date.now(),
          confidence: 0.3
        };
      }
      
      // Analyze transcript for structured data
      const topics = this.detectTopics(transcriptContext);
      const sentiment = this.analyzeSentiment(transcriptContext);
      const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
      
      let summary;
      let keyPoints;
      let actionItems;
      let decisions;
      
      if (this.llmType === 'gemini' && this.geminiClient && this.geminiApiKey) {
        try {
          // Use Gemini to generate comprehensive summary
          const result = await this.generateSummaryWithGemini(transcriptContext, topics, sentiment, conversationAnalysis);
          summary = result.summary;
          keyPoints = result.keyPoints || [];
          actionItems = result.actionItems || [];
          decisions = result.decisions || [];
        } catch (error) {
          console.log('🤖 Gemini summary generation failed, using rule-based:', error.message);
          const result = this.generateRuleBasedSummary(transcriptContext, topics, sentiment, conversationAnalysis);
          summary = result.summary;
          keyPoints = result.keyPoints;
          actionItems = result.actionItems;
          decisions = result.decisions;
        }
      } else {
        // Use rule-based summary
        const result = this.generateRuleBasedSummary(transcriptContext, topics, sentiment, conversationAnalysis);
        summary = result.summary;
        keyPoints = result.keyPoints;
        actionItems = result.actionItems;
        decisions = result.decisions;
      }
      
      console.log('✅ Meeting summary generated successfully');
      
      return {
        summary,
        keyPoints,
        actionItems,
        decisions,
        topics: topics.map(t => t.topic),
        sentiment,
        timestamp: Date.now(),
        confidence: this.llmType === 'gemini' ? 0.9 : 0.6,
        model: this.llmType === 'gemini' ? this.geminiModel : 'rule-based'
      };
      
    } catch (error) {
      console.error('❌ Meeting summary generation failed:', error);
      throw error;
    }
  }
  
  // Generate summary using Gemini
  async generateSummaryWithGemini(transcriptContext, topics, sentiment, conversationAnalysis) {
    if (!this.geminiClient || !this.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }
    
    const prompt = `You are an intelligent meeting assistant. Analyze this meeting transcript and generate a comprehensive summary.

MEETING TRANSCRIPT:
"${transcriptContext}"

ANALYSIS:
- Main Topics: ${topics.map(t => t.topic).join(', ')}
- Sentiment: ${sentiment}
- Key Points: ${conversationAnalysis.keyPoints.join(', ')}
- Unresolved Issues: ${conversationAnalysis.unresolvedIssues.join(', ')}
- Recent Focus: ${conversationAnalysis.recentFocus}

INSTRUCTIONS:
1. Generate a concise but comprehensive summary of the meeting (2-3 paragraphs)
2. Extract 3-5 key points discussed
3. Identify any action items mentioned
4. Note any decisions made
5. Be specific and reference actual content from the transcript

FORMAT YOUR RESPONSE AS JSON:
{
  "summary": "Brief meeting summary here",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "actionItems": ["Action 1", "Action 2"],
  "decisions": ["Decision 1", "Decision 2"]
}

Return ONLY valid JSON, no additional text.`;
    
    try {
      const model = this.geminiClient.getGenerativeModel({ model: this.geminiModel });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'Summary generated successfully.',
          keyPoints: parsed.keyPoints || [],
          actionItems: parsed.actionItems || [],
          decisions: parsed.decisions || []
        };
      } else {
        // Fallback: treat entire response as summary
        return {
          summary: responseText.trim(),
          keyPoints: conversationAnalysis.keyPoints.slice(0, 5),
          actionItems: [],
          decisions: []
        };
      }
    } catch (error) {
      console.error('🤖 Gemini summary generation failed:', error);
      throw error;
    }
  }
  
  // Generate rule-based summary
  generateRuleBasedSummary(transcriptContext, topics, sentiment, conversationAnalysis) {
    const sentences = transcriptContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const keyPoints = conversationAnalysis.keyPoints.slice(0, 5);
    
    // Extract action items (sentences with action words)
    const actionItems = [];
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (lowerSentence.includes('need to') || lowerSentence.includes('should') || 
          lowerSentence.includes('must') || lowerSentence.includes('will') ||
          lowerSentence.includes('action') || lowerSentence.includes('task')) {
        actionItems.push(sentence.trim());
      }
    });
    
    // Extract decisions
    const decisions = [];
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (lowerSentence.includes('decided') || lowerSentence.includes('agreed') || 
          lowerSentence.includes('concluded') || lowerSentence.includes('chosen')) {
        decisions.push(sentence.trim());
      }
    });
    
    // Generate summary text
    const summary = `This meeting discussed ${topics.map(t => t.topic).join(', ')}. ` +
      `${conversationAnalysis.keyPoints.length > 0 ? 'Key points included: ' + conversationAnalysis.keyPoints.slice(0, 3).join(', ') + '. ' : ''}` +
      `${conversationAnalysis.unresolvedIssues.length > 0 ? 'Unresolved issues: ' + conversationAnalysis.unresolvedIssues.slice(0, 2).join(', ') + '. ' : ''}` +
      `The overall sentiment was ${sentiment}.`;
    
    return {
      summary: summary.trim(),
      keyPoints: keyPoints.slice(0, 5),
      actionItems: actionItems.slice(0, 5),
      decisions: decisions.slice(0, 5)
    };
  }

  // Clean up meeting data
  cleanupMeeting(meetingId) {
    this.transcriptionBuffer.delete(meetingId);
    this.transcriptHistory.delete(meetingId);
    this.lastQuestionTime.delete(meetingId);
    
    if (this.questionGenerationTimer.has(meetingId)) {
      clearInterval(this.questionGenerationTimer.get(meetingId));
      this.questionGenerationTimer.delete(meetingId);
    }
  }
}

// Export singleton instance
const llmService = new LLMService();
export default llmService;
