import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
  AlertTitle,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import {
  CheckCircle,
  Error,
  Warning,
  Info,
  ExpandMore,
  Close,
  Refresh
} from '@mui/icons-material';

const CompatibilityTestResults = ({ open, onClose, results, onRetest }) => {
  if (!results) return null;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle color="success" />;
      case 'error': return <Error color="error" />;
      case 'warning': return <Warning color="warning" />;
      case 'info': return <Info color="info" />;
      default: return <Info color="action" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'success';
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'default';
    }
  };

  const getOverallStatus = () => {
    if (results.device.issues.length > 0) return 'error';
    if (results.device.warnings.length > 0) return 'warning';
    if (results.backend.success && results.webrtc.success && results.media.success) return 'success';
    return 'info';
  };

  const overallStatus = getOverallStatus();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {getStatusIcon(overallStatus)}
            <Typography variant="h6" sx={{ ml: 1 }}>
              Device Compatibility Test Results
            </Typography>
          </Box>
          <Box>
            <Button
              startIcon={<Refresh />}
              onClick={onRetest}
              size="small"
              sx={{ mr: 1 }}
            >
              Retest
            </Button>
            <Button onClick={onClose} size="small">
              <Close />
            </Button>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Overall Status */}
        <Alert severity={overallStatus} sx={{ mb: 2 }}>
          <AlertTitle>
            {overallStatus === 'success' && '✅ Device is fully compatible'}
            {overallStatus === 'warning' && '⚠️ Device has some limitations'}
            {overallStatus === 'error' && '❌ Device has compatibility issues'}
            {overallStatus === 'info' && 'ℹ️ Device compatibility unknown'}
          </AlertTitle>
          {overallStatus === 'success' && 'Your device supports all required features for video conferencing.'}
          {overallStatus === 'warning' && 'Your device works but may have performance limitations.'}
          {overallStatus === 'error' && 'Your device has issues that may prevent the app from working properly.'}
          {overallStatus === 'info' && 'Compatibility test completed. Check individual test results below.'}
        </Alert>

        {/* Device Compatibility Issues */}
        {results.device.issues.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Critical Issues</AlertTitle>
            <List dense>
              {results.device.issues.map((issue, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Error color="error" />
                  </ListItemIcon>
                  <ListItemText primary={issue} />
                </ListItem>
              ))}
            </List>
          </Alert>
        )}

        {/* Device Compatibility Warnings */}
        {results.device.warnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Warnings</AlertTitle>
            <List dense>
              {results.device.warnings.map((warning, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Warning color="warning" />
                  </ListItemIcon>
                  <ListItemText primary={warning} />
                </ListItem>
              ))}
            </List>
          </Alert>
        )}

        {/* Test Results */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Test Results
          </Typography>
          
          <TableContainer component={Paper} sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Test</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Backend Connection</TableCell>
                  <TableCell>
                    <Chip
                      label={results.backend.success ? 'Success' : 'Failed'}
                      color={results.backend.success ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{results.backend.message}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>WebRTC Support</TableCell>
                  <TableCell>
                    <Chip
                      label={results.webrtc.success ? 'Success' : 'Failed'}
                      color={results.webrtc.success ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{results.webrtc.message}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Media Access</TableCell>
                  <TableCell>
                    <Chip
                      label={results.media.success ? 'Success' : 'Failed'}
                      color={results.media.success ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{results.media.message}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Detailed Results */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography>Device Information</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
              <Typography variant="subtitle2" gutterBottom>User Agent:</Typography>
              <Typography variant="body2" sx={{ mb: 2, wordBreak: 'break-all' }}>
                {results.deviceInfo.userAgent}
              </Typography>
              
              <Typography variant="subtitle2" gutterBottom>Platform:</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {results.deviceInfo.platform}
              </Typography>
              
              <Typography variant="subtitle2" gutterBottom>Screen Resolution:</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {results.deviceInfo.screen.width} x {results.deviceInfo.screen.height}
              </Typography>
              
              <Typography variant="subtitle2" gutterBottom>Viewport Size:</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {results.deviceInfo.viewport.width} x {results.deviceInfo.viewport.height}
              </Typography>
              
              {results.deviceInfo.connection && (
                <>
                  <Typography variant="subtitle2" gutterBottom>Network Connection:</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Type: {results.deviceInfo.connection.effectiveType}, 
                    Speed: {results.deviceInfo.connection.downlink} Mbps, 
                    RTT: {results.deviceInfo.connection.rtt} ms
                  </Typography>
                </>
              )}
              
              <Typography variant="subtitle2" gutterBottom>Hardware:</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                CPU Cores: {results.deviceInfo.hardwareConcurrency}, 
                Memory: {results.deviceInfo.deviceMemory} GB, 
                Touch Points: {results.deviceInfo.maxTouchPoints}
              </Typography>
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography>Error Details</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
              {results.backend.error && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Backend Error:</Typography>
                  <Typography variant="body2" color="error">
                    {results.backend.error}
                  </Typography>
                </Box>
              )}
              
              {results.webrtc.error && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>WebRTC Error:</Typography>
                  <Typography variant="body2" color="error">
                    {results.webrtc.error}
                  </Typography>
                </Box>
              )}
              
              {results.media.error && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Media Error:</Typography>
                  <Typography variant="body2" color="error">
                    {results.media.error} ({results.media.errorName})
                  </Typography>
                </Box>
              )}
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Recommendations */}
        {results.device.recommendations.length > 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <AlertTitle>Recommendations</AlertTitle>
            <List dense>
              {results.device.recommendations.map((recommendation, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Info color="info" />
                  </ListItemIcon>
                  <ListItemText primary={recommendation} />
                </ListItem>
              ))}
            </List>
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />
        
        <Typography variant="caption" color="text.secondary">
          Test completed at: {new Date(results.timestamp).toLocaleString()}
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={onRetest} variant="contained" startIcon={<Refresh />}>
          Run Test Again
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CompatibilityTestResults;
