import React from 'react';
import {
  Paper,
  Stack,
  IconButton,
  Button
} from '@mui/material';
import {
  Videocam,
  VideocamOff,
  People,
  CallEnd,
  Star,
  FiberManualRecord,
  Stop,
  Psychology
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
  isRecording,
  onToggleRecording,
  // AI Question Generation props
  isQuestionGenerationActive,
  onToggleQuestionGeneration,
  // Additional props for isolated buttons
  localStream
}) => {
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
        {/* Audio Control - Isolated Component */}
        <AudioButton
          isAudioEnabled={isAudioEnabled}
          onToggleAudio={onToggleAudio}
          localStream={localStream}
        />
        
        {/* Video Control */}
        <IconButton
          onClick={onToggleVideo}
          className={`control-button ${isVideoEnabled ? 'video-enabled' : 'video-disabled'}`}
          title={isVideoEnabled ? 'Turn Off Video' : 'Turn On Video'}
        >
          {isVideoEnabled ? <Videocam /> : <VideocamOff />}
        </IconButton>
        
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
        {isHost && (
          <IconButton
            onClick={onToggleRecording}
            className={`control-button recording-toggle ${isRecording ? 'recording-active' : 'recording-inactive'}`}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            {isRecording ? <Stop /> : <FiberManualRecord />}
          </IconButton>
        )}
        
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
