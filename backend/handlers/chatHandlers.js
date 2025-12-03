// Chat-related socket event handlers
/**
 * Register chat-related socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
export default function registerChatHandlers(socket, io) {
  // Handle chat messages
  socket.on('chat-message', ({ meetingId, message }) => {
    // Extract message data - handle both object and string formats
    let chatMessage;
    
    if (typeof message === 'object' && message !== null) {
      // Message is already an object with proper structure from frontend
      chatMessage = {
        from: message.from || 'user', // Preserve 'user' or 'system' from frontend
        userName: message.userName || 'Unknown User',
        message: message.message || '',
        timestamp: message.timestamp || new Date()
      };
    } else {
      // Message is a string (legacy format) - create proper object
      chatMessage = {
        from: 'user',
        userName: 'Unknown User',
        message: String(message || ''),
        timestamp: new Date()
      };
    }
    
    // Add participant ID for reference (but don't overwrite 'from' field)
    chatMessage.participantId = socket.id;
    
    // Broadcast to all participants in the meeting room
    io.to(meetingId).emit('chat-message', chatMessage);
  });
}

