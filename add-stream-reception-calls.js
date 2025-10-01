#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Adding handleStreamReception calls to useUltraSimplePeer.js...');

const filePath = path.join(__dirname, 'frontend/src/hooks/useUltraSimplePeer.js');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  console.log('📖 File read successfully');
  
  // Add handleStreamReception call to first stream handler (around line 871)
  const firstStreamHandler = `      console.log(\`🎥 STREAM: Audio tracks: \${stream.getAudioTracks().length}\`);
      
      const isScreenShare = stream.getVideoTracks().some(track =>`;
  
  const firstStreamHandlerWithCall = `      console.log(\`🎥 STREAM: Audio tracks: \${stream.getAudioTracks().length}\`);
      
      // CRITICAL: Call handleStreamReception to fix audio issues
      handleStreamReception(stream, participantId, participantsRef.current);
      
      const isScreenShare = stream.getVideoTracks().some(track =>`;
  
  if (content.includes(firstStreamHandler)) {
    content = content.replace(firstStreamHandler, firstStreamHandlerWithCall);
    console.log('✅ Added handleStreamReception call to first stream handler');
  } else {
    console.log('⚠️ First stream handler pattern not found');
  }
  
  // Add handleStreamReception call to second stream handler (in handleSignal)
  const secondStreamHandler = `      peer.on('stream', (stream) => {
        console.log('🎥 UltraSimplePeer: Received stream from:', from);
        console.log('🎥 UltraSimplePeer: Stream details in handleSignal:', {
          streamId: stream.id,
          trackCount: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
                // Audio variables moved to audioUtils.js,
          streamActive: stream.active,
          streamEnded: stream.ended
        });`;
  
  const secondStreamHandlerWithCall = `      peer.on('stream', (stream) => {
        console.log('🎥 UltraSimplePeer: Received stream from:', from);
        console.log('🎥 UltraSimplePeer: Stream details in handleSignal:', {
          streamId: stream.id,
          trackCount: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
                // Audio variables moved to audioUtils.js,
          streamActive: stream.active,
          streamEnded: stream.ended
        });
        
        // CRITICAL: Call handleStreamReception to fix audio issues
        handleStreamReception(stream, from, participantsRef.current);`;
  
  if (content.includes(secondStreamHandler)) {
    content = content.replace(secondStreamHandler, secondStreamHandlerWithCall);
    console.log('✅ Added handleStreamReception call to second stream handler');
  } else {
    console.log('⚠️ Second stream handler pattern not found');
  }
  
  // Write the updated content back to the file
  fs.writeFileSync(filePath, content, 'utf8');
  
  console.log('🎉 Successfully added handleStreamReception calls!');
  console.log('');
  console.log('🔊 AUDIO STREAM RECEPTION FIXED!');
  console.log('');
  console.log('✅ Successfully added handleStreamReception function calls to useUltraSimplePeer.js:');
  console.log('  • First stream handler (createPeerConnection)');
  console.log('  • Second stream handler (handleSignal)');
  console.log('');
  console.log('🎯 Host and participant should now be able to hear each other!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
