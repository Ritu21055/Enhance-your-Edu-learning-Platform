import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook for managing real-time meeting recording
 * Handles WebRTC stream recording and server communication
 */
const useMediaRecorder = (socket, meetingId, localStream, remoteStreams = {}, localVideoRef = null) => {
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

    const handleRecordingStarted = (data) => {
      console.log('🎬 Recording started:', data);
      setIsRecording(true);
      setRecordingStatus('recording');
      setRecordingError(null);
    };

    const handleRecordingStopped = (data) => {
      console.log('🛑 Recording stopped:', data);
      setIsRecording(false);
      setRecordingStatus('idle');
    };

    const handleRecordingError = (data) => {
      console.error('❌ Recording error:', data);
      setRecordingError(data.error);
      setRecordingStatus('error');
      setIsRecording(false);
    };

    socket.on('recording_started', handleRecordingStarted);
    socket.on('recording_stopped', handleRecordingStopped);
    socket.on('recording_error', handleRecordingError);

    return () => {
      socket.off('recording_started', handleRecordingStarted);
      socket.off('recording_stopped', handleRecordingStopped);
      socket.off('recording_error', handleRecordingError);
    };
  }, [socket]);

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

      // Create combined stream from all participants (local + remote)
      let streamToRecord = localStream;
      
      // If we have remote streams or video element, create a combined recording
      const hasRemoteStreams = remoteStreams && Object.keys(remoteStreams).length > 0;
      const hasVideoElement = localVideoRef && localVideoRef.current;
      
      if (hasRemoteStreams || hasVideoElement) {
        console.log('🎬 Creating combined stream for recording (local + remote participants)...');
        try {
          streamToRecord = await createCombinedRecordingStream(localStream, remoteStreams, localVideoRef, canvasRef, audioContextRef, animationFrameRef);
          combinedStreamRef.current = streamToRecord;
        } catch (error) {
          console.error('❌ Failed to create combined stream, using local stream only:', error);
          streamToRecord = localStream;
        }
      } else {
        console.log('🎬 Recording only local stream (no remote participants yet)');
      }
      
      // Start recording with the combined stream
      if (streamToRecord) {
        console.log('🎬 Creating MediaRecorder with stream:', streamToRecord);
        
        // Check MediaRecorder support
        if (!window.MediaRecorder) {
          throw new Error('MediaRecorder API not supported in this browser');
        }
        
        // Try different mime types for better compatibility
        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8,opus';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
          }
        }
        
        const mediaRecorder = new MediaRecorder(streamToRecord, {
          mimeType: mimeType,
          videoBitsPerSecond: 2500000, // 2.5 Mbps for good quality
          audioBitsPerSecond: 128000 // 128 kbps for audio
        });
        
        console.log('🎬 MediaRecorder created successfully with mimeType:', mimeType);

        mediaRecorderRef.current = mediaRecorder;
        recordedChunksRef.current = [];

        let chunkCount = 0;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunkCount++;
            recordedChunksRef.current.push(event.data);
            
            // Debug every 10 chunks (every 10 seconds)
            if (chunkCount % 10 === 0) {
              console.log('🎬 MediaRecorder chunk:', {
                chunkNumber: chunkCount,
                size: event.data.size,
                type: event.data.type,
                totalChunks: recordedChunksRef.current.length
              });
            }
            
            // Send audio/video chunks to server for real-time processing
            // MediaRecorder captures both audio and video in the same chunk
            const reader = new FileReader();
            reader.onload = () => {
              const arrayBuffer = reader.result;
              const chunkData = Array.from(new Uint8Array(arrayBuffer));
              
              // Send as audio_chunk (contains both audio and video in WebM format)
              socket.emit('audio_chunk', {
                meetingId,
                audioChunk: chunkData,
                timestamp: Date.now()
              });
              
              // Also send as video_frame if video is enabled
              const videoTracks = localStream.getVideoTracks();
              if (videoTracks.length > 0 && videoTracks[0].enabled) {
                socket.emit('video_frame', {
                  meetingId,
                  videoFrame: chunkData, // WebM contains both audio and video
                  timestamp: Date.now()
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
      }

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      setRecordingError(error.message);
      setRecordingStatus('error');
    }
  }, [socket, meetingId, localStream]);

  /**
   * Stop recording the meeting
   */
  const stopRecording = useCallback(async () => {
    if (!socket || !meetingId) {
      console.warn('useMediaRecorder: Missing required parameters for stopping recording');
      return;
    }

    try {
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
    // Create canvas for video capture
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    canvasRef.current = canvas;
    
    // Create audio context for mixing
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    audioContextRef.current = audioContext;
    
    // Add local audio track
    if (localStream) {
      const localAudioTracks = localStream.getAudioTracks();
      localAudioTracks.forEach(track => {
        if (track.enabled) {
          const source = audioContext.createMediaStreamSource(new MediaStream([track]));
          source.connect(destination);
        }
      });
    }
    
    // Add remote audio tracks
    Object.values(remoteStreams).forEach(remoteStream => {
      if (remoteStream && remoteStream.getAudioTracks) {
        const remoteAudioTracks = remoteStream.getAudioTracks();
        remoteAudioTracks.forEach(track => {
          if (track.enabled) {
            const source = audioContext.createMediaStreamSource(new MediaStream([track]));
            source.connect(destination);
          }
        });
      }
    });
    
    // Create video track from canvas
    const videoStream = canvas.captureStream(30); // 30 fps
    const videoTrack = videoStream.getVideoTracks()[0];
    
    // Combine video and audio
    const combinedStream = new MediaStream();
    combinedStream.addTrack(videoTrack);
    destination.stream.getAudioTracks().forEach(track => {
      combinedStream.addTrack(track);
    });
    
    // Create temporary video elements for remote streams
    const remoteVideoElements = new Map();
    Object.entries(remoteStreams).forEach(([participantId, stream]) => {
      if (stream && stream.getVideoTracks().length > 0) {
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true; // Mute to prevent feedback
        
        // Wait for video to be ready before adding to map
        video.addEventListener('loadedmetadata', () => {
          console.log(`🎬 Remote video ${participantId} loaded:`, {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState
          });
        });
        
        video.addEventListener('canplay', () => {
          console.log(`🎬 Remote video ${participantId} can play`);
        });
        
        video.play().catch((err) => {
          console.warn(`⚠️ Failed to play remote video ${participantId}:`, err);
        });
        
        remoteVideoElements.set(participantId, video);
      }
    });
    
    console.log('🎬 Created remote video elements:', {
      count: remoteVideoElements.size,
      participants: Array.from(remoteVideoElements.keys())
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
      const totalVideos = (localVideoRef?.current ? 1 : 0) + remoteVideoElements.size;
      
      // Debug every 30 frames (1 second at 30fps)
      if (drawCount % 30 === 0) {
        const localVideo = localVideoRef?.current;
        const localInfo = localVideo ? {
          videoWidth: localVideo.videoWidth,
          videoHeight: localVideo.videoHeight,
          readyState: localVideo.readyState,
          srcObject: !!localVideo.srcObject,
          paused: localVideo.paused,
          ended: localVideo.ended
        } : null;
        
        const remoteInfo = Array.from(remoteVideoElements.entries()).map(([id, video]) => ({
          id,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          srcObject: !!video.srcObject,
          paused: video.paused,
          ended: video.ended
        }));
        
        console.log('🎬 Canvas drawing debug:', {
          drawCount,
          totalVideos,
          localVideo: localInfo,
          remoteVideos: remoteInfo,
          drawnCount: drawnCount || 0
        });
        
        // Warn if no videos are being drawn
        if (drawnCount === 0 && totalVideos > 0) {
          console.warn('⚠️ Canvas: Videos exist but none are being drawn!', {
            localReady: localVideo && localVideo.videoWidth > 0 && localVideo.readyState >= 2,
            remoteReady: remoteInfo.some(v => v.videoWidth > 0 && v.readyState >= 2)
          });
        }
      }
      
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
      
      // Draw local video
      if (localVideoRef && localVideoRef.current) {
        const localVideo = localVideoRef.current;
        // Check if video is ready and has actual content
        if (localVideo.videoWidth > 0 && localVideo.videoHeight > 0 && 
            localVideo.readyState >= 2 && localVideo.srcObject) {
          try {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * cellWidth;
            const y = row * cellHeight;
            ctx.drawImage(localVideo, x, y, cellWidth, cellHeight);
            index++;
            drawnCount++;
          } catch (err) {
            if (drawCount % 30 === 0) {
              console.warn('🎬 Failed to draw local video:', err);
            }
          }
        }
      }
      
      // Draw remote videos
      remoteVideoElements.forEach((video, participantId) => {
        // Check if video is ready and has actual content
        if (video.videoWidth > 0 && video.videoHeight > 0 && 
            video.readyState >= 2 && video.srcObject) {
          try {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const x = col * cellWidth;
            const y = row * cellHeight;
            ctx.drawImage(video, x, y, cellWidth, cellHeight);
            index++;
            drawnCount++;
          } catch (err) {
            if (drawCount % 30 === 0) {
              console.warn(`🎬 Failed to draw remote video for ${participantId}:`, err);
            }
          }
        }
      });
      
      // If no videos drawn, canvas will be black - this is expected if videos aren't ready yet
      if (drawCount % 30 === 0 && drawnCount === 0) {
        console.warn('⚠️ Canvas: No videos drawn - all videos may not be ready yet');
      }
      
      // Continue drawing
      if (isDrawing) {
        animationFrameRef.current = requestAnimationFrame(drawVideoFrames);
      }
    };
    
    // Wait for videos to be ready before starting canvas stream
    const waitForVideos = async () => {
      let attempts = 0;
      const maxAttempts = 20; // 2 seconds max wait
      
      while (attempts < maxAttempts) {
        const localReady = localVideoRef?.current && 
          localVideoRef.current.videoWidth > 0 && 
          localVideoRef.current.readyState >= 2;
        
        const remoteReady = Array.from(remoteVideoElements.values()).some(video => 
          video.videoWidth > 0 && video.readyState >= 2
        );
        
        if (localReady || remoteReady || remoteVideoElements.size === 0) {
          console.log('🎬 Videos are ready, starting canvas drawing:', {
            localReady,
            remoteReady,
            remoteCount: remoteVideoElements.size
          });
          drawVideoFrames();
          return;
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
      }
      
      // Start anyway after max attempts
      console.warn('⚠️ Videos not fully ready after 2 seconds, starting canvas drawing anyway');
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
      // Clean up remote video elements
      remoteVideoElements.forEach((video) => {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(track => track.stop());
        }
        video.srcObject = null;
      });
      remoteVideoElements.clear();
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
