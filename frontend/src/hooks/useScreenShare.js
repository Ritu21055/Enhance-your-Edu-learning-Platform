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
        
        // Clear remote screen stream when screen sharing stops
        console.log('🖥️ Screen Share: Clearing remote screen stream');
        setRemoteScreenStream(null);
        
        // Remove screen sharing class from body
        document.body.classList.remove('screen-sharing-active');
        
        // Restore meeting controls
        const meetingControls = document.querySelector('[data-testid="meeting-controls"]') || document.querySelector('.meeting-controls');
        if (meetingControls) {
          meetingControls.style.display = 'flex';
          meetingControls.style.visibility = 'visible';
          meetingControls.style.opacity = '1';
        }
      } else {
        console.warn('🖥️ Screen Share: Invalid screen-share-stop data', data);
        console.warn('🖥️ Screen Share: Expected data.participantId but got:', data?.participantId);
        
        // Even with invalid data, clear the remote stream as a fallback
        console.log('🖥️ Screen Share: Fallback - Clearing remote screen stream due to invalid data');
        setRemoteScreenStream(null);
        document.body.classList.remove('screen-sharing-active');
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
    console.log('🖥️🖥️🖥️🖥️ SCREEN SHARE START - DETAILED DEBUG');
    console.trace('🖥️ Stack trace at start');
    
    try {
      console.log('🖥️ Screen Share: Starting screen capture...');
      setScreenShareError(null);

      // CRITICAL: Get reference to local video track BEFORE screen share
      // We need to protect it from being affected
      let localVideoTrack = null;
      let localStream = null;
      let videoElement = null;
      let videoWasEnabled = false;
      let videoStateWasEnabled = false;
      
      try {
        // Try to get local stream from window or global ref
        if (window.localStreamRef || window.streamRef) {
          localStream = (window.localStreamRef?.current || window.streamRef?.current);
          if (localStream) {
            localVideoTrack = localStream.getVideoTracks()[0];
            console.log('🖥️ Screen Share: Found local video track, will protect it');
            
            // Get video element
            videoElement = document.querySelector('video.local-video') || 
                          document.querySelector('.local-video') ||
                          (window.localVideoRef?.current);
            
            // CRITICAL: Capture video state BEFORE any operations
            videoWasEnabled = localVideoTrack?.enabled ?? false;
            videoStateWasEnabled = window.isVideoEnabledRef?.current ?? 
                                  window.isVideoEnabled ?? 
                                  videoWasEnabled;
            
            console.log('🖥️🖥️ BEFORE STARTING SCREEN SHARE:', {
              videoTrackEnabled: videoWasEnabled,
              videoStateEnabled: videoStateWasEnabled,
              videoTrackId: localVideoTrack?.id,
              hasVideoElement: !!videoElement,
              videoElementOpacity: videoElement?.style.opacity,
              videoElementVisibility: videoElement?.style.visibility,
              hasLocalStream: !!localStream
            });
          }
        }
      } catch (err) {
        console.warn('🖥️ Screen Share: Could not get local video track reference:', err);
      }

      // Get screen stream with specific constraints to avoid recursive capture
      console.log('🖥️🖥️ Calling getDisplayMedia...');
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
      
      console.log('🖥️🖥️ getDisplayMedia SUCCESS:', {
        streamId: stream.id,
        tracks: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length
      });

      // CRITICAL: Check video IMMEDIATELY after getDisplayMedia
      console.log('🖥️🖥️ IMMEDIATELY AFTER getDisplayMedia:', {
        videoTrackEnabled: localVideoTrack?.enabled,
        videoStateEnabled: window.isVideoEnabledRef?.current ?? window.isVideoEnabled,
        videoWasEnabled: videoWasEnabled,
        videoStateWasEnabled: videoStateWasEnabled
      });

      // CRITICAL: Verify local video track is still enabled after getDisplayMedia
      if (localVideoTrack && videoWasEnabled) {
        if (!localVideoTrack.enabled) {
          console.error('🖥️🖥️ ❌❌❌ VIDEO TRACK WAS DISABLED DURING SCREEN SHARE START! Re-enabling...');
          console.trace('🖥️🖥️ Where did video track get disabled?');
          localVideoTrack.enabled = true;
        }
        
        // CRITICAL: Force enable video track if it should be enabled
        // This prevents video from being disabled by getDisplayMedia
        if (videoWasEnabled) {
          localVideoTrack.enabled = true;
          console.log('🖥️🖥️ ✅ Forcing video track to stay enabled');
        }
      }
      
      // CRITICAL: Check video state (from useMediaControls)
      if (videoStateWasEnabled && window.isVideoEnabledRef) {
        if (!window.isVideoEnabledRef.current) {
          console.error('🖥️🖥️ ❌❌❌ VIDEO STATE WAS CHANGED TO FALSE DURING SCREEN SHARE START! Restoring...');
          console.trace('🖥️🖥️ Where did video state get changed?');
          if (window.setIsVideoEnabled) {
            window.setIsVideoEnabled(true);
          }
        }
      }

      // Hide only specific elements that cause recursive capture
      const meetingControls = document.querySelector('[data-testid="meeting-controls"]') || document.querySelector('.meeting-controls');
      
      // Hide meeting controls to prevent them from being captured
      if (meetingControls) {
        meetingControls.style.display = 'none';
      }
      
      // CRITICAL: Only hide video if screen sharing is actually starting
      // Mark that we're about to start screen sharing
      isScreenSharingRef.current = true;
      
      // Hide the local video element VISUALLY to prevent recursive capture
      // CRITICAL: Only hide visually, DO NOT affect the track
      // Only hide if video should be enabled (we'll restore it when screen share stops)
      const allVideoElements = document.querySelectorAll('video');
      allVideoElements.forEach(video => {
        // Only hide videos that don't have data-participant-id (i.e., local video)
        // AND only if video is currently enabled
        if (!video.getAttribute('data-participant-id')) {
          const shouldHide = videoWasEnabled && videoStateWasEnabled;
          if (shouldHide) {
            // Use opacity and visibility instead of display to preserve track
            video.style.opacity = '0';
            video.style.visibility = 'hidden';
            // Keep display: block to maintain layout and track connection
            video.style.display = 'block';
            // Store original state to restore later
            video.setAttribute('data-was-visible', 'true');
          }
        }
      });
      
      // Add a class to the body for targeted hiding
      document.body.classList.add('screen-sharing-active');

      // CRITICAL: Final verification after UI changes
      if (localVideoTrack && videoWasEnabled) {
        console.log('🖥️🖥️ AFTER UI CHANGES (hiding video element):', {
          videoTrackEnabled: localVideoTrack.enabled,
          videoStateEnabled: window.isVideoEnabledRef?.current ?? window.isVideoEnabled,
          videoWasEnabled: videoWasEnabled,
          videoElementOpacity: videoElement?.style.opacity,
          videoElementVisibility: videoElement?.style.visibility
        });
        
        // Immediate check
        if (!localVideoTrack.enabled) {
          console.error('🖥️🖥️ ❌ Immediate check - local video track disabled, re-enabling');
          console.trace('🖥️🖥️ Stack trace at immediate check');
          localVideoTrack.enabled = true;
        }
        
        // Check video state
        if (window.isVideoEnabledRef && !window.isVideoEnabledRef.current && videoStateWasEnabled) {
          console.error('🖥️🖥️ ❌ Immediate check - video state changed, restoring');
          console.trace('🖥️🖥️ Stack trace at immediate check');
          if (window.setIsVideoEnabled) {
            window.setIsVideoEnabled(true);
          }
        }
        
        // Delayed checks to ensure video stays enabled
        setTimeout(() => {
          console.log('🖥️🖥️ 100ms check after start:', {
            videoTrackEnabled: localVideoTrack?.enabled,
            videoStateEnabled: window.isVideoEnabledRef?.current ?? window.isVideoEnabled,
            videoWasEnabled: videoWasEnabled
          });
          
          if (localVideoTrack && videoWasEnabled) {
            if (!localVideoTrack.enabled) {
              console.error('🖥️🖥️ ❌ 100ms: Video track disabled, re-enabling');
              console.trace('🖥️🖥️ Stack trace at 100ms');
              localVideoTrack.enabled = true;
            }
            if (window.isVideoEnabledRef && !window.isVideoEnabledRef.current && videoStateWasEnabled) {
              console.error('🖥️🖥️ ❌ 100ms: Video state changed, restoring');
              console.trace('🖥️🖥️ Stack trace at 100ms');
              if (window.setIsVideoEnabled) {
                window.setIsVideoEnabled(true);
              }
            }
          }
        }, 100);
        
        setTimeout(() => {
          if (localVideoTrack && videoWasEnabled) {
            if (!localVideoTrack.enabled) {
              console.error('🖥️🖥️ ❌ 500ms: Video track disabled, re-enabling');
              localVideoTrack.enabled = true;
            }
            if (window.isVideoEnabledRef && !window.isVideoEnabledRef.current && videoStateWasEnabled) {
              console.error('🖥️🖥️ ❌ 500ms: Video state changed, restoring');
              if (window.setIsVideoEnabled) {
                window.setIsVideoEnabled(true);
              }
            }
          }
        }, 500);
        
        setTimeout(() => {
          if (localVideoTrack && videoWasEnabled) {
            if (!localVideoTrack.enabled) {
              console.error('🖥️🖥️ ❌ 1000ms: Video track disabled, re-enabling');
              localVideoTrack.enabled = true;
            }
            if (window.isVideoEnabledRef && !window.isVideoEnabledRef.current && videoStateWasEnabled) {
              console.error('🖥️🖥️ ❌ 1000ms: Video state changed, restoring');
              if (window.setIsVideoEnabled) {
                window.setIsVideoEnabled(true);
              }
            }
          }
        }, 1000);
      }

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
        console.log('🖥️🖥️🖥️ SCREEN SHARE ENDED (onended event)');
        console.trace('🖥️🖥️ Stack trace at onended');
        
        // CRITICAL: Re-fetch video state when screen share ends (closure might have stale values)
        let videoTrackAtEnd = null;
        let localStreamAtEnd = null;
        let videoElementAtEnd = null;
        let videoWasEnabledAtEnd = false;
        let videoStateWasEnabledAtEnd = false;
        
        try {
          if (window.localStreamRef || window.streamRef) {
            localStreamAtEnd = (window.localStreamRef?.current || window.streamRef?.current);
            if (localStreamAtEnd) {
              videoTrackAtEnd = localStreamAtEnd.getVideoTracks()[0];
              videoWasEnabledAtEnd = videoTrackAtEnd?.enabled ?? false;
              videoStateWasEnabledAtEnd = window.isVideoEnabledRef?.current ?? 
                                         window.isVideoEnabled ?? 
                                         videoWasEnabledAtEnd;
              
              // Get video element
              videoElementAtEnd = document.querySelector('video.local-video') || 
                                 document.querySelector('.local-video') ||
                                 (window.localVideoRef?.current);
            }
          }
        } catch (err) {
          console.warn('🖥️ Screen Share: Could not get video state in onended:', err);
        }
        
        const videoStateAtEnd = window.isVideoEnabledRef?.current ?? window.isVideoEnabled ?? videoWasEnabledAtEnd;
        const videoTrackEnabledAtEnd = videoTrackAtEnd?.enabled ?? false;
        
        console.log('🖥️🖥️ WHEN SCREEN SHARE ENDED:', {
          videoState: videoStateAtEnd,
          videoTrackEnabled: videoTrackEnabledAtEnd,
          videoWasEnabled: videoWasEnabledAtEnd,
          videoStateWasEnabled: videoStateWasEnabledAtEnd,
          videoTrackId: videoTrackAtEnd?.id
        });
        
        // CRITICAL: Verify video track is still enabled when screen share ends
        if (videoTrackAtEnd && videoWasEnabledAtEnd && !videoTrackAtEnd.enabled) {
          console.error('🖥️🖥️ ❌❌❌ VIDEO TRACK WAS DISABLED WHEN SCREEN SHARE ENDED! Re-enabling...');
          console.trace('🖥️🖥️ Where did video track get disabled?');
          videoTrackAtEnd.enabled = true;
        }
        
        // Force state to stay enabled
        if (videoTrackAtEnd && videoStateWasEnabledAtEnd && window.isVideoEnabledRef && !window.isVideoEnabledRef.current) {
          console.error('🖥️🖥️ ❌❌❌ VIDEO STATE WAS CHANGED TO FALSE WHEN SCREEN SHARE ENDED! Restoring...');
          console.trace('🖥️🖥️ Where did video state get changed?');
          if (window.setIsVideoEnabled) {
            window.setIsVideoEnabled(true);
          }
        }
        
        // CRITICAL: Force video element visibility and srcObject immediately
        if (videoElementAtEnd && localStreamAtEnd && videoWasEnabledAtEnd) {
          // Force visibility
          videoElementAtEnd.style.opacity = '1';
          videoElementAtEnd.style.visibility = 'visible';
          videoElementAtEnd.style.display = 'block';
          
          // Ensure srcObject
          if (videoElementAtEnd.srcObject !== localStreamAtEnd) {
            console.warn('🖥️🖥️ srcObject lost when screen share ended, restoring');
            videoElementAtEnd.srcObject = localStreamAtEnd;
          }
          
          // Force play
          if (videoElementAtEnd.paused && videoElementAtEnd.srcObject) {
            videoElementAtEnd.play().catch(err => {
              console.error('🖥️🖥️ Error playing video when screen share ended:', err);
            });
          }
        }
        
        stopScreenShare();
        
        // CRITICAL: Immediate check using requestAnimationFrame
        requestAnimationFrame(() => {
          // Re-fetch fresh references
          const freshStream = (window.localStreamRef?.current || window.streamRef?.current);
          const freshVideoTrack = freshStream?.getVideoTracks()[0];
          const freshVideoElement = document.querySelector('video.local-video') || 
                                   document.querySelector('.local-video') ||
                                   (window.localVideoRef?.current);
          
          if (freshVideoElement && freshStream && videoWasEnabledAtEnd) {
            // Force visibility
            freshVideoElement.style.opacity = '1';
            freshVideoElement.style.visibility = 'visible';
            freshVideoElement.style.display = 'block';
            
            // Ensure srcObject
            if (freshVideoElement.srcObject !== freshStream) {
              console.warn('🖥️🖥️ ❌ RAF after onended: Video element lost srcObject, restoring');
              freshVideoElement.srcObject = freshStream;
            }
            
            // Force play
            if (freshVideoElement.paused && freshVideoElement.srcObject) {
              freshVideoElement.play().catch(err => {
                console.error('🖥️🖥️ ❌ RAF after onended: Error playing video:', err);
              });
            }
          }
        });
        
        // Multiple checks after onended - CRITICAL: Re-fetch fresh references in each check
        const checkDelays = [100, 200, 500, 1000, 2000];
        checkDelays.forEach(delay => {
          setTimeout(() => {
            // Re-fetch fresh references
            const freshStream = (window.localStreamRef?.current || window.streamRef?.current);
            const freshVideoTrack = freshStream?.getVideoTracks()[0];
            const freshVideoElement = document.querySelector('video.local-video') || 
                                     document.querySelector('.local-video') ||
                                     (window.localVideoRef?.current);
            const freshVideoState = window.isVideoEnabledRef?.current ?? window.isVideoEnabled;
            
            console.log(`🖥️🖥️ ${delay}ms check after onended:`, {
              videoTrackEnabled: freshVideoTrack?.enabled,
              videoStateEnabled: freshVideoState,
              videoWasEnabled: videoWasEnabledAtEnd,
              hasVideoElement: !!freshVideoElement,
              hasStream: !!freshStream,
              hasSrcObject: !!freshVideoElement?.srcObject
            });
            
            if (freshVideoTrack && videoWasEnabledAtEnd) {
              if (!freshVideoTrack.enabled) {
                console.error(`🖥️🖥️ ❌ ${delay}ms after onended: Video track disabled, re-enabling`);
                freshVideoTrack.enabled = true;
              }
              if (window.isVideoEnabledRef && !window.isVideoEnabledRef.current && videoStateWasEnabledAtEnd) {
                console.error(`🖥️🖥️ ❌ ${delay}ms after onended: Video state changed, restoring`);
                if (window.setIsVideoEnabled) {
                  window.setIsVideoEnabled(true);
                }
              }
              
              // CRITICAL: Force video element visibility and srcObject
              if (freshVideoElement && freshStream) {
                // Force visibility
                freshVideoElement.style.opacity = '1';
                freshVideoElement.style.visibility = 'visible';
                freshVideoElement.style.display = 'block';
                
                // Ensure srcObject
                if (freshVideoElement.srcObject !== freshStream) {
                  console.warn(`🖥️🖥️ ❌ ${delay}ms after onended: Video element lost srcObject, restoring`);
                  freshVideoElement.srcObject = freshStream;
                }
                
                // Force play
                if (freshVideoElement.paused && freshVideoElement.srcObject) {
                  freshVideoElement.play().catch(err => {
                    console.error(`🖥️🖥️ ❌ ${delay}ms after onended: Error playing video:`, err);
                  });
                }
              }
            }
          }, delay);
        });
      };

    } catch (error) {
      // CRITICAL: Reset screen sharing ref if error occurs
      isScreenSharingRef.current = false;
      setIsScreenSharing(false);
      
      // CRITICAL: Re-fetch video state even if screen share fails (variables might not be in scope)
      let videoTrack = null;
      let localStreamError = null;
      let videoElementError = null;
      let videoWasEnabledError = false;
      let videoStateWasEnabledError = false;
      
      try {
        if (window.localStreamRef || window.streamRef) {
          localStreamError = (window.localStreamRef?.current || window.streamRef?.current);
          if (localStreamError) {
            videoTrack = localStreamError.getVideoTracks()[0];
            videoWasEnabledError = videoTrack?.enabled ?? false;
            videoStateWasEnabledError = window.isVideoEnabledRef?.current ?? 
                                       window.isVideoEnabled ?? 
                                       videoWasEnabledError;
            
            // Get video element
            videoElementError = document.querySelector('video.local-video') || 
                               document.querySelector('.local-video') ||
                               (window.localVideoRef?.current);
          }
        }
      } catch (err) {
        console.warn('🖥️ Screen Share: Could not get video state in error handler:', err);
      }
      
      console.log('🖥️🖥️ AFTER SCREEN SHARE ERROR:', {
        videoState: window.isVideoEnabledRef?.current ?? window.isVideoEnabled,
        videoTrackEnabled: videoTrack?.enabled,
        videoWasEnabled: videoWasEnabledError,
        videoStateWasEnabled: videoStateWasEnabledError
      });
      
      if (videoTrack && videoWasEnabledError) {
        if (!videoTrack.enabled) {
          console.error('🖥️🖥️ ❌ Video track disabled after error, re-enabling');
          videoTrack.enabled = true;
        }
        if (window.isVideoEnabledRef && !window.isVideoEnabledRef.current && videoStateWasEnabledError) {
          console.error('🖥️🖥️ ❌ Video state changed after error, restoring');
          if (window.setIsVideoEnabled) {
            window.setIsVideoEnabled(true);
          }
        }
        
        // CRITICAL: Force video element visibility and srcObject
        if (videoElementError && localStreamError) {
          // Force visibility
          videoElementError.style.opacity = '1';
          videoElementError.style.visibility = 'visible';
          videoElementError.style.display = 'block';
          
          // Ensure srcObject
          if (videoElementError.srcObject !== localStreamError) {
            console.warn('🖥️🖥️ srcObject lost after error, restoring');
            videoElementError.srcObject = localStreamError;
          }
          
          // Force play
          if (videoElementError.paused && videoElementError.srcObject) {
            videoElementError.play().catch(err => {
              console.error('🖥️🖥️ Error playing video after error:', err);
            });
          }
        }
      }
      
      setScreenShareError(`Failed to start screen sharing: ${error.message}`);
      
      console.log('🖥️🖥️🖥️🖥️ SCREEN SHARE START END (with error)');
    }
    
    console.log('🖥️🖥️🖥️🖥️ SCREEN SHARE START END (success)');
  }, [socket, meetingId, userName]);

  // Cleanup function to restore all UI elements
  const cleanupScreenShare = useCallback(() => {
    // Remove the screen sharing class from body
    document.body.classList.remove('screen-sharing-active');
    
    // CRITICAL: Restore all video elements that were hidden during screen share
    const allVideoElements = document.querySelectorAll('video');
    allVideoElements.forEach(video => {
      // Only restore videos that don't have data-participant-id (local videos)
      if (!video.getAttribute('data-participant-id')) {
        // Check if video should be visible (video is enabled)
        const shouldBeVisible = window.isVideoEnabledRef?.current ?? window.isVideoEnabled ?? true;
        if (shouldBeVisible) {
          // Restore visibility
          video.style.opacity = '1';
          video.style.visibility = 'visible';
          video.style.display = 'block';
          
          // Ensure srcObject is set
          const stream = window.localStreamRef?.current || window.streamRef?.current;
          if (stream && video.srcObject !== stream) {
            video.srcObject = stream;
          }
          
          // Force play if paused
          if (video.paused && video.srcObject) {
            video.play().catch(() => {});
          }
        }
      }
    });
    
    // Restore other elements that might have been hidden
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      if (element.style.display === 'none' && !element.id.includes('screen-share')) {
        element.style.display = '';
        element.style.visibility = '';
        element.style.opacity = '';
        element.style.pointerEvents = '';
      }
    });
  }, []);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
    console.log('🖥️🖥️🖥️ STOP SCREEN SHARE - DETAILED DEBUG');
    console.trace('🖥️ Stack trace at stop');
    
    // CRITICAL: Capture video state BEFORE stopping
    let localVideoTrack = null;
    let localStream = null;
    let videoElement = null;
    let videoWasEnabled = false;
    let videoStateWasEnabled = false;
    
    try {
      if (window.localStreamRef || window.streamRef) {
        localStream = (window.localStreamRef?.current || window.streamRef?.current);
        if (localStream) {
          localVideoTrack = localStream.getVideoTracks()[0];
          videoWasEnabled = localVideoTrack?.enabled ?? false;
          videoStateWasEnabled = window.isVideoEnabledRef?.current ?? 
                                window.isVideoEnabled ?? 
                                videoWasEnabled;
          
          // Get video element
          videoElement = document.querySelector('video.local-video') || 
                        document.querySelector('.local-video') ||
                        (window.localVideoRef?.current);
        }
      }
    } catch (err) {
      console.warn('🖥️ Screen Share: Could not get local video track for restoration:', err);
    }
    
    console.log('🖥️🖥️ BEFORE STOPPING SCREEN SHARE:', {
      videoState: videoStateWasEnabled,
      videoTrackEnabled: videoWasEnabled,
      videoTrackId: localVideoTrack?.id,
      hasVideoElement: !!videoElement
    });
    
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
    // CRITICAL: Also verify video track is enabled
    const allVideoElements = document.querySelectorAll('video');
    allVideoElements.forEach(video => {
      // Only restore videos that don't have data-participant-id (i.e., local video)
      if (!video.getAttribute('data-participant-id')) {
        // Check if video was visible before screen share
        const wasVisible = video.getAttribute('data-was-visible') === 'true';
        const shouldBeVisible = wasVisible || (window.isVideoEnabledRef?.current ?? window.isVideoEnabled ?? true);
        
        if (shouldBeVisible) {
          video.style.display = 'block';
          video.style.visibility = 'visible';
          video.style.opacity = '1';
          video.style.pointerEvents = 'auto';
          
          // Remove the marker attribute
          video.removeAttribute('data-was-visible');
          
          // Ensure srcObject is set
          const stream = window.localStreamRef?.current || window.streamRef?.current;
          if (stream && video.srcObject !== stream) {
            video.srcObject = stream;
          }
          
          // Force play if paused
          if (video.paused && video.srcObject) {
            video.play().catch(() => {});
          }
        }
      }
    });
    
    // CRITICAL: Verify video track is still enabled after stopping
    console.log('🖥️🖥️ AFTER STOPPING SCREEN SHARE:', {
      videoState: window.isVideoEnabledRef?.current ?? window.isVideoEnabled,
      videoTrackEnabled: localVideoTrack?.enabled,
      videoWasEnabled: videoWasEnabled,
      videoStateWasEnabled: videoStateWasEnabled
    });
    
    if (localVideoTrack && videoWasEnabled) {
      // Force track enabled immediately
      if (!localVideoTrack.enabled) {
        console.error('🖥️🖥️ ❌❌❌ VIDEO TRACK WAS DISABLED AFTER STOPPING SCREEN SHARE! Re-enabling...');
        console.trace('🖥️🖥️ Where did video track get disabled?');
        localVideoTrack.enabled = true;
      }
      
      // Force state to stay enabled
      if (window.isVideoEnabledRef && !window.isVideoEnabledRef.current && videoStateWasEnabled) {
        console.error('🖥️🖥️ ❌❌❌ VIDEO STATE WAS CHANGED TO FALSE AFTER STOPPING SCREEN SHARE! Restoring...');
        console.trace('🖥️🖥️ Where did video state get changed?');
        if (window.setIsVideoEnabled) {
          window.setIsVideoEnabled(true);
        }
      }
      
      // CRITICAL: Force video element visibility and srcObject immediately
      if (videoElement && localStream) {
        // Force visibility
        videoElement.style.opacity = '1';
        videoElement.style.visibility = 'visible';
        videoElement.style.display = 'block';
        
        // Ensure srcObject is set
        if (videoElement.srcObject !== localStream) {
          console.warn('🖥️🖥️ srcObject lost after stopping screen share, restoring');
          videoElement.srcObject = localStream;
        }
        
        // Force play
        if (videoElement.paused && videoElement.srcObject) {
          videoElement.play().catch(err => {
            console.error('🖥️🖥️ Error playing video after screen share stop:', err);
          });
        }
      }
    }
    
    // CRITICAL: Immediate check using requestAnimationFrame
    requestAnimationFrame(() => {
      // Re-fetch fresh references
      const freshStream = (window.localStreamRef?.current || window.streamRef?.current);
      const freshVideoTrack = freshStream?.getVideoTracks()[0];
      const freshVideoElement = document.querySelector('video.local-video') || 
                               document.querySelector('.local-video') ||
                               (window.localVideoRef?.current);
      
      if (freshVideoElement && freshStream && videoWasEnabled) {
        // Force visibility
        freshVideoElement.style.opacity = '1';
        freshVideoElement.style.visibility = 'visible';
        freshVideoElement.style.display = 'block';
        
        // Ensure srcObject
        if (freshVideoElement.srcObject !== freshStream) {
          console.warn('🖥️🖥️ ❌ RAF: Video element lost srcObject after screen share stop, restoring');
          freshVideoElement.srcObject = freshStream;
        }
        
        // Force play
        if (freshVideoElement.paused && freshVideoElement.srcObject) {
          freshVideoElement.play().catch(err => {
            console.error('🖥️🖥️ ❌ RAF: Error playing video after screen share stop:', err);
          });
        }
      }
    });
    
    // Multiple checks after stop - CRITICAL: Re-fetch fresh references in each check
    const checkDelays = [100, 200, 500, 1000, 2000];
    checkDelays.forEach(delay => {
      setTimeout(() => {
        // Re-fetch fresh references
        const freshStream = (window.localStreamRef?.current || window.streamRef?.current);
        const freshVideoTrack = freshStream?.getVideoTracks()[0];
        const freshVideoElement = document.querySelector('video.local-video') || 
                                 document.querySelector('.local-video') ||
                                 (window.localVideoRef?.current);
        const freshVideoState = window.isVideoEnabledRef?.current ?? window.isVideoEnabled;
        
        console.log(`🖥️🖥️ ${delay}ms check after stop:`, {
          videoTrackEnabled: freshVideoTrack?.enabled,
          videoStateEnabled: freshVideoState,
          videoWasEnabled: videoWasEnabled,
          hasVideoElement: !!freshVideoElement,
          hasStream: !!freshStream,
          hasSrcObject: !!freshVideoElement?.srcObject
        });
        
        if (freshVideoTrack && videoWasEnabled) {
          if (!freshVideoTrack.enabled) {
            console.error(`🖥️🖥️ ❌ ${delay}ms: Video track disabled, re-enabling`);
            freshVideoTrack.enabled = true;
          }
          if (window.isVideoEnabledRef && !window.isVideoEnabledRef.current && videoStateWasEnabled) {
            console.error(`🖥️🖥️ ❌ ${delay}ms: Video state changed, restoring`);
            if (window.setIsVideoEnabled) {
              window.setIsVideoEnabled(true);
            }
          }
          
          // CRITICAL: Force video element visibility and srcObject
          if (freshVideoElement && freshStream) {
            // Force visibility
            freshVideoElement.style.opacity = '1';
            freshVideoElement.style.visibility = 'visible';
            freshVideoElement.style.display = 'block';
            
            // Ensure srcObject
            if (freshVideoElement.srcObject !== freshStream) {
              console.warn(`🖥️🖥️ ❌ ${delay}ms: Video element lost srcObject, restoring`);
              freshVideoElement.srcObject = freshStream;
            }
            
            // Force play
            if (freshVideoElement.paused && freshVideoElement.srcObject) {
              freshVideoElement.play().catch(err => {
                console.error(`🖥️🖥️ ❌ ${delay}ms: Error playing video:`, err);
              });
            }
          }
        }
      }, delay);
    });
    

    // CRITICAL: Verify video track is enabled when screen share stops
    if (localVideoTrack) {
      setTimeout(() => {
        // Check if video should be enabled (don't force, just verify)
        console.log('🖥️ Screen Share: Video track state after stopping:', localVideoTrack.enabled);
      }, 100);
    }
    
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

  // CRITICAL: Ensure video is visible when screen sharing is NOT active
  useEffect(() => {
    // Run immediately on mount and whenever screen sharing state changes
    const ensureVideoVisible = () => {
      if (!isScreenSharing && !isScreenSharingRef.current) {
        // Screen sharing is not active - ensure video is visible
        const allVideoElements = document.querySelectorAll('video');
        allVideoElements.forEach(video => {
          // Only restore videos that don't have data-participant-id (local videos)
          if (!video.getAttribute('data-participant-id')) {
            const shouldBeVisible = window.isVideoEnabledRef?.current ?? window.isVideoEnabled ?? true;
            if (shouldBeVisible) {
              // Ensure video is visible
              video.style.opacity = '1';
              video.style.visibility = 'visible';
              video.style.display = 'block';
              
              // Ensure srcObject is set
              const stream = window.localStreamRef?.current || window.streamRef?.current;
              if (stream && video.srcObject !== stream) {
                video.srcObject = stream;
              }
              
              // Force play if paused
              if (video.paused && video.srcObject) {
                video.play().catch(() => {});
              }
            }
          }
        });
      }
    };
    
    // Run immediately
    ensureVideoVisible();
    
    // Also run after a short delay to catch any delayed hiding
    const timeout = setTimeout(ensureVideoVisible, 100);
    
    return () => clearTimeout(timeout);
  }, [isScreenSharing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
