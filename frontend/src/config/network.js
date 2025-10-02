// Network configuration for cross-device compatibility
// This automatically detects the correct backend URL based on how the frontend is accessed

// For local development (same computer)
const LOCAL_CONFIG = {
  BACKEND_URL: 'http://192.168.0.108:5000', 
  FRONTEND_URL: 'http://localhost:3000'
};

// For participants connecting to host's backend
const PARTICIPANT_CONFIG = {
  BACKEND_URL: 'http://192.168.0.108:5000',  // Host's IP address
  FRONTEND_URL: 'http://localhost:3000'
};

// Alternative IP addresses to try (common router IP ranges)
const ALTERNATIVE_IPS = [
  '192.168.0.108',  // Current IP
  '192.168.1.108',  // Alternative router range
  '10.0.0.108',     // Another common range
  '172.16.0.108'    // Corporate network range
];

// Auto-detect network configuration based on current hostname
const getNetworkConfig = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  // If accessing via localhost or 127.0.0.1, check if this is the host or participant
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Check if this is the host (has backend server running) or participant
    // For now, assume localhost means host, but we'll add detection logic
    return LOCAL_CONFIG;
  }
  
  // If accessing via IP address, use the same hostname for backend
  // This ensures both laptops use the same backend server
  return {
    BACKEND_URL: `${protocol}//${hostname}:5000`,
    FRONTEND_URL: `${protocol}//${hostname}:${port || 3000}`
  };
};

// Get the appropriate configuration
const config = getNetworkConfig();

// Auto-detect backend configuration on page load
detectBackendConfig().then(detectedConfig => {
  console.log('🌐 Auto-detected backend configuration:', detectedConfig);
  // Update the config if needed
  if (detectedConfig.BACKEND_URL !== config.BACKEND_URL) {
    console.log('🌐 Switching to detected backend:', detectedConfig.BACKEND_URL);
    Object.assign(config, detectedConfig);
  }
});

// Export the configuration
export const NETWORK_CONFIG = config;

// Helper function to get the backend URL
export const getBackendUrl = () => {
  return config.BACKEND_URL;
};

// Helper function to get the frontend URL
export const getFrontendUrl = () => {
  return config.FRONTEND_URL;
};

// Function to test backend connectivity
export const testBackendConnectivity = async () => {
  const testUrl = `${config.BACKEND_URL}/health`;
  try {
    const response = await fetch(testUrl, { 
      method: 'GET',
      timeout: 5000 
    });
    return response.ok;
  } catch (error) {
    console.log('🌐 Backend connectivity test failed:', error.message);
    return false;
  }
};

// Function to detect if we should use host's backend (for participants)
export const detectBackendConfig = async () => {
  const hostname = window.location.hostname;
  
  // If accessing via localhost, check if local backend is available
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    try {
      // Test if local backend is available
      const localResponse = await fetch('http://localhost:5000/health', { 
        method: 'GET',
        timeout: 2000 
      });
      
      if (localResponse.ok) {
        console.log('🌐 Using local backend (host mode)');
        return LOCAL_CONFIG;
      }
    } catch (error) {
      console.log('🌐 Local backend not available, using host backend (participant mode)');
      return PARTICIPANT_CONFIG;
    }
  }
  
  // For IP access, use the same IP for backend
  return {
    BACKEND_URL: `http://${hostname}:5000`,
    FRONTEND_URL: `http://${hostname}:3000`
  };
};

// Log current configuration
console.log('🌐 Network Configuration:', {
  currentHostname: window.location.hostname,
  currentProtocol: window.location.protocol,
  currentPort: window.location.port,
  backendUrl: config.BACKEND_URL,
  frontendUrl: config.FRONTEND_URL,
  isLocalhost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
  isNetworkAccess: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
});

export default config;
