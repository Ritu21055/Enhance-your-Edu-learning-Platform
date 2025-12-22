// Network configuration for cross-device compatibility
// This automatically detects the correct backend URL based on how the frontend is accessed

// Get the host's IP address from localStorage (set by user or auto-detected)
const getStoredBackendIP = () => {
  try {
    const stored = localStorage.getItem('backend_ip_address');
    if (stored && /^\d+\.\d+\.\d+\.\d+$/.test(stored)) {
      return stored;
    }
  } catch (e) {
    // localStorage not available
  }
  return null;
};

// Store backend IP address
const setStoredBackendIP = (ip) => {
  try {
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      localStorage.setItem('backend_ip_address', ip);
      return true;
    }
  } catch (e) {
    // localStorage not available
  }
  return false;
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
    storedIP: getStoredBackendIP()
  });
  
  // If accessing via localhost or 127.0.0.1, try to use stored IP or fallback
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const storedIP = getStoredBackendIP();
    if (storedIP) {
      console.log('🏠 Using stored backend IP for localhost:', storedIP);
      return {
        BACKEND_URL: `http://${storedIP}:5000`,
        FRONTEND_URL: 'http://localhost:3000'
      };
    }
    // Fallback: try to detect from URL params (if user accessed via IP before)
    const urlParams = new URLSearchParams(window.location.search);
    const backendIP = urlParams.get('backend_ip');
    if (backendIP && /^\d+\.\d+\.\d+\.\d+$/.test(backendIP)) {
      setStoredBackendIP(backendIP);
      console.log('🏠 Using backend IP from URL params:', backendIP);
      return {
        BACKEND_URL: `http://${backendIP}:5000`,
        FRONTEND_URL: 'http://localhost:3000'
      };
    }
    // Last fallback: use a common local network IP (user should update this)
    console.log('🏠 Using fallback localhost config (update IP in network.js if needed)');
    return {
      BACKEND_URL: 'http://192.168.0.107:5000', // User should update this to their actual IP
      FRONTEND_URL: 'http://localhost:3000'
    };
  }
  
  // For IP address access (cross-device), use the same hostname for backend
  // Also store it for future localhost access
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    setStoredBackendIP(hostname);
    const config = {
      BACKEND_URL: `${protocol}//${hostname}:5000`,
      FRONTEND_URL: `${protocol}//${hostname}:${port || 3000}`
    };
    console.log('🌐 Using network config (IP access):', config);
    return config;
  }
  
  // For other hostnames (domain names), use same hostname
  const config = {
    BACKEND_URL: `${protocol}//${hostname}:5000`,
    FRONTEND_URL: `${protocol}//${hostname}:${port || 3000}`
  };
  console.log('🌐 Using network config (domain access):', config);
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
export const testBackendConnection = async (customUrl = null) => {
  const backendUrl = customUrl || getBackendUrl();
  try {
    console.log('🧪 Testing backend connection to:', backendUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${backendUrl}/api/health`, {
      signal: controller.signal,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log('✅ Backend connection successful');
      return { success: true, url: backendUrl };
    } else {
      console.log('❌ Backend responded with error:', response.status);
      return { success: false, error: `HTTP ${response.status}`, url: backendUrl };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('❌ Backend connection timeout');
      return { success: false, error: 'Connection timeout. Server may be unreachable or firewall is blocking.', url: backendUrl };
    }
    console.log('❌ Backend connection failed:', error.message);
    return { success: false, error: error.message, url: backendUrl };
  }
};

// Helper function to try multiple IP addresses
export const findBackendServer = async () => {
  const hostname = window.location.hostname;
  const candidates = [];
  
  // If accessing via IP, try that first
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    candidates.push(`http://${hostname}:5000`);
  }
  
  // Try stored IP
  const storedIP = getStoredBackendIP();
  if (storedIP) {
    candidates.push(`http://${storedIP}:5000`);
  }
  
  // Try common local network IPs
  const commonIPs = [
    '192.168.0.107',
    '192.168.1.1',
    '192.168.0.1',
    '10.0.0.1'
  ];
  
  for (const ip of commonIPs) {
    if (!candidates.includes(`http://${ip}:5000`)) {
      candidates.push(`http://${ip}:5000`);
    }
  }
  
  console.log('🔍 Trying to find backend server, testing:', candidates);
  
  for (const url of candidates) {
    const result = await testBackendConnection(url);
    if (result.success) {
      // Store the working IP
      const ip = url.match(/\d+\.\d+\.\d+\.\d+/)?.[0];
      if (ip) {
        setStoredBackendIP(ip);
      }
      return result;
    }
  }
  
  return { success: false, error: 'Could not find backend server', url: null };
};

// Export IP management functions
export { getStoredBackendIP, setStoredBackendIP };

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
