// Main handler registration file
// This file registers all socket event handlers

import registerMeetingHandlers from './meetingHandlers.js';
import registerMediaHandlers from './mediaHandlers.js';
import registerMediaRequestHandlers from './mediaRequestHandlers.js';
import registerChatHandlers from './chatHandlers.js';
import registerAIHandlers from './aiHandlers.js';
import registerRecordingHandlers from './recordingHandlers.js';
import registerDisconnectHandler from './disconnectHandler.js';

/**
 * Register all socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
export default function registerAllHandlers(socket, io) {
  // Handle ping for connection testing
  socket.on('ping', (data) => {
    socket.emit('pong', { message: 'pong', timestamp: new Date().toISOString() });
  });

  // Test screen share event
  socket.on('test-screen-share', (data) => {
    socket.emit('test-screen-share', { message: 'Test screen share response', timestamp: new Date().toISOString() });
  });

  // Register all handlers
  registerMeetingHandlers(socket, io);
  registerMediaHandlers(socket, io);
  registerMediaRequestHandlers(socket, io);
  registerChatHandlers(socket, io);
  registerAIHandlers(socket, io);
  registerRecordingHandlers(socket, io);
  registerDisconnectHandler(socket, io);
}

