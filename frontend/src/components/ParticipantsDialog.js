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
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle className="dialog-title">Participants ({participants.length})</DialogTitle>
      <DialogContent>
        <List>
          {participants.map((participant) => (
            <ListItem key={participant.id}>
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
              <ListItemSecondaryAction>
                <RemoveParticipantButton
                  participantId={participant.id}
                  participantName={participant.name.replace(' (Host)', '')}
                  socket={socket}
                  meetingId={meetingId}
                  isHost={isHost}
                  currentUserId={currentUserId}
                />
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default ParticipantsDialog;
