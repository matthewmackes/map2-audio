/**
 * Top Bar Component
 *
 * Main toolbar for the AVB routing matrix.
 * Contains search, filters, safe patch toggle, and undo/redo controls.
 */

import React, { useEffect, useState } from 'react';
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
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { useRouting, useCanUndo, useCanRedo } from '../../context/RoutingContext';
import { useBatchPatchMutation } from '../../hooks/useAvbApi';
import { useNotifications } from '../../hooks/useNotifications';
import { initialRoutingState } from '../../types';
import {
  hasDuplicateSceneName,
  normalizeAndValidateSceneMetadata,
  SCENE_DESCRIPTION_MAX_LENGTH,
  SCENE_MAX_TAGS,
  SCENE_NAME_MAX_LENGTH,
  SCENE_TAG_MAX_LENGTH,
} from '../../utils/sceneValidation';
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
  const [scenesAnchor, setScenesAnchor] = useState<HTMLElement | null>(null);
  const [sceneDiffAnchor, setSceneDiffAnchor] = useState<HTMLElement | null>(null);
  const [sceneCreateNameDraft, setSceneCreateNameDraft] = useState('');
  const [sceneSearchQuery, setSceneSearchQuery] = useState('');
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [sceneEditNameDraft, setSceneEditNameDraft] = useState('');
  const [sceneEditDescriptionDraft, setSceneEditDescriptionDraft] = useState('');
  const [sceneEditTagsDraft, setSceneEditTagsDraft] = useState('');
  const [pendingSceneAction, setPendingSceneAction] = useState<{ action: 'recall' | 'delete'; scene_id: string } | null>(null);

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

  const handleScenesOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setScenesAnchor(event.currentTarget);
    if (!sceneCreateNameDraft.trim()) {
      setSceneCreateNameDraft(`Scene ${Object.keys(state.scenes).length + 1}`);
    }
  };

  const handleScenesClose = () => {
    setScenesAnchor(null);
    setPendingSceneAction(null);
    setSceneSearchQuery('');
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

  const handleSceneCreateNameDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneCreateNameDraft(event.target.value);
  };

  const handleSceneEditNameDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneEditNameDraft(event.target.value);
  };

  const handleSceneEditDescriptionDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneEditDescriptionDraft(event.target.value);
  };

  const handleSceneEditTagsDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneEditTagsDraft(event.target.value);
  };

  const handleSceneSearchQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneSearchQuery(event.target.value);
  };

  const handleSceneSelectionChange = (event: SelectChangeEvent<string>) => {
    setSelectedSceneId(event.target.value || '');
    setPendingSceneAction(null);
  };

  const handleSaveScene = () => {
    const routeCount = Object.keys(state.liveRoutes).length;
    const fallbackName = `Scene ${Object.keys(state.scenes).length + 1}`;
    const validation = normalizeAndValidateSceneMetadata(
      {
        name: sceneCreateNameDraft.trim() || fallbackName,
        description: 'Saved from TopBar',
        tags: ['topbar'],
      },
      { requireName: true }
    );
    if (validation.errors.length > 0) {
      notify.warning(validation.errors[0]);
      return;
    }
    const normalized = validation.normalized;
    const duplicateName = hasDuplicateSceneName(
      normalized.name,
      Object.values(state.scenes).map((scene) => ({ id: scene.id, name: scene.name }))
    );
    if (duplicateName) {
      notify.warning(`Scene name "${normalized.name}" already exists. Saving duplicate snapshot name.`);
    }
    if (validation.warnings.length > 0) {
      notify.info(validation.warnings[0]);
    }

    dispatch({
      type: 'SAVE_SCENE',
      payload: {
        name: normalized.name,
        description: normalized.description,
        tags: normalized.tags,
      },
    });
    notify.success(`Saved scene "${normalized.name}" (${routeCount} routes).`);
    setSceneCreateNameDraft('');
  };

  const handleUpdateSceneMetadata = () => {
    if (!selectedSceneId) {
      notify.warning('Select a saved scene before updating metadata.');
      return;
    }

    const scene = state.scenes[selectedSceneId];
    if (!scene) {
      notify.warning('Selected scene is no longer available. Choose another saved scene.');
      setSelectedSceneId('');
      setPendingSceneAction(null);
      return;
    }

    const validation = normalizeAndValidateSceneMetadata(
      {
        name: sceneEditNameDraft,
        description: sceneEditDescriptionDraft,
        tags: sceneEditTagsDraft.split(','),
      },
      { requireName: true }
    );
    if (validation.errors.length > 0) {
      notify.warning(validation.errors[0]);
      return;
    }
    const nextName = validation.normalized.name;
    const nextDescription = validation.normalized.description;
    const nextTags = validation.normalized.tags;
    const duplicateName = hasDuplicateSceneName(
      nextName,
      Object.values(state.scenes).map((existingScene) => ({ id: existingScene.id, name: existingScene.name })),
      { excludeSceneId: scene.id }
    );
    if (duplicateName) {
      notify.warning(`Scene name "${nextName}" already exists. Update keeps a duplicate name.`);
    }
    if (validation.warnings.length > 0) {
      notify.info(validation.warnings[0]);
    }
    const unchanged =
      nextName === scene.name &&
      nextDescription === scene.description &&
      nextTags.join('|') === scene.tags.join('|');

    if (unchanged) {
      notify.info('No scene metadata changes to apply.');
      return;
    }

    dispatch({
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: scene.id,
        name: nextName,
        description: nextDescription,
        tags: nextTags,
      },
    });
    notify.success(`Updated scene metadata for "${nextName}".`);
    setPendingSceneAction(null);
  };

  const handleRecallScene = () => {
    if (!selectedSceneId) {
      notify.warning('Select a saved scene before recalling.');
      return;
    }

    const scene = state.scenes[selectedSceneId];
    if (!scene) {
      notify.warning('Selected scene is no longer available. Choose another saved scene.');
      setSelectedSceneId('');
      setPendingSceneAction(null);
      return;
    }

    if (!pendingSceneAction || pendingSceneAction.action !== 'recall' || pendingSceneAction.scene_id !== scene.id) {
      setPendingSceneAction({ action: 'recall', scene_id: scene.id });
      notify.warning(`Confirm recall for "${scene.name}" to replace current live routes.`);
      return;
    }

    dispatch({
      type: 'RECALL_SCENE',
      payload: {
        scene_id: scene.id,
      },
    });
    notify.info(`Recalled scene "${scene.name}".`);
    setPendingSceneAction(null);
  };

  const handleDeleteScene = () => {
    if (!selectedSceneId) {
      notify.warning('Select a saved scene before deleting.');
      return;
    }

    const scene = state.scenes[selectedSceneId];
    if (!scene) {
      notify.warning('Selected scene is no longer available. Choose another saved scene.');
      setSelectedSceneId('');
      setPendingSceneAction(null);
      return;
    }

    if (!pendingSceneAction || pendingSceneAction.action !== 'delete' || pendingSceneAction.scene_id !== scene.id) {
      setPendingSceneAction({ action: 'delete', scene_id: scene.id });
      notify.warning(`Confirm delete for "${scene.name}" to permanently remove this snapshot.`);
      return;
    }

    dispatch({
      type: 'DELETE_SCENE',
      payload: {
        scene_id: scene.id,
      },
    });
    notify.info(`Deleted scene "${scene.name}".`);
    setSelectedSceneId('');
    setPendingSceneAction(null);
  };

  const handleGenerateSceneDiff = () => {
    const baselineSceneId = state.sceneDiff.baseline_scene_id;
    const compareSceneId = state.sceneDiff.compare_scene_id;

    if (!baselineSceneId || !compareSceneId) {
      notify.warning('Select both baseline and compare scenes before generating a diff.');
      return;
    }

    const baselineScene = state.scenes[baselineSceneId];
    const compareScene = state.scenes[compareSceneId];
    if (!baselineScene || !compareScene) {
      notify.warning('Selected scene is no longer available. Reselect scenes and retry diff generation.');
      return;
    }

    dispatch({ type: 'GENERATE_SCENE_DIFF' });
    notify.info(`Generated scene diff: ${baselineScene.name} vs ${compareScene.name}.`);
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
  const scenesOpen = Boolean(scenesAnchor);
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
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      return byName !== 0 ? byName : a.id.localeCompare(b.id);
    });
  const normalizedSceneSearchQuery = sceneSearchQuery.trim().toLowerCase();
  const filteredSceneOptions = normalizedSceneSearchQuery
    ? sceneOptions.filter((scene) => (
      scene.name.toLowerCase().includes(normalizedSceneSearchQuery) ||
      scene.id.toLowerCase().includes(normalizedSceneSearchQuery) ||
      scene.description.toLowerCase().includes(normalizedSceneSearchQuery) ||
      scene.tags.some((tag) => tag.toLowerCase().includes(normalizedSceneSearchQuery))
    ))
    : sceneOptions;
  const filteredSceneSummary = normalizedSceneSearchQuery
    ? `${filteredSceneOptions.length} of ${sceneOptions.length} scenes`
    : `${sceneOptions.length} scenes`;
  const sceneNameCounts = sceneOptions.reduce((counts, scene) => {
    const previous = counts.get(scene.name) || 0;
    counts.set(scene.name, previous + 1);
    return counts;
  }, new Map<string, number>());
  const renderSceneOptionLabel = (scene: (typeof sceneOptions)[number]) => (
    (sceneNameCounts.get(scene.name) || 0) > 1
      ? `${scene.name} (${scene.id})`
      : scene.name
  );
  const selectedScene = selectedSceneId ? state.scenes[selectedSceneId] : null;
  const selectedSceneVisible = Boolean(selectedScene && filteredSceneOptions.some((scene) => scene.id === selectedScene.id));
  const selectedSceneIdValue = selectedSceneVisible && selectedScene ? selectedScene.id : '';
  const selectedBaselineScene = state.sceneDiff.baseline_scene_id ?? '';
  const selectedCompareScene = state.sceneDiff.compare_scene_id ?? '';
  const baselineScene = state.sceneDiff.baseline_scene_id
    ? state.scenes[state.sceneDiff.baseline_scene_id]
    : null;
  const compareScene = state.sceneDiff.compare_scene_id
    ? state.scenes[state.sceneDiff.compare_scene_id]
    : null;
  const baselineSceneLabel = baselineScene
    ? baselineScene.name
    : state.sceneDiff.baseline_scene_id ? 'Missing' : 'None';
  const compareSceneLabel = compareScene
    ? compareScene.name
    : state.sceneDiff.compare_scene_id ? 'Missing' : 'None';
  const baselineSceneMissing = Boolean(state.sceneDiff.baseline_scene_id && !baselineScene);
  const compareSceneMissing = Boolean(state.sceneDiff.compare_scene_id && !compareScene);
  const sceneDiffSelectionStale = baselineSceneMissing || compareSceneMissing;
  const sceneDiffSelectionReady =
    Boolean(state.sceneDiff.baseline_scene_id && state.sceneDiff.compare_scene_id) && !sceneDiffSelectionStale;
  const sceneDiffSelectionLabel = sceneDiffSelectionStale
    ? 'Diff selection stale'
    : sceneDiffSelectionReady
      ? 'Diff selection ready'
      : 'Diff selection incomplete';
  const sceneDiffError =
    state.error && state.error.toLowerCase().includes('scene diff')
      ? state.error
      : null;
  const pendingSceneActionMatchesSelection =
    Boolean(
      selectedScene &&
      pendingSceneAction &&
      pendingSceneAction.scene_id === selectedScene.id
    );
  const liveRouteIds = Object.keys(state.liveRoutes).sort((a, b) => a.localeCompare(b));
  const sceneRouteIds = selectedScene
    ? selectedScene.routes.map((route) => route.id).sort((a, b) => a.localeCompare(b))
    : [];
  const liveRouteIdSet = new Set(liveRouteIds);
  const sceneRouteIdSet = new Set(sceneRouteIds);
  const recallToAdd = sceneRouteIds.filter((routeId) => !liveRouteIdSet.has(routeId));
  const recallToRemove = liveRouteIds.filter((routeId) => !sceneRouteIdSet.has(routeId));
  const recallUnchanged = sceneRouteIds.filter((routeId) => liveRouteIdSet.has(routeId));
  const recallImpactSummary = selectedScene
    ? `Impact: +${recallToAdd.length} add, -${recallToRemove.length} remove, =${recallUnchanged.length} unchanged`
    : 'Impact: no scene selected';
  const recallImpactRoutes = selectedScene
    ? `Add: ${recallToAdd.slice(0, 3).join(' | ') || 'none'} · Remove: ${recallToRemove.slice(0, 3).join(' | ') || 'none'}`
    : 'Add: none · Remove: none';
  const sceneImpactText = !selectedScene
    ? 'Select a saved scene to review recall/delete impact.'
    : pendingSceneActionMatchesSelection && pendingSceneAction?.action === 'recall'
      ? `Confirm recall to replace current live routes with "${selectedScene.name}". Press Recall again to proceed.`
      : pendingSceneActionMatchesSelection && pendingSceneAction?.action === 'delete'
        ? `Confirm delete to permanently remove "${selectedScene.name}". Press Delete again to proceed.`
        : `Recall will replace current live routes with "${selectedScene.name}". Delete permanently removes this snapshot.`;

  useEffect(() => {
    if (!selectedScene) {
      setSceneEditNameDraft('');
      setSceneEditDescriptionDraft('');
      setSceneEditTagsDraft('');
      return;
    }

    setSceneEditNameDraft(selectedScene.name);
    setSceneEditDescriptionDraft(selectedScene.description);
    setSceneEditTagsDraft(selectedScene.tags.join(', '));
  }, [selectedScene]);

  useEffect(() => {
    if (selectedSceneId && !selectedScene) {
      setSelectedSceneId('');
      setPendingSceneAction(null);
    }
  }, [selectedSceneId, selectedScene]);

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

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }} data-testid="topbar-scene-status-strip">
          <Chip
            size="small"
            variant="outlined"
            label={`${sceneOptions.length} scene${sceneOptions.length === 1 ? '' : 's'}`}
            data-testid="topbar-scene-status-count"
          />
          <Chip
            size="small"
            variant="outlined"
            color={baselineSceneMissing ? 'warning' : 'default'}
            label={`Baseline: ${baselineSceneLabel}`}
            data-testid="topbar-scene-status-baseline"
          />
          <Chip
            size="small"
            variant="outlined"
            color={compareSceneMissing ? 'warning' : 'default'}
            label={`Compare: ${compareSceneLabel}`}
            data-testid="topbar-scene-status-compare"
          />
          <Chip
            size="small"
            variant="outlined"
            color={sceneDiffSelectionStale ? 'warning' : sceneDiffSelectionReady ? 'success' : 'default'}
            label={sceneDiffSelectionLabel}
            data-testid="topbar-scene-status-readiness"
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

        {/* Scenes */}
        <Tooltip title="Save, recall, and delete scene snapshots">
          <Button
            size="small"
            variant="outlined"
            startIcon={<BookmarkIcon />}
            onClick={handleScenesOpen}
            data-testid="topbar-scenes-button"
          >
            Scenes
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
        open={scenesOpen}
        anchorEl={scenesAnchor}
        onClose={handleScenesClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, width: 360, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Scene Management
          </Typography>

          <TextField
            size="small"
            label="New Scene Name"
            value={sceneCreateNameDraft}
            onChange={handleSceneCreateNameDraftChange}
            helperText={`Max ${SCENE_NAME_MAX_LENGTH} chars`}
            inputProps={{ 'data-testid': 'topbar-scene-name-input' }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveScene}
              data-testid="topbar-scene-save"
            >
              Save Current
            </Button>
            <Chip
              size="small"
              variant="outlined"
              label={`${Object.keys(state.liveRoutes).length} live routes`}
              data-testid="topbar-scene-live-route-count"
            />
          </Box>

          <Divider />

          <TextField
            size="small"
            label="Search Saved Scenes"
            value={sceneSearchQuery}
            onChange={handleSceneSearchQueryChange}
            inputProps={{ 'data-testid': 'topbar-scene-search-input' }}
          />

          <Typography variant="caption" color="text.secondary" data-testid="topbar-scene-search-summary">
            {filteredSceneSummary}
          </Typography>

          <FormControl size="small">
            <InputLabel id="scene-action-select-label">Saved Scene</InputLabel>
            <Select
              labelId="scene-action-select-label"
              label="Saved Scene"
              value={selectedSceneIdValue}
              onChange={handleSceneSelectionChange}
              data-testid="topbar-scene-select"
            >
              <MenuItem value="" data-testid="topbar-scene-select-none">
                <em>None</em>
              </MenuItem>
              {filteredSceneOptions.length === 0 && (
                <MenuItem value="" disabled data-testid="topbar-scene-select-empty">
                  <em>No matching scenes</em>
                </MenuItem>
              )}
              {filteredSceneOptions.map((scene) => (
                <MenuItem
                  key={scene.id}
                  value={scene.id}
                  data-testid={`topbar-scene-option-${sanitizeFilterIdValue(scene.name)}-${sanitizeFilterIdValue(scene.id)}`}
                >
                  {renderSceneOptionLabel(scene)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography
            variant="caption"
            color="text.secondary"
            data-testid="topbar-scene-selected-summary"
          >
            {selectedScene
              ? `Selected: ${selectedScene.name} (${selectedScene.routes.length} routes)`
              : 'Select a saved scene to recall or delete.'}
          </Typography>

          <TextField
            size="small"
            label="Selected Scene Name"
            value={sceneEditNameDraft}
            onChange={handleSceneEditNameDraftChange}
            inputProps={{ 'data-testid': 'topbar-scene-edit-name-input' }}
            disabled={!selectedScene}
          />

          <TextField
            size="small"
            label="Description"
            value={sceneEditDescriptionDraft}
            onChange={handleSceneEditDescriptionDraftChange}
            helperText={`Max ${SCENE_DESCRIPTION_MAX_LENGTH} chars`}
            inputProps={{ 'data-testid': 'topbar-scene-edit-description-input' }}
            disabled={!selectedScene}
          />

          <TextField
            size="small"
            label="Tags (comma separated)"
            value={sceneEditTagsDraft}
            onChange={handleSceneEditTagsDraftChange}
            helperText={`Up to ${SCENE_MAX_TAGS} tags, ${SCENE_TAG_MAX_LENGTH} chars each`}
            inputProps={{ 'data-testid': 'topbar-scene-edit-tags-input' }}
            disabled={!selectedScene}
          />

          <Button
            size="small"
            variant="outlined"
            onClick={handleUpdateSceneMetadata}
            data-testid="topbar-scene-update"
            disabled={!selectedScene}
          >
            Apply Metadata
          </Button>

          <Typography
            variant="caption"
            color="text.secondary"
            data-testid="topbar-scene-impact-summary"
          >
            {recallImpactSummary}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            data-testid="topbar-scene-impact-routes"
          >
            {recallImpactRoutes}
          </Typography>

          <Typography
            variant="caption"
            color={pendingSceneActionMatchesSelection ? 'warning.main' : 'text.secondary'}
            data-testid="topbar-scene-impact-text"
          >
            {sceneImpactText}
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                onClick={handleRecallScene}
                data-testid="topbar-scene-recall"
              >
                {pendingSceneActionMatchesSelection && pendingSceneAction?.action === 'recall'
                  ? 'Recall (Confirm)'
                  : 'Recall'}
              </Button>
              <Button
                size="small"
                color="error"
                onClick={handleDeleteScene}
                data-testid="topbar-scene-delete"
              >
                {pendingSceneActionMatchesSelection && pendingSceneAction?.action === 'delete'
                  ? 'Delete (Confirm)'
                  : 'Delete'}
              </Button>
            </Box>
            <Button
              size="small"
              variant="contained"
              onClick={handleScenesClose}
              data-testid="topbar-scene-close"
            >
              Done
            </Button>
          </Box>
        </Box>
      </Popover>

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
                  data-testid={`topbar-scene-diff-baseline-${sanitizeFilterIdValue(scene.name)}-${sanitizeFilterIdValue(scene.id)}`}
                >
                  {renderSceneOptionLabel(scene)}
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
                  data-testid={`topbar-scene-diff-compare-${sanitizeFilterIdValue(scene.name)}-${sanitizeFilterIdValue(scene.id)}`}
                >
                  {renderSceneOptionLabel(scene)}
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
          {sceneDiffError && (
            <Typography
              variant="caption"
              color="warning.main"
              data-testid="topbar-scene-diff-error"
            >
              {sceneDiffError}
            </Typography>
          )}
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
