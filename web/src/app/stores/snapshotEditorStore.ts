import { create } from 'zustand'
import type { Plugin, Snapshot, SnapshotDetail } from '../../map2/types'
import type { AutomationLane } from '../grid/shared'
import {
  createDefaultJuceGridRouting,
  normalizeJuceGridStateSources,
  type JuceGridFlowNormalizationOptions,
  type JuceGridFlowSlotState,
  type JuceGridRoutingState,
} from '../components/SnapshotEditor/snapshotEditorFlowState'
import { buildSnapshotIoModalState, type SnapshotIoModalState } from '../utils/snapshotIoBindings'
import type { SnapshotRoutingLiveApplyState } from '../utils/snapshotRoutingLiveState'
import type { SnapshotAbSwitchMidiMessageType } from '../utils/snapshotAbSwitchMidi'
import type { JuceGridRoutingMarkerId } from '../components/SnapshotEditor/SnapshotEditorRoutingVisualizer'

export const SNAPSHOT_EDITOR_FLOWS_STORAGE_KEY = 'map2_juce_grid_flows_v2'
export const SNAPSHOT_EDITOR_FLOWS_LEGACY_STORAGE_KEY = 'map2_grid_flows_v2'
export const SNAPSHOT_EDITOR_ROUTING_STORAGE_KEY = 'map2_juce_grid_routing_v2'
export const SNAPSHOT_EDITOR_ROUTING_LEGACY_STORAGE_KEY = 'map2_grid_routing_v2'
export const SNAPSHOT_EDITOR_ACTIVE_STORAGE_KEY = 'map2_juce_grid_active_v2'
export const SNAPSHOT_EDITOR_ACTIVE_LEGACY_STORAGE_KEY = 'map2_grid_active_v2'
export const SNAPSHOT_EDITOR_PLUGIN_CATEGORY_STORAGE_KEY = 'map2_juce_grid_plugin_category'
export const SNAPSHOT_EDITOR_PLUGIN_CATEGORY_LEGACY_STORAGE_KEY = 'map2_grid_plugin_category'
export const SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_STORAGE_KEY = 'map2_juce_grid_collapsed_categories'
export const SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_LEGACY_STORAGE_KEY = 'map2_grid_collapsed_categories'

export type CompactTabId = 'grid' | 'editor' | 'routing' | 'presets'

export type JuceGridMidiScope = 'all' | 'active-chain' | 'selected-plugin'

export type ReorderDirection = 'left' | 'right'

export interface MidiRangeDraft {
  min: string
  max: string
  sourceMin: string
  sourceMax: string
}

export type ReorderPreviewState = {
  pluginUri: string
  pluginPosition: number
  targetUri: string
  targetPosition: number
  direction: ReorderDirection
} | null

export interface PendingTabletDeletePluginState {
  uri: string
  position: number
  name: string
}

export type ProgressModalTab = 'wizard' | 'advanced'
export type ProgressModalSection = 'overview' | 'routing' | 'devices' | 'runtime' | 'cleanup'

export interface MidiActivity {
  cc: number
  value: number
  channel: number
}

export interface PluginLevels {
  in: number
  out: number
}

export interface GoLiveFailureDetail {
  code?: string
  message?: string
  details?: unknown
}

export type FootswitchLabelDrafts = Record<string, string>

/**
 * Unified state store for SnapshotEditorPageContent.
 *
 * Grouped into 17 semantic buckets per T710-sub09 audit:
 *   A. Persistent grid state (localStorage write-through in sub11)
 *   B. Plugin selection / browsing
 *   C. Preset / snapshot name editing
 *   D. Delete / clear confirms
 *   E. Flow assignment dialog
 *   F. MIDI learn / drafts
 *   G. Favorites / mixing per-plugin
 *   H. Reorder preview
 *   I. Modals / workspace dialogs
 *   J. Tablet / branch / compact
 *   K. Automation timeline
 *   L. Snapshot IO / thresholds
 *   M. Dirty / pending snapshot lifecycle
 *   N. Clip timestamps
 *   O. Routing inspector
 *   P. Footswitch drafts
 *   Q. Port selector
 *
 * Action bodies are stubbed in this sub10 milestone. sub11 implements
 * localStorage write-through + unit tests. sub12 wires the page to consume.
 */
