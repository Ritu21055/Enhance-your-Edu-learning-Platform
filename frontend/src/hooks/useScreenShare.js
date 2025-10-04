import { useState, useEffect, useRef, useCallback } from 'react';
import SimplePeer from 'simple-peer';

/**
 * Custom hook for screen sharing functionality
 * Handles screen capture, peer connections, and stream management
 */
const useScreenShare = (socket, meetingId, userName, isHost) => {
  console.log('🖥️ Screen Share: useScreenShare hook called', {
    hasSocket: !!socket,
    socketConnected: socket?.connected,
    meetingId,
    userName,
    isHost
  });
  console.log('🖥️ Screen Share: Hook initialization starting...');
  
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [screenSharePeer, setScreenSharePeer] = useState(null);
  const [screenShareParticipants, setScreenShareParticipants] = useState([]);
  const [screenShareError, setScreenShareError] = useState(null);
  
  const screenSharePeersRef = useRef({});
  const screenShareStreamRef = useRef(null);
  const isScreenSharingRef = useRef(false);

  // Initialize screen sharing socket events
  useEffect(() => {
    console.log('🖥️ Screen Share: useEffect triggered', {
      hasSocket: !!socket,
      socketConnected: socket?.connected,
      socketId: socket?.id,
      hasOn: !!socket?.on
    });
    
    if (!socket || !socket.on) {
      console.log('🖥️ Screen Share: Socket not available, skipping event setup');
      return;
    }

    console.log('🖥️ Screen Share: Setting up socket events');
    console.log('🖥️ Screen Share: Socket details:', {
      id: socket.id,
      connected: socket.connected,
      hasOn: !!socket.on
    });
    
    // Add a test event listener to verify socket is working
    const testHandler = (data) => {
      console.log('🖥️ Screen Share: TEST EVENT RECEIVED:', data);
    };
    socket.on('test-screen-share', testHandler);
    
    // Test socket connection
    console.log('🖥️ Screen Share: Testing socket connection...');
    socket.emit('test-screen-share', { message: 'Testing screen share socket', timestamp: Date.now() });
    
    // Add a simple test to see if socket is working
    console.log('🖥️ Screen Share: Testing basic socket functionality...');
    socket.emit('test-connection', { 
      message: 'Testing basic socket connection from participant', 
      timestamp: Date.now(),
      participantId: userName,
      meetingId: meetingId
    });
    
    // Add debugging for all socket events
    const originalEmit = socket.emit;
    socket.emit = function(event, data) {
      console.log('🖥️ Screen Share: Socket emitting event:', event, data);
      return originalEmit.call(this, event, data);
    };
    
    // Add debugging for all socket events received
    const originalOn = socket.on;
    socket.on = function(event, handler) {
      console.log('🖥️ Screen Share: Socket registering listener for:', event);
      return originalOn.call(this, event, handler);
    };
    
    // Add debugging to see if socket is receiving any events
    console.log('🖥️ Screen Share: Socket connection status:', {
      connected: socket.connected,
      id: socket.id,
      readyState: socket.readyState
    });
    
    // Add a listener for a common event to test if socket is working
    socket.on('connect', () => {
      console.log('🖥️ Screen Share: Socket connected!');
    });
    
    socket.on('disconnect', () => {
      console.log('🖥️ Screen Share: Socket disconnected!');
    });

    // Handle screen share start
    socket.on('screen-share-start', (data) => {
      console.log('🖥️ Screen Share: Received screen-share-start', data);
      console.log('🖥️ Screen Share: PARTICIPANT RECEIVED SCREEN SHARE START EVENT!');
      console.log('🖥️ Screen Share: Data structure analysis:', {
        hasData: !!data,
        dataType: typeof data,
        dataKeys: data ? Object.keys(data) : 'no data',
        hasParticipant: data && !!data.participant,
        participantType: data && data.participant ? typeof data.participant : 'no participant',
        participantKeys: data && data.participant ? Object.keys(data.participant) : 'no participant',
        fullData: data,
        dataStringified: JSON.stringify(data, null, 2)
      });
      
      // Simple test for array data
      if (Array.isArray(data)) {
        console.log('🖥️ Screen Share: Data is array with length:', data.length);
        console.log('🖥️ Screen Share: First element:', data[0]);
        console.log('🖥️ Screen Share: First element keys:', data[0] ? Object.keys(data[0]) : 'no first element');
      }
      
      // Log the actual data structure
      console.log('🖥️ Screen Share: ACTUAL DATA STRUCTURE:', data);
      console.log('🖥️ Screen Share: DATA TYPE:', typeof data);
      console.log('🖥️ Screen Share: DATA KEYS:', data ? Object.keys(data) : 'no data');
      console.log('🖥️ Screen Share: DATA VALUES:', data ? Object.values(data) : 'no data');
      
      // Check if data and participant exist before adding
      if (data && data.participant) {
        console.log('🖥️ Screen Share: Adding participant to screen share list', data.participant);
        setScreenShareParticipants(prev => [...prev, data.participant]);
      } else if (Array.isArray(data) && data.length > 0) {
        // Handle case where data is wrapped in an array
        console.log('🖥️ Screen Share: Data is array, checking first element', data[0]);
        const firstElement = data[0];
        if (firstElement && firstElement.participant) {
          console.log('🖥️ Screen Share: Adding participant from array to screen share list', firstElement.participant);
          setScreenShareParticipants(prev => [...prev, firstElement.participant]);
        } else if (firstElement && typeof firstElement === 'object') {
          // Try to find participant data in the first element
          console.log('🖥️ Screen Share: First element keys:', Object.keys(firstElement));
          console.log('🖥️ Screen Share: First element:', firstElement);
          // If the first element itself is the participant data
          if (firstElement.name || firstElement.id) {
            console.log('🖥️ Screen Share: First element appears to be participant data, adding it');
            setScreenShareParticipants(prev => [...prev, firstElement]);
          } else {
            console.warn('🖥️ Screen Share: First element does not contain participant data');
          }
        } else {
          console.warn('🖥️ Screen Share: First element is not an object or is null');
        }
      } else {
        console.warn('🖥️ Screen Share: Invalid screen-share-start data', data);
        console.warn('🖥️ Screen Share: Expected data.participant but got:', data?.participant);
        console.warn('🖥️ Screen Share: Data is array:', Array.isArray(data));
        console.warn('🖥️ Screen Share: Array length:', Array.isArray(data) ? data.length : 'not array');
        
        // Try to find participant data in different possible structures
        if (data && typeof data === 'object') {
          console.log('🖥️ Screen Share: Trying to find participant data in object...');
          console.log('🖥️ Screen Share: Object keys:', Object.keys(data));
          console.log('🖥️ Screen Share: Object values:', Object.values(data));
          
          // Log each key-value pair
          Object.entries(data).forEach(([key, value], index) => {
            console.log(`🖥️ Screen Share: Key ${index}: "${key}" = `, value);
            console.log(`🖥️ Screen Share: Value type: ${typeof value}`);
            if (value && typeof value === 'object') {
              console.log(`🖥️ Screen Share: Value keys: ${Object.keys(value)}`);
            }
          });
          
          // Check if any of the values might be participant data
          Object.values(data).forEach((value, index) => {
            if (value && typeof value === 'object' && (value.name || value.id)) {
              console.log(`🖥️ Screen Share: Found potential participant data at index ${index}:`, value);
              console.log('🖥️ Screen Share: Adding potential participant to screen share list');
              setScreenShareParticipants(prev => [...prev, value]);
            }
          });
        }
      }
    });

    // Handle screen share stop
    socket.on('screen-share-stop', (data) => {
      console.log('🖥️ Screen Share: Received screen-share-stop', data);
      console.log('🖥️ Screen Share: PARTICIPANT RECEIVED SCREEN SHARE STOP EVENT!');
      console.log('🖥️ Screen Share: Stop data structure analysis:', {
        hasData: !!data,
        dataType: typeof data,
        dataKeys: data ? Object.keys(data) : 'no data',
        hasParticipantId: data && !!data.participantId,
        participantIdValue: data?.participantId,
        fullData: data,
        dataStringified: JSON.stringify(data, null, 2)
      });
      
      // Check if data and participantId exist before filtering
      if (data && data.participantId) {
        console.log('🖥️ Screen Share: Removing participant from screen share list', data.participantId);
        setScreenShareParticipants(prev => 
          prev.filter(p => p && p.id !== data.participantId)
        );
        
        // Clean up peer connection
        if (screenSharePeersRef.current[data.participantId]) {
          screenSharePeersRef.current[data.participantId].destroy();
          delete screenSharePeersRef.current[data.participantId];
        }
      } else {
        console.warn('🖥️ Screen Share: Invalid screen-share-stop data', data);
        console.warn('🖥️ Screen Share: Expected data.participantId but got:', data?.participantId);
      }
    });

    // Handle screen share signal
    socket.on('screen-share-signal', (data) => {
      console.log('🖥️ Screen Share: Received screen-share-signal', data);
      if (data) {
        handleScreenShareSignal(data);
      } else {
        console.warn('🖥️ Screen Share: Invalid screen-share-signal data', data);
      }
    });

    // Handle screen share request
    socket.on('screen-share-request', (data) => {
      console.log('🖥️ Screen Share: Received screen-share-request', data);
      console.log('🖥️ Screen Share: PARTICIPANT RECEIVED SCREEN SHARE REQUEST EVENT!');
      if (data) {
        console.log('🖥️ Screen Share: Processing screen share request from', data.from);
        handleScreenShareRequest(data);
      } else {
        console.warn('🖥️ Screen Share: Invalid screen-share-request data', data);
      }
    });

    return () => {
      console.log('🖥️ Screen Share: Cleaning up socket events');
      if (socket && socket.off) {
        socket.off('screen-share-start');
        socket.off('screen-share-stop');
        socket.off('screen-share-signal');
        socket.off('screen-share-request');
        socket.off('test-screen-share');
      }
    };
  }, [socket]);

  // Create screen share peer connection
  const createScreenSharePeer = useCallback((participantId, signal = null) => {
    console.log('🖥️ Screen Share: Creating peer for', participantId, 'with signal:', !!signal);
    
    const peer = new SimplePeer({
      initiator: !signal,
      trickle: false,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    // Handle peer connection
    peer.on('signal', (signal) => {
      console.log('🖥️ Screen Share: Sending signal to', participantId);
      if (socket && socket.emit && socket.id) {
        socket.emit('screen-share-signal', {
          to: participantId,
          signal: signal,
          from: socket.id
        });
      } else {
        console.warn('🖥️ Screen Share: Socket not available for signal');
      }
    });

    // Handle stream reception
    peer.on('stream', (stream) => {
      console.log('🖥️ Screen Share: Received remote screen stream from', participantId);
      console.log('🖥️ Screen Share: Stream details:', {
        id: stream.id,
        active: stream.active,
        tracks: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });
      console.log('🖥️ Screen Share: Setting remote screen stream');
      setRemoteScreenStream(stream);
    });

    // Handle connection
    peer.on('connect', () => {
      console.log('🖥️ Screen Share: Connected to', participantId);
    });

    // Handle errors
    peer.on('error', (err) => {
      console.error('🖥️ Screen Share: Peer error for', participantId, err);
      setScreenShareError(`Connection error: ${err.message}`);
    });

    // Add screen stream if we're sharing
    if (isScreenSharingRef.current && screenShareStreamRef.current) {
      console.log('🖥️ Screen Share: Adding screen stream to peer');
      peer.addStream(screenShareStreamRef.current);
    }

    // Signal if provided
    if (signal) {
      peer.signal(signal);
    }

    screenSharePeersRef.current[participantId] = peer;
    setScreenSharePeer(peer);
  }, [socket, meetingId, userName]);

  // Handle screen share signal
  const handleScreenShareSignal = useCallback((data) => {
    const { signal, from } = data;
    
    if (screenSharePeersRef.current[from]) {
      console.log('🖥️ Screen Share: Signaling existing peer', from);
      screenSharePeersRef.current[from].signal(signal);
    } else {
      console.log('🖥️ Screen Share: Creating new peer for', from);
      createScreenSharePeer(from, signal);
    }
  }, [createScreenSharePeer]);

  // Handle screen share request
  const handleScreenShareRequest = useCallback((data) => {
    const { from } = data;
    
    console.log('🖥️ Screen Share: Received request from', from);
    console.log('🖥️ Screen Share: Current state:', {
      isScreenSharing: isScreenSharingRef.current,
      hasStream: !!screenShareStreamRef.current,
      from: from
    });
    
    // Always create a peer connection when someone requests screen share
    // This allows participants to receive the screen share
    console.log('🖥️ Screen Share: Creating peer connection for screen share from', from);
    createScreenSharePeer(from);
  }, [createScreenSharePeer]);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    try {
      console.log('🖥️ Screen Share: Starting screen capture...');
      setScreenShareError(null);

      // Get screen stream with specific constraints to avoid recursive capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        preferCurrentTab: false
      });

      // Hide only specific elements that cause recursive capture
      const meetingControls = document.querySelector('[data-testid="meeting-controls"]') || document.querySelector('.meeting-controls');
      
      // Hide meeting controls to prevent them from being captured
      if (meetingControls) {
        meetingControls.style.display = 'none';
      }
      
      // Hide the local video element to prevent recursive capture
      // This is the correct behavior - the person sharing should not see their own video
      const allVideoElements = document.querySelectorAll('video');
      allVideoElements.forEach(video => {
        // Only hide videos that don't have data-participant-id (i.e., local video)
        if (!video.getAttribute('data-participant-id')) {
          video.style.display = 'none';
        }
      });
      
      // Add a class to the body for targeted hiding
      document.body.classList.add('screen-sharing-active');

      console.log('🖥️ Screen Share: Screen stream obtained', stream);
      
      setScreenStream(stream);
      setScreenShareStream(stream);
      setIsScreenSharing(true);
      isScreenSharingRef.current = true;

      // Notify other participants (only if socket is available)
      if (socket && socket.emit && socket.id) {
        console.log('🖥️ Screen Share: Emitting screen-share-start event', {
          meetingId,
          participant: {
            id: socket.id,
            name: userName
          }
        });
        
        socket.emit('screen-share-start', {
          meetingId,
          participant: {
            id: socket.id,
            name: userName
          }
        });
        
        console.log('🖥️ Screen Share: Emitting screen-share-request event', {
          from: socket.id,
          meetingId: meetingId
        });
        
        // Request screen share from all other participants
        socket.emit('screen-share-request', {
          from: socket.id,
          meetingId: meetingId
        });
        
        console.log('🖥️ Screen Share: Screen share events emitted successfully');
      } else {
        console.warn('🖥️ Screen Share: Socket not available for notification');
      }

      // Handle stream end (user stops sharing)
      stream.getVideoTracks()[0].onended = () => {
        console.log('🖥️ Screen Share: Screen stream ended by user');
        stopScreenShare();
      };

    } catch (error) {
      console.error('🖥️ Screen Share: Error starting screen share', error);
      setScreenShareError(`Failed to start screen sharing: ${error.message}`);
    }
  }, [socket, meetingId, userName]);

  // Cleanup function to restore all UI elements
  const cleanupScreenShare = useCallback(() => {
    console.log('🖥️ Screen Share: Cleaning up and restoring UI');
    
    // Remove the screen sharing class from body
    document.body.classList.remove('screen-sharing-active');
    
    // Restore all elements that might have been hidden
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      if (element.style.display === 'none' && !element.id.includes('screen-share')) {
        element.style.display = '';
        element.style.visibility = '';
        element.style.opacity = '';
        element.style.pointerEvents = '';
      }
    });
    
    // Force refresh of the page if needed
    setTimeout(() => {
      const meetingRoom = document.querySelector('.meeting-room') || document.querySelector('[class*="meeting"]');
      if (meetingRoom && meetingRoom.style.display === 'none') {
        console.log('🖥️ Screen Share: Forcing meeting room restoration');
        meetingRoom.style.display = 'block';
        meetingRoom.style.visibility = 'visible';
        meetingRoom.style.opacity = '1';
      }
    }, 200);
  }, []);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
    console.log('🖥️ Screen Share: Stopping screen share');
    
    // Stop local stream
    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach(track => track.stop());
      screenShareStreamRef.current = null;
    }

    // Clean up peer connections
    Object.values(screenSharePeersRef.current).forEach(peer => {
      peer.destroy();
    });
    screenSharePeersRef.current = {};

    // Reset state
    setScreenStream(null);
    setRemoteScreenStream(null);
    setScreenSharePeer(null);
    setIsScreenSharing(false);
    isScreenSharingRef.current = false;
    setScreenShareParticipants([]);

    // Remove the screen sharing class from body FIRST
    document.body.classList.remove('screen-sharing-active');
    
    // Restore meeting controls
    const meetingControls = document.querySelector('[data-testid="meeting-controls"]') || document.querySelector('.meeting-controls');
    if (meetingControls) {
      meetingControls.style.display = 'flex';
      meetingControls.style.visibility = 'visible';
      meetingControls.style.opacity = '1';
      meetingControls.style.pointerEvents = 'auto';
    }
    
    // Restore local video elements (videos without data-participant-id)
    const allVideoElements = document.querySelectorAll('video');
    allVideoElements.forEach(video => {
      // Only restore videos that don't have data-participant-id (i.e., local video)
      if (!video.getAttribute('data-participant-id')) {
        video.style.display = 'block';
        video.style.visibility = 'visible';
        video.style.opacity = '1';
        video.style.pointerEvents = 'auto';
      }
    });
    
    // Hide the screen share container
    const screenShareContainer = document.getElementById('screen-share-container');
    if (screenShareContainer) {
      screenShareContainer.style.display = 'none';
      screenShareContainer.style.visibility = 'hidden';
      screenShareContainer.style.opacity = '0';
      screenShareContainer.style.pointerEvents = 'none';
    }

    // Notify other participants (only if socket is available)
    if (socket && socket.emit && socket.id) {
      socket.emit('screen-share-stop', {
        meetingId,
        participantId: socket.id
      });
    } else {
      console.warn('🖥️ Screen Share: Socket not available for stop notification');
    }

    console.log('🖥️ Screen Share: Screen share stopped');
    
    // Call cleanup to ensure everything is restored
    cleanupScreenShare();
  }, [socket, meetingId, cleanupScreenShare]);

  // Set screen share stream
  const setScreenShareStream = useCallback((stream) => {
    screenShareStreamRef.current = stream;
    
    // Add stream to existing peers
    Object.values(screenSharePeersRef.current).forEach(peer => {
      if (peer.addStream) {
        peer.addStream(stream);
      } else if (peer.replaceTrack) {
        // For newer versions of simple-peer
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        
        if (videoTrack) {
          peer.replaceTrack(videoTrack, peer._pc.getSenders().find(s => s.track && s.track.kind === 'video'));
        }
        if (audioTrack) {
          peer.replaceTrack(audioTrack, peer._pc.getSenders().find(s => s.track && s.track.kind === 'audio'));
        }
      }
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🖥️ Screen Share: Cleaning up on unmount');
      stopScreenShare();
    };
  }, [stopScreenShare]);

  // Handle case when socket is not available
  if (!socket) {
    console.warn('🖥️ Screen Share: Socket not available');
    return {
      isScreenSharing: false,
      screenStream: null,
      remoteScreenStream: null,
      screenShareParticipants: [],
      screenShareError: 'Socket not available',
      startScreenShare: () => console.warn('Socket not available'),
      stopScreenShare: () => console.warn('Socket not available'),
      setScreenShareError: () => {},
      cleanupScreenShare: () => console.warn('Socket not available')
    };
  }

  return {
    // State
    isScreenSharing,
    screenStream,
    remoteScreenStream,
    screenShareParticipants,
    screenShareError,
    
    // Actions
    startScreenShare,
    stopScreenShare,
    
    // Utils
    setScreenShareError,
    cleanupScreenShare
  };
};

export default useScreenShare;
