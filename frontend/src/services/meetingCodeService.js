// meetingCodeService.js - Service for generating and managing meeting codes

// Generate a random meeting code
const generateMeetingCode = () => {
  // Generate a 6-character alphanumeric code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
};

// Generate a more readable meeting code (3 letters + 3 numbers)
const generateReadableMeetingCode = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  
  let code = '';
  
  // Add 3 random letters
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  // Add 3 random numbers
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return code;
};

// Generate a meeting code with custom format
const generateCustomMeetingCode = (format = 'XXXXXX') => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < format.length; i++) {
    if (format[i] === 'X') {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    } else {
      result += format[i];
    }
  }
  
  return result;
};

// Validate meeting code format
const isValidMeetingCode = (code) => {
  // Check if code is 6 characters and alphanumeric
  const regex = /^[A-Z0-9]{6}$/;
  return regex.test(code);
};

// Format meeting code for display (add hyphens for readability)
const formatMeetingCode = (code) => {
  if (code.length === 6) {
    return `${code.substring(0, 3)}-${code.substring(3, 6)}`;
  }
  return code;
};

// Remove formatting from meeting code
const unformatMeetingCode = (formattedCode) => {
  return formattedCode.replace(/-/g, '').toUpperCase();
};

// Generate multiple meeting codes (for testing or bulk creation)
const generateMultipleMeetingCodes = (count = 5) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(generateReadableMeetingCode());
  }
  return codes;
};

// Check if meeting code is available (not already in use)
const isMeetingCodeAvailable = (code, existingMeetings = []) => {
  const existingCodes = existingMeetings.map(meeting => meeting.id);
  return !existingCodes.includes(code);
};

// Generate a unique meeting code (ensures no duplicates)
const generateUniqueMeetingCode = (existingMeetings = []) => {
  let code;
  let attempts = 0;
  const maxAttempts = 100;
  
  do {
    code = generateReadableMeetingCode();
    attempts++;
  } while (!isMeetingCodeAvailable(code, existingMeetings) && attempts < maxAttempts);
  
  if (attempts >= maxAttempts) {
    console.warn('Could not generate unique meeting code after 100 attempts');
    // Fallback to timestamp-based code
    code = `MT${Date.now().toString().slice(-4)}`;
  }
  
  return code;
};

// Get meeting code suggestions (for user to choose from)
const getMeetingCodeSuggestions = (count = 3) => {
  return generateMultipleMeetingCodes(count).map(code => ({
    code,
    formatted: formatMeetingCode(code),
    readable: code
  }));
};

export {
  generateMeetingCode,
  generateReadableMeetingCode,
  generateCustomMeetingCode,
  isValidMeetingCode,
  formatMeetingCode,
  unformatMeetingCode,
  generateMultipleMeetingCodes,
  isMeetingCodeAvailable,
  generateUniqueMeetingCode,
  getMeetingCodeSuggestions
};
