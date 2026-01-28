// ============================================================================
// MAP2 Audio Platform - Feature Toolbar Component
// Unified toolbar with undo/redo, automation, session status, backup
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Paper,
  Chip,
  Divider,
  Menu,
  MenuItem,
  Badge,
  LinearProgress,
  ButtonGroup,
  Button,
} from '@mui/material';
import {
  Undo as UndoIcon,
  Redo as RedoIcon,
  FiberManualRecord as RecordIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Save as SaveIcon,
  Backup as BackupIcon,
  History as HistoryIcon,
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoDescription?: string;
  redoDescription?: string;
  undoStackSize: number;
  redoStackSize: number;
}

interface AutomationStatus {
  recording: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
}

interface SessionStatus {
  hasUnsavedChanges: boolean;
  lastSaved?: string;
  autoSaveEnabled: boolean;
  sessionName?: string;
}

interface BackupStatus {
  lastBackup?: string;
  backupCount: number;
  totalSize?: string;
  autoBackupEnabled: boolean;
}

interface FeatureToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  onRecordToggle?: () => void;
  onPlayToggle?: () => void;
  onSaveSession?: () => void;
  onCreateBackup?: () => void;
  compact?: boolean;
}

const API_BASE = '/api';

export default function FeatureToolbar({
  onUndo,
  onRedo,
  onRecordToggle,
  onPlayToggle,
  onSaveSession,
  onCreateBackup,
  compact = false,
}: FeatureToolbarProps) {
  const theme = useTheme();
  
  const [history, setHistory] = useState<HistoryStatus>({
    canUndo: false,
    canRedo: false,
    undoStackSize: 0,
    redoStackSize: 0,
  });
  
  const [automation, setAutomation] = useState<AutomationStatus>({
    recording: false,
    playing: false,
    currentTime: 0,
    duration: 0,
  });
  
  const [session, setSession] = useState<SessionStatus>({
    hasUnsavedChanges: false,
    autoSaveEnabled: true,
  });
  
  const [backup, setBackup] = useState<BackupStatus>({
    backupCount: 0,
    autoBackupEnabled: true,
  });

  const [historyMenuAnchor, setHistoryMenuAnchor] = useState<null | HTMLElement>(null);
  const [processing, setProcessing] = useState(false);

  // Fetch status from backend
  const fetchStatus = useCallback(async () => {
    try {
      // Fetch history status
      const historyRes = await fetch(`${API_BASE}/history/status`);
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory({
          canUndo: data.can_undo,
          canRedo: data.can_redo,
          undoDescription: data.next_undo,
          redoDescription: data.next_redo,
          undoStackSize: data.undo_stack_size || 0,
          redoStackSize: data.redo_stack_size || 0,
        });
      }

      // Fetch automation status
      const autoRes = await fetch(`${API_BASE}/automation/status`);
      if (autoRes.ok) {
        const data = await autoRes.json();
        setAutomation({
          recording: data.recording || false,
          playing: data.playing || false,
          currentTime: data.current_time || 0,
          duration: data.duration || 0,
        });
      }

      // Fetch session status
      const sessionRes = await fetch(`${API_BASE}/sessions/current`);
      if (sessionRes.ok) {
        const data = await sessionRes.json();
        setSession({
          hasUnsavedChanges: data.has_unsaved_changes || false,
          lastSaved: data.last_saved,
          autoSaveEnabled: data.auto_save_enabled ?? true,
          sessionName: data.name,
        });
      }

      // Fetch backup status
      const backupRes = await fetch(`${API_BASE}/backup/status`);
      if (backupRes.ok) {
        const data = await backupRes.json();
        setBackup({
          lastBackup: data.last_backup,
          backupCount: data.backup_count || 0,
          totalSize: data.total_size_human,
          autoBackupEnabled: data.auto_backup ?? true,
        });
      }
    } catch (err) {
      console.error('Failed to fetch toolbar status:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleUndo = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/history/undo`, { method: 'POST' });
      if (res.ok) {
        await fetchStatus();
        onUndo?.();
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRedo = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/history/redo`, { method: 'POST' });
      if (res.ok) {
        await fetchStatus();
        onRedo?.();
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRecordToggle = async () => {
    try {
      const endpoint = automation.recording ? 'stop' : 'start';
      await fetch(`${API_BASE}/automation/record/${endpoint}`, { method: 'POST' });
      await fetchStatus();
      onRecordToggle?.();
    } catch (err) {
      console.error('Failed to toggle recording:', err);
    }
  };

  const handlePlayToggle = async () => {
    try {
      const endpoint = automation.playing ? 'stop' : 'start';
      await fetch(`${API_BASE}/automation/playback/${endpoint}`, { method: 'POST' });
      await fetchStatus();
      onPlayToggle?.();
    } catch (err) {
      console.error('Failed to toggle playback:', err);
    }
  };

  const handleSaveSession = async () => {
    setProcessing(true);
    try {
      await fetch(`${API_BASE}/sessions/save`, { method: 'POST' });
      await fetchStatus();
      onSaveSession?.();
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateBackup = async () => {
    setProcessing(true);
    try {
      await fetch(`${API_BASE}/backup/create`, { method: 'POST' });
      await fetchStatus();
      onCreateBackup?.();
    } finally {
      setProcessing(false);
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

  return (
    <Paper
      elevation={1}
      sx={{
        p: compact ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 0.5 : 1.5,
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        borderRadius: 2,
        flexWrap: 'wrap',
      }}
    >
      {/* Undo/Redo Section */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title={history.undoDescription ? `Undo: ${history.undoDescription}` : 'Nothing to undo'}>
          <span>
            <IconButton
              size="small"
              onClick={handleUndo}
              disabled={!history.canUndo || processing}
            >
              <Badge badgeContent={history.undoStackSize} color="primary" max={99}>
                <UndoIcon fontSize="small" />
              </Badge>
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title={history.redoDescription ? `Redo: ${history.redoDescription}` : 'Nothing to redo'}>
          <span>
            <IconButton
              size="small"
              onClick={handleRedo}
              disabled={!history.canRedo || processing}
            >
              <Badge badgeContent={history.redoStackSize} color="secondary" max={99}>
                <RedoIcon fontSize="small" />
              </Badge>
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="View History">
          <IconButton
            size="small"
            onClick={(e) => setHistoryMenuAnchor(e.currentTarget)}
          >
            <HistoryIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Automation Transport Section */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip title={automation.recording ? 'Stop Recording' : 'Record Automation'}>
          <IconButton
            size="small"
            onClick={handleRecordToggle}
            sx={{
              color: automation.recording ? theme.palette.error.main : undefined,
              animation: automation.recording ? 'pulse 1s infinite' : undefined,
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.5 },
              },
            }}
          >
            <RecordIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title={automation.playing ? 'Stop Playback' : 'Play Automation'}>
          <IconButton
            size="small"
            onClick={handlePlayToggle}
            color={automation.playing ? 'primary' : 'default'}
          >
            {automation.playing ? <StopIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {(automation.recording || automation.playing) && !compact && (
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
            {automation.currentTime.toFixed(1)}s
          </Typography>
        )}
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Session Status */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip
          title={
            <Box>
              <Typography variant="body2">
                {session.sessionName || 'Unsaved Session'}
              </Typography>
              <Typography variant="caption">
                {session.hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
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
            onClick={handleSaveSession}
            disabled={processing}
            color={session.hasUnsavedChanges ? 'warning' : 'default'}
          >
            <Badge
              variant="dot"
              color="warning"
              invisible={!session.hasUnsavedChanges}
            >
              <SaveIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>

        {!compact && session.autoSaveEnabled && (
          <Chip
            icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
            label="Auto"
            size="small"
            variant="outlined"
            sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: 10 } }}
          />
        )}
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Backup Status */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tooltip
          title={
            <Box>
              <Typography variant="body2">Backup Status</Typography>
              <Typography variant="caption">
                {backup.backupCount} backups ({backup.totalSize || 'N/A'})
              </Typography>
              {backup.lastBackup && (
                <Typography variant="caption" display="block">
                  Last backup: {formatTimeAgo(backup.lastBackup)}
                </Typography>
              )}
            </Box>
          }
        >
          <IconButton
            size="small"
            onClick={handleCreateBackup}
            disabled={processing}
          >
            <Badge badgeContent={backup.backupCount} color="success" max={99}>
              <BackupIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
      </Box>

      {/* History Menu */}
      <Menu
        anchorEl={historyMenuAnchor}
        open={Boolean(historyMenuAnchor)}
        onClose={() => setHistoryMenuAnchor(null)}
      >
        <MenuItem disabled>
          <Typography variant="caption">
            Undo Stack: {history.undoStackSize} items
          </Typography>
        </MenuItem>
        <MenuItem disabled>
          <Typography variant="caption">
            Redo Stack: {history.redoStackSize} items
          </Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setHistoryMenuAnchor(null); handleUndo(); }} disabled={!history.canUndo}>
          <UndoIcon fontSize="small" sx={{ mr: 1 }} />
          Undo {history.undoDescription}
        </MenuItem>
        <MenuItem onClick={() => { setHistoryMenuAnchor(null); handleRedo(); }} disabled={!history.canRedo}>
          <RedoIcon fontSize="small" sx={{ mr: 1 }} />
          Redo {history.redoDescription}
        </MenuItem>
      </Menu>
    </Paper>
  );
}