export interface SnapshotEditorState {
  flowSlots: JuceGridFlowSlotState[]
  routing: JuceGridRoutingState
  activeFlowIndex: number
  selectedCategory: string
  collapsedCategories: Set<string>

  selectedPluginUri: string | null
  selectedPluginPosition: number | null
  effectModalOpen: boolean
  showPluginBrowser: boolean
  showPresetBrowser: boolean
  pluginSearchQuery: string
  detailsPlugin: Plugin | null
  isRefreshingPlugins: boolean

  showSavePresetModal: boolean
  savePresetName: string
  editingSnapshotName: boolean
  renameSnapshotName: string
  showRenameChainModal: boolean
  renameChainName: string

  presetPendingDelete: Snapshot | null
  showClearFlowsModal: boolean
  pendingTabletDeletePlugin: PendingTabletDeletePluginState | null

  assignmentDialogOpen: boolean
  selectedFlowForAssignment: JuceGridFlowSlotState | null
  assignmentSelectedNodeId: string
  assignmentRedundancyEnabled: boolean
  isAssigningFlow: boolean

  midiLearnActive: boolean
  midiScope: JuceGridMidiScope
  midiRangeDrafts: Record<number, MidiRangeDraft>
  lastMidiActivityWs: MidiActivity | null
  midiModalOpen: boolean
  abSwitchMidiMessageTypeDraft: SnapshotAbSwitchMidiMessageType
  abSwitchMidiChannelDraft: string
  abSwitchMidiNumberDraft: number
  blockFocusMidiChannelDraft: string
  blockFocusStartNoteDraft: number

  favoritePlugins: Set<string>
  pluginLevels: Record<string, PluginLevels>
  wetDryMixes: Record<string, number>

  reorderPreview: ReorderPreviewState

  showKeyboardHelp: boolean
  showPerformModal: boolean
  showAudioNodesModal: boolean
  showProgressModal: boolean
  progressModalInitialTab: ProgressModalTab
  progressModalInitialSection: ProgressModalSection
  showLiveRuntimeModal: boolean
  showVersionHistoryModal: boolean
  showImportDialog: boolean

  compactTab: CompactTabId
  focusedBranchId: string | null
  expandedTabletBranchId: string | null
  branchPageByFlowId: Record<string, number>
  tabletEditorOpen: boolean

  automationTimelineExpanded: boolean
  automationPanelHeight: number
  automationPlaying: boolean
  automationRecording: boolean
  automationLoopEnabled: boolean
  automationCurrentTime: number
  automationDuration: number
  automationLanes: AutomationLane[]
  lanePickerOpen: boolean

  snapshotIoModalState: SnapshotIoModalState
  outputReferenceThresholdDraft: number
  noiseGateThresholdDraft: number
  noiseGateReleaseDraft: number

  snapshotsDirty: boolean
  snapshotSetlistModePending: boolean
  editorSnapshotOverride: SnapshotDetail | null
  editorSnapshotContext: SnapshotDetail | null
  pendingGoLiveSnapshotId: number | null
  pendingGoLiveRequestedAt: number | null
  confirmedGoLiveSnapshotId: number | null
  failedGoLiveSnapshotId: number | null
  goLiveFailureReason: string | null
  goLiveFailureDetail: GoLiveFailureDetail | null
  goLiveDiffExpanded: boolean
  dismissedGoLiveDiffKey: string | null

  flowClipTimestamps: Record<string, number>
  flowInputClipTimestamps: Record<string, number>
  flowOutputClipTimestamps: Record<string, number>

  routingInspectorId: JuceGridRoutingMarkerId | null
  routingLiveApplyState: SnapshotRoutingLiveApplyState

  footswitchLabelDrafts: FootswitchLabelDrafts

  portSelectorFlowIndex: number | null
}

export type Updater<T> = T | ((prev: T) => T)

export interface SnapshotEditorActions {
  setFlowSlots: (flowSlots: Updater<JuceGridFlowSlotState[]>) => void
  setRouting: (routing: Updater<JuceGridRoutingState>) => void
  setActiveFlowIndex: (index: Updater<number>) => void
  setSelectedCategory: (category: Updater<string>) => void
  setCollapsedCategories: (categories: Updater<Set<string>>) => void

