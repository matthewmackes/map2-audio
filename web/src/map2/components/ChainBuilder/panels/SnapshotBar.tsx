// ============================================================================
// MAP2 Audio Platform - Snapshot Bar Component
// 6-slot snapshot management for chain state save/recall
// ============================================================================

import { memo, useState, useCallback } from 'react';
import {
  Box,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Compare,
  Edit,
  Save,
  TrashCan,
} from '@carbon/icons-react';
import { useTheme, alpha } from '@mui/material/styles';

// ============================================================================
// Types
// ============================================================================

export interface Snapshot {
  slot: number;
  name?: string;
  hasData: boolean;
  isActive: boolean;
  timestamp?: string;
}

export interface SnapshotBarProps {
  /** Current snapshot states (6 slots) */
  snapshots: Snapshot[];
  /** Currently active snapshot slot (0-5, or -1 if none) */
  activeSlot?: number;
  /** Callback when snapshot is loaded */
  onLoad: (slot: number) => void;
  /** Callback when snapshot is saved */
  onSave: (slot: number, name?: string) => void;
  /** Callback when snapshot is renamed */
  onRename: (slot: number, name: string) => void;
  /** Callback when snapshot is cleared */
  onClear: (slot: number) => void;
  /** Whether A/B comparison mode is available */
  abModeEnabled?: boolean;
  /** Callback to toggle A/B mode */
  onToggleABMode?: () => void;
  /** Whether currently in A/B mode */
  isABModeActive?: boolean;
  /** Compact display mode */
  compact?: boolean;
}

// ============================================================================
// Snapshot Button Component
// ============================================================================

interface SnapshotButtonProps {
  snapshot: Snapshot;
  isActive: boolean;
  onLoad: () => void;
  onSave: () => void;
  onRename: (name: string) => void;
  onClear: () => void;
  compact?: boolean;
}

