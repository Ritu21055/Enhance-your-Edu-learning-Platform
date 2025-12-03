// Disconnect-related socket event handlers
import { activeMeetings, sentimentData, fatigueData, highlightData, recordingSessions, transcriptData } from '../config/stores.js';
import llmService from '../src/utils/llmService.js';

/**
 * Register disconnect-related socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
export default function registerDisconnectHandler(socket, io) {
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove participant from all meetings
    activeMeetings.forEach((meeting, meetingId) => {
      const participantIndex = meeting.participants.findIndex(p => p.id === socket.id);
      if (participantIndex !== -1) {
        const participant = meeting.participants[participantIndex];
        meeting.participants.splice(participantIndex, 1);
        
        // Remove participant from sentiment data
        if (sentimentData.has(meetingId)) {
          const meetingSentimentData = sentimentData.get(meetingId);
          
          // Find and remove participant by socket.id or by name
          let participantToRemove = null;
          meetingSentimentData.participants.forEach((data, key) => {
            if (key === socket.id || data.participantId === participant.name) {
              participantToRemove = key;
            }
          });
          
          if (participantToRemove) {
            meetingSentimentData.participants.delete(participantToRemove);
            console.log('🧹 Removed participant from sentiment data:', participantToRemove);
          }
          
          // If no participants left, clean up sentiment data
          if (meetingSentimentData.participants.size === 0) {
            sentimentData.delete(meetingId);
            console.log('🧹 Cleaned up sentiment data for meeting:', meetingId);
          }
        }
        
        // Clean up fatigue data if no participants left
        if (meeting.participants.length === 0) {
          if (fatigueData.has(meetingId)) {
            fatigueData.delete(meetingId);
            console.log('🧹 Cleaned up fatigue data for meeting:', meetingId);
          }
        }
        
        // If host disconnected and there are other participants, transfer host role
        if (participant.isHost && meeting.participants.length > 0) {
          const newHost = meeting.participants[0];
          newHost.isHost = true;
          meeting.host = newHost.name;
          meeting.hostId = newHost.id;
          
          // Notify all participants about host change
          io.to(meetingId).emit('host-changed', {
            newHost: newHost.name,
            newHostId: newHost.id
          });
          
          console.log(`Host transferred from ${participant.name} to ${newHost.name} in meeting ${meetingId} (disconnect)`);
        }
        
        socket.to(meetingId).emit('participant-left', { 
          participantId: socket.id, 
          userName: participant.name 
        });
        
        if (meeting.participants.length === 0) {
          // Clear host information when meeting is empty
          meeting.host = null;
          meeting.hostId = null;
          console.log(`Meeting ${meetingId} is now empty - cleared host information`);
          
          // Clean up LLM service data for this meeting
          llmService.cleanupMeeting(meetingId);
          
          // Clean up highlight and recording data for this meeting
          if (highlightData.has(meetingId)) {
            highlightData.delete(meetingId);
            console.log('🧹 Cleaned up highlight data for meeting:', meetingId);
          }
          
          if (recordingSessions.has(meetingId)) {
            recordingSessions.delete(meetingId);
            console.log('🧹 Cleaned up recording session for meeting:', meetingId);
          }
          
          if (transcriptData.has(meetingId)) {
            transcriptData.delete(meetingId);
            console.log('🧹 Cleaned up transcript data for meeting:', meetingId);
          }
          
          // Keep meeting alive for 5 minutes to allow participants to join
          console.log(`Meeting ${meetingId} will be deleted in 5 minutes - no participants`);
          setTimeout(() => {
            const currentMeeting = activeMeetings.get(meetingId);
            if (currentMeeting && currentMeeting.participants.length === 0) {
              activeMeetings.delete(meetingId);
              console.log(`Meeting ${meetingId} ended after 5 minutes - no participants`);
            }
          }, 300000); // 5 minutes
        }
      }
    });
  });
}