  setSelectedPluginUri: (uri: Updater<string | null>) => void
  setSelectedPluginPosition: (position: Updater<number | null>) => void
  setSelectedPluginSelection: (uri: string | null, position?: number | null) => void
  setEffectModalOpen: (open: Updater<boolean>) => void
  setShowPluginBrowser: (open: Updater<boolean>) => void
  setShowPresetBrowser: (open: Updater<boolean>) => void
  setPluginSearchQuery: (query: Updater<string>) => void
  setDetailsPlugin: (plugin: Updater<Plugin | null>) => void
  setIsRefreshingPlugins: (refreshing: Updater<boolean>) => void

  setShowSavePresetModal: (open: Updater<boolean>) => void
  setSavePresetName: (name: Updater<string>) => void
  setEditingSnapshotName: (editing: Updater<boolean>) => void
  setRenameSnapshotName: (name: Updater<string>) => void
  setShowRenameChainModal: (open: Updater<boolean>) => void
  setRenameChainName: (name: Updater<string>) => void

  setPresetPendingDelete: (snapshot: Updater<Snapshot | null>) => void
  setShowClearFlowsModal: (open: Updater<boolean>) => void
  setPendingTabletDeletePlugin: (state: Updater<PendingTabletDeletePluginState | null>) => void

  setAssignmentDialogOpen: (open: Updater<boolean>) => void
  setSelectedFlowForAssignment: (flow: Updater<JuceGridFlowSlotState | null>) => void
  setAssignmentSelectedNodeId: (nodeId: Updater<string>) => void
  setAssignmentRedundancyEnabled: (enabled: Updater<boolean>) => void
  setIsAssigningFlow: (assigning: Updater<boolean>) => void

  setMidiLearnActive: (active: Updater<boolean>) => void
  setMidiScope: (scope: Updater<JuceGridMidiScope>) => void
  setMidiRangeDrafts: (drafts: Updater<Record<number, MidiRangeDraft>>) => void
  setLastMidiActivityWs: (activity: Updater<MidiActivity | null>) => void
  setMidiModalOpen: (open: Updater<boolean>) => void
  setAbSwitchMidiMessageTypeDraft: (type: Updater<SnapshotAbSwitchMidiMessageType>) => void
  setAbSwitchMidiChannelDraft: (channel: Updater<string>) => void
  setAbSwitchMidiNumberDraft: (number: Updater<number>) => void
  setBlockFocusMidiChannelDraft: (channel: Updater<string>) => void
  setBlockFocusStartNoteDraft: (note: Updater<number>) => void

  setFavoritePlugins: (favorites: Updater<Set<string>>) => void
  setPluginLevels: (levels: Updater<Record<string, PluginLevels>>) => void
  setWetDryMixes: (mixes: Updater<Record<string, number>>) => void

  setReorderPreview: (preview: Updater<ReorderPreviewState>) => void

  setShowKeyboardHelp: (open: Updater<boolean>) => void
  setShowPerformModal: (open: Updater<boolean>) => void
  setShowAudioNodesModal: (open: Updater<boolean>) => void
  setShowProgressModal: (open: Updater<boolean>) => void
  setProgressModalInitialTab: (tab: Updater<ProgressModalTab>) => void
  setProgressModalInitialSection: (section: Updater<ProgressModalSection>) => void
  setShowLiveRuntimeModal: (open: Updater<boolean>) => void
  setShowVersionHistoryModal: (open: Updater<boolean>) => void
  setShowImportDialog: (open: Updater<boolean>) => void

  setCompactTab: (tab: Updater<CompactTabId>) => void
  setFocusedBranchId: (id: Updater<string | null>) => void
  setExpandedTabletBranchId: (id: Updater<string | null>) => void
  setBranchPageByFlowId: (pages: Updater<Record<string, number>>) => void
  setTabletEditorOpen: (open: Updater<boolean>) => void

