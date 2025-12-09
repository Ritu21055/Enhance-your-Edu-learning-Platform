import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Container,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import { People, BugReport, Star, Psychology } from '@mui/icons-material';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getBackendUrl } from './config/network';
import { updateMeetingStatus } from './services/meetingsService';
import { formatMeetingCode } from './services/meetingCodeService';
import './css/MeetingRoom.css';

// Import custom hooks
import useVideoCall from './hooks/useVideoCall'; // New clean video call hook
import { useChat } from './hooks/useChat';
import { useMediaControls } from './hooks/useMediaControls';
import useSentimentAnalysis from './hooks/useSentimentAnalysis';
import useFatigueDetection from './hooks/useFatigueDetection';
import useScreenShare from './hooks/useScreenShare';
import ScreenShareViewer from './components/ScreenShareViewer';

// Import components
import VideoCall from './components/VideoCall'; // New clean video call component
import MeetingControls from './components/MeetingControls';
import ChatSidebar from './components/ChatSidebar';
import ParticipantsDialog from './components/ParticipantsDialog';
import SentimentDashboard from './components/SentimentDashboard';
import FatigueAlert from './components/FatigueAlert';
import AudioTroubleshooter from './components/AudioTroubleshooter';
import CompatibilityTestResults from './components/CompatibilityTestResults';
import QuestionSuggestion from './components/QuestionSuggestion';
import HostCameraRequest from './components/HostCameraRequest';
import ParticipantConsentDialog from './components/ParticipantConsentDialog';

// Import device compatibility utilities
import { runCompatibilityTest, getErrorMessage, getRecommendations } from './utils/deviceCompatibility';

// Import AI Follow-up Question Generation hook
import useAudioTranscription from './hooks/useAudioTranscription';

// Import Media Recorder hook
import useMediaRecorder from './hooks/useMediaRecorder';

// Import Highlight Marker hook
import useHighlightMarker from './hooks/useHighlightMarker';
import HighlightReminder from './components/HighlightReminder';
import HighlightDashboard from './components/HighlightDashboard';
import ShareHighlightReel from './components/ShareHighlightReel';

import AIHighlightNotification from './components/AIHighlightNotification';
import FreeTranscription from './components/FreeTranscription';

// Import Meeting Media Protection
import meetingMediaProtection from './utils/meetingMediaProtection';


// AI Features - Real-time Sentiment Analysis

