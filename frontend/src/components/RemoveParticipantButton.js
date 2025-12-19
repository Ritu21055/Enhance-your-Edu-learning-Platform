import React from 'react';
import { IconButton, Tooltip, Box } from '@mui/material';
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
  // Only show button if:
  // 1. Current user is host
  // 2. Participant is not the current user
  const shouldShow = Boolean(isHost) && String(participantId) !== String(currentUserId);

  // Only show button if user is host and participant is not themselves
  if (!shouldShow) {
    return null;
  }

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
    <Box
      sx={{
        display: 'flex !important',
        alignItems: 'center',
        gap: '4px',
        position: 'relative',
        zIndex: 1002
      }}
    >
      <Tooltip title={`Remove ${participantName} from meeting`}>
        <IconButton
          edge="end"
          size="medium"
          color="error"
          onClick={handleRemove}
          aria-label={`Remove ${participantName}`}
          sx={{
            '&:hover': {
              backgroundColor: 'rgba(211, 47, 47, 0.1)'
            },
            '& svg': {
              color: '#d32f2f'
            }
          }}
        >
          <PersonRemove />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default RemoveParticipantButton;

