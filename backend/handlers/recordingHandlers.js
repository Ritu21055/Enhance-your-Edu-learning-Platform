// Recording-related socket event handlers
import mediaRecorder from '../src/utils/mediaRecorder.js';

/**
 * Register recording-related socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
export default function registerRecordingHandlers(socket, io) {
  // Real-Time Meeting Recording - Start Recording
  socket.on('start_recording', async (data) => {
    try {
      const { meetingId, options } = data;
      console.log('🎬 Starting recording for meeting:', meetingId);
      
      const sessionId = await mediaRecorder.startRecording(meetingId, options);
      
      // Notify all participants that recording has started
      // Exclude the host who started the recording
      socket.to(meetingId).emit('recording_started', {
        meetingId,
        sessionId,
        timestamp: Date.now(),
        message: 'Meeting is being recorded by the host'
      });
      
      console.log('✅ Recording started successfully:', sessionId);
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      socket.emit('recording_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // Real-Time Meeting Recording - Stop Recording
  socket.on('stop_recording', async (data) => {
    try {
      const { meetingId } = data;
      console.log('🛑 Stopping recording for meeting:', meetingId);
      
      const recordingPath = await mediaRecorder.stopRecording(meetingId);
      
      // Notify all participants that recording has stopped
      // Exclude the host who stopped the recording
      socket.to(meetingId).emit('recording_stopped', {
        meetingId,
        recordingPath,
        timestamp: Date.now(),
        message: 'Recording stopped by the host'
      });
      
      console.log('✅ Recording stopped successfully:', recordingPath);
      
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      socket.emit('recording_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // Real-Time Meeting Recording - Add Audio Chunk
  socket.on('audio_chunk', async (data) => {
    try {
      const { meetingId, audioChunk } = data;
      
      if (!meetingId) {
        console.error('❌ audio_chunk: Missing meetingId');
        return;
      }
      
      if (!audioChunk || audioChunk.length === 0) {
        console.warn('⚠️ Received empty audio chunk for meeting:', meetingId);
        return;
      }
      
      // Filter out very small chunks (MediaRecorder initialization chunks)
      const MIN_CHUNK_SIZE = 100;
      if (audioChunk.length < MIN_CHUNK_SIZE) {
        // Only log first few to avoid spam
        const session = mediaRecorder.getRecordingSession(meetingId);
        const chunkCount = session ? session.audioChunks.length : 0;
        if (chunkCount < 3) {
          console.warn('⚠️ Ignoring small audio chunk (likely initialization):', {
            meetingId,
            chunkSize: audioChunk.length,
            minSize: MIN_CHUNK_SIZE
          });
        }
        return;
      }
      
      const isRecording = mediaRecorder.isRecording(meetingId);
      
      // Debug first few chunks
      const session = mediaRecorder.getRecordingSession(meetingId);
      const chunkCount = session ? session.audioChunks.length : 0;
      if (chunkCount < 3 || chunkCount % 10 === 0) {
        console.log('🎤 Received audio chunk:', {
          meetingId,
          chunkSize: audioChunk.length,
          isRecording,
          existingChunks: chunkCount
        });
      }
      
      // Add to media recorder if recording is active
      if (isRecording) {
        // Convert array to Buffer properly
        const buffer = Buffer.isBuffer(audioChunk) ? audioChunk : Buffer.from(audioChunk);
        if (buffer.length === 0) {
          console.warn('⚠️ Received audio chunk but buffer is empty for meeting:', meetingId);
          return;
        }
        await mediaRecorder.addAudioChunk(meetingId, buffer);
      } else {
        console.warn('⚠️ Received audio chunk but recording is not active for meeting:', meetingId);
      }
      
    } catch (error) {
      console.error('❌ Failed to process audio chunk:', error);
    }
  });

  // Real-Time Meeting Recording - Add Video Frame
  socket.on('video_frame', async (data) => {
    try {
      const { meetingId, videoFrame } = data;
      
      if (!meetingId) {
        console.error('❌ video_frame: Missing meetingId');
        return;
      }
      
      if (!videoFrame || videoFrame.length === 0) {
        console.warn('⚠️ Received empty video frame for meeting:', meetingId);
        return;
      }
      
      // Filter out very small chunks (MediaRecorder initialization chunks)
      const MIN_CHUNK_SIZE = 100;
      if (videoFrame.length < MIN_CHUNK_SIZE) {
        // Only log first few to avoid spam
        const session = mediaRecorder.getRecordingSession(meetingId);
        const frameCount = session ? session.videoChunks.length : 0;
        if (frameCount < 3) {
          console.warn('⚠️ Ignoring small video frame (likely initialization):', {
            meetingId,
            frameSize: videoFrame.length,
            minSize: MIN_CHUNK_SIZE
          });
        }
        return;
      }
      
      const isRecording = mediaRecorder.isRecording(meetingId);
      
      // Debug first few frames
      const session = mediaRecorder.getRecordingSession(meetingId);
      const frameCount = session ? session.videoChunks.length : 0;
      if (frameCount < 3 || frameCount % 10 === 0) {
        console.log('📹 Received video frame:', {
          meetingId,
          frameSize: videoFrame.length,
          isRecording,
          existingFrames: frameCount
        });
      }
      
      // Add to media recorder if recording is active
      if (isRecording) {
        // Convert array to Buffer properly
        const buffer = Buffer.isBuffer(videoFrame) ? videoFrame : Buffer.from(videoFrame);
        if (buffer.length === 0) {
          console.warn('⚠️ Received video frame but buffer is empty for meeting:', meetingId);
          return;
        }
        await mediaRecorder.addVideoFrame(meetingId, buffer);
      } else {
        console.warn('⚠️ Received video frame but recording is not active for meeting:', meetingId);
      }
      
    } catch (error) {
      console.error('❌ Failed to process video frame:', error);
    }
  });

  // ZOOM-LIKE RECORDING: Receive individual participant stream chunks
  socket.on('participant_recording_chunk', async (data) => {
    try {
      const { meetingId, participantId, userName, audioChunk, videoChunk, timestamp, videoEnabled, audioEnabled } = data;
      
      if (!meetingId || !participantId) {
        console.error('❌ participant_recording_chunk: Missing meetingId or participantId');
        return;
      }
      
      if (!audioChunk || audioChunk.length === 0) {
        console.warn('⚠️ Received empty participant chunk for meeting:', meetingId, 'participant:', participantId);
        return;
      }
      
      // Filter out very small chunks (MediaRecorder initialization chunks)
      const MIN_CHUNK_SIZE = 100;
      if (audioChunk.length < MIN_CHUNK_SIZE) {
        const session = mediaRecorder.getRecordingSession(meetingId);
        const chunkCount = session?.participantChunks?.get(participantId)?.length || 0;
        if (chunkCount < 3) {
          console.warn('⚠️ Ignoring small participant chunk (likely initialization):', {
            meetingId,
            participantId,
            userName,
            chunkSize: audioChunk.length
          });
        }
        return;
      }
      
      const isRecording = mediaRecorder.isRecording(meetingId);
      
      if (!isRecording) {
        console.warn('⚠️ Received participant chunk but recording is not active for meeting:', meetingId);
        return;
      }
      
      // Convert array to Buffer
      const buffer = Buffer.isBuffer(audioChunk) ? audioChunk : Buffer.from(audioChunk);
      if (buffer.length === 0) {
        console.warn('⚠️ Received participant chunk but buffer is empty');
        return;
      }
      
      // Add participant chunk to media recorder (Zoom-like approach)
      await mediaRecorder.addParticipantChunk(meetingId, participantId, userName, buffer, {
        timestamp: timestamp || Date.now(),
        videoEnabled: videoEnabled !== false,
        audioEnabled: audioEnabled !== false
      });
      
      // Debug every 10 chunks
      const session = mediaRecorder.getRecordingSession(meetingId);
      const chunkCount = session?.participantChunks?.get(participantId)?.length || 0;
      if (chunkCount % 10 === 0) {
        console.log('🎬 Received participant chunk:', {
          meetingId,
          participantId,
          userName,
          chunkSize: buffer.length,
          chunkCount,
          videoEnabled,
          audioEnabled
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to process participant recording chunk:', error);
    }
  });
}

