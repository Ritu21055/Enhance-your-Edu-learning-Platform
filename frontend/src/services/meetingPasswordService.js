/**
 * Meeting Password Service
 * Utility functions for password validation and management
 */

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} - { isValid: boolean, error: string }
 */
export const validatePassword = (password) => {
  if (!password || password.trim() === '') {
    return {
      isValid: false,
      error: 'Password cannot be empty'
    };
  }

  if (password.length < 4) {
    return {
      isValid: false,
      error: 'Password must be at least 4 characters'
    };
  }

  if (password.length > 50) {
    return {
      isValid: false,
      error: 'Password must be less than 50 characters'
    };
  }

  return {
    isValid: true,
    error: null
  };
};

/**
 * Check if password is optional (empty string or null)
 * @param {string} password - Password to check
 * @returns {boolean}
 */
export const isPasswordOptional = (password) => {
  return !password || password.trim() === '';
};

/**
 * Hash password (simple implementation - in production, use proper hashing)
 * For now, we'll store plain text but this can be enhanced
 * @param {string} password - Password to hash
 * @returns {string} - Hashed password
 */
export const hashPassword = (password) => {
  // Simple hash - in production, use bcrypt or similar
  // For now, return as-is for simplicity
  return password.trim();
};

/**
 * Compare passwords
 * @param {string} inputPassword - Password entered by user
 * @param {string} storedPassword - Password stored in meeting
 * @returns {boolean} - True if passwords match
 */
export const comparePasswords = (inputPassword, storedPassword) => {
  if (!inputPassword || !storedPassword) {
    return false;
  }
  return inputPassword.trim() === storedPassword.trim();
};

