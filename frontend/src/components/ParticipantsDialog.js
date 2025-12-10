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

const ParticipantsDialog = ({
  open,
  onClose,
  participants,
  userName
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
            </ListItem>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default ParticipantsDialog;
