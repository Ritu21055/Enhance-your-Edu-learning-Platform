import React from 'react';
import {
  Paper,
  Typography,
  Box,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  TextField,
  Button,
  Avatar,
  IconButton
} from '@mui/material';
import { Close } from '@mui/icons-material';

const ChatSidebar = ({
  chatMessages,
  newMessage,
  onNewMessageChange,
  onSendMessage,
  onClose
}) => {
  console.log('💬 ChatSidebar render - chatMessages:', chatMessages);
  
  return (
    <Paper className="chat-sidebar">
      <Box className="chat-header-container">
        <Typography variant="h6" className="chat-header">
          Chat
        </Typography>
        <IconButton 
          onClick={onClose}
          className="chat-close-button"
          size="small"
        >
          <Close />
        </IconButton>
      </Box>
      <Box className="chat-messages">
        <List>
          {chatMessages.length === 0 ? (
            <ListItem>
              <ListItemText
                primary={
                  <Typography variant="body2" color="text.secondary" className="chat-text">
                    No messages yet. Start the conversation!
                  </Typography>
                }
              />
            </ListItem>
          ) : (
            chatMessages.map((msg, index) => (
            <ListItem key={index} className="chat-message chat-message-no-padding">
              <ListItemAvatar>
                <Avatar className={`chat-avatar ${msg.from === 'system' ? 'system' : 'user'}`}>
                  {msg.userName.charAt(0).toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box className="chat-message-content">
                    <Typography variant="body2" className="chat-username">
                      {msg.userName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" className="chat-timestamp">
                      {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Typography variant="body2" color="text.primary" className="chat-text">
                    {msg.message}
                  </Typography>
                }
              />
            </ListItem>
            ))
          )}
        </List>
      </Box>
      <Box className="chat-input-container">
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Type a message..."
          value={newMessage}
          onChange={onNewMessageChange}
          onKeyPress={(e) => e.key === 'Enter' && onSendMessage()}
          size="small"
        />
        <Button
          variant="contained"
          onClick={onSendMessage}
          disabled={!newMessage.trim()}
          size="small"
        >
          Send
        </Button>
      </Box>
    </Paper>
  );
};

export default ChatSidebar;
