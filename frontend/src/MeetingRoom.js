import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Container,
  Button,
  Snackbar,
  Alert
} from '@mui/material';
import { People, Psychology, Videocam, Mic } from '@mui/icons-material';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getBackendUrl } from './config/network';
import { updateMeetingStatus } from './services/meetingsService';
import { formatMeetingCode } from './services/meetingCodeService';
import './css/MeetingRoom.css';

// Import custom hooks
import useVideoCall from './hooks/useVideoCall'; // New clean video call hook
import { useChat } from './hooks/useChat';
import { useMediaControls } from './hooks/useMediaControls';
import { useMediaRequest } from './hooks/useMediaRequest';
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
import MediaRequestDialog from './components/MediaRequestDialog';
import MediaRequestNotification from './components/MediaRequestNotification';
// import RecordingNotification from './components/RecordingNotification'; // REMOVED: Recording feature
import QuestionSuggestion from './components/QuestionSuggestion';

// REMOVED: useAudioTranscription - Now using Web Speech API (FreeTranscription) instead
// import useAudioTranscription from './hooks/useAudioTranscription';

// Import Media Recorder hook
// import useMediaRecorder from './hooks/useMediaRecorder'; // REMOVED: Recording feature

// REMOVED: Highlight detection feature
// import useHighlightMarker from './hooks/useHighlightMarker';
// import HighlightReminder from './components/HighlightReminder';
// import HighlightDashboard from './components/HighlightDashboard';
// import ShareHighlightReel from './components/ShareHighlightReel';
// import AIHighlightNotification from './components/AIHighlightNotification';
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
  const [sentimentData, setSentimentData] = useState(null);
  
  // AI Follow-up Question Generation state
  const [suggestedQuestion, setSuggestedQuestion] = useState(null);
  const [showQuestionSuggestion, setShowQuestionSuggestion] = useState(false);
  const [isQuestionGenerationActive, setIsQuestionGenerationActive] = useState(false);
  
  // AI Status (used only for auto-start question generation - not displayed in UI)
  const [aiStatus, setAiStatus] = useState(null);

  // Media Request Feature State
  const [showMediaRequestDialog, setShowMediaRequestDialog] = useState(false);
  // Show Transcription panel (opened from header button)
  const [showTranscriptionPanel, setShowTranscriptionPanel] = useState(false);
  
  // Recording Notification State (for participants)
  // REMOVED: Recording feature
  // const [recordingNotification, setRecordingNotification] = useState({
  //   open: false,
  //   isRecording: false
  // });
  
  // Refs (localVideoRef comes from useWebRTC hook)
  const rollbackScreenShareRef = useRef(null);

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
    participantMediaState
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
  
  // Expose localVideoRef to window for ParticipantConsentDialog
  useEffect(() => {
    if (localVideoRef) {
      window.localVideoRef = localVideoRef;
      console.log('✅ MeetingRoom: Exposed localVideoRef to window');
    }
    return () => {
      // Keep ref available even after cleanup
    };
  }, [localVideoRef]);

  // CRITICAL: PERMANENT FIX - Expose isHost to window for VideoCall protection
  useEffect(() => {
    window.isHost = isHost;
    window.isHostRef = { current: isHost };
    console.log('✅ MeetingRoom: Exposed isHost to window for permanent video protection:', isHost);
    return () => {
      // Keep ref available even after cleanup
    };
  }, [isHost]);

  // CRITICAL: PERMANENT FIX - Expose participants to window for VideoCall protection
  useEffect(() => {
    window.participantsRef = { current: participants };
    console.log('✅ MeetingRoom: Exposed participants to window for host video protection:', participants.length);
    return () => {
      // Keep ref available even after cleanup
    };
  }, [participants]);

  // Handle participant-removed event (when host removes this participant)
  useEffect(() => {
    if (!socket) return;

    const handleParticipantRemoved = (data) => {
      const { message, meetingId: removedMeetingId, hostName } = data;
      
      console.log('🚫 Participant removed from meeting:', {
        message,
        meetingId: removedMeetingId,
        hostName
      });

      // Show notification
      alert(message || 'You have been removed from the meeting by the host');

      // End meeting and navigate away
      setTimeout(() => {
        navigate('/');
      }, 1000);
    };

    socket.on('participant-removed', handleParticipantRemoved);

    return () => {
      socket.off('participant-removed', handleParticipantRemoved);
    };
  }, [socket, navigate]);
  
  // Note: Video state refs (isVideoEnabledRef, setIsVideoEnabled) are exposed to window
  // by useMediaControls hook itself - no need to expose them here

  // Screen sharing (separate hook - not part of video call)
  // Pass participants so screen share can create peer connections proactively
  const screenShareHook = useScreenShare(socket, meetingId, finalUserName, isHost, participants, () => rollbackScreenShareRef.current?.());
  
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

  useEffect(() => {
    rollbackScreenShareRef.current = () => handleScreenShareChange(null, false);
    return () => { rollbackScreenShareRef.current = null; };
  }, [handleScreenShareChange]);

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

  // REMOVED: useAudioTranscription - Now using Web Speech API (FreeTranscription) instead
  // The FreeTranscription component automatically sends transcript_update events to the backend
  // No need for separate audio transcription hook

  // AI Follow-up Question Generation - Control functions (defined early to avoid initialization errors)
  const handleStartQuestionGeneration = useCallback(() => {
    if (socket && meetingId) {
      console.log('🤖 Starting AI question generation...');
      console.log('🤖 Socket connected:', socket.connected);
      console.log('🤖 Meeting ID:', meetingId);
      console.log('🤖 Is Host:', isHost);
      
      socket.emit('start_question_generation', { meetingId });
      setIsQuestionGenerationActive(true);
      
      // REMOVED: startTranscriptionRecording() - Now using Web Speech API (FreeTranscription)
      // The FreeTranscription component automatically sends transcript_update events to the backend
      // No need to manually start audio transcription
      console.log('🤖 AI question generation started - using Web Speech API for transcription');
    } else {
      console.error('🤖 Cannot start AI question generation:', {
        hasSocket: !!socket,
        socketConnected: socket?.connected,
        meetingId,
        isHost
      });
    }
  }, [socket, meetingId, isHost]);

  const handleStopQuestionGeneration = useCallback(() => {
    if (socket && meetingId) {
      console.log('🛑 Stopping AI question generation...');
      socket.emit('stop_question_generation', { meetingId });
      setIsQuestionGenerationActive(false);
      
      // REMOVED: stopTranscriptionRecording() - Now using Web Speech API (FreeTranscription)
      // The FreeTranscription component handles its own lifecycle
    }
  }, [socket, meetingId]);

  // AI Follow-up Question Generation - Listen for follow-up suggestions (host only)
  useEffect(() => {
    if (!socket || !isHost) {
      return;
    }

    const handleFollowUpSuggestion = (data) => {
      console.log('\n' + '='.repeat(80));
      console.log('❓ [FRONTEND] Received follow_up_suggestion event:', {
        meetingId: data.meetingId,
        question: data.question,
        questionLength: data.question?.length,
        model: data.model,
        topics: data.topics,
        sentiment: data.sentiment,
        confidence: data.confidence,
        timestamp: data.timestamp,
        responseTime: data.responseTime
      });
      console.log('❓ [FRONTEND] Setting question state...');
      setSuggestedQuestion(data);
      setShowQuestionSuggestion(true);
      console.log('✅ [FRONTEND] Question state updated - should be visible now');
      console.log('='.repeat(80) + '\n');
    };

    const handleClearQuestion = (data) => {
      console.log('\n' + '='.repeat(80));
      console.log('🧹 [FRONTEND] Received clear_question event:', data);
      console.log('🧹 [FRONTEND] Clearing question display...');
      setSuggestedQuestion(null);
      setShowQuestionSuggestion(false);
      console.log('✅ [FRONTEND] Question cleared from display');
      console.log('='.repeat(80) + '\n');
    };

    socket.on('follow_up_suggestion', handleFollowUpSuggestion);
    socket.on('clear_question', handleClearQuestion);

    return () => {
      socket.off('follow_up_suggestion', handleFollowUpSuggestion);
      socket.off('clear_question', handleClearQuestion);
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

  // REMOVED: Auto-start question generation
  // Questions will only start when host manually clicks the button
  // This prevents questions from appearing before actual conversation starts


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
  // REMOVED: Highlight detection feature
  // const [showHighlightDashboard, setShowHighlightDashboard] = useState(false);
  // const [showShareDialog, setShowShareDialog] = useState(false);
  // const [highlightReelData, setHighlightReelData] = useState(null);
  // const { markHighlight, showHighlightFeedback, feedbackMessage, clearFeedback } = useHighlightMarker(socket, meetingId, userName);

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
    socket?.id,
    setNewScreenShareError
  );
  
  // Use screen sharing from media controls or fallback to screen share hook
  const isScreenSharing = isMediaControlsScreenSharing || isNewScreenSharing;

  // Media Request Hook (for participants to receive requests)
  const { pendingRequest, activeRequest, acceptRequest, denyRequest } = useMediaRequest(
    socket,
    meetingId,
    isHost,
    localStream
  );

  // Lock states - using activeRequest from useMediaRequest hook (for participants)
  // Default to false if activeRequest is not available
  // requestType is 'both' for camera and mic access
  const isAudioLocked = !isHost && activeRequest ? 
    (activeRequest.requestType === 'mic' || activeRequest.requestType === 'both' || activeRequest.requestType === 'audio') : false;
  const isVideoLocked = !isHost && activeRequest ? 
    (activeRequest.requestType === 'camera' || activeRequest.requestType === 'both' || activeRequest.requestType === 'video') : false;

  // Update window refs for useMediaControls
  useEffect(() => {
    window.isAudioLocked = isAudioLocked;
    window.isVideoLocked = isVideoLocked;
    console.log('🔒 MeetingRoom: Lock states updated', {
      isAudioLocked,
      isVideoLocked,
      hasActiveRequest: !!activeRequest,
      activeRequest: activeRequest
    });
  }, [isAudioLocked, isVideoLocked, activeRequest]);

  // Media Recorder hook for real-time recording
  // REMOVED: Recording feature
  // const {
  //   isRecording: isMediaRecording,
  //   recordingStatus,
  //   recordingError,
  //   startRecording: startMediaRecording,
  //   stopRecording: stopMediaRecording,
  //   toggleRecording,
  //   getRecordingInfo
  // } = useMediaRecorder(socket, meetingId, localStream, remoteStreams, localVideoRef, finalUserName);

  // Debug recording status
  // REMOVED: Recording feature
  // useEffect(() => {
  //   console.log('🎬 Recording status:', {
  //     isMediaRecording,
  //     recordingStatus,
  //     recordingError,
  //     hasLocalStream: !!localStream,
  //     hasSocket: !!socket,
  //     meetingId
  //   });
  // }, [isMediaRecording, recordingStatus, recordingError, localStream, socket, meetingId]);

  // Listen for recording notifications (for participants)
  // REMOVED: Recording feature
  // useEffect(() => {
  //   if (!socket || isHost) return; // Only for participants
  //   const handleRecordingStarted = (data) => { ... };
  //   const handleRecordingStopped = (data) => { ... };
  //   socket.on('recording_started', handleRecordingStarted);
  //   socket.on('recording_stopped', handleRecordingStopped);
  //   return () => { ... };
  // }, [socket, isHost]);

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

  // Recording should only start when host manually clicks the recording button
  // No auto-start - removed to allow host control

  // REMOVED: Highlight events listeners - Feature removed

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
        
        {/* Header actions: host-only (Request Camera/Mic, Show Analytics) + Show Transcription for all */}
        <Box className="ai-features-notification" sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          {isHost && (
            <>
              <Button
                variant="contained"
                color="primary"
                className="ai-analytics-button"
                onClick={() => setShowMediaRequestDialog(true)}
                startIcon={<><Videocam /><Mic /></>}
              >
                Request Camera/Mic Access
              </Button>

              <Button
                variant="contained"
                color="primary"
                className="ai-analytics-button"
                onClick={() => setShowSentimentDashboard(!showSentimentDashboard)}
                startIcon={<Psychology />}
                sx={{
                  backgroundColor: showSentimentDashboard ? '#5a67d8' : '#667eea',
                  '&:hover': {
                    backgroundColor: showSentimentDashboard ? '#4c51bf' : '#5a67d8'
                  }
                }}
              >
                {showSentimentDashboard ? 'Hide Analytics' : 'Show Analytics'}
              </Button>
            </>
          )}

          <Button
            variant="contained"
            color="primary"
            className="ai-analytics-button"
            onClick={() => setShowTranscriptionPanel(true)}
            startIcon={<Mic />}
            sx={{
              backgroundColor: '#7c3aed',
              '&:hover': { backgroundColor: '#6d28d9' }
            }}
          >
            Show Transcription
          </Button>
        </Box>
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



      {/* REMOVED: Highlight Toast Notification - Feature removed */}

      
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


      {/* Free Transcription - opened from header "Show Transcription" or floating button */}
      <FreeTranscription
        socket={socket}
        meetingId={meetingId}
        participantId={socket?.id}
        participantName={finalUserName}
        isVisible={showTranscriptionPanel}
        onClose={() => setShowTranscriptionPanel(false)}
        onTranscriptUpdate={(transcript, confidence) => {
          console.log('📝 Transcript update received:', { transcript, confidence });
        }}
      />

      {/* REMOVED: AI Highlight Notifications - Feature removed */}

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
          // REMOVED: onMarkHighlight prop - Feature removed
          // REMOVED: Recording feature
          // isRecording={isMediaRecording}
          // onToggleRecording={toggleRecording}
          // recordingStatus={recordingStatus}
          // recordingError={recordingError}
          onLeaveMeeting={() => {
            // Update meeting status when leaving
            if (isHost) {
              // CRITICAL FIX: Emit end_meeting event to backend to generate notes
              if (socket) {
                console.log('🏁 Host ending meeting, emitting end_meeting event...');
                socket.emit('end_meeting', { meetingId });
              }
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
          isAudioLocked={isAudioLocked}
          isVideoLocked={isVideoLocked}
        />


      {/* Participants Dialog */}
      <ParticipantsDialog
        open={showParticipants}
        onClose={() => setShowParticipants(false)}
        participants={participants}
        userName={finalUserName}
        isHost={isHost}
        socket={socket}
        meetingId={meetingId}
        participantMediaState={participantMediaState}
        currentUserId={socket?.id}
      />

      {/* Media Request Dialog (Host) */}
      {isHost && (
        <MediaRequestDialog
          open={showMediaRequestDialog}
          onClose={() => setShowMediaRequestDialog(false)}
          participants={participants}
          socket={socket}
          meetingId={meetingId}
          isHost={isHost}
        />
      )}

      {/* Media Request Notification (Participant) */}
      {!isHost && (
        <>
          {/* Debug: Show pending request status */}
          {pendingRequest && (
            <Box sx={{ 
              position: 'fixed', 
              top: 10, 
              right: 10, 
              bgcolor: 'warning.main', 
              color: 'white', 
              p: 1, 
              borderRadius: 1,
              zIndex: 9999 
            }}>
              📹 Request Pending: {pendingRequest.hostName}
            </Box>
          )}
          <MediaRequestNotification
            open={!!pendingRequest}
            request={pendingRequest}
            onAccept={acceptRequest}
            onDeny={denyRequest}
          />
        </>
      )}

      {/* Recording Notification (for participants) */}
      {/* REMOVED: Recording feature */}
      {/* {!isHost && (
        <RecordingNotification
          open={recordingNotification.open}
          isRecording={recordingNotification.isRecording}
          onClose={() => setRecordingNotification(prev => ({ ...prev, open: false }))}
        />
      )} */}

      {/* Enhanced Highlight System Components */}
      
      {/* Highlight Reminder - Disabled to reduce notifications */}
      {/* <HighlightReminder
        meetingDuration={Date.now() - meetingStartTime}
        highlightCount={highlights.length}
        onMarkHighlight={markHighlight}
        isVisible={!isWaitingForApproval}
      /> */}

      {/* REMOVED: Small Highlight Indicator - Feature removed */}

      {/* REMOVED: Highlight Dashboard - Feature removed */}
      {/* REMOVED: Share Highlight Reel Dialog - Feature removed */}

      {/* Screen share error toast */}
      <Snackbar
        open={!!newScreenShareError}
        autoHideDuration={6000}
        onClose={() => setNewScreenShareError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setNewScreenShareError(null)} severity="warning" sx={{ width: '100%' }}>
          {newScreenShareError}
        </Alert>
      </Snackbar>

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

    </Container>
  );
};

export default MeetingRoom;
