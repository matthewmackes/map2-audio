// ============================================================================
// MAP2 Audio Platform - History/Undo Panel Component
// Command history with undo/redo functionality
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Button,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Tooltip,
  ButtonGroup,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import {
  Camera,
  CheckmarkFilled,
  Renew,
  Redo,
  Time,
  TrashCan,
  Undo,
  Reset,
  CircleOutline,
} from '@carbon/icons-react';
import { historyApi } from '../api';
import type { HistoryStatus, HistoryEntry } from '../types';

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getActionIcon(type: string) {
  switch (type) {
    case 'parameter_change':
      return 'Parameter';
    case 'plugin_add':
      return 'Add';
    case 'plugin_remove':
      return 'Remove';
    case 'chain_create':
      return 'Chain';
    case 'chain_delete':
      return 'Delete';
    case 'preset_load':
      return 'Preset';
    case 'bypass_toggle':
      return 'Bypass';
    default:
      return 'Edit';
  }
}

export default function HistoryPanel() {
  const [status, setStatus] = useState<HistoryStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [snapshots, setSnapshots] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, historyRes, snapshotsRes] = await Promise.all([
        historyApi.getStatus(),
        historyApi.getList(),
        historyApi.getSnapshots(),
      ]);

      setStatus(statusRes);
      setHistory(historyRes.history);
      setSnapshots(snapshotsRes.snapshots);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUndo = async () => {
    if (!status?.can_undo) return;
    try {
      setProcessing(true);
      const result = await historyApi.undo();
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              can_undo: result.can_undo,
              can_redo: result.can_redo,
              next_undo: result.next_undo,
            }
          : prev
      );
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleRedo = async () => {
    if (!status?.can_redo) return;
    try {
      setProcessing(true);
      const result = await historyApi.redo();
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              can_undo: result.can_undo,
              can_redo: result.can_redo,
              next_redo: result.next_redo,
            }
          : prev
      );
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redo failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleClear = async () => {
    try {
      setProcessing(true);
      await historyApi.clear();
      setClearDialogOpen(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history');
    } finally {
      setProcessing(false);
    }
  };

  const handleRestoreSnapshot = async (index: number) => {
    try {
      setProcessing(true);
      await historyApi.restoreSnapshot(index);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore snapshot');
    } finally {
      setProcessing(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        handleRedo();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ color: 'primary.main', display: 'inline-flex' }}>
          <Time size={20} />
        </Box>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          History
        </Typography>
        <Chip
          label={`${status?.undo_stack_size || 0} actions`}
          size="small"
          variant="outlined"
        />
        <IconButton onClick={fetchData} disabled={loading} size="small">
          <Renew size={16} />
        </IconButton>
      </Box>

      <Divider />

      {/* Undo/Redo Controls */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
        <ButtonGroup variant="outlined">
          <Tooltip title={`Undo${status?.next_undo ? `: ${status.next_undo}` : ''} (Ctrl+Z)`}>
            <span>
              <Button
                onClick={handleUndo}
                disabled={!status?.can_undo || processing}
                startIcon={<Undo size={16} />}
              >
                Undo
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={`Redo${status?.next_redo ? `: ${status.next_redo}` : ''} (Ctrl+Y)`}>
            <span>
              <Button
                onClick={handleRedo}
                disabled={!status?.can_redo || processing}
                startIcon={<Redo size={16} />}
              >
                Redo
              </Button>
            </span>
          </Tooltip>
        </ButtonGroup>
        <Tooltip title="Clear all history">
          <span>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setClearDialogOpen(true)}
              disabled={(status?.undo_stack_size || 0) === 0 || processing}
              startIcon={<TrashCan size={16} />}
            >
              Clear
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Status Bar */}
      <Box
        sx={{
          px: 2,
          py: 1,
          bgcolor: 'grey.900',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {status?.next_undo ? `Next undo: ${status.next_undo}` : 'No undo available'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {status?.next_redo ? `Next redo: ${status.next_redo}` : 'No redo available'}
        </Typography>
      </Box>

      <Divider />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* History List */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : history.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Box sx={{ color: 'text.secondary', display: 'inline-flex', mb: 2 }}>
              <Time size={48} />
            </Box>
            <Typography color="text.secondary">No history yet</Typography>
            <Typography variant="body2" color="text.secondary">
              Actions you perform will appear here
            </Typography>
          </Box>
        ) : (
          <List dense>
            {history.map((entry, index) => {
              const isFirst = index === 0;

              return (
                <ListItem key={entry.id || index} disablePadding>
                  <ListItemButton disabled>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {isFirst ? (
                        <Box sx={{ color: 'primary.main', display: 'inline-flex' }}>
                          <CheckmarkFilled size={16} />
                        </Box>
                      ) : (
                        <Box sx={{ color: 'text.disabled', display: 'inline-flex' }}>
                          <CircleOutline size={16} />
                        </Box>
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <span>{getActionIcon(entry.type)}</span>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: isFirst ? 'bold' : 'normal',
                              color: isFirst ? 'primary.main' : 'text.primary',
                            }}
                          >
                            {entry.description}
                          </Typography>
                        </Box>
                      }
                      secondary={formatTimestamp(entry.timestamp)}
                    />
                    {isFirst && <Chip label="Current" size="small" color="primary" />}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      {/* Snapshots Section */}
      {snapshots.length > 0 && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              <Camera size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Snapshots ({snapshots.length})
            </Typography>
            <List dense disablePadding>
              {snapshots.slice(0, 5).map((_, index) => (
                <ListItem key={index} disablePadding>
                  <ListItemButton onClick={() => handleRestoreSnapshot(index)} disabled={processing}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Reset size={16} />
                    </ListItemIcon>
                    <ListItemText primary={`Snapshot ${index + 1}`} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        </>
      )}

      {/* Keyboard Shortcuts Info */}
      <Divider />
      <Box sx={{ p: 1.5, bgcolor: 'grey.900' }}>
        <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
          Keyboard shortcuts: <strong>Ctrl+Z</strong> Undo • <strong>Ctrl+Y</strong> or{' '}
          <strong>Ctrl+Shift+Z</strong> Redo
        </Typography>
      </Box>

      {/* Clear Confirmation Dialog */}
      <Dialog open={clearDialogOpen} onClose={() => setClearDialogOpen(false)}>
        <DialogTitle>Clear History</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear all command history? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleClear} color="error" variant="contained">
            Clear History
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
