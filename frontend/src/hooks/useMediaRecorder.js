import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for managing real-time meeting recording
 * Handles WebRTC stream recording and server communication
 */
const useMediaRecorder = (socket, meetingId, localStream, remoteStreams = {}, localVideoRef = null, userName = 'Participant') => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('idle'); // idle, starting, recording, stopping, error
  const [recordingError, setRecordingError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const combinedStreamRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Handle recording status updates from server
  useEffect(() => {
    if (!socket) return;

    const handleRecordingStarted = async (data) => {
      console.log('🎬 Recording started (server confirmation):', data);
      
      // If recording is not already started locally, start it now
      // This handles the case where a participant receives the notification
      if (!isRecording && localStream) {
        console.log('🎬 Participant: Starting local recording after server notification');
        try {
          // Start recording for this participant
          await startRecording();
        } catch (error) {
          console.error('❌ Failed to start participant recording:', error);
        }
      } else {
        // Confirm the state (already set optimistically by host)
        setIsRecording(true);
        setRecordingStatus('recording');
        setRecordingError(null);
      }
    };

    const handleRecordingStopped = async (data) => {
      console.log('🛑 Recording stopped (server confirmation):', data);
      
      // IMMEDIATELY stop local recording when notification is received
      // Don't wait - stop right away for instant feedback
      if (isRecording || mediaRecorderRef.current) {
        console.log('🛑 Participant: Stopping local recording immediately');
        try {
          // Stop MediaRecorder immediately
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          
          // Update state immediately
          setIsRecording(false);
          setRecordingStatus('idle');
          
          // Clean up resources
          if (combinedStreamRef.current) {
            combinedStreamRef.current.getTracks().forEach(track => track.stop());
            combinedStreamRef.current = null;
          }
          
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          
          if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }
        } catch (error) {
          console.error('❌ Error stopping participant recording:', error);
          setIsRecording(false);
          setRecordingStatus('idle');
        }
      } else {
        // Confirm the state (already set optimistically)
        setIsRecording(false);
        setRecordingStatus('idle');
      }
    };

    const handleRecordingError = (data) => {
      console.error('❌ Recording error:', data);
      setRecordingError(data.error);
      setRecordingStatus('error');
      setIsRecording(false); // Revert on error
    };

    socket.on('recording_started', handleRecordingStarted);
    socket.on('recording_stopped', handleRecordingStopped);
    socket.on('recording_error', handleRecordingError);

    return () => {
      socket.off('recording_started', handleRecordingStarted);
      socket.off('recording_stopped', handleRecordingStopped);
      socket.off('recording_error', handleRecordingError);
    };
  }, [socket, isRecording, localStream, startRecording, stopRecording]);

  /**
   * Start recording the meeting
   */
  const startRecording = useCallback(async () => {
    console.log('🎬 startRecording called with:', { socket: !!socket, meetingId, localStream: !!localStream });
    
    if (!socket || !meetingId || !localStream) {
      console.warn('useMediaRecorder: Missing required parameters for recording', {
        socket: !!socket,
        meetingId,
        localStream: !!localStream
      });
      return;
    }

    try {
      // CRITICAL: Update state immediately (optimistically) for instant UI feedback
      setIsRecording(true);
      setRecordingStatus('starting');
      setRecordingError(null);
      console.log('🎬 Starting recording process...');

      // Notify server to start recording
      socket.emit('start_recording', {
        meetingId,
        options: {
          video: true,
          audio: true,
          quality: 'high'
        }
      });

      // ZOOM-LIKE RECORDING: Each participant sends their individual stream to server
      // Server will combine all streams using FFmpeg (like Zoom)
      console.log('🎬 Zoom-like recording: Sending individual participant stream to server');
      console.log('🎬 Participant info:', {
        socketId: socket.id,
        userName: userName,
        hasLocalStream: !!localStream,
        videoTracks: localStream?.getVideoTracks().length || 0,
        audioTracks: localStream?.getAudioTracks().length || 0
      });
      
      // Record only local stream - server will combine all participants
      const streamToRecord = localStream;
      
      if (streamToRecord) {
        // Verify stream has tracks before recording
        const videoTracks = streamToRecord.getVideoTracks();
        const audioTracks = streamToRecord.getAudioTracks();
        
        console.log('🎬 Creating MediaRecorder with stream:', {
          streamId: streamToRecord.id,
          videoTracks: videoTracks.length,
          audioTracks: audioTracks.length,
          videoEnabled: videoTracks.length > 0 ? videoTracks[0].enabled : false,
          audioEnabled: audioTracks.length > 0 ? audioTracks[0].enabled : false
        });
        
        if (videoTracks.length === 0 && audioTracks.length === 0) {
          throw new Error('Stream has no video or audio tracks to record');
        }
        
        // Check MediaRecorder support
        if (!window.MediaRecorder) {
          throw new Error('MediaRecorder API not supported in this browser');
        }
        
        // Try different mime types for better compatibility and audio quality
        // Prefer Opus codec for better audio quality (supports full frequency range)
        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8,opus';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            // Try with explicit audio codec
            mimeType = 'video/webm;codecs=vp9,opus;audioBitsPerSecond=192000';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm;codecs=vp8,opus;audioBitsPerSecond=192000';
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
              }
            }
          }
        }
        
        console.log('🎬 Using mimeType:', mimeType);
        
        const mediaRecorder = new MediaRecorder(streamToRecord, {
          mimeType: mimeType,
          videoBitsPerSecond: 2500000, // 2.5 Mbps for good quality
          audioBitsPerSecond: 192000 // 192 kbps for better audio quality (increased from 128)
        });
        
        console.log('🎬 MediaRecorder created successfully with mimeType:', mimeType);

        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = [];

        // Store the stream being recorded for use in callbacks
        const recordingStream = streamToRecord;

        let chunkCount = 0;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunkCount++;
            recordedChunksRef.current.push(event.data);
            
            // Debug every 10 chunks (every 10 seconds)
            if (chunkCount % 10 === 0) {
              console.log('🎬 MediaRecorder chunk:');
              console.log('  - Chunk Number:', chunkCount);
              console.log('  - Size:', event.data.size, 'bytes');
              console.log('  - Type:', event.data.type);
              console.log('  - Total Chunks:', recordedChunksRef.current.length);
              console.log('  - Stream tracks:', {
                video: recordingStream?.getVideoTracks().length || 0,
                audio: recordingStream?.getAudioTracks().length || 0
              });
            }
            
            // ZOOM-LIKE: Send individual participant stream chunks to server
            // Server will combine all participants' streams using FFmpeg
            const reader = new FileReader();
            reader.onload = () => {
              const arrayBuffer = reader.result;
              const chunkData = Array.from(new Uint8Array(arrayBuffer));
              
              // Send with participant identification (like Zoom)
              socket.emit('participant_recording_chunk', {
                meetingId,
                participantId: socket.id, // Current participant's socket ID
                userName: userName, // Participant's name
                audioChunk: chunkData, // WebM contains both audio and video
                videoChunk: chunkData, // Same data for video
                timestamp: Date.now(),
                videoEnabled: recordingStream?.getVideoTracks()[0]?.enabled || false,
                audioEnabled: recordingStream?.getAudioTracks()[0]?.enabled || false
              });
              
              // Debug every 10 chunks
              if (chunkCount % 10 === 0) {
                console.log('🎬 Sent participant chunk to server:', {
                  participantId: socket.id,
                  userName: userName,
                  chunkSize: chunkData.length,
                  chunkNumber: chunkCount
                });
              }
            };
            reader.onerror = (error) => {
              console.error('❌ FileReader error:', error);
            };
            reader.readAsArrayBuffer(event.data);
          } else {
            console.warn('⚠️ MediaRecorder: Empty chunk received');
          }
        };

        mediaRecorder.onstop = () => {
          console.log('🎬 Local recording stopped');
        };

        console.log('🎬 Starting MediaRecorder...');
        mediaRecorder.start(1000); // Record in 1-second chunks
        console.log('🎬 MediaRecorder started successfully');
        
        // Update status to recording after MediaRecorder starts
        setRecordingStatus('recording');
      } else {
        // If no stream, revert the optimistic state
        console.warn('⚠️ No stream available for recording, reverting state');
        setIsRecording(false);
        setRecordingStatus('idle');
      }

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      // Revert optimistic state on error
      setIsRecording(false);
      setRecordingError(error.message);
      setRecordingStatus('error');
    }
  }, [socket, meetingId, localStream, userName]);

  /**
   * Stop recording the meeting
   */
  const stopRecording = useCallback(async () => {
    if (!socket || !meetingId) {
      console.warn('useMediaRecorder: Missing required parameters for stopping recording');
      return;
    }

    try {
      // CRITICAL: Update state immediately (optimistically) for instant UI feedback
      setIsRecording(false);
      setRecordingStatus('stopping');

      // Stop canvas animation if running
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Stop local media recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      
      // Clean up combined stream
      if (combinedStreamRef.current) {
        combinedStreamRef.current.getTracks().forEach(track => track.stop());
        combinedStreamRef.current = null;
      }
      
      // Clean up canvas
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      
      // Clean up audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Notify server to stop recording
      socket.emit('stop_recording', { meetingId });

    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      setRecordingError(error.message);
      setRecordingStatus('error');
    }
  }, [socket, meetingId]);

  /**
   * Toggle recording state
   */
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  /**
   * Get recording status information
   */
  const getRecordingInfo = useCallback(() => {
    return {
      isRecording,
      status: recordingStatus,
      error: recordingError,
      canStart: !isRecording && recordingStatus === 'idle',
      canStop: isRecording && recordingStatus === 'recording'
    };
  }, [isRecording, recordingStatus, recordingError]);

  return {
    isRecording,
    recordingStatus,
    recordingError,
    startRecording,
    stopRecording,
    toggleRecording,
    getRecordingInfo
  };
};