const MeetingRoom = () => {
  const { meetingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userName = searchParams.get('user') || 'Guest';
  
  // If userName is empty or just whitespace, use Guest
  const finalUserName = userName && userName.trim() !== '' ? userName.trim() : 'Guest';
  
  // State for UI
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showSentimentDashboard, setShowSentimentDashboard] = useState(false);
  const [showAudioTroubleshooter, setShowAudioTroubleshooter] = useState(false);
  const [showVideoDebugPanel, setShowVideoDebugPanel] = useState(false);
  const [showCompatibilityTest, setShowCompatibilityTest] = useState(false);
  const [compatibilityResults, setCompatibilityResults] = useState(null);
  const [debugMenuAnchor, setDebugMenuAnchor] = useState(null);
  const [sentimentData, setSentimentData] = useState(null);
  
  // AI Follow-up Question Generation state
  const [suggestedQuestion, setSuggestedQuestion] = useState(null);
  const [showQuestionSuggestion, setShowQuestionSuggestion] = useState(false);
  const [isQuestionGenerationActive, setIsQuestionGenerationActive] = useState(false);
  
  // AI Status state
  const [aiStatus, setAiStatus] = useState(null);
  // Refs (localVideoRef comes from useWebRTC hook)

  // Custom hooks - Video Call (clean implementation)
  const {
    localStream,
    remoteStreams,
    participants,
    isConnected,
    localVideoRef,
    initializeMedia,
    isHost,
    socket,
    forceConnection,
    updateAllPeerConnections,
    participantMediaState,
    updateLocalStream
  } = useVideoCall(meetingId, finalUserName);


  // Expose update function for useMediaControls - persist even when socket disconnects
  useEffect(() => {
    if (updateAllPeerConnections) {
      window.updateVideoCallPeerConnections = updateAllPeerConnections;
      console.log('✅ MeetingRoom: Exposed updateVideoCallPeerConnections to window');
    }
    return () => {
      // Don't delete on cleanup - keep it available
      // delete window.updateVideoCallPeerConnections;
    };
  }, [updateAllPeerConnections]);

  // Expose local stream ref for screen share protection
  useEffect(() => {
    if (localStream) {
      window.localStreamRef = { current: localStream };
      window.streamRef = { current: localStream };
      console.log('✅ MeetingRoom: Exposed localStream to window for screen share protection');
    }
    return () => {
      // Keep ref available even after cleanup
    };
  }, [localStream]);
  
  // Note: Video state refs (isVideoEnabledRef, setIsVideoEnabled) are exposed to window
  // by useMediaControls hook itself - no need to expose them here

  // Screen sharing (separate hook - not part of video call)
  // Pass participants so screen share can create peer connections proactively
  const screenShareHook = useScreenShare(socket, meetingId, finalUserName, isHost, participants);
  
  const {
    isScreenSharing: isNewScreenSharing,
    screenStream: newScreenStream,
    remoteScreenStream: newRemoteScreenStream,
    screenShareParticipants: newScreenShareParticipants,
    screenShareError: newScreenShareError,
    startScreenShare: startNewScreenShare,
    stopScreenShare: stopNewScreenShare,
    setScreenShareError: setNewScreenShareError
  } = screenShareHook;
  
  // Map to expected variable names for compatibility
  const screenStream = newScreenStream;
  const remoteScreenStreams = newRemoteScreenStream ? { [socket?.id]: newRemoteScreenStream } : {};
  
  // Handle screen share change callback
  const handleScreenShareChange = useCallback((stream, isSharing) => {
    console.log('🖥️ MeetingRoom: handleScreenShareChange called', { isSharing, hasStream: !!stream, streamId: stream?.id });
    if (isSharing && stream) {
      console.log('🖥️ MeetingRoom: Starting screen share via useScreenShare hook with existing stream');
      // Pass the stream to the screen share hook so it can send it through peer connections
      // The hook will handle peer connections and sending to participants
      startNewScreenShare(stream); // Pass the stream from useMediaControls
    } else {
      console.log('🖥️ MeetingRoom: Stopping screen share');
      stopNewScreenShare();
    }
  }, [startNewScreenShare, stopNewScreenShare]);


  const {
    chatMessages,
    newMessage,
    sendMessage,
    handleNewMessageChange
  } = useChat(socket, meetingId, finalUserName);

  // AI Features - Sentiment Analysis (only for participants, not host)
  const {
    modelsLoaded,
    isAnalyzing,
    currentSentiment,
    error: sentimentError,
    startAnalysis,
    stopAnalysis
  } = useSentimentAnalysis(
    localVideoRef, // Analyze both host and participants' video
    socket, 
    meetingId, 
    finalUserName
  );

  // AI Features - Fatigue Detection (only for host)
  const {
    fatigueAlert,
    dismissFatigueAlert,
    fatigueHistory,
    isAnalyzing: isFatigueAnalyzing,
    isWarmupActive,
    triggerImmediateAnalysis
  } = useFatigueDetection(sentimentData, isHost, socket);


  // TEST: Add manual fatigue alert trigger for testing (host only)
  useEffect(() => {
    if (isHost && triggerImmediateAnalysis) {
      // Add a global function for testing fatigue alerts
      window.testFatigueAlert = () => {
        console.log('🧠 TEST: Manually triggering fatigue analysis...');
        triggerImmediateAnalysis();
      };
      
      console.log('🧠 TEST: Fatigue alert test function available at window.testFatigueAlert()');
    }
  }, [isHost, triggerImmediateAnalysis]);



  // Listen for sentiment dashboard updates (host only)
  useEffect(() => {
    if (!socket || !isHost) {
      console.log('📊 Not setting up sentiment listener:', { hasSocket: !!socket, isHost });
      return;
    }
    console.log('📊 Setting up sentiment dashboard listener for host');
    
    const handleSentimentUpdate = (data) => {
      console.log('📊 Received sentiment dashboard update:', data);
      console.log('📊 Sentiment data details:', {
        totalParticipants: data.totalParticipants,
        sentimentCounts: data.sentimentCounts,
        lastUpdated: new Date(data.lastUpdated).toLocaleTimeString()
      });
      setSentimentData(data);
    };

    const handleTestMessage = (data) => {
      console.log('🧪 Received test message from backend:', data);
    };

    socket.on('sentiment_dashboard_update', handleSentimentUpdate);
    socket.on('test_message', handleTestMessage);

    return () => {
      console.log('📊 Cleaning up sentiment dashboard listener');
      socket.off('sentiment_dashboard_update', handleSentimentUpdate);
      socket.off('test_message', handleTestMessage);
    };
  }, [socket, isHost]);

  // AI Follow-up Question Generation - Audio Transcription (needed for handleStartQuestionGeneration)
  const {
    isRecording: isTranscriptionRecording,
    transcript,
    isTranscribing,
    error: transcriptionError,
    startRecording: startTranscriptionRecording,
    stopRecording: stopTranscriptionRecording,
    clearTranscript
  } = useAudioTranscription(socket, meetingId);

  // AI Follow-up Question Generation - Control functions (defined early to avoid initialization errors)
  const handleStartQuestionGeneration = useCallback(() => {
    if (socket && meetingId) {
      console.log('🤖 Starting AI question generation...');
      console.log('🤖 Socket connected:', socket.connected);
      console.log('🤖 Meeting ID:', meetingId);
      console.log('🤖 Is Host:', isHost);
      
      socket.emit('start_question_generation', { meetingId });
      setIsQuestionGenerationActive(true);
      
      // Also start audio transcription for the host
      if (isHost) {
        console.log('🤖 Starting audio transcription for host...');
        startTranscriptionRecording();
      }
    } else {
      console.error('🤖 Cannot start AI question generation:', {
        hasSocket: !!socket,
        socketConnected: socket?.connected,
        meetingId,
        isHost
      });
    }
  }, [socket, meetingId, isHost, startTranscriptionRecording]);

  const handleStopQuestionGeneration = useCallback(() => {
    if (socket && meetingId) {
      console.log('🛑 Stopping AI question generation...');
      socket.emit('stop_question_generation', { meetingId });
      setIsQuestionGenerationActive(false);
      
      // Stop audio transcription
      stopTranscriptionRecording();
    }
  }, [socket, meetingId, stopTranscriptionRecording]);

  // AI Follow-up Question Generation - Listen for follow-up suggestions (host only)
  useEffect(() => {
    if (!socket || !isHost) {
      return;
    }

    const handleFollowUpSuggestion = (data) => {
      console.log('❓ Received follow-up suggestion:', data);
      setSuggestedQuestion(data);
      setShowQuestionSuggestion(true);
    };

    socket.on('follow_up_suggestion', handleFollowUpSuggestion);

    return () => {
      socket.off('follow_up_suggestion', handleFollowUpSuggestion);
    };
  }, [socket, isHost]);

  // AI Status - Listen for AI initialization status (host only)
  useEffect(() => {
    if (!socket || !isHost) {
      return;
    }

    const handleAIStatus = (data) => {
      console.log('🤖 Received AI status:', data);
      setAiStatus(data);
      
      // Auto-start question generation when AI is ready
      if (data.status === 'ready' && !isQuestionGenerationActive) {
        console.log('🤖 AI is ready, auto-starting question generation...');
        // Add a small delay to ensure everything is initialized
        setTimeout(() => {
          handleStartQuestionGeneration();
        }, 1000);
      }
    };

    socket.on('ai_status', handleAIStatus);

    return () => {
      socket.off('ai_status', handleAIStatus);
    };
  }, [socket, isHost, isQuestionGenerationActive, handleStartQuestionGeneration]);

  // Auto-start question generation for host when they join the meeting
  useEffect(() => {
    // Only auto-start for host
    if (!isHost) {
      return;
    }

    // Wait for all prerequisites to be ready
    if (!socket || !meetingId) {
      return;
    }

    // Don't auto-start if already active
    if (isQuestionGenerationActive) {
      return;
    }

    // Add a delay to ensure AI service is initialized
    const autoStartTimer = setTimeout(() => {
      console.log('🤖 Auto-starting AI question generation for host...');
      console.log('🤖 Prerequisites:', {
        isHost,
        hasSocket: !!socket,
        meetingId,
        currentStatus: isQuestionGenerationActive
      });

      // Start question generation automatically
      handleStartQuestionGeneration();
    }, 3000); // 3 second delay to ensure AI service is ready

    return () => {
      clearTimeout(autoStartTimer);
    };
  }, [isHost, socket, meetingId, isQuestionGenerationActive, handleStartQuestionGeneration]);


  // Start sentiment analysis when models are loaded and video is available (participants only)
  useEffect(() => {
    console.log('🧠 Sentiment Analysis Debug:', {
      isHost,
      modelsLoaded,
      hasLocalStream: !!localStream,
      hasLocalVideoRef: !!localVideoRef.current,
      isAnalyzing,
      sentimentError
    });
    
    // Silent sentiment analysis start for privacy (participants only)
    if (!isHost && modelsLoaded && localStream && localVideoRef.current && !isAnalyzing) {
      console.log('🧠 Starting sentiment analysis for participant...');
      startAnalysis();
    } else if (isHost) {
      console.log('🧠 Sentiment analysis disabled for host (privacy)');
    } else if (!modelsLoaded) {
      console.log('🧠 Models not loaded yet, waiting...');
    } else if (!localStream) {
      console.log('🧠 Local stream not available yet, waiting...');
    } else if (!localVideoRef.current) {
      console.log('🧠 Local video ref not available yet, waiting...');
    } else if (isAnalyzing) {
      console.log('🧠 Sentiment analysis already running');
    }
  }, [isHost, modelsLoaded, localStream, localVideoRef.current, isAnalyzing, startAnalysis, sentimentError]);

  // ENHANCED: Retry sentiment analysis when camera/mic access is granted
  useEffect(() => {
    if (!isHost && modelsLoaded && localStream && localVideoRef.current && !isAnalyzing) {
      // Add a delay to ensure video is properly loaded after camera access
      const retryTimeout = setTimeout(() => {
        console.log('🧠 Retrying sentiment analysis after camera access...');
        if (localVideoRef.current && localVideoRef.current.videoWidth > 0 && localVideoRef.current.videoHeight > 0) {
          console.log('🧠 Video dimensions are valid, starting sentiment analysis...');
          startAnalysis();
        } else {
          console.log('🧠 Video still not ready, will retry...');
        }
      }, 2000); // 2 second delay to let video stabilize

      return () => clearTimeout(retryTimeout);
    }
  }, [isHost, modelsLoaded, localStream, localVideoRef.current, isAnalyzing, startAnalysis]);

  // Debug logging
  console.log('🔍 MeetingRoom Debug:', {
    socket: !!socket,
    socketConnected: socket?.connected,
    isHost,
    chatMessages: chatMessages.length,
    sentimentAnalysis: {
      modelsLoaded: !isHost ? modelsLoaded : 'N/A (Host)',
      isAnalyzing: !isHost ? isAnalyzing : 'N/A (Host)',
      currentSentiment: !isHost ? currentSentiment : 'N/A (Host)',
      error: !isHost ? sentimentError : 'N/A (Host)'
    },
    sentimentData: sentimentData,
    showSentimentDashboard: showSentimentDashboard
  });

  // Note: useAudioTranscription hook is now called earlier (before handleStartQuestionGeneration)

  // Enhanced highlight system state (declared early to avoid initialization errors)
  const [highlights, setHighlights] = useState([]);
  const [meetingStartTime, setMeetingStartTime] = useState(Date.now());
  const [showHighlightDashboard, setShowHighlightDashboard] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [highlightReelData, setHighlightReelData] = useState(null);

  // Highlight Marker Hook
  const {
    markHighlight,
    showHighlightFeedback,
    feedbackMessage,
    clearFeedback
  } = useHighlightMarker(socket, meetingId, userName);

  // Media Controls Hook - Clean implementation
  const {
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing: isMediaControlsScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare
  } = useMediaControls(
    localStream,
    handleScreenShareChange,
    socket,
    meetingId,
    socket?.id
  );
  
  // Use screen sharing from media controls or fallback to screen share hook
  const isScreenSharing = isMediaControlsScreenSharing || isNewScreenSharing;

  // Media Recorder hook for real-time recording
  const {
    isRecording: isMediaRecording,
    recordingStatus,
    recordingError,
    startRecording: startMediaRecording,
    stopRecording: stopMediaRecording,
    toggleRecording,
    getRecordingInfo
  } = useMediaRecorder(socket, meetingId, localStream);

  // Debug recording status
  useEffect(() => {
    console.log('🎬 Recording status:', {
      isMediaRecording,
      recordingStatus,
      recordingError,
      hasLocalStream: !!localStream,
      hasSocket: !!socket,
      meetingId
    });
  }, [isMediaRecording, recordingStatus, recordingError, localStream, socket, meetingId]);

  // Meeting Media Protection - Start protection when meeting starts
  useEffect(() => {
    if (localStream && localVideoRef?.current && isConnected) {
      // Start protection
      meetingMediaProtection.startProtection(
        localStream,
        localVideoRef.current,
        isVideoEnabled,
        isAudioEnabled
      );

      // Force initial restore
      setTimeout(() => {
        meetingMediaProtection.forceRestoreVideo();
        meetingMediaProtection.forceRestoreAudio();
      }, 500);

      console.log('🛡️ Meeting Media Protection: Started for meeting', {
        meetingId,
        hasStream: !!localStream,
        hasVideoElement: !!localVideoRef.current,
        isVideoEnabled,
        isAudioEnabled
      });
    }

    // Cleanup on unmount or when meeting ends
    return () => {
      if (!isConnected) {
        meetingMediaProtection.stopProtection();
      }
    };
  }, [localStream, localVideoRef, isConnected, isVideoEnabled, isAudioEnabled, meetingId]);

  // Update protection state when media controls change
  useEffect(() => {
    if (meetingMediaProtection.isActive && localStream && localVideoRef?.current) {
      meetingMediaProtection.updateState(
        localStream,
        localVideoRef.current,
        isVideoEnabled,
        isAudioEnabled
      );
    }
  }, [isVideoEnabled, isAudioEnabled, localStream, localVideoRef]);

  // Auto-start recording for host when they join the meeting
  useEffect(() => {
    // Only auto-start for host
    if (!isHost) {
      return;
    }

    // Wait for all prerequisites to be ready
    if (!socket || !localStream || !meetingId) {
      return;
    }

    // Don't auto-start if already recording or if recording is in progress
    if (isMediaRecording || recordingStatus === 'starting' || recordingStatus === 'recording') {
      return;
    }

    // Add a small delay to ensure everything is initialized
    const autoStartTimer = setTimeout(() => {
      console.log('🎬 Auto-starting recording for host...');
      console.log('🎬 Prerequisites:', {
        isHost,
        hasSocket: !!socket,
        hasLocalStream: !!localStream,
        meetingId,
        currentRecordingStatus: recordingStatus,
        isCurrentlyRecording: isMediaRecording
      });

      // Start recording automatically
      if (startMediaRecording) {
        startMediaRecording().then(() => {
          console.log('✅ Auto-recording started successfully for host');
        }).catch((error) => {
          console.error('❌ Auto-recording failed:', error);
        });
      }
    }, 2000); // 2 second delay to ensure everything is ready

    return () => {
      clearTimeout(autoStartTimer);
    };
  }, [isHost, socket, localStream, meetingId, isMediaRecording, recordingStatus, startMediaRecording]);

  // Listen for highlight events
  useEffect(() => {
    if (!socket) return;

    const handleHighlightMarked = (data) => {
      console.log('⭐ Highlight marked:', data);
      setHighlights(prev => [...prev, {
        id: Date.now(),
        timestamp: data.timestamp,
        participantId: data.participantId,
        type: data.highlightType || 'important',
        description: data.description || '',
        totalHighlights: data.totalHighlights
      }]);
    };

    const handleHighlightReelStatus = (data) => {
      console.log('🎬 Highlight reel status:', data);
      if (data.status === 'success') {
        setHighlightReelData({
          id: data.meetingId,
          url: data.videoUrl,
          highlightCount: highlights.length,
          duration: data.duration || 'N/A',
          status: 'success'
        });
      }
    };

    socket.on('highlight_marked', handleHighlightMarked);
    socket.on('highlight_reel_status', handleHighlightReelStatus);

    return () => {
      socket.off('highlight_marked', handleHighlightMarked);
      socket.off('highlight_reel_status', handleHighlightReelStatus);
    };
  }, [socket, highlights.length]);

  // SimplePeer handles video setup automatically

  // Check media permissions
  const checkMediaPermissions = async () => {
    try {
      const permissions = await navigator.permissions.query({ name: 'camera' });
      console.log('🎥 Camera permission:', permissions.state);
      
      const micPermission = await navigator.permissions.query({ name: 'microphone' });
      console.log('🎥 Microphone permission:', micPermission.state);
    } catch (error) {
      console.log('🎥 Permission check failed:', error);
    }
  };

  // Manual media initialization for debugging
  const handleManualMediaInit = async () => {
    try {
      console.log('🎥 Manual media initialization started...');
      await checkMediaPermissions();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      console.log('🎥 Manual stream obtained:', {
        streamId: stream.id,
        trackCount: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('🎥 Manual: Stream set on video element');
      }
    } catch (error) {
      console.error('❌ Manual media init failed:', error);
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        constraint: error.constraint
      });
    }
  };

  // Debug participants and streams
  const handleDebugParticipants = () => {
    console.log('🔍 Debug Participants Info:', {
      participantsCount: participants.length,
      participants: participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
      remoteStreamsCount: Object.keys(remoteStreams).length,
      remoteStreams: Object.keys(remoteStreams),
      remoteStreamsDetails: Object.entries(remoteStreams).map(([id, stream]) => ({
        id,
        streamId: stream?.id,
        trackCount: stream?.getTracks()?.length,
        videoTracks: stream?.getVideoTracks()?.length,
        audioTracks: stream?.getAudioTracks()?.length
      })),
      currentUser: userName,
      isHost: isHost,
    });
  };

  // Run compatibility test
  const handleCompatibilityTest = async () => {
    try {
      console.log('🔍 Running compatibility test...');
      const results = await runCompatibilityTest(socket?.io?.uri || getBackendUrl());
      setCompatibilityResults(results);
      setShowCompatibilityTest(true);
      
      // Log results for debugging
      console.log('🔍 Compatibility test completed:', results);
      
      // Show warnings if any
      if (results.device.issues.length > 0) {
        console.warn('⚠️ Compatibility issues detected:', results.device.issues);
      }
      if (results.device.warnings.length > 0) {
        console.warn('⚠️ Compatibility warnings:', results.device.warnings);
      }
    } catch (error) {
      console.error('❌ Compatibility test failed:', error);
    }
  };

  // Note: handleStartQuestionGeneration and handleStopQuestionGeneration are now defined earlier
  // (before the useEffect hooks that use them) to avoid initialization errors

  const handleDismissQuestion = () => {
    setShowQuestionSuggestion(false);
    setSuggestedQuestion(null);
  };

  const handleUseQuestion = (question) => {
    console.log('✅ Using suggested question:', question);
    // Here you could add the question to chat or display it prominently
    // For now, we'll just log it
  };

  // Participants are now managed by the useWebRTC hook

  // Check host status when participants change
  // SimplePeer handles host status internally

  const handleRefreshStreams = () => {
    // SimplePeer handles stream management internally
    console.log('🔄 Refresh streams requested');
  };

  // Handle participant removal by host
  const handleRemoveParticipant = (participantId, participantName) => {
    console.log(`🗑️ MeetingRoom: handleRemoveParticipant called with:`, {
      participantId,
      participantName,
      isHost,
      hasSocket: !!socket,
      meetingId
    });

    if (!isHost) {
      console.log('❌ Only host can remove participants');
      alert('Only the host can remove participants');
      return;
    }

    if (!socket) {
      console.log('❌ No socket connection available');
      alert('No connection to server');
      return;
    }

    // Show confirmation dialog
    const confirmed = window.confirm(`Are you sure you want to remove ${participantName} from the meeting?`);
    if (!confirmed) {
      console.log('❌ User cancelled participant removal');
      return;
    }

    console.log(`🗑️ MeetingRoom: Host removing participant ${participantName} (${participantId})`);
    
    // Emit remove participant event to backend
    socket.emit('remove-participant', {
      meetingId,
      participantId
    });

    console.log(`🗑️ MeetingRoom: Emitted remove-participant event to backend`);
    
    // Add a timeout to check if the participant was actually removed
    setTimeout(() => {
      console.log(`🗑️ MeetingRoom: Checking if participant was removed after 2 seconds...`);
      const stillExists = participants.find(p => p.id === participantId);
      if (stillExists) {
        console.log(`❌ MeetingRoom: Participant ${participantName} still exists after removal attempt`);
        console.log(`❌ MeetingRoom: Current participants:`, participants.map(p => ({ id: p.id, name: p.name })));
      } else {
        console.log(`✅ MeetingRoom: Participant ${participantName} successfully removed`);
      }
    }, 2000);
  };

  return (
    <Container className="meeting-room" maxWidth={false}>
      <Box className="meeting-header">
        <Box className="meeting-header-left">
          <Typography variant="h4" className="meeting-title">
            Meeting: {formatMeetingCode(meetingId)}
          </Typography>
          <Typography variant="body1" className="meeting-subtitle">
            {isHost ? 'You are the host' : 'Participant'}
          </Typography>
        </Box>


        {/* AI Features - Sentiment Dashboard Toggle and Camera Request */}
        {isHost && (
          <Box className="ai-features-notification">
            <Button
              variant="contained"
              color="primary"
              className="ai-analytics-button"
              onClick={() => {
                console.log('🔘 AI Analytics button clicked!');
                console.log('🔘 Current showSentimentDashboard state:', showSentimentDashboard);
                console.log('🔘 Setting to:', !showSentimentDashboard);
                setShowSentimentDashboard(!showSentimentDashboard);
                
                // Clear sentiment data when hiding dashboard
                if (showSentimentDashboard) {
                  console.log('🧹 Clearing sentiment data');
                  setSentimentData(null);
                }
                
                // Log current meeting state for debugging
                console.log('🔍 Current meeting state:', {
                  isHost,
                  remoteStreams: remoteStreams.length,
                  sentimentData: sentimentData,
                  totalParticipants: remoteStreams.length + 1 // +1 for host
                });
                
                // Check if we should be receiving sentiment data
                if (isHost && remoteStreams.length > 0) {
                  console.log('⚠️ Host has participants but no sentiment data yet. Participants should be sending sentiment updates every 3 seconds.');
                  console.log('⚠️ Check if participants have: 1) Video on, 2) AI models loaded, 3) Sentiment analysis running');
                }
              }}
            >
              🧠 {showSentimentDashboard ? 'Hide' : 'Show'} AI Analytics
            </Button>
            
            {/* AI Status Display */}
            {aiStatus && (
              <Box sx={{ mt: 1, p: 1, backgroundColor: aiStatus.status === 'ready' ? '#e8f5e8' : aiStatus.status === 'limited' ? '#fff3cd' : '#f8d7da', borderRadius: 1, border: `1px solid ${aiStatus.status === 'ready' ? '#28a745' : aiStatus.status === 'limited' ? '#ffc107' : '#dc3545'}` }}>
                <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {aiStatus.status === 'ready' ? '✅' : aiStatus.status === 'limited' ? '⚠️' : '❌'}
                  <strong>AI Status:</strong> {aiStatus.message}
                </Typography>
              </Box>
            )}
            
            {/* Host Camera/Mic Request Component */}
            <HostCameraRequest
              isHost={isHost}
              socket={socket}
              meetingId={meetingId}
              participants={participants}
            />
          </Box>
        )}

        {/* Debug Tools Menu */}
        <Box className="debug-tools-notification">
          <Button
            variant="outlined"
            color="secondary"
            className="debug-tools-button"
            onClick={(e) => setDebugMenuAnchor(e.currentTarget)}
            startIcon={<BugReport />}
          >
            Debug Tools
          </Button>
          
          <Menu
            anchorEl={debugMenuAnchor}
            open={Boolean(debugMenuAnchor)}
            onClose={() => setDebugMenuAnchor(null)}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'left',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'left',
            }}
          >
            <MenuItem 
              onClick={() => {
                setShowAudioTroubleshooter(!showAudioTroubleshooter);
                setDebugMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                🔧
              </ListItemIcon>
              <ListItemText 
                primary={showAudioTroubleshooter ? 'Hide Audio Troubleshooter' : 'Show Audio Troubleshooter'}
                secondary="Diagnose audio issues"
              />
            </MenuItem>
            
            <MenuItem 
              onClick={() => {
                handleCompatibilityTest();
                setDebugMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                🔍
              </ListItemIcon>
              <ListItemText 
                primary="Run Device Compatibility Test"
                secondary="Check device capabilities"
              />
            </MenuItem>
            
            <MenuItem 
              onClick={() => {
                // Re-initialize media (includes audio)
                if (initializeMedia) {
                  initializeMedia().then(() => {
                    alert('Media re-initialized. Check if audio is now working.');
                  }).catch((err) => {
                    alert('Failed to re-initialize media: ' + err.message);
                  });
                } else {
                  alert('Media initialization function not available');
                }
                setDebugMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                🔄
              </ListItemIcon>
              <ListItemText 
                primary="Re-initialize Media"
                secondary="Re-initialize camera and microphone"
              />
            </MenuItem>
            
            <MenuItem 
              onClick={() => {
                if (window.forceLocalVideo) {
                  window.forceLocalVideo();
                  alert('Force local video attempted. Check if your video is now visible.');
                } else {
                  alert('Force local video function not available');
                }
                setDebugMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                📹
              </ListItemIcon>
              <ListItemText 
                primary="Force Local Video"
                secondary="Manually force local video stream assignment"
              />
            </MenuItem>
            
            <MenuItem 
              onClick={() => {
                if (window.debugVideoStatus) {
                  window.debugVideoStatus();
                  alert('Video status logged to console. Check browser console for details.');
                } else {
                  alert('Debug video status function not available');
                }
                setDebugMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                🔍
              </ListItemIcon>
              <ListItemText 
                primary="Debug Video Status"
                secondary="Check video stream and element status in console"
              />
            </MenuItem>
            
            <MenuItem 
              onClick={() => {
                setShowVideoDebugPanel(!showVideoDebugPanel);
                setDebugMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                🛠️
              </ListItemIcon>
              <ListItemText 
                primary={showVideoDebugPanel ? 'Hide Video Debug Panel' : 'Show Video Debug Panel'}
                secondary="Toggle video debugging tools panel"
              />
            </MenuItem>
            
            {isHost && (
              <MenuItem 
                onClick={() => {
                  // Force connection to all participants
                  if (forceConnection) {
                    forceConnection();
                    alert('Force connection attempted. Video should be re-shared to all participants.');
                  } else {
                    alert('Force connection function not available');
                  }
                  setDebugMenuAnchor(null);
                }}
              >
                <ListItemIcon>
                  📹
                </ListItemIcon>
                <ListItemText 
                  primary="Force Re-connect"
                  secondary="Force re-connection to all participants"
                />
              </MenuItem>
            )}
            
            
            {isHost && (
              <MenuItem 
                onClick={() => {
                  if (isQuestionGenerationActive) {
                    handleStopQuestionGeneration();
                  } else {
                    handleStartQuestionGeneration();
                  }
                  setDebugMenuAnchor(null);
                }}
              >
                <ListItemIcon>
                  {isQuestionGenerationActive ? '🛑' : '🤖'}
                </ListItemIcon>
                <ListItemText 
                  primary={isQuestionGenerationActive ? 'Stop AI Question Generation' : 'Start AI Question Generation'}
                  secondary={isQuestionGenerationActive ? 'Stop AI follow-up questions' : 'Enable AI follow-up questions'}
                />
              </MenuItem>
            )}
          </Menu>
        </Box>

        {/* AI Status removed for privacy - participants should not see analysis status */}

      </Box>

      {/* AI Features - Sentiment Dashboard */}
      {isHost && showSentimentDashboard && (
        <>
          <SentimentDashboard
            sentimentData={sentimentData}
            isVisible={showSentimentDashboard}
          />
          {/* Small waiting indicator when no participants */}
          {!sentimentData && (
            <Box className="sentiment-waiting-indicator">
              <Psychology className="psychology-icon" />
              <Typography variant="caption">
                Waiting for participants...
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* AI Features - Fatigue Alert */}
      <FatigueAlert
        fatigueAlert={fatigueAlert}
        onDismiss={dismissFatigueAlert}
        isVisible={!!fatigueAlert}
      />

      {/* AI Follow-up Question Generation - Question Suggestion */}
      {isHost && (
        <QuestionSuggestion
          question={suggestedQuestion?.question}
          topics={suggestedQuestion?.topics}
          sentiment={suggestedQuestion?.sentiment}
          confidence={suggestedQuestion?.confidence}
          timestamp={suggestedQuestion?.timestamp}
          model={suggestedQuestion?.model}
          onDismiss={handleDismissQuestion}
          onUseQuestion={handleUseQuestion}
          isVisible={showQuestionSuggestion}
        />
      )}


      {/* Participant Consent Dialog */}
      <ParticipantConsentDialog
        socket={socket}
        meetingId={meetingId}
        currentUserId={socket?.id}
        onCameraMicToggle={(isActive, stream) => {
          console.log('📹 Camera/Mic toggled:', { isActive, stream, hasUpdateLocalStream: !!updateLocalStream });
          if (isActive && stream) {
            // Replace the local stream with the new stream from consent dialog
            console.log('🔄 Replacing local stream with consent stream');
            
            // Update the local stream in useVideoCall hook
            if (updateLocalStream) {
              updateLocalStream(stream);
              console.log('✅ Consent stream integrated with peer connections');
            } else {
              console.error('❌ updateLocalStream function not available');
            }
          } else {
            // Turn off camera/mic - session ended
            console.log('🔄 Camera/Mic session ended - stopping consent stream');
            if (window.consentStream) {
              // Stop the consent stream
              window.consentStream.getTracks().forEach(track => {
                track.stop();
                console.log('🔄 Stopped consent stream track:', track.kind);
              });
              window.consentStream = null;
            }
            
            // Note: The original stream should be restored by the participant manually
            // or the system will reinitialize when needed
            console.log('✅ Consent stream stopped');
          }
        }}
      />

      {/* Highlight Toast Notification */}
      {showHighlightFeedback && (
        <div className="highlight-toast">
          {feedbackMessage}
        </div>
      )}

      {/* Audio Troubleshooter */}
      <AudioTroubleshooter
        localStream={localStream}
        remoteStreams={remoteStreams}
        isVisible={showAudioTroubleshooter}
        onClose={() => setShowAudioTroubleshooter(false)}
      />

      {/* Compatibility Test Results */}
      <CompatibilityTestResults
        open={showCompatibilityTest}
        onClose={() => setShowCompatibilityTest(false)}
        results={compatibilityResults}
        onRetest={handleCompatibilityTest}
      />
      
      {/* Debug info for dashboard visibility */}
      {console.log('🔍 Dashboard Debug:', {
        isHost,
        showSentimentDashboard,
        shouldRender: isHost && showSentimentDashboard,
        sentimentData,
        fatigueAlert: !!fatigueAlert,
        isFatigueAnalyzing
      })}

      <Box className="video-main-area">
        {/* Clean Video Call Component - CRITICAL: Stable key to prevent remounting */}
        <VideoCall
          key="video-call-stable" // Stable key prevents remounting when chat opens
          localStream={localStream}
          remoteStreams={remoteStreams}
          localVideoRef={localVideoRef}
          participants={participants}
          currentUserId={socket?.id}
          isVideoEnabled={isVideoEnabled}
          participantMediaState={participantMediaState}
        />
        
      </Box>


      {/* Free Transcription for AI Question Generation */}
      <FreeTranscription
        socket={socket}
        meetingId={meetingId}
        participantId={socket?.id}
        isVisible={true}
        onTranscriptUpdate={(transcript, confidence) => {
          console.log('📝 Transcript update received:', { transcript, confidence });
        }}
      />

      {/* AI Highlight Notifications */}
      <AIHighlightNotification
        socket={socket}
        meetingId={meetingId}
      />

      {/* Chat Sidebar */}
      {showChat && (
        <ChatSidebar
          chatMessages={chatMessages}
          newMessage={newMessage}
          onNewMessageChange={handleNewMessageChange}
          onSendMessage={sendMessage}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Meeting Controls */}
      <MeetingControls
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          isScreenSharing={isScreenSharing}
          showChat={showChat}
          showParticipants={showParticipants}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onToggleChat={() => {
            // SIMPLE - Just toggle chat state, nothing else
            // Video is protected by React.memo on VideoCall component
            console.log('💬 Chat toggle:', !showChat);
            const newChatState = !showChat;
            setShowChat(newChatState);
            
            // CRITICAL: Immediately protect video when chat state changes
            setTimeout(() => {
              if (localStream && localVideoRef?.current) {
                const videoElement = localVideoRef.current;
                const videoTrack = localStream.getVideoTracks()[0];
                
                if (videoTrack && isVideoEnabled) {
                  // Force video to stay on
                  if (!videoTrack.enabled) {
                    console.warn('🛡️ MeetingRoom: Chat toggle - track disabled, re-enabling');
                    videoTrack.enabled = true;
                  }
                  
                  if (videoElement.srcObject !== localStream) {
                    console.warn('🛡️ MeetingRoom: Chat toggle - srcObject lost, restoring');
                    videoElement.srcObject = localStream;
                  }
                  
                  // Force visibility
                  videoElement.style.opacity = '1';
                  videoElement.style.visibility = 'visible';
                  videoElement.style.display = 'block';
                  
                  // Force play
                  if (videoElement.paused) {
                    videoElement.play().catch(() => {});
                  }
                }
              }
            }, 0);
          }}
          localStream={localStream}
          onToggleParticipants={() => {
            // SIMPLE - Just toggle participants state, nothing else
            // Video is protected by React.memo on VideoCall component
            console.log('👥 Participants toggle:', !showParticipants);
            const newParticipantsState = !showParticipants;
            setShowParticipants(newParticipantsState);
            
            // CRITICAL: Immediately protect video when participants state changes
            setTimeout(() => {
              if (localStream && localVideoRef?.current) {
                const videoElement = localVideoRef.current;
                const videoTrack = localStream.getVideoTracks()[0];
                
                if (videoTrack && isVideoEnabled) {
                  // Force video to stay on
                  if (!videoTrack.enabled) {
                    console.warn('🛡️ MeetingRoom: Participants toggle - track disabled, re-enabling');
                    videoTrack.enabled = true;
                  }
                  
                  if (videoElement.srcObject !== localStream) {
                    console.warn('🛡️ MeetingRoom: Participants toggle - srcObject lost, restoring');
                    videoElement.srcObject = localStream;
                  }
                  
                  // Force visibility
                  videoElement.style.opacity = '1';
                  videoElement.style.visibility = 'visible';
                  videoElement.style.display = 'block';
                  
                  // Force play
                  if (videoElement.paused) {
                    videoElement.play().catch(() => {});
                  }
                }
              }
            }, 0);
          }}
          onMarkHighlight={(highlightType) => {
            // SIMPLE - Mark highlight, but protect video
            console.log('⭐ Mark highlight:', highlightType);
            
            // CRITICAL: Capture video state BEFORE any operations
            const videoTrack = localStream?.getVideoTracks()[0];
            const videoWasEnabled = isVideoEnabled;
            
            // CRITICAL: Protect video SYNCHRONOUSLY before calling markHighlight
            if (localStream && localVideoRef?.current) {
              const videoElement = localVideoRef.current;
              
              if (videoTrack && videoWasEnabled) {
                // Force video to stay on immediately (synchronous)
                if (!videoTrack.enabled) {
                  console.warn('🛡️ MeetingRoom: Mark highlight - track disabled, re-enabling immediately');
                  videoTrack.enabled = true;
                }
                
                if (videoElement.srcObject !== localStream) {
                  console.warn('🛡️ MeetingRoom: Mark highlight - srcObject lost, restoring immediately');
                  videoElement.srcObject = localStream;
                }
                
                // Force visibility
                videoElement.style.opacity = '1';
                videoElement.style.visibility = 'visible';
                videoElement.style.display = 'block';
              }
            }
            
            // CRITICAL: Also protect using requestAnimationFrame for immediate browser update
            requestAnimationFrame(() => {
              if (localStream && localVideoRef?.current) {
                const videoElement = localVideoRef.current;
                
                if (videoTrack && videoWasEnabled) {
                  if (!videoTrack.enabled) {
                    videoTrack.enabled = true;
                  }
                  
                  if (videoElement.srcObject !== localStream) {
                    videoElement.srcObject = localStream;
                  }
                  
                  videoElement.style.opacity = '1';
                  videoElement.style.visibility = 'visible';
                  videoElement.style.display = 'block';
                  
                  if (videoElement.paused) {
                    videoElement.play().catch(() => {});
                  }
                }
              }
            });
            
            // Call the original markHighlight function
            markHighlight(highlightType);
            
            // CRITICAL: Multiple protection checks after highlight is marked
            setTimeout(() => {
              if (localStream && localVideoRef?.current) {
                const videoElement = localVideoRef.current;
                
                if (videoTrack && videoWasEnabled) {
                  // Force video to stay on
                  if (!videoTrack.enabled) {
                    console.warn('🛡️ MeetingRoom: Mark highlight - track disabled, re-enabling');
                    videoTrack.enabled = true;
                  }
                  
                  if (videoElement.srcObject !== localStream) {
                    console.warn('🛡️ MeetingRoom: Mark highlight - srcObject lost, restoring');
                    videoElement.srcObject = localStream;
                  }
                  
                  // Force visibility
                  videoElement.style.opacity = '1';
                  videoElement.style.visibility = 'visible';
                  videoElement.style.display = 'block';
                  
                  // Force play
                  if (videoElement.paused) {
                    videoElement.play().catch(() => {});
                  }
                }
              }
            }, 0);
            
            // Additional checks
            setTimeout(() => {
              if (localStream && localVideoRef?.current) {
                const videoElement = localVideoRef.current;
                
                if (videoTrack && videoWasEnabled) {
                  if (!videoTrack.enabled) {
                    videoTrack.enabled = true;
                  }
                  if (videoElement.srcObject !== localStream) {
                    videoElement.srcObject = localStream;
                  }
                  videoElement.style.opacity = '1';
                  videoElement.style.visibility = 'visible';
                  videoElement.style.display = 'block';
                  if (videoElement.paused) {
                    videoElement.play().catch(() => {});
                  }
                }
              }
            }, 50);
            
            setTimeout(() => {
              if (localStream && localVideoRef?.current) {
                const videoElement = localVideoRef.current;
                
                if (videoTrack && videoWasEnabled) {
                  if (!videoTrack.enabled) {
                    videoTrack.enabled = true;
                  }
                  if (videoElement.srcObject !== localStream) {
                    videoElement.srcObject = localStream;
                  }
                  videoElement.style.opacity = '1';
                  videoElement.style.visibility = 'visible';
                  videoElement.style.display = 'block';
                  if (videoElement.paused) {
                    videoElement.play().catch(() => {});
                  }
                }
              }
            }, 200);
          }}
          isRecording={isMediaRecording}
          onToggleRecording={toggleRecording}
          recordingStatus={recordingStatus}
          recordingError={recordingError}
          onLeaveMeeting={() => {
            // Update meeting status when leaving
            if (isHost) {
              updateMeetingStatus(meetingId, 'completed', Date.now());
            }
            navigate('/');
          }}
          isHost={isHost}
          // AI Question Generation props
          isQuestionGenerationActive={isQuestionGenerationActive}
          onToggleQuestionGeneration={() => {
            // SIMPLE - Toggle AI question generation, but protect video
            console.log('🤖 AI Question toggle:', !isQuestionGenerationActive);
            
            if (isQuestionGenerationActive) {
              handleStopQuestionGeneration();
            } else {
              handleStartQuestionGeneration();
            }
            
            // CRITICAL: Immediately protect video when AI question state changes
            setTimeout(() => {
              if (localStream && localVideoRef?.current) {
                const videoElement = localVideoRef.current;
                const videoTrack = localStream.getVideoTracks()[0];
                
                if (videoTrack && isVideoEnabled) {
                  // Force video to stay on
                  if (!videoTrack.enabled) {
                    console.warn('🛡️ MeetingRoom: AI Question toggle - track disabled, re-enabling');
                    videoTrack.enabled = true;
                  }
                  
                  if (videoElement.srcObject !== localStream) {
                    console.warn('🛡️ MeetingRoom: AI Question toggle - srcObject lost, restoring');
                    videoElement.srcObject = localStream;
                  }
                  
                  // Force visibility
                  videoElement.style.opacity = '1';
                  videoElement.style.visibility = 'visible';
                  videoElement.style.display = 'block';
                  
                  // Force play
                  if (videoElement.paused) {
                    videoElement.play().catch(() => {});
                  }
                }
              }
            }, 0);
          }}
        />

      {/* Participants Dialog */}
      <ParticipantsDialog
        open={showParticipants}
        onClose={() => setShowParticipants(false)}
        participants={participants}
        userName={userName}
      />

      {/* Enhanced Highlight System Components */}
      
      {/* Highlight Reminder - Disabled to reduce notifications */}
      {/* <HighlightReminder
        meetingDuration={Date.now() - meetingStartTime}
        highlightCount={highlights.length}
        onMarkHighlight={markHighlight}
        isVisible={!isWaitingForApproval}
      /> */}

      {/* Small Highlight Indicator - Top right corner */}
      {isHost && highlights.length > 0 && (
        <Box
          className="highlight-indicator"
          onClick={() => setShowHighlightDashboard(!showHighlightDashboard)}
        >
          <Star className="star-icon" />
          <Typography variant="body2" className="bold-text">
            {highlights.length} Highlight{highlights.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
      )}

      {/* Highlight Dashboard - Only show when explicitly requested by host */}
      {isHost && showHighlightDashboard && highlights.length > 0 && (
        <HighlightDashboard
          highlights={highlights}
          meetingDuration={Date.now() - meetingStartTime}
          onPlayHighlight={(highlight) => {
            // Jump to highlight timestamp in video
            console.log('🎬 Playing highlight:', highlight);
          }}
          isExpanded={showHighlightDashboard}
          onToggleExpanded={() => setShowHighlightDashboard(!showHighlightDashboard)}
        />
      )}

      {/* Share Highlight Reel Dialog */}
      <ShareHighlightReel
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        highlightReel={highlightReelData}
        meetingTitle={`Meeting ${meetingId}`}
      />

      {/* Screen Share Viewer - Show when there's active screen sharing (local or remote) */}
      {(isNewScreenSharing || newRemoteScreenStream) && (
        <ScreenShareViewer
          isScreenSharing={isNewScreenSharing}
          screenStream={newScreenStream}
          remoteScreenStream={newRemoteScreenStream}
          screenShareParticipants={newScreenShareParticipants}
          onStartScreenShare={startNewScreenShare}
          onStopScreenShare={stopNewScreenShare}
          userName={finalUserName}
        />
      )}

      {/* Video Debug Panel */}
      {showVideoDebugPanel && (
        <Box
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '300px',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '20px',
            borderRadius: '8px',
            zIndex: 9999,
            border: '2px solid #4CAF50',
            fontFamily: 'monospace',
            fontSize: '12px'
          }}
        >
          <Typography variant="h6" style={{ marginBottom: '15px', color: '#4CAF50' }}>
            🛠️ Video Debug Panel
          </Typography>
          
          <Box style={{ marginBottom: '15px' }}>
            <Typography variant="body2" style={{ marginBottom: '5px' }}>
              <strong>Local Stream:</strong> {localStream ? '✅ Available' : '❌ Not Available'}
            </Typography>
            <Typography variant="body2" style={{ marginBottom: '5px' }}>
              <strong>Video Element:</strong> {localVideoRef?.current ? '✅ Found' : '❌ Not Found'}
            </Typography>
            <Typography variant="body2" style={{ marginBottom: '5px' }}>
              <strong>Remote Streams:</strong> {Object.keys(remoteStreams).length} participant(s)
            </Typography>
            <Typography variant="body2" style={{ marginBottom: '5px' }}>
              <strong>Participants:</strong> {participants.length} total
            </Typography>
            <Typography variant="body2" style={{ marginBottom: '5px' }}>
              <strong>Is Host:</strong> {isHost ? '✅ Yes' : '❌ No'}
            </Typography>
          </Box>
          
          <Box style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => {
                if (window.forceLocalVideo) {
                  window.forceLocalVideo();
                } else {
                  alert('Force local video function not available');
                }
              }}
              style={{ fontSize: '11px' }}
            >
              🔧 Force Local Video
            </Button>
            
            <Button
              variant="contained"
              color="secondary"
              size="small"
              onClick={() => {
                if (window.debugVideoStatus) {
                  window.debugVideoStatus();
                } else {
                  alert('Debug video status function not available');
                }
              }}
              style={{ fontSize: '11px' }}
            >
              🔍 Debug Video Status
            </Button>
            
            <Button
              variant="contained"
              color="warning"
              size="small"
              onClick={() => {
                if (initializeMedia) {
                  initializeMedia();
                  alert('Media initialization attempted');
                } else {
                  alert('Initialize media function not available');
                }
              }}
              style={{ fontSize: '11px' }}
            >
              🎥 Re-initialize Media
            </Button>
            
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => setShowVideoDebugPanel(false)}
              style={{ fontSize: '11px' }}
            >
              ❌ Close Panel
            </Button>
          </Box>
        </Box>
      )}

    </Container>
  );
};

export default MeetingRoom;
