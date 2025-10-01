import { useState, useRef, useEffect } from 'react';

export const useMediaControls = (localStream, onScreenShareChange, socket, meetingId, participantId) => {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const screenVideoRef = useRef();

  // Function to emit media state changes to other participants
  const emitMediaStateChange = (audioEnabled, videoEnabled) => {
    if (socket && meetingId && participantId) {
      console.log('📡 Emitting media state change:', { 
        audioEnabled, 
        videoEnabled, 
        meetingId, 
        participantId,
        socketConnected: socket.connected 
      });
      socket.emit('media-state-change', {
        meetingId,
        participantId,
        audioEnabled,
        videoEnabled,
        timestamp: Date.now()
      });
    } else {
      console.log('❌ Cannot emit media state change:', {
        hasSocket: !!socket,
        hasMeetingId: !!meetingId,
        hasParticipantId: !!participantId
      });
    }
  };

  // Sync state with actual stream state
  useEffect(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      const videoTrack = localStream.getVideoTracks()[0];
      
      if (audioTrack) {
        setIsAudioEnabled(audioTrack.enabled);
        
        // Enhanced audio track configuration for better quality
        if (audioTrack.readyState === 'live') {
          // Apply optimized audio constraints for smooth audio
          const isMobileHotspot = window.location.hostname.includes('192.168.43') || 
                                 window.location.hostname.includes('10.');
          
          const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
            // Simplified constraints to avoid OverconstrainedError
          };
          
          try {
            audioTrack.applyConstraints(audioConstraints).then(() => {
              console.log('🎤 Enhanced audio constraints applied during sync');
              
              // Force audio track to be enabled and unmuted
              if (!audioTrack.enabled) {
                audioTrack.enabled = true;
                console.log('🎤 Audio track enabled during sync');
              }
              
              // Ensure audio track is not muted (if possible)
              if (audioTrack.muted !== undefined && audioTrack.muted) {
                console.log('🎤 Audio track was muted, attempting to unmute');
                // Note: muted property is read-only in newer browsers
                // The track should be unmuted by default when enabled
              }
            }).catch(error => {
              console.log('🎤 Could not apply enhanced audio constraints during sync:', error);
              
              // Fallback to basic constraints
              const basicConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              };
              
              audioTrack.applyConstraints(basicConstraints).then(() => {
                console.log('🎤 Basic audio constraints applied as fallback');
              }).catch(fallbackError => {
                console.log('🎤 Could not apply basic audio constraints:', fallbackError);
              });
            });
          } catch (error) {
            console.log('🎤 Error applying audio constraints during sync:', error);
          }
        }
      }
      if (videoTrack) {
        setIsVideoEnabled(videoTrack.enabled);
      }
      
      console.log('🎥 Media controls synced with stream:', {
        audioEnabled: audioTrack?.enabled,
        videoEnabled: videoTrack?.enabled,
        audioReadyState: audioTrack?.readyState,
        audioMuted: audioTrack?.muted,
        audioConstraints: audioTrack?.getConstraints?.()
      });
    }
  }, [localStream]);

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const newState = !audioTrack.enabled;
        audioTrack.enabled = newState;
        setIsAudioEnabled(newState);
        
        console.log('🎤 Audio toggled:', newState ? 'enabled' : 'disabled');
        console.log('🎤 Audio track state:', {
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          constraints: audioTrack.getConstraints?.()
        });
        
        // Additional debugging for WebNexus
        console.log('🎤 WebNexus Audio Control Debug:', {
          newState,
          isAudioEnabled: newState,
          buttonShouldShow: newState ? 'Mic (enabled)' : 'MicOff (disabled)',
          audioTrackEnabled: audioTrack.enabled,
          streamActive: localStream.active
        });

        // Emit media state change to other participants
        console.log('🎤 About to emit media state change:', { audioEnabled: newState, videoEnabled: isVideoEnabled });
        emitMediaStateChange(newState, isVideoEnabled);
        
        // Apply enhanced audio constraints when enabling to ensure smooth audio
        if (newState) {
          const isMobileHotspot = window.location.hostname.includes('192.168.43') || 
                                 window.location.hostname.includes('10.');
          
          const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
            // Simplified constraints to avoid OverconstrainedError
          };
          
          try {
            audioTrack.applyConstraints(audioConstraints).then(() => {
              console.log('🎤 Enhanced audio constraints applied after enabling');
              
              // Force audio track to be enabled and unmuted
              if (!audioTrack.enabled) {
                audioTrack.enabled = true;
                console.log('🎤 Audio track re-enabled after constraints');
              }
              
              // Test audio by creating a temporary audio context
              try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(localStream);
                const analyser = audioContext.createAnalyser();
                source.connect(analyser);
                
                // Check if audio is actually flowing
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);
                
                const hasAudio = dataArray.some(value => value > 0);
                console.log('🎤 Audio flow test:', hasAudio ? 'Audio detected' : 'No audio detected');
                
                // Clean up
                source.disconnect();
                audioContext.close();
              } catch (audioTestError) {
                console.log('🎤 Audio test failed:', audioTestError);
              }
            }).catch(error => {
              console.log('🎤 Could not apply enhanced audio constraints:', error);
              
              // Fallback to basic constraints
              const basicConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              };
              
              audioTrack.applyConstraints(basicConstraints).then(() => {
                console.log('🎤 Basic audio constraints applied as fallback');
              }).catch(fallbackError => {
                console.log('🎤 Could not apply basic audio constraints:', fallbackError);
              });
            });
          } catch (error) {
            console.log('🎤 Error applying audio constraints:', error);
          }
        }
      }
    } else {
      console.log('🎤 No local stream available for audio toggle');
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        const newState = !videoTrack.enabled;
        videoTrack.enabled = newState;
        setIsVideoEnabled(newState);
        console.log('📹 Video toggled:', newState ? 'enabled' : 'disabled');

        // Emit media state change to other participants
        console.log('📹 About to emit media state change:', { audioEnabled: isAudioEnabled, videoEnabled: newState });
        emitMediaStateChange(isAudioEnabled, newState);
      }
    } else {
      console.log('📹 No local stream available for video toggle');
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        setScreenStream(null);
      }
      setIsScreenSharing(false);
      console.log('🖥️ Screen sharing stopped');
      
      // Notify parent component that screen sharing stopped
      if (onScreenShareChange) {
        onScreenShareChange(null, false);
      }
      
      // Emit screen share change event to other participants
      if (socket && meetingId && participantId) {
        console.log('🖥️ Emitting screen share stop event');
        socket.emit('screen-share-change', {
          meetingId,
          participantId,
          isSharing: false,
          streamId: null
        });
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            mediaSource: 'screen',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: true // Include system audio if available
        });
        
        setScreenStream(stream);
        setIsScreenSharing(true);
        
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }
        
        console.log('🖥️ Screen sharing started with stream:', {
          id: stream.id,
          tracks: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioTracks: stream.getAudioTracks().length
        });
        
        // Notify parent component that screen sharing started
        if (onScreenShareChange) {
          onScreenShareChange(stream, true);
        }
        
        // Emit screen share change event to other participants
        if (socket && meetingId && participantId) {
          console.log('🖥️ Emitting screen share start event');
          socket.emit('screen-share-change', {
            meetingId,
            participantId,
            isSharing: true,
            streamId: stream.id
          });
        }
        
        // Handle screen sharing end (when user stops sharing via browser UI)
        stream.getVideoTracks()[0].onended = () => {
          console.log('🖥️ Screen sharing ended by user via browser UI');
          setScreenStream(null);
          setIsScreenSharing(false);
          if (onScreenShareChange) {
            onScreenShareChange(null, false);
          }
          
          // Emit screen share change event to other participants
          if (socket && meetingId && participantId) {
            console.log('🖥️ Emitting screen share stop event (browser UI)');
            socket.emit('screen-share-change', {
              meetingId,
              participantId,
              isSharing: false,
              streamId: null
            });
          }
        };
        
      } catch (error) {
        console.error('❌ Failed to start screen sharing:', error);
        setIsScreenSharing(false);
        if (onScreenShareChange) {
          onScreenShareChange(null, false);
        }
      }
    }
  };

  // Emit initial media state when component mounts
  useEffect(() => {
    if (socket && meetingId && participantId && localStream) {
      // Small delay to ensure socket is ready
      const timer = setTimeout(() => {
        emitMediaStateChange(isAudioEnabled, isVideoEnabled);
        console.log('📡 Emitted initial media state:', { isAudioEnabled, isVideoEnabled });
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [socket, meetingId, participantId, localStream, isAudioEnabled, isVideoEnabled]);

  return {
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenStream,
    screenVideoRef,
    toggleAudio,
    toggleVideo,
    toggleScreenShare
  };
};
