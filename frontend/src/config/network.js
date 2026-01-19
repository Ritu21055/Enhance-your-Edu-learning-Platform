// Network configuration for cross-device compatibility
// This automatically detects the correct backend URL based on how the frontend is accessed

// For local development (same computer)
const LOCAL_CONFIG = {
  BACKEND_URL: 'http://192.168.0.114:5000', 
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
    isIP: /^\d+\.\d+\.\d+\.\d+$/.test(hostname),
    hasEnvBackendUrl: !!process.env.REACT_APP_BACKEND_URL
  });
  
  // Production: Use environment variable for backend URL (when deployed on Vercel)
  if (process.env.REACT_APP_BACKEND_URL) {
    console.log('🌐 Using production backend URL from environment');
    return {
      BACKEND_URL: process.env.REACT_APP_BACKEND_URL,
      FRONTEND_URL: `${protocol}//${hostname}${port ? ':' + port : ''}`
    };
  }
  
  // Development: If accessing via localhost or 127.0.0.1, use local config
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    console.log('🏠 Using localhost config');
    return LOCAL_CONFIG;
  }
  
  // Network access: For all other cases (including IP addresses), use the same hostname for backend
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

// Keep-alive ping to prevent server from sleeping (for free tier deployments)
let keepAliveInterval = null;

export const startKeepAlive = () => {
  // Only run keep-alive in production (deployed) environments
  // Skip for localhost/127.0.0.1 (local development)
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname.startsWith('192.168.') ||
                      window.location.hostname.startsWith('10.');
  
  if (isLocalhost) {
    console.log('🏠 Keep-alive disabled: Running on localhost');
    return;
  }
  
  // Stop existing interval if any
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  const backendUrl = config.BACKEND_URL;
  const healthEndpoint = `${backendUrl}/api/health`;
  
  console.log('🔄 Starting keep-alive ping to prevent server sleep...');
  console.log('   Backend URL:', backendUrl);
  console.log('   Ping interval: Every 10 minutes');
  
  // Ping immediately on start
  const pingServer = async () => {
    try {
      const startTime = Date.now();
      const response = await fetch(healthEndpoint, {
        method: 'GET',
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Keep-alive ping successful (${responseTime}ms):`, data.status);
      } else {
        console.log(`⚠️ Keep-alive ping failed: HTTP ${response.status} (${responseTime}ms)`);
      }
    } catch (error) {
      console.log(`❌ Keep-alive ping error: ${error.message}`);
    }
  };
  
  // Initial ping
  pingServer();
  
  // Set up interval: ping every 10 minutes (600000 ms)
  // Render free tier sleeps after 15 minutes, so 10 minutes is safe
  keepAliveInterval = setInterval(pingServer, 10 * 60 * 1000);
  
  console.log('✅ Keep-alive started successfully');
};

export const stopKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('🛑 Keep-alive stopped');
  }
};

export default config;
