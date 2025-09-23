// Network configuration for cross-device compatibility
// This automatically detects the correct backend URL based on how the frontend is accessed

// For local development (same computer)
const LOCAL_CONFIG = {
  BACKEND_URL: 'http://10.63.30.193:5000', 
  FRONTEND_URL: 'http://localhost:3000'
};

// Auto-detect network configuration based on current hostname
const getNetworkConfig = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  // If accessing via localhost or 127.0.0.1, use local config
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return LOCAL_CONFIG;
  }
  
  // If accessing via IP address or domain, use the same hostname for backend
  return {
    BACKEND_URL: `${protocol}//${hostname}:5000`,
    FRONTEND_URL: `${protocol}//${hostname}:${port || 3000}`
  };
};

// Get the appropriate configuration
const config = getNetworkConfig();

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
