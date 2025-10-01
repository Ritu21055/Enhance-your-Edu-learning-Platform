#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Direct fix: Adding handleStreamReception calls...');

const filePath = path.join(__dirname, 'frontend/src/hooks/useUltraSimplePeer.js');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  console.log('📖 File read successfully');
  
  // Add the first call - find the exact line and add after it
  const firstTarget = '      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);';
  const firstAddition = '\n      // CRITICAL: Call handleStreamReception to fix audio issues\n      handleStreamReception(stream, participantId, participantsRef.current);';
  
  if (content.includes(firstTarget)) {
    content = content.replace(firstTarget, firstTarget + firstAddition);
    console.log('✅ Added handleStreamReception call to first stream handler');
  } else {
    console.log('❌ First target not found');
  }
  
  // Add the second call - find the exact line and add after it
  const secondTarget = '        });';
  const secondAddition = '\n        \n        // CRITICAL: Call handleStreamReception to fix audio issues\n        handleStreamReception(stream, from, participantsRef.current);';
  
  // Find the second target in the handleSignal function
  const handleSignalIndex = content.indexOf('peer.on(\'stream\', (stream) => {');
  if (handleSignalIndex !== -1) {
    const afterHandleSignal = content.substring(handleSignalIndex);
    const secondTargetIndex = afterHandleSignal.indexOf('        });');
    if (secondTargetIndex !== -1) {
      const fullIndex = handleSignalIndex + secondTargetIndex;
      content = content.substring(0, fullIndex + '        });'.length) + secondAddition + content.substring(fullIndex + '        });'.length);
      console.log('✅ Added handleStreamReception call to second stream handler');
    } else {
      console.log('❌ Second target not found in handleSignal');
    }
  } else {
    console.log('❌ handleSignal function not found');
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
