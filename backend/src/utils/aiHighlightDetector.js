/**
 * Free AI-Powered Automatic Highlight Detection
 * Detects important moments in meetings without cloud services
 */

class AIHighlightDetector {
  constructor() {
    this.audioBuffer = [];
    this.speechSegments = [];
    this.volumeHistory = [];
    // Multilingual keyword detection
    this.keywordWeights = {
      // English keywords
      'important': 3, 'key': 3, 'main': 3, 'primary': 3, 'essential': 4,
      'concept': 4, 'principle': 4, 'theory': 4, 'formula': 4, 'equation': 4,
      'example': 3, 'demonstration': 3, 'practice': 3, 'exercise': 3,
      'homework': 3, 'assignment': 3, 'project': 3, 'exam': 4, 'test': 4,
      'quiz': 3, 'review': 3, 'summary': 3, 'conclusion': 3,
      'remember': 3, 'note': 3, 'write': 3, 'study': 3, 'learn': 3,
      'understand': 3, 'comprehend': 3, 'analyze': 3, 'evaluate': 3,
      'apply': 3, 'implement': 3, 'create': 3, 'design': 3,
      'question': 2, 'ask': 2, 'wonder': 2, 'curious': 2, 'why': 2,
      'how': 2, 'what': 2, 'when': 2, 'where': 2, 'who': 2,
      'very': 2, 'extremely': 2, 'highly': 2, 'significantly': 2,
      'crucial': 4, 'critical': 4, 'vital': 4, 'fundamental': 4,
      'must': 3, 'should': 2, 'need': 2, 'require': 2,
      
      // Spanish keywords
      'importante': 3, 'clave': 3, 'principal': 3, 'esencial': 4,
      'concepto': 4, 'principio': 4, 'teoría': 4, 'fórmula': 4, 'ecuación': 4,
      'ejemplo': 3, 'demostración': 3, 'práctica': 3, 'ejercicio': 3,
      'tarea': 3, 'proyecto': 3, 'examen': 4, 'prueba': 4,
      'pregunta': 2, 'preguntar': 2, 'por qué': 2, 'cómo': 2,
      'qué': 2, 'cuándo': 2, 'dónde': 2, 'quién': 2,
      'muy': 2, 'extremadamente': 2, 'altamente': 2, 'significativamente': 2,
      'crucial': 4, 'crítico': 4, 'vital': 4, 'fundamental': 4,
      'debe': 3, 'debería': 2, 'necesita': 2, 'requiere': 2,
      
      // French keywords
      'important': 3, 'clé': 3, 'principal': 3, 'essentiel': 4,
      'concept': 4, 'principe': 4, 'théorie': 4, 'formule': 4, 'équation': 4,
      'exemple': 3, 'démonstration': 3, 'pratique': 3, 'exercice': 3,
      'devoir': 3, 'projet': 3, 'examen': 4, 'test': 4,
      'question': 2, 'demander': 2, 'pourquoi': 2, 'comment': 2,
      'quoi': 2, 'quand': 2, 'où': 2, 'qui': 2,
      'très': 2, 'extrêmement': 2, 'hautement': 2, 'significativement': 2,
      'crucial': 4, 'critique': 4, 'vital': 4, 'fondamental': 4,
      'doit': 3, 'devrait': 2, 'besoin': 2, 'exige': 2,
      
      // German keywords
      'wichtig': 3, 'schlüssel': 3, 'haupt': 3, 'wesentlich': 4,
      'konzept': 4, 'prinzip': 4, 'theorie': 4, 'formel': 4, 'gleichung': 4,
      'beispiel': 3, 'demonstration': 3, 'praxis': 3, 'übung': 3,
      'hausaufgabe': 3, 'projekt': 3, 'prüfung': 4, 'test': 4,
      'frage': 2, 'fragen': 2, 'warum': 2, 'wie': 2,
      'was': 2, 'wann': 2, 'wo': 2, 'wer': 2,
      'sehr': 2, 'extrem': 2, 'hoch': 2, 'signifikant': 2,
      'kritisch': 4, 'wichtig': 4, 'grundlegend': 4,
      'muss': 3, 'sollte': 2, 'braucht': 2, 'erfordert': 2,
      
      // Hindi keywords (transliterated)
      'mahavashyak': 3, 'mukhya': 3, 'prashikshak': 3, 'avashyak': 4,
      'siddhant': 4, 'pranali': 4, 'sutra': 4, 'samikaran': 4,
      'udaharan': 3, 'pradarshan': 3, 'abhyas': 3, 'karyakram': 3,
      'grih karya': 3, 'pariyojana': 3, 'pariksha': 4, 'test': 4,
      'prashn': 2, 'puchna': 2, 'kyun': 2, 'kaise': 2,
      'kya': 2, 'kab': 2, 'kahan': 2, 'kaun': 2,
      'bahut': 2, 'atyant': 2, 'adhik': 2, 'mahattvapurn': 2,
      'mahakritik': 4, 'mahavashyak': 4, 'moolbhut': 4,
      'chahiye': 3, 'karna chahiye': 2, 'jarurat': 2, 'mangta': 2,
      
      // CUSTOM DOMAIN KEYWORDS - Add your own here!
      // Example: Medical terms
      'diagnosis': 4, 'treatment': 4, 'symptoms': 3, 'patient': 3,
      'therapy': 4, 'medication': 3, 'procedure': 4, 'clinical': 3,
      
      // Example: Business terms  
      'revenue': 4, 'profit': 4, 'strategy': 4, 'market': 3,
      'customer': 3, 'sales': 3, 'growth': 3, 'investment': 4,
      
      // Example: Technical terms
      'algorithm': 4, 'database': 3, 'security': 4, 'performance': 3,
      'optimization': 4, 'architecture': 4, 'framework': 3, 'integration': 3,
      
      // Example: Educational terms
      'curriculum': 4, 'assessment': 4, 'learning': 3, 'student': 3,
      'knowledge': 3, 'skill': 3, 'competency': 4, 'outcome': 3
    };
    
    // Multilingual sentiment detection
    this.sentimentWords = {
      positive: [
        // English
        'good', 'great', 'excellent', 'amazing', 'wonderful', 'perfect', 'brilliant', 'outstanding',
        // Spanish
        'bueno', 'excelente', 'maravilloso', 'perfecto', 'brillante', 'sobresaliente',
        // French
        'bon', 'excellent', 'merveilleux', 'parfait', 'brillant', 'exceptionnel',
        // German
        'gut', 'ausgezeichnet', 'wunderbar', 'perfekt', 'brillant', 'hervorragend',
        // Hindi (transliterated)
        'achha', 'uttam', 'shandar', 'perfect', 'brilliant', 'uttam'
      ],
      negative: [
        // English
        'bad', 'wrong', 'incorrect', 'mistake', 'error', 'problem', 'issue', 'difficult', 'hard',
        // Spanish
        'malo', 'incorrecto', 'error', 'problema', 'difícil', 'duro',
        // French
        'mauvais', 'incorrect', 'erreur', 'problème', 'difficile', 'dur',
        // German
        'schlecht', 'falsch', 'fehler', 'problem', 'schwierig', 'hart',
        // Hindi (transliterated)
        'bura', 'galat', 'galti', 'samasya', 'kathin', 'mushkil'
      ],
      neutral: [
        // English
        'okay', 'fine', 'normal', 'standard', 'regular', 'typical', 'average',
        // Spanish
        'bien', 'normal', 'estándar', 'regular', 'típico', 'promedio',
        // French
        'bien', 'normal', 'standard', 'régulier', 'typique', 'moyen',
        // German
        'okay', 'normal', 'standard', 'regelmäßig', 'typisch', 'durchschnittlich',
        // Hindi (transliterated)
        'thik', 'normal', 'standard', 'niyamit', 'aam', 'madhyam'
      ]
    };
    
    this.highlightThreshold = 0.5; // Lower threshold for better detection
    this.minHighlightDuration = 5; // seconds
    this.maxHighlightDuration = 30; // seconds
    
    // Language detection
    this.detectedLanguage = 'auto'; // Will be auto-detected
    this.languagePatterns = {
      'spanish': /[ñáéíóúü]/i,
      'french': /[àâäéèêëïîôöùûüÿç]/i,
      'german': /[äöüß]/i,
      'hindi': /[अ-ह]/,
      'english': /[a-z]/i
    };
  }

