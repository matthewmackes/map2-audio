/**
 * Batch Actions Bar Component
 *
 * Floating action bar that appears when cells are selected via drag selection.
 * Provides batch operations for connecting/disconnecting multiple routes at once.
 *
 * Features:
 * - Connect all selected cells
 * - Disconnect all selected cells
 * - Clear selection
 * - Shows count of selected cells
 * - Smooth slide-in animation
 * - Confirmation dialogs for destructive operations
 */

import React, { useState } from 'react';
import { Checkmark, Close, Link, Unlink, WarningFilled } from '@carbon/icons-react';
import {
  Box,
  Button,
  IconButton,
  Typography,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
} from '@mui/material';

interface BatchActionsBarProps {
  /**
   * Number of selected cells
   */
  selectedCount: number;

  /**
   * Callback to connect all selected cells
   */
  onConnectAll: () => Promise<void>;

  /**
   * Callback to disconnect all selected cells
   */
  onDisconnectAll: () => Promise<void>;

  /**
   * Callback to clear selection
   */
  onClearSelection: () => void;

  /**
   * Whether batch operations are in progress
   */
  isLoading?: boolean;
}

type ConfirmDialog = 'connect' | 'disconnect' | null;

/**
 * Batch actions bar component
 */
export function BatchActionsBar({
  selectedCount,
  onConnectAll,
  onDisconnectAll,
  onClearSelection,
  isLoading = false,
}: BatchActionsBarProps) {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);

  // Don't render if no cells selected
  if (selectedCount === 0) {
    return null;
  }

  const handleConnectAll = async () => {
    setConfirmDialog(null);
    await onConnectAll();
  };

  const handleDisconnectAll = async () => {
    setConfirmDialog(null);
    await onDisconnectAll();
  };

  return (
    <>
      {/* Floating action bar */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 6,
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          zIndex: 100,
          animation: 'slideUp 0.3s ease-out',
          '@keyframes slideUp': {
            from: {
              opacity: 0,
              transform: 'translate(-50%, 20px)',
            },
            to: {
              opacity: 1,
              transform: 'translate(-50%, 0)',
            },
          },
        }}
      >
        {/* Selection count */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 1,
          }}
        >
          <Checkmark size={20} />
          <Typography variant="body2" fontWeight={600}>
            {selectedCount} selected
          </Typography>
        </Box>

        {/* Divider */}
        <Box
          sx={{
            width: 1,
            height: 32,
            bgcolor: 'divider',
          }}
        />

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {/* Connect all button */}
          <Tooltip title="Connect all selected cells">
            <Button
              variant="contained"
              color="success"
              size="medium"
              startIcon={isLoading ? <CircularProgress size={16} /> : <Link size={16} />}
              onClick={() => setConfirmDialog('connect')}
              disabled={isLoading}
            >
              Connect All
            </Button>
          </Tooltip>

          {/* Disconnect all button */}
          <Tooltip title="Disconnect all selected cells">
            <Button
              variant="contained"
              color="error"
              size="medium"
              startIcon={isLoading ? <CircularProgress size={16} /> : <Unlink size={16} />}
              onClick={() => setConfirmDialog('disconnect')}
              disabled={isLoading}
            >
              Disconnect All
            </Button>
          </Tooltip>
        </Box>

        {/* Divider */}
        <Box
          sx={{
            width: 1,
            height: 32,
            bgcolor: 'divider',
          }}
        />

        {/* Clear selection */}
        <Tooltip title="Clear selection">
          <IconButton
            size="small"
            onClick={onClearSelection}
            disabled={isLoading}
            sx={{ color: 'text.secondary' }}
          >
            <Close size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Connect all confirmation dialog */}
      <Dialog
        open={confirmDialog === 'connect'}
        onClose={() => setConfirmDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ display: 'inline-flex', color: 'success.main' }}>
            <Link size={16} />
          </Box>
          Connect All Selected?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will create {selectedCount} new audio route{selectedCount === 1 ? '' : 's'}.
            {selectedCount > 10 && (
              <>
                <br />
                <br />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.main' }}>
                  <WarningFilled size={16} />
                  <Typography variant="body2" color="warning.main">
                    Large batch operation - this may take a few moments.
                  </Typography>
                </Box>
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleConnectAll} color="success" variant="contained" autoFocus>
            Connect All
          </Button>
        </DialogActions>
      </Dialog>

      {/* Disconnect all confirmation dialog */}
      <Dialog
        open={confirmDialog === 'disconnect'}
        onClose={() => setConfirmDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box component="span" sx={{ display: 'inline-flex', color: 'error.main' }}>
            <Unlink size={16} />
          </Box>
          Disconnect All Selected?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will disconnect {selectedCount} audio route{selectedCount === 1 ? '' : 's'}.
            {selectedCount > 10 && (
              <>
                <br />
                <br />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.main' }}>
                  <WarningFilled size={16} />
                  <Typography variant="body2" color="warning.main">
                    Large batch operation - this may take a few moments.
                  </Typography>
                </Box>
              </>
            )}
            <br />
            <br />
            <Typography variant="body2" color="error.main" fontWeight={600}>
              This action cannot be undone.
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleDisconnectAll} color="error" variant="contained">
            Disconnect All
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default BatchActionsBar;
