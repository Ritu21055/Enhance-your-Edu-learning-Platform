import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Meeting History Manager
 * Handles persistent storage of meeting data, highlights, and recordings
 */
class MeetingHistoryManager {
  constructor() {
    this.historyDir = path.join(__dirname, '../../history');
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      console.log('📁 Meeting history directory ensured');
    } catch (error) {
      console.error('❌ Failed to create history directory:', error);
    }
  }

  /**
   * Save meeting to history
   * @param {Object} meetingData - Complete meeting data
   * @param {Array} highlights - Meeting highlights
   * @param {Object} recordingSession - Recording session data
   * @param {Array} transcriptHistory - Transcript history
   * @param {Object} sentimentData - Sentiment analysis data
   * @returns {Promise<string>} Path to saved meeting file
   */
  async saveMeetingToHistory(meetingData, highlights = [], recordingSession = null, transcriptHistory = [], sentimentData = null) {
    try {
      const meetingId = meetingData.id;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `meeting_${meetingId}_${timestamp}.json`;
      const filePath = path.join(this.historyDir, fileName);

      const meetingHistory = {
        meeting: {
          id: meetingData.id,
          title: meetingData.title || `Meeting ${meetingId}`,
          host: meetingData.host,
          hostId: meetingData.hostId,
          participants: meetingData.participants || [],
          createdAt: meetingData.createdAt,
          endedAt: new Date().toISOString(),
          duration: meetingData.duration || 0,
          status: 'completed'
        },
        highlights: {
          total: highlights.length,
          data: highlights,
          summary: this.generateHighlightSummary(highlights)
        },
        recording: recordingSession ? {
          sessionId: recordingSession.sessionId,
          recordingPath: recordingSession.recordingPath,
          startTime: recordingSession.startTime,
          endTime: recordingSession.endTime,
          duration: recordingSession.endTime - recordingSession.startTime,
          options: recordingSession.options
        } : null,
        transcript: {
          totalEntries: transcriptHistory.length,
          data: transcriptHistory,
          fullTranscript: this.generateFullTranscript(transcriptHistory)
        },
        sentiment: sentimentData ? {
          totalParticipants: sentimentData.participants?.size || 0,
          sentimentCounts: sentimentData.sentimentCounts || {},
          lastUpdated: sentimentData.lastUpdated
        } : null,
        metadata: {
          savedAt: new Date().toISOString(),
          version: '1.0',
          aiFeatures: {
            highlightDetection: true,
            questionGeneration: true,
            sentimentAnalysis: !!sentimentData,
            transcription: transcriptHistory.length > 0
          }
        }
      };

      await fs.writeFile(filePath, JSON.stringify(meetingHistory, null, 2));
      
      // Also save to active meetings index for quick access
      await this.updateActiveMeetingsIndex(meetingHistory);
      
      console.log('💾 Meeting saved to history:', {
        meetingId,
        fileName,
        highlights: highlights.length,
        transcriptEntries: transcriptHistory.length,
        hasRecording: !!recordingSession
      });

      return filePath;

    } catch (error) {
      console.error('❌ Failed to save meeting to history:', error);
      throw error;
    }
  }

  /**
   * Generate highlight summary
   * @param {Array} highlights - Array of highlight objects
   * @returns {Object} Highlight summary
   */
  generateHighlightSummary(highlights) {
    const summary = {
      totalHighlights: highlights.length,
      byType: {},
      byPriority: {},
      byParticipant: {},
      timeline: []
    };

    highlights.forEach(highlight => {
      // Count by type
      summary.byType[highlight.type] = (summary.byType[highlight.type] || 0) + 1;
      
      // Count by priority
      summary.byPriority[highlight.priority] = (summary.byPriority[highlight.priority] || 0) + 1;
      
      // Count by participant
      summary.byParticipant[highlight.participantId] = (summary.byParticipant[highlight.participantId] || 0) + 1;
      
      // Add to timeline
      summary.timeline.push({
        timestamp: highlight.timestamp,
        type: highlight.type,
        description: highlight.description,
        priority: highlight.priority,
        participantId: highlight.participantId
      });
    });

    // Sort timeline by timestamp
    summary.timeline.sort((a, b) => a.timestamp - b.timestamp);

    return summary;
  }

  /**
   * Generate full transcript from transcript history
   * @param {Array} transcriptHistory - Array of transcript entries
   * @returns {string} Full transcript text
   */
  generateFullTranscript(transcriptHistory) {
    return transcriptHistory
      .map(entry => entry.transcript)
      .join(' ')
      .trim();
  }

  /**
   * Get meeting history
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<Object|null>} Meeting history or null if not found
   */
  async getMeetingHistory(meetingId) {
    try {
      const files = await fs.readdir(this.historyDir);
      const meetingFile = files.find(file => file.includes(`meeting_${meetingId}_`));
      
      if (!meetingFile) {
        return null;
      }

      const filePath = path.join(this.historyDir, meetingFile);
      const fileContent = await fs.readFile(filePath, 'utf8');
      return JSON.parse(fileContent);

    } catch (error) {
      console.error('❌ Failed to get meeting history:', error);
      return null;
    }
  }

  /**
   * Get all meeting histories
   * @returns {Promise<Array>} Array of meeting histories
   */
  async getAllMeetingHistories() {
    try {
      const files = await fs.readdir(this.historyDir);
      const meetingFiles = files.filter(file => file.startsWith('meeting_') && file.endsWith('.json'));
      
      const histories = [];
      for (const file of meetingFiles) {
        try {
          const filePath = path.join(this.historyDir, file);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const history = JSON.parse(fileContent);
          histories.push(history);
        } catch (error) {
          console.warn('⚠️ Failed to parse meeting file:', file, error.message);
        }
      }

      // Sort by creation date (newest first)
      histories.sort((a, b) => new Date(b.meeting.createdAt) - new Date(a.meeting.createdAt));

      return histories;

    } catch (error) {
      console.error('❌ Failed to get all meeting histories:', error);
      return [];
    }
  }

  /**
   * Get meeting statistics
   * @returns {Promise<Object>} Meeting statistics
   */
  async getMeetingStatistics() {
    try {
      const histories = await this.getAllMeetingHistories();
      
      const stats = {
        totalMeetings: histories.length,
        totalHighlights: 0,
        totalDuration: 0,
        averageParticipants: 0,
        highlightTypes: {},
        meetingDates: [],
        recentMeetings: []
      };

      histories.forEach(history => {
        stats.totalHighlights += history.highlights.total;
        stats.totalDuration += history.recording?.duration || 0;
        stats.averageParticipants += history.meeting.participants.length;
        
        // Count highlight types
        Object.entries(history.highlights.summary.byType).forEach(([type, count]) => {
          stats.highlightTypes[type] = (stats.highlightTypes[type] || 0) + count;
        });
        
        stats.meetingDates.push(history.meeting.createdAt);
      });

      if (histories.length > 0) {
        stats.averageParticipants = Math.round(stats.averageParticipants / histories.length);
        stats.recentMeetings = histories.slice(0, 5).map(h => ({
          id: h.meeting.id,
          title: h.meeting.title,
          date: h.meeting.createdAt,
          highlights: h.highlights.total,
          participants: h.meeting.participants.length
        }));
      }

      return stats;

    } catch (error) {
      console.error('❌ Failed to get meeting statistics:', error);
      return {
        totalMeetings: 0,
        totalHighlights: 0,
        totalDuration: 0,
        averageParticipants: 0,
        highlightTypes: {},
        meetingDates: [],
        recentMeetings: []
      };
    }
  }

  /**
   * Delete meeting history
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteMeetingHistory(meetingId) {
    try {
      const files = await fs.readdir(this.historyDir);
      const meetingFile = files.find(file => file.includes(`meeting_${meetingId}_`));
      
      if (!meetingFile) {
        return false;
      }

      const filePath = path.join(this.historyDir, meetingFile);
      await fs.unlink(filePath);
      
      console.log('🗑️ Meeting history deleted:', meetingId);
      return true;

    } catch (error) {
      console.error('❌ Failed to delete meeting history:', error);
      return false;
    }
  }

  /**
   * Update active meetings index for quick access
   * @param {Object} meetingHistory - Meeting history object
   */
  async updateActiveMeetingsIndex(meetingHistory) {
    try {
      const indexPath = path.join(this.historyDir, 'active_meetings_index.json');
      
      let index = {};
      try {
        const indexContent = await fs.readFile(indexPath, 'utf8');
        index = JSON.parse(indexContent);
      } catch (error) {
        // Index doesn't exist yet, start fresh
        console.log('📋 Creating new active meetings index');
      }
      
      // Add meeting to index
      index[meetingHistory.meeting.id] = {
        title: meetingHistory.meeting.title,
        host: meetingHistory.meeting.host,
        createdAt: meetingHistory.meeting.createdAt,
        endedAt: meetingHistory.meeting.endedAt,
        duration: meetingHistory.meeting.duration,
        highlights: meetingHistory.highlights.total,
        participants: meetingHistory.meeting.participants.length,
        hasRecording: !!meetingHistory.recording,
        hasTranscript: meetingHistory.transcript.totalEntries > 0,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
      console.log('📋 Updated active meetings index');
      
    } catch (error) {
      console.error('❌ Failed to update active meetings index:', error);
    }
  }

  /**
   * Load active meetings index on server startup
   * @returns {Promise<Object>} Active meetings index
   */
  async loadActiveMeetingsIndex() {
    try {
      const indexPath = path.join(this.historyDir, 'active_meetings_index.json');
      
      try {
        const indexContent = await fs.readFile(indexPath, 'utf8');
        const index = JSON.parse(indexContent);
        console.log('📋 Loaded active meetings index:', Object.keys(index).length, 'meetings');
        return index;
      } catch (error) {
        console.log('📋 No active meetings index found, starting fresh');
        return {};
      }
      
    } catch (error) {
      console.error('❌ Failed to load active meetings index:', error);
      return {};
    }
  }

  /**
   * Get active meetings from persistent storage
   * @returns {Promise<Array>} Array of active meeting summaries
   */
  async getActiveMeetings() {
    try {
      const index = await this.loadActiveMeetingsIndex();
      const meetings = Object.values(index);
      
      // Sort by creation date (newest first)
      meetings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return meetings;
      
    } catch (error) {
      console.error('❌ Failed to get active meetings:', error);
      return [];
    }
  }

  /**
   * Remove meeting from active meetings index
   * @param {string} meetingId - Meeting ID to remove
   * @returns {Promise<boolean>} Success status
   */
  async removeFromActiveMeetings(meetingId) {
    try {
      const indexPath = path.join(this.historyDir, 'active_meetings_index.json');
      
      let index = {};
      try {
        const indexContent = await fs.readFile(indexPath, 'utf8');
        index = JSON.parse(indexContent);
      } catch (error) {
        console.log('📋 No active meetings index found');
        return false;
      }
      
      if (index[meetingId]) {
        delete index[meetingId];
        await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
        console.log('📋 Removed meeting from active meetings index:', meetingId);
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('❌ Failed to remove meeting from active meetings:', error);
      return false;
    }
  }

  /**
   * Clean up old meeting histories (older than specified days)
   * @param {number} daysToKeep - Number of days to keep
   * @returns {Promise<number>} Number of files deleted
   */
  async cleanupOldHistories(daysToKeep = 30) {
    try {
      const files = await fs.readdir(this.historyDir);
      const meetingFiles = files.filter(file => file.startsWith('meeting_') && file.endsWith('.json'));
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      let deletedCount = 0;
      
      for (const file of meetingFiles) {
        try {
          const filePath = path.join(this.historyDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            deletedCount++;
            console.log('🗑️ Deleted old meeting history:', file);
          }
        } catch (error) {
          console.warn('⚠️ Failed to process file:', file, error.message);
        }
      }

      console.log(`🧹 Cleanup completed: ${deletedCount} old meeting histories deleted`);
      return deletedCount;

    } catch (error) {
      console.error('❌ Failed to cleanup old histories:', error);
      return 0;
    }
  }
}

// Create and export singleton instance
const meetingHistoryManager = new MeetingHistoryManager();
export default meetingHistoryManager;
