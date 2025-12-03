import React, { useRef } from 'react';
import { IconButton } from '@mui/material';
import { Mic, MicOff } from '@mui/icons-material';

/**
 * Audio Button Component
 * Isolated component - ONLY affects audio track, NEVER touches video
 */
const AudioButton = ({ 
  isAudioEnabled, 
  onToggleAudio,
  localStream 
}) => {
  const isTogglingRef = useRef(false);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent multiple simultaneous clicks
    if (isTogglingRef.current) {
      console.warn('🔇 AudioButton: Toggle already in progress, ignoring click');
      return;
    }

    if (!localStream) {
      console.warn('🔇 AudioButton: No local stream available');
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn('🔇 AudioButton: No audio track found');
      return;
    }

    isTogglingRef.current = true;
    
    console.log('🔇 AudioButton: Toggling audio, current state:', audioTrack.enabled);
    
    // CRITICAL: Just call the callback - let useMediaControls handle the toggle
    // This prevents double-toggling
    if (onToggleAudio) {
      onToggleAudio();
    }
    
    // Reset toggle lock after a short delay
    setTimeout(() => {
      isTogglingRef.current = false;
    }, 200);
  };

  return (
    <IconButton
      onClick={handleClick}
      className={`control-button ${isAudioEnabled ? 'audio-enabled' : 'audio-disabled'}`}
      title={isAudioEnabled ? 'Mute Audio' : 'Unmute Audio'}
      type="button"
    >
      {isAudioEnabled ? <Mic /> : <MicOff />}
    </IconButton>
  );
};

export default AudioButton;

