/**
 * Meeting Media Protection System
 * Ensures video and audio remain active for the entire meeting duration
 * Prevents unexpected black screens and audio loss
 */

class MeetingMediaProtection {
  constructor() {
    this.isActive = false;
    this.protectionInterval = null;
    this.aggressiveRestoreInterval = null;
    this.videoElement = null;
    this.audioElement = null;
    this.localStream = null;
    this.videoTrack = null;
    this.audioTrack = null;
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;
    this.checkInterval = 100; // Check every 100ms
    this.restoreAttempts = 0;
    this.maxRestoreAttempts = 10;
  }

  /**
   * Start protection for a meeting
   */
  startProtection(localStream, videoElement, isVideoEnabled = true, isAudioEnabled = true) {
    if (this.isActive) {
      this.stopProtection();
    }

    this.localStream = localStream;
    this.videoElement = videoElement;
    this.isVideoEnabled = isVideoEnabled;
    this.isAudioEnabled = isAudioEnabled;

    if (localStream) {
      this.videoTrack = localStream.getVideoTracks()[0] || null;
      this.audioTrack = localStream.getAudioTracks()[0] || null;
    }

    this.isActive = true;
    this.restoreAttempts = 0;

    // Start continuous monitoring
    this.startMonitoring();

    console.log('🛡️ Meeting Media Protection: Started', {
      hasStream: !!localStream,
      hasVideoTrack: !!this.videoTrack,
      hasAudioTrack: !!this.audioTrack,
      hasVideoElement: !!videoElement,
      isVideoEnabled,
      isAudioEnabled
    });
  }

  /**
   * Stop protection
   */
  stopProtection() {
    this.isActive = false;
    
    if (this.protectionInterval) {
      clearInterval(this.protectionInterval);
      this.protectionInterval = null;
    }

    if (this.aggressiveRestoreInterval) {
      clearInterval(this.aggressiveRestoreInterval);
      this.aggressiveRestoreInterval = null;
    }

    this.videoElement = null;
    this.audioElement = null;
    this.localStream = null;
    this.videoTrack = null;
    this.audioTrack = null;

    console.log('🛡️ Meeting Media Protection: Stopped');
  }

