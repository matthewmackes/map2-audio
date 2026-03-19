// ============================================================================
// MAP2 Audio Platform - Backup Status Widget Component
// Quick backup status and one-click backup button
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  ListItemSecondaryAction,
  Divider,
  CircularProgress,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  Cloud,
  OverflowMenuVertical,
  Renew,
  Reset,
  Save,
  StoragePool,
  Time,
  TrashCan,
  WarningFilled,
  CheckmarkFilled,
} from '@carbon/icons-react';
import { useTheme, alpha } from '@mui/material/styles';

interface BackupInfo {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sizeHuman: string;
  valid: boolean;
}

interface BackupStatus {
  backupCount: number;
  totalSizeHuman: string;
  lastBackup?: string;
  autoBackupEnabled: boolean;
  maxBackups: number;
  retentionDays: number;
}

interface BackupStatusWidgetProps {
  onBackupCreated?: () => void;
  onBackupRestored?: () => void;
  compact?: boolean;
}

const API_BASE = '/api';

export default function BackupStatusWidget({
  onBackupCreated,
  onBackupRestored,
  compact = false,
}: BackupStatusWidgetProps) {
  const theme = useTheme();
  const [status, setStatus] = useState<BackupStatus>({
    backupCount: 0,
    totalSizeHuman: '0 B',
    autoBackupEnabled: true,
    maxBackups: 10,
    retentionDays: 30,
  });
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/backup/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus({
          backupCount: data.backup_count || 0,
          totalSizeHuman: data.total_size_human || '0 B',
          lastBackup: data.last_backup,
          autoBackupEnabled: data.auto_backup ?? true,
          maxBackups: data.max_backups || 10,
          retentionDays: data.retention_days || 30,
        });
      }
    } catch (err) {
      console.error('Failed to fetch backup status:', err);
    }
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/backup/`);
      if (res.ok) {
        const data = await res.json();
        setBackups((data.backups || []).map((b: any) => ({
          id: b.id,
          filename: b.filename,
          createdAt: b.created_at,
          sizeBytes: b.size_bytes,
          sizeHuman: b.size_human,
          valid: b.valid,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleCreateBackup = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/backup/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'Manual backup' }),
      });
      if (res.ok) {
        await fetchStatus();
        onBackupCreated?.();
      } else {
        const data = await res.json();
        setError(data.detail || 'Backup failed');
      }
    } catch (err) {
      setError('Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;
    
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/backup/${selectedBackup.id}/restore`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchStatus();
        onBackupRestored?.();
        setRestoreDialogOpen(false);
      } else {
        const data = await res.json();
        setError(data.detail || 'Restore failed');
      }
    } catch (err) {
      setError('Failed to restore backup');
    } finally {
      setRestoring(false);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    try {
      await fetch(`${API_BASE}/backup/${id}`, { method: 'DELETE' });
      await fetchBackups();
      await fetchStatus();
    } catch (err) {
      console.error('Failed to delete backup:', err);
    }
  };

  const openRestoreDialog = (backup: BackupInfo) => {
    setSelectedBackup(backup);
    setRestoreDialogOpen(true);
    setListDialogOpen(false);
  };

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (compact) {
    return (
      <Tooltip
        title={
          <Box>
            <Typography variant="body2">Backups: {status.backupCount}</Typography>
            <Typography variant="caption">Total: {status.totalSizeHuman}</Typography>
            {status.lastBackup && (
              <Typography variant="caption" display="block">
                Last: {formatTimeAgo(status.lastBackup)}
              </Typography>
            )}
          </Box>
        }
      >
        <IconButton size="small" onClick={handleCreateBackup} disabled={creating}>
          {creating ? (
            <CircularProgress size={16} />
          ) : (
            <Box
              sx={{
                color: status.backupCount > 0 ? 'success.main' : 'action.active',
                display: 'inline-flex',
              }}
            >
              <Save size={16} />
            </Box>
          )}
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <>
      <Paper
        elevation={1}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          bgcolor: alpha(theme.palette.background.paper, 0.8),
          borderRadius: 2,
        }}
      >
        <Tooltip title="Backup System">
          <Box
            sx={{
              color: status.backupCount > 0 ? 'success.main' : 'action.active',
              display: 'inline-flex',
            }}
          >
            <Save size={20} />
          </Box>
        </Tooltip>

        {/* Backup count */}
        <Chip
          label={`${status.backupCount} backups`}
          size="small"
          color={status.backupCount > 0 ? 'success' : 'default'}
          variant="outlined"
          sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: 11 } }}
          onClick={() => { fetchBackups(); setListDialogOpen(true); }}
        />

        {/* Size */}
        <Typography variant="caption" color="textSecondary">
          {status.totalSizeHuman}
        </Typography>

        {/* Last backup time */}
        {status.lastBackup && (
          <Tooltip title={`Last backup: ${new Date(status.lastBackup).toLocaleString()}`}>
            <Typography variant="caption" color="textSecondary">
              {formatTimeAgo(status.lastBackup)}
            </Typography>
          </Tooltip>
        )}

        {/* Create backup button */}
        <Tooltip title="Create Backup Now">
          <span>
            <IconButton
              size="small"
              onClick={handleCreateBackup}
              disabled={creating}
              color="primary"
            >
              {creating ? (
                <CircularProgress size={16} />
              ) : (
                <Save size={16} />
              )}
            </IconButton>
          </span>
        </Tooltip>

        {/* More options */}
        <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <OverflowMenuVertical size={16} />
        </IconButton>
      </Paper>

      {/* Options Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => { setMenuAnchor(null); handleCreateBackup(); }}>
          <Save size={16} style={{ marginRight: 8 }} />
          Create Backup Now
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); fetchBackups(); setListDialogOpen(true); }}>
          <Reset size={16} style={{ marginRight: 8 }} />
          Restore from Backup
        </MenuItem>
        <Divider />
        <MenuItem disabled>
          <Time size={16} style={{ marginRight: 8 }} />
          Auto-backup: {status.autoBackupEnabled ? 'On' : 'Off'}
        </MenuItem>
        <MenuItem disabled>
          <StoragePool size={16} style={{ marginRight: 8 }} />
          Max backups: {status.maxBackups}
        </MenuItem>
      </Menu>

      {/* Backup List Dialog */}
      <Dialog
        open={listDialogOpen}
        onClose={() => setListDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ color: 'primary.main', display: 'inline-flex' }}>
              <Save size={20} />
            </Box>
            Backups
          </Box>
          <IconButton size="small" onClick={fetchBackups}>
            <Renew size={16} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {backups.length === 0 ? (
            <Typography color="textSecondary" sx={{ textAlign: 'center', py: 3 }}>
              No backups found
            </Typography>
          ) : (
            <List>
              {backups.map((backup) => (
                <ListItem key={backup.id} disablePadding>
                  <ListItemButton onClick={() => openRestoreDialog(backup)}>
                    <ListItemIcon>
                      {backup.valid ? (
                        <Box sx={{ color: 'success.main', display: 'inline-flex' }}>
                          <CheckmarkFilled size={20} />
                        </Box>
                      ) : (
                        <Box sx={{ color: 'error.main', display: 'inline-flex' }}>
                          <WarningFilled size={20} />
                        </Box>
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={backup.filename}
                      secondary={
                        <Box>
                          <Typography variant="caption">
                            {new Date(backup.createdAt).toLocaleString()}
                          </Typography>
                          <Typography variant="caption" sx={{ ml: 1 }}>
                            ({backup.sizeHuman})
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleDeleteBackup(backup.id); }}
                      >
                        <TrashCan size={16} />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setListDialogOpen(false)}>Close</Button>
          <Button onClick={handleCreateBackup} variant="contained" disabled={creating}>
            Create New Backup
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreDialogOpen} onClose={() => setRestoreDialogOpen(false)}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color: 'warning.main', display: 'inline-flex' }}>
            <Reset size={20} />
          </Box>
          Restore Backup
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will replace your current data with the backup. This action cannot be undone.
          </Alert>
          {selectedBackup && (
            <Box>
              <Typography variant="body2">
                <strong>Backup:</strong> {selectedBackup.filename}
              </Typography>
              <Typography variant="body2">
                <strong>Created:</strong> {new Date(selectedBackup.createdAt).toLocaleString()}
              </Typography>
              <Typography variant="body2">
                <strong>Size:</strong> {selectedBackup.sizeHuman}
              </Typography>
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleRestoreBackup} 
            variant="contained" 
            color="warning"
            disabled={restoring}
            startIcon={restoring ? <CircularProgress size={16} /> : <Reset size={16} />}
          >
            Restore
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
