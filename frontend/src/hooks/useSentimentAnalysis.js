import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';

const useSentimentAnalysis = (videoRef, socket, meetingId, participantId) => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentSentiment, setCurrentSentiment] = useState(null);
  const [error, setError] = useState(null);
  
  const analysisIntervalRef = useRef(null);
  const canvasRef = useRef(null);

  // Load face-api.js models
  const loadModels = useCallback(async () => {
    try {
      console.log('🧠 Loading face-api.js models...');
      console.log('📁 Model path: /models');
      
      // Test if models are accessible first
      const testResponse = await fetch('/models/tiny_face_detector_model-weights_manifest.json');
      if (!testResponse.ok) {
        throw new Error(`Models not accessible: ${testResponse.status} ${testResponse.statusText}`);
      }
      console.log('✅ Model files are accessible');
      
      // Load all required models with individual error handling
      console.log('🧠 Loading tinyFaceDetector...');
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
      console.log('✅ tinyFaceDetector loaded');
      
      console.log('🧠 Loading faceLandmark68Net...');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
      console.log('✅ faceLandmark68Net loaded');
      
      console.log('🧠 Loading faceRecognitionNet...');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
      console.log('✅ faceRecognitionNet loaded');
      
      console.log('🧠 Loading faceExpressionNet...');
      await faceapi.nets.faceExpressionNet.loadFromUri('/models');
      console.log('✅ faceExpressionNet loaded');
      
      console.log('✅ All face-api.js models loaded successfully');
      setModelsLoaded(true);
      setError(null);
    } catch (err) {
      console.error('❌ Failed to load face-api.js models:', err);
      console.error('❌ Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      setError(`Failed to load AI models: ${err.message}`);
    }
  }, []);

  // Analyze video frame for sentiment (optimized)
  const analyzeSentiment = useCallback(async () => {
    if (!videoRef?.current || !modelsLoaded || !canvasRef.current) {
      console.log('🧠 Sentiment analysis skipped:', {
        hasVideo: !!videoRef?.current,
        modelsLoaded,
        hasCanvas: !!canvasRef.current
      });
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Check if video is ready
      if (video.readyState < 2) {
        console.log('🧠 Video not ready, skipping analysis');
        return;
      }

      // ENHANCED: Multiple validation checks to prevent canvas errors
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.log('🧠 Video has zero dimensions, skipping analysis');
        return;
      }

      if (video.offsetWidth === 0 || video.offsetHeight === 0) {
        console.log('🧠 Video element has zero display dimensions, skipping analysis');
        return;
      }

      // ENHANCED: Check if video is actually playing and has content
      if (video.paused || video.ended) {
        console.log('🧠 Video is paused or ended, skipping analysis');
        return;
      }

      // ENHANCED: Check if video has been loaded enough
      if (video.readyState < 2) {
        console.log('🧠 Video not ready (readyState < 2), skipping analysis');
        return;
      }

      // ENHANCED: Check if video has a valid source
      if (!video.srcObject && !video.src) {
        console.log('🧠 Video has no source, skipping analysis');
        return;
      }

      // Optimize canvas size for faster processing
      const maxSize = 320; // Limit canvas size for better performance
      const aspectRatio = video.videoWidth / video.videoHeight;
      let canvasWidth, canvasHeight;
      
      if (aspectRatio > 1) {
        canvasWidth = Math.min(maxSize, video.videoWidth);
        canvasHeight = canvasWidth / aspectRatio;
      } else {
        canvasHeight = Math.min(maxSize, video.videoHeight);
        canvasWidth = canvasHeight * aspectRatio;
      }

      // ENHANCED: Ensure canvas dimensions are valid
      if (canvasWidth <= 0 || canvasHeight <= 0) {
        console.log('🧠 Invalid canvas dimensions, skipping analysis');
        return;
      }

      // ENHANCED: Additional validation before canvas operations
      if (!ctx) {
        console.log('🧠 Canvas context not available, skipping analysis');
        return;
      }

      // ENHANCED: Try-catch around canvas operations
      try {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Draw current video frame to canvas with optimized size
        ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);
      } catch (canvasError) {
        console.log('🧠 Canvas operation failed, skipping analysis:', canvasError.message);
        return;
      }

      // Use more sensitive face detection options for better detection
      const detectionOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320, // Larger input size for better detection
        scoreThreshold: 0.3 // Lower threshold to catch more faces
      });

      console.log('🧠 Analyzing video frame for sentiment...');
      
      // CRITICAL: Wrap face-api.js processing in try-catch to prevent canvas errors
      let detections = [];
      try {
        // Detect faces and expressions with optimized options
        detections = await faceapi
          .detectAllFaces(canvas, detectionOptions)
          .withFaceLandmarks()
          .withFaceExpressions();
      } catch (faceApiError) {
        console.log('🧠 Face-api.js error (likely canvas dimension issue):', faceApiError.message);
        console.log('🧠 Skipping sentiment analysis for this frame');
        return; // Skip this analysis cycle
      }

      console.log('🧠 Face detections found:', detections.length);
      console.log('🧠 Video dimensions:', { width: video.videoWidth, height: video.videoHeight });
      console.log('🧠 Canvas dimensions:', { width: canvas.width, height: canvas.height });

      if (detections.length > 0) {
        // Get the first face (assuming single participant)
        const face = detections[0];
        const expressions = face.expressions;

        // Only process if confidence is above threshold
        const maxConfidence = Math.max(...Object.values(expressions));
        console.log('🧠 Expression confidences:', expressions);
        console.log('🧠 Max confidence:', maxConfidence);
        
        if (maxConfidence < 0.2) {
          console.log('🧠 Skipping low-confidence detection:', maxConfidence);
          return; // Skip low-confidence detections
        }

        // Determine dominant emotion
        // Basic emotions from face-api.js
        const basicEmotions = {
          neutral: expressions.neutral,
          happy: expressions.happy,
          sad: expressions.sad,
          angry: expressions.angry,
          fearful: expressions.fearful,
          disgusted: expressions.disgusted,
          surprised: expressions.surprised
        };

        // Enhanced emotion interpretation based on context and combinations
        const enhancedEmotions = {
          ...basicEmotions,
          // Interpret neutral + low confidence as bored/tired
          bored: expressions.neutral > 0.7 && maxConfidence < 0.6 ? expressions.neutral * 0.8 : 0,
          tired: expressions.neutral > 0.6 && expressions.sad > 0.3 ? (expressions.neutral + expressions.sad) / 2 : 0,
          // Interpret confused as surprised + fearful combination
          confused: expressions.surprised > 0.4 && expressions.fearful > 0.3 ? (expressions.surprised + expressions.fearful) / 2 : 0,
          // Interpret frustrated as angry + sad combination
          frustrated: expressions.angry > 0.4 && expressions.sad > 0.3 ? (expressions.angry + expressions.sad) / 2 : 0,
          // Interpret annoyed as angry + disgusted combination
          annoyed: expressions.angry > 0.3 && expressions.disgusted > 0.3 ? (expressions.angry + expressions.disgusted) / 2 : 0,
          // Interpret worried as fearful + sad combination
          worried: expressions.fearful > 0.4 && expressions.sad > 0.3 ? (expressions.fearful + expressions.sad) / 2 : 0,
          // Interpret stressed as fearful + angry combination
          stressed: expressions.fearful > 0.3 && expressions.angry > 0.3 ? (expressions.fearful + expressions.angry) / 2 : 0
        };

        const emotions = enhancedEmotions;

        // Find the emotion with highest confidence
        const dominantEmotion = Object.keys(emotions).reduce((a, b) => 
          emotions[a] > emotions[b] ? a : b
        );

        console.log('🧠 Emotion scores:', emotions);
        console.log('🧠 Dominant emotion:', dominantEmotion, 'confidence:', emotions[dominantEmotion]);

        const sentimentData = {
          emotion: dominantEmotion,
          confidence: emotions[dominantEmotion],
          emotions,
          timestamp: Date.now(),
          participantId
        };

        setCurrentSentiment(sentimentData);

        // Send sentiment data to server (throttled)
        if (socket && meetingId) {
          socket.emit('sentiment_update', {
            meetingId,
            participantId,
            sentimentData
          });
        }

        console.log('😊 Sentiment analysis result:', sentimentData);
      } else {
        console.log('🧠 No faces detected in current frame');
        
        // Send neutral sentiment when no faces detected
        const neutralSentimentData = {
          emotion: 'neutral',
          sentiment: 'neutral',
          confidence: 0.5,
          emotions: {
            neutral: 0.5,
            happy: 0.1,
            sad: 0.1,
            angry: 0.1,
            fearful: 0.1,
            disgusted: 0.1,
            surprised: 0.1,
            bored: 0.0,
            tired: 0.0,
            confused: 0.0,
            frustrated: 0.0,
            annoyed: 0.0,
            worried: 0.0,
            stressed: 0.0
          },
          timestamp: Date.now(),
          participantId
        };

        setCurrentSentiment(neutralSentimentData);

        // Send neutral sentiment to server
        if (socket && meetingId) {
          socket.emit('sentiment_update', {
            meetingId,
            participantId,
            sentimentData: neutralSentimentData
          });
        }

        console.log('😊 Sent neutral sentiment (no face detected):', neutralSentimentData);
      }
    } catch (err) {
      console.error('❌ Sentiment analysis error:', err);
    }
  }, [videoRef, modelsLoaded, socket, meetingId, participantId]);

  // Start sentiment analysis
  const startAnalysis = useCallback(() => {
    if (isAnalyzing || !modelsLoaded) return;

    // CRITICAL: Check if video is available and has valid dimensions
    if (!videoRef?.current) {
      console.log('🧠 Cannot start sentiment analysis: No video reference');
      return;
    }

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('🧠 Cannot start sentiment analysis: Video has zero dimensions');
      return;
    }

    if (video.offsetWidth === 0 || video.offsetHeight === 0) {
      console.log('🧠 Cannot start sentiment analysis: Video element has zero display dimensions');
      return;
    }

    console.log('🎬 Starting sentiment analysis...');
    setIsAnalyzing(true);

    // Create canvas for analysis
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    // ENHANCED: Add delay to let video elements stabilize before starting analysis
    setTimeout(() => {
      console.log('🧠 Starting sentiment analysis after stabilization delay...');
      // Analyze every 2 seconds for more responsive updates
      analysisIntervalRef.current = setInterval(analyzeSentiment, 2000);
    }, 3000); // 3 second delay to let videos stabilize
    
    // Also send an initial neutral sentiment to test the system
    setTimeout(() => {
      console.log('🧠 Sending initial test sentiment...');
      const testSentimentData = {
        emotion: 'neutral',
        sentiment: 'neutral',
        confidence: 0.5,
        emotions: {
          neutral: 0.5,
          happy: 0.1,
          sad: 0.1,
          angry: 0.1,
          fearful: 0.1,
          disgusted: 0.1,
          surprised: 0.1,
          bored: 0.0,
          tired: 0.0,
          confused: 0.0,
          frustrated: 0.0,
          annoyed: 0.0,
          worried: 0.0,
          stressed: 0.0
        },
        timestamp: Date.now(),
        participantId
      };

      setCurrentSentiment(testSentimentData);

      if (socket && meetingId) {
        socket.emit('sentiment_update', {
          meetingId,
          participantId,
          sentimentData: testSentimentData
        });
      }

      console.log('🧠 Sent initial test sentiment:', testSentimentData);
    }, 1000);
  }, [isAnalyzing, modelsLoaded, analyzeSentiment, socket, meetingId, participantId]);

  // Stop sentiment analysis
  const stopAnalysis = useCallback(() => {
    if (!isAnalyzing) return;

    console.log('⏹️ Stopping sentiment analysis...');
    setIsAnalyzing(false);

    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }
  }, [isAnalyzing]);

  // Load models on mount
  useEffect(() => {
    console.log('🧠 useSentimentAnalysis: Loading models on mount...');
    loadModels();
  }, [loadModels]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnalysis();
    };
  }, [stopAnalysis]);

  return {
    modelsLoaded,
    isAnalyzing,
    currentSentiment,
    error,
    startAnalysis,
    stopAnalysis
  };
};

export default useSentimentAnalysis;
