// LLM Service for AI-Driven Smart Follow-up Question Generation
// This service handles audio transcription and question generation
// Main orchestration and state management - generation logic is in llmGenerators.js

import speech from '@google-cloud/speech';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { llmGenerators } from './llmGenerators.js';

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
    
    // Ollama configuration
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2'; // Default model
    this.ollamaEnabled = false;
    
    // Debug: Log API key status (without exposing the key)
    if (this.geminiApiKey) {
      console.log('✅ GEMINI_API_KEY loaded:', this.geminiApiKey.substring(0, 10) + '...');
    } else {
      console.log('⚠️ GEMINI_API_KEY not found in environment variables');
      console.log('   Make sure .env file exists in backend folder and contains: GEMINI_API_KEY=your_key');
    }
    
    // Debug: Log Ollama configuration
    console.log(`🔧 Ollama configured: ${this.ollamaUrl} (model: ${this.ollamaModel})`);
    
    // Initialize Speech-to-Text client
    this.initializeSpeechClient();
    
    // Bind generator methods from llmGenerators.js to this instance
    Object.keys(llmGenerators).forEach(methodName => {
      this[methodName] = llmGenerators[methodName].bind(this);
    });
    
    // Initialize LLM - Try multiple options in order of preference
    this.initializeLLMAsync();
  }

  // Async initialization method
  async initializeLLMAsync() {
    try {
      console.log('🤖 LLM: Starting initialization...');
      await this.initializeLLM();
      
      // CRITICAL: Wait a bit for .env to load and recheckApiKey to complete
      // This ensures Gemini is initialized if API key becomes available
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Re-check API key one more time in case .env was loaded after initial check
      // BUT only if Gemini is not already initialized
      if (process.env.GEMINI_API_KEY && this.llmType !== 'gemini') {
        console.log('🔄 Re-checking Gemini API key after .env load...');
        await this.recheckApiKey();
        // Wait a bit more for recheckApiKey to complete
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // CRITICAL: Final check - if Gemini is now initialized, don't proceed with Ollama
      if (this.llmType === 'gemini') {
        console.log('🤖 LLM initialization completed: gemini');
        // REMOVED: Test call - it wastes API quota
        // Gemini will be tested during actual question generation
        console.log('✅ Gemini initialized and ready for question generation');
        return; // Exit early if Gemini is initialized
      }
      
      // Only log completion if not Gemini (Ollama or rule-based)
      // But only if we haven't already logged it
      if (this.llmType !== 'gemini') {
        console.log('🤖 LLM initialization completed:', this.llmType);
      }
    } catch (error) {
      console.error('❌ LLM initialization failed:', error);
      // Only set to rule-based if Gemini is not already initialized
      if (this.llmType !== 'gemini') {
        this.llmType = 'rule-based';
        console.log('🤖 Falling back to rule-based question generation');
      }
    }
  }

  // Re-initialize LLM when meeting starts (to ensure Gemini is available)
  async reinitializeForMeeting(meetingId) {
    try {
      console.log(`🤖 Re-initializing LLM for meeting ${meetingId}...`);
      
      // Re-initialize LLM
      await this.initializeLLM();
      console.log(`🤖 LLM re-initialization completed for meeting ${meetingId}:`, this.llmType);
      
      // REMOVED: Test call - it wastes API quota
      // Gemini will be tested during actual question generation
      if (this.llmType === 'gemini') {
        console.log(`✅ Gemini initialized for meeting ${meetingId} - ready for question generation`);
        return true;
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
      ollamaEnabled: this.ollamaEnabled,
      ollamaUrl: this.ollamaUrl,
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

  // Re-check API key from environment (useful after .env is loaded)
  async recheckApiKey() {
    const newApiKey = process.env.GEMINI_API_KEY || null;
    if (newApiKey && !this.geminiApiKey) {
      console.log('🔄 GEMINI_API_KEY found in environment, reinitializing...');
      this.geminiApiKey = newApiKey;
      // Reinitialize LLM if API key is now available
      await this.initializeLLM();
      // CRITICAL: Log final LLM type after reinitialization
      console.log(`🤖 LLM reinitialization completed: ${this.llmType}`);
    } else if (newApiKey && this.geminiApiKey !== newApiKey) {
      // Also reinitialize if API key changed
      console.log('🔄 GEMINI_API_KEY updated, reinitializing...');
      this.geminiApiKey = newApiKey;
      await this.initializeLLM();
      // CRITICAL: Log final LLM type after reinitialization
      console.log(`🤖 LLM reinitialization completed: ${this.llmType}`);
    }
  }

  // Initialize LLM with fallback options
  async initializeLLM() {
    // CRITICAL: If Gemini is already successfully initialized, don't reinitialize
    if (this.llmType === 'gemini' && this.geminiClient && this.geminiApiKey) {
      console.log('✅ Gemini already initialized, skipping reinitialization');
      return;
    }
    
    // Re-check API key in case .env was loaded after constructor
    if (!this.geminiApiKey) {
      this.geminiApiKey = process.env.GEMINI_API_KEY || null;
      if (this.geminiApiKey) {
        console.log('✅ GEMINI_API_KEY loaded during initialization:', this.geminiApiKey.substring(0, 10) + '...');
      }
    }
    
    // Option 1: Google Gemini 2.5 Flash (PRIORITY - always use if available)
    if (this.geminiApiKey) {
      try {
        // Initialize Gemini client
        if (!this.geminiClient) {
          this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
          console.log('✅ Gemini client initialized');
        }
        
        // Set model - try gemini-2.5-flash first, fallback to gemini-1.5-flash
        try {
          const model = this.geminiClient.getGenerativeModel({ model: 'models/gemini-2.5-flash' });
          this.geminiModel = 'models/gemini-2.5-flash';
          this.llmType = 'gemini';
          console.log('🤖 Using Google Gemini 2.5 Flash for question generation');
          
          // CRITICAL: Return immediately - don't check Ollama if Gemini is available
          return;
        } catch (modelError) {
          console.error('🤖 Gemini 2.5 Flash model initialization failed:', modelError.message);
          // Try fallback model
          try {
            const model = this.geminiClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
            this.geminiModel = 'gemini-1.5-flash';
            this.llmType = 'gemini';
            console.log('🤖 Using Google Gemini 1.5 Flash (fallback) for question generation');
            return;
          } catch (fallbackError) {
            console.error('🤖 Gemini fallback model also failed:', fallbackError.message);
            throw fallbackError;
          }
        }
      } catch (error) {
        console.error('🤖 Gemini initialization failed:', error.message);
        // Don't fall through immediately - if Gemini API key exists, we should prioritize it
        // Only fall to Ollama if Gemini completely fails
        console.log('⚠️ Gemini failed, will try Ollama as fallback');
      }
    }

    // Option 2: Ollama (local LLM) - only if Gemini is not available
    // CRITICAL: Only check Ollama if Gemini is not available or failed
    // Double-check: Make sure Gemini is really not available before checking Ollama
    if (this.llmType !== 'gemini' && (!this.geminiApiKey || !this.geminiClient)) {
      try {
        const ollamaAvailable = await this.checkOllamaAvailability();
        if (ollamaAvailable && this.llmType !== 'gemini') {
          // Final check: Make sure Gemini wasn't initialized while we were checking Ollama
          if (this.llmType === 'gemini') {
            console.log('✅ Gemini was initialized during Ollama check, skipping Ollama');
            return;
          }
          this.ollamaEnabled = true;
          this.llmType = 'ollama';
          console.log(`🤖 Using Ollama (${this.ollamaModel}) for question generation`);
          return;
        }
      } catch (error) {
        console.error('🤖 Ollama initialization failed:', error.message);
        // Fall through to rule-based
      }
    } else if (this.llmType === 'gemini') {
      // Gemini is already initialized, skip Ollama
      console.log('✅ Gemini already initialized, skipping Ollama check');
      return;
    }

    // Option 3: Fallback to rule-based (always available)
    // Only use rule-based if neither Gemini nor Ollama is available
    if (this.llmType !== 'gemini' && this.llmType !== 'ollama') {
      this.llmType = 'rule-based';
      console.log('🤖 Using rule-based question generation (fallback)');
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
  // Generate follow-up question - Priority: 1. Gemini (fastest) -> 2. Ollama (if Gemini quota exhausted) -> 3. Rule-based (always available)
  async generateFollowUpQuestion(transcriptContext, meetingId, allParticipantsWithEmotions = [], participantEmotions = {}, participantNames = {}, emotionCategories = {}) {
    const startTime = Date.now();
    this.performanceStats.totalRequests++;
    this.performanceStats.lastRequestTime = startTime;
    
    try {
      console.log(`🤖 Generating follow-up question...`, { 
        meetingId, 
        contextLength: transcriptContext.length,
        totalParticipants: allParticipantsWithEmotions.length,
        negativeEmotions: emotionCategories.negative?.length || 0,
        positiveEmotions: emotionCategories.positive?.length || 0,
        neutralEmotions: emotionCategories.neutral?.length || 0,
        participantEmotionsCount: Object.keys(participantEmotions).length,
        currentLLMType: this.llmType,
        hasGeminiKey: !!this.geminiApiKey,
        hasGeminiClient: !!this.geminiClient
      });
      
      // Analyze transcript context for topic detection
      const topics = this.detectTopics(transcriptContext);
      const sentiment = this.analyzeSentiment(transcriptContext);
      
      let generatedQuestion;
      let modelName;
      let confidence;

      // CRITICAL FIX: Always try Gemini FIRST if API key exists, regardless of current llmType
      // This ensures Gemini is used whenever available, even if it failed before
      if (this.geminiApiKey && this.geminiClient) {
        try {
          console.log('🤖 Attempting Gemini generation...');
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
          // CRITICAL: Reset llmType to gemini on success
          this.llmType = 'gemini';
          console.log('✅ Gemini generation successful');
        } catch (error) {
          // Check if it's a quota/rate limit error
          const errorMessage = error.message || error.toString() || '';
          const isQuotaError = errorMessage.includes('quota') || 
                              errorMessage.includes('QUOTA') || 
                              errorMessage.includes('429') ||
                              errorMessage.includes('ResourceExhausted') ||
                              errorMessage.includes('rate limit') ||
                              errorMessage.includes('Quota exceeded');
          
          console.log(`⚠️ Gemini failed (${isQuotaError ? 'quota' : 'error'}):`, errorMessage);
          
          // Fall back to Ollama only for this request
          // Don't permanently change llmType - keep it as 'gemini' for next request
          try {
            console.log('🔄 Trying Ollama fallback for this request...');
            const ollamaResult = await this.tryOllamaWithPriority(
              transcriptContext, 
              topics, 
              sentiment,
              allParticipantsWithEmotions,
              participantEmotions,
              participantNames,
              emotionCategories
            );
            
            if (ollamaResult.success) {
              generatedQuestion = ollamaResult.question;
              modelName = ollamaResult.modelName;
              confidence = ollamaResult.confidence;
              // Don't change llmType - keep it as 'gemini' so next request tries Gemini again
              console.log('✅ Used Ollama as temporary fallback (Gemini will be tried again next time)');
            } else {
              throw new Error('All Ollama models failed');
            }
          } catch (ollamaError) {
            console.log('⚠️ Ollama fallback failed, using rule-based:', ollamaError.message);
            const result = this.generateWithRuleBased(topics, sentiment, transcriptContext, allParticipantsWithEmotions, participantNames, emotionCategories);
            generatedQuestion = result.question;
            modelName = 'rule-based-fallback';
            confidence = 0.6;
          }
        }
      } else if (this.llmType === 'ollama') {
        // Only use Ollama if Gemini is not available at all
        try {
          const ollamaResult = await this.tryOllamaWithPriority(
            transcriptContext, 
            topics, 
            sentiment,
            allParticipantsWithEmotions,
            participantEmotions,
            participantNames,
            emotionCategories
          );
          
          if (ollamaResult.success) {
            generatedQuestion = ollamaResult.question;
            modelName = ollamaResult.modelName;
            confidence = ollamaResult.confidence;
          } else {
            throw new Error('All Ollama models failed');
          }
        } catch (error) {
          console.log('🤖 All Ollama models failed, falling back to rule-based:', error.message);
          const result = this.generateWithRuleBased(topics, sentiment, transcriptContext, allParticipantsWithEmotions, participantNames, emotionCategories);
          generatedQuestion = result.question;
          modelName = 'rule-based-fallback';
          confidence = 0.6;
        }
      } else {
        // Rule-based fallback
        const result = this.generateWithRuleBased(topics, sentiment, transcriptContext, allParticipantsWithEmotions, participantNames, emotionCategories);
        generatedQuestion = result.question;
        modelName = 'rule-based-fallback';
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

  // Check if Ollama is available
  async checkOllamaAvailability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const models = data.models || [];
        // Check if model exists (exact match or partial match)
        const modelExists = models.some(m => {
          const modelName = m.name.toLowerCase();
          const searchModel = this.ollamaModel.toLowerCase();
          return modelName === searchModel || modelName.includes(searchModel) || searchModel.includes(modelName.split(':')[0]);
        });
        
        if (modelExists) {
          // Find the actual model name to use
          const foundModel = models.find(m => {
            const modelName = m.name.toLowerCase();
            const searchModel = this.ollamaModel.toLowerCase();
            return modelName === searchModel || modelName.includes(searchModel) || searchModel.includes(modelName.split(':')[0]);
          });
          
          if (foundModel) {
            // Update to use the actual model name
            this.ollamaModel = foundModel.name;
            console.log(`✅ Ollama is available with model: ${this.ollamaModel}`);
            return true;
          }
          console.log(`✅ Ollama is available with model: ${this.ollamaModel}`);
          return true;
        } else {
          console.log(`⚠️ Ollama is available but model ${this.ollamaModel} not found. Available models:`, models.map(m => m.name).join(', '));
          // Try to use the first available model if our default doesn't exist
          if (models.length > 0) {
            this.ollamaModel = models[0].name;
            console.log(`⚠️ Using available model instead: ${this.ollamaModel}`);
            return true;
          }
          return false;
        }
      }
      return false;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`⚠️ Ollama check timeout at ${this.ollamaUrl}`);
      } else {
        console.log(`⚠️ Ollama not available at ${this.ollamaUrl}:`, error.message);
      }
      return false;
    }
  }

  // Get available Ollama models
  async getAvailableOllamaModels() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        return data.models || [];
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  // Try Ollama models in priority order: phi3:mini -> llama3.2:3b
  async tryOllamaWithPriority(transcriptContext, topics, sentiment, allParticipantsWithEmotions, participantEmotions, participantNames, emotionCategories) {
    const priorityModels = ['phi3:mini', 'phi-3:mini', 'llama3.2:3b'];
    
    // Get available models
    const availableModels = await this.getAvailableOllamaModels();
    if (!availableModels || availableModels.length === 0) {
      return { success: false, error: 'No Ollama models available' };
    }
    
    console.log(`🔍 Available Ollama models: ${availableModels.map(m => m.name).join(', ')}`);
    console.log(`🎯 Trying models in priority order: phi3:mini -> llama3.2:3b`);
    
    const triedModels = new Set(); // Track tried models to avoid duplicates
    
    // Try models in priority order
    for (const modelName of priorityModels) {
      const modelExists = availableModels.some(m => {
        const mName = m.name.toLowerCase();
        const searchName = modelName.toLowerCase();
        return mName === searchName || mName.includes(searchName) || searchName.includes(mName.split(':')[0]);
      });
      
      if (modelExists) {
        const foundModel = availableModels.find(m => {
          const mName = m.name.toLowerCase();
          const searchName = modelName.toLowerCase();
          return mName === searchName || mName.includes(searchName) || searchName.includes(mName.split(':')[0]);
        });
        
        if (foundModel && !triedModels.has(foundModel.name)) {
          triedModels.add(foundModel.name); // Mark as tried
          console.log(`🔄 Trying Ollama model: ${foundModel.name}`);
          const originalModel = this.ollamaModel;
          this.ollamaModel = foundModel.name;
          
          try {
            const result = await this.generateWithOllama(
              transcriptContext, 
              topics, 
              sentiment,
              allParticipantsWithEmotions,
              participantEmotions,
              participantNames,
              emotionCategories
            );
            
            console.log(`✅ Successfully used ${foundModel.name}`);
            return {
              success: true,
              question: result.question,
              modelName: `ollama-${foundModel.name}`,
              confidence: 0.8
            };
          } catch (error) {
            console.log(`⚠️ ${foundModel.name} failed:`, error.message);
            this.ollamaModel = originalModel; // Restore original
            continue; // Try next model
          }
        }
      }
    }
    
    return { success: false, error: 'All priority models failed' };
  }

  // All generation methods are now in llmGenerators.js and bound in constructor

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
  shouldGenerateQuestionIntelligently(meetingId, transcriptContext, hasParticipantEmotions = false) {
    // First check basic time interval - 3 minutes minimum for first question
    // This allows questions after some initial conversation time
    const timeInterval = 3; // Changed from 5 to 3 minutes
    if (!this.shouldGenerateQuestion(meetingId, timeInterval)) {
      console.log(`🤖 Question trigger: Time interval not met (need ${timeInterval} minutes)`);
      return false;
    }

    const contextLength = transcriptContext?.length || 0;

    // If conversation is very low BUT we have participant emotions, allow question generation
    // This handles early meeting scenarios where conversation hasn't started but participants show emotions
    if (hasParticipantEmotions && contextLength < 200) {
      console.log('🤖 Question trigger: Low conversation but emotions present - will generate based on emotions');
      return true; // Allow generation based on emotions
    }

    // Progressive requirements based on conversation length
    // Early conversation (200-500 chars): Relaxed requirements
    if (contextLength < 500) {
      const words = transcriptContext.split(/\s+/).filter(word => word.length > 2);
      const uniqueWords = new Set(words.map(word => word.toLowerCase()));
      
      // Relaxed: at least 30 words and 15 unique words
      if (words.length >= 30 && uniqueWords.size >= 15) {
        console.log('🤖 Question trigger: Early conversation detected - generating question');
        return true;
      }
      
      // If emotions present, even more relaxed
      if (hasParticipantEmotions && words.length >= 20 && uniqueWords.size >= 10) {
        console.log('🤖 Question trigger: Early conversation with emotions - generating question');
        return true;
      }
    }
    
    // Medium conversation (500-1000 chars): Moderate requirements
    if (contextLength < 1000) {
      const words = transcriptContext.split(/\s+/).filter(word => word.length > 2);
      const uniqueWords = new Set(words.map(word => word.toLowerCase()));
      const sentences = transcriptContext.split(/[.!?]+/).filter(s => s.trim().length > 15);
      
      // Moderate: at least 50 words, 20 unique words, 3 sentences
      if (words.length >= 50 && uniqueWords.size >= 20 && sentences.length >= 3) {
        console.log('🤖 Question trigger: Medium conversation detected - generating question');
        return true;
      }
    }
    
    // Substantial conversation (1000+ chars): Stricter requirements
    const words = transcriptContext.split(/\s+/).filter(word => word.length > 2);
    const uniqueWords = new Set(words.map(word => word.toLowerCase()));
    const sentences = transcriptContext.split(/[.!?]+/).filter(s => s.trim().length > 15);
    
    // Stricter: at least 60 words, 25 unique words, 5 sentences
    if (words.length >= 60 && uniqueWords.size >= 25 && sentences.length >= 5) {
      console.log('🤖 Question trigger: Substantial conversation detected - generating question');
      return true;
    }

    console.log('🤖 Question trigger: Conversation requirements not met');
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
  
  // All summary generation methods are now in llmGenerators.js and bound in constructor

  // Generate comprehensive meeting notes from transcripts
  async generateMeetingNotes(transcripts, meetingId) {
    try {
      console.log(`📝 Generating meeting notes for meeting ${meetingId}...`, { transcriptCount: transcripts.length });
      
      if (!transcripts || transcripts.length === 0) {
        console.log('⚠️ No transcripts available for meeting notes');
        return this.generateRuleBasedNotes([]);
      }
      
      // Format transcripts with participant names (who said what)
      const conversationTranscript = this.createConversationTranscript(transcripts);
      
      // Combine all transcripts into a single context
      const fullTranscript = transcripts
        .map(t => `${t.participantName || 'Unknown'}: ${t.transcript}`)
        .join('\n');
      
      // Try Gemini first, then Ollama, then rule-based
      if (this.llmType === 'gemini' && this.geminiClient && this.geminiApiKey) {
        try {
          return await this.generateComprehensiveNotesWithGemini(fullTranscript, conversationTranscript, transcripts);
        } catch (error) {
          const errorMessage = error.message || error.toString() || '';
          const isQuotaError = errorMessage.includes('quota') || 
                              errorMessage.includes('QUOTA') || 
                              errorMessage.includes('429') ||
                              errorMessage.includes('ResourceExhausted') ||
                              errorMessage.includes('rate limit') ||
                              errorMessage.includes('Quota exceeded');
          
          if (isQuotaError) {
            console.log('⚠️ Gemini quota exhausted for notes, trying Ollama...');
            try {
              const ollamaAvailable = await this.checkOllamaAvailability();
              if (ollamaAvailable) {
                this.ollamaEnabled = true;
                this.llmType = 'ollama';
                return await this.generateComprehensiveNotesWithOllama(fullTranscript, conversationTranscript, transcripts);
              }
            } catch (ollamaError) {
              console.log('⚠️ Ollama failed for notes, using rule-based fallback');
            }
          } else {
            console.log('⚠️ Gemini notes generation failed, trying Ollama...');
            try {
              const ollamaAvailable = await this.checkOllamaAvailability();
              if (ollamaAvailable) {
                this.ollamaEnabled = true;
                this.llmType = 'ollama';
                return await this.generateComprehensiveNotesWithOllama(fullTranscript, conversationTranscript, transcripts);
              }
            } catch (ollamaError) {
              console.log('⚠️ Ollama failed for notes, using rule-based fallback');
            }
          }
          return this.generateRuleBasedNotes(transcripts);
        }
      } else if (this.llmType === 'ollama') {
        try {
          return await this.generateComprehensiveNotesWithOllama(fullTranscript, conversationTranscript, transcripts);
        } catch (error) {
          console.log('⚠️ Ollama notes generation failed, using rule-based fallback:', error.message);
          return this.generateRuleBasedNotes(transcripts);
        }
      } else {
        return this.generateRuleBasedNotes(transcripts);
      }
    } catch (error) {
      console.error('❌ Error generating meeting notes:', error);
      return this.generateRuleBasedNotes(transcripts || []);
    }
  }

  // All notes generation methods and helpers are now in llmGenerators.js and bound in constructor

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
