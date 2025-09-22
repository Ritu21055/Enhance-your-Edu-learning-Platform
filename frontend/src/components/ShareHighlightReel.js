import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Alert,
  Snackbar
} from '@mui/material';
import {
  Share,
  ContentCopy as Copy,
  Email,
  Link,
  Close,
  CheckCircle,
  Download
} from '@mui/icons-material';
import '../css/ShareHighlightReel.css';

const ShareHighlightReel = ({ 
  open, 
  onClose, 
  highlightReel, 
  meetingTitle = "Meeting Highlights" 
}) => {
  const [shareMethod, setShareMethod] = useState('link');
  const [emailAddress, setEmailAddress] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const generateShareLink = () => {
    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/highlight-reel/${highlightReel?.id || 'demo'}`;
    return shareUrl;
  };

  const generateEmailContent = () => {
    const shareLink = generateShareLink();
    const defaultMessage = `Hi there!

I wanted to share the highlights from our recent meeting: "${meetingTitle}"

The highlight reel contains all the important moments, decisions, and action items from our discussion. You can watch it here:

${shareLink}

Key highlights include:
- ${highlightReel?.highlightCount || 0} important moments
- Duration: ${highlightReel?.duration || 'N/A'}
- All decisions and action items captured

Best regards!`;

    return customMessage || defaultMessage;
  };

  const handleCopyLink = async () => {
    try {
      const shareLink = generateShareLink();
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setShowSuccess(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleEmailShare = () => {
    const subject = `Meeting Highlights: ${meetingTitle}`;
    const body = generateEmailContent();
    const mailtoUrl = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl);
    setShowSuccess(true);
  };

  const handleDownload = () => {
    if (highlightReel?.url) {
      const link = document.createElement('a');
      link.href = highlightReel.url;
      link.download = `${meetingTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_highlights.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowSuccess(true);
    }
  };

  const shareMethods = [
    { id: 'link', label: 'Copy Link', icon: <Link />, color: '#2196F3' },
    { id: 'email', label: 'Email', icon: <Email />, color: '#4CAF50' },
    { id: 'download', label: 'Download', icon: <Download />, color: '#FF9800' }
  ];

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        className="share-dialog"
      >
        <DialogTitle className="share-dialog-title">
          <Box className="title-content">
            <Share className="title-icon" />
            <Typography variant="h6">Share Highlight Reel</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent className="share-dialog-content">
          {/* Meeting Info */}
          <Box className="meeting-info">
            <Typography variant="h6" className="meeting-title">
              {meetingTitle}
            </Typography>
            <Box className="meeting-stats">
              <Chip 
                icon={<CheckCircle />}
                label={`${highlightReel?.highlightCount || 0} Highlights`}
                color="primary"
                size="small"
              />
              <Chip 
                label={highlightReel?.duration || 'N/A'}
                color="secondary"
                size="small"
              />
            </Box>
          </Box>

          {/* Share Methods */}
          <Box className="share-methods">
            <Typography variant="subtitle1" className="methods-title">
              Choose sharing method:
            </Typography>
            <Box className="method-buttons">
              {shareMethods.map((method) => (
                <Button
                  key={method.id}
                  variant={shareMethod === method.id ? "contained" : "outlined"}
                  startIcon={method.icon}
                  onClick={() => setShareMethod(method.id)}
                  className="method-button"
                  style={{
                    backgroundColor: shareMethod === method.id ? method.color : 'transparent',
                    borderColor: method.color,
                    color: shareMethod === method.id ? 'white' : method.color
                  }}
                >
                  {method.label}
                </Button>
              ))}
            </Box>
          </Box>

          {/* Link Sharing */}
          {shareMethod === 'link' && (
            <Box className="link-sharing">
              <Typography variant="subtitle2" className="section-title">
                Share Link
              </Typography>
              <Box className="link-container">
                <TextField
                  fullWidth
                  value={generateShareLink()}
                  variant="outlined"
                  size="small"
                  InputProps={{
                    readOnly: true,
                    className: 'link-input'
                  }}
                />
                <Tooltip title={copied ? "Copied!" : "Copy link"}>
                  <IconButton
                    onClick={handleCopyLink}
                    className="copy-button"
                    color={copied ? "success" : "primary"}
                  >
                    {copied ? <CheckCircle /> : <Copy />}
                  </IconButton>
                </Tooltip>
              </Box>
              <Typography variant="caption" className="link-help">
                Anyone with this link can view the highlight reel
              </Typography>
            </Box>
          )}

          {/* Email Sharing */}
          {shareMethod === 'email' && (
            <Box className="email-sharing">
              <Typography variant="subtitle2" className="section-title">
                Email Highlights
              </Typography>
              <TextField
                fullWidth
                label="Email Address"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                variant="outlined"
                size="small"
                margin="normal"
                placeholder="colleague@company.com"
              />
              <TextField
                fullWidth
                label="Custom Message (Optional)"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                variant="outlined"
                size="small"
                margin="normal"
                multiline
                rows={4}
                placeholder="Add a personal message..."
              />
            </Box>
          )}

          {/* Download */}
          {shareMethod === 'download' && (
            <Box className="download-sharing">
              <Typography variant="subtitle2" className="section-title">
                Download Video
              </Typography>
              <Alert severity="info" className="download-info">
                Download the highlight reel video file to share offline or store locally.
              </Alert>
            </Box>
          )}
        </DialogContent>

        <DialogActions className="share-dialog-actions">
          <Button onClick={onClose} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={
              shareMethod === 'link' ? handleCopyLink :
              shareMethod === 'email' ? handleEmailShare :
              handleDownload
            }
            variant="contained"
            startIcon={
              shareMethod === 'link' ? <Copy /> :
              shareMethod === 'email' ? <Email /> :
              <Download />
            }
            disabled={shareMethod === 'email' && !emailAddress.trim()}
          >
            {shareMethod === 'link' ? 'Copy Link' :
             shareMethod === 'email' ? 'Send Email' :
             'Download'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={showSuccess}
        autoHideDuration={3000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setShowSuccess(false)} 
          severity="success"
          className="success-alert"
        >
          {shareMethod === 'link' ? 'Link copied to clipboard!' :
           shareMethod === 'email' ? 'Email opened successfully!' :
           'Download started!'}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ShareHighlightReel;
