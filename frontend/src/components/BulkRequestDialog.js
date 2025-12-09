import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Select,
  FormControl,
  InputLabel,
  MenuItem,
  TextField,
  Box,
  Typography,
  Chip,
  Alert,
  Checkbox,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import { Send, People, VideocamOff, MicOff } from '@mui/icons-material';

const BulkRequestDialog = ({ 
  open, 
  onClose, 
  socket, 
  meetingId, 
  participants, 
  currentUserId,
  participantMediaState 
}) => {
  const [requestType, setRequestType] = useState('both');
  const [duration, setDuration] = useState(60);
  const [customMessage, setCustomMessage] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [filterType, setFilterType] = useState('all');

  const availableParticipants = participants.filter(p => 
    p.id !== currentUserId && !p.isHost
  );

  const getFilteredParticipants = () => {
    if (filterType === 'all') return availableParticipants;
    
    return availableParticipants.filter(p => {
      const mediaState = participantMediaState[p.id];
      const videoOff = !mediaState?.videoEnabled;
      const audioOff = !mediaState?.audioEnabled;
      
      if (filterType === 'camera-off') return videoOff;
      if (filterType === 'audio-off') return audioOff;
      if (filterType === 'both-off') return videoOff && audioOff;
      return true;
    });
  };

  const filteredParticipants = getFilteredParticipants();

  React.useEffect(() => {
    setSelectedParticipants(filteredParticipants.map(p => p.id));
  }, [filterType, filteredParticipants.length]);

  const handleSelectAll = () => {
    if (selectedParticipants.length === filteredParticipants.length) {
      setSelectedParticipants([]);
    } else {
      setSelectedParticipants(filteredParticipants.map(p => p.id));
    }
  };

  const handleToggleParticipant = (participantId) => {
    setSelectedParticipants(prev => 
      prev.includes(participantId)
        ? prev.filter(id => id !== participantId)
        : [...prev, participantId]
    );
  };

  const handleBulkRequest = () => {
    if (!socket || selectedParticipants.length === 0) return;

    selectedParticipants.forEach(participantId => {
      socket.emit('host-request-camera-mic', {
        meetingId,
        participantId,
        requestType,
        duration,
        customMessage: customMessage.trim() || undefined
      });
    });

    setSelectedParticipants([]);
    setCustomMessage('');
    setRequestType('both');
    setDuration(60);
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <People color="primary" />
        Bulk Request - All Participants
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel>Filter Participants</InputLabel>
            <Select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              label="Filter Participants"
            >
              <MenuItem value="all">All Participants</MenuItem>
              <MenuItem value="camera-off">Camera Off Only</MenuItem>
              <MenuItem value="audio-off">Audio Off Only</MenuItem>
              <MenuItem value="both-off">Both Camera & Audio Off</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Request Type</InputLabel>
              <Select 
                value={requestType} 
                onChange={(e) => setRequestType(e.target.value)}
                label="Request Type"
              >
                <MenuItem value="camera">Camera Only</MenuItem>
                <MenuItem value="audio">Audio Only</MenuItem>
                <MenuItem value="both">Both Camera & Audio</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl fullWidth>
              <InputLabel>Duration</InputLabel>
              <Select 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)}
                label="Duration"
              >
                <MenuItem value={30}>30 seconds</MenuItem>
                <MenuItem value={60}>1 minute</MenuItem>
                <MenuItem value={120}>2 minutes</MenuItem>
                <MenuItem value={300}>5 minutes</MenuItem>
                <MenuItem value={600}>10 minutes</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Custom Message (Optional)"
            placeholder="e.g., Please turn on camera for presentation..."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            helperText="This message will be sent to all selected participants."
            inputProps={{ maxLength: 200 }}
          />

          <Alert severity="info">
            <Typography variant="body2">
              <strong>{selectedParticipants.length}</strong> participant(s) selected out of <strong>{filteredParticipants.length}</strong> available
            </Typography>
          </Alert>

          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 300, overflow: 'auto' }}>
            <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" fontWeight="bold">
                Select Participants
              </Typography>
              <Button 
                size="small" 
                onClick={handleSelectAll}
              >
                {selectedParticipants.length === filteredParticipants.length ? 'Deselect All' : 'Select All'}
              </Button>
            </Box>
            
            <List dense>
              {filteredParticipants.map((participant) => {
                const mediaState = participantMediaState[participant.id];
                const videoOff = !mediaState?.videoEnabled;
                const audioOff = !mediaState?.audioEnabled;
                const isSelected = selectedParticipants.includes(participant.id);

                return (
                  <ListItem 
                    key={participant.id}
                    button
                    onClick={() => handleToggleParticipant(participant.id)}
                    selected={isSelected}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleToggleParticipant(participant.id)}
                    />
                    <ListItemText
                      primary={participant.name}
                      secondary={
                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                          {videoOff && (
                            <Chip 
                              icon={<VideocamOff />} 
                              label="Camera Off" 
                              size="small" 
                              color="warning"
                              variant="outlined"
                            />
                          )}
                          {audioOff && (
                            <Chip 
                              icon={<MicOff />} 
                              label="Audio Off" 
                              size="small" 
                              color="warning"
                              variant="outlined"
                            />
                          )}
                          {!videoOff && !audioOff && (
                            <Chip 
                              label="All On" 
                              size="small" 
                              color="success"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip 
              label={`${selectedParticipants.length} selected`} 
              size="small" 
              color="primary" 
            />
            <Chip 
              label={duration >= 60 ? `${duration / 60} min` : `${duration}s`} 
              size="small" 
              color="primary" 
              variant="outlined"
            />
            {customMessage && (
              <Chip 
                label="With message" 
                size="small" 
                color="success" 
                variant="outlined"
              />
            )}
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button 
          variant="contained" 
          onClick={handleBulkRequest}
          startIcon={<Send />}
          disabled={selectedParticipants.length === 0}
        >
          Send to {selectedParticipants.length} Participant(s)
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkRequestDialog;

