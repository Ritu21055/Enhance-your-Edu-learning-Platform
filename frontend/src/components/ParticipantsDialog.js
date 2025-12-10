import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Box,
  Chip,
  Typography
} from '@mui/material';
import RemoveParticipantButton from './RemoveParticipantButton';

const ParticipantsDialog = ({
  open,
  onClose,
  participants,
  userName,
  isHost,
  socket,
  meetingId,
  currentUserId
}) => {
  // Debug logging
  console.log('🔵 ParticipantsDialog Debug:', {
    open,
    participantsCount: participants.length,
    isHost,
    hasSocket: !!socket,
    meetingId,
    currentUserId,
    participants: participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
  });
  
  // Log each participant's button visibility
  participants.forEach((participant) => {
    const shouldShowButton = isHost && participant.id !== currentUserId;
    console.log(`🔴 Button visibility for ${participant.name}:`, {
      participantId: participant.id,
      currentUserId,
      isHost,
      shouldShow: shouldShowButton,
      isSameUser: participant.id === currentUserId
    });
  });

  return (
    <Dialog open={open} onClose={onClose} keepMounted>
      <DialogTitle className="dialog-title">Participants ({participants.length})</DialogTitle>
      <DialogContent>
        <List>
          {participants.map((participant) => {
            // Log before rendering button
            console.log('🔵🔵🔵 About to render RemoveParticipantButton for:', participant.name, {
              participantId: participant.id,
              currentUserId,
              isHost,
              dialogOpen: open
            });
            
            return (
              <ListItem 
                key={participant.id}
                secondaryAction={
                  <RemoveParticipantButton
                    participantId={participant.id}
                    participantName={participant.name.replace(' (Host)', '')}
                    socket={socket}
                    meetingId={meetingId}
                    isHost={isHost}
                    currentUserId={currentUserId}
                  />
                }
              >
                <ListItemAvatar>
                  <Avatar>
                    {participant.name.charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box className="participant-info-container">
                      <Typography variant="body1">
                        {participant.name}
                      </Typography>
                      {participant.isHost && (
                        <Chip
                          label="HOST"
                          color="secondary"
                          size="small"
                          variant="filled"
                        />
                      )}
                    </Box>
                  }
                  secondary={participant.name === userName ? 'You' : 'Participant'}
                />
              </ListItem>
            );
          })}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default ParticipantsDialog;
