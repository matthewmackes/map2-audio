/**
 * Top Bar Component
 *
 * Main toolbar for the AVB routing matrix.
 * Contains search, filters, safe patch toggle, and undo/redo controls.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Checkmark,
  Close,
  Compare,
  Filter,
  Redo,
  Search,
  Security,
  TreeViewAlt,
  Undo,
} from '@carbon/icons-react';
import {
  AppBar,
  Toolbar,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Chip,
  Box,
  Popover,
  FormGroup,
  FormControlLabel,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useRouting, useCanUndo, useCanRedo } from '../../context/RoutingContext';
import {
  useAvbDevices,
  useAvbStreams,
  useBatchPatchMutation,
} from '../../hooks/useAvbApi';
import { useNotifications } from '../../hooks/useNotifications';
import { clearAllFilterState, defaultFilterState, FILTER_QUALITY_OPTIONS, initialRoutingState } from '../../types';
import type { AuditLogEntry, FilterQuality, StreamDirection } from '../../types';
import { countEndpointsWithOperationalIssues } from '../../utils/endpointIssues';
import {
  countActiveFilters,
  FILTER_DEVICE_TYPE_OPTIONS,
  FILTER_DIRECTION_OPTIONS,
  resolveEndpointHostId,
} from '../../utils/filters';
import {
  generateUniqueSceneName,
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
import './TopBar.css';

const SCENE_IMPACT_PAGE_SIZE = 5;
const SCENE_AUDIT_DISPLAY_LIMIT = 8;
const SCENE_DIFF_IMPORT_PREVIEW_PAGE_SIZE = 12;
const DIRECTION_LABELS: Record<StreamDirection, string> = {
  talker: 'Talkers',
  listener: 'Listeners',
};
const QUALITY_LABELS: Record<FilterQuality, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
};
const SCENE_DIFF_PREVIEW_CONTROL_FOCUS_SX = {
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: 2,
  },
} as const;
const SCENE_STATUS_COUNTER_FOCUS_SX = {
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: 2,
  },
} as const;
const SCENE_DIFF_IMPORT_PREVIEW_STATUS_ORDER: Record<SceneDiffPresetTransferPreviewRow['status'], number> = {
  conflict: 0,
  accepted: 1,
  skipped: 2,
};

const SCENE_DIFF_IMPORT_PREVIEW_INITIAL_COLLAPSE_STATE: Record<SceneDiffPresetTransferPreviewRow['status'], boolean> = {
  conflict: false,
  accepted: false,
  skipped: false,
};

function sanitizeFilterIdValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isKeyboardActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

function handleKeyboardActivation(
  event: React.KeyboardEvent<HTMLElement>,
  callback: () => void
): void {
  if (!isKeyboardActivationKey(event.key)) {
    return;
  }
  event.preventDefault();
  callback();
}

type SceneDiffConflictResolutionMode = 'upsert' | 'rename' | 'skip';

function isConflictResolutionMode(value: unknown): value is SceneDiffConflictResolutionMode {
  return value === 'upsert' || value === 'rename' || value === 'skip';
}

function formatConflictResolutionModeLabel(
  mode: SceneDiffConflictResolutionMode | null | undefined
): string {
  if (mode === 'rename') {
    return 'Rename';
  }
  if (mode === 'skip') {
    return 'Skip';
  }
  return 'Upsert';
}

type SceneDiffPresetTransferEntry = {
  name: string;
  baseline_scene_id: string;
  compare_scene_id: string;
  notes: string;
  preset_version: number;
  preferred_conflict_action?: SceneDiffConflictResolutionMode;
};

type SceneDiffPresetTransferPreviewRow = {
  row_id: string;
  name: string;
  status: 'accepted' | 'conflict' | 'skipped';
  reason: string;
  incoming: SceneDiffPresetTransferEntry | null;
  existing?: {
    id: string;
    name: string;
    baseline_scene_id: string;
    compare_scene_id: string;
    notes?: string;
    preset_version?: number;
  } | null;
};

type SceneDiffPresetTransferPreview = {
  source_count: number;
  accepted_count: number;
  conflict_count: number;
  skipped_count: number;
  schema_version: number | null;
  compatibility_hint: string | null;
  preferred_conflict_action: SceneDiffConflictResolutionMode | null;
  accepted_presets: SceneDiffPresetTransferEntry[];
  rows: SceneDiffPresetTransferPreviewRow[];
};

type SceneDiffConflictResolutionEntry = {
  mode: SceneDiffConflictResolutionMode;
  rename_draft: string;
};

type SceneDiffConflictResolutionState = Record<string, SceneDiffConflictResolutionEntry>;

type SceneDiffPresetImportPlan = {
  presets: SceneDiffPresetTransferEntry[];
  upserted_conflicts: number;
  renamed_conflicts: number;
  skipped_conflicts: number;
  row_errors: Record<string, string>;
  errors: string[];
};

function isSceneDiffPreviewAuditEntry(entry: AuditLogEntry): boolean {
  if (entry.event_type !== 'SCENE_DIFF') {
    return false;
  }
  const mode = entry.payload.mode;
  return typeof mode === 'string' && mode.startsWith('preset_import_preview_');
}

function buildSceneDiffPresetImportPreview(
  draft: string,
  options: {
    sceneExists: (sceneId: string) => boolean;
    existingPresets: Array<{
      id: string;
      name: string;
      baseline_scene_id: string;
      compare_scene_id: string;
      notes?: string;
      preset_version?: number;
    }>;
  }
): { preview: SceneDiffPresetTransferPreview | null; error: string | null } {
  const trimmed = draft.trim();
  if (!trimmed) {
    return {
      preview: null,
      error: 'Paste preset JSON before previewing import.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      preview: null,
      error: 'Preset JSON is invalid. Fix syntax and retry preview.',
    };
  }

  let schemaVersion: number | null = null;
  let compatibilityHint: string | null = null;
  let preferredConflictAction: SceneDiffConflictResolutionMode | null = null;
  const rawPresets = (() => {
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const container = parsed as {
      presets?: unknown[];
      schema_version?: unknown;
      compatibility_hint?: unknown;
      preferred_conflict_action?: unknown;
    };
    if (!Array.isArray(container.presets)) {
      return null;
    }
    if (
      typeof container.schema_version !== 'number' ||
      !Number.isFinite(container.schema_version) ||
      container.schema_version <= 0 ||
      !Number.isInteger(container.schema_version)
    ) {
      return null;
    }
    schemaVersion = container.schema_version;
    if (schemaVersion !== 1) {
      return '__UNSUPPORTED_SCHEMA__';
    }
    if (
      container.compatibility_hint !== undefined &&
      typeof container.compatibility_hint !== 'string'
    ) {
      return '__INVALID_COMPAT_HINT__';
    }
    if (
      container.preferred_conflict_action !== undefined &&
      !isConflictResolutionMode(container.preferred_conflict_action)
    ) {
      return '__INVALID_CONFLICT_ACTION_HINT__';
    }
    compatibilityHint = typeof container.compatibility_hint === 'string'
      ? container.compatibility_hint
      : null;
    preferredConflictAction = isConflictResolutionMode(container.preferred_conflict_action)
      ? container.preferred_conflict_action
      : null;
    return container.presets;
  })();
  if (rawPresets === '__UNSUPPORTED_SCHEMA__') {
    return {
      preview: null,
      error: `Unsupported preset schema_version ${schemaVersion}. Expected schema_version 1.`,
    };
  }
  if (rawPresets === '__INVALID_COMPAT_HINT__') {
    return {
      preview: null,
      error: 'Preset JSON compatibility_hint must be a string when provided.',
    };
  }
  if (rawPresets === '__INVALID_CONFLICT_ACTION_HINT__') {
    return {
      preview: null,
      error: 'Preset JSON preferred_conflict_action must be one of: upsert, rename, skip.',
    };
  }
  if (!rawPresets) {
    return {
      preview: null,
      error: 'Preset JSON must be an array or an object with presets + schema_version.',
    };
  }

  const existingByName = new Map(
    options.existingPresets.map((preset) => [preset.name.toLowerCase(), preset])
  );
  const importSeenNames = new Set<string>();
  const rows: SceneDiffPresetTransferPreviewRow[] = [];
  const acceptedPresets: SceneDiffPresetTransferEntry[] = [];

  let conflictCount = 0;
  let skippedCount = 0;

  rawPresets.forEach((entry, index) => {
    const rowId = `row-${index + 1}`;
    if (!entry || typeof entry !== 'object') {
      skippedCount += 1;
      rows.push({
        row_id: rowId,
        name: `<entry ${index + 1}>`,
        status: 'skipped',
        reason: 'Entry is not an object',
        incoming: null,
      });
      return;
    }

    const candidate = entry as {
      name?: unknown;
      baseline_scene_id?: unknown;
      compare_scene_id?: unknown;
      notes?: unknown;
      preset_version?: unknown;
      preferred_conflict_action?: unknown;
    };
    if (
      typeof candidate.name !== 'string' ||
      typeof candidate.baseline_scene_id !== 'string' ||
      typeof candidate.compare_scene_id !== 'string'
    ) {
      skippedCount += 1;
      rows.push({
        row_id: rowId,
        name: typeof candidate.name === 'string' ? candidate.name : `<entry ${index + 1}>`,
        status: 'skipped',
        reason: 'Missing required fields (name, baseline_scene_id, compare_scene_id)',
        incoming: null,
      });
      return;
    }

    const validation = normalizeAndValidateSceneMetadata(
      {
        name: candidate.name,
        description: typeof candidate.notes === 'string' ? candidate.notes : '',
        tags: [],
      },
      { requireName: true }
    );
    if (validation.errors.length > 0) {
      skippedCount += 1;
      rows.push({
        row_id: rowId,
        name: candidate.name,
        status: 'skipped',
        reason: validation.errors[0],
        incoming: null,
      });
      return;
    }

    const normalizedName = validation.normalized.name;
    const normalizedNameLower = normalizedName.toLowerCase();
    if (importSeenNames.has(normalizedNameLower)) {
      skippedCount += 1;
      rows.push({
        row_id: rowId,
        name: normalizedName,
        status: 'skipped',
        reason: 'Duplicate preset name within import payload',
        incoming: null,
      });
      return;
    }

    if (!options.sceneExists(candidate.baseline_scene_id) || !options.sceneExists(candidate.compare_scene_id)) {
      skippedCount += 1;
      rows.push({
        row_id: rowId,
        name: normalizedName,
        status: 'skipped',
        reason: 'Referenced scene IDs are not available in current inventory',
        incoming: null,
      });
      return;
    }

    const preferredConflictActionHint = candidate.preferred_conflict_action;
    if (
      preferredConflictActionHint !== undefined &&
      !isConflictResolutionMode(preferredConflictActionHint)
    ) {
      skippedCount += 1;
      rows.push({
        row_id: rowId,
        name: normalizedName,
        status: 'skipped',
        reason: 'Invalid preferred_conflict_action hint (expected upsert, rename, or skip)',
        incoming: null,
      });
      return;
    }

    const normalizedVersion =
      typeof candidate.preset_version === 'number' &&
      Number.isFinite(candidate.preset_version) &&
      candidate.preset_version > 0
        ? Math.floor(candidate.preset_version)
        : 1;
    const normalizedPreset: SceneDiffPresetTransferEntry = {
      name: normalizedName,
      baseline_scene_id: candidate.baseline_scene_id,
      compare_scene_id: candidate.compare_scene_id,
      notes: validation.normalized.description,
      preset_version: normalizedVersion,
      preferred_conflict_action: isConflictResolutionMode(preferredConflictActionHint)
        ? preferredConflictActionHint
        : undefined,
    };
    importSeenNames.add(normalizedNameLower);
    acceptedPresets.push(normalizedPreset);

    const existing = existingByName.get(normalizedNameLower) || null;
    if (existing) {
      conflictCount += 1;
      rows.push({
        row_id: rowId,
        name: normalizedName,
        status: 'conflict',
        reason: 'Will upsert existing preset by name',
        incoming: normalizedPreset,
        existing,
      });
      return;
    }

    rows.push({
      row_id: rowId,
      name: normalizedName,
      status: 'accepted',
      reason: 'Ready to import',
      incoming: normalizedPreset,
      existing: null,
    });
  });

  return {
    preview: {
      source_count: rawPresets.length,
      accepted_count: acceptedPresets.length,
      conflict_count: conflictCount,
      skipped_count: skippedCount,
      schema_version: schemaVersion,
      compatibility_hint: compatibilityHint,
      preferred_conflict_action: preferredConflictAction,
      accepted_presets: acceptedPresets,
      rows,
    },
    error: null,
  };
}

function buildInitialSceneDiffConflictResolution(
  preview: SceneDiffPresetTransferPreview,
  existingPresets: Array<{ id: string; name: string }>
): SceneDiffConflictResolutionState {
  const renameInventory = existingPresets.map((preset) => ({ id: preset.id, name: preset.name }));
  const resolutions: SceneDiffConflictResolutionState = {};

  preview.rows.forEach((row, index) => {
    if (row.status !== 'conflict' || !row.incoming) {
      return;
    }
    const defaultConflictMode =
      row.incoming.preferred_conflict_action ||
      preview.preferred_conflict_action ||
      'upsert';
    const renameDraft = generateUniqueSceneName(
      `${row.incoming.name} Imported`,
      renameInventory
    );
    renameInventory.push({
      id: `preview-conflict-${index + 1}`,
      name: renameDraft,
    });
    resolutions[row.row_id] = {
      mode: defaultConflictMode,
      rename_draft: renameDraft,
    };
  });

  return resolutions;
}

function buildSceneDiffPresetImportPlan(
  preview: SceneDiffPresetTransferPreview,
  conflictResolutions: SceneDiffConflictResolutionState,
  existingPresets: Array<{ name: string }>
): SceneDiffPresetImportPlan {
  const existingNamesLower = new Set(existingPresets.map((preset) => preset.name.toLowerCase()));
  const resolvedNamesLower = new Set<string>();
  const presets: SceneDiffPresetTransferEntry[] = [];
  const rowErrors: Record<string, string> = {};
  const errors: string[] = [];
  let upsertedConflicts = 0;
  let renamedConflicts = 0;
  let skippedConflicts = 0;

  preview.rows.forEach((row) => {
    if (!row.incoming) {
      return;
    }

    let resolvedPreset: SceneDiffPresetTransferEntry = row.incoming;
    if (row.status === 'conflict') {
      const resolution = conflictResolutions[row.row_id];
      const mode = resolution?.mode || 'upsert';
      if (mode === 'skip') {
        skippedConflicts += 1;
        return;
      }

      if (mode === 'rename') {
        const renameValidation = normalizeAndValidateSceneMetadata(
          {
            name: resolution?.rename_draft || '',
            description: row.incoming.notes,
            tags: [],
          },
          { requireName: true }
        );
        if (renameValidation.errors.length > 0) {
          const error = `Conflict preset "${row.name}" rename is invalid: ${renameValidation.errors[0]}`;
          rowErrors[row.row_id] = error;
          errors.push(error);
          return;
        }
        const renamedName = renameValidation.normalized.name;
        if (existingNamesLower.has(renamedName.toLowerCase())) {
          const error = `Conflict preset "${row.name}" rename "${renamedName}" already exists.`;
          rowErrors[row.row_id] = error;
          errors.push(error);
          return;
        }
        resolvedPreset = {
          ...resolvedPreset,
          name: renamedName,
        };
        renamedConflicts += 1;
      } else {
        upsertedConflicts += 1;
      }
    }

    const resolvedNameLower = resolvedPreset.name.toLowerCase();
    if (resolvedNamesLower.has(resolvedNameLower)) {
      const error = `Import contains duplicate resolved preset name "${resolvedPreset.name}".`;
      rowErrors[row.row_id] = error;
      errors.push(error);
      return;
    }
    resolvedNamesLower.add(resolvedNameLower);
    presets.push(resolvedPreset);
  });

  return {
    presets,
    upserted_conflicts: upsertedConflicts,
    renamed_conflicts: renamedConflicts,
    skipped_conflicts: skippedConflicts,
    row_errors: rowErrors,
    errors,
  };
}

/**
 * Top bar component
 */
