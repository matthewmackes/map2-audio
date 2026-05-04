/**
 * SnapshotEditorPage - Carbon-first snapshot editor workspace
 *
 * Cortex Control inspired interface with all features from Flows:
 * - Grid-based signal flow visualization
 * - Minimal rotary knobs for parameters
 * - Color-coded plugin blocks
 * - Full routing modes (series, parallel, A/B, morph, sidechain)
 * - Real-time CPU/latency monitoring
 * - Undo/redo history
 * - Preset management
 * - MIDI Learn support
 * - Audio configuration
 */

import { Fragment, useState, useCallback, useMemo, useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Add,
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Favorite,
  FavoriteFilled,
  Flow,
  Headphones,
  Launch,
  Music,
  Pause,
  Play,
  Recording,
  Renew,
  Settings,
  SettingsAdjust,
  Stop,
  TrashCan,
  VolumeMute,
  VolumeUp,
  Close,
  Edit,
  Information,
} from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  Column,
  Grid,
  InlineNotification,
  InlineLoading,
  Layer,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  Select,
  SelectItem,
  Tab,
  TabList,
  Tabs,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFocusReturnTarget } from '../hooks/useFocusReturnTarget'
import { isSnapshotFlowRoute, usePendingLiveChangesNavigationGuard } from '../hooks/usePendingLiveChangesNavigationGuard'
import { useRouteScrollRestoration } from '../hooks/useRouteScrollRestoration'
import { useSnapshotEditorStore } from '../stores/snapshotEditorStore'
import { resolveSnapshotEditorSignalCanvasSettings, useSpecialSettings } from '../hooks/useSpecialSettings'
import { useIsMobile } from '../hooks/useIsMobile'
import { useRealtimeCadence } from '../hooks/useRealtimeCadence'
import { useRouteActive } from '../hooks/useRouteActive'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import { buildWorkspaceArtifactsPath } from './audioArtifactsRoutes'
import {
  invalidateAuthorityAwareLiveSnapshot,
  removeRuntimeChainsFromLiveSnapshot,
  restoreAuthorityAwareLiveSnapshot,
  setAuthorityAwareLiveSnapshot,
} from './snapshotLiveState'
import {
  resolveAuthoritySnapshotId,
  resolveControlPlaneSnapshot,
  resolveEditorActiveSnapshot,
  resolvePreferredLiveRuntimeDisplayState,
} from './snapshotAuthorityState'
import { getCategoryConfig } from '../grid/shared'
import type { AutomationLane } from '../grid/shared'
import {
  chainsApi,
  pluginsApi,
  audioApi,
  metricsApi,
  midiApiV2,
  type AudioAvbEndpoint,
  type AudioPort,
  type AudioRoutingSelectionBinding,
} from '../../map2/api'
import {
  snapshotsApi,
  flowSnapshotDataToSnapshotPayload,
} from '../../map2/clients/snapshots'
import { audioStateApi } from '../../map2/clients/audioState'
import { ApiError, fetchJson } from '../../map2/http'
import { useToasts } from '../components/Toasts'
import type { NotificationOptions, NotificationTone } from '../components/Toasts'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { usePluginOutputs } from '../hooks/usePluginOutputs'
import { useSnapshots } from '../hooks/useSnapshots'
import { useSnapshotActivationEvents, useSnapshotRuntimeLiveState } from '../hooks/useSnapshotRuntimeState'
import { computeLiveBadgeState, useSnapshotReconciliation } from '../hooks/useSnapshotReconciliation'
import { useAudioDeviceHealth } from '../hooks/useAudioDeviceHealth'
import { AudioDeviceDisconnectedBanner } from '../components/SnapshotEditor/AudioDeviceDisconnectedBanner'
import { useCommittedAudioState } from '../hooks/useAuthoritativeAudioState'
import { useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import { getEffectIcon } from '../components/icons/effectIcons'
import MidiLearnButton from '../../map2/components/MIDI/MidiLearnButton'
import { NumberInput } from '../components/ParameterControl'
import { SegmentedLedText } from '../components/Displays/SegmentedLedText'
import { MapAudioGridIcon } from '../components/icons/map'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'
import type {
  AuthoritativeAudioStateEnvelope,
  Chain,
  Plugin,
  PluginLoaderState,
  PluginOrderRef,
  SnapshotDraftData,
  ChainSnapshot,
  ChainsResponse,
  Snapshot,
  SnapshotDetail,
  SnapshotSummary,
  SnapshotMidiMapEntry,
  MIDIMappingV2,
  MIDIStatus,
  PluginParameter,
  SnapshotExpressionMapping,
} from '../../map2/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import { buildPluginOrderRef } from '../../map2/utils/pluginIdentity'
import { sortPluginsForBrowser } from '../utils/pluginBrowserSort'
import { canonicalizePluginUri } from '../utils/pluginUris'
import { buildAuthorityLivePathSelectionUpdate } from '../utils/audioStateLivePaths'
import {
  sortFavoriteSnapshotsForSetlist,
  sortSnapshotsByProgramNumber,
} from '../utils/snapshotSetlist'
import {
  buildCapturedSnapshotName,
  normalizeSnapshotName,
  validateSnapshotName,
} from '../utils/snapshotNames'
import {
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
  buildSnapshotActivationFailureStageToast,
  buildSnapshotActivationFailureToastMessage,
  buildSnapshotActivationStageToast,
  buildSnapshotActivationToastMessage,
  extractSnapshotActivationFailureDetail,
  extractSnapshotActivationFailureReason,
} from '../utils/snapshotActivationToast'
import {
  collectSnapshotMidiMapEntries,
  formatMidiNoteLabel,
  getSnapshotBlockFocusRange,
  normalizeSnapshotBlockFocusSnapshot,
  parseMidiActivityNoteOn,
  replaceSnapshotBlockFocusRange,
  resolveSnapshotBlockFocusIndex,
} from '../utils/snapshotBlockFocus'
import {
  createEmptyFootswitchLabelDrafts,
  getSnapshotFootswitchLabelMap,
  normalizeSnapshotFootswitchLabelSnapshot,
  replaceSnapshotFootswitchLabelMap,
  sanitizeFootswitchLabel,
} from '../utils/snapshotFootswitchLabels'
import {
  getSnapshotAbSwitchMidiBinding,
  normalizeSnapshotAbSwitchMidiSnapshot,
  replaceSnapshotAbSwitchMidiBinding,
  type SnapshotAbSwitchMidiMessageType,
} from '../utils/snapshotAbSwitchMidi'
import {
  normalizeSnapshotExpressionMappings,
  normalizeSnapshotExpressionMappingsSnapshot,
} from '../utils/snapshotExpressionMappings'
import {
  isSnapshotCurrentAuthorityLive,
  resolveSnapshotGoLiveState,
} from '../utils/snapshotGoLiveState'
import {
  resolveSnapshotRoutingLiveStatus,
  type SnapshotRoutingLiveApplyState,
} from '../utils/snapshotRoutingLiveState'
import {
  buildSnapshotIoControlsUpdate,
  SNAPSHOT_IO_USE_DEFAULT_OPTION,
  buildSnapshotIoDefaultsUpdate,
  buildSnapshotIoModalState,
  buildSnapshotIoUpdateRequest,
  collectMonitoringOutputPairOptions,
  collectSnapshotIoDeviceOptions,
  type SnapshotIoDefaults,
  type SnapshotIoModalState,
} from '../utils/snapshotIoBindings'
import { applyFlowSlotUpdate } from '../utils/snapshotFlowSlots'
import { JuceGridSelectedBlockMidiPanel } from '../components/SnapshotEditor/SnapshotEditorSelectedBlockMidiPanel'
import { SnapshotPreloadSlotsPanel } from '../components/SnapshotEditor/SnapshotPreloadSlotsPanel'
import { decidePreloadGate } from '../components/SnapshotEditor/snapshotEditorPreloadGate'
import { useSnapshotPreloadStatus } from '../hooks/useSnapshotPreloadStatus'
import { PedalboardBuildWizard } from '../components/SnapshotEditor/BottomWizard/PedalboardBuildWizard'
import { PublishReadyBanner } from '../components/SnapshotEditor/PublishReadyBanner'
import { SnapshotAbSwitchMidiCard } from '../components/SnapshotEditor/SnapshotAbSwitchMidiCard'
import {
  type SnapshotEditorWorkspaceActionId,
  SnapshotEditorSnapshotStatusPanel,
} from '../components/SnapshotEditor/SnapshotEditorSnapshotStatusPanel'
import { SnapshotExpressionMappingsCard } from '../components/SnapshotEditor/SnapshotExpressionMappingsCard'
import { SnapshotFootswitchLabelCard } from '../components/SnapshotEditor/SnapshotFootswitchLabelCard'
import { buildSnapshotEditorSelectedPluginCard } from '../components/SnapshotEditor/snapshotEditorSelectedPluginCard'
import { useSnapshotEditorUndoRedo } from '../components/SnapshotEditor/useSnapshotEditorUndoRedo'
import { JuceGridParameterEditor } from '../components/SnapshotEditor/SnapshotEditorParameterEditor'
import {
  JuceGridRoutingVisualizer,
  getJuceGridRoutingInspectorItems,
  type JuceGridRoutingMarkerId,
} from '../components/SnapshotEditor/SnapshotEditorRoutingVisualizer'
import { JuceGridSignalCanvas, type JuceGridAudioInterfaceStatus } from '../components/SnapshotEditor/SnapshotEditorSignalCanvas'
import {
  FLOW_CARD_CLIP_HOLD_MS,
  FLOW_CARD_CLIP_LED_COLOR,
  FLOW_CARD_LED_COLOR,
  getFlowCardPaletteEntry,
  resolveFlowEdgeClipTimestamp,
  resolveFlowClipTimestamp,
} from '../components/SnapshotEditor/snapshotEditorFlowCard'
import { buildJuceGridLivePath } from '../components/SnapshotEditor/snapshotEditorLivePath'
import {
  applyOptimisticJuceGridLiveChainSet,
  buildAuthoritativeJuceGridLiveChainProjection,
  buildJuceGridRevertedStateFromLiveProjection,
  getJuceGridDesiredLiveChainIds,
  hasCommittedAuthorityLivePaths,
  hasJuceGridLiveChainMismatch,
} from '../components/SnapshotEditor/snapshotEditorLiveChains'
import type { JuceGridRoutingState } from '../components/SnapshotEditor/snapshotEditorFlowState'
import {
  createBlankSnapshotEditorAddEffectDraft,
} from '../components/SnapshotEditor/snapshotEditorEntryDraft'
import {
  buildSnapshotGoLiveDiff,
} from '../components/SnapshotEditor/snapshotEditorComparison'
import {
  applySnapshotDraftToChainsResponse,
  buildEffectiveLiveSnapshotChains,
  buildSnapshotEditorLiveSnapshotHydration,
  type SnapshotEditorLiveSnapshotHydration,
} from '../components/SnapshotEditor/snapshotEditorLiveSnapshotHydration'
import {
  resolveSnapshotChainId,
  resolveSnapshotPluginIdentity,
} from '../components/SnapshotEditor/snapshotEditorMutationIdentity'
import { isSystemNoiseGatePlugin } from '../utils/snapshotSystemBlocks'
import {
  clearLiveWorkingSnapshotDraft,
  readCompatibleLiveWorkingSnapshotDraft,
  readLiveWorkingSnapshotDraft,
  writeLiveWorkingSnapshotDraft,
} from '../utils/liveWorkingSnapshotDraft'
import './SnapshotEditorPage.css'
import { PluginCardRouter } from '../components/PluginCards'
import { resolveLivePluginCardStrategy } from '../components/PluginCards/liveEditorRouting'
import {
  cloneSnapshotDraftData,
  describeFlowUpdate,
  describeLoaderStateDraftChange,
  extractActivationProgressMetrics,
  fingerprintSnapshotDraftData,
  isTextEntryTarget,
  mergePreviewIntoSnapshotDetail,
  resequenceChainSnapshotPlugins,
  snapshotDraftsEqual,
  updateDraftChain,
} from './snapshotEditor/snapshotEditorPageHelpers'
import {
  COMPACT_TAB_ORDER,
  DEFAULT_FLOW_COUNT,
  DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS,
  DEFAULT_SYSTEM_NOISE_GATE_PARAMETERS,
  JUCE_GRID_EFFECT_MODAL_OPEN_KEY,
  JUCE_GRID_SCROLL_TOP_KEY,
  JUCE_GRID_SELECTED_PLUGIN_KEY,
  LIVE_ACTIVATION_PHASES,
  LIVE_CHANGES_LEAVE_MESSAGE,
  MAX_FLOWS,
  MIDI_CURVE_LABELS,
  MIN_FLOWS,
  NOISE_GATE_RELEASE_CONFIG_KEY,
  NOISE_GATE_THRESHOLD_CONFIG_KEY,
  ROUTING_MODE_OPTIONS,
  SNAPSHOT_DEFAULT_INPUT_DEVICE_CONFIG_KEY,
  SNAPSHOT_DEFAULT_MONITORING_OUTPUT_INDEX_CONFIG_KEY,
  SNAPSHOT_DEFAULT_OUTPUT_DEVICE_CONFIG_KEY,
} from './snapshotEditor/snapshotEditorPageTypes'
import type {
  CompactTabId,
  FlowSlot,
  JuceGridMidiScope,
  LivePathArrowTone,
  LivePathGroupKind,
  MidiRangeDraft,
  PendingTabletDeletePluginState,
  ReorderDirection,
  ReorderPreviewState,
  RoutingConfig,
  RoutingInspectorContent,
  SnapshotEditorPerformanceEvent,
  SnapshotEditorPerformanceEventsResponse,
} from './snapshotEditor/snapshotEditorPageTypes'
import { FlowLevelControl } from './snapshotEditor/FlowLevelControl'
import { useSnapshotEditorRoutingHandlers } from './snapshotEditor/useSnapshotEditorRoutingHandlers'
import { useSnapshotEditorMidiBindingDrafts } from './snapshotEditor/useSnapshotEditorMidiBindingDrafts'
import {
  buildTraceableChannelChainName,
  countAudioBindingChannels,
  fallbackPluginLabel,
  formatInspectorList,
  formatMidiMappingValue,
  getAudioRouteLabels,
  getLivePathArrowTone,
  getLivePathBranchLabel,
  getLivePathStateLabel,
  getRoutingFocusFlowSummary,
  getSelectedPluginHeroIcon,
  parseMidiMappingValue,
} from './snapshotEditor/snapshotEditorLiveLabels'
import {
  loadInitialJuceGridPluginPersistence,
  useJuceGridPersistedState,
} from './snapshotEditor/useJuceGridPersistedState'
import { useSnapshotEditorCadences } from './snapshotEditor/useSnapshotEditorCadences'
import { FEATURED_NATIVE_BROWSER_GROUPS } from './snapshotEditor/featuredNativeBrowserGroups'
import {
  createBlankSnapshotEditorDraft,
  createDefaultFlows,
  createDefaultRouting,
  FLOW_SLOT_NORMALIZATION_OPTIONS,
  loadInitialJuceGridState,
  normalizeRuntimeGridState,
  parseStoredGridJson,
  SLOT_COLORS,
} from './snapshotEditor/snapshotEditorBootstrap'
import { API_BASE } from './snapshotEditor/snapshotEditorApi'
import { SnapshotEditorPresetBrowser } from './snapshotEditor/SnapshotEditorPresetBrowser'
import { SnapshotEditorPluginBrowser } from './snapshotEditor/SnapshotEditorPluginBrowser'
import { SnapshotEditorCompactPanels } from './snapshotEditor/SnapshotEditorCompactPanels'
import { SnapshotEditorAutomationToggle } from './snapshotEditor/SnapshotEditorAutomationToggle'
import { SnapshotEditorWorkspaceModals } from './snapshotEditor/SnapshotEditorWorkspaceModals'
import { SnapshotEditorAuxModals } from './snapshotEditor/SnapshotEditorAuxModals'
import { SnapshotEditorChainDialogs } from './snapshotEditor/SnapshotEditorChainDialogs'
import { SnapshotEditorMidiMappingsModal } from './snapshotEditor/SnapshotEditorMidiMappingsModal'
import { SnapshotEditorRoutingModals } from './snapshotEditor/SnapshotEditorRoutingModals'
import { SnapshotEditorRoutingInspector } from './snapshotEditor/SnapshotEditorRoutingInspector'
import { SnapshotEditorBottomEditor } from './snapshotEditor/SnapshotEditorBottomEditor'
import { SnapshotEditorTabletLayout } from './snapshotEditor/SnapshotEditorTabletLayout'

// API_BASE lives in ./snapshotEditor/snapshotEditorApi (T2467 follow-up).

// NOISE_GATE_*_CONFIG_KEY / SNAPSHOT_DEFAULT_*_CONFIG_KEY /
// LIVE_CHANGES_LEAVE_MESSAGE live in
// ./snapshotEditor/snapshotEditorPageTypes (T2468 follow-up).
// DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS + DEFAULT_SYSTEM_NOISE_GATE_PARAMETERS
// live in ./snapshotEditor/snapshotEditorPageTypes (T2468 follow-up).

// Pure helpers extracted to ./snapshotEditor/snapshotEditorPageHelpers.ts (T2467).

// FEATURED_NATIVE_BROWSER_GROUPS lives in
// ./snapshotEditor/featuredNativeBrowserGroups (T2467 follow-up).

// SnapshotEditorPerformanceEvent + SnapshotEditorPerformanceEventsResponse
// live in ./snapshotEditor/snapshotEditorPageTypes (T2468 follow-up).

// FlowLevelControl + FlowLevelControlProps live in
// ./snapshotEditor/FlowLevelControl (T2469).

// isTextEntryTarget lives in ./snapshotEditor/snapshotEditorPageHelpers (T2467 follow-up).

// RoutingInspectorContent / LivePathArrowTone / LivePathGroupKind live in
// ./snapshotEditor/snapshotEditorPageTypes (T2468).

// formatInspectorList / formatMidiMappingValue / parseMidiMappingValue /
// fallbackPluginLabel / getSelectedPluginHeroIcon / getAudioRouteLabels /
// countAudioBindingChannels / getLivePathArrowTone / getLivePathStateLabel /
// getLivePathBranchLabel live in
// ./snapshotEditor/snapshotEditorLiveLabels (T2470).

// ============================================================================
// Types
// ============================================================================

// FlowSlot / RoutingMode / RoutingConfig / CompactTabId / JuceGridMidiScope /
// ReorderDirection / MidiRangeDraft / ReorderPreviewState /
// PendingTabletDeletePluginState live in
// ./snapshotEditor/snapshotEditorPageTypes (T2468).

// ============================================================================
// Constants
// ============================================================================

// SLOT_COLORS lives in ./snapshotEditor/snapshotEditorBootstrap (T2467 follow-up).

// sanitizeTraceableNamePart / formatCompactTimestamp /
// buildTraceableChannelChainName / getRoutingFocusFlowSummary live in
// ./snapshotEditor/snapshotEditorLiveLabels (T2470).

// Type-coupled constants (MIN_FLOWS, MAX_FLOWS, DEFAULT_FLOW_COUNT,
// COMPACT_TAB_ORDER, ROUTING_MODE_OPTIONS, MIDI_CURVE_LABELS,
// KEYBOARD_SHORTCUT_SECTIONS, JUCE_GRID_*) live in
// ./snapshotEditor/snapshotEditorPageTypes (T2468).

// ============================================================================
// Helper Functions
// ============================================================================

// createDefaultFlows / createDefaultRouting / FLOW_SLOT_NORMALIZATION_OPTIONS /
// createBlankSnapshotEditorDraft / parseStoredGridJson / normalizeRuntimeGridState /
// loadInitialJuceGridState live in
// ./snapshotEditor/snapshotEditorBootstrap (T2467 follow-up).

// loadInitialPluginPersistence + the JUCE_GRID_* localStorage
// write-effect blocks live in
// ./snapshotEditor/useJuceGridPersistedState (T2471). Renamed from
// loadInitialPluginPersistence -> loadInitialJuceGridPluginPersistence.

// ============================================================================
// Main Component
// ============================================================================

// LIVE_ACTIVATION_PHASES lives in ./snapshotEditor/snapshotEditorPageTypes (T2468 follow-up).

// extractActivationProgressMetrics lives in ./snapshotEditor/snapshotEditorPageHelpers (T2467 follow-up).

// One-shot store hydration runs at module import, before any React render.
// The page is lazy-loaded (App.tsx routes via React.lazy), so this fires
// only when the user actually navigates to the snapshot editor and runs
// exactly once per session — Strict Mode's double-invocation cannot
// re-trigger module evaluation.
let snapshotEditorStoreHydrated = false
function hydrateSnapshotEditorStoreOnce(): void {
  if (snapshotEditorStoreHydrated) return
  snapshotEditorStoreHydrated = true

  const initialPersistedState = loadInitialJuceGridState()
  const initialPluginPersistence = loadInitialJuceGridPluginPersistence()

  // Two-key reads (current + legacy) wrapped in a single safe accessor so a
  // poisoned localStorage entry can't crash the editor on mount.
  const readSnapshotStorage = (currentKey: string, legacyKey: string): string | null => {
    try {
      return localStorage.getItem(currentKey) ?? localStorage.getItem(legacyKey)
    } catch {
      return null
    }
  }

  const selectedCategory = readSnapshotStorage('map2_juce_grid_plugin_category', 'map2_grid_plugin_category') || 'all'

  let collapsedCategories: Set<string> = new Set<string>()
  const collapsedRaw = readSnapshotStorage('map2_juce_grid_collapsed_categories', 'map2_grid_collapsed_categories')
  if (collapsedRaw) {
    try {
      const parsed: unknown = JSON.parse(collapsedRaw)
      if (Array.isArray(parsed)) {
        collapsedCategories = new Set<string>(parsed.filter((entry): entry is string => typeof entry === 'string'))
      }
    } catch { /* unparseable storage value — fall back to empty set */ }
  }

  useSnapshotEditorStore.setState({
    flowSlots: initialPersistedState.flowSlots,
    routing: initialPersistedState.routing,
    activeFlowIndex: initialPersistedState.activeFlowIndex,
    selectedPluginUri: initialPluginPersistence.selectedPluginUri,
    selectedPluginPosition: initialPluginPersistence.selectedPluginPosition,
    effectModalOpen: initialPluginPersistence.effectModalOpen,
    selectedCategory,
    collapsedCategories,
    footswitchLabelDrafts: createEmptyFootswitchLabelDrafts(),
    snapshotIoModalState: buildSnapshotIoModalState(null, null),
    noiseGateThresholdDraft: DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS.thresholdDb,
    noiseGateReleaseDraft: DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS.releaseMs,
  })
}

if (typeof window !== 'undefined') {
  hydrateSnapshotEditorStoreOnce()
}

export function SnapshotEditorPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const isMobile = useIsMobile()
  const {
    isTabletViewport: isTablet,
    isTouchCapable,
    isTabletTouchRoute: isTabletTouchLayout,
  } = useTabletTouchRouteLayout(location.pathname)
  const isCompactLayout = isMobile || isTablet
  const showCompactWorkflowPanels = isCompactLayout && !isTabletTouchLayout
  const showViewportBlockScreen = isMobile
  const showViewportRotateHint = showViewportBlockScreen && isTouchCapable

  const compactTab = useSnapshotEditorStore((s) => s.compactTab)
  const setCompactTab = useSnapshotEditorStore((s) => s.setCompactTab)
  const flowSlots = useSnapshotEditorStore((s) => s.flowSlots) as FlowSlot[]
  const setFlowSlots = useSnapshotEditorStore((s) => s.setFlowSlots) as (
    v: FlowSlot[] | ((prev: FlowSlot[]) => FlowSlot[]),
  ) => void
  const routing = useSnapshotEditorStore((s) => s.routing) as RoutingConfig
  const setRouting = useSnapshotEditorStore((s) => s.setRouting) as (
    v: RoutingConfig | ((prev: RoutingConfig) => RoutingConfig),
  ) => void
  const activeFlowIndex = useSnapshotEditorStore((s) => s.activeFlowIndex)
  const setActiveFlowIndex = useSnapshotEditorStore((s) => s.setActiveFlowIndex)
  const selectedPluginUri = useSnapshotEditorStore((s) => s.selectedPluginUri)
  const setSelectedPluginUri = useSnapshotEditorStore((s) => s.setSelectedPluginUri)
  const selectedPluginPosition = useSnapshotEditorStore((s) => s.selectedPluginPosition)
  const setSelectedPluginPosition = useSnapshotEditorStore((s) => s.setSelectedPluginPosition)
  const effectModalOpen = useSnapshotEditorStore((s) => s.effectModalOpen)
  const setEffectModalOpen = useSnapshotEditorStore((s) => s.setEffectModalOpen)
  const showPluginBrowser = useSnapshotEditorStore((s) => s.showPluginBrowser)
  const setShowPluginBrowser = useSnapshotEditorStore((s) => s.setShowPluginBrowser)
  // Plugin browser mode — 'catalog' = canonical tonechaser URI catalog from
  // /api/state-authority/uri-catalog, 'plugins' = the full LV2+native plugin
  // directory (default). Local state (not persisted) so it defaults back to
  // 'plugins' each time the modal is reopened.
  const [pluginBrowserMode, setPluginBrowserMode] = useState<'plugins' | 'catalog'>('plugins')
  const showPresetBrowser = useSnapshotEditorStore((s) => s.showPresetBrowser)
  const setShowPresetBrowser = useSnapshotEditorStore((s) => s.setShowPresetBrowser)
  const showSavePresetModal = useSnapshotEditorStore((s) => s.showSavePresetModal)
  const setShowSavePresetModal = useSnapshotEditorStore((s) => s.setShowSavePresetModal)
  const savePresetName = useSnapshotEditorStore((s) => s.savePresetName)
  const setSavePresetName = useSnapshotEditorStore((s) => s.setSavePresetName)
  const editingSnapshotName = useSnapshotEditorStore((s) => s.editingSnapshotName)
  const setEditingSnapshotName = useSnapshotEditorStore((s) => s.setEditingSnapshotName)
  const renameSnapshotName = useSnapshotEditorStore((s) => s.renameSnapshotName)
  const setRenameSnapshotName = useSnapshotEditorStore((s) => s.setRenameSnapshotName)
  const [snapshotProgramValue, setSnapshotProgramValue] = useState<string>('')
  const showRenameChainModal = useSnapshotEditorStore((s) => s.showRenameChainModal)
  const setShowRenameChainModal = useSnapshotEditorStore((s) => s.setShowRenameChainModal)
  const renameChainName = useSnapshotEditorStore((s) => s.renameChainName)
  const setRenameChainName = useSnapshotEditorStore((s) => s.setRenameChainName)
  const presetPendingDelete = useSnapshotEditorStore((s) => s.presetPendingDelete)
  const setPresetPendingDelete = useSnapshotEditorStore((s) => s.setPresetPendingDelete)
  const showClearFlowsModal = useSnapshotEditorStore((s) => s.showClearFlowsModal)
  const setShowClearFlowsModal = useSnapshotEditorStore((s) => s.setShowClearFlowsModal)
  const assignmentDialogOpen = useSnapshotEditorStore((s) => s.assignmentDialogOpen)
  const setAssignmentDialogOpen = useSnapshotEditorStore((s) => s.setAssignmentDialogOpen)
  const selectedFlowForAssignment = useSnapshotEditorStore((s) => s.selectedFlowForAssignment) as FlowSlot | null
  const setSelectedFlowForAssignment = useSnapshotEditorStore((s) => s.setSelectedFlowForAssignment) as (v: FlowSlot | null) => void
  const assignmentSelectedNodeId = useSnapshotEditorStore((s) => s.assignmentSelectedNodeId)
  const setAssignmentSelectedNodeId = useSnapshotEditorStore((s) => s.setAssignmentSelectedNodeId)
  const assignmentRedundancyEnabled = useSnapshotEditorStore((s) => s.assignmentRedundancyEnabled)
  const setAssignmentRedundancyEnabled = useSnapshotEditorStore((s) => s.setAssignmentRedundancyEnabled)
  const isAssigningFlow = useSnapshotEditorStore((s) => s.isAssigningFlow)
  const setIsAssigningFlow = useSnapshotEditorStore((s) => s.setIsAssigningFlow)
  const pluginSearchQuery = useSnapshotEditorStore((s) => s.pluginSearchQuery)
  const setPluginSearchQuery = useSnapshotEditorStore((s) => s.setPluginSearchQuery)
  const midiLearnActive = useSnapshotEditorStore((s) => s.midiLearnActive)
  const setMidiLearnActive = useSnapshotEditorStore((s) => s.setMidiLearnActive)
  const midiScope = useSnapshotEditorStore((s) => s.midiScope)
  const setMidiScope = useSnapshotEditorStore((s) => s.setMidiScope)
  const midiRangeDrafts = useSnapshotEditorStore((s) => s.midiRangeDrafts)
  const setMidiRangeDrafts = useSnapshotEditorStore((s) => s.setMidiRangeDrafts)
  const isRefreshingPlugins = useSnapshotEditorStore((s) => s.isRefreshingPlugins)
  const setIsRefreshingPlugins = useSnapshotEditorStore((s) => s.setIsRefreshingPlugins)
  const detailsPlugin = useSnapshotEditorStore((s) => s.detailsPlugin)
  const setDetailsPlugin = useSnapshotEditorStore((s) => s.setDetailsPlugin)
  const favoritePlugins = useSnapshotEditorStore((s) => s.favoritePlugins)
  const setFavoritePlugins = useSnapshotEditorStore((s) => s.setFavoritePlugins)
  const pluginLevels = useSnapshotEditorStore((s) => s.pluginLevels)
  const setPluginLevels = useSnapshotEditorStore((s) => s.setPluginLevels)
  const wetDryMixes = useSnapshotEditorStore((s) => s.wetDryMixes)
  const setWetDryMixes = useSnapshotEditorStore((s) => s.setWetDryMixes)
  const reorderPreview = useSnapshotEditorStore((s) => s.reorderPreview)
  const setReorderPreview = useSnapshotEditorStore((s) => s.setReorderPreview)
  const showKeyboardHelp = useSnapshotEditorStore((s) => s.showKeyboardHelp)
  const setShowKeyboardHelp = useSnapshotEditorStore((s) => s.setShowKeyboardHelp)
  const showPerformModal = useSnapshotEditorStore((s) => s.showPerformModal)
  const setShowPerformModal = useSnapshotEditorStore((s) => s.setShowPerformModal)
  const showAudioNodesModal = useSnapshotEditorStore((s) => s.showAudioNodesModal)
  const setShowAudioNodesModal = useSnapshotEditorStore((s) => s.setShowAudioNodesModal)
  const showProgressModal = useSnapshotEditorStore((s) => s.showProgressModal)
  const setShowProgressModal = useSnapshotEditorStore((s) => s.setShowProgressModal)
  const progressModalInitialTab = useSnapshotEditorStore((s) => s.progressModalInitialTab)
  const setProgressModalInitialTab = useSnapshotEditorStore((s) => s.setProgressModalInitialTab)
  const progressModalInitialSection = useSnapshotEditorStore((s) => s.progressModalInitialSection)
  const setProgressModalInitialSection = useSnapshotEditorStore((s) => s.setProgressModalInitialSection)
  const showLiveRuntimeModal = useSnapshotEditorStore((s) => s.showLiveRuntimeModal)
  const setShowLiveRuntimeModal = useSnapshotEditorStore((s) => s.setShowLiveRuntimeModal)
  const showVersionHistoryModal = useSnapshotEditorStore((s) => s.showVersionHistoryModal)
  const setShowVersionHistoryModal = useSnapshotEditorStore((s) => s.setShowVersionHistoryModal)
  const focusedBranchId = useSnapshotEditorStore((s) => s.focusedBranchId)
  const setFocusedBranchId = useSnapshotEditorStore((s) => s.setFocusedBranchId)
  const expandedTabletBranchId = useSnapshotEditorStore((s) => s.expandedTabletBranchId)
  const setExpandedTabletBranchId = useSnapshotEditorStore((s) => s.setExpandedTabletBranchId)
  const branchPageByFlowId = useSnapshotEditorStore((s) => s.branchPageByFlowId)
  const setBranchPageByFlowId = useSnapshotEditorStore((s) => s.setBranchPageByFlowId)
  const tabletEditorOpen = useSnapshotEditorStore((s) => s.tabletEditorOpen)
  const setTabletEditorOpen = useSnapshotEditorStore((s) => s.setTabletEditorOpen)
  const pendingTabletDeletePlugin = useSnapshotEditorStore((s) => s.pendingTabletDeletePlugin)
  const setPendingTabletDeletePlugin = useSnapshotEditorStore((s) => s.setPendingTabletDeletePlugin)
  const {
    capture: captureWorkspaceModalLauncher,
    restore: restoreWorkspaceModalLauncher,
  } = useFocusReturnTarget<HTMLElement>()
  const missingSelectedPluginMetaWarningKeyRef = useRef<string | null>(null)
  const openPlatformDocs = useCallback((doc?: string) => {
    const params = new URLSearchParams({ context: 'juce-grid' })
    if (doc) {
      params.set('doc', doc)
    }
    navigate(`/about?${params.toString()}`)
  }, [navigate])
  const closeAudioRoutingWorkspace = useCallback(() => {
    setShowAudioNodesModal(false)
    restoreWorkspaceModalLauncher()
  }, [restoreWorkspaceModalLauncher])
  const closeMidiMappingsWorkspace = useCallback(() => {
    setMidiModalOpen(false)
    restoreWorkspaceModalLauncher()
  }, [restoreWorkspaceModalLauncher])
  const closeLiveRuntimeWorkspace = useCallback(() => {
    setShowLiveRuntimeModal(false)
    restoreWorkspaceModalLauncher()
  }, [restoreWorkspaceModalLauncher])
  const closePerformWorkspace = useCallback(() => {
    setShowPerformModal(false)
    restoreWorkspaceModalLauncher()
  }, [restoreWorkspaceModalLauncher])
  const closeVersionHistoryWorkspace = useCallback(() => {
    setShowVersionHistoryModal(false)
    restoreWorkspaceModalLauncher()
  }, [restoreWorkspaceModalLauncher])

  // Special settings for plugin filtering and snapshot editor setlist mode
  const { settings: specialSettings, updateSettings: updateSpecialSettings } = useSpecialSettings()
  const signalCanvasSettings = useMemo(
    () => resolveSnapshotEditorSignalCanvasSettings(specialSettings),
    [specialSettings],
  )

  const selectedCategory = useSnapshotEditorStore((s) => s.selectedCategory)
  const setSelectedCategory = useSnapshotEditorStore((s) => s.setSelectedCategory)
  const collapsedCategories = useSnapshotEditorStore((s) => s.collapsedCategories)
  const setCollapsedCategories = useSnapshotEditorStore((s) => s.setCollapsedCategories)

  const automationTimelineExpanded = useSnapshotEditorStore((s) => s.automationTimelineExpanded)
  const setAutomationTimelineExpanded = useSnapshotEditorStore((s) => s.setAutomationTimelineExpanded)
  const automationPanelHeight = useSnapshotEditorStore((s) => s.automationPanelHeight)
  const setAutomationPanelHeight = useSnapshotEditorStore((s) => s.setAutomationPanelHeight)
  const automationPanelRef = useRef<HTMLDivElement | null>(null)

  const midiModalOpen = useSnapshotEditorStore((s) => s.midiModalOpen)
  const setMidiModalOpen = useSnapshotEditorStore((s) => s.setMidiModalOpen)
  const snapshotIoModalState = useSnapshotEditorStore((s) => s.snapshotIoModalState)
  const setSnapshotIoModalState = useSnapshotEditorStore((s) => s.setSnapshotIoModalState)
  const outputReferenceThresholdDraft = useSnapshotEditorStore((s) => s.outputReferenceThresholdDraft)
  const setOutputReferenceThresholdDraft = useSnapshotEditorStore((s) => s.setOutputReferenceThresholdDraft)
  const noiseGateThresholdDraft = useSnapshotEditorStore((s) => s.noiseGateThresholdDraft)
  const setNoiseGateThresholdDraft = useSnapshotEditorStore((s) => s.setNoiseGateThresholdDraft)
  const noiseGateReleaseDraft = useSnapshotEditorStore((s) => s.noiseGateReleaseDraft)
  const setNoiseGateReleaseDraft = useSnapshotEditorStore((s) => s.setNoiseGateReleaseDraft)
  const snapshotsDirty = useSnapshotEditorStore((s) => s.snapshotsDirty)
  const setSnapshotsDirty = useSnapshotEditorStore((s) => s.setSnapshotsDirty)
  const snapshotSetlistModePending = useSnapshotEditorStore((s) => s.snapshotSetlistModePending)
  const setSnapshotSetlistModePending = useSnapshotEditorStore((s) => s.setSnapshotSetlistModePending)
  const editorSnapshotOverride = useSnapshotEditorStore((s) => s.editorSnapshotOverride)
  const setEditorSnapshotOverride = useSnapshotEditorStore((s) => s.setEditorSnapshotOverride)
  const editorSnapshotContext = useSnapshotEditorStore((s) => s.editorSnapshotContext)
  const setEditorSnapshotContext = useSnapshotEditorStore((s) => s.setEditorSnapshotContext)
  const pendingGoLiveSnapshotId = useSnapshotEditorStore((s) => s.pendingGoLiveSnapshotId)
  const setPendingGoLiveSnapshotId = useSnapshotEditorStore((s) => s.setPendingGoLiveSnapshotId)
  const pendingGoLiveRequestedAt = useSnapshotEditorStore((s) => s.pendingGoLiveRequestedAt)
  const setPendingGoLiveRequestedAt = useSnapshotEditorStore((s) => s.setPendingGoLiveRequestedAt)
  const confirmedGoLiveSnapshotId = useSnapshotEditorStore((s) => s.confirmedGoLiveSnapshotId)
  const setConfirmedGoLiveSnapshotId = useSnapshotEditorStore((s) => s.setConfirmedGoLiveSnapshotId)
  const failedGoLiveSnapshotId = useSnapshotEditorStore((s) => s.failedGoLiveSnapshotId)
  const setFailedGoLiveSnapshotId = useSnapshotEditorStore((s) => s.setFailedGoLiveSnapshotId)
  const goLiveFailureReason = useSnapshotEditorStore((s) => s.goLiveFailureReason)
  const setGoLiveFailureReason = useSnapshotEditorStore((s) => s.setGoLiveFailureReason)
  useRouteScrollRestoration({
    storageKey: JUCE_GRID_SCROLL_TOP_KEY,
  })
  const goLiveFailureDetail = useSnapshotEditorStore(
    (s) => s.goLiveFailureDetail,
  ) as ReturnType<typeof extractSnapshotActivationFailureDetail> | null
  const setGoLiveFailureDetail = useSnapshotEditorStore(
    (s) => s.setGoLiveFailureDetail,
  ) as (v: ReturnType<typeof extractSnapshotActivationFailureDetail> | null) => void
  const goLiveDiffExpanded = useSnapshotEditorStore((s) => s.goLiveDiffExpanded)
  const setGoLiveDiffExpanded = useSnapshotEditorStore((s) => s.setGoLiveDiffExpanded)
  const dismissedGoLiveDiffKey = useSnapshotEditorStore((s) => s.dismissedGoLiveDiffKey)
  const setDismissedGoLiveDiffKey = useSnapshotEditorStore((s) => s.setDismissedGoLiveDiffKey)
  const flowClipTimestamps = useSnapshotEditorStore((s) => s.flowClipTimestamps)
  const setFlowClipTimestamps = useSnapshotEditorStore((s) => s.setFlowClipTimestamps)
  const flowInputClipTimestamps = useSnapshotEditorStore((s) => s.flowInputClipTimestamps)
  const setFlowInputClipTimestamps = useSnapshotEditorStore((s) => s.setFlowInputClipTimestamps)
  const flowOutputClipTimestamps = useSnapshotEditorStore((s) => s.flowOutputClipTimestamps)
  const setFlowOutputClipTimestamps = useSnapshotEditorStore((s) => s.setFlowOutputClipTimestamps)
  const routingInspectorId = useSnapshotEditorStore((s) => s.routingInspectorId)
  const setRoutingInspectorId = useSnapshotEditorStore((s) => s.setRoutingInspectorId)
  const routingLiveApplyState = useSnapshotEditorStore((s) => s.routingLiveApplyState)
  const setRoutingLiveApplyState = useSnapshotEditorStore((s) => s.setRoutingLiveApplyState)
  const signalFlowShellRef = useRef<HTMLElement | null>(null)
  const bottomEditorRef = useRef<HTMLElement | null>(null)
  const midiLearnWasInProgressRef = useRef(false)
  const lastHydratedLiveSnapshotFingerprintRef = useRef<string | null>(null)
  const perfSeqRef = useRef(0)
  const lastMidiActivityWs = useSnapshotEditorStore((s) => s.lastMidiActivityWs)
  const setLastMidiActivityWs = useSnapshotEditorStore((s) => s.setLastMidiActivityWs)
  const abSwitchMidiMessageTypeDraft = useSnapshotEditorStore((s) => s.abSwitchMidiMessageTypeDraft)
  const setAbSwitchMidiMessageTypeDraft = useSnapshotEditorStore((s) => s.setAbSwitchMidiMessageTypeDraft)
  const abSwitchMidiChannelDraft = useSnapshotEditorStore((s) => s.abSwitchMidiChannelDraft)
  const setAbSwitchMidiChannelDraft = useSnapshotEditorStore((s) => s.setAbSwitchMidiChannelDraft)
  const abSwitchMidiNumberDraft = useSnapshotEditorStore((s) => s.abSwitchMidiNumberDraft)
  const setAbSwitchMidiNumberDraft = useSnapshotEditorStore((s) => s.setAbSwitchMidiNumberDraft)
  const blockFocusMidiChannelDraft = useSnapshotEditorStore((s) => s.blockFocusMidiChannelDraft)
  const setBlockFocusMidiChannelDraft = useSnapshotEditorStore((s) => s.setBlockFocusMidiChannelDraft)
  const blockFocusStartNoteDraft = useSnapshotEditorStore((s) => s.blockFocusStartNoteDraft)
  const setBlockFocusStartNoteDraft = useSnapshotEditorStore((s) => s.setBlockFocusStartNoteDraft)
  const footswitchLabelDrafts = useSnapshotEditorStore((s) => s.footswitchLabelDrafts)
  const setFootswitchLabelDrafts = useSnapshotEditorStore((s) => s.setFootswitchLabelDrafts)
  const automationPlaying = useSnapshotEditorStore((s) => s.automationPlaying)
  const setAutomationPlaying = useSnapshotEditorStore((s) => s.setAutomationPlaying)
  const automationRecording = useSnapshotEditorStore((s) => s.automationRecording)
  const setAutomationRecording = useSnapshotEditorStore((s) => s.setAutomationRecording)
  const automationLoopEnabled = useSnapshotEditorStore((s) => s.automationLoopEnabled)
  const setAutomationLoopEnabled = useSnapshotEditorStore((s) => s.setAutomationLoopEnabled)
  const automationCurrentTime = useSnapshotEditorStore((s) => s.automationCurrentTime)
  const setAutomationCurrentTime = useSnapshotEditorStore((s) => s.setAutomationCurrentTime)
  const automationDuration = useSnapshotEditorStore((s) => s.automationDuration)
  const setAutomationDuration = useSnapshotEditorStore((s) => s.setAutomationDuration)
  const automationLanes = useSnapshotEditorStore((s) => s.automationLanes)
  const setAutomationLanes = useSnapshotEditorStore((s) => s.setAutomationLanes)
  const lanePickerOpen = useSnapshotEditorStore((s) => s.lanePickerOpen)
  const setLanePickerOpen = useSnapshotEditorStore((s) => s.setLanePickerOpen)
  const snapshotUndoRedo = useSnapshotEditorUndoRedo()
  const cleanSnapshotDraftRef = useRef<SnapshotDraftData | null>(null)
  const pendingParameterUndoStartRef = useRef<SnapshotDraftData | null>(null)
  const pendingParameterUndoNextRef = useRef<SnapshotDraftData | null>(null)
  const pendingParameterUndoDescriptionRef = useRef<string | null>(null)

  const setSelectedPluginSelection = useCallback((uri: string | null, position?: number | null) => {
    setSelectedPluginUri(uri)
    setSelectedPluginPosition(uri && typeof position === 'number' && Number.isFinite(position) ? position : null)
  }, [])

  const signalAutomationSummary = useMemo(() => {
    const laneCountByPlugin: Record<string, number> = {}
    const armedLaneCountByPlugin: Record<string, number> = {}

    automationLanes.forEach((lane) => {
      if (!lane.pluginUri) {
        return
      }

      laneCountByPlugin[lane.pluginUri] = (laneCountByPlugin[lane.pluginUri] || 0) + 1
      if (lane.armed) {
        armedLaneCountByPlugin[lane.pluginUri] = (armedLaneCountByPlugin[lane.pluginUri] || 0) + 1
      }
    })

    return {
      laneCountByPlugin,
      armedLaneCountByPlugin,
      playing: automationPlaying,
      recording: automationRecording,
    }
  }, [automationLanes, automationPlaying, automationRecording])

  const portSelectorFlowIndex = useSnapshotEditorStore((s) => s.portSelectorFlowIndex)
  const setPortSelectorFlowIndex = useSnapshotEditorStore((s) => s.setPortSelectorFlowIndex)

  const showImportDialog = useSnapshotEditorStore((s) => s.showImportDialog)
  const setShowImportDialog = useSnapshotEditorStore((s) => s.setShowImportDialog)

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify(flowSlots))
  }, [flowSlots])

  useEffect(() => {
    localStorage.setItem('map2_juce_grid_routing_v2', JSON.stringify(routing))
  }, [routing])

  useEffect(() => {
    localStorage.setItem('map2_juce_grid_active_v2', String(activeFlowIndex))
  }, [activeFlowIndex])

  // JUCE_GRID_* write-back effects live in
  // ./snapshotEditor/useJuceGridPersistedState (T2471).
  useJuceGridPersistedState({
    selectedPluginUri,
    selectedPluginPosition,
    effectModalOpen,
  })

  useEffect(() => {
    if (!automationTimelineExpanded) {
      setAutomationPanelHeight(0)
      return
    }

    const panelNode = automationPanelRef.current
    if (!panelNode) {
      return
    }

    const updatePanelHeight = () => {
      setAutomationPanelHeight(Math.ceil(panelNode.getBoundingClientRect().height))
    }

    updatePanelHeight()

    if (typeof ResizeObserver !== 'function') {
      return
    }

    const observer = new ResizeObserver(() => updatePanelHeight())
    observer.observe(panelNode)
    return () => observer.disconnect()
  }, [automationTimelineExpanded, automationLanes.length])

  const markSnapshotsDirty = useCallback(() => {
    setSnapshotsDirty(true)
  }, [])

  const clearSnapshotsDirty = useCallback(() => {
    setSnapshotsDirty(false)
  }, [])

  const syncSnapshotDirtyState = useCallback((nextDraft: SnapshotDraftData) => {
    const cleanDraft = cleanSnapshotDraftRef.current
    setSnapshotsDirty(cleanDraft ? !snapshotDraftsEqual(cleanDraft, nextDraft) : false)
  }, [])

  useEffect(() => {
    try {
      localStorage.removeItem('map2_juce_grid_toolbar_collapsed')
    } catch {}
  }, [])

  const activeFlowChainId = flowSlots[activeFlowIndex]?.chainId ?? null
  const snapshotRouteActive = useRouteActive(['/snapshot-editor'])
  const snapshotEditorCadences = useSnapshotEditorCadences({
    routeActive: snapshotRouteActive,
  })
  const snapshotStandardCadence = snapshotEditorCadences.standard
  const snapshotFastCadence = snapshotEditorCadences.fast
  const snapshotMeterCadence = snapshotEditorCadences.meter
  const snapshotSlowCadence = useRealtimeCadence({
    routeActive: snapshotRouteActive,
    visibleMs: 10_000,
    hiddenMs: 30_000,
    inactiveMs: false,
  })

  // ============================================================================
  // Queries
  // ============================================================================

  // Fetch chains
  const chainsQuery = useQuery({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    refetchInterval: snapshotStandardCadence,
  })

  // Fetch available plugins
  const pluginsQuery = useQuery({
    queryKey: ['plugins', 'discover'],
    queryFn: () => pluginsApi.discover(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Fetch presets
  const presetsQuery = useQuery({
    queryKey: ['chains', 'presets'],
    queryFn: () => chainsApi.listPresets(),
  })

  const midiStatusQuery = useQuery({
    queryKey: ['midi', 'status'],
    queryFn: midiApiV2.getStatus,
    refetchInterval: snapshotFastCadence,
  })

  const midiLearnStatusQuery = useQuery({
    queryKey: ['midi', 'learn', 'status'],
    queryFn: midiApiV2.getLearnStatus,
    refetchInterval: (query) => {
      const learnStatus = query.state.data as { learning?: boolean } | undefined
      return midiLearnActive || learnStatus?.learning ? snapshotMeterCadence : snapshotFastCadence
    },
  })

  const midiMappingsQuery = useQuery({
    queryKey: ['midi', 'mappings', 'juce-grid', midiScope, activeFlowChainId, selectedPluginUri ?? null, selectedPluginPosition ?? null],
    queryFn: () => {
      if (midiScope === 'selected-plugin' && selectedPluginUri) {
        return midiApiV2.getMappings({
          chain_id: activeFlowChainId ?? undefined,
          plugin_uri: selectedPluginUri,
        })
      }

      if (midiScope === 'active-chain' && activeFlowChainId !== null) {
        return midiApiV2.getMappings({ chain_id: activeFlowChainId })
      }

      return midiApiV2.getMappings()
    },
    refetchInterval: snapshotStandardCadence,
  })

  const committedAudioStateQuery = useCommittedAudioState({
    refetchInterval: 2_000,
  })
  const authoritySnapshotId = resolveAuthoritySnapshotId(committedAudioStateQuery.data?.value ?? null)
  const authoritySnapshotDetailQuery = useQuery({
    queryKey: ['snapshots', 'detail', 'authority-active', authoritySnapshotId],
    queryFn: async () => {
      try {
        return await snapshotsApi.get(authoritySnapshotId!)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: authoritySnapshotId != null && !editorSnapshotOverride,
    retry: false,
    refetchInterval: snapshotStandardCadence,
  })
  const runtimeStateQuery = useSnapshotRuntimeLiveState(undefined, {
    refetchInterval: snapshotStandardCadence,
  })
  const activationEventsQuery = useSnapshotActivationEvents(undefined, {
    limit: 20,
    refetchInterval: snapshotStandardCadence,
  })
  // T2450: poll the reconciliation report so the LIVE badge reflects
  // engine-observed agreement, not just backend-recorded state.
  const reconciliationQuery = useSnapshotReconciliation({ refetchInterval: 1_000 })
  // T2451: poll device health so the disconnected-interface banner can
  // show up in < 1s and Go Live can be disabled when the device is gone.
  const deviceHealthQuery = useAudioDeviceHealth({ refetchInterval: 1_000 })
  const deviceDisconnected = deviceHealthQuery.data
    ? deviceHealthQuery.data.device_connected === false
    : false
  const snapshotsSummaryQuery = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => snapshotsApi.list(),
    refetchInterval: snapshotStandardCadence,
  })
  // T2454 slice 1C: warm-cache status for the Preload Slots panel + the
  // Go Live cold-gate. Polls /api/snapshots/preload-status every 5s and
  // exposes `preloadNow()` so Go Live can warm a pinned-but-cold target
  // synchronously instead of waiting for the 30s reconciler tick.
  const snapshotPreloadStatus = useSnapshotPreloadStatus()
  const systemNoiseGateDefaultsQuery = useQuery({
    queryKey: ['config', 'snapshot-noise-gate-defaults'],
    queryFn: async () => {
      const response = await fetchJson<{
        config?: {
          snapshots?: {
            global_noise_gate_threshold_db?: number
            global_noise_gate_release_ms?: number
          }
        }
      }>('/api/cluster/config/runtime')
      const snapshotsConfig = response.config?.snapshots ?? {}
      return {
        thresholdDb: typeof snapshotsConfig.global_noise_gate_threshold_db === 'number'
          ? snapshotsConfig.global_noise_gate_threshold_db
          : DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS.thresholdDb,
        releaseMs: typeof snapshotsConfig.global_noise_gate_release_ms === 'number'
          ? snapshotsConfig.global_noise_gate_release_ms
          : DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS.releaseMs,
      }
    },
    refetchOnWindowFocus: false,
  })
  const snapshotIoDefaultsQuery = useQuery({
    queryKey: ['config', 'snapshot-io-defaults'],
    queryFn: async (): Promise<SnapshotIoDefaults> => {
      const response = await fetchJson<{
        config?: {
          snapshots?: {
            default_input_device?: string | null
            default_output_device?: string | null
            default_monitoring_output_index?: number | null
          }
        }
      }>('/api/cluster/config/runtime')
      const snapshotsConfig = response.config?.snapshots ?? {}
      return {
        input_device: typeof snapshotsConfig.default_input_device === 'string'
          ? snapshotsConfig.default_input_device
          : null,
        output_device: typeof snapshotsConfig.default_output_device === 'string'
          ? snapshotsConfig.default_output_device
          : null,
        monitoring_output_index: typeof snapshotsConfig.default_monitoring_output_index === 'number'
          ? snapshotsConfig.default_monitoring_output_index
          : null,
      }
    },
    refetchOnWindowFocus: false,
  })
  const runtimeLiveState = runtimeStateQuery.data ?? null
  const committedAudioState = committedAudioStateQuery.data?.value ?? null
  const authoritySnapshotDetail = authoritySnapshotDetailQuery.data ?? null
  const controlPlaneSnapshot = useMemo(
    () => resolveControlPlaneSnapshot({
      committedAudioState,
      authoritySnapshotDetail,
    }),
    [authoritySnapshotDetail, committedAudioState],
  )
  const activeSnapshot = useMemo(
    () => resolveEditorActiveSnapshot({
      editorSnapshotOverride,
      controlPlaneSnapshot,
      persistedEditorSnapshot: editorSnapshotContext,
    }),
    [controlPlaneSnapshot, editorSnapshotContext, editorSnapshotOverride],
  )
  const isAuthorityLiveSnapshot = useMemo(
    () => isSnapshotCurrentAuthorityLive(activeSnapshot, committedAudioState),
    [activeSnapshot, committedAudioState],
  )
  // T2450: compute the three-state LIVE badge from reconciliation + activation state.
  const liveBadgeState = useMemo(
    () => computeLiveBadgeState({
      expectedSnapshotId: activeSnapshot?.id ?? null,
      isActivating: pendingGoLiveSnapshotId != null,
      activationFailed: failedGoLiveSnapshotId != null && activeSnapshot?.id === failedGoLiveSnapshotId,
      report: reconciliationQuery.data ?? null,
    }),
    [activeSnapshot?.id, pendingGoLiveSnapshotId, failedGoLiveSnapshotId, reconciliationQuery.data],
  )
  const setControlPlaneSnapshotCaches = useCallback((snapshot: SnapshotDetail) => {
    setAuthorityAwareLiveSnapshot(queryClient, snapshot, authoritySnapshotId)
  }, [authoritySnapshotId, queryClient])

  const invalidateControlPlaneSnapshotCaches = useCallback((options?: { includeDesired?: boolean }) => {
    invalidateAuthorityAwareLiveSnapshot(queryClient, options)
  }, [queryClient])
  const currentEditorSnapshotId = activeSnapshot?.id ?? authoritySnapshotId ?? null
  const snapshotRevisionsQuery = useQuery({
    queryKey: ['snapshots', 'revisions', currentEditorSnapshotId],
    queryFn: () => snapshotsApi.listRevisions(currentEditorSnapshotId!),
    enabled: showVersionHistoryModal && currentEditorSnapshotId != null,
    refetchOnWindowFocus: false,
  })
  const snapshotCount = snapshotsSummaryQuery.data?.count ?? 0
  const snapshotLoadFailureMessage = authoritySnapshotDetailQuery.isError
    ? authoritySnapshotDetailQuery.error instanceof Error
      ? authoritySnapshotDetailQuery.error.message
      : 'Snapshot detail could not be loaded.'
    : null
  const snapshotCountLabel = snapshotCount > 99 ? '99+' : String(snapshotCount)
  const existingSnapshotNames = useMemo(
    () => (snapshotsSummaryQuery.data?.snapshots ?? [])
      .map((snapshot) => snapshot.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0),
    [snapshotsSummaryQuery.data?.snapshots],
  )
  // T2454 slice 1C: snapshot id → display name map for the Preload Slots
  // panel. Keyed by id so the panel can render the operator-pinned slots
  // even when the snapshot list is paginated or filtered upstream.
  const snapshotNamesById = useMemo<Map<number, string>>(() => {
    const out = new Map<number, string>()
    for (const snapshot of snapshotsSummaryQuery.data?.snapshots ?? []) {
      const id = typeof snapshot.id === 'number' ? snapshot.id : Number.parseInt(String(snapshot.id), 10)
      if (!Number.isInteger(id)) continue
      const name = typeof snapshot.name === 'string' && snapshot.name.trim().length > 0
        ? snapshot.name
        : `Snapshot ${id}`
      out.set(id, name)
    }
    return out
  }, [snapshotsSummaryQuery.data?.snapshots])
  const snapshotEntryRequired = committedAudioStateQuery.isSuccess && currentEditorSnapshotId === null

  const openArtifactsSnapshots = useCallback(() => {
    navigate(buildWorkspaceArtifactsPath(new URLSearchParams({ category: 'snapshots' })))
  }, [navigate])
  const openArtifactsCategory = useCallback((category: string) => {
    navigate(buildWorkspaceArtifactsPath(new URLSearchParams({ category })))
  }, [navigate])

  const reopenSnapshotEntryPoint = useCallback(() => {
    openArtifactsSnapshots()
  }, [openArtifactsSnapshots])

  // Fetch audio status
  const audioQuery = useQuery({
    queryKey: ['audio', 'status'],
    queryFn: () => audioApi.getStatus(),
    refetchInterval: snapshotStandardCadence,
  })

  const audioLevelsQuery = useQuery({
    queryKey: ['audio', 'levels'],
    queryFn: audioApi.getLevels,
    refetchInterval: snapshotMeterCadence,
  })

  // Fetch JACK metrics
  const jackQuery = useQuery({
    queryKey: ['metrics', 'jack'],
    queryFn: metricsApi.getJack,
    refetchInterval: snapshotFastCadence,
  })

  // Fetch audio port routing
  const portsQuery = useQuery({
    queryKey: ['audio', 'ports'],
    queryFn: () => audioApi.getPorts(),
    refetchInterval: snapshotSlowCadence,
  })

  const routingQuery = useQuery({
    queryKey: ['audio', 'routing'],
    queryFn: () => audioApi.getRouting(),
    refetchInterval: snapshotStandardCadence,
  })

  const activeFlowChainRoutingQuery = useQuery({
    queryKey: ['audio', 'routing', 'chain', activeFlowChainId],
    queryFn: () => audioApi.getChainRouting(activeFlowChainId!),
    refetchInterval: snapshotStandardCadence,
    enabled: activeFlowChainId !== null,
  })

  const expressionEngineParametersQuery = useQuery({
    queryKey: ['expression-engine-parameters', 'snapshot-editor'],
    queryFn: () => fetchJson<{ parameters: Array<{ id: string; label: string; unit: string; min: number; max: number }> }>(
      `${API_BASE}/v2/engine/parameters`,
      { cache: 'no-store' },
    ),
    staleTime: 60_000,
  })

  const clusterNodesQuery = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/cluster/nodes`)
      if (!res.ok) throw new Error('Failed to load cluster nodes')
      const data = await res.json()
      return {
        nodes: Array.isArray(data?.nodes) ? data.nodes : [],
      }
    },
    refetchInterval: assignmentDialogOpen ? snapshotFastCadence : false,
    enabled: assignmentDialogOpen,
  })

  const assignmentAnalysisQuery = useQuery({
    queryKey: ['chains', selectedFlowForAssignment?.chainId, 'analysis'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/chains/${selectedFlowForAssignment?.chainId}/analysis`)
      if (!res.ok) {
        throw new Error('Failed to load chain analysis')
      }
      return res.json() as Promise<{
        estimated_cpu_percent?: number
        estimated_memory_mb?: number
        requires_gpu?: boolean
        gpu_recommended?: boolean
      }>
    },
    enabled: assignmentDialogOpen && !!selectedFlowForAssignment?.chainId,
  })

  const assignmentNodes = clusterNodesQuery.data?.nodes ?? []
  const assignmentAnalysis = assignmentAnalysisQuery.data

  const isSuitableAssignmentNode = useCallback((node: { has_gpu?: boolean; cpu_percent?: number }) => {
    if (!assignmentAnalysis) {
      return true
    }
    if (assignmentAnalysis.requires_gpu && !node.has_gpu) {
      return false
    }
    const projectedCpu = (node.cpu_percent ?? 0) + (assignmentAnalysis.estimated_cpu_percent ?? 0)
    return projectedCpu <= 85
  }, [assignmentAnalysis])

  const recommendedAssignmentNodes = useMemo(() => {
    if (!assignmentAnalysis) {
      return []
    }
    return [...assignmentNodes]
      .filter(isSuitableAssignmentNode)
      .sort((a, b) => {
        let scoreA = 0
        let scoreB = 0
        if (assignmentAnalysis.gpu_recommended) {
          scoreA += a.has_gpu ? 100 : 0
          scoreB += b.has_gpu ? 100 : 0
        }
        scoreA -= a.cpu_percent ?? 0
        scoreB -= b.cpu_percent ?? 0
        return scoreB - scoreA
      })
  }, [assignmentAnalysis, assignmentNodes, isSuitableAssignmentNode])

  // CPU metrics hook
  const { getPluginCpu } = useCPUMetrics({
    useWebSocket: true,
    pollingInterval: 500,
  })

  // Plugin output metering hook
  const { outputPorts: pluginOutputPorts, peaks: pluginPeaks, connected: outputsConnected } = usePluginOutputs()

  // Snapshot WebSocket hook for MIDI PC triggered loads
  const { isConnected: snapshotsWsConnected } = useSnapshots({
    enabled: true,
    onSnapshotLoaded: useCallback((event) => {
      // Handle MIDI-triggered snapshot loads
      if (event.triggered_by === 'midi_pc') {
        const hydration = buildSnapshotEditorLiveSnapshotHydration(
          event.snapshot_data,
          queryClient.getQueryData<ChainsResponse>(['chains']),
        )
        const normalizedSnapshotState = normalizeRuntimeGridState(
          hydration.snapshotData.flowSlots,
          hydration.snapshotData.routing,
          hydration.snapshotData.activeFlowIndex,
        )
        queryClient.setQueryData(['chains'], hydration.chainsResponse)
        setControlPlaneSnapshotCaches(event.snapshot_data)
        invalidateControlPlaneSnapshotCaches({ includeDesired: true })
        lastHydratedLiveSnapshotFingerprintRef.current = hydration.fingerprint
        setFlowSlots(normalizedSnapshotState.flowSlots)
        setRouting(normalizedSnapshotState.routing)
        setActiveFlowIndex(normalizedSnapshotState.activeFlowIndex)
        clearSnapshotsDirty()
        queryClient.invalidateQueries({ queryKey: ['snapshots'] })
        const stageToast = buildSnapshotActivationStageToast(event.snapshot_data, { programNumber: event.program_number ?? null })
        pushToast(
          buildSnapshotActivationToastMessage(event.snapshot_data, { programNumber: event.program_number ?? null }),
          'success',
          {
            durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
            id: stageToast.options.id,
            title: stageToast.title,
            stage: stageToast.options.stage,
          },
        )
      }
    }, [clearSnapshotsDirty, invalidateControlPlaneSnapshotCaches, pushToast, queryClient, setControlPlaneSnapshotCaches]),
  })

  useWebSocketTopic('chain_updates', useCallback((_data, message) => {
    if (!message.type) {
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['chains'] })
    invalidateControlPlaneSnapshotCaches()
  }, [invalidateControlPlaneSnapshotCaches, queryClient]))

  useEffect(() => {
    if (!snapshotFastCadence) {
      return undefined
    }

    let closed = false
    const poll = async () => {
      try {
        const payload = await fetchJson<SnapshotEditorPerformanceEventsResponse>(
          `${API_BASE}/v2/expression/performance-events?after_seq=${perfSeqRef.current}&limit=256`,
          { cache: 'no-store' },
        )
        if (closed) {
          return
        }
        const events = Array.isArray(payload.events) ? payload.events : []
        const liveSnapshotId = activeSnapshot?.id ?? authoritySnapshotId ?? null
        if (events.length > 0 && liveSnapshotId != null) {
          for (const event of events) {
            if (event.action === 'perform.tap_tempo') {
              const tapped = await snapshotsApi.tapTempo(liveSnapshotId, Date.now())
              if (tapped.snapshot) {
                setControlPlaneSnapshotCaches(tapped.snapshot)
                invalidateControlPlaneSnapshotCaches()
              }
            }
          }
          queryClient.invalidateQueries({ queryKey: ['snapshots'] })
        }
        const lastSeq = Number(payload.last_seq || 0)
        const eventLastSeq = events.length > 0 ? Number(events[events.length - 1]?.seq || 0) : 0
        perfSeqRef.current = Math.max(perfSeqRef.current, lastSeq, eventLastSeq)
      } catch {
        // Keep editor controls responsive if performance-event polling fails.
      }
    }

    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, snapshotFastCadence)
    return () => {
      closed = true
      window.clearInterval(id)
    }
  }, [activeSnapshot?.id, authoritySnapshotId, invalidateControlPlaneSnapshotCaches, queryClient, setControlPlaneSnapshotCaches, snapshotFastCadence])

  // ============================================================================
  // Effects for Enhanced Features
  // ============================================================================

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('map2-favorite-plugins')
      if (stored) {
        setFavoritePlugins(new Set(JSON.parse(stored)))
      }
    } catch {}
  }, [])

  // Save favorites to localStorage
  useEffect(() => {
    if (favoritePlugins.size > 0) {
      localStorage.setItem('map2-favorite-plugins', JSON.stringify([...favoritePlugins]))
    }
  }, [favoritePlugins])

  // Persist category filter
  useEffect(() => {
    localStorage.setItem('map2_juce_grid_plugin_category', selectedCategory)
  }, [selectedCategory])

  // Persist collapsed categories
  useEffect(() => {
    localStorage.setItem('map2_juce_grid_collapsed_categories', JSON.stringify([...collapsedCategories]))
  }, [collapsedCategories])

  // Mirror plugin peak telemetry into the editor store for legacy meter
  // consumers. The inner record is keyed by lv2 port_symbol and stores
  // PeakData; pull the max input/output peak across ports per uri rather
  // than the previous `(peaks as any).inputPeak` access, which was silently
  // returning undefined → 0 because no port_symbol literal matches that name.
  useEffect(() => {
    if (!pluginPeaks || !outputsConnected) return
    const levels: Record<string, { in: number; out: number }> = {}
    for (const [uri, ports] of Object.entries(pluginPeaks)) {
      let inPeak = 0
      let outPeak = 0
      for (const [portSymbol, data] of Object.entries(ports)) {
        const symbol = portSymbol.toLowerCase()
        if (symbol.includes('in')) {
          if (data.peak > inPeak) inPeak = data.peak
        } else if (symbol.includes('out')) {
          if (data.peak > outPeak) outPeak = data.peak
        }
      }
      levels[uri] = { in: inPeak, out: outPeak }
    }
    setPluginLevels(levels)
  }, [pluginPeaks, outputsConnected, setPluginLevels])

  const flowClipPeakEntries = useMemo(
    () => Object.values(pluginPeaks ?? {}).flatMap((ports) => Object.values(ports)).map((peak) => ({
      uri: peak.uri,
      pluginPosition: peak.plugin_position ?? null,
      isClipping: Boolean(peak.is_clipping),
      portSymbol: peak.port_symbol ?? null,
    })),
    [pluginPeaks],
  )

  useEffect(() => {
    const now = Date.now()
    const clipSourceChains = controlPlaneSnapshot
      ? buildEffectiveLiveSnapshotChains(controlPlaneSnapshot, chainsQuery.data).chains
      : (chainsQuery.data?.chains ?? [])
    const clipSourceChainById = new Map(clipSourceChains.map((chain) => [chain.id, chain] as const))

    setFlowClipTimestamps((previous) => {
      const next: Record<string, number> = {}

      flowSlots.forEach((flow) => {
        const chain = flow.chainId != null ? clipSourceChainById.get(flow.chainId) : undefined
        const nextTimestamp = resolveFlowClipTimestamp(
          chain?.plugins ?? [],
          flowClipPeakEntries,
          previous[flow.id],
          now,
          FLOW_CARD_CLIP_HOLD_MS,
        )
        if (typeof nextTimestamp === 'number') {
          next[flow.id] = nextTimestamp
        }
      })

      const previousKeys = Object.keys(previous)
      const nextKeys = Object.keys(next)
      const changed = previousKeys.length !== nextKeys.length
        || nextKeys.some((key) => previous[key] !== next[key])

      return changed ? next : previous
    })
  }, [chainsQuery.data, controlPlaneSnapshot, flowClipPeakEntries, flowSlots])

  useEffect(() => {
    const now = Date.now()
    const clipSourceChains = controlPlaneSnapshot
      ? buildEffectiveLiveSnapshotChains(controlPlaneSnapshot, chainsQuery.data).chains
      : (chainsQuery.data?.chains ?? [])
    const clipSourceChainById = new Map(clipSourceChains.map((chain) => [chain.id, chain] as const))

    const updateEdgeClipTimestamps = (
      previous: Record<string, number>,
      edge: 'input' | 'output',
    ): Record<string, number> => {
      const next: Record<string, number> = {}

      flowSlots.forEach((flow) => {
        const chain = flow.chainId != null ? clipSourceChainById.get(flow.chainId) : undefined
        const nextTimestamp = resolveFlowEdgeClipTimestamp(
          chain?.plugins ?? [],
          flowClipPeakEntries,
          edge,
          previous[flow.id],
          now,
          FLOW_CARD_CLIP_HOLD_MS,
        )
        if (typeof nextTimestamp === 'number') {
          next[flow.id] = nextTimestamp
        }
      })

      const previousKeys = Object.keys(previous)
      const nextKeys = Object.keys(next)
      const changed = previousKeys.length !== nextKeys.length
        || nextKeys.some((key) => previous[key] !== next[key])

      return changed ? next : previous
    }

    setFlowInputClipTimestamps((previous) => updateEdgeClipTimestamps(previous, 'input'))
    setFlowOutputClipTimestamps((previous) => updateEdgeClipTimestamps(previous, 'output'))
  }, [chainsQuery.data, controlPlaneSnapshot, flowClipPeakEntries, flowSlots])

  useEffect(() => {
    const expiryDelays = Object.values(flowClipTimestamps)
      .map((timestamp) => (timestamp + FLOW_CARD_CLIP_HOLD_MS) - Date.now())
      .filter((delay) => delay > 0)

    if (expiryDelays.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now()
      setFlowClipTimestamps((previous) => {
        const next = Object.fromEntries(
          Object.entries(previous).filter(([, timestamp]) => now - timestamp < FLOW_CARD_CLIP_HOLD_MS),
        )
        const changed = Object.keys(next).length !== Object.keys(previous).length
        return changed ? next : previous
      })
    }, Math.max(50, Math.min(...expiryDelays)))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flowClipTimestamps])

  useEffect(() => {
    const expiryDelays = Object.values(flowInputClipTimestamps)
      .map((timestamp) => (timestamp + FLOW_CARD_CLIP_HOLD_MS) - Date.now())
      .filter((delay) => delay > 0)

    if (expiryDelays.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now()
      setFlowInputClipTimestamps((previous) => {
        const next = Object.fromEntries(
          Object.entries(previous).filter(([, timestamp]) => now - timestamp < FLOW_CARD_CLIP_HOLD_MS),
        )
        const changed = Object.keys(next).length !== Object.keys(previous).length
        return changed ? next : previous
      })
    }, Math.max(50, Math.min(...expiryDelays)))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flowInputClipTimestamps])

  useEffect(() => {
    const expiryDelays = Object.values(flowOutputClipTimestamps)
      .map((timestamp) => (timestamp + FLOW_CARD_CLIP_HOLD_MS) - Date.now())
      .filter((delay) => delay > 0)

    if (expiryDelays.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now()
      setFlowOutputClipTimestamps((previous) => {
        const next = Object.fromEntries(
          Object.entries(previous).filter(([, timestamp]) => now - timestamp < FLOW_CARD_CLIP_HOLD_MS),
        )
        const changed = Object.keys(next).length !== Object.keys(previous).length
        return changed ? next : previous
      })
    }, Math.max(50, Math.min(...expiryDelays)))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flowOutputClipTimestamps])


  // ============================================================================
  // Derived State
  // ============================================================================

  const chains = chainsQuery.data?.chains || []
  const authoritativeAudioState = useMemo(
    () => {
      if (!activeSnapshot || !committedAudioState) {
        return null
      }
      return resolveAuthoritySnapshotId(committedAudioState) === activeSnapshot.id
        ? committedAudioState
        : null
    },
    [activeSnapshot, committedAudioState],
  )
  const snapshotSetlistMode = specialSettings?.snapshotSetlistMode ?? false
  useEffect(() => {
    if (editorSnapshotOverride && controlPlaneSnapshot && editorSnapshotOverride.id === controlPlaneSnapshot.id) {
      setEditorSnapshotOverride(null)
    }
  }, [controlPlaneSnapshot, editorSnapshotOverride])
  const snapshotEditingLocked = Boolean(activeSnapshot?.is_locked)
  const snapshotEditorMutationDisabled = snapshotEditingLocked || snapshotEntryRequired
  const snapshotGoLiveState = useMemo(
    () => resolveSnapshotGoLiveState({
      snapshot: activeSnapshot,
      authoritativeAudioState,
      pendingSnapshotId: pendingGoLiveSnapshotId,
      failedSnapshotId: failedGoLiveSnapshotId,
      failureReason: goLiveFailureReason,
      confirmedSnapshotId: confirmedGoLiveSnapshotId,
      hasDraftChanges: snapshotsDirty,
    }),
    [
      activeSnapshot,
      authoritativeAudioState,
      confirmedGoLiveSnapshotId,
      failedGoLiveSnapshotId,
      goLiveFailureReason,
      pendingGoLiveSnapshotId,
      snapshotsDirty,
    ],
  )
  const pendingGoLiveEvent = useMemo(
    () => {
      if (!activeSnapshot || pendingGoLiveSnapshotId !== activeSnapshot.id) {
        return null
      }

      return activationEventsQuery.data?.events.find((event) => {
        if (event.snapshot_id !== activeSnapshot.id) {
          return false
        }
        if (pendingGoLiveRequestedAt == null) {
          return true
        }
        const requestedAt = Date.parse(event.requested_at ?? '')
        return Number.isFinite(requestedAt) && requestedAt >= pendingGoLiveRequestedAt - 1_000
      }) ?? null
    },
    [activeSnapshot, activationEventsQuery.data?.events, pendingGoLiveRequestedAt, pendingGoLiveSnapshotId],
  )
  const latestGoLiveEvent = useMemo(
    () => activeSnapshot
      ? activationEventsQuery.data?.events.find((event) => event.snapshot_id === activeSnapshot.id) ?? null
      : null,
    [activeSnapshot, activationEventsQuery.data?.events],
  )
  const goLiveProgressEvent = pendingGoLiveEvent ?? latestGoLiveEvent
  const goLiveActionLabel = useMemo(() => {
    if (snapshotGoLiveState.phase === 'activating') {
      return snapshotGoLiveState.label
    }
    if (snapshotsDirty && snapshotGoLiveState.phase !== 'live') {
      return 'Save and publish'
    }
    return snapshotGoLiveState.label
  }, [snapshotGoLiveState.label, snapshotGoLiveState.phase, snapshotsDirty])
  const goLiveHelperText = useMemo(() => {
    if (!activeSnapshot) {
      return null
    }
    if (snapshotsDirty) {
      return 'Save draft stores your latest edits. Publish to live is the step that makes this snapshot the active audio chain after checks pass.'
    }
    return 'Publish to live runs checks first, makes this snapshot the active audio chain, and waits for confirmation.'
  }, [activeSnapshot, snapshotsDirty])
  const goLiveReadinessItems = useMemo<Array<{
    id: string
    label: string
    status: 'ready' | 'needs_attention' | 'pending_check'
    detail: string
  }>>(() => {
    if (!activeSnapshot) {
      return []
    }

    const failureDetail = goLiveFailureDetail
    const pluginIssues = failureDetail?.issues.filter((issue) => issue.category === 'plugin') ?? []
    const assetIssues = failureDetail?.issues.filter((issue) => issue.category === 'asset') ?? []
    const deviceIssues = failureDetail?.issues.filter((issue) => issue.category === 'device') ?? []
    const liveConfirmed = snapshotGoLiveState.phase === 'live'

    return [
      {
        id: 'draft',
        label: 'Snapshot draft',
        status: snapshotsDirty ? 'needs_attention' : 'ready',
        detail: snapshotsDirty
          ? 'Unsaved edits are still in the editor. Save draft first so make live uses the latest version.'
          : 'The current snapshot is saved and ready for live activation.',
      },
      {
        id: 'plugins',
        label: 'Plugins on this node',
        status: pluginIssues.length > 0 ? 'needs_attention' : (liveConfirmed || failureDetail ? 'ready' : 'pending_check'),
        detail: pluginIssues[0]?.message
          ?? (liveConfirmed || failureDetail
            ? 'The last live check found every required plugin on this node.'
            : 'Checked automatically when you make this snapshot live.'),
      },
      {
        id: 'assets',
        label: 'Models and IR files',
        status: assetIssues.length > 0 ? 'needs_attention' : (liveConfirmed || failureDetail ? 'ready' : 'pending_check'),
        detail: assetIssues[0]?.message
          ?? (liveConfirmed || failureDetail
            ? 'The last live check found every required NAM model and IR file.'
            : 'Checked automatically when you make this snapshot live.'),
      },
      {
        id: 'devices',
        label: 'Audio devices',
        status: deviceIssues.length > 0 ? 'needs_attention' : (liveConfirmed || failureDetail ? 'ready' : 'pending_check'),
        detail: deviceIssues[0]?.message
          ?? (liveConfirmed || failureDetail
            ? 'The last live check confirmed the requested input and output devices.'
            : 'Checked automatically when you make this snapshot live.'),
      },
    ]
  }, [activeSnapshot, goLiveFailureDetail, snapshotGoLiveState.phase, snapshotsDirty])
  const goLiveProgress = useMemo(() => {
    const activationProgress = extractActivationProgressMetrics(goLiveProgressEvent)
    const activeChannelCount = authoritativeAudioState?.derived.active_channel_count ?? activeSnapshot?.live_state?.paths.length ?? 0
    const totalChannelCount = authoritativeAudioState?.derived.total_channel_count ?? activeSnapshot?.channels.length ?? activeSnapshot?.paths.length ?? 0
    const liveSummary = totalChannelCount > 0
      ? `${activeChannelCount} of ${totalChannelCount} channels live.`
      : 'Snapshot is live.'

    const steps = LIVE_ACTIVATION_PHASES.map((phase) => {
      let status: 'pending' | 'active' | 'complete' | 'failed' = 'pending'
      if (snapshotGoLiveState.phase === 'live') {
        status = 'complete'
      } else if (activationProgress?.completedPhases.includes(phase)) {
        status = 'complete'
      } else if (snapshotGoLiveState.phase === 'error' && (goLiveFailureDetail?.phase?.toUpperCase() === phase || activationProgress?.currentPhase === phase)) {
        status = 'failed'
      } else if (snapshotGoLiveState.phase === 'activating' && (activationProgress?.currentPhase === phase || (!activationProgress && phase === 'VALIDATING'))) {
        status = 'active'
      }
      return {
        id: phase.toLowerCase(),
        label: phase === 'VALIDATING'
          ? 'Validate'
          : phase === 'STAGING'
            ? 'Stage'
            : phase === 'APPLYING'
              ? 'Apply'
              : 'Verify',
        status,
      }
    })

    if (snapshotGoLiveState.phase === 'live') {
      return {
        summary: liveSummary,
        note: 'The engine confirmed the latest live activation.',
        steps,
      }
    }
    if (snapshotGoLiveState.phase === 'activating') {
      return {
        summary: 'Making this snapshot live…',
        note: activationProgress?.note ?? 'Running validation, engine apply, and final verification.',
        steps,
      }
    }
    if (snapshotGoLiveState.phase === 'error') {
      return {
        summary: 'Publish stopped before completion.',
        note: goLiveFailureDetail?.message ?? goLiveFailureReason ?? 'Fix the reported issue and retry.',
        steps,
      }
    }
    return {
      summary: snapshotsDirty
        ? 'Unsaved edits are waiting to be written into the draft before live activation.'
        : 'Ready to make this snapshot live when you are.',
      note: snapshotsDirty
        ? 'Use Save draft or Save + make live to push the latest editor changes.'
        : 'The live check will validate plugins, files, and devices before activation.',
      steps,
    }
  }, [activeSnapshot, authoritativeAudioState, goLiveFailureDetail, goLiveFailureReason, goLiveProgressEvent, snapshotGoLiveState.phase, snapshotsDirty])
  const snapshotMidiEntries = useMemo(
    () => collectSnapshotMidiMapEntries(activeSnapshot),
    [activeSnapshot],
  )
  const snapshotBlockFocusRange = useMemo(
    () => getSnapshotBlockFocusRange(snapshotMidiEntries),
    [snapshotMidiEntries],
  )
  const snapshotFootswitchLabelMap = useMemo(
    () => getSnapshotFootswitchLabelMap(snapshotMidiEntries),
    [snapshotMidiEntries],
  )
  const snapshotAbSwitchMidiBinding = useMemo(
    () => getSnapshotAbSwitchMidiBinding(snapshotMidiEntries),
    [snapshotMidiEntries],
  )
  const snapshotExpressionMappings = useMemo(
    () => normalizeSnapshotExpressionMappings(activeSnapshot?.controls?.expression_mappings ?? []),
    [activeSnapshot?.controls?.expression_mappings],
  )
  const effectiveChainsResponse = useMemo(() => {
    const baseChainsResponse = activeSnapshot
      ? buildEffectiveLiveSnapshotChains(activeSnapshot, chainsQuery.data)
      : (chainsQuery.data ?? { chains: [], count: 0 })
    return applySnapshotDraftToChainsResponse(baseChainsResponse, snapshotUndoRedo.current)
  }, [activeSnapshot, chainsQuery.data, snapshotUndoRedo.current])
  const effectiveChains = effectiveChainsResponse.chains
  const controlPlaneChains = useMemo(
    () => (
      controlPlaneSnapshot
        ? buildEffectiveLiveSnapshotChains(controlPlaneSnapshot, chainsQuery.data).chains
        : (chainsQuery.data?.chains ?? [])
    ),
    [controlPlaneSnapshot, chainsQuery.data],
  )
  const effectiveChainById = useMemo(
    () => new Map(effectiveChains.map((chain) => [chain.id, chain] as const)),
    [effectiveChains],
  )
  const presets = presetsQuery.data?.presets || []
  const liveChainProjection = useMemo(
    () => buildAuthoritativeJuceGridLiveChainProjection({
      chains: controlPlaneChains,
      flowSlots,
      authoritativeAudioState: committedAudioState,
      authoritySnapshotPaths: controlPlaneSnapshot?.paths ?? null,
    }),
    [committedAudioState, controlPlaneChains, controlPlaneSnapshot?.paths, flowSlots],
  )
  const pruneLiveSnapshotCache = useCallback((chainIds: readonly number[]) => {
    if (chainIds.length === 0) {
      return
    }

    if (authoritySnapshotId != null) {
      queryClient.setQueryData<SnapshotDetail | null | undefined>(
        ['snapshots', 'detail', 'authority-active', authoritySnapshotId],
        (current) => removeRuntimeChainsFromLiveSnapshot(current, chainIds),
      )
    }
  }, [authoritySnapshotId, queryClient])
  const desiredLiveChainIds = useMemo(
    () => getJuceGridDesiredLiveChainIds(flowSlots),
    [flowSlots],
  )
  const authorityLiveChainIds = useMemo(
    () => liveChainProjection.map((projection) => projection.chainId),
    [liveChainProjection],
  )
  const authorityLiveChainIdSet = useMemo(
    () => new Set(
      liveChainProjection.flatMap((projection) => [
        projection.chainId,
        projection.runtimeChainId,
        projection.snapshotChainId,
      ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))),
    ),
    [liveChainProjection],
  )
  const liveChainMismatch = useMemo(
    () => hasCommittedAuthorityLivePaths(committedAudioState)
      && hasJuceGridLiveChainMismatch(liveChainProjection, flowSlots),
    [committedAudioState, flowSlots, liveChainProjection],
  )
  const liveChainProjectionOverflow = liveChainProjection.length > MAX_FLOWS
  const showLiveChainSummaryOnly = isCompactLayout || isTabletTouchLayout
  const armedAutomationLane = useMemo(
    () => automationLanes.find((lane) => lane.armed) ?? null,
    [automationLanes],
  )
  const audioStatus = audioQuery.data
  const audioLevels = audioLevelsQuery.data
  const currentOutputLevelDbfs = useMemo(() => {
    if (!audioLevels) {
      return null
    }
    return Math.max(audioLevels.output_left ?? -60, audioLevels.output_right ?? -60)
  }, [audioLevels])
  const outputLevelReferenceDeltaDb = activeSnapshot?.output_level_reference_dbfs != null && currentOutputLevelDbfs != null
    ? currentOutputLevelDbfs - activeSnapshot.output_level_reference_dbfs
    : null
  const outputLevelWarningThresholdDb = activeSnapshot?.output_level_warning_threshold_db ?? 3
  const outputLevelWarningMessage = outputLevelReferenceDeltaDb != null
    && Math.abs(outputLevelReferenceDeltaDb) > outputLevelWarningThresholdDb
    ? `Output is ${Math.abs(outputLevelReferenceDeltaDb).toFixed(1)} dB ${outputLevelReferenceDeltaDb > 0 ? 'above' : 'below'} reference level.`
    : null
  const editorSnapshotSequence = useMemo<SnapshotSummary[]>(() => {
    const snapshots = snapshotsSummaryQuery.data?.snapshots ?? []
    if (snapshotSetlistMode) {
      return sortFavoriteSnapshotsForSetlist(
        snapshots.filter((snapshot) => snapshot.is_favorite),
        specialSettings?.snapshotSetlistOrder,
      )
    }
    return sortSnapshotsByProgramNumber(snapshots)
  }, [snapshotSetlistMode, snapshotsSummaryQuery.data?.snapshots, specialSettings?.snapshotSetlistOrder])
  const favoriteSnapshotsForToolbar = useMemo<SnapshotSummary[]>(
    () => sortFavoriteSnapshotsForSetlist(
      (snapshotsSummaryQuery.data?.snapshots ?? []).filter((snapshot) => snapshot.is_favorite),
      specialSettings?.snapshotSetlistOrder,
    ),
    [snapshotsSummaryQuery.data?.snapshots, specialSettings?.snapshotSetlistOrder],
  )
  const activeSnapshotSequenceIndex = activeSnapshot
    ? editorSnapshotSequence.findIndex((snapshot) => snapshot.id === activeSnapshot.id)
    : -1
  const previousEditorSnapshot = activeSnapshotSequenceIndex > 0
    ? editorSnapshotSequence[activeSnapshotSequenceIndex - 1]
    : null
  const nextEditorSnapshot = activeSnapshotSequenceIndex >= 0 && activeSnapshotSequenceIndex < editorSnapshotSequence.length - 1
    ? editorSnapshotSequence[activeSnapshotSequenceIndex + 1]
    : null
  const jackMetrics = jackQuery.data
  const snapshotIoDeviceOptions = useMemo(() => collectSnapshotIoDeviceOptions(audioQuery.data, {
    input: [
      activeSnapshot?.io_bindings?.input_device ?? activeSnapshot?.input_device ?? null,
      snapshotIoDefaultsQuery.data?.input_device ?? null,
      snapshotIoModalState.defaultInputValue,
    ],
    output: [
      activeSnapshot?.io_bindings?.output_device ?? activeSnapshot?.output_device ?? null,
      snapshotIoDefaultsQuery.data?.output_device ?? null,
      snapshotIoModalState.defaultOutputValue,
    ],
  }), [
    activeSnapshot?.input_device,
    activeSnapshot?.io_bindings?.input_device,
    activeSnapshot?.io_bindings?.output_device,
    activeSnapshot?.output_device,
    audioQuery.data,
    snapshotIoDefaultsQuery.data?.input_device,
    snapshotIoDefaultsQuery.data?.output_device,
    snapshotIoModalState.defaultInputValue,
    snapshotIoModalState.defaultOutputValue,
  ])
  const snapshotIoDefaultInputSelectValue = snapshotIoModalState.defaultInputValue || SNAPSHOT_IO_USE_DEFAULT_OPTION
  const snapshotIoDefaultOutputSelectValue = snapshotIoModalState.defaultOutputValue || SNAPSHOT_IO_USE_DEFAULT_OPTION
  const snapshotIoDefaultMonitoringOutputSelectValue = (
    snapshotIoModalState.defaultMonitoringOutputValue || SNAPSHOT_IO_USE_DEFAULT_OPTION
  )
  const monitoringOutputOptions = useMemo(
    () => collectMonitoringOutputPairOptions(portsQuery.data?.outputs ?? []),
    [portsQuery.data?.outputs],
  )
  const resolvedMonitoringOutputIndex = (
    activeSnapshot?.controls?.monitoring_output_index
    ?? activeSnapshot?.io_bindings?.monitoring_output_index
    ?? snapshotIoDefaultsQuery.data?.monitoring_output_index
    ?? null
  )
  const monitoringOutputLabel = resolvedMonitoringOutputIndex != null
    ? `Output ${resolvedMonitoringOutputIndex + 1}/${resolvedMonitoringOutputIndex + 2}`
    : 'Not assigned'
  const activeSoloFlow = useMemo(
    () => flowSlots.find((flow) => flow.solo) ?? null,
    [flowSlots],
  )
  const monitoringStatusLabel = activeSoloFlow
    ? `Monitoring: ${activeSoloFlow.label} -> ${monitoringOutputLabel}`
    : null
  const monitoringStatusWarning = Boolean(activeSoloFlow && resolvedMonitoringOutputIndex == null)

  useEffect(() => {
    setOutputReferenceThresholdDraft(activeSnapshot?.output_level_warning_threshold_db ?? 3)
  }, [activeSnapshot?.output_level_warning_threshold_db])

  useEffect(() => {
    if (!systemNoiseGateDefaultsQuery.data) {
      return
    }
    setNoiseGateThresholdDraft(systemNoiseGateDefaultsQuery.data.thresholdDb)
    setNoiseGateReleaseDraft(systemNoiseGateDefaultsQuery.data.releaseMs)
  }, [
    systemNoiseGateDefaultsQuery.data?.releaseMs,
    systemNoiseGateDefaultsQuery.data?.thresholdDb,
  ])

  useEffect(() => {
    if (showProgressModal && progressModalInitialTab === 'advanced' && progressModalInitialSection === 'devices') {
      return
    }
    setSnapshotIoModalState(buildSnapshotIoModalState(activeSnapshot, snapshotIoDefaultsQuery.data))
  }, [
    activeSnapshot,
    progressModalInitialSection,
    progressModalInitialTab,
    showProgressModal,
    snapshotIoDefaultsQuery.data,
  ])

  useEffect(() => {
    if (
      confirmedGoLiveSnapshotId != null
      && activeSnapshot
      && activeSnapshot.id !== confirmedGoLiveSnapshotId
    ) {
      setConfirmedGoLiveSnapshotId(null)
    }
    if (snapshotsDirty && confirmedGoLiveSnapshotId != null) {
      setConfirmedGoLiveSnapshotId(null)
    }
  }, [activeSnapshot, confirmedGoLiveSnapshotId, snapshotsDirty])

  useEffect(() => {
    if (
      activeSnapshot
      && failedGoLiveSnapshotId != null
      && failedGoLiveSnapshotId !== activeSnapshot.id
      && isSnapshotCurrentAuthorityLive(activeSnapshot, authoritativeAudioState)
    ) {
      setFailedGoLiveSnapshotId(null)
      setGoLiveFailureReason(null)
      setGoLiveFailureDetail(null)
    }
  }, [activeSnapshot, authoritativeAudioState, failedGoLiveSnapshotId])

  const getChainForFlow = useCallback((slot: FlowSlot): Chain | undefined => {
    return slot.chainId !== null ? effectiveChainById.get(slot.chainId) : undefined
  }, [effectiveChainById])
  const effectiveSystemNoiseGateDefaults = systemNoiseGateDefaultsQuery.data ?? DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS

  // Capture the current workspace as a snapshot draft
  const captureCurrentState = useCallback((): SnapshotDraftData => {
    const chainSnapshots: Record<string, ChainSnapshot> = {}

    for (const slot of flowSlots) {
      if (slot.chainId) {
        const chain = effectiveChainById.get(slot.chainId)
        if (chain) {
          chainSnapshots[String(slot.chainId)] = {
            name: chain.name,
            plugins: chain.plugins.map((p, i) => {
              const baseParameters = p.parameters || {}
              const parameters = isSystemNoiseGatePlugin(p) && Object.keys(baseParameters).length === 0
                ? {
                  ...DEFAULT_SYSTEM_NOISE_GATE_PARAMETERS,
                  threshold: effectiveSystemNoiseGateDefaults.thresholdDb,
                  release: effectiveSystemNoiseGateDefaults.releaseMs,
                }
                : baseParameters
              return {
                snapshot_plugin_id: p.snapshot_plugin_id ?? null,
                uri: p.uri,
                position: i,
                bypass: p.bypassed || false,
                parameters,
                loader_state: p.loader_state,
              }
            }),
          }
        }
      }
    }

    return {
      flowSlots: flowSlots.map(s => ({
        id: s.id,
        chainId: s.chainId,
        label: s.label,
        color: s.color,
        muted: s.muted,
        solo: s.solo,
        dryWetMix: s.dryWetMix,
      })),
      routing: {
        mode: routing.mode,
        activeSlotId: routing.activeSlotId,
        blendPositions: routing.blendPositions,
        morphProgress: routing.morphProgress,
        morphSourceSlotId: routing.morphSourceSlotId,
        morphTargetSlotId: routing.morphTargetSlotId,
        seriesOrder: routing.seriesOrder,
      },
      activeFlowIndex,
      chains: chainSnapshots,
    }
  }, [
    effectiveChainById,
    effectiveSystemNoiseGateDefaults.releaseMs,
    effectiveSystemNoiseGateDefaults.thresholdDb,
    flowSlots,
    routing,
    activeFlowIndex,
  ])

  const currentSnapshotDraft = useMemo(() => captureCurrentState(), [captureCurrentState])
  useEffect(() => {
    if (!activeSnapshot) {
      return
    }

    const cleanDraft = cleanSnapshotDraftRef.current
    if (!cleanDraft) {
      return
    }

    if (!snapshotsDirty) {
      clearLiveWorkingSnapshotDraft(activeSnapshot.id)
      return
    }

    writeLiveWorkingSnapshotDraft({
      snapshotId: activeSnapshot.id,
      snapshotName: activeSnapshot.name,
      baseFingerprint: fingerprintSnapshotDraftData(cleanDraft),
      draft: currentSnapshotDraft,
    })
  }, [activeSnapshot, currentSnapshotDraft, snapshotsDirty])
  const renameSnapshotError = useMemo(() => {
    if (!activeSnapshot) {
      return null
    }
    return validateSnapshotName(
      renameSnapshotName,
      existingSnapshotNames,
      { currentName: activeSnapshot.name },
    )
  }, [activeSnapshot, existingSnapshotNames, renameSnapshotName])

  useEffect(() => {
    if (!editingSnapshotName) {
      setRenameSnapshotName(activeSnapshot?.name ?? '')
    }
  }, [activeSnapshot?.name, editingSnapshotName])

  useEffect(() => {
    setSnapshotProgramValue(activeSnapshot?.program_number == null ? '' : String(activeSnapshot.program_number))
  }, [activeSnapshot?.id, activeSnapshot?.program_number])

  useEffect(() => {
    if (!activeSnapshot) {
      setEditingSnapshotName(false)
      setRenameSnapshotName('')
      setSnapshotProgramValue('')
    }
  }, [activeSnapshot])

  useEffect(() => {
    setRoutingLiveApplyState('idle')
  }, [activeSnapshot?.id, isAuthorityLiveSnapshot, showProgressModal])

  const createSnapshotFromEditorMutation = useMutation({
    mutationFn: async ({
      snapshotName,
      sourceDraft,
    }: {
      snapshotName: string
      sourceDraft: SnapshotDraftData
      openPluginBrowser?: boolean
      focusSnapshotName?: boolean
    }) => {
      const created = await snapshotsApi.create({
        name: snapshotName,
        description: 'Created from Snapshot Editor',
        tempo_bpm: activeSnapshot?.tempo_bpm ?? 120,
        ...flowSnapshotDataToSnapshotPayload(sourceDraft),
      })
      const activated = await snapshotsApi.activate(created.snapshot_id)
      const activatedSnapshotId = activated.snapshot_id ?? created.snapshot_id
      const snapshotData = activated.snapshot_data
      return {
        snapshot_id: activatedSnapshotId,
        snapshot_data: snapshotData,
      }
    },
    onSuccess: (response, variables) => {
      setConfirmedGoLiveSnapshotId(response.snapshot_id)
      setEditorSnapshotOverride(null)
      setControlPlaneSnapshotCaches(response.snapshot_data)
      queryClient.setQueryData(['snapshots', 'detail', response.snapshot_id], response.snapshot_data)
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'live-state', 'local'] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'cluster-live-state'] })
      invalidateControlPlaneSnapshotCaches({ includeDesired: true })
      hydrateEditorFromSnapshot(response.snapshot_data, {
        toastMessage: buildSnapshotActivationToastMessage(response.snapshot_data),
        toastDurationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
        toast: {
          ...buildSnapshotActivationStageToast(response.snapshot_data),
          tone: 'success',
        },
        resetSelectedBlock: true,
        invalidateSnapshots: true,
      })
      setRenameSnapshotName(response.snapshot_data.name)
      setEditingSnapshotName(Boolean(variables.focusSnapshotName))
      if (variables.openPluginBrowser) {
        setShowPluginBrowser(true)
      }
    },
    onError: (error, variables) => {
      const stageToast = buildSnapshotActivationFailureStageToast(variables.snapshotName, error)
      pushToast(
        buildSnapshotActivationFailureToastMessage(variables.snapshotName, error),
        'warn',
        {
          durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
          id: stageToast.options.id,
          title: stageToast.title,
          stage: stageToast.options.stage,
        },
      )
    },
  })

  const openEditorSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.openDraft(snapshotId),
    onSuccess: (response) => {
      const detail = response.snapshot
      if (controlPlaneSnapshot?.id === detail.id) {
        setEditorSnapshotOverride(null)
      } else {
        setEditorSnapshotOverride(detail)
      }
      hydrateEditorFromSnapshot(detail, {
        toastMessage: `Loaded: ${detail.name}`,
        resetSelectedBlock: true,
      })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to load snapshot', 'error')
    },
  })

  const updateActiveSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) {
        throw new Error('No active snapshot to update')
      }
      if (activeSnapshot.is_locked) {
        throw new Error('Unlock snapshot before updating it')
      }
      return snapshotsApi.update(activeSnapshot.id, {
        ...flowSnapshotDataToSnapshotPayload(currentSnapshotDraft),
        create_revision: true,
      })
    },
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'revisions', response.snapshot.id] })
      hydrateEditorFromSnapshot(response.snapshot, {
        toastMessage: 'Snapshot updated',
        invalidateSnapshots: true,
        resetUndoHistory: false,
      })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  const activateCurrentSnapshotMutation = useMutation({
    mutationFn: async (snapshotId: number) => {
      const activated = await snapshotsApi.activate(snapshotId)
      const activatedSnapshotId = activated.snapshot_id ?? snapshotId
      const snapshotData = activated.snapshot_data
      return {
        snapshot_id: activatedSnapshotId,
        snapshot_data: snapshotData,
        activation_intent: activated.activation_intent ?? null,
      }
    },
    onMutate: (snapshotId) => {
      setPendingGoLiveSnapshotId(snapshotId)
      setPendingGoLiveRequestedAt(Date.now())
      setConfirmedGoLiveSnapshotId(null)
      setFailedGoLiveSnapshotId(null)
      setGoLiveFailureReason(null)
      setGoLiveFailureDetail(null)
    },
    onSuccess: (response) => {
      setPendingGoLiveSnapshotId(null)
      setPendingGoLiveRequestedAt(null)
      setConfirmedGoLiveSnapshotId(response.snapshot_id)
      setFailedGoLiveSnapshotId(null)
      setGoLiveFailureReason(null)
      setGoLiveFailureDetail(null)
      setControlPlaneSnapshotCaches(response.snapshot_data)
      queryClient.setQueryData(['snapshots', 'detail', response.snapshot_id], response.snapshot_data)
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'live-state', 'local'] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'cluster-live-state'] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'activation-events', 'local'] })
      invalidateControlPlaneSnapshotCaches({ includeDesired: true })
      setEditorSnapshotOverride(null)
      hydrateEditorFromSnapshot(response.snapshot_data, {
        toastMessage: buildSnapshotActivationToastMessage(response.snapshot_data),
        toastDurationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
        toast: {
          ...buildSnapshotActivationStageToast(response.snapshot_data),
          tone: 'success',
        },
        resetSelectedBlock: true,
        invalidateSnapshots: true,
      })
    },
    onError: (error, snapshotId) => {
      const failureDetail = extractSnapshotActivationFailureDetail(error)
      const failureReason = extractSnapshotActivationFailureReason(error, { separator: '\n' }) ?? 'Activation failed.'
      const snapshotName = activeSnapshot?.id === snapshotId
        ? activeSnapshot.name
        : snapshotsSummaryQuery.data?.snapshots.find((snapshot) => snapshot.id === snapshotId)?.name ?? 'Snapshot'
      setPendingGoLiveSnapshotId((current) => (current === snapshotId ? null : current))
      setPendingGoLiveRequestedAt(null)
      setFailedGoLiveSnapshotId(snapshotId)
      setGoLiveFailureReason(failureReason)
      setGoLiveFailureDetail(failureDetail)
      const stageToast = buildSnapshotActivationFailureStageToast(snapshotName, error, { snapshotId })
      pushToast(
        buildSnapshotActivationFailureToastMessage(snapshotName, error),
        'warn',
        {
          durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
          id: stageToast.options.id,
          title: stageToast.title,
          stage: stageToast.options.stage,
        },
      )
    },
  })

  const toggleActiveSnapshotLockMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) {
        throw new Error('No active snapshot to lock')
      }
      return snapshotsApi.update(activeSnapshot.id, {
        is_locked: !activeSnapshot.is_locked,
      })
    },
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast(response.snapshot.is_locked ? 'Snapshot locked' : 'Snapshot unlocked', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot lock', 'error')
    },
  })

  // Hero sub-row: publish-readiness drives the SnapshotPublishStatus pill +
  // contextual actions. Polled at 5s to mirror SnapshotPublishPage.
  const heroPublishReadinessQuery = useQuery({
    queryKey: ['snapshots', 'publish-readiness', activeSnapshot?.id ?? null],
    queryFn: () => {
      if (!activeSnapshot) throw new Error('No active snapshot')
      return snapshotsApi.getPublishReadiness(activeSnapshot.id)
    },
    enabled: Boolean(activeSnapshot?.id),
    refetchInterval: 5_000,
  })
  const heroPublishReadiness = heroPublishReadinessQuery.data ?? null

  const heroConfirmPublishMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) throw new Error('No active snapshot')
      return snapshotsApi.activate(activeSnapshot.id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'publish-readiness', activeSnapshot?.id ?? null] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', activeSnapshot?.id ?? null] })
      pushToast('Publish confirmed', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to confirm publish', 'error')
    },
  })

  const heroReconcilePublishMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) throw new Error('No active snapshot')
      return snapshotsApi.retryPublish(activeSnapshot.id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'publish-readiness', activeSnapshot?.id ?? null] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', activeSnapshot?.id ?? null] })
      pushToast('Reconcile started', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to reconcile', 'error')
    },
  })

  const heroOverwriteLiveMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) throw new Error('No active snapshot')
      return snapshotsApi.activate(activeSnapshot.id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'publish-readiness', activeSnapshot?.id ?? null] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', activeSnapshot?.id ?? null] })
      pushToast('Live state overwritten with current draft', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to overwrite live', 'error')
    },
  })

  const heroPublishActionPending =
    heroConfirmPublishMutation.isPending
    || heroReconcilePublishMutation.isPending
    || heroOverwriteLiveMutation.isPending

  const handleHeroCopyMetadataValue = useCallback((value: string) => {
    if (!value) return
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value).then(
        () => pushToast('Copied to clipboard', 'success'),
        () => pushToast('Clipboard copy blocked by browser', 'warn'),
      )
      return
    }
    pushToast('Clipboard not available', 'warn')
  }, [pushToast])

  const handleHeroNavigateToPublishPage = useCallback(() => {
    if (!activeSnapshot) return
    navigate(`/snapshots/${activeSnapshot.id}/publish`)
  }, [activeSnapshot, navigate])

  const renameActiveSnapshotMutation = useMutation({
    mutationFn: async ({ snapshotId, name }: { snapshotId: number; name: string }) =>
      snapshotsApi.update(snapshotId, { name }),
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'live-state', 'local'] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'cluster-live-state'] })
      setEditingSnapshotName(false)
      setRenameSnapshotName('')
      pushToast(`Snapshot renamed to "${response.snapshot.name}"`, 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to rename snapshot', 'error')
    },
  })

  const updateActiveSnapshotProgramMutation = useMutation({
    mutationFn: async ({ snapshotId, programNumber }: { snapshotId: number; programNumber: number | null }) => {
      const result = await snapshotsApi.setProgram(snapshotId, programNumber)
      const snapshot = await snapshotsApi.get(snapshotId)
      return { result, snapshot }
    },
    onSuccess: ({ result, snapshot }) => {
      syncSnapshotDetailCaches(snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'activation-events', 'local'] })
      setSnapshotProgramValue(result.program_number == null ? '' : String(result.program_number))
      pushToast('MIDI program updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update MIDI program', 'error')
    },
  })

  const toggleActiveSnapshotFavoriteMutation = useMutation({
    mutationFn: async ({ snapshotId, isFavorite }: { snapshotId: number; isFavorite: boolean }) =>
      snapshotsApi.update(snapshotId, { is_favorite: isFavorite }),
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast(response.snapshot.is_favorite ? 'Snapshot marked as favorite' : 'Snapshot removed from favorites', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot favorite', 'error')
    },
  })

  const duplicateActiveSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) {
        throw new Error('No active snapshot to duplicate')
      }
      return {
        sourceName: activeSnapshot.name,
        response: await snapshotsApi.duplicate(activeSnapshot.id),
      }
    },
    onSuccess: ({ sourceName, response }) => {
      setEditorSnapshotOverride(response.snapshot)
      hydrateEditorFromSnapshot(response.snapshot, {
        toastMessage: `Duplicated: ${sourceName} → ${response.snapshot.name}`,
        resetSelectedBlock: true,
        invalidateSnapshots: true,
      })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to duplicate snapshot', 'error')
    },
  })

  const updateActiveSnapshotDescriptionMutation = useMutation({
    mutationFn: async ({ snapshotId, description }: { snapshotId: number; description: string }) =>
      snapshotsApi.update(snapshotId, { description }),
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot notes updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot notes', 'error')
    },
  })

  const updateActiveSnapshotOutputReferenceMutation = useMutation({
    mutationFn: async ({
      snapshotId,
      outputLevelReferenceDbfs,
      outputLevelWarningThresholdDb,
    }: {
      snapshotId: number
      outputLevelReferenceDbfs?: number | null
      outputLevelWarningThresholdDb?: number | null
    }) => snapshotsApi.update(snapshotId, {
      output_level_reference_dbfs: outputLevelReferenceDbfs,
      output_level_warning_threshold_db: outputLevelWarningThresholdDb,
    }),
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot output reference updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update output reference', 'error')
    },
  })

  const updateSystemNoiseGateDefaultsMutation = useMutation({
    mutationFn: async ({
      thresholdDb,
      releaseMs,
    }: {
      thresholdDb: number
      releaseMs: number
    }) => {
      await fetchJson('/api/cluster/config/runtime', {
        method: 'PUT',
        body: JSON.stringify({
          key: NOISE_GATE_THRESHOLD_CONFIG_KEY,
          value: thresholdDb,
          scope: 'cluster',
        }),
      })
      await fetchJson('/api/cluster/config/runtime', {
        method: 'PUT',
        body: JSON.stringify({
          key: NOISE_GATE_RELEASE_CONFIG_KEY,
          value: releaseMs,
          scope: 'cluster',
        }),
      })
      return { thresholdDb, releaseMs }
    },
    onSuccess: ({ thresholdDb, releaseMs }) => {
      queryClient.setQueryData(['config', 'snapshot-noise-gate-defaults'], {
        thresholdDb,
        releaseMs,
      })
      queryClient.invalidateQueries({ queryKey: ['config', 'snapshot-noise-gate-defaults'] })
      pushToast('Noise gate defaults updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update noise gate defaults', 'error')
    },
  })

  const updateSnapshotIoBindingsMutation = useMutation({
    mutationFn: async ({
      snapshotId,
      state,
      currentDefaults,
    }: {
      snapshotId: number | null
      state: SnapshotIoModalState
      currentDefaults: SnapshotIoDefaults | null | undefined
    }) => {
      const nextDefaults = buildSnapshotIoDefaultsUpdate(state)
      const previousDefaults = {
        input_device: currentDefaults?.input_device ?? null,
        output_device: currentDefaults?.output_device ?? null,
        monitoring_output_index: currentDefaults?.monitoring_output_index ?? null,
      }

      if (nextDefaults.input_device !== previousDefaults.input_device) {
        await fetchJson('/api/cluster/config/runtime', {
          method: 'PUT',
          body: JSON.stringify({
            key: SNAPSHOT_DEFAULT_INPUT_DEVICE_CONFIG_KEY,
            value: nextDefaults.input_device,
            scope: 'cluster',
          }),
        })
      }

      if (nextDefaults.output_device !== previousDefaults.output_device) {
        await fetchJson('/api/cluster/config/runtime', {
          method: 'PUT',
          body: JSON.stringify({
            key: SNAPSHOT_DEFAULT_OUTPUT_DEVICE_CONFIG_KEY,
            value: nextDefaults.output_device,
            scope: 'cluster',
          }),
        })
      }

      if (nextDefaults.monitoring_output_index !== previousDefaults.monitoring_output_index) {
        await fetchJson('/api/cluster/config/runtime', {
          method: 'PUT',
          body: JSON.stringify({
            key: SNAPSHOT_DEFAULT_MONITORING_OUTPUT_INDEX_CONFIG_KEY,
            value: nextDefaults.monitoring_output_index,
            scope: 'cluster',
          }),
        })
      }

      const snapshot = snapshotId != null
        ? (await snapshotsApi.update(snapshotId, {
          ...buildSnapshotIoUpdateRequest(state),
          controls: buildSnapshotIoControlsUpdate(state, activeSnapshot?.controls),
        })).snapshot
        : null

      return { defaults: nextDefaults, snapshot }
    },
    onSuccess: ({ defaults, snapshot }) => {
      queryClient.setQueryData(['config', 'snapshot-io-defaults'], defaults)
      queryClient.invalidateQueries({ queryKey: ['config', 'snapshot-io-defaults'] })
      if (snapshot) {
        syncSnapshotDetailCaches(snapshot)
        queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      }
      pushToast(snapshot ? 'Snapshot I/O devices updated' : 'Default I/O devices updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update I/O devices', 'error')
    },
  })

  const updateActiveSnapshotTempoMutation = useMutation({
    mutationFn: async ({ snapshotId, tempoBpm }: { snapshotId: number; tempoBpm: number }) =>
      snapshotsApi.update(snapshotId, { tempo_bpm: tempoBpm }),
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot tempo updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot tempo', 'error')
    },
  })

  const restoreSnapshotRevisionMutation = useMutation({
    mutationFn: async ({ snapshotId, revisionNumber }: { snapshotId: number; revisionNumber: number }) =>
      snapshotsApi.restoreRevision(snapshotId, revisionNumber),
    onSuccess: (response) => {
      const restoredDraft = buildSnapshotEditorLiveSnapshotHydration(
        response.snapshot,
        queryClient.getQueryData<ChainsResponse>(['chains']),
      ).snapshotData
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'revisions', response.snapshot.id] })
      closeVersionHistoryWorkspace()
      hydrateEditorFromSnapshot(response.snapshot, {
        toastMessage: `Restored revision ${response.restored_revision_number}`,
        invalidateSnapshots: true,
        resetUndoHistory: false,
      })
      recordSnapshotUndoRedoStep(
        restoredDraft,
        `Restore revision ${response.restored_revision_number}`,
      )
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to restore snapshot revision', 'error')
    },
  })

  const setEditorSnapshotState = useCallback((data: SnapshotDraftData) => {
    const normalizedSnapshotState = normalizeRuntimeGridState(
      data.flowSlots,
      data.routing,
      data.activeFlowIndex,
    )
    setFlowSlots(normalizedSnapshotState.flowSlots)
    setRouting(normalizedSnapshotState.routing)
    setActiveFlowIndex(normalizedSnapshotState.activeFlowIndex)
  }, [])

  const seedSnapshotUndoRedo = useCallback((draft: SnapshotDraftData) => {
    const cleanDraft = cloneSnapshotDraftData(draft)
    cleanSnapshotDraftRef.current = cleanDraft
    pendingParameterUndoStartRef.current = null
    pendingParameterUndoNextRef.current = null
    pendingParameterUndoDescriptionRef.current = null
    snapshotUndoRedo.reset(cleanDraft)
    clearSnapshotsDirty()
  }, [clearSnapshotsDirty, snapshotUndoRedo.reset])

  const recordSnapshotUndoRedoStep = useCallback((nextDraft: SnapshotDraftData, description: string) => {
    snapshotUndoRedo.push(cloneSnapshotDraftData(nextDraft), description)
    syncSnapshotDirtyState(nextDraft)
  }, [snapshotUndoRedo.push, syncSnapshotDirtyState])

  const cancelControlPlaneSnapshotCaches = useCallback(async () => {
    if (authoritySnapshotId != null) {
      await queryClient.cancelQueries({ queryKey: ['snapshots', 'detail', 'authority-active', authoritySnapshotId] })
    }
  }, [authoritySnapshotId, queryClient])

  const syncSnapshotDetailCaches = useCallback((
    snapshot: SnapshotDetail,
    options?: {
      updateAuthorityActiveSnapshot?: boolean
    },
  ) => {
    const updateAuthorityActiveSnapshot = options?.updateAuthorityActiveSnapshot ?? true
    queryClient.setQueryData(['snapshots', 'detail', snapshot.id], snapshot)
    if (updateAuthorityActiveSnapshot && authoritySnapshotId === snapshot.id) {
      queryClient.setQueryData(['snapshots', 'detail', 'authority-active', authoritySnapshotId], snapshot)
    }
    setEditorSnapshotContext((current) => {
      if (current?.id === snapshot.id || controlPlaneSnapshot?.id === snapshot.id || editorSnapshotOverride?.id === snapshot.id) {
        return snapshot
      }
      return current
    })
    if (updateAuthorityActiveSnapshot && controlPlaneSnapshot?.id === snapshot.id) {
      setControlPlaneSnapshotCaches(snapshot)
      setEditorSnapshotOverride((current) => (current?.id === snapshot.id ? null : current))
      return
    }

    if (!updateAuthorityActiveSnapshot && currentEditorSnapshotId === snapshot.id) {
      setEditorSnapshotOverride(snapshot)
      return
    }

    setEditorSnapshotOverride((current) => (current?.id === snapshot.id ? snapshot : current))
  }, [
    authoritySnapshotId,
    controlPlaneSnapshot?.id,
    currentEditorSnapshotId,
    editorSnapshotOverride?.id,
    queryClient,
    setControlPlaneSnapshotCaches,
  ])

  const syncSnapshotMutationResult = useCallback((snapshot: SnapshotDetail) => {
    syncSnapshotDetailCaches(snapshot, {
      updateAuthorityActiveSnapshot: true,
    })
    queryClient.setQueryData<ChainsResponse>(
      ['chains'],
      buildEffectiveLiveSnapshotChains(
        snapshot,
        queryClient.getQueryData<ChainsResponse>(['chains']),
      ),
    )
  }, [queryClient, syncSnapshotDetailCaches])

  const requireSnapshotChainId = useCallback((
    chainId: number,
  ): number => {
    const snapshotChainId = resolveSnapshotChainId({
      detail: activeSnapshot,
      effectiveChain: effectiveChainById.get(chainId),
      chainId,
    })
    if (snapshotChainId != null) {
      return snapshotChainId
    }
    throw new Error(`Snapshot chain id missing for chain ${chainId}`)
  }, [activeSnapshot, effectiveChainById])

  const requireSnapshotPluginId = useCallback((
    chainId: number,
    pluginUri: string,
    pluginPosition?: number,
  ): { snapshotChainId: number; snapshotPluginId: number } => {
    const identity = resolveSnapshotPluginIdentity({
      detail: activeSnapshot,
      effectiveChain: effectiveChainById.get(chainId),
      chainId,
      pluginUri,
      pluginPosition,
    })
    if (identity) {
      return identity
    }
    throw new Error(`Snapshot plugin id missing for ${pluginUri}`)
  }, [activeSnapshot, effectiveChainById])

  const requireSnapshotPluginOrderIds = useCallback((
    chainId: number,
    pluginOrder: PluginOrderRef[],
  ): { snapshotChainId: number; snapshotPluginIds: number[] } => {
    const identities = pluginOrder.map((plugin) => requireSnapshotPluginId(chainId, plugin.uri, plugin.position))
    return {
      snapshotChainId: identities[0]?.snapshotChainId ?? chainId,
      snapshotPluginIds: identities.map((identity) => identity.snapshotPluginId),
    }
  }, [
    requireSnapshotPluginId,
  ])

  const createEditorChain = useCallback(async (name: string): Promise<Chain> => {
    if (activeSnapshot?.id != null) {
      const snapshot = await snapshotsApi.addChain(activeSnapshot.id, name)
      syncSnapshotMutationResult(snapshot)
      const addedChain = [...snapshot.chains]
        .reverse()
        .find((chain) => chain.name === name && typeof chain.id === 'number')
      if (!addedChain?.id) {
        throw new Error('Created snapshot chain was not returned by the API')
      }
      const effectiveChain = buildEffectiveLiveSnapshotChains(
        snapshot,
        queryClient.getQueryData<ChainsResponse>(['chains']),
      ).chains.find((chain) => chain.id === addedChain.id)
      if (!effectiveChain) {
        throw new Error(`Created chain ${addedChain.id} was not present in the editor cache`)
      }
      return effectiveChain
    }
    return chainsApi.create(name)
  }, [activeSnapshot?.id, queryClient, syncSnapshotMutationResult])

  type SnapshotRoutingMutationResponse = SnapshotDetail & {
    routing_requires_reactivation?: boolean
    routing_mode_changed_live?: boolean
  }

  const updateLiveSnapshotRoutingMutation = useMutation({
    mutationFn: async ({
      snapshotId,
      nextDraft,
    }: {
      snapshotId: number
      nextDraft: SnapshotDraftData
    }) => snapshotsApi.updateRouting(
      snapshotId,
      flowSnapshotDataToSnapshotPayload(nextDraft).routing,
    ) as Promise<SnapshotRoutingMutationResponse>,
    onSuccess: (snapshot) => {
      syncSnapshotDetailCaches(snapshot, {
        updateAuthorityActiveSnapshot: true,
      })
      setRoutingLiveApplyState('live-applied')
      if (snapshot.routing_mode_changed_live) {
        pushToast('Live routing mode updated', 'success')
      }
    },
    onError: (error) => {
      setRoutingLiveApplyState('idle')
      pushToast(error instanceof Error ? error.message : 'Failed to update live routing', 'error')
    },
  })

  const routingLiveStatus = useMemo(
    () => resolveSnapshotRoutingLiveStatus({
      isAuthorityLive: isAuthorityLiveSnapshot,
      isApplying: updateLiveSnapshotRoutingMutation.isPending,
      applyState: routingLiveApplyState,
    }),
    [isAuthorityLiveSnapshot, routingLiveApplyState, updateLiveSnapshotRoutingMutation.isPending],
  )

  const hydrateEditorFromSnapshot = useCallback((
    detail: SnapshotDetail,
    options?: {
      toastMessage?: string | null
      toastDurationMs?: number
      toast?: { message: string; tone?: NotificationTone; options?: NotificationOptions } | null
      resetSelectedBlock?: boolean
      invalidateSnapshots?: boolean
      resetUndoHistory?: boolean
    },
  ) => {
    setEditorSnapshotContext(detail)
    const hydration = buildSnapshotEditorLiveSnapshotHydration(
      detail,
      queryClient.getQueryData<ChainsResponse>(['chains']),
    )
    queryClient.setQueryData(['chains'], hydration.chainsResponse)
    queryClient.setQueryData(['snapshots', 'detail', detail.id], detail)
    lastHydratedLiveSnapshotFingerprintRef.current = hydration.fingerprint
    setEditorSnapshotState(hydration.snapshotData)
    if (options?.resetUndoHistory === false) {
      cleanSnapshotDraftRef.current = cloneSnapshotDraftData(hydration.snapshotData)
      pendingParameterUndoStartRef.current = null
      pendingParameterUndoNextRef.current = null
      pendingParameterUndoDescriptionRef.current = null
      clearSnapshotsDirty()
    } else {
      seedSnapshotUndoRedo(hydration.snapshotData)
    }
    if (options?.resetSelectedBlock) {
      setSelectedPluginSelection(null)
      setDetailsPlugin(null)
      setTabletEditorOpen(false)
      setEffectModalOpen(false)
    }
    if (options?.invalidateSnapshots) {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    }
    if (options?.toastMessage) {
      pushToast(
        options.toastMessage,
        'success',
        options.toastDurationMs ? { durationMs: options.toastDurationMs } : undefined,
      )
    }
    if (options?.toast) {
      pushToast(options.toast.message, options.toast.tone ?? 'success', options.toast.options)
    }
  }, [clearSnapshotsDirty, pushToast, queryClient, seedSnapshotUndoRedo, setEditorSnapshotState, setSelectedPluginSelection])

  const restorePersistedLiveWorkingDraft = useCallback((
    detail: SnapshotDetail,
    baseHydration: SnapshotEditorLiveSnapshotHydration,
    persistedDraft: SnapshotDraftData,
  ) => {
    setEditorSnapshotContext(detail)
    queryClient.setQueryData(
      ['chains'],
      applySnapshotDraftToChainsResponse(baseHydration.chainsResponse, persistedDraft),
    )
    queryClient.setQueryData(['snapshots', 'detail', detail.id], detail)
    lastHydratedLiveSnapshotFingerprintRef.current = baseHydration.fingerprint
    cleanSnapshotDraftRef.current = cloneSnapshotDraftData(baseHydration.snapshotData)
    pendingParameterUndoStartRef.current = null
    pendingParameterUndoNextRef.current = null
    pendingParameterUndoDescriptionRef.current = null
    const restoredDraft = cloneSnapshotDraftData(persistedDraft)
    setEditorSnapshotState(restoredDraft)
    snapshotUndoRedo.reset(restoredDraft)
    markSnapshotsDirty()
  }, [markSnapshotsDirty, queryClient, setEditorSnapshotState, snapshotUndoRedo.reset])

  const applySnapshotDraftPreview = useCallback(async (draft: SnapshotDraftData) => {
    const preview = await snapshotsApi.preview(draft)
    const detail = mergePreviewIntoSnapshotDetail(preview.snapshot_data, activeSnapshot)
    const hydration = buildSnapshotEditorLiveSnapshotHydration(
      detail,
      queryClient.getQueryData<ChainsResponse>(['chains']),
    )
    queryClient.setQueryData(['chains'], hydration.chainsResponse)
    if (detail.id != null) {
      queryClient.setQueryData(['snapshots', 'detail', detail.id], detail)
    }
    if (editorSnapshotOverride && detail.id === editorSnapshotOverride.id) {
      setEditorSnapshotOverride(detail)
    }
    lastHydratedLiveSnapshotFingerprintRef.current = hydration.fingerprint
    setEditorSnapshotState(hydration.snapshotData)
    syncSnapshotDirtyState(hydration.snapshotData)
    return hydration.snapshotData
  }, [
    activeSnapshot,
    editorSnapshotOverride,
    queryClient,
    setEditorSnapshotState,
    syncSnapshotDirtyState,
  ])

  useEffect(() => {
    if (!committedAudioStateQuery.isSuccess) {
      return
    }

    if (activeSnapshot === null) {
      const blankDraft = createBlankSnapshotEditorDraft()
      lastHydratedLiveSnapshotFingerprintRef.current = null
      cleanSnapshotDraftRef.current = null
      snapshotUndoRedo.clear()
      clearSnapshotsDirty()
      setEditorSnapshotState(blankDraft)
      setSelectedPluginSelection(null)
      setDetailsPlugin(null)
      setTabletEditorOpen(false)
      setEffectModalOpen(false)
      setShowPluginBrowser(false)
      setPendingTabletDeletePlugin(null)
      setShowProgressModal(false)
      setPortSelectorFlowIndex(null)
      setShowAudioNodesModal(false)
      setLanePickerOpen(false)
      setAutomationTimelineExpanded(false)
      return
    }

    const hydration = buildSnapshotEditorLiveSnapshotHydration(
      activeSnapshot,
      queryClient.getQueryData<ChainsResponse>(['chains']),
    )
    const persistedWorkingDraft = readCompatibleLiveWorkingSnapshotDraft(activeSnapshot.id, hydration.fingerprint)
    if (persistedWorkingDraft) {
      if (
        persistedWorkingDraft.workingFingerprint === hydration.fingerprint
        || snapshotDraftsEqual(persistedWorkingDraft.draft, hydration.snapshotData)
      ) {
        clearLiveWorkingSnapshotDraft(activeSnapshot.id)
      } else {
        restorePersistedLiveWorkingDraft(activeSnapshot, hydration, persistedWorkingDraft.draft)
        return
      }
    } else if (readLiveWorkingSnapshotDraft(activeSnapshot.id)) {
      clearLiveWorkingSnapshotDraft(activeSnapshot.id)
    }

    if (lastHydratedLiveSnapshotFingerprintRef.current === hydration.fingerprint) {
      return
    }

    hydrateEditorFromSnapshot(activeSnapshot)
  }, [
    activeSnapshot,
    clearSnapshotsDirty,
    committedAudioStateQuery.isSuccess,
    hydrateEditorFromSnapshot,
    queryClient,
    restorePersistedLiveWorkingDraft,
    setEditorSnapshotState,
    setSelectedPluginSelection,
    snapshotUndoRedo.clear,
  ])

  const activeFlow = flowSlots[activeFlowIndex]
  const flowIndexById = useMemo(() => (
    new Map(flowSlots.map((slot, index) => [slot.id, index]))
  ), [flowSlots])
  const livePathLayout = useMemo(() => buildJuceGridLivePath({
    flows: flowSlots.map((slot) => ({
      id: slot.id,
      label: slot.label,
      color: slot.color,
      muted: slot.muted,
      solo: slot.solo,
      chainId: slot.chainId,
      dryWetMix: slot.dryWetMix,
    })),
    mode: routing.mode,
    activeFlowId: routing.activeSlotId,
    focusFlowId: activeFlow?.id ?? null,
    seriesOrder: routing.seriesOrder,
    blendPositions: routing.blendPositions,
    morphProgress: routing.morphProgress,
    morphSourceId: routing.morphSourceSlotId,
    morphTargetId: routing.morphTargetSlotId,
  }), [
    activeFlow?.id,
    flowSlots,
    routing.activeSlotId,
    routing.blendPositions,
    routing.mode,
    routing.morphProgress,
    routing.morphSourceSlotId,
    routing.morphTargetSlotId,
    routing.seriesOrder,
  ])
  const currentChain = useMemo(() => {
    if (!activeFlow) return null
    return activeFlow.chainId !== null ? effectiveChainById.get(activeFlow.chainId) ?? null : null
  }, [activeFlow, effectiveChainById])
  const currentChainAuthorityActive = currentChain ? authorityLiveChainIdSet.has(currentChain.id) : false
  const {
    blockFocusPlugins,
    maxBlockFocusStartNote,
    blockFocusStartNote,
    blockFocusStartNoteOverflow,
    blockFocusSaveDisabled,
    abSwitchMidiSaveDisabled,
    footswitchLabelsSaveDisabled,
  } = useSnapshotEditorMidiBindingDrafts({
    activeSnapshotId: activeSnapshot?.id ?? null,
    snapshotEditingLocked,
    currentChainPlugins: currentChain?.plugins,
    snapshotAbSwitchMidiBinding,
    snapshotBlockFocusRange,
    snapshotFootswitchLabelMap,
    abSwitchMidiMessageTypeDraft,
    abSwitchMidiChannelDraft,
    abSwitchMidiNumberDraft,
    blockFocusMidiChannelDraft,
    blockFocusStartNoteDraft,
    footswitchLabelDrafts,
    setAbSwitchMidiMessageTypeDraft,
    setAbSwitchMidiChannelDraft,
    setAbSwitchMidiNumberDraft,
    setBlockFocusMidiChannelDraft,
    setBlockFocusStartNoteDraft,
    setFootswitchLabelDrafts,
  })

  useEffect(() => {
    if (!isTabletTouchLayout) {
      return
    }

    const fallbackFlowId = activeFlow?.id ?? flowSlots[0]?.id ?? null
    if (!fallbackFlowId) {
      setFocusedBranchId(null)
      setExpandedTabletBranchId(null)
      return
    }

    setFocusedBranchId((current) => (
      current && flowIndexById.has(current)
        ? current
        : fallbackFlowId
    ))
    setExpandedTabletBranchId((current) => (
      current && flowIndexById.has(current)
        ? current
        : fallbackFlowId
    ))
  }, [activeFlow?.id, flowIndexById, flowSlots, isTabletTouchLayout])

  useEffect(() => {
    if (!isTabletTouchLayout) {
      return
    }

    setBranchPageByFlowId((previous) => {
      let changed = false
      const next: Record<string, number> = {}

      flowSlots.forEach((flow) => {
        const currentPage = previous[flow.id] ?? 0
        const clampedPage = 0
        next[flow.id] = clampedPage
        if (clampedPage !== currentPage) {
          changed = true
        }
      })

      if (!changed && Object.keys(previous).length === Object.keys(next).length) {
        return previous
      }

      return next
    })
  }, [effectiveChainById, flowSlots, isTabletTouchLayout])

  const routingVisualizerFlows = useMemo(() => (
    flowSlots.map((slot, i) => ({
      id: slot.id,
      label: SLOT_COLORS[i]?.label || slot.label,
      color: SLOT_COLORS[i]?.color || slot.color,
      muted: false,
      active: livePathLayout.activeFlowIds.includes(slot.id),
      blendPercent: routing.blendPositions[slot.id] ?? 100,
    }))
  ), [flowSlots, livePathLayout.activeFlowIds, routing.blendPositions])

  const activeRoutingMode = useMemo(
    () => ROUTING_MODE_OPTIONS.find((option) => option.id === routing.mode) ?? ROUTING_MODE_OPTIONS[0],
    [routing.mode],
  )

  const activeFlowLabel = SLOT_COLORS[activeFlowIndex]?.label || activeFlow?.label || 'A'
  const activeChainDisplayName = currentChain ? `Chain ${activeFlowLabel}` : 'No active chain'
  const tabletFocusedBranchId = focusedBranchId && flowIndexById.has(focusedBranchId)
    ? focusedBranchId
    : activeFlow?.id ?? flowSlots[0]?.id ?? null
  const tabletFocusedFlowIndex = tabletFocusedBranchId ? flowIndexById.get(tabletFocusedBranchId) ?? -1 : -1
  const tabletFocusedFlow = tabletFocusedFlowIndex >= 0 ? flowSlots[tabletFocusedFlowIndex] : null
  const tabletFocusedChain = tabletFocusedFlow
    ? (tabletFocusedFlow.chainId !== null ? effectiveChainById.get(tabletFocusedFlow.chainId) ?? null : null)
    : null
  const tabletFocusedBranchPage = tabletFocusedFlow ? branchPageByFlowId[tabletFocusedFlow.id] ?? 0 : 0
  const tabletFocusedBranchPageCount = 1
  const tabletFocusedBranchPageLabel = tabletFocusedChain ? 'Scroll lane' : 'No lane'
  const secondaryRoutingFlowId = useMemo(
    () => flowSlots.find((flow) => flow.id !== routing.activeSlotId)?.id ?? null,
    [flowSlots, routing.activeSlotId],
  )
  const abSwitchFlowSlots = useMemo(
    () => flowSlots.slice(0, 2),
    [flowSlots],
  )
  const abSwitchEnabled = routing.mode === 'ab_switch' && abSwitchFlowSlots.length >= 2
  const abSwitchActiveFlow = useMemo(() => {
    if (!abSwitchEnabled) {
      return null
    }
    return abSwitchFlowSlots.find((flow) => flow.id === routing.activeSlotId) ?? abSwitchFlowSlots[0] ?? null
  }, [abSwitchEnabled, abSwitchFlowSlots, routing.activeSlotId])
  const abSwitchAlternateFlow = useMemo(() => {
    if (!abSwitchEnabled || !abSwitchActiveFlow) {
      return null
    }
    return abSwitchFlowSlots.find((flow) => flow.id !== abSwitchActiveFlow.id) ?? null
  }, [abSwitchActiveFlow, abSwitchEnabled, abSwitchFlowSlots])
  const abSwitchActiveLabel = abSwitchActiveFlow?.label ?? 'A'
  const abSwitchNextLabel = abSwitchAlternateFlow?.label ?? 'B'
  const addEffectFlowId = routing.activeSlotId ?? activeFlow?.id ?? null
  const routingFocusButtons = useMemo(() => (
    flowSlots.map((slot, index) => {
      const flowLabel = SLOT_COLORS[index]?.label || slot.label
      return {
        id: slot.id,
        title: `Flow ${flowLabel}`,
        caption: getRoutingFocusFlowSummary(
          routing.mode,
          index,
          slot.id,
          routing.activeSlotId,
          secondaryRoutingFlowId,
          routing.blendPositions[slot.id] ?? 100,
        ),
        active: activeFlowIndex === index,
        color: slot.color || getFlowCardPaletteEntry(index).color,
      }
    })
  ), [activeFlowIndex, flowSlots, routing.activeSlotId, routing.blendPositions, routing.mode, secondaryRoutingFlowId])

  const pluginMeta = useMemo(() => {
    const plugins = pluginsQuery.data?.plugins || []
    const map: Record<string, Plugin> = {}
    for (const p of plugins) {
      map[p.uri] = p
    }
    return map
  }, [pluginsQuery.data])
  const goLiveDiffSourceSnapshot = controlPlaneSnapshot
  const goLiveDiff = useMemo(() => {
    if (
      !activeSnapshot
      || !goLiveDiffSourceSnapshot
      || activeSnapshot.id === goLiveDiffSourceSnapshot.id
    ) {
      return null
    }

    return buildSnapshotGoLiveDiff(goLiveDiffSourceSnapshot, activeSnapshot, pluginMeta)
  }, [activeSnapshot, goLiveDiffSourceSnapshot, pluginMeta])
  const goLiveDiffKey = useMemo(() => {
    if (!activeSnapshot || !goLiveDiffSourceSnapshot) {
      return null
    }
    return `${goLiveDiffSourceSnapshot.id}:${activeSnapshot.id}`
  }, [activeSnapshot, goLiveDiffSourceSnapshot])
  const visibleGoLiveDiff = useMemo(() => {
    if (
      !goLiveDiff
      || goLiveDiff.count === 0
      || !goLiveDiffKey
      || dismissedGoLiveDiffKey === goLiveDiffKey
      || snapshotGoLiveState.phase === 'live'
    ) {
      return null
    }

    return goLiveDiff
  }, [dismissedGoLiveDiffKey, goLiveDiff, goLiveDiffKey, snapshotGoLiveState.phase])

  useEffect(() => {
    setGoLiveDiffExpanded(false)
  }, [goLiveDiffKey])

  const selectedPlugin = useMemo(() => {
    if (!selectedPluginUri || !currentChain) return null
    return currentChain.plugins.find((plugin) => (
      plugin.uri === selectedPluginUri
      && (typeof selectedPluginPosition !== 'number' || plugin.position === selectedPluginPosition)
    )) || null
  }, [selectedPluginPosition, selectedPluginUri, currentChain])

  useEffect(() => {
    if (!isTabletTouchLayout || selectedPlugin) {
      return
    }

    setTabletEditorOpen(false)
  }, [isTabletTouchLayout, selectedPlugin])

  const selectedPluginMeta = useMemo(() => {
    if (!selectedPluginUri) return null
    return pluginMeta[selectedPluginUri] || null
  }, [selectedPluginUri, pluginMeta])

  useEffect(() => {
    if (!selectedPluginUri || !selectedPlugin) {
      missingSelectedPluginMetaWarningKeyRef.current = null
      return
    }

    if (selectedPluginMeta) {
      missingSelectedPluginMetaWarningKeyRef.current = null
      return
    }

    if (pluginsQuery.status !== 'success') {
      return
    }

    const discoveredPluginCount = pluginsQuery.data?.plugins?.length ?? 0
    const warningKey = `${selectedPluginUri}:${discoveredPluginCount}`
    if (missingSelectedPluginMetaWarningKeyRef.current === warningKey) {
      return
    }

    missingSelectedPluginMetaWarningKeyRef.current = warningKey
    console.warn('[SnapshotEditorPage] Selected plugin metadata is missing after discovery settled:', {
      selectedPluginUri,
      availableUris: Object.keys(pluginMeta).slice(0, 5),
      discoveredPluginCount,
    })
  }, [pluginMeta, pluginsQuery.data?.plugins?.length, pluginsQuery.status, selectedPlugin, selectedPluginMeta, selectedPluginUri])

  const selectedPluginCard = useMemo(() => {
    return buildSnapshotEditorSelectedPluginCard(selectedPlugin, selectedPluginMeta)
  }, [selectedPlugin, selectedPluginMeta])

  const selectedPluginCardStrategy = useMemo(() => {
    if (!selectedPluginCard) {
      return null
    }

    const sameFamilyCount = currentChain?.plugins.filter((plugin) => (
      selectedPluginCard.uri.toLowerCase().includes('synthforge')
        ? plugin.uri.toLowerCase().includes('synthforge')
        : plugin.uri === selectedPluginCard.uri
    )).length

    return resolveLivePluginCardStrategy(selectedPluginCard.uri, selectedPluginCard.category, {
      sameFamilyCount,
    })
  }, [currentChain?.plugins, selectedPluginCard])

  useEffect(() => {
    if (selectedPluginUri && chainsQuery.isPending) {
      return
    }
    if (!selectedPlugin) {
      setEffectModalOpen(false)
    }
  }, [chainsQuery.isPending, selectedPlugin, selectedPluginUri])

  const midiStatus = midiStatusQuery.data as MIDIStatus | undefined
  const midiLearnStatus = midiLearnStatusQuery.data
  const midiMappings = midiMappingsQuery.data?.mappings ?? []
  const midiLearnInProgress = midiLearnStatus?.learning ?? false
  // WebSocket-primary MIDI activity, polled status as fallback
  const lastMidiEvent = useMemo(() => {
    if (lastMidiActivityWs) return lastMidiActivityWs
    if (!midiStatus || midiStatus.last_channel <= 0) return null
    return {
      cc: midiStatus.last_cc,
      value: midiStatus.last_value,
      channel: midiStatus.last_channel,
    }
  }, [lastMidiActivityWs, midiStatus])
  const blockFocusPreview = useMemo(() => (
    blockFocusPlugins.map((plugin, index) => ({
      key: `${plugin.uri}-${plugin.position ?? index}`,
      blockLabel: getDisplayPluginName(plugin.name, plugin.uri),
      note: blockFocusStartNote + index,
      position: plugin.position,
    }))
  ), [blockFocusPlugins, blockFocusStartNote])

  const midiScopeLabel = useMemo(() => {
    switch (midiScope) {
      case 'selected-plugin':
        return selectedPlugin
          ? `Selected block: ${getDisplayPluginName(selectedPlugin.name, selectedPlugin.uri)}`
          : 'Selected block'
      case 'active-chain':
        return currentChain ? `Active chain: ${activeChainDisplayName}` : 'Active chain'
      case 'all':
      default:
        return 'All mappings'
    }
  }, [activeChainDisplayName, currentChain, midiScope, selectedPlugin])

  const midiPluginNameByUri = useMemo(() => {
    const names = new Map<string, string>()

    chains.forEach((chain) => {
      chain.plugins.forEach((plugin) => {
        if (!names.has(plugin.uri)) {
          names.set(plugin.uri, getDisplayPluginName(plugin.name, plugin.uri))
        }
      })
    })

    Object.values(pluginMeta).forEach((plugin) => {
      if (!names.has(plugin.uri)) {
        names.set(plugin.uri, getDisplayPluginName(plugin.name, plugin.uri))
      }
    })

    return names
  }, [chains, pluginMeta])

  const getMidiMappingPluginName = useCallback((pluginUri: string | null) => {
    if (!pluginUri) {
      return 'Processor'
    }
    return midiPluginNameByUri.get(pluginUri) ?? fallbackPluginLabel(pluginUri)
  }, [midiPluginNameByUri])

  const getMidiMappingParameterName = useCallback((mapping: MIDIMappingV2) => {
    if (!mapping.target_plugin_uri) {
      return mapping.target_param_symbol ?? `Parameter #${mapping.target_param_index ?? 0}`
    }

    const meta = pluginMeta[mapping.target_plugin_uri]
    const parameter = meta?.parameters?.find((entry) => entry.index === mapping.target_param_index)
    return parameter?.name ?? mapping.target_param_symbol ?? `Parameter #${mapping.target_param_index ?? 0}`
  }, [pluginMeta])

  const handleMidiBlockFocusActivity = useCallback((data: Record<string, unknown>) => {
    if (snapshotEntryRequired) {
      return
    }
    const noteOn = parseMidiActivityNoteOn(data)
    const blockIndex = resolveSnapshotBlockFocusIndex(snapshotBlockFocusRange, noteOn, blockFocusPlugins.length)
    if (blockIndex == null) {
      return
    }

    const plugin = blockFocusPlugins[blockIndex]
    if (!plugin) {
      return
    }

    setSelectedPluginSelection(plugin.uri, plugin.position)
    if (isTabletTouchLayout) {
      setTabletEditorOpen(true)
      return
    }

    setEffectModalOpen(true)
    if (isCompactLayout) {
      setCompactTab('editor')
    }
  }, [
    blockFocusPlugins,
    isCompactLayout,
    isTabletTouchLayout,
    setSelectedPluginSelection,
    snapshotEntryRequired,
    snapshotBlockFocusRange,
  ])

  useEffect(() => {
    if (midiScope === 'selected-plugin' && !selectedPluginUri) {
      setMidiScope(activeFlowChainId !== null ? 'active-chain' : 'all')
      return
    }

    if (midiScope === 'active-chain' && activeFlowChainId === null) {
      setMidiScope('all')
    }
  }, [activeFlowChainId, midiScope, selectedPluginUri])

  useEffect(() => {
    setMidiRangeDrafts((previous) => {
      const next: Record<number, MidiRangeDraft> = {}
      let changed = Object.keys(previous).length !== midiMappings.length

      midiMappings.forEach((mapping) => {
        const sourceMin = formatMidiMappingValue(mapping.min_val)
        const sourceMax = formatMidiMappingValue(mapping.max_val)
        const current = previous[mapping.id]
        const nextDraft: MidiRangeDraft = current
          ? {
              min: current.min === current.sourceMin ? sourceMin : current.min,
              max: current.max === current.sourceMax ? sourceMax : current.max,
              sourceMin,
              sourceMax,
            }
          : {
              min: sourceMin,
              max: sourceMax,
              sourceMin,
              sourceMax,
            }
        next[mapping.id] = nextDraft

        if (!current) {
          changed = true
          return
        }

        if (
          current.min !== nextDraft.min
          || current.max !== nextDraft.max
          || current.sourceMin !== nextDraft.sourceMin
          || current.sourceMax !== nextDraft.sourceMax
        ) {
          changed = true
        }
      })

      return changed ? next : previous
    })
  }, [midiMappings])

  // Primary: WebSocket-driven instant learn completion
  useWebSocketTopic('midi_learn', useCallback((_data: { channel: number; cc: number }, message) => {
    if (message.type === 'midi_learn_completed') {
      setMidiLearnActive(false)
      midiLearnWasInProgressRef.current = false
      void queryClient.invalidateQueries({ queryKey: ['midi'] })
      void queryClient.invalidateQueries({ queryKey: ['midi', 'mappings', 'juce-grid'] })
      pushToast(`MIDI mapped: CC ${_data.cc} Ch ${_data.channel || 'Omni'}`, 'success')
    }
  }, [queryClient, pushToast]))

  // Primary: WebSocket-driven instant MIDI activity (CC knob/fader feedback).
  // Backend payload shape varies per source (data1/data2, raw_hex, etc.) so
  // values are treated as unknown and probed; guards keep the cast off.
  useWebSocketTopic('midi_activity', useCallback((data: Record<string, unknown>) => {
    const msgType = data.message_type ?? data.type
    if (msgType === 'control_change') {
      const rawHex = typeof data.raw_hex === 'string' ? data.raw_hex : ''
      const rawParts = rawHex.split(' ')
      const ccFallback = parseInt(rawParts[1] ?? '0', 16)
      const valueFallback = parseInt(rawParts[2] ?? '0', 16)
      setLastMidiActivityWs({
        cc: typeof data.data1 === 'number' ? data.data1 : ccFallback,
        value: typeof data.data2 === 'number' ? data.data2 : valueFallback,
        channel: typeof data.channel === 'number' ? data.channel : 0,
      })
      return
    }

    handleMidiBlockFocusActivity(data)
  }, [handleMidiBlockFocusActivity]))

  // Fallback: poll-based learn completion (covers missed WebSocket events)
  useEffect(() => {
    const learning = midiLearnStatus?.learning ?? false
    if (midiLearnWasInProgressRef.current && !learning) {
      setMidiLearnActive(false)
      void queryClient.invalidateQueries({ queryKey: ['midi'] })
      void queryClient.invalidateQueries({ queryKey: ['midi', 'mappings', 'juce-grid'] })
    }
    midiLearnWasInProgressRef.current = learning
  }, [midiLearnStatus?.learning, queryClient])

  // Compute available categories
  const categories = useMemo(() => {
    const set = new Set<string>(['all'])
    pluginsQuery.data?.plugins?.forEach((p: Plugin) => {
      if (p.category) set.add(p.category)
    })
    return Array.from(set).sort((a, b) => a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b))
  }, [pluginsQuery.data])

  // Filtered plugins for browser (with category filter)
  const filteredPlugins = useMemo(() => {
    const plugins = pluginsQuery.data?.plugins || []
    return sortPluginsForBrowser(plugins.filter(p => {
      const matchCategory = selectedCategory === 'all' || p.category === selectedCategory
      const matchSearch = !pluginSearchQuery.trim() ||
        p.name.toLowerCase().includes(pluginSearchQuery.toLowerCase()) ||
        p.category?.toLowerCase().includes(pluginSearchQuery.toLowerCase()) ||
        p.author?.toLowerCase().includes(pluginSearchQuery.toLowerCase())
      return matchCategory && matchSearch
    }))
  }, [pluginsQuery.data, pluginSearchQuery, selectedCategory])

  // Separate native JUCE processors from LV2 plugins
  // Filter out hidden plugins based on Special settings
  const { nativeProcessors, lv2Plugins } = useMemo(() => {
    const native: Plugin[] = []
    const lv2: Plugin[] = []
    
    // Get list of hidden plugin URIs from Special settings
    const hiddenPlugins = specialSettings?.hiddenPlugins || []
    const hiddenSet = new Set(hiddenPlugins)

    filteredPlugins.forEach(p => {
      // Check if it's a native JUCE processor (URI starts with map2://)
      if (p.uri.startsWith('map2://')) {
        // Only include if not in hidden list
        if (!hiddenSet.has(p.uri)) {
          native.push(p)
        }
      } else {
        lv2.push(p)
      }
    })

    return { nativeProcessors: native, lv2Plugins: lv2 }
  }, [filteredPlugins, specialSettings])

  const { featuredNativeGroups, remainingNativeProcessors } = useMemo(() => {
    const nativeByUri = new Map(
      nativeProcessors.map((plugin) => [canonicalizePluginUri(plugin.uri), plugin] as const),
    )

    const featuredGroups = FEATURED_NATIVE_BROWSER_GROUPS
      .map((group) => {
        const plugins = group.pluginUris
          .map((pluginUri) => nativeByUri.get(pluginUri))
          .filter((plugin): plugin is Plugin => plugin !== undefined)

        return {
          ...group,
          plugins,
        }
      })
      .filter((group) => group.plugins.length > 0)

    const featuredPluginUris = new Set(
      featuredGroups.flatMap((group) => group.plugins.map((plugin) => canonicalizePluginUri(plugin.uri))),
    )

    const remainingNative = nativeProcessors.filter(
      (plugin) => !featuredPluginUris.has(canonicalizePluginUri(plugin.uri)),
    )

    return {
      featuredNativeGroups: featuredGroups,
      remainingNativeProcessors: remainingNative,
    }
  }, [nativeProcessors])

  // Group LV2 plugins by category for collapsible display
  const groupedPlugins = useMemo(() => {
    const groups: Record<string, Plugin[]> = {}
    const favoritesList: Plugin[] = []

    lv2Plugins.forEach(p => {
      if (favoritePlugins.has(p.uri)) favoritesList.push(p)
      const cat = p.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(p)
    })

    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))

    if (favoritesList.length > 0) {
      return [['Favorites', favoritesList] as [string, Plugin[]], ...sorted]
    }
    return sorted
  }, [lv2Plugins, favoritePlugins])

  const favoriteVisibleCount = useMemo(
    () => filteredPlugins.filter((plugin) => favoritePlugins.has(plugin.uri)).length,
    [filteredPlugins, favoritePlugins],
  )

  // Compute audio interface status
  // Get port routing data
  const portRouting = routingQuery.data
  const portsInfo = portsQuery.data

  const activeFlowChain = useMemo(() => {
    const slot = flowSlots[activeFlowIndex]
    return slot?.chainId !== null ? effectiveChainById.get(slot.chainId) : undefined
  }, [flowSlots, activeFlowIndex, effectiveChainById])

  const avbReadinessState = useMemo(() => {
    const readiness = portsInfo?.avb_readiness
    if (!readiness || typeof readiness !== 'object') {
      return 'unknown'
    }

    const state = (readiness as Record<string, unknown>).state
    return typeof state === 'string' && state.trim() ? state : 'unknown'
  }, [portsInfo?.avb_readiness])

  const audioInterfaceStatus: JuceGridAudioInterfaceStatus = useMemo(() => ({
    deviceName: portsInfo?.device || audioStatus?.engine || 'JACK Audio',
    sampleRate: jackMetrics?.sample_rate || 48000,
    bufferSize: jackMetrics?.buffer_size || 256,
    channels: countAudioBindingChannels(
      portRouting?.input_bindings,
      portRouting?.input_ports?.length || 0,
      portRouting?.input_avb_endpoints?.length || 0,
    ),
    isRunning: audioStatus?.running ?? true,
    selectedPorts: portRouting?.input_ports || [],
    selectedAvbEndpoints: portRouting?.input_avb_endpoints || [],
    totalPorts: portsInfo?.input_count || 2,
    routingMode: routing.mode,
    chainActive: activeFlowChain?.is_active ?? false,
    chainName: activeFlowChain?.name,
    bindings: portRouting?.input_bindings || [],
    avbReadinessState,
    meterLevels: [audioLevels?.input_left || 0, audioLevels?.input_right || 0],
  }), [audioLevels, audioStatus, avbReadinessState, jackMetrics, portRouting, portsInfo, routing.mode, activeFlowChain])

  // Create separate output status with output port info
  const audioOutputStatus: JuceGridAudioInterfaceStatus = useMemo(() => ({
    deviceName: portsInfo?.device || audioStatus?.engine || 'JACK Audio',
    sampleRate: jackMetrics?.sample_rate || 48000,
    bufferSize: jackMetrics?.buffer_size || 256,
    channels: countAudioBindingChannels(
      portRouting?.output_bindings,
      portRouting?.output_ports?.length || 0,
      portRouting?.output_avb_endpoints?.length || 0,
    ),
    isRunning: audioStatus?.running ?? true,
    selectedPorts: portRouting?.output_ports || [],
    selectedAvbEndpoints: portRouting?.output_avb_endpoints || [],
    totalPorts: portsInfo?.output_count || 2,
    routingMode: routing.mode,
    chainActive: activeFlowChain?.is_active ?? false,
    chainName: activeFlowChain?.name,
    bindings: portRouting?.output_bindings || [],
    avbReadinessState,
    meterLevels: [audioLevels?.output_left || 0, audioLevels?.output_right || 0],
  }), [audioLevels, audioStatus, avbReadinessState, jackMetrics, portRouting, portsInfo, routing.mode, activeFlowChain])

  const activeChannelStatusRail = useMemo(() => {
    if (!activeFlow) {
      return null
    }

    const flowState = livePathLayout.flowStates[activeFlow.id]
    const blockCount = currentChain?.plugins.length ?? 0
    const blendPercent = Math.max(0, Math.min(100, Math.round(routing.blendPositions[activeFlow.id] ?? 100)))
    const routingSourceLabel = activeFlowChainId === null
      ? 'No chain routing'
      : activeFlowChainRoutingQuery.isLoading
        ? 'Routing status loading'
        : activeFlowChainRoutingQuery.data?.is_override
          ? 'Channel routing override'
          : 'Shared routing map'

    return {
      channelLabel: activeFlowLabel,
      chainLabel: currentChain ? `Chain ${activeFlowLabel}` : 'No chain assigned',
      blockSummary: currentChain
        ? `${blockCount} loaded ${blockCount === 1 ? 'block' : 'blocks'}`
        : 'No chain assigned',
      blendLabel: `${blendPercent}% blend`,
      routingSourceLabel,
      stateLabel: flowState?.activeAudio ? 'Live' : 'Snapshot',
      muted: activeFlow.muted,
      solo: activeFlow.solo,
      inputClipActive: typeof flowInputClipTimestamps[activeFlow.id] === 'number',
      outputClipActive: typeof flowOutputClipTimestamps[activeFlow.id] === 'number',
      clipActive: typeof flowClipTimestamps[activeFlow.id] === 'number',
    }
  }, [
    activeFlow,
    activeFlowChainId,
    activeFlowChainRoutingQuery.data?.is_override,
    activeFlowChainRoutingQuery.isLoading,
    activeFlowLabel,
    currentChain,
    flowClipTimestamps,
    flowInputClipTimestamps,
    flowOutputClipTimestamps,
    livePathLayout.flowStates,
    routing.blendPositions,
  ])

  const compactRoutingInspectorItems = useMemo(
    () => getJuceGridRoutingInspectorItems(routing.mode, true),
    [routing.mode],
  )

  const routingInspectorContent = useMemo<RoutingInspectorContent | null>(() => {
    if (!routingInspectorId) {
      return null
    }

    const inputRoutes = getAudioRouteLabels(
      portRouting?.input_ports,
      portsInfo?.inputs,
      portRouting?.input_avb_endpoints,
      portsInfo?.avb_talkers,
    )
    const outputRoutes = getAudioRouteLabels(
      portRouting?.output_ports,
      portsInfo?.outputs,
      portRouting?.output_avb_endpoints,
      portsInfo?.avb_listeners,
    )
    const activeFlowLabels = livePathLayout.activeFlowIds.map((flowId) => flowSlots[flowIndexById.get(flowId) ?? -1]?.label ?? flowId)
    const standbyFlowLabels = flowSlots
      .filter((flow) => !livePathLayout.activeFlowIds.includes(flow.id))
      .map((flow) => flow.label)
    const primaryFlowLabel = livePathLayout.primaryFlowId
      ? flowSlots[flowIndexById.get(livePathLayout.primaryFlowId) ?? -1]?.label ?? livePathLayout.primaryFlowId
      : 'None'
    const secondaryFlowLabel = livePathLayout.secondaryFlowId
      ? flowSlots[flowIndexById.get(livePathLayout.secondaryFlowId) ?? -1]?.label ?? livePathLayout.secondaryFlowId
      : 'None'
    const blendDetail = flowSlots
      .filter((flow) => livePathLayout.activeFlowIds.includes(flow.id))
      .map((flow) => `${flow.label} ${Math.round(routing.blendPositions[flow.id] ?? 100)}%`)

    switch (routingInspectorId) {
      case 'input':
        return {
          heading: 'Input routing',
          summary: 'Engine input sources feeding the current live path.',
          tags: [audioInterfaceStatus.isRunning ? 'Running' : 'Stopped', activeRoutingMode.label],
          rows: [
            { label: 'Device', value: audioInterfaceStatus.deviceName || 'Audio interface' },
            { label: 'Source routes', value: formatInspectorList(inputRoutes) },
            { label: 'Active branches', value: formatInspectorList(activeFlowLabels) },
            { label: 'Clocking', value: `${audioInterfaceStatus.sampleRate || 48000} Hz / ${audioInterfaceStatus.bufferSize || 256} smp` },
          ],
        }
      case 'output':
        return {
          heading: 'Output routing',
          summary: 'Current destinations receiving the live Audio Grid signal path.',
          tags: [audioOutputStatus.isRunning ? 'Running' : 'Stopped', activeRoutingMode.label],
          rows: [
            { label: 'Device', value: audioOutputStatus.deviceName || 'Audio interface' },
            { label: 'Destinations', value: formatInspectorList(outputRoutes) },
            { label: 'Live branches', value: formatInspectorList(activeFlowLabels) },
            { label: 'Delivery mode', value: activeRoutingMode.summary },
          ],
        }
      case 'series':
        return {
          heading: 'Series routing',
          summary: 'Flows are processed sequentially from left to right before the output stage.',
          tags: [activeRoutingMode.label, livePathLayout.status === 'available' ? 'Live' : 'Unavailable'],
          rows: [
            { label: 'Ordered path', value: formatInspectorList(activeFlowLabels) },
            { label: 'Bypassed context', value: formatInspectorList(standbyFlowLabels) },
            { label: 'Primary edit focus', value: primaryFlowLabel },
            { label: 'Output destination', value: formatInspectorList(outputRoutes) },
          ],
        }
      case 'split':
        return {
          heading: 'Parallel split',
          summary: 'Input audio is split into simultaneous branches before it is summed back to the output bus.',
          tags: ['Parallel', `${activeFlowLabels.length} live branches`],
          rows: [
            { label: 'Live branches', value: formatInspectorList(activeFlowLabels) },
            { label: 'Branch blend', value: formatInspectorList(blendDetail) },
            { label: 'Dimmed branches', value: formatInspectorList(standbyFlowLabels) },
            { label: 'Input source', value: formatInspectorList(inputRoutes) },
          ],
        }
      case 'mix':
        return {
          heading: 'Parallel mix',
          summary: 'Parallel branches are recombined at the mix bus and delivered to the active output routes.',
          tags: ['Parallel', 'Mix bus'],
          rows: [
            { label: 'Incoming branches', value: formatInspectorList(blendDetail) },
            { label: 'Primary branch', value: primaryFlowLabel },
            { label: 'Output destination', value: formatInspectorList(outputRoutes) },
            { label: 'Routing status', value: livePathLayout.status === 'available' ? 'Mix configured' : 'Configured path unavailable' },
          ],
        }
      case 'ab':
        return {
          heading: 'A/B selector',
          summary: 'One branch is selected while alternate branches remain in standby for immediate recall.',
          tags: ['A/B', livePathLayout.status === 'available' ? 'Configured' : 'Unavailable'],
          rows: [
            { label: 'Selected branch', value: primaryFlowLabel },
            { label: 'Standby branches', value: formatInspectorList(standbyFlowLabels) },
            { label: 'Input source', value: formatInspectorList(inputRoutes) },
            { label: 'Output destination', value: formatInspectorList(outputRoutes) },
          ],
        }
      case 'morph':
        return {
          heading: 'Morph control',
          summary: 'Morph transitions parameters from the source flow to the target flow without pausing the live path.',
          tags: ['Morph', `${Math.round(routing.morphProgress * 100)}%`],
          rows: [
            { label: 'Source flow', value: primaryFlowLabel },
            { label: 'Target flow', value: secondaryFlowLabel },
            { label: 'Morph amount', value: `${Math.round(routing.morphProgress * 100)}%` },
            { label: 'Output destination', value: formatInspectorList(outputRoutes) },
          ],
        }
      case 'key':
        return {
          heading: 'Sidechain key input',
          summary: 'A separate key path drives detector or control behavior without replacing the main audio path.',
          tags: ['Sidechain', 'Key input'],
          rows: [
            { label: 'Key source flow', value: secondaryFlowLabel },
            { label: 'Key source routes', value: formatInspectorList(inputRoutes) },
            { label: 'Controlled branch', value: primaryFlowLabel },
            { label: 'Standby context', value: formatInspectorList(standbyFlowLabels) },
          ],
        }
      case 'sidechain':
        return {
          heading: 'Sidechain routing',
          summary: 'The main audio branch remains live while a dedicated key path modulates its response.',
          tags: ['Sidechain', livePathLayout.status === 'available' ? 'Live' : 'Unavailable'],
          rows: [
            { label: 'Audio branch', value: primaryFlowLabel },
            { label: 'Key branch', value: secondaryFlowLabel },
            { label: 'Audio destination', value: formatInspectorList(outputRoutes) },
            { label: 'Input source', value: formatInspectorList(inputRoutes) },
          ],
        }
      default:
        return null
    }
  }, [
    activeRoutingMode.label,
    activeRoutingMode.summary,
    audioInterfaceStatus.bufferSize,
    audioInterfaceStatus.deviceName,
    audioInterfaceStatus.isRunning,
    audioInterfaceStatus.sampleRate,
    audioOutputStatus.deviceName,
    audioOutputStatus.isRunning,
    flowIndexById,
    flowSlots,
    livePathLayout.activeFlowIds,
    livePathLayout.primaryFlowId,
    livePathLayout.secondaryFlowId,
    livePathLayout.status,
    portRouting?.input_avb_endpoints,
    portRouting?.input_ports,
    portRouting?.output_avb_endpoints,
    portRouting?.output_ports,
    portsInfo?.avb_listeners,
    portsInfo?.avb_talkers,
    portsInfo?.inputs,
    portsInfo?.outputs,
    routing.blendPositions,
    routing.morphProgress,
    routingInspectorId,
  ])

  // ============================================================================
  // Mutations
  // ============================================================================

  const updateChainPluginsCache = useCallback(
    (
      chainId: number,
      updater: (plugins: Chain['plugins']) => Chain['plugins']
    ) => {
      queryClient.setQueryData<ChainsResponse>(['chains'], (current) => {
        if (!current) return current
        return {
          ...current,
          chains: current.chains.map((chain) => (
            chain.id === chainId ? { ...chain, plugins: updater(chain.plugins) } : chain
          )),
        }
      })
    },
    [queryClient]
  )

  const invalidateMidiQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['midi'] })
    void queryClient.invalidateQueries({ queryKey: ['midi', 'mappings', 'juce-grid'] })
  }, [queryClient])

  const replaceSnapshotMidiMapMutation = useMutation({
    mutationFn: async ({
      snapshotId,
      entries,
    }: {
      snapshotId: number
      entries: SnapshotMidiMapEntry[]
    }) => {
      const response = await snapshotsApi.replaceMidiMap(snapshotId, entries)
      return normalizeSnapshotAbSwitchMidiSnapshot(
        normalizeSnapshotFootswitchLabelSnapshot(
          normalizeSnapshotBlockFocusSnapshot(response, entries),
          entries,
        ),
        entries,
      )
    },
    onSuccess: (snapshot) => {
      syncSnapshotDetailCaches(snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot MIDI map updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot MIDI map', 'error')
    },
  })

  const updateSnapshotExpressionMappingsMutation = useMutation({
    mutationFn: async ({
      snapshotId,
      mappings,
    }: {
      snapshotId: number
      mappings: SnapshotExpressionMapping[]
    }) => {
      const response = await snapshotsApi.update(snapshotId, {
        controls: {
          expression_mappings: mappings,
        },
      })
      return normalizeSnapshotExpressionMappingsSnapshot(response.snapshot, mappings)
    },
    onSuccess: (snapshot) => {
      syncSnapshotDetailCaches(snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot expression mappings updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot expression mappings', 'error')
    },
  })

  const updateMidiMappingMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<MIDIMappingV2> }) =>
      midiApiV2.updateMapping(id, updates),
    onSuccess: () => {
      invalidateMidiQueries()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update MIDI mapping', 'error')
    },
  })

  const deleteMidiMappingMutation = useMutation({
    mutationFn: (id: number) => midiApiV2.deleteMapping(id),
    onSuccess: () => {
      invalidateMidiQueries()
      pushToast('MIDI mapping deleted', 'info')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to delete MIDI mapping', 'error')
    },
  })

  const startMidiLearnMutation = useMutation({
    mutationFn: (params: {
      chain_id: number
      plugin_uri: string
      param_symbol: string
      param_index: number
      min_val?: number
      max_val?: number
    }) => midiApiV2.startLearn(params),
    onSuccess: () => {
      invalidateMidiQueries()
    },
    onError: (error) => {
      setMidiLearnActive(false)
      pushToast(error instanceof Error ? error.message : 'Failed to start MIDI learn', 'error')
    },
  })

  const stopMidiLearnMutation = useMutation({
    mutationFn: () => midiApiV2.stopLearn(),
    onSuccess: () => {
      setMidiLearnActive(false)
      invalidateMidiQueries()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to stop MIDI learn', 'error')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: ({
      chainId,
      pluginOrder,
    }: {
      chainId: number
      pluginOrder: PluginOrderRef[]
      undoRedoDraft?: SnapshotDraftData
      undoRedoDescription?: string
    }): Promise<SnapshotDetail | { status: string; chain_id: number; plugins: PluginOrderRef[] }> => {
      if (activeSnapshot?.id != null) {
        const identity = requireSnapshotPluginOrderIds(chainId, pluginOrder)
        return snapshotsApi.reorderPlugins(
          activeSnapshot.id,
          identity.snapshotChainId,
          identity.snapshotPluginIds,
        )
      }
      return chainsApi.reorderPlugins(chainId, pluginOrder)
    },
    onSuccess: (data, variables) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      } else {
        queryClient.invalidateQueries({ queryKey: ['chains'] })
      }
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      if (variables.undoRedoDraft) {
        recordSnapshotUndoRedoStep(
          variables.undoRedoDraft,
          variables.undoRedoDescription ?? 'Reorder blocks',
        )
        return
      }
      markSnapshotsDirty()
    },
    onError: (error) => pushToast(`Failed to reorder: ${error}`, 'error'),
    onSettled: () => {
      setReorderPreview(null)
    },
  })

  const bypassMutation = useMutation({
    mutationFn: ({
      chainId,
      pluginUri,
      bypass,
      pluginPosition,
    }: {
      chainId: number
      pluginUri: string
      bypass: boolean
      pluginPosition?: number
      undoRedoDraft?: SnapshotDraftData
      undoRedoDescription?: string
    }): Promise<SnapshotDetail | { status: string; chain_id: number; plugin: string; bypass: boolean }> => {
      if (activeSnapshot?.id != null) {
        const identity = requireSnapshotPluginId(chainId, pluginUri, pluginPosition)
        return snapshotsApi.setPluginBypass(
          activeSnapshot.id,
          identity.snapshotChainId,
          identity.snapshotPluginId,
          bypass,
        )
      }
      return chainsApi.togglePluginBypass(chainId, pluginUri, bypass, pluginPosition)
    },
    onSuccess: (data, variables) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      } else {
        queryClient.invalidateQueries({ queryKey: ['chains'] })
      }
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      if (variables.undoRedoDraft) {
        recordSnapshotUndoRedoStep(
          variables.undoRedoDraft,
          variables.undoRedoDescription ?? (variables.bypass ? 'Bypass block' : 'Enable block'),
        )
        return
      }
      markSnapshotsDirty()
    },
    onError: (error) => pushToast(`Failed to toggle bypass: ${error}`, 'error'),
  })

  type PluginMutationContext = {
    previousChains?: ChainsResponse
    previousSelectedPluginUri: string | null
    previousSelectedPluginPosition: number | null
  }

  type AddPluginMutationContext = PluginMutationContext & {
    previousShowPluginBrowser: boolean
    previousPluginSearchQuery: string
  }

  type ChainActivationMutationContext = {
    previousChains?: ChainsResponse
    previousCommittedAudioState?: AuthoritativeAudioStateEnvelope
    previousAuthorityActiveSnapshot?: SnapshotDetail | null
  }

  type AuthorityLiveChainMutationVariables = {
    nextActiveChainIds: number[]
    nextCommittedState: AuthoritativeAudioStateEnvelope['value']
    request: ReturnType<typeof buildAuthorityLivePathSelectionUpdate>['request']
    pruneChainIds: number[]
    successMessage: string
    successKind: 'success' | 'info'
    errorMessage: string
    markDirty?: boolean
  }

  const deleteMutation = useMutation<
    SnapshotDetail | { status: string; chain_id: number },
    Error,
    {
      chainId,
      pluginUri,
      pluginPosition,
      undoRedoDraft?: SnapshotDraftData
      undoRedoDescription?: string
    },
    PluginMutationContext
  >({
    mutationFn: ({
      chainId,
      pluginUri,
      pluginPosition,
    }: {
      chainId: number
      pluginUri: string
      pluginPosition?: number
      undoRedoDraft?: SnapshotDraftData
      undoRedoDescription?: string
    }): Promise<SnapshotDetail | { status: string; chain_id: number }> => {
      if (activeSnapshot?.id != null) {
        const identity = requireSnapshotPluginId(chainId, pluginUri, pluginPosition)
        return snapshotsApi.removePlugin(
          activeSnapshot.id,
          identity.snapshotChainId,
          identity.snapshotPluginId,
        )
      }
      return chainsApi.removePlugin(chainId, pluginUri, pluginPosition)
    },
    onMutate: async (variables): Promise<PluginMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousSelectedPluginUri = selectedPluginUri
      const previousSelectedPluginPosition = selectedPluginPosition

      updateChainPluginsCache(variables.chainId, (plugins) => {
        if (typeof variables.pluginPosition !== 'number') {
          return plugins.filter((plugin) => plugin.uri !== variables.pluginUri)
        }
        return plugins.filter(
          (plugin) => !(plugin.uri === variables.pluginUri && plugin.position === variables.pluginPosition)
        )
      })
      if (
        selectedPluginUri === variables.pluginUri
        && (
          typeof variables.pluginPosition !== 'number'
          || selectedPluginPosition === variables.pluginPosition
        )
      ) {
        setSelectedPluginSelection(null)
      }

      return {
        previousChains,
        previousSelectedPluginUri,
        previousSelectedPluginPosition,
      }
    },
    onSuccess: (data, variables) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      }
      if (variables.undoRedoDraft) {
        recordSnapshotUndoRedoStep(
          variables.undoRedoDraft,
          variables.undoRedoDescription ?? 'Remove block',
        )
      }
      pushToast('Plugin removed', 'success')
    },
    onError: (error, variables, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      setSelectedPluginSelection(
        context?.previousSelectedPluginUri ?? null,
        context?.previousSelectedPluginPosition ?? null,
      )
      pushToast(`Failed to remove: ${error}`, 'error')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
    },
  })

  const addPluginMutation = useMutation<
    SnapshotDetail | { status: string; chain_id: number; plugin: string; plugins_count: number; plugin_position?: number },
    Error,
    {
      chainId,
      pluginUri,
      undoRedoDraft?: SnapshotDraftData
      undoRedoDescription?: string
    },
    AddPluginMutationContext
  >({
    mutationFn: ({
      chainId,
      pluginUri,
    }: {
      chainId: number
      pluginUri: string
      undoRedoDraft?: SnapshotDraftData
      undoRedoDescription?: string
    }): Promise<SnapshotDetail | { status: string; chain_id: number; plugin: string; plugins_count: number; plugin_position?: number }> => {
      if (activeSnapshot?.id != null) {
        const snapshotChainId = requireSnapshotChainId(chainId)
        const meta = pluginMeta[pluginUri]
        return snapshotsApi.addPlugin(activeSnapshot.id, snapshotChainId, {
          plugin_uri: pluginUri,
          plugin_name: meta?.name,
          loader_state: {},
        })
      }
      return chainsApi.addPlugin(chainId, pluginUri)
    },
    onMutate: async (variables): Promise<AddPluginMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousSelectedPluginUri = selectedPluginUri
      const previousSelectedPluginPosition = selectedPluginPosition
      const previousShowPluginBrowser = showPluginBrowser
      const previousPluginSearchQuery = pluginSearchQuery
      const meta = pluginMeta[variables.pluginUri]

      updateChainPluginsCache(variables.chainId, (plugins) => {
        const nextPosition = plugins.reduce(
          (maxPosition, plugin) => Math.max(maxPosition, plugin.position ?? -1),
          -1,
        ) + 1

        const nextPlugin: Chain['plugins'][number] = {
          uri: variables.pluginUri,
          name: meta?.name ?? variables.pluginUri,
          position: nextPosition,
          bypassed: false,
          parameters: {},
          in_ports: meta?.in_ports,
          out_ports: meta?.out_ports,
          format: meta?.format,
        }

        return [...plugins, nextPlugin].sort((a, b) => a.position - b.position)
      })
      setShowPluginBrowser(false)
      setPluginSearchQuery('')
      return {
        previousChains,
        previousSelectedPluginUri,
        previousSelectedPluginPosition,
        previousShowPluginBrowser,
        previousPluginSearchQuery,
      }
    },
    onSuccess: (data, variables) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      }
      if (variables.undoRedoDraft) {
        recordSnapshotUndoRedoStep(
          variables.undoRedoDraft,
          variables.undoRedoDescription ?? 'Add block',
        )
      }
      pushToast('Plugin added', 'success')
    },
    onError: (error, variables, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      setSelectedPluginSelection(
        context?.previousSelectedPluginUri ?? null,
        context?.previousSelectedPluginPosition ?? null,
      )
      setShowPluginBrowser(context?.previousShowPluginBrowser ?? false)
      setPluginSearchQuery(context?.previousPluginSearchQuery ?? '')
      pushToast(`Failed to add: ${error}`, 'error')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
    },
  })

  const updateAuthorityLiveChainsMutation = useMutation({
    mutationFn: (variables: AuthorityLiveChainMutationVariables) => audioStateApi.putDesired(variables.request),
    onMutate: async (variables): Promise<ChainActivationMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      await queryClient.cancelQueries({ queryKey: ['audio-state', 'committed'] })
      await cancelControlPlaneSnapshotCaches()
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousCommittedAudioState = queryClient.getQueryData<AuthoritativeAudioStateEnvelope>(['audio-state', 'committed'])
      const previousAuthorityActiveSnapshot = authoritySnapshotId != null
        ? queryClient.getQueryData<SnapshotDetail | null>(['snapshots', 'detail', 'authority-active', authoritySnapshotId])
        : undefined
      queryClient.setQueryData<ChainsResponse>(['chains'], (current) => (
        applyOptimisticJuceGridLiveChainSet(current, variables.nextActiveChainIds)
      ))
      if (previousCommittedAudioState) {
        queryClient.setQueryData<AuthoritativeAudioStateEnvelope>(['audio-state', 'committed'], {
          ...previousCommittedAudioState,
          value: variables.nextCommittedState,
        })
      }
      pruneLiveSnapshotCache(variables.pruneChainIds)
      return { previousChains, previousCommittedAudioState, previousAuthorityActiveSnapshot }
    },
    onSuccess: (response, variables) => {
      queryClient.setQueryData(['audio-state', 'committed'], response)
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      invalidateControlPlaneSnapshotCaches({ includeDesired: true })
      if (variables.markDirty) {
        markSnapshotsDirty()
      }
      pushToast(variables.successMessage, variables.successKind)
    },
    onError: (error, variables, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      if (context?.previousCommittedAudioState) {
        queryClient.setQueryData(['audio-state', 'committed'], context.previousCommittedAudioState)
      }
      if (authoritySnapshotId != null && context?.previousAuthorityActiveSnapshot !== undefined) {
        restoreAuthorityAwareLiveSnapshot(queryClient, context.previousAuthorityActiveSnapshot, authoritySnapshotId)
      }
      const message = error instanceof Error ? error.message : variables.errorMessage
      pushToast(message, 'error')
    },
  })

  const undoMutation = useMutation({
    mutationFn: async () => {
      const draft = snapshotUndoRedo.undo()
      if (!draft) {
        throw new Error('Nothing to undo')
      }
      return applySnapshotDraftPreview(draft)
    },
    onSuccess: () => {
      pushToast('Undo successful', 'success')
    },
    onError: (error) => {
      snapshotUndoRedo.redo()
      pushToast(`Undo failed: ${error}`, 'error')
    },
  })

  const redoMutation = useMutation({
    mutationFn: async () => {
      const draft = snapshotUndoRedo.redo()
      if (!draft) {
        throw new Error('Nothing to redo')
      }
      return applySnapshotDraftPreview(draft)
    },
    onSuccess: () => {
      pushToast('Redo successful', 'success')
    },
    onError: (error) => {
      snapshotUndoRedo.undo()
      pushToast(`Redo failed: ${error}`, 'error')
    },
  })

  const savePresetMutation = useMutation({
    mutationFn: ({ chainId, name }: { chainId: number; name: string }) => chainsApi.savePreset(chainId, name),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
      setShowSavePresetModal(false)
      setSavePresetName('')
      pushToast(`Preset "${variables.name}" saved`, 'success')
    },
    onError: (error) => pushToast(`Failed to save: ${error}`, 'error'),
  })

  const loadPresetMutation = useMutation({
    mutationFn: (presetId: number) => chainsApi.loadPreset(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setShowPresetBrowser(false)
      pushToast('Preset loaded', 'success')
    },
    onError: (error) => pushToast(`Failed to load preset: ${error}`, 'error'),
  })

  const deletePresetMutation = useMutation({
    mutationFn: (presetId: number) => chainsApi.deletePreset(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
      setPresetPendingDelete(null)
      pushToast('Preset deleted', 'success')
    },
    onError: (error) => pushToast(`Failed to delete preset: ${error}`, 'error'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ chainId, name }: { chainId: number; name: string }): Promise<SnapshotDetail | { status: string; chain_id: number; name: string }> =>
      activeSnapshot?.id != null
        ? snapshotsApi.renameChain(activeSnapshot.id, requireSnapshotChainId(chainId), name)
        : chainsApi.rename(chainId, name),
    onSuccess: (data) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      }
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
      setShowRenameChainModal(false)
      setRenameChainName('')
      pushToast('Chain renamed', 'success')
    },
    onError: (error) => pushToast(`Failed to rename: ${error}`, 'error'),
  })

  // ============================================================================
  // Handlers
  // ============================================================================

  // Flow management
  const addFlow = useCallback(async () => {
    if (snapshotEditorMutationDisabled || flowSlots.length >= MAX_FLOWS) return

    const nextIndex = flowSlots.length
    const colorConfig = getFlowCardPaletteEntry(nextIndex)
      const chainName = buildTraceableChannelChainName(activeSnapshot?.name ?? null, colorConfig.label)
      const beforeDraft = captureCurrentState()

      try {
      const newChain = await createEditorChain(chainName)
      const newSlot: FlowSlot = {
        id: `flow-${Date.now()}`,
        chainId: newChain.id,
        label: colorConfig.label,
        color: colorConfig.color,
        muted: false,
        solo: false,
        dryWetMix: 100,
      }

      queryClient.setQueryData<ChainsResponse>(['chains'], (current) => {
        if (!current) {
          return current
        }
        const alreadyPresent = current.chains.some((chain) => chain.id === newChain.id)
        if (alreadyPresent) {
          return current
        }
        return {
          ...current,
          chains: [...current.chains, newChain],
          count: current.count + 1,
        }
      })

      const nextDraft = cloneSnapshotDraftData(beforeDraft)
      nextDraft.flowSlots.push(newSlot)
      nextDraft.routing.seriesOrder = [...nextDraft.routing.seriesOrder, newSlot.id]
      setEditorSnapshotState(nextDraft)
      recordSnapshotUndoRedoStep(nextDraft, `Add channel ${colorConfig.label}`)
      pushToast(`Channel ${colorConfig.label} created with ${chainName}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['chains'] })
    } catch (error) {
      pushToast(`Failed to add channel: ${error}`, 'error')
    }
  }, [
    activeSnapshot?.name,
    captureCurrentState,
    createEditorChain,
    flowSlots.length,
    pushToast,
    queryClient,
    recordSnapshotUndoRedoStep,
    setEditorSnapshotState,
    snapshotEditorMutationDisabled,
  ])

  const removeFlow = useCallback((flowId: string) => {
    if (snapshotEditorMutationDisabled || flowSlots.length <= MIN_FLOWS) return
    const beforeDraft = captureCurrentState()
    const removedIndex = beforeDraft.flowSlots.findIndex((flow) => flow.id === flowId)
    if (removedIndex < 0) {
      return
    }
    const nextDraft = cloneSnapshotDraftData(beforeDraft)
    nextDraft.flowSlots = nextDraft.flowSlots.filter((flow) => flow.id !== flowId)
    nextDraft.routing.seriesOrder = nextDraft.routing.seriesOrder.filter((id) => id !== flowId)
    if (nextDraft.activeFlowIndex >= removedIndex && nextDraft.activeFlowIndex > 0) {
      nextDraft.activeFlowIndex -= 1
    }
    setEditorSnapshotState(nextDraft)
    recordSnapshotUndoRedoStep(nextDraft, 'Remove channel')
  }, [captureCurrentState, flowSlots.length, recordSnapshotUndoRedoStep, setEditorSnapshotState, snapshotEditorMutationDisabled])

  const clearFlows = useCallback(() => {
    if (snapshotEditorMutationDisabled) {
      return
    }
    // Reset to a single flow (Flow A) with no chain assigned
    const initialSlot: FlowSlot = {
      id: `flow-${Date.now()}`,
      chainId: null,
      label: SLOT_COLORS[0].label,
      color: SLOT_COLORS[0].color,
      muted: false,
      solo: false,
      dryWetMix: 100,
    }
    const nextDraft = {
      ...captureCurrentState(),
      flowSlots: [initialSlot],
      activeFlowIndex: 0,
      routing: {
        ...routing,
        activeSlotId: initialSlot.id,
        seriesOrder: [initialSlot.id],
        blendPositions: { [initialSlot.id]: 100 },
      },
    }
    setEditorSnapshotState(nextDraft)
    recordSnapshotUndoRedoStep(nextDraft, 'Clear channels')
    pushToast('Flows cleared', 'info')
  }, [captureCurrentState, pushToast, recordSnapshotUndoRedoStep, routing, setEditorSnapshotState, snapshotEditorMutationDisabled])

  const handleDeletePresetRequest = useCallback((preset: Snapshot) => {
    setPresetPendingDelete(preset)
  }, [])

  const confirmDeletePreset = useCallback(() => {
    if (!presetPendingDelete) {
      return
    }
    deletePresetMutation.mutate(presetPendingDelete.id)
  }, [deletePresetMutation, presetPendingDelete])

  const confirmClearFlows = useCallback(() => {
    clearFlows()
    setShowClearFlowsModal(false)
  }, [clearFlows])

  const updateFlow = useCallback((flowId: string, updates: Partial<FlowSlot>) => {
    if (snapshotEditorMutationDisabled) {
      return
    }
    const beforeDraft = captureCurrentState()
    const nextDraft = cloneSnapshotDraftData(beforeDraft)
    const flowUpdate = applyFlowSlotUpdate(nextDraft.flowSlots, flowId, updates)
    nextDraft.flowSlots = flowUpdate.nextFlowSlots
    const changed = flowUpdate.changed
    if (!changed) {
      return
    }
    setEditorSnapshotState(nextDraft)
    recordSnapshotUndoRedoStep(nextDraft, describeFlowUpdate(updates))
  }, [captureCurrentState, recordSnapshotUndoRedoStep, setEditorSnapshotState, snapshotEditorMutationDisabled])

  const selectFlowIndex = useCallback((index: number) => {
    if (snapshotEntryRequired) {
      return
    }
    const slot = flowSlots[index]
    if (!slot) {
      return
    }

    setActiveFlowIndex(index)
    setFocusedBranchId(slot.id)
    if (isTabletTouchLayout) {
      setExpandedTabletBranchId(slot.id)
    }
    setRouting((previous) => {
      if (previous.activeSlotId === slot.id) {
        return previous
      }
      return {
        ...previous,
        activeSlotId: slot.id,
      }
    })
  }, [flowSlots, isTabletTouchLayout, snapshotEntryRequired])

  const closeAssignmentDialog = useCallback(() => {
    setAssignmentDialogOpen(false)
    setSelectedFlowForAssignment(null)
    setAssignmentSelectedNodeId('')
    setAssignmentRedundancyEnabled(false)
    setIsAssigningFlow(false)
  }, [])

  const openAssignmentDialog = useCallback((flow: FlowSlot) => {
    if (snapshotEditorMutationDisabled) {
      return
    }
    setSelectedFlowForAssignment(flow)
    setAssignmentSelectedNodeId('')
    setAssignmentRedundancyEnabled(false)
    setAssignmentDialogOpen(true)
  }, [snapshotEditorMutationDisabled])

  const handleAssignFlow = useCallback(async (nodeId: string, redundancyEnabled: boolean) => {
    if (snapshotEditorMutationDisabled) return
    if (!selectedFlowForAssignment) return
    if (!selectedFlowForAssignment.chainId) {
      pushToast('Assign a chain to this flow first', 'error')
      return
    }

    try {
      setIsAssigningFlow(true)
      const res = await fetch(`${API_BASE}/cluster/flows/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow_id: selectedFlowForAssignment.id,
          node_id: nodeId,
          chain_id: selectedFlowForAssignment.chainId,
          redundancy_enabled: redundancyEnabled,
        }),
      })

      if (!res.ok) {
        throw new Error('Assignment failed')
      }

      pushToast('Flow assigned successfully', 'success')
      closeAssignmentDialog()
      queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
    } catch (error) {
      pushToast('Failed to assign flow', 'error')
    } finally {
      setIsAssigningFlow(false)
    }
  }, [selectedFlowForAssignment, closeAssignmentDialog, pushToast, queryClient, snapshotEditorMutationDisabled])

  const { queueLiveRoutingDraftUpdate, toggleAbSwitch } = useSnapshotEditorRoutingHandlers({
    activeSnapshot,
    isAuthorityLiveSnapshot,
    abSwitchEnabled,
    abSwitchAlternateFlow,
    snapshotEditorMutationDisabled,
    captureCurrentState,
    setEditorSnapshotState,
    recordSnapshotUndoRedoStep,
    setRoutingLiveApplyState,
    updateLiveSnapshotRoutingMutation,
  })

  // Plugin operations
  const openSelectedBlockEditor = useCallback(() => {
    if (snapshotEntryRequired) {
      return
    }
    if (isTabletTouchLayout) {
      setTabletEditorOpen(true)
      return
    }

    setEffectModalOpen(true)
    if (isCompactLayout) {
      setCompactTab('editor')
    }
  }, [isCompactLayout, isTabletTouchLayout, snapshotEntryRequired])

  const focusSelectedPluginEditor = useCallback((
    uri: string,
    position: number,
    options?: { openOnTablet?: boolean },
  ) => {
    setSelectedPluginSelection(uri, position)
    if (isTabletTouchLayout && !options?.openOnTablet) {
      return
    }
    openSelectedBlockEditor()
  }, [isTabletTouchLayout, openSelectedBlockEditor, setSelectedPluginSelection])

  const handlePluginSelect = useCallback((uri: string, position: number) => {
    if (snapshotEntryRequired) {
      return
    }
    if (!isTabletTouchLayout && selectedPluginUri === uri && selectedPluginPosition === position && effectModalOpen) {
      setEffectModalOpen(false)
      return
    }

    focusSelectedPluginEditor(uri, position, { openOnTablet: false })
  }, [
    effectModalOpen,
    focusSelectedPluginEditor,
    isTabletTouchLayout,
    selectedPluginPosition,
    selectedPluginUri,
    snapshotEntryRequired,
  ])

  const handleCloseEffectModal = useCallback(() => {
    if (isTabletTouchLayout) {
      setTabletEditorOpen(false)
      return
    }
    setEffectModalOpen(false)
  }, [isTabletTouchLayout])

  const handleFlowSlotKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, index: number) => {
    if (snapshotEntryRequired) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectFlowIndex(index)
    }
  }, [selectFlowIndex, snapshotEntryRequired])

  const handleToggleBypass = useCallback((uri: string, bypassed: boolean, position: number) => {
    if (snapshotEditorMutationDisabled) return
    if (!currentChain) return
    const nextDraft = updateDraftChain(
      cloneSnapshotDraftData(captureCurrentState()),
      currentChain.id,
      (chain) => ({
        ...chain,
        plugins: chain.plugins.map((plugin) => (
          plugin.uri === uri && plugin.position === position
            ? { ...plugin, bypass: bypassed }
            : plugin
        )),
      }),
    )
    bypassMutation.mutate({
      chainId: currentChain.id,
      pluginUri: uri,
      bypass: bypassed,
      pluginPosition: position,
      undoRedoDraft: nextDraft,
      undoRedoDescription: bypassed ? 'Bypass block' : 'Enable block',
    })
  }, [captureCurrentState, currentChain, bypassMutation, snapshotEditorMutationDisabled])

  const handleDeletePlugin = useCallback((uri: string, position?: number) => {
    if (snapshotEditorMutationDisabled) return
    if (!currentChain) return
    const targetPlugin = currentChain.plugins.find((plugin) => (
      plugin.uri === uri
      && (typeof position !== 'number' || plugin.position === position)
    ))
    if (targetPlugin && isSystemNoiseGatePlugin(targetPlugin)) {
      pushToast('The system noise gate stays locked at the head of the chain', 'warn')
      return
    }
    const nextDraft = updateDraftChain(
      cloneSnapshotDraftData(captureCurrentState()),
      currentChain.id,
      (chain) => resequenceChainSnapshotPlugins({
        ...chain,
        plugins: chain.plugins.filter((plugin) => !(
          plugin.uri === uri
          && (typeof position !== 'number' || plugin.position === position)
        )),
      }),
    )
    deleteMutation.mutate({
      chainId: currentChain.id,
      pluginUri: uri,
      pluginPosition: position,
      undoRedoDraft: nextDraft,
      undoRedoDescription: 'Remove block',
    })
  }, [captureCurrentState, currentChain, deleteMutation, pushToast, snapshotEditorMutationDisabled])

  const createCapturedSnapshot = useCallback((options?: {
    openPluginBrowser?: boolean
    focusSnapshotName?: boolean
  }) => {
    const snapshotName = buildCapturedSnapshotName(existingSnapshotNames)
    const sourceDraft = snapshotEntryRequired
      ? (options?.openPluginBrowser
        ? createBlankSnapshotEditorAddEffectDraft(
          buildTraceableChannelChainName(snapshotName, SLOT_COLORS[0]?.label ?? 'A'),
          FLOW_SLOT_NORMALIZATION_OPTIONS,
        )
        : createBlankSnapshotEditorDraft())
      : currentSnapshotDraft
    createSnapshotFromEditorMutation.mutate({
      snapshotName,
      sourceDraft,
      openPluginBrowser: options?.openPluginBrowser ?? false,
      focusSnapshotName: options?.focusSnapshotName ?? !options?.openPluginBrowser,
    })
  }, [
    createSnapshotFromEditorMutation,
    currentSnapshotDraft,
    existingSnapshotNames,
    snapshotEntryRequired,
  ])

  const handleTabletCanvasEmptyPress = useCallback((flowId: string) => {
    if (!isTabletTouchLayout) {
      return
    }

    setFocusedBranchId(flowId)
    setSelectedPluginSelection(null)
    setTabletEditorOpen(false)
  }, [isTabletTouchLayout, setSelectedPluginSelection])

  const handleTabletBranchPageChange = useCallback((flowId: string, nextPage: number) => {
    setBranchPageByFlowId((previous) => {
      const currentPage = previous[flowId] ?? 0
      const clampedPage = Math.max(0, nextPage)
      if (currentPage === clampedPage) {
        return previous
      }
      return {
        ...previous,
        [flowId]: clampedPage,
      }
    })
  }, [])

  const stepTabletFocusedBranchPage = useCallback((direction: ReorderDirection) => {
    if (!tabletFocusedFlow) {
      return
    }

    setBranchPageByFlowId((previous) => {
      const currentPage = previous[tabletFocusedFlow.id] ?? 0
      const maxPage = Math.max(0, tabletFocusedBranchPageCount - 1)
      const nextPage = Math.max(0, Math.min(maxPage, currentPage + (direction === 'left' ? -1 : 1)))
      if (currentPage === nextPage) {
        return previous
      }
      return {
        ...previous,
        [tabletFocusedFlow.id]: nextPage,
      }
    })
  }, [tabletFocusedBranchPageCount, tabletFocusedFlow])

  const handleTabletAddEffect = useCallback(() => {
    if (snapshotEntryRequired) {
      createCapturedSnapshot({ openPluginBrowser: true, focusSnapshotName: false })
      return
    }
    if (snapshotEditingLocked) {
      return
    }
    if (!tabletFocusedFlow || tabletFocusedFlowIndex < 0) {
      return
    }

    selectFlowIndex(tabletFocusedFlowIndex)
    setFocusedBranchId(tabletFocusedFlow.id)
    setTabletEditorOpen(false)
    setShowPluginBrowser(true)
  }, [createCapturedSnapshot, selectFlowIndex, snapshotEditingLocked, snapshotEntryRequired, tabletFocusedFlow, tabletFocusedFlowIndex])

  const handleToggleTabletBranchDetails = useCallback((index: number, flowId: string) => {
    if (snapshotEntryRequired) {
      return
    }
    selectFlowIndex(index)
    setFocusedBranchId(flowId)
    setExpandedTabletBranchId((current) => current === flowId ? null : flowId)
  }, [selectFlowIndex, snapshotEntryRequired])

  const confirmTabletDeleteSelectedPlugin = useCallback(() => {
    if (!pendingTabletDeletePlugin) {
      return
    }

    handleDeletePlugin(pendingTabletDeletePlugin.uri, pendingTabletDeletePlugin.position)
    setPendingTabletDeletePlugin(null)
    setTabletEditorOpen(false)
  }, [handleDeletePlugin, pendingTabletDeletePlugin])

  const handleReorderPlugins = useCallback((pluginOrder: PluginOrderRef[]) => {
    if (snapshotEditorMutationDisabled) return
    if (!currentChain) return
    const reorderedPlugins = pluginOrder.reduce<ChainSnapshot['plugins']>((accumulator, ref, index) => {
        const match = currentChain.plugins.find((plugin) => (
          plugin.uri === ref.uri
          && plugin.position === ref.position
        ))
        if (!match) {
          return accumulator
        }
        accumulator.push({
          uri: match.uri,
          position: index,
          bypass: match.bypassed || false,
          parameters: match.parameters || {},
          loader_state: match.loader_state,
        })
        return accumulator
      }, [])
    const nextDraft = updateDraftChain(
      cloneSnapshotDraftData(captureCurrentState()),
      currentChain.id,
      (chain) => ({
        ...chain,
        plugins: reorderedPlugins,
      }),
    )
    reorderMutation.mutate({
      chainId: currentChain.id,
      pluginOrder,
      undoRedoDraft: nextDraft,
      undoRedoDescription: 'Reorder blocks',
    })
  }, [captureCurrentState, currentChain, reorderMutation, snapshotEditorMutationDisabled])

  const moveSelectedPlugin = useCallback((direction: ReorderDirection) => {
    if (snapshotEditorMutationDisabled) {
      return
    }
    if (!currentChain || !selectedPluginUri) {
      return
    }

    const plugins = [...currentChain.plugins]
    const currentIndex = plugins.findIndex((plugin) => (
      plugin.uri === selectedPluginUri
      && (typeof selectedPluginPosition !== 'number' || plugin.position === selectedPluginPosition)
    ))
    if (currentIndex < 0) {
      return
    }
    if (isSystemNoiseGatePlugin(plugins[currentIndex])) {
      pushToast('The system noise gate stays locked at the head of the chain', 'warn')
      return
    }

    const delta = direction === 'left' ? -1 : 1
    const targetIndex = currentIndex + delta
    if (targetIndex < 0 || targetIndex >= plugins.length) {
      return
    }

    const targetPlugin = plugins[targetIndex]
    if (isSystemNoiseGatePlugin(targetPlugin)) {
      pushToast('No block can move ahead of the system noise gate', 'warn')
      return
    }
    const [movedPlugin] = plugins.splice(currentIndex, 1)
    plugins.splice(targetIndex, 0, movedPlugin)

    setReorderPreview({
      pluginUri: movedPlugin.uri,
      pluginPosition: movedPlugin.position,
      targetUri: targetPlugin.uri,
      targetPosition: targetPlugin.position,
      direction,
    })
    const nextDraft = updateDraftChain(
      cloneSnapshotDraftData(captureCurrentState()),
      currentChain.id,
      (chain) => ({
        ...chain,
        plugins: plugins.map((plugin, index) => ({
          uri: plugin.uri,
          position: index,
          bypass: plugin.bypassed || false,
          parameters: plugin.parameters || {},
          loader_state: plugin.loader_state,
        })),
      }),
    )
    reorderMutation.mutate({
      chainId: currentChain.id,
      pluginOrder: plugins.map((plugin) => buildPluginOrderRef(plugin)),
      undoRedoDraft: nextDraft,
      undoRedoDescription: `Move block ${direction === 'left' ? 'left' : 'right'}`,
    })
  }, [captureCurrentState, currentChain, pushToast, reorderMutation, selectedPluginPosition, selectedPluginUri, snapshotEditorMutationDisabled])

  const handleAddPlugin = useCallback(() => {
    if (snapshotEntryRequired) {
      createCapturedSnapshot({ openPluginBrowser: true, focusSnapshotName: false })
      return
    }
    if (snapshotEditingLocked) {
      pushToast('Snapshot is locked — unlock it before adding blocks.', 'warn')
      return
    }
    setShowPluginBrowser(true)
  }, [createCapturedSnapshot, pushToast, setShowPluginBrowser, snapshotEditingLocked, snapshotEntryRequired])

  const handleAddPluginToCurrentChain = useCallback(async (pluginUri: string) => {
    if (snapshotEditorMutationDisabled) {
      return
    }

    let targetChain = currentChain
    const baseDraft = cloneSnapshotDraftData(captureCurrentState())

    if (!targetChain) {
      if (!activeFlow) {
        pushToast('Select a signal path before adding a block', 'warn')
        return
      }

      const bootstrapChainName = buildTraceableChannelChainName(activeSnapshot?.name ?? null, activeFlowLabel)

      try {
        const newChain = await createEditorChain(bootstrapChainName)
        targetChain = newChain
        queryClient.setQueryData<ChainsResponse>(['chains'], (current) => {
          if (!current) {
            return current
          }
          const alreadyPresent = current.chains.some((chain) => chain.id === newChain.id)
          if (alreadyPresent) {
            return current
          }
          return {
            ...current,
            chains: [...current.chains, newChain],
            count: current.count + 1,
          }
        })
        queryClient.invalidateQueries({ queryKey: ['chains'] })
        baseDraft.chains[String(newChain.id)] = {
          name: newChain.name,
          plugins: [],
        }
        const flowUpdate = applyFlowSlotUpdate(baseDraft.flowSlots, activeFlow.id, { chainId: newChain.id })
        baseDraft.flowSlots = flowUpdate.nextFlowSlots
        setEditorSnapshotState(baseDraft)
      } catch (error) {
        pushToast(`Failed to create chain: ${error}`, 'error')
        return
      }
    }

    if (!targetChain) {
      return
    }

    if (!baseDraft.chains[String(targetChain.id)]) {
      baseDraft.chains[String(targetChain.id)] = {
        name: targetChain.name,
        plugins: [],
      }
    }

    const nextDraft = updateDraftChain(
      baseDraft,
      targetChain.id,
      (chain) => ({
        ...chain,
        plugins: [
          ...chain.plugins,
          {
            uri: pluginUri,
            position: chain.plugins.length,
            bypass: false,
            parameters: {},
            loader_state: {},
          },
        ],
      }),
    )
    addPluginMutation.mutate({
      chainId: targetChain.id,
      pluginUri,
      undoRedoDraft: nextDraft,
      undoRedoDescription: 'Add block',
    })
  }, [
    activeFlow,
    activeFlowLabel,
    activeSnapshot?.name,
    captureCurrentState,
    currentChain,
    addPluginMutation,
    createEditorChain,
    pushToast,
    queryClient,
    setEditorSnapshotState,
    snapshotEditorMutationDisabled,
  ])

  const handleAddPluginDirect = useCallback((uri: string) => {
    if (snapshotEditorMutationDisabled) return
    if (!currentChain) return
    const nextDraft = updateDraftChain(
      cloneSnapshotDraftData(captureCurrentState()),
      currentChain.id,
      (chain) => ({
        ...chain,
        plugins: [
          ...chain.plugins,
          {
            uri,
            position: chain.plugins.length,
            bypass: false,
            parameters: {},
            loader_state: {},
          },
        ],
      }),
    )
    addPluginMutation.mutate({
      chainId: currentChain.id,
      pluginUri: uri,
      undoRedoDraft: nextDraft,
      undoRedoDescription: 'Add block',
    })
  }, [captureCurrentState, currentChain, addPluginMutation, snapshotEditorMutationDisabled])

  const handleMidiLearnToggle = useCallback(() => {
    if (midiLearnInProgress) {
      stopMidiLearnMutation.mutate()
      return
    }

    if (midiLearnActive) {
      setMidiLearnActive(false)
      return
    }

    if (!selectedPlugin || !selectedPluginMeta || !currentChain) {
      pushToast('Select a block before arming MIDI learn', 'warn')
      return
    }

    setMidiLearnActive(true)
    pushToast('MIDI learn armed. Touch a block parameter to bind the next controller message.', 'info')
  }, [
    currentChain,
    midiLearnActive,
    midiLearnInProgress,
    pushToast,
    selectedPlugin,
    selectedPluginMeta,
    stopMidiLearnMutation,
  ])

  const handleStartSelectedBlockMidiLearn = useCallback((parameter: PluginParameter) => {
    if (!currentChain || !selectedPlugin) {
      pushToast('Select a block before starting MIDI learn', 'warn')
      return
    }
    if (startMidiLearnMutation.isPending) {
      return
    }

    setMidiLearnActive(false)
    pushToast(`Learning ${parameter.name}... move your controller now`, 'info')
    startMidiLearnMutation.mutate({
      chain_id: currentChain.id,
      plugin_uri: selectedPlugin.uri,
      param_symbol: parameter.symbol,
      param_index: parameter.index,
      min_val: parameter.min,
      max_val: parameter.max,
    })
  }, [currentChain, pushToast, selectedPlugin, startMidiLearnMutation])

  const handleStopSelectedBlockMidiLearn = useCallback(() => {
    stopMidiLearnMutation.mutate()
  }, [stopMidiLearnMutation])

  const updateMidiMappingRangeDraft = useCallback((mappingId: number, field: 'min' | 'max', value: string) => {
    setMidiRangeDrafts((previous) => ({
      ...previous,
      [mappingId]: {
        sourceMin: previous[mappingId]?.sourceMin ?? '',
        sourceMax: previous[mappingId]?.sourceMax ?? '',
        min: field === 'min' ? value : previous[mappingId]?.min ?? '',
        max: field === 'max' ? value : previous[mappingId]?.max ?? '',
      },
    }))
  }, [])

  const commitMidiMappingRange = useCallback((mapping: MIDIMappingV2) => {
    const draft = midiRangeDrafts[mapping.id]
    if (!draft) {
      return
    }

    const nextMin = parseMidiMappingValue(draft.min, mapping.min_val)
    const nextMax = parseMidiMappingValue(draft.max, mapping.max_val)
    const hasChanged = nextMin !== mapping.min_val || nextMax !== mapping.max_val

    setMidiRangeDrafts((previous) => ({
      ...previous,
      [mapping.id]: {
        min: formatMidiMappingValue(nextMin),
        max: formatMidiMappingValue(nextMax),
        sourceMin: formatMidiMappingValue(nextMin),
        sourceMax: formatMidiMappingValue(nextMax),
      },
    }))

    if (!hasChanged) {
      return
    }

    updateMidiMappingMutation.mutate({
      id: mapping.id,
      updates: {
        min_val: nextMin,
        max_val: nextMax,
      },
    })
  }, [midiRangeDrafts, updateMidiMappingMutation])

  // Parameter handling
  const handleParameterChange = useCallback((symbol: string, value: number) => {
    if (snapshotEditorMutationDisabled) return
    if (!selectedPluginMeta || !selectedPluginUri) return
    const paramIndex = selectedPluginMeta.parameters.findIndex((p) => p.symbol === symbol)
    if (paramIndex === -1) return

    if (midiLearnActive) {
      if (!currentChain || !selectedPlugin) {
        setMidiLearnActive(false)
        pushToast('Select a block before starting MIDI learn', 'warn')
        return
      }

      if (startMidiLearnMutation.isPending || midiLearnInProgress) {
        return
      }

      const parameterMeta = selectedPluginMeta.parameters[paramIndex]
      pushToast(`Learning ${parameterMeta.name}… move a MIDI controller`, 'info')
      startMidiLearnMutation.mutate({
        chain_id: currentChain.id,
        plugin_uri: selectedPlugin.uri,
        param_symbol: parameterMeta.symbol,
        param_index: parameterMeta.index,
        min_val: parameterMeta.min,
        max_val: parameterMeta.max,
      })
      return
    }

    if (!pendingParameterUndoStartRef.current) {
      pendingParameterUndoStartRef.current = cloneSnapshotDraftData(captureCurrentState())
      pendingParameterUndoDescriptionRef.current = `Adjust ${selectedPluginMeta.parameters[paramIndex]?.name ?? symbol}`
      pendingParameterUndoNextRef.current = pendingParameterUndoStartRef.current
    }

    if (currentChain && selectedPlugin) {
      const baseDraft = pendingParameterUndoNextRef.current
        ?? pendingParameterUndoStartRef.current
        ?? captureCurrentState()
      pendingParameterUndoNextRef.current = updateDraftChain(
        cloneSnapshotDraftData(baseDraft),
        currentChain.id,
        (chain) => ({
          ...chain,
          plugins: chain.plugins.map((plugin) => (
            plugin.uri === selectedPlugin.uri && plugin.position === selectedPlugin.position
              ? {
                ...plugin,
                parameters: {
                  ...plugin.parameters,
                  [symbol]: value,
                },
              }
              : plugin
          )),
        }),
      )
    }

    pluginsApi.setParameterBatched(
      selectedPluginUri,
      paramIndex,
      value,
      selectedPlugin.instance_id,
      selectedPlugin.position,
    )
  }, [
    captureCurrentState,
    currentChain,
    midiLearnActive,
    midiLearnInProgress,
    pendingParameterUndoNextRef,
    pendingParameterUndoStartRef,
    pendingParameterUndoDescriptionRef,
    pushToast,
    selectedPlugin,
    selectedPluginMeta,
    selectedPluginPosition,
    selectedPluginUri,
    snapshotEditorMutationDisabled,
    startMidiLearnMutation,
  ])

  const handleParameterChangeEnd = useCallback(() => {
    if (snapshotEditorMutationDisabled) return
    pluginsApi.flushParameterBatch()
    queryClient.invalidateQueries({ queryKey: ['chains'] })
    const beforeDraft = pendingParameterUndoStartRef.current
    const nextDraft = pendingParameterUndoNextRef.current
    if (beforeDraft && nextDraft && !snapshotDraftsEqual(beforeDraft, nextDraft)) {
      recordSnapshotUndoRedoStep(
        nextDraft,
        pendingParameterUndoDescriptionRef.current ?? 'Adjust parameter',
      )
    } else {
      markSnapshotsDirty()
    }
    pendingParameterUndoStartRef.current = null
    pendingParameterUndoNextRef.current = null
    pendingParameterUndoDescriptionRef.current = null
  }, [markSnapshotsDirty, queryClient, recordSnapshotUndoRedoStep, snapshotEditorMutationDisabled])

  const handleSelectedPluginLoaderStateChange = useCallback((patch: Partial<PluginLoaderState>) => {
    if (snapshotEditorMutationDisabled) {
      return
    }
    if (!selectedPlugin || !currentChain) {
      return
    }

    const currentLoaderState = selectedPlugin.loader_state ?? {}
    const nextLoaderState = {
      ...currentLoaderState,
      ...patch,
    }
    const loaderStateChanged = Object.entries(patch).some(([key, value]) => (
      currentLoaderState[key as keyof PluginLoaderState] !== value
    ))
    const bypassChanged = typeof patch.bypass === 'boolean' && selectedPlugin.bypassed !== patch.bypass
    if (!loaderStateChanged && !bypassChanged) {
      return
    }

    const nextDraft = updateDraftChain(
      cloneSnapshotDraftData(captureCurrentState()),
      currentChain.id,
      (chain) => ({
        ...chain,
        plugins: chain.plugins.map((plugin) => (
          plugin.uri === selectedPlugin.uri && plugin.position === selectedPlugin.position
            ? {
              ...plugin,
              bypass: typeof patch.bypass === 'boolean' ? patch.bypass : plugin.bypass,
              loader_state: nextLoaderState,
            }
            : plugin
        )),
      }),
    )
    setEditorSnapshotState(nextDraft)
    recordSnapshotUndoRedoStep(nextDraft, describeLoaderStateDraftChange(selectedPlugin.uri))
  }, [
    captureCurrentState,
    currentChain,
    recordSnapshotUndoRedoStep,
    selectedPlugin,
    setEditorSnapshotState,
    snapshotEditorMutationDisabled,
  ])

  const handleToggleSelectedBypass = useCallback(() => {
    if (snapshotEditorMutationDisabled) return
    if (!selectedPlugin || !currentChain) return
    handleToggleBypass(selectedPlugin.uri, !selectedPlugin.bypassed, selectedPlugin.position)
  }, [currentChain, handleToggleBypass, selectedPlugin, snapshotEditorMutationDisabled])

  // Refresh plugins discovery (force refresh to pick up newly installed plugins)
  const handleRefreshPlugins = useCallback(async () => {
    setIsRefreshingPlugins(true)
    try {
      // Call API with refresh=true to bypass backend cache
      await pluginsApi.discover(true)
      // Invalidate React Query cache to refetch
      await queryClient.invalidateQueries({ queryKey: ['plugins', 'discover'] })
      pushToast('Plugin list refreshed', 'success')
    } catch (err) {
      console.error('Failed to refresh plugins:', err)
      pushToast('Failed to refresh plugins', 'error')
    } finally {
      setIsRefreshingPlugins(false)
    }
  }, [queryClient, pushToast])

  const orderChainIdsAgainstEditor = useCallback((chainIds: Iterable<number>) => {
    const remainingChainIds = new Set(chainIds)
    const orderedChainIds: number[] = []

    desiredLiveChainIds.forEach((chainId) => {
      if (!remainingChainIds.has(chainId)) {
        return
      }
      remainingChainIds.delete(chainId)
      orderedChainIds.push(chainId)
    })

    remainingChainIds.forEach((chainId) => {
      orderedChainIds.push(chainId)
    })

    return orderedChainIds
  }, [desiredLiveChainIds])

  const submitAuthorityLiveChainSelection = useCallback((params: {
    nextActiveChainIds: number[]
    pruneChainIds?: number[]
    requestedBy: string
    successMessage: string
    successKind: 'success' | 'info'
    errorMessage: string
    markDirty?: boolean
  }) => {
    try {
      const update = buildAuthorityLivePathSelectionUpdate({
        authoritativeAudioState: committedAudioState,
        authoritySnapshotPaths: controlPlaneSnapshot?.paths ?? null,
        nextActiveChainIds: params.nextActiveChainIds,
        requestedBy: params.requestedBy,
      })
      updateAuthorityLiveChainsMutation.mutate({
        nextActiveChainIds: params.nextActiveChainIds,
        nextCommittedState: update.nextCommittedState,
        request: update.request,
        pruneChainIds: params.pruneChainIds ?? [],
        successMessage: params.successMessage,
        successKind: params.successKind,
        errorMessage: params.errorMessage,
        markDirty: params.markDirty,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : params.errorMessage
      pushToast(message, 'error')
    }
  }, [
    committedAudioState,
    controlPlaneSnapshot?.paths,
    pushToast,
    updateAuthorityLiveChainsMutation,
  ])

  // Chain operations
  const handleUpdateLiveChains = useCallback(() => {
    if (!liveChainMismatch) {
      pushToast('Live chains already match the editor', 'info')
      return
    }
    submitAuthorityLiveChainSelection({
      nextActiveChainIds: desiredLiveChainIds,
      pruneChainIds: authorityLiveChainIds.filter((chainId) => !desiredLiveChainIds.includes(chainId)),
      requestedBy: 'snapshot_editor_live_paths',
      successMessage: 'Live chains updated from the editor',
      successKind: 'success',
      errorMessage: 'Failed to update live chains',
    })
  }, [authorityLiveChainIds, desiredLiveChainIds, liveChainMismatch, pushToast, submitAuthorityLiveChainSelection])

  const handleRevertEditorToLive = useCallback(() => {
    if (liveChainProjectionOverflow) {
      pushToast('Live chain count exceeds the editor flow capacity', 'warn')
      return
    }

    const revertedState = buildJuceGridRevertedStateFromLiveProjection(
      liveChainProjection,
      flowSlots,
      routing,
      activeFlowIndex,
      SLOT_COLORS,
      MAX_FLOWS,
    )
    setFlowSlots(revertedState.flowSlots)
    setRouting(revertedState.routing)
    setActiveFlowIndex(revertedState.activeFlowIndex)
    markSnapshotsDirty()
    pushToast('Editor reverted to backend live truth', 'success')
  }, [
    activeFlowIndex,
    flowSlots,
    liveChainProjection,
    liveChainProjectionOverflow,
    markSnapshotsDirty,
    pushToast,
    routing,
  ])

  const handleKillLiveChain = useCallback((chainId: number) => {
    const killedChainName = chains.find((chain) => chain.id === chainId)?.name
    submitAuthorityLiveChainSelection({
      nextActiveChainIds: orderChainIdsAgainstEditor(authorityLiveChainIds.filter((currentChainId) => currentChainId !== chainId)),
      pruneChainIds: [chainId],
      requestedBy: 'snapshot_editor_kill_live_path',
      successMessage: killedChainName ? `Killed live path: ${killedChainName}` : 'Killed live path',
      successKind: 'info',
      errorMessage: 'Failed to kill live path',
      markDirty: true,
    })
  }, [authorityLiveChainIds, chains, orderChainIdsAgainstEditor, submitAuthorityLiveChainSelection])

  const handleToggleChainActive = useCallback(() => {
    if (snapshotEditorMutationDisabled) return
    if (!currentChain) return
    const nextActiveChainIds = currentChainAuthorityActive
      ? orderChainIdsAgainstEditor(authorityLiveChainIds.filter((chainId) => chainId !== currentChain.id))
      : orderChainIdsAgainstEditor([...authorityLiveChainIds, currentChain.id])
    submitAuthorityLiveChainSelection({
      nextActiveChainIds,
      pruneChainIds: currentChainAuthorityActive ? [currentChain.id] : [],
      requestedBy: 'snapshot_editor_toggle_live_path',
      successMessage: currentChainAuthorityActive ? 'Chain deactivated' : 'Chain activated',
      successKind: currentChainAuthorityActive ? 'info' : 'success',
      errorMessage: currentChainAuthorityActive ? 'Failed to deactivate chain' : 'Failed to activate chain',
      markDirty: true,
    })
  }, [
    authorityLiveChainIds,
    currentChain,
    currentChainAuthorityActive,
    orderChainIdsAgainstEditor,
    snapshotEditorMutationDisabled,
    submitAuthorityLiveChainSelection,
  ])

  const handleSavePreset = useCallback(() => {
    if (!currentChain) return
    setSavePresetName(`${currentChain.name} Preset`)
    setShowSavePresetModal(true)
  }, [currentChain])

  const submitSavePreset = useCallback(() => {
    const normalizedName = savePresetName.trim()
    if (!currentChain || !normalizedName) {
      return
    }
    savePresetMutation.mutate({ chainId: currentChain.id, name: normalizedName })
  }, [currentChain, savePresetName, savePresetMutation])

  const handleDuplicateChain = useCallback(() => {
    if (snapshotEditorMutationDisabled) return
    if (!currentChain) return
    const newName = buildTraceableChannelChainName(activeSnapshot?.name ?? null, activeFlowLabel)
    createEditorChain(newName)
      .then((newChain) => {
        queryClient.setQueryData<ChainsResponse>(['chains'], (current) => {
          if (!current) return current
          const alreadyPresent = current.chains.some((chain) => chain.id === newChain.id)
          if (alreadyPresent) return current
          return {
            ...current,
            chains: [...current.chains, newChain],
            count: current.count + 1,
          }
        })
        queryClient.invalidateQueries({ queryKey: ['chains'] })
        markSnapshotsDirty()
        pushToast(`Chain "${newName}" created`, 'success')
      })
      .catch((error) => pushToast(`Failed to duplicate: ${error}`, 'error'))
  }, [activeFlowLabel, activeSnapshot?.name, createEditorChain, currentChain, queryClient, pushToast, markSnapshotsDirty, snapshotEditorMutationDisabled])

  const handleRenameChain = useCallback(() => {
    if (snapshotEditorMutationDisabled) return
    if (!currentChain) return
    setRenameChainName(currentChain.name)
    setShowRenameChainModal(true)
  }, [currentChain, snapshotEditorMutationDisabled])

  const handleRenameSnapshot = useCallback(() => {
    if (!activeSnapshot) {
      return
    }
    setRenameSnapshotName(activeSnapshot.name)
    setEditingSnapshotName(true)
  }, [activeSnapshot])

  const cancelRenameSnapshot = useCallback(() => {
    setEditingSnapshotName(false)
    setRenameSnapshotName(activeSnapshot?.name ?? '')
  }, [activeSnapshot?.name])

  const handleChainRemoved = useCallback((chainId: number) => {
    const nextDraft = cloneSnapshotDraftData(captureCurrentState())
    nextDraft.flowSlots = nextDraft.flowSlots.map((slot) => (
      slot.chainId === chainId
        ? { ...slot, chainId: null }
        : slot
    ))
    setEditorSnapshotState(nextDraft)

    if (currentChain && currentChain.id === chainId) {
      setSelectedPluginSelection(null)
    }
    recordSnapshotUndoRedoStep(nextDraft, 'Detach channel from chain')
  }, [captureCurrentState, currentChain, recordSnapshotUndoRedoStep, setEditorSnapshotState, setSelectedPluginSelection])

  const submitRenameChain = useCallback(() => {
    const normalizedName = renameChainName.trim()
    if (!currentChain || !normalizedName) {
      setShowRenameChainModal(false)
      return
    }
    renameMutation.mutate({ chainId: currentChain.id, name: normalizedName })
  }, [currentChain, renameChainName, renameMutation])

  const submitRenameSnapshot = useCallback(() => {
    const normalizedName = normalizeSnapshotName(renameSnapshotName)
    if (
      !activeSnapshot
      || !normalizedName
      || normalizedName === normalizeSnapshotName(activeSnapshot.name)
      || renameSnapshotError
    ) {
      return
    }
    renameActiveSnapshotMutation.mutate({ snapshotId: activeSnapshot.id, name: normalizedName })
  }, [activeSnapshot, renameSnapshotError, renameSnapshotName, renameActiveSnapshotMutation])

  const submitSnapshotProgram = useCallback(() => {
    if (!activeSnapshot || snapshotEditingLocked || updateActiveSnapshotProgramMutation.isPending) {
      return
    }
    const trimmedValue = snapshotProgramValue.trim()
    const programNumber = trimmedValue === '' ? null : Number(trimmedValue)
    if (
      programNumber !== null
      && (!Number.isFinite(programNumber) || programNumber < 0 || programNumber > 127)
    ) {
      pushToast('MIDI program must be between 0 and 127', 'error')
      return
    }
    updateActiveSnapshotProgramMutation.mutate({
      snapshotId: activeSnapshot.id,
      programNumber: programNumber === null ? null : Math.floor(programNumber),
    })
  }, [
    activeSnapshot,
    pushToast,
    snapshotEditingLocked,
    snapshotProgramValue,
    updateActiveSnapshotProgramMutation,
  ])

  const saveSnapshotBlockFocusRange = useCallback(() => {
    if (!activeSnapshot || blockFocusSaveDisabled) {
      return
    }

    const nextRange = {
      midiChannel: blockFocusMidiChannelDraft === 'omni' ? null : Number.parseInt(blockFocusMidiChannelDraft, 10),
      startNote: blockFocusStartNote,
    }

    replaceSnapshotMidiMapMutation.mutate({
      snapshotId: activeSnapshot.id,
      entries: replaceSnapshotBlockFocusRange(snapshotMidiEntries, nextRange),
    })
  }, [
    activeSnapshot,
    blockFocusMidiChannelDraft,
    blockFocusSaveDisabled,
    blockFocusStartNote,
    replaceSnapshotMidiMapMutation,
    snapshotMidiEntries,
  ])

  const saveSnapshotAbSwitchMidiBinding = useCallback(() => {
    if (!activeSnapshot || abSwitchMidiSaveDisabled) {
      return
    }

    replaceSnapshotMidiMapMutation.mutate({
      snapshotId: activeSnapshot.id,
      entries: replaceSnapshotAbSwitchMidiBinding(snapshotMidiEntries, {
        messageType: abSwitchMidiMessageTypeDraft,
        midiChannel: abSwitchMidiChannelDraft === 'omni' ? null : Number.parseInt(abSwitchMidiChannelDraft, 10),
        number: abSwitchMidiNumberDraft,
      }),
    })
  }, [
    abSwitchMidiChannelDraft,
    abSwitchMidiMessageTypeDraft,
    abSwitchMidiNumberDraft,
    abSwitchMidiSaveDisabled,
    activeSnapshot,
    replaceSnapshotMidiMapMutation,
    snapshotMidiEntries,
  ])

  const clearSnapshotAbSwitchMidiBinding = useCallback(() => {
    if (!activeSnapshot) {
      return
    }

    replaceSnapshotMidiMapMutation.mutate({
      snapshotId: activeSnapshot.id,
      entries: replaceSnapshotAbSwitchMidiBinding(snapshotMidiEntries, null),
    })
  }, [activeSnapshot, replaceSnapshotMidiMapMutation, snapshotMidiEntries])

  const clearSnapshotBlockFocusRange = useCallback(() => {
    if (!activeSnapshot) {
      return
    }

    replaceSnapshotMidiMapMutation.mutate({
      snapshotId: activeSnapshot.id,
      entries: replaceSnapshotBlockFocusRange(snapshotMidiEntries, null),
    })
  }, [activeSnapshot, replaceSnapshotMidiMapMutation, snapshotMidiEntries])

  const updateFootswitchLabelDraft = useCallback((switchNumber: number, value: string) => {
    setFootswitchLabelDrafts((current) => ({
      ...current,
      [String(switchNumber)]: sanitizeFootswitchLabel(value),
    }))
  }, [])

  const saveSnapshotFootswitchLabels = useCallback(() => {
    if (!activeSnapshot || footswitchLabelsSaveDisabled) {
      return
    }

    replaceSnapshotMidiMapMutation.mutate({
      snapshotId: activeSnapshot.id,
      entries: replaceSnapshotFootswitchLabelMap(snapshotMidiEntries, footswitchLabelDrafts),
    })
  }, [
    activeSnapshot,
    footswitchLabelDrafts,
    footswitchLabelsSaveDisabled,
    replaceSnapshotMidiMapMutation,
    snapshotMidiEntries,
  ])

  const clearSnapshotFootswitchLabels = useCallback(() => {
    if (!activeSnapshot) {
      return
    }

    const emptyDrafts = createEmptyFootswitchLabelDrafts()
    setFootswitchLabelDrafts(emptyDrafts)
    replaceSnapshotMidiMapMutation.mutate({
      snapshotId: activeSnapshot.id,
      entries: replaceSnapshotFootswitchLabelMap(snapshotMidiEntries, emptyDrafts),
    })
  }, [activeSnapshot, replaceSnapshotMidiMapMutation, snapshotMidiEntries])

  const saveSnapshotExpressionMappings = useCallback((mappings: SnapshotExpressionMapping[]) => {
    if (!activeSnapshot || snapshotEditingLocked) {
      return
    }

    updateSnapshotExpressionMappingsMutation.mutate({
      snapshotId: activeSnapshot.id,
      mappings: normalizeSnapshotExpressionMappings(mappings),
    })
  }, [activeSnapshot, snapshotEditingLocked, updateSnapshotExpressionMappingsMutation])

  const clearSnapshotExpressionMappings = useCallback(() => {
    if (!activeSnapshot) {
      return
    }

    updateSnapshotExpressionMappingsMutation.mutate({
      snapshotId: activeSnapshot.id,
      mappings: [],
    })
  }, [activeSnapshot, updateSnapshotExpressionMappingsMutation])

  // Favorites handling
  const toggleFavorite = useCallback((uri: string) => {
    setFavoritePlugins(prev => {
      const next = new Set(prev)
      if (next.has(uri)) {
        next.delete(uri)
        pushToast('Removed from favorites', 'info')
      } else {
        next.add(uri)
        pushToast('Added to favorites', 'success')
      }
      return next
    })
  }, [pushToast])

  const collapseAllCategories = useCallback(() => {
    setCollapsedCategories(new Set(groupedPlugins.map(([name]) => name)))
  }, [groupedPlugins])

  const expandAllCategories = useCallback(() => {
    setCollapsedCategories(new Set())
  }, [])

  // Wet/dry mix handler for per-plugin mixing
  const handleWetDryChange = useCallback((uri: string, value: number) => {
    setWetDryMixes(prev => ({ ...prev, [uri]: value }))
  }, [])

  // Show plugin details
  const handleShowDetails = useCallback((plugin: Plugin) => {
    setDetailsPlugin(plugin)
  }, [])

  const midiMappingCount = midiMappings.length
  const midiMappingCountLabel = midiMappingCount > 99 ? '99+' : String(midiMappingCount)
  const snapshotWorkspaceTitle = snapshotCount > 0
    ? `${snapshotCountLabel} saved snapshots`
    : 'Open snapshots workspace'
  const snapshotSetlistModeTitle = snapshotSetlistMode
    ? 'Setlist mode is active: Back and Forward follow favorite snapshots in gig order.'
    : 'Program mode is active: Back and Forward follow all snapshots by MIDI program number.'
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const toggleSnapshotSetlistMode = useCallback(async () => {
    setSnapshotSetlistModePending(true)
    try {
      await updateSpecialSettings({ snapshotSetlistMode: !snapshotSetlistMode })
      pushToast(snapshotSetlistMode ? 'Setlist mode disabled' : 'Setlist mode enabled', 'success')
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to update setlist mode', 'error')
    } finally {
      setSnapshotSetlistModePending(false)
    }
  }, [pushToast, snapshotSetlistMode, updateSpecialSettings])
  const snapshotNavigationPending = openEditorSnapshotMutation.isPending
  const snapshotSwitchBlockedReason = snapshotsDirty
    ? 'Publish or discard the live changes on this snapshot before switching.'
    : undefined
  usePendingLiveChangesNavigationGuard({
    when: snapshotsDirty,
    message: LIVE_CHANGES_LEAVE_MESSAGE,
    allowNavigation: (nextLocation) => isSnapshotFlowRoute(nextLocation.pathname, activeSnapshot?.id),
  })
  const previousSnapshotDisabledReason = !activeSnapshot
    ? 'No previous snapshot'
    : snapshotSwitchBlockedReason
      ? snapshotSwitchBlockedReason
    : activeSnapshotSequenceIndex === -1
      ? (snapshotSetlistMode ? 'Current snapshot is not in the setlist.' : 'No previous snapshot')
      : (previousEditorSnapshot ? undefined : 'No previous snapshot')
  const nextSnapshotDisabledReason = !activeSnapshot
    ? 'No next snapshot'
    : snapshotSwitchBlockedReason
      ? snapshotSwitchBlockedReason
    : activeSnapshotSequenceIndex === -1
      ? (snapshotSetlistMode ? 'Current snapshot is not in the setlist.' : 'No next snapshot')
      : (nextEditorSnapshot ? undefined : 'No next snapshot')
  const loadEditorSnapshot = useCallback((snapshot: SnapshotSummary | null) => {
    if (!snapshot) {
      return
    }
    if (snapshotsDirty) {
      pushToast('Publish or discard live changes before switching snapshots.', 'warn')
      return
    }
    openEditorSnapshotMutation.mutate(snapshot.id)
  }, [openEditorSnapshotMutation, pushToast, snapshotsDirty])
  const goToPreviousSnapshot = useCallback(() => {
    loadEditorSnapshot(previousEditorSnapshot)
  }, [loadEditorSnapshot, previousEditorSnapshot])
  const goToNextSnapshot = useCallback(() => {
    loadEditorSnapshot(nextEditorSnapshot)
  }, [loadEditorSnapshot, nextEditorSnapshot])
  const handleSaveDraft = useCallback(() => {
    if (!activeSnapshot || snapshotEditingLocked || updateActiveSnapshotMutation.isPending) {
      return
    }

    updateActiveSnapshotMutation.mutate()
  }, [activeSnapshot, snapshotEditingLocked, updateActiveSnapshotMutation])
  const handleGoLive = useCallback(async () => {
    if (!activeSnapshot || snapshotGoLiveState.disabled || snapshotGoLiveState.phase === 'live') {
      return
    }
    // T2451: refuse to publish while the audio interface is disconnected —
    // otherwise the activation would succeed and the user would hear silence.
    if (deviceDisconnected) {
      pushToast('Audio interface disconnected — reconnect before going live.', 'error')
      return
    }

    try {
      let snapshotId = activeSnapshot.id
      if (snapshotsDirty) {
        const updated = await updateActiveSnapshotMutation.mutateAsync()
        snapshotId = updated.snapshot.id
      }

      // T2454 slice 1C: warm-state gate per locked Q4=D. If the target is
      // pinned but cold, fire `preloadNow()` synchronously before activation
      // so Go Live takes the warm path. Non-pinned snapshots still flow
      // through the existing cold rebuild path — pins are the only thing we
      // promise sub-20ms recall on. The actual warm-path delta activation in
      // the FSM is T2454-B; today this just guarantees the engine has the
      // plugin instances staged before the cold rebuild starts, shaving the
      // plugin-load portion off the critical path.
      const gateAction = decidePreloadGate({
        isPinned: snapshotPreloadStatus.isPinned(snapshotId),
        isWarm: snapshotPreloadStatus.isWarm(snapshotId),
      })
      if (gateAction === 'warm-then-activate') {
        try {
          await snapshotPreloadStatus.preloadNow(snapshotId)
        } catch (warmError) {
          // Don't block the operator on a warm failure — the cold path is
          // always available. Surface the failure for diagnostics but
          // continue to activation.
          pushToast(
            warmError instanceof Error
              ? `Preload warm failed (${warmError.message}); falling back to cold activation.`
              : 'Preload warm failed; falling back to cold activation.',
            'warn',
          )
        }
      }

      activateCurrentSnapshotMutation.mutate(snapshotId)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to save draft before live activation', 'error')
    }
  }, [
    activateCurrentSnapshotMutation,
    activeSnapshot,
    deviceDisconnected,
    pushToast,
    snapshotGoLiveState.disabled,
    snapshotGoLiveState.phase,
    snapshotsDirty,
    updateActiveSnapshotMutation,
    snapshotPreloadStatus,
  ])
  const openSnapshotProgressModal = useCallback((
    tab: 'wizard' | 'guided' | 'advanced' = 'wizard',
    section: 'overview' | 'routing' | 'devices' | 'runtime' | 'cleanup' = 'overview',
  ) => {
    if (!activeSnapshot?.id) {
      pushToast('Load or create a snapshot before opening the publish workspace.', 'error')
      return
    }
    const params = new URLSearchParams()
    params.set('mode', tab === 'guided' ? 'wizard' : tab)
    params.set('section', section)
    navigate(`/snapshots/${activeSnapshot.id}/publish?${params.toString()}`)
  }, [activeSnapshot?.id, navigate, pushToast])
  const openAudioRoutingWorkspace = useCallback(() => {
    captureWorkspaceModalLauncher()
    setShowProgressModal(false)
    setShowAudioNodesModal(true)
  }, [captureWorkspaceModalLauncher])
  const openSnapshotIoWorkspace = useCallback(() => {
    openSnapshotProgressModal('advanced', 'devices')
  }, [openSnapshotProgressModal])
  const openMidiMappingsWorkspace = useCallback(() => {
    captureWorkspaceModalLauncher()
    setShowProgressModal(false)
    setMidiModalOpen(true)
  }, [captureWorkspaceModalLauncher])
  const openLiveRuntimeWorkspace = useCallback(() => {
    captureWorkspaceModalLauncher()
    setShowProgressModal(false)
    setShowLiveRuntimeModal(true)
  }, [captureWorkspaceModalLauncher])
  const openPerformWorkspace = useCallback(() => {
    captureWorkspaceModalLauncher()
    setShowProgressModal(false)
    setShowPerformModal(true)
  }, [captureWorkspaceModalLauncher])
  const openVersionHistoryWorkspace = useCallback(() => {
    captureWorkspaceModalLauncher()
    setShowVersionHistoryModal(true)
  }, [captureWorkspaceModalLauncher])
  const openControlCenter = useCallback(() => {
    openSnapshotProgressModal('advanced', 'overview')
  }, [openSnapshotProgressModal])
  const openSignalGridWorkspace = useCallback(() => {
    signalFlowShellRef.current?.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
    signalFlowShellRef.current?.focus({ preventScroll: true })
  }, [prefersReducedMotion])
  const openAutomationWorkspace = useCallback(() => {
    setAutomationTimelineExpanded(true)
  }, [])
  const openKeyboardHelpWorkspace = useCallback(() => {
    setShowKeyboardHelp(true)
  }, [])
  const openGuidedProgress = useCallback(() => {
    openSnapshotProgressModal('wizard', 'overview')
  }, [openSnapshotProgressModal])
  const goLiveFixActions = useMemo(() => {
    if (!goLiveFailureDetail?.repairActions.length) {
      return []
    }

    const actions: Array<{ id: string; label: string; detail: string; onSelect: () => void }> = []
    const seen = new Set<string>()

    goLiveFailureDetail.repairActions.forEach((repairAction) => {
      let destination:
        | { id: string; label: string; detail: string; onSelect: () => void }
        | null = null

      if (repairAction.action === 'select_available_device') {
        destination = {
          id: 'audio-devices',
          label: 'Choose audio devices',
          detail: repairAction.message,
          onSelect: openSnapshotIoWorkspace,
        }
      } else if (repairAction.action === 'install_plugin') {
        destination = {
          id: 'plugin-library',
          label: 'Open plugin library',
          detail: repairAction.message,
          onSelect: () => openArtifactsCategory('lv2-plugins'),
        }
      } else if (repairAction.action === 'restore_asset') {
        const assetCategory = repairAction.assetType === 'nam_model'
          ? 'nam-models'
          : repairAction.assetType === 'cabinet_ir'
            ? 'cabinet-irs'
            : repairAction.assetType === 'reverb_ir'
              ? 'reverb-irs'
              : 'snapshots'
        const assetLabel = repairAction.assetType === 'nam_model'
          ? 'Open NAM library'
          : repairAction.assetType === 'cabinet_ir'
            ? 'Open cabinet IR library'
            : repairAction.assetType === 'reverb_ir'
              ? 'Open reverb IR library'
              : 'Open artifacts library'
        destination = {
          id: `asset-${assetCategory}`,
          label: assetLabel,
          detail: repairAction.message,
          onSelect: () => openArtifactsCategory(assetCategory),
        }
      }

      if (!destination || seen.has(destination.id)) {
        return
      }

      seen.add(destination.id)
      actions.push(destination)
    })

    return actions
  }, [goLiveFailureDetail, openArtifactsCategory, openSnapshotIoWorkspace])
  const midiLearning = midiLearnActive || midiLearnInProgress
  const addFlowDisabled = snapshotEditingLocked || flowSlots.length >= MAX_FLOWS
  const clearFlowsDisabled = snapshotEditingLocked || flowSlots.length <= 1
  const midiMappingsTitle = midiLearning ? 'MIDI Learn armed' : `${midiMappingCountLabel} MIDI mappings`

  const snapshotInspectorWorkspaceActionId = useMemo<SnapshotEditorWorkspaceActionId>(() => {
    if (showVersionHistoryModal) {
      return 'version-history'
    }
    if (automationTimelineExpanded) {
      return 'automation'
    }
    if (effectModalOpen && selectedPlugin) {
      return 'parameters'
    }
    if (showPluginBrowser) {
      return 'directory'
    }
    return 'signal-grid'
  }, [automationTimelineExpanded, effectModalOpen, selectedPlugin, showPluginBrowser, showVersionHistoryModal])
  const tabletDetailsAction = isTabletTouchLayout ? (
    <Button
      size="sm"
      kind="secondary"
      renderIcon={Settings}
      onClick={openControlCenter}
    >
      Progress
    </Button>
  ) : undefined

  const renderTabletLoadButton = () => (
    <Button
      size="md"
      kind="ghost"
      aria-label="Open snapshots workspace"
      className="juce-grid-page__tablet-launcher-utility"
      onClick={openArtifactsSnapshots}
      title={snapshotWorkspaceTitle}
    >
      Load
    </Button>
  )

  const renderSelectedBlockNavBar = (options: {
    disabled?: boolean
    className?: string
  } = {}) => {
    if (!selectedPlugin) {
      return null
    }

    const navClassName = options.className
      ? `juce-grid-page__selected-block-nav ${options.className}`
      : 'juce-grid-page__selected-block-nav'
    const navDisabled = Boolean(options.disabled)

    return (
      <div className={navClassName} role="toolbar" aria-label="Selected block navigation">
        <Button
          hasIconOnly
          size="sm"
          kind="ghost"
          renderIcon={ArrowLeft}
          iconDescription="Move selected block left"
          aria-label="Move selected block left"
          onClick={() => moveSelectedPlugin('left')}
          disabled={navDisabled || !canMoveSelectedPluginLeft || reorderMutation.isPending}
        />
        <Button
          hasIconOnly
          size="sm"
          kind={selectedPlugin.bypassed ? 'secondary' : 'ghost'}
          renderIcon={selectedPlugin.bypassed ? VolumeUp : VolumeMute}
          iconDescription={selectedPlugin.bypassed ? 'Enable selected block' : 'Bypass selected block'}
          aria-label={selectedPlugin.bypassed ? 'Enable selected block' : 'Bypass selected block'}
          onClick={handleToggleSelectedBypass}
          disabled={navDisabled}
        />
        <Button
          hasIconOnly
          size="sm"
          kind="ghost"
          renderIcon={ArrowRight}
          iconDescription="Move selected block right"
          aria-label="Move selected block right"
          onClick={() => moveSelectedPlugin('right')}
          disabled={navDisabled || !canMoveSelectedPluginRight || reorderMutation.isPending}
        />
      </div>
    )
  }

  const renderMidiMappingsWorkspace = (options: { closable: boolean; onClose?: () => void }) => (
    <div className="juce-grid-page__midi-workspace">
      <div className="juce-grid-page__midi-header">
        <div className="juce-grid-page__midi-copy">
          <div className="juce-grid-page__browser-section-title">
            <Music size={16} />
            <span>MIDI mappings</span>
          </div>
          <p>Review canonical platform mappings, filter by scope, and arm backend MIDI learn from the grid.</p>
        </div>
        <div className="juce-grid-page__compact-actions">
          <MidiLearnButton
            isActive={midiLearnActive || midiLearnInProgress}
            onToggle={handleMidiLearnToggle}
            position="relative"
            size="small"
            mappingCount={midiMappings.length}
          />
          <Tag type={midiLearnActive || midiLearnInProgress ? 'green' : 'cool-gray'}>
            {midiLearnInProgress
              ? `Learning${lastMidiEvent ? ` · CC ${lastMidiEvent.cc}` : ''}`
              : midiLearnActive
                ? 'Learn armed'
                : 'Learn idle'}
          </Tag>
          <Tag type="cool-gray">
            {midiMappings.length} shown
            {midiStatus?.mappings_count !== undefined ? ` / ${midiStatus.mappings_count} total` : ''}
          </Tag>
          <Button
            size="sm"
            kind="tertiary"
            renderIcon={Launch}
            onClick={() => {
              const params = new URLSearchParams()
              if (activeSnapshot?.id != null) {
                params.set('snapshotId', String(activeSnapshot.id))
              }
              const query = params.toString()
              navigate(`/midi/assignments${query ? `?${query}` : ''}`)
            }}
            title="Open the unified MIDI Assignments page (parameters, snapshot triggers, routing rules, expression pedals, devices)"
          >
            MIDI Assignments
          </Button>
          {options.closable && options.onClose && (
            <Button size="sm" kind="ghost" onClick={options.onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      <div className="juce-grid-page__toolbar-buttons">
        <Button
          size="sm"
          kind={midiScope === 'all' ? 'secondary' : 'ghost'}
          onClick={() => setMidiScope('all')}
        >
          All
        </Button>
        <Button
          size="sm"
          kind={midiScope === 'active-chain' ? 'secondary' : 'ghost'}
          onClick={() => setMidiScope('active-chain')}
          disabled={activeFlowChainId === null}
        >
          Active chain
        </Button>
        <Button
          size="sm"
          kind={midiScope === 'selected-plugin' ? 'secondary' : 'ghost'}
          onClick={() => setMidiScope('selected-plugin')}
          disabled={!selectedPluginUri}
        >
          Selected block
        </Button>
      </div>

      <div className="juce-grid-page__compact-actions">
        <Tag type="cool-gray">{midiScopeLabel}</Tag>
        {midiLearnInProgress && midiLearnStatus?.target && (
          <Tag type="green">
            Target {midiLearnStatus.target.parameter_symbol || `#${midiLearnStatus.target.parameter_index}`}
          </Tag>
        )}
      </div>

      {routing.mode === 'ab_switch' ? (
        <SnapshotAbSwitchMidiCard
          hasActiveSnapshot={Boolean(activeSnapshot)}
          disabled={!activeSnapshot || snapshotEditingLocked}
          isPending={replaceSnapshotMidiMapMutation.isPending}
          binding={snapshotAbSwitchMidiBinding}
          draftMessageType={abSwitchMidiMessageTypeDraft}
          draftMidiChannel={abSwitchMidiChannelDraft}
          draftNumber={abSwitchMidiNumberDraft}
          onDraftMessageTypeChange={setAbSwitchMidiMessageTypeDraft}
          onDraftMidiChannelChange={setAbSwitchMidiChannelDraft}
          onDraftNumberChange={setAbSwitchMidiNumberDraft}
          onSave={saveSnapshotAbSwitchMidiBinding}
          onClear={clearSnapshotAbSwitchMidiBinding}
          saveDisabled={abSwitchMidiSaveDisabled}
        />
      ) : null}

      <Tile className="juce-grid-page__midi-block-focus-card">
        <div className="juce-grid-page__midi-tile-header">
          <div className="juce-grid-page__midi-tile-copy">
            <h3 className="juce-grid-page__dense-card-heading">Block focus</h3>
            <p>Map incoming MIDI notes to block positions in the active chain and open the parameter editor on receipt.</p>
          </div>
          <div className="juce-grid-page__compact-tags">
            <Tag type={snapshotBlockFocusRange ? 'green' : 'cool-gray'}>
              {snapshotBlockFocusRange ? 'Configured' : 'Not configured'}
            </Tag>
            <Tag type="cool-gray">
              {currentChain ? `${activeChainDisplayName} - ${blockFocusPlugins.length} blocks` : 'No active chain'}
            </Tag>
          </div>
        </div>

        <div className="juce-grid-page__midi-block-focus-grid">
          <Select
            id="juce-grid-block-focus-channel"
            labelText="MIDI channel"
            value={blockFocusMidiChannelDraft}
            onChange={(event) => setBlockFocusMidiChannelDraft(event.target.value)}
            disabled={!activeSnapshot || snapshotEditingLocked}
          >
            <SelectItem value="omni" text="Omni" />
            {Array.from({ length: 16 }, (_, index) => (
              <SelectItem
                key={`juce-grid-block-focus-channel-${index + 1}`}
                value={String(index + 1)}
                text={`Channel ${index + 1}`}
              />
            ))}
          </Select>
          <NumberInput
            label="Start note"
            value={blockFocusStartNote}
            min={0}
            max={127}
            step={1}
            precision={0}
            showBounds={false}
            disabled={!activeSnapshot || snapshotEditingLocked}
            onChange={(nextValue) => setBlockFocusStartNoteDraft(Math.max(0, Math.min(127, Math.round(nextValue))))}
          />
        </div>

        <div className="juce-grid-page__midi-actions">
          <div className="juce-grid-page__compact-tags">
            <Tag type="cool-gray">
              {blockFocusMidiChannelDraft === 'omni' ? 'Omni' : `Ch ${blockFocusMidiChannelDraft}`}
            </Tag>
            {blockFocusPlugins.length > 0 && (
              <Tag type={blockFocusStartNoteOverflow ? 'red' : 'green'}>
                {formatMidiNoteLabel(blockFocusStartNote)} - {formatMidiNoteLabel(Math.min(127, blockFocusStartNote + blockFocusPlugins.length - 1))}
              </Tag>
            )}
          </div>
          <div className="juce-grid-page__compact-actions">
            <Button
              size="sm"
              kind="ghost"
              onClick={clearSnapshotBlockFocusRange}
              disabled={!activeSnapshot || replaceSnapshotMidiMapMutation.isPending || !snapshotBlockFocusRange}
            >
              Clear
            </Button>
            <Button
              size="sm"
              kind="secondary"
              onClick={saveSnapshotBlockFocusRange}
              disabled={blockFocusSaveDisabled || replaceSnapshotMidiMapMutation.isPending}
            >
              {replaceSnapshotMidiMapMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {!activeSnapshot ? (
          <p className="juce-grid-page__empty-state-copy">
            Load a snapshot to configure block-focus note mapping.
          </p>
        ) : blockFocusPlugins.length === 0 ? (
          <p className="juce-grid-page__empty-state-copy">
            Select a chain with blocks before assigning block-focus notes.
          </p>
        ) : blockFocusStartNoteOverflow ? (
          <p className="juce-grid-page__flow-card-error">
            Start note must be {maxBlockFocusStartNote} or lower for the current chain length.
          </p>
        ) : (
          <div className="juce-grid-page__midi-block-focus-preview" role="list" aria-label="Block focus preview">
            {blockFocusPreview.map((item, index) => (
              <div key={item.key} className="juce-grid-page__midi-block-focus-preview-item" role="listitem">
                <span className="juce-grid-page__midi-block-focus-preview-note">
                  {formatMidiNoteLabel(item.note)}
                </span>
                <span className="juce-grid-page__midi-block-focus-preview-label">
                  Block {index + 1} - {item.blockLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </Tile>

      <SnapshotFootswitchLabelCard
        hasActiveSnapshot={Boolean(activeSnapshot)}
        disabled={!activeSnapshot || snapshotEditingLocked}
        isPending={replaceSnapshotMidiMapMutation.isPending}
        labelMap={footswitchLabelDrafts}
        onChange={updateFootswitchLabelDraft}
        onSave={saveSnapshotFootswitchLabels}
        onClear={clearSnapshotFootswitchLabels}
        saveDisabled={footswitchLabelsSaveDisabled}
      />

      <SnapshotExpressionMappingsCard
        hasActiveSnapshot={Boolean(activeSnapshot)}
        disabled={!activeSnapshot || snapshotEditingLocked}
        isPending={updateSnapshotExpressionMappingsMutation.isPending}
        mappings={snapshotExpressionMappings}
        availableParameters={expressionEngineParametersQuery.data?.parameters ?? []}
        onSave={saveSnapshotExpressionMappings}
        onClear={clearSnapshotExpressionMappings}
      />

      {midiMappingsQuery.isLoading ? (
        <LoadingState className="juce-grid-page__empty-state" description="Loading MIDI mappings" />
      ) : midiMappingsQuery.isError ? (
        <EmptyState
          className="juce-grid-page__empty-state"
          title="Unable to load MIDI mappings"
          description={midiMappingsQuery.error instanceof Error ? midiMappingsQuery.error.message : 'The MIDI API did not return a mapping list.'}
        />
      ) : midiMappings.length === 0 ? (
        <EmptyState
          className="juce-grid-page__empty-state"
          title="No MIDI mappings in this scope"
          description={midiLearnActive
            ? 'Touch a block parameter to start canonical MIDI learn for the selected processor.'
            : 'Arm MIDI Learn, then touch a block parameter, or use the MIDI window for full mapping authoring.'}
        />
      ) : (
        <div className="juce-grid-page__midi-list">
          {midiMappings.map((mapping, index) => (
            <Tile
              key={mapping.id}
              className="juce-grid-page__midi-tile"
              data-stripe-tone={index % 2 === 0 ? 'base' : 'alt'}
            >
              <div className="juce-grid-page__midi-tile-header">
                <div className="juce-grid-page__midi-tile-copy">
                  <h3 className="juce-grid-page__dense-card-heading">{getMidiMappingParameterName(mapping)}</h3>
                  <p>{sanitizeRestrictedDisplayText(getMidiMappingPluginName(mapping.target_plugin_uri)) || 'Processor'}</p>
                </div>
                <div className="juce-grid-page__compact-tags">
                  <Tag type="purple">CC {mapping.cc}</Tag>
                  <Tag type="cool-gray">Ch {mapping.channel}</Tag>
                  <Tag type={mapping.chain_id === null ? 'cool-gray' : 'blue'}>
                    {mapping.chain_id === null ? 'Global' : `Chain ${mapping.chain_id}`}
                  </Tag>
                  <Tag type={mapping.is_enabled ? 'green' : 'warm-gray'}>
                    {mapping.is_enabled ? 'Enabled' : 'Disabled'}
                  </Tag>
                  <Tag type="cool-gray">{MIDI_CURVE_LABELS[mapping.curve_type]}</Tag>
                  {mapping.invert && <Tag type="warm-gray">Inverted</Tag>}
                </div>
              </div>

              <div className="juce-grid-page__midi-range-grid">
                <NumberInput
                  label="Min"
                  value={Number(midiRangeDrafts[mapping.id]?.min ?? mapping.min_val)}
                  min={-100000}
                  max={100000}
                  step={0.01}
                  precision={2}
                  showBounds={false}
                  onChange={(nextValue) => updateMidiMappingRangeDraft(mapping.id, 'min', String(nextValue))}
                  onChangeEnd={() => commitMidiMappingRange(mapping)}
                />
                <NumberInput
                  label="Max"
                  value={Number(midiRangeDrafts[mapping.id]?.max ?? mapping.max_val)}
                  min={-100000}
                  max={100000}
                  step={0.01}
                  precision={2}
                  showBounds={false}
                  onChange={(nextValue) => updateMidiMappingRangeDraft(mapping.id, 'max', String(nextValue))}
                  onChangeEnd={() => commitMidiMappingRange(mapping)}
                />
              </div>

              <Select
                id={`juce-grid-midi-curve-${mapping.id}`}
                labelText="Curve"
                value={mapping.curve_type}
                onChange={(event) => updateMidiMappingMutation.mutate({
                  id: mapping.id,
                  updates: { curve_type: event.target.value as MIDIMappingV2['curve_type'] },
                })}
              >
                <SelectItem value="linear" text="Linear" />
                <SelectItem value="logarithmic" text="Logarithmic" />
                <SelectItem value="exponential" text="Exponential" />
                <SelectItem value="s_curve" text="S-Curve" />
              </Select>

              <div className="juce-grid-page__midi-actions">
                <Checkbox
                  id={`juce-grid-midi-enabled-${mapping.id}`}
                  labelText="Enabled"
                  checked={mapping.is_enabled}
                  onChange={(_, data) => updateMidiMappingMutation.mutate({
                    id: mapping.id,
                    updates: { is_enabled: Boolean(data.checked) },
                  })}
                />
                <Checkbox
                  id={`juce-grid-midi-invert-${mapping.id}`}
                  labelText="Invert response"
                  checked={mapping.invert}
                  onChange={(_, data) => updateMidiMappingMutation.mutate({
                    id: mapping.id,
                    updates: { invert: Boolean(data.checked) },
                  })}
                />
                <Button
                  size="sm"
                  kind="danger--tertiary"
                  onClick={() => deleteMidiMappingMutation.mutate(mapping.id)}
                >
                  Delete
                </Button>
              </div>
            </Tile>
          ))}
        </div>
      )}
    </div>
  )

  const formatAutomationTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const wholeSeconds = Math.floor(seconds % 60)
    const tenths = Math.floor((seconds % 1) * 10)
    return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${tenths}`
  }, [])

  const handleAutomationTrackClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const progress = rect.width > 0 ? x / rect.width : 0
    setAutomationCurrentTime(Math.max(0, Math.min(automationDuration, progress * automationDuration)))
  }, [automationDuration])

  const handleAutomationTrackKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setAutomationCurrentTime((previous) => Math.max(0, previous - 1))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setAutomationCurrentTime((previous) => Math.min(automationDuration, previous + 1))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setAutomationCurrentTime(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setAutomationCurrentTime(automationDuration)
    }
  }, [automationDuration])

  const renderAutomationWorkspace = (options: { compact: boolean }) => (
    <div className={`juce-grid-page__automation-workspace ${options.compact ? 'is-compact' : ''}`}>
      <div className="juce-grid-page__automation-header">
        <div className="juce-grid-page__automation-copy">
          <p className="juce-grid-page__dense-card-kicker">Automation</p>
          <h2 className="juce-grid-page__dense-section-heading">Automation lanes</h2>
          <p>Transport, lane arming, and envelope previews for the active flow.</p>
        </div>
        <div className="juce-grid-page__compact-tags">
          <Tag type="cool-gray">{automationLanes.length} lanes</Tag>
          {automationLoopEnabled && <Tag type="blue">Loop</Tag>}
          {automationRecording && <Tag type="red">Recording</Tag>}
        </div>
      </div>

      <div className="juce-grid-page__automation-transport">
        <div className="juce-grid-page__compact-actions">
          <Button
            size="sm"
            kind="ghost"
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="Seek to start"
            onClick={() => setAutomationCurrentTime(0)}
          />
          <Button
            size="sm"
            kind={automationPlaying ? 'secondary' : 'primary'}
            hasIconOnly
            renderIcon={automationPlaying ? Pause : Play}
            iconDescription={automationPlaying ? 'Pause automation' : 'Play automation'}
            onClick={() => setAutomationPlaying((previous) => !previous)}
          />
          <Button
            size="sm"
            kind="ghost"
            hasIconOnly
            renderIcon={Stop}
            iconDescription="Stop automation"
            onClick={() => {
              setAutomationPlaying(false)
              setAutomationRecording(false)
              setAutomationCurrentTime(0)
            }}
          />
          <Button
            size="sm"
            kind={automationRecording ? 'danger' : 'ghost'}
            hasIconOnly
            renderIcon={Recording}
            iconDescription={automationRecording ? 'Stop recording automation' : 'Record automation'}
            onClick={() => {
              setAutomationRecording((previous) => !previous)
              if (!automationPlaying) {
                setAutomationPlaying(true)
              }
            }}
          />
          <Button
            size="sm"
            kind={automationLoopEnabled ? 'secondary' : 'ghost'}
            hasIconOnly
            renderIcon={Renew}
            iconDescription={automationLoopEnabled ? 'Disable automation loop' : 'Enable automation loop'}
            onClick={() => setAutomationLoopEnabled((previous) => !previous)}
          />
          <Button
            size="sm"
            kind="ghost"
            hasIconOnly
            renderIcon={ChevronRight}
            iconDescription="Seek to end"
            onClick={() => setAutomationCurrentTime(automationDuration)}
          />
        </div>
        <div className="juce-grid-page__automation-meta">
          <span>{formatAutomationTime(automationCurrentTime)}</span>
          <span>/</span>
          <span>{formatAutomationTime(automationDuration)}</span>
        </div>
        <Button size="sm" kind="primary" onClick={() => setLanePickerOpen(true)}>
          Add lane
        </Button>
      </div>

      <div
        className="juce-grid-page__automation-track"
        role="button"
        tabIndex={0}
        aria-label="Automation timeline"
        onClick={handleAutomationTrackClick}
        onKeyDown={handleAutomationTrackKeyDown}
      >
        <div className="juce-grid-page__automation-ruler">
          {Array.from({ length: Math.ceil(automationDuration / 10) + 1 }, (_, index) => (
            <span
              key={`automation-ruler-${index}`}
              className="juce-grid-page__automation-ruler-mark"
              style={{ left: `${(index * 10 / automationDuration) * 100}%` }}
            >
              {index * 10}s
            </span>
          ))}
        </div>
        <div
          className="juce-grid-page__automation-playhead"
          style={{ left: `${(automationCurrentTime / automationDuration) * 100}%` }}
          aria-hidden
        />
      </div>

      {automationLanes.length === 0 ? (
        <EmptyState
          className="juce-grid-page__empty-state"
          title="No automation lanes"
          description="Add a lane to capture parameter movement for the active flow."
        />
      ) : (
        <div className="juce-grid-page__automation-lane-list">
          {automationLanes.map((lane) => (
            <Tile
              key={lane.id}
              className={`juce-grid-page__automation-lane ${lane.enabled ? '' : 'is-disabled'}`}
              style={{ '--automation-lane-color': lane.color } as React.CSSProperties}
            >
              <div className="juce-grid-page__automation-lane-header">
                <div className="juce-grid-page__automation-lane-copy">
                  <h3 className="juce-grid-page__dense-card-heading">{lane.parameterName}</h3>
                  <p>{sanitizeRestrictedDisplayText(lane.pluginName) || 'Processor'}</p>
                </div>
                <div className="juce-grid-page__compact-tags">
                  <Tag type="cool-gray">{lane.points.length} points</Tag>
                  {lane.armed && <Tag type="red">Armed</Tag>}
                  {!lane.enabled && <Tag type="warm-gray">Disabled</Tag>}
                </div>
              </div>

              <div className="juce-grid-page__automation-lane-preview">
                <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
                  {lane.points.length > 1 && (
                    <path
                      d={lane.points
                        .map((point, index) => {
                          const x = (point.time / automationDuration) * 100
                          const y = 40 - (point.value * 40)
                          return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
                        })
                        .join(' ')}
                      fill="none"
                      stroke={lane.color}
                      strokeWidth="2"
                    />
                  )}
                  {lane.points.map((point) => (
                    <circle
                      key={point.id}
                      cx={(point.time / automationDuration) * 100}
                      cy={40 - (point.value * 40)}
                      r="2.5"
                      fill={lane.color}
                    />
                  ))}
                </svg>
              </div>

              <div className="juce-grid-page__automation-lane-actions">
                <Button
                  size="sm"
                  kind={lane.enabled ? 'secondary' : 'ghost'}
                  onClick={() => setAutomationLanes((previous) => previous.map((entry) => (
                    entry.id === lane.id ? { ...entry, enabled: !entry.enabled } : entry
                  )))}
                >
                  {lane.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  size="sm"
                  kind={lane.armed ? 'danger' : 'ghost'}
                  onClick={() => setAutomationLanes((previous) => previous.map((entry) => (
                    entry.id === lane.id ? { ...entry, armed: !entry.armed } : entry
                  )))}
                >
                  {lane.armed ? 'Disarm' : 'Arm'}
                </Button>
                <Button
                  size="sm"
                  kind="danger--tertiary"
                  onClick={() => setAutomationLanes((previous) => previous.filter((entry) => entry.id !== lane.id))}
                >
                  Delete
                </Button>
              </div>
            </Tile>
          ))}
        </div>
      )}
    </div>
  )

  const automationToggleBottomOffset = useMemo(() => (
    12 + (automationTimelineExpanded ? automationPanelHeight + 12 : 0)
  ), [automationPanelHeight, automationTimelineExpanded])

  const automationFloatingToggleStyle = useMemo<CSSProperties>(() => ({
    bottom: `calc(${automationToggleBottomOffset}px + env(safe-area-inset-bottom))`,
  }), [automationToggleBottomOffset])

  const automationFloatingToggleTitle = useMemo(() => {
    if (snapshotEntryRequired) {
      return 'Load or create a snapshot to edit automation.'
    }
    const statusLabel = automationRecording
      ? 'Recording'
      : automationPlaying
        ? 'Playing'
        : automationLanes.length > 0
          ? 'Ready'
          : 'Idle'
    const armedLabel = armedAutomationLane ? ` • Armed ${armedAutomationLane.parameterName}` : ''
    return `${statusLabel} • ${automationLanes.length} lanes${armedLabel}`
  }, [armedAutomationLane, automationLanes.length, automationPlaying, automationRecording, snapshotEntryRequired])

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (isTextEntryTarget(e.target)) {
          if (e.key === 'Escape') {
            if (showSavePresetModal) setShowSavePresetModal(false)
            else if (editingSnapshotName) cancelRenameSnapshot()
            else if (showRenameChainModal) setShowRenameChainModal(false)
            else if (pendingTabletDeletePlugin) setPendingTabletDeletePlugin(null)
            else if (presetPendingDelete) setPresetPendingDelete(null)
            else if (showClearFlowsModal) setShowClearFlowsModal(false)
            else if (showPerformModal) closePerformWorkspace()
            else if (showAudioNodesModal) closeAudioRoutingWorkspace()
            else if (showProgressModal) setShowProgressModal(false)
            else if (showLiveRuntimeModal) closeLiveRuntimeWorkspace()
            else if (showVersionHistoryModal) closeVersionHistoryWorkspace()
            else if (midiModalOpen) closeMidiMappingsWorkspace()
            else if (routingInspectorId) setRoutingInspectorId(null)
          }
        return
      }

      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (snapshotUndoRedo.canUndo) undoMutation.mutate()
        return
      }

      // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (snapshotUndoRedo.canRedo) redoMutation.mutate()
        return
      }

      // ? = Toggle keyboard help
      if (e.key === '?') {
        e.preventDefault()
        setShowKeyboardHelp(prev => !prev)
        return
      }

      // B = Toggle bypass on selected plugin
      if (e.key === 'b' && selectedPlugin && currentChain) {
        e.preventDefault()
        if (snapshotEntryRequired) {
          return
        }
        if (snapshotEditingLocked) {
          pushToast('Unlock snapshot before editing it', 'warn')
          return
        }
        handleToggleBypass(selectedPlugin.uri, !selectedPlugin.bypassed, selectedPlugin.position)
        return
      }

      // Delete/Backspace = Remove selected plugin
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlugin && currentChain) {
        e.preventDefault()
        if (snapshotEntryRequired) {
          return
        }
        if (snapshotEditingLocked) {
          pushToast('Unlock snapshot before editing it', 'warn')
          return
        }
        handleDeletePlugin(selectedPlugin.uri, selectedPlugin.position)
        return
      }

      // S = Save preset
      if (e.key === 's' && !e.ctrlKey && !e.metaKey && currentChain) {
        e.preventDefault()
        handleSavePreset()
        return
      }

      // A = Add plugin
      if (e.key === 'a' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (snapshotEntryRequired) {
          createCapturedSnapshot({ openPluginBrowser: true, focusSnapshotName: false })
          return
        }
        if (snapshotEditingLocked) {
          pushToast('Unlock snapshot before editing it', 'warn')
          return
        }
        setShowPluginBrowser(true)
        return
      }

      // I = Show plugin info/details
      if (e.key === 'i' && selectedPluginMeta) {
        e.preventDefault()
        setDetailsPlugin(selectedPluginMeta)
        return
      }

      // F = Toggle favorite on selected plugin
      if (e.key === 'f' && selectedPluginUri) {
        e.preventDefault()
        toggleFavorite(selectedPluginUri)
        return
      }

      // 1-6 = Select flow slot
      if (e.key >= '1' && e.key <= '6') {
        if (snapshotEntryRequired) {
          return
        }
        const index = parseInt(e.key, 10) - 1
        if (index < flowSlots.length) {
          e.preventDefault()
          selectFlowIndex(index)
        }
        return
      }

      const activeElement = typeof document !== 'undefined' ? document.activeElement : null
      const snapshotCanvasFocused = activeElement instanceof HTMLElement
        && activeElement.dataset.snapshotCanvasFocusRoot === 'true'

      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && snapshotCanvasFocused) {
        e.preventDefault()
        if (e.key === 'ArrowLeft') {
          goToPreviousSnapshot()
        } else {
          goToNextSnapshot()
        }
        return
      }

      // Left/Right = Move selected plugin through the signal chain
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && currentChain) {
        e.preventDefault()
        if (snapshotEntryRequired) {
          return
        }
        if (!selectedPluginUri) {
          const fallbackIndex = e.key === 'ArrowLeft' ? currentChain.plugins.length - 1 : 0
          const fallbackPlugin = currentChain.plugins[fallbackIndex]
          if (fallbackPlugin) {
            setSelectedPluginSelection(fallbackPlugin.uri, fallbackPlugin.position)
            if (isTabletTouchLayout) {
              setTabletEditorOpen(false)
            } else {
              openSelectedBlockEditor()
            }
          }
          return
        }

        if (snapshotEditingLocked) {
          pushToast('Unlock snapshot before editing it', 'warn')
          return
        }
        moveSelectedPlugin(e.key === 'ArrowLeft' ? 'left' : 'right')
        return
      }

      // Escape = Close modals/deselect
      if (e.key === 'Escape') {
        if (showSavePresetModal) setShowSavePresetModal(false)
        else if (editingSnapshotName) cancelRenameSnapshot()
        else if (showRenameChainModal) setShowRenameChainModal(false)
        else if (pendingTabletDeletePlugin) setPendingTabletDeletePlugin(null)
        else if (presetPendingDelete) setPresetPendingDelete(null)
        else if (showClearFlowsModal) setShowClearFlowsModal(false)
        else if (showPerformModal) closePerformWorkspace()
        else if (showAudioNodesModal) closeAudioRoutingWorkspace()
        else if (showProgressModal) setShowProgressModal(false)
        else if (showLiveRuntimeModal) closeLiveRuntimeWorkspace()
        else if (showVersionHistoryModal) closeVersionHistoryWorkspace()
        else if (midiModalOpen) closeMidiMappingsWorkspace()
        else if (routingInspectorId) setRoutingInspectorId(null)
        else if (showPluginBrowser) setShowPluginBrowser(false)
        else if (showPresetBrowser) setShowPresetBrowser(false)
        else if (showKeyboardHelp) setShowKeyboardHelp(false)
        else if (detailsPlugin) setDetailsPlugin(null)
        else if (tabletEditorOpen) setTabletEditorOpen(false)
        else if (effectModalOpen) setEffectModalOpen(false)
        else if (selectedPluginUri) setSelectedPluginSelection(null)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    snapshotUndoRedo.canUndo, snapshotUndoRedo.canRedo, undoMutation, redoMutation, selectedPlugin, currentChain,
    deleteMutation, selectedPluginUri, selectedPluginMeta,
    flowSlots, showSavePresetModal, editingSnapshotName, showRenameChainModal, pendingTabletDeletePlugin, presetPendingDelete,
    showClearFlowsModal, showPerformModal, showAudioNodesModal, showProgressModal, showLiveRuntimeModal, showVersionHistoryModal, midiModalOpen, routingInspectorId, showPluginBrowser,
    showPresetBrowser, showKeyboardHelp, detailsPlugin, effectModalOpen, isTabletTouchLayout, tabletEditorOpen,
    handleDeletePlugin, handleSavePreset, handleToggleBypass, toggleFavorite, selectFlowIndex, openSelectedBlockEditor, moveSelectedPlugin, pushToast, setSelectedPluginSelection,
    goToPreviousSnapshot, goToNextSnapshot, cancelRenameSnapshot, createCapturedSnapshot,
    closeAudioRoutingWorkspace, closePerformWorkspace, closeLiveRuntimeWorkspace, closeVersionHistoryWorkspace, closeMidiMappingsWorkspace,
    snapshotEditingLocked, snapshotEntryRequired,
  ])

  // ============================================================================
  // Render
  // ============================================================================

  const renderLivePathFlowCard = (
    flowId: string,
    groupKind: LivePathGroupKind,
  ) => {
    const index = flowIndexById.get(flowId)
    if (index === undefined) {
      return null
    }

    const flow = flowSlots[index]
    const flowChain = getChainForFlow(flow)
    const isActive = activeFlowIndex === index
    const flowState = livePathLayout.flowStates[flowId]
    const pluginCpuSum = flowChain?.plugins.reduce((sum, plugin) => sum + (getPluginCpu(plugin.uri) || 0), 0) || 0
    const flowLabel = SLOT_COLORS[index]?.label || flow.label || String.fromCharCode(65 + index)
    const flowTitle = flowChain ? `Chain ${flowLabel}` : `Channel ${flowLabel}`
    const flowSummary = flowChain
      ? `${flowChain.plugins.length} loaded ${flowChain.plugins.length === 1 ? 'block' : 'blocks'}`
      : 'Assign a chain to start editing'
    const flowCaption = flowChain ? `Chain ${flowLabel}` : flowSummary
    const arrowTone = getLivePathArrowTone(flowState)
    const arrowDashed = Boolean(flowState?.dimmed || flowState?.sidechainKey)
    const stateLabel = getLivePathStateLabel(flowState)
    const branchLabel = getLivePathBranchLabel(routing.mode, groupKind, flowState)
    const mobileStatusLabels = [stateLabel, branchLabel].filter((label): label is string => Boolean(label))
    const tabletStatusLabel = flowState?.activeAudio ? 'Live' : isActive ? 'Active' : 'Inactive'
    const flowCurrentPage = branchPageByFlowId[flow.id] ?? 0
    const flowPageCount = 1
    const flowClipActive = typeof flowClipTimestamps[flow.id] === 'number'
    const flowInputClipActive = typeof flowInputClipTimestamps[flow.id] === 'number'
    const flowOutputClipActive = typeof flowOutputClipTimestamps[flow.id] === 'number'
    const isTabletBranchExpanded = expandedTabletBranchId === flow.id
    const tabletSummaryPills = [
      isActive ? 'Selected' : null,
      branchLabel,
      flowState?.secondaryAnnotation ?? null,
      flowChain ? `${flowChain.plugins.length} blocks` : null,
      flowPageCount > 1 ? `Page ${Math.min(flowCurrentPage, flowPageCount - 1) + 1}/${flowPageCount}` : null,
    ].filter((label): label is string => Boolean(label))
    const signalCanvas = (
      <JuceGridSignalCanvas
        chain={flowChain || null}
        branchId={flow.id}
        chainLabel={flowLabel}
        chainMuted={flow.muted}
        chainSoloed={flow.solo}
        pluginMeta={pluginMeta}
        selectedPluginUri={isActive ? selectedPluginUri : null}
        selectedPluginPosition={isActive ? selectedPluginPosition : null}
        reorderPreviewUri={isActive ? reorderPreview?.pluginUri ?? null : null}
        reorderPreviewPosition={isActive ? reorderPreview?.pluginPosition ?? null : null}
        reorderTargetUri={isActive ? reorderPreview?.targetUri ?? null : null}
        reorderTargetPosition={isActive ? reorderPreview?.targetPosition ?? null : null}
        reorderPreviewDirection={isActive ? reorderPreview?.direction ?? null : null}
        onPluginSelect={(uri, position) => {
          selectFlowIndex(index)
          setFocusedBranchId(flow.id)
          handlePluginSelect(uri, position)
        }}
        onToggleBypass={(uri, bypassed, position) => {
          if (!flowChain) return
          const nextDraft = updateDraftChain(
            cloneSnapshotDraftData(captureCurrentState()),
            flowChain.id,
            (chain) => ({
              ...chain,
              plugins: chain.plugins.map((plugin) => (
                plugin.uri === uri && plugin.position === position
                  ? { ...plugin, bypass: bypassed }
                  : plugin
              )),
            }),
          )
          bypassMutation.mutate({
            chainId: flowChain.id,
            pluginUri: uri,
            bypass: bypassed,
            pluginPosition: position,
            undoRedoDraft: nextDraft,
            undoRedoDescription: bypassed ? 'Bypass block' : 'Enable block',
          })
        }}
        onDeletePlugin={(uri, position) => {
          if (!flowChain) return
          const nextDraft = updateDraftChain(
            cloneSnapshotDraftData(captureCurrentState()),
            flowChain.id,
            (chain) => resequenceChainSnapshotPlugins({
              ...chain,
              plugins: chain.plugins.filter((plugin) => !(
                plugin.uri === uri
                && (typeof position !== 'number' || plugin.position === position)
              )),
            }),
          )
          deleteMutation.mutate({
            chainId: flowChain.id,
            pluginUri: uri,
            pluginPosition: position,
            undoRedoDraft: nextDraft,
            undoRedoDescription: 'Remove block',
          })
        }}
        onReorderPlugins={(pluginOrder) => {
          if (!flowChain) return
          const reorderedPlugins = pluginOrder.reduce<ChainSnapshot['plugins']>((accumulator, ref, pluginIndex) => {
              const match = flowChain.plugins.find((plugin) => (
                plugin.uri === ref.uri
                && plugin.position === ref.position
              ))
              if (!match) {
                return accumulator
              }
              accumulator.push({
                uri: match.uri,
                position: pluginIndex,
                bypass: match.bypassed || false,
                parameters: match.parameters || {},
                loader_state: match.loader_state,
              })
              return accumulator
            }, [])
          const nextDraft = updateDraftChain(
            cloneSnapshotDraftData(captureCurrentState()),
            flowChain.id,
            (chain) => ({
              ...chain,
              plugins: reorderedPlugins,
            }),
          )
          reorderMutation.mutate({
            chainId: flowChain.id,
            pluginOrder,
            undoRedoDraft: nextDraft,
            undoRedoDescription: 'Reorder blocks',
          })
        }}
        onAddPlugin={() => {
          if (snapshotEditingLocked) {
            pushToast(
              'Snapshot is locked — unlock it from the snapshot menu before adding blocks.',
              'warn',
            )
            return
          }
          if (flow.id !== addEffectFlowId) {
            selectFlowIndex(index)
          }
          handleAddPlugin()
        }}
        onRenameChain={isActive ? handleRenameChain : undefined}
        onDuplicateChain={isActive ? handleDuplicateChain : undefined}
        onToggleChainActive={isActive ? handleToggleChainActive : undefined}
        onDeleteChain={flowChain ? () => handleChainRemoved(flowChain.id) : undefined}
        onMuteToggle={() => {
          if (snapshotEditorMutationDisabled) return
          updateFlow(flow.id, { muted: !flow.muted })
        }}
        onSoloToggle={() => {
          if (snapshotEditorMutationDisabled) return
          updateFlow(flow.id, { solo: !flow.solo })
        }}
        showAddPluginSlot={flow.id === addEffectFlowId}
        audioStatus={audioInterfaceStatus}
        audioOutputStatus={audioOutputStatus}
        pluginLevels={pluginLevels}
        automationSummary={signalAutomationSummary}
        tabletMode={isTabletTouchLayout}
        focusedBranchId={focusedBranchId}
        currentBranchPage={flowCurrentPage}
        onBranchPageChange={handleTabletBranchPageChange}
        onCanvasEmptyPress={() => handleTabletCanvasEmptyPress(flow.id)}
        readOnly={snapshotEditingLocked}
        flowAnimation={signalCanvasSettings.flowAnimation}
        gridBackdrop={signalCanvasSettings.gridBackdrop}
        nodeShape={signalCanvasSettings.nodeShape}
        flowLabel={isTabletTouchLayout ? undefined : flowLabel}
        flowDryWetMix={isTabletTouchLayout ? undefined : flow.dryWetMix}
        onFlowDryWetMixChange={
          isTabletTouchLayout
            ? undefined
            : (value) => updateFlow(flow.id, { dryWetMix: value })
        }
        flowInputClipActive={isTabletTouchLayout ? undefined : flowInputClipActive}
        flowOutputClipActive={isTabletTouchLayout ? undefined : flowOutputClipActive}
        flowClipActive={isTabletTouchLayout ? undefined : flowClipActive}
        onDeleteFlow={isTabletTouchLayout ? undefined : () => removeFlow(flow.id)}
        canDeleteFlow={!isTabletTouchLayout && flowSlots.length > MIN_FLOWS}
        flowControlsDisabled={snapshotEditorMutationDisabled}
      />
    )

    return (
      <div
        key={flow.id}
        className={`juce-grid-page__live-path-row juce-grid-page__live-path-row--${groupKind} ${flowState?.activeAudio ? 'is-live' : ''} ${flowState?.dimmed ? 'is-dimmed' : ''} ${isTabletTouchLayout ? 'is-tablet-mode' : ''}`}
      >
        {!isTabletTouchLayout && (
          <>
            <div
              className="juce-grid-page__live-path-mobile-sliver"
              data-testid={`juce-grid-live-path-mobile-sliver-${flow.id}`}
            >
              <div
                className={`juce-grid-page__live-path-mobile-arrow is-${arrowTone} ${arrowDashed ? 'is-dashed' : ''}`}
                aria-hidden
              >
                <span className="juce-grid-page__live-path-mobile-arrow-line" />
                <ArrowRight size={16} />
              </div>
              <div className="juce-grid-page__live-path-mobile-statuses">
                {mobileStatusLabels.map((label) => (
                  <span
                    key={`${flow.id}-${label}`}
                    className={`juce-grid-page__live-path-mobile-chip ${label === stateLabel ? 'is-state' : 'is-branch'} ${label === 'Live' ? 'is-live' : ''} ${label === 'Dim' ? 'is-dim' : ''} ${label === 'Key' ? 'is-sidechain' : ''}`}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div
                className={`juce-grid-page__live-path-mobile-arrow is-${arrowTone} ${arrowDashed ? 'is-dashed' : ''}`}
                aria-hidden
              >
                <span className="juce-grid-page__live-path-mobile-arrow-line" />
                <ArrowRight size={16} />
              </div>
            </div>

            <div className="juce-grid-page__live-path-side juce-grid-page__live-path-side--entry" aria-hidden>
              <span
                className={`juce-grid-page__live-path-dot ${flowState?.activeAudio ? 'is-live' : ''} ${flowState?.sidechainKey ? 'is-sidechain' : ''}`}
                style={{ '--flow-color': flow.color } as React.CSSProperties}
              />
              {stateLabel && (
                <span
                  className="juce-grid-page__live-path-side-copy juce-grid-page__live-path-side-copy--state"
                  data-testid={`juce-grid-live-path-entry-${flow.id}`}
                >
                  {stateLabel}
                </span>
              )}
            </div>

            <div
              className={`juce-grid-page__live-path-arrow juce-grid-page__live-path-arrow--incoming is-${arrowTone} ${arrowDashed ? 'is-dashed' : ''}`}
              aria-hidden
            >
              <span className="juce-grid-page__live-path-arrow-line" />
              <ArrowRight size={18} />
            </div>
          </>
        )}

        <article
          className={`juce-grid-page__flow-card ${isActive ? 'is-active' : ''} ${flow.muted ? 'is-muted' : ''} ${flow.solo ? 'is-solo' : ''} ${flowState?.dimmed ? 'is-path-dimmed' : ''} ${flowState?.activeAudio ? 'is-path-live' : ''} ${isTabletTouchLayout ? 'is-tablet-mode' : ''}`}
          style={{ '--flow-color': flow.color } as React.CSSProperties}
          onClick={isTabletTouchLayout || snapshotEntryRequired ? undefined : () => selectFlowIndex(index)}
          onKeyDown={isTabletTouchLayout || snapshotEntryRequired ? undefined : (event) => handleFlowSlotKeyDown(event, index)}
          role={isTabletTouchLayout || snapshotEntryRequired ? undefined : 'button'}
          tabIndex={isTabletTouchLayout || snapshotEntryRequired ? undefined : 0}
          aria-pressed={isTabletTouchLayout || snapshotEntryRequired ? undefined : isActive}
          aria-label={isTabletTouchLayout || snapshotEntryRequired ? undefined : `Select flow ${flowLabel}, ${flowTitle}`}
        >
          {isTabletTouchLayout ? (
            <>
              <button
                type="button"
                className={`juce-grid-page__tablet-flow-summary ${isTabletBranchExpanded ? 'is-expanded' : ''}`}
                onClick={() => handleToggleTabletBranchDetails(index, flow.id)}
                aria-expanded={isTabletBranchExpanded}
                aria-controls={`juce-grid-tablet-flow-details-${flow.id}`}
                disabled={snapshotEntryRequired}
              >
                <div className="juce-grid-page__tablet-flow-summary-main">
                  <div className="juce-grid-page__tablet-flow-summary-copy">
                    <p className="juce-grid-page__dense-card-kicker">{flowLabel}</p>
                    <h3 className="juce-grid-page__flow-card-title-heading">{flowLabel}</h3>
                    <p>
                      <SegmentedLedText value={flowSummary} size="sm" color={FLOW_CARD_LED_COLOR} />
                    </p>
                  </div>
                  <div className="juce-grid-page__tablet-flow-summary-pills">
                    {tabletSummaryPills.map((label) => (
                      <span key={`${flow.id}-${label}`} className="juce-grid-page__tablet-flow-pill">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                <span className={`juce-grid-page__tablet-flow-status is-${tabletStatusLabel.toLowerCase()}`}>
                  {tabletStatusLabel}
                </span>
              </button>

              {isTabletBranchExpanded && (
                <div
                  id={`juce-grid-tablet-flow-details-${flow.id}`}
                  className="juce-grid-page__tablet-flow-details"
                >
                  <div className="juce-grid-page__tablet-flow-details-row juce-grid-page__tablet-flow-details-row--actions">
                    <div className="juce-grid-page__tablet-flow-detail-actions">
                      <Button
                        size="sm"
                        kind="tertiary"
                        renderIcon={Flow}
                        onClick={() => openSnapshotProgressModal('advanced', 'routing')}
                        disabled={snapshotEntryRequired}
                      >
                        Routing
                      </Button>
                      <Button
                        size="sm"
                        kind="tertiary"
                        renderIcon={SettingsAdjust}
                        onClick={openSnapshotIoWorkspace}
                        disabled={snapshotEntryRequired}
                      >
                        Devices
                      </Button>
                      <Button
                        size="sm"
                        kind={!flowChain ? 'primary' : 'ghost'}
                        renderIcon={Edit}
                        onClick={() => selectFlowIndex(index)}
                        disabled={snapshotEntryRequired}
                      >
                        {flowChain ? 'Edit chain' : 'Assign chain'}
                      </Button>
                      <Button
                        size="sm"
                        kind={flow.solo ? 'secondary' : 'ghost'}
                        className="juce-grid-page__flow-card-toggle"
                        style={{ '--flow-color': flow.color } as React.CSSProperties}
                        renderIcon={Headphones}
                        onClick={() => updateFlow(flow.id, { solo: !flow.solo })}
                        disabled={snapshotEditorMutationDisabled}
                      >
                        {flow.solo ? 'Solo on' : 'Solo off'}
                      </Button>
                      <Button
                        size="sm"
                        kind={flow.muted ? 'secondary' : 'ghost'}
                        className="juce-grid-page__flow-card-toggle"
                        style={{ '--flow-color': flow.color } as React.CSSProperties}
                        renderIcon={flow.muted ? VolumeMute : VolumeUp}
                        onClick={() => updateFlow(flow.id, { muted: !flow.muted })}
                        disabled={snapshotEditorMutationDisabled}
                      >
                        {flow.muted ? 'Muted' : 'Mute'}
                      </Button>
                    </div>
                  </div>

                  <div className="juce-grid-page__tablet-flow-details-row juce-grid-page__tablet-flow-details-row--level">
                    <FlowLevelControl
                      flowId={flow.id}
                      flowLabel={flowLabel}
                      value={flow.dryWetMix}
                      onChange={(value) => updateFlow(flow.id, { dryWetMix: value })}
                      disabled={snapshotEditorMutationDisabled}
                    />
                    {pluginCpuSum > 0 && (
                      <Tag type={pluginCpuSum >= 50 ? 'red' : 'blue'}>
                        <SegmentedLedText value={`CPU ${pluginCpuSum.toFixed(0)}%`} size="xs" color={FLOW_CARD_LED_COLOR} />
                      </Tag>
                    )}
                    <div className="juce-grid-page__flow-card-clip-bank" aria-label={`${flowLabel} clipping status`}>
                      <div
                        className={`juce-grid-page__flow-card-clip-readout ${flowInputClipActive ? 'is-active' : ''}`}
                        title={flowInputClipActive ? `Flow ${flowLabel} input clipping detected` : `Flow ${flowLabel} input is clean`}
                      >
                        <SegmentedLedText value="IN" size="xs" color={FLOW_CARD_CLIP_LED_COLOR} />
                      </div>
                      <div
                        className={`juce-grid-page__flow-card-clip-readout ${flowOutputClipActive ? 'is-active' : ''}`}
                        title={flowOutputClipActive ? `Flow ${flowLabel} output clipping detected` : `Flow ${flowLabel} output is clean`}
                      >
                        <SegmentedLedText value="OUT" size="xs" color={FLOW_CARD_CLIP_LED_COLOR} />
                      </div>
                      <div
                        className={`juce-grid-page__flow-card-clip-readout ${flowClipActive ? 'is-active' : ''}`}
                        title={flowClipActive ? `Flow ${flowLabel} channel clipping detected` : `Flow ${flowLabel} channel is clean`}
                      >
                        <SegmentedLedText value="CLIP" size="xs" color={FLOW_CARD_CLIP_LED_COLOR} />
                      </div>
                    </div>
                    {flow.solo && <Tag type="warm-gray">Solo</Tag>}
                    {flow.muted && <Tag type="red">Muted</Tag>}
                  </div>
                </div>
              )}

              <div className="juce-grid-page__flow-card-content">
                {signalCanvas}
              </div>
            </>
          ) : (
            <>
              <div className="juce-grid-page__flow-card-body">
                <div className="juce-grid-page__flow-card-content juce-grid-page__flow-card-content--compact">
                  {signalCanvas}
                </div>
              </div>
            </>
          )}
        </article>

        {!isTabletTouchLayout && (
          <>
            <div
              className={`juce-grid-page__live-path-arrow juce-grid-page__live-path-arrow--outgoing is-${arrowTone} ${arrowDashed ? 'is-dashed' : ''}`}
              aria-hidden
            >
              <span className="juce-grid-page__live-path-arrow-line" />
              <ArrowRight size={18} />
            </div>

            <div className="juce-grid-page__live-path-side juce-grid-page__live-path-side--meta">
              {branchLabel && (
                <span
                  className="juce-grid-page__live-path-side-copy juce-grid-page__live-path-side-copy--branch"
                  data-testid={`juce-grid-live-path-branch-${flow.id}`}
                >
                  {branchLabel}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  const SelectedPluginHeroIcon = getSelectedPluginHeroIcon(selectedPluginMeta, selectedPlugin)
  const bottomEditorHasSelection = Boolean(selectedPlugin)
  const bottomEditorShowsSnapshotInspector = !bottomEditorHasSelection
  const tabletEditorVisible = isTabletTouchLayout && tabletEditorOpen && bottomEditorHasSelection
  const bottomEditorOpen = !isTabletTouchLayout && effectModalOpen && bottomEditorHasSelection
  const bottomEditorAccentColor = getCategoryConfig(selectedPluginMeta?.category || 'Utility').color
  const selectedPluginIsSystemNoiseGate = selectedPlugin ? isSystemNoiseGatePlugin(selectedPlugin) : false
  const selectedPluginIndex = selectedPlugin && currentChain
    ? currentChain.plugins.findIndex((plugin) => (
      plugin.uri === selectedPlugin.uri
      && plugin.position === selectedPlugin.position
    ))
    : -1
  const canMoveSelectedPluginLeft = selectedPluginIndex > 0 && currentChain
    ? !selectedPluginIsSystemNoiseGate && !isSystemNoiseGatePlugin(currentChain.plugins[selectedPluginIndex - 1])
    : false
  const canMoveSelectedPluginRight = selectedPluginIndex >= 0 && currentChain
    ? !selectedPluginIsSystemNoiseGate && selectedPluginIndex < currentChain.plugins.length - 1
    : false
  const selectedBlockMidiPanelEnabled = Boolean(
    bottomEditorOpen
    && selectedPlugin
    && selectedPluginMeta
    && !isMobile
    && !isTabletTouchLayout
    && (selectedPluginMeta.parameters?.length ?? 0) > 0
    && selectedPluginMeta.format !== 'Hardware'
    && !selectedPluginMeta.is_hardware
    && !selectedPlugin.uri.startsWith('hardware://')
  )
  const selectedPluginEditorContent = (bottomEditorOpen || tabletEditorVisible) && selectedPlugin ? (
    selectedPluginCard
      && selectedPluginCardStrategy
      && selectedPluginCardStrategy.renderMode !== 'generic'
      && selectedPluginMeta
      && selectedPluginMeta.format !== 'Hardware'
      && !selectedPluginMeta.is_hardware
      && !selectedPluginMeta.uri.startsWith('hardware://') ? (
      <PluginCardRouter
        plugin={selectedPluginCard}
        chainId={currentChain?.id}
        pluginPosition={selectedPlugin.position}
        showAddToChain={false}
        compact={isTabletTouchLayout || Boolean(selectedPluginCardStrategy.forceCompact)}
        forceTemplate={selectedPluginCardStrategy.renderMode === 'template' ? selectedPluginCardStrategy.template : undefined}
        onLoaderStateChange={handleSelectedPluginLoaderStateChange}
        disabled={snapshotEditorMutationDisabled}
      />
    ) : (
      <JuceGridParameterEditor
        plugin={selectedPlugin}
        meta={selectedPluginMeta}
        onParameterChange={handleParameterChange}
        onParameterChangeEnd={handleParameterChangeEnd}
        onToggleBypass={handleToggleSelectedBypass}
        onRefreshPlugins={handleRefreshPlugins}
        isRefreshing={isRefreshingPlugins}
        touchMode={isTabletTouchLayout}
        readOnly={snapshotEditorMutationDisabled}
        flowLabel={activeFlow?.label ?? activeFlowLabel}
        flowColor={activeFlow?.color ?? getFlowCardPaletteEntry(activeFlowIndex).color}
      />
    )
  ) : null
  const canPageTabletFocusedBranchBackward = tabletFocusedBranchPage > 0
  const canPageTabletFocusedBranchForward = tabletFocusedBranchPage < tabletFocusedBranchPageCount - 1
  const liveRuntimeDisplayState = resolvePreferredLiveRuntimeDisplayState({
    authoritativeAudioState,
  })
  const liveRuntimeActive = liveRuntimeDisplayState === 'live' || liveRuntimeDisplayState === 'live_warning'
  // Snapshot management hero — new Build Workflow design (2026-04-25). Wires
  // every section to its single source of truth:
  //   • engine sync   → liveBadgeState (computeLiveBadgeState)
  //   • routing map   → routing.mode + ROUTING_MODE_OPTIONS
  //   • active channel→ activeChannelStatusRail memo
  //   • morph pad     → <MorphPad/> (state-authority API)
  const buildWorkflowEngineSync: { tone: 'live' | 'publishing' | 'desync' | 'idle'; label: string } = (() => {
    switch (liveBadgeState) {
      case 'live_confirmed': return { tone: 'live', label: 'Engine in sync' }
      case 'publishing': return { tone: 'publishing', label: 'Publishing…' }
      case 'engine_desync': return { tone: 'desync', label: 'Engine desync' }
      case 'idle':
      default: return { tone: 'idle', label: 'Engine idle' }
    }
  })()
  const buildWorkflowChannelCounts = useMemo(() => {
    const active = authoritativeAudioState?.derived.active_channel_count ?? activeSnapshot?.live_state?.paths.length ?? null
    const total = authoritativeAudioState?.derived.total_channel_count ?? activeSnapshot?.channels.length ?? activeSnapshot?.paths.length ?? null
    return { active, total }
  }, [authoritativeAudioState, activeSnapshot])
  const buildWorkflowUpdatedAtLabel = useMemo(() => {
    const raw = activeSnapshot?.updated_at
    if (!raw) return null
    const ts = new Date(raw).getTime()
    if (!Number.isFinite(ts)) return null
    const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000))
    if (seconds < 30) return 'updated just now'
    if (seconds < 90) return 'updated a minute ago'
    if (seconds < 3600) return `updated ${Math.round(seconds / 60)} min ago`
    if (seconds < 86_400) return `updated ${Math.round(seconds / 3600)} hr ago`
    return `updated ${Math.round(seconds / 86_400)} d ago`
  }, [activeSnapshot?.updated_at])
  const pedalboardBuildWizard = (
    <PedalboardBuildWizard
      activeWorkspaceActionId={snapshotInspectorWorkspaceActionId}
      onOpenSignalGrid={openSignalGridWorkspace}
      onOpenDirectory={handleAddPlugin}
      directoryDisabled={snapshotEditingLocked}
      onOpenParameters={openSelectedBlockEditor}
      parametersDisabled={!selectedPlugin || snapshotEntryRequired}
      onOpenAutomation={openAutomationWorkspace}
      onOpenVersionHistory={openVersionHistoryWorkspace}
      versionHistoryDisabled={!activeSnapshot}
      onOpenProgressModal={openGuidedProgress}
      onOpenSnapshots={() => navigate('/snapshots')}
      onCreateSnapshot={() => createCapturedSnapshot()}
      createSnapshotPending={createSnapshotFromEditorMutation.isPending}
      onOpenHelp={openKeyboardHelpWorkspace}
      snapshotTitle={activeSnapshot?.name ?? 'No snapshot loaded'}
      activeChannelCount={buildWorkflowChannelCounts.active}
      channelCount={buildWorkflowChannelCounts.total}
      chainCount={activeSnapshot?.chain_count ?? null}
      updatedAtLabel={buildWorkflowUpdatedAtLabel}
      engineSyncTone={buildWorkflowEngineSync.tone}
      engineSyncLabel={buildWorkflowEngineSync.label}
    />
  )
  if (showViewportBlockScreen) {
    return (
      <div className="juce-grid-page">
        <div className="juce-grid-page__viewport-block" role="alert" aria-live="polite">
          <MapAudioGridIcon size={120} />
          <h1 className="juce-grid-page__viewport-block-heading">This experience requires a 560x917 or larger display</h1>
          {showViewportRotateHint && (
            <p>Maximize the browser window or move to a larger display, then reopen Audio Grid.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`juce-grid-page ${isTabletTouchLayout ? 'is-tablet-mode' : ''}`}>
      <LandscapePrompt componentId="juce-grid" />
      {snapshotLoadFailureMessage ? (
        <div className="juce-grid-page__inline-error" role="alert">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Snapshot load failed"
            subtitle={snapshotLoadFailureMessage}
          />
          <Button
            size="sm"
            kind="tertiary"
            renderIcon={Renew}
            onClick={() => authoritySnapshotDetailQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {/* T2451: first-class audio-disconnect banner for the snapshot editor. */}
      <AudioDeviceDisconnectedBanner
        health={deviceHealthQuery.data ?? null}
        onRecovered={() => { void deviceHealthQuery.refetch() }}
      />
      <section className="juce-grid-page__signal-flow-shell juce-grid-page__signal-flow-shell--hero" aria-label="Snapshot hero">
        <div className="juce-grid-page__unified-block">
          <SnapshotEditorSnapshotStatusPanel
            onOpenSnapshots={() => navigate('/snapshots')}
            onCreateSnapshot={() => createCapturedSnapshot()}
            createSnapshotPending={createSnapshotFromEditorMutation.isPending}
            selectedChainId={activeFlow?.chainId ?? null}
            onChainSelect={(chainId) => {
              if (!activeFlow) return
              if (snapshotEditorMutationDisabled) return
              updateFlow(activeFlow.id, { chainId })
            }}
            onSelectedChainRemoved={handleChainRemoved}
            flowSlots={flowSlots}
            focusedFlowLabel={activeFlowLabel}
            onToggleSelectedChainActive={handleToggleChainActive}
            onDuplicateChain={handleDuplicateChain}
            onRenameChain={handleRenameChain}
            pluginMeta={pluginMeta}
            onPluginChipClick={(chainId, pluginUri, pluginPosition) => {
              if (!activeFlow) return
              if (snapshotEntryRequired) return
              if (snapshotEditingLocked && activeFlow.chainId !== chainId) return
              updateFlow(activeFlow.id, { chainId })
              handlePluginSelect(pluginUri, pluginPosition)
            }}
            liveSnapshot={activeSnapshot}
            editorSnapshotDraft={currentSnapshotDraft}
            runtimeLiveState={runtimeLiveState}
            authoritativeAudioState={authoritativeAudioState}
            onRenameSnapshot={handleRenameSnapshot}
            snapshotNameEditing={editingSnapshotName}
            snapshotNameDraft={renameSnapshotName}
            snapshotNameError={renameSnapshotError}
            onSnapshotNameDraftChange={setRenameSnapshotName}
            onSubmitSnapshotName={submitRenameSnapshot}
            onCancelSnapshotRename={cancelRenameSnapshot}
            snapshotRenamePending={renameActiveSnapshotMutation.isPending}
            snapshotProgramValue={snapshotProgramValue}
            onSnapshotProgramValueChange={setSnapshotProgramValue}
            onSaveSnapshotProgram={submitSnapshotProgram}
            snapshotProgramPending={updateActiveSnapshotProgramMutation.isPending}
            snapshotProgramDisabled={!activeSnapshot || snapshotEditingLocked}
            onSaveDraft={handleSaveDraft}
            saveDraftPending={updateActiveSnapshotMutation.isPending}
            saveDraftDisabled={!activeSnapshot || snapshotEditingLocked || updateActiveSnapshotMutation.isPending || !snapshotsDirty}
            onGoLive={handleGoLive}
            goLiveState={snapshotGoLiveState}
            goLiveActionLabel={goLiveActionLabel}
            goLiveHelperText={goLiveHelperText}
            liveReadinessItems={goLiveReadinessItems}
            liveActivationProgress={goLiveProgress}
            goLiveFixActions={goLiveFixActions}
            goLiveDiffItems={visibleGoLiveDiff?.items ?? null}
            goLiveDiffExpanded={goLiveDiffExpanded}
            onToggleGoLiveDiff={() => setGoLiveDiffExpanded((current) => !current)}
            onDismissGoLiveDiff={() => {
              if (!goLiveDiffKey) {
                return
              }
              setDismissedGoLiveDiffKey(goLiveDiffKey)
              setGoLiveDiffExpanded(false)
            }}
            onSubmitSnapshotDescription={(description) => {
              if (!activeSnapshot) {
                return
              }
              updateActiveSnapshotDescriptionMutation.mutate({ snapshotId: activeSnapshot.id, description })
            }}
            snapshotDescriptionPending={updateActiveSnapshotDescriptionMutation.isPending}
            onSubmitTempoBpm={(tempoBpm) => {
              if (!activeSnapshot) {
                return
              }
              updateActiveSnapshotTempoMutation.mutate({ snapshotId: activeSnapshot.id, tempoBpm })
            }}
            tempoPending={updateActiveSnapshotTempoMutation.isPending}
            abSwitchVisible={abSwitchEnabled}
            abSwitchActiveLabel={abSwitchActiveLabel}
            abSwitchNextLabel={abSwitchNextLabel}
            abSwitchDisabled={snapshotEditingLocked || updateLiveSnapshotRoutingMutation.isPending || !abSwitchAlternateFlow}
            abSwitchPending={updateLiveSnapshotRoutingMutation.isPending}
            onToggleAbSwitch={toggleAbSwitch}
            monitoringStatusLabel={monitoringStatusLabel}
            monitoringStatusWarning={monitoringStatusWarning}
            outputLevelWarningMessage={outputLevelWarningMessage}
            onOpenProgressModal={openGuidedProgress}
            liveBadgeState={liveBadgeState}
            publishReadiness={heroPublishReadiness}
            isSnapshotLocked={Boolean(activeSnapshot?.is_locked)}
            onToggleSnapshotLock={() => toggleActiveSnapshotLockMutation.mutate()}
            toggleSnapshotLockPending={toggleActiveSnapshotLockMutation.isPending}
            onCopyHeroMetadataValue={handleHeroCopyMetadataValue}
            onConfirmPublish={() => heroConfirmPublishMutation.mutate()}
            onRejectPublish={handleHeroNavigateToPublishPage}
            onReconcilePublish={() => heroReconcilePublishMutation.mutate()}
            onOverwriteLive={() => heroOverwriteLiveMutation.mutate()}
            onViewPublishErrors={handleHeroNavigateToPublishPage}
            publishActionPending={heroPublishActionPending}
          />
          {/* T2454 slice 1C: operator-curated preload slots. Lives below the
              snapshot hero so pinning is one click away from the active
              snapshot. The "Add selected" affordance pins the snapshot
              currently loaded in the editor. */}
          <SnapshotPreloadSlotsPanel
            snapshotNamesById={snapshotNamesById}
            selectedSnapshotId={currentEditorSnapshotId}
          />
        </div>
      </section>

      {showCompactWorkflowPanels && (
        <Layer className="juce-grid-page__compact-tabs">
          <Tabs
            selectedIndex={Math.max(0, COMPACT_TAB_ORDER.findIndex((tab) => tab.id === compactTab))}
            onChange={({ selectedIndex }) => {
              setCompactTab(COMPACT_TAB_ORDER[selectedIndex]?.id ?? 'grid')
            }}
          >
            <TabList aria-label="Audio Grid compact workflows" contained>
              {COMPACT_TAB_ORDER.map((tab) => (
                <Tab key={tab.id}>{tab.label}</Tab>
              ))}
            </TabList>
          </Tabs>
        </Layer>
      )}

      <section
        ref={signalFlowShellRef}
        className="juce-grid-page__signal-flow-shell juce-grid-page__signal-flow-shell--body"
        aria-label="Signal flow workspace"
        tabIndex={0}
        data-snapshot-canvas-focus-root="true"
      >

        <div className="juce-grid-page__unified-block">
          <section className="juce-grid-page__main" aria-label="Snapshot editor workspace">
            {snapshotEntryRequired && (
              <Tile className="juce-grid-page__effect-modal-placeholder">
                <div className="juce-grid-page__parameter-editor-copy">
                  <p className="juce-grid-page__dense-card-kicker">Snapshot required</p>
                  <h3 className="juce-grid-page__selected-block-placeholder-heading">Chain editor is waiting for a snapshot</h3>
                  <p>Click Add effect to create a clean draft snapshot, or load an existing snapshot from the library before editing the signal path.</p>
                </div>
                <Button size="sm" kind="ghost" onClick={reopenSnapshotEntryPoint}>
                  Load snapshot
                </Button>
              </Tile>
            )}
            <section className="juce-grid-page__slot-grid" aria-label="Signal flows">
              {livePathLayout.groups.map((group, groupIndex) => (
                <div
                  key={group.id}
                  className={`juce-grid-page__live-path-group juce-grid-page__live-path-group--${group.kind} ${group.tone === 'dim' ? 'is-dim' : ''}`}
                >
                  <div className={`juce-grid-page__live-path-flow-stack juce-grid-page__live-path-flow-stack--${group.kind} ${group.dashed ? 'is-dashed' : ''}`}>
                    {group.flowIds.map((flowId, groupIndex) => {
                      const connectorLabel = group.kind === 'series' && groupIndex < group.flowIds.length - 1
                        ? 'Series'
                        : group.kind === 'morph' && groupIndex === 0 && group.flowIds.length > 1
                          ? `Morph ${Math.round(routing.morphProgress * 100)}%`
                          : null
                      const connectorTone = group.kind === 'morph'
                        ? routing.morphProgress > 0 ? 'active' : 'dim'
                        : group.tone === 'active' ? 'active' : 'dim'
                      const connectorDashed = group.kind === 'morph'
                        ? routing.morphProgress <= 0
                        : Boolean(group.dashed)

                      return (
                        <div key={`${group.id}-${flowId}`} className="juce-grid-page__live-path-item">
                          {renderLivePathFlowCard(flowId, group.kind)}
                          {connectorLabel && (
                            <div
                              className={`juce-grid-page__live-path-connector is-${connectorTone} ${connectorDashed ? 'is-dashed' : ''}`}
                              aria-hidden
                            >
                              <div className="juce-grid-page__live-path-connector-arrow">
                                <span className="juce-grid-page__live-path-connector-shaft" />
                                <ArrowDown size={16} />
                                <span className="juce-grid-page__live-path-connector-shaft" />
                              </div>
                              <span>{connectorLabel}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          </section>
        </div>
      </section>

      <SnapshotEditorCompactPanels
        visible={showCompactWorkflowPanels}
        compactTab={compactTab}
        snapshotEntryRequired={snapshotEntryRequired}
        selectedPlugin={selectedPlugin}
        openSelectedBlockEditor={openSelectedBlockEditor}
        openSnapshotProgressModal={openSnapshotProgressModal}
        snapshotEditorMutationDisabled={snapshotEditorMutationDisabled}
        activeRoutingMode={activeRoutingMode}
        activeFlowLabel={activeFlowLabel}
        routing={routing}
      />


      <SnapshotEditorBottomEditor
        visible={!isTabletTouchLayout}
        bottomEditorRef={bottomEditorRef}
        bottomEditorOpen={bottomEditorOpen}
        bottomEditorShowsSnapshotInspector={bottomEditorShowsSnapshotInspector}
        bottomEditorAccentColor={bottomEditorAccentColor}
        selectedPlugin={selectedPlugin}
        selectedPluginMeta={selectedPluginMeta}
        selectedPluginHeroIcon={SelectedPluginHeroIcon}
        snapshotEditorMutationDisabled={snapshotEditorMutationDisabled}
        snapshotEditingLocked={snapshotEditingLocked}
        snapshotEntryRequired={snapshotEntryRequired}
        selectedBlockMidiPanelEnabled={selectedBlockMidiPanelEnabled}
        selectedPluginEditorContent={selectedPluginEditorContent}
        pedalboardBuildWizard={pedalboardBuildWizard}
        chainId={currentChain?.id ?? null}
        lastMidiEvent={lastMidiEvent}
        midiLearnInProgress={midiLearnInProgress}
        midiLearnTarget={midiLearnStatus?.target ?? null}
        activeSnapshot={activeSnapshot}
        snapshotsDirty={snapshotsDirty}
        activeSnapshotBlockCount={currentChain?.plugins.length ?? 0}
        renderSelectedBlockNavBar={renderSelectedBlockNavBar}
        onStartMidiLearn={handleStartSelectedBlockMidiLearn}
        onStopMidiLearn={handleStopSelectedBlockMidiLearn}
        onCloseEditor={handleCloseEffectModal}
        onOpenEditor={openSelectedBlockEditor}
        onOpenVersionHistory={openVersionHistoryWorkspace}
        onOpenGuidedProgress={openGuidedProgress}
        getDisplayPluginName={getDisplayPluginName}
      />

      {isTabletTouchLayout && (
        <SnapshotEditorTabletLayout
          createSnapshotPending={createSnapshotFromEditorMutation.isPending}
          updateSnapshotPending={updateActiveSnapshotMutation.isPending}
          activeSnapshot={activeSnapshot}
          snapshotEditingLocked={snapshotEditingLocked}
          snapshotSetlistMode={snapshotSetlistMode}
          snapshotSetlistModePending={snapshotSetlistModePending}
          snapshotSetlistModeTitle={snapshotSetlistModeTitle}
          snapshotEditorMutationDisabled={snapshotEditorMutationDisabled}
          selectedPlugin={selectedPlugin}
          selectedPluginMeta={selectedPluginMeta}
          selectedPluginHeroIcon={SelectedPluginHeroIcon}
          selectedPluginIsSystemNoiseGate={selectedPluginIsSystemNoiseGate}
          tabletFocusedFlow={tabletFocusedFlow}
          tabletEditorVisible={tabletEditorVisible}
          bottomEditorAccentColor={bottomEditorAccentColor}
          canPageTabletFocusedBranchBackward={canPageTabletFocusedBranchBackward}
          canPageTabletFocusedBranchForward={canPageTabletFocusedBranchForward}
          tabletFocusedBranchPageLabel={tabletFocusedBranchPageLabel}
          selectedPluginEditorContent={selectedPluginEditorContent}
          renderSelectedBlockNavBar={renderSelectedBlockNavBar}
          renderTabletLoadButton={renderTabletLoadButton}
          bottomEditorRef={bottomEditorRef}
          onCreateSnapshot={() => createCapturedSnapshot()}
          onUpdateSnapshot={() => updateActiveSnapshotMutation.mutate()}
          onToggleSetlistMode={() => { void toggleSnapshotSetlistMode() }}
          onOpenEditor={openSelectedBlockEditor}
          onAddEffect={handleTabletAddEffect}
          onStepBranchPageLeft={() => stepTabletFocusedBranchPage('left')}
          onStepBranchPageRight={() => stepTabletFocusedBranchPage('right')}
          onToggleBypass={handleToggleSelectedBypass}
          onClearSelection={() => {
            setSelectedPluginSelection(null)
            setTabletEditorOpen(false)
          }}
          onDeletePlugin={(info) => setPendingTabletDeletePlugin(info)}
          onCloseEditor={handleCloseEffectModal}
        />
      )}

      <SnapshotEditorChainDialogs
        pendingTabletDeletePlugin={pendingTabletDeletePlugin}
        isDeletePending={deleteMutation.isPending}
        onCloseTabletDelete={() => setPendingTabletDeletePlugin(null)}
        onConfirmTabletDelete={confirmTabletDeleteSelectedPlugin}
        showSavePresetModal={showSavePresetModal}
        saveChainLabel={currentChain?.name || 'Current chain'}
        savePresetName={savePresetName}
        saveHasChain={!!currentChain}
        isSavingPreset={savePresetMutation.isPending}
        onCloseSavePreset={() => {
          setShowSavePresetModal(false)
          setSavePresetName('')
        }}
        onSavePresetNameChange={setSavePresetName}
        onSubmitSavePreset={submitSavePreset}
        showRenameChainModal={showRenameChainModal}
        renameChainLabel={currentChain?.name || 'Current chain'}
        renameChainName={renameChainName}
        renameHasChain={!!currentChain}
        isRenameSaving={renameMutation.isPending}
        onCloseRenameChain={() => {
          setShowRenameChainModal(false)
          setRenameChainName('')
        }}
        onRenameChainNameChange={setRenameChainName}
        onSubmitRenameChain={submitRenameChain}
        presetPendingDelete={presetPendingDelete}
        isDeletePresetPending={deletePresetMutation.isPending}
        onClosePresetDelete={() => setPresetPendingDelete(null)}
        onConfirmDeletePreset={confirmDeletePreset}
        showClearFlowsModal={showClearFlowsModal}
        onCloseClearFlows={() => setShowClearFlowsModal(false)}
        onConfirmClearFlows={confirmClearFlows}
      />
      <SnapshotEditorMidiMappingsModal open={midiModalOpen} onClose={closeMidiMappingsWorkspace}>
        {renderMidiMappingsWorkspace({ closable: false })}
      </SnapshotEditorMidiMappingsModal>

      <SnapshotEditorRoutingInspector
        content={routingInspectorContent}
        onClose={() => setRoutingInspectorId(null)}
      />

      {/* Plugin Browser Modal */}
      <SnapshotEditorPluginBrowser
        open={showPluginBrowser}
        mode={pluginBrowserMode}
        onChangeMode={setPluginBrowserMode}
        onClose={() => setShowPluginBrowser(false)}
        searchQuery={pluginSearchQuery}
        onChangeSearchQuery={setPluginSearchQuery}
        categories={categories}
        selectedCategory={selectedCategory}
        onChangeSelectedCategory={setSelectedCategory}
        nativeCount={nativeProcessors.length}
        lv2Count={lv2Plugins.length}
        favoriteVisibleCount={favoriteVisibleCount}
        featuredNativeGroups={featuredNativeGroups}
        remainingNativeProcessors={remainingNativeProcessors}
        groupedPlugins={groupedPlugins}
        favoritePlugins={favoritePlugins}
        toggleFavorite={toggleFavorite}
        collapsedCategories={collapsedCategories}
        setCollapsedCategories={setCollapsedCategories}
        expandAllCategories={expandAllCategories}
        collapseAllCategories={collapseAllCategories}
        currentChain={currentChain}
        snapshotEditingLocked={snapshotEditingLocked}
        onAddPluginToCurrentChain={handleAddPluginToCurrentChain}
        onShowDetails={handleShowDetails}
      />


      {/* Preset Browser Modal */}
      <SnapshotEditorPresetBrowser
        open={showPresetBrowser}
        presets={presets}
        loadPending={loadPresetMutation.isPending}
        deletePending={deletePresetMutation.isPending}
        onClose={() => setShowPresetBrowser(false)}
        onOpenImport={() => {
          setShowPresetBrowser(false)
          setShowImportDialog(true)
        }}
        onLoad={(presetId) => loadPresetMutation.mutate(presetId)}
        onDelete={(preset) => handleDeletePresetRequest(preset)}
      />

      <SnapshotEditorAuxModals
        showImportDialog={showImportDialog}
        onCloseImportDialog={() => setShowImportDialog(false)}
        onImportSuccess={(_presetId, name) => {
          queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
          pushToast(`Imported "${name}" successfully`, 'success')
        }}
        assignmentDialogOpen={assignmentDialogOpen}
        selectedFlowForAssignment={selectedFlowForAssignment}
        assignmentSelectedNodeId={assignmentSelectedNodeId}
        assignmentRedundancyEnabled={assignmentRedundancyEnabled}
        isAssigningFlow={isAssigningFlow}
        assignmentAnalysisLoading={assignmentAnalysisQuery.isLoading}
        assignmentNodes={assignmentNodes}
        recommendedAssignmentNodes={recommendedAssignmentNodes}
        assignmentAnalysis={assignmentAnalysis}
        isSuitableAssignmentNode={isSuitableAssignmentNode}
        onCloseAssignmentDialog={closeAssignmentDialog}
        onSubmitAssignment={() => handleAssignFlow(assignmentSelectedNodeId, assignmentRedundancyEnabled)}
        onAssignmentSelectNode={setAssignmentSelectedNodeId}
        onAssignmentRedundancyChange={setAssignmentRedundancyEnabled}
        detailsPlugin={detailsPlugin}
        onCloseDetails={() => setDetailsPlugin(null)}
        showKeyboardHelp={showKeyboardHelp}
        onCloseKeyboardHelp={() => setShowKeyboardHelp(false)}
        onOpenDocs={() => {
          setShowKeyboardHelp(false)
          openPlatformDocs('QUICK_REFERENCE.md')
        }}
        showVersionHistoryModal={showVersionHistoryModal}
        versionHistorySnapshotName={activeSnapshot?.name}
        versionHistoryRevisions={snapshotRevisionsQuery.data?.revisions ?? []}
        versionHistoryLoading={snapshotRevisionsQuery.isPending}
        versionHistoryErrorMessage={
          snapshotRevisionsQuery.error instanceof Error
            ? snapshotRevisionsQuery.error.message
            : null
        }
        versionHistoryRestoringRevisionNumber={
          restoreSnapshotRevisionMutation.isPending
            ? (restoreSnapshotRevisionMutation.variables?.revisionNumber ?? null)
            : null
        }
        onCloseVersionHistory={closeVersionHistoryWorkspace}
        onRestoreRevision={(revision) => {
          if (!activeSnapshot) {
            return
          }
          restoreSnapshotRevisionMutation.mutate({
            snapshotId: activeSnapshot.id,
            revisionNumber: revision.revision_number,
          })
        }}
      />


      {/* Automation Timeline Bottom Panel */}
      {automationTimelineExpanded && (
        <div
          id="juce-grid-automation-panel"
          ref={automationPanelRef}
          className="juce-grid-page__automation-panel"
        >
          {renderAutomationWorkspace({ compact: isCompactLayout })}
        </div>
      )}

      <SnapshotEditorAutomationToggle
        expanded={automationTimelineExpanded}
        onToggle={() => setAutomationTimelineExpanded((previous) => !previous)}
        disabled={snapshotEntryRequired}
        style={automationFloatingToggleStyle}
        title={automationFloatingToggleTitle}
      />

      <SnapshotEditorRoutingModals
        lanePickerOpen={lanePickerOpen}
        lanePickerChain={currentChain}
        lanePickerExistingLaneCount={automationLanes.length}
        onCloseLanePicker={() => setLanePickerOpen(false)}
        onAddLane={(lane) => setAutomationLanes((prev) => [...prev, lane])}
        portSelectorOpen={portSelectorFlowIndex !== null}
        portSelectorChainId={
          portSelectorFlowIndex !== null ? flowSlots[portSelectorFlowIndex]?.chainId : null
        }
        portSelectorFlowLabel={
          portSelectorFlowIndex !== null ? (SLOT_COLORS[portSelectorFlowIndex]?.label || '') : undefined
        }
        portSelectorFlowColor={
          portSelectorFlowIndex !== null ? (SLOT_COLORS[portSelectorFlowIndex]?.color || '#2563eb') : undefined
        }
        portSelectorReadOnly={snapshotEditorMutationDisabled}
        onClosePortSelector={() => setPortSelectorFlowIndex(null)}
        onPortsChange={() => {
          queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
          const label = portSelectorFlowIndex !== null ? SLOT_COLORS[portSelectorFlowIndex]?.label : ''
          pushToast(`Flow ${label} port routing updated`, 'success')
        }}
      />

      <SnapshotEditorWorkspaceModals
        showPerformModal={showPerformModal}
        onClosePerformWorkspace={closePerformWorkspace}
        showAudioNodesModal={showAudioNodesModal}
        onCloseAudioRoutingWorkspace={closeAudioRoutingWorkspace}
        showLiveRuntimeModal={showLiveRuntimeModal}
        onCloseLiveRuntimeWorkspace={closeLiveRuntimeWorkspace}
        liveChainProjection={liveChainProjection}
        showLiveChainSummaryOnly={showLiveChainSummaryOnly}
        liveChainMismatch={liveChainMismatch}
        liveChainProjectionOverflow={liveChainProjectionOverflow}
        onUpdateLiveChains={handleUpdateLiveChains}
        onRevertEditorToLive={handleRevertEditorToLive}
        updateAuthorityLivePending={updateAuthorityLiveChainsMutation.isPending}
        onKillLiveChain={handleKillLiveChain}
      />

    </div>
  )
}

export default SnapshotEditorPage
