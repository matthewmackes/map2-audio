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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import SearchIcon from '@mui/icons-material/Search';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SecurityIcon from '@mui/icons-material/Security';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import FilterListIcon from '@mui/icons-material/FilterList';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useRouting, useCanUndo, useCanRedo } from '../../context/RoutingContext';
import { useBatchPatchMutation } from '../../hooks/useAvbApi';
import { useNotifications } from '../../hooks/useNotifications';
import { initialRoutingState } from '../../types';
import { NodeSelector } from './NodeSelector';
import { SceneDiffPreview } from './SceneDiffPreview';
import { NetworkTopologyModal } from '../NetworkTopology/NetworkTopologyModal';

const DEVICE_TYPE_OPTIONS = ['map2', 'avdecc', 'unknown'] as const;

function sanitizeFilterIdValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

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
  const [sceneDiffAnchor, setSceneDiffAnchor] = useState<HTMLElement | null>(null);

  const handleFiltersOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFiltersAnchor(event.currentTarget);
  };

  const handleFiltersClose = () => {
    setFiltersAnchor(null);
  };

  const handleSceneDiffOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setSceneDiffAnchor(event.currentTarget);
  };

  const handleSceneDiffClose = () => {
    setSceneDiffAnchor(null);
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

  const handleToggleSampleRate = (sampleRate: number) => {
    const selected = new Set(state.filters.sampleRates);
    if (selected.has(sampleRate)) {
      selected.delete(sampleRate);
    } else {
      selected.add(sampleRate);
    }

    dispatch({
      type: 'SET_FILTERS',
      payload: {
        sampleRates: Array.from(selected).sort((a, b) => a - b),
      },
    });
  };

  const handleToggleChannelCount = (channelCount: number) => {
    const selected = new Set(state.filters.channelCounts);
    if (selected.has(channelCount)) {
      selected.delete(channelCount);
    } else {
      selected.add(channelCount);
    }

    dispatch({
      type: 'SET_FILTERS',
      payload: {
        channelCounts: Array.from(selected).sort((a, b) => a - b),
      },
    });
  };

  const handleToggleGroup = (group: string) => {
    const selected = new Set(state.filters.groups);
    if (selected.has(group)) {
      selected.delete(group);
    } else {
      selected.add(group);
    }

    dispatch({
      type: 'SET_FILTERS',
      payload: {
        groups: Array.from(selected).sort((a, b) => a.localeCompare(b)),
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

  const handleClearAllFilters = () => {
    dispatch({
      type: 'SET_FILTERS',
      payload: {
        deviceTypes: [],
        sampleRates: [],
        channelCounts: [],
        availableOnly: false,
        showLocked: true,
        groups: [],
      },
    });
  };

  const handleSceneDiffBaselineChange = (event: SelectChangeEvent<string>) => {
    const raw = event.target.value;
    dispatch({
      type: 'SET_SCENE_DIFF_BASELINE',
      payload: raw ? raw : null,
    });
  };

  const handleSceneDiffCompareChange = (event: SelectChangeEvent<string>) => {
    const raw = event.target.value;
    dispatch({
      type: 'SET_SCENE_DIFF_COMPARE',
      payload: raw ? raw : null,
    });
  };

  const handleGenerateSceneDiff = () => {
    dispatch({ type: 'GENERATE_SCENE_DIFF' });
  };

  const handleClearSceneDiff = () => {
    dispatch({ type: 'CLEAR_SCENE_DIFF' });
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
  const sceneDiffOpen = Boolean(sceneDiffAnchor);
  const defaultFilters = initialRoutingState.filters;
  const activeFilterCount = [
    state.filters.availableOnly !== defaultFilters.availableOnly,
    state.filters.showLocked !== defaultFilters.showLocked,
    [...state.filters.deviceTypes].sort().join('|') !== [...defaultFilters.deviceTypes].sort().join('|'),
    state.filters.sampleRates.length !== defaultFilters.sampleRates.length,
    state.filters.channelCounts.length !== defaultFilters.channelCounts.length,
    state.filters.groups.length !== defaultFilters.groups.length,
  ].filter(Boolean).length;
  const endpointValues = Object.values(state.endpoints);
  const sampleRateOptions = Array.from(new Set(endpointValues.map((endpoint) => endpoint.sample_rate))).sort((a, b) => a - b);
  const channelCountOptions = Array.from(new Set(endpointValues.map((endpoint) => endpoint.channels))).sort((a, b) => a - b);
  const groupOptions = Array.from(
    new Set(
      endpointValues
        .map((endpoint) => endpoint.group)
        .filter((group): group is string => typeof group === 'string' && group.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
  const sceneOptions = Object.values(state.scenes)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedBaselineScene = state.sceneDiff.baseline_scene_id ?? '';
  const selectedCompareScene = state.sceneDiff.compare_scene_id ?? '';

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

        {/* Scene Diff */}
        <Tooltip title="Select scenes for read-only diff preview">
          <Button
            size="small"
            variant="outlined"
            startIcon={<CompareArrowsIcon />}
            onClick={handleSceneDiffOpen}
            data-testid="topbar-scene-diff-button"
          >
            Scene Diff
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
        <Box sx={{ p: 2, width: 360, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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

          <Divider />

          <Typography variant="caption" color="text.secondary">
            Sample rates
          </Typography>
          {sampleRateOptions.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              No sample rates discovered
            </Typography>
          ) : (
            <FormGroup>
              {sampleRateOptions.map((sampleRate) => (
                <FormControlLabel
                  key={sampleRate}
                  control={(
                    <Checkbox
                      checked={state.filters.sampleRates.includes(sampleRate)}
                      onChange={() => handleToggleSampleRate(sampleRate)}
                      inputProps={{ 'data-testid': `topbar-filter-sample-${sampleRate}` }}
                    />
                  )}
                  label={`${sampleRate} Hz`}
                />
              ))}
            </FormGroup>
          )}

          <Divider />

          <Typography variant="caption" color="text.secondary">
            Channel counts
          </Typography>
          {channelCountOptions.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              No channel counts discovered
            </Typography>
          ) : (
            <FormGroup>
              {channelCountOptions.map((channelCount) => (
                <FormControlLabel
                  key={channelCount}
                  control={(
                    <Checkbox
                      checked={state.filters.channelCounts.includes(channelCount)}
                      onChange={() => handleToggleChannelCount(channelCount)}
                      inputProps={{ 'data-testid': `topbar-filter-channels-${channelCount}` }}
                    />
                  )}
                  label={`${channelCount} channels`}
                />
              ))}
            </FormGroup>
          )}

          <Divider />

          <Typography variant="caption" color="text.secondary">
            Groups
          </Typography>
          {groupOptions.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              No groups discovered
            </Typography>
          ) : (
            <FormGroup>
              {groupOptions.map((group) => (
                <FormControlLabel
                  key={group}
                  control={(
                    <Checkbox
                      checked={state.filters.groups.includes(group)}
                      onChange={() => handleToggleGroup(group)}
                      inputProps={{ 'data-testid': `topbar-filter-group-${sanitizeFilterIdValue(group)}` }}
                    />
                  )}
                  label={group}
                />
              ))}
            </FormGroup>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                onClick={handleClearAllFilters}
                data-testid="topbar-filters-clear-all"
              >
                Clear All
              </Button>
              <Button
                size="small"
                onClick={handleResetFilters}
                data-testid="topbar-filters-reset"
              >
                Reset Defaults
              </Button>
            </Box>
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

      <Popover
        open={sceneDiffOpen}
        anchorEl={sceneDiffAnchor}
        onClose={handleSceneDiffClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, width: 340, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Scene Diff Controls
          </Typography>

          <FormControl size="small">
            <InputLabel id="scene-diff-baseline-label">Baseline Scene</InputLabel>
            <Select
              labelId="scene-diff-baseline-label"
              label="Baseline Scene"
              value={selectedBaselineScene}
              onChange={handleSceneDiffBaselineChange}
              data-testid="topbar-scene-diff-baseline-select"
            >
              <MenuItem value="" data-testid="topbar-scene-diff-baseline-none">
                <em>None</em>
              </MenuItem>
              {sceneOptions.map((scene) => (
                <MenuItem
                  key={scene.id}
                  value={scene.id}
                  data-testid={`topbar-scene-diff-baseline-${sanitizeFilterIdValue(scene.name)}`}
                >
                  {scene.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small">
            <InputLabel id="scene-diff-compare-label">Compare Scene</InputLabel>
            <Select
              labelId="scene-diff-compare-label"
              label="Compare Scene"
              value={selectedCompareScene}
              onChange={handleSceneDiffCompareChange}
              data-testid="topbar-scene-diff-compare-select"
            >
              <MenuItem value="" data-testid="topbar-scene-diff-compare-none">
                <em>None</em>
              </MenuItem>
              {sceneOptions.map((scene) => (
                <MenuItem
                  key={scene.id}
                  value={scene.id}
                  data-testid={`topbar-scene-diff-compare-${sanitizeFilterIdValue(scene.name)}`}
                >
                  {scene.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                onClick={handleGenerateSceneDiff}
                data-testid="topbar-scene-diff-generate"
              >
                Generate
              </Button>
              <Button
                size="small"
                onClick={handleClearSceneDiff}
                data-testid="topbar-scene-diff-clear"
              >
                Clear
              </Button>
            </Box>
            <Button
              size="small"
              variant="contained"
              onClick={handleSceneDiffClose}
              data-testid="topbar-scene-diff-close"
            >
              Done
            </Button>
          </Box>
        </Box>
      </Popover>

      <SceneDiffPreview />

      {/* Network Topology Modal */}
      <NetworkTopologyModal
        open={topologyModalOpen}
        onClose={() => setTopologyModalOpen(false)}
      />
    </AppBar>
  );
}

export default TopBar;
