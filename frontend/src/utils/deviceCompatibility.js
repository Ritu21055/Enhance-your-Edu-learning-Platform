// Device compatibility checks and fallbacks for cross-device support

/**
 * Check if the current device/browser supports required features
 */
export const checkDeviceCompatibility = () => {
  const compatibility = {
    isSupported: true,
    issues: [],
    warnings: [],
    recommendations: []
  };

  // Check WebRTC support
  if (!window.RTCPeerConnection && !window.webkitRTCPeerConnection && !window.mozRTCPeerConnection) {
    compatibility.isSupported = false;
    compatibility.issues.push('WebRTC not supported - video calls will not work');
  }

  // Check getUserMedia support
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    compatibility.isSupported = false;
    compatibility.issues.push('Camera/microphone access not supported');
  }

  // Check WebSocket support (for Socket.IO)
  if (!window.WebSocket && !window.MozWebSocket) {
    compatibility.isSupported = false;
    compatibility.issues.push('WebSocket not supported - real-time communication will not work');
  }

  // Check browser type and version
  const userAgent = navigator.userAgent;
  const isChrome = /Chrome/.test(userAgent) && /Google Inc/.test(navigator.vendor);
  const isFirefox = /Firefox/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && /Apple Computer/.test(navigator.vendor);
  const isEdge = /Edg/.test(userAgent);
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  // Browser-specific checks
  if (isSafari && !isChrome) {
    compatibility.warnings.push('Safari may have limited WebRTC support - Chrome or Firefox recommended');
  }

  if (isMobile) {
    compatibility.warnings.push('Mobile devices may have limited performance - desktop recommended for best experience');
    compatibility.recommendations.push('Use Chrome or Safari on mobile for best compatibility');
  }

  // Check for HTTPS requirement
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    compatibility.warnings.push('HTTPS required for camera/microphone access on some networks');
    compatibility.recommendations.push('Use HTTPS or localhost for full functionality');
  }

  // Check network connection
  if (navigator.connection) {
    const connection = navigator.connection;
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
      compatibility.warnings.push('Slow network detected - video quality may be reduced');
      compatibility.recommendations.push('Use WiFi for better performance');
    }
  }

  // Check available memory (if available)
  if (navigator.deviceMemory) {
    if (navigator.deviceMemory < 2) {
      compatibility.warnings.push('Low memory device detected - performance may be limited');
    }
  }

  return compatibility;
};

/**
 * Get device information for debugging
 */
export const getDeviceInfo = () => {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    connection: navigator.connection ? {
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt
    } : null,
    deviceMemory: navigator.deviceMemory || 'unknown',
    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    maxTouchPoints: navigator.maxTouchPoints || 0,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString()
  };
};

/**
 * Test network connectivity to backend
 */
export const testBackendConnectivity = async (backendUrl) => {
  try {
    const response = await fetch(`${backendUrl}/api/health`, {
      method: 'GET',
      timeout: 5000
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: 'Backend connection successful',
        data
      };
    } else {
      return {
        success: false,
        message: `Backend returned status: ${response.status}`,
        error: response.statusText
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'Backend connection failed',
      error: error.message
    };
  }
};

/**
 * Test WebRTC connectivity
 */
export const testWebRTCConnectivity = async () => {
  try {
    // Test if we can create a peer connection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pc.close();
        resolve({
          success: false,
          message: 'WebRTC test timeout',
          error: 'Connection test timed out'
        });
      }, 10000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          clearTimeout(timeout);
          pc.close();
          resolve({
            success: true,
            message: 'WebRTC connectivity test successful',
            candidate: event.candidate
          });
        }
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          pc.close();
          resolve({
            success: false,
            message: 'WebRTC test completed but no candidates found',
            error: 'No ICE candidates generated'
          });
        }
      };

      // Create a data channel to trigger ICE gathering
      pc.createDataChannel('test');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));
    });
  } catch (error) {
    return {
      success: false,
      message: 'WebRTC test failed',
      error: error.message
    };
  }
};

/**
 * Test media device access
 */
export const testMediaAccess = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: true
    });

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    // Stop the stream
    stream.getTracks().forEach(track => track.stop());

    return {
      success: true,
      message: 'Media access test successful',
      videoTracks: videoTracks.length,
      audioTracks: audioTracks.length,
      videoCapabilities: videoTracks[0]?.getCapabilities?.() || null,
      audioCapabilities: audioTracks[0]?.getCapabilities?.() || null
    };
  } catch (error) {
    return {
      success: false,
      message: 'Media access test failed',
      error: error.message,
      errorName: error.name
    };
  }
};

/**
 * Run comprehensive compatibility test
 */
export const runCompatibilityTest = async (backendUrl) => {
  console.log('🔍 Running comprehensive compatibility test...');
  
  const results = {
    device: checkDeviceCompatibility(),
    deviceInfo: getDeviceInfo(),
    backend: await testBackendConnectivity(backendUrl),
    webrtc: await testWebRTCConnectivity(),
    media: await testMediaAccess(),
    timestamp: new Date().toISOString()
  };

  console.log('🔍 Compatibility test results:', results);
  return results;
};

/**
 * Get user-friendly error messages
 */
export const getErrorMessage = (error) => {
  const errorMessages = {
    'NotAllowedError': 'Camera/microphone access denied. Please allow access and refresh the page.',
    'NotFoundError': 'No camera or microphone found. Please connect a device and refresh.',
    'NotReadableError': 'Camera/microphone is already in use by another application.',
    'OverconstrainedError': 'Camera/microphone does not support the required settings.',
    'SecurityError': 'Security error - try using HTTPS or localhost.',
    'AbortError': 'Operation was aborted. Please try again.',
    'TypeError': 'Network error - check your internet connection.',
    'NetworkError': 'Network error - check your internet connection.'
  };

  return errorMessages[error.name] || error.message || 'An unknown error occurred';
};

/**
 * Get recommendations based on compatibility issues
 */
export const getRecommendations = (compatibility) => {
  const recommendations = [];

  if (compatibility.issues.length > 0) {
    recommendations.push('Your device has compatibility issues that may prevent the app from working properly.');
  }

  if (compatibility.warnings.length > 0) {
    recommendations.push('Your device has some limitations that may affect performance.');
  }

  // Browser-specific recommendations
  const userAgent = navigator.userAgent;
  if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
    recommendations.push('For best experience, try using Chrome or Firefox instead of Safari.');
  }

  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) {
    recommendations.push('For best experience on mobile, use Chrome or Safari.');
  }

  // Network recommendations
  if (navigator.connection && navigator.connection.effectiveType === 'slow-2g') {
    recommendations.push('Your network connection is slow. Try using WiFi for better performance.');
  }

  return recommendations;
};

export default {
  checkDeviceCompatibility,
  getDeviceInfo,
  testBackendConnectivity,
  testWebRTCConnectivity,
  testMediaAccess,
  runCompatibilityTest,
  getErrorMessage,
  getRecommendations
};
