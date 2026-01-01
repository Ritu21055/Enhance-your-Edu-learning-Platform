// LLM Generators - All generation methods and helper functions
// This file contains all the actual LLM interaction logic (Gemini, Ollama, rule-based)
// and helper methods for analysis and formatting

/**
 * All generator methods that can be bound to LLMService instance
 * These methods use 'this' to access service properties
 */
export const llmGenerators = {
  // ============================================
  // QUESTION GENERATION METHODS
  // ============================================

  /**
   * Generate question using Google Gemini
   */
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

    const detectedLanguage = this.detectLanguageFromContext(transcriptContext);
    const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
    
    let participantStateContext = '';
    // Separate participants with emotions (video ON) and without emotions (video OFF)
    const participantsWithVideoOn = allParticipantsWithEmotions.filter(p => p.emotion !== 'unknown');
    const participantsWithVideoOff = allParticipantsWithEmotions.filter(p => p.emotion === 'unknown');
    
    if (allParticipantsWithEmotions.length > 0) {
      let emotionSummary = [];
      
      // Participants with video ON (emotions detected)
      if (participantsWithVideoOn.length > 0) {
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
      }
      
      // Participants with video OFF (no emotions detected, but still in meeting)
      if (participantsWithVideoOff.length > 0) {
        const videoOffNames = participantsWithVideoOff.map(p => p.name).join(', ');
        emotionSummary.push(`- Participants with video OFF (no emotion data): ${videoOffNames}`);
      }
      
      const allParticipantNames = allParticipantsWithEmotions.map(p => p.name).join(', ');
      
      participantStateContext = `\n\nPARTICIPANT STATE (IMPORTANT):
${emotionSummary.join('\n')}
- All participants in meeting: ${allParticipantNames}
- Generate questions that:
  * For participants with emotions (video ON): Use their emotion to personalize the question. ALWAYS include participant name. Example: "Rahul, [topic] ke baare mein aapke kya concerns hain?" (if confused) or "Riya, [topic] ke kaunse aspects aapko exciting lagte hain?" (if happy)
  * For participants with video OFF: Generate topic-related questions using their name. Example: "Amit, [topic] ke baare mein aapke kya thoughts hain?" or "Priya, [topic] ko kaise implement karenge?"
  * CRITICAL: When generating questions, ALWAYS start with participant name, followed by a comma, then the topic-related question
  * Mix the conversation topic with participant engagement (emotion if available, or general engagement if video off)
  * Use the actual participant names from the list above`;
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
3. ${allParticipantsWithEmotions.length > 0 ? `MANDATORY: ALWAYS include a participant's actual name at the start of the question, followed by a comma, then the topic-related question.

   Available participants: ${allParticipantsWithEmotions.map(p => `${p.name} (${p.emotion === 'unknown' ? 'video off' : p.emotion})`).join(', ')}
   
   - For participants with emotions (video ON): Use their emotion to personalize. 
     * Confused/sad/fear/angry: "Rahul, [topic] ke baare mein aapke kya concerns hain?" or "Amit, [topic] ko clarify karna chahenge?"
     * Happy/surprised/excited: "Riya, [topic] ke kaunse aspects aapko sabse zyada exciting lagte hain?" or "Priya, [topic] ke baare mein aapka kya experience raha?"
     * Neutral: "Sneha, [topic] ke baare mein aapke kya thoughts hain?" or "Karan, [topic] ko kaise implement karenge?"
   
   - For participants with video OFF: Generate topic-related questions using their name.
     * Example: "Rahul, [topic] ke baare mein aapke kya thoughts hain?" or "Amit, [topic] ko kaise implement karenge?"
     * Always start with participant name, then ask about the conversation topic
   
   CRITICAL: The question MUST combine:
   - Participant's name (from the list above) - ALWAYS at the start
   - The actual topic discussed in the conversation
   - Their emotional state (if video ON) or general engagement (if video OFF)
   
   DO NOT generate questions without participant names when participants exist.` : '4. Generate a general question related to the conversation topic.'}
4. DO NOT generate generic questions that could apply to any meeting
5. DO NOT generate questions about topics NOT mentioned in the conversation
6. The question must reference specific topics, points, or issues from the conversation
7. Use the same language as the conversation (${detectedLanguage}). If the conversation is in Hinglish (mixed Hindi-English), generate questions in Hinglish maintaining the same mix.
8. Keep it concise (one sentence, maximum 20 words)

EXAMPLES OF GOOD QUESTIONS:
${allParticipantsWithEmotions.length > 0 ? `- If conversation mentions "budget" and participant "Rahul" has confused emotion: "Rahul, budget allocation ke baare mein aapko kuch clarify karna hai?"
- If conversation mentions "timeline" and participant "Riya" has happy emotion: "Riya, timeline ke kaunse aspects aapko sabse zyada exciting lagte hain?"
- If conversation mentions "team" and participant "Amit" has video OFF: "Amit, team mein kaun responsible hoga is task ke liye?"
- If conversation mentions "deadline" and participant "Priya" has neutral emotion: "Priya, deadline ke baare mein aapke kya thoughts hain?"
- If conversation mentions "project" and participant "Sneha" has video OFF: "Sneha, project ko kaise implement karenge?"
- If conversation mentions "budget" and participant "Karan" has surprised emotion: "Karan, budget ke baare mein aapko kya surprising laga?"
- If conversation mentions "timeline" and participant "Anjali" has video OFF: "Anjali, timeline ke baare mein aapke kya concerns hain?"` : `- If conversation mentions "budget", ask: "What is the total budget allocated for this project?"
- If conversation mentions "timeline", ask: "When do we need to complete this by?"
- If conversation mentions "team", ask: "Who will be responsible for this task?"`}

EXAMPLES OF BAD QUESTIONS (DO NOT GENERATE THESE):
- "Are there any dependencies we need to consider?" (too generic, not specific to conversation)
- "What are your thoughts on this?" (too vague)
- "Can you elaborate?" (not specific enough)

Generate ONLY the question, no explanations or additional text.`;

    try {
      let model;
      try {
        model = this.geminiClient.getGenerativeModel({ model: this.geminiModel });
      } catch (e) {
        throw e;
      }
      
      console.log('🤖 Gemini: Sending request to Gemini API...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
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
  },

  /**
   * Generate question using Ollama (optimized for speed)
   * Used as fallback when Gemini quota is exhausted
   */
  async generateWithOllama(transcriptContext, topics, sentiment, allParticipantsWithEmotions = [], participantEmotions = {}, participantNames = {}, emotionCategories = {}) {
    console.log('🤖 Ollama: Generating question with context:', {
      transcriptLength: transcriptContext?.length || 0,
      topicsCount: topics?.length || 0,
      sentiment: sentiment,
      model: this.ollamaModel
    });

    if (!this.ollamaEnabled) {
      throw new Error('Ollama not enabled');
    }

    const detectedLanguage = this.detectLanguageFromContext(transcriptContext);
    const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
    
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
  * For negative emotions (confused, sad, fear, angry): Help clarify or address concerns. ALWAYS start with participant name followed by comma. Example: "Rahul, would you like to clarify your question about [topic]?"
  * For positive emotions (happy, surprised, excited): Build on their engagement or excitement. ALWAYS start with participant name followed by comma. Example: "Priya, what aspects of [topic] are you most excited about?"
  * For neutral emotions: Maintain engagement or check understanding. ALWAYS start with participant name followed by comma. Example: "Sneha, how do you feel about this approach?"
- CRITICAL: When generating questions based on participant emotions, ALWAYS start with their name followed by a comma. Mix the conversation topic with their emotional state to create a personalized question.
- Available participant names: ${allParticipantsWithEmotions.map(p => p.name).join(', ')}
- Consider the overall emotional state when generating the question`;
    }
    
    // Improved prompt with better context and instructions
    const contextLimit = 300; // Increased from 150 to 300 for better context
    const shortContext = transcriptContext.length > contextLimit 
      ? transcriptContext.substring(0, contextLimit) + '...' 
      : transcriptContext;
    
    // Build participant names list if available
    const participantNamesList = allParticipantsWithEmotions.length > 0 
      ? `Participants: ${allParticipantsWithEmotions.map(p => p.name).join(', ')}. ` 
      : '';
    
    // IMPROVED prompt with critical instructions to prevent generic questions
    const prompt = `You are an intelligent meeting facilitator. Analyze this conversation and generate ONE highly relevant follow-up question.

CONVERSATION CONTEXT:
"${shortContext}"

CRITICAL REQUIREMENTS:
1. The question MUST be DIRECTLY related to what was discussed in the conversation above
2. The question MUST reference specific topics, points, or issues mentioned in the conversation
3. ${allParticipantsWithEmotions.length > 0 ? `ALWAYS start with participant name followed by comma when addressing them. Available names: "${allParticipantsWithEmotions.map(p => p.name).join('", "')}". Example: "Rahul, [question]" or "Priya, [question]". ` : ''}
4. DO NOT generate generic questions that could apply to any meeting
5. DO NOT generate questions about topics NOT mentioned in the conversation
6. If the conversation is unclear or too short, respond with only "SKIP" (no question)
7. The question should build on the LAST 2-3 sentences or main points discussed
8. Keep it concise (one sentence, maximum 20 words)

EXAMPLES OF BAD QUESTIONS (DO NOT GENERATE THESE):
- "Are there any dependencies we need to consider?" (too generic)
- "What are your thoughts on this?" (too vague)
- "Can you elaborate?" (not specific enough)
- "I understand your concerns about..." (not a question, too generic)

Generate ONLY the question, or "SKIP" if conversation is unclear. No explanations.`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 60000); // 60 seconds - give models enough time to generate
      
      console.log(`🤖 Ollama: Sending request to ${this.ollamaUrl}/api/generate with model ${this.ollamaModel}...`);
      
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1,      // Ultra-low for fastest, most deterministic generation
            top_p: 0.4,            // Ultra-low for fastest sampling
            top_k: 3,              // Ultra-low for fastest sampling
            num_predict: 15,       // Ultra-short responses = fastest
            repeat_penalty: 1.01   // Minimal penalty for maximum speed
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.response) {
        throw new Error('Ollama API returned no response');
      }

      const question = data.response.trim();
      
      // CRITICAL: Filter out generic/invalid questions
      if (!question || 
          question.toLowerCase() === 'skip' || 
          question.length < 10 ||
          question.toLowerCase().startsWith('i understand') ||
          question.toLowerCase().startsWith('i see') ||
          question.toLowerCase().includes('any thoughts') ||
          question.toLowerCase().includes('can you elaborate') ||
          question.toLowerCase().includes('are there any dependencies')) {
        console.log('🤖 Ollama: Skipping generic/invalid question:', question);
        return { question: '' };
      }
      
      console.log('🤖 Ollama: Generated question:', question);
      
      return { question };
    } catch (error) {
      console.error('🤖 Ollama: Error generating question:', error);
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        throw new Error('Ollama request timeout');
      }
      throw error;
    }
  },

  /**
   * Generate question using rule-based system
   */
  generateWithRuleBased(topics, sentiment, transcriptContext, allParticipantsWithEmotions = [], participantNames = {}, emotionCategories = {}) {
    const conversationAnalysis = this.analyzeConversationContext(transcriptContext);
    const followUpQuestions = this.generateContextualQuestions(topics, sentiment, transcriptContext, conversationAnalysis, allParticipantsWithEmotions, participantNames, emotionCategories);
    
    const validQuestions = followUpQuestions.filter(q => q && q.trim().length > 0);
    
    if (validQuestions.length === 0) {
      console.log('📝 No valid context-specific questions - conversation not specific enough');
      return { question: '' };
    }
    
    const selectedQuestion = validQuestions[Math.floor(Math.random() * validQuestions.length)];
    return { question: selectedQuestion };
  },

  // ============================================
  // NOTES GENERATION METHODS
  // ============================================

  /**
   * Generate comprehensive notes using Gemini
   */
  async generateComprehensiveNotesWithGemini(fullTranscript, conversationTranscript, transcripts) {
    // Detect language from transcript
    const detectedLanguage = this.detectLanguageFromContext(fullTranscript);
    
    const prompt = `You are an AI assistant that generates comprehensive meeting notes. Analyze the following meeting transcript and create structured notes.

MEETING TRANSCRIPT:
${fullTranscript}

CONVERSATION TRANSCRIPT (Who Said What):
${conversationTranscript}

IMPORTANT: The transcript is in ${detectedLanguage} language. Generate ALL notes (summary, key points, action items, decisions, study guide, participant contributions, etc.) in the SAME language (${detectedLanguage}). 
- If ${detectedLanguage} is 'hindi', generate everything in Hindi.
- If ${detectedLanguage} is 'english', generate everything in English.
- If ${detectedLanguage} is 'hinglish', generate everything in Hinglish (mixed Hindi-English, maintaining the same style and mix as the transcript).
Do NOT translate to English if the transcript is in Hindi or Hinglish.

Please generate comprehensive meeting notes in the following JSON format:
{
  "summary": "A brief 2-3 sentence summary of the entire meeting",
  "keyPoints": ["Point 1", "Point 2", "Point 3", ...],
  "actionItems": [
    {
      "task": "Task description",
      "assignedTo": "Person name or 'TBD'",
      "deadline": "Deadline if mentioned or 'TBD'"
    }
  ],
  "decisions": ["Decision 1", "Decision 2", ...],
  "studyGuide": {
    "definitions": ["Term: Definition", ...],
    "examples": ["Example 1", "Example 2", ...],
    "formulas": ["Formula 1", ...]
  },
  "participantContributions": {
    "Person Name": ["Contribution 1", "Contribution 2", ...]
  },
  "conversationTranscript": [
    {
      "speaker": "Person Name",
      "timestamp": "HH:MM:SS",
      "text": "What they said"
    }
  ]
}

IMPORTANT REQUIREMENTS:
1. Extract ALL action items with who is responsible (if mentioned) and deadlines (if mentioned)
2. List ALL decisions made during the meeting
3. Identify key definitions, examples, and formulas if this is an educational meeting
4. For participantContributions, group what each person said/contributed (only important contributions)
5. For conversationTranscript, include ONLY important discussions from both host and participants:
   - Include statements that contain: decisions, action items, key points, important questions, definitions, examples, formulas
   - Include statements from host OR participants (even if only one person is speaking)
   - Exclude: casual greetings, filler words, "um", "ah", repetitive statements, off-topic discussions
   - Mix host and participant statements chronologically based on timestamps
   - If only host is speaking, include host's important statements
   - If only participants are speaking, include participants' important statements
   - Format clearly showing who said what with timestamps
6. Be comprehensive - don't miss important details
7. Use the exact participant names from the transcript
8. Format timestamps as HH:MM:SS based on the transcript timestamps
9. CRITICAL: Generate everything in ${detectedLanguage} language - summary, key points, action items, decisions, study guide, all content must be in ${detectedLanguage}
10. DO NOT include full transcript in conversationTranscript - only include important discussions that add value to the meeting notes

Return ONLY valid JSON, no additional text.`;

    try {
      const model = this.geminiClient.getGenerativeModel({ model: this.geminiModel });
      
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 60000))
      ]);
      
      const responseText = result.response.text();
      
      let jsonText = responseText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim();
      }
      
      const notes = JSON.parse(jsonText);
      
      // If LLM didn't provide conversationTranscript, create filtered version with only important discussions
      if (!notes.conversationTranscript && transcripts && transcripts.length > 0) {
        // Filter transcripts to include only important discussions
        const importantTranscripts = this.filterImportantDiscussions(transcripts);
        notes.conversationTranscript = this.formatConversationTranscriptForNotes(importantTranscripts);
      }
      
      return notes;
    } catch (error) {
      console.error('❌ Error in Gemini notes generation:', error);
      throw error;
    }
  },

  /**
   * Generate comprehensive notes using Ollama
   */
  async generateComprehensiveNotesWithOllama(fullTranscript, conversationTranscript, transcripts) {
    // Detect language from transcript
    const detectedLanguage = this.detectLanguageFromContext(fullTranscript);
    
    const prompt = `You are an AI assistant that generates comprehensive meeting notes. Analyze the following meeting transcript and create structured notes.

MEETING TRANSCRIPT:
${fullTranscript}

CONVERSATION TRANSCRIPT (Who Said What):
${conversationTranscript}

IMPORTANT: The transcript is in ${detectedLanguage} language. Generate ALL notes (summary, key points, action items, decisions, study guide, participant contributions, etc.) in the SAME language (${detectedLanguage}). 
- If ${detectedLanguage} is 'hindi', generate everything in Hindi.
- If ${detectedLanguage} is 'english', generate everything in English.
- If ${detectedLanguage} is 'hinglish', generate everything in Hinglish (mixed Hindi-English, maintaining the same style and mix as the transcript).
Do NOT translate to English if the transcript is in Hindi or Hinglish.

Please generate comprehensive meeting notes in JSON format with the following structure:
{
  "summary": "A brief 2-3 sentence summary of the entire meeting",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "actionItems": [
    {
      "task": "Task description",
      "assignedTo": "Person name or 'TBD'",
      "deadline": "Deadline if mentioned or 'TBD'"
    }
  ],
  "decisions": ["Decision 1", "Decision 2"],
  "studyGuide": {
    "definitions": ["Term: Definition"],
    "examples": ["Example 1"],
    "formulas": ["Formula 1"]
  },
  "participantContributions": {
    "Person Name": ["Contribution 1"]
  },
  "conversationTranscript": [
    {
      "speaker": "Person Name",
      "timestamp": "HH:MM:SS",
      "text": "What they said"
    }
  ]
}

IMPORTANT REQUIREMENTS:
1. Extract ALL action items with who is responsible (if mentioned) and deadlines (if mentioned)
2. List ALL decisions made during the meeting
3. Identify key definitions, examples, and formulas if this is an educational meeting
4. For participantContributions, group what each person said/contributed (only important contributions)
5. For conversationTranscript, include ONLY important discussions from both host and participants:
   - Include statements that contain: decisions, action items, key points, important questions, definitions, examples, formulas
   - Include statements from host OR participants (even if only one person is speaking)
   - Exclude: casual greetings, filler words, "um", "ah", repetitive statements, off-topic discussions
   - Mix host and participant statements chronologically based on timestamps
   - If only host is speaking, include host's important statements
   - If only participants are speaking, include participants' important statements
   - Format clearly showing who said what with timestamps
6. CRITICAL: Generate everything in ${detectedLanguage} language - summary, key points, action items, decisions, study guide, all content must be in ${detectedLanguage}
7. Be comprehensive - don't miss important details
8. Use the exact participant names from the transcript
9. Format timestamps as HH:MM:SS based on the transcript timestamps
10. DO NOT include full transcript in conversationTranscript - only include important discussions that add value to the meeting notes

Return ONLY valid JSON, no additional text.`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes for notes (longer response)
      
      console.log(`🤖 Ollama: Generating notes with model ${this.ollamaModel}...`);
      
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.5,
            top_p: 0.9,
            num_predict: 2000 // Limit response length for faster generation
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.response) {
        throw new Error('Ollama API returned no response');
      }

      const responseText = data.response.trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const notes = JSON.parse(jsonMatch[0]);
        
        // If LLM didn't provide conversationTranscript, create filtered version with only important discussions
        if (!notes.conversationTranscript && transcripts && transcripts.length > 0) {
          // Filter transcripts to include only important discussions
          const importantTranscripts = this.filterImportantDiscussions(transcripts);
          notes.conversationTranscript = this.formatConversationTranscriptForNotes(importantTranscripts);
        }
        
        return notes;
      } else {
        throw new Error('Invalid JSON response from Ollama');
      }
    } catch (error) {
      console.error('❌ Ollama notes generation error:', error);
      throw error;
    }
  },

  /**
   * Generate rule-based notes (fallback)
   */
  generateRuleBasedNotes(transcripts) {
    if (!transcripts || transcripts.length === 0) {
      return {
        summary: 'No transcript data available for this meeting.',
        keyPoints: [],
        actionItems: [],
        decisions: [],
        studyGuide: { definitions: [], examples: [], formulas: [] },
        participantContributions: {},
        conversationTranscript: []
      };
    }
    
    const fullText = transcripts.map(t => t.transcript).join(' ').toLowerCase();
    const sentences = transcripts.flatMap(t => 
      t.transcript.split(/[.!?]+/).filter(s => s.trim().length > 10).map(s => ({
        text: s.trim(),
        speaker: t.participantName || 'Unknown',
        timestamp: t.timestamp
      }))
    );
    
    const keyPoints = sentences
      .filter(s => {
        const lower = s.text.toLowerCase();
        return lower.includes('important') || lower.includes('key') || 
               lower.includes('main') || lower.includes('critical');
      })
      .map(s => s.text)
      .slice(0, 10);
    
    const actionItems = sentences
      .filter(s => {
        const lower = s.text.toLowerCase();
        return lower.includes('need to') || lower.includes('should') || 
               lower.includes('must') || lower.includes('will do') ||
               lower.includes('action') || lower.includes('task');
      })
      .map(s => ({
        task: s.text,
        assignedTo: this.extractPersonName(s.text, transcripts),
        deadline: this.extractDeadline(s.text)
      }))
      .slice(0, 10);
    
    const decisions = sentences
      .filter(s => {
        const lower = s.text.toLowerCase();
        return lower.includes('decided') || lower.includes('agreed') || 
               lower.includes('concluded') || lower.includes('chosen');
      })
      .map(s => s.text)
      .slice(0, 10);
    
    const definitions = this.extractDefinitions(sentences);
    const examples = this.extractExamples(sentences);
    const formulas = this.extractFormulas(sentences);
    
    const participantContributions = {};
    transcripts.forEach(t => {
      const name = t.participantName || 'Unknown';
      if (!participantContributions[name]) {
        participantContributions[name] = [];
      }
      const contributions = t.transcript.split(/[.!?]+/).filter(s => s.trim().length > 20);
      participantContributions[name].push(...contributions.slice(0, 5));
    });
    
    const conversationTranscript = this.formatConversationTranscriptForNotes(transcripts);
    
    const topics = this.detectTopics(transcripts.map(t => t.transcript).join(' '));
    const summary = `This meeting discussed ${topics.map(t => t.topic).join(', ')}. ` +
      `${keyPoints.length > 0 ? 'Key points included: ' + keyPoints.slice(0, 3).join(', ') + '. ' : ''}` +
      `${decisions.length > 0 ? decisions.length + ' decisions were made. ' : ''}` +
      `${actionItems.length > 0 ? actionItems.length + ' action items were identified.' : ''}`;
    
    return {
      summary: summary.trim(),
      keyPoints,
      actionItems,
      decisions,
      studyGuide: {
        definitions,
        examples,
        formulas
      },
      participantContributions,
      conversationTranscript
    };
  },

  /**
   * Generate summary using Gemini
   */
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
  },

  /**
   * Generate rule-based summary
   */
  generateRuleBasedSummary(transcriptContext, topics, sentiment, conversationAnalysis) {
    const sentences = transcriptContext.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const keyPoints = conversationAnalysis.keyPoints.slice(0, 5);
    
    const actionItems = [];
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (lowerSentence.includes('need to') || lowerSentence.includes('should') || 
          lowerSentence.includes('must') || lowerSentence.includes('will') ||
          lowerSentence.includes('action') || lowerSentence.includes('task')) {
        actionItems.push(sentence.trim());
      }
    });
    
    const decisions = [];
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (lowerSentence.includes('decided') || lowerSentence.includes('agreed') || 
          lowerSentence.includes('concluded') || lowerSentence.includes('chosen')) {
        decisions.push(sentence.trim());
      }
    });
    
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
  },

  // ============================================
  // HELPER METHODS - Analysis
  // ============================================

  /**
   * Detect language from transcript context
   */
  detectLanguageFromContext(text) {
    if (!text || text.length < 10) return 'english';
    
    const lowerText = text.toLowerCase();
    
    // Count Hindi and English characters
    const hindiPattern = /[अ-ह]/;
    const englishPattern = /[a-z]/i;
    
    const hindiMatches = (text.match(hindiPattern) || []).length;
    const englishMatches = (lowerText.match(englishPattern) || []).length;
    const totalChars = text.replace(/\s+/g, '').length;
    
    if (totalChars === 0) return 'english';
    
    // Calculate percentages
    const hindiPercent = (hindiMatches / totalChars) * 100;
    const englishPercent = (englishMatches / totalChars) * 100;
    
    // Detect language based on percentages
    let detectedLang = 'english';
    
    // If no Hindi characters at all, it's definitely English
    if (hindiMatches === 0) {
      detectedLang = 'english';
    } else if (hindiPercent > 60 && englishPercent < 30) {
      // Mostly Hindi
      detectedLang = 'hindi';
    } else if (englishPercent > 50 && hindiPercent < 40) {
      // Mostly English (lowered threshold for better detection)
      detectedLang = 'english';
    } else if (hindiPercent > 20 && englishPercent > 20) {
      // Mixed - Hinglish
      detectedLang = 'hinglish';
    } else if (hindiPercent > 0 && englishPercent > 0) {
      // Some mix present
      detectedLang = 'hinglish';
    } else if (hindiPercent > 0) {
      // Only Hindi
      detectedLang = 'hindi';
    }
    
    console.log(`🌍 LLM Language detected: ${detectedLang} (Hindi: ${hindiPercent.toFixed(1)}%, English: ${englishPercent.toFixed(1)}%)`);
    return detectedLang;
  },

  /**
   * Analyze conversation context for better question generation
   */
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
    
    const keyPoints = [];
    const unresolvedIssues = [];
    
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      
      if (lowerSentence.includes('decided') || lowerSentence.includes('agreed') || 
          lowerSentence.includes('concluded') || lowerSentence.includes('important') ||
          lowerSentence.includes('key') || lowerSentence.includes('main')) {
        keyPoints.push(sentence.trim());
      }
      
      if (lowerSentence.includes('problem') || lowerSentence.includes('issue') || 
          lowerSentence.includes('concern') || lowerSentence.includes('challenge') ||
          lowerSentence.includes('difficult') || lowerSentence.includes('unclear') ||
          lowerSentence.includes('need to') || lowerSentence.includes('should we')) {
        unresolvedIssues.push(sentence.trim());
      }
    });
    
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
      keyPoints: keyPoints.slice(0, 3),
      unresolvedIssues: unresolvedIssues.slice(0, 3),
      recentFocus: recentFocus
    };
  },

  /**
   * Detect topics from transcript
   */
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
  },

  /**
   * Analyze sentiment of transcript
   */
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
  },

  /**
   * Generate contextual follow-up questions
   */
  generateContextualQuestions(topics, sentiment, transcript, conversationAnalysis = null, allParticipantsWithEmotions = [], participantNames = {}, emotionCategories = {}) {
    const questions = [];
    const lowerTranscript = transcript.toLowerCase();

    if (topics.length === 0 && (!conversationAnalysis || conversationAnalysis.unresolvedIssues.length === 0)) {
      console.log('📝 No clear topics or issues found - skipping question generation');
      return [''];
    }

    if (conversationAnalysis && conversationAnalysis.unresolvedIssues.length > 0) {
      conversationAnalysis.unresolvedIssues.forEach(issue => {
        const lowerIssue = issue.toLowerCase();
        if (!lowerTranscript.includes(lowerIssue.substring(0, 10))) {
          return;
        }
        
        if (lowerIssue.includes('budget') || lowerIssue.includes('cost') || lowerIssue.includes('money')) {
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
          const issueWords = issue.split(/\s+/).slice(0, 3).join(' ');
          questions.push(`How do we resolve the ${issueWords} issue?`);
        }
      });
    }

    topics.forEach(topicData => {
      const topicKeywords = topicData.matches || [];
      if (topicKeywords.length === 0) return;
      
      const specificMention = this.extractSpecificMention(transcript, topicKeywords);
      if (!specificMention) return;
      
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

    if (allParticipantsWithEmotions.length > 0) {
      const mainTopic = topics.length > 0 ? topics[0].topic : 'the current topic';
      
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

    if (questions.length === 0) {
      console.log('📝 No context-specific questions generated - conversation too generic');
      return [''];
    }

    return questions;
  },

  /**
   * Extract specific mention from transcript
   */
  extractSpecificMention(transcript, keywords) {
    if (!transcript || !keywords || keywords.length === 0) return null;
    
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const lowerTranscript = transcript.toLowerCase();
    
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerTranscript.includes(lowerKeyword)) {
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(lowerKeyword)) {
            const words = sentence.trim().split(/\s+/);
            const keywordIndex = words.findIndex(w => w.toLowerCase().includes(lowerKeyword));
            if (keywordIndex >= 0) {
              const start = Math.max(0, keywordIndex - 2);
              const end = Math.min(words.length, keywordIndex + 3);
              const mention = words.slice(start, end).join(' ');
              return mention.replace(/^[^\w]+|[^\w]+$/g, '').trim() || keyword;
            }
          }
        }
        return keyword;
      }
    }
    
    return null;
  },

  // ============================================
  // HELPER METHODS - Notes Formatting
  // ============================================

  /**
   * Create formatted conversation transcript showing who said what
   */
  createConversationTranscript(transcripts) {
    return transcripts
      .map(t => {
        const timestamp = new Date(t.timestamp);
        const timeStr = timestamp.toLocaleTimeString('en-US', { hour12: false });
        return `${t.participantName || 'Unknown'} (${timeStr}): ${t.transcript}`;
      })
      .join('\n');
  },

  /**
   * Format conversation transcript for notes
   */
  formatConversationTranscriptForNotes(transcripts) {
    return transcripts.map(t => {
      const timestamp = new Date(t.timestamp);
      const timeStr = timestamp.toLocaleTimeString('en-US', { hour12: false });
      return {
        speaker: t.participantName || 'Unknown',
        timestamp: timeStr,
        text: t.transcript
      };
    });
  },

  /**
   * Filter transcripts to include only important discussions
   */
  filterImportantDiscussions(transcripts) {
    return transcripts.filter(t => {
      const text = t.transcript.toLowerCase().trim();
      
      // Skip empty or very short transcripts
      if (text.length < 10) return false;
      
      // Skip filler words and casual greetings
      const fillerWords = ['um', 'uh', 'ah', 'er', 'hmm', 'ok', 'okay', 'yeah', 'yes', 'no', 'hi', 'hello', 'hey', 'thanks', 'thank you'];
      if (fillerWords.some(word => text === word || text.startsWith(word + ' '))) {
        return false;
      }
      
      // Include if contains important keywords
      const importantKeywords = [
        'decision', 'decided', 'agree', 'agreed', 'conclude', 'concluded',
        'action', 'task', 'todo', 'need to', 'should', 'must', 'will do',
        'deadline', 'due', 'by', 'before',
        'important', 'key', 'main', 'critical', 'essential',
        'define', 'definition', 'means', 'refers to',
        'example', 'for example', 'such as', 'instance',
        'formula', 'equation', 'calculate', 'solve',
        'question', 'ask', 'wondering', 'clarify',
        'discuss', 'discussion', 'topic', 'subject',
        'problem', 'issue', 'challenge', 'solution'
      ];
      
      const containsImportantKeyword = importantKeywords.some(keyword => text.includes(keyword));
      
      // Include if it's a complete sentence (has punctuation or is substantial)
      const isCompleteStatement = /[.!?]/.test(t.transcript) || text.split(/\s+/).length >= 5;
      
      // Include if it's a question
      const isQuestion = text.includes('?') || text.startsWith('what') || text.startsWith('why') || 
                        text.startsWith('how') || text.startsWith('when') || text.startsWith('where') ||
                        text.startsWith('who') || text.startsWith('which');
      
      return containsImportantKeyword || (isCompleteStatement && text.length > 20) || isQuestion;
    });
  },

  /**
   * Extract person name from text
   */
  extractPersonName(text, transcripts) {
    const names = [...new Set(transcripts.map(t => t.participantName).filter(Boolean))];
    for (const name of names) {
      if (text.toLowerCase().includes(name.toLowerCase())) {
        return name;
      }
    }
    return 'TBD';
  },

  /**
   * Extract deadline from text
   */
  extractDeadline(text) {
    const deadlinePatterns = [
      /(?:by|before|until|deadline|due)\s+(\w+\s+\d+|\d+\s+\w+|\w+day|tomorrow|next\s+\w+)/i,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
      /(\w+\s+\d{1,2},?\s+\d{4})/
    ];
    
    for (const pattern of deadlinePatterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return 'TBD';
  },

  /**
   * Extract definitions
   */
  extractDefinitions(sentences) {
    return sentences
      .filter(s => {
        const lower = s.text.toLowerCase();
        return lower.includes('is defined as') || lower.includes('means') || 
               lower.includes('refers to') || lower.includes(':') && lower.split(':').length === 2;
      })
      .map(s => s.text)
      .slice(0, 10);
  },

  /**
   * Extract examples
   */
  extractExamples(sentences) {
    return sentences
      .filter(s => {
        const lower = s.text.toLowerCase();
        return lower.includes('for example') || lower.includes('such as') || 
               lower.includes('like') || lower.includes('instance');
      })
      .map(s => s.text)
      .slice(0, 10);
  },

  /**
   * Extract formulas
   */
  extractFormulas(sentences) {
    return sentences
      .filter(s => {
        const text = s.text;
        return /[=+\-*/()]/.test(text) && /\w+\s*[=+\-*/]/.test(text);
      })
      .map(s => s.text)
      .slice(0, 10);
  }
};

