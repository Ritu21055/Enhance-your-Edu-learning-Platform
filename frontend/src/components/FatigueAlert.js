import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme
} from '@mui/material';
import {
  Close as CloseIcon,
  Lightbulb as LightbulbIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material';

/**
 * Fatigue Alert Component
 * Displays AI-detected meeting fatigue with actionable suggestions
 */
const FatigueAlert = ({ fatigueAlert, onDismiss, isVisible }) => {
  const theme = useTheme();

  console.log('🚨 FatigueAlert component render:', {
    fatigueAlert: !!fatigueAlert,
    isVisible,
    alertData: fatigueAlert
  });
  
  if (!fatigueAlert || !isVisible) {
    console.log('🚨 FatigueAlert: Not rendering - no alert or not visible');
    return null;
  }

  const getAlertSeverity = (type) => {
    switch (type) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'info';
    }
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'high': return <ErrorIcon />;
      case 'medium': return <WarningIcon />;
      case 'low': return <LightbulbIcon />;
      default: return <LightbulbIcon />;
    }
  };

  const getAlertColor = (type) => {
    switch (type) {
      case 'high': return '#f44336';
      case 'medium': return '#ff9800';
      case 'low': return '#2196f3';
      default: return '#2196f3';
    }
  };

  return (
    <Collapse in={isVisible} timeout={300}>
      <Box
        sx={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 9999,
          maxWidth: 400,
          minWidth: 320,
          animation: 'slideInFromRight 0.3s ease-out'
        }}
      >
        <Alert
          severity={getAlertSeverity(fatigueAlert.type)}
          icon={getAlertIcon(fatigueAlert.type)}
          sx={{
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(10px)',
            border: `2px solid ${getAlertColor(fatigueAlert.type)}`,
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            '& .MuiAlert-message': {
              width: '100%'
            }
          }}
          action={
            <IconButton
              size="small"
              onClick={onDismiss}
              sx={{
                color: getAlertColor(fatigueAlert.type),
                '&:hover': {
                  backgroundColor: `${getAlertColor(fatigueAlert.type)}20`
                }
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          <AlertTitle
            sx={{
              fontWeight: 'bold',
              fontSize: '16px',
              color: getAlertColor(fatigueAlert.type),
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            {fatigueAlert.title}
          </AlertTitle>

          <Typography
            variant="body2"
            sx={{
              mb: 2,
              color: theme.palette.text.primary,
              lineHeight: 1.5
            }}
          >
            {fatigueAlert.message}
          </Typography>

          {fatigueAlert.suggestions && fatigueAlert.suggestions.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 'bold',
                  mb: 1,
                  color: theme.palette.text.primary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5
                }}
              >
                <TrendingUpIcon fontSize="small" />
                Suggested Actions:
              </Typography>

              <List dense sx={{ py: 0 }}>
                {fatigueAlert.suggestions.map((suggestion, index) => (
                  <ListItem
                    key={index}
                    sx={{
                      py: 0.5,
                      px: 0,
                      '&:hover': {
                        backgroundColor: 'transparent'
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Chip
                        label={index + 1}
                        size="small"
                        sx={{
                          width: 20,
                          height: 20,
                          fontSize: '10px',
                          backgroundColor: getAlertColor(fatigueAlert.type),
                          color: 'white',
                          fontWeight: 'bold'
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '13px',
                            color: theme.palette.text.secondary,
                            lineHeight: 1.4
                          }}
                        >
                          {suggestion}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          <Box
            sx={{
              mt: 2,
              pt: 1,
              borderTop: `1px solid ${theme.palette.divider}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: '11px'
              }}
            >
              AI-Powered Meeting Analytics
            </Typography>
            <Button
              size="small"
              onClick={onDismiss}
              sx={{
                textTransform: 'none',
                fontSize: '12px',
                color: getAlertColor(fatigueAlert.type),
                '&:hover': {
                  backgroundColor: `${getAlertColor(fatigueAlert.type)}10`
                }
              }}
            >
              Dismiss
            </Button>
          </Box>
        </Alert>

        <style jsx>{`
          @keyframes slideInFromRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}</style>
      </Box>
    </Collapse>
  );
};

export default FatigueAlert;
