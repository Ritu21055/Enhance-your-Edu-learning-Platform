import React from 'react';
import { IconButton } from '@mui/material';
import { Chat } from '@mui/icons-material';

/**
 * Chat Button Component
 * SIMPLE - Just toggles chat, nothing else
 * Video is protected by React.memo on VideoCall component
 */
const ChatButton = ({ showChat, onToggleChat }) => {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('💬 ChatButton: Toggling chat, current state:', showChat);
    
    // ONLY toggle chat - that's it!
    if (onToggleChat) {
      onToggleChat();
    }
  };

  return (
    <IconButton
      onClick={handleClick}
      className={`control-button chat-toggle ${showChat ? 'active' : ''}`}
      title={showChat ? 'Close Chat' : 'Open Chat'}
      type="button"
    >
      <Chat />
    </IconButton>
  );
};

export default ChatButton;

