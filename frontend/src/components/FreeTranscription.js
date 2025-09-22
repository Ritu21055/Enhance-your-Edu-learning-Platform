/**
 * Free Transcription Component using Web Speech API
 * Provides real-time transcription without any cloud costs
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  LinearProgress,
  Tooltip
} from '@mui/material';
import {
  Mic,
  MicOff,
  Language,
  Clear,
  VolumeUp,
  VolumeOff
} from '@mui/icons-material';

const FreeTranscription = ({ 
  socket, 
  meetingId, 
  participantId, 
  isVisible = true,
  onTranscriptUpdate 
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState('en-US');
  const [isMuted, setIsMuted] = useState(false);
  const [confidence, setConfidence] = useState(0);

  // Check Web Speech API support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    
    if (!SpeechRecognition) {
      setError('Web Speech API not supported in this browser. Please use Chrome, Edge, or Safari.');
    }
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('🎤 Free transcription started');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;
        
        if (event.results[i].isFinal) {
          final += transcript;
          setConfidence(confidence);
        } else {
          interim += transcript;
        }
      }

      if (final) {
        setTranscript(prev => prev + final);
        
        // Send to server for AI analysis
        if (socket && meetingId && participantId) {
          socket.emit('transcript_update', {
            meetingId,
            participantId,
            transcript: final,
            timestamp: Date.now(),
            language: language,
            confidence: confidence
          });
        }

        // Notify parent component
        if (onTranscriptUpdate) {
          onTranscriptUpdate(final, confidence);
        }
      }
      
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if it was listening
      if (isListening) {
        setTimeout(() => {
          recognition.start();
        }, 100);
      }
    };

    // Store recognition instance
    window.recognition = recognition;

    return () => {
      if (window.recognition) {
        window.recognition.stop();
      }
    };
  }, [isSupported, language, socket, meetingId, participantId, isListening, onTranscriptUpdate]);

  const startListening = () => {
    if (window.recognition && !isListening) {
      try {
        window.recognition.start();
      } catch (error) {
        setError('Failed to start speech recognition');
      }
    }
  };

  const stopListening = () => {
    if (window.recognition && isListening) {
      window.recognition.stop();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleLanguageChange = (event) => {
    setLanguage(event.target.value);
    if (window.recognition) {
      window.recognition.lang = event.target.value;
    }
  };

  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Spanish (Spain)' },
    { code: 'fr-FR', name: 'French (France)' },
    { code: 'de-DE', name: 'German (Germany)' },
    { code: 'it-IT', name: 'Italian (Italy)' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    { code: 'ru-RU', name: 'Russian (Russia)' },
    { code: 'ja-JP', name: 'Japanese (Japan)' },
    { code: 'ko-KR', name: 'Korean (South Korea)' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'ar-SA', name: 'Arabic (Saudi Arabia)' },
    { code: 'hi-IN', name: 'Hindi (India)' }
  ];

  if (!isVisible) return null;

  return (
    <Paper 
      elevation={3} 
      sx={{ 
        p: 2, 
        mb: 2, 
        backgroundColor: '#f8f9fa',
        border: '1px solid #e9ecef'
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6" color="primary">
          🆓 Free Live Transcription
        </Typography>
        <Box display="flex" gap={1}>
          <Chip 
            label="100% Free" 
            color="success" 
            size="small" 
            variant="outlined"
          />
          <Chip 
            label="No Cloud Required" 
            color="info" 
            size="small" 
            variant="outlined"
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
          Web Speech API not supported. Please use Chrome, Edge, or Safari for free transcription.
        </Alert>
      )}

      <Box display="flex" alignItems="center" gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Language</InputLabel>
          <Select
            value={language}
            label="Language"
            onChange={handleLanguageChange}
            disabled={isListening}
          >
            {languages.map((lang) => (
              <MenuItem key={lang.code} value={lang.code}>
                {lang.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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
          <IconButton onClick={clearTranscript} disabled={!transcript}>
            <Clear />
          </IconButton>
        </Tooltip>

        <Tooltip title={isMuted ? "Unmute" : "Mute"}>
          <IconButton onClick={toggleMute} color={isMuted ? "error" : "default"}>
            {isMuted ? <VolumeOff /> : <VolumeUp />}
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
          minHeight: 120, 
          maxHeight: 300, 
          overflowY: 'auto',
          p: 2,
          backgroundColor: 'white',
          borderRadius: 1,
          border: '1px solid #e0e0e0'
        }}
      >
        {transcript && (
          <Typography 
            variant="body2" 
            sx={{ 
              mb: 1, 
              lineHeight: 1.6,
              color: 'text.primary'
            }}
          >
            {transcript}
          </Typography>
        )}
        
        {interimTranscript && (
          <Typography 
            variant="body2" 
            sx={{ 
              color: 'text.secondary',
              fontStyle: 'italic',
              opacity: 0.7
            }}
          >
            {interimTranscript}
          </Typography>
        )}
        
        {!transcript && !interimTranscript && (
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={{ 
              textAlign: 'center',
              fontStyle: 'italic'
            }}
          >
            {isListening ? 'Listening for speech...' : 'Click the microphone to start transcription'}
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

      <Box mt={2} display="flex" gap={1} flexWrap="wrap">
        <Chip 
          label="Real-time" 
          size="small" 
          color="primary" 
          variant="outlined"
        />
        <Chip 
          label="Offline" 
          size="small" 
          color="success" 
          variant="outlined"
        />
        <Chip 
          label="No API Keys" 
          size="small" 
          color="info" 
          variant="outlined"
        />
        <Chip 
          label="Browser Native" 
          size="small" 
          color="secondary" 
          variant="outlined"
        />
      </Box>
    </Paper>
  );
};

export default FreeTranscription;
