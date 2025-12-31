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
    // Host gets better quality to prevent lag
    if (isHost) {
      if (participantCount === 1) {
        return {
          videoWidth: 960,
          videoHeight: 540,
          frameRate: 30,
          videoBitrate: 2000000 // 2 Mbps - higher for host
        };
      } else if (participantCount === 2) {
        return {
          videoWidth: 640,
          videoHeight: 480,
          frameRate: 25,
          videoBitrate: 1200000 // 1.2 Mbps - higher for host
        };
      } else if (participantCount <= 4) {
        return {
          videoWidth: 640,
          videoHeight: 480,
          frameRate: 24,
          videoBitrate: 1000000 // 1 Mbps - higher for host to prevent lag
        };
      } else if (participantCount <= 6) {
        return {
          videoWidth: 480,
          videoHeight: 360,
          frameRate: 20,
          videoBitrate: 800000 // 800 kbps
        };
      } else {
        return {
          videoWidth: 480,
          videoHeight: 360,
          frameRate: 18,
          videoBitrate: 600000 // 600 kbps
        };
      }
    }
    
    // Participants get standard quality
    if (participantCount === 1) {
      return {
        videoWidth: 960,
        videoHeight: 540,
        frameRate: 25,
        videoBitrate: 1500000 // 1.5 Mbps
      };
    } else if (participantCount === 2) {
      return {
        videoWidth: 640,
        videoHeight: 480,
        frameRate: 24,
        videoBitrate: 800000 // 800 kbps - increased from 600
      };
    } else if (participantCount <= 4) {
      // 3-4 participants - increased quality to prevent lag
      return {
        videoWidth: 640,
        videoHeight: 480,
        frameRate: 22,
        videoBitrate: 700000 // 700 kbps - increased from 500 to prevent lag
      };
    } else if (participantCount <= 6) {
      return {
        videoWidth: 480,
        videoHeight: 360,
        frameRate: 20,
        videoBitrate: 600000 // 600 kbps - increased from 400
      };
    } else {
      // 7+ participants - lowest quality
      return {
        videoWidth: 360,
        videoHeight: 270,
        frameRate: 18,
        videoBitrate: 500000 // 500 kbps - increased from 300
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

    const targetBitrate = videoTrack?._targetBitrate || 500000; // Default 500 kbps
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

