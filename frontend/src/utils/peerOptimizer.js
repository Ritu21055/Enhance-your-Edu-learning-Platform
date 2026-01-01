/**
 * Peer Connection Optimizer
 * Ensures smooth video calls with 3+ participants
 * - No lag
 * - Proper audio transmission
 * - Stable connections
 */

export class PeerOptimizer {
  /**
   * Get optimized quality settings based on participant count
   */
  static getQualitySettings(participantCount, isHost = false) {
    // OPTIMIZED: Lower bitrates for real-time performance (reduced from 2Mbps to 400-500kbps)
    if (isHost) {
      if (participantCount === 1) {
        return {
          videoWidth: 640,
          videoHeight: 480,
          frameRate: 20, // Reduced from 30
          videoBitrate: 500000 // 500 kbps - reduced from 2 Mbps
        };
      } else if (participantCount === 2) {
        return {
          videoWidth: 640,
          videoHeight: 480,
          frameRate: 15, // Reduced from 18 to 15 for smoother performance
          videoBitrate: 350000 // 350 kbps - reduced from 400 kbps
        };
      } else if (participantCount <= 4) {
        return {
          videoWidth: 480,
          videoHeight: 360,
          frameRate: 18, // Reduced from 24
          videoBitrate: 350000 // 350 kbps - reduced from 1 Mbps
        };
      } else if (participantCount <= 6) {
        return {
          videoWidth: 480,
          videoHeight: 360,
          frameRate: 15,
          videoBitrate: 300000 // 300 kbps - reduced from 800 kbps
        };
      } else {
        return {
          videoWidth: 360,
          videoHeight: 270,
          frameRate: 15,
          videoBitrate: 250000 // 250 kbps - reduced from 600 kbps
        };
      }
    }
    
    // Participants get standard quality
    if (participantCount === 1) {
      return {
        videoWidth: 640,
        videoHeight: 480,
        frameRate: 20, // Reduced from 25
        videoBitrate: 500000 // 500 kbps - reduced from 1.5 Mbps
      };
    } else if (participantCount === 2) {
      return {
        videoWidth: 640,
        videoHeight: 480,
        frameRate: 15, // Reduced from 18 to 15 for smoother performance
        videoBitrate: 350000 // 350 kbps - reduced from 400 kbps
      };
    } else if (participantCount <= 4) {
      return {
        videoWidth: 480,
        videoHeight: 360,
        frameRate: 18, // Reduced from 22
        videoBitrate: 350000 // 350 kbps - reduced from 700 kbps
      };
    } else if (participantCount <= 6) {
      return {
        videoWidth: 480,
        videoHeight: 360,
        frameRate: 15,
        videoBitrate: 300000 // 300 kbps - reduced from 600 kbps
      };
    } else {
      // 7+ participants - lowest quality
      return {
        videoWidth: 360,
        videoHeight: 270,
        frameRate: 15,
        videoBitrate: 250000 // 250 kbps - reduced from 500 kbps
      };
    }
  }

  /**
   * Get optimized video constraints
   */
  static getVideoConstraints(participantCount, isHost = false) {
    const quality = this.getQualitySettings(participantCount, isHost);
    return {
      width: { ideal: quality.videoWidth, max: quality.videoWidth },
      height: { ideal: quality.videoHeight, max: quality.videoHeight },
      frameRate: { ideal: quality.frameRate, max: quality.frameRate },
      facingMode: 'user',
      latency: 0.1
    };
  }

  /**
   * Get optimized audio constraints
   */
  static getAudioConstraints() {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 16000, // Balanced for performance and quality
      channelCount: 1,
      latency: 0.1 // Balanced latency
    };
  }

  /**
   * Get optimized peer connection config
   */
  static getPeerConfig() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 3, // Lower for better performance
      bundlePolicy: 'max-bundle', // Optimize for multiple streams
      rtcpMuxPolicy: 'require' // Reduce connections
    };
  }

  /**
   * Ensure audio tracks are enabled in stream
   */
  static ensureAudioEnabled(stream, participantId = 'unknown') {
    if (!stream) return false;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn(`⚠️ PeerOptimizer: No audio tracks found for ${participantId}`);
      return false;
    }

    let allEnabled = true;
    audioTracks.forEach((track, index) => {
      if (!track.enabled) {
        track.enabled = true;
        allEnabled = false;
        console.log(`🔊 PeerOptimizer: Enabled audio track ${index} for ${participantId}`);
      }
    });

    return allEnabled;
  }

  /**
   * Verify and fix audio in peer connection
   */
  static verifyAudioInPeerConnection(peer, participantId) {
    if (!peer || !peer._pc) return false;

    const senders = peer._pc.getSenders();
    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

    if (!audioSender || !audioSender.track) {
      console.warn(`⚠️ PeerOptimizer: No audio sender found for ${participantId}`);
      return false;
    }

    if (!audioSender.track.enabled) {
      audioSender.track.enabled = true;
      console.log(`🔊 PeerOptimizer: Enabled audio track in sender for ${participantId}`);
    }

    return true;
  }

  /**
   * Apply bitrate constraints to RTCRtpSender
   */
  static async applySenderBitrate(sender, videoTrack, participantId) {
    if (!sender || !sender.setParameters) return;

    const targetBitrate = videoTrack?._targetBitrate || 400000; // Default 400 kbps (reduced from 500)
    const targetFrameRate = videoTrack?._targetFrameRate || 18; // Default 18 fps

    try {
      const params = sender.getParameters();
      if (!params.encodings) {
        params.encodings = [{}];
      }
      
      params.encodings[0].maxBitrate = targetBitrate;
      params.encodings[0].maxFramerate = targetFrameRate;
      params.encodings[0].priority = 'high';
      params.encodings[0].networkPriority = 'high';
      
      await sender.setParameters(params);
      console.log(`✅ PeerOptimizer: Applied bitrate ${targetBitrate / 1000} kbps @ ${targetFrameRate} fps for ${participantId}`);
    } catch (error) {
      console.warn(`⚠️ PeerOptimizer: Could not set bitrate for ${participantId}:`, error);
    }
  }

  /**
   * Apply audio priority and constraints to RTCRtpSender for smooth playback
   * OPTIMIZED: Sets high priority for audio to prevent lag
   */
  static async applyAudioPriority(sender, participantId) {
    if (!sender || !sender.setParameters) return;

    try {
      const params = sender.getParameters();
      if (!params.encodings) {
        params.encodings = [{}];
      }
      
      // OPTIMIZED: Set audio priority to high for smooth playback
      params.encodings[0].priority = 'high';
      params.encodings[0].networkPriority = 'high';
      
      await sender.setParameters(params);
    } catch (error) {
      // Silent fail - audio priority is optional
    }
  }
}

export default PeerOptimizer;

