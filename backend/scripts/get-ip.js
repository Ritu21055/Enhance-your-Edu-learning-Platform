#!/usr/bin/env node

// Script to help users find their IP address for cross-device setup

import os from 'os';

function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return 'localhost';
}

function getNetworkInfo() {
  const ip = getLocalIPAddress();
  const hostname = os.hostname();
  
  console.log('\n🌐 Network Information for Cross-Device Setup:');
  console.log('================================================');
  console.log(`📱 Your IP Address: ${ip}`);
  console.log(`💻 Hostname: ${hostname}`);
  console.log('\n📋 Setup Instructions:');
  console.log('1. Update frontend/src/config/network.js');
  console.log(`2. Replace YOUR_IP_ADDRESS with: ${ip}`);
  console.log('3. Start the server: cd backend && npm start');
  console.log('4. Start the frontend: cd frontend && npm start');
  console.log('\n🔗 Access URLs:');
  console.log(`   Host Computer: http://localhost:3000`);
  console.log(`   Other Devices: http://${ip}:3000`);
  console.log('\n⚠️  Make sure all devices are on the same network!');
  console.log('================================================\n');
}

// Run the script
getNetworkInfo();
