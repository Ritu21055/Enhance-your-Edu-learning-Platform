// authService.js - Service for managing authentication state

// Check if user is authenticated
const isAuthenticated = () => {
  try {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('user');
    return !!(token && user);
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
};

// Get current user info
const getCurrentUser = () => {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Set authentication (called after successful login/signup)
const setAuthentication = (userData, token) => {
  try {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('authToken', token);
    return true;
  } catch (error) {
    console.error('Error setting authentication:', error);
    return false;
  }
};

// Clear authentication (called on logout)
const clearAuthentication = () => {
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    return true;
  } catch (error) {
    console.error('Error clearing authentication:', error);
    return false;
  }
};

// Simulate login (for demo purposes)
const login = (email, password) => {
  // In a real app, this would make an API call
  const userData = {
    id: 'user_' + Date.now(),
    email: email,
    name: email.split('@')[0], // Use email prefix as name for demo
    loginTime: new Date().toISOString()
  };
  
  const token = 'token_' + Date.now();
  
  if (setAuthentication(userData, token)) {
    return { success: true, user: userData };
  } else {
    return { success: false, error: 'Failed to set authentication' };
  }
};

// Simulate signup (for demo purposes)
const signup = (email, password, name) => {
  // In a real app, this would make an API call
  const userData = {
    id: 'user_' + Date.now(),
    email: email,
    name: name || email.split('@')[0],
    signupTime: new Date().toISOString()
  };
  
  const token = 'token_' + Date.now();
  
  if (setAuthentication(userData, token)) {
    return { success: true, user: userData };
  } else {
    return { success: false, error: 'Failed to set authentication' };
  }
};

// Debug function to check current auth state
const debugAuthState = () => {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('user');
  console.log('🔐 Current Auth State:', {
    hasToken: !!token,
    hasUser: !!user,
    user: user ? JSON.parse(user) : null,
    isAuthenticated: isAuthenticated()
  });
};

export {
  isAuthenticated,
  getCurrentUser,
  setAuthentication,
  clearAuthentication,
  login,
  signup,
  debugAuthState
};
