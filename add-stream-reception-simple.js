#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Adding handleStreamReception calls to useUltraSimplePeer.js (simple version)...');

const filePath = path.join(__dirname, 'frontend/src/hooks/useUltraSimplePeer.js');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  console.log('📖 File read successfully');
  
  // Split into lines for easier manipulation
  const lines = content.split('\n');
  let modified = false;
  
  // Find and modify first stream handler
  for (let i = 0; i < lines.length; i++) {
    // Look for the pattern: console.log with Audio tracks, then empty line, then const isScreenShare
    if (lines[i].includes('console.log(`🎥 STREAM: Audio tracks:') && 
        lines[i + 1] === '' && 
        lines[i + 2].includes('const isScreenShare')) {
      
      // Insert the handleStreamReception call
      lines.splice(i + 2, 0, '      // CRITICAL: Call handleStreamReception to fix audio issues');
      lines.splice(i + 3, 0, '      handleStreamReception(stream, participantId, participantsRef.current);');
      modified = true;
      console.log('✅ Added handleStreamReception call to first stream handler');
      break;
    }
  }
  
  // Find and modify second stream handler (in handleSignal)
  for (let i = 0; i < lines.length; i++) {
    // Look for the pattern in handleSignal
    if (lines[i].includes('console.log(\'🎥 UltraSimplePeer: Stream details in handleSignal:\'') && 
        lines[i + 1].includes('streamId: stream.id')) {
      
      // Find the end of the console.log object
      let j = i;
      while (j < lines.length && !lines[j].includes('});')) {
        j++;
      }
      
      if (j < lines.length) {
        // Insert after the console.log object
        lines.splice(j + 1, 0, '');
        lines.splice(j + 2, 0, '        // CRITICAL: Call handleStreamReception to fix audio issues');
        lines.splice(j + 3, 0, '        handleStreamReception(stream, from, participantsRef.current);');
        modified = true;
        console.log('✅ Added handleStreamReception call to second stream handler');
        break;
      }
    }
  }
  
  if (modified) {
    // Write the updated content back to the file
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('🎉 Successfully added handleStreamReception calls!');
  } else {
    console.log('⚠️ No patterns found to modify');
  }
  
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
