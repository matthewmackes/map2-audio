// ============================================================================
// MAP2 Audio Platform - Quick Snapshot Bar Component
// 6-slot instant preset recall with save/load functionality
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  IconButton,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
  Chip,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Camera,
  CircleFilled,
  CircleOutline,
  Edit,
  Save,
  TrashCan,
} from '@carbon/icons-react';
import { useTheme, alpha } from '@mui/material/styles';

interface Snapshot {
  id: number;
  name: string;
  hasData: boolean;
  pluginCount?: number;
}

interface SnapshotBarProps {
  onSnapshotLoad?: (id: number) => void;
  onSnapshotSave?: (id: number, name: string) => void;
  compact?: boolean;
}

const API_BASE = '/api';

export default function SnapshotBar({ 
  onSnapshotLoad, 
  onSnapshotSave,
  compact = false 
}: SnapshotBarProps) {
  const theme = useTheme();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([
    { id: 0, name: 'Snapshot 1', hasData: false },
    { id: 1, name: 'Snapshot 2', hasData: false },
    { id: 2, name: 'Snapshot 3', hasData: false },
    { id: 3, name: 'Snapshot 4', hasData: false },
    { id: 4, name: 'Snapshot 5', hasData: false },
    { id: 5, name: 'Snapshot 6', hasData: false },
  ]);
  const [currentSnapshot, setCurrentSnapshot] = useState<number>(0);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveTargetId, setSaveTargetId] = useState<number>(0);
  const [snapshotName, setSnapshotName] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuTargetId, setMenuTargetId] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Fetch snapshots from backend
  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/engine/snapshots`);
      if (res.ok) {
        const data = await res.json();
        if (data.snapshots) {
          setSnapshots(data.snapshots.map((s: any) => ({
            id: s.id,
            name: s.name || `Snapshot ${s.id + 1}`,
            hasData: s.plugin_count > 0 || s.has_data,
            pluginCount: s.plugin_count,
          })));
        }
        if (typeof data.current === 'number') {
          setCurrentSnapshot(data.current);
        }
      }
    } catch (err) {
      console.error('Failed to fetch snapshots:', err);
    }
  }, []);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const handleLoadSnapshot = async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/engine/snapshots/${id}/load`, {
        method: 'POST',
      });
      if (res.ok) {
        setCurrentSnapshot(id);
        onSnapshotLoad?.(id);
      }
    } catch (err) {
      console.error('Failed to load snapshot:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClick = (id: number) => {
    setSaveTargetId(id);
    setSnapshotName(snapshots[id]?.name || `Snapshot ${id + 1}`);
    setSaveDialogOpen(true);
  };

  const handleSaveConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/engine/snapshots/${saveTargetId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: snapshotName }),
      });
      if (res.ok) {
        await fetchSnapshots();
        onSnapshotSave?.(saveTargetId, snapshotName);
      }
    } catch (err) {
      console.error('Failed to save snapshot:', err);
    } finally {
      setLoading(false);
      setSaveDialogOpen(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, id: number) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuTargetId(id);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleDeleteSnapshot = async () => {
    handleMenuClose();
    try {
      await fetch(`${API_BASE}/engine/snapshots/${menuTargetId}`, {
        method: 'DELETE',
      });
      await fetchSnapshots();
    } catch (err) {
      console.error('Failed to delete snapshot:', err);
    }
  };

  const handleRenameSnapshot = () => {
    handleMenuClose();
    handleSaveClick(menuTargetId);
  };

  return (
    <Paper
      elevation={1}
      sx={{
        p: compact ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        borderRadius: 2,
      }}
    >
      <Tooltip title="Quick Snapshots">
        <Box sx={{ color: 'primary.main', mr: 0.5, display: 'inline-flex' }}>
          <Camera size={20} />
        </Box>
      </Tooltip>

      {!compact && (
        <Typography variant="caption" sx={{ mr: 1, fontWeight: 600 }}>
          SNAPSHOTS
        </Typography>
      )}

      <ButtonGroup size="small" variant="outlined">
        {snapshots.map((snapshot) => (
          <Tooltip
            key={snapshot.id}
            title={
              <Box>
                <Typography variant="body2">{snapshot.name}</Typography>
                {snapshot.hasData && (
                  <Typography variant="caption" color="textSecondary">
                    {snapshot.pluginCount} plugins saved
                  </Typography>
                )}
                <Typography variant="caption" display="block">
                  Click to load • Right-click for options
                </Typography>
              </Box>
            }
          >
            <Button
              onClick={() => handleLoadSnapshot(snapshot.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleMenuOpen(e, snapshot.id);
              }}
              disabled={loading}
              sx={{
                minWidth: compact ? 32 : 40,
                px: compact ? 0.5 : 1,
                bgcolor: currentSnapshot === snapshot.id 
                  ? alpha(theme.palette.primary.main, 0.2) 
                  : 'transparent',
                borderColor: currentSnapshot === snapshot.id 
                  ? theme.palette.primary.main 
                  : undefined,
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                },
              }}
            >
              {snapshot.hasData ? (
                <Box
                  sx={{
                    color: currentSnapshot === snapshot.id ? 'primary.main' : 'success.main',
                    display: 'inline-flex',
                  }}
                >
                  <CircleFilled size={12} />
                </Box>
              ) : (
                <Box sx={{ opacity: 0.5, display: 'inline-flex' }}>
                  <CircleOutline size={12} />
                </Box>
              )}
              <Typography variant="caption" sx={{ ml: 0.5 }}>
                {snapshot.id + 1}
              </Typography>
            </Button>
          </Tooltip>
        ))}
      </ButtonGroup>

      <Tooltip title="Save to current slot">
        <IconButton 
          size="small" 
          onClick={() => handleSaveClick(currentSnapshot)}
          disabled={loading}
          color="primary"
        >
          <Save size={16} />
        </IconButton>
      </Tooltip>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleLoadSnapshot(menuTargetId)}>
          <Camera size={16} style={{ marginRight: 8 }} />
          Load Snapshot
        </MenuItem>
        <MenuItem onClick={() => { handleMenuClose(); handleSaveClick(menuTargetId); }}>
          <Save size={16} style={{ marginRight: 8 }} />
          Save to Slot
        </MenuItem>
        <MenuItem onClick={handleRenameSnapshot}>
          <Edit size={16} style={{ marginRight: 8 }} />
          Rename
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleDeleteSnapshot} sx={{ color: 'error.main' }}>
          <TrashCan size={16} style={{ marginRight: 8 }} />
          Clear Slot
        </MenuItem>
      </Menu>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save Snapshot</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Snapshot Name"
            fullWidth
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            variant="outlined"
          />
          <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
            Saving to slot {saveTargetId + 1}. This will capture all current plugin parameters.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveConfirm} variant="contained" disabled={loading}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
