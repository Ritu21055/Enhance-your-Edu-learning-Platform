import { activeMeetings } from '../config/stores.js';

// Store active media requests (shared across all connections)
// Structure: meetingId -> Map(participantId -> requestData)
const activeMediaRequests = new Map();

/**
 * Register media request socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
export default function registerMediaRequestHandlers(socket, io) {

  // Host sends media request to participant
  socket.on('media-request', ({ meetingId, participantId, requestType, duration }) => {
    const meeting = activeMeetings.get(meetingId);
    
    if (!meeting) {
      console.error(`❌ Meeting ${meetingId} not found`);
      return;
    }

    // Verify requester is host
    if (meeting.hostId !== socket.id) {
      console.error(`❌ Only host can send media requests. Requester: ${socket.id}, Host: ${meeting.hostId}`);
      return;
    }

    // Validate duration (max 10 minutes = 600000 ms)
    const durationMs = Math.min(duration, 600000);
    
    const requestData = {
      meetingId,
      participantId,
      requestType, // 'both' (camera and mic)
      duration: durationMs,
      requestedAt: Date.now(),
      expiresAt: Date.now() + durationMs,
      hostId: socket.id,
      hostName: meeting.participants.find(p => p.id === socket.id)?.name || 'Host'
    };

    // Store request
    if (!activeMediaRequests.has(meetingId)) {
      activeMediaRequests.set(meetingId, new Map());
    }
    activeMediaRequests.get(meetingId).set(participantId, requestData);

    // Verify participant is in the meeting BEFORE sending
    const participant = meeting.participants.find(p => p.id === participantId);
    if (!participant) {
      console.error(`❌ Participant ${participantId} not found in meeting ${meetingId}`);
      console.error(`❌ Available participants:`, meeting.participants.map(p => ({ id: p.id, name: p.name })));
      return;
    }
    
    console.log(`✅ Participant ${participantId} (${participant.name}) found in meeting`);
    
    // Check if participant socket is connected
    const participantSocket = io.sockets.sockets.get(participantId);
    if (!participantSocket) {
      console.error(`❌ Participant socket ${participantId} not found in connected sockets`);
      console.error(`❌ Socket might be disconnected or ID mismatch`);
      return;
    }
    
    console.log(`✅ Participant socket ${participantId} is connected`);
    
    // Send request to participant
    console.log(`📹 Sending media request to participant ${participantId}:`, {
      meetingId,
      participantId,
      participantName: participant.name,
      requestType,
      durationMs,
      hostId: socket.id,
      hostName: requestData.hostName,
      participantSocketConnected: participantSocket.connected,
      participantSocketRooms: Array.from(participantSocket.rooms)
    });
    
    // Send using both methods to ensure delivery
    participantSocket.emit('media-request-received', requestData);
    io.to(participantId).emit('media-request-received', requestData);
    
    console.log(`📹 Media request sent: ${requestType} for ${durationMs/1000}s to participant ${participantId} (${participant.name})`);

    // Auto-expire after duration
    setTimeout(() => {
      const storedRequest = activeMediaRequests.get(meetingId)?.get(participantId);
      if (storedRequest && storedRequest.expiresAt <= Date.now()) {
        // Notify participant to turn off media
        io.to(participantId).emit('media-request-expired', {
          meetingId,
          participantId,
          requestType
        });
        
        // Notify host
        io.to(socket.id).emit('media-request-expired', {
          meetingId,
          participantId,
          requestType
        });

        // Clean up
        activeMediaRequests.get(meetingId)?.delete(participantId);
        console.log(`⏰ Media request expired for participant ${participantId}`);
      }
    }, durationMs);
  });

  // Participant responds to media request
  socket.on('media-request-response', ({ meetingId, requestId, accepted }) => {
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) return;

    const request = activeMediaRequests.get(meetingId)?.get(socket.id);
    if (!request) {
      console.error(`❌ Media request not found for participant ${socket.id}`);
      return;
    }

    // Notify host of response
    io.to(request.hostId).emit('media-request-response', {
      meetingId,
      participantId: socket.id,
      participantName: meeting.participants.find(p => p.id === socket.id)?.name || 'Participant',
      requestType: request.requestType,
      accepted
    });

    if (accepted) {
      console.log(`✅ Participant ${socket.id} accepted media request`);
    } else {
      console.log(`❌ Participant ${socket.id} denied media request`);
      // Clean up denied request
      activeMediaRequests.get(meetingId)?.delete(socket.id);
    }
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    // Remove all requests for this socket
    activeMediaRequests.forEach((participantMap, meetingId) => {
      participantMap.forEach((request, participantId) => {
        if (request.hostId === socket.id || participantId === socket.id) {
          participantMap.delete(participantId);
        }
      });
    });
  });
}

