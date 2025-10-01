// Audio Utilities for WebNexus
// Handles all audio-related functionality for better code organization

/**
 * Ensures host audio transmission is properly configured
 * @param {Object} peer - The peer connection object
 * @param {Object} stream - The media stream
 * @param {string} participantId - The participant ID
 * @param {boolean} isHost - Whether the current user is the host
 */
export const ensureHostAudioTransmission = (peer, stream, participantId, isHost) => {
  if (!isHost) return;
  
  console.log(`🔊 AUDIO-UTILS: Host detected, ensuring audio transmission to ${participantId}`);
  console.log(`🔊 AUDIO-UTILS: Host stream details:`, {
    streamActive: stream.active,
    audioTracksCount: stream.getAudioTracks().length,
    videoTracksCount: stream.getVideoTracks().length,
    streamId: stream.id
  });
  
  // Force enable all audio tracks for host transmission
  const audioTracks = stream.getAudioTracks();
  audioTracks.forEach((track, index) => {
    console.log(`🔊 AUDIO-UTILS: Host audio track ${index} before fix:`, {
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      label: track.label
    });
    
    if (!track.enabled) {
      track.enabled = true;
      console.log(`🔊 AUDIO-UTILS: Force enabled host audio track ${index} for ${participantId}`);
    }
    if (track.muted) {
      track.muted = false;
      console.log(`🔊 AUDIO-UTILS: Force unmuted host audio track ${index} for ${participantId}`);
    }
  });
  
  // Force re-add stream multiple times to ensure transmission
  setTimeout(() => {
    try {
      peer.addStream(stream);
      console.log(`🔊 AUDIO-UTILS: Force re-added host stream to ${participantId} (attempt 1)`);
    } catch (reAddError) {
      console.log(`🔊 AUDIO-UTILS: Host stream already added to ${participantId} (attempt 1):`, reAddError.message);
    }
  }, 100);
  
  setTimeout(() => {
    try {
      peer.addStream(stream);
      console.log(`🔊 AUDIO-UTILS: Force re-added host stream to ${participantId} (attempt 2)`);
    } catch (reAddError) {
      console.log(`🔊 AUDIO-UTILS: Host stream already added to ${participantId} (attempt 2):`, reAddError.message);
    }
  }, 500);
  
  // Additional debugging for host audio transmission
  setTimeout(() => {
    console.log(`🔊 AUDIO-UTILS: Host audio transmission status after 1 second:`, {
      participantId,
      isHost,
      streamActive: stream.active,
      audioTracksEnabled: audioTracks.filter(t => t.enabled).length,
      audioTracksUnmuted: audioTracks.filter(t => !t.muted).length
    });
  }, 1000);
};

/**
 * Ensures audio tracks are enabled and unmuted
 * @param {Object} stream - The media stream
 * @param {string} participantId - The participant ID
 */
export const ensureAudioTracksEnabled = (stream, participantId) => {
  const audioTracks = stream.getAudioTracks();
  audioTracks.forEach((track, index) => {
    if (!track.enabled) {
      track.enabled = true;
      console.log(`🔊 AUDIO-UTILS: Force enabled audio track ${index} for ${participantId}`);
    }
    if (track.muted) {
      track.muted = false;
      console.log(`🔊 AUDIO-UTILS: Force unmuted audio track ${index} for ${participantId}`);
    }
  });
};

/**
 * Debugs host audio stream reception
 * @param {Object} stream - The received stream
 * @param {string} participantId - The participant ID
 * @param {Array} participants - Array of participants
 */
