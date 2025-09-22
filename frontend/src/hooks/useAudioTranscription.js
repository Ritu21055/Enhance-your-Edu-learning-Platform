import { useState, useRef, useCallback, useEffect } from 'react';

const useAudioTranscription = (socket, meetingId) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  // Start recording audio
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setIsTranscribing(true);
      
      // Get user media with audio only
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Lower sample rate for transcription
          channelCount: 1
        } 
      });
      
      streamRef.current = stream;
      
      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      // Handle data available event
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          // Send audio chunk to backend
          if (socket && meetingId) {
            const reader = new FileReader();
            reader.onload = () => {
              const audioData = reader.result;
              socket.emit('audio_data', {
                meetingId,
                audioChunk: audioData,
                timestamp: Date.now(),
                chunkIndex: audioChunksRef.current.length - 1
              });
            };
            reader.readAsArrayBuffer(event.data);
          }
        }
      };
      
      // Handle recording stop
      mediaRecorder.onstop = () => {
        console.log('🎤 Audio recording stopped');
        setIsTranscribing(false);
      };
      
      // Start recording with small time slices for real-time processing
      mediaRecorder.start(1000); // 1 second chunks
      setIsRecording(true);
      
      console.log('🎤 Audio transcription started');
      
    } catch (err) {
      console.error('❌ Failed to start audio transcription:', err);
      setError('Failed to start audio recording. Please check microphone permissions.');
      setIsTranscribing(false);
    }
  }, [socket, meetingId]);

  // Stop recording audio
  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        console.log('🎤 Audio transcription stopped');
      }
      
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // Clear interval if running
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
    } catch (err) {
      console.error('❌ Failed to stop audio transcription:', err);
      setError('Failed to stop audio recording.');
    }
  }, []);

  // Listen for transcription results from backend
  useEffect(() => {
    if (!socket) return;

    const handleTranscriptionResult = (data) => {
      console.log('📝 Received transcription result:', data);
      if (data.meetingId === meetingId) {
        setTranscript(prev => {
          const newTranscript = prev + (prev ? ' ' : '') + data.transcript;
          return newTranscript;
        });
      }
    };

    const handleTranscriptionError = (data) => {
      console.error('❌ Transcription error:', data);
      if (data.meetingId === meetingId) {
        setError(data.error || 'Transcription failed');
      }
    };

    socket.on('transcription_result', handleTranscriptionResult);
    socket.on('transcription_error', handleTranscriptionError);

    return () => {
      socket.off('transcription_result', handleTranscriptionResult);
      socket.off('transcription_error', handleTranscriptionError);
    };
  }, [socket, meetingId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    transcript,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
    clearTranscript: () => setTranscript('')
  };
};

export default useAudioTranscription;
