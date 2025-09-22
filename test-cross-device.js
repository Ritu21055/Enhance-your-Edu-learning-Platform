#!/usr/bin/env node

/**
 * Cross-Device Testing Script for WebNexus
 * This script helps test the application across different devices and networks
 */

const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const getNetworkInterfaces = () => {
  const interfaces = os.networkInterfaces();
  const results = [];
  
  Object.keys(interfaces).forEach(name => {
    interfaces[name].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({
          name,
          address: iface.address,
          netmask: iface.netmask,
          mac: iface.mac
        });
      }
    });
  });
  
  return results;
};

const testPort = (host, port) => {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    
    socket.setTimeout(1000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(port, host);
  });
};

const testHttpEndpoint = async (url) => {
  try {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    return new Promise((resolve) => {
      const req = client.get(url, (res) => {
        resolve({
          success: true,
          status: res.statusCode,
          headers: res.headers
        });
      });
      
      req.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
      
      req.setTimeout(5000, () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Timeout'
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

const runTests = async () => {
  log('\n🌐 WebNexus Cross-Device Testing Script', 'cyan');
  log('=====================================\n', 'cyan');
  
  // Get network interfaces
  log('📡 Network Interfaces:', 'blue');
  const interfaces = getNetworkInterfaces();
  interfaces.forEach(iface => {
    log(`  ${iface.name}: ${iface.address}`, 'green');
  });
  
  if (interfaces.length === 0) {
    log('❌ No network interfaces found!', 'red');
    return;
  }
  
  const primaryInterface = interfaces[0];
  log(`\n🎯 Using primary interface: ${primaryInterface.name} (${primaryInterface.address})`, 'yellow');
  
  // Test backend server
  log('\n🔧 Testing Backend Server:', 'blue');
  const backendUrl = `http://${primaryInterface.address}:5000`;
  const backendHealthUrl = `${backendUrl}/api/health`;
  
  log(`  Testing: ${backendHealthUrl}`, 'cyan');
  const backendTest = await testHttpEndpoint(backendHealthUrl);
  
  if (backendTest.success) {
    log(`  ✅ Backend server is running (Status: ${backendTest.status})`, 'green');
  } else {
    log(`  ❌ Backend server is not accessible: ${backendTest.error}`, 'red');
    log('  💡 Make sure to run: cd backend && npm start', 'yellow');
  }
  
  // Test frontend server
  log('\n🎨 Testing Frontend Server:', 'blue');
  const frontendUrl = `http://${primaryInterface.address}:3000`;
  
  log(`  Testing: ${frontendUrl}`, 'cyan');
  const frontendTest = await testHttpEndpoint(frontendUrl);
  
  if (frontendTest.success) {
    log(`  ✅ Frontend server is running (Status: ${frontendTest.status})`, 'green');
  } else {
    log(`  ❌ Frontend server is not accessible: ${frontendTest.error}`, 'red');
    log('  💡 Make sure to run: cd frontend && npm start', 'yellow');
  }
  
  // Test ports
  log('\n🔌 Testing Ports:', 'blue');
  const backendPortTest = await testPort(primaryInterface.address, 5000);
  const frontendPortTest = await testPort(primaryInterface.address, 3000);
  
  log(`  Port 5000 (Backend): ${backendPortTest ? '✅ Open' : '❌ Closed'}`, backendPortTest ? 'green' : 'red');
  log(`  Port 3000 (Frontend): ${frontendPortTest ? '✅ Open' : '❌ Closed'}`, frontendPortTest ? 'green' : 'red');
  
  // Generate test URLs
  log('\n🔗 Test URLs for Other Devices:', 'blue');
  log('  Backend Health Check:', 'cyan');
  log(`    ${backendHealthUrl}`, 'green');
  log('  Frontend Application:', 'cyan');
  log(`    ${frontendUrl}`, 'green');
  
  // Generate QR codes (if qrcode package is available)
  try {
    const QRCode = require('qrcode');
    log('\n📱 QR Codes for Mobile Testing:', 'blue');
    
    const qrBackend = await QRCode.toString(backendHealthUrl, { type: 'terminal' });
    log('  Backend Health Check:', 'cyan');
    console.log(qrBackend);
    
    const qrFrontend = await QRCode.toString(frontendUrl, { type: 'terminal' });
    log('  Frontend Application:', 'cyan');
    console.log(qrFrontend);
  } catch (error) {
    log('  💡 Install qrcode package for QR codes: npm install qrcode', 'yellow');
  }
  
  // Generate test instructions
  log('\n📋 Testing Instructions:', 'blue');
  log('  1. Connect other devices to the same WiFi network', 'cyan');
  log('  2. Open a web browser on the other device', 'cyan');
  log('  3. Navigate to the Frontend URL above', 'cyan');
  log('  4. Test creating and joining meetings', 'cyan');
  log('  5. Check browser console for any errors', 'cyan');
  
  // Generate troubleshooting info
  log('\n🛠️ Troubleshooting:', 'blue');
  if (!backendTest.success) {
    log('  ❌ Backend Issues:', 'red');
    log('    - Check if backend server is running', 'yellow');
    log('    - Verify port 5000 is not blocked by firewall', 'yellow');
    log('    - Try: cd backend && npm start', 'yellow');
  }
  
  if (!frontendTest.success) {
    log('  ❌ Frontend Issues:', 'red');
    log('    - Check if frontend server is running', 'yellow');
    log('    - Verify port 3000 is not blocked by firewall', 'yellow');
    log('    - Try: cd frontend && npm start', 'yellow');
  }
  
  if (backendTest.success && frontendTest.success) {
    log('  ✅ Both servers are running correctly!', 'green');
    log('  💡 If other devices still can\'t connect:', 'yellow');
    log('    - Check Windows Firewall settings', 'yellow');
    log('    - Ensure all devices are on the same network', 'yellow');
    log('    - Try disabling antivirus temporarily', 'yellow');
    log('    - Use mobile hotspot as alternative', 'yellow');
  }
  
  // Save test results
  const testResults = {
    timestamp: new Date().toISOString(),
    networkInterfaces: interfaces,
    backend: {
      url: backendUrl,
      healthUrl: backendHealthUrl,
      test: backendTest,
      portTest: backendPortTest
    },
    frontend: {
      url: frontendUrl,
      test: frontendTest,
      portTest: frontendPortTest
    }
  };
  
  fs.writeFileSync('test-results.json', JSON.stringify(testResults, null, 2));
  log('\n💾 Test results saved to test-results.json', 'green');
  
  log('\n🎉 Cross-device testing setup complete!', 'green');
};

// Run the tests
runTests().catch(error => {
  log(`❌ Error running tests: ${error.message}`, 'red');
  process.exit(1);
});
