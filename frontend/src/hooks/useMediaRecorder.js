import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for managing real-time meeting recording
 * Handles WebRTC stream recording and server communication
 */
const useMediaRecorder = (socket, meetingId, localStream) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('idle'); // idle, starting, recording, stopping, error
  const [recordingError, setRecordingError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // Handle recording status updates from server
  useEffect(() => {
    if (!socket) return;

    const handleRecordingStarted = (data) => {
      console.log('🎬 Recording started:', data);
      setIsRecording(true);
      setRecordingStatus('recording');
      setRecordingError(null);
    };

    const handleRecordingStopped = (data) => {
      console.log('🛑 Recording stopped:', data);
      setIsRecording(false);
      setRecordingStatus('idle');
    };

    const handleRecordingError = (data) => {
      console.error('❌ Recording error:', data);
      setRecordingError(data.error);
      setRecordingStatus('error');
      setIsRecording(false);
    };

    socket.on('recording_started', handleRecordingStarted);
    socket.on('recording_stopped', handleRecordingStopped);
    socket.on('recording_error', handleRecordingError);

    return () => {
      socket.off('recording_started', handleRecordingStarted);
      socket.off('recording_stopped', handleRecordingStopped);
      socket.off('recording_error', handleRecordingError);
    };
  }, [socket]);

  /**
   * Start recording the meeting
   */
  const startRecording = useCallback(async () => {
    console.log('🎬 startRecording called with:', { socket: !!socket, meetingId, localStream: !!localStream });
    
    if (!socket || !meetingId || !localStream) {
      console.warn('useMediaRecorder: Missing required parameters for recording', {
        socket: !!socket,
        meetingId,
        localStream: !!localStream
      });
      return;
    }

    try {
      setRecordingStatus('starting');
      setRecordingError(null);
      console.log('🎬 Starting recording process...');

      // Notify server to start recording
      socket.emit('start_recording', {
        meetingId,
        options: {
          video: true,
          audio: true,
          quality: 'high'
        }
      });

      // Start local media recording for backup
      if (localStream) {
        console.log('🎬 Creating MediaRecorder with stream:', localStream);
        
        // Check MediaRecorder support
        if (!window.MediaRecorder) {
          throw new Error('MediaRecorder API not supported in this browser');
        }
        
        const mediaRecorder = new MediaRecorder(localStream, {
          mimeType: 'video/webm;codecs=vp9,opus'
        });
        
        console.log('🎬 MediaRecorder created successfully');

        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
            
            // Send audio chunks to server for real-time processing
            const reader = new FileReader();
            reader.onload = () => {
              const arrayBuffer = reader.result;
              socket.emit('audio_chunk', {
                meetingId,
                audioChunk: Array.from(new Uint8Array(arrayBuffer))
              });
            };
            reader.readAsArrayBuffer(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          console.log('🎬 Local recording stopped');
        };

        console.log('🎬 Starting MediaRecorder...');
        mediaRecorder.start(1000); // Record in 1-second chunks
        console.log('🎬 MediaRecorder started successfully');
      }

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      setRecordingError(error.message);
      setRecordingStatus('error');
    }
  }, [socket, meetingId, localStream]);

  /**
   * Stop recording the meeting
   */
  const stopRecording = useCallback(async () => {
    if (!socket || !meetingId) {
      console.warn('useMediaRecorder: Missing required parameters for stopping recording');
      return;
    }

    try {
      setRecordingStatus('stopping');

      // Stop local media recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }

      // Notify server to stop recording
      socket.emit('stop_recording', { meetingId });

    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      setRecordingError(error.message);
      setRecordingStatus('error');
    }
  }, [socket, meetingId]);

  /**
   * Toggle recording state
   */
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  /**
   * Get recording status information
   */
  const getRecordingInfo = useCallback(() => {
    return {
      isRecording,
      status: recordingStatus,
      error: recordingError,
      canStart: !isRecording && recordingStatus === 'idle',
      canStop: isRecording && recordingStatus === 'recording'
    };
  }, [isRecording, recordingStatus, recordingError]);

  return {
    isRecording,
    recordingStatus,
    recordingError,
    startRecording,
    stopRecording,
    toggleRecording,
    getRecordingInfo
  };
};

export default useMediaRecorder;
