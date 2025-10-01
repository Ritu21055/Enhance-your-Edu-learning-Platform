#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Direct insert: Adding handleStreamReception call...');

const filePath = path.join(__dirname, 'frontend/src/hooks/useUltraSimplePeer.js');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  console.log('📖 File read successfully');
  
  // Find the exact line and add after it
  const target = '      console.log(`🎥 STREAM: Audio tracks: ${stream.getAudioTracks().length}`);';
  const addition = '\n      \n      // CRITICAL: Call handleStreamReception to fix audio issues\n      handleStreamReception(stream, participantId, participantsRef.current);';
  
  if (content.includes(target)) {
    content = content.replace(target, target + addition);
    console.log('✅ Added handleStreamReception call to first stream handler');
  } else {
    console.log('❌ Target not found');
  }
  
  // Write the updated content back to the file
  fs.writeFileSync(filePath, content, 'utf8');
  
  console.log('🎉 Successfully added handleStreamReception call!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
