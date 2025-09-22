/**
 * Free AI-Powered Automatic Highlight Detection
 * Detects important moments in meetings without cloud services
 */

class AIHighlightDetector {
  constructor() {
    this.audioBuffer = [];
    this.speechSegments = [];
    this.volumeHistory = [];
    this.keywordWeights = {
      // Educational keywords
      'important': 3, 'key': 3, 'main': 3, 'primary': 3, 'essential': 4,
      'concept': 4, 'principle': 4, 'theory': 4, 'formula': 4, 'equation': 4,
      'example': 3, 'demonstration': 3, 'practice': 3, 'exercise': 3,
      'homework': 3, 'assignment': 3, 'project': 3, 'exam': 4, 'test': 4,
      'quiz': 3, 'review': 3, 'summary': 3, 'conclusion': 3,
      
      // Action words
      'remember': 3, 'note': 3, 'write': 3, 'study': 3, 'learn': 3,
      'understand': 3, 'comprehend': 3, 'analyze': 3, 'evaluate': 3,
      'apply': 3, 'implement': 3, 'create': 3, 'design': 3,
      
      // Question indicators
      'question': 2, 'ask': 2, 'wonder': 2, 'curious': 2, 'why': 2,
      'how': 2, 'what': 2, 'when': 2, 'where': 2, 'who': 2,
      
      // Emphasis words
      'very': 2, 'extremely': 2, 'highly': 2, 'significantly': 2,
      'crucial': 4, 'critical': 4, 'vital': 4, 'fundamental': 4,
      'must': 3, 'should': 2, 'need': 2, 'require': 2
    };
    
    this.sentimentWords = {
      positive: ['good', 'great', 'excellent', 'amazing', 'wonderful', 'perfect', 'brilliant', 'outstanding'],
      negative: ['bad', 'wrong', 'incorrect', 'mistake', 'error', 'problem', 'issue', 'difficult', 'hard'],
      neutral: ['okay', 'fine', 'normal', 'standard', 'regular', 'typical', 'average']
    };
    
    this.highlightThreshold = 0.5; // Lower threshold for better detection
    this.minHighlightDuration = 5; // seconds
    this.maxHighlightDuration = 30; // seconds
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
      
      // Calculate importance score
      const importanceScore = this.calculateImportanceScore({
        volume,
        speechPattern,
        textAnalysis,
        timestamp
      });
      
      // Check if this moment should be highlighted
      if (importanceScore > this.highlightThreshold) {
        return this.createHighlight(timestamp, importanceScore, {
          volume,
          speechPattern,
          textAnalysis,
          transcript
        });
      }
      
      return null;
    } catch (error) {
      console.error('Error analyzing audio chunk:', error);
      return null;
    }
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
   * Analyze text for keywords and sentiment
   */
  analyzeText(text) {
    if (!text || text.trim().length === 0) {
      return { keywordScore: 0, sentiment: 'neutral', confidence: 0 };
    }

    const words = text.toLowerCase().split(/\s+/);
    let keywordScore = 0;
    let sentimentScore = 0;
    let wordCount = 0;

    words.forEach(word => {
      wordCount++;
      
      // Check for keywords
      if (this.keywordWeights[word]) {
        keywordScore += this.keywordWeights[word];
      }
      
      // Check for sentiment
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
  calculateImportanceScore({ volume, speechPattern, textAnalysis, timestamp }) {
    let score = 0;
    
    // Volume factor (20% weight)
    if (volume > 0.7) score += 0.2;
    else if (volume > 0.5) score += 0.1;
    
    // Speech pattern factor (30% weight)
    if (speechPattern.type === 'emphasis') score += 0.3;
    else if (speechPattern.type === 'pause') score += 0.1;
    else score += 0.15;
    
    // Keyword factor (30% weight)
    score += Math.min(textAnalysis.keywordScore * 0.3, 0.3);
    
    // Sentiment factor (20% weight)
    if (textAnalysis.sentiment === 'positive') score += 0.2;
    else if (textAnalysis.sentiment === 'negative') score += 0.15;
    else score += 0.1;
    
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
    const { textAnalysis, speechPattern } = context;
    
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
    const descriptions = {
      educational: 'Key educational concept discussed',
      important: 'Important point emphasized',
      positive: 'Positive feedback or achievement',
      concern: 'Issue or concern raised',
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