  /**
   * Add custom domain-specific keywords
   * @param {Object} customKeywords - Object with keyword: weight pairs
   * @param {string} domain - Domain name (e.g., 'medical', 'business', 'technical')
   */
  addCustomKeywords(customKeywords, domain = 'custom') {
    console.log(`🔧 Adding custom keywords for domain: ${domain}`);
    
    // Add custom keywords to the main keyword weights
    Object.entries(customKeywords).forEach(([keyword, weight]) => {
      this.keywordWeights[keyword.toLowerCase()] = weight;
    });
    
    console.log(`✅ Added ${Object.keys(customKeywords).length} custom keywords`);
  }

  /**
   * Detect language from transcript text
   * @param {string} text - Text to analyze
   * @returns {string} Detected language
   */
  detectLanguage(text) {
    if (!text || text.length < 10) return 'english'; // Default fallback
    
    const lowerText = text.toLowerCase();
    let maxMatches = 0;
    let detectedLang = 'english';
    
    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      const matches = (lowerText.match(pattern) || []).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedLang = lang;
      }
    }
    
    console.log(`🌍 Language detected: ${detectedLang} (${maxMatches} matches)`);
    return detectedLang;
  }

  /**
   * Analyze audio chunk for important moments
   * @param {ArrayBuffer} audioData - Raw audio data
   * @param {number} timestamp - Current timestamp
   * @param {string} transcript - Speech transcript (if available)
   */
  analyzeAudioChunk(audioData, timestamp, transcript = '') {
    try {
      // Calculate volume level
      const volume = this.calculateVolume(audioData);
      this.volumeHistory.push({ timestamp, volume });
      
      // Keep only last 30 seconds of volume history
      const thirtySecondsAgo = timestamp - 30000;
      this.volumeHistory = this.volumeHistory.filter(v => v.timestamp > thirtySecondsAgo);
      
      // Detect speech patterns
      const speechPattern = this.detectSpeechPattern(volume);
      
      // Analyze transcript for keywords and sentiment
      const textAnalysis = this.analyzeText(transcript);
      
      // Enhanced conversation analysis for better highlight detection
      const conversationAnalysis = this.analyzeConversationForHighlights(transcript);
      
      // Calculate importance score with conversation context
      const importanceScore = this.calculateImportanceScore({
        volume,
        speechPattern,
        textAnalysis,
        timestamp,
        conversationAnalysis
      });
      
      // Check if this moment should be highlighted
      if (importanceScore > this.highlightThreshold) {
        return this.createHighlight(timestamp, importanceScore, {
          volume,
          speechPattern,
          textAnalysis,
          transcript,
          conversationAnalysis
        });
      }
      
      return null;
    } catch (error) {
      console.error('Error analyzing audio chunk:', error);
      return null;
    }
  }

  /**
   * Analyze conversation content for important moments
   * @param {string} transcript - The conversation transcript
   * @returns {Object} Conversation analysis results
   */
  analyzeConversationForHighlights(transcript) {
    if (!transcript || transcript.length < 10) {
      return {
        importanceLevel: 'low',
        highlightType: 'general',
        keyTopics: [],
        emotionalIntensity: 'neutral',
        decisionMoment: false,
        problemMentioned: false,
        solutionProposed: false,
        actionItem: false
      };
    }

    const text = transcript.toLowerCase();
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 5);
    
    // Analyze for different types of important moments
    const analysis = {
      importanceLevel: 'low',
      highlightType: 'general',
      keyTopics: [],
      emotionalIntensity: 'neutral',
      decisionMoment: false,
      problemMentioned: false,
      solutionProposed: false,
      actionItem: false,
      urgencyLevel: 'normal'
    };

    // 1. Detect decision moments
    const decisionKeywords = ['decided', 'agreed', 'concluded', 'final', 'approved', 'rejected', 'chosen', 'selected'];
    if (decisionKeywords.some(keyword => text.includes(keyword))) {
      analysis.decisionMoment = true;
      analysis.importanceLevel = 'high';
      analysis.highlightType = 'decision';
    }

    // 2. Detect problem mentions
    const problemKeywords = ['problem', 'issue', 'challenge', 'concern', 'difficult', 'trouble', 'error', 'bug', 'broken'];
    if (problemKeywords.some(keyword => text.includes(keyword))) {
      analysis.problemMentioned = true;
      analysis.importanceLevel = 'high';
      analysis.highlightType = 'problem';
    }

    // 3. Detect solution proposals
    const solutionKeywords = ['solution', 'fix', 'resolve', 'solve', 'propose', 'suggest', 'recommend', 'idea', 'approach'];
    if (solutionKeywords.some(keyword => text.includes(keyword))) {
      analysis.solutionProposed = true;
      analysis.importanceLevel = 'high';
      analysis.highlightType = 'solution';
    }

    // 4. Detect action items
    const actionKeywords = ['action', 'task', 'todo', 'assign', 'responsible', 'deadline', 'due', 'next step', 'follow up'];
    if (actionKeywords.some(keyword => text.includes(keyword))) {
      analysis.actionItem = true;
      analysis.importanceLevel = 'medium';
      analysis.highlightType = 'action';
    }

    // 5. Detect emotional intensity
    const emotionalKeywords = ['excited', 'frustrated', 'concerned', 'worried', 'happy', 'disappointed', 'surprised', 'angry'];
    if (emotionalKeywords.some(keyword => text.includes(keyword))) {
      analysis.emotionalIntensity = 'high';
      analysis.importanceLevel = 'medium';
    }

    // 6. Detect urgency
    const urgencyKeywords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'priority', 'deadline', 'time sensitive'];
    if (urgencyKeywords.some(keyword => text.includes(keyword))) {
      analysis.urgencyLevel = 'high';
      analysis.importanceLevel = 'high';
    }

    // 7. Detect key topics
    const topicKeywords = {
      'budget': ['budget', 'cost', 'money', 'financial', 'expense', 'revenue', 'funding'],
      'timeline': ['timeline', 'schedule', 'deadline', 'time', 'when', 'due', 'milestone'],
      'technical': ['technical', 'implementation', 'code', 'development', 'technology', 'system'],
      'team': ['team', 'collaboration', 'work', 'people', 'staff', 'members', 'resources'],
      'customer': ['customer', 'user', 'client', 'audience', 'experience', 'feedback']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        analysis.keyTopics.push(topic);
      }
    }

    // 8. Detect questions and discussions
    if (text.includes('?') || text.includes('what') || text.includes('how') || text.includes('why')) {
      analysis.highlightType = 'discussion';
      analysis.importanceLevel = 'medium';
    }

    return analysis;
  }

  /**
   * Calculate volume level from audio data
   */
  calculateVolume(audioData) {
    try {
      if (!audioData) return 0.5; // Default volume for text-only analysis
      
      const samples = new Int16Array(audioData);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        sum += Math.abs(samples[i]);
      }
      return sum / samples.length / 32768; // Normalize to 0-1
    } catch (error) {
      return 0.5; // Default volume
    }
  }

  /**
   * Detect speech patterns (pauses, emphasis, etc.)
   */
  detectSpeechPattern(currentVolume) {
    if (this.volumeHistory.length < 10) {
      return { type: 'normal', confidence: 0.5 };
    }

    const recentVolumes = this.volumeHistory.slice(-10).map(v => v.volume);
    const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const maxVolume = Math.max(...recentVolumes);
    const minVolume = Math.min(...recentVolumes);
    
    // Detect emphasis (sudden volume increase)
    if (currentVolume > avgVolume * 1.5) {
      return { type: 'emphasis', confidence: 0.8 };
    }
    
    // Detect pause (low volume)
    if (currentVolume < avgVolume * 0.3) {
      return { type: 'pause', confidence: 0.7 };
    }
    
    // Detect normal speech
    return { type: 'normal', confidence: 0.6 };
  }

  /**
   * Analyze text for keywords and sentiment (multilingual)
   */
  analyzeText(text) {
    if (!text || text.trim().length === 0) {
      return { keywordScore: 0, sentiment: 'neutral', confidence: 0 };
    }

    // Detect language first
    const detectedLang = this.detectLanguage(text);
    this.detectedLanguage = detectedLang;
    
    const words = text.toLowerCase().split(/\s+/);
    let keywordScore = 0;
    let sentimentScore = 0;
    let wordCount = 0;

    words.forEach(word => {
      wordCount++;
      
      // Check for keywords (works across all languages)
      if (this.keywordWeights[word]) {
        keywordScore += this.keywordWeights[word];
      }
      
      // Check for sentiment (works across all languages)
      if (this.sentimentWords.positive.includes(word)) {
        sentimentScore += 1;
      } else if (this.sentimentWords.negative.includes(word)) {
        sentimentScore -= 1;
      }
    });

    // Normalize scores
    const normalizedKeywordScore = keywordScore / Math.max(wordCount, 1);
    const normalizedSentimentScore = sentimentScore / Math.max(wordCount, 1);
    
    let sentiment = 'neutral';
    if (normalizedSentimentScore > 0.1) sentiment = 'positive';
    else if (normalizedSentimentScore < -0.1) sentiment = 'negative';

    return {
      keywordScore: normalizedKeywordScore,
      sentiment,
      confidence: Math.min(wordCount / 10, 1) // More words = higher confidence
    };
  }

  /**
   * Calculate overall importance score
   */
  calculateImportanceScore({ volume, speechPattern, textAnalysis, timestamp, conversationAnalysis }) {
    let score = 0;
    
    // Volume factor (15% weight)
    if (volume > 0.7) score += 0.15;
    else if (volume > 0.5) score += 0.08;
    
    // Speech pattern factor (20% weight)
    if (speechPattern.type === 'emphasis') score += 0.2;
    else if (speechPattern.type === 'pause') score += 0.1;
    else score += 0.1;
    
    // Text analysis factor (25% weight)
    score += Math.min(textAnalysis.keywordScore * 0.15, 0.15);
    
    if (textAnalysis.sentiment === 'positive') score += 0.05;
    else if (textAnalysis.sentiment === 'negative') score += 0.05;
    else score += 0.05;
    
    // Conversation analysis factor (40% weight) - Most important
    if (conversationAnalysis) {
      // Decision moments are very important
      if (conversationAnalysis.decisionMoment) {
        score += 0.25;
        console.log('🎯 Decision moment detected - high importance');
      }
      
      // Problem mentions are important
      if (conversationAnalysis.problemMentioned) {
        score += 0.2;
        console.log('🎯 Problem mentioned - high importance');
      }
      
      // Solution proposals are important
      if (conversationAnalysis.solutionProposed) {
        score += 0.2;
        console.log('🎯 Solution proposed - high importance');
      }
      
      // Action items are important
      if (conversationAnalysis.actionItem) {
        score += 0.15;
        console.log('🎯 Action item mentioned - medium importance');
      }
      
      // Emotional intensity adds importance
      if (conversationAnalysis.emotionalIntensity === 'high') {
        score += 0.1;
        console.log('🎯 High emotional intensity - medium importance');
      }
      
      // Urgency adds importance
      if (conversationAnalysis.urgencyLevel === 'high') {
        score += 0.15;
        console.log('🎯 High urgency detected - high importance');
      }
      
      // Key topics add importance
      if (conversationAnalysis.keyTopics.length > 0) {
        score += 0.05 * conversationAnalysis.keyTopics.length;
        console.log('🎯 Key topics detected:', conversationAnalysis.keyTopics);
      }
      
      // Importance level from conversation analysis
      if (conversationAnalysis.importanceLevel === 'high') {
        score += 0.1;
      } else if (conversationAnalysis.importanceLevel === 'medium') {
        score += 0.05;
      }
    }
    
    return Math.min(score, 1);
  }

  /**
   * Create a highlight object
   */
  createHighlight(timestamp, importanceScore, context) {
    const highlightType = this.determineHighlightType(context);
    const duration = this.calculateHighlightDuration(importanceScore);
    
    return {
      timestamp,
      duration,
      importanceScore,
      type: highlightType,
      description: this.generateDescription(highlightType, context),
      context: {
        volume: context.volume,
        speechPattern: context.speechPattern.type,
        sentiment: context.textAnalysis.sentiment,
        keywords: this.extractKeywords(context.transcript)
      }
    };
  }

  /**
   * Determine highlight type based on context
   */
  determineHighlightType(context) {
    const { textAnalysis, speechPattern, conversationAnalysis } = context;
    
    // Use conversation analysis for more accurate type determination
    if (conversationAnalysis) {
      if (conversationAnalysis.decisionMoment) {
        return 'decision';
      } else if (conversationAnalysis.problemMentioned) {
        return 'problem';
      } else if (conversationAnalysis.solutionProposed) {
        return 'solution';
      } else if (conversationAnalysis.actionItem) {
        return 'action';
      } else if (conversationAnalysis.urgencyLevel === 'high') {
        return 'urgent';
      } else if (conversationAnalysis.emotionalIntensity === 'high') {
        return 'emotional';
      } else if (conversationAnalysis.highlightType === 'discussion') {
        return 'discussion';
      }
    }
    
    // Fallback to original logic
    if (textAnalysis.keywordScore > 0.3) {
      return 'educational';
    } else if (speechPattern.type === 'emphasis') {
      return 'important';
    } else if (textAnalysis.sentiment === 'positive') {
      return 'positive';
    } else if (textAnalysis.sentiment === 'negative') {
      return 'concern';
    } else {
      return 'general';
    }
  }

  /**
   * Calculate highlight duration based on importance
   */
  calculateHighlightDuration(importanceScore) {
    const baseDuration = this.minHighlightDuration;
    const maxDuration = this.maxHighlightDuration;
    const duration = baseDuration + (importanceScore * (maxDuration - baseDuration));
    return Math.round(duration);
  }

  /**
   * Generate description for highlight
   */
  generateDescription(type, context) {
    const { conversationAnalysis, transcript } = context;
    
    // Generate specific descriptions based on conversation analysis
    if (conversationAnalysis) {
      if (conversationAnalysis.decisionMoment) {
        return 'Important decision made';
      } else if (conversationAnalysis.problemMentioned) {
        return 'Problem or issue identified';
      } else if (conversationAnalysis.solutionProposed) {
        return 'Solution or approach proposed';
      } else if (conversationAnalysis.actionItem) {
        return 'Action item or task assigned';
      } else if (conversationAnalysis.urgencyLevel === 'high') {
        return 'Urgent matter discussed';
      } else if (conversationAnalysis.emotionalIntensity === 'high') {
        return 'High emotional moment';
      } else if (conversationAnalysis.keyTopics.length > 0) {
        return `Discussion about ${conversationAnalysis.keyTopics.join(', ')}`;
      }
    }
    
    // Fallback descriptions
    const descriptions = {
      educational: 'Key educational concept discussed',
      important: 'Important point emphasized',
      positive: 'Positive feedback or achievement',
      concern: 'Issue or concern raised',
      decision: 'Important decision made',
      problem: 'Problem or issue identified',
      solution: 'Solution or approach proposed',
      action: 'Action item or task assigned',
      urgent: 'Urgent matter discussed',
      emotional: 'High emotional moment',
      discussion: 'Important discussion',
      general: 'Notable moment in discussion'
    };
    
    return descriptions[type] || 'Important moment detected';
  }

  /**
   * Extract keywords from transcript
   */
  extractKeywords(transcript) {
    if (!transcript) return [];
    
    const words = transcript.toLowerCase().split(/\s+/);
    return words.filter(word => this.keywordWeights[word]).slice(0, 5);
  }

  /**
   * Process full meeting to find all highlights
   */
  processMeeting(meetingData) {
    const highlights = [];
    const { audioChunks, transcripts, duration } = meetingData;
    
    // Process each audio chunk
    audioChunks.forEach((chunk, index) => {
      const transcript = transcripts[index] || '';
      const highlight = this.analyzeAudioChunk(chunk.data, chunk.timestamp, transcript);
      
      if (highlight) {
        highlights.push(highlight);
      }
    });
    
    // Remove overlapping highlights
    return this.removeOverlappingHighlights(highlights);
  }

  /**
   * Remove overlapping highlights, keeping the most important ones
   */
  removeOverlappingHighlights(highlights) {
    if (highlights.length === 0) return [];
    
    // Sort by importance score (descending)
    highlights.sort((a, b) => b.importanceScore - a.importanceScore);
    
    const filtered = [];
    const used = new Set();
    
    highlights.forEach(highlight => {
      const start = highlight.timestamp;
      const end = start + (highlight.duration * 1000);
      
      // Check for overlaps
      let hasOverlap = false;
      for (let i = 0; i < filtered.length; i++) {
        const existing = filtered[i];
        const existingStart = existing.timestamp;
        const existingEnd = existingStart + (existing.duration * 1000);
        
        if ((start < existingEnd && end > existingStart)) {
          hasOverlap = true;
          break;
        }
      }
      
      if (!hasOverlap) {
        filtered.push(highlight);
      }
    });
    
    // Sort by timestamp
    return filtered.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Generate summary of highlights
   */
  generateHighlightSummary(highlights) {
    if (highlights.length === 0) {
      return 'No significant highlights detected in this meeting.';
    }
    
    const summary = {
      totalHighlights: highlights.length,
      totalDuration: highlights.reduce((sum, h) => sum + h.duration, 0),
      types: {},
      topKeywords: []
    };
    
    // Count highlight types
    highlights.forEach(highlight => {
      summary.types[highlight.type] = (summary.types[highlight.type] || 0) + 1;
    });
    
    // Extract top keywords
    const allKeywords = highlights.flatMap(h => h.context.keywords);
    const keywordCounts = {};
    allKeywords.forEach(keyword => {
      keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
    });
    
    summary.topKeywords = Object.entries(keywordCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([keyword]) => keyword);
    
    return summary;
  }
}

export default AIHighlightDetector;
