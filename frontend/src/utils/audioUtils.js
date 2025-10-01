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
  console.log(`🔊 AUDIO-UTILS: ensureHostAudioTransmission called for ${participantId}, isHost: ${isHost}`);
  
  if (!isHost) {
    console.log(`🔊 AUDIO-UTILS: Not host, skipping audio transmission for ${participantId}`);
    return;
  }
  
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
  console.log(`🔊 AUDIO-UTILS: debugHostAudioReception called for ${participantId}`);
  console.log(`🔊 AUDIO-UTILS: Participants:`, participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })));
  
  const isHost = participants.find(p => p.id === participantId)?.isHost;
  console.log(`🔊 AUDIO-UTILS: Is host check for ${participantId}: ${isHost}`);
  
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

// Comprehensive audio initialization and management
export const initializeAudioStream = async (stream, setMicrophoneStatus) => {
  console.log('🔊 AUDIO-UTILS: Initializing audio stream');
  
  if (!stream) {
    console.log('❌ AUDIO-UTILS: No stream provided');
    setMicrophoneStatus('no-stream');
    return null;
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.log('❌ AUDIO-UTILS: No audio tracks found in stream');
    setMicrophoneStatus('no-audio-tracks');
    return null;
  }

  const audioTrack = audioTracks[0];
  console.log('🎤 AUDIO-UTILS: Microphone Status:', {
    enabled: audioTrack.enabled,
    muted: audioTrack.muted,
    readyState: audioTrack.readyState,
    label: audioTrack.label,
    constraints: audioTrack.getConstraints()
  });

  // Ensure audio track is enabled and not muted
  if (audioTrack.enabled === false) {
    console.log('🔧 AUDIO-UTILS: Enabling audio track...');
    audioTrack.enabled = true;
  }

  if (audioTrack.muted === true) {
    console.log('🔧 AUDIO-UTILS: Unmuting audio track...');
    audioTrack.muted = false;
  }

  // Test if microphone is actually working
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const checkAudio = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      console.log('🎤 AUDIO-UTILS: Audio Level:', average);
      if (average > 0) {
        console.log('✅ AUDIO-UTILS: Microphone is working - audio detected');
        setMicrophoneStatus('working');
      } else {
        console.log('⚠️ AUDIO-UTILS: Microphone not detecting audio - check permissions');
        setMicrophoneStatus('no-audio-detected');
      }
    };

    setTimeout(checkAudio, 1000);
  } catch (error) {
    console.log('❌ AUDIO-UTILS: Audio context error:', error);
    setMicrophoneStatus('audio-context-error');
  }

  return audioTrack;
};

// Handle audio constraints for peer connections
export const applyAudioConstraints = async (stream, participantId) => {
  console.log(`🔊 AUDIO-UTILS: Applying audio constraints for ${participantId}`);
  
  if (!stream) {
    console.log('❌ AUDIO-UTILS: No stream provided for constraints');
    return;
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.log('❌ AUDIO-UTILS: No audio tracks found for constraints');
    return;
  }

  const audioTrack = audioTracks[0];
  
  try {
    await audioTrack.applyConstraints({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    });
    console.log(`✅ AUDIO-UTILS: Applied audio constraints for ${participantId}`);
  } catch (error) {
    console.log(`❌ AUDIO-UTILS: Audio constraint error for ${participantId}:`, error.message);
  }

  // Ensure audio track is properly enabled
  if (!audioTrack.enabled) {
    console.log(`🔧 AUDIO-UTILS: Enabling audio track for ${participantId}`);
    audioTrack.enabled = true;
  }

  if (audioTrack.muted) {
    console.log(`🔧 AUDIO-UTILS: Unmuting audio track for ${participantId}`);
    audioTrack.muted = false;
  }

  // Force audio track to be active
  if (audioTrack.readyState === 'ended') {
    console.log(`🔧 AUDIO-UTILS: Audio track ended, attempting to restart for ${participantId}`);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const newAudioTrack = newStream.getAudioTracks()[0];
      if (newAudioTrack) {
        stream.removeTrack(audioTrack);
        stream.addTrack(newAudioTrack);
        console.log(`✅ AUDIO-UTILS: Replaced audio track for ${participantId}`);
      }
    } catch (error) {
      console.log(`❌ AUDIO-UTILS: Could not replace audio track for ${participantId}:`, error.message);
    }
  }

  console.log(`🎤 AUDIO-UTILS: Audio track status for ${participantId}:`, {
    enabled: audioTrack.enabled,
    muted: audioTrack.muted,
    readyState: audioTrack.readyState,
    label: audioTrack.label,
    id: audioTrack.id,
    kind: audioTrack.kind
  });
};


// Fix audio echo issues
export const fixAudioEcho = async (localStream) => {
  try {
    console.log('🔧 AUDIO-UTILS: Applying echo cancellation fixes...');
    
    if (!localStream) {
      console.log('❌ AUDIO-UTILS: No current stream to fix');
      return;
    }
    
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log('❌ AUDIO-UTILS: No audio tracks found');
      return;
    }
    
    // Apply enhanced echo cancellation constraints
    const echoConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      googEchoCancellation: true,
      googNoiseSuppression: true,
      googAutoGainControl: true,
      googHighpassFilter: true,
      googTypingNoiseDetection: true,
      googAudioMirroring: false
    };
    
    audioTracks.forEach(async (track, index) => {
      try {
        await track.applyConstraints(echoConstraints);
        console.log(`🔧 AUDIO-UTILS: Applied echo cancellation to track ${index}`);
      } catch (error) {
        console.log(`⚠️ AUDIO-UTILS: Could not apply constraints to track ${index}:`, error.message);
      }
    });
    
    console.log('✅ AUDIO-UTILS: Echo cancellation applied');
    return true;
    
  } catch (error) {
    console.error('❌ AUDIO-UTILS: Failed to apply echo cancellation:', error);
    return false;
  }
};

