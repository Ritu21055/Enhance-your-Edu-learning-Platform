import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Box, IconButton, Typography, Paper, Divider } from '@mui/material';
import '../css/UltraSimpleVideo.css';
import { 
  Videocam, 
  VideocamOff, 
  Mic, 
  MicOff, 
  BugReport, 
  Close,
  PersonRemove
} from '@mui/icons-material';

// Helper functions for responsive grid layout
const getGridColumns = (totalVideos) => {
  if (totalVideos === 1) return '1fr';
  if (totalVideos === 2) return '1fr 1fr';
  // For more than 2 videos, use scrollable layout with fixed column count
  return 'repeat(auto-fit, minmax(300px, 1fr))';
};

const getGridRows = (totalVideos) => {
  if (totalVideos === 1) return '1fr';
  if (totalVideos === 2) return '1fr';
  // For more than 2 videos, use auto rows for scrolling
  return 'repeat(auto-fit, minmax(200px, 1fr))';
};

const getGridLayout = (totalVideos) => {
  if (totalVideos === 1) {
    return {
      display: 'flex',
      height: '100%',
      width: '100%'
    };
  } else if (totalVideos === 2) {
    return {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr',
      height: '100%',
      gap: 2
    };
  } else {
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gridTemplateRows: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 2,
      overflowY: 'auto',
      maxHeight: '100%',
      paddingRight: 1 // Space for scrollbar
    };
  }
};

