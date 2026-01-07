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
 * NEW SIMPLE Transcription Debug Component
 * Completely independent - creates its own recognition instance
 * No sharing, no complex handler wrapping - just simple, direct transcription
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
  const [status, setStatus] = useState('Initializing...');
  
  const recognitionRef = useRef(null);
  const isInitializedRef = useRef(false);

  // Step 1: Check Web Speech API support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const supported = !!SpeechRecognition;
    setIsSupported(supported);
    
    if (!supported) {
      setError('Web Speech API not supported. Use Chrome, Edge, or Safari.');
      setStatus('Not Supported');
    } else {
      setStatus('Ready');
      console.log('✅ TranscriptionDebug: Web Speech API is supported');
    }
  }, []);

  // Step 2: Initialize recognition - SIMPLE AND DIRECT
  useEffect(() => {
    if (!isSupported || isInitializedRef.current) {
      return;
    }

    console.log('🎤 TranscriptionDebug: Initializing recognition...');
    setStatus('Initializing...');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    try {
      // Create NEW instance - completely independent
      const recognition = new SpeechRecognition();
      
      // Basic configuration
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US'; // FIXED: Single language
      recognition.maxAlternatives = 1;

      // SIMPLE onstart handler
      recognition.onstart = () => {
        console.log('✅ TranscriptionDebug: Recognition STARTED');
        setIsListening(true);
        setError(null);
        setStatus('Listening...');
      };

      // SIMPLE onresult handler - DIRECT, NO WRAPPING
      recognition.onresult = (event) => {
        console.log('🎤 TranscriptionDebug: onresult triggered', {
          resultIndex: event.resultIndex,
          resultsLength: event.results.length
        });

        let interim = '';
        let final = '';

        // Process all results
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcriptText = result[0].transcript;
          const conf = result[0].confidence || 0;

          if (result.isFinal) {
            final += transcriptText + ' ';
            setConfidence(conf);
            console.log('✅ TranscriptionDebug: FINAL transcript:', transcriptText);
          } else {
            interim += transcriptText;
            console.log('📝 TranscriptionDebug: INTERIM transcript:', transcriptText);
          }
        }

        // Update state - SIMPLE
        if (final) {
          setTranscript(prev => {
            const newText = prev + final.trim();
            console.log('📝 TranscriptionDebug: Updated transcript:', newText);
            return newText;
          });
          setTranscriptCount(prev => prev + 1);
          setInterimTranscript(''); // Clear interim when we get final
        }

        if (interim) {
          setInterimTranscript(interim);
        }
      };

      // SIMPLE onerror handler
      recognition.onerror = (event) => {
        console.error('❌ TranscriptionDebug: Error:', event.error);
        
        if (event.error === 'no-speech') {
          // Normal - just waiting for speech
          setStatus('Waiting for speech...');
          return;
        }
        
        if (event.error === 'aborted') {
          console.log('⚠️ TranscriptionDebug: Recognition aborted');
          setIsListening(false);
          setStatus('Stopped');
          return;
        }
        
        if (event.error === 'network') {
          setError('Network error - check internet connection');
          setStatus('Network Error');
          setIsListening(false);
          return;
        }
        
        if (event.error === 'not-allowed') {
          setError('Microphone permission denied');
          setStatus('Permission Denied');
          setIsListening(false);
          return;
        }
        
        if (event.error === 'audio-capture') {
          setError('Microphone not available');
          setStatus('No Microphone');
          setIsListening(false);
          return;
        }
        
        setError(`Error: ${event.error}`);
        setIsListening(false);
        setStatus('Error');
      };

      // SIMPLE onend handler
      recognition.onend = () => {
        console.log('🛑 TranscriptionDebug: Recognition ended');
        setIsListening(false);
        setStatus('Stopped');
        
        // Auto-restart if we were listening
        if (isListening) {
          console.log('🔄 TranscriptionDebug: Auto-restarting...');
          setTimeout(() => {
            try {
              if (recognitionRef.current) {
                recognitionRef.current.start();
              }
            } catch (e) {
              console.log('⚠️ TranscriptionDebug: Auto-restart failed:', e.message);
            }
          }, 500);
        }
      };

      // Store reference
      recognitionRef.current = recognition;
      isInitializedRef.current = true;
      setStatus('Ready');
      console.log('✅ TranscriptionDebug: Recognition initialized successfully');

      // Auto-start after 1 second
      // FIX: Handle case where participantId might be undefined initially (for participants)
      setTimeout(() => {
        if (recognitionRef.current && socket && meetingId) {
          // Check if participantId is available (socket.id might be undefined initially)
          const currentParticipantId = participantId || socket?.id;
          
          if (currentParticipantId || socket) {
            try {
              console.log('🚀 TranscriptionDebug: Auto-starting...', {
                participantId: currentParticipantId,
                socketId: socket?.id
              });
              recognitionRef.current.start();
            } catch (e) {
              console.log('⚠️ TranscriptionDebug: Auto-start failed:', e.message);
              setStatus('Start Failed');
            }
          } else {
            console.log('⚠️ TranscriptionDebug: Waiting for socket connection...');
            // Retry after 1 more second if socket not ready
            setTimeout(() => {
              if (recognitionRef.current && socket?.id) {
                try {
                  console.log('🚀 TranscriptionDebug: Retrying auto-start...');
                  recognitionRef.current.start();
                } catch (e) {
                  console.log('⚠️ TranscriptionDebug: Retry failed:', e.message);
                }
              }
            }, 1000);
          }
        }
      }, 1000);

    } catch (error) {
      console.error('❌ TranscriptionDebug: Initialization error:', error);
      setError(`Initialization failed: ${error.message}`);
      setStatus('Init Failed');
    }

    // Cleanup
    return () => {
      console.log('🧹 TranscriptionDebug: Cleaning up...');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.log('⚠️ TranscriptionDebug: Stop during cleanup failed:', e.message);
        }
      }
      isInitializedRef.current = false;
    };
  }, [isSupported, socket, meetingId, participantId]);

  // Toggle listening
  const toggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError('Recognition not initialized');
      return;
    }

    if (isListening) {
      console.log('🛑 TranscriptionDebug: Stopping...');
      try {
        recognition.stop();
      } catch (e) {
        console.log('⚠️ TranscriptionDebug: Stop failed:', e.message);
      }
    } else {
      console.log('🚀 TranscriptionDebug: Starting...');
      try {
        recognition.start();
      } catch (e) {
        console.log('⚠️ TranscriptionDebug: Start failed:', e.message);
        setError(`Failed to start: ${e.message}`);
      }
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
    setTranscriptCount(0);
    console.log('🧹 TranscriptionDebug: Transcript cleared');
  };

  // Collapsed view
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

  // Main view
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

      {/* Status */}
      <Chip
        label={status}
        color={isListening ? 'success' : 'default'}
        size="small"
        sx={{ mb: 1 }}
      />

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>
          {error}
        </Alert>
      )}

      {/* Not supported */}
      {!isSupported && (
        <Alert severity="warning" sx={{ mb: 2, fontSize: '0.8rem' }}>
          Web Speech API not supported
        </Alert>
      )}

      {/* Stats */}
      <Box mb={2} display="flex" gap={1} flexWrap="wrap">
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

      {/* Transcript Display */}
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
        {/* Final transcript */}
        {transcript && (
          <Typography
            variant="body2"
            sx={{
              mb: 1,
              lineHeight: 1.6,
              color: 'white',
              fontSize: '0.9rem',
              wordBreak: 'break-word'
            }}
          >
            {transcript}
          </Typography>
        )}
        
        {/* Interim transcript */}
        {interimTranscript && (
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontStyle: 'italic',
              fontSize: '0.9rem',
              wordBreak: 'break-word'
            }}
          >
            {interimTranscript}
          </Typography>
        )}
        
        {/* Empty state */}
        {!transcript && !interimTranscript && (
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontStyle: 'italic',
              fontSize: '0.9rem',
              textAlign: 'center'
            }}
          >
            {isListening ? 'Listening... Speak now!' : 'Click mic to start'}
          </Typography>
        )}
      </Box>

      {/* Footer */}
      <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.7rem' }}>
        {participantName || 'Unknown'} | {meetingId}
      </Typography>
    </Paper>
  );
};

export default TranscriptionDebug;
