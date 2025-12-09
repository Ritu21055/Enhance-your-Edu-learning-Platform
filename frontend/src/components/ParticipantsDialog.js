import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Box,
  Chip,
  Typography,
  ListItemSecondaryAction
} from '@mui/material';
import HostCameraRequestButton from './HostCameraRequestButton';

const ParticipantsDialog = ({
  open,
  onClose,
  participants,
  userName,
  isHost,
  socket,
  meetingId,
  participantMediaState
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
              {isHost && !participant.isHost && (
                <ListItemSecondaryAction>
                  <HostCameraRequestButton
                    participant={participant}
                    socket={socket}
                    meetingId={meetingId}
                    participantMediaState={participantMediaState}
                  />
                </ListItemSecondaryAction>
              )}
            </ListItem>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default ParticipantsDialog;
