// ============================================================================
// MAP2 Audio Platform - Session Status Indicator Component
// Auto-save status and session recovery UI
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
  Divider,
  CircularProgress,
  Badge,
  Switch,
  FormControlLabel,
  Alert,
} from '@mui/material';
import {
  Add,
  Cloud,
  CloudOffline,
  FolderOpen,
  OverflowMenuVertical,
  Reset,
  Save,
  Time,
  WarningFilled,
} from '@carbon/icons-react';
import { useTheme, alpha } from '@mui/material/styles';

interface SessionInfo {
  name: string;
  hasUnsavedChanges: boolean;
  lastSaved?: string;
  autoSaveEnabled: boolean;
  autoSaveIntervalSec: number;
}

interface RecentSession {
  name: string;
  path: string;
  modifiedAt: string;
  description?: string;
}

interface RecoverySession {
  name: string;
  crashedAt: string;
  canRecover: boolean;
}

interface SessionStatusIndicatorProps {
  onSave?: () => void;
  onSaveAs?: (name: string) => void;
  onOpen?: (path: string) => void;
  onNew?: () => void;
  compact?: boolean;
}

const API_BASE = '/api';

export default function SessionStatusIndicator({
  onSave,
  onSaveAs,
  onOpen,
  onNew,
  compact = false,
}: SessionStatusIndicatorProps) {
  const theme = useTheme();
  const [session, setSession] = useState<SessionInfo>({
    name: 'Untitled',
    hasUnsavedChanges: false,
    autoSaveEnabled: true,
    autoSaveIntervalSec: 60,
  });
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [recoverySession, setRecoverySession] = useState<RecoverySession | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [recentDialogOpen, setRecentDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchSessionStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions/current`);
      if (res.ok) {
        const data = await res.json();
        setSession({
          name: data.name || 'Untitled',
          hasUnsavedChanges: data.has_unsaved_changes || false,
          lastSaved: data.last_saved,
          autoSaveEnabled: data.auto_save_enabled ?? true,
          autoSaveIntervalSec: data.auto_save_interval_sec || 60,
        });
      }
    } catch (err) {
      console.error('Failed to fetch session status:', err);
    }
  }, []);

  const fetchRecentSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions/recent`);
      if (res.ok) {
        const data = await res.json();
        setRecentSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to fetch recent sessions:', err);
    }
  }, []);

  const checkRecovery = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions/recovery`);
      if (res.ok) {
        const data = await res.json();
        if (data.has_recovery) {
          setRecoverySession({
            name: data.session_name,
            crashedAt: data.crashed_at,
            canRecover: data.can_recover,
          });
          setRecoveryDialogOpen(true);
        }
      }
    } catch (err) {
      console.error('Failed to check recovery:', err);
    }
  }, []);

  useEffect(() => {
    fetchSessionStatus();
    fetchRecentSessions();
    checkRecovery();
    
    const interval = setInterval(fetchSessionStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchSessionStatus, fetchRecentSessions, checkRecovery]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/sessions/save`, { method: 'POST' });
      await fetchSessionStatus();
      onSave?.();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutoSave = async (enabled: boolean) => {
    try {
      await fetch(`${API_BASE}/sessions/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_save_enabled: enabled }),
      });
      await fetchSessionStatus();
    } catch (err) {
      console.error('Failed to toggle auto-save:', err);
    }
  };

  const handleRecover = async () => {
    try {
      await fetch(`${API_BASE}/sessions/recovery/restore`, { method: 'POST' });
      await fetchSessionStatus();
      setRecoveryDialogOpen(false);
    } catch (err) {
      console.error('Failed to recover session:', err);
    }
  };

  const handleDismissRecovery = async () => {
    try {
      await fetch(`${API_BASE}/sessions/recovery/dismiss`, { method: 'POST' });
      setRecoveryDialogOpen(false);
      setRecoverySession(null);
    } catch (err) {
      console.error('Failed to dismiss recovery:', err);
    }
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
            <Typography variant="body2">{session.name}</Typography>
            <Typography variant="caption">
              {session.hasUnsavedChanges ? 'Unsaved changes' : 'All saved'}
            </Typography>
            {session.lastSaved && (
              <Typography variant="caption" display="block">
                Last saved: {formatTimeAgo(session.lastSaved)}
              </Typography>
            )}
          </Box>
        }
      >
        <IconButton
          size="small"
          onClick={handleSave}
          disabled={saving || !session.hasUnsavedChanges}
        >
          <Badge variant="dot" color="warning" invisible={!session.hasUnsavedChanges}>
            {session.hasUnsavedChanges ? (
              <CloudOffline size={16} />
            ) : (
              <Box sx={{ color: 'success.main', display: 'inline-flex' }}>
                <Cloud size={16} />
              </Box>
            )}
          </Badge>
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
        {/* Session Name */}
        <Tooltip title={session.hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {session.hasUnsavedChanges ? (
              <Box sx={{ color: 'warning.main', display: 'inline-flex' }}>
                <CloudOffline size={16} />
              </Box>
            ) : (
              <Box sx={{ color: 'success.main', display: 'inline-flex' }}>
                <Cloud size={16} />
              </Box>
            )}
            <Typography 
              variant="body2" 
              sx={{ 
                maxWidth: 150, 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.name}
              {session.hasUnsavedChanges && '*'}
            </Typography>
          </Box>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* Auto-save indicator */}
        {session.autoSaveEnabled && (
          <Tooltip title={`Auto-save every ${session.autoSaveIntervalSec}s`}>
            <Chip
              icon={<Time size={14} />}
              label="Auto"
              size="small"
              color="success"
              variant="outlined"
              sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: 10 } }}
            />
          </Tooltip>
        )}

        {/* Last saved time */}
        {session.lastSaved && (
          <Typography variant="caption" color="textSecondary">
            {formatTimeAgo(session.lastSaved)}
          </Typography>
        )}

        {/* Save button */}
        <Tooltip title="Save session (Ctrl+S)">
          <span>
            <IconButton
              size="small"
              onClick={handleSave}
              disabled={saving || !session.hasUnsavedChanges}
              color={session.hasUnsavedChanges ? 'primary' : 'default'}
            >
              {saving ? (
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
        <MenuItem onClick={() => { setMenuAnchor(null); handleSave(); }}>
          <Save size={16} style={{ marginRight: 8 }} />
          Save
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); /* onSaveAs */ }}>
          <Save size={16} style={{ marginRight: 8 }} />
          Save As...
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setMenuAnchor(null); setRecentDialogOpen(true); }}>
          <Time size={16} style={{ marginRight: 8 }} />
          Recent Sessions
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onNew?.(); }}>
          <Add size={16} style={{ marginRight: 8 }} />
          New Session
        </MenuItem>
        <Divider />
        <MenuItem>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={session.autoSaveEnabled}
                onChange={(e) => handleToggleAutoSave(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Auto-save</Typography>}
            onClick={(e) => e.stopPropagation()}
          />
        </MenuItem>
      </Menu>

      {/* Recovery Dialog */}
      <Dialog open={recoveryDialogOpen} onClose={() => setRecoveryDialogOpen(false)}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color: 'warning.main', display: 'inline-flex' }}>
            <WarningFilled size={20} />
          </Box>
          Session Recovery Available
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            A previous session was not saved properly. Would you like to recover it?
          </Alert>
          {recoverySession && (
            <Box>
              <Typography variant="body2">
                <strong>Session:</strong> {recoverySession.name}
              </Typography>
              <Typography variant="body2">
                <strong>Time:</strong> {new Date(recoverySession.crashedAt).toLocaleString()}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDismissRecovery}>Discard</Button>
          <Button onClick={handleRecover} variant="contained" startIcon={<Reset size={16} />}>
            Recover Session
          </Button>
        </DialogActions>
      </Dialog>

      {/* Recent Sessions Dialog */}
      <Dialog 
        open={recentDialogOpen} 
        onClose={() => setRecentDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Recent Sessions</DialogTitle>
        <DialogContent>
          {recentSessions.length === 0 ? (
            <Typography color="textSecondary">No recent sessions</Typography>
          ) : (
            <List>
              {recentSessions.map((rs) => (
                <ListItem key={rs.path} disablePadding>
                  <ListItemButton onClick={() => { setRecentDialogOpen(false); onOpen?.(rs.path); }}>
                    <ListItemIcon>
                      <FolderOpen size={20} />
                    </ListItemIcon>
                    <ListItemText
                      primary={rs.name}
                      secondary={`Modified: ${formatTimeAgo(rs.modifiedAt)}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecentDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
