// Media-related socket event handlers (WebRTC, screen share, camera/mic)
import { activeMeetings } from '../config/stores.js';
import mediaRecorder from '../src/utils/mediaRecorder.js';

/**
 * Register media-related socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
export default function registerMediaHandlers(socket, io) {
  // Handle WebRTC signaling
  socket.on('offer', ({ to, offer }) => {
    console.log(`📤 Offer from ${socket.id} to ${to}`);
    console.log(`📊 Offer SDP length: ${offer?.sdp?.length || 'unknown'}`);
    socket.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    console.log(`📤 Answer from ${socket.id} to ${to}`);
    console.log(`📊 Answer SDP length: ${answer?.sdp?.length || 'unknown'}`);
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    console.log(`🧊 ICE candidate from ${socket.id} to ${to}`);
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // Handle SimplePeer signaling
  socket.on('signal', ({ to, from, signal }) => {
    console.log(`📡 SimplePeer signal from ${from} to ${to}:`, {
      signalType: signal.type,
      hasSDP: !!signal.sdp,
      hasCandidate: !!signal.candidate
    });
    socket.to(to).emit('signal', { from, signal });
  });

  // Handle force connection requests
  socket.on('force-connection', ({ targetId, fromId, meetingId }) => {
    console.log(`🔗 FORCE: Force connection request from ${fromId} to ${targetId} in meeting ${meetingId}`);
    
    // Forward the force connection request to the target
    socket.to(targetId).emit('force-connection', {
      targetId,
      fromId,
      meetingId
    });
    
    console.log(`🔗 FORCE: Forwarded force connection request to ${targetId}`);
  });

  // Handle host camera/mic requests (individual or bulk)
  socket.on('host-request-camera-mic', (data) => {
    const { meetingId, participantId, requestType, duration, customMessage } = data;
    const meeting = activeMeetings.get(meetingId);
    
    console.log(`📸 Camera/Mic Request: Host ${socket.id} requesting from participant ${participantId} in meeting ${meetingId}`);
    
    if (!meeting) {
      console.log(`❌ Meeting ${meetingId} not found`);
      return;
    }
    
    // Validate host
    if (meeting.hostId !== socket.id) {
      console.log(`❌ Only host can request camera/mic access. Host ID: ${meeting.hostId}, Socket ID: ${socket.id}`);
      return;
    }
    
    // Validate participant exists
    // participant.id IS the socket ID (set in meetingHandlers.js line 501)
    const participant = meeting.participants.find(p => p.id === participantId);
    if (!participant) {
      console.log(`❌ Participant ${participantId} not found in meeting. Available participants:`, meeting.participants.map(p => ({ id: p.id, name: p.name })));
      return;
    }
    
    // participant.id is the socket ID
    const targetSocketId = participant.id;
    console.log(`📸 Sending request to participant ${participant.name} (Socket ID: ${targetSocketId}, participantId: ${participantId})`);
    console.log(`📸 All participants in meeting:`, meeting.participants.map(p => ({ id: p.id, name: p.name, socketId: p.id })));
    
    // Validate duration (max 10 minutes = 600 seconds)
    const validDuration = Math.min(Math.max(duration, 10), 600);
    
    // Send request to participant - use io.to() to ensure message reaches the socket
    const requestId = `req_${Date.now()}_${socket.id}_${participantId}`;
    const requestData = {
      requestId,
      meetingId,
      hostName: meeting.host,
      requestType, // 'camera', 'audio', 'both'
      duration: validDuration, // in seconds (max 600)
      customMessage, // Optional custom message
      timestamp: Date.now()
    };
    
    console.log(`📸 Emitting camera-mic-request to socket ID: ${targetSocketId}`);
    console.log(`📸 Request data:`, JSON.stringify(requestData, null, 2));
    
    // Check if socket exists in the server's socket list
    const socketExists = io.sockets.sockets.has(targetSocketId);
    console.log(`📸 Socket ${targetSocketId} exists in server: ${socketExists}`);
    
    if (!socketExists) {
      console.error(`❌ ERROR: Socket ${targetSocketId} not found in server's socket list!`);
      console.log(`📸 Available socket IDs:`, Array.from(io.sockets.sockets.keys()));
    }
    
    // Primary: emit directly to socket ID using io.to()
    io.to(targetSocketId).emit('camera-mic-request', requestData);
    console.log(`📸 ✅ camera-mic-request event emitted to ${targetSocketId}`);
    
    // Also emit to meeting room as backup (participant will filter by checking if request is for them)
    // Include targetSocketId in the data so participant can verify
    io.to(meetingId).emit('camera-mic-request', {
      ...requestData,
      targetSocketId // Include target socket ID so participant can verify it's for them
    });
    console.log(`📸 ✅ camera-mic-request event also emitted to meeting room ${meetingId} as backup (with targetSocketId filter)`);
    
    // Set timeout to expire request if no response (30 seconds)
    setTimeout(() => {
      console.log(`📸 Request ${requestId} expired (30s timeout)`);
      io.to(targetSocketId).emit('camera-mic-request-expired', { requestId });
    }, 30000);
  });

  // Handle participant response
  socket.on('camera-mic-request-response', (data) => {
    const { requestId, participantId, approved, meetingId } = data;
    const meeting = activeMeetings.get(meetingId);
    
    console.log(`📸 Camera/Mic Response: Socket ${socket.id} responding to request ${requestId} with ${approved ? 'approved' : 'denied'}`);
    
    if (!meeting) {
      console.log(`❌ Meeting ${meetingId} not found for response`);
      return;
    }
    
    // The responder should be the participant (not the host)
    // Find the participant who is responding (by socket.id)
    const respondingParticipant = meeting.participants.find(p => p.id === socket.id);
    
    if (!respondingParticipant) {
      console.log(`❌ Responder ${socket.id} not found in meeting participants`);
      return;
    }
    
    // Notify host - use io.to() to ensure message reaches host
    const hostSocketId = meeting.hostId;
    console.log(`📸 Notifying host ${hostSocketId} about participant ${respondingParticipant.name} response`);
    io.to(hostSocketId).emit('camera-mic-request-result', {
      requestId,
      participantId: respondingParticipant.id,
      participantName: respondingParticipant.name || 'Participant',
      approved
    });
  });

  // Handle extension request
  socket.on('request-extension', (data) => {
    const { requestId, participantId, meetingId } = data;
    const meeting = activeMeetings.get(meetingId);
    
    console.log(`📸 Extension Request: Participant ${participantId} requesting extension for ${requestId}`);
    
    if (!meeting) {
      console.log(`❌ Meeting ${meetingId} not found for extension request`);
      return;
    }
    
    const participant = meeting.participants.find(p => p.id === participantId || p.socketId === participantId);
    
    // Notify host about extension request - use io.to() to ensure message reaches host
    const hostSocketId = meeting.hostId;
    console.log(`📸 Notifying host ${hostSocketId} about extension request`);
    io.to(hostSocketId).emit('extension-requested', {
      requestId,
      participantId: participant?.id || participantId,
      participantName: participant?.name || 'Participant'
    });
  });

  // Handle media state changes (camera/audio toggle) with intelligent recording
  socket.on('media-state-change', (data) => {
    console.log(`📡 Media state change from ${data.participantId}:`, {
      audioEnabled: data.audioEnabled,
      videoEnabled: data.videoEnabled
    });
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found for media state change`);
      return;
    }
    
    // Update participant's media state in meeting data
    const participant = meeting.participants.find(p => p.id === data.participantId);
    if (participant) {
      participant.audioEnabled = data.audioEnabled;
      participant.videoEnabled = data.videoEnabled;
      console.log(`✅ Updated media state for participant ${participant.name}:`, {
        audioEnabled: data.audioEnabled,
        videoEnabled: data.videoEnabled
      });
    }
    
    // CRITICAL: Broadcast media state change to all other participants in the meeting
    // This allows the host and other participants to know when someone turns off their camera
    meeting.participants.forEach(p => {
      if (p.id !== data.participantId && p.socketId) {
        io.to(p.socketId).emit('media-state-change', {
          participantId: data.participantId,
          audioEnabled: data.audioEnabled,
          videoEnabled: data.videoEnabled,
          meetingId: data.meetingId,
          timestamp: data.timestamp || Date.now()
        });
        console.log(`📡 Broadcasted media state change to ${p.name} (${p.socketId}):`, {
          participantId: data.participantId,
          videoEnabled: data.videoEnabled,
          audioEnabled: data.audioEnabled
        });
      }
    });
    
    // Update intelligent recording with media state
    const mediaState = {
      videoEnabled: data.videoEnabled,
      audioEnabled: data.audioEnabled,
      hasVideo: data.hasVideo || false,
      hasAudio: data.hasAudio || false
    };
    
    mediaRecorder.updateParticipantMediaState(data.meetingId, data.participantId, mediaState);
    
    // Get intelligent recording configuration
    const recordingConfig = mediaRecorder.getIntelligentRecordingConfig(data.meetingId);
    if (recordingConfig) {
      console.log(`🎬 Recording strategy updated for meeting ${data.meetingId}:`, recordingConfig.strategy);
      
      // Emit recording strategy update to host
      io.to(meeting.hostId).emit('recording_strategy_updated', {
        meetingId: data.meetingId,
        strategy: recordingConfig.strategy,
        hasVideo: recordingConfig.hasVideo,
        hasAudio: recordingConfig.hasAudio,
        videoStreamCount: recordingConfig.videoStreamCount,
        audioStreamCount: recordingConfig.audioStreamCount
      });
    }
    
    // Broadcast media state change to all participants (including the host)
    console.log(`📡 Broadcasting media state change to meeting ${data.meetingId}:`, {
      participantId: data.participantId,
      audioEnabled: data.audioEnabled,
      videoEnabled: data.videoEnabled
    });
    
    io.to(data.meetingId).emit('participant-media-state-changed', {
      participantId: data.participantId,
      audioEnabled: data.audioEnabled,
      videoEnabled: data.videoEnabled,
      timestamp: data.timestamp
    });
    
    console.log(`📡 Media state change broadcasted to meeting ${data.meetingId}`);
  });


  // Handle screen sharing changes (start/stop with stream info)
  socket.on('screen-share-change', ({ meetingId, participantId, isSharing, streamId }) => {
    socket.to(meetingId).emit('screen-share-change', { 
      participantId, 
      isSharing, 
      streamId 
    });
  });

  // Screen Share Events
  socket.on('screen-share-start', ({ meetingId, participant }) => {
    console.log(`🖥️ Screen share started by ${participant.name} in meeting ${meetingId}`);
    console.log(`🖥️ Backend: Forwarding screen-share-start to participants`);
    console.log(`🖥️ Backend: Socket ID: ${socket.id}`);
    console.log(`🖥️ Backend: Participant data:`, participant);
    
    // Find the meeting
    const meeting = activeMeetings.get(meetingId);
    if (meeting) {
      console.log(`🖥️ Backend: Found meeting with ${meeting.participants.length} participants`);
      console.log(`🖥️ Backend: Meeting participants:`, meeting.participants.map(p => ({ id: p.id, name: p.name })));
      
      // Notify all participants in the meeting
      meeting.participants.forEach(p => {
        if (p.id !== socket.id) {
          console.log(`🖥️ Backend: Sending screen-share-start to participant ${p.id} (${p.name})`);
          
          io.to(p.id).emit('screen-share-start', {
            participant: participant,
            meetingId: meetingId
          });
          
          console.log(`🖥️ Backend: screen-share-start event sent to ${p.id}`);
        }
      });
    } else {
      console.log(`🖥️ Backend: Meeting ${meetingId} not found!`);
    }
  });

  socket.on('screen-share-stop', ({ meetingId, participantId }) => {
    console.log(`🖥️ Screen share stopped by ${participantId} in meeting ${meetingId}`);
    
    // Find the meeting
    const meeting = activeMeetings.get(meetingId);
    if (meeting) {
      // Notify all participants in the meeting
      meeting.participants.forEach(p => {
        if (p.id !== socket.id) {
          io.to(p.id).emit('screen-share-stop', {
            participantId: participantId,
            meetingId: meetingId
          });
        }
      });
    }
  });

  socket.on('screen-share-signal', ({ to, signal, from }) => {
    console.log(`🖥️ Screen share signal from ${from} to ${to}`);
    
    // Forward the signal to the target participant
    io.to(to).emit('screen-share-signal', {
      signal: signal,
      from: from
    });
  });

  socket.on('screen-share-request', ({ from, meetingId }) => {
    console.log(`🖥️ Screen share request from ${from} in meeting ${meetingId}`);
    console.log(`🖥️ Backend: Forwarding screen-share-request to participants`);
    console.log(`🖥️ Backend: Socket ID: ${socket.id}`);
    console.log(`🖥️ Backend: From parameter: ${from}`);
    
    // Find the meeting and broadcast to all participants except the sender
    const meeting = activeMeetings.get(meetingId);
    if (meeting) {
      console.log(`🖥️ Backend: Found meeting with ${meeting.participants.length} participants`);
      console.log(`🖥️ Backend: Meeting participants:`, meeting.participants.map(p => ({ id: p.id, name: p.name })));
      
      meeting.participants.forEach(p => {
        if (p.id !== socket.id) {
          console.log(`🖥️ Backend: Sending screen-share-request to participant ${p.id} (${p.name})`);
          
          io.to(p.id).emit('screen-share-request', {
            from: socket.id,
            meetingId: meetingId
          });
          
          console.log(`🖥️ Backend: screen-share-request event sent to ${p.id}`);
        }
      });
    } else {
      console.log(`🖥️ Backend: Meeting ${meetingId} not found for screen-share-request!`);
    }
  });
}

