import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Stack,
  Button,
  IconButton
} from '@mui/material';
import { Close } from '@mui/icons-material';

const PendingApprovalsDialog = ({
  open,
  onClose,
  pendingApprovals,
  onApproveParticipant
}) => {
  console.log('🔍 PendingApprovalsDialog render:', { open, pendingApprovals, onApproveParticipant });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle className="dialog-title">
        Pending Approvals ({pendingApprovals.length})
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {pendingApprovals.length === 0 ? (
          <Typography variant="body1" color="text.secondary" className="no-participants-text">
            No pending approvals
          </Typography>
        ) : (
          <List>
            {pendingApprovals
              .filter(participant => participant && participant.id && participant.name)
              .map((participant) => (
                <ListItem key={participant.id} className="pending-approval-item">
                  <ListItemAvatar>
                    <Avatar>
                      {participant.name.charAt(0).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={participant.name}
                    secondary={`Requested to join at ${new Date(participant.joinedAt).toLocaleTimeString()}`}
                  />
                  <Stack direction="row" spacing={1} className="approval-buttons">
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      onClick={() => {
                        console.log('✅ Approve button clicked for:', participant.name, participant.id);
                        onApproveParticipant(participant.id, true);
                      }}
                      className="approve-button"
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => {
                        console.log('❌ Reject button clicked for:', participant.name, participant.id);
                        onApproveParticipant(participant.id, false);
                      }}
                      className="reject-button"
                    >
                      Reject
                    </Button>
                  </Stack>
                </ListItem>
              ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PendingApprovalsDialog;
