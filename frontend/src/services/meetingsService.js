// meetingsService.js - Service for managing meeting data

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

// Store meeting in localStorage
const storeMeeting = (meeting) => {
  try {
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
const updateMeetingStatus = (meetingId, status, endTime = null) => {
  try {
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
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error updating meeting status:', error);
    return false;
  }
};

// Add participant to meeting
const addParticipant = (meetingId, participantName) => {
  try {
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

export {
  createMeeting,
  storeMeeting,
  getMeetings,
  updateMeetingStatus,
  addParticipant,
  getMeetingById,
  deleteMeeting,
  clearAllMeetings,
  getMeetingStats
};
