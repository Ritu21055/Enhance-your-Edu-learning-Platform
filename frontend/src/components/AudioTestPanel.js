import React, { useState, useEffect, useRef } from 'react';
import { useUltraSimplePeer } from '../hooks/useUltraSimplePeer';

const AudioTestPanel = ({ meetingId, userName }) => {
  const [isTestActive, setIsTestActive] = useState(false);
  const [debugLog, setDebugLog] = useState([]);
  const [systemDiagnostics, setSystemDiagnostics] = useState({});
  const [participants, setParticipants] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneSourceRef = useRef(null);
  
  // Get WebNexus data from the hook
  const {
    localStream,
    remoteStreams,
    participants: webNexusParticipants,
    isHost,
    socket,
    isConnected
  } = useUltraSimplePeer(meetingId, userName);

  const log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setDebugLog(prev => [...prev.slice(-9), logMessage]);
    console.log(logMessage);
  };

  const updateSystemDiagnostics = () => {
    setSystemDiagnostics({
      browser: navigator.userAgent.split(' ').pop(),
      webrtc: !!window.RTCPeerConnection,
      mediaDevices: !!navigator.mediaDevices,
      audioContext: audioContextRef.current ? audioContextRef.current.state : 'Not initialized',
      microphone: microphoneSourceRef.current ? 'Connected' : 'Not connected',
      webrtcConnections: Object.keys(remoteStreams || {}).length,
      audioElements: document.querySelectorAll('audio').length,
      isHost: isHost,
      socketConnected: isConnected,
      localStreamActive: localStream?.active || false,
      participantsCount: webNexusParticipants?.length || 0
    });
  };

  const startAudioTest = async () => {
    log('🎤 Starting audio test...');
    setIsTestActive(true);
    
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      log('✅ Microphone access granted');
      
      // Set up audio analysis
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      microphoneSourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      microphoneSourceRef.current.connect(analyserRef.current);
      
      analyserRef.current.fftSize = 256;
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Start monitoring
      const monitorAudio = () => {
        if (!isTestActive || !analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const percentage = Math.min((average / 128) * 100, 100);
        setAudioLevel(percentage);
        
        requestAnimationFrame(monitorAudio);
      };
      
      monitorAudio();
      
      // Check for participants
      if (webNexusParticipants && webNexusParticipants.length > 0) {
        setParticipants(webNexusParticipants);
        log(`👥 Found ${webNexusParticipants.length} participants`);
      }
      
      log('🎯 Audio test started successfully');
      
    } catch (error) {
      log(`❌ Failed to start audio test: ${error.message}`);
    }
  };

  const stopAudioTest = () => {
    log('🛑 Stopping audio test...');
    setIsTestActive(false);
    
    if (microphoneSourceRef.current) {
      microphoneSourceRef.current.disconnect();
      microphoneSourceRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    log('✅ Audio test stopped');
  };

  const testWebRTCConnections = () => {
    log('🔍 Testing WebRTC connections...');
    
    if (localStream) {
      log(`✅ Local stream found: ${localStream.id}`);
      log(`   - Active: ${localStream.active}`);
      log(`   - Tracks: ${localStream.getTracks().length}`);
      log(`   - Audio tracks: ${localStream.getAudioTracks().length}`);
      log(`   - Video tracks: ${localStream.getVideoTracks().length}`);
    } else {
      log('❌ No local stream found');
    }
    
    if (remoteStreams && Object.keys(remoteStreams).length > 0) {
      log(`🔍 Found ${Object.keys(remoteStreams).length} remote streams`);
      Object.keys(remoteStreams).forEach(participantId => {
        const stream = remoteStreams[participantId];
        const participant = webNexusParticipants?.find(p => p.id === participantId);
        log(`   - ${participant?.name || participantId}:`);
        log(`     - Stream active: ${stream.active}`);
        log(`     - Audio tracks: ${stream.getAudioTracks().length}`);
        log(`     - Video tracks: ${stream.getVideoTracks().length}`);
      });
    } else {
      log('❌ No remote streams found');
    }
    
    if (webNexusParticipants && webNexusParticipants.length > 0) {
      log(`👥 Participants: ${webNexusParticipants.length}`);
      webNexusParticipants.forEach(participant => {
        log(`   - ${participant.name} (${participant.id}):`);
        log(`     - Is Host: ${participant.isHost}`);
        log(`     - Approved: ${participant.isApproved}`);
        log(`     - Audio enabled: ${participant.audioEnabled}`);
        log(`     - Video enabled: ${participant.videoEnabled}`);
      });
    } else {
      log('❌ No participants found');
    }
  };

  const clearDebugLog = () => {
    setDebugLog([]);
    log('🧹 Debug log cleared');
  };

  const exportDebugLog = () => {
    const logText = debugLog.join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('📁 Debug log exported');
  };

  // Update diagnostics periodically
  useEffect(() => {
    const interval = setInterval(updateSystemDiagnostics, 2000);
    return () => clearInterval(interval);
  }, [localStream, remoteStreams, webNexusParticipants, isHost, isConnected]);

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '400px',
      maxHeight: '80vh',
      background: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '20px',
      borderRadius: '10px',
      zIndex: 10000,
      overflow: 'auto',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <h3 style={{ margin: '0 0 15px 0', color: '#4CAF50' }}>
        🎤 Audio Test Panel
      </h3>
      
      <div style={{ marginBottom: '15px' }}>
        <button 
          onClick={isTestActive ? stopAudioTest : startAudioTest}
          style={{
            background: isTestActive ? '#f44336' : '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          {isTestActive ? 'Stop Test' : 'Start Test'}
        </button>
        
        <button 
          onClick={testWebRTCConnections}
          style={{
            background: '#2196F3',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Test WebRTC
        </button>
        
        <button 
          onClick={clearDebugLog}
          style={{
            background: '#ff9800',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Clear Log
        </button>
        
        <button 
          onClick={exportDebugLog}
          style={{
            background: '#9C27B0',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Export
        </button>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#FFC107' }}>System Diagnostics</h4>
        <div style={{ background: 'rgba(255, 255, 255, 0.1)', padding: '10px', borderRadius: '4px' }}>
          <div>Browser: {systemDiagnostics.browser}</div>
          <div>WebRTC: {systemDiagnostics.webrtc ? '✅' : '❌'}</div>
          <div>MediaDevices: {systemDiagnostics.mediaDevices ? '✅' : '❌'}</div>
          <div>Audio Context: {systemDiagnostics.audioContext}</div>
          <div>Microphone: {systemDiagnostics.microphone}</div>
          <div>WebRTC Connections: {systemDiagnostics.webrtcConnections}</div>
          <div>Audio Elements: {systemDiagnostics.audioElements}</div>
          <div>Is Host: {systemDiagnostics.isHost ? '✅' : '❌'}</div>
          <div>Socket Connected: {systemDiagnostics.socketConnected ? '✅' : '❌'}</div>
          <div>Local Stream: {systemDiagnostics.localStreamActive ? '✅' : '❌'}</div>
          <div>Participants: {systemDiagnostics.participantsCount}</div>
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#FFC107' }}>Audio Level</h4>
        <div style={{ 
          width: '100%', 
          height: '20px', 
          background: 'rgba(255, 255, 255, 0.1)', 
          borderRadius: '10px', 
          overflow: 'hidden' 
        }}>
          <div style={{
            height: '100%',
            background: `linear-gradient(90deg, #4CAF50, #FFC107, #f44336)`,
            width: `${audioLevel}%`,
            transition: 'width 0.1s ease'
          }}></div>
        </div>
        <div style={{ marginTop: '5px', fontSize: '10px' }}>
          Level: {Math.round(audioLevel)}%
        </div>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#FFC107' }}>Participants</h4>
        <div style={{ maxHeight: '100px', overflow: 'auto' }}>
          {participants.length > 0 ? (
            participants.map(participant => (
              <div key={participant.id} style={{ 
                padding: '5px', 
                margin: '2px 0', 
                background: 'rgba(255, 255, 255, 0.1)', 
                borderRadius: '4px' 
              }}>
                <div style={{ fontWeight: 'bold' }}>
                  {participant.name} {participant.isHost ? '(Host)' : ''}
                </div>
                <div style={{ fontSize: '10px' }}>
                  Audio: {participant.audioEnabled ? '✅' : '❌'} | 
                  Video: {participant.videoEnabled ? '✅' : '❌'}
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: '#ff9800' }}>No participants detected</div>
          )}
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 10px 0', color: '#FFC107' }}>Debug Log</h4>
        <div style={{ 
          background: 'rgba(0, 0, 0, 0.5)', 
          padding: '10px', 
          borderRadius: '4px', 
          maxHeight: '200px', 
          overflow: 'auto',
          fontSize: '10px'
        }}>
          {debugLog.map((log, index) => (
            <div key={index} style={{ marginBottom: '2px' }}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AudioTestPanel;
