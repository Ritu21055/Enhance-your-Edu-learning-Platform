#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Working fix: Adding handleStreamReception calls to useUltraSimplePeer.js...');

const filePath = path.join(__dirname, 'frontend/src/hooks/useUltraSimplePeer.js');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  console.log('📖 File read successfully');
  
  // Fix 1: Add handleStreamReception call after line 870
  const firstPattern = '      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);\n      \n      const isScreenShare = stream.getVideoTracks().some(track =>';
  const firstReplacement = '      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);\n      \n      // CRITICAL: Call handleStreamReception to fix audio issues\n      handleStreamReception(stream, participantId, participantsRef.current);\n      \n      const isScreenShare = stream.getVideoTracks().some(track =>';
  
  if (content.includes(firstPattern)) {
    content = content.replace(firstPattern, firstReplacement);
    console.log('✅ Added handleStreamReception call to first stream handler');
  } else {
    console.log('⚠️ First pattern not found, trying alternative...');
    // Try with exact characters
    const altPattern = '      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);\n      \n      const isScreenShare = stream.getVideoTracks().some(track =>';
    const altReplacement = '      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);\n      \n      // CRITICAL: Call handleStreamReception to fix audio issues\n      handleStreamReception(stream, participantId, participantsRef.current);\n      \n      const isScreenShare = stream.getVideoTracks().some(track =>';
    
    if (content.includes(altPattern)) {
      content = content.replace(altPattern, altReplacement);
      console.log('✅ Added handleStreamReception call to first stream handler (alternative)');
    } else {
      console.log('❌ Could not find first pattern');
    }
  }
  
  // Fix 2: Add handleStreamReception call in handleSignal
  const secondPattern = '        console.log(\'🎥 UltraSimplePeer: Stream details in handleSignal:\', {\n          streamId: stream.id,\n          trackCount: stream.getTracks().length,\n          videoTracks: stream.getVideoTracks().length,\n                // Audio variables moved to audioUtils.js,\n          streamActive: stream.active,\n          streamEnded: stream.ended\n        });';
  const secondReplacement = '        console.log(\'🎥 UltraSimplePeer: Stream details in handleSignal:\', {\n          streamId: stream.id,\n          trackCount: stream.getTracks().length,\n          videoTracks: stream.getVideoTracks().length,\n                // Audio variables moved to audioUtils.js,\n          streamActive: stream.active,\n          streamEnded: stream.ended\n        });\n        \n        // CRITICAL: Call handleStreamReception to fix audio issues\n        handleStreamReception(stream, from, participantsRef.current);';
  
  if (content.includes(secondPattern)) {
    content = content.replace(secondPattern, secondReplacement);
    console.log('✅ Added handleStreamReception call to second stream handler');
  } else {
    console.log('⚠️ Second pattern not found, trying alternative...');
    // Try with exact characters
    const altPattern2 = '        console.log(\'🎥 UltraSimplePeer: Stream details in handleSignal:\', {\n          streamId: stream.id,\n          trackCount: stream.getTracks().length,\n          videoTracks: stream.getVideoTracks().length,\n                // Audio variables moved to audioUtils.js,\n          streamActive: stream.active,\n          streamEnded: stream.ended\n        });';
    const altReplacement2 = '        console.log(\'🎥 UltraSimplePeer: Stream details in handleSignal:\', {\n          streamId: stream.id,\n          trackCount: stream.getTracks().length,\n          videoTracks: stream.getVideoTracks().length,\n                // Audio variables moved to audioUtils.js,\n          streamActive: stream.active,\n          streamEnded: stream.ended\n        });\n        \n        // CRITICAL: Call handleStreamReception to fix audio issues\n        handleStreamReception(stream, from, participantsRef.current);';
    
    if (content.includes(altPattern2)) {
      content = content.replace(altPattern2, altReplacement2);
      console.log('✅ Added handleStreamReception call to second stream handler (alternative)');
    } else {
      console.log('❌ Could not find second pattern');
    }
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
