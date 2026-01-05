import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Chip,
  Alert
} from '@mui/material';
import {
  Mic,
  MicOff,
  Close
} from '@mui/icons-material';

/**
 * Temporary Transcription Debug Component
 * Shows real-time transcription to verify it's working
 */
const TranscriptionDebug = ({ 
  socket, 
  meetingId, 
  participantId,
  participantName 
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [transcriptCount, setTranscriptCount] = useState(0);
  const shouldAutoRestartRef = useRef(false);
  const recognitionRef = useRef(null);

  // Check Web Speech API support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    
    if (!SpeechRecognition) {
      setError('Web Speech API not supported. Use Chrome, Edge, or Safari.');
    }
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US,hi-IN';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('🎤 DEBUG: Transcription started');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const conf = event.results[i][0].confidence;
        
        if (event.results[i].isFinal) {
          final += transcript;
          setConfidence(conf);
          setTranscriptCount(prev => prev + 1);
        } else {
          interim += transcript;
        }
      }

      if (final) {
        setTranscript(prev => prev + ' ' + final);
        
        // Send to server
        if (socket && meetingId && participantId) {
          const currentConf = confidence || 0.8; // Use current confidence or default
          socket.emit('transcript_update', {
            meetingId,
            participantId,
            participantName: participantName || 'Unknown',
            transcript: final,
            timestamp: Date.now(),
            language: 'en-US,hi-IN',
            confidence: currentConf
          });
          console.log('📤 DEBUG: Sent transcript to server:', final, 'confidence:', currentConf);
        }
      }
      
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      console.error('🎤 DEBUG: Speech recognition error:', event.error);
      setError(`Error: ${event.error}`);
      
      if (event.error === 'network') {
        shouldAutoRestartRef.current = false;
        setIsListening(false);
      } else if (event.error === 'no-speech') {
        // Normal, will retry
      } else if (event.error === 'aborted') {
        shouldAutoRestartRef.current = false;
      } else if (event.error === 'audio-capture') {
        setError('Microphone not available');
        shouldAutoRestartRef.current = false;
        setIsListening(false);
      } else if (event.error === 'not-allowed') {
        setError('Microphone permission denied');
        shouldAutoRestartRef.current = false;
        setIsListening(false);
      }
      
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (shouldAutoRestartRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.log('DEBUG: Auto-restart failed:', e);
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;

    // Auto-start
    const autoStartTimer = setTimeout(() => {
      if (recognition && socket && meetingId && participantId) {
        try {
          console.log('🎤 DEBUG: Auto-starting transcription...');
          shouldAutoRestartRef.current = true;
          recognition.start();
        } catch (error) {
          console.log('⚠️ DEBUG: Auto-start failed:', error.message);
        }
      }
    }, 1000);

    return () => {
      clearTimeout(autoStartTimer);
      shouldAutoRestartRef.current = false;
      if (recognition) {
        recognition.stop();
      }
    };
  }, [isSupported, socket, meetingId, participantId, participantName]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    
    if (isListening) {
      shouldAutoRestartRef.current = false;
      recognitionRef.current.stop();
    } else {
      shouldAutoRestartRef.current = true;
      recognitionRef.current.start();
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
    setTranscriptCount(0);
  };

  if (!isOpen) {
    return (
      <Paper
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 9999,
          p: 1,
          cursor: 'pointer',
          backgroundColor: '#7c3aed',
          color: 'white'
        }}
        onClick={() => setIsOpen(true)}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Mic />
          <Typography variant="caption">Show Transcription</Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        width: 400,
        maxHeight: 500,
        p: 2,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6" sx={{ color: 'white', fontSize: '1rem' }}>
          🎤 Transcription Debug
        </Typography>
        <Box display="flex" gap={1}>
          <IconButton
            size="small"
            onClick={toggleListening}
            sx={{ color: isListening ? '#4caf50' : 'white' }}
          >
            {isListening ? <Mic /> : <MicOff />}
          </IconButton>
          <IconButton
            size="small"
            onClick={clearTranscript}
            sx={{ color: 'white' }}
          >
            Clear
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setIsOpen(false)}
            sx={{ color: 'white' }}
          >
            <Close />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>
          {error}
        </Alert>
      )}

      {!isSupported && (
        <Alert severity="warning" sx={{ mb: 2, fontSize: '0.8rem' }}>
          Web Speech API not supported
        </Alert>
      )}

      <Box mb={2} display="flex" gap={1} flexWrap="wrap">
        <Chip
          label={isListening ? 'Listening' : 'Not Listening'}
          color={isListening ? 'success' : 'default'}
          size="small"
        />
        <Chip
          label={`${transcriptCount} phrases`}
          color="info"
          size="small"
        />
        {confidence > 0 && (
          <Chip
            label={`${Math.round(confidence * 100)}% confidence`}
            color="secondary"
            size="small"
          />
        )}
      </Box>

      <Box
        sx={{
          minHeight: 150,
          maxHeight: 300,
          overflowY: 'auto',
          p: 1.5,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: 1,
          mb: 1
        }}
      >
        {transcript && (
          <Typography
            variant="body2"
            sx={{
              mb: 1,
              lineHeight: 1.6,
              color: 'white',
              fontSize: '0.9rem'
            }}
          >
            {transcript}
          </Typography>
        )}
        
        {interimTranscript && (
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontStyle: 'italic',
              fontSize: '0.9rem'
            }}
          >
            {interimTranscript}
          </Typography>
        )}
        
        {!transcript && !interimTranscript && (
          <Typography
            variant="body2"
            sx={{
              textAlign: 'center',
              fontStyle: 'italic',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '0.8rem'
            }}
          >
            {isListening ? 'Listening... Speak now!' : 'Click mic to start'}
          </Typography>
        )}
      </Box>

      <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.7rem' }}>
        Participant: {participantName || 'Unknown'} | Meeting: {meetingId}
      </Typography>
    </Paper>
  );
};

export default TranscriptionDebug;

