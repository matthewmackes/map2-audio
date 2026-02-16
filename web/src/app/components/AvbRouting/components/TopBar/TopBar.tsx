/**
 * Top Bar Component
 *
 * Main toolbar for the AVB routing matrix.
 * Contains search, filters, safe patch toggle, and undo/redo controls.
 */

import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Chip,
  Box,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SecurityIcon from '@mui/icons-material/Security';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useRouting, useCanUndo, useCanRedo } from '../../context/RoutingContext';

/**
 * Top bar component
 */
export function TopBar() {
  const { state, dispatch } = useRouting();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_SEARCH', payload: event.target.value });
  };

  const handleSafePatchToggle = () => {
    if (state.safePatchMode) {
      // If already in safe mode, this shouldn't toggle off directly
      // User must use Apply or Discard buttons
      return;
    }
    dispatch({ type: 'ENTER_SAFE_MODE' });
  };

  const handleApplySafeChanges = () => {
    dispatch({ type: 'APPLY_SAFE_CHANGES' });
    // TODO: Trigger batch API call with pending routes
  };

  const handleDiscardSafeChanges = () => {
    dispatch({ type: 'DISCARD_SAFE_CHANGES' });
  };

  const handleUndo = () => {
    dispatch({ type: 'UNDO' });
  };

  const handleRedo = () => {
    dispatch({ type: 'REDO' });
  };

  const pendingCount = Object.keys(state.pendingRoutes).length;
  const connectedCount = Object.values(state.liveRoutes).filter(r => r.state === 'connected').length;
  const endpointCount = Object.keys(state.endpoints).length;

  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar sx={{ gap: 2 }}>
        {/* Title */}
        <Typography variant="h6" sx={{ fontWeight: 600, minWidth: 200 }}>
          AVB Routing Matrix
        </Typography>

        {/* Search */}
        <TextField
          size="small"
          placeholder="Search endpoints..."
          value={state.search}
          onChange={handleSearchChange}
          sx={{ width: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {/* Stats */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip
            label={`${endpointCount} endpoints`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${connectedCount} connected`}
            size="small"
            color="success"
            variant="outlined"
          />
        </Box>

        <Box sx={{ flex: 1 }} /> {/* Spacer */}

        {/* Safe Patch Mode */}
        {state.safePatchMode ? (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip
              icon={<SecurityIcon />}
              label={`Safe Patch (${pendingCount} pending)`}
              color="warning"
              size="small"
            />
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<CheckIcon />}
              onClick={handleApplySafeChanges}
              disabled={pendingCount === 0}
            >
              Apply
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<CloseIcon />}
              onClick={handleDiscardSafeChanges}
            >
              Discard
            </Button>
          </Box>
        ) : (
          <Tooltip title="Enable safe patch mode to stage changes before applying">
            <Button
              size="small"
              variant="outlined"
              startIcon={<SecurityIcon />}
              onClick={handleSafePatchToggle}
            >
              Safe Patch
            </Button>
          </Tooltip>
        )}

        {/* Undo/Redo */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton
                size="small"
                onClick={handleUndo}
                disabled={!canUndo}
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Shift+Z)">
            <span>
              <IconButton
                size="small"
                onClick={handleRedo}
                disabled={!canRedo}
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default TopBar;
