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

  // Handle host camera/mic requests
  socket.on('host-request-camera-mic', (data) => {
    console.log(`📤 Host ${socket.id} requesting camera/mic access:`, data);
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found`);
      return;
    }
    
    // Check if the requester is the host
    if (meeting.hostId !== socket.id) {
      console.log(`❌ Only host can request camera/mic access. Requester: ${socket.id}, Host: ${meeting.hostId}`);
      return;
    }
    
    // Send request to all participants except host
    const participants = meeting.participants.filter(p => p.id !== meeting.hostId);
    console.log(`📤 Sending camera/mic request to ${participants.length} participants`);
    
    participants.forEach(participant => {
      socket.to(participant.id).emit('host-camera-mic-request', {
        ...data,
        requestId: data.timestamp,
        hostName: meeting.host
      });
    });
    
    // Set timeout to expire the request
    setTimeout(() => {
      participants.forEach(participant => {
        socket.to(participant.id).emit('camera-mic-request-expired', {
          requestId: data.timestamp
        });
      });
    }, 30000); // 30 seconds to respond
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

  // Handle participant approval of camera/mic request
  socket.on('camera-mic-request-approved', (data) => {
    console.log(`✅ Participant ${data.participantId} approved camera/mic request:`, data);
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found`);
      return;
    }
    
    // Notify host about approval
    socket.to(meeting.hostId).emit('participant-camera-mic-approved', {
      participantId: data.participantId,
      requestId: data.requestId,
      streamId: data.streamId
    });
    
    // Set timeout to automatically end the session
    setTimeout(() => {
      socket.to(meeting.hostId).emit('participant-camera-mic-session-ended', {
        participantId: data.participantId,
        requestId: data.requestId
      });
      
      socket.to(data.participantId).emit('camera-mic-session-ended', {
        requestId: data.requestId
      });
    }, data.duration * 1000); // Convert seconds to milliseconds
  });

  // Handle participant denial of camera/mic request
  socket.on('camera-mic-request-denied', (data) => {
    console.log(`❌ Participant ${data.participantId} denied camera/mic request:`, data);
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found`);
      return;
    }
    
    // Notify host about denial
    socket.to(meeting.hostId).emit('participant-camera-mic-denied', {
      participantId: data.participantId,
      requestId: data.requestId
    });
  });

  // Handle camera/mic session ended
  socket.on('camera-mic-session-ended', (data) => {
    console.log(`⏰ Camera/mic session ended for participant ${data.participantId}:`, data);
    
    const meeting = activeMeetings.get(data.meetingId);
    if (!meeting) {
      console.log(`❌ Meeting ${data.meetingId} not found`);
      return;
    }
    
    // Notify host that session ended
    socket.to(meeting.hostId).emit('participant-camera-mic-session-ended', {
      participantId: data.participantId,
      requestId: data.requestId
    });
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

