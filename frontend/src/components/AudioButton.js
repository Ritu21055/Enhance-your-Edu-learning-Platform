import React, { useRef } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Mic, MicOff, Lock } from '@mui/icons-material';

/**
 * Audio Button Component
 * Isolated component - ONLY affects audio track, NEVER touches video
 */
const AudioButton = ({ 
  isAudioEnabled, 
  onToggleAudio,
  localStream,
  disabled = false
}) => {
  const isTogglingRef = useRef(false);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) {
      return;
    }
    
    if (isTogglingRef.current) {
      return;
    }

    if (!localStream) {
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    isTogglingRef.current = true;
    
    if (onToggleAudio) {
      onToggleAudio();
    }
    
    setTimeout(() => {
      isTogglingRef.current = false;
    }, 200);
  };

  return (
    <Tooltip 
      title={
        disabled 
          ? "Audio is locked by host request" 
          : (isAudioEnabled ? 'Mute Audio' : 'Unmute Audio')
      }
    >
      <span style={{ position: 'relative', display: 'inline-block' }}>
        <IconButton
          onClick={handleClick}
          disabled={disabled}
          className={`control-button ${isAudioEnabled ? 'audio-enabled' : 'audio-disabled'} ${disabled ? 'locked' : ''}`}
          sx={{
            opacity: disabled ? 0.7 : 1,
            '&:disabled': {
              opacity: 0.7
            }
          }}
          type="button"
        >
          {isAudioEnabled ? <Mic /> : <MicOff />}
        </IconButton>
        {disabled && (
          <Lock 
            sx={{ 
              position: 'absolute', 
              top: 2, 
              right: 2, 
              fontSize: '12px', 
              color: '#ff9800' 
            }} 
          />
        )}
      </span>
    </Tooltip>
  );
};

export default AudioButton;

