import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Alert,
  AlertTitle,
  Chip,
  Divider,
  IconButton,
  Collapse
} from '@mui/material';
import {
  VolumeUp,
  VolumeOff,
  Mic,
  MicOff,
  CheckCircle,
  Error,
  Warning,
  Info,
  Refresh,
  Settings,
  Close
} from '@mui/icons-material';

const AudioTroubleshooter = ({ localStream, remoteStreams, isVisible, onClose }) => {
  const [audioTests, setAudioTests] = useState({});
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [audioContext, setAudioContext] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);

  // Initialize audio context for testing
  useEffect(() => {
    if (isVisible && !audioContext) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        setAudioContext(ctx);
        console.log('🔧 AudioTroubleshooter: Audio context initialized');
      } catch (error) {
        console.error('🔧 AudioTroubleshooter: Failed to initialize audio context:', error);
      }
    }

    return () => {
      if (audioContext) {
        audioContext.close();
        setAudioContext(null);
      }
    };
  }, [isVisible, audioContext]);

  // Test local audio
  const testLocalAudio = async () => {
    if (!localStream || !audioContext) return false;

    try {
      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack) return false;

      const source = audioContext.createMediaStreamSource(localStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const hasAudio = dataArray.some(value => value > 0);
      const audioLevel = Math.max(...dataArray);

      source.disconnect();

      return {
        hasAudio,
        audioLevel,
        trackEnabled: audioTrack.enabled,
        trackReadyState: audioTrack.readyState,
        trackMuted: audioTrack.muted
      };
    } catch (error) {
      console.error('🔧 AudioTroubleshooter: Local audio test failed:', error);
      return false;
    }
  };

  // Test remote audio
  const testRemoteAudio = async (participantId, stream) => {
    if (!stream || !audioContext) return false;

    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return false;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const hasAudio = dataArray.some(value => value > 0);
      const audioLevel = Math.max(...dataArray);

      source.disconnect();

      return {
        hasAudio,
        audioLevel,
        trackEnabled: audioTrack.enabled,
        trackReadyState: audioTrack.readyState,
        trackMuted: audioTrack.muted
      };
    } catch (error) {
      console.error('🔧 AudioTroubleshooter: Remote audio test failed:', error);
      return false;
    }
  };

  // Run comprehensive audio tests
  const runAudioTests = async () => {
    setIsRunningTests(true);
    setTestResults({});

    const tests = {};

    // Test 1: Browser audio support
    tests.browserSupport = {
      name: 'Browser Audio Support',
      status: 'checking',
      details: []
    };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      tests.browserSupport.status = 'success';
      tests.browserSupport.details.push('getUserMedia API supported');
    } else {
      tests.browserSupport.status = 'error';
      tests.browserSupport.details.push('getUserMedia API not supported');
    }

    if (window.AudioContext || window.webkitAudioContext) {
      tests.browserSupport.status = 'success';
      tests.browserSupport.details.push('Web Audio API supported');
    } else {
      tests.browserSupport.status = 'error';
      tests.browserSupport.details.push('Web Audio API not supported');
    }

    // Test 2: Audio context
    tests.audioContext = {
      name: 'Audio Context',
      status: 'checking',
      details: []
    };

    if (audioContext) {
      tests.audioContext.status = 'success';
      tests.audioContext.details.push(`Audio context state: ${audioContext.state}`);
      tests.audioContext.details.push(`Sample rate: ${audioContext.sampleRate}Hz`);
    } else {
      tests.audioContext.status = 'error';
      tests.audioContext.details.push('Audio context not available');
    }

    // Test 3: Local stream
    tests.localStream = {
      name: 'Local Audio Stream',
      status: 'checking',
      details: []
    };

    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        tests.localStream.details.push(`Track enabled: ${audioTrack.enabled}`);
        tests.localStream.details.push(`Track ready state: ${audioTrack.readyState}`);
        tests.localStream.details.push(`Track muted: ${audioTrack.muted}`);
        tests.localStream.details.push(`Track constraints: ${JSON.stringify(audioTrack.getConstraints?.() || {})}`);

        const localAudioTest = await testLocalAudio();
        if (localAudioTest) {
          tests.localStream.details.push(`Audio detected: ${localAudioTest.hasAudio}`);
          tests.localStream.details.push(`Audio level: ${localAudioTest.audioLevel}`);
          tests.localStream.status = localAudioTest.hasAudio ? 'success' : 'warning';
        } else {
          tests.localStream.status = 'error';
          tests.localStream.details.push('Audio test failed');
        }
      } else {
        tests.localStream.status = 'error';
        tests.localStream.details.push('No audio track found');
      }
    } else {
      tests.localStream.status = 'error';
      tests.localStream.details.push('No local stream available');
    }

    // Test 4: Remote streams
    tests.remoteStreams = {
      name: 'Remote Audio Streams',
      status: 'checking',
      details: []
    };

    if (Object.keys(remoteStreams).length > 0) {
      let hasWorkingRemoteAudio = false;
      for (const [participantId, stream] of Object.entries(remoteStreams)) {
        const remoteAudioTest = await testRemoteAudio(participantId, stream);
        if (remoteAudioTest) {
          tests.remoteStreams.details.push(`Participant ${participantId}: Audio detected: ${remoteAudioTest.hasAudio}`);
          tests.remoteStreams.details.push(`Participant ${participantId}: Audio level: ${remoteAudioTest.audioLevel}`);
          if (remoteAudioTest.hasAudio) hasWorkingRemoteAudio = true;
        } else {
          tests.remoteStreams.details.push(`Participant ${participantId}: Audio test failed`);
        }
      }
      tests.remoteStreams.status = hasWorkingRemoteAudio ? 'success' : 'warning';
    } else {
      tests.remoteStreams.status = 'info';
      tests.remoteStreams.details.push('No remote streams available');
    }

    // Test 5: System audio
    tests.systemAudio = {
      name: 'System Audio',
      status: 'checking',
      details: []
    };

    // Check if audio is muted at system level
    if (navigator.mediaDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        tests.systemAudio.details.push(`Audio input devices: ${audioInputs.length}`);
        audioInputs.forEach(device => {
          tests.systemAudio.details.push(`- ${device.label || 'Unknown device'}`);
        });
        tests.systemAudio.status = audioInputs.length > 0 ? 'success' : 'warning';
      } catch (error) {
        tests.systemAudio.status = 'error';
        tests.systemAudio.details.push(`Device enumeration failed: ${error.message}`);
      }
    }

    setTestResults(tests);
    setIsRunningTests(false);
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle color="success" />;
      case 'error': return <Error color="error" />;
      case 'warning': return <Warning color="warning" />;
      case 'info': return <Info color="info" />;
      default: return <Settings color="action" />;
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'success';
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'default';
    }
  };

  if (!isVisible) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 20,
        right: 20,
        width: 400,
        maxHeight: '80vh',
        overflow: 'auto',
        zIndex: 9999
      }}
    >
      <Card sx={{ boxShadow: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" component="h2">
              🔧 Audio Troubleshooter
            </Typography>
            <Box>
              <IconButton onClick={() => setIsExpanded(!isExpanded)} size="small">
                <Settings />
              </IconButton>
              <IconButton onClick={onClose} size="small">
                <Close />
              </IconButton>
            </Box>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>Audio Diagnostics</AlertTitle>
            This tool helps diagnose audio issues in your video conference.
          </Alert>

          <Button
            variant="contained"
            fullWidth
            onClick={runAudioTests}
            disabled={isRunningTests}
            startIcon={isRunningTests ? <Refresh /> : <VolumeUp />}
            sx={{ mb: 2 }}
          >
            {isRunningTests ? 'Running Tests...' : 'Run Audio Tests'}
          </Button>

          <Collapse in={isExpanded}>
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Quick Fixes:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Check browser permissions"
                    secondary="Ensure microphone access is allowed"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Check system audio"
                    secondary="Ensure microphone is not muted in system settings"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Try different browser"
                    secondary="Some browsers have better audio support"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Check network connection"
                    secondary="Poor network can affect audio quality"
                  />
                </ListItem>
              </List>
            </Box>
          </Collapse>

          {Object.keys(testResults).length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Test Results:
              </Typography>
              {Object.entries(testResults).map(([key, test]) => (
                <Box key={key} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    {getStatusIcon(test.status)}
                    <Typography variant="body2" sx={{ ml: 1, flexGrow: 1 }}>
                      {test.name}
                    </Typography>
                    <Chip
                      label={test.status}
                      color={getStatusColor(test.status)}
                      size="small"
                    />
                  </Box>
                  <List dense>
                    {test.details.map((detail, index) => (
                      <ListItem key={index} sx={{ py: 0 }}>
                        <ListItemText
                          primary={detail}
                          primaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                  <Divider sx={{ mt: 1 }} />
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default AudioTroubleshooter;
