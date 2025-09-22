// LLM Service for AI-Driven Smart Follow-up Question Generation
// This service handles audio transcription and question generation

import speech from '@google-cloud/speech';

import { GoogleGenerativeAI } from '@google/generative-ai';

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
    this.initializeLLM();
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
  initializeLLM() {
    // Option 1: Ollama (Local - FREE)
    if (this.isOllamaAvailable()) {
      this.llmType = 'ollama';
      this.ollamaModel = 'llama3.2:3b'; // Fast, free model
      console.log('🤖 Using Ollama (Local LLM) for question generation');
      return;
    }

    // Option 2: Google Gemini (if API key available)
    if (process.env.GOOGLE_GEMINI_API_KEY && process.env.GOOGLE_GEMINI_API_KEY !== 'demo-key') {
      this.llmType = 'gemini';
      this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
      this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      console.log('🤖 Using Google Gemini for question generation');
      return;
    }

    // Option 3: Fallback to rule-based (always available)
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const available = response.ok;
      
      // Cache the result
      this._ollamaCache = {
        available,
        timestamp: Date.now()
      };
      
      return available;
    } catch (error) {
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
      } else if (this.llmType === 'gemini') {
        const result = await this.generateWithGemini(transcriptContext, topics, sentiment);
        generatedQuestion = result.question;
        modelName = 'gemini-1.5-flash';
        confidence = 0.9;
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
    const prompt = `You are an intelligent meeting assistant. Generate ONE professional follow-up question for this business meeting.

CONVERSATION: "${transcriptContext}"
TOPICS: ${topics.map(t => t.topic).join(', ')}
SENTIMENT: ${sentiment}

Generate a concise, actionable question that builds on the discussion. Return only the question.`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            max_tokens: 100,
            num_predict: 50 // Limit response length for faster generation
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }
      
      const data = await response.json();
      return { question: data.response.trim() };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Ollama request timeout');
      }
      throw error;
    }
  }

  // Generate question using Google Gemini
  async generateWithGemini(transcriptContext, topics, sentiment) {
    const prompt = `You are an intelligent meeting assistant. Analyze this meeting conversation and generate a relevant, professional follow-up question.

CONVERSATION CONTEXT: "${transcriptContext}"
DETECTED TOPICS: ${topics.map(t => `${t.topic} (${Math.round(t.confidence * 100)}%)`).join(', ')}
SENTIMENT: ${sentiment}

Generate ONE professional follow-up question that builds on the current discussion. Return only the question.`;

    try {
      const result = await this.model.generateContent({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 100,
          temperature: 0.7,
          topP: 0.8,
          topK: 40
        }
      });
      
      const response = await result.response;
      return { question: response.text().trim() };
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error('Failed to generate question with Gemini');
    }
  }

  // Generate question using rule-based system
  generateWithRuleBased(topics, sentiment, transcriptContext) {
    const followUpQuestions = this.generateContextualQuestions(topics, sentiment, transcriptContext);
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
  generateContextualQuestions(topics, sentiment, transcript) {
    const questions = [];

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

  // Check if enough time has passed since last question
  shouldGenerateQuestion(meetingId, intervalMinutes = 2) {
    const lastTime = this.lastQuestionTime.get(meetingId) || 0;
    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;
    
    return (now - lastTime) > intervalMs;
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
