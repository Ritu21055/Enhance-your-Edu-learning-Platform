import { useState, useEffect, useRef, useCallback } from 'react';
import SimplePeer from 'simple-peer';

/**
 * Custom hook for screen sharing functionality
 * Handles screen capture, peer connections, and stream management
 */
const useScreenShare = (socket, meetingId, userName, isHost) => {
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
    if (!socket || !socket.on) return;

    console.log('🖥️ Screen Share: Setting up socket events');

    // Handle screen share start
    socket.on('screen-share-start', (data) => {
      console.log('🖥️ Screen Share: Received screen-share-start', data);
      
      // Check if data and participant exist before adding
      if (data && data.participant) {
        setScreenShareParticipants(prev => [...prev, data.participant]);
      } else {
        console.warn('🖥️ Screen Share: Invalid screen-share-start data', data);
      }
    });

    // Handle screen share stop
    socket.on('screen-share-stop', (data) => {
      console.log('🖥️ Screen Share: Received screen-share-stop', data);
      
      // Check if data and participantId exist before filtering
      if (data && data.participantId) {
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
      if (data) {
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
      }
    };
  }, [socket]);

  // Create screen share peer connection
  const createScreenSharePeer = useCallback((participantId, signal = null) => {
    console.log('🖥️ Screen Share: Creating peer for', participantId);
    
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
    createScreenSharePeer(from);
  }, [createScreenSharePeer]);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    try {
      console.log('🖥️ Screen Share: Starting screen capture...');
      setScreenShareError(null);

      // Get screen stream
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor'
        },
        audio: true
      });

      console.log('🖥️ Screen Share: Screen stream obtained', stream);
      
      setScreenStream(stream);
      setScreenShareStream(stream);
      setIsScreenSharing(true);
      isScreenSharingRef.current = true;

      // Notify other participants (only if socket is available)
      if (socket && socket.emit && socket.id) {
        socket.emit('screen-share-start', {
          meetingId,
          participant: {
            id: socket.id,
            name: userName
          }
        });
        
        // Request screen share from all other participants
        socket.emit('screen-share-request', {
          from: socket.id,
          meetingId: meetingId
        });
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
  }, [socket, meetingId]);

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

  // Early return if socket is not available (after all hooks are declared)
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
      setScreenShareError: () => {}
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
    setScreenShareError
  };
};

export default useScreenShare;