const UltraSimpleVideo = ({ 
  userName, 
  participants, 
  remoteStreams, 
  localStream,
  localVideoRef,
  isHost,
  currentUserId,
  forceConnection,
  createConnectionsToAllParticipants,
  initializeMedia,
  // Screen sharing props (kept for future implementation)
  screenStream,
  remoteScreenStreams,
  forceRender: hookForceRender,
  // Participant management
  onRemoveParticipant,
  // Debug function
  debugConnectionStatus
}) => {
  const remoteVideoRefs = useRef({});
  const remoteAudioRefs = useRef({});
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [forceRender, setForceRender] = useState(0);
  const [layoutKey, setLayoutKey] = useState(0);
  
  // Use the hook's forceRender if available, otherwise use local state
  const effectiveForceRender = hookForceRender !== undefined ? hookForceRender : forceRender;
  
  // Filter out current user from participants - MOVED TO TOP to prevent hoisting issues
  const otherParticipants = participants.filter(p => p.id !== currentUserId);
  const totalVideos = otherParticipants.length + 1; // +1 for local video
  
  // Debounce stream assignments to prevent blinking
  const streamAssignmentTimeouts = useRef({});
  
  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(streamAssignmentTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
      if (reRenderTimeout.current) {
        clearTimeout(reRenderTimeout.current);
      }
    };
  }, []);

  // DISABLED: STABILITY: Periodic cleanup - causing flickering
  // useEffect(() => {
  //   const cleanupInterval = setInterval(() => {
  //     console.log('🧹 UltraSimpleVideo: Running periodic cleanup for stability...');
  //     
  //     // Clean up duplicate video elements
  //     const allVideoElements = document.querySelectorAll('video');
  //     const participantVideoCounts = {};
  //     
  //     allVideoElements.forEach(video => {
  //       const participantId = video.getAttribute('data-participant-id');
  //       if (participantId) {
  //         participantVideoCounts[participantId] = (participantVideoCounts[participantId] || 0) + 1;
  //       }
  //     });
  //     
  //     // Remove duplicates for each participant
  //     Object.keys(participantVideoCounts).forEach(participantId => {
  //       if (participantVideoCounts[participantId] > 1) {
  //         console.log(`🧹 UltraSimpleVideo: Found ${participantVideoCounts[participantId]} video elements for ${participantId}, cleaning up...`);
  //         const elements = document.querySelectorAll(`video[data-participant-id="${participantId}"]`);
  //         for (let i = 1; i < elements.length; i++) {
  //           const duplicateEl = elements[i];
  //           if (duplicateEl.srcObject) {
  //             duplicateEl.srcObject.getTracks().forEach(track => track.stop());
  //           }
  //           duplicateEl.srcObject = null;
  //           duplicateEl.remove();
  //         }
  //       }
  //     });
  //     
  //     // Clean up orphaned video elements
  //     allVideoElements.forEach(video => {
  //       if (!video.getAttribute('data-participant-id') && !video.getAttribute('data-local-video')) {
  //         console.log(`🧹 UltraSimpleVideo: Removing orphaned video element...`);
  //         if (video.srcObject) {
  //           video.srcObject.getTracks().forEach(track => track.stop());
  //         }
  //         video.srcObject = null;
  //         video.remove();
  //       }
  //     });
  //   }, 60000); // Run cleanup every minute for stability
  //   
  //   return () => clearInterval(cleanupInterval);
  // }, []);

  // DISABLED: Monitor participants data changes - causing video issues
  // useEffect(() => {
  //   console.log('🎥 UltraSimpleVideo: Participants data changed:', participants.map(p => ({
  //     id: p.id,
  //     name: p.name,
  //     audioEnabled: p.audioEnabled,
  //     videoEnabled: p.videoEnabled
  //   })));
  // }, [participants]);

  // CRITICAL: Monitor remote streams and assign to audio elements
  // DISABLED: Remote streams effect - causing excessive re-rendering and video issues
  // useEffect(() => {
  //   console.log('🔊 UltraSimpleVideo: Remote streams updated:', Object.keys(remoteStreams));
  //   
  //   Object.keys(remoteStreams).forEach(participantId => {
  //     const stream = remoteStreams[participantId];
  //     const audioElement = remoteAudioRefs.current[participantId];
  //     
  //     if (stream && audioElement) {
  //       console.log(`🔊 UltraSimpleVideo: Assigning stream to audio element for ${participantId}`);
  //       
  //       // Force audio element configuration
  //       audioElement.muted = false;
  //       audioElement.volume = 1.0;
  //       audioElement.autoplay = true;
  //       audioElement.playsInline = true;
  //       
  //       // Assign the stream
  //       audioElement.srcObject = stream;
  //       
  //       // Force play
  //       audioElement.play().then(() => {
  //         console.log(`✅ UltraSimpleVideo: Audio play successful for ${participantId}`);
  //       }).catch(err => {
  //         console.log(`❌ UltraSimpleVideo: Audio play failed for ${participantId}:`, err);
  //       });
  //       
  //       // Force enable audio tracks
  //       const audioTracks = stream.getAudioTracks();
  //       audioTracks.forEach((track, index) => {
  //         if (!track.enabled) {
  //           track.enabled = true;
  //           console.log(`🔊 UltraSimpleVideo: Force enabled audio track ${index} for ${participantId}`);
  //         }
  //         if (track.muted) {
  //           // Note: muted property is read-only in newer browsers
  //           console.log(`🔊 UltraSimpleVideo: Force unmuted audio track ${index} for ${participantId}`);
  //         }
  //       });
  //     }
  //   });
  // }, [remoteStreams]);

  // DISABLED: Media State Monitoring - causing flickering
  // useEffect(() => {
  //   const fixVideoMirroringAndMediaStates = () => {
  //     // Find ALL video elements
  //     const allVideos = document.querySelectorAll('video');
  //     
  //     console.log(`📹 UltraSimpleVideo: Found ${allVideos.length} total videos`);
  //     
  //     // Fix camera videos - should be mirrored like a mirror
  //     allVideos.forEach((video, index) => {
  //       console.log(`📹 UltraSimpleVideo: Fixing camera video ${index + 1}`);
  //       
  //       // CAMERA: Mirror like a mirror (scaleX(-1))
  //       video.style.setProperty('transform', 'scaleX(-1)', 'important');
  //       video.style.setProperty('-webkit-transform', 'scaleX(-1)', 'important');
  //       video.style.setProperty('-moz-transform', 'scaleX(-1)', 'important');
  //       video.style.setProperty('-ms-transform', 'scaleX(-1)', 'important');
  //       video.style.setProperty('-o-transform', 'scaleX(-1)', 'important');
  //       
  //       // CAMERA: Force proper sizing
  //       video.style.setProperty('object-fit', 'cover', 'important');
  //       video.style.setProperty('background', 'transparent', 'important');
  //       video.style.setProperty('width', '100%', 'important');
  //       video.style.setProperty('height', '100%', 'important');
  //       video.style.setProperty('display', 'block', 'important');
  //       video.style.setProperty('border-radius', '0', 'important');
  //       
  //       console.log(`📹 UltraSimpleVideo: Applied camera mirroring to video ${index + 1}`);
  //     });
      
  //       // ROBUST: Continuously monitor and fix media states
  //       otherParticipants.forEach(participant => {
  //         const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
  //         if (videoElement) {
  //           // Force apply media state changes
  //           if (!participant.videoEnabled) {
  //             console.log(`🔒 UltraSimpleVideo: FORCE HIDING video for ${participant.name} (camera off)`);
  //             videoElement.style.setProperty('display', 'none', 'important');
  //             videoElement.style.setProperty('visibility', 'hidden', 'important');
  //             videoElement.style.setProperty('opacity', '0', 'important');
  //             videoElement.style.setProperty('pointer-events', 'none', 'important');
  //             videoElement.style.setProperty('z-index', '-1', 'important');
  //           } else {
  //             console.log(`🔓 UltraSimpleVideo: FORCE SHOWING video for ${participant.name} (camera on)`);
  //             videoElement.style.setProperty('display', 'block', 'important');
  //             videoElement.style.setProperty('visibility', 'visible', 'important');
  //             videoElement.style.setProperty('opacity', '1', 'important');
  //             videoElement.style.setProperty('pointer-events', 'auto', 'important');
  //             videoElement.style.setProperty('z-index', '1', 'important');
  //           }
  //         }
  //       });
  //     };

  //     // Fix immediately
  //     fixVideoMirroringAndMediaStates();

  //     // Set up interval to continuously monitor and fix (reduced frequency for performance)
  //     const interval = setInterval(fixVideoMirroringAndMediaStates, 2000);

  //     return () => clearInterval(interval);
  //   }, [forceRender, otherParticipants]);

  // DISABLED: DEDICATED Media State Monitoring - causing flickering
  // useEffect(() => {
  //   const monitorMediaStates = () => {
  //     console.log('🔍 UltraSimpleVideo: Monitoring media states...');
  //     
  //     otherParticipants.forEach(participant => {
  //       const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
  //       
  //       if (videoElement) {
  //         const currentDisplay = window.getComputedStyle(videoElement).display;
  //         const currentVisibility = window.getComputedStyle(videoElement).visibility;
  //         const currentOpacity = window.getComputedStyle(videoElement).opacity;
  //         
  //         console.log(`🔍 UltraSimpleVideo: ${participant.name} media state check:`, {
  //           videoEnabled: participant.videoEnabled,
  //           currentDisplay,
  //           currentVisibility,
  //           currentOpacity,
  //           shouldBeVisible: participant.videoEnabled
  //         });
  //         
  //         // Force correct media state if there's a mismatch
  //         if (!participant.videoEnabled && (currentDisplay !== 'none' || currentVisibility !== 'hidden' || currentOpacity !== '0')) {
  //           console.log(`🔒 UltraSimpleVideo: CORRECTING - Force hiding ${participant.name} video`);
  //           videoElement.style.setProperty('display', 'none', 'important');
  //           videoElement.style.setProperty('visibility', 'hidden', 'important');
  //           videoElement.style.setProperty('opacity', '0', 'important');
  //           videoElement.style.setProperty('pointer-events', 'none', 'important');
  //           videoElement.style.setProperty('z-index', '-1', 'important');
  //         } else if (participant.videoEnabled && (currentDisplay === 'none' || currentVisibility === 'hidden' || currentOpacity === '0')) {
  //           console.log(`🔓 UltraSimpleVideo: GENTLY showing ${participant.name} video`);
  //           videoElement.style.setProperty('display', 'block', 'important');
  //           videoElement.style.setProperty('visibility', 'visible', 'important');
  //           videoElement.style.setProperty('opacity', '1', 'important');
  //           videoElement.style.setProperty('pointer-events', 'auto', 'important');
  //           videoElement.style.setProperty('z-index', '1', 'important');
  //         }
  //       }
  //     });
  //   };

  //   // Monitor immediately
  //   monitorMediaStates();

  //   // GENTLE MONITORING: Reduce monitoring frequency to prevent camera issues
  //   const interval = setInterval(monitorMediaStates, 500); // Reduced to 500ms for stability

  //   return () => clearInterval(interval);
  // }, [otherParticipants]);

  // Stable video element creation callback to prevent recreation
  // SIMPLE: Video element creation without aggressive intervals
  const createVideoElement = useCallback((participantId) => {
    return (el) => {
      if (el && participantId) {
        remoteVideoRefs.current[participantId] = el;
        
        // Force video element to be visible
        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        
        // Only assign stream if it's available and different
        if (remoteStreams[participantId]) {
          const stream = remoteStreams[participantId];
          if (stream && stream.active && stream.getTracks().length > 0 && el.srcObject !== stream) {
            console.log(`🎥 UltraSimpleVideo: Assigning stream to video element for ${participantId}`);
            el.srcObject = stream;
            if (el) el.play().catch(() => {}); // Silent fail
          }
        }
      }
    };
  }, [remoteStreams]);

  // MINIMAL: Simple audio element creation - NO CLEANUP, NO MANIPULATION
  const createAudioElement = useCallback((participantId) => {
    return (el) => {
      if (el && participantId) {
        remoteAudioRefs.current[participantId] = el;
        if (remoteStreams[participantId]) {
            const stream = remoteStreams[participantId];
            if (stream && stream.active && stream.getTracks().length > 0) {
              el.srcObject = stream;
            if (el) el.play().catch(() => {});
          }
        }
      }
    };
  }, [remoteStreams]);

  // MINIMAL: Single effect for local video - NO OTHER EFFECTS
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      console.log('🎥 UltraSimpleVideo: Setting up local video - MINIMAL APPROACH');
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.style.display = 'block';
      localVideoRef.current.style.visibility = 'visible';
      localVideoRef.current.style.opacity = '1';
    }
  }, [localStream]);

  // CONSOLIDATED: Single effect for remote streams - NO DUPLICATE PROCESSING
  useEffect(() => {
    console.log('🎥 UltraSimpleVideo: Remote streams updated:', Object.keys(remoteStreams));
    
    // Use debouncing to prevent excessive processing
    const timeoutId = setTimeout(() => {
      Object.keys(remoteStreams).forEach(participantId => {
        const videoElement = remoteVideoRefs.current[participantId];
        const audioElement = remoteAudioRefs.current[participantId];
        const stream = remoteStreams[participantId];
        
        if (stream && stream.active && stream.getTracks().length > 0) {
          // Only update if stream is different to prevent unnecessary re-renders
          if (videoElement && videoElement.srcObject !== stream) {
            console.log(`🎥 UltraSimpleVideo: Assigning stream to video element for ${participantId}`);
            videoElement.srcObject = stream;
            videoElement.style.display = 'block';
            videoElement.style.visibility = 'visible';
            videoElement.style.opacity = '1';
            videoElement.play().catch(() => {});
          }
          
          if (audioElement && audioElement.srcObject !== stream) {
            console.log(`🔊 UltraSimpleVideo: Assigning stream to audio element for ${participantId}`);
            audioElement.srcObject = stream;
            audioElement.play().catch(() => {});
          }
        }
      });
    }, 100); // Small delay to prevent excessive updates
    
    return () => clearTimeout(timeoutId);
  }, [remoteStreams]);

  // DISABLED: Ultra-aggressive protection completely removed to prevent interference
  // The aggressive protection systems have been removed to prevent video blinking
  // Use the "Fix Host Video Stream" button instead for manual fixes when needed

  // REMOVED: Duplicate participant handling - consolidated into main remoteStreams effect

  // REMOVED: Duplicate local video handling - already handled in main localStream effect

  // REMOVED: Duplicate video visibility handling - consolidated into main effects

  // GENTLE HOST VIDEO: Ensure host video is visible (with or without participants)
  useEffect(() => {
    console.log('🎥 UltraSimpleVideo: Gentle host video visibility check');
    console.log('🎥 UltraSimpleVideo: Other participants count:', otherParticipants.length);
    
    // Only set up host video if it's missing or not properly configured
    if (localVideoRef.current && localStream) {
      const needsSetup = !localVideoRef.current.srcObject || 
                        localVideoRef.current.style.display === 'none' ||
                        localVideoRef.current.style.visibility === 'hidden';
      
      if (needsSetup) {
        console.log('🎥 UltraSimpleVideo: Setting up local video (host)');
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.style.display = 'block';
        localVideoRef.current.style.visibility = 'visible';
        localVideoRef.current.style.opacity = '1';
        localVideoRef.current.play().catch(() => {});
      }
    }
  }, [otherParticipants.length, localStream]);

  // GENTLE HOST VIDEO PROTECTION: Light check to ensure host video stays visible (reduced frequency)
  useEffect(() => {
    if (localStream) {
      console.log('🎥 UltraSimpleVideo: Starting gentle host video protection');
      console.log('🎥 UltraSimpleVideo: Other participants count:', otherParticipants.length);
      
      const forceHostVideoInterval = setInterval(() => {
        if (localVideoRef.current && localStream) {
          // Only check if host video is completely missing, not just hidden
          const hasNoStream = !localVideoRef.current.srcObject;
          
          if (hasNoStream) {
            console.log('🎥 UltraSimpleVideo: GENTLE - Host video missing stream, restoring');
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.style.display = 'block';
            localVideoRef.current.style.visibility = 'visible';
            localVideoRef.current.style.opacity = '1';
            localVideoRef.current.play().catch(() => {});
          }
        }
      }, 5000); // Reduced frequency: Check every 5 seconds instead of 2
      
      return () => {
        console.log('🎥 UltraSimpleVideo: Stopping gentle host video protection');
        clearInterval(forceHostVideoInterval);
      };
    }
  }, [otherParticipants.length, localStream]);

  // EMERGENCY: Global function to force host video visibility
  useEffect(() => {
    // Expose global function for emergency host video fix
    window.forceHostVideoVisible = () => {
      console.log('🚨 EMERGENCY: Forcing host video to be visible...');
      console.log('🎥 UltraSimpleVideo: Other participants count:', otherParticipants.length);
      
      // Find all video elements in the DOM
      const allVideos = document.querySelectorAll('video');
      console.log('🚨 EMERGENCY: Found video elements:', allVideos.length);
      
      allVideos.forEach((video, index) => {
        console.log(`🚨 EMERGENCY: Video ${index}:`, {
          srcObject: !!video.srcObject,
          display: video.style.display,
          visibility: video.style.visibility,
          opacity: video.style.opacity,
          paused: video.paused,
          currentTime: video.currentTime
        });
        
        // Force all video elements to be visible and playing
        video.style.display = 'block';
        video.style.visibility = 'visible';
        video.style.opacity = '1';
        video.style.position = 'relative';
        video.style.zIndex = '999';
        
        // Force play
        video.play().catch(err => console.log('🚨 EMERGENCY: Play failed:', err));
      });
      
      // Also force through refs
    Object.keys(remoteVideoRefs.current).forEach(participantId => {
        const videoElement = remoteVideoRefs.current[participantId];
      const stream = remoteStreams[participantId];
      
        if (videoElement && stream) {
          console.log(`🚨 EMERGENCY: Forcing video for ${participantId}`);
          videoElement.srcObject = stream;
          videoElement.style.display = 'block';
          videoElement.style.visibility = 'visible';
          videoElement.style.opacity = '1';
          videoElement.style.position = 'relative';
          videoElement.style.zIndex = '999';
          videoElement.play().catch(() => {});
        }
      });
      
      console.log('🚨 EMERGENCY: Host video force complete!');
    };
    
    return () => {
      delete window.forceHostVideoVisible;
    };
  }, [remoteStreams, otherParticipants.length]);

  // DISABLED: Nuclear option completely removed to prevent interference
  // The aggressive protection systems have been removed to prevent video blinking
  // Use the "Fix Host Video Stream" button instead for manual fixes when needed

  // CLEANUP: Clean up video elements when component unmounts
  useEffect(() => {
    return () => {
      console.log('🧹 UltraSimpleVideo: Cleaning up video elements');
      
      // Clean up video elements
      Object.values(remoteVideoRefs.current).forEach(video => {
        if (video && video.srcObject) {
          video.srcObject = null;
        }
      });
    };
  }, []);

  // DISABLED: Memoize participants - causing excessive re-renders
  // const memoizedParticipants = useMemo(() => {
  //   console.log('🔄 UltraSimpleVideo: Memoizing participants');
  //   return participants;
  // }, [participants.map(p => `${p.id}-${p.audioEnabled}-${p.videoEnabled}`).join(',')]);

  // Throttle re-renders to prevent excessive updates
  const reRenderTimeout = useRef(null);
  
  // DISABLED: Force re-render when participants change - causing video issues
  // useEffect(() => {
  //   console.log('🔄 UltraSimpleVideo: Participants changed, checking if re-render needed');
  //   console.log('🔄 UltraSimpleVideo: Participants data:', participants.map(p => ({ 
  //     id: p.id, 
  //     name: p.name, 
  //     audioEnabled: p.audioEnabled, 
  //     videoEnabled: p.videoEnabled 
  //   })));
  //   
  //   // Clear existing timeout
  //   if (reRenderTimeout.current) {
  //     clearTimeout(reRenderTimeout.current);
  //   }
  //   
  //   // Only force re-render if there are actual media state changes
  //   const hasMediaStateChanges = participants.some(p => 
  //     p.audioEnabled !== undefined || p.videoEnabled !== undefined
  //   );
  //   
  //   if (hasMediaStateChanges) {
  //     console.log('🔄 UltraSimpleVideo: Media state changes detected, throttling re-render');
  //     // Throttle re-renders to prevent excessive updates
  //     reRenderTimeout.current = setTimeout(() => {
  //       console.log('🔄 UltraSimpleVideo: Executing throttled re-render');
  //       setForceRender(prev => prev + 1);
  //     }, 100); // 100ms throttle
  //   } else {
  //     console.log('🔄 UltraSimpleVideo: No media state changes, skipping re-render');
  //   }
  // }, [participants]);

  // DISABLED: Clean up video elements when participants are removed - causing video issues
  // useEffect(() => {
  //   console.log('🧹 UltraSimpleVideo: Cleaning up video elements for removed participants');
  //   console.log('🧹 UltraSimpleVideo: Current participants:', participants.map(p => ({ id: p.id, name: p.name })));
  //   
  //   // Get current participant IDs
  //   const currentParticipantIds = participants.map(p => p.id);
  //   
  //   // Clean up video refs for participants that no longer exist
  //   Object.keys(remoteVideoRefs.current).forEach(participantId => {
  //     if (!currentParticipantIds.includes(participantId)) {
  //       console.log(`🧹 UltraSimpleVideo: Cleaning up video ref for removed participant: ${participantId}`);
  //       const videoElement = remoteVideoRefs.current[participantId];
  //       if (videoElement) {
  //         // Stop all tracks in the video element
  //         if (videoElement.srcObject) {
  //           videoElement.srcObject.getTracks().forEach(track => {
  //             track.stop();
  //           });
  //         }
  //         // Clear the video source
  //         videoElement.srcObject = null;
  //         // Remove the video element from the ref
  //         delete remoteVideoRefs.current[participantId];
  //       }
  //     }
  //   });
  //   
  //   // Clean up any duplicate video elements in the DOM
  //   const allVideoElements = document.querySelectorAll('video[data-participant-id]');
  //   allVideoElements.forEach(videoEl => {
  //     const participantId = videoEl.getAttribute('data-participant-id');
  //     if (participantId && !currentParticipantIds.includes(participantId)) {
  //       console.log(`🧹 UltraSimpleVideo: Removing orphaned video element for participant: ${participantId}`);
  //       if (videoEl.srcObject) {
  //         videoEl.srcObject.getTracks().forEach(track => track.stop());
  //       }
  //       videoEl.srcObject = null;
  //       videoEl.remove();
  //     }
  //   });
  //   
  //   // Force a re-render to ensure the UI updates
  //   setTimeout(() => {
  //     console.log('🔄 UltraSimpleVideo: Force re-render after participant cleanup');
  //     setLayoutKey(prev => prev + 1);
  //     setForceRender(prev => prev + 1);
  //   }, 50);
  // }, [participants]);

  // DISABLED: Set up remote videos - causing local video interference
  // useEffect(() => {
  //   // Clean up video elements for streams that no longer exist
  //   Object.keys(remoteVideoRefs.current).forEach(participantId => {
  //     if (!remoteStreams[participantId]) {
  //       const videoElement = remoteVideoRefs.current[participantId];
  //       if (videoElement) {
  //         videoElement.srcObject = null;
  //         delete remoteVideoRefs.current[participantId];
  //       }
  //     }
  //   });
  //   
  //   Object.keys(remoteStreams).forEach(participantId => {
  //     if (participantId === currentUserId) {
  //       return;
  //     }
  //     
  //     const videoEl = remoteVideoRefs.current[participantId];
  //     const stream = remoteStreams[participantId];
  //     
  //     if (videoEl && stream) {
  //       if (videoEl.srcObject !== stream) {
  //         if (stream.active && stream.getTracks().length > 0) {
  //           if (streamAssignmentTimeouts.current[participantId]) {
  //             clearTimeout(streamAssignmentTimeouts.current[participantId]);
  //           }
  //           
  //           streamAssignmentTimeouts.current[participantId] = setTimeout(() => {
  //             console.log(`🎥 UltraSimpleVideo: Assigning stream to video element for ${participantId}`);
  //             videoEl.srcObject = stream;
  //             delete streamAssignmentTimeouts.current[participantId];
  //           }, 200); // Increased delay for better stream assignment
  //         }
  //         
  //         videoEl.play().catch(err => {
  //           setTimeout(() => {
  //             videoEl.srcObject = stream;
  //             videoEl.play().catch(retryErr => {
  //               // Ignore play errors
  //             });
  //           }, 500);
  //         });
  //       }
  //     }
  //   });
  // }, [remoteStreams, currentUserId]);

  // DISABLED: forceCorrectMediaStates - causing flickering
  // useEffect(() => {
  //   const forceCorrectMediaStates = () => {
  //     otherParticipants.forEach(participant => {
  //       const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
  //       if (videoElement) {
  //         videoElement.setAttribute('data-video-enabled', participant.videoEnabled);
  //         videoElement.setAttribute('data-audio-enabled', participant.audioEnabled);
  //         
  //         if (!participant.videoEnabled) {
  //           videoElement.style.setProperty('display', 'none', 'important');
  //           videoElement.style.setProperty('visibility', 'hidden', 'important');
  //           videoElement.style.setProperty('opacity', '0', 'important');
  //           videoElement.style.setProperty('pointer-events', 'none', 'important');
  //           videoElement.style.setProperty('z-index', '-1', 'important');
  //         } else {
  //           videoElement.style.setProperty('display', 'block', 'important');
  //           videoElement.style.setProperty('visibility', 'visible', 'important');
  //           videoElement.style.setProperty('opacity', '1', 'important');
  //           videoElement.style.setProperty('pointer-events', 'auto', 'important');
  //           videoElement.style.setProperty('z-index', '1', 'important');
  //         }
  //       }
  //     });
  //   };

  //   forceCorrectMediaStates();
  // }, [otherParticipants, forceRender]);
  

  return (
    <Box className="ultra-simple-video-container">
      {/* Floating Control Bar */}
      <Box className="debug-panel-toggle">
        {/* Debug Panel Toggle */}
        <IconButton 
          className={`debug-toggle-button ${debugPanelOpen ? 'active' : ''}`}
          onClick={() => setDebugPanelOpen(!debugPanelOpen)}
        >
          <BugReport className="debug-icon" />
        </IconButton>
      </Box>

      {/* Main Video Area */}
      <Box 
        key={`video-area-${totalVideos}-${otherParticipants.length}-${layoutKey}`}
        className={`main-video-area ${totalVideos > 2 ? 'video-scrollable' : ''} ${totalVideos === 1 ? 'single-video' : ''}`}
        style={getGridLayout(totalVideos)}>
        {/* Local Video */}
        <Box 
          key={`local-video-${totalVideos}`}
          className={`video-item ${totalVideos > 2 ? 'video-item-scrollable' : ''} ${totalVideos === 1 ? 'single-video' : ''} ${isHost ? 'host-video' : ''}`}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="video-element"
            style={{
              position: 'relative',
              zIndex: 1,
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
          <Typography 
            variant="body2" 
            className={`participant-name ${isHost ? 'host' : 'participant'}`}
            style={{
            position: 'absolute',
              bottom: '60px',
              left: '20px',
              color: isHost ? '#FFD700' : '#FFFFFF',
              fontWeight: 700,
              fontSize: '1.1rem',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '0.3px',
              zIndex: 100,
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              padding: '4px 8px',
              borderRadius: '6px',
              margin: '0'
            }}
          >
            {isHost && '👑 '}{userName || 'You'}
            </Typography>
          
        </Box>

        {/* Remote Videos - Now integrated into main grid */}
            {otherParticipants.map(participant => (
              <Box 
                key={`${participant.id}-${participant.audioEnabled}-${participant.videoEnabled}`}
                className={`video-item ${totalVideos > 2 ? 'video-item-scrollable' : ''} ${participant.isHost ? 'host-video' : ''}`}>
                
                {/* Remove participant button - completely removed to maintain perfect video layout */}

                <video
                  ref={createVideoElement(participant.id)}
                  autoPlay
                  playsInline
                  muted={false}
                  volume={1.0}
                  className="video-element"
                  data-participant-id={participant.id}
                  data-video-enabled={participant.videoEnabled}
                  data-audio-enabled={participant.audioEnabled}
                  style={{
                    display: participant.videoEnabled ? 'block' : 'none',
                    visibility: participant.videoEnabled ? 'visible' : 'hidden',
                    opacity: participant.videoEnabled ? 1 : 0,
                    pointerEvents: participant.videoEnabled ? 'auto' : 'none'
                  }}
                />
                
                {/* Separate audio element for better audio handling */}
                <audio
                  ref={createAudioElement(participant.id)}
                  autoPlay
                  playsInline
                  muted={false}
                  volume={1.0}
                  style={{ 
                    position: 'absolute',
                    top: '-9999px',
                    left: '-9999px',
                    width: '1px',
                    height: '1px',
                    opacity: '0',
                    pointerEvents: 'none'
                  }} // Hide but keep functional
                />
                
                {/* Debug info for camera state - REDUCED LOGGING */}
                {/* {console.log(`🎥 UltraSimpleVideo: Participant ${participant.name} camera state:`, {
                  videoEnabled: participant.videoEnabled,
                  shouldShowVideo: participant.videoEnabled,
                  shouldShowOverlay: !participant.videoEnabled
                })} */}
                
                {/* Camera Off Overlay - Simplified Design */}
                {!participant.videoEnabled && (
                  <Box className="camera-off-overlay">
                    <Box className="camera-off-avatar">
                      <Typography variant="h4" className="camera-off-avatar-initials">
                        {participant.name ? participant.name.charAt(0).toUpperCase() : '?'}
                      </Typography>
                    </Box>
                      <Typography variant="body2" className="camera-off-subtitle">
                        {participant.name} has turned off their camera
                    </Typography>
                  </Box>
                )}
                
                {/* Audio Off Indicator */}
                {!participant.audioEnabled && (
                  <Box className="audio-off-indicator">
                    <Typography variant="caption" className="audio-off-icon">
                      🔇
                    </Typography>
                  </Box>
                )}

                <Box className="video-overlay">
                  {/* Only show crown for local user (current user), not for remote participants */}
                  {participant.isHost && isHost && (
                    <Box className="host-crown">
                      👑
                    </Box>
                  )}
                  <Box className="participant-name-container">
                    <Typography variant="body1" className={`participant-name ${participant.isHost ? 'host' : 'participant'}`}>
                    {participant.name || 'Participant'}
                  </Typography>
                    
                    {/* Debug info for remove button - REDUCED LOGGING */}
                    {/* {console.log(`🗑️ DEBUG: Remove button conditions for ${participant.name}:`, {
                      isHost,
                      hasOnRemoveParticipant: !!onRemoveParticipant,
                      participantId: participant.id,
                      participantName: participant.name
                    })} */}
                    
                    {/* Remove participant button - only show for host */}
                    {isHost && onRemoveParticipant && (
                      <IconButton
                        className="remove-participant-button-inline"
                        onClick={() => {
                          console.log('🗑️ Remove button clicked for:', participant.name, participant.id);
                          console.log('🗑️ onRemoveParticipant function:', onRemoveParticipant);
                          console.log('🗑️ isHost:', isHost);
                          const confirmed = window.confirm(`Remove ${participant.name} from the meeting?`);
                          if (confirmed) {
                            console.log('🗑️ Confirmed removal, calling onRemoveParticipant');
                            onRemoveParticipant(participant.id, participant.name);
                          } else {
                            console.log('🗑️ Removal cancelled by user');
                          }
                        }}
                        size="small"
                        style={{
                          color: '#ffffff',
                          backgroundColor: '#ff4444',
                          border: '2px solid #ffffff',
                          width: '32px',
                          height: '32px',
                          marginLeft: '8px',
                          boxShadow: '0 4px 12px rgba(255, 68, 68, 0.8)',
                          zIndex: 9999
                        }}
                      >
                        <PersonRemove style={{ fontSize: '14px' }} />
                      </IconButton>
                    )}
                  </Box>
                  
                  {/* Media state indicators */}
                  <Box className="media-status-indicators">
                    {/* Audio indicator */}
                    <Box
                      className={`media-indicator ${participant.audioEnabled === true ? 'audio-enabled' : 'audio-disabled'}`}
                      title={participant.audioEnabled === true ? 'Audio On' : 'Audio Off'}
                    >
                      <Typography variant="caption" className="media-indicator-icon">
                        {participant.audioEnabled === true ? '🎤' : '🔇'}
                      </Typography>
                    </Box>
                    
                    {/* Video indicator - only show when camera is on */}
                    {participant.videoEnabled && (
                    <Box
                        className="media-indicator video-enabled"
                        title="Camera On"
                    >
                      <Typography variant="caption" className="media-indicator-icon">
                          📹
                      </Typography>
                    </Box>
                    )}
                  </Box>
                  
                  {/* Debug info for media state */}
                  {console.log(`🎥 UltraSimpleVideo: Participant ${participant.name} media state:`, {
                    audioEnabled: participant.audioEnabled,
                    videoEnabled: participant.videoEnabled,
                    id: participant.id
                  })}
                </Box>
              </Box>
            ))}
            
            {/* Remote streams without participant info */}
            {Object.keys(remoteStreams).map(streamId => {
              const hasParticipant = otherParticipants.some(p => p.id === streamId);
              if (hasParticipant) return null;
              
              return (
                <Box 
                  key={streamId}
                  className={`video-item ${totalVideos > 2 ? 'video-item-scrollable' : ''}`}>
                  <video
                    ref={(el) => {
                      if (el) {
                        remoteVideoRefs.current[streamId] = el;
                      }
                    }}
                    autoPlay
                    playsInline
                    className="video-element"
                  />
                  <Box className="video-overlay">
                    <Typography variant="body1" className="participant-name participant">
                      Remote Participant
                    </Typography>
                  </Box>
                </Box>
              );
            })}
            
            
      </Box>

      {/* Debug Panel */}
      {debugPanelOpen && (
        <Paper className="debug-panel open">
          {/* Debug Panel Header */}
          <Box className="debug-panel-header">
            <Typography variant="h6" className="debug-panel-title">
              <BugReport /> Connection Tools
            </Typography>
            <Typography variant="body2" style={{ color: '#FF6B35', marginTop: '4px' }}>
              All Videos: {document.querySelectorAll('video').length}
            </Typography>
            <IconButton 
              className="debug-panel-close"
              onClick={() => setDebugPanelOpen(false)}
            >
              <Close />
            </IconButton>
          </Box>

          {/* Connection Buttons */}
          <Box className="debug-section">
            <Typography variant="subtitle2" className="debug-section-title">
              Media & Connection Actions
            </Typography>
            
            <button 
              className="debug-button"
              onClick={async () => {
                console.log('🎥 INIT: Manually initializing media...');
                console.log('🎥 INIT: Current local stream:', localStream);
                console.log('🎥 INIT: Current local video ref:', localVideoRef.current);
                
                try {
                  if (initializeMedia) {
                    console.log('🎥 INIT: Calling initializeMedia function...');
                    await initializeMedia();
                    console.log('🎥 INIT: Media initialization completed');
                  } else {
                    console.log('🎥 INIT: initializeMedia function not available');
                  }
                } catch (error) {
                  console.error('🎥 INIT: Media initialization failed:', error);
                }
              }}
            >
              🎥 Initialize Media
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🧪 TEST: Forcing WebRTC connection test');
                console.log('🧪 TEST: Local stream:', localStream);
                console.log('🧪 TEST: Remote streams:', remoteStreams);
                console.log('🧪 TEST: Participants:', participants);
                console.log('🧪 TEST: Socket connected:', !!window.socket);
                console.log('🧪 TEST: Socket ID:', window.socket?.id);
                
                // Test socket communication
                if (window.socket) {
                  console.log('🧪 TEST: Emitting test event...');
                  window.socket.emit('ping', { test: 'connection test' });
                  
                  // Test participant-ready event
                  console.log('🧪 TEST: Emitting participant-ready test...');
                  window.socket.emit('participant-ready', { 
                    meetingId: '123',
                    participantId: currentUserId,
                    streamId: localStream?.id || 'test-stream'
                  });
                }
                
                // Test force connection
                if (forceConnection) {
                  console.log('🧪 TEST: Calling forceConnection...');
                  forceConnection();
                }
              }}
            >
              🧪 Test Connection
            </button>

            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔗 FORCE: Forcing connection to all participants...');
                if (forceConnection) {
                  forceConnection();
                }
              }}
            >
              🔗 Force Connection
            </button>

            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔄 REFRESH: Refreshing all streams...');
                console.log('🔄 REFRESH: Local stream:', localStream);
                console.log('🔄 REFRESH: Remote streams:', remoteStreams);
                console.log('🔄 REFRESH: Participants:', participants);
                
                // Force re-render of video elements
                Object.keys(remoteVideoRefs.current).forEach(participantId => {
                  const videoEl = remoteVideoRefs.current[participantId];
                  if (videoEl && remoteStreams[participantId]) {
                    console.log(`🔄 REFRESH: Refreshing video for ${participantId}`);
                    videoEl.srcObject = remoteStreams[participantId];
                    videoEl.load();
                  }
                });
                
                // Refresh local video
                if (localVideoRef.current && localStream) {
                  console.log('🔄 REFRESH: Refreshing local video');
                  localVideoRef.current.srcObject = localStream;
                  localVideoRef.current.load();
                }
              }}
            >
              🔄 Refresh Streams
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('📡 TEST: Testing media state change...');
                console.log('📡 TEST: Current participants:', otherParticipants.map(p => ({
                  id: p.id,
                  name: p.name,
                  audioEnabled: p.audioEnabled,
                  videoEnabled: p.videoEnabled
                })));
                
                // Force a re-render to test if the UI updates
                setForceRender(prev => prev + 1);
                console.log('📡 TEST: Forced re-render triggered');
              }}
            >
              📡 Test Media State
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🗑️ TEST: Testing remove participant functionality...');
                console.log('🗑️ TEST: Current participants:', otherParticipants.map(p => ({
                  id: p.id,
                  name: p.name,
                  isHost: p.isHost
                })));
                console.log('🗑️ TEST: onRemoveParticipant function:', !!onRemoveParticipant);
                console.log('🗑️ TEST: isHost:', isHost);
                
                // Test the remove participant function if available
                if (onRemoveParticipant && otherParticipants.length > 0) {
                  const testParticipant = otherParticipants[0];
                  console.log('🗑️ TEST: Testing remove participant for:', testParticipant.name);
                  onRemoveParticipant(testParticipant.id, testParticipant.name);
                } else {
                  console.log('🗑️ TEST: Cannot test remove participant - no function or participants');
                }
              }}
            >
              🗑️ Test Remove Participant
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('📹 FIX: Force fixing camera mirroring...');
                const allVideos = document.querySelectorAll('video');
                
                console.log(`📹 FIX: Found ${allVideos.length} total videos`);
                
                // Fix camera videos - mirror like a mirror
                allVideos.forEach((video, index) => {
                  console.log(`📹 FIX: Fixing camera video ${index + 1}`);
                  video.style.setProperty('transform', 'scaleX(-1)', 'important');
                  video.style.setProperty('-webkit-transform', 'scaleX(-1)', 'important');
                  video.style.setProperty('object-fit', 'cover', 'important');
                  video.style.setProperty('background', 'transparent', 'important');
                  video.style.setProperty('width', '100%', 'important');
                  video.style.setProperty('height', '100%', 'important');
                  console.log(`📹 FIX: Applied camera mirroring to video ${index + 1}`);
                });
                
                setForceRender(prev => prev + 1);
                console.log('📹 FIX: Camera mirroring fix completed');
              }}
            >
              📹 Fix Camera Mirroring
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('📱 FIX: Force updating media states...');
                console.log('📱 FIX: Current participants media state:');
                otherParticipants.forEach(participant => {
                  console.log(`📱 FIX: - ${participant.name}: Audio=${participant.audioEnabled}, Video=${participant.videoEnabled}`);
                });
                
                // Force re-render to update media states
                setForceRender(prev => prev + 1);
                
                // Force hide videos for participants with camera off
                otherParticipants.forEach(participant => {
                  if (!participant.videoEnabled) {
                    const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
                    if (videoElement) {
                      videoElement.style.setProperty('display', 'none', 'important');
                      videoElement.style.setProperty('visibility', 'hidden', 'important');
                      videoElement.style.setProperty('opacity', '0', 'important');
                      videoElement.style.setProperty('pointer-events', 'none', 'important');
                      console.log(`📱 FIX: Hidden video for ${participant.name} (camera off)`);
                    }
                  }
                });
                
                console.log('📱 FIX: Media state update completed');
              }}
            >
              📱 Fix Media States
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🎥 FIX: Force hiding all camera-off videos...');
                const allVideos = document.querySelectorAll('video');
                console.log(`🎥 FIX: Found ${allVideos.length} total video elements`);
                
                allVideos.forEach((video, index) => {
                  const participantId = video.getAttribute('data-participant-id');
                  if (participantId) {
                    const participant = otherParticipants.find(p => p.id === participantId);
                    if (participant && !participant.videoEnabled) {
                      console.log(`🎥 FIX: Force hiding video for ${participant.name} (camera off)`);
                      video.style.setProperty('display', 'none', 'important');
                      video.style.setProperty('visibility', 'hidden', 'important');
                      video.style.setProperty('opacity', '0', 'important');
                      video.style.setProperty('pointer-events', 'none', 'important');
                      video.style.setProperty('z-index', '-1', 'important');
                    }
                  }
                });
                
                // Force re-render
                setForceRender(prev => prev + 1);
                console.log('🎥 FIX: Force hide completed');
              }}
            >
              🎥 Force Hide Camera-Off Videos
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔗 GENTLE FIX: Checking host stream sharing...');
                console.log('🔗 GENTLE FIX: Current local stream:', localStream);
                console.log('🔗 GENTLE FIX: Current remote streams:', Object.keys(remoteStreams));
                console.log('🔗 GENTLE FIX: Current participants:', otherParticipants.map(p => ({ id: p.id, name: p.name })));
                
                // GENTLE: Only try connection once if needed
                if (forceConnection && otherParticipants.length > 0) {
                  console.log('🔗 GENTLE FIX: Attempting gentle connection to participants...');
                  otherParticipants.forEach(participant => {
                    console.log(`🔗 GENTLE FIX: Connecting to ${participant.name} (${participant.id})`);
                    forceConnection(participant.id);
                  });
                }
                
                // Force re-render
                setForceRender(prev => prev + 1);
                console.log('🔗 GENTLE FIX: Gentle connection attempt completed');
              }}
            >
              🔗 Gentle Share Host Stream
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔗 GENTLE CONNECTION: Testing gentle connection approach...');
                console.log('🔗 GENTLE CONNECTION: Current state:', {
                  isHost,
                  hasLocalStream: !!localStream,
                  localStreamActive: localStream?.active,
                  participantsCount: otherParticipants.length,
                  remoteStreamsCount: Object.keys(remoteStreams).length
                });
                
                // Test if we need to create connections
                if (createConnectionsToAllParticipants && otherParticipants.length > 0) {
                  console.log('🔗 GENTLE CONNECTION: Attempting to create connections to all participants...');
                  createConnectionsToAllParticipants().then(() => {
                    console.log('🔗 GENTLE CONNECTION: Connection creation completed');
                  }).catch(error => {
                    console.log('🔗 GENTLE CONNECTION: Connection creation failed:', error);
                  });
                } else {
                  console.log('🔗 GENTLE CONNECTION: No participants to connect to or function not available');
                }
              }}
            >
              🔗 Test Gentle Connection
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔍 STREAM ANALYSIS: Analyzing current stream state...');
                console.log('🔍 STREAM ANALYSIS: Local stream analysis:', {
                  exists: !!localStream,
                  active: localStream?.active,
                  id: localStream?.id,
                  tracks: localStream?.getTracks()?.length,
                  videoTracks: localStream?.getVideoTracks()?.length,
                  audioTracks: localStream?.getAudioTracks()?.length
                });
                
                console.log('🔍 STREAM ANALYSIS: Remote streams analysis:');
                Object.keys(remoteStreams).forEach(participantId => {
                  const stream = remoteStreams[participantId];
                  const participant = otherParticipants.find(p => p.id === participantId);
                  console.log(`🔍 STREAM ANALYSIS: ${participant?.name || participantId}:`, {
                    exists: !!stream,
                    active: stream?.active,
                    id: stream?.id,
                    tracks: stream?.getTracks()?.length,
                    videoTracks: stream?.getVideoTracks()?.length,
                    audioTracks: stream?.getAudioTracks()?.length
                  });
                });
                
                console.log('🔍 STREAM ANALYSIS: Video elements analysis:');
                const allVideos = document.querySelectorAll('video');
                allVideos.forEach((video, index) => {
                  const participantId = video.getAttribute('data-participant-id');
                  const isLocal = video.getAttribute('data-local') === 'true';
                  console.log(`🔍 STREAM ANALYSIS: Video ${index + 1} (${isLocal ? 'LOCAL' : participantId}):`, {
                    hasSrcObject: !!video.srcObject,
                    srcObjectId: video.srcObject?.id,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    paused: video.paused,
                    muted: video.muted
                  });
                });
              }}
            >
              🔍 Analyze Streams
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔍 GENTLE DEBUG: Using hook debug function...');
                if (debugConnectionStatus) {
                  debugConnectionStatus();
                } else {
                  console.log('🔍 GENTLE DEBUG: Debug function not available');
                }
              }}
            >
              🔍 Gentle Debug (Hook)
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔍 CONNECTION DEBUG: Checking connection status...');
                console.log('🔍 CONNECTION DEBUG: Local stream status:', {
                  hasStream: !!localStream,
                  streamActive: localStream?.active,
                  trackCount: localStream?.getTracks()?.length,
                  videoTracks: localStream?.getVideoTracks()?.length,
                  audioTracks: localStream?.getAudioTracks()?.length
                });
                console.log('🔍 CONNECTION DEBUG: Remote streams:', Object.keys(remoteStreams));
                console.log('🔍 CONNECTION DEBUG: Participants:', otherParticipants.map(p => ({
                  id: p.id,
                  name: p.name,
                  isHost: p.isHost,
                  isApproved: p.isApproved
                })));
                console.log('🔍 CONNECTION DEBUG: Total video elements:', document.querySelectorAll('video').length);
                console.log('🔍 CONNECTION DEBUG: Video elements with srcObject:', 
                  Array.from(document.querySelectorAll('video')).filter(v => v.srcObject).length
                );
                
                // Check if we can see each other
                console.log('🔍 CONNECTION DEBUG: Checking if participants can see each other...');
                otherParticipants.forEach(participant => {
                  const videoElement = document.querySelector(`video[data-participant-id="${participant.id}"]`);
                  const hasStream = !!remoteStreams[participant.id];
                  const hasVideoElement = !!videoElement;
                  const videoHasSrcObject = videoElement?.srcObject;
                  
                  console.log(`🔍 CONNECTION DEBUG: ${participant.name}:`, {
                    hasStream,
                    hasVideoElement,
                    videoHasSrcObject,
                    streamActive: remoteStreams[participant.id]?.active,
                    streamTracks: remoteStreams[participant.id]?.getTracks()?.length
                  });
                });
              }}
            >
              🔍 Debug Connection Status
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔊 AUDIO DEBUG: Checking audio status...');
                console.log('🔊 AUDIO DEBUG: Local stream:', localStream);
                console.log('🔊 AUDIO DEBUG: Remote streams:', Object.keys(remoteStreams));
                
                // Check local audio
                if (localStream) {
                  const audioTracks = localStream.getAudioTracks();
                  console.log('🔊 AUDIO DEBUG: Local audio tracks:', audioTracks.length);
                  audioTracks.forEach((track, index) => {
                    console.log(`🔊 AUDIO DEBUG: Local audio track ${index}:`, {
                      enabled: track.enabled,
                      muted: track.muted,
                      readyState: track.readyState,
                      label: track.label
                    });
                  });
                }
                
                // Check remote audio
                Object.keys(remoteStreams).forEach(participantId => {
                  const stream = remoteStreams[participantId];
                  if (stream) {
                    const audioTracks = stream.getAudioTracks();
                    console.log(`🔊 AUDIO DEBUG: Remote audio tracks for ${participantId}:`, audioTracks.length);
                    audioTracks.forEach((track, index) => {
                      console.log(`🔊 AUDIO DEBUG: Remote audio track ${index} for ${participantId}:`, {
                        enabled: track.enabled,
                        muted: track.muted,
                        readyState: track.readyState,
                        label: track.label
                      });
                    });
                  }
                });
                
                // Check audio elements
                console.log('🔊 AUDIO DEBUG: Audio elements:');
                Object.keys(remoteAudioRefs.current).forEach(participantId => {
                  const audioEl = remoteAudioRefs.current[participantId];
                  if (audioEl) {
                    console.log(`🔊 AUDIO DEBUG: Audio element for ${participantId}:`, {
                      muted: audioEl.muted,
                      volume: audioEl.volume,
                      autoplay: audioEl.autoplay,
                      playsInline: audioEl.playsInline,
                      srcObject: !!audioEl.srcObject,
                      paused: audioEl.paused,
                      currentTime: audioEl.currentTime
                    });
                  }
                });
                
                // Check video elements audio
                console.log('🔊 AUDIO DEBUG: Video elements audio:');
                Object.keys(remoteVideoRefs.current).forEach(participantId => {
                  const videoEl = remoteVideoRefs.current[participantId];
                  if (videoEl) {
                    console.log(`🔊 AUDIO DEBUG: Video element for ${participantId}:`, {
                      muted: videoEl.muted,
                      volume: videoEl.volume,
                      autoplay: videoEl.autoplay,
                      playsInline: videoEl.playsInline,
                      srcObject: !!videoEl.srcObject,
                      paused: videoEl.paused,
                      currentTime: videoEl.currentTime
                    });
                  }
                });
              }}
            >
              🔊 Debug Audio Status
            </button>
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🔊 FIX AUDIO: Force enabling audio for all participants...');
                
                // Force enable audio for all video elements
                Object.keys(remoteVideoRefs.current).forEach(participantId => {
                  const videoEl = remoteVideoRefs.current[participantId];
                  if (videoEl) {
                    console.log(`🔊 FIX AUDIO: Fixing video element for ${participantId}`);
                    videoEl.muted = false;
                    videoEl.volume = 1.0;
                    videoEl.autoplay = true;
                    videoEl.playsInline = true;
                    
                    // Force play
                    videoEl.play().catch(err => {
                      console.log(`🔊 FIX AUDIO: Video play failed for ${participantId}:`, err);
                    });
                  }
                });
                
                // Force enable audio for all audio elements
                Object.keys(remoteAudioRefs.current).forEach(participantId => {
                  const audioEl = remoteAudioRefs.current[participantId];
                  if (audioEl) {
                    console.log(`🔊 FIX AUDIO: Fixing audio element for ${participantId}`);
                    audioEl.muted = false;
                    audioEl.volume = 1.0;
                    audioEl.autoplay = true;
                    audioEl.playsInline = true;
                    
                    // Force play
                    audioEl.play().catch(err => {
                      console.log(`🔊 FIX AUDIO: Audio play failed for ${participantId}:`, err);
                    });
                  }
                });
                
                // Force enable audio tracks in streams
                Object.keys(remoteStreams).forEach(participantId => {
                  const stream = remoteStreams[participantId];
                  if (stream) {
                    const audioTracks = stream.getAudioTracks();
                    audioTracks.forEach((track, index) => {
                      if (!track.enabled) {
                        track.enabled = true;
                        console.log(`🔊 FIX AUDIO: Enabled audio track ${index} for ${participantId}`);
                      }
                      if (track.muted) {
                        // Note: muted property is read-only in newer browsers
                        console.log(`🔊 FIX AUDIO: Unmuted audio track ${index} for ${participantId}`);
                      }
                    });
                  }
                });
                
                console.log('🔊 FIX AUDIO: Audio fix completed');
              }}
            >
              🔊 Fix Audio Issues
            </button>
            
            
            <button 
              className="debug-button"
              onClick={() => {
                console.log('🎥 FIX HOST VIDEO: Force making host video visible in participant browser...');
                
                // Find ALL video elements in the DOM
                const allVideos = document.querySelectorAll('video');
                console.log(`🎥 FIX HOST VIDEO: Found ${allVideos.length} total video elements`);
                
                allVideos.forEach((video, index) => {
                  console.log(`🎥 FIX HOST VIDEO: Video ${index}:`, {
                    hasSrcObject: !!video.srcObject,
                    srcObjectId: video.srcObject?.id,
                    display: video.style.display,
                    visibility: video.style.visibility,
                    opacity: video.style.opacity,
                    paused: video.paused,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight
                  });
                  
                  // FORCE all video elements to be visible and playing
                  video.style.display = 'block';
                  video.style.visibility = 'visible';
                  video.style.opacity = '1';
                  video.style.position = 'relative';
                  video.style.zIndex = '999';
                  video.style.width = '100%';
                  video.style.height = '100%';
                  
                  // Conservative play attempt
                  video.play().catch(err => console.log(`🎥 FIX HOST VIDEO: Play failed for video ${index}:`, err));
                  
                  console.log(`🎥 FIX HOST VIDEO: Applied fixes to video ${index}`);
                });
                
                // Also force through refs
                Object.keys(remoteVideoRefs.current).forEach(participantId => {
                  const videoElement = remoteVideoRefs.current[participantId];
                  const stream = remoteStreams[participantId];
                  
                  if (videoElement && stream) {
                    console.log(`🎥 FIX HOST VIDEO: Force fixing video for ${participantId}`);
                    videoElement.srcObject = stream;
                    videoElement.style.display = 'block';
                    videoElement.style.visibility = 'visible';
                    videoElement.style.opacity = '1';
                    videoElement.style.position = 'relative';
                    videoElement.style.zIndex = '999';
                    videoElement.style.width = '100%';
                    videoElement.style.height = '100%';
                    
                    // Conservative play attempt
                    videoElement.play().catch(() => {});
                  }
                });
                
                // Force local video if it exists
                if (localVideoRef.current && localStream) {
                  console.log('🎥 FIX HOST VIDEO: Force fixing local video');
                  localVideoRef.current.srcObject = localStream;
                  localVideoRef.current.style.display = 'block';
                  localVideoRef.current.style.visibility = 'visible';
                  localVideoRef.current.style.opacity = '1';
                  localVideoRef.current.style.position = 'relative';
                  localVideoRef.current.style.zIndex = '999';
                  localVideoRef.current.style.width = '100%';
                  localVideoRef.current.style.height = '100%';
                  
                  // Conservative play attempt
                  localVideoRef.current.play().catch(() => {});
                }
                
                console.log('🎥 FIX HOST VIDEO: Host video fix completed!');
              }}
            >
              🎥 Fix Host Video Stream
            </button>
            
            {/* Individual Remove Buttons for Testing */}
            {otherParticipants.map(participant => (
              <button 
                key={`test-remove-${participant.id}`}
                className="debug-button"
                onClick={() => {
                  console.log('🗑️ TEST: Direct removal test for:', participant.name);
                  if (onRemoveParticipant) {
                    onRemoveParticipant(participant.id, participant.name);
                  }
                }}
                style={{ 
                  backgroundColor: '#ff4444', 
                  color: 'white',
                  margin: '2px',
                  fontSize: '12px',
                  padding: '4px 8px'
                }}
              >
                🗑️ Remove {participant.name}
              </button>
            ))}
            
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default UltraSimpleVideo;