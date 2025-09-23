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
   * Generate intelligent highlight reel from full recording and highlight timestamps
   * @param {string} fullRecordingPath - Path to the full meeting recording
   * @param {Array} highlightTimestamps - Array of highlight timestamp objects with conversation analysis
   * @param {string} outputPath - Path where the highlight reel should be saved
   * @param {Object} meetingInfo - Meeting information (title, participants, etc.)
   * @returns {Promise<string>} Path to the generated highlight reel
   */
  async generateHighlightReel(fullRecordingPath, highlightTimestamps, outputPath, meetingInfo = {}) {
    try {
      console.log('🎬 Starting intelligent highlight reel generation...');
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

      // Sort highlights by importance and timestamp
      const sortedHighlights = this.sortHighlightsByImportance(highlightTimestamps);
      
      // Create intelligent clips with context-aware duration
      const clipFiles = [];
      const transitionFiles = [];

      for (let i = 0; i < sortedHighlights.length; i++) {
        const highlight = sortedHighlights[i];
        const clipPath = path.join(this.tempDir, `highlight_${i}_${highlight.id}.mp4`);
        
        // Calculate intelligent duration based on highlight type and importance
        const duration = this.calculateIntelligentDuration(highlight);
        const startTime = Math.max(0, (highlight.timestamp - (duration * 1000 / 2)) / 1000);
        
        console.log(`✂️ Extracting intelligent clip ${i + 1}/${sortedHighlights.length}: ${startTime}s - ${startTime + duration}s (${highlight.type})`);
        
        await this.extractVideoSegmentWithContext(fullRecordingPath, clipPath, startTime, duration, highlight);
        clipFiles.push(clipPath);

        // Create transition between clips (except for last one)
        if (i < sortedHighlights.length - 1) {
          const transitionPath = path.join(this.tempDir, `transition_${i}.mp4`);
          await this.createTransitionClip(transitionPath, highlight, sortedHighlights[i + 1]);
          transitionFiles.push(transitionPath);
        }
      }

      // Create professional intro
      const introPath = path.join(this.tempDir, `intro_${Date.now()}.mp4`);
      await this.createIntroClip(introPath, meetingInfo, sortedHighlights.length);

      // Create professional outro
      const outroPath = path.join(this.tempDir, `outro_${Date.now()}.mp4`);
      await this.createOutroClip(outroPath, meetingInfo, sortedHighlights.length);

      // Combine all clips with transitions
      const allClips = [introPath, ...clipFiles.flatMap((clip, i) => [clip, ...(transitionFiles[i] ? [transitionFiles[i]] : [])]), outroPath];
      
      // Create file list for FFmpeg concatenation
      const fileListPath = path.join(this.tempDir, `filelist_${Date.now()}.txt`);
      const fileListContent = allClips.map(file => `file '${file}'`).join('\n');
      await fs.writeFile(fileListPath, fileListContent);

      // Create final highlight reel with professional formatting
      console.log('🎬 Creating professional highlight reel...');
      await this.createProfessionalHighlightReel(fileListPath, outputPath, meetingInfo);

      // Clean up temporary files
      await this.cleanupTempFiles([...allClips, fileListPath]);

      console.log('✅ Professional highlight reel generated successfully:', outputPath);
      return outputPath;

    } catch (error) {
      console.error('❌ Error generating highlight reel:', error);
      throw error;
    }
  }

  /**
   * Sort highlights by importance and chronological order
   * @param {Array} highlights - Array of highlight objects
   * @returns {Array} Sorted highlights
   */
  sortHighlightsByImportance(highlights) {
    return highlights.sort((a, b) => {
      // First sort by priority (high > medium > low)
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      const aPriority = priorityOrder[a.priority] || 1;
      const bPriority = priorityOrder[b.priority] || 1;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // Then sort by importance score
      if (a.importanceScore !== b.importanceScore) {
        return (b.importanceScore || 0) - (a.importanceScore || 0);
      }
      
      // Finally sort by timestamp
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Calculate intelligent duration based on highlight type and importance
   * @param {Object} highlight - Highlight object with type and importance
   * @returns {number} Duration in seconds
   */
  calculateIntelligentDuration(highlight) {
    const baseDuration = 10; // Base 10 seconds
    let duration = baseDuration;
    
    // Adjust based on highlight type
    switch (highlight.type) {
      case 'decision':
        duration = 20; // Decisions need more context
        break;
      case 'problem':
        duration = 25; // Problems need full context
        break;
      case 'solution':
        duration = 20; // Solutions need context
        break;
      case 'action':
        duration = 15; // Actions need context
        break;
      case 'urgent':
        duration = 15; // Urgent matters need context
        break;
      case 'emotional':
        duration = 12; // Emotional moments need context
        break;
      default:
        duration = 10;
    }
    
    // Adjust based on importance score
    if (highlight.importanceScore > 0.8) {
      duration += 5; // Very important moments get more time
    } else if (highlight.importanceScore > 0.6) {
      duration += 3; // Important moments get some extra time
    }
    
    // Adjust based on priority
    if (highlight.priority === 'high') {
      duration += 5;
    } else if (highlight.priority === 'medium') {
      duration += 2;
    }
    
    return Math.min(duration, 30); // Cap at 30 seconds
  }

  /**
   * Extract video segment with context-aware processing and intelligent audio/video handling
   * @param {string} inputPath - Input video file path
   * @param {string} outputPath - Output clip file path
   * @param {number} startTime - Start time in seconds
   * @param {number} duration - Duration in seconds
   * @param {Object} highlight - Highlight object with context
   */
  async extractVideoSegmentWithContext(inputPath, outputPath, startTime, duration, highlight) {
    return new Promise((resolve, reject) => {
      // Create overlay text for the highlight
      const overlayText = this.createHighlightOverlay(highlight);
      
      // Check if input has video and audio
      const hasVideo = highlight.hasVideo !== false; // Default to true if not specified
      const hasAudio = highlight.hasAudio !== false; // Default to true if not specified
      
      let ffmpegArgs = [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
        '-avoid_negative_ts', 'make_zero'
      ];
      
      // Handle video encoding
      if (hasVideo) {
        ffmpegArgs.push('-c:v', 'libx264');
        // Add video overlay
        ffmpegArgs.push('-vf', `drawtext=text='${overlayText}':fontsize=20:fontcolor=white:x=20:y=20:box=1:boxcolor=black@0.7`);
      } else {
        // Audio-only: create video with audio waveform visualization
        ffmpegArgs.push('-c:v', 'libx264');
        ffmpegArgs.push('-vf', `color=c=#2c3e50:size=1280x720,drawtext=text='${overlayText}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=100:box=1:boxcolor=black@0.8,drawtext=text='Audio Only':fontsize=18:fontcolor=white:x=(w-text_w)/2:y=150:box=1:boxcolor=black@0.6`);
      }
      
      // Handle audio encoding
      if (hasAudio) {
        ffmpegArgs.push('-c:a', 'aac');
      } else {
        // Video-only: add silent audio track
        ffmpegArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-c:a', 'aac');
      }
      
      ffmpegArgs.push('-y', outputPath);
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Extracted segment: ${hasVideo ? 'video+audio' : 'audio-only'} - ${startTime}s to ${startTime + duration}s`);
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
   * Create overlay text for highlight
   * @param {Object} highlight - Highlight object
   * @returns {string} Overlay text
   */
  createHighlightOverlay(highlight) {
    const typeEmojis = {
      'decision': '🎯',
      'problem': '⚠️',
      'solution': '💡',
      'action': '✅',
      'urgent': '🚨',
      'emotional': '😊',
      'discussion': '💬'
    };
    
    const emoji = typeEmojis[highlight.type] || '⭐';
    const priority = highlight.priority === 'high' ? 'HIGH PRIORITY' : 
                    highlight.priority === 'medium' ? 'MEDIUM PRIORITY' : 'LOW PRIORITY';
    
    return `${emoji} ${priority} - ${highlight.description || highlight.type.toUpperCase()}`;
  }

  /**
   * Create transition clip between highlights
   * @param {string} outputPath - Output transition clip path
   * @param {Object} currentHighlight - Current highlight
   * @param {Object} nextHighlight - Next highlight
   */
  async createTransitionClip(outputPath, currentHighlight, nextHighlight) {
    return new Promise((resolve, reject) => {
      const transitionText = `Next: ${nextHighlight.description || nextHighlight.type}`;
      
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'color=c=#2c3e50:size=1280x720:duration=2:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=800:duration=2',
        '-vf', `drawtext=text='${transitionText}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.8`,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-y',
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
          reject(new Error(`FFmpeg transition creation failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Create professional intro clip
   * @param {string} outputPath - Output intro clip path
   * @param {Object} meetingInfo - Meeting information
   * @param {number} highlightCount - Number of highlights
   */
  async createIntroClip(outputPath, meetingInfo, highlightCount) {
    return new Promise((resolve, reject) => {
      const title = meetingInfo.title || 'Meeting Highlights';
      const date = new Date().toLocaleDateString();
      const introText = `${title}\\n${date}\\n${highlightCount} Important Moments`;
      
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'color=c=#34495e:size=1280x720:duration=5:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=1000:duration=5',
        '-vf', `drawtext=text='${introText}':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.8`,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-y',
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
          reject(new Error(`FFmpeg intro creation failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Create professional outro clip
   * @param {string} outputPath - Output outro clip path
   * @param {Object} meetingInfo - Meeting information
   * @param {number} highlightCount - Number of highlights
   */
  async createOutroClip(outputPath, meetingInfo, highlightCount) {
    return new Promise((resolve, reject) => {
      const outroText = `Meeting Highlights Complete\\n${highlightCount} Important Moments Captured\\nThank you for watching!`;
      
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'color=c=#2c3e50:size=1280x720:duration=3:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=1200:duration=3',
        '-vf', `drawtext=text='${outroText}':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.8`,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-y',
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
          reject(new Error(`FFmpeg outro creation failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  /**
   * Create professional highlight reel with final processing
   * @param {string} fileListPath - Path to file list
   * @param {string} outputPath - Final output path
   * @param {Object} meetingInfo - Meeting information
   */
  async createProfessionalHighlightReel(fileListPath, outputPath, meetingInfo) {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', fileListPath,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'medium', // Better quality for final output
        '-crf', '20', // Higher quality
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
          resolve();
        } else {
          reject(new Error(`FFmpeg final processing failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
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
      console.log('🎬 Creating realistic meeting test video...');
      
      // Create a more realistic test video that looks like a meeting
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=#1a1a1a:size=1280x720:duration=${duration}:rate=30`,
        '-f', 'lavfi',
        '-i', `sine=frequency=1000:duration=${duration}`,
        '-vf', `drawtext=text='Meeting Recording':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=100:box=1:boxcolor=black@0.8,drawtext=text='Real Meeting Content':fontsize=20:fontcolor=white:x=(w-text_w)/2:y=150:box=1:boxcolor=black@0.6,drawtext=text='Duration: ${Math.round(duration)}s':fontsize=16:fontcolor=white:x=(w-text_w)/2:y=200:box=1:boxcolor=black@0.4`,
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
          console.log('✅ Realistic test video created successfully:', outputPath);
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
