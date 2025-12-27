// meetingHistoryApi.js - API service for meeting history backend integration
import { getBackendUrl } from '../config/network';

// Get backend URL from network config
const getApiBaseUrl = () => {
  return getBackendUrl();
};

// Get all meeting histories from backend
// OPTIMIZATION: Support lightweight mode for faster loading
export const getAllMeetingHistories = async (options = {}) => {
  try {
    const { limit, lightweight = true } = options;
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (lightweight) params.append('lightweight', 'true');
    
    const API_BASE_URL = getApiBaseUrl();
    const url = `${API_BASE_URL}/api/meetings/history/all${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    
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
    const API_BASE_URL = getApiBaseUrl();
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

// Get meeting notes
export const getMeetingNotes = async (meetingId) => {
  try {
    const API_BASE_URL = getApiBaseUrl();
    const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/notes`);
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Notes not found
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.notes;
  } catch (error) {
    console.error('Error fetching meeting notes:', error);
    return null;
  }
};

// Get meeting statistics
export const getMeetingStatistics = async () => {
  try {
    const API_BASE_URL = getApiBaseUrl();
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
    const API_BASE_URL = getApiBaseUrl();
    console.log('💾 MeetingHistoryApi: Attempting to save meeting to backend:', meetingData.id);
    console.log('💾 MeetingHistoryApi: API URL:', `${API_BASE_URL}/api/meetings/history/save`);
    console.log('💾 MeetingHistoryApi: Meeting data:', {
      id: meetingData.id,
      title: meetingData.title,
      participants: meetingData.participants,
      status: meetingData.status
    });
    
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
    
    console.log('💾 MeetingHistoryApi: Response status:', response.status);
    console.log('💾 MeetingHistoryApi: Response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('💾 MeetingHistoryApi: Error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('💾 MeetingHistoryApi: Successfully saved meeting:', data);
    return data;
  } catch (error) {
    console.error('💾 MeetingHistoryApi: Error saving meeting to history:', error);
    console.error('💾 MeetingHistoryApi: Error details:', {
      message: error.message,
      stack: error.stack,
      meetingId: meetingData?.id
    });
    return null;
  }
};

// Update meeting status
export const updateMeetingStatus = async (meetingId, status, endTime = null) => {
  try {
    const API_BASE_URL = getApiBaseUrl();
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
    const API_BASE_URL = getApiBaseUrl();
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
    const API_BASE_URL = getApiBaseUrl();
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
    const API_BASE_URL = getApiBaseUrl();
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

// Delete all meeting histories
export const deleteAllMeetingHistories = async () => {
  try {
    const API_BASE_URL = getApiBaseUrl();
    const response = await fetch(`${API_BASE_URL}/api/meetings/history/all`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      // Try to get error message from response
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    return {
      success: data.success !== false, // Default to true if not specified
      deletedCount: data.deletedCount || 0,
      message: data.message || 'All meetings deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting all meeting histories:', error);
    return {
      success: false,
      deletedCount: 0,
      message: error.message || 'Failed to delete all meetings'
    };
  }
};
