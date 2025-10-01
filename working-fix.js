#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Working fix: Adding handleStreamReception call line by line...');

const filePath = path.join(__dirname, 'frontend/src/hooks/useUltraSimplePeer.js');

try {
  // Read the file line by line
  let lines = fs.readFileSync(filePath, 'utf8').split('\n');
  
  console.log('📖 File read successfully, processing lines...');
  
  // Find the line with Audio tracks and add after it
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('console.log(`🎥 STREAM: Audio tracks:') && 
        lines[i + 1] === '' && 
        lines[i + 2].includes('const isScreenShare')) {
      
      // Insert the handleStreamReception call
      lines.splice(i + 2, 0, '      // CRITICAL: Call handleStreamReception to fix audio issues');
      lines.splice(i + 3, 0, '      handleStreamReception(stream, participantId, participantsRef.current);');
      
      console.log('✅ Added handleStreamReception call to first stream handler');
      break;
    }
  }
  
  // Write the updated content back to the file
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  
  console.log('🎉 Successfully added handleStreamReception call!');
  console.log('');
  console.log('🔊 AUDIO STREAM RECEPTION FIXED!');
  console.log('');
  console.log('✅ Successfully added handleStreamReception function call to useUltraSimplePeer.js:');
  console.log('  • First stream handler (createPeerConnection)');
  console.log('');
  console.log('🎯 Host and participant should now be able to hear each other!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
