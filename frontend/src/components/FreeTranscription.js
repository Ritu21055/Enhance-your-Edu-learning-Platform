/**
 * Free Transcription Component using Web Speech API
 * COMPLETELY REWRITTEN - Simple, working version
 * Provides real-time transcription without any cloud costs
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
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
  VolumeUp,
  VolumeOff
} from '@mui/icons-material';

const FreeTranscription = ({ 
  socket, 
  meetingId, 
  participantId,
  participantName,
  isVisible = true,
  onTranscriptUpdate,
  isAudioEnabled = true  // NEW: Sync with main mic button
}) => {
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
      
      // Configuration - FIXED: Use single language code
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US'; // FIXED: Single language only
      recognition.maxAlternatives = 1;

      // onstart handler
      recognition.onstart = () => {
        console.log('✅ FreeTranscription: Recognition STARTED');
        setIsListening(true);
        setError(null);
        setStatus('Listening...');
      };

      // onresult handler - SIMPLE AND DIRECT
      recognition.onresult = (event) => {
        console.log('🎤 FreeTranscription: onresult triggered', {
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
          
          // VALIDATE: Reject low confidence (if available)
          if (confidence !== undefined && confidence !== null && confidence < 0.3) {
            console.log('⚠️ FreeTranscription: Skipping low confidence transcript:', {
              transcript: finalText,
              confidence
            });
            return;
          }
          
          setTranscript(prev => {
            const newText = prev + finalText;
            console.log('📝 FreeTranscription: Updated transcript:', newText);
            return newText;
          });
          setInterimTranscript(''); // Clear interim when we get final
          
          // Send to server
          // FIX: Use socket.id as fallback if participantId is not available
          const currentParticipantId = participantId || socket?.id;
          if (socket && meetingId && currentParticipantId) {
            // DEBUG: Check socket connection
            if (!socket.connected) {
              console.error('❌ FreeTranscription: Socket not connected!', {
                socketId: socket?.id,
                connected: socket?.connected,
                meetingId,
                participantId: currentParticipantId
              });
            }
            
            const transcriptData = {
              meetingId,
              participantId: currentParticipantId,
              participantName: participantName || 'Unknown',
              transcript: finalText,
              timestamp: Date.now(),
              language: 'en-US',
              confidence: confidence
            };
            
            console.log('📤 FreeTranscription: Sending transcript to server:', {
              transcript: finalText.substring(0, 50) + (finalText.length > 50 ? '...' : ''),
              participantId: currentParticipantId,
              socketId: socket?.id,
              socketConnected: socket?.connected,
              meetingId,
              confidence,
              transcriptLength: finalText.length
            });
            
            socket.emit('transcript_update', transcriptData);
            
            // DEBUG: Verify emit was called
            console.log('✅ FreeTranscription: transcript_update event emitted');
          } else {
            console.error('❌ FreeTranscription: Cannot send transcript - missing data:', {
              hasSocket: !!socket,
              hasMeetingId: !!meetingId,
              hasParticipantId: !!currentParticipantId,
              socketConnected: socket?.connected,
              socketId: socket?.id
            });
          }

          // Notify parent
          if (onTranscriptUpdate) {
            onTranscriptUpdate(finalText, confidence);
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
          // Normal - just waiting
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
          
          // Auto-retry with exponential backoff (1s, 2s, 4s)
          networkErrorRetryCountRef.current += 1;
          if (networkErrorRetryCountRef.current <= maxNetworkRetries) {
            const retryDelay = Math.min(1000 * Math.pow(2, networkErrorRetryCountRef.current - 1), 4000);
            console.log(`🔄 FreeTranscription: Retrying in ${retryDelay}ms (attempt ${networkErrorRetryCountRef.current}/${maxNetworkRetries})`);
            
            setTimeout(() => {
              if (recognitionRef.current && shouldAutoRestartRef.current) {
                try {
                  recognitionRef.current.start();
                  networkErrorRetryCountRef.current = 0; // Reset on success
                  console.log('✅ FreeTranscription: Auto-recovery successful');
                  setError(null); // Clear error on success
                  setStatus('Listening...');
                } catch (e) {
                  console.error('❌ FreeTranscription: Auto-recovery failed:', e.message);
                  if (networkErrorRetryCountRef.current >= maxNetworkRetries) {
                    setError('Network error - multiple retry attempts failed. Please check your connection.');
                    setStatus('Network Error');
                    shouldAutoRestartRef.current = false;
                  }
                }
              }
            }, retryDelay);
          } else {
            setError('Network error - multiple retry attempts failed. Please check your connection.');
            setStatus('Network Error');
            shouldAutoRestartRef.current = false;
            networkErrorRetryCountRef.current = 0; // Reset for next time
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
        
        // Reset network error retry count on normal end (successful recovery)
        networkErrorRetryCountRef.current = 0;
        
        // Auto-restart if enabled (even after network errors if retries succeeded)
        if (shouldAutoRestartRef.current) {
          console.log('🔄 FreeTranscription: Auto-restarting...');
          setTimeout(() => {
            try {
              if (recognitionRef.current) {
                recognitionRef.current.start();
              }
            } catch (e) {
              console.log('⚠️ FreeTranscription: Auto-restart failed:', e.message);
              // Don't disable auto-restart on single failure, let it retry
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

      // Store in window for sharing (optional)
      window.recognition = recognition;

      // Auto-start after socket is ready (ONLY if main mic is enabled)
      // FIX: Handle case where participantId might be undefined initially (for participants)
      const autoStartTimer = setTimeout(() => {
        if (recognitionRef.current && socket && meetingId && isAudioEnabled) {
          // Check if participantId is available (socket.id might be undefined initially)
          const currentParticipantId = participantId || socket?.id;
          
          if (currentParticipantId) {
            try {
              console.log('🚀 FreeTranscription: Auto-starting...', {
                participantId: currentParticipantId,
                socketId: socket?.id,
                isHost: socket?.id === participantId,
                isAudioEnabled
              });
              shouldAutoRestartRef.current = true;
              recognitionRef.current.start();
            } catch (e) {
              console.log('⚠️ FreeTranscription: Auto-start failed:', e.message);
              setStatus('Start Failed');
            }
          } else {
            console.log('⚠️ FreeTranscription: Waiting for participantId...', {
              hasSocket: !!socket,
              socketId: socket?.id,
              participantId
            });
            // Retry after 1 more second if participantId not available
            setTimeout(() => {
              if (recognitionRef.current && socket?.id) {
                try {
                  console.log('🚀 FreeTranscription: Retrying auto-start with socket.id...', {
                    socketId: socket.id
                  });
                  shouldAutoRestartRef.current = true;
                  recognitionRef.current.start();
                } catch (e) {
                  console.log('⚠️ FreeTranscription: Retry failed:', e.message);
                  setStatus('Start Failed');
                }
              }
            }, 1000);
          }
        } else {
          console.log('⚠️ FreeTranscription: Cannot auto-start - missing dependencies:', {
            hasRecognition: !!recognitionRef.current,
            hasSocket: !!socket,
            meetingId,
            participantId,
            socketId: socket?.id,
            isAudioEnabled
          });
        }
      }, 2000); // 2 second delay

      // Cleanup
      return () => {
        console.log('🧹 FreeTranscription: Cleaning up...');
        clearTimeout(autoStartTimer);
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
  }, [isSupported, socket, meetingId, participantId, participantName, onTranscriptUpdate, isAudioEnabled]);

  // NEW: Sync transcription with main mic button
  useEffect(() => {
    if (!isSupported || !recognitionRef.current) {
      return;
    }

    const recognition = recognitionRef.current;

    if (isAudioEnabled) {
      // Main mic is ON - Start transcription if not already listening
      if (!isListening) {
        console.log('🎤 FreeTranscription: Main mic ON - Starting transcription...');
        try {
          shouldAutoRestartRef.current = true;
          recognition.start();
        } catch (e) {
          // Already started or starting
          if (e.message && !e.message.includes('already')) {
            console.log('⚠️ FreeTranscription: Start failed:', e.message);
          }
        }
      }
    } else {
      // Main mic is OFF - Stop transcription if listening
      if (isListening) {
        console.log('🎤 FreeTranscription: Main mic OFF - Stopping transcription...');
        shouldAutoRestartRef.current = false;
        try {
          recognition.stop();
        } catch (e) {
          console.log('⚠️ FreeTranscription: Stop failed:', e.message);
        }
      }
    }
  }, [isAudioEnabled, isSupported, isListening]);

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

  if (!isVisible) return null;

  return (
    <Box 
      sx={{ 
        p: 2, 
        mb: 2,
        backgroundColor: 'transparent'
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6" color="primary" sx={{ fontSize: '0.9rem' }}>
          🆓 Free Live Transcription
        </Typography>
        <Box display="flex" gap={1}>
          <Chip 
            label="100% Free" 
            color="success" 
            size="small" 
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: '20px' }}
          />
          <Chip 
            label={status}
            color={isListening ? 'success' : 'default'}
            size="small"
            sx={{ fontSize: '0.7rem', height: '20px' }}
          />
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!isSupported && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Web Speech API not supported. Please use Chrome, Edge, or Safari.
        </Alert>
      )}

      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontStyle: 'italic' }}>
          🎤 Controlled by main mic button
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="Clear transcript">
          <IconButton onClick={clearTranscript} disabled={!transcript} size="small">
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
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Listening... Speak clearly for best results
          </Typography>
        </Box>
      )}

      <Box 
        sx={{ 
          minHeight: 80, 
          maxHeight: 200, 
          overflowY: 'auto',
          p: 1.5,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 1,
          border: 'none'
        }}
      >
        {transcript && (
          <Typography 
            variant="body2" 
            sx={{ 
              mb: 1, 
              lineHeight: 1.6,
              color: 'white'
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
              fontStyle: 'italic'
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
              color: 'rgba(255, 255, 255, 0.6)'
            }}
          >
            {isListening ? 'Listening for speech...' : 'Turn on your mic to start transcription'}
          </Typography>
        )}
      </Box>

      {confidence > 0 && (
        <Box mt={1} display="flex" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary">
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
          <Typography variant="caption" color="text.secondary">
            {Math.round(confidence * 100)}%
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default FreeTranscription;
