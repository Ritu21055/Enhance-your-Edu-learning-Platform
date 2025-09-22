import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Chip,
  IconButton,
  Collapse,
  Alert,
  AlertTitle
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Psychology as PsychologyIcon,
  QuestionMark as QuestionMarkIcon
} from '@mui/icons-material';

const QuestionSuggestion = ({ 
  question, 
  topics = [], 
  sentiment = 'neutral', 
  confidence = 0, 
  timestamp, 
  model = 'unknown',
  onDismiss, 
  onUseQuestion,
  isVisible = false 
}) => {
  const [expanded, setExpanded] = React.useState(false);

  if (!isVisible || !question) {
    return null;
  }

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleUseQuestion = () => {
    if (onUseQuestion) {
      onUseQuestion(question);
    }
    handleDismiss();
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment) {
      case 'positive': return 'success';
      case 'negative': return 'error';
      case 'neutral': 
      default: return 'info';
    }
  };

  const getSentimentIcon = (sentiment) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😟';
      case 'neutral': 
      default: return '😐';
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString();
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Alert 
        severity={getSentimentColor(sentiment)}
        sx={{
          borderRadius: 2,
          boxShadow: 2,
          '& .MuiAlert-message': {
            width: '100%'
          }
        }}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              sx={{ color: 'inherit' }}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
            <IconButton
              size="small"
              onClick={handleDismiss}
              sx={{ color: 'inherit' }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        }
      >
        <AlertTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PsychologyIcon sx={{ fontSize: 20 }} />
          AI-Generated Follow-up Question
          {model && model !== 'unknown' && (
            <Chip
              label={
                model.includes('ollama') ? '🆓 Ollama' :
                model.includes('gemini') ? '🤖 Gemini' :
                model.includes('rule-based') ? '🔄 Rule-based' :
                '🤖 AI'
              }
              size="small"
              variant="outlined"
              color={
                model.includes('ollama') ? 'success' :
                model.includes('gemini') ? 'primary' :
                model.includes('rule-based') ? 'default' :
                'secondary'
              }
              sx={{ ml: 1, fontSize: '0.7rem' }}
            />
          )}
        </AlertTitle>
        
        <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
          {question}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Chip
            icon={<QuestionMarkIcon />}
            label={`${getSentimentIcon(sentiment)} ${sentiment}`}
            size="small"
            color={getSentimentColor(sentiment)}
            variant="outlined"
          />
          <Chip
            label={`${Math.round(confidence * 100)}% confidence`}
            size="small"
            color={getConfidenceColor(confidence)}
            variant="outlined"
          />
          {timestamp && (
            <Chip
              label={formatTimestamp(timestamp)}
              size="small"
              variant="outlined"
            />
          )}
        </Box>

        <Collapse in={expanded}>
          <Box sx={{ mt: 2 }}>
            {topics && topics.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Detected Topics:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {topics.map((topic, index) => (
                    <Chip
                      key={index}
                      label={`${topic.topic} (${Math.round(topic.confidence * 100)}%)`}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  ))}
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <Button
                variant="contained"
                size="small"
                onClick={handleUseQuestion}
                sx={{
                  background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #6d28d9, #7c3aed)'
                  }
                }}
              >
                Use This Question
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleDismiss}
              >
                Dismiss
              </Button>
            </Box>
          </Box>
        </Collapse>
      </Alert>
    </Box>
  );
};

export default QuestionSuggestion;
