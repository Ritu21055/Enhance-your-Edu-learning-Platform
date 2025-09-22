import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Media Recorder Service for Real-Time Meeting Recording
 * Handles WebRTC stream recording and storage
 */
class MediaRecorder {
  constructor() {
    this.recordings = new Map(); // meetingId -> recording session
    this.recordingDir = path.join(__dirname, '../../recordings');
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.recordingDir, { recursive: true });
      console.log('📁 Media recording directory ensured:', this.recordingDir);
    } catch (error) {
      console.error('❌ Failed to create recording directory:', error);
    }
  }

  /**
   * Start recording a meeting
   * @param {string} meetingId - Meeting identifier
   * @param {Object} options - Recording options
   * @returns {Promise<string>} Recording session ID
   */
  async startRecording(meetingId, options = {}) {
    try {
      console.log('🎬 Starting recording for meeting:', meetingId);
      
      const sessionId = `recording_${meetingId}_${Date.now()}`;
      const recordingPath = path.join(this.recordingDir, `${sessionId}.webm`);
      
      const recordingSession = {
        meetingId,
        sessionId,
        recordingPath,
        startTime: Date.now(),
        isRecording: true,
        options: {
          video: true,
          audio: true,
          quality: 'high',
          ...options
        }
      };

      this.recordings.set(meetingId, recordingSession);
      
      console.log('✅ Recording session started:', sessionId);
      return sessionId;
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording a meeting
   * @param {string} meetingId - Meeting identifier
   * @returns {Promise<string>} Path to the recorded file
   */
  async stopRecording(meetingId) {
    try {
      console.log('🛑 Stopping recording for meeting:', meetingId);
      
      const recordingSession = this.recordings.get(meetingId);
      if (!recordingSession) {
        throw new Error(`No active recording found for meeting: ${meetingId}`);
      }

      recordingSession.isRecording = false;
      recordingSession.endTime = Date.now();
      recordingSession.duration = recordingSession.endTime - recordingSession.startTime;

      // For now, create a placeholder MP4 file since we don't have real WebRTC recording yet
      const mp4Path = recordingSession.recordingPath.replace('.webm', '.mp4');
      
      // Create a simple test video as placeholder
      await this.createPlaceholderRecording(mp4Path, recordingSession.duration);

      console.log('✅ Recording stopped and converted:', mp4Path);
      return mp4Path;
      
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      throw error;
    }
  }

  /**
   * Create a placeholder recording file for testing
   * @param {string} outputPath - Output file path
   * @param {number} duration - Duration in milliseconds
   */
  async createPlaceholderRecording(outputPath, duration) {
    return new Promise((resolve, reject) => {
      console.log('🎬 Creating placeholder recording...');
      
      const durationSeconds = Math.max(10, Math.min(300, duration / 1000)); // 10 seconds to 5 minutes
      
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=#2c3e50:size=1280x720:duration=${durationSeconds}:rate=30`,
        '-f', 'lavfi',
        '-i', `sine=frequency=800:duration=${durationSeconds}`,
        '-vf', 'drawtext=text="Meeting Recording":fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.7',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Placeholder recording created:', outputPath);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg placeholder creation failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Convert WebM recording to MP4 for better compatibility
   * @param {string} inputPath - Input WebM file path
   * @param {string} outputPath - Output MP4 file path
   */
  async convertToMP4(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      console.log('🔄 Converting WebM to MP4...');
      
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ]);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log('✅ WebM to MP4 conversion completed');
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg conversion failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Add audio chunk to recording
   * @param {string} meetingId - Meeting identifier
   * @param {Buffer} audioChunk - Audio data chunk
   */
  async addAudioChunk(meetingId, audioChunk) {
    const recordingSession = this.recordings.get(meetingId);
    if (!recordingSession || !recordingSession.isRecording) {
      return;
    }

    try {
      // In a real implementation, this would append to the recording file
      // For now, we'll simulate the process
      console.log('🎤 Adding audio chunk to recording:', meetingId, audioChunk.length, 'bytes');
    } catch (error) {
      console.error('❌ Failed to add audio chunk:', error);
    }
  }

  /**
   * Add video frame to recording
   * @param {string} meetingId - Meeting identifier
   * @param {Buffer} videoFrame - Video frame data
   */
  async addVideoFrame(meetingId, videoFrame) {
    const recordingSession = this.recordings.get(meetingId);
    if (!recordingSession || !recordingSession.isRecording) {
      return;
    }

    try {
      // In a real implementation, this would append to the recording file
      // For now, we'll simulate the process
      console.log('📹 Adding video frame to recording:', meetingId, videoFrame.length, 'bytes');
    } catch (error) {
      console.error('❌ Failed to add video frame:', error);
    }
  }

  /**
   * Get recording session info
   * @param {string} meetingId - Meeting identifier
   * @returns {Object|null} Recording session info
   */
  getRecordingSession(meetingId) {
    return this.recordings.get(meetingId) || null;
  }

  /**
   * Check if a meeting is being recorded
   * @param {string} meetingId - Meeting identifier
   * @returns {boolean} True if recording is active
   */
  isRecording(meetingId) {
    const session = this.recordings.get(meetingId);
    return session ? session.isRecording : false;
  }

  /**
   * Clean up recording session
   * @param {string} meetingId - Meeting identifier
   */
  async cleanupRecording(meetingId) {
    const recordingSession = this.recordings.get(meetingId);
    if (recordingSession) {
      this.recordings.delete(meetingId);
      console.log('🧹 Recording session cleaned up:', meetingId);
    }
  }

  /**
   * Get all active recordings
   * @returns {Array} List of active recording sessions
   */
  getActiveRecordings() {
    return Array.from(this.recordings.values()).filter(session => session.isRecording);
  }
}

// Create and export singleton instance
const mediaRecorder = new MediaRecorder();
export default mediaRecorder;
