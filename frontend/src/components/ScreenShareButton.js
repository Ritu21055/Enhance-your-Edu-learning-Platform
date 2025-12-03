import React, { useRef } from 'react';
import { IconButton } from '@mui/material';
import { ScreenShare, StopScreenShare } from '@mui/icons-material';

/**
 * Screen Share Button Component
 * Isolated component - DOES NOT affect local video track
 */
const ScreenShareButton = ({ 
  isScreenSharing, 
  onToggleScreenShare,
  localStream 
}) => {
  const isTogglingRef = useRef(false);

  const handleClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent multiple simultaneous clicks
    if (isTogglingRef.current) {
      console.warn('🖥️ ScreenShareButton: Toggle already in progress, ignoring click');
      return;
    }

    isTogglingRef.current = true;

    // CRITICAL: Lock video state BEFORE screen share operations
    const videoTrack = localStream?.getVideoTracks()[0];
    const videoWasEnabled = videoTrack?.enabled ?? true;
    console.log('🖥️ ScreenShareButton: Screen share toggle - video state locked:', videoWasEnabled);

    try {
      if (isScreenSharing) {
        // Stop screen sharing
        console.log('🖥️ ScreenShareButton: Stopping screen share');
        
        if (onToggleScreenShare) {
          onToggleScreenShare();
        }

        // CRITICAL: Verify video is still enabled after stopping
        setTimeout(() => {
          if (videoTrack && videoWasEnabled && !videoTrack.enabled) {
            console.error('🖥️ ScreenShareButton: Video disabled after stopping screen share! Re-enabling...');
            videoTrack.enabled = true;
          }
          isTogglingRef.current = false;
        }, 100);
      } else {
        // Start screen sharing
        console.log('🖥️ ScreenShareButton: Starting screen share');
        
        if (onToggleScreenShare) {
          onToggleScreenShare();
        }

        // CRITICAL: Verify video is still enabled after starting
        setTimeout(() => {
          if (videoTrack && videoWasEnabled && !videoTrack.enabled) {
            console.error('🖥️ ScreenShareButton: Video disabled after starting screen share! Re-enabling...');
            videoTrack.enabled = true;
          }
          isTogglingRef.current = false;
        }, 100);

        // Additional check after screen share fully starts
        setTimeout(() => {
          if (videoTrack && videoWasEnabled && !videoTrack.enabled) {
            console.error('🖥️ ScreenShareButton: Final check - video still disabled, forcing enabled');
            videoTrack.enabled = true;
          }
        }, 500);
      }
    } catch (error) {
      console.error('🖥️ ScreenShareButton: Error:', error);
      isTogglingRef.current = false;
    }
  };

  return (
    <IconButton
      onClick={handleClick}
      className={`control-button ${isScreenSharing ? 'screen-sharing' : 'screen-share-inactive'}`}
      title={isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
      type="button"
    >
      {isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
    </IconButton>
  );
};

export default ScreenShareButton;

