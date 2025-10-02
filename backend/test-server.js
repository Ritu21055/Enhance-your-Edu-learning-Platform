const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Test server is running',
    timestamp: new Date().toISOString(),
    clientIP: req.ip,
    userAgent: req.get('User-Agent')
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Test endpoint working',
    server: 'Test Server',
    port: 5001
  });
});

const PORT = 5001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧪 Test server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Server accessible from all network interfaces (0.0.0.0:${PORT})`);
  console.log(`📱 Test from other devices: http://192.168.0.108:${PORT}/api/health`);
});
