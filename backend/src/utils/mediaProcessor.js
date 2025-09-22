import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Media Processor Utility for AI-Generated Meeting Highlights
 * Handles video processing using FFmpeg for creating highlight reels
 */
class MediaProcessor {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.outputDir = path.join(__dirname, '../../output');
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
      console.log('📁 Media processor directories ensured');
    } catch (error) {
      console.error('❌ Error creating directories:', error);
    }
  }

  /**
   * Generate highlight reel from full recording and highlight timestamps
   * @param {string} fullRecordingPath - Path to the full meeting recording
   * @param {Array} highlightTimestamps - Array of highlight timestamp objects
   * @param {string} outputPath - Path where the highlight reel should be saved
   * @returns {Promise<string>} Path to the generated highlight reel
   */
  async generateHighlightReel(fullRecordingPath, highlightTimestamps, outputPath) {
    try {
      console.log('🎬 Starting highlight reel generation...');
      console.log('📹 Full recording:', fullRecordingPath);
      console.log('⭐ Highlights:', highlightTimestamps.length);
      console.log('💾 Output path:', outputPath);

      if (!highlightTimestamps || highlightTimestamps.length === 0) {
        throw new Error('No highlight timestamps provided');
      }

      // Check if full recording exists
      try {
        await fs.access(fullRecordingPath);
      } catch (error) {
        throw new Error(`Full recording file not found: ${fullRecordingPath}`);
      }

      // Create temporary files for individual clips
      const clipFiles = [];
      const segmentDuration = 15; // 15 seconds per highlight

      for (let i = 0; i < highlightTimestamps.length; i++) {
        const highlight = highlightTimestamps[i];
        const clipPath = path.join(this.tempDir, `highlight_${i}_${highlight.id}.mp4`);
        
        // Calculate start time (7.5 seconds before highlight, 7.5 seconds after)
        const startTime = Math.max(0, (highlight.timestamp - 7500) / 1000);
        
        console.log(`✂️ Extracting clip ${i + 1}/${highlightTimestamps.length}: ${startTime}s - ${startTime + segmentDuration}s`);
        
        await this.extractVideoSegment(fullRecordingPath, clipPath, startTime, segmentDuration);
        clipFiles.push(clipPath);
      }

      // Create file list for FFmpeg concatenation
      const fileListPath = path.join(this.tempDir, `filelist_${Date.now()}.txt`);
      const fileListContent = clipFiles.map(file => `file '${file}'`).join('\n');
      await fs.writeFile(fileListPath, fileListContent);

      // Concatenate all clips into final highlight reel
      console.log('🔗 Concatenating clips into highlight reel...');
      await this.concatenateVideos(fileListPath, outputPath);

      // Clean up temporary files
      await this.cleanupTempFiles([...clipFiles, fileListPath]);

      console.log('✅ Highlight reel generated successfully:', outputPath);
      return outputPath;

    } catch (error) {
      console.error('❌ Error generating highlight reel:', error);
      throw error;
    }
  }

  /**
   * Extract a video segment using FFmpeg with enhanced quality
   * @param {string} inputPath - Input video file path
   * @param {string} outputPath - Output clip file path
   * @param {number} startTime - Start time in seconds
   * @param {number} duration - Duration in seconds
   */
  async extractVideoSegment(inputPath, outputPath, startTime, duration) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-c:v', 'libx264', // Use H.264 for better compatibility
        '-c:a', 'aac', // Use AAC for better audio quality
        '-preset', 'fast', // Fast encoding
        '-crf', '23', // High quality
        '-movflags', '+faststart', // Optimize for streaming
        '-avoid_negative_ts', 'make_zero',
        '-y', // Overwrite output file
        outputPath
      ]);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg extraction failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Concatenate multiple video files using FFmpeg
   * @param {string} fileListPath - Path to file containing list of video files
   * @param {string} outputPath - Output concatenated video path
   */
  async concatenateVideos(fileListPath, outputPath) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', fileListPath,
        '-c', 'copy', // Copy without re-encoding for speed
        '-y', // Overwrite output file
        outputPath
      ]);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg concatenation failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Clean up temporary files
   * @param {Array<string>} filePaths - Array of file paths to delete
   */
  async cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log('🗑️ Cleaned up temp file:', filePath);
      } catch (error) {
        console.warn('⚠️ Could not delete temp file:', filePath, error.message);
      }
    }
  }

  /**
   * Get video duration using FFmpeg
   * @param {string} videoPath - Path to video file
   * @returns {Promise<number>} Duration in seconds
   */
  async getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        videoPath
      ]);

      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(output.trim());
          resolve(duration);
        } else {
          reject(new Error(`FFprobe failed with code ${code}`));
        }
      });

      ffprobe.on('error', (error) => {
        reject(new Error(`FFprobe spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Check if FFmpeg is available on the system
   * @returns {Promise<boolean>} True if FFmpeg is available
   */
  async isFFmpegAvailable() {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);

      ffmpeg.on('close', (code) => {
        resolve(code === 0);
      });

      ffmpeg.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Create a test video with actual content for demonstration
   * @param {string} outputPath - Path where the test video should be saved
   * @param {number} duration - Duration in seconds
   * @returns {Promise<string>} Path to the created test video
   */
  async createTestVideo(outputPath, duration = 60) {
    return new Promise((resolve, reject) => {
      console.log('🎬 Creating test video with actual content...');
      
      // Create a more realistic test video that looks like a meeting
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
         '-i', `color=c=#2c3e50:size=1280x720:duration=${duration}:rate=30`,
        '-f', 'lavfi',
        '-i', `sine=frequency=800:duration=${duration}`,
        '-vf', 'drawtext=text="Enhance Your Edu-Learning System":fontsize=24:fontcolor=white:x=(w-text_w)/2:y=100:box=1:boxcolor=black@0.8,drawtext=text="Meeting Highlights":fontsize=20:fontcolor=white:x=(w-text_w)/2:y=150:box=1:boxcolor=black@0.6,drawtext=text="Important Moments Captured":fontsize=16:fontcolor=white:x=(w-text_w)/2:y=200:box=1:boxcolor=black@0.4',
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
          console.log('✅ Test video created successfully:', outputPath);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg test video creation failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Create a simple colored video for testing (fallback when FFmpeg filters fail)
   * @param {string} outputPath - Path where the test video should be saved
   * @param {number} duration - Duration in seconds
   * @returns {Promise<string>} Path to the created test video
   */
  async createSimpleTestVideo(outputPath, duration = 60) {
    return new Promise((resolve, reject) => {
      console.log('🎬 Creating simple test video...');
      
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=blue:size=1280x720:duration=${duration}:rate=30`,
        '-f', 'lavfi',
        '-i', `sine=frequency=1000:duration=${duration}`,
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
          console.log('✅ Simple test video created successfully:', outputPath);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg simple test video creation failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Generate a mock highlight reel for testing (when FFmpeg is not available)
   * @param {string} meetingId - Meeting ID
   * @param {Array} highlightTimestamps - Array of highlight timestamps
   * @returns {Promise<string>} Path to mock highlight reel
   */
  async generateMockHighlightReel(meetingId, highlightTimestamps) {
    console.log('🎭 Generating mock highlight reel (FFmpeg not available)');
    
    const outputPath = path.join(this.outputDir, `highlight_reel_${meetingId}_${Date.now()}.mp4`);
    
    // Try to create a simple test video instead of just a text file
    try {
      const testVideoPath = await this.createTestVideo(outputPath, highlightTimestamps.length * 15);
      console.log('🎭 Mock highlight reel created as test video:', testVideoPath);
      return testVideoPath;
    } catch (error) {
      console.log('🎭 Could not create test video with text, trying simple video');
      try {
        const simpleVideoPath = await this.createSimpleTestVideo(outputPath, highlightTimestamps.length * 15);
        console.log('🎭 Mock highlight reel created as simple test video:', simpleVideoPath);
        return simpleVideoPath;
      } catch (simpleError) {
        console.log('🎭 Could not create any test video, falling back to text file');
        
        // Create a simple text file as a placeholder
        const mockContent = `Mock Highlight Reel for Meeting ${meetingId}
Generated: ${new Date().toISOString()}
Highlights: ${highlightTimestamps.length}
Duration: ${highlightTimestamps.length * 15} seconds

Highlight Timestamps:
${highlightTimestamps.map((h, i) => `${i + 1}. ${new Date(h.timestamp).toISOString()} - ${h.participantId}`).join('\n')}

Note: This is a mock file. Install FFmpeg for actual video processing.
`;
        
        await fs.writeFile(outputPath.replace('.mp4', '.txt'), mockContent);
        
        console.log('🎭 Mock highlight reel created:', outputPath.replace('.mp4', '.txt'));
        return outputPath.replace('.mp4', '.txt');
      }
    }
  }
}

// Create and export singleton instance
const mediaProcessor = new MediaProcessor();
export default mediaProcessor;
