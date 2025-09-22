import { useState, useEffect } from 'react';

export const useChat = (socket, meetingId, userName) => {
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    if (!socket) return;

    const handleParticipantJoined = ({ participant, meeting }) => {
      if (participant && participant.name) {
        const joinMessage = {
          from: 'system',
          userName: 'System',
          message: `${participant.name} joined the meeting`,
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, joinMessage]);
      } else {
        console.log('⚠️ Participant joined but no name available:', participant);
      }
    };

    const handleParticipantLeft = ({ participantId, meeting }) => {
      if (participantId) {
        const leftMessage = {
          from: 'system',
          userName: 'System',
          message: 'A participant left the meeting',
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, leftMessage]);
      } else {
        console.log('⚠️ Participant left but no ID available');
      }
    };

    const handleMeetingJoined = ({ meeting, participantId, isHost: userIsHost }) => {
      const welcomeMessage = {
        from: 'system',
        userName: 'System',
        message: `Welcome to the meeting! You can use the chat to communicate with other participants.${userIsHost ? ' You are the host of this meeting.' : ''}`,
        timestamp: new Date()
      };
      setChatMessages([welcomeMessage]);
    };

    const handleChatMessage = (messageData) => {
      console.log('💬 Received chat message:', messageData);
      setChatMessages(prev => [...prev, messageData]);
    };

    socket.on('participant-joined', handleParticipantJoined);
    socket.on('participant-left', handleParticipantLeft);
    socket.on('meeting-joined', handleMeetingJoined);
    socket.on('chat-message', handleChatMessage);

    return () => {
      socket.off('participant-joined', handleParticipantJoined);
      socket.off('participant-left', handleParticipantLeft);
      socket.off('meeting-joined', handleMeetingJoined);
      socket.off('chat-message', handleChatMessage);
    };
  }, [socket, meetingId, userName]);

  const sendMessage = () => {
    if (newMessage.trim() && socket) {
      const message = {
        from: 'user',
        userName,
        message: newMessage.trim(),
        timestamp: new Date()
      };
      
      console.log('💬 Sending chat message:', { meetingId, message });
      socket.emit('chat-message', { meetingId, message });
      setNewMessage('');
    } else {
      console.log('💬 Cannot send message - newMessage:', newMessage, 'socket:', !!socket);
    }
  };

  const handleNewMessageChange = (e) => {
    setNewMessage(e.target.value);
  };

  return {
    chatMessages,
    newMessage,
    sendMessage,
    handleNewMessageChange
  };
};
