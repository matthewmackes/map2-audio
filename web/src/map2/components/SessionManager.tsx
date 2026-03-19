// ============================================================================
// MAP2 Audio Platform - Session Manager Component
// Save, load, and manage audio processing sessions
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Menu,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import {
  Add,
  Document,
  Export,
  FolderOpen,
  OverflowMenuVertical,
  RecentlyViewed,
  Renew,
  Save,
  Search,
  TrashCan,
  Upload,
} from '@carbon/icons-react';
import { sessionsApi } from '../api';
import type { SessionListItem, Session } from '../types';

function Glyph({
  icon: Icon,
  size = 18,
  color = 'inherit',
}: {
  icon: React.ComponentType<{ size?: number }>;
  size?: number;
  color?: string;
}) {
  return (
    <Box component="span" sx={{ color, display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
      <Icon size={size} />
    </Box>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CreateSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string, author: string, tags: string[]) => void;
}

function CreateSessionDialog({ open, onClose, onCreate }: CreateSessionDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const handleCreate = () => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    onCreate(name, description, author, tags);
    setName('');
    setDescription('');
    setAuthor('');
    setTagsInput('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Session</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Session Name"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ mt: 2 }}
          required
        />
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          sx={{ mt: 2 }}
        />
        <TextField
          label="Author"
          fullWidth
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          sx={{ mt: 2 }}
        />
        <TextField
          label="Tags (comma-separated)"
          fullWidth
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          sx={{ mt: 2 }}
          placeholder="rock, clean, high-gain"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} variant="contained" disabled={!name.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function SessionManager() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionListItem | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [loadingSession, setLoadingSession] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionsRes, currentRes] = await Promise.allSettled([
        sessionsApi.list(),
        sessionsApi.getCurrent(),
      ]);

      if (sessionsRes.status === 'fulfilled') {
        setSessions(sessionsRes.value.sessions);
      }
      if (currentRes.status === 'fulfilled') {
        setCurrentSession(currentRes.value);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleCreateSession = async (name: string, description: string, author: string, tags: string[]) => {
    try {
      await sessionsApi.create(name, description, author, tags);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  const handleLoadSession = async (path: string) => {
    try {
      setLoadingSession(path);
      const result = await sessionsApi.load(path);
      setCurrentSession(result.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoadingSession(null);
    }
  };

  const handleDeleteSession = async (path: string) => {
    try {
      await sessionsApi.delete(path, true);
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
    setMenuAnchor(null);
    setSelectedSession(null);
  };

  const handleExportSession = async () => {
    try {
      const result = await sessionsApi.export();
      // Trigger download
      const link = document.createElement('a');
      link.href = result.path;
      link.download = `session-export-${Date.now()}.map2`;
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export session');
    }
    setMenuAnchor(null);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      await fetchSessions();
      return;
    }

    try {
      const result = await sessionsApi.search(searchQuery);
      setSessions(result.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  };

  const filteredSessions = sessions.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Glyph icon={FolderOpen} color="primary.main" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Sessions
        </Typography>
        <Chip label={`${sessions.length} saved`} size="small" variant="outlined" />
        <IconButton onClick={fetchSessions} disabled={loading} size="small">
          <Renew size={18} />
        </IconButton>
      </Box>

      <Divider />

      {/* Current Session Info */}
      {currentSession && (
        <Box sx={{ p: 2, bgcolor: 'primary.dark', color: 'primary.contrastText' }}>
          <Typography variant="caption" display="block">
            Current Session
          </Typography>
          <Typography variant="subtitle1">{currentSession.metadata.name}</Typography>
          {currentSession.metadata.description && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              {currentSession.metadata.description}
            </Typography>
          )}
        </Box>
      )}

      {/* Toolbar */}
      <Box sx={{ p: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<Add size={16} />}
          onClick={() => setCreateDialogOpen(true)}
          size="small"
        >
          New Session
        </Button>
        <Button
          variant="outlined"
          startIcon={<Save size={16} />}
          onClick={async () => {
            if (currentSession) {
              try {
                await sessionsApi.save(currentSession as unknown as Record<string, unknown>, true);
                await fetchSessions();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to save session');
              }
            }
          }}
          disabled={!currentSession}
          size="small"
        >
          Save
        </Button>
        <Button
          variant="outlined"
          startIcon={<Export size={16} />}
          onClick={handleExportSession}
          disabled={!currentSession}
          size="small"
        >
          Export
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".map2,.json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              try {
                // Import session via file upload
                const formData = new FormData();
                formData.append('file', file);
                const response = await fetch('/api/sessions/import', {
                  method: 'POST',
                  body: formData,
                });
                if (!response.ok) throw new Error('Import failed');
                await fetchSessions();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to import session');
              }
            }
          }}
        />
        <Button
          variant="outlined"
          startIcon={<Upload size={16} />}
          onClick={() => fileInputRef.current?.click()}
          size="small"
        >
          Import
        </Button>
      </Box>

      {/* Search */}
      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Divider />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Session List */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredSessions.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Glyph icon={FolderOpen} size={48} color="text.secondary" />
            <Typography color="text.secondary">No sessions found</Typography>
            <Typography variant="body2" color="text.secondary">
              Create a new session to get started
            </Typography>
          </Box>
        ) : (
          <List>
            {filteredSessions.map((session) => {
              const isLoading = loadingSession === session.path;
              const isCurrent = currentSession?.metadata.name === session.name;

              return (
                <ListItem key={session.path} disablePadding>
                  <ListItemButton
                    onClick={() => !isCurrent && handleLoadSession(session.path)}
                    disabled={isLoading}
                    selected={isCurrent}
                  >
                    <ListItemIcon>
                      {isLoading ? <CircularProgress size={24} /> : <Document size={20} />}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {session.name}
                          {isCurrent && <Chip label="Current" size="small" color="primary" />}
                        </Box>
                      }
                      secondary={
                        <Box>
                          {session.description && (
                            <Typography variant="body2" component="span">
                              {session.description}
                            </Typography>
                          )}
                          <Typography variant="caption" display="block" color="text.secondary">
                            <Box component="span" sx={{ display: 'inline-flex', mr: 0.5, verticalAlign: 'middle' }}>
                              <RecentlyViewed size={12} />
                            </Box>
                            {formatDate(session.updated_at || session.created_at)}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSession(session);
                          setMenuAnchor(e.currentTarget);
                        }}
                      >
                        <OverflowMenuVertical size={18} />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
          setSelectedSession(null);
        }}
      >
        <MenuItem
          onClick={() => selectedSession && handleLoadSession(selectedSession.path)}
          disabled={currentSession?.metadata.name === selectedSession?.name}
        >
          <ListItemIcon>
            <FolderOpen size={16} />
          </ListItemIcon>
          Load
        </MenuItem>
        <MenuItem onClick={handleExportSession}>
          <ListItemIcon>
            <Export size={16} />
          </ListItemIcon>
          Export
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => selectedSession && handleDeleteSession(selectedSession.path)}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <Glyph icon={TrashCan} size={16} color="error.main" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      {/* Create Dialog */}
      <CreateSessionDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateSession}
      />
    </Paper>
  );
}
