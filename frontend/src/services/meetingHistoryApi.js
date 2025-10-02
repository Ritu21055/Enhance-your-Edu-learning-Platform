// meetingHistoryApi.js - API service for meeting history backend integration

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// Get all meeting histories from backend
export const getAllMeetingHistories = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/history/all`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.meetingHistories || [];
  } catch (error) {
    console.error('Error fetching meeting histories:', error);
    return [];
  }
};

// Get specific meeting history
export const getMeetingHistory = async (meetingId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/history`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.meetingHistory;
  } catch (error) {
    console.error('Error fetching meeting history:', error);
    return null;
  }
};

// Get meeting statistics
export const getMeetingStatistics = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/history/statistics`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.statistics;
  } catch (error) {
    console.error('Error fetching meeting statistics:', error);
    return null;
  }
};

// Save meeting to backend history
export const saveMeetingToHistory = async (meetingData, highlights = [], recordingSession = null, transcriptHistory = [], sentimentData = null) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/history/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meetingData,
        highlights,
        recordingSession,
        transcriptHistory,
        sentimentData
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error saving meeting to history:', error);
    return null;
  }
};

// Update meeting status
export const updateMeetingStatus = async (meetingId, status, endTime = null) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        endTime
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating meeting status:', error);
    return null;
  }
};

// Add participant to meeting
export const addParticipantToMeeting = async (meetingId, participantName) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        participantName
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error adding participant to meeting:', error);
    return null;
  }
};

// Get active meetings from backend
export const getActiveMeetings = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/active`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.activeMeetings || [];
  } catch (error) {
    console.error('Error fetching active meetings:', error);
    return [];
  }
};

// Delete meeting history
export const deleteMeetingHistory = async (meetingId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/history`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error deleting meeting history:', error);
    return false;
  }
};