  setAutomationTimelineExpanded: (expanded: Updater<boolean>) => void
  setAutomationPanelHeight: (height: Updater<number>) => void
  setAutomationPlaying: (playing: Updater<boolean>) => void
  setAutomationRecording: (recording: Updater<boolean>) => void
  setAutomationLoopEnabled: (enabled: Updater<boolean>) => void
  setAutomationCurrentTime: (time: Updater<number>) => void
  setAutomationDuration: (duration: Updater<number>) => void
  setAutomationLanes: (lanes: Updater<AutomationLane[]>) => void
  setLanePickerOpen: (open: Updater<boolean>) => void

  setSnapshotIoModalState: (state: Updater<SnapshotIoModalState>) => void
  setOutputReferenceThresholdDraft: (value: Updater<number>) => void
  setNoiseGateThresholdDraft: (value: Updater<number>) => void
  setNoiseGateReleaseDraft: (value: Updater<number>) => void

  setSnapshotsDirty: (dirty: Updater<boolean>) => void
  setSnapshotSetlistModePending: (pending: Updater<boolean>) => void
  setEditorSnapshotOverride: (snapshot: Updater<SnapshotDetail | null>) => void
  setEditorSnapshotContext: (snapshot: Updater<SnapshotDetail | null>) => void
  setPendingGoLiveSnapshotId: (id: Updater<number | null>) => void
  setPendingGoLiveRequestedAt: (timestamp: Updater<number | null>) => void
  setConfirmedGoLiveSnapshotId: (id: Updater<number | null>) => void
  setFailedGoLiveSnapshotId: (id: Updater<number | null>) => void
  setGoLiveFailureReason: (reason: Updater<string | null>) => void
  setGoLiveFailureDetail: (detail: Updater<GoLiveFailureDetail | null>) => void
  setGoLiveDiffExpanded: (expanded: Updater<boolean>) => void
  setDismissedGoLiveDiffKey: (key: Updater<string | null>) => void

  setFlowClipTimestamps: (timestamps: Updater<Record<string, number>>) => void
  setFlowInputClipTimestamps: (timestamps: Updater<Record<string, number>>) => void
  setFlowOutputClipTimestamps: (timestamps: Updater<Record<string, number>>) => void

  setRoutingInspectorId: (id: Updater<JuceGridRoutingMarkerId | null>) => void
  setRoutingLiveApplyState: (state: Updater<SnapshotRoutingLiveApplyState>) => void

  setFootswitchLabelDrafts: (drafts: Updater<FootswitchLabelDrafts>) => void

  setPortSelectorFlowIndex: (index: Updater<number | null>) => void

  hydrateBucketAFromLocalStorage: (options: JuceGridFlowNormalizationOptions) => void
  persistFlowSlots: () => void
  persistRouting: () => void
  persistActiveFlowIndex: () => void
  persistSelectedCategory: () => void
  persistCollapsedCategories: () => void
}

export type SnapshotEditorStore = SnapshotEditorState & SnapshotEditorActions

const DEFAULT_ROUTING: JuceGridRoutingState = createDefaultJuceGridRouting()

function parseStoredJson(...keys: string[]): unknown {
  if (typeof localStorage === 'undefined') return null
  for (const key of keys) {
    const storedValue = localStorage.getItem(key)
    if (!storedValue) continue
    try {
      return JSON.parse(storedValue)
    } catch {
      // continue to next key
    }
  }
  return null
}

function readStringValue(primaryKey: string, legacyKey: string): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(primaryKey) ?? localStorage.getItem(legacyKey)
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage full / private mode — swallow
  }
}

export function readPersistedFlows(
  options: JuceGridFlowNormalizationOptions,
): { flowSlots: JuceGridFlowSlotState[]; routing: JuceGridRoutingState; activeFlowIndex: number } {
  return normalizeJuceGridStateSources(
    parseStoredJson(SNAPSHOT_EDITOR_FLOWS_STORAGE_KEY, SNAPSHOT_EDITOR_FLOWS_LEGACY_STORAGE_KEY),
    parseStoredJson(SNAPSHOT_EDITOR_ROUTING_STORAGE_KEY, SNAPSHOT_EDITOR_ROUTING_LEGACY_STORAGE_KEY),
    readStringValue(SNAPSHOT_EDITOR_ACTIVE_STORAGE_KEY, SNAPSHOT_EDITOR_ACTIVE_LEGACY_STORAGE_KEY),
    options,
  )
}