export const debugHostAudioReception = (stream, participantId, participants) => {
  const isHost = participants.find(p => p.id === participantId)?.isHost;
  
  if (isHost) {
    console.log(`🔊 AUDIO-UTILS: HOST STREAM RECEIVED from ${participantId}`);
    console.log(`🔊 AUDIO-UTILS: Host stream reception details:`, {
      streamActive: stream.active,
      audioTracksCount: stream.getAudioTracks().length,
      videoTracksCount: stream.getVideoTracks().length,
      streamId: stream.id
    });
    
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach((track, index) => {
      console.log(`🔊 AUDIO-UTILS: Host audio track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });
    
    // CRITICAL: Force enable host audio tracks for participant reception
    audioTracks.forEach((track, index) => {
      if (!track.enabled) {
        track.enabled = true;
        console.log(`🔊 AUDIO-UTILS: Force enabled host audio track ${index} for participant reception`);
      }
      if (track.muted) {
        track.muted = false;
        console.log(`🔊 AUDIO-UTILS: Force unmuted host audio track ${index} for participant reception`);
      }
    });
    
    // Additional debugging for participant reception
    setTimeout(() => {
      console.log(`🔊 AUDIO-UTILS: Participant reception status after 500ms:`, {
        participantId,
        isHost,
        streamActive: stream.active,
        audioTracksEnabled: audioTracks.filter(t => t.enabled).length,
        audioTracksUnmuted: audioTracks.filter(t => !t.muted).length
      });
    }, 500);
  }
};

/**
 * Configures audio element for optimal playback
 * @param {HTMLAudioElement} audioElement - The audio element
 * @param {Object} stream - The media stream
 * @param {string} participantId - The participant ID
 */
export const configureAudioElement = (audioElement, stream, participantId) => {
  if (!audioElement || !stream) return;
  
  console.log(`🔊 AUDIO-UTILS: Configuring audio element for ${participantId}`);
  console.log(`🔊 AUDIO-UTILS: Audio element details:`, {
    hasStream: !!stream,
    streamActive: stream.active,
    audioTracksCount: stream.getAudioTracks().length
  });
  
  // Force audio element configuration
  audioElement.muted = false;
  audioElement.volume = 1.0;
  audioElement.autoplay = true;
  audioElement.playsInline = true;
  
  // Assign the stream
  audioElement.srcObject = stream;
  
  // Force play
  audioElement.play().then(() => {
    console.log(`✅ AUDIO-UTILS: Audio play successful for ${participantId}`);
  }).catch(err => {
    console.log(`❌ AUDIO-UTILS: Audio play failed for ${participantId}:`, err);
  });
  
  // Force enable audio tracks
  const audioTracks = stream.getAudioTracks();
  audioTracks.forEach((track, index) => {
    if (!track.enabled) {
      track.enabled = true;
      console.log(`🔊 AUDIO-UTILS: Force enabled audio track ${index} for ${participantId}`);
    }
    if (track.muted) {
      track.muted = false;
      console.log(`🔊 AUDIO-UTILS: Force unmuted audio track ${index} for ${participantId}`);
    }
  });
};

/**
 * Configures audio element specifically for host streams
 * @param {HTMLAudioElement} audioElement - The audio element
 * @param {Object} stream - The media stream
 * @param {string} participantId - The participant ID
 * @param {boolean} isHost - Whether the stream is from host
 */
export const configureHostAudioElement = (audioElement, stream, participantId, isHost) => {
  if (!audioElement || !stream) return;
  
  if (isHost) {
    console.log(`🔊 AUDIO-UTILS: Configuring HOST audio element for ${participantId}`);
    
    // Extra configuration for host audio
    audioElement.muted = false;
    audioElement.volume = 1.0;
    audioElement.autoplay = true;
    audioElement.playsInline = true;
    
    // Force assign host stream
    audioElement.srcObject = stream;
    
    // Force play with retry for host audio
    const playHostAudio = () => {
      audioElement.play().then(() => {
        console.log(`✅ AUDIO-UTILS: Host audio play successful for ${participantId}`);
      }).catch(err => {
        console.log(`❌ AUDIO-UTILS: Host audio play failed for ${participantId}, retrying...`, err);
        setTimeout(playHostAudio, 100);
      });
    };
    
    playHostAudio();
    
    // Force enable host audio tracks
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach((track, index) => {
      if (!track.enabled) {
        track.enabled = true;
        console.log(`🔊 AUDIO-UTILS: Force enabled HOST audio track ${index} for ${participantId}`);
      }
      if (track.muted) {
        track.muted = false;
        console.log(`🔊 AUDIO-UTILS: Force unmuted HOST audio track ${index} for ${participantId}`);
      }
    });
  } else {
    // Use regular configuration for non-host streams
    configureAudioElement(audioElement, stream, participantId);
  }
};

/**
 * Monitors and assigns remote streams to audio elements
 * @param {Object} remoteStreams - Object containing remote streams
 * @param {Object} remoteAudioRefs - Object containing audio element refs
 */
export const monitorRemoteStreams = (remoteStreams, remoteAudioRefs) => {
  console.log('🔊 AUDIO-UTILS: Remote streams updated:', Object.keys(remoteStreams));
  
  Object.keys(remoteStreams).forEach(participantId => {
    const stream = remoteStreams[participantId];
    const audioElement = remoteAudioRefs.current[participantId];
    
    if (stream && audioElement) {
      console.log(`🔊 AUDIO-UTILS: Assigning stream to audio element for ${participantId}`);
      configureAudioElement(audioElement, stream, participantId);
    }
  });
};

/**
 * Creates audio constraints for optimal quality
 * @param {boolean} isMobileHotspot - Whether on mobile hotspot
 * @returns {Object} Audio constraints
 */
export const createAudioConstraints = (isMobileHotspot = false) => {
  const baseConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
    channelCount: 1
  };
  
  if (isMobileHotspot) {
    return {
      ...baseConstraints,
      sampleRate: 16000,
      channelCount: 1,
      latency: 0.1
    };
  }
  
  return baseConstraints;
};

/**
 * Tests audio functionality
 * @returns {Promise<Object>} Test results
 */
export const testAudioFunctionality = async () => {
  try {
    // Test browser support
    const browserSupport = {
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      AudioContext: !!(window.AudioContext || window.webkitAudioContext),
      WebRTC: !!window.RTCPeerConnection
    };
    
    // Test microphone access
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: createAudioConstraints()
    });
    
    const audioTracks = stream.getAudioTracks();
    const microphoneTest = {
      tracksFound: audioTracks.length,
      trackEnabled: audioTracks[0]?.enabled,
      trackReadyState: audioTracks[0]?.readyState,
      trackLabel: audioTracks[0]?.label
    };
    
    // Test audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioContextTest = {
      state: audioContext.state,
      sampleRate: audioContext.sampleRate
    };
    
    // Test audio devices
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = {
      inputs: devices.filter(d => d.kind === 'audioinput').length,
      outputs: devices.filter(d => d.kind === 'audiooutput').length,
      inputDevices: devices.filter(d => d.kind === 'audioinput').map(d => d.label)
    };
    
    // Clean up
    stream.getTracks().forEach(track => track.stop());
    audioContext.close();
    
    return {
      browserSupport,
      microphone: microphoneTest,
      audioContext: audioContextTest,
      audioDevices
    };
    
  } catch (error) {
    console.error('Audio test failed:', error);
    return { error: error.message };
  }
};

export default {
  ensureHostAudioTransmission,
  ensureAudioTracksEnabled,
  debugHostAudioReception,
  configureAudioElement,
  configureHostAudioElement,
  monitorRemoteStreams,
  createAudioConstraints,
  testAudioFunctionality
};