  /**
   * Update protection state
   */
  updateState(localStream, videoElement, isVideoEnabled, isAudioEnabled) {
    this.localStream = localStream;
    this.videoElement = videoElement;
    this.isVideoEnabled = isVideoEnabled;
    this.isAudioEnabled = isAudioEnabled;

    if (localStream) {
      this.videoTrack = localStream.getVideoTracks()[0] || null;
      this.audioTrack = localStream.getAudioTracks()[0] || null;
    }
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring() {
    if (this.protectionInterval) {
      clearInterval(this.protectionInterval);
    }

    this.protectionInterval = setInterval(() => {
      if (!this.isActive) {
        return;
      }

      this.checkAndRestore();
    }, this.checkInterval);

    // Also add periodic aggressive restore (every 2 seconds)
    if (this.aggressiveRestoreInterval) {
      clearInterval(this.aggressiveRestoreInterval);
    }

    this.aggressiveRestoreInterval = setInterval(() => {
      if (!this.isActive) {
        return;
      }

      // Force restore every 5 seconds if video should be enabled (reduced frequency)
      // Only restore if actually needed (silent restore)
      if (this.isVideoEnabled) {
        this.forceRestoreVideo(true); // Pass true for silent mode
      }
      if (this.isAudioEnabled) {
        this.forceRestoreAudio(true); // Pass true for silent mode
      }
    }, 5000); // Reduced from 2000ms to 5000ms
  }

  /**
   * Check and restore media if needed
   */
  checkAndRestore() {
    if (!this.isActive) {
      return;
    }

    // Get fresh references
    const currentStream = this.localStream || 
                        (window.localStreamRef?.current) || 
                        (window.streamRef?.current);
    
    const currentVideoElement = this.videoElement || 
                               document.querySelector('video.local-video') ||
                               (window.localVideoRef?.current);

    if (!currentStream || !currentVideoElement) {
      return;
    }

    const currentVideoTrack = currentStream.getVideoTracks()[0];
    const currentAudioTrack = currentStream.getAudioTracks()[0];

    let needsRestore = false;

    // Check video track
    if (this.isVideoEnabled && currentVideoTrack) {
      if (!currentVideoTrack.enabled) {
        console.warn('🛡️ Protection: Video track disabled, re-enabling');
        currentVideoTrack.enabled = true;
        needsRestore = true;
      }

      // Check video element visibility
      const computedStyle = window.getComputedStyle(currentVideoElement);
      const isHidden = currentVideoElement.style.opacity === '0' ||
                      currentVideoElement.style.visibility === 'hidden' ||
                      computedStyle.opacity === '0' ||
                      computedStyle.visibility === 'hidden';

      if (isHidden) {
        console.warn('🛡️ Protection: Video element hidden, making visible');
        currentVideoElement.style.opacity = '1';
        currentVideoElement.style.visibility = 'visible';
        currentVideoElement.style.display = 'block';
        needsRestore = true;
      }

      // Check srcObject
      if (currentVideoElement.srcObject !== currentStream) {
        console.warn('🛡️ Protection: Video srcObject lost, restoring');
        currentVideoElement.srcObject = currentStream;
        needsRestore = true;
      }

      // Check if video is paused
      if (currentVideoElement.paused && currentVideoElement.srcObject) {
        currentVideoElement.play().catch(err => {
          console.warn('🛡️ Protection: Error playing video:', err);
        });
        needsRestore = true;
      }
    }

    // Check audio track
    if (this.isAudioEnabled && currentAudioTrack) {
      if (!currentAudioTrack.enabled) {
        console.warn('🛡️ Protection: Audio track disabled, re-enabling');
        currentAudioTrack.enabled = true;
        needsRestore = true;
      }
    }

    // If restoration was needed, update references
    if (needsRestore) {
      this.restoreAttempts++;
      
      // Update references after restore
      if (currentStream) {
        this.videoTrack = currentStream.getVideoTracks()[0] || null;
        this.audioTrack = currentStream.getAudioTracks()[0] || null;
      }
      this.videoElement = currentVideoElement;

      // If too many restore attempts, increase check interval
      if (this.restoreAttempts > this.maxRestoreAttempts) {
        console.warn('🛡️ Protection: Too many restore attempts, increasing check interval');
        this.checkInterval = Math.min(this.checkInterval * 1.5, 1000);
        this.startMonitoring();
        this.restoreAttempts = 0;
      }
    } else {
      // Reset restore attempts if everything is fine
      if (this.restoreAttempts > 0) {
        this.restoreAttempts = Math.max(0, this.restoreAttempts - 1);
      }
    }
  }

  /**
   * Force restore video immediately
   * @param {boolean} silent - If true, don't log unless something was actually restored
   */
  forceRestoreVideo(silent = false) {
    if (!this.isActive) {
      return;
    }

    const currentStream = this.localStream || 
                        (window.localStreamRef?.current) || 
                        (window.streamRef?.current);
    
    const currentVideoElement = this.videoElement || 
                               document.querySelector('video.local-video') ||
                               (window.localVideoRef?.current);

    if (!currentStream || !currentVideoElement) {
      return;
    }

    const currentVideoTrack = currentStream.getVideoTracks()[0];

    if (this.isVideoEnabled && currentVideoTrack) {
      let wasRestored = false;

      // Force track enabled
      if (!currentVideoTrack.enabled) {
        currentVideoTrack.enabled = true;
        wasRestored = true;
      }

      // Check if element needs restoration
      const computedStyle = window.getComputedStyle(currentVideoElement);
      const needsVisibilityRestore = currentVideoElement.style.opacity === '0' ||
                                    currentVideoElement.style.visibility === 'hidden' ||
                                    computedStyle.opacity === '0' ||
                                    computedStyle.visibility === 'hidden';

      if (needsVisibilityRestore) {
        currentVideoElement.style.opacity = '1';
        currentVideoElement.style.visibility = 'visible';
        currentVideoElement.style.display = 'block';
        currentVideoElement.style.width = '100%';
        currentVideoElement.style.height = '100%';
        wasRestored = true;
      }

      // Force srcObject
      if (currentVideoElement.srcObject !== currentStream) {
        currentVideoElement.srcObject = currentStream;
        wasRestored = true;
      }

      // Force play
      if (currentVideoElement.paused && currentVideoElement.srcObject) {
        currentVideoElement.play().catch(() => {});
        wasRestored = true;
      }

      // Only log if something was actually restored, or if not in silent mode
      if (wasRestored || !silent) {
        console.log('🛡️ Protection: Force restored video', wasRestored ? '(restoration needed)' : '(preventive check)');
      }
    }
  }

  /**
   * Force restore audio immediately
   * @param {boolean} silent - If true, don't log unless something was actually restored
   */
  forceRestoreAudio(silent = false) {
    if (!this.isActive) {
      return;
    }

    const currentStream = this.localStream || 
                        (window.localStreamRef?.current) || 
                        (window.streamRef?.current);

    if (!currentStream) {
      return;
    }

    const currentAudioTrack = currentStream.getAudioTracks()[0];

    if (this.isAudioEnabled && currentAudioTrack) {
      const wasRestored = !currentAudioTrack.enabled;
      if (wasRestored) {
        currentAudioTrack.enabled = true;
      }

      // Only log if something was actually restored, or if not in silent mode
      if (wasRestored || !silent) {
        console.log('🛡️ Protection: Force restored audio', wasRestored ? '(restoration needed)' : '(preventive check)');
      }
    }
  }
}

// Create singleton instance
const meetingMediaProtection = new MeetingMediaProtection();

export default meetingMediaProtection;