export function readPersistedSelectedCategory(): string {
  return (
    readStringValue(
      SNAPSHOT_EDITOR_PLUGIN_CATEGORY_STORAGE_KEY,
      SNAPSHOT_EDITOR_PLUGIN_CATEGORY_LEGACY_STORAGE_KEY,
    ) || 'all'
  )
}

export function readPersistedCollapsedCategories(): Set<string> {
  const raw = readStringValue(
    SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_STORAGE_KEY,
    SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_LEGACY_STORAGE_KEY,
  )
  if (!raw) return new Set<string>()
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set<string>(parsed.filter((v): v is string => typeof v === 'string')) : new Set()
  } catch {
    return new Set<string>()
  }
}

const DEFAULT_STATE: SnapshotEditorState = {
  flowSlots: [],
  routing: DEFAULT_ROUTING,
  activeFlowIndex: 0,
  selectedCategory: 'all',
  collapsedCategories: new Set<string>(),

  selectedPluginUri: null,
  selectedPluginPosition: null,
  effectModalOpen: false,
  showPluginBrowser: false,
  showPresetBrowser: false,
  pluginSearchQuery: '',
  detailsPlugin: null,
  isRefreshingPlugins: false,

  showSavePresetModal: false,
  savePresetName: '',
  editingSnapshotName: false,
  renameSnapshotName: '',
  showRenameChainModal: false,
  renameChainName: '',

  presetPendingDelete: null,
  showClearFlowsModal: false,
  pendingTabletDeletePlugin: null,

  assignmentDialogOpen: false,
  selectedFlowForAssignment: null,
  assignmentSelectedNodeId: '',
  assignmentRedundancyEnabled: false,
  isAssigningFlow: false,

  midiLearnActive: false,
  midiScope: 'all',
  midiRangeDrafts: {},
  lastMidiActivityWs: null,
  midiModalOpen: false,
  abSwitchMidiMessageTypeDraft: 'cc_toggle',
  abSwitchMidiChannelDraft: 'omni',
  abSwitchMidiNumberDraft: 80,
  blockFocusMidiChannelDraft: 'omni',
  blockFocusStartNoteDraft: 60,

  favoritePlugins: new Set<string>(),
  pluginLevels: {},
  wetDryMixes: {},

  reorderPreview: null,

  showKeyboardHelp: false,
  showPerformModal: false,
  showAudioNodesModal: false,
  showProgressModal: false,
  progressModalInitialTab: 'wizard',
  progressModalInitialSection: 'overview',
  showLiveRuntimeModal: false,
  showVersionHistoryModal: false,
  showImportDialog: false,

  compactTab: 'grid',
  focusedBranchId: null,
  expandedTabletBranchId: null,
  branchPageByFlowId: {},
  tabletEditorOpen: false,

  automationTimelineExpanded: false,
  automationPanelHeight: 0,
  automationPlaying: false,
  automationRecording: false,
  automationLoopEnabled: false,
  automationCurrentTime: 0,
  automationDuration: 60,
  automationLanes: [],
  lanePickerOpen: false,

  snapshotIoModalState: buildSnapshotIoModalState(null, null),
  outputReferenceThresholdDraft: 3,
  noiseGateThresholdDraft: -40,
  noiseGateReleaseDraft: 100,

  snapshotsDirty: false,
  snapshotSetlistModePending: false,
  editorSnapshotOverride: null,
  editorSnapshotContext: null,
  pendingGoLiveSnapshotId: null,
  pendingGoLiveRequestedAt: null,
  confirmedGoLiveSnapshotId: null,
  failedGoLiveSnapshotId: null,
  goLiveFailureReason: null,
  goLiveFailureDetail: null,
  goLiveDiffExpanded: false,
  dismissedGoLiveDiffKey: null,

  flowClipTimestamps: {},
  flowInputClipTimestamps: {},
  flowOutputClipTimestamps: {},

  routingInspectorId: null,
  routingLiveApplyState: 'idle',

  footswitchLabelDrafts: {},

  portSelectorFlowIndex: null,
}

function resolveUpdater<T>(prev: T, value: Updater<T>): T {
  return typeof value === 'function' ? (value as (p: T) => T)(prev) : value
}

