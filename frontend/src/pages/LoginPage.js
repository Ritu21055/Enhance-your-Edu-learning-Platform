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
import '../css/LoginPage.css';
import { login } from '../services/authService';

const LoginPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
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
    
    // Handle login using auth service
    try {
      const result = login(formData.email, formData.password);
      
      if (result.success) {
        console.log('Login successful:', result.user);
        // Navigate to home page after successful login
        navigate('/home');
      } else {
        alert('Login failed: ' + result.error);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please try again.');
    }
  };

  return (
    <Box className="login-page">
      {/* Header */}
      <Box className="login-header">
        <IconButton onClick={handleBack} className="back-button">
          <ArrowBack />
        </IconButton>
        <Typography variant="h4" className="page-title">
          Sign In
        </Typography>
      </Box>

      <Container maxWidth="sm" className="login-container">
        <Paper className="login-card">
          <Box className="login-content">
            <Typography variant="h5" className="welcome-text">
              Welcome Back
            </Typography>
            <Typography variant="body1" className="subtitle-text">
              Sign in to your Edu-learning Echo System account
            </Typography>

            <form onSubmit={handleSubmit} className="login-form">
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

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                className="login-button"
              >
                Sign In
              </Button>
            </form>

            <Box className="register-link">
              <Typography variant="body2">
                Don't have an account?{' '}
                <Link 
                  component="button" 
                  variant="body2" 
                  onClick={() => navigate('/register')}
                  className="link-button"
                >
                  Create Account
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;