export function TopBar() {
  // T2475 E1: useTheme/useMediaQuery dropped — `isMobile` is now
  // computed from window.matchMedia so the component no longer
  // depends on MUI's theme provider for layout decisions. Falls back
  // to false on SSR/non-DOM environments. Updates on resize.
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(max-width: 599px)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 599px)')
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const { state, dispatch } = useRouting();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const batchPatchMutation = useBatchPatchMutation();
  const { data: avbDevicesData } = useAvbDevices();
  const { data: avbStreamsData } = useAvbStreams();
  const notify = useNotifications();
  const [topologyModalOpen, setTopologyModalOpen] = useState(false);
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null);
  const [scenesAnchor, setScenesAnchor] = useState<HTMLElement | null>(null);
  const [sceneDiffAnchor, setSceneDiffAnchor] = useState<HTMLElement | null>(null);
  const [sceneCreateNameDraft, setSceneCreateNameDraft] = useState('');
  const [sceneAutoSuffixDuplicates, setSceneAutoSuffixDuplicates] = useState(true);
  const [sceneDiffPresetNameDraft, setSceneDiffPresetNameDraft] = useState('');
  const [sceneDiffPresetNotesDraft, setSceneDiffPresetNotesDraft] = useState('');
  const [sceneDiffPresetVersionDraft, setSceneDiffPresetVersionDraft] = useState('1');
  const [sceneDiffPresetConflictPolicyDraft, setSceneDiffPresetConflictPolicyDraft] = useState<SceneDiffConflictResolutionMode>('upsert');
  const [sceneDiffPresetTransferDraft, setSceneDiffPresetTransferDraft] = useState('');
  const [sceneDiffPresetImportPreview, setSceneDiffPresetImportPreview] = useState<SceneDiffPresetTransferPreview | null>(null);
  const [sceneDiffConflictResolutions, setSceneDiffConflictResolutions] = useState<SceneDiffConflictResolutionState>({});
  const [sceneDiffImportPreviewCollapsedGroups, setSceneDiffImportPreviewCollapsedGroups] = useState(
    SCENE_DIFF_IMPORT_PREVIEW_INITIAL_COLLAPSE_STATE
  );
  const [sceneDiffPresetImportPreviewPageIndex, setSceneDiffPresetImportPreviewPageIndex] = useState(0);
  const [sceneDiffSelectedPresetId, setSceneDiffSelectedPresetId] = useState('');
  const [sceneSearchQuery, setSceneSearchQuery] = useState('');
  const [sceneAuditSearchQuery, setSceneAuditSearchQuery] = useState('');
  const [sceneAuditOutcomeFilter, setSceneAuditOutcomeFilter] = useState<'all' | 'success' | 'warning' | 'error'>('all');
  const [sceneAuditRememberFilters, setSceneAuditRememberFilters] = useState(false);
  const [sceneAuditDiffPreviewOnly, setSceneAuditDiffPreviewOnly] = useState(false);
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [sceneEditNameDraft, setSceneEditNameDraft] = useState('');
  const [sceneEditDescriptionDraft, setSceneEditDescriptionDraft] = useState('');
  const [sceneEditTagsDraft, setSceneEditTagsDraft] = useState('');
  const [sceneImpactExpanded, setSceneImpactExpanded] = useState(false);
  const [sceneImpactDisplayLimit, setSceneImpactDisplayLimit] = useState(SCENE_IMPACT_PAGE_SIZE);
  const [pendingSceneAction, setPendingSceneAction] = useState<{ action: 'recall' | 'delete'; scene_id: string } | null>(null);

  const handleFiltersOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFiltersAnchor(event.currentTarget);
  };

  const handleFiltersClose = () => {
    setFiltersAnchor(null);
  };

  const handleSceneDiffOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setSceneDiffAnchor(event.currentTarget);
    if (!sceneDiffPresetNameDraft.trim()) {
      const baselineScene = state.sceneDiff.baseline_scene_id
        ? state.scenes[state.sceneDiff.baseline_scene_id]
        : null;
      const compareScene = state.sceneDiff.compare_scene_id
        ? state.scenes[state.sceneDiff.compare_scene_id]
        : null;
      if (baselineScene && compareScene) {
        setSceneDiffPresetNameDraft(`${baselineScene.name} vs ${compareScene.name}`);
      }
    }
  };

  const handleSceneDiffClose = () => {
    if (sceneDiffPresetImportPreview) {
      dispatch({
        type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
        payload: {
          phase: 'cancelled',
          reason: 'popover_closed',
          source_count: sceneDiffPresetImportPreview.source_count,
          accepted_count: sceneDiffPresetImportPreview.accepted_count,
          conflict_count: sceneDiffPresetImportPreview.conflict_count,
          skipped_count: sceneDiffPresetImportPreview.skipped_count,
          preferred_conflict_action: sceneDiffPresetImportPreview.preferred_conflict_action,
        },
      });
    }
    setSceneDiffAnchor(null);
    setSceneDiffPresetImportPreview(null);
    setSceneDiffConflictResolutions({});
    setSceneDiffImportPreviewCollapsedGroups(SCENE_DIFF_IMPORT_PREVIEW_INITIAL_COLLAPSE_STATE);
    setSceneDiffPresetImportPreviewPageIndex(0);
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
    if (!sceneAuditRememberFilters) {
      setSceneAuditSearchQuery('');
      setSceneAuditOutcomeFilter('all');
      setSceneAuditDiffPreviewOnly(false);
    }
    setSceneImpactExpanded(false);
    setSceneImpactDisplayLimit(SCENE_IMPACT_PAGE_SIZE);
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

  const handleToggleIssuesOnly = (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    dispatch({
      type: 'SET_FILTERS',
      payload: {
        issuesOnly: checked,
      },
    });
  };

  const handleToggleIssuesOnlyChip = () => {
    dispatch({
      type: 'SET_FILTERS',
      payload: {
        issuesOnly: !state.filters.issuesOnly,
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

  const handleToggleDeviceType = (deviceType: typeof FILTER_DEVICE_TYPE_OPTIONS[number]) => {
    const selected = new Set(state.filters.deviceTypes);
    if (selected.has(deviceType)) {
      selected.delete(deviceType);
    } else {
      selected.add(deviceType);
    }

    dispatch({
      type: 'SET_FILTERS',
      payload: {
        deviceTypes: FILTER_DEVICE_TYPE_OPTIONS.filter((option) => selected.has(option)),
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

  const handleToggleHost = (hostId: string) => {
    const selected = new Set(state.filters.hostIds.map((value) => value.toLowerCase()));
    const normalizedHostId = hostId.toLowerCase();
    if (selected.has(normalizedHostId)) {
      selected.delete(normalizedHostId);
    } else {
      selected.add(normalizedHostId);
    }

    dispatch({
      type: 'SET_FILTERS',
      payload: {
        hostIds: Array.from(selected).sort((a, b) => a.localeCompare(b)),
      },
    });
  };

  const handleToggleDirection = (direction: StreamDirection) => {
    const selected = new Set(state.filters.directions);
    if (selected.has(direction)) {
      selected.delete(direction);
    } else {
      selected.add(direction);
    }

    dispatch({
      type: 'SET_FILTERS',
      payload: {
        directions: FILTER_DIRECTION_OPTIONS.filter((option) => selected.has(option)),
      },
    });
  };

  const handleToggleQuality = (quality: FilterQuality) => {
    const selected = new Set(state.filters.qualities);
    if (selected.has(quality)) {
      selected.delete(quality);
    } else {
      selected.add(quality);
    }

    dispatch({
      type: 'SET_FILTERS',
      payload: {
        qualities: FILTER_QUALITY_OPTIONS.filter((option) => selected.has(option)),
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
        ...clearAllFilterState,
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

  const handleSceneDiffPresetNameDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneDiffPresetNameDraft(event.target.value);
  };

  const handleSceneDiffPresetNotesDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneDiffPresetNotesDraft(event.target.value);
  };

  const handleSceneDiffPresetVersionDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneDiffPresetVersionDraft(event.target.value);
  };

  const handleSceneDiffPresetConflictPolicyDraftChange = (event: SelectChangeEvent<string>) => {
    const raw = event.target.value;
    setSceneDiffPresetConflictPolicyDraft(isConflictResolutionMode(raw) ? raw : 'upsert');
  };

  const handleSceneDiffPresetConflictPolicyReset = () => {
    setSceneDiffPresetConflictPolicyDraft('upsert');
  };

  const handleSceneDiffPresetTransferDraftChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (sceneDiffPresetImportPreview) {
      dispatch({
        type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
        payload: {
          phase: 'cancelled',
          reason: 'transfer_draft_changed',
          source_count: sceneDiffPresetImportPreview.source_count,
          accepted_count: sceneDiffPresetImportPreview.accepted_count,
          conflict_count: sceneDiffPresetImportPreview.conflict_count,
          skipped_count: sceneDiffPresetImportPreview.skipped_count,
          preferred_conflict_action: sceneDiffPresetImportPreview.preferred_conflict_action,
        },
      });
    }
    setSceneDiffPresetTransferDraft(event.target.value);
    setSceneDiffPresetImportPreview(null);
    setSceneDiffConflictResolutions({});
    setSceneDiffImportPreviewCollapsedGroups(SCENE_DIFF_IMPORT_PREVIEW_INITIAL_COLLAPSE_STATE);
    setSceneDiffPresetImportPreviewPageIndex(0);
  };

  const handleSceneDiffPresetSelectionChange = (event: SelectChangeEvent<string>) => {
    const nextId = event.target.value || '';
    setSceneDiffSelectedPresetId(nextId);
    if (!nextId) {
      setSceneDiffPresetConflictPolicyDraft('upsert');
      return;
    }
    const preset = (state.sceneDiff.presets || []).find((entry) => entry.id === nextId);
    if (!preset) {
      return;
    }
    setSceneDiffPresetNameDraft(preset.name);
    setSceneDiffPresetNotesDraft(preset.notes || '');
    setSceneDiffPresetVersionDraft(String(preset.preset_version || 1));
    setSceneDiffPresetConflictPolicyDraft(preset.preferred_conflict_action || 'upsert');
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

  const handleSceneAuditSearchQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSceneAuditSearchQuery(event.target.value);
    setSceneAuditDiffPreviewOnly(false);
  };

  const handleSceneAuditRememberFiltersToggle = (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setSceneAuditRememberFilters(checked);
  };

  const handleSceneAuditOutcomeFilterChange = (event: SelectChangeEvent<string>) => {
    setSceneAuditDiffPreviewOnly(false);
    const raw = event.target.value;
    if (raw === 'success' || raw === 'warning' || raw === 'error') {
      setSceneAuditOutcomeFilter(raw);
      return;
    }
    setSceneAuditOutcomeFilter('all');
  };

  const handleSceneAuditQuickFilter = (mode: 'all' | 'errors' | 'warnings' | 'deletes' | 'diff_preview') => {
    if (mode === 'all') {
      setSceneAuditSearchQuery('');
      setSceneAuditOutcomeFilter('all');
      setSceneAuditDiffPreviewOnly(false);
      return;
    }
    if (mode === 'errors') {
      setSceneAuditSearchQuery('');
      setSceneAuditOutcomeFilter('error');
      setSceneAuditDiffPreviewOnly(false);
      return;
    }
    if (mode === 'warnings') {
      setSceneAuditSearchQuery('');
      setSceneAuditOutcomeFilter('warning');
      setSceneAuditDiffPreviewOnly(false);
      return;
    }
    if (mode === 'diff_preview') {
      setSceneAuditSearchQuery('');
      setSceneAuditOutcomeFilter('all');
      setSceneAuditDiffPreviewOnly(true);
      return;
    }
    setSceneAuditSearchQuery('delete');
    setSceneAuditOutcomeFilter('all');
    setSceneAuditDiffPreviewOnly(false);
  };

  const handleSceneAuditCounterOpen = (
    anchorEl: HTMLElement,
    mode: 'errors' | 'warnings' | 'deletes' | 'diff_preview_warnings'
  ) => {
    setScenesAnchor(anchorEl);
    setPendingSceneAction(null);
    setSceneImpactExpanded(false);
    setSceneImpactDisplayLimit(SCENE_IMPACT_PAGE_SIZE);
    if (mode === 'diff_preview_warnings') {
      handleSceneAuditQuickFilter('diff_preview');
      setSceneAuditOutcomeFilter('warning');
      return;
    }
    handleSceneAuditQuickFilter(mode);
  };

  const handleSceneAutoSuffixToggle = (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setSceneAutoSuffixDuplicates(checked);
  };

  const handleSceneImpactToggle = () => {
    setSceneImpactExpanded((expanded) => !expanded);
  };

  const handleSceneImpactShowMore = () => {
    setSceneImpactDisplayLimit((limit) => limit + SCENE_IMPACT_PAGE_SIZE);
  };

  const handleSceneImpactReset = () => {
    setSceneImpactDisplayLimit(SCENE_IMPACT_PAGE_SIZE);
  };

  const handleSceneSelectionChange = (event: SelectChangeEvent<string>) => {
    setSelectedSceneId(event.target.value || '');
    setPendingSceneAction(null);
    setSceneImpactExpanded(false);
    setSceneImpactDisplayLimit(SCENE_IMPACT_PAGE_SIZE);
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
    const sceneInventory = Object.values(state.scenes).map((scene) => ({ id: scene.id, name: scene.name }));
    const duplicateName = hasDuplicateSceneName(
      normalized.name,
      sceneInventory
    );
    const resolvedName = duplicateName && sceneAutoSuffixDuplicates
      ? generateUniqueSceneName(normalized.name, sceneInventory)
      : normalized.name;
    if (duplicateName) {
      if (sceneAutoSuffixDuplicates) {
        notify.info(`Duplicate name detected. Auto-suffixed to "${resolvedName}".`);
      } else {
        notify.warning(`Scene name "${normalized.name}" already exists. Saving duplicate snapshot name.`);
      }
    }
    if (validation.warnings.length > 0) {
      notify.info(validation.warnings[0]);
    }

    dispatch({
      type: 'SAVE_SCENE',
      payload: {
        name: resolvedName,
        description: normalized.description,
        tags: normalized.tags,
      },
    });
    notify.success(`Saved scene "${resolvedName}" (${routeCount} routes).`);
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
    const sceneInventory = Object.values(state.scenes).map((existingScene) => ({ id: existingScene.id, name: existingScene.name }));
    const duplicateName = hasDuplicateSceneName(
      nextName,
      sceneInventory,
      { excludeSceneId: scene.id }
    );
    const resolvedName = duplicateName && sceneAutoSuffixDuplicates
      ? generateUniqueSceneName(nextName, sceneInventory, { excludeSceneId: scene.id })
      : nextName;
    if (duplicateName) {
      if (sceneAutoSuffixDuplicates) {
        notify.info(`Duplicate name detected. Auto-suffixed update to "${resolvedName}".`);
      } else {
        notify.warning(`Scene name "${nextName}" already exists. Update keeps a duplicate name.`);
      }
    }
    if (validation.warnings.length > 0) {
      notify.info(validation.warnings[0]);
    }
    const unchanged =
      resolvedName === scene.name &&
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
        name: resolvedName,
        description: nextDescription,
        tags: nextTags,
      },
    });
    notify.success(`Updated scene metadata for "${resolvedName}".`);
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

  const handleSwapSceneDiffSelection = () => {
    const baselineSceneId = state.sceneDiff.baseline_scene_id;
    const compareSceneId = state.sceneDiff.compare_scene_id;
    if (!baselineSceneId || !compareSceneId) {
      notify.warning('Select both baseline and compare scenes before swapping.');
      return;
    }
    dispatch({ type: 'SWAP_SCENE_DIFF_SELECTION' });
    dispatch({ type: 'GENERATE_SCENE_DIFF' });
    notify.info('Swapped baseline and compare scene selections.');
  };

  const handleSaveSceneDiffPreset = () => {
    const baselineSceneId = state.sceneDiff.baseline_scene_id;
    const compareSceneId = state.sceneDiff.compare_scene_id;
    if (!baselineSceneId || !compareSceneId) {
      notify.warning('Select baseline and compare scenes before saving a preset.');
      return;
    }
    const baselineScene = state.scenes[baselineSceneId];
    const compareScene = state.scenes[compareSceneId];
    if (!baselineScene || !compareScene) {
      notify.warning('Selected scene is no longer available. Reselect scenes before saving a preset.');
      return;
    }

    const fallbackPresetName = `${baselineScene.name} vs ${compareScene.name}`;
    const validation = normalizeAndValidateSceneMetadata(
      {
        name: sceneDiffPresetNameDraft.trim() || fallbackPresetName,
        description: sceneDiffPresetNotesDraft,
        tags: [],
      },
      { requireName: true }
    );
    if (validation.errors.length > 0) {
      notify.warning(validation.errors[0]);
      return;
    }

    const normalizedPresetName = validation.normalized.name;
    const normalizedPresetNotes = validation.normalized.description;
    const parsedPresetVersion = Number.parseInt(sceneDiffPresetVersionDraft.trim(), 10);
    const normalizedPresetVersion =
      Number.isFinite(parsedPresetVersion) && parsedPresetVersion > 0
        ? parsedPresetVersion
        : 1;
    const normalizedPresetConflictPolicy = isConflictResolutionMode(sceneDiffPresetConflictPolicyDraft)
      ? sceneDiffPresetConflictPolicyDraft
      : 'upsert';
    const existingPreset = (state.sceneDiff.presets || []).find(
      (preset) => preset.name.toLowerCase() === normalizedPresetName.toLowerCase()
    );
    dispatch({
      type: 'SAVE_SCENE_DIFF_PRESET',
      payload: {
        name: normalizedPresetName,
        notes: normalizedPresetNotes,
        preset_version: normalizedPresetVersion,
        preferred_conflict_action: normalizedPresetConflictPolicy,
      },
    });
    dispatch({ type: 'GENERATE_SCENE_DIFF' });
    notify.info(`${existingPreset ? 'Updated' : 'Saved'} scene diff preset "${normalizedPresetName}".`);
    setSceneDiffPresetNameDraft(normalizedPresetName);
    setSceneDiffPresetNotesDraft(normalizedPresetNotes);
    setSceneDiffPresetVersionDraft(String(normalizedPresetVersion));
    setSceneDiffPresetConflictPolicyDraft(normalizedPresetConflictPolicy);
  };

  const handleApplySceneDiffPreset = () => {
    if (!sceneDiffSelectedPresetId) {
      notify.warning('Select a saved preset before applying.');
      return;
    }
    const preset = (state.sceneDiff.presets || []).find((entry) => entry.id === sceneDiffSelectedPresetId);
    if (!preset) {
      notify.warning('Selected preset is no longer available. Choose another preset.');
      setSceneDiffSelectedPresetId('');
      return;
    }

    dispatch({
      type: 'APPLY_SCENE_DIFF_PRESET',
      payload: {
        preset_id: preset.id,
      },
    });
    dispatch({ type: 'GENERATE_SCENE_DIFF' });
    notify.info(`Applied scene diff preset "${preset.name}".`);
  };

  const handleDeleteSceneDiffPreset = () => {
    if (!sceneDiffSelectedPresetId) {
      notify.warning('Select a saved preset before deleting.');
      return;
    }
    const preset = (state.sceneDiff.presets || []).find((entry) => entry.id === sceneDiffSelectedPresetId);
    if (!preset) {
      notify.warning('Selected preset is no longer available. Choose another preset.');
      setSceneDiffSelectedPresetId('');
      return;
    }

    dispatch({
      type: 'DELETE_SCENE_DIFF_PRESET',
      payload: {
        preset_id: preset.id,
      },
    });
    notify.info(`Deleted scene diff preset "${preset.name}".`);
    setSceneDiffSelectedPresetId('');
  };

  const handleExportSceneDiffPresets = () => {
    if (sceneDiffPresetImportPreview) {
      dispatch({
        type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
        payload: {
          phase: 'cancelled',
          reason: 'exported_payload_reset',
          source_count: sceneDiffPresetImportPreview.source_count,
          accepted_count: sceneDiffPresetImportPreview.accepted_count,
          conflict_count: sceneDiffPresetImportPreview.conflict_count,
          skipped_count: sceneDiffPresetImportPreview.skipped_count,
          preferred_conflict_action: sceneDiffPresetImportPreview.preferred_conflict_action,
        },
      });
    }
    const defaultPreferredConflictAction: SceneDiffConflictResolutionMode = 'upsert';
    const payload = {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      compatibility_hint: 'Preset imports require referenced baseline/compare scene IDs to exist.',
      preferred_conflict_action: defaultPreferredConflictAction,
      presets: sceneDiffPresets.map((preset) => ({
        name: preset.name,
        baseline_scene_id: preset.baseline_scene_id,
        compare_scene_id: preset.compare_scene_id,
        preset_version: preset.preset_version || 1,
        notes: preset.notes || '',
        preferred_conflict_action:
          preset.preferred_conflict_action &&
          preset.preferred_conflict_action !== defaultPreferredConflictAction
            ? preset.preferred_conflict_action
            : undefined,
      })),
    };
    const serialized = JSON.stringify(payload, null, 2);
    setSceneDiffPresetTransferDraft(serialized);
    setSceneDiffPresetImportPreview(null);
    setSceneDiffConflictResolutions({});
    setSceneDiffImportPreviewCollapsedGroups(SCENE_DIFF_IMPORT_PREVIEW_INITIAL_COLLAPSE_STATE);
    setSceneDiffPresetImportPreviewPageIndex(0);
    notify.info(`Exported ${sceneDiffPresets.length} scene diff preset${sceneDiffPresets.length === 1 ? '' : 's'} to JSON.`);
  };

  const buildCurrentSceneDiffPresetImportPreview = () => {
    const { preview, error } = buildSceneDiffPresetImportPreview(
      sceneDiffPresetTransferDraft,
      {
        sceneExists: (sceneId) => Boolean(state.scenes[sceneId]),
        existingPresets: sceneDiffPresets,
      }
    );
    if (error) {
      return { preview: null, error };
    }
    return { preview, error: null };
  };

  const handlePreviewSceneDiffPresets = () => {
    const previewMode: 'opened' | 'refreshed' = sceneDiffPresetImportPreview ? 'refreshed' : 'opened';
    const { preview, error } = buildCurrentSceneDiffPresetImportPreview();
    if (error || !preview) {
      setSceneDiffPresetImportPreview(null);
      setSceneDiffConflictResolutions({});
      setSceneDiffImportPreviewCollapsedGroups(SCENE_DIFF_IMPORT_PREVIEW_INITIAL_COLLAPSE_STATE);
      setSceneDiffPresetImportPreviewPageIndex(0);
      notify.warning(error || 'Unable to preview preset import payload.');
      return;
    }

    setSceneDiffPresetImportPreview(preview);
    setSceneDiffConflictResolutions(
      buildInitialSceneDiffConflictResolution(preview, sceneDiffPresets)
    );
    setSceneDiffImportPreviewCollapsedGroups(SCENE_DIFF_IMPORT_PREVIEW_INITIAL_COLLAPSE_STATE);
    setSceneDiffPresetImportPreviewPageIndex(0);
    dispatch({
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: previewMode,
        source_count: preview.source_count,
        accepted_count: preview.accepted_count,
        conflict_count: preview.conflict_count,
        skipped_count: preview.skipped_count,
        preferred_conflict_action: preview.preferred_conflict_action,
      },
    });
    notify.info(
      `Previewed ${preview.source_count} preset row${preview.source_count === 1 ? '' : 's'}: ` +
      `${preview.accepted_count} accepted, ${preview.conflict_count} conflict, ${preview.skipped_count} skipped.`
    );
  };

  const handleImportSceneDiffPresets = () => {
    const preview = sceneDiffPresetImportPreview;
    if (!preview) {
      notify.warning('Preview preset JSON before importing.');
      return;
    }

    const importPlan = buildSceneDiffPresetImportPlan(
      preview,
      sceneDiffConflictResolutions,
      sceneDiffPresets
    );
    if (importPlan.errors.length > 0) {
      notify.warning(importPlan.errors[0]);
      return;
    }

    if (importPlan.presets.length === 0) {
      notify.warning('No valid preset entries were found in the provided JSON.');
      return;
    }

    dispatch({
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: {
        presets: importPlan.presets,
      },
    });
    notify.info(`Imported ${importPlan.presets.length} scene diff preset${importPlan.presets.length === 1 ? '' : 's'}.`);
    if (importPlan.upserted_conflicts > 0) {
      notify.info(`Upserted ${importPlan.upserted_conflicts} preset name conflict${importPlan.upserted_conflicts === 1 ? '' : 's'} during import.`);
    }
    if (importPlan.renamed_conflicts > 0) {
      notify.info(`Renamed ${importPlan.renamed_conflicts} conflict preset${importPlan.renamed_conflicts === 1 ? '' : 's'} before import.`);
    }
    if (importPlan.skipped_conflicts > 0) {
      notify.warning(`Skipped ${importPlan.skipped_conflicts} conflict preset${importPlan.skipped_conflicts === 1 ? '' : 's'} by operator action.`);
    }
    if (preview.skipped_count > 0) {
      notify.warning(`Skipped ${preview.skipped_count} invalid or non-resolvable preset entr${preview.skipped_count === 1 ? 'y' : 'ies'}.`);
    }
    setSceneDiffPresetImportPreview(null);
    setSceneDiffConflictResolutions({});
    setSceneDiffImportPreviewCollapsedGroups(SCENE_DIFF_IMPORT_PREVIEW_INITIAL_COLLAPSE_STATE);
    setSceneDiffPresetImportPreviewPageIndex(0);
  };

  const handleSceneDiffImportPreviewNextPage = () => {
    if (!sceneDiffPresetImportPreview) {
      return;
    }
    const visibleRowCount = sceneDiffPresetImportPreview.rows.filter(
      (row) => !sceneDiffImportPreviewCollapsedGroups[row.status]
    ).length;
    const lastPageIndex = Math.max(
      0,
      Math.ceil(visibleRowCount / SCENE_DIFF_IMPORT_PREVIEW_PAGE_SIZE) - 1
    );
    setSceneDiffPresetImportPreviewPageIndex((previous) => Math.min(previous + 1, lastPageIndex));
  };

  const handleSceneDiffImportPreviewPreviousPage = () => {
    setSceneDiffPresetImportPreviewPageIndex((previous) => Math.max(previous - 1, 0));
  };

  const handleSceneDiffImportPreviewToggleGroup = (status: SceneDiffPresetTransferPreviewRow['status']) => {
    setSceneDiffImportPreviewCollapsedGroups((previous) => ({
      ...previous,
      [status]: !previous[status],
    }));
    setSceneDiffPresetImportPreviewPageIndex(0);
  };

  const handleSceneDiffBulkConflictAction = (mode: SceneDiffConflictResolutionMode) => {
    if (!sceneDiffPresetImportPreview) {
      return;
    }
    const conflictRows = sceneDiffPresetImportPreview.rows.filter(
      (row) => row.status === 'conflict' && row.incoming
    );
    if (conflictRows.length === 0) {
      return;
    }

    setSceneDiffConflictResolutions((previous) => {
      const next: SceneDiffConflictResolutionState = { ...previous };
      if (mode === 'rename') {
        const renameInventory = sceneDiffPresets.map((preset) => ({ id: preset.id, name: preset.name }));
        conflictRows.forEach((row, index) => {
          const baseDraft =
            (next[row.row_id]?.rename_draft || '').trim() ||
            `${row.incoming?.name || row.name} Imported`;
          const renamed = generateUniqueSceneName(baseDraft, renameInventory);
          renameInventory.push({ id: `bulk-conflict-${index + 1}`, name: renamed });
          next[row.row_id] = {
            mode: 'rename',
            rename_draft: renamed,
          };
        });
        return next;
      }

      conflictRows.forEach((row) => {
        const current = next[row.row_id] || { mode: 'upsert' as const, rename_draft: '' };
        next[row.row_id] = {
          ...current,
          mode,
        };
      });
      return next;
    });
  };

  const handleSceneDiffConflictResolutionModeChange = (
    rowId: string,
    mode: SceneDiffConflictResolutionMode
  ) => {
    setSceneDiffConflictResolutions((previous) => {
      const current = previous[rowId] || { mode: 'upsert' as const, rename_draft: '' };
      return {
        ...previous,
        [rowId]: {
          ...current,
          mode,
        },
      };
    });
  };

  const handleSceneDiffConflictRenameDraftChange = (rowId: string, value: string) => {
    setSceneDiffConflictResolutions((previous) => {
      const current = previous[rowId] || { mode: 'rename' as const, rename_draft: '' };
      return {
        ...previous,
        [rowId]: {
          ...current,
          rename_draft: value,
        },
      };
    });
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
  const endpointValues = Object.values(state.endpoints);
  const endpointIssueCount = countEndpointsWithOperationalIssues(endpointValues, state.network.nodes);
  const avbDeviceCount = avbDevicesData?.count ?? 0;
  const avbDiscoveredCount = avbDevicesData?.discovered_count ?? 0;
  const avbDiscoveredDevices = avbDevicesData?.discovered_devices || [];
  const avbEndpointIds = Object.keys(state.endpoints);
  const avbEndpointIdSet = new Set(avbEndpointIds);
  const avbDiscoveredEndpointIdSet = new Set(avbDiscoveredDevices.map((device) => device.endpoint_id));
  const avbCacheMissingCount = avbEndpointIds.filter((endpointId) => !avbDiscoveredEndpointIdSet.has(endpointId)).length;
  const avbCacheOrphanCount = avbDiscoveredDevices.filter((device) => !avbEndpointIdSet.has(device.endpoint_id)).length;
  const avbStreamPayloads = avbStreamsData?.streams || [];
  const avbReadiness = avbDevicesData?.readiness;
  const avbStackState = avbReadiness?.state || 'unknown';
  const avbStackChipColor = avbStackState === 'operational'
    ? 'success'
    : avbStackState === 'degraded'
      ? 'warning'
      : avbStackState === 'disabled'
        ? 'default'
        : 'info';
  const avbTalkerCapabilityCount = avbDiscoveredDevices.filter((device) => device.direction === 'talker').length;
  const avbListenerCapabilityCount = avbDiscoveredDevices.filter((device) => device.direction === 'listener').length;
  const avbTransportReadyCount = avbStreamPayloads.filter((stream) => stream.health?.ready).length;
  const avbTransportIssueCount = avbStreamPayloads.filter((stream) => (
    stream.state === 'error' || (stream.health ? !stream.health.ready : false)
  )).length;
  const avbDiagnosticsCoverageCount = avbStreamPayloads.filter((stream) => Boolean(stream.diagnostics)).length;
  const avbPtpLockedCount = avbStreamPayloads.filter((stream) => stream.diagnostics?.ptp_lock.locked).length;
  const avbSrpBoundCount = avbStreamPayloads.filter((stream) => stream.diagnostics?.srp.bound).length;
  const avbFailoverPolicyCounts = useMemo(() => avbStreamPayloads.reduce<Record<string, number>>((acc, stream) => {
    const policy = stream.diagnostics?.effective_config.failover_policy || 'none';
    acc[policy] = (acc[policy] || 0) + 1;
    return acc;
  }, {}), [avbStreamPayloads]);
  const avbTopFailoverPolicy = useMemo(() => Object.entries(avbFailoverPolicyCounts)
    .sort((a, b) => b[1] - a[1])
    .find(([, count]) => count > 0), [avbFailoverPolicyCounts]);
  const avbFailoverInterfaceCounts = useMemo(() => avbStreamPayloads.reduce<Record<string, number>>((acc, stream) => {
    const candidates = stream.diagnostics?.effective_config.interface_candidates || [];
    candidates.forEach((iface: string) => {
      acc[iface] = (acc[iface] || 0) + 1;
    });
    return acc;
  }, {}), [avbStreamPayloads]);
  const avbTopFailoverInterfaces = useMemo(() => Object.entries(avbFailoverInterfaceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([iface, count]) => `${iface} (${count})`)
    .join(', ') || '—', [avbFailoverInterfaceCounts]);
  const filtersOpen = Boolean(filtersAnchor);
  const scenesOpen = Boolean(scenesAnchor);
  const sceneDiffOpen = Boolean(sceneDiffAnchor);
  const defaultFilters = defaultFilterState;
  const activeFilterCount = countActiveFilters(state.filters, defaultFilters);
  const sampleRateOptions = Array.from(
    new Set(
      endpointValues
        .map((endpoint) => Number(endpoint.sample_rate))
        .filter((value): value is number => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
  const channelCountOptions = Array.from(
    new Set(
      endpointValues
        .map((endpoint) => Number(endpoint.channels))
        .filter((value): value is number => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
  const groupOptions = Array.from(
    new Set(
      endpointValues
        .map((endpoint) => endpoint.group)
        .filter((group): group is string => typeof group === 'string' && group.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
  const hostOptions = Array.from(
    new Set(
      endpointValues
        .map((endpoint) => resolveEndpointHostId(endpoint))
        .filter((hostId): hostId is string => typeof hostId === 'string' && hostId.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
  const sceneOptions = Object.values(state.scenes)
    .slice()
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      return byName !== 0 ? byName : a.id.localeCompare(b.id);
    });
  const sceneInventory = sceneOptions.map((scene) => ({ id: scene.id, name: scene.name }));
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
  const createSceneNameCandidate = sceneCreateNameDraft.trim() || `Scene ${sceneOptions.length + 1}`;
  const createSceneValidation = normalizeAndValidateSceneMetadata(
    { name: createSceneNameCandidate, description: '', tags: [] },
    { requireName: true }
  );
  const createSceneDuplicate =
    createSceneValidation.errors.length === 0 &&
    hasDuplicateSceneName(createSceneValidation.normalized.name, sceneInventory);
  const createSceneResolvedName = createSceneDuplicate
    ? generateUniqueSceneName(createSceneValidation.normalized.name, sceneInventory)
    : createSceneValidation.normalized.name;
  const editSceneValidation = selectedScene
    ? normalizeAndValidateSceneMetadata(
      {
        name: sceneEditNameDraft,
        description: sceneEditDescriptionDraft,
        tags: sceneEditTagsDraft.split(','),
      },
      { requireName: true }
    )
    : null;
  const editSceneDuplicate = Boolean(
    selectedScene &&
    editSceneValidation &&
    editSceneValidation.errors.length === 0 &&
    hasDuplicateSceneName(editSceneValidation.normalized.name, sceneInventory, { excludeSceneId: selectedScene.id })
  );
  const editSceneResolvedName =
    selectedScene && editSceneValidation && editSceneDuplicate
      ? generateUniqueSceneName(editSceneValidation.normalized.name, sceneInventory, { excludeSceneId: selectedScene.id })
      : editSceneValidation?.normalized.name || '';
  const sceneDiffPresets = (state.sceneDiff.presets || [])
    .slice()
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      return byName !== 0 ? byName : a.id.localeCompare(b.id);
    });
  const sceneDiffActivePreset = state.sceneDiff.active_preset_id
    ? sceneDiffPresets.find((preset) => preset.id === state.sceneDiff.active_preset_id) || null
    : null;
  const sceneDiffSelectedPreset = sceneDiffSelectedPresetId
    ? sceneDiffPresets.find((preset) => preset.id === sceneDiffSelectedPresetId) || null
    : null;
  const sceneDiffSelectedPresetValue = sceneDiffSelectedPreset ? sceneDiffSelectedPreset.id : '';
  const sceneDiffDraftPolicyLabel = formatConflictResolutionModeLabel(sceneDiffPresetConflictPolicyDraft);
  const sceneDiffSelectedPresetPolicyLabel = sceneDiffSelectedPreset
    ? formatConflictResolutionModeLabel(sceneDiffSelectedPreset.preferred_conflict_action)
    : 'none';
  const sceneDiffSelectedPresetPersistedPolicy =
    sceneDiffSelectedPreset?.preferred_conflict_action || 'upsert';
  const sceneDiffSelectedPresetDraftPolicyDiffers = sceneDiffSelectedPreset
    ? sceneDiffSelectedPresetPersistedPolicy !== sceneDiffPresetConflictPolicyDraft
    : false;
  const selectedBaselineScene = state.sceneDiff.baseline_scene_id ?? '';
  const selectedCompareScene = state.sceneDiff.compare_scene_id ?? '';
  const sceneDiffPreviewSceneId = state.sceneDiff.preview?.scene_id ?? '';
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
  const sceneDiffPresetSummary =
    sceneDiffPresets.length === 0
      ? 'No saved compare presets'
      : `${sceneDiffPresets.length} preset${sceneDiffPresets.length === 1 ? '' : 's'}`;
  const sceneDiffImportPreviewRows = (sceneDiffPresetImportPreview?.rows || [])
    .slice()
    .sort((a, b) => {
      const byStatus = SCENE_DIFF_IMPORT_PREVIEW_STATUS_ORDER[a.status] - SCENE_DIFF_IMPORT_PREVIEW_STATUS_ORDER[b.status];
      return byStatus !== 0 ? byStatus : 0;
    });
  const sceneDiffImportPreviewRowCounts = {
    conflict: sceneDiffImportPreviewRows.filter((row) => row.status === 'conflict').length,
    accepted: sceneDiffImportPreviewRows.filter((row) => row.status === 'accepted').length,
    skipped: sceneDiffImportPreviewRows.filter((row) => row.status === 'skipped').length,
  };
  const sceneDiffImportPlanPreview = sceneDiffPresetImportPreview
    ? buildSceneDiffPresetImportPlan(
      sceneDiffPresetImportPreview,
      sceneDiffConflictResolutions,
      sceneDiffPresets
    )
    : null;
  const sceneDiffImportPreviewVisibleRowsByGroup = sceneDiffImportPreviewRows.filter(
    (row) => !sceneDiffImportPreviewCollapsedGroups[row.status]
  );
  const sceneDiffImportPreviewPageCount = sceneDiffPresetImportPreview
    ? Math.max(1, Math.ceil(sceneDiffImportPreviewVisibleRowsByGroup.length / SCENE_DIFF_IMPORT_PREVIEW_PAGE_SIZE))
    : 0;
  const sceneDiffImportPreviewPageIndex = sceneDiffPresetImportPreview
    ? Math.min(
      sceneDiffPresetImportPreviewPageIndex,
      Math.max(sceneDiffImportPreviewPageCount - 1, 0)
    )
    : 0;
  const sceneDiffImportPreviewSliceStart = sceneDiffImportPreviewPageIndex * SCENE_DIFF_IMPORT_PREVIEW_PAGE_SIZE;
  const sceneDiffImportPreviewSliceEnd = sceneDiffImportPreviewSliceStart + SCENE_DIFF_IMPORT_PREVIEW_PAGE_SIZE;
  const visibleSceneDiffImportPreviewRows = sceneDiffImportPreviewVisibleRowsByGroup.slice(
    sceneDiffImportPreviewSliceStart,
    sceneDiffImportPreviewSliceEnd
  );
  const sceneDiffImportPreviewRangeStart = sceneDiffImportPreviewVisibleRowsByGroup.length === 0
    ? 0
    : sceneDiffImportPreviewSliceStart + 1;
  const sceneDiffImportPreviewRangeEnd = Math.min(
    sceneDiffImportPreviewSliceEnd,
    sceneDiffImportPreviewVisibleRowsByGroup.length
  );
  const sceneDiffImportPreviewHasPreviousPage = sceneDiffImportPreviewPageIndex > 0;
  const sceneDiffImportPreviewHasNextPage = sceneDiffImportPreviewPageIndex < sceneDiffImportPreviewPageCount - 1;
  const pendingSceneActionMatchesSelection =
    Boolean(
      selectedScene &&
      pendingSceneAction &&
      pendingSceneAction.scene_id === selectedScene.id
    );
  const liveRouteEntries = Object.values(state.liveRoutes)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const sceneRouteEntries = selectedScene
    ? selectedScene.routes.slice().sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const liveRouteById = new Map(liveRouteEntries.map((route) => [route.id, route]));
  const sceneRouteById = new Map(sceneRouteEntries.map((route) => [route.id, route]));
  const recallToAdd = sceneRouteEntries.filter((route) => !liveRouteById.has(route.id));
  const recallToRemove = liveRouteEntries.filter((route) => !sceneRouteById.has(route.id));
  const recallUnchanged = sceneRouteEntries.filter((route) => liveRouteById.has(route.id));
  const renderImpactRouteLabel = (route: { talker_id: string; listener_id: string }) => {
    const talkerName = state.endpoints[route.talker_id]?.device_name || route.talker_id;
    const listenerName = state.endpoints[route.listener_id]?.device_name || route.listener_id;
    return `${talkerName} -> ${listenerName}`;
  };
  const recallImpactEntries = [
    ...recallToAdd.map((route) => ({ kind: 'Add', route })),
    ...recallToRemove.map((route) => ({ kind: 'Remove', route })),
    ...recallUnchanged.map((route) => ({ kind: 'Keep', route })),
  ];
  const visibleRecallImpactEntries = sceneImpactExpanded
    ? recallImpactEntries.slice(0, sceneImpactDisplayLimit)
    : [];
  const recallImpactHasMore = recallImpactEntries.length > visibleRecallImpactEntries.length;
  const recallImpactSummary = selectedScene
    ? `Impact: +${recallToAdd.length} add, -${recallToRemove.length} remove, =${recallUnchanged.length} unchanged`
    : 'Impact: no scene selected';
  const recallImpactRoutes = selectedScene
    ? `Add: ${recallToAdd.slice(0, 3).map(renderImpactRouteLabel).join(' | ') || 'none'} · Remove: ${recallToRemove.slice(0, 3).map(renderImpactRouteLabel).join(' | ') || 'none'}`
    : 'Add: none · Remove: none';
  const sceneImpactText = !selectedScene
    ? 'Select a saved scene to review recall/delete impact.'
    : pendingSceneActionMatchesSelection && pendingSceneAction?.action === 'recall'
      ? `Confirm recall to replace current live routes with "${selectedScene.name}". Press Recall again to proceed.`
      : pendingSceneActionMatchesSelection && pendingSceneAction?.action === 'delete'
        ? `Confirm delete to permanently remove "${selectedScene.name}". Press Delete again to proceed.`
        : `Recall will replace current live routes with "${selectedScene.name}". Delete permanently removes this snapshot.`;
  const sceneDuplicateHintText = selectedScene
    ? editSceneDuplicate
      ? sceneAutoSuffixDuplicates
        ? `Duplicate selected-scene name detected. Update will auto-suffix to "${editSceneResolvedName}".`
        : 'Duplicate selected-scene name detected. Update will keep duplicate naming.'
      : null
    : createSceneDuplicate
      ? sceneAutoSuffixDuplicates
        ? `Duplicate new-scene name detected. Save will auto-suffix to "${createSceneResolvedName}".`
        : 'Duplicate new-scene name detected. Save will keep duplicate naming.'
      : null;
  const sceneOperationAuditEntries = state.auditLog
    .filter((entry) => (
      entry.event_type === 'SAVE_SCENE' ||
      entry.event_type === 'RECALL_SCENE' ||
      entry.event_type === 'DELETE_SCENE' ||
      entry.event_type === 'UPDATE_SCENE'
    ))
    .reverse();
  const sceneDiffPreviewAuditEntries = state.auditLog
    .filter((entry) => isSceneDiffPreviewAuditEntry(entry))
    .reverse();
  const sceneDiffPreviewWarningCount = sceneDiffPreviewAuditEntries.filter(
    (entry) => entry.validation_outcome === 'warning'
  ).length;
  const sceneAuditEntries = sceneAuditDiffPreviewOnly
    ? sceneDiffPreviewAuditEntries
    : sceneOperationAuditEntries;
  const sceneAuditErrorCount = sceneOperationAuditEntries.filter((entry) => entry.validation_outcome === 'error').length;
  const sceneAuditWarningCount = sceneOperationAuditEntries.filter((entry) => entry.validation_outcome === 'warning').length;
  const sceneAuditDeleteCount = sceneOperationAuditEntries.filter((entry) => entry.event_type === 'DELETE_SCENE').length;
  const normalizedSceneAuditSearchQuery = sceneAuditSearchQuery.trim().toLowerCase();
  const filteredSceneAuditEntries = sceneAuditEntries
    .filter((entry) => (
      sceneAuditOutcomeFilter === 'all'
        ? true
        : entry.validation_outcome === sceneAuditOutcomeFilter
    ))
    .filter((entry) => {
      if (!normalizedSceneAuditSearchQuery) {
        return true;
      }
      const searchTarget = `${entry.event_type} ${entry.diff_summary}`.toLowerCase();
      return searchTarget.includes(normalizedSceneAuditSearchQuery);
    });
  const visibleSceneAuditEntries = filteredSceneAuditEntries.slice(0, SCENE_AUDIT_DISPLAY_LIMIT);
  const sceneAuditSummary = `${visibleSceneAuditEntries.length} of ${filteredSceneAuditEntries.length} matching (${sceneAuditEntries.length} total)`;

  useEffect(() => {
    if (!selectedScene) {
      setSceneEditNameDraft('');
      setSceneEditDescriptionDraft('');
      setSceneEditTagsDraft('');
      setSceneImpactExpanded(false);
      setSceneImpactDisplayLimit(SCENE_IMPACT_PAGE_SIZE);
      return;
    }

    setSceneEditNameDraft(selectedScene.name);
    setSceneEditDescriptionDraft(selectedScene.description);
    setSceneEditTagsDraft(selectedScene.tags.join(', '));
    setSceneImpactExpanded(false);
    setSceneImpactDisplayLimit(SCENE_IMPACT_PAGE_SIZE);
  }, [selectedScene]);

  useEffect(() => {
    if (selectedSceneId && !selectedScene) {
      setSelectedSceneId('');
      setPendingSceneAction(null);
    }
  }, [selectedSceneId, selectedScene]);

  useEffect(() => {
    if (sceneDiffSelectedPresetId && !sceneDiffSelectedPreset) {
      setSceneDiffSelectedPresetId('');
      setSceneDiffPresetConflictPolicyDraft('upsert');
      return;
    }
    if (!sceneDiffSelectedPresetId && sceneDiffActivePreset) {
      setSceneDiffSelectedPresetId(sceneDiffActivePreset.id);
      setSceneDiffPresetNameDraft(sceneDiffActivePreset.name);
      setSceneDiffPresetNotesDraft(sceneDiffActivePreset.notes || '');
      setSceneDiffPresetVersionDraft(String(sceneDiffActivePreset.preset_version || 1));
      setSceneDiffPresetConflictPolicyDraft(sceneDiffActivePreset.preferred_conflict_action || 'upsert');
    }
  }, [sceneDiffSelectedPresetId, sceneDiffSelectedPreset, sceneDiffActivePreset]);

  useEffect(() => {
    if (!sceneDiffOpen || !sceneDiffPreviewSceneId) {
      return;
    }
    const baselineSceneId = state.sceneDiff.baseline_scene_id;
    const compareSceneId = state.sceneDiff.compare_scene_id;
    if (!baselineSceneId || !compareSceneId) {
      return;
    }
    if (!state.scenes[baselineSceneId] || !state.scenes[compareSceneId]) {
      return;
    }

    dispatch({ type: 'GENERATE_SCENE_DIFF' });
  }, [
    sceneDiffOpen,
    sceneDiffPreviewSceneId,
    state.sceneDiff.baseline_scene_id,
    state.sceneDiff.compare_scene_id,
    state.scenes,
    state.endpoints,
    dispatch,
  ]);

  return (
    <AppBar
      position="static"
      color="default"
      elevation={1}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Node Selector - Top Row */}
      <NodeSelector />

      {/* Controls - Bottom Row */}
      <Toolbar
        sx={{
          gap: { xs: 1, sm: 1.5 },
          px: { xs: 1, sm: 2 },
          py: { xs: 0.75, sm: 1 },
          flexWrap: 'wrap',
          alignItems: 'center',
          minHeight: { xs: 'auto', sm: 56 },
        }}
      >
        {/* Title */}
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            minWidth: { xs: 0, md: 180 },
            width: { xs: '100%', md: 'auto' },
            fontSize: { xs: 16, sm: 18, md: 20 },
            lineHeight: 1.2,
          }}
        >
          AVB Routing Matrix
        </Typography>

        {/* Search */}
        <TextField
          size="small"
          placeholder="Search endpoints..."
          value={state.search}
          onChange={handleSearchChange}
          inputProps={{ 'data-testid': 'topbar-search-input' }}
          sx={{
            width: { xs: '100%', sm: 260, lg: 300 },
            flexGrow: { xs: 1, md: 0 },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          }}
        />

        {/* Stats */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            overflowX: isMobile ? 'auto' : 'visible',
            width: isMobile ? '100%' : 'auto',
            maxWidth: '100%',
            pb: isMobile ? 0.25 : 0,
            '& .MuiChip-root': {
              flexShrink: 0,
            },
          }}
        >
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
            icon={<Filter size={16} />}
            label={activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : 'No filters'}
            size="small"
            color={activeFilterCount > 0 ? 'primary' : 'default'}
            variant="outlined"
            data-testid="topbar-filter-summary"
          />
          <Chip
            label={`Endpoint Issues: ${endpointIssueCount}`}
            size="small"
            color={state.filters.issuesOnly ? 'primary' : endpointIssueCount > 0 ? 'warning' : 'default'}
            variant={state.filters.issuesOnly ? 'filled' : 'outlined'}
            clickable
            onClick={handleToggleIssuesOnlyChip}
            data-testid="topbar-endpoint-issues-filter-chip"
          />
          <Chip
            label={`Engine: ${avbDeviceCount}/${avbDiscoveredCount}`}
            size="small"
            color={avbDeviceCount > 0 ? 'info' : 'default'}
            variant="outlined"
            data-testid="topbar-avb-engine-summary"
          />
          <Chip
            label={`AVB Stack: ${avbStackState}`}
            size="small"
            color={avbStackChipColor}
            variant="outlined"
            data-testid="topbar-avb-stack-state"
          />
          <Chip
            label={`I/O Cap: N${avbTalkerCapabilityCount}/${avbListenerCapabilityCount}`}
            size="small"
            color={(avbTalkerCapabilityCount + avbListenerCapabilityCount) > 0 ? 'info' : 'default'}
            variant="outlined"
            data-testid="topbar-avb-io-capabilities"
          />
          <Chip
            label={`Cache Drift: ${avbCacheMissingCount}|${avbCacheOrphanCount}`}
            size="small"
            color={(avbCacheMissingCount > 0 || avbCacheOrphanCount > 0) ? 'warning' : 'success'}
            variant="outlined"
            data-testid="topbar-avb-cache-drift"
          />
          <Chip
            label={`Transport: ${avbTransportReadyCount}/${avbStreamPayloads.length}`}
            size="small"
            color={avbTransportIssueCount > 0 ? 'warning' : 'success'}
            variant="outlined"
            data-testid="topbar-avb-transport-summary"
          />
          <Chip
            label={`Issues: ${avbTransportIssueCount}`}
            size="small"
            color={avbTransportIssueCount > 0 ? 'error' : 'default'}
            variant="outlined"
            data-testid="topbar-avb-transport-issues"
          />
          <Chip
            label={`Diag: ${avbDiagnosticsCoverageCount}/${avbStreamPayloads.length}`}
            size="small"
            color={
              avbStreamPayloads.length === 0
                ? 'default'
                : avbDiagnosticsCoverageCount === avbStreamPayloads.length
                  ? 'success'
                  : 'warning'
            }
            variant="outlined"
            data-testid="topbar-avb-diagnostics-summary"
          />
          <Chip
            label={`PTP Lock: ${avbPtpLockedCount}/${avbStreamPayloads.length}`}
            size="small"
            color={avbPtpLockedCount === avbStreamPayloads.length && avbStreamPayloads.length > 0 ? 'success' : 'warning'}
            variant="outlined"
            data-testid="topbar-avb-ptp-lock-summary"
          />
          <Chip
            label={`SRP: ${avbSrpBoundCount}/${avbStreamPayloads.length}`}
            size="small"
            color={avbSrpBoundCount > 0 ? 'info' : 'default'}
            variant="outlined"
            data-testid="topbar-avb-srp-summary"
          />
          {avbTopFailoverPolicy && (
            <Chip
              title={`Top interfaces: ${avbTopFailoverInterfaces}`}
              label={`Failover: ${avbTopFailoverPolicy[0]} (${avbTopFailoverPolicy[1]})`}
              size="small"
              color={avbTopFailoverPolicy[0] === 'none' ? 'default' : 'info'}
              variant="outlined"
              data-testid="topbar-avb-failover-summary"
            />
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            overflowX: isMobile ? 'auto' : 'visible',
            width: isMobile ? '100%' : 'auto',
            maxWidth: '100%',
            pb: isMobile ? 0.25 : 0,
            '& .MuiChip-root': {
              flexShrink: 0,
            },
          }}
          data-testid="topbar-scene-status-strip"
        >
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
          <Chip
            size="small"
            variant={sceneAuditErrorCount > 0 ? 'filled' : 'outlined'}
            color={sceneAuditErrorCount > 0 ? 'error' : 'default'}
            label={`Errors: ${sceneAuditErrorCount}`}
            onClick={(event) => handleSceneAuditCounterOpen(event.currentTarget, 'errors')}
            onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditCounterOpen(event.currentTarget, 'errors'))}
            sx={SCENE_STATUS_COUNTER_FOCUS_SX}
            data-testid="topbar-scene-status-errors"
          />
          <Chip
            size="small"
            variant={sceneAuditWarningCount > 0 ? 'filled' : 'outlined'}
            color={sceneAuditWarningCount > 0 ? 'warning' : 'default'}
            label={`Warnings: ${sceneAuditWarningCount}`}
            onClick={(event) => handleSceneAuditCounterOpen(event.currentTarget, 'warnings')}
            onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditCounterOpen(event.currentTarget, 'warnings'))}
            sx={SCENE_STATUS_COUNTER_FOCUS_SX}
            data-testid="topbar-scene-status-warnings"
          />
          <Chip
            size="small"
            variant={sceneAuditDeleteCount > 0 ? 'filled' : 'outlined'}
            color="default"
            label={`Deletes: ${sceneAuditDeleteCount}`}
            onClick={(event) => handleSceneAuditCounterOpen(event.currentTarget, 'deletes')}
            onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditCounterOpen(event.currentTarget, 'deletes'))}
            sx={SCENE_STATUS_COUNTER_FOCUS_SX}
            data-testid="topbar-scene-status-deletes"
          />
          <Chip
            size="small"
            variant={sceneDiffPreviewWarningCount > 0 ? 'filled' : 'outlined'}
            color={sceneDiffPreviewWarningCount > 0 ? 'warning' : 'default'}
            label={`Diff Preview Warnings: ${sceneDiffPreviewWarningCount}`}
            onClick={(event) => handleSceneAuditCounterOpen(event.currentTarget, 'diff_preview_warnings')}
            onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditCounterOpen(event.currentTarget, 'diff_preview_warnings'))}
            sx={SCENE_STATUS_COUNTER_FOCUS_SX}
            data-testid="topbar-scene-status-diff-preview-warnings"
          />
        </Box>

        <Box sx={{ flex: 1, display: { xs: 'none', xl: 'block' } }} /> {/* Spacer */}

        {/* Filters */}
        <Button
          title="Open endpoint filter controls"
          size="small"
          variant="outlined"
          startIcon={<Filter size={16} />}
          onClick={handleFiltersOpen}
          data-testid="topbar-filters-button"
        >
          Filters
        </Button>

        {/* Scenes */}
        <Button
          title="Save, recall, and delete scene snapshots"
          size="small"
          variant="outlined"
          startIcon={<Bookmark size={16} />}
          onClick={handleScenesOpen}
          data-testid="topbar-scenes-button"
        >
          Scenes
        </Button>

        {/* Scene Diff */}
        <Button
          title="Select scenes for read-only diff preview"
          size="small"
          variant="outlined"
          startIcon={<Compare size={16} />}
          onClick={handleSceneDiffOpen}
          data-testid="topbar-scene-diff-button"
        >
          Scene Diff
        </Button>

        {/* Safe Patch Mode */}
        {state.safePatchMode ? (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              icon={<Security size={16} />}
              label={`Safe Patch (${pendingCount} pending)`}
              color="warning"
              size="small"
            />
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<Checkmark size={16} />}
              onClick={handleApplySafeChanges}
              disabled={pendingCount === 0 || batchPatchMutation.isPending}
            >
              {batchPatchMutation.isPending ? 'Applying...' : 'Apply'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<Close size={16} />}
              onClick={handleDiscardSafeChanges}
            >
              Discard
            </Button>
          </Box>
        ) : (
          <Button
            title="Enable safe patch mode to stage changes before applying"
            size="small"
            variant="outlined"
            startIcon={<Security size={16} />}
            onClick={handleSafePatchToggle}
          >
            Safe Patch
          </Button>
        )}

        {/* Network Topology */}
        <Button
          title="View network topology graph"
          size="small"
          variant="outlined"
          startIcon={<TreeViewAlt size={16} />}
          onClick={() => setTopologyModalOpen(true)}
        >
          Topology
        </Button>

        {/* Undo/Redo */}
        <Box sx={{ display: 'flex', gap: 0.5, ml: { xs: 0, md: 'auto' } }}>
          <Button
            title="Undo (Ctrl+Z)"
            size="small"
            onClick={handleUndo}
            disabled={!canUndo}
            sx={{ minWidth: 32, padding: '4px' }}
          >
            <Undo size={16} />
          </Button>
          <Button
            title="Redo (Ctrl+Shift+Z)"
            size="small"
            onClick={handleRedo}
            disabled={!canRedo}
            sx={{ minWidth: 32, padding: '4px' }}
          >
            <Redo size={16} />
          </Button>
        </Box>
      </Toolbar>

      <Popover
        open={scenesOpen}
        anchorEl={scenesAnchor}
        onClose={handleScenesClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: isMobile ? 'center' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: isMobile ? 'center' : 'left' }}
      >
        <Box
          sx={{
            p: 2,
            width: { xs: 'min(92vw, 360px)', sm: 360 },
            maxWidth: '92vw',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
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

          <FormControlLabel
            control={(
                <Checkbox
                  checked={sceneAutoSuffixDuplicates}
                  onChange={handleSceneAutoSuffixToggle}
                  data-testid="topbar-scene-autosuffix-toggle"
                />
              )}
            label="Auto-suffix duplicate names"
          />

          {sceneDuplicateHintText && (
            <Typography
              variant="caption"
              color="warning.main"
              data-testid="topbar-scene-duplicate-hint"
            >
              {sceneDuplicateHintText}
            </Typography>
          )}

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

          <hr className="topbar__divider" />

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
            helperText={`Max ${SCENE_NAME_MAX_LENGTH} chars`}
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

          <Button
            size="small"
            variant="text"
            onClick={handleSceneImpactToggle}
            data-testid="topbar-scene-impact-toggle"
            disabled={!selectedScene}
          >
            {sceneImpactExpanded ? 'Hide Impact Details' : 'Show Impact Details'}
          </Button>

          {sceneImpactExpanded && (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }} data-testid="topbar-scene-impact-details">
              {visibleRecallImpactEntries.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  No impact entries to display.
                </Typography>
              ) : (
                visibleRecallImpactEntries.map((entry, index) => (
                  <Typography
                    key={`${entry.kind}-${entry.route.id}-${index}`}
                    variant="caption"
                    color="text.secondary"
                    data-testid="topbar-scene-impact-entry"
                  >
                    {entry.kind}: {renderImpactRouteLabel(entry.route)}
                  </Typography>
                ))
              )}

              {recallImpactHasMore && (
                <Typography variant="caption" color="warning.main" data-testid="topbar-scene-impact-truncation">
                  Showing {visibleRecallImpactEntries.length} of {recallImpactEntries.length} impact entries.
                </Typography>
              )}

              <Box sx={{ display: 'flex', gap: 1 }}>
                {recallImpactHasMore && (
                  <Button size="small" onClick={handleSceneImpactShowMore} data-testid="topbar-scene-impact-show-more">
                    Show More
                  </Button>
                )}
                {sceneImpactDisplayLimit > SCENE_IMPACT_PAGE_SIZE && (
                  <Button size="small" onClick={handleSceneImpactReset} data-testid="topbar-scene-impact-reset">
                    Reset
                  </Button>
                )}
              </Box>
            </Box>
          )}

          <Typography
            variant="caption"
            color={pendingSceneActionMatchesSelection ? 'warning.main' : 'text.secondary'}
            data-testid="topbar-scene-impact-text"
          >
            {sceneImpactText}
          </Typography>

          <hr className="topbar__divider" />

          <Box
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}
            data-testid="topbar-scene-audit-list"
          >
            <Typography variant="caption" color="text.secondary">
              Recent Scene Operations
            </Typography>

            <TextField
              size="small"
              label="Search Operations"
              value={sceneAuditSearchQuery}
              onChange={handleSceneAuditSearchQueryChange}
              inputProps={{ 'data-testid': 'topbar-scene-audit-search-input' }}
            />

            <FormControlLabel
              control={(
                <Checkbox
                  checked={sceneAuditRememberFilters}
                  onChange={handleSceneAuditRememberFiltersToggle}
                  data-testid="topbar-scene-audit-remember-filters-toggle"
                />
              )}
              label="Remember Audit Filters"
            />

            <FormControl size="small">
              <InputLabel id="scene-audit-outcome-filter-label">Outcome</InputLabel>
              <Select
                labelId="scene-audit-outcome-filter-label"
                label="Outcome"
                value={sceneAuditOutcomeFilter}
                onChange={handleSceneAuditOutcomeFilterChange}
                data-testid="topbar-scene-audit-outcome-filter"
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="success">Success</MenuItem>
                <MenuItem value="warning">Warning</MenuItem>
                <MenuItem value="error">Error</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label="All"
                variant={sceneAuditOutcomeFilter === 'all' && !sceneAuditSearchQuery && !sceneAuditDiffPreviewOnly ? 'filled' : 'outlined'}
                color="default"
                onClick={() => handleSceneAuditQuickFilter('all')}
                onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditQuickFilter('all'))}
                data-testid="topbar-scene-audit-quick-all"
              />
              <Chip
                size="small"
                label="Errors"
                variant={sceneAuditOutcomeFilter === 'error' ? 'filled' : 'outlined'}
                color={sceneAuditOutcomeFilter === 'error' ? 'error' : 'default'}
                onClick={() => handleSceneAuditQuickFilter('errors')}
                onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditQuickFilter('errors'))}
                data-testid="topbar-scene-audit-quick-errors"
              />
              <Chip
                size="small"
                label="Warnings"
                variant={sceneAuditOutcomeFilter === 'warning' ? 'filled' : 'outlined'}
                color={sceneAuditOutcomeFilter === 'warning' ? 'warning' : 'default'}
                onClick={() => handleSceneAuditQuickFilter('warnings')}
                onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditQuickFilter('warnings'))}
                data-testid="topbar-scene-audit-quick-warnings"
              />
              <Chip
                size="small"
                label="Deletes"
                variant={sceneAuditSearchQuery.trim().toLowerCase() === 'delete' && !sceneAuditDiffPreviewOnly ? 'filled' : 'outlined'}
                color="default"
                onClick={() => handleSceneAuditQuickFilter('deletes')}
                onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditQuickFilter('deletes'))}
                data-testid="topbar-scene-audit-quick-deletes"
              />
              <Chip
                size="small"
                label="Diff Preview"
                variant={sceneAuditDiffPreviewOnly ? 'filled' : 'outlined'}
                color={sceneAuditDiffPreviewOnly ? 'primary' : 'default'}
                onClick={() => handleSceneAuditQuickFilter('diff_preview')}
                onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneAuditQuickFilter('diff_preview'))}
                data-testid="topbar-scene-audit-quick-diff-preview"
              />
            </Box>

            <Typography variant="caption" color="text.secondary" data-testid="topbar-scene-audit-summary">
              {sceneAuditSummary}
            </Typography>

            {visibleSceneAuditEntries.length === 0 ? (
              <Typography variant="caption" color="text.disabled">
                No scene operations match current audit filters.
              </Typography>
            ) : (
              visibleSceneAuditEntries.map((entry) => (
                <Box
                  key={entry.id}
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}
                  data-testid="topbar-scene-audit-entry"
                >
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                    {entry.diff_summary}
                  </Typography>
                  <Chip
                    size="small"
                    label={entry.validation_outcome}
                    color={
                      entry.validation_outcome === 'error'
                        ? 'error'
                        : entry.validation_outcome === 'warning'
                          ? 'warning'
                          : 'success'
                    }
                    variant="outlined"
                    data-testid="topbar-scene-audit-outcome"
                  />
                </Box>
              ))
            )}
          </Box>

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
        anchorOrigin={{ vertical: 'bottom', horizontal: isMobile ? 'center' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: isMobile ? 'center' : 'left' }}
      >
        <Box
          sx={{
            p: 2,
            width: { xs: 'min(92vw, 360px)', sm: 360 },
            maxWidth: '92vw',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Endpoint Filters
          </Typography>

          <FormGroup>
            <FormControlLabel
              control={(
                <Checkbox
                  checked={state.filters.availableOnly}
                  onChange={handleToggleAvailableOnly}
                  data-testid="topbar-filter-available-only"
                />
              )}
              label="Available only"
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={state.filters.issuesOnly}
                  onChange={handleToggleIssuesOnly}
                  data-testid="topbar-filter-issues-only"
                />
              )}
              label="Issues only"
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={state.filters.showLocked}
                  onChange={handleToggleShowLocked}
                  data-testid="topbar-filter-show-locked"
                />
              )}
              label="Show locked endpoints"
            />
          </FormGroup>

          <hr className="topbar__divider" />

          <Typography variant="caption" color="text.secondary">
            Device types
          </Typography>
          <FormGroup>
            {FILTER_DEVICE_TYPE_OPTIONS.map((deviceType) => (
              <FormControlLabel
                key={deviceType}
                control={(
                  <Checkbox
                    checked={state.filters.deviceTypes.includes(deviceType)}
                    onChange={() => handleToggleDeviceType(deviceType)}
                    data-testid={`topbar-filter-device-${deviceType}`}
                  />
                )}
              label={deviceType.toUpperCase()}
            />
          ))}
          </FormGroup>

          <hr className="topbar__divider" />

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
                      data-testid={`topbar-filter-sample-${sampleRate}`}
                    />
                  )}
                  label={`${sampleRate} Hz`}
                />
              ))}
            </FormGroup>
          )}

          <hr className="topbar__divider" />

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
                      data-testid={`topbar-filter-channels-${channelCount}`}
                    />
                  )}
                  label={`${channelCount} channels`}
                />
              ))}
            </FormGroup>
          )}

          <hr className="topbar__divider" />

          <Typography variant="caption" color="text.secondary">
            Direction
          </Typography>
          <FormGroup>
            {FILTER_DIRECTION_OPTIONS.map((direction) => (
              <FormControlLabel
                key={direction}
                control={(
                  <Checkbox
                    checked={state.filters.directions.includes(direction)}
                    onChange={() => handleToggleDirection(direction)}
                    data-testid={`topbar-filter-direction-${direction}`}
                  />
                )}
                label={DIRECTION_LABELS[direction]}
              />
            ))}
          </FormGroup>

          <hr className="topbar__divider" />

          <Typography variant="caption" color="text.secondary">
            Health quality
          </Typography>
          <FormGroup>
            {FILTER_QUALITY_OPTIONS.map((quality) => (
              <FormControlLabel
                key={quality}
                control={(
                  <Checkbox
                    checked={state.filters.qualities.includes(quality)}
                    onChange={() => handleToggleQuality(quality)}
                    data-testid={`topbar-filter-quality-${quality}`}
                  />
                )}
                label={QUALITY_LABELS[quality]}
              />
            ))}
          </FormGroup>

          <hr className="topbar__divider" />

          <Typography variant="caption" color="text.secondary">
            Hosts
          </Typography>
          {hostOptions.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              No hosts discovered
            </Typography>
          ) : (
            <FormGroup>
              {hostOptions.map((hostId) => (
                <FormControlLabel
                  key={hostId}
                  control={(
                    <Checkbox
                      checked={state.filters.hostIds.includes(hostId)}
                      onChange={() => handleToggleHost(hostId)}
                      data-testid={`topbar-filter-host-${sanitizeFilterIdValue(hostId)}`}
                    />
                  )}
                  label={hostId}
                />
              ))}
            </FormGroup>
          )}

          <hr className="topbar__divider" />

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
                      data-testid={`topbar-filter-group-${sanitizeFilterIdValue(group)}`}
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
        anchorOrigin={{ vertical: 'bottom', horizontal: isMobile ? 'center' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: isMobile ? 'center' : 'left' }}
      >
        <Box
          sx={{
            p: 2,
            width: { xs: 'min(92vw, 380px)', sm: 380 },
            maxWidth: '92vw',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
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

          <Button
            size="small"
            onClick={handleSwapSceneDiffSelection}
            data-testid="topbar-scene-diff-swap"
          >
            Swap Baseline/Compare
          </Button>

          <hr className="topbar__divider" />

          <TextField
            size="small"
            label="Preset Name"
            value={sceneDiffPresetNameDraft}
            onChange={handleSceneDiffPresetNameDraftChange}
            helperText={`Max ${SCENE_NAME_MAX_LENGTH} chars`}
            inputProps={{ 'data-testid': 'topbar-scene-diff-preset-name-input' }}
          />

          <TextField
            size="small"
            label="Preset Notes"
            value={sceneDiffPresetNotesDraft}
            onChange={handleSceneDiffPresetNotesDraftChange}
            helperText={`Max ${SCENE_DESCRIPTION_MAX_LENGTH} chars`}
            inputProps={{ 'data-testid': 'topbar-scene-diff-preset-notes-input' }}
          />

          <TextField
            size="small"
            label="Preset Version"
            value={sceneDiffPresetVersionDraft}
            onChange={handleSceneDiffPresetVersionDraftChange}
            inputProps={{ 'data-testid': 'topbar-scene-diff-preset-version-input', inputMode: 'numeric' }}
          />

          <FormControl size="small">
            <InputLabel id="scene-diff-preset-conflict-policy-label">Conflict Policy</InputLabel>
            <Select
              labelId="scene-diff-preset-conflict-policy-label"
              label="Conflict Policy"
              value={sceneDiffPresetConflictPolicyDraft}
              onChange={handleSceneDiffPresetConflictPolicyDraftChange}
              data-testid="topbar-scene-diff-preset-conflict-policy-select"
            >
              <MenuItem value="upsert">Upsert</MenuItem>
              <MenuItem value="rename">Rename</MenuItem>
              <MenuItem value="skip">Skip</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleSceneDiffPresetConflictPolicyReset}
              disabled={sceneDiffPresetConflictPolicyDraft === 'upsert'}
              aria-label="Use Default Upsert"
              data-testid="topbar-scene-diff-preset-conflict-policy-reset"
            >
              Use Default Upsert
            </Button>
            <Typography
              variant="caption"
              color="text.secondary"
              data-testid="topbar-scene-diff-preset-conflict-policy-advisory"
            >
              Advisory default used for import-preview conflict rows.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleSaveSceneDiffPreset}
              data-testid="topbar-scene-diff-preset-save"
            >
              Save Preset
            </Button>
            <Typography variant="caption" color="text.secondary" data-testid="topbar-scene-diff-preset-summary">
              {sceneDiffPresetSummary}
            </Typography>
          </Box>

          <FormControl size="small" disabled={sceneDiffPresets.length === 0}>
            <InputLabel id="scene-diff-preset-select-label">Saved Preset</InputLabel>
            <Select
              labelId="scene-diff-preset-select-label"
              label="Saved Preset"
              value={sceneDiffSelectedPresetValue}
              onChange={handleSceneDiffPresetSelectionChange}
              data-testid="topbar-scene-diff-preset-select"
            >
              <MenuItem value="" data-testid="topbar-scene-diff-preset-none">
                <em>None</em>
              </MenuItem>
              {sceneDiffPresets.map((preset) => (
                <MenuItem
                  key={preset.id}
                  value={preset.id}
                  data-testid={`topbar-scene-diff-preset-${sanitizeFilterIdValue(preset.name)}-${sanitizeFilterIdValue(preset.id)}`}
                >
                  {preset.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {sceneDiffPresets.length > 0 ? (
            <Box
              sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}
              data-testid="topbar-scene-diff-preset-policy-summary"
            >
              <Typography
                variant="caption"
                color="text.secondary"
                data-testid="topbar-scene-diff-preset-policy-summary-label"
              >
                Saved preset conflict policies
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {sceneDiffPresets.map((preset) => {
                  const policyLabel = formatConflictResolutionModeLabel(preset.preferred_conflict_action);
                  return (
                    <Chip
                      key={preset.id}
                      size="small"
                      variant={sceneDiffSelectedPresetValue === preset.id ? 'filled' : 'outlined'}
                      color={sceneDiffSelectedPresetValue === preset.id ? 'primary' : 'default'}
                      aria-label={`${preset.name} conflict policy ${policyLabel}`}
                      label={`${preset.name}: ${policyLabel}`}
                      data-testid={`topbar-scene-diff-preset-policy-chip-${sanitizeFilterIdValue(preset.id)}`}
                    />
                  );
                })}
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                data-testid="topbar-scene-diff-selected-preset-policy"
              >
                {`Selected preset policy: ${sceneDiffSelectedPresetPolicyLabel}`}
              </Typography>
              <Typography
                variant="caption"
                color={sceneDiffSelectedPresetDraftPolicyDiffers ? 'warning.main' : 'text.secondary'}
                data-testid="topbar-scene-diff-selected-preset-policy-sync"
              >
                {sceneDiffSelectedPreset
                  ? sceneDiffSelectedPresetDraftPolicyDiffers
                    ? `Draft conflict policy differs (draft: ${sceneDiffDraftPolicyLabel}). Save Preset to persist.`
                    : 'Draft conflict policy matches persisted preset metadata.'
                  : 'No preset selected. Draft conflict policy applies to next save/import defaults.'}
              </Typography>
            </Box>
          ) : null}

          <TextField
            size="small"
            multiline
            minRows={4}
            maxRows={8}
            label="Preset Transfer JSON"
            value={sceneDiffPresetTransferDraft}
            onChange={handleSceneDiffPresetTransferDraftChange}
            inputProps={{ 'data-testid': 'topbar-scene-diff-preset-transfer-input' }}
          />

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={handleExportSceneDiffPresets}
              data-testid="topbar-scene-diff-preset-export"
            >
              Export JSON
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handlePreviewSceneDiffPresets}
              data-testid="topbar-scene-diff-preset-preview"
            >
              Preview JSON
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleImportSceneDiffPresets}
              data-testid="topbar-scene-diff-preset-import"
            >
              Import JSON
            </Button>
          </Box>

          {sceneDiffPresetImportPreview ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
                border: (theme) => `1px solid ${theme.palette.divider}`,
                borderRadius: 1,
                p: 1,
              }}
              data-testid="topbar-scene-diff-import-preview-summary"
            >
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${sceneDiffPresetImportPreview.source_count} source`}
                  data-testid="topbar-scene-diff-import-preview-source-count"
                />
                <Chip
                  size="small"
                  color="success"
                  variant={sceneDiffPresetImportPreview.accepted_count > 0 ? 'filled' : 'outlined'}
                  label={`${sceneDiffPresetImportPreview.accepted_count} accepted`}
                  data-testid="topbar-scene-diff-import-preview-accepted-count"
                />
                <Chip
                  size="small"
                  color="warning"
                  variant={sceneDiffPresetImportPreview.conflict_count > 0 ? 'filled' : 'outlined'}
                  label={`${sceneDiffPresetImportPreview.conflict_count} conflict`}
                  data-testid="topbar-scene-diff-import-preview-conflict-count"
                />
                <Chip
                  size="small"
                  variant={sceneDiffPresetImportPreview.skipped_count > 0 ? 'filled' : 'outlined'}
                  label={`${sceneDiffPresetImportPreview.skipped_count} skipped`}
                  data-testid="topbar-scene-diff-import-preview-skipped-count"
                />
              </Box>

              {sceneDiffImportPlanPreview && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    color="warning"
                    variant={sceneDiffImportPlanPreview.upserted_conflicts > 0 ? 'filled' : 'outlined'}
                    label={`Planned upsert: ${sceneDiffImportPlanPreview.upserted_conflicts}`}
                    data-testid="topbar-scene-diff-import-preview-plan-upserts"
                  />
                  <Chip
                    size="small"
                    color="primary"
                    variant={sceneDiffImportPlanPreview.renamed_conflicts > 0 ? 'filled' : 'outlined'}
                    label={`Planned rename: ${sceneDiffImportPlanPreview.renamed_conflicts}`}
                    data-testid="topbar-scene-diff-import-preview-plan-renames"
                  />
                  <Chip
                    size="small"
                    variant={sceneDiffImportPlanPreview.skipped_conflicts > 0 ? 'filled' : 'outlined'}
                    label={`Planned skip: ${sceneDiffImportPlanPreview.skipped_conflicts}`}
                    data-testid="topbar-scene-diff-import-preview-plan-skips"
                  />
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {sceneDiffImportPreviewRowCounts.conflict > 0 && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleSceneDiffImportPreviewToggleGroup('conflict')}
                    onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneDiffImportPreviewToggleGroup('conflict'))}
                    sx={SCENE_DIFF_PREVIEW_CONTROL_FOCUS_SX}
                    data-testid="topbar-scene-diff-import-preview-group-toggle-conflict"
                  >
                    {sceneDiffImportPreviewCollapsedGroups.conflict ? 'Show' : 'Hide'} Conflict ({sceneDiffImportPreviewRowCounts.conflict})
                  </Button>
                )}
                {sceneDiffImportPreviewRowCounts.accepted > 0 && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleSceneDiffImportPreviewToggleGroup('accepted')}
                    onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneDiffImportPreviewToggleGroup('accepted'))}
                    sx={SCENE_DIFF_PREVIEW_CONTROL_FOCUS_SX}
                    data-testid="topbar-scene-diff-import-preview-group-toggle-accepted"
                  >
                    {sceneDiffImportPreviewCollapsedGroups.accepted ? 'Show' : 'Hide'} Accepted ({sceneDiffImportPreviewRowCounts.accepted})
                  </Button>
                )}
                {sceneDiffImportPreviewRowCounts.skipped > 0 && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleSceneDiffImportPreviewToggleGroup('skipped')}
                    onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneDiffImportPreviewToggleGroup('skipped'))}
                    sx={SCENE_DIFF_PREVIEW_CONTROL_FOCUS_SX}
                    data-testid="topbar-scene-diff-import-preview-group-toggle-skipped"
                  >
                    {sceneDiffImportPreviewCollapsedGroups.skipped ? 'Show' : 'Hide'} Skipped ({sceneDiffImportPreviewRowCounts.skipped})
                  </Button>
                )}
              </Box>

              {sceneDiffImportPreviewRowCounts.conflict > 0 && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => handleSceneDiffBulkConflictAction('upsert')}
                    onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneDiffBulkConflictAction('upsert'))}
                    sx={SCENE_DIFF_PREVIEW_CONTROL_FOCUS_SX}
                    data-testid="topbar-scene-diff-import-preview-conflict-bulk-upsert"
                  >
                    All Conflicts -&gt; Upsert
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleSceneDiffBulkConflictAction('rename')}
                    onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneDiffBulkConflictAction('rename'))}
                    sx={SCENE_DIFF_PREVIEW_CONTROL_FOCUS_SX}
                    data-testid="topbar-scene-diff-import-preview-conflict-bulk-rename"
                  >
                    All Conflicts -&gt; Rename
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleSceneDiffBulkConflictAction('skip')}
                    onKeyDown={(event) => handleKeyboardActivation(event, () => handleSceneDiffBulkConflictAction('skip'))}
                    sx={SCENE_DIFF_PREVIEW_CONTROL_FOCUS_SX}
                    data-testid="topbar-scene-diff-import-preview-conflict-bulk-skip"
                  >
                    All Conflicts -&gt; Skip
                  </Button>
                </Box>
              )}

              <Typography
                variant="caption"
                color="text.secondary"
                data-testid="topbar-scene-diff-import-preview-schema"
              >
                Schema: {sceneDiffPresetImportPreview.schema_version === null
                  ? 'legacy-array'
                  : `v${sceneDiffPresetImportPreview.schema_version}`}
              </Typography>
              {sceneDiffPresetImportPreview.compatibility_hint && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  data-testid="topbar-scene-diff-import-preview-compatibility-hint"
                >
                  {sceneDiffPresetImportPreview.compatibility_hint}
                </Typography>
              )}
              {sceneDiffPresetImportPreview.preferred_conflict_action && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  data-testid="topbar-scene-diff-import-preview-conflict-policy-hint"
                >
                  Conflict policy hint: {sceneDiffPresetImportPreview.preferred_conflict_action} (advisory)
                </Typography>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  data-testid="topbar-scene-diff-import-preview-page-summary"
                >
                  Showing {sceneDiffImportPreviewRangeStart}-{sceneDiffImportPreviewRangeEnd} of {sceneDiffImportPreviewVisibleRowsByGroup.length} visible rows ({sceneDiffImportPreviewRows.length} total)
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleSceneDiffImportPreviewPreviousPage}
                    disabled={!sceneDiffImportPreviewHasPreviousPage}
                    data-testid="topbar-scene-diff-import-preview-page-prev"
                  >
                    Prev
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleSceneDiffImportPreviewNextPage}
                    disabled={!sceneDiffImportPreviewHasNextPage}
                    data-testid="topbar-scene-diff-import-preview-page-next"
                  >
                    Next
                  </Button>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: 168, overflowY: 'auto' }}>
                {visibleSceneDiffImportPreviewRows.map((row, index) => {
                  const absoluteIndex = sceneDiffImportPreviewSliceStart + index;
                  const previousRowStatus = absoluteIndex > 0
                    ? sceneDiffImportPreviewVisibleRowsByGroup[absoluteIndex - 1]?.status || null
                    : null;
                  const showGroupHeader = previousRowStatus !== row.status;
                  return (
                    <React.Fragment key={`${row.name}-${sceneDiffImportPreviewSliceStart + index}`}>
                      {showGroupHeader && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 600, pt: index === 0 ? 0 : 0.5 }}
                          data-testid="topbar-scene-diff-import-preview-group-heading"
                        >
                          {row.status === 'conflict'
                            ? 'Conflict Rows'
                            : row.status === 'accepted'
                              ? 'Accepted Rows'
                              : 'Skipped Rows'}
                        </Typography>
                      )}
                      {(() => {
                    const conflictResolution = sceneDiffConflictResolutions[row.row_id] || {
                      mode: 'upsert' as const,
                      rename_draft: row.incoming ? `${row.incoming.name} Imported` : '',
                    };
                    const conflictRenameError = sceneDiffImportPlanPreview?.row_errors[row.row_id] || null;
                    const rowConflictPolicyHint = row.incoming?.preferred_conflict_action || null;
                    const wrapperConflictPolicyHint = sceneDiffPresetImportPreview.preferred_conflict_action;
                    return (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.25,
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                      borderRadius: 1,
                      px: 0.75,
                      py: 0.5,
                    }}
                    data-testid="topbar-scene-diff-import-preview-row"
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" color="text.primary" sx={{ fontWeight: 600 }}>
                        {row.name}
                      </Typography>
                      <Chip
                        size="small"
                        label={row.status}
                        color={
                          row.status === 'accepted'
                            ? 'success'
                            : row.status === 'conflict'
                              ? 'warning'
                              : 'default'
                        }
                        data-testid="topbar-scene-diff-import-preview-row-status"
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {row.reason}
                    </Typography>
                    {row.incoming && (
                      <Typography variant="caption" color="text.secondary">
                        Incoming: {row.incoming.baseline_scene_id}{' -> '}{row.incoming.compare_scene_id} (v{row.incoming.preset_version})
                      </Typography>
                    )}
                    {rowConflictPolicyHint && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        data-testid={`topbar-scene-diff-import-preview-row-conflict-policy-hint-${row.row_id}`}
                      >
                        {wrapperConflictPolicyHint && wrapperConflictPolicyHint !== rowConflictPolicyHint
                          ? `Conflict policy hint: ${rowConflictPolicyHint} (row override; wrapper default ${wrapperConflictPolicyHint})`
                          : `Conflict policy hint: ${rowConflictPolicyHint} (row advisory)`}
                      </Typography>
                    )}
                    {row.status === 'conflict' && row.existing && (
                      <Typography
                        variant="caption"
                        color="warning.main"
                        data-testid="topbar-scene-diff-import-preview-conflict-detail"
                      >
                        Existing: {row.existing.baseline_scene_id}{' -> '}{row.existing.compare_scene_id} (v{row.existing.preset_version || 1})
                      </Typography>
                    )}
                    {row.status === 'conflict' && row.incoming && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                          <Chip
                            size="small"
                            label="Upsert"
                            variant={conflictResolution.mode === 'upsert' ? 'filled' : 'outlined'}
                            color={conflictResolution.mode === 'upsert' ? 'warning' : 'default'}
                            onClick={() => handleSceneDiffConflictResolutionModeChange(row.row_id, 'upsert')}
                            data-testid={`topbar-scene-diff-import-preview-conflict-action-upsert-${row.row_id}`}
                          />
                          <Chip
                            size="small"
                            label="Rename"
                            variant={conflictResolution.mode === 'rename' ? 'filled' : 'outlined'}
                            color={conflictResolution.mode === 'rename' ? 'primary' : 'default'}
                            onClick={() => handleSceneDiffConflictResolutionModeChange(row.row_id, 'rename')}
                            data-testid={`topbar-scene-diff-import-preview-conflict-action-rename-${row.row_id}`}
                          />
                          <Chip
                            size="small"
                            label="Skip"
                            variant={conflictResolution.mode === 'skip' ? 'filled' : 'outlined'}
                            color={conflictResolution.mode === 'skip' ? 'default' : 'default'}
                            onClick={() => handleSceneDiffConflictResolutionModeChange(row.row_id, 'skip')}
                            data-testid={`topbar-scene-diff-import-preview-conflict-action-skip-${row.row_id}`}
                          />
                        </Box>
                        {conflictResolution.mode === 'rename' && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                            <TextField
                              size="small"
                              label="Rename Conflict Preset"
                              value={conflictResolution.rename_draft}
                              onChange={(event) => handleSceneDiffConflictRenameDraftChange(row.row_id, event.target.value)}
                              helperText={`Max ${SCENE_NAME_MAX_LENGTH} chars`}
                              inputProps={{
                                'data-testid': `topbar-scene-diff-import-preview-conflict-rename-input-${row.row_id}`,
                              }}
                            />
                            {conflictRenameError ? (
                              <Typography
                                variant="caption"
                                color="error.main"
                                data-testid={`topbar-scene-diff-import-preview-conflict-rename-error-${row.row_id}`}
                              >
                                {conflictRenameError}
                              </Typography>
                            ) : (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                data-testid={`topbar-scene-diff-import-preview-conflict-rename-valid-${row.row_id}`}
                              >
                                Rename target is valid.
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                    );
                  })()}
                    </React.Fragment>
                  );
                })}
              </Box>
            </Box>
          ) : (
            <Typography
              variant="caption"
              color="text.secondary"
              data-testid="topbar-scene-diff-import-preview-empty"
            >
              Preview import JSON to inspect accepted, conflict, and skipped rows before importing.
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              onClick={handleApplySceneDiffPreset}
              data-testid="topbar-scene-diff-preset-apply"
              disabled={!sceneDiffSelectedPresetId}
            >
              Apply Preset
            </Button>
            <Button
              size="small"
              color="error"
              onClick={handleDeleteSceneDiffPreset}
              data-testid="topbar-scene-diff-preset-delete"
              disabled={!sceneDiffSelectedPresetId}
            >
              Delete Preset
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" data-testid="topbar-scene-diff-active-preset">
            {sceneDiffActivePreset
              ? `Active preset: ${sceneDiffActivePreset.name}`
              : 'Active preset: none'}
          </Typography>

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
