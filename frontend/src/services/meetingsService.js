// meetingsService.js - Service for managing meeting data
import { 
  saveMeetingToHistory, 
  updateMeetingStatus as updateMeetingStatusApi,
  addParticipantToMeeting as addParticipantToMeetingApi
} from './meetingHistoryApi';

// Meeting data structure
const createMeeting = (meetingId, title, participants = []) => {
  const meeting = {
    id: meetingId,
    title: title || `Meeting ${meetingId}`,
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }),
    startTime: new Date().getTime(),
    endTime: null,
    duration: 0,
    participants: participants.length,
    status: 'ongoing',
    createdAt: new Date().toISOString()
  };

  return meeting;
};

// Store meeting in localStorage and backend
const storeMeeting = async (meeting) => {
  try {
    // Store in localStorage (for immediate access)
    const existingMeetings = getMeetings();
    
    // Check if meeting with same ID already exists
    const existingMeetingIndex = existingMeetings.findIndex(m => m.id === meeting.id);
    
    if (existingMeetingIndex !== -1) {
      // Update existing meeting instead of creating duplicate
      existingMeetings[existingMeetingIndex] = meeting;
      console.log(`Updated existing meeting ${meeting.id} with title: ${meeting.title}`);
    } else {
      // Add new meeting
      existingMeetings.unshift(meeting); // Add to beginning
      console.log(`Created new meeting ${meeting.id} with title: ${meeting.title}`);
    }
    
    localStorage.setItem('meetings', JSON.stringify(existingMeetings));
    
    // Also save to backend
    try {
      console.log(`💾 Attempting to save meeting ${meeting.id} to backend...`);
      const backendResult = await saveMeetingToHistory(meeting);
      if (backendResult) {
        console.log(`✅ Meeting ${meeting.id} saved to backend history successfully`);
      } else {
        console.warn(`⚠️ Backend save returned null for meeting ${meeting.id}`);
      }
    } catch (backendError) {
      console.warn(`⚠️ Failed to save meeting ${meeting.id} to backend:`, backendError);
      console.warn(`⚠️ Backend error details:`, {
        message: backendError.message,
        stack: backendError.stack,
        meetingId: meeting.id
      });
      // Don't fail the whole operation if backend save fails
    }
    
    return true;
  } catch (error) {
    console.error('Error storing meeting:', error);
    return false;
  }
};

// Get all meetings from localStorage
const getMeetings = () => {
  try {
    const meetings = localStorage.getItem('meetings');
    return meetings ? JSON.parse(meetings) : [];
  } catch (error) {
    console.error('Error getting meetings:', error);
    return [];
  }
};

// Update meeting status (e.g., mark as completed)
const updateMeetingStatus = async (meetingId, status, endTime = null) => {
  try {
    // Update localStorage
    const meetings = getMeetings();
    const meetingIndex = meetings.findIndex(m => m.id === meetingId);
    
    if (meetingIndex !== -1) {
      const meeting = meetings[meetingIndex];
      
      if (endTime) {
        meeting.endTime = endTime;
        meeting.duration = Math.round((endTime - meeting.startTime) / 60000); // Duration in minutes
      }
      
      meeting.status = status;
      meeting.lastUpdated = new Date().toISOString();
      
      localStorage.setItem('meetings', JSON.stringify(meetings));
      
      // Also update backend
      try {
        await updateMeetingStatusApi(meetingId, status, endTime);
        console.log(`✅ Meeting ${meetingId} status updated in backend: ${status}`);
      } catch (backendError) {
        console.warn(`⚠️ Failed to update meeting ${meetingId} status in backend:`, backendError);
        // Don't fail the whole operation if backend update fails
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error updating meeting status:', error);
    return false;
  }
};

// Add participant to meeting
const addParticipant = async (meetingId, participantName) => {
  try {
    // Update localStorage
    const meetings = getMeetings();
    const meetingIndex = meetings.findIndex(m => m.id === meetingId);
    
    if (meetingIndex !== -1) {
      const meeting = meetings[meetingIndex];
      
      if (!meeting.participantList) {
        meeting.participantList = [];
      }
      
      if (!meeting.participantList.includes(participantName)) {
        meeting.participantList.push(participantName);
        meeting.participants = meeting.participantList.length;
        
        localStorage.setItem('meetings', JSON.stringify(meetings));
        
        // Also update backend
        try {
          await addParticipantToMeetingApi(meetingId, participantName);
          console.log(`✅ Participant ${participantName} added to meeting ${meetingId} in backend`);
        } catch (backendError) {
          console.warn(`⚠️ Failed to add participant ${participantName} to meeting ${meetingId} in backend:`, backendError);
          // Don't fail the whole operation if backend update fails
        }
        
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error adding participant:', error);
    return false;
  }
};

// Get meeting by ID
const getMeetingById = (meetingId) => {
  try {
    const meetings = getMeetings();
    return meetings.find(m => m.id === meetingId);
  } catch (error) {
    console.error('Error getting meeting by ID:', error);
    return null;
  }
};

// Delete meeting
const deleteMeeting = (meetingId) => {
  try {
    const meetings = getMeetings();
    const filteredMeetings = meetings.filter(m => m.id !== meetingId);
    localStorage.setItem('meetings', JSON.stringify(filteredMeetings));
    return true;
  } catch (error) {
    console.error('Error deleting meeting:', error);
    return false;
  }
};

// Clear all meetings (for testing/reset)
const clearAllMeetings = () => {
  try {
    localStorage.removeItem('meetings');
    return true;
  } catch (error) {
    console.error('Error clearing meetings:', error);
    return false;
  }
};

// Get meeting statistics
const getMeetingStats = () => {
  try {
    const meetings = getMeetings();
    
    const totalMeetings = meetings.length;
    const totalParticipants = meetings.reduce((sum, m) => sum + m.participants, 0);
    const completedMeetings = meetings.filter(m => m.status === 'completed').length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration || 0), 0);
    
    return {
      totalMeetings,
      totalParticipants,
      completedMeetings,
      totalDuration
    };
  } catch (error) {
    console.error('Error getting meeting stats:', error);
    return {
      totalMeetings: 0,
      totalParticipants: 0,
      completedMeetings: 0,
      totalDuration: 0
    };
  }
};

// Get active meetings (ongoing meetings that participants can rejoin)
const getActiveMeetings = () => {
  try {
    const meetings = getMeetings();
    // Return only ongoing meetings (not completed)
    return meetings.filter(meeting => meeting.status === 'ongoing');
  } catch (error) {
    console.error('Error getting active meetings:', error);
    return [];
  }
};

// Get recent meetings for rejoin functionality
const getRecentMeetings = (limit = 5) => {
  try {
    const meetings = getMeetings();
    // Sort by creation time (newest first) and limit results
    return meetings
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting recent meetings:', error);
    return [];
  }
};

export {
  createMeeting,
  storeMeeting,
  getMeetings,
  updateMeetingStatus,
  addParticipant,
  getMeetingById,
  deleteMeeting,
  clearAllMeetings,
  getMeetingStats,
  getActiveMeetings,
  getRecentMeetings
};