const SnapshotButton = memo(({
  snapshot,
  isActive,
  onLoad,
  onSave,
  onRename,
  onClear,
  compact,
}: SnapshotButtonProps) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState(snapshot.name || '');

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleClick = useCallback(() => {
    if (snapshot.hasData) {
      onLoad();
    } else {
      onSave();
    }
  }, [snapshot.hasData, onLoad, onSave]);

  const handleSave = useCallback(() => {
    onSave();
    handleCloseMenu();
  }, [onSave, handleCloseMenu]);

  const handleRename = useCallback(() => {
    setNewName(snapshot.name || '');
    setRenameDialogOpen(true);
    handleCloseMenu();
  }, [snapshot.name, handleCloseMenu]);

  const handleRenameConfirm = useCallback(() => {
    onRename(newName);
    setRenameDialogOpen(false);
  }, [onRename, newName]);

  const handleClear = useCallback(() => {
    onClear();
    handleCloseMenu();
  }, [onClear, handleCloseMenu]);

  // Button size based on compact mode
  const size = compact ? 32 : 44;
  const fontSize = compact ? '0.75rem' : '0.9rem';

  // Determine button state colors
  const getButtonStyles = () => {
    if (isActive) {
      return {
        bgcolor: theme.palette.primary.main,
        color: theme.palette.primary.contrastText,
        borderColor: theme.palette.primary.light,
        boxShadow: `0 0 8px ${alpha(theme.palette.primary.main, 0.6)}`,
      };
    }
    if (snapshot.hasData) {
      return {
        bgcolor: alpha(theme.palette.success.main, 0.15),
        color: theme.palette.success.main,
        borderColor: theme.palette.success.main,
      };
    }
    return {
      bgcolor: 'transparent',
      color: theme.palette.text.disabled,
      borderColor: theme.palette.divider,
    };
  };

  const buttonStyles = getButtonStyles();
  const displayName = snapshot.name || `${snapshot.slot + 1}`;

  return (
    <>
      <Tooltip
        title={
          snapshot.hasData
            ? `Load "${displayName}" (click) or right-click for options`
            : `Empty slot - click to save current state`
        }
        placement="top"
      >
        <Box
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          sx={{
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 2,
            borderRadius: 1,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
            ...buttonStyles,
            '&:hover': {
              transform: 'scale(1.05)',
              boxShadow: 2,
            },
            '&:active': {
              transform: 'scale(0.98)',
            },
          }}
        >
          {/* LED indicator for active state */}
          {isActive && (
            <Box
              sx={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#00ff00',
                boxShadow: '0 0 4px #00ff00',
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                },
              }}
            />
          )}

          {/* Slot number or name */}
          <Typography
            sx={{
              fontSize,
              fontWeight: isActive ? 700 : 600,
              userSelect: 'none',
              maxWidth: size - 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {snapshot.name ? snapshot.name.substring(0, 3) : snapshot.slot + 1}
          </Typography>
        </Box>
      </Tooltip>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
              >
                <MenuItem onClick={handleSave}>
                  <ListItemIcon>
            <Save size={16} />
                  </ListItemIcon>
                  <ListItemText>
                    {snapshot.hasData ? 'Overwrite' : 'Save'}
                  </ListItemText>
                </MenuItem>
        {snapshot.hasData && (
          <>
            <MenuItem onClick={handleRename}>
              <ListItemIcon>
                <Edit size={16} />
              </ListItemIcon>
              <ListItemText>Rename</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleClear}>
              <ListItemIcon>
                <Box component="span" sx={{ color: 'error.main', display: 'inline-flex', lineHeight: 0 }}>
                  <TrashCan size={16} />
                </Box>
              </ListItemIcon>
              <ListItemText>Clear</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>Rename Snapshot {snapshot.slot + 1}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            variant="outlined"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            inputProps={{ maxLength: 20 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRenameConfirm} variant="contained">
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
});

SnapshotButton.displayName = 'SnapshotButton';

// ============================================================================
// Main SnapshotBar Component
// ============================================================================

const SnapshotBar = memo(({
  snapshots,
  activeSlot = -1,
  onLoad,
  onSave,
  onRename,
  onClear,
  abModeEnabled = false,
  onToggleABMode,
  isABModeActive = false,
  compact = false,
}: SnapshotBarProps) => {
  const theme = useTheme();

  // Ensure we have 6 snapshots
  const normalizedSnapshots: Snapshot[] = Array.from({ length: 6 }, (_, i) => {
    const existing = snapshots.find((s) => s.slot === i);
    return existing || { slot: i, hasData: false, isActive: false };
  });

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={compact ? 0.5 : 1}
      sx={{
        p: compact ? 0.5 : 1,
        bgcolor: alpha(theme.palette.background.paper, 0.95),
        borderRadius: 1,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Label */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontWeight: 600,
          fontSize: compact ? '0.65rem' : '0.75rem',
          minWidth: compact ? 40 : 60,
        }}
      >
        Snapshots
      </Typography>

      {/* Snapshot buttons */}
      {normalizedSnapshots.map((snapshot) => (
        <SnapshotButton
          key={snapshot.slot}
          snapshot={snapshot}
          isActive={snapshot.slot === activeSlot}
          onLoad={() => onLoad(snapshot.slot)}
          onSave={() => onSave(snapshot.slot)}
          onRename={(name) => onRename(snapshot.slot, name)}
          onClear={() => onClear(snapshot.slot)}
          compact={compact}
        />
      ))}

      {/* A/B Mode toggle */}
      {abModeEnabled && onToggleABMode && (
        <>
          <Box sx={{ width: 1, bgcolor: theme.palette.divider, mx: 0.5 }} />
          <Tooltip title={isABModeActive ? 'Exit A/B Mode' : 'Enter A/B Mode (compare slots 1 & 2)'}>
            <IconButton
              onClick={onToggleABMode}
              size={compact ? 'small' : 'medium'}
              sx={{
                color: isABModeActive ? theme.palette.secondary.main : theme.palette.text.secondary,
                bgcolor: isABModeActive ? alpha(theme.palette.secondary.main, 0.15) : 'transparent',
              }}
            >
              <Compare size={compact ? 16 : 20} />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Stack>
  );
});

SnapshotBar.displayName = 'SnapshotBar';

export default SnapshotBar;
