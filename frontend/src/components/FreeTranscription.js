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
  const [receivedTranscripts, setReceivedTranscripts] = useState([]); // Other participants' speech (host/participant)
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  
  const recognitionRef = useRef(null);
  const maxReceivedTranscripts = 50;
  const shouldAutoRestartRef = useRef(false);
  const networkErrorRetryCountRef = useRef(0);
  const maxNetworkRetries = 3;
  const isOpenRef = useRef(isOpen);
  const createAndStartRecognitionRef = useRef(null);
  const lastResultTimeRef = useRef(0);
  const noSpeechRestartTimerRef = useRef(null);

  isOpenRef.current = isOpen;

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

  // Create a NEW SpeechRecognition instance and start listening (fixes browsers that fail after stop())
  const createAndStartRecognition = React.useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || !socket || !meetingId) return;
    const currentParticipantId = participantId || socket?.id;
    if (!currentParticipantId) return;

    // Stop and discard any previous instance (do not reuse after stop())
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        lastResultTimeRef.current = Date.now();
        console.log('✅ FreeTranscription: Recognition STARTED');
        setIsListening(true);
        setError(null);
        setStatus('Listening...');
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        let finalConfidence = 0;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcriptText = result[0].transcript;
          const conf = result[0].confidence || 0;
          if (result.isFinal) {
            final += transcriptText + ' ';
            finalConfidence = conf;
            setConfidence(conf);
          } else {
            interim += transcriptText;
          }
        }
        if (final || interim) lastResultTimeRef.current = Date.now();
        if (final) {
          const finalText = final.trim();
          if (!finalText) return;
          const fillerWords = ['um', 'uh', 'ah', 'er', 'hmm', 'mm', 'mhm'];
          if (fillerWords.includes(finalText.toLowerCase())) return;
          setTranscript(prev => prev + finalText + ' ');
          setInterimTranscript('');
          if (socket && meetingId && currentParticipantId) {
            socket.emit('transcript_update', {
              meetingId,
              participantId: currentParticipantId,
              participantName: participantName || 'Unknown',
              transcript: finalText,
              timestamp: Date.now(),
              language: 'en-US',
              confidence: finalConfidence
            });
          }
          if (onTranscriptUpdate) onTranscriptUpdate(finalText, finalConfidence);
        }
        if (interim) setInterimTranscript(interim);
      };

      recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
          setStatus('Waiting for speech...');
          if (noSpeechRestartTimerRef.current) clearTimeout(noSpeechRestartTimerRef.current);
          noSpeechRestartTimerRef.current = setTimeout(() => {
            noSpeechRestartTimerRef.current = null;
            if (!shouldAutoRestartRef.current || !isOpenRef.current || !createAndStartRecognitionRef.current) return;
            if (recognitionRef.current) {
              try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
              recognitionRef.current = null;
            }
            createAndStartRecognitionRef.current?.();
          }, 1500);
          return;
        }
        if (event.error === 'aborted') {
          setIsListening(false);
          setStatus('Reconnecting...');
          if (shouldAutoRestartRef.current && isOpenRef.current && createAndStartRecognitionRef.current) {
            setTimeout(() => {
              if (shouldAutoRestartRef.current && createAndStartRecognitionRef.current) {
                createAndStartRecognitionRef.current();
              }
            }, 400);
          } else {
            setStatus('Stopped');
          }
          return;
        }
        if (event.error === 'network') {
          setStatus('Network Error - Retrying...');
          setIsListening(false);
          networkErrorRetryCountRef.current += 1;
          const retryDelay = networkErrorRetryCountRef.current <= maxNetworkRetries
            ? Math.min(1000 * Math.pow(2, networkErrorRetryCountRef.current - 1), 4000)
            : 12000;
          if (networkErrorRetryCountRef.current > maxNetworkRetries) {
            setError(null);
          }
          setTimeout(() => {
            if (shouldAutoRestartRef.current && isOpenRef.current && createAndStartRecognitionRef.current) {
              createAndStartRecognitionRef.current();
              networkErrorRetryCountRef.current = 0;
            }
          }, retryDelay);
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
        setStatus('Reconnecting...');
        if (shouldAutoRestartRef.current && isOpenRef.current && createAndStartRecognitionRef.current) {
          setTimeout(() => {
            if (shouldAutoRestartRef.current && createAndStartRecognitionRef.current) {
              createAndStartRecognitionRef.current();
            }
          }, 600);
        } else {
          setStatus('Error');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        networkErrorRetryCountRef.current = 0;
        recognitionRef.current = null;
        if (shouldAutoRestartRef.current && isOpenRef.current && createAndStartRecognitionRef.current) {
          const tryRestart = (attempt = 0) => {
            const delay = Math.min(300 + attempt * 400, 8000);
            setTimeout(() => {
              if (!shouldAutoRestartRef.current || !isOpenRef.current) {
                setStatus('Stopped');
                return;
              }
              try {
                if (createAndStartRecognitionRef.current) {
                  createAndStartRecognitionRef.current();
                }
              } catch (e) {
                if (shouldAutoRestartRef.current && isOpenRef.current) {
                  tryRestart(attempt + 1);
                } else {
                  setStatus('Stopped');
                }
              }
            }, delay);
          };
          tryRestart(0);
        } else {
          setStatus('Stopped');
        }
      };

      recognitionRef.current = recognition;
      shouldAutoRestartRef.current = true;
      recognition.start();
      console.log('🎤 FreeTranscription: New recognition instance started');
    } catch (e) {
      console.warn('⚠️ FreeTranscription: Start failed:', e.message);
      setStatus('Start Failed');
      setError(`Failed to start: ${e.message}`);
    }
  }, [socket, meetingId, participantId, participantName, onTranscriptUpdate]);

  createAndStartRecognitionRef.current = createAndStartRecognition;

  // Stop listening and discard instance (so next start uses a fresh instance)
  const stopListening = React.useCallback(() => {
    shouldAutoRestartRef.current = false;
    if (noSpeechRestartTimerRef.current) {
      clearTimeout(noSpeechRestartTimerRef.current);
      noSpeechRestartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setStatus('Stopped');
  }, []);

  // Auto-start when panel opens (with retries for participant); stop when panel closes
  useEffect(() => {
    if (!isSupported) return;
    if (!isOpen) {
      stopListening();
      return;
    }
    if (!socket || !meetingId) return;
    const participantIdOrSocket = participantId || socket?.id;
    if (!participantIdOrSocket) return;

    const delays = [500, 1500, 3000, 5000];
    const timers = delays.map((delay, i) =>
      setTimeout(() => {
        if (!isOpenRef.current) return;
        if (recognitionRef.current) return;
        createAndStartRecognition();
      }, delay)
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [isOpen, isSupported, socket, meetingId, participantId, createAndStartRecognition, stopListening]);

  // Keep-alive: restart recognition if it stopped while panel is open (meeting khatam hone tak chalu)
  const KEEP_ALIVE_INTERVAL_MS = 48000;
  useEffect(() => {
    if (!isOpen || !isSupported || !createAndStartRecognitionRef.current) return;
    const id = setInterval(() => {
      if (!isOpenRef.current || !shouldAutoRestartRef.current) return;
      if (!recognitionRef.current && socket && meetingId && (participantId || socket?.id)) {
        createAndStartRecognitionRef.current?.();
      }
    }, KEEP_ALIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isOpen, isSupported, socket, meetingId, participantId]);

  // Watchdog: if listening but no result for 12s, restart (fixes stuck recognition)
  const NO_RESULT_RESTART_MS = 12000;
  useEffect(() => {
    if (!isOpen || !isSupported || !createAndStartRecognitionRef.current) return;
    const id = setInterval(() => {
      if (!isOpenRef.current || !shouldAutoRestartRef.current || !recognitionRef.current) return;
      const elapsed = Date.now() - lastResultTimeRef.current;
      if (lastResultTimeRef.current > 0 && elapsed > NO_RESULT_RESTART_MS) {
        try {
          recognitionRef.current.stop();
        } catch (e) { /* ignore */ }
        recognitionRef.current = null;
        lastResultTimeRef.current = 0;
        createAndStartRecognitionRef.current?.();
      }
    }, 6000);
    return () => clearInterval(id);
  }, [isOpen, isSupported]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldAutoRestartRef.current = false;
      if (noSpeechRestartTimerRef.current) {
        clearTimeout(noSpeechRestartTimerRef.current);
        noSpeechRestartTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  // Listen for other participants' transcripts (host sees participant speech, participant sees host speech)
  useEffect(() => {
    if (!socket) return;

    const handleTranscriptReceived = (data) => {
      if (!data?.transcript?.trim()) return;
      const name = data.participantName || 'Unknown';
      setReceivedTranscripts((prev) => {
        const next = [...prev, { participantName: name, transcript: data.transcript.trim(), timestamp: data.timestamp || Date.now() }];
        return next.slice(-maxReceivedTranscripts);
      });
    };

    socket.on('transcript_received', handleTranscriptReceived);
    return () => {
      socket.off('transcript_received', handleTranscriptReceived);
    };
  }, [socket]);

  // Toggle listening (each start uses a fresh SpeechRecognition instance)
  const toggleListening = () => {
    if (!isSupported) {
      setError('Web Speech API not supported');
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      createAndStartRecognition();
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
    setReceivedTranscripts([]);
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
        <Tooltip title={isListening ? "Stop listening" : "Start listening (one click – stays on)"}>
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
          <IconButton onClick={clearTranscript} disabled={!transcript && !receivedTranscripts.length} sx={{ color: 'white' }}>
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
            Listening... Speak clearly (auto-restarts if stopped)
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
        {receivedTranscripts.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            {receivedTranscripts.map((entry, idx) => (
              <Typography
                key={`${entry.timestamp}-${idx}`}
                variant="body2"
                sx={{
                  mb: 0.75,
                  lineHeight: 1.6,
                  color: 'rgba(255, 255, 255, 0.95)',
                  fontSize: '0.9rem',
                  wordBreak: 'break-word'
                }}
              >
                <strong style={{ color: '#c4b5fd' }}>{entry.participantName}:</strong> {entry.transcript}
              </Typography>
            ))}
          </Box>
        )}

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
            <strong style={{ color: '#a5b4fc' }}>You:</strong> {transcript}
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
