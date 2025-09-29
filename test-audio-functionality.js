// Audio Functionality Test Script
// This script tests the audio features across different scenarios

console.log('🔊 Starting Audio Functionality Tests...');

// Test 1: Browser Audio Support
function testBrowserAudioSupport() {
  console.log('🧪 Test 1: Browser Audio Support');
  
  const results = {
    getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    audioContext: !!(window.AudioContext || window.webkitAudioContext),
    webRTC: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection),
    mediaDevices: !!navigator.mediaDevices
  };
  
  console.log('Browser Audio Support Results:', results);
  
  const allSupported = Object.values(results).every(supported => supported);
  console.log(allSupported ? '✅ Browser audio support: PASSED' : '❌ Browser audio support: FAILED');
  
  return results;
}

// Test 2: Audio Context Creation
function testAudioContextCreation() {
  console.log('🧪 Test 2: Audio Context Creation');
  
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log('Audio Context created successfully:', {
      state: audioContext.state,
      sampleRate: audioContext.sampleRate,
      baseLatency: audioContext.baseLatency
    });
    
    audioContext.close();
    console.log('✅ Audio Context Creation: PASSED');
    return true;
  } catch (error) {
    console.error('❌ Audio Context Creation: FAILED', error);
    return false;
  }
}

// Test 3: Microphone Access
async function testMicrophoneAccess() {
  console.log('🧪 Test 3: Microphone Access');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    const audioTracks = stream.getAudioTracks();
    console.log('Microphone Access Results:', {
      streamActive: stream.active,
      audioTracks: audioTracks.length,
      trackDetails: audioTracks.map(track => ({
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        label: track.label
      }))
    });
    
    // Test audio level detection
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    const audioLevel = Math.max(...dataArray);
    
    console.log('Audio Level Detection:', audioLevel);
    
    // Cleanup
    stream.getTracks().forEach(track => track.stop());
    audioContext.close();
    
    console.log('✅ Microphone Access: PASSED');
    return true;
  } catch (error) {
    console.error('❌ Microphone Access: FAILED', error);
    return false;
  }
}

// Test 4: Audio Constraints
async function testAudioConstraints() {
  console.log('🧪 Test 4: Audio Constraints');
  
  const constraints = [
    { name: 'Basic Audio', constraints: { audio: true } },
    { name: 'Enhanced Audio', constraints: { 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }},
    { name: 'Advanced Audio', constraints: {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        googEchoCancellation: true,
        googNoiseSuppression: true,
        googAutoGainControl: true
      }
    }}
  ];
  
  const results = {};
  
  for (const test of constraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(test.constraints);
      const audioTracks = stream.getAudioTracks();
      
      results[test.name] = {
        success: true,
        tracks: audioTracks.length,
        trackDetails: audioTracks.map(track => ({
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          constraints: track.getConstraints()
        }))
      };
      
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      results[test.name] = {
        success: false,
        error: error.message
      };
    }
  }
  
  console.log('Audio Constraints Results:', results);
  
  const allPassed = Object.values(results).every(result => result.success);
  console.log(allPassed ? '✅ Audio Constraints: PASSED' : '❌ Audio Constraints: FAILED');
  
  return results;
}

// Test 5: Audio Device Enumeration
async function testAudioDeviceEnumeration() {
  console.log('🧪 Test 5: Audio Device Enumeration');
  
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
    
    console.log('Audio Devices Found:', {
      audioInputs: audioInputs.length,
      audioOutputs: audioOutputs.length,
      inputDevices: audioInputs.map(device => ({
        deviceId: device.deviceId,
        label: device.label,
        groupId: device.groupId
      })),
      outputDevices: audioOutputs.map(device => ({
        deviceId: device.deviceId,
        label: device.label,
        groupId: device.groupId
      }))
    });
    
    console.log('✅ Audio Device Enumeration: PASSED');
    return true;
  } catch (error) {
    console.error('❌ Audio Device Enumeration: FAILED', error);
    return false;
  }
}

