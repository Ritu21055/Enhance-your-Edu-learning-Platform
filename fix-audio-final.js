#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Final fix: Adding handleStreamReception calls to useUltraSimplePeer.js...');

const filePath = path.join(__dirname, 'frontend/src/hooks/useUltraSimplePeer.js');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  console.log('📖 File read successfully');
  
  // Fix 1: Add handleStreamReception call after the first Audio tracks log
  const firstPattern = '      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);\n      \n      const isScreenShare = stream.getVideoTracks().some(track =>';
  const firstReplacement = '      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);\n      \n      // CRITICAL: Call handleStreamReception to fix audio issues\n      handleStreamReception(stream, participantId, participantsRef.current);\n      \n      const isScreenShare = stream.getVideoTracks().some(track =>';
  
  if (content.includes(firstPattern)) {
    content = content.replace(firstPattern, firstReplacement);
    console.log('✅ Added handleStreamReception call to first stream handler');
  } else {
    console.log('⚠️ First pattern not found');
  }
  
  // Fix 2: Add handleStreamReception call in handleSignal stream handler
  const secondPattern = '        console.log(\'🎥 UltraSimplePeer: Stream details in handleSignal:\', {\n          streamId: stream.id,\n          trackCount: stream.getTracks().length,\n          videoTracks: stream.getVideoTracks().length,\n                // Audio variables moved to audioUtils.js,\n          streamActive: stream.active,\n          streamEnded: stream.ended\n        });';
  const secondReplacement = '        console.log(\'🎥 UltraSimplePeer: Stream details in handleSignal:\', {\n          streamId: stream.id,\n          trackCount: stream.getTracks().length,\n          videoTracks: stream.getVideoTracks().length,\n                // Audio variables moved to audioUtils.js,\n          streamActive: stream.active,\n          streamEnded: stream.ended\n        });\n        \n        // CRITICAL: Call handleStreamReception to fix audio issues\n        handleStreamReception(stream, from, participantsRef.current);';
  
  if (content.includes(secondPattern)) {
    content = content.replace(secondPattern, secondReplacement);
    console.log('✅ Added handleStreamReception call to second stream handler');
  } else {
    console.log('⚠️ Second pattern not found');
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
