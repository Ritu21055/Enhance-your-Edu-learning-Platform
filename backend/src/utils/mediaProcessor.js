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
   * Check if a media file has video and/or audio streams
   * @param {string} inputPath - Input media file path
   * @returns {Promise<Object>} Object with hasVideo and hasAudio flags
   */
  async checkMediaStreams(inputPath) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_type',
        '-of', 'default=noprint_wrappers=1',
        inputPath
      ]);

      let hasVideo = false;
      let hasAudio = false;
      let errorOutput = '';

      ffprobe.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('codec_type=video')) {
          hasVideo = true;
        }
      });

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffprobe.on('close', (code) => {
        // Check audio stream
        const ffprobeAudio = spawn('ffprobe', [
          '-v', 'error',
          '-select_streams', 'a:0',
          '-show_entries', 'stream=codec_type',
          '-of', 'default=noprint_wrappers=1',
          inputPath
        ]);

        let audioOutput = '';
        ffprobeAudio.stdout.on('data', (data) => {
          audioOutput += data.toString();
        });

        ffprobeAudio.on('close', (audioCode) => {
          if (audioOutput.includes('codec_type=audio')) {
            hasAudio = true;
          }

          // If both checks failed, try a simpler check
          if (!hasVideo && !hasAudio && code === 0 && audioCode === 0) {
            // Default to both available if probe succeeded but found nothing (might be a probe issue)
            console.log('⚠️ Could not detect streams, assuming both available');
            hasVideo = true;
            hasAudio = true;
          }

          resolve({ hasVideo, hasAudio });
        });

        ffprobeAudio.on('error', () => {
          // If ffprobe fails, assume both are available
          resolve({ hasVideo: true, hasAudio: true });
        });
      });

      ffprobe.on('error', () => {
        // If ffprobe fails, assume both are available
        resolve({ hasVideo: true, hasAudio: true });
      });
    });
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
    return new Promise(async (resolve, reject) => {
      try {
        // Check what streams are actually available in the recording
        const streamInfo = await this.checkMediaStreams(inputPath);
        const recordingHasVideo = streamInfo.hasVideo;
        const recordingHasAudio = streamInfo.hasAudio;

        console.log(`📹 Stream detection for segment: video=${recordingHasVideo}, audio=${recordingHasAudio}`);

        // Use recording stream info, but respect highlight flags if explicitly set
        const hasVideo = highlight.hasVideo === false ? false : recordingHasVideo;
        const hasAudio = highlight.hasAudio === false ? false : recordingHasAudio;

      // Create overlay text for the highlight
      const overlayText = this.createHighlightOverlay(highlight);
      
      // Enhanced overlay with participant information
      const participantInfo = highlight.participantId ? `Participant: ${highlight.participantId}` : 'Meeting Discussion';
      const highlightType = highlight.type || 'Important Moment';
      
        // Build FFmpeg command based on available streams
        let ffmpegArgs = [];
        
        if (hasVideo && recordingHasVideo && hasAudio && recordingHasAudio) {
          // Both video and audio available - use both
          ffmpegArgs = [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
            '-map', '0:v', // Map video stream
            '-map', '0:a?', // Map audio stream (optional)
            '-c:v', 'libx264',
            '-vf', this.createEnhancedHighlightOverlay(highlight, overlayText, participantInfo, highlightType),
            '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '23',
        '-movflags', '+faststart',
            '-avoid_negative_ts', 'make_zero',
            '-y', outputPath
          ];
        } else if (hasVideo && recordingHasVideo && !hasAudio) {
          // Video-only: use video with silent audio track
          ffmpegArgs = [
            '-i', inputPath,
            '-ss', startTime.toString(),
            '-t', duration.toString(),
            '-f', 'lavfi',
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
            '-map', '0:v', // Map video stream
            '-map', '1:a', // Map silent audio
            '-c:v', 'libx264',
            '-vf', this.createEnhancedHighlightOverlay(highlight, overlayText, participantInfo, highlightType),
            '-c:a', 'aac',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            '-shortest', // Ensure output duration matches shortest input
            '-y', outputPath
          ];
        } else if (hasAudio && recordingHasAudio && !hasVideo) {
          // Audio-only: create video with audio
          // Extract just the overlay filters (without the color filter since we're providing it separately)
          const overlayFilters = this.createAudioOnlyOverlay(highlight, overlayText, participantInfo, highlightType)
            .replace('color=c=#2c3e50:size=1280x720,', ''); // Remove color filter as it's provided by lavfi
          
          ffmpegArgs = [
            '-f', 'lavfi',
            '-i', `color=c=#2c3e50:size=1280x720:duration=${duration}:rate=30`,
            '-ss', startTime.toString(),
            '-i', inputPath,
            '-t', duration.toString(),
            '-filter_complex', `[0:v]${overlayFilters}[v]`, // Apply overlay to color background
            '-map', '[v]', // Map processed video
            '-map', '1:a?', // Map audio from recording
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            '-shortest', // Ensure output duration matches shortest input
            '-y', outputPath
          ];
      } else {
          // Fallback: neither video nor audio (shouldn't happen, but handle gracefully)
          ffmpegArgs = [
            '-f', 'lavfi',
            '-i', `color=c=#2c3e50:size=1280x720:duration=${duration}:rate=30`,
            '-f', 'lavfi',
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
            '-map', '0:v',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-vf', this.createAudioOnlyOverlay(highlight, overlayText, participantInfo, highlightType),
            '-c:a', 'aac',
            '-preset', 'fast',
            '-crf', '23',
            '-movflags', '+faststart',
            '-shortest',
            '-y', outputPath
          ];
      }
      
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);

        let errorOutput = '';

        ffmpeg.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            const streamType = hasVideo && recordingHasVideo && hasAudio && recordingHasAudio ? 'video+audio' :
                              hasAudio && recordingHasAudio ? 'audio-only' :
                              hasVideo && recordingHasVideo ? 'video-only' : 'fallback';
            console.log(`✅ Extracted segment (${streamType}): ${startTime}s to ${startTime + duration}s`);
            resolve();
      } else {
            // Try fallback method if initial extraction fails
            console.log('⚠️ Primary extraction failed, trying fallback method...');
            this.extractSegmentFallback(inputPath, outputPath, startTime, duration, highlight, recordingHasVideo, recordingHasAudio)
              .then(resolve)
              .catch(reject);
          }
        });

        ffmpeg.on('error', (error) => {
          reject(new Error(`FFmpeg spawn error: ${error.message}`));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Fallback method for extracting segments when primary method fails
   * @param {string} inputPath - Input file path
   * @param {string} outputPath - Output file path
   * @param {number} startTime - Start time in seconds
   * @param {number} duration - Duration in seconds
   * @param {Object} highlight - Highlight object
   * @param {boolean} hasVideo - Whether video stream exists
   * @param {boolean} hasAudio - Whether audio stream exists
   */
  async extractSegmentFallback(inputPath, outputPath, startTime, duration, highlight, hasVideo, hasAudio) {
    return new Promise((resolve, reject) => {
      const overlayText = this.createHighlightOverlay(highlight);
      const participantInfo = highlight.participantId ? `Participant: ${highlight.participantId}` : 'Meeting Discussion';
      const highlightType = highlight.type || 'Important Moment';

      let ffmpegArgs = [];

      if (hasVideo && hasAudio) {
        // Both available - simpler extraction
        ffmpegArgs = [
          '-ss', startTime.toString(),
          '-i', inputPath,
          '-t', duration.toString(),
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'fast',
          '-crf', '23',
          '-movflags', '+faststart',
          '-y', outputPath
        ];
      } else if (hasVideo && !hasAudio) {
        // Video-only: use video with silent audio
        ffmpegArgs = [
          '-ss', startTime.toString(),
          '-i', inputPath,
          '-t', duration.toString(),
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'fast',
          '-crf', '23',
          '-shortest',
          '-y', outputPath
        ];
      } else if (hasAudio && !hasVideo) {
        // Audio-only: create video with audio
        const overlayFilters = this.createAudioOnlyOverlay(highlight, overlayText, participantInfo, highlightType)
          .replace('color=c=#2c3e50:size=1280x720,', ''); // Remove color filter as it's provided by lavfi
        
        ffmpegArgs = [
          '-f', 'lavfi',
          '-i', `color=c=#2c3e50:size=1280x720:duration=${duration}:rate=30`,
          '-ss', startTime.toString(),
          '-i', inputPath,
          '-t', duration.toString(),
          '-filter_complex', `[0:v]${overlayFilters}[v]`,
          '-map', '[v]',
          '-map', '1:a?',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-preset', 'fast',
          '-crf', '23',
          '-shortest',
          '-y', outputPath
        ];
      } else {
        // Neither available - create placeholder
        ffmpegArgs = [
          '-f', 'lavfi',
          '-i', `color=c=#2c3e50:size=1280x720:duration=${duration}:rate=30`,
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'libx264',
          '-vf', this.createAudioOnlyOverlay(highlight, overlayText, participantInfo, highlightType),
          '-c:a', 'aac',
          '-preset', 'fast',
          '-crf', '23',
          '-shortest',
          '-y', outputPath
        ];
      }
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Extracted segment (fallback): ${startTime}s to ${startTime + duration}s`);
          resolve();
        } else {
          reject(new Error(`FFmpeg fallback extraction failed with code ${code}: ${errorOutput}`));
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
    // Remove emojis for FFmpeg compatibility
    const typeLabels = {
      'decision': '[DECISION]',
      'problem': '[PROBLEM]',
      'solution': '[SOLUTION]',
      'action': '[ACTION]',
      'urgent': '[URGENT]',
      'emotional': '[EMOTIONAL]',
      'discussion': '[DISCUSSION]'
    };
    
    const label = typeLabels[highlight.type] || '[HIGHLIGHT]';
    const priority = highlight.priority === 'high' ? 'HIGH PRIORITY' : 
                    highlight.priority === 'medium' ? 'MEDIUM PRIORITY' : 'LOW PRIORITY';
    
    // Simplify description - remove newlines and limit length
    const description = (highlight.description || highlight.type.toUpperCase())
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 50); // Limit length
    
    return `${label} ${priority} - ${description}`;
  }

  /**
   * Create enhanced highlight overlay with participant information
   * @param {Object} highlight - Highlight object
   * @param {string} overlayText - Main overlay text
   * @param {string} participantInfo - Participant information
   * @param {string} highlightType - Type of highlight
   * @returns {string} FFmpeg video filter string
   */
  createEnhancedHighlightOverlay(highlight, overlayText, participantInfo, highlightType) {
    const timestamp = new Date(highlight.timestamp).toLocaleTimeString();
    const confidence = highlight.importanceScore ? Math.round(highlight.importanceScore * 100) : 0;
    
    // Escape text for FFmpeg drawtext filter
    // FFmpeg drawtext requires text to be wrapped in quotes, and internal quotes/backslashes must be escaped
    const escapeText = (text) => {
      if (!text) return '';
      // Remove or replace problematic characters for FFmpeg
      return String(text)
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/'/g, "\\'")     // Escape single quotes
        .replace(/%/g, '%%')      // Escape percent signs (FFmpeg special)
        .replace(/:/g, '-')       // Replace colons with hyphens (colons break FFmpeg syntax)
        .replace(/\[/g, '(')      // Replace brackets
        .replace(/\]/g, ')');     // Replace brackets
    };
    
    // Simple text escaping for FFmpeg - remove problematic characters
    const escapeTextForFFmpeg = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/\\/g, '')      // Remove backslashes
        .replace(/"/g, "'")       // Replace double quotes with single
        .replace(/%/g, 'pct')     // Replace percent signs
        .replace(/:/g, '-')       // Replace colons with hyphens
        .replace(/\n/g, ' ')      // Replace newlines with spaces
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .trim()
        .substring(0, 50);        // Limit length
    };
    
    const safeType = escapeTextForFFmpeg(highlightType);
    const safeParticipant = escapeTextForFFmpeg(participantInfo);
    const safeOverlay = escapeTextForFFmpeg(overlayText);
    const safeTimestamp = escapeTextForFFmpeg(`Time ${timestamp.replace(/:/g, '-')}`);
    const safeConfidence = escapeTextForFFmpeg(`Confidence ${confidence}pct`);
    
    return `drawtext=text='${safeType}':fontsize=24:fontcolor=white:x=20:y=20:box=1:boxcolor=black@0.8,` +
           `drawtext=text='${safeParticipant}':fontsize=18:fontcolor=white:x=20:y=60:box=1:boxcolor=black@0.6,` +
           `drawtext=text='${safeOverlay}':fontsize=16:fontcolor=white:x=20:y=100:box=1:boxcolor=black@0.4,` +
           `drawtext=text='${safeTimestamp}':fontsize=14:fontcolor=white:x=20:y=140:box=1:boxcolor=black@0.4,` +
           `drawtext=text='${safeConfidence}':fontsize=14:fontcolor=white:x=20:y=170:box=1:boxcolor=black@0.4`;
  }

  /**
   * Create audio-only overlay with participant information
   * @param {Object} highlight - Highlight object
   * @param {string} overlayText - Main overlay text
   * @param {string} participantInfo - Participant information
   * @param {string} highlightType - Type of highlight
   * @returns {string} FFmpeg video filter string
   */
  createAudioOnlyOverlay(highlight, overlayText, participantInfo, highlightType) {
    const timestamp = new Date(highlight.timestamp).toLocaleTimeString();
    const confidence = highlight.importanceScore ? Math.round(highlight.importanceScore * 100) : 0;
    
    // Simple text escaping for FFmpeg - remove problematic characters
    const escapeTextForFFmpeg = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/\\/g, '')      // Remove backslashes
        .replace(/"/g, "'")       // Replace double quotes with single
        .replace(/%/g, 'pct')     // Replace percent signs
        .replace(/:/g, '-')       // Replace colons with hyphens
        .replace(/\n/g, ' ')      // Replace newlines with spaces
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .trim()
        .substring(0, 50);        // Limit length
    };
    
    const safeType = escapeTextForFFmpeg(highlightType);
    const safeParticipant = escapeTextForFFmpeg(participantInfo);
    const safeOverlay = escapeTextForFFmpeg(overlayText);
    const safeTimestamp = escapeTextForFFmpeg(`Time ${timestamp.replace(/:/g, '-')}`);
    const safeConfidence = escapeTextForFFmpeg(`Confidence ${confidence}pct`);
    
    return `color=c=#2c3e50:size=1280x720,` +
           `drawtext=text='${safeType}':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=100:box=1:boxcolor=black@0.8,` +
           `drawtext=text='${safeParticipant}':fontsize=20:fontcolor=white:x=(w-text_w)/2:y=150:box=1:boxcolor=black@0.6,` +
           `drawtext=text='Audio Discussion':fontsize=18:fontcolor=white:x=(w-text_w)/2:y=200:box=1:boxcolor=black@0.6,` +
           `drawtext=text='${safeOverlay}':fontsize=16:fontcolor=white:x=(w-text_w)/2:y=250:box=1:boxcolor=black@0.4,` +
           `drawtext=text='${safeTimestamp}':fontsize=14:fontcolor=white:x=(w-text_w)/2:y=290:box=1:boxcolor=black@0.4,` +
           `drawtext=text='${safeConfidence}':fontsize=14:fontcolor=white:x=(w-text_w)/2:y=320:box=1:boxcolor=black@0.4`;
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
      
      // Simple text escaping for FFmpeg
      const escapeTextForFFmpeg = (text) => {
        if (!text) return '';
        return String(text)
          .replace(/\\/g, '')      // Remove backslashes
          .replace(/"/g, "'")       // Replace double quotes with single
          .replace(/%/g, 'pct')     // Replace percent signs
          .replace(/:/g, '-')       // Replace colons with hyphens
          .replace(/\n/g, ' ')      // Replace newlines with spaces
          .replace(/\s+/g, ' ')     // Normalize whitespace
          .trim()
          .substring(0, 50);        // Limit length
      };
      
      const safeText = escapeTextForFFmpeg(transitionText);
      
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'color=c=#2c3e50:size=1280x720:duration=2:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=800:duration=2',
        '-vf', `drawtext=text='${safeText}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.8`,
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
