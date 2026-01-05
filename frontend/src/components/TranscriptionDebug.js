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
  const interimTimeoutRef = useRef(null);
  const lastInterimRef = useRef('');

  // Check Web Speech API support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    
    if (!SpeechRecognition) {
      setError('Web Speech API not supported. Use Chrome, Edge, or Safari.');
    }
  }, []);

  // Listen to socket events for transcript updates (from FreeTranscription)
  // This ensures we get transcripts even if recognition handler is overwritten
  useEffect(() => {
    if (!socket || !meetingId) {
      console.log('⚠️ DEBUG: Socket listener not set up:', { hasSocket: !!socket, meetingId, participantId });
      return;
    }

    console.log('✅ DEBUG: Setting up socket listener for transcript updates', { meetingId, participantId, socketId: socket?.id });

    const handleTranscriptUpdate = (data) => {
      console.log('📥 DEBUG: Received transcript_update event in TranscriptionDebug:', data);
      
      // Check if meeting ID matches
      if (data.meetingId !== meetingId) {
        console.log('⚠️ DEBUG: Meeting ID mismatch:', {
          received: data.meetingId,
          expected: meetingId
        });
        return;
      }
      
      // If participantId is provided, only show transcripts for that participant
      // Otherwise, show all transcripts for the meeting (useful for debugging)
      const shouldShow = !participantId || data.participantId === participantId || data.participantId === socket?.id;
      
      if (shouldShow) {
        console.log('✅ DEBUG: Transcript matches - updating display in TranscriptionDebug:', data.transcript, {
          participantId: data.participantId,
          participantName: data.participantName,
          socketId: socket?.id
        });
        setTranscript(prev => {
          const newTranscript = prev + ' ' + data.transcript;
          console.log('📝 DEBUG: Updated transcript in TranscriptionDebug via socket:', newTranscript);
          return newTranscript;
        });
        setConfidence(data.confidence || 0);
        setTranscriptCount(prev => prev + 1);
      } else {
        console.log('⚠️ DEBUG: Participant ID mismatch:', {
          receivedParticipantId: data.participantId,
          expectedParticipantId: participantId,
          socketId: socket?.id,
          shouldShow
        });
      }
    };
    
    // Test socket connection
    console.log('🔍 DEBUG: Testing socket connection for transcript events:', {
      socketId: socket?.id,
      connected: socket?.connected,
      hasOn: typeof socket?.on === 'function'
    });

    socket.on('transcript_update', handleTranscriptUpdate);
    console.log('✅ DEBUG: Socket listener registered for transcript_update');

    return () => {
      console.log('🧹 DEBUG: Cleaning up socket listener');
      socket.off('transcript_update', handleTranscriptUpdate);
    };
  }, [socket, meetingId, participantId]);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSupported) return;

    // CRITICAL: Use existing recognition instance if available (from FreeTranscription)
    // This avoids conflicts and allows sharing the same recognition instance
    let recognition = null;
    
    if (window.recognition && window.recognition.readyState !== 0) {
      console.log('⚠️ DEBUG: Using existing recognition instance from FreeTranscription');
      recognition = window.recognition;
      
      // CRITICAL: Store original handler before modifying
      const originalOnResult = recognition.onresult;
      
      // Create a wrapper function that will always call our handler
      const ourHandler = (event) => {
        console.log('🎤 DEBUG: Recognition onresult triggered in TranscriptionDebug', { 
          resultIndex: event.resultIndex, 
          resultsLength: event.results.length,
          timestamp: Date.now()
        });
        
        // Process transcripts for our display
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          const conf = event.results[i][0].confidence;
          
          if (event.results[i].isFinal) {
            final += transcript;
            setConfidence(conf);
            setTranscriptCount(prev => prev + 1);
            console.log('✅ DEBUG: Final transcript received in TranscriptionDebug:', final);
          } else {
            interim += transcript;
          }
        }

        if (final) {
          // Clear any pending interim promotion timeout
          if (interimTimeoutRef.current) {
            clearTimeout(interimTimeoutRef.current);
            interimTimeoutRef.current = null;
          }
          
          setTranscript(prev => {
            const newTranscript = prev + ' ' + final;
            console.log('✅ DEBUG: Final transcript - Updated transcript in TranscriptionDebug:', newTranscript);
            return newTranscript;
          });
          // Clear interim when we get final
          setInterimTranscript('');
          lastInterimRef.current = '';
        }
        
        if (interim) {
          setInterimTranscript(interim);
          lastInterimRef.current = interim;
          console.log('📝 DEBUG: Interim transcript in TranscriptionDebug:', interim);
          
          // Clear any existing timeout
          if (interimTimeoutRef.current) {
            clearTimeout(interimTimeoutRef.current);
          }
          
          // If interim persists for a while without becoming final, promote it
          // This ensures we see something even if final never comes
          interimTimeoutRef.current = setTimeout(() => {
            if (lastInterimRef.current === interim && interim.trim().length > 0) {
              // Interim hasn't changed and hasn't become final - promote it
              console.log('⚠️ DEBUG: Interim transcript persisted, promoting to final:', interim);
              setTranscript(prevTranscript => {
                const updated = prevTranscript + ' ' + interim;
                console.log('📝 DEBUG: Promoted interim to transcript:', updated);
                return updated;
              });
              setInterimTranscript('');
              setTranscriptCount(prev => prev + 1);
              lastInterimRef.current = '';
            }
          }, 2000); // Wait 2 seconds - if interim hasn't become final, promote it
        }
        
        // Also show combined view for debugging
        if (final || interim) {
          console.log('📊 DEBUG: Combined transcript state:', {
            final,
            interim,
            hasFinal: !!final,
            hasInterim: !!interim
          });
        }
      };
      
      // Set up listeners on existing instance - wrap the original handler
      recognition.onresult = (event) => {
        // Call original handler first (FreeTranscription's handler)
        if (originalOnResult && typeof originalOnResult === 'function') {
          try {
            originalOnResult.call(recognition, event);
            console.log('✅ DEBUG: Original handler called successfully');
          } catch (e) {
            console.error('⚠️ DEBUG: Error calling original handler:', e);
          }
        } else {
          console.log('⚠️ DEBUG: No original handler to call');
        }
        
        // Always call our handler
        ourHandler(event);
      };
      
      // Store our handler reference for potential re-attachment
      recognitionRef.current = recognition;
      window.transcriptionDebugHandler = ourHandler;
      
      // Set up periodic check to ensure handler stays attached
      // Use a more aggressive check to catch overwrites quickly
      const handlerCheckInterval = setInterval(() => {
        if (window.recognition && window.recognition.onresult) {
          const currentHandler = window.recognition.onresult.toString();
          // Check if our handler is in the chain by looking for our function body
          const hasOurHandler = currentHandler.includes('TranscriptionDebug') || 
                               currentHandler.includes('ourHandler') ||
                               currentHandler.includes('Final transcript received in TranscriptionDebug');
          
          if (!hasOurHandler) {
            console.log('⚠️ DEBUG: Handler was overwritten, re-attaching...', {
              handlerLength: currentHandler.length,
              handlerPreview: currentHandler.substring(0, 100)
            });
            const currentOnResult = window.recognition.onresult;
            window.recognition.onresult = (event) => {
              // Call original handler first
              if (currentOnResult && typeof currentOnResult === 'function') {
                try {
                  currentOnResult.call(window.recognition, event);
                } catch (e) {
                  console.error('⚠️ DEBUG: Error in original handler:', e);
                }
              }
              // Always call our handler
              ourHandler(event);
            };
            console.log('✅ DEBUG: Handler re-attached successfully');
          }
        }
      }, 1000); // Check every 1 second for faster detection
      
      recognition.onstart = () => {
        console.log('🎤 DEBUG: Shared transcription started in TranscriptionDebug');
        setIsListening(true);
        setError(null);
      };
      
      // Cleanup interval on unmount
      return () => {
        clearInterval(handlerCheckInterval);
      };
      
      recognition.onerror = (event) => {
        console.error('🎤 DEBUG: Shared recognition error:', event.error);
        
        // Handle network error - retry with delay
        if (event.error === 'network') {
          setError('Network error: Retrying...');
          setIsListening(false);
          setTimeout(() => {
            if (shouldAutoRestartRef.current && recognitionRef.current) {
              try {
                console.log('🎤 DEBUG: Retrying after network error...');
                recognitionRef.current.start();
              } catch (e) {
                console.log('⚠️ DEBUG: Network retry failed:', e.message);
                setError('Network error: Please check your internet connection');
                shouldAutoRestartRef.current = false;
              }
            }
          }, 2000);
          return;
        }
        
        // Handle aborted error
        if (event.error === 'aborted') {
          console.log('🎤 DEBUG: Recognition aborted');
          setError(null);
          setIsListening(false);
          return;
        }
        
        setError(`Error: ${event.error}`);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
      setIsListening(recognition.readyState === 1); // 1 = listening
      return;
    }

    // Create new instance if no existing one
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
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
      
      // CRITICAL FIX: Handle network error - retry with delay
      if (event.error === 'network') {
        setError('Network error: Retrying...');
        setIsListening(false);
        // Retry after delay
        setTimeout(() => {
          if (shouldAutoRestartRef.current && recognitionRef.current) {
            try {
              console.log('🎤 DEBUG: Retrying after network error...');
              recognitionRef.current.start();
            } catch (e) {
              console.log('⚠️ DEBUG: Network retry failed:', e.message);
              setError('Network error: Please check your internet connection');
              shouldAutoRestartRef.current = false;
            }
          }
        }, 2000); // Wait 2 seconds before retry
        return;
      }
      
      // CRITICAL FIX: Handle aborted error better - it's usually due to multiple instances
      if (event.error === 'aborted') {
        console.log('🎤 DEBUG: Recognition aborted - likely due to multiple instances. Will retry...');
        setError(null); // Don't show error for aborted
        setIsListening(false);
        // Retry after a delay
        setTimeout(() => {
          if (shouldAutoRestartRef.current && recognitionRef.current) {
            try {
              console.log('🎤 DEBUG: Retrying after abort...');
              recognitionRef.current.start();
            } catch (e) {
              console.log('⚠️ DEBUG: Retry failed:', e.message);
              setError('Multiple transcription instances detected. Please close other transcription windows.');
            }
          }
        }, 500);
        return;
      }
      
      setError(`Error: ${event.error}`);
      
      if (event.error === 'no-speech') {
        // Normal, will retry - don't show error
        setError(null);
      } else if (event.error === 'audio-capture') {
        setError('Microphone not available');
        shouldAutoRestartRef.current = false;
        setIsListening(false);
      } else if (event.error === 'not-allowed') {
        setError('Microphone permission denied');
        shouldAutoRestartRef.current = false;
        setIsListening(false);
      } else {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (shouldAutoRestartRef.current) {
        setTimeout(() => {
          try {
            if (recognitionRef.current) {
              recognitionRef.current.start();
            }
          } catch (e) {
            console.log('DEBUG: Auto-restart failed:', e);
            // If it's an abort error, don't retry immediately
            if (e.message && e.message.includes('abort')) {
              shouldAutoRestartRef.current = false;
            }
          }
        }, 300); // Increased delay to avoid conflicts
      }
    };

    recognitionRef.current = recognition;
    
    // Store in window for sharing (but only if not already exists)
    if (!window.recognition) {
      window.recognition = recognition;
    }

    // Auto-start with longer delay to avoid conflicts
    const autoStartTimer = setTimeout(() => {
      if (recognition && socket && meetingId && participantId) {
        try {
          // Check if recognition is already running
          if (recognition.readyState === 0) { // 0 = not started
            console.log('🎤 DEBUG: Auto-starting transcription...');
            shouldAutoRestartRef.current = true;
            recognition.start();
          } else {
            console.log('⚠️ DEBUG: Recognition already running, skipping auto-start');
          }
        } catch (error) {
          console.log('⚠️ DEBUG: Auto-start failed:', error.message);
          if (error.message && error.message.includes('abort')) {
            // Retry after delay
            setTimeout(() => {
              if (recognitionRef.current && shouldAutoRestartRef.current) {
                try {
                  recognitionRef.current.start();
                } catch (e) {
                  console.log('⚠️ DEBUG: Retry after abort failed:', e.message);
                }
              }
            }, 1000);
          }
        }
      }
    }, 2000); // Increased delay to 2 seconds

    return () => {
      clearTimeout(autoStartTimer);
      shouldAutoRestartRef.current = false;
      if (recognition && recognition.readyState !== 0) {
        try {
          recognition.stop();
        } catch (e) {
          console.log('DEBUG: Stop failed during cleanup:', e);
        }
      }
      // Don't delete window.recognition as FreeTranscription might be using it
    };
  }, [isSupported, socket, meetingId, participantId, participantName]);

  const toggleListening = () => {
    // Try to use recognitionRef first, then window.recognition
    const recognition = recognitionRef.current || window.recognition;
    if (!recognition) {
      setError('Recognition not initialized');
      return;
    }
    
    if (isListening) {
      shouldAutoRestartRef.current = false;
      try {
        recognition.stop();
      } catch (e) {
        console.log('DEBUG: Stop failed:', e);
      }
    } else {
      shouldAutoRestartRef.current = true;
      try {
        // Check if already running
        if (recognition.readyState === 0) {
          recognition.start();
        } else {
          console.log('DEBUG: Recognition already running');
          setIsListening(true);
        }
      } catch (error) {
        console.log('DEBUG: Start failed:', error.message);
        if (error.message && error.message.includes('abort')) {
          // Retry after delay
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {
              setError('Failed to start. Another instance may be running.');
            }
          }, 500);
        } else {
          setError(`Failed to start: ${error.message}`);
        }
      }
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
              color: 'rgba(255, 255, 255, 0.5)',
              fontStyle: 'italic',
              fontSize: '0.9rem'
            }}
          >
            {isListening ? 'Listening... Speak something...' : 'Not listening. Click mic to start.'}
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

