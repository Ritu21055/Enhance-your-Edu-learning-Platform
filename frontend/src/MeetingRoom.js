import React, { useState, useRef, useEffect } from 'react';
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
import useUltraSimplePeer from './hooks/useUltraSimplePeer';
import { useChat } from './hooks/useChat';
import { useMediaControls } from './hooks/useMediaControls';
import useSentimentAnalysis from './hooks/useSentimentAnalysis';
import useFatigueDetection from './hooks/useFatigueDetection';

// Import components
import UltraSimpleVideo from './components/UltraSimpleVideo';
import MeetingControls from './components/MeetingControls';
import ChatSidebar from './components/ChatSidebar';
import ParticipantsDialog from './components/ParticipantsDialog';
import PendingApprovalsDialog from './components/PendingApprovalsDialog';
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

// AI Features - Real-time Sentiment Analysis

const MeetingRoom = () => {
  const { meetingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userName = searchParams.get('user') || 'Guest';
  
  // If userName is empty or just whitespace, use Guest
  const finalUserName = userName && userName.trim() !== '' ? userName.trim() : 'Guest';
  
  console.log('🔍 MeetingRoom: URL params:', { meetingId, userName });
  console.log('🔍 MeetingRoom: userName value:', userName);
  console.log('🔍 MeetingRoom: userName type:', typeof userName);
  

  // State for UI
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showSentimentDashboard, setShowSentimentDashboard] = useState(false);
  const [showAudioTroubleshooter, setShowAudioTroubleshooter] = useState(false);
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

  // Custom hooks
  const {
    localStream,
    remoteStreams,
    participants,
    isConnected,
    pendingApprovals,
    showPendingApprovals,
    setShowPendingApprovals,
    isWaitingForApproval,
    localVideoRef,
    joinMeeting,
    initializeMedia,
    approveParticipant,
    rejectParticipant,
    isHost,
    socket,
    forceConnection,
    createConnectionsToAllParticipants,
    // Screen sharing functionality
    screenStream,
    remoteScreenStreams,
    handleScreenShareChange,
    forceRender
  } = useUltraSimplePeer(meetingId, finalUserName);

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
    isAnalyzing: isFatigueAnalyzing
  } = useFatigueDetection(sentimentData, isHost, socket);

  // Debug fatigue detection
  console.log('🧠 Fatigue Detection Debug:', {
    isHost,
    hasSentimentData: !!sentimentData,
    fatigueAlert: fatigueAlert,
    hasFatigueAlert: !!fatigueAlert,
    isFatigueAnalyzing,
    fatigueHistory: fatigueHistory?.length || 0
  });

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
      
      // Don't automatically start question generation - let user control it
      if (data.status === 'ready') {
        console.log('🤖 AI is ready, but not starting question generation automatically');
        // Only start if there's already been some conversation
        // handleStartQuestionGeneration(); // Commented out to prevent automatic start
      }
    };

    socket.on('ai_status', handleAIStatus);

    return () => {
      socket.off('ai_status', handleAIStatus);
    };
  }, [socket, isHost, isQuestionGenerationActive]);


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

  // Debug logging
  console.log('🔍 MeetingRoom Debug:', {
    socket: !!socket,
    socketConnected: socket?.connected,
    pendingApprovals: pendingApprovals.length,
    showPendingApprovals,
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

  const {
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenVideoRef,
    toggleAudio,
    toggleVideo,
    toggleScreenShare
  } = useMediaControls(localStream, handleScreenShareChange, socket, meetingId, socket?.id);

  // AI Follow-up Question Generation - Audio Transcription
  const {
    isRecording: isTranscriptionRecording,
    transcript,
    isTranscribing,
    error: transcriptionError,
    startRecording: startTranscriptionRecording,
    stopRecording: stopTranscriptionRecording,
    clearTranscript
  } = useAudioTranscription(socket, meetingId);

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

  // AI Follow-up Question Generation - Control functions
  const handleStartQuestionGeneration = () => {
    if (socket && meetingId) {
      console.log('🤖 Starting AI question generation...');
      socket.emit('start_question_generation', { meetingId });
      setIsQuestionGenerationActive(true);
      
      // Also start audio transcription for the host
      if (isHost) {
        startTranscriptionRecording();
      }
    }
  };

  const handleStopQuestionGeneration = () => {
    if (socket && meetingId) {
      console.log('🛑 Stopping AI question generation...');
      socket.emit('stop_question_generation', { meetingId });
      setIsQuestionGenerationActive(false);
      
      // Stop audio transcription
      stopTranscriptionRecording();
    }
  };

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
        
        {isHost && pendingApprovals.length > 0 && (
          <Box className="pending-approvals-notification">
            <Button
              variant="contained"
              color="warning"
              onClick={() => setShowPendingApprovals(true)}
              startIcon={<People />}
            >
              Pending Approvals ({pendingApprovals.length})
            </Button>
          </Box>
        )}

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
                  pendingApprovals: pendingApprovals.length,
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
          console.log('📹 Camera/Mic toggled:', { isActive, stream });
          if (isActive && stream) {
            // Replace the local stream with the new stream from consent dialog
            console.log('🔄 Replacing local stream with consent stream');
            
            // Update the local stream in the peer connection system
            if (window.ultraSimplePeerRef && window.ultraSimplePeerRef.current) {
              const peerRef = window.ultraSimplePeerRef.current;
              
              // Replace the local stream
              peerRef.updateLocalStream(stream);
              
              console.log('✅ Consent stream integrated with peer connections');
            }
          } else {
            // Turn off camera/mic - session ended
            console.log('🔄 Camera/Mic session ended - restoring original state');
            if (window.consentStream) {
              // Stop the consent stream
              window.consentStream.getTracks().forEach(track => track.stop());
              window.consentStream = null;
            }
            
            // Restore the original local stream (if available)
            if (window.ultraSimplePeerRef && window.ultraSimplePeerRef.current) {
              const peerRef = window.ultraSimplePeerRef.current;
              
              // Use the restore function to properly restore the original stream
              if (peerRef.restoreOriginalStream) {
                console.log('🔄 Restoring original stream using restore function');
                peerRef.restoreOriginalStream();
              } else {
                console.log('🔄 No restore function available, clearing peer connections');
                // Clear all tracks from peer connections
                Object.keys(peerRef.peersRef.current).forEach(participantId => {
                  const peer = peerRef.peersRef.current[participantId];
                  if (peer && peer.getSenders) {
                    const senders = peer.getSenders();
                    senders.forEach(sender => {
                      if (sender.track) {
                        peer.removeTrack(sender);
                      }
                    });
                  }
                });
              }
              console.log('✅ Restored original media state');
            }
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
        {isWaitingForApproval ? (
          <Box className="waiting-approval-container">
            <Typography variant="h4" color="primary" gutterBottom>
              ⏳ Waiting for Host Approval
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center">
              You have requested to join the meeting. Please wait for the host to approve your request.
            </Typography>
            <Box className="loading-spinner loading-spinner-with-margin">
              <div className="spinner"></div>
            </Box>
            <Button
              variant="contained"
              color="primary"
              className="button-with-margin"
              onClick={() => console.log('Request approval - SimplePeer handles this automatically')}
            >
              Request Approval Again
            </Button>
          </Box>
        ) : (
          <UltraSimpleVideo
            userName={finalUserName}
            isHost={isHost}
            localVideoRef={localVideoRef}
            participants={participants}
            remoteStreams={remoteStreams}
            localStream={localStream}
            currentUserId={socket?.id}
            forceConnection={forceConnection}
            createConnectionsToAllParticipants={createConnectionsToAllParticipants}
            initializeMedia={initializeMedia}
            // Screen sharing props
            screenStream={screenStream}
            remoteScreenStreams={remoteScreenStreams}
            forceRender={forceRender}
            // Participant management
            onRemoveParticipant={handleRemoveParticipant}
          />
        )}
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

      {/* Meeting Controls - Only show when approved */}
      {!isWaitingForApproval && (
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
            console.log('💬 Chat button clicked, current showChat:', showChat);
            setShowChat(!showChat);
            console.log('💬 Chat state will be:', !showChat);
          }}
          onToggleParticipants={() => setShowParticipants(!showParticipants)}
          onMarkHighlight={markHighlight}
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
        />
      )}

      {/* Pending Approvals Dialog */}
      <PendingApprovalsDialog
        open={showPendingApprovals}
        onClose={() => setShowPendingApprovals(false)}
        pendingApprovals={pendingApprovals}
        onApproveParticipant={approveParticipant}
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


    </Container>
  );
};

export default MeetingRoom;