export const useSnapshotEditorStore = create<SnapshotEditorStore>()((set) => {
  const mk = <K extends keyof SnapshotEditorState>(key: K) =>
    (value: Updater<SnapshotEditorState[K]>) =>
      set((s) => ({ [key]: resolveUpdater(s[key], value) } as Pick<SnapshotEditorState, K>))

  return {
    ...DEFAULT_STATE,

    setFlowSlots: mk('flowSlots'),
    setRouting: mk('routing'),
    setActiveFlowIndex: mk('activeFlowIndex'),
    setSelectedCategory: mk('selectedCategory'),
    setCollapsedCategories: mk('collapsedCategories'),

    setSelectedPluginUri: mk('selectedPluginUri'),
    setSelectedPluginPosition: mk('selectedPluginPosition'),
    setSelectedPluginSelection: (uri, position) =>
      set({
        selectedPluginUri: uri,
        selectedPluginPosition:
          uri && typeof position === 'number' && Number.isFinite(position) ? position : null,
      }),
    setEffectModalOpen: mk('effectModalOpen'),
    setShowPluginBrowser: mk('showPluginBrowser'),
    setShowPresetBrowser: mk('showPresetBrowser'),
    setPluginSearchQuery: mk('pluginSearchQuery'),
    setDetailsPlugin: mk('detailsPlugin'),
    setIsRefreshingPlugins: mk('isRefreshingPlugins'),

    setShowSavePresetModal: mk('showSavePresetModal'),
    setSavePresetName: mk('savePresetName'),
    setEditingSnapshotName: mk('editingSnapshotName'),
    setRenameSnapshotName: mk('renameSnapshotName'),
    setShowRenameChainModal: mk('showRenameChainModal'),
    setRenameChainName: mk('renameChainName'),

    setPresetPendingDelete: mk('presetPendingDelete'),
    setShowClearFlowsModal: mk('showClearFlowsModal'),
    setPendingTabletDeletePlugin: mk('pendingTabletDeletePlugin'),

    setAssignmentDialogOpen: mk('assignmentDialogOpen'),
    setSelectedFlowForAssignment: mk('selectedFlowForAssignment'),
    setAssignmentSelectedNodeId: mk('assignmentSelectedNodeId'),
    setAssignmentRedundancyEnabled: mk('assignmentRedundancyEnabled'),
    setIsAssigningFlow: mk('isAssigningFlow'),

    setMidiLearnActive: mk('midiLearnActive'),
    setMidiScope: mk('midiScope'),
    setMidiRangeDrafts: mk('midiRangeDrafts'),
    setLastMidiActivityWs: mk('lastMidiActivityWs'),
    setMidiModalOpen: mk('midiModalOpen'),
    setAbSwitchMidiMessageTypeDraft: mk('abSwitchMidiMessageTypeDraft'),
    setAbSwitchMidiChannelDraft: mk('abSwitchMidiChannelDraft'),
    setAbSwitchMidiNumberDraft: mk('abSwitchMidiNumberDraft'),
    setBlockFocusMidiChannelDraft: mk('blockFocusMidiChannelDraft'),
    setBlockFocusStartNoteDraft: mk('blockFocusStartNoteDraft'),

    setFavoritePlugins: mk('favoritePlugins'),
    setPluginLevels: mk('pluginLevels'),
    setWetDryMixes: mk('wetDryMixes'),

    setReorderPreview: mk('reorderPreview'),

    setShowKeyboardHelp: mk('showKeyboardHelp'),
    setShowPerformModal: mk('showPerformModal'),
    setShowAudioNodesModal: mk('showAudioNodesModal'),
    setShowProgressModal: mk('showProgressModal'),
    setProgressModalInitialTab: mk('progressModalInitialTab'),
    setProgressModalInitialSection: mk('progressModalInitialSection'),
    setShowLiveRuntimeModal: mk('showLiveRuntimeModal'),
    setShowVersionHistoryModal: mk('showVersionHistoryModal'),
    setShowImportDialog: mk('showImportDialog'),

    setCompactTab: mk('compactTab'),
    setFocusedBranchId: mk('focusedBranchId'),
    setExpandedTabletBranchId: mk('expandedTabletBranchId'),
    setBranchPageByFlowId: mk('branchPageByFlowId'),
    setTabletEditorOpen: mk('tabletEditorOpen'),

    setAutomationTimelineExpanded: mk('automationTimelineExpanded'),
    setAutomationPanelHeight: mk('automationPanelHeight'),
    setAutomationPlaying: mk('automationPlaying'),
    setAutomationRecording: mk('automationRecording'),
    setAutomationLoopEnabled: mk('automationLoopEnabled'),
    setAutomationCurrentTime: mk('automationCurrentTime'),
    setAutomationDuration: mk('automationDuration'),
    setAutomationLanes: mk('automationLanes'),
    setLanePickerOpen: mk('lanePickerOpen'),

    setSnapshotIoModalState: mk('snapshotIoModalState'),
    setOutputReferenceThresholdDraft: mk('outputReferenceThresholdDraft'),
    setNoiseGateThresholdDraft: mk('noiseGateThresholdDraft'),
    setNoiseGateReleaseDraft: mk('noiseGateReleaseDraft'),

    setSnapshotsDirty: mk('snapshotsDirty'),
    setSnapshotSetlistModePending: mk('snapshotSetlistModePending'),
    setEditorSnapshotOverride: mk('editorSnapshotOverride'),
    setEditorSnapshotContext: mk('editorSnapshotContext'),
    setPendingGoLiveSnapshotId: mk('pendingGoLiveSnapshotId'),
    setPendingGoLiveRequestedAt: mk('pendingGoLiveRequestedAt'),
    setConfirmedGoLiveSnapshotId: mk('confirmedGoLiveSnapshotId'),
    setFailedGoLiveSnapshotId: mk('failedGoLiveSnapshotId'),
    setGoLiveFailureReason: mk('goLiveFailureReason'),
    setGoLiveFailureDetail: mk('goLiveFailureDetail'),
    setGoLiveDiffExpanded: mk('goLiveDiffExpanded'),
    setDismissedGoLiveDiffKey: mk('dismissedGoLiveDiffKey'),

    setFlowClipTimestamps: mk('flowClipTimestamps'),
    setFlowInputClipTimestamps: mk('flowInputClipTimestamps'),
    setFlowOutputClipTimestamps: mk('flowOutputClipTimestamps'),

    setRoutingInspectorId: mk('routingInspectorId'),
    setRoutingLiveApplyState: mk('routingLiveApplyState'),

    setFootswitchLabelDrafts: mk('footswitchLabelDrafts'),

    setPortSelectorFlowIndex: mk('portSelectorFlowIndex'),

    hydrateBucketAFromLocalStorage: (options) => {
      const { flowSlots, routing, activeFlowIndex } = readPersistedFlows(options)
      set({
        flowSlots,
        routing,
        activeFlowIndex,
        selectedCategory: readPersistedSelectedCategory(),
        collapsedCategories: readPersistedCollapsedCategories(),
      })
    },

    persistFlowSlots: () => {
      const { flowSlots } = useSnapshotEditorStore.getState()
      safeLocalStorageSet(SNAPSHOT_EDITOR_FLOWS_STORAGE_KEY, JSON.stringify(flowSlots))
    },
    persistRouting: () => {
      const { routing } = useSnapshotEditorStore.getState()
      safeLocalStorageSet(SNAPSHOT_EDITOR_ROUTING_STORAGE_KEY, JSON.stringify(routing))
    },
    persistActiveFlowIndex: () => {
      const { activeFlowIndex } = useSnapshotEditorStore.getState()
      safeLocalStorageSet(SNAPSHOT_EDITOR_ACTIVE_STORAGE_KEY, String(activeFlowIndex))
    },
    persistSelectedCategory: () => {
      const { selectedCategory } = useSnapshotEditorStore.getState()
      safeLocalStorageSet(SNAPSHOT_EDITOR_PLUGIN_CATEGORY_STORAGE_KEY, selectedCategory)
    },
    persistCollapsedCategories: () => {
      const { collapsedCategories } = useSnapshotEditorStore.getState()
      safeLocalStorageSet(
        SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_STORAGE_KEY,
        JSON.stringify([...collapsedCategories]),
      )
    },
  }
})
