import React from 'react';
import {
  Paper,
  Stack,
  IconButton,
  Button
} from '@mui/material';
import {
  Mic,
  MicOff,
  Videocam,
  VideocamOff,
  ScreenShare,
  StopScreenShare,
  Chat,
  People,
  CallEnd,
  Star,
  FiberManualRecord,
  Stop
} from '@mui/icons-material';

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
  onToggleRecording
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
        {/* Audio Control */}
        <IconButton
          onClick={onToggleAudio}
          className={`control-button ${isAudioEnabled ? 'audio-enabled' : 'audio-disabled'}`}
          title={isAudioEnabled ? 'Mute Audio' : 'Unmute Audio'}
        >
          {isAudioEnabled ? <Mic /> : <MicOff />}
        </IconButton>
        
        {/* Video Control */}
        <IconButton
          onClick={onToggleVideo}
          className={`control-button ${isVideoEnabled ? 'video-enabled' : 'video-disabled'}`}
          title={isVideoEnabled ? 'Turn Off Video' : 'Turn On Video'}
        >
          {isVideoEnabled ? <Videocam /> : <VideocamOff />}
        </IconButton>
        
        {/* Screen Share Control */}
        <IconButton
          onClick={onToggleScreenShare}
          className={`control-button ${isScreenSharing ? 'screen-sharing' : 'screen-share-inactive'}`}
          title={isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
        >
          {isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
        </IconButton>
        
        {/* Chat Control */}
        <IconButton
          onClick={onToggleChat}
          className={`control-button chat-toggle ${showChat ? 'active' : ''}`}
          title="Toggle Chat"
        >
          <Chat />
        </IconButton>
        
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
