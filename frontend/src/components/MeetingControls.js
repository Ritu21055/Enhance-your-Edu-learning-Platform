import React from 'react';
import {
  Paper,
  Stack,
  IconButton,
  Button,
  Tooltip
} from '@mui/material';
import {
  Videocam,
  VideocamOff,
  People,
  CallEnd,
  Star,
  // REMOVED: Recording feature
  // FiberManualRecord,
  // Stop,
  Psychology,
  Lock
} from '@mui/icons-material';
import ChatButton from './ChatButton';
import AudioButton from './AudioButton';
import ScreenShareButton from './ScreenShareButton';

const MeetingControls = ({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  showChat,
  showParticipants,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onToggleParticipants,
  onLeaveMeeting,
  onMarkHighlight,
  isHost,
  // REMOVED: Recording feature
  // isRecording,
  // onToggleRecording,
  // AI Question Generation props
  isQuestionGenerationActive,
  onToggleQuestionGeneration,
  // Additional props for isolated buttons
  localStream,
  // NEW: Lock state props
  isAudioLocked = false,
  isVideoLocked = false
}) => {
  
  const handleToggleAudio = () => {
    if (isAudioLocked) {
      return;
    }
    onToggleAudio();
  };

  const handleToggleVideo = () => {
    if (isVideoLocked) {
      return;
    }
    onToggleVideo();
  };
  return (
    <Paper 
      className="meeting-controls-bottom"
      elevation={0}
      sx={{ backgroundColor: 'transparent' }}
    >
      <Stack 
        direction="row" 
        spacing={3} 
        alignItems="center" 
        justifyContent="center"
        sx={{ width: '100%' }}
      >
        {/* Audio Control - With Lock Support */}
        <Tooltip 
          title={
            isAudioLocked 
              ? "Audio is locked by host request. Cannot turn off during active session." 
              : (isAudioEnabled ? 'Mute Audio' : 'Unmute Audio')
          }
        >
          <span>
            <AudioButton
              isAudioEnabled={isAudioEnabled}
              onToggleAudio={handleToggleAudio}
              localStream={localStream}
              disabled={isAudioLocked}
            />
            {isAudioLocked && (
              <Lock 
                sx={{ 
                  position: 'absolute', 
                  fontSize: '12px', 
                  color: '#ff9800',
                  ml: -2,
                  mt: -1
                }} 
              />
            )}
          </span>
        </Tooltip>
        
        {/* Video Control - With Lock Support */}
        <Tooltip
          title={
            isVideoLocked 
              ? "Video is locked by host request. Cannot turn off during active session." 
              : (isVideoEnabled ? 'Turn Off Video' : 'Turn On Video')
          }
        >
          <span>
            <IconButton
              onClick={handleToggleVideo}
              disabled={isVideoLocked}
              className={`control-button ${isVideoEnabled ? 'video-enabled' : 'video-disabled'} ${isVideoLocked ? 'locked' : ''}`}
              sx={{
                position: 'relative',
                opacity: isVideoLocked ? 0.7 : 1,
                '&:disabled': {
                  opacity: 0.7
                }
              }}
            >
              {isVideoEnabled ? <Videocam /> : <VideocamOff />}
              {isVideoLocked && (
                <Lock 
                  sx={{ 
                    position: 'absolute', 
                    top: 2, 
                    right: 2, 
                    fontSize: '14px', 
                    color: '#ff9800' 
                  }} 
                />
              )}
            </IconButton>
          </span>
        </Tooltip>
        
        {/* Screen Share Control - Isolated Component */}
        <ScreenShareButton
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={onToggleScreenShare}
          localStream={localStream}
        />
        
        {/* Chat Control - Isolated Component */}
        {/* Chat Control - Simple toggle, no video interaction */}
        <ChatButton
          showChat={showChat}
          onToggleChat={onToggleChat}
        />
        
        {/* Participants Control */}
        <IconButton
          onClick={onToggleParticipants}
          className={`control-button participants-toggle ${showParticipants ? 'active' : ''}`}
          title="Show Participants"
        >
          <People />
        </IconButton>
        
        {/* Recording Control - Only for hosts */}
        {/* REMOVED: Recording feature */}
        {/* {isHost && (
          <IconButton
            onClick={onToggleRecording}
            className={`control-button recording-toggle ${isRecording ? 'recording-active' : 'recording-inactive'}`}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            {isRecording ? <Stop /> : <FiberManualRecord />}
          </IconButton>
        )} */}
        
        {/* AI Question Generation Control - Only for hosts */}
        {isHost && (
          <IconButton
            onClick={onToggleQuestionGeneration}
            className={`control-button ai-question-toggle ${isQuestionGenerationActive ? 'ai-active' : 'ai-inactive'}`}
            title={isQuestionGenerationActive ? 'Stop AI Questions' : 'Start AI Questions'}
          >
            <Psychology />
          </IconButton>
        )}
        
        {/* Simple Highlight Control - Only for hosts */}
        {isHost && (
          <IconButton
            onClick={() => onMarkHighlight('important')}
            className="control-button highlight-button"
            title="Mark Important Moment"
          >
            <Star />
          </IconButton>
        )}
        
        {/* Leave/End Meeting Button */}
        <Button
          onClick={onLeaveMeeting}
          startIcon={<CallEnd />}
          className="leave-button"
        >
          {isHost ? 'End Meeting' : 'Leave Meeting'}
        </Button>
      </Stack>
    </Paper>
  );
};

export default MeetingControls;