// Test 6: Audio Playback
async function testAudioPlayback() {
  console.log('🧪 Test 6: Audio Playback');
  
  try {
    // Create a test audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a simple sine wave
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    
    oscillator.start();
    
    // Play for 100ms
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 100);
    
    console.log('✅ Audio Playback: PASSED');
    return true;
  } catch (error) {
    console.error('❌ Audio Playback: FAILED', error);
    return false;
  }
}

// Test 7: WebRTC Audio Stream
async function testWebRTCAudioStream() {
  console.log('🧪 Test 7: WebRTC Audio Stream');
  
  try {
    // Create a local stream
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    // Create a peer connection
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    // Add audio track to peer connection
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      peerConnection.addTrack(audioTrack, localStream);
      console.log('Audio track added to peer connection');
    }
    
    // Test stream properties
    console.log('WebRTC Audio Stream Results:', {
      streamActive: localStream.active,
      audioTracks: localStream.getAudioTracks().length,
      trackEnabled: audioTrack?.enabled,
      trackMuted: audioTrack?.muted,
      trackReadyState: audioTrack?.readyState
    });
    
    // Cleanup
    localStream.getTracks().forEach(track => track.stop());
    peerConnection.close();
    
    console.log('✅ WebRTC Audio Stream: PASSED');
    return true;
  } catch (error) {
    console.error('❌ WebRTC Audio Stream: FAILED', error);
    return false;
  }
}

// Test 8: Audio Level Monitoring
async function testAudioLevelMonitoring() {
  console.log('🧪 Test 8: Audio Level Monitoring');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    
    analyser.fftSize = 256;
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Monitor audio levels for 2 seconds
    let maxLevel = 0;
    let samples = 0;
    
    const monitorInterval = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);
      const currentLevel = Math.max(...dataArray);
      maxLevel = Math.max(maxLevel, currentLevel);
      samples++;
      
      if (samples >= 20) { // 2 seconds at 100ms intervals
        clearInterval(monitorInterval);
        
        console.log('Audio Level Monitoring Results:', {
          maxLevel,
          samples,
          averageLevel: dataArray.reduce((a, b) => a + b) / dataArray.length
        });
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
        
        console.log('✅ Audio Level Monitoring: PASSED');
      }
    }, 100);
    
    return true;
  } catch (error) {
    console.error('❌ Audio Level Monitoring: FAILED', error);
    return false;
  }
}

// Run all tests
async function runAllAudioTests() {
  console.log('🚀 Running All Audio Functionality Tests...');
  
  const results = {
    browserSupport: testBrowserAudioSupport(),
    audioContext: testAudioContextCreation(),
    microphone: await testMicrophoneAccess(),
    constraints: await testAudioConstraints(),
    deviceEnumeration: await testAudioDeviceEnumeration(),
    playback: await testAudioPlayback(),
    webRTC: await testWebRTCAudioStream(),
    levelMonitoring: await testAudioLevelMonitoring()
  };
  
  console.log('📊 Final Test Results:', results);
  
  const passedTests = Object.values(results).filter(result => 
    typeof result === 'boolean' ? result : result.success !== false
  ).length;
  
  const totalTests = Object.keys(results).length;
  
  console.log(`🎯 Test Summary: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All audio functionality tests PASSED!');
  } else {
    console.log('⚠️ Some audio functionality tests FAILED. Check the results above.');
  }
  
  return results;
}

// Export for use in browser console
window.audioTests = {
  runAll: runAllAudioTests,
  browserSupport: testBrowserAudioSupport,
  audioContext: testAudioContextCreation,
  microphone: testMicrophoneAccess,
  constraints: testAudioConstraints,
  deviceEnumeration: testAudioDeviceEnumeration,
  playback: testAudioPlayback,
  webRTC: testWebRTCAudioStream,
  levelMonitoring: testAudioLevelMonitoring
};

console.log('🔊 Audio Functionality Test Script Loaded!');
console.log('💡 Run audioTests.runAll() to execute all tests');
console.log('💡 Or run individual tests like audioTests.microphone()');
