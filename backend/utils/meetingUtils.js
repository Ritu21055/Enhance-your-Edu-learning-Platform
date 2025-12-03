// Meeting utility functions
import { v4 as uuidv4 } from 'uuid';
import { activeMeetings, sentimentData } from '../config/stores.js';
import llmService from '../src/utils/llmService.js';

/**
 * Auto-detect important moments in a meeting
 * This function analyzes chat messages, sentiment data, and other signals
 * to identify potentially important moments that weren't manually marked
 */
export async function detectImportantMoments(meetingId, existingHighlights) {
  const autoHighlights = [];
  
  try {
    // Get meeting data
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) return autoHighlights;
    
    // Get sentiment data for the meeting
    const meetingSentimentData = sentimentData.get(meetingId);
    
    // Get LLM transcript history for analysis
    const transcriptHistory = llmService.getRecentTranscriptContext(meetingId, 10); // Last 10 minutes
    
    // Auto-detect based on various signals
    const currentTime = Date.now();
    
    // 1. Detect high engagement moments (based on sentiment spikes)
    if (meetingSentimentData && meetingSentimentData.participants) {
      meetingSentimentData.participants.forEach((data, participantId) => {
        if (data.sentimentHistory && data.sentimentHistory.length > 0) {
          // Look for emotion spikes (excitement, surprise, etc.)
          const recentEmotions = data.emotionHistory.slice(-10); // Last 10 entries
          recentEmotions.forEach((emotion, index) => {
            if (emotion.confidence > 0.8 && 
                (emotion.emotion === 'surprised' || emotion.emotion === 'happy')) {
              
              const timestamp = currentTime - (recentEmotions.length - index) * 30000; // 30 seconds per entry
              
              // Check if this timestamp is already covered by existing highlights
              const isAlreadyCovered = existingHighlights.some(h => 
                Math.abs(h.timestamp - timestamp) < 30000 // Within 30 seconds
              );
              
              if (!isAlreadyCovered) {
                autoHighlights.push({
                  timestamp,
                  participantId,
                  date: new Date(timestamp).toISOString(),
                  id: uuidv4(),
                  type: 'auto_engagement',
                  description: `High engagement moment - ${emotion.emotion}`,
                  priority: 'medium',
                  confidence: emotion.confidence
                });
              }
            }
          });
        }
      });
    }
    
    // 2. Enhanced transcript analysis for important moments
    if (transcriptHistory && transcriptHistory.length > 0) {
      transcriptHistory.forEach((entry, index) => {
        const text = entry.transcript.toLowerCase();
        const timestamp = currentTime - (transcriptHistory.length - index) * 30000;
        
        // Check if already covered
        const isAlreadyCovered = existingHighlights.some(h => 
          Math.abs(h.timestamp - timestamp) < 30000
        );
        
        if (isAlreadyCovered) return;
        
        // Detect decision moments
        const decisionKeywords = ['decided', 'agreed', 'concluded', 'final', 'approved', 'rejected', 'chosen', 'selected'];
        if (decisionKeywords.some(keyword => text.includes(keyword))) {
          autoHighlights.push({
            timestamp,
            participantId: 'auto-detected',
            date: new Date(timestamp).toISOString(),
            id: uuidv4(),
            type: 'auto_decision',
            description: 'Important decision made',
            priority: 'high',
            confidence: 0.9
          });
          return;
        }
        
        // Detect problem mentions
        const problemKeywords = ['problem', 'issue', 'challenge', 'concern', 'difficult', 'trouble', 'error', 'bug'];
        if (problemKeywords.some(keyword => text.includes(keyword))) {
          autoHighlights.push({
            timestamp,
            participantId: 'auto-detected',
            date: new Date(timestamp).toISOString(),
            id: uuidv4(),
            type: 'auto_problem',
            description: 'Problem or issue identified',
            priority: 'high',
            confidence: 0.8
          });
          return;
        }
        
        // Detect solution proposals
        const solutionKeywords = ['solution', 'fix', 'resolve', 'solve', 'propose', 'suggest', 'recommend', 'idea'];
        if (solutionKeywords.some(keyword => text.includes(keyword))) {
          autoHighlights.push({
            timestamp,
            participantId: 'auto-detected',
            date: new Date(timestamp).toISOString(),
            id: uuidv4(),
            type: 'auto_solution',
            description: 'Solution or approach proposed',
            priority: 'high',
            confidence: 0.8
          });
          return;
        }
        
        // Detect action items
        const actionKeywords = ['action', 'task', 'todo', 'assign', 'responsible', 'deadline', 'due', 'next step'];
        if (actionKeywords.some(keyword => text.includes(keyword))) {
          autoHighlights.push({
            timestamp,
            participantId: 'auto-detected',
            date: new Date(timestamp).toISOString(),
            id: uuidv4(),
            type: 'auto_action',
            description: 'Action item or task assigned',
            priority: 'medium',
            confidence: 0.7
          });
          return;
        }
        
        // Detect questions (lower priority)
        if (text.includes('?') || 
            text.includes('what') || 
            text.includes('how') || 
            text.includes('why') || 
            text.includes('when') || 
            text.includes('where')) {
            autoHighlights.push({
              timestamp,
              participantId: 'auto-detected',
              date: new Date(timestamp).toISOString(),
              id: uuidv4(),
              type: 'auto_question',
              description: 'Important question asked',
              priority: 'medium',
              confidence: 0.6
            });
        }
      });
    }
    
    // 3. Add meeting start and end moments if not already covered
    const meetingStartTime = meeting.startTime || (currentTime - 3600000); // Assume 1 hour ago if no start time
    const meetingEndTime = currentTime;
    
    // Meeting start highlight
    const startCovered = existingHighlights.some(h => 
      Math.abs(h.timestamp - meetingStartTime) < 60000 // Within 1 minute
    );
    
    if (!startCovered) {
      autoHighlights.push({
        timestamp: meetingStartTime,
        participantId: 'system',
        date: new Date(meetingStartTime).toISOString(),
        id: uuidv4(),
        type: 'auto_meeting_start',
        description: 'Meeting started',
        priority: 'low',
        confidence: 1.0
      });
    }
    
    // Meeting end highlight
    const endCovered = existingHighlights.some(h => 
      Math.abs(h.timestamp - meetingEndTime) < 60000
    );
    
    if (!endCovered) {
      autoHighlights.push({
        timestamp: meetingEndTime,
        participantId: 'system',
        date: new Date(meetingEndTime).toISOString(),
        id: uuidv4(),
        type: 'auto_meeting_end',
        description: 'Meeting ended',
        priority: 'low',
        confidence: 1.0
      });
    }
    
    // Sort by timestamp and limit to reasonable number
    autoHighlights.sort((a, b) => a.timestamp - b.timestamp);
    
    // Limit to maximum 5 auto-detected highlights to avoid overwhelming the reel
    return autoHighlights.slice(0, 5);
    
  } catch (error) {
    console.error('❌ Error in auto-detection:', error);
    return autoHighlights;
  }
}

