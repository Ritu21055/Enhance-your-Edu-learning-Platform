/**
 * Global Video Protection Utility
 * Ensures video never gets disabled by layout changes
 */

let globalVideoElement = null;
let globalVideoTrack = null;
let globalVideoStream = null;
let protectionInterval = null;
let isVideoEnabled = true;

export const registerVideoElement = (videoElement, videoTrack, stream) => {
  globalVideoElement = videoElement;
  globalVideoTrack = videoTrack;
  globalVideoStream = stream;
  
  console.log('🛡️ Video Protection: Registered video element');
  
  // Start aggressive protection
  startProtection();
};

export const unregisterVideoElement = () => {
  stopProtection();
  globalVideoElement = null;
  globalVideoTrack = null;
  globalVideoStream = null;
  console.log('🛡️ Video Protection: Unregistered video element');
};

export const setVideoEnabled = (enabled) => {
  isVideoEnabled = enabled;
  console.log('🛡️ Video Protection: Video enabled state set to', enabled);
};

const startProtection = () => {
  if (protectionInterval) {
    clearInterval(protectionInterval);
  }
  
  // ULTRA AGGRESSIVE protection - check very frequently
  // Only protect if video should be enabled
  protectionInterval = setInterval(() => {
    if (!globalVideoElement || !globalVideoTrack || !globalVideoStream) {
      return;
    }
    
    // Only protect if video should be enabled
    if (isVideoEnabled) {
      // Check if track is disabled
      if (!globalVideoTrack.enabled) {
        console.warn('🛡️ PROTECTION: Track was disabled, re-enabling');
        globalVideoTrack.enabled = true;
      }
      
      // Check if srcObject is lost
      if (globalVideoElement.srcObject !== globalVideoStream) {
        console.warn('🛡️ PROTECTION: srcObject lost, restoring');
        globalVideoElement.srcObject = globalVideoStream;
        // Force play after restoring srcObject
        setTimeout(() => {
          if (globalVideoElement && globalVideoElement.srcObject) {
            globalVideoElement.play().catch(() => {});
          }
        }, 10);
      }
      
      // Check if video is paused
      if (globalVideoElement.paused && globalVideoElement.srcObject) {
        globalVideoElement.play().catch(() => {});
      }
      
      // CRITICAL: Ensure video is visible - check computed styles too
      const computedStyle = window.getComputedStyle(globalVideoElement);
      if (computedStyle.opacity === '0' || computedStyle.visibility === 'hidden' || 
          globalVideoElement.style.opacity === '0' || globalVideoElement.style.visibility === 'hidden') {
        console.warn('🛡️ PROTECTION: Video hidden, making visible');
        globalVideoElement.style.opacity = '1';
        globalVideoElement.style.visibility = 'visible';
        globalVideoElement.style.display = 'block';
        globalVideoElement.style.width = '100%';
        globalVideoElement.style.height = '100%';
      }
    }
  }, 50); // Very frequent - catch issues immediately
  
  console.log('🛡️ Video Protection: Started protection');
};

const stopProtection = () => {
  if (protectionInterval) {
    clearInterval(protectionInterval);
    protectionInterval = null;
  }
  console.log('🛡️ Video Protection: Stopped protection');
};

// Also protect on window focus/blur
window.addEventListener('focus', () => {
  if (globalVideoElement && globalVideoTrack && isVideoEnabled) {
    if (!globalVideoTrack.enabled) {
      globalVideoTrack.enabled = true;
    }
    if (globalVideoElement.srcObject !== globalVideoStream) {
      globalVideoElement.srcObject = globalVideoStream;
    }
  }
});

