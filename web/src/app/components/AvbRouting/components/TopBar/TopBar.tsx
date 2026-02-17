/**
 * Top Bar Component
 *
 * Main toolbar for the AVB routing matrix.
 * Contains search, filters, safe patch toggle, and undo/redo controls.
 */

import React, { useState } from 'react';
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
  Popover,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SecurityIcon from '@mui/icons-material/Security';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useRouting, useCanUndo, useCanRedo } from '../../context/RoutingContext';
import { useBatchPatchMutation } from '../../hooks/useAvbApi';
import { useNotifications } from '../../hooks/useNotifications';
import { initialRoutingState } from '../../types';
import { NodeSelector } from './NodeSelector';
import { NetworkTopologyModal } from '../NetworkTopology/NetworkTopologyModal';

const DEVICE_TYPE_OPTIONS = ['map2', 'avdecc', 'unknown'] as const;

/**
 * Top bar component
 */
export function TopBar() {
  const { state, dispatch } = useRouting();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const batchPatchMutation = useBatchPatchMutation();
  const notify = useNotifications();
  const [topologyModalOpen, setTopologyModalOpen] = useState(false);
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);

  const handleFiltersOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFiltersAnchor(event.currentTarget);
  };

  const handleFiltersClose = () => {
    setFiltersAnchor(null);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_SEARCH', payload: event.target.value });
  };

  const handleToggleAvailableOnly = (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    dispatch({
      type: 'SET_FILTERS',
      payload: {
        availableOnly: checked,
      },
    });
  };

  const handleToggleShowLocked = (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    dispatch({
      type: 'SET_FILTERS',
      payload: {
        showLocked: checked,
      },
    });
  };

  const handleToggleDeviceType = (deviceType: typeof DEVICE_TYPE_OPTIONS[number]) => {
    const selected = new Set(state.filters.deviceTypes);
    if (selected.has(deviceType)) {
      selected.delete(deviceType);
    } else {
      selected.add(deviceType);
    }

    dispatch({
      type: 'SET_FILTERS',
      payload: {
        deviceTypes: DEVICE_TYPE_OPTIONS.filter((option) => selected.has(option)),
      },
    });
  };

  const handleResetFilters = () => {
    dispatch({
      type: 'SET_FILTERS',
      payload: {
        ...initialRoutingState.filters,
      },
    });
  };

  const handleSafePatchToggle = () => {
    if (state.safePatchMode) {
      // If already in safe mode, this shouldn't toggle off directly
      // User must use Apply or Discard buttons
      return;
    }
    dispatch({ type: 'ENTER_SAFE_MODE' });
    notify.info('Safe patch mode enabled. Changes will be staged until applied.');
  };

  const handleApplySafeChanges = () => {
    const operations = Object.entries(state.pendingRoutes)
      .map(([routeId, route]) => {
        const [fallbackTalkerId, fallbackListenerId] = routeId.split('→');
        const talker_id = route.talker_id || fallbackTalkerId || '';
        const listener_id = route.listener_id || fallbackListenerId || '';

        if (!talker_id || !listener_id) {
          return null;
        }

        return {
          talker_id,
          listener_id,
          action: route.state === 'disconnecting' ? ('disconnect' as const) : ('connect' as const),
        };
      })
      .filter((op): op is { talker_id: string; listener_id: string; action: 'connect' | 'disconnect' } => op !== null);

    if (operations.length === 0) {
      notify.warning('No valid staged operations to apply.');
      return;
    }

    const operationCount = operations.length;
    batchPatchMutation.mutate(operations, {
      onSuccess: () => {
        dispatch({ type: 'APPLY_SAFE_CHANGES' });
        notify.success(`Applied ${operationCount} staged change${operationCount === 1 ? '' : 's'}.`);
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Safe patch apply failed';
        dispatch({ type: 'SET_ERROR', payload: message });
        notify.error(`Safe patch apply failed: ${message}`);
      },
    });
  };

  const handleDiscardSafeChanges = () => {
    const count = Object.keys(state.pendingRoutes).length;
    dispatch({ type: 'DISCARD_SAFE_CHANGES' });
    notify.info(`Discarded ${count} staged change${count === 1 ? '' : 's'}.`);
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
  const filtersOpen = Boolean(filtersAnchor);
  const defaultFilters = initialRoutingState.filters;
  const activeFilterCount = [
    state.filters.availableOnly !== defaultFilters.availableOnly,
    state.filters.showLocked !== defaultFilters.showLocked,
    [...state.filters.deviceTypes].sort().join('|') !== [...defaultFilters.deviceTypes].sort().join('|'),
    state.filters.sampleRates.length !== defaultFilters.sampleRates.length,
    state.filters.channelCounts.length !== defaultFilters.channelCounts.length,
    state.filters.groups.length !== defaultFilters.groups.length,
  ].filter(Boolean).length;

  return (
    <AppBar position="static" color="default" elevation={1}>
      {/* Node Selector - Top Row */}
      <NodeSelector />

      {/* Controls - Bottom Row */}
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
          inputProps={{ 'data-testid': 'topbar-search-input' }}
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
          <Chip
            icon={<FilterListIcon />}
            label={activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : 'No filters'}
            size="small"
            color={activeFilterCount > 0 ? 'primary' : 'default'}
            variant="outlined"
            data-testid="topbar-filter-summary"
          />
        </Box>

        <Box sx={{ flex: 1 }} /> {/* Spacer */}

        {/* Filters */}
        <Tooltip title="Open endpoint filter controls">
          <Button
            size="small"
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={handleFiltersOpen}
            data-testid="topbar-filters-button"
          >
            Filters
          </Button>
        </Tooltip>

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
              disabled={pendingCount === 0 || batchPatchMutation.isPending}
            >
              {batchPatchMutation.isPending ? 'Applying...' : 'Apply'}
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

        {/* Network Topology */}
        <Tooltip title="View network topology graph">
          <Button
            size="small"
            variant="outlined"
            startIcon={<AccountTreeIcon />}
            onClick={() => setTopologyModalOpen(true)}
          >
            Topology
          </Button>
        </Tooltip>

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

      <Popover
        open={filtersOpen}
        anchorEl={filtersAnchor}
        onClose={handleFiltersClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, width: 320, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Endpoint Filters
          </Typography>

          <FormGroup>
            <FormControlLabel
              control={(
                <Checkbox
                  checked={state.filters.availableOnly}
                  onChange={handleToggleAvailableOnly}
                  inputProps={{ 'data-testid': 'topbar-filter-available-only' }}
                />
              )}
              label="Available only"
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={state.filters.showLocked}
                  onChange={handleToggleShowLocked}
                  inputProps={{ 'data-testid': 'topbar-filter-show-locked' }}
                />
              )}
              label="Show locked endpoints"
            />
          </FormGroup>

          <Divider />

          <Typography variant="caption" color="text.secondary">
            Device types
          </Typography>
          <FormGroup>
            {DEVICE_TYPE_OPTIONS.map((deviceType) => (
              <FormControlLabel
                key={deviceType}
                control={(
                  <Checkbox
                    checked={state.filters.deviceTypes.includes(deviceType)}
                    onChange={() => handleToggleDeviceType(deviceType)}
                    inputProps={{ 'data-testid': `topbar-filter-device-${deviceType}` }}
                  />
                )}
                label={deviceType.toUpperCase()}
              />
            ))}
          </FormGroup>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.5 }}>
            <Button
              size="small"
              onClick={handleResetFilters}
              data-testid="topbar-filters-reset"
            >
              Reset Filters
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleFiltersClose}
              data-testid="topbar-filters-close"
            >
              Done
            </Button>
          </Box>
        </Box>
      </Popover>

      {/* Network Topology Modal */}
      <NetworkTopologyModal
        open={topologyModalOpen}
        onClose={() => setTopologyModalOpen(false)}
      />
    </AppBar>
  );
}

export default TopBar;
