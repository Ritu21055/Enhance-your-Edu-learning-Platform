import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  FormControlLabel,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider
} from '@mui/material';
import { Videocam, Mic } from '@mui/icons-material';

const MediaRequestDialog = ({ open, onClose, participants, socket, meetingId, isHost }) => {
  const [duration, setDuration] = useState(5); // minutes
  const [sendToAll, setSendToAll] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState([]);

  if (!isHost) return null;

  // Filter out host from participants list
  const availableParticipants = participants.filter(p => !p.isHost);

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedParticipants(availableParticipants.map(p => p.id));
      setSendToAll(true);
    } else {
      setSelectedParticipants([]);
      setSendToAll(false);
    }
  };

  const handleParticipantToggle = (participantId) => {
    setSelectedParticipants(prev => {
      if (prev.includes(participantId)) {
        return prev.filter(id => id !== participantId);
      } else {
        return [...prev, participantId];
      }
    });
    setSendToAll(false);
  };

  const handleSendRequest = () => {
    if (selectedParticipants.length === 0 && !sendToAll) {
      alert('Please select at least one participant or choose "Send to All"');
      return;
    }

    if (!socket || !meetingId) return;

    const durationMs = Math.min(duration, 10) * 60 * 1000; // Max 10 minutes
    const participantsToSend = sendToAll 
      ? availableParticipants.map(p => p.id)
      : selectedParticipants;

    // Send request to each selected participant (always 'both')
    participantsToSend.forEach(participantId => {
      const participant = availableParticipants.find(p => p.id === participantId);
      console.log(`📹 Sending request to participant:`, {
        participantId,
        participantName: participant?.name,
        meetingId,
        requestType: 'both',
        duration: durationMs,
        durationMinutes: duration
      });
      
      socket.emit('media-request', {
        meetingId,
        participantId,
        requestType: 'both', // Always both camera and mic
        duration: durationMs
      });
    });

    console.log(`📹 Sending media request: Camera & Mic for ${duration} minutes to ${participantsToSend.length} participant(s)`);
    
    // Reset and close
    setSelectedParticipants([]);
    setDuration(5);
    setSendToAll(false);
    onClose();
  };

  const isAllSelected = selectedParticipants.length === availableParticipants.length && availableParticipants.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Videocam />
          <Mic />
          Request Camera & Microphone Access
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
          {/* Duration */}
          <TextField
            label="Duration (minutes)"
            type="number"
            value={duration}
            onChange={(e) => {
              const val = Math.min(Math.max(1, parseInt(e.target.value) || 1), 10);
              setDuration(val);
            }}
            inputProps={{ min: 1, max: 10 }}
            helperText="Maximum 10 minutes"
            fullWidth
          />

          <Divider />

          {/* Send to All Option */}
          <FormControlLabel
            control={
              <Checkbox
                checked={sendToAll}
                onChange={(e) => {
                  setSendToAll(e.target.checked);
                  if (e.target.checked) {
                    setSelectedParticipants(availableParticipants.map(p => p.id));
                  } else {
                    setSelectedParticipants([]);
                  }
                }}
              />
            }
            label={
              <Typography variant="body1" fontWeight="bold">
                Send to All Participants ({availableParticipants.length})
              </Typography>
            }
          />

          {!sendToAll && (
            <>
              <Divider />
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    Select Participants ({selectedParticipants.length} selected)
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => handleSelectAll(!isAllSelected)}
                  >
                    {isAllSelected ? 'Deselect All' : 'Select All'}
                  </Button>
                </Box>
                
                <List dense sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: 1 }}>
                  {availableParticipants.map((participant) => (
                    <ListItem key={participant.id} dense>
                      <ListItemText primary={participant.name} />
                      <ListItemSecondaryAction>
                        <Checkbox
                          edge="end"
                          checked={selectedParticipants.includes(participant.id)}
                          onChange={() => handleParticipantToggle(participant.id)}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          )}

          <Box sx={{ 
            p: 2, 
            bgcolor: 'info.light', 
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}>
            <Videocam />
            <Mic />
            <Typography variant="body2">
              Camera and microphone will automatically turn off after {duration} minute(s).
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSendRequest} 
          variant="contained" 
          disabled={!sendToAll && selectedParticipants.length === 0}
          startIcon={<><Videocam /><Mic /></>}
        >
          Send Request{sendToAll ? ' to All' : ` (${selectedParticipants.length})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MediaRequestDialog;