/**
 * Create a combined recording stream from local + remote streams
 * Uses Canvas for video and AudioContext for audio mixing
 */
async function createCombinedRecordingStream(localStream, remoteStreams, localVideoRef, canvasRef, audioContextRef, animationFrameRef) {
  try {
    // Debug: Log what we're working with
    const remoteStreamKeys = remoteStreams ? Object.keys(remoteStreams) : [];
    console.log('🎬 createCombinedRecordingStream called:', {
      hasLocalStream: !!localStream,
      localVideoTracks: localStream?.getVideoTracks().length || 0,
      localAudioTracks: localStream?.getAudioTracks().length || 0,
      remoteStreamsCount: remoteStreamKeys.length,
      remoteStreamIds: remoteStreamKeys,
      hasLocalVideoRef: !!localVideoRef?.current
    });
    
    // Create canvas for video capture
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    canvasRef.current = canvas;
    
    // Create audio context for mixing with higher sample rate for better quality
    // Use 48000 Hz sample rate (CD quality) instead of default 44100 Hz
    const audioContextOptions = {
      sampleRate: 48000, // Higher sample rate for better audio quality
      numberOfChannels: 2, // Stereo for better audio
      latencyHint: 'interactive' // Low latency for real-time recording
    };
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)(audioContextOptions);
    const destination = audioContext.createMediaStreamDestination();
    audioContextRef.current = audioContext;
    
    console.log('🎬 AudioContext created with sample rate:', audioContext.sampleRate);
    
    // Add local audio track with proper gain control
    if (localStream) {
      const localAudioTracks = localStream.getAudioTracks();
      localAudioTracks.forEach(track => {
        if (track.enabled) {
          const source = audioContext.createMediaStreamSource(new MediaStream([track]));
          // Add gain node to control volume and prevent distortion
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 1.0; // Full volume
          source.connect(gainNode);
          gainNode.connect(destination);
          console.log('🎬 Added local audio track to mix');
        }
      });
    }
    
    // Add remote audio tracks with proper gain control
    Object.values(remoteStreams).forEach((remoteStream, index) => {
      if (remoteStream && remoteStream.getAudioTracks) {
        const remoteAudioTracks = remoteStream.getAudioTracks();
        remoteAudioTracks.forEach(track => {
          if (track.enabled) {
            const source = audioContext.createMediaStreamSource(new MediaStream([track]));
            // Add gain node to control volume and prevent distortion
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0; // Full volume
            source.connect(gainNode);
            gainNode.connect(destination);
            console.log(`🎬 Added remote audio track ${index} to mix`);
          }
        });
      }
    });
    
    // Create video track from canvas
    const videoStream = canvas.captureStream(30); // 30 fps
    const videoTrack = videoStream.getVideoTracks()[0];
    
    // Verify audio destination has tracks
    const audioTracks = destination.stream.getAudioTracks();
    console.log('🎬 Audio tracks in destination:', audioTracks.length);
    
    // Combine video and audio
    const combinedStream = new MediaStream();
    combinedStream.addTrack(videoTrack);
    
    // Add all audio tracks from destination (mixed audio)
    if (audioTracks.length > 0) {
      audioTracks.forEach(track => {
        if (track.enabled) {
          combinedStream.addTrack(track);
          console.log('🎬 Added mixed audio track to combined stream:', {
            id: track.id,
            enabled: track.enabled,
            readyState: track.readyState,
            kind: track.kind
          });
        }
      });
    } else {
      console.warn('⚠️ No audio tracks in destination stream! Audio mixing may have failed.');
      // Fallback: Use local stream audio directly if mixing failed
      if (localStream) {
        const localAudioTracks = localStream.getAudioTracks();
        localAudioTracks.forEach(track => {
          if (track.enabled) {
            combinedStream.addTrack(track);
            console.log('🎬 Using local audio track as fallback (mixing failed)');
          }
        });
      }
      
      // Also add remote audio tracks directly as fallback
      Object.values(remoteStreams).forEach(remoteStream => {
        if (remoteStream && remoteStream.getAudioTracks) {
          const remoteAudioTracks = remoteStream.getAudioTracks();
          remoteAudioTracks.forEach(track => {
            if (track.enabled) {
              combinedStream.addTrack(track);
              console.log('🎬 Using remote audio track as fallback (mixing failed)');
            }
          });
        }
      }); 
    }
    
    console.log('🎬 Combined stream created:', {
      videoTracks: combinedStream.getVideoTracks().length,
      audioTracks: combinedStream.getAudioTracks().length,
      totalTracks: combinedStream.getTracks().length
    });
    
    // Create temporary video elements for ALL streams (local + remote) for canvas drawing
    const videoElements = new Map();
    
    // Add local video element if available
    if (localVideoRef && localVideoRef.current) {
      const localVideo = localVideoRef.current;
      if (localVideo.srcObject || localStream) {
        // Use existing video element if it has srcObject, otherwise create new one
        if (localVideo.srcObject) {
          videoElements.set('local', localVideo);
          console.log('🎬 Using existing local video element');
        } else {
          const video = document.createElement('video');
          video.srcObject = localStream;
          video.autoplay = true;
          video.playsInline = true;
          video.muted = true;
          video.play().catch(err => console.warn('⚠️ Failed to play local video:', err));
          videoElements.set('local', video);
          console.log('🎬 Created new local video element');
        }
      }
    } else if (localStream && localStream.getVideoTracks().length > 0) {
      // Create video element for local stream if no ref provided
      const video = document.createElement('video');
      video.srcObject = localStream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.play().catch(err => console.warn('⚠️ Failed to play local video:', err));
      videoElements.set('local', video);
      console.log('🎬 Created local video element from stream');
    }
    
    // Create temporary video elements for remote streams
    Object.entries(remoteStreams).forEach(([participantId, stream]) => {
      if (stream) {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0 && videoTracks[0].enabled) {
          const video = document.createElement('video');
          video.srcObject = stream;
          video.autoplay = true;
          video.playsInline = true;
          video.muted = true; // Mute to prevent feedback
          video.setAttribute('playsinline', 'true');
          
          // Force video to load and play
          const forcePlay = async () => {
            try {
              await video.play();
              console.log(`✅ Remote video ${participantId} playing`);
            } catch (err) {
              console.warn(`⚠️ Failed to play remote video ${participantId}:`, err);
              // Retry after a delay
              setTimeout(() => {
                video.play().catch(e => console.warn(`⚠️ Retry failed for ${participantId}:`, e));
              }, 500);
            }
          };
          
          // Wait for video to be ready
          video.addEventListener('loadedmetadata', () => {
            console.log(`🎬 Remote video ${participantId} loaded:`, {
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              readyState: video.readyState,
              srcObject: !!video.srcObject
            });
            forcePlay();
          });
          
          video.addEventListener('canplay', () => {
            console.log(`🎬 Remote video ${participantId} can play`);
            forcePlay();
          });
          
          // Start playing immediately
          forcePlay();
          
          videoElements.set(participantId, video);
          console.log(`🎬 Added remote video element for ${participantId}`);
        } else {
          console.warn(`⚠️ Remote stream ${participantId} has no enabled video tracks`);
        }
      }
    });
    
    console.log('🎬 Created video elements for recording:', {
      count: videoElements.size,
      participants: Array.from(videoElements.keys())
    });
    
    // Draw video frames to canvas
    let isDrawing = true;
    let drawCount = 0;
    const drawVideoFrames = () => {
      if (!isDrawing) return;
      
      drawCount++;
      
      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Calculate grid layout
      const totalVideos = videoElements.size;
      
      if (totalVideos === 0) {
        // No videos, just show background
        if (isDrawing) {
          animationFrameRef.current = requestAnimationFrame(drawVideoFrames);
        }
        return;
      }
      
      const cols = Math.ceil(Math.sqrt(totalVideos));
      const rows = Math.ceil(totalVideos / cols);
      const cellWidth = canvas.width / cols;
      const cellHeight = canvas.height / rows;
      
      let index = 0;
      let drawnCount = 0;
      
      // Debug every 30 frames (1 second at 30fps)
      const shouldDebug = drawCount % 30 === 0;
      
      // Draw all videos from videoElements map
      videoElements.forEach((video, participantId) => {
        // More lenient check - try to draw even if readyState is not perfect
        if (video && video.srcObject) {
          // Check if video has dimensions (means it's loaded)
          const hasDimensions = video.videoWidth > 0 && video.videoHeight > 0;
          const isReady = video.readyState >= 2; // HAVE_CURRENT_DATA or higher
          
          if (hasDimensions || isReady) {
            try {
              const col = index % cols;
              const row = Math.floor(index / cols);
              const x = col * cellWidth;
              const y = row * cellHeight;
              
              // Draw video frame
              if (hasDimensions) {
                ctx.drawImage(video, x, y, cellWidth, cellHeight);
              } else {
                // If no dimensions yet, draw a placeholder and retry next frame
                ctx.fillStyle = '#2c3e50';
                ctx.fillRect(x, y, cellWidth, cellHeight);
                ctx.fillStyle = '#ffffff';
                ctx.font = '20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Loading ${participantId}...`, x + cellWidth/2, y + cellHeight/2);
              }
              
              index++;
              if (hasDimensions) {
                drawnCount++;
              }
            } catch (err) {
              if (drawCount % 30 === 0) {
                console.warn(`🎬 Failed to draw video for ${participantId}:`, err, {
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight,
                  readyState: video.readyState,
                  paused: video.paused,
                  ended: video.ended
                });
              }
            }
          } else {
            // Video not ready yet, draw placeholder
            try {
              const col = index % cols;
              const row = Math.floor(index / cols);
              const x = col * cellWidth;
              const y = row * cellHeight;
              
              ctx.fillStyle = '#2c3e50';
              ctx.fillRect(x, y, cellWidth, cellHeight);
              ctx.fillStyle = '#ffffff';
              ctx.font = '16px Arial';
              ctx.textAlign = 'center';
              ctx.fillText(`Waiting for ${participantId}...`, x + cellWidth/2, y + cellHeight/2);
              
              index++;
            } catch (err) {
              // Ignore placeholder errors
            }
          }
        }
      });
      
      // Debug logging after drawing is complete
      if (shouldDebug) {
        const videoInfo = Array.from(videoElements.entries()).map(([id, video]) => ({
          id,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          srcObject: !!video.srcObject,
          paused: video.paused,
          ended: video.ended
        }));
        
        // Expand object for better debugging
        console.log('🎬 Canvas drawing debug:');
        console.log('  - Draw Count:', drawCount);
        console.log('  - Total Videos:', totalVideos);
        console.log('  - Drawn Count:', drawnCount);
        console.log('  - All Videos:', videoInfo);
        
        // Warn if no videos are being drawn
        if (drawnCount === 0 && totalVideos > 0) {
          console.warn('⚠️ Canvas: Videos exist but none are being drawn!', {
            videosReady: videoInfo.some(v => v.videoWidth > 0 && v.readyState >= 2)
          });
        }
      }
      
      // Continue drawing
      if (isDrawing) {
        animationFrameRef.current = requestAnimationFrame(drawVideoFrames);
      }
    };
    
      // Wait for videos to be ready before starting canvas stream
      const waitForVideos = async () => {
        let attempts = 0;
        const maxAttempts = 30; // 3 seconds max wait (increased for remote videos)
        
        while (attempts < maxAttempts) {
          const videoStatus = Array.from(videoElements.entries()).map(([id, video]) => ({
            id,
            hasDimensions: video.videoWidth > 0 && video.videoHeight > 0,
            readyState: video.readyState,
            hasSrcObject: !!video.srcObject
          }));
          
          const videosReady = videoStatus.some(v => v.hasDimensions && v.readyState >= 2);
          const atLeastOneHasSrcObject = videoStatus.some(v => v.hasSrcObject);
          
          console.log(`🎬 Waiting for videos (attempt ${attempts + 1}/${maxAttempts}):`, videoStatus);
          
          if (videosReady || (atLeastOneHasSrcObject && videoElements.size > 0)) {
            console.log('🎬 Videos are ready, starting canvas drawing:', {
              videosReady,
              videoCount: videoElements.size,
              status: videoStatus
            });
            drawVideoFrames();
            return;
          }
          
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
        }
        
        // Start anyway after max attempts - canvas will show placeholders until videos load
        console.warn('⚠️ Videos not fully ready after 3 seconds, starting canvas drawing anyway (will show placeholders)');
        console.log('🎬 Final video status:', Array.from(videoElements.entries()).map(([id, video]) => ({
          id,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          srcObject: !!video.srcObject
        })));
        drawVideoFrames();
      };
    
    waitForVideos();
    
    // Store cleanup function
    const cleanup = () => {
      isDrawing = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Clean up all video elements (except the original localVideoRef if it exists)
      videoElements.forEach((video, participantId) => {
        // Don't clean up the original localVideoRef element
        if (participantId !== 'local' || video !== localVideoRef?.current) {
          if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
          }
          video.srcObject = null;
        }
      });
      videoElements.clear();
    };
    
    // Attach cleanup to stream
    combinedStream.addEventListener('inactive', cleanup);
    
    // Also cleanup on window unload
    window.addEventListener('beforeunload', cleanup);
    
    console.log('✅ Combined recording stream created');
    return combinedStream;
    
  } catch (error) {
    console.error('❌ Failed to create combined stream:', error);
    throw error;
  }
}

export default useMediaRecorder;
