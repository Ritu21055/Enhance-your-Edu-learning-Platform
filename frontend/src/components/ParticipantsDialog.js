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
    <Dialog open={open} onClose={onClose} keepMounted>
      <DialogTitle className="dialog-title">Participants ({participants.length})</DialogTitle>
      <DialogContent>
        <List>
          {participants.map((participant) => {
            return (
              <ListItem 
                key={participant.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  paddingRight: '8px !important',
                  paddingLeft: '16px !important',
                  overflow: 'visible !important'
                }}
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
