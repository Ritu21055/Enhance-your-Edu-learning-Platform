// Recording-related socket event handlers
import { recordingSessions } from '../config/stores.js';
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
      
      // Add to media recorder if recording is active
      if (mediaRecorder.isRecording(meetingId)) {
        await mediaRecorder.addAudioChunk(meetingId, Buffer.from(audioChunk));
      }
      
    } catch (error) {
      console.error('❌ Failed to process audio chunk:', error);
    }
  });

  // Real-Time Meeting Recording - Add Video Frame
  socket.on('video_frame', async (data) => {
    try {
      const { meetingId, videoFrame } = data;
      
      // Add to media recorder if recording is active
      if (mediaRecorder.isRecording(meetingId)) {
        await mediaRecorder.addVideoFrame(meetingId, Buffer.from(videoFrame));
      }
      
    } catch (error) {
      console.error('❌ Failed to process video frame:', error);
    }
  });

  // AI-Generated Meeting Highlights - Start Recording Event (legacy)
  socket.on('start_recording', (data) => {
    try {
      const { meetingId } = data;
      console.log('🎥 Starting recording for meeting:', meetingId);
      
      // Initialize recording session
      const recordingSession = {
        meetingId,
        startTime: Date.now(),
        isRecording: true,
        filePath: null
      };
      
      recordingSessions.set(meetingId, recordingSession);
      
      // Emit recording started event
      io.to(meetingId).emit('recording_started', {
        meetingId,
        startTime: recordingSession.startTime
      });
      
      console.log('🎥 Recording session started for meeting:', meetingId);
      
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      socket.emit('recording_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });

  // AI-Generated Meeting Highlights - Stop Recording Event (legacy)
  socket.on('stop_recording', (data) => {
    try {
      const { meetingId } = data;
      console.log('🛑 Stopping recording for meeting:', meetingId);
      
      const recordingSession = recordingSessions.get(meetingId);
      if (recordingSession) {
        recordingSession.isRecording = false;
        recordingSession.endTime = Date.now();
        
        // Emit recording stopped event
        io.to(meetingId).emit('recording_stopped', {
          meetingId,
          endTime: recordingSession.endTime,
          duration: recordingSession.endTime - recordingSession.startTime
        });
        
        console.log('🛑 Recording session stopped for meeting:', meetingId);
      }
      
    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      socket.emit('recording_error', {
        meetingId: data.meetingId,
        error: error.message
      });
    }
  });
}

