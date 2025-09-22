import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import MeetingLobby from './MeetingLobby';
import MeetingRoom from './MeetingRoom';
import MeetingsHistory from './pages/MeetingsHistory';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#7C3AED',
    },
    secondary: {
      main: '#8B5CF6',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/lobby/:meetingId" element={<MeetingLobby />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/history" element={<MeetingsHistory />} />
          <Route path="/meeting/:meetingId" element={<MeetingRoom />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
