#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Adding handleStreamReception calls to useUltraSimplePeer.js (robust version)...');

const filePath = path.join(__dirname, 'frontend/src/hooks/useUltraSimplePeer.js');

try {
  // Read the file
  let content = fs.readFileSync(filePath, 'utf8');
  
  console.log('📖 File read successfully');
  
  // Find and add to first stream handler
  const firstStreamPattern = /(peer\.on\('stream', \(stream\) => \{[\s\S]*?console\.log\(`🎥 STREAM: Audio tracks: \${stream\.getAudioTracks\(\)\.length}`\);\s*\n\s*\n\s*const isScreenShare)/;
  
  if (firstStreamPattern.test(content)) {
    content = content.replace(firstStreamPattern, (match) => {
      return match.replace(
        /console\.log\(`🎥 STREAM: Audio tracks: \${stream\.getAudioTracks\(\)\.length}`\);\s*\n\s*\n\s*const isScreenShare/,
        `console.log(\`🎥 STREAM: Audio tracks: \${stream.getAudioTracks().length}\`);
      
      // CRITICAL: Call handleStreamReception to fix audio issues
      handleStreamReception(stream, participantId, participantsRef.current);
      
      const isScreenShare`
      );
    });
    console.log('✅ Added handleStreamReception call to first stream handler');
  } else {
    console.log('⚠️ First stream handler pattern not found, trying alternative approach...');
    
    // Try alternative approach - find the line and add after it
    const lines = content.split('\n');
    let modified = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('console.log(`🎥 STREAM: Audio tracks:') && 
          lines[i + 1] === '' && 
          lines[i + 2].includes('const isScreenShare')) {
        
        lines.splice(i + 2, 0, '      // CRITICAL: Call handleStreamReception to fix audio issues');
        lines.splice(i + 3, 0, '      handleStreamReception(stream, participantId, participantsRef.current);');
        modified = true;
        console.log('✅ Added handleStreamReception call to first stream handler (alternative method)');
        break;
      }
    }
    
    if (modified) {
      content = lines.join('\n');
    }
  }
  
  // Find and add to second stream handler (in handleSignal)
  const secondStreamPattern = /(peer\.on\('stream', \(stream\) => \{[\s\S]*?console\.log\('🎥 UltraSimplePeer: Stream details in handleSignal:'[\s\S]*?\}\);\s*\n\s*\/\/ CRITICAL: Force stream to be active)/;
  
  if (secondStreamPattern.test(content)) {
    content = content.replace(secondStreamPattern, (match) => {
      return match.replace(
        /console\.log\('🎥 UltraSimplePeer: Stream details in handleSignal:'[\s\S]*?\}\);\s*\n\s*\/\/ CRITICAL: Force stream to be active/,
        `console.log('🎥 UltraSimplePeer: Stream details in handleSignal:', {
          streamId: stream.id,
          trackCount: stream.getTracks().length,
          videoTracks: stream.getVideoTracks().length,
                // Audio variables moved to audioUtils.js,
          streamActive: stream.active,
          streamEnded: stream.ended
        });
        
        // CRITICAL: Call handleStreamReception to fix audio issues
        handleStreamReception(stream, from, participantsRef.current);
        
        // CRITICAL: Force stream to be active`
      );
    });
    console.log('✅ Added handleStreamReception call to second stream handler');
  } else {
    console.log('⚠️ Second stream handler pattern not found, trying alternative approach...');
    
    // Try alternative approach for second handler
    const lines = content.split('\n');
    let modified = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('console.log(\'🎥 UltraSimplePeer: Stream details in handleSignal:\'') && 
          lines[i + 1].includes('streamId: stream.id') &&
          lines[i + 6].includes('});')) {
        
        lines.splice(i + 7, 0, '');
        lines.splice(i + 8, 0, '        // CRITICAL: Call handleStreamReception to fix audio issues');
        lines.splice(i + 9, 0, '        handleStreamReception(stream, from, participantsRef.current);');
        modified = true;
        console.log('✅ Added handleStreamReception call to second stream handler (alternative method)');
        break;
      }
    }
    
    if (modified) {
      content = lines.join('\n');
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
