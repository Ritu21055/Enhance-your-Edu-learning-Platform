/**
 * Free Web Speech API Hook for Real-time Transcription
 * Uses browser's built-in speech recognition - 100% free!
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const useWebSpeechAPI = (socket, meetingId, participantId) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [language, setLanguage] = useState('en-US');
  
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');

  // Check if Web Speech API is supported
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      setupRecognition();
    } else {
      setIsSupported(false);
      setError('Web Speech API not supported in this browser');
    }
  }, []);

  // Setup recognition configuration
  const setupRecognition = useCallback(() => {
    if (!recognitionRef.current) return;

    const recognition = recognitionRef.current;
    
    // Configuration
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onstart = () => {
      console.log('🎤 Speech recognition started');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      // Process all results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Update states
      if (finalTranscript) {
        finalTranscriptRef.current += finalTranscript;
        setTranscript(finalTranscriptRef.current);
        
        // Send transcript to server for AI analysis
        if (socket && meetingId && participantId) {
          socket.emit('transcript_update', {
            meetingId,
            participantId,
            transcript: finalTranscript,
            timestamp: Date.now(),
            language: language
          });
        }
      }
      
      setInterimTranscript(interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(`Speech recognition error: ${event.error}`);
      setIsListening(false);
      
      // Handle specific errors
      switch (event.error) {
        case 'no-speech':
          console.log('No speech detected, continuing...');
          break;
        case 'audio-capture':
          setError('Microphone not accessible');
          break;
        case 'not-allowed':
          setError('Microphone permission denied');
          break;
        case 'network':
          setError('Network error occurred');
          break;
        default:
          setError(`Unknown error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('🎤 Speech recognition ended');
      setIsListening(false);
      
      // Auto-restart if it was listening
      if (isListening) {
        setTimeout(() => {
          startListening();
        }, 100);
      }
    };
  }, [language, socket, meetingId, participantId, isListening]);

  // Start listening
  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) {
      setError('Speech recognition not available');
      return;
    }

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setError('Failed to start speech recognition');
    }
  }, [isSupported]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Clear transcript
  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    finalTranscriptRef.current = '';
  }, []);

  // Change language
  const changeLanguage = useCallback((newLanguage) => {
    setLanguage(newLanguage);
    if (recognitionRef.current) {
      recognitionRef.current.lang = newLanguage;
    }
  }, []);

  // Get available languages
  const getAvailableLanguages = useCallback(() => {
    return [
      { code: 'en-US', name: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)' },
      { code: 'es-ES', name: 'Spanish (Spain)' },
      { code: 'es-MX', name: 'Spanish (Mexico)' },
      { code: 'fr-FR', name: 'French (France)' },
      { code: 'de-DE', name: 'German (Germany)' },
      { code: 'it-IT', name: 'Italian (Italy)' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'ru-RU', name: 'Russian (Russia)' },
      { code: 'ja-JP', name: 'Japanese (Japan)' },
      { code: 'ko-KR', name: 'Korean (South Korea)' },
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'zh-TW', name: 'Chinese (Traditional)' },
      { code: 'ar-SA', name: 'Arabic (Saudi Arabia)' },
      { code: 'hi-IN', name: 'Hindi (India)' }
    ];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    // State
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    language,
    
    // Actions
    startListening,
    stopListening,
    toggleListening,
    clearTranscript,
    changeLanguage,
    getAvailableLanguages,
    
    // Utilities
    isReady: isSupported && !error
  };
};

export default useWebSpeechAPI;
