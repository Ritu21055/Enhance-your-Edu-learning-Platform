/**
 * Free Transcription Component using Web Speech API
 * Simple version with Show/Hide toggle button
 * Provides real-time transcription without any cloud costs
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Chip,
  Alert,
  LinearProgress,
  Tooltip
} from '@mui/material';
import {
  Mic,
  MicOff,
  Clear,
  Close
} from '@mui/icons-material';

const FreeTranscription = ({ 
  socket, 
  meetingId, 
  participantId,
  participantName,
  isVisible = false,  // When true (e.g. from header button), show panel
  onClose,            // Called when panel is closed (e.g. from header flow)
  onTranscriptUpdate
}) => {
  const [isOpen, setIsOpen] = useState(isVisible);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  
  const recognitionRef = useRef(null);
  const isInitializedRef = useRef(false);
  const shouldAutoRestartRef = useRef(false);
  const networkErrorRetryCountRef = useRef(0);
  const maxNetworkRetries = 3;

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
      console.log('✅ FreeTranscription: Web Speech API is supported');
    }
  }, []);

  // Step 2: Initialize recognition - ONLY ONCE
  useEffect(() => {
    if (!isSupported || isInitializedRef.current) {
      return;
    }

    console.log('🎤 FreeTranscription: Initializing recognition...');
    setStatus('Initializing...');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    try {
      // Create recognition instance
      const recognition = new SpeechRecognition();
      
      // Configuration
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      // onstart handler
      recognition.onstart = () => {
        console.log('✅ FreeTranscription: Recognition STARTED');
        setIsListening(true);
        setError(null);
        setStatus('Listening...');
      };

      // onresult handler
      recognition.onresult = (event) => {
        console.log('🎤 FreeTranscription: onresult triggered', {
          resultIndex: event.resultIndex,
          resultsLength: event.results.length
        });

        let interim = '';
        let final = '';
        let finalConfidence = 0; // Track confidence from final results

        // Process all results
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcriptText = result[0].transcript;
          const conf = result[0].confidence || 0;

          if (result.isFinal) {
            final += transcriptText + ' ';
            finalConfidence = conf; // Store confidence from final result
            setConfidence(conf);
            console.log('✅ FreeTranscription: FINAL transcript:', transcriptText);
          } else {
            interim += transcriptText;
            console.log('📝 FreeTranscription: INTERIM transcript:', transcriptText);
          }
        }

        // Update state
        if (final) {
          const finalText = final.trim();
          
          // VALIDATE: Only process valid transcripts
          if (!finalText || finalText.length < 3) {
            console.log('⚠️ FreeTranscription: Skipping empty/short transcript');
            return;
          }
          
          // VALIDATE: Reject filler words
          const fillerWords = ['um', 'uh', 'ah', 'er', 'hmm', 'mm', 'mhm'];
          const lowerText = finalText.toLowerCase();
          if (fillerWords.includes(lowerText)) {
            console.log('⚠️ FreeTranscription: Skipping filler word:', finalText);
            return;
          }
          
          setTranscript(prev => {
            const newText = prev + finalText + ' ';
            console.log('📝 FreeTranscription: Updated transcript:', newText);
            return newText;
          });
          setInterimTranscript(''); // Clear interim when we get final
          
          // Send to server
          const currentParticipantId = participantId || socket?.id;
          if (socket && meetingId && currentParticipantId) {
            const transcriptData = {
              meetingId,
              participantId: currentParticipantId,
              participantName: participantName || 'Unknown',
              transcript: finalText,
              timestamp: Date.now(),
              language: 'en-US',
              confidence: finalConfidence
            };
            
            console.log('📤 FreeTranscription: Sending transcript to server:', {
              transcript: finalText.substring(0, 50) + (finalText.length > 50 ? '...' : ''),
              participantId: currentParticipantId,
              meetingId,
              confidence: finalConfidence
            });
            
            socket.emit('transcript_update', transcriptData);
            console.log('✅ FreeTranscription: transcript_update event emitted');
          }

          // Notify parent
          if (onTranscriptUpdate) {
            onTranscriptUpdate(finalText, finalConfidence);
          }
        }

        if (interim) {
          setInterimTranscript(interim);
        }
      };

      // onerror handler
      recognition.onerror = (event) => {
        console.error('❌ FreeTranscription: Error:', event.error);
        
        if (event.error === 'no-speech') {
          setStatus('Waiting for speech...');
          return;
        }
        
        if (event.error === 'aborted') {
          console.log('⚠️ FreeTranscription: Recognition aborted');
          setIsListening(false);
          setStatus('Stopped');
          shouldAutoRestartRef.current = false;
          return;
        }
        
        if (event.error === 'network') {
          console.warn('⚠️ FreeTranscription: Network error detected, attempting auto-recovery...');
          setStatus('Network Error - Retrying...');
          setIsListening(false);
          
          // Auto-retry with exponential backoff
          networkErrorRetryCountRef.current += 1;
          if (networkErrorRetryCountRef.current <= maxNetworkRetries) {
            const retryDelay = Math.min(1000 * Math.pow(2, networkErrorRetryCountRef.current - 1), 4000);
            console.log(`🔄 FreeTranscription: Retrying in ${retryDelay}ms (attempt ${networkErrorRetryCountRef.current}/${maxNetworkRetries})`);
            
            setTimeout(() => {
              if (recognitionRef.current && shouldAutoRestartRef.current) {
                try {
                  recognitionRef.current.start();
                  networkErrorRetryCountRef.current = 0;
                  console.log('✅ FreeTranscription: Auto-recovery successful');
                  setError(null);
                  setStatus('Listening...');
                } catch (e) {
                  console.error('❌ FreeTranscription: Auto-recovery failed:', e.message);
                  if (networkErrorRetryCountRef.current >= maxNetworkRetries) {
                    setError('Network error - multiple retry attempts failed.');
                    setStatus('Network Error');
                    shouldAutoRestartRef.current = false;
                  }
                }
              }
            }, retryDelay);
          } else {
            setError('Network error - multiple retry attempts failed.');
            setStatus('Network Error');
            shouldAutoRestartRef.current = false;
            networkErrorRetryCountRef.current = 0;
          }
          return;
        }
        
        if (event.error === 'not-allowed') {
          setError('Microphone permission denied');
          setStatus('Permission Denied');
          setIsListening(false);
          shouldAutoRestartRef.current = false;
          return;
        }
        
        if (event.error === 'audio-capture') {
          setError('Microphone not available');
          setStatus('No Microphone');
          setIsListening(false);
          shouldAutoRestartRef.current = false;
          return;
        }
        
        setError(`Error: ${event.error}`);
        setIsListening(false);
        setStatus('Error');
      };

      // onend handler
      recognition.onend = () => {
        console.log('🛑 FreeTranscription: Recognition ended');
        setIsListening(false);
        networkErrorRetryCountRef.current = 0;
        
        // Auto-restart if enabled
        if (shouldAutoRestartRef.current && isOpen) {
          console.log('🔄 FreeTranscription: Auto-restarting...');
          setTimeout(() => {
            try {
              if (recognitionRef.current) {
                recognitionRef.current.start();
              }
            } catch (e) {
              console.log('⚠️ FreeTranscription: Auto-restart failed:', e.message);
            }
          }, 500);
        } else {
          setStatus('Stopped');
        }
      };

      // Store reference
      recognitionRef.current = recognition;
      isInitializedRef.current = true;
      setStatus('Ready');
      console.log('✅ FreeTranscription: Recognition initialized successfully');

      // Auto-start when opened (if socket is ready)
      if (isOpen) {
        const autoStartTimer = setTimeout(() => {
          if (recognitionRef.current && socket && meetingId) {
            const currentParticipantId = participantId || socket?.id;
            if (currentParticipantId) {
              try {
                console.log('🚀 FreeTranscription: Auto-starting...', {
                  participantId: currentParticipantId,
                  socketId: socket?.id
                });
                shouldAutoRestartRef.current = true;
                recognitionRef.current.start();
              } catch (e) {
                console.log('⚠️ FreeTranscription: Auto-start failed:', e.message);
                setStatus('Start Failed');
              }
            } else {
              // Retry after 1 second
              setTimeout(() => {
                if (recognitionRef.current && socket?.id) {
                  try {
                    console.log('🚀 FreeTranscription: Retrying auto-start...');
                    shouldAutoRestartRef.current = true;
                    recognitionRef.current.start();
                  } catch (e) {
                    console.log('⚠️ FreeTranscription: Retry failed:', e.message);
                  }
                }
              }, 1000);
            }
          }
        }, 1000);

        return () => {
          clearTimeout(autoStartTimer);
        };
      }

      // Cleanup
      return () => {
        console.log('🧹 FreeTranscription: Cleaning up...');
        shouldAutoRestartRef.current = false;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {
            console.log('⚠️ FreeTranscription: Stop during cleanup failed:', e.message);
          }
        }
      };

    } catch (error) {
      console.error('❌ FreeTranscription: Initialization error:', error);
      setError(`Initialization failed: ${error.message}`);
      setStatus('Init Failed');
    }
  }, [isSupported, socket, meetingId, participantId, participantName, onTranscriptUpdate, isOpen]);

  // Start/stop when panel is opened/closed
  useEffect(() => {
    if (!isSupported || !recognitionRef.current) {
      return;
    }

    const recognition = recognitionRef.current;

    if (isOpen) {
      // Panel opened - start transcription
      if (!isListening) {
        console.log('🎤 FreeTranscription: Panel opened - Starting transcription...');
        try {
          shouldAutoRestartRef.current = true;
          recognition.start();
        } catch (e) {
          if (e.message && !e.message.includes('already')) {
            console.log('⚠️ FreeTranscription: Start failed:', e.message);
          }
        }
      }
    } else {
      // Panel closed - stop transcription
      if (isListening) {
        console.log('🎤 FreeTranscription: Panel closed - Stopping transcription...');
        shouldAutoRestartRef.current = false;
        try {
          recognition.stop();
        } catch (e) {
          console.log('⚠️ FreeTranscription: Stop failed:', e.message);
        }
      }
    }
  }, [isOpen, isSupported, isListening]);

  // Toggle listening
  const toggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError('Recognition not initialized');
      return;
    }

    if (isListening) {
      console.log('🛑 FreeTranscription: Stopping...');
      shouldAutoRestartRef.current = false;
      try {
        recognition.stop();
      } catch (e) {
        console.log('⚠️ FreeTranscription: Stop failed:', e.message);
      }
    } else {
      console.log('🚀 FreeTranscription: Starting...');
      shouldAutoRestartRef.current = true;
      try {
        recognition.start();
      } catch (e) {
        console.log('⚠️ FreeTranscription: Start failed:', e.message);
        setError(`Failed to start: ${e.message}`);
      }
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
    console.log('🧹 FreeTranscription: Transcript cleared');
  };

  // No floating button - transcription is opened only from header "Show Transcription" (for all users)
  if (!isOpen && !isVisible) {
    return null;
  }

  // Main view (responsive position on mobile - above control bar)
  return (
    <Paper
      sx={{
        position: 'fixed',
        bottom: { xs: 72, sm: 20 },
        right: { xs: 8, sm: 20 },
        zIndex: 1001,
        width: { xs: 'calc(100vw - 16px)', sm: 400 },
        maxWidth: 400,
        maxHeight: { xs: '50vh', sm: 500 },
        p: 2,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6" sx={{ color: 'white', fontSize: '1rem' }}>
          🆓 Free Live Transcription
        </Typography>
        <Box display="flex" gap={1} alignItems="center">
          <Chip
            label={status}
            color={isListening ? 'success' : 'default'}
            size="small"
            sx={{ fontSize: '0.7rem', height: '20px' }}
          />
          <IconButton
            size="small"
            onClick={() => {
              setIsOpen(false);
              if (onClose) onClose();
            }}
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
          Web Speech API not supported. Use Chrome, Edge, or Safari.
        </Alert>
      )}

      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <Tooltip title={isListening ? "Stop listening" : "Start listening"}>
          <IconButton
            onClick={toggleListening}
            disabled={!isSupported}
            color={isListening ? "error" : "primary"}
            sx={{
              backgroundColor: isListening ? 'rgba(244, 67, 54, 0.1)' : 'rgba(25, 118, 210, 0.1)',
              '&:hover': {
                backgroundColor: isListening ? 'rgba(244, 67, 54, 0.2)' : 'rgba(25, 118, 210, 0.2)'
              }
            }}
          >
            {isListening ? <MicOff /> : <Mic />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Clear transcript">
          <IconButton onClick={clearTranscript} disabled={!transcript} sx={{ color: 'white' }}>
            <Clear />
          </IconButton>
        </Tooltip>
      </Box>

      {isListening && (
        <Box mb={2}>
          <LinearProgress
            variant="indeterminate"
            color="primary"
            sx={{ height: 4, borderRadius: 2 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', color: 'rgba(255,255,255,0.7)' }}>
            Listening... Speak clearly
          </Typography>
        </Box>
      )}

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
              fontSize: '0.9rem',
              wordBreak: 'break-word'
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
              fontSize: '0.9rem',
              wordBreak: 'break-word'
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
              fontSize: '0.9rem'
            }}
          >
            {isListening ? 'Listening for speech...' : 'Click mic to start'}
          </Typography>
        )}
      </Box>

      {confidence > 0 && (
        <Box mt={1} display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>
            Confidence:
          </Typography>
          <LinearProgress
            variant="determinate"
            value={confidence * 100}
            sx={{
              flexGrow: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(0,0,0,0.1)'
            }}
          />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }}>
            {Math.round(confidence * 100)}%
          </Typography>
        </Box>
      )}

      <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.7rem', mt: 1, display: 'block' }}>
        Participant: {participantName || 'Unknown'} | Meeting: {meetingId}
      </Typography>
    </Paper>
  );
};

export default FreeTranscription;
