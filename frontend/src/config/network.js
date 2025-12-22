// Network configuration for cross-device compatibility
// This automatically detects the correct backend URL based on how the frontend is accessed

// For local development (same computer)
const LOCAL_CONFIG = {
  BACKEND_URL: 'http://10.98.130.193:5000', 
  FRONTEND_URL: 'http://localhost:3000'
};

// Auto-detect network configuration based on current hostname
const getNetworkConfig = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  
  console.log('🔍 Network Detection:', {
    hostname,
    protocol,
    port,
    isLocalhost: hostname === 'localhost' || hostname === '127.0.0.1',
    isIP: /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  });
  
  // If accessing via localhost or 127.0.0.1, use local config
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    console.log('🏠 Using localhost config');
    return LOCAL_CONFIG;
  }
  
  // For all other cases (including IP addresses), use the same hostname for backend
  const config = {
    BACKEND_URL: `${protocol}//${hostname}:5000`,
    FRONTEND_URL: `${protocol}//${hostname}:${port || 3000}`
  };
  
  console.log('🌐 Using network config:', config);
  return config;
};

// Get the appropriate configuration
const config = getNetworkConfig();

// Export the configuration
export const NETWORK_CONFIG = config;

// Helper function to get the backend URL
export const getBackendUrl = () => {
  const backendUrl = config.BACKEND_URL;
  console.log('🔗 Backend URL:', backendUrl);
  return backendUrl;
};

// Helper function to test backend connectivity
export const testBackendConnection = async () => {
  const backendUrl = getBackendUrl();
  try {
    console.log('🧪 Testing backend connection to:', backendUrl);
    const response = await fetch(`${backendUrl}/api/health`);
    if (response.ok) {
      console.log('✅ Backend connection successful');
      return { success: true, url: backendUrl };
    } else {
      console.log('❌ Backend responded with error:', response.status);
      return { success: false, error: `HTTP ${response.status}`, url: backendUrl };
    }
  } catch (error) {
    console.log('❌ Backend connection failed:', error.message);
    return { success: false, error: error.message, url: backendUrl };
  }
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
