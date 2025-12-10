import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { PersonRemove } from '@mui/icons-material';

/**
 * RemoveParticipantButton Component
 * 
 * A button that allows the host to remove a participant from the meeting.
 * Only visible to the host and not shown for the host themselves.
 * 
 * @param {Object} props
 * @param {string} props.participantId - The ID of the participant to remove
 * @param {string} props.participantName - The name of the participant
 * @param {Object} props.socket - Socket.IO socket instance
 * @param {string} props.meetingId - The meeting ID
 * @param {boolean} props.isHost - Whether the current user is the host
 * @param {string} props.currentUserId - The current user's ID
 */
const RemoveParticipantButton = ({
  participantId,
  participantName,
  socket,
  meetingId,
  isHost,
  currentUserId
}) => {
  // Debug logging - ALWAYS log when component is called
  console.log('🔴 RemoveParticipantButton RENDER CALLED:', {
    participantId,
    participantName,
    isHost,
    currentUserId,
    hasSocket: !!socket,
    hasMeetingId: !!meetingId
  });

  // Only show button if:
  // 1. Current user is host
  // 2. Participant is not the host themselves
  // 3. Participant is not the current user
  const shouldShow = isHost && participantId !== currentUserId;

  console.log('🔴 RemoveParticipantButton shouldShow calculation:', {
    isHost,
    participantId,
    currentUserId,
    areEqual: participantId === currentUserId,
    shouldShow
  });

  if (!shouldShow) {
    console.log('🔴 RemoveParticipantButton: RETURNING NULL - shouldShow is false');
    return null;
  }

  console.log('🔴 RemoveParticipantButton: RENDERING BUTTON JSX for', participantName);

  const handleRemove = () => {
    if (!socket || !meetingId || !participantId) {
      console.error('❌ RemoveParticipantButton: Missing required props');
      return;
    }

    // Confirm before removing
    const confirmed = window.confirm(
      `Are you sure you want to remove ${participantName} from the meeting?`
    );

    if (confirmed) {
      console.log(`🗑️ Removing participant ${participantName} (${participantId}) from meeting ${meetingId}`);
      socket.emit('remove-participant', {
        meetingId,
        participantId
      });
    }
  };

  return (
    <Tooltip title={`Remove ${participantName} from meeting`}>
      <IconButton
        edge="end"
        size="small"
        color="error"
        onClick={handleRemove}
        aria-label={`Remove ${participantName}`}
        sx={{
          opacity: 1,
          visibility: 'visible',
          display: 'inline-flex !important',
          position: 'relative',
          zIndex: 1000,
          minWidth: '40px',
          minHeight: '40px',
          '&:hover': {
            backgroundColor: 'rgba(211, 47, 47, 0.08)'
          }
        }}
      >
        <PersonRemove fontSize="small" sx={{ display: 'block !important' }} />
      </IconButton>
    </Tooltip>
  );
};

export default RemoveParticipantButton;