// Force re-initialize audio for all participants
export const forceReinitializeAudio = async (localStream, peersRef) => {
  console.log('🔧 AUDIO-UTILS: Force re-initializing audio for all participants...');
  
  if (!localStream) {
    console.log('❌ AUDIO-UTILS: No local stream available');
    return;
  }

  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length === 0) {
    console.log('❌ AUDIO-UTILS: No audio tracks found in local stream');
    return;
  }

  // Force enable and unmute all audio tracks
  audioTracks.forEach((track, index) => {
    if (!track.enabled) {
      track.enabled = true;
      console.log(`🔧 AUDIO-UTILS: Force enabled audio track ${index}`);
    }
    if (track.muted) {
      track.muted = false;
      console.log(`🔧 AUDIO-UTILS: Force unmuted audio track ${index}`);
    }
  });

  // Re-add stream to all existing peer connections
  Object.keys(peersRef.current).forEach(participantId => {
    const peer = peersRef.current[participantId];
    if (peer && peer.addStream) {
      try {
        peer.addStream(localStream);
        console.log(`🔧 AUDIO-UTILS: Re-added stream to peer ${participantId}`);
      } catch (error) {
        console.log(`⚠️ AUDIO-UTILS: Could not re-add stream to peer ${participantId}:`, error.message);
      }
    }
  });
  
  console.log('✅ AUDIO-UTILS: Audio re-initialization completed');
};

// Comprehensive audio debugging and fixing function
export const handleStreamReception = (stream, participantId, participants) => {
  console.log(`🔊 AUDIO-UTILS: handleStreamReception called for ${participantId}`);
  console.log(`🔊 AUDIO-UTILS: Stream details:`, {
    streamActive: stream.active,
    audioTracksCount: stream.getAudioTracks().length,
    videoTracksCount: stream.getVideoTracks().length,
    streamId: stream.id
  });
  
  // Force enable all audio tracks for incoming stream
  const audioTracks = stream.getAudioTracks();
  audioTracks.forEach((track, index) => {
    console.log(`🔊 AUDIO-UTILS: Incoming audio track ${index} before fix:`, {
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      label: track.label
    });
    
    if (!track.enabled) {
      track.enabled = true;
      console.log(`🔊 AUDIO-UTILS: Force enabled incoming audio track ${index} for ${participantId}`);
    }
    if (track.muted) {
      track.muted = false;
      console.log(`🔊 AUDIO-UTILS: Force unmuted incoming audio track ${index} for ${participantId}`);
    }
  });
  
  // Force enable all video tracks for incoming stream
  const videoTracks = stream.getVideoTracks();
  videoTracks.forEach((track, index) => {
    console.log(`🎥 AUDIO-UTILS: Incoming video track ${index} before fix:`, {
      enabled: track.enabled,
      readyState: track.readyState,
      label: track.label
    });
    
    if (!track.enabled) {
      track.enabled = true;
      console.log(`🎥 AUDIO-UTILS: Force enabled incoming video track ${index} for ${participantId}`);
    }
  });
  
  console.log(`🔊 AUDIO-UTILS: Stream reception handling completed for ${participantId}`);
};

export const fixAudioIssue = async (localStream, peersRef) => {
  console.log('🔧 AUDIO-UTILS: Starting comprehensive audio fix...');
  
  try {
    // Step 1: Check current audio state
    console.log('🔧 AUDIO-UTILS: Checking current audio state...');
    
    if (!localStream) {
      console.log('❌ AUDIO-UTILS: No local stream available');
      return false;
    }

    const audioTracks = localStream.getAudioTracks();
    console.log(`🔧 AUDIO-UTILS: Found ${audioTracks.length} audio tracks`);
    
    // Step 2: Force enable all audio tracks
    audioTracks.forEach((track, index) => {
      console.log(`🔧 AUDIO-UTILS: Audio track ${index} status:`, {
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        label: track.label
      });
      
      if (!track.enabled) {
        track.enabled = true;
        console.log(`🔧 AUDIO-UTILS: Force enabled audio track ${index}`);
      }
      
      if (track.muted) {
        track.muted = false;
        console.log(`🔧 AUDIO-UTILS: Force unmuted audio track ${index}`);
      }
    });

    // Step 3: Re-add stream to all peers
    Object.keys(peersRef.current).forEach(participantId => {
      const peer = peersRef.current[participantId];
      if (peer && peer.addStream) {
        try {
          peer.addStream(localStream);
          console.log(`🔧 AUDIO-UTILS: Re-added stream to peer ${participantId}`);
        } catch (error) {
          console.log(`⚠️ AUDIO-UTILS: Could not re-add stream to peer ${participantId}:`, error.message);
        }
      }
    });

    console.log('✅ AUDIO-UTILS: Comprehensive audio fix completed');
    return true;
    
  } catch (error) {
    console.error('❌ AUDIO-UTILS: Failed to fix audio issue:', error);
    return false;
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
  testAudioFunctionality,
  initializeAudioStream,
  applyAudioConstraints,
  handleStreamReception,
  fixAudioEcho,
  forceReinitializeAudio,
  fixAudioIssue
};
