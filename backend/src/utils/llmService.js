// LLM Service for AI-Driven Smart Follow-up Question Generation
// This service handles audio transcription and question generation

import speech from '@google-cloud/speech';

// Google Gemini removed - using only Ollama + rule-based fallback

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
      
      // Test Ollama if it's being used
      if (this.llmType === 'ollama') {
        console.log('🤖 LLM: Testing Ollama connection...');
        const testResult = await this.testOllamaConnection();
        if (testResult) {
          console.log('✅ Ollama is working correctly');
        } else {
          console.log('⚠️ Ollama test failed, but will continue with fallback');
        }
      }
    } catch (error) {
      console.error('❌ LLM initialization failed:', error);
      this.llmType = 'rule-based';
      console.log('🤖 Falling back to rule-based question generation');
    }
  }

  // Re-initialize LLM when meeting starts (to ensure Ollama is available)
  async reinitializeForMeeting(meetingId) {
    try {
      console.log(`🤖 Re-initializing LLM for meeting ${meetingId}...`);
      
      // Clear cache to force fresh check
      this._ollamaCache = null;
      
      // Re-initialize LLM
      await this.initializeLLM();
      console.log(`🤖 LLM re-initialization completed for meeting ${meetingId}:`, this.llmType);
      
      // Test Ollama if it's being used
      if (this.llmType === 'ollama') {
        console.log(`🤖 Testing Ollama connection for meeting ${meetingId}...`);
        const testResult = await this.testOllamaConnection();
        if (testResult) {
          console.log(`✅ Ollama is working correctly for meeting ${meetingId}`);
          return true;
        } else {
          console.log(`⚠️ Ollama test failed for meeting ${meetingId}, using fallback`);
          this.llmType = 'rule-based';
          return false;
        }
      }
      
      return this.llmType === 'ollama';
    } catch (error) {
      console.error(`❌ LLM re-initialization failed for meeting ${meetingId}:`, error);
      this.llmType = 'rule-based';
      console.log(`🤖 Falling back to rule-based question generation for meeting ${meetingId}`);
      return false;
    }
  }

  // Test Ollama connection and model availability
  async testOllamaConnection() {
    try {
      console.log('🤖 Ollama: Testing connection and model...');
      
      // Test with a simple prompt
      const testPrompt = "Hello, are you working?";
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: testPrompt,
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 10
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('🤖 Ollama: Test successful, model is working:', data.response);
        return true;
      } else {
        console.error('🤖 Ollama: Test failed with status:', response.status);
        return false;
      }
    } catch (error) {
      console.error('🤖 Ollama: Test failed:', error.message);
      return false;
    }
  }

  // Get current LLM status for debugging
  getLLMStatus() {
    return {
      llmType: this.llmType,
      ollamaModel: this.ollamaModel,
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
    // Option 1: Ollama (Local - FREE)
    if (await this.isOllamaAvailable()) {
      this.llmType = 'ollama';
      this.ollamaModel = 'llama3.2:3b'; // Fast, free model
      console.log('🤖 Using Ollama (Local LLM) for question generation');
      return;
    }

    // Option 2: Fallback to rule-based (always available)
    this.llmType = 'rule-based';
    console.log('🤖 Using rule-based question generation (fallback)');
  }

  // Check if Ollama is available (with caching)
  async isOllamaAvailable() {
    // Cache the result for 30 seconds to avoid repeated checks
    if (this._ollamaCache && Date.now() - this._ollamaCache.timestamp < 30000) {
      return this._ollamaCache.available;
    }

    try {
      console.log('🤖 Ollama: Checking if Ollama is available...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const available = response.ok;
      
      if (available) {
        const data = await response.json();
        console.log('🤖 Ollama: Available models:', data.models?.map(m => m.name) || []);
        
        // Check if our preferred model is available
        const hasModel = data.models?.some(m => m.name === this.ollamaModel);
        if (!hasModel) {
          console.log(`🤖 Ollama: Model ${this.ollamaModel} not found, using first available model`);
          if (data.models && data.models.length > 0) {
            this.ollamaModel = data.models[0].name;
            console.log(`🤖 Ollama: Using model: ${this.ollamaModel}`);
          }
        }
      }
      
      // Cache the result
      this._ollamaCache = {
        available,
        timestamp: Date.now()
      };
      
      console.log('🤖 Ollama: Available:', available);
      return available;
    } catch (error) {
      console.log('🤖 Ollama: Not available:', error.message);
      
      // Cache negative result for shorter time
      this._ollamaCache = {
        available: false,
        timestamp: Date.now()
      };
      return false;
    }
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
  async generateFollowUpQuestion(transcriptContext, meetingId) {
    const startTime = Date.now();
    this.performanceStats.totalRequests++;
    this.performanceStats.lastRequestTime = startTime;
    
    try {
      console.log(`🤖 Generating follow-up question with ${this.llmType}...`, { meetingId, contextLength: transcriptContext.length });
      
      // Analyze transcript context for topic detection
      const topics = this.detectTopics(transcriptContext);
      const sentiment = this.analyzeSentiment(transcriptContext);
      
      let generatedQuestion;
      let modelName;
      let confidence;

      // Try different LLM options based on availability
      if (this.llmType === 'ollama') {
        const result = await this.generateWithOllama(transcriptContext, topics, sentiment);
        generatedQuestion = result.question;
        modelName = 'ollama-llama3.2';
        confidence = 0.85;
      } else {
        // Fallback to rule-based
        const result = this.generateWithRuleBased(topics, sentiment, transcriptContext);
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
      const result = this.generateWithRuleBased(topics, sentiment, transcriptContext);
      
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

  // Generate question using Ollama (Local LLM - FREE)
  async generateWithOllama(transcriptContext, topics, sentiment) {
    console.log('🤖 Ollama: Generating question with context:', {
      transcriptLength: transcriptContext?.length || 0,
      topicsCount: topics?.length || 0,
      sentiment: sentiment,
      model: this.ollamaModel
    });

    // Detect language from transcript context
    const detectedLanguage = this.detectLanguageFromContext(transcriptContext);
    
    // Analyze conversation context more deeply
    const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
    
    const prompt = `You are an intelligent meeting facilitator. Analyze this conversation and generate ONE highly relevant follow-up question that will advance the discussion.

CONVERSATION CONTEXT:
"${transcriptContext}"

ANALYSIS:
- Main Topics: ${topics.map(t => t.topic).join(', ')}
- Sentiment: ${sentiment}
- Language: ${detectedLanguage}
- Key Points: ${conversationAnalysis.keyPoints.join(', ')}
- Unresolved Issues: ${conversationAnalysis.unresolvedIssues.join(', ')}
- Recent Focus: ${conversationAnalysis.recentFocus}

INSTRUCTIONS:
1. Generate a question that builds directly on what was just discussed
2. Focus on the most important or unresolved aspects
3. Make it actionable and specific to the conversation
4. Use the same language as the conversation
5. Keep it concise but meaningful
6. Avoid generic questions - be specific to this discussion

Generate only the question, no explanations.`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased to 30 seconds
      
      console.log('🤖 Ollama: Sending request to Ollama API...');
      
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3, // Lower temperature for more focused responses
            num_predict: 30, // Shorter responses for faster generation
            top_p: 0.9,
            repeat_penalty: 1.1
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      console.log('🤖 Ollama: Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('🤖 Ollama: API error response:', errorText);
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('🤖 Ollama: Generated question:', data.response);
      
      return { question: data.response.trim() };
    } catch (error) {
      console.error('🤖 Ollama: Error generating question:', error);
      if (error.name === 'AbortError') {
        throw new Error('Ollama request timeout');
      }
      throw error;
    }
  }

  // Google Gemini method removed - using only Ollama + rule-based fallback

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
    const selectedQuestion = followUpQuestions[Math.floor(Math.random() * followUpQuestions.length)];
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

  // Generate contextual follow-up questions
  generateContextualQuestions(topics, sentiment, transcript, conversationAnalysis = null) {
    const questions = [];

    // If we have conversation analysis, use it for more specific questions
    if (conversationAnalysis && conversationAnalysis.unresolvedIssues.length > 0) {
      // Generate questions based on unresolved issues
      conversationAnalysis.unresolvedIssues.forEach(issue => {
        if (issue.toLowerCase().includes('budget') || issue.toLowerCase().includes('cost')) {
          questions.push("What's the budget impact of this decision?");
          questions.push("How can we optimize costs while maintaining quality?");
        } else if (issue.toLowerCase().includes('timeline') || issue.toLowerCase().includes('schedule')) {
          questions.push("What's a realistic timeline for resolving this?");
          questions.push("Are there any dependencies we need to consider?");
        } else if (issue.toLowerCase().includes('team') || issue.toLowerCase().includes('people')) {
          questions.push("What resources do we need to address this?");
          questions.push("Who should be involved in solving this?");
        } else {
          questions.push("What are the next steps to resolve this?");
          questions.push("How can we move forward with this issue?");
        }
      });
    }

    // Topic-based questions
    topics.forEach(topicData => {
      switch (topicData.topic) {
        case 'budget':
          questions.push(
            "What's the budget allocation for this initiative?",
            "Are there any cost-saving opportunities we should explore?",
            "How does this impact our overall financial planning?"
          );
          break;
        case 'timeline':
          questions.push(
            "What's the realistic timeline for completion?",
            "Are there any dependencies that could affect the schedule?",
            "Should we consider breaking this into smaller milestones?"
          );
          break;
        case 'technical':
          questions.push(
            "What are the main technical challenges we need to address?",
            "Do we have the right technical resources for this project?",
            "What's the implementation approach you'd recommend?"
          );
          break;
        case 'team':
          questions.push(
            "How can we improve team collaboration on this project?",
            "What additional resources or skills do we need?",
            "Who should be the key stakeholders in this initiative?"
          );
          break;
        case 'features':
          questions.push(
            "What are the most critical features to prioritize?",
            "How do these features align with user needs?",
            "Should we consider a phased rollout approach?"
          );
          break;
        case 'user':
          questions.push(
            "How will this impact our user experience?",
            "What feedback have we received from users so far?",
            "How can we better understand user needs?"
          );
          break;
      }
    });

    // Sentiment-based questions
    if (sentiment === 'negative') {
      questions.push(
        "What specific concerns do you have about this approach?",
        "How can we address the challenges you've mentioned?",
        "What would make you feel more confident about this project?"
      );
    } else if (sentiment === 'positive') {
      questions.push(
        "What aspects of this are you most excited about?",
        "How can we build on this positive momentum?",
        "What would success look like for this initiative?"
      );
    }

    // General follow-up questions
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
    // First check basic time interval
    if (!this.shouldGenerateQuestion(meetingId, 1)) { // Reduced to 1 minute minimum
      return false;
    }

    // Analyze conversation for question-worthy moments
    const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
    
    // Generate questions if there are unresolved issues
    if (conversationAnalysis.unresolvedIssues.length > 0) {
      console.log('🤖 Question trigger: Unresolved issues detected');
      return true;
    }

    // Generate questions if there are key points that need follow-up
    if (conversationAnalysis.keyPoints.length > 0) {
      console.log('🤖 Question trigger: Key points need follow-up');
      return true;
    }

    // Generate questions if conversation seems to be stalling
    const sentences = transcriptContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const recentSentences = sentences.slice(-3);
    
    // Check if recent conversation has question patterns
    const hasQuestions = recentSentences.some(sentence => 
      sentence.toLowerCase().includes('?') || 
      sentence.toLowerCase().includes('what') || 
      sentence.toLowerCase().includes('how') || 
      sentence.toLowerCase().includes('why')
    );

    if (hasQuestions) {
      console.log('🤖 Question trigger: Recent questions detected, good time for follow-up');
      return true;
    }

    // Check if conversation has been going for a while without questions
    const lastQuestionTime = this.lastQuestionTime.get(meetingId) || 0;
    const timeSinceLastQuestion = Date.now() - lastQuestionTime;
    const fiveMinutes = 5 * 60 * 1000;

    if (timeSinceLastQuestion > fiveMinutes && transcriptContext.length > 200) {
      console.log('🤖 Question trigger: Long conversation without questions');
      return true;
    }

    return false;
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
