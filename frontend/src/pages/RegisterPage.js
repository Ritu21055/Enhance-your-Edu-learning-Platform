import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Container, 
  Paper,
  IconButton,
  Link
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import '../css/RegisterPage.css';
import { signup } from '../services/authService';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleBack = () => {
    navigate('/');
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate password confirmation
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    
    // Handle registration using auth service
    try {
      const result = signup(formData.email, formData.password, `${formData.firstName} ${formData.lastName}`);
      
      if (result.success) {
        console.log('Registration successful:', result.user);
        // Navigate to home page after successful registration
        navigate('/home');
      } else {
        alert('Registration failed: ' + result.error);
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed. Please try again.');
    }
  };

  return (
    <Box className="register-page">
      {/* Header */}
      <Box className="register-header">
        <IconButton onClick={handleBack} className="back-button">
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" className="page-title">
          Create Account
        </Typography>
      </Box>

      <Container maxWidth="sm" className="register-container">
        <Paper className="register-card">
          <Box className="register-content">
            <Typography variant="h5" className="welcome-text">
              Welcome to Edu-learning Echo System
            </Typography>
            <Typography variant="body1" className="subtitle-text">
              Join our community and enhance your learning experience
            </Typography>

            <form onSubmit={handleSubmit} className="register-form">
              <Box className="name-row">
                <TextField
                  name="firstName"
                  label="First Name"
                  variant="outlined"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                  className="name-input"
                />
                <TextField
                  name="lastName"
                  label="Last Name"
                  variant="outlined"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                  className="name-input"
                />
              </Box>

              <TextField
                name="email"
                label="Email Address"
                type="email"
                variant="outlined"
                value={formData.email}
                onChange={handleInputChange}
                required
                fullWidth
                className="form-input"
              />

              <TextField
                name="password"
                label="Password"
                type="password"
                variant="outlined"
                value={formData.password}
                onChange={handleInputChange}
                required
                fullWidth
                className="form-input"
              />

              <TextField
                name="confirmPassword"
                label="Confirm Password"
                type="password"
                variant="outlined"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                fullWidth
                className="form-input"
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                className="register-button"
              >
                Create Account
              </Button>
            </form>

            <Box className="login-link">
              <Typography variant="body2">
                Already have an account?{' '}
                <Link 
                  component="button" 
                  variant="body2" 
                  onClick={() => navigate('/login')}
                  className="link-button"
                >
                  Sign In
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default RegisterPage;
