import { create } from 'zustand'
import type { Plugin, Snapshot, SnapshotDetail, AutomationLane } from '../../map2/types'
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

export interface SnapshotEditorActions {
  setFlowSlots: (flowSlots: JuceGridFlowSlotState[]) => void
  setRouting: (routing: JuceGridRoutingState) => void
  setActiveFlowIndex: (index: number) => void
  setSelectedCategory: (category: string) => void
  setCollapsedCategories: (categories: Set<string>) => void

  setSelectedPluginUri: (uri: string | null) => void
  setSelectedPluginPosition: (position: number | null) => void
  setSelectedPluginSelection: (uri: string | null, position?: number | null) => void
  setEffectModalOpen: (open: boolean) => void
  setShowPluginBrowser: (open: boolean) => void
  setShowPresetBrowser: (open: boolean) => void
  setPluginSearchQuery: (query: string) => void
  setDetailsPlugin: (plugin: Plugin | null) => void
  setIsRefreshingPlugins: (refreshing: boolean) => void

  setShowSavePresetModal: (open: boolean) => void
  setSavePresetName: (name: string) => void
  setEditingSnapshotName: (editing: boolean) => void
  setRenameSnapshotName: (name: string) => void
  setShowRenameChainModal: (open: boolean) => void
  setRenameChainName: (name: string) => void

  setPresetPendingDelete: (snapshot: Snapshot | null) => void
  setShowClearFlowsModal: (open: boolean) => void
  setPendingTabletDeletePlugin: (state: PendingTabletDeletePluginState | null) => void

  setAssignmentDialogOpen: (open: boolean) => void
  setSelectedFlowForAssignment: (flow: JuceGridFlowSlotState | null) => void
  setAssignmentSelectedNodeId: (nodeId: string) => void
  setAssignmentRedundancyEnabled: (enabled: boolean) => void
  setIsAssigningFlow: (assigning: boolean) => void

  setMidiLearnActive: (active: boolean) => void
  setMidiScope: (scope: JuceGridMidiScope) => void
  setMidiRangeDrafts: (drafts: Record<number, MidiRangeDraft>) => void
  setLastMidiActivityWs: (activity: MidiActivity | null) => void
  setMidiModalOpen: (open: boolean) => void
  setAbSwitchMidiMessageTypeDraft: (type: SnapshotAbSwitchMidiMessageType) => void
  setAbSwitchMidiChannelDraft: (channel: string) => void
  setAbSwitchMidiNumberDraft: (number: number) => void
  setBlockFocusMidiChannelDraft: (channel: string) => void
  setBlockFocusStartNoteDraft: (note: number) => void

  setFavoritePlugins: (favorites: Set<string>) => void
  setPluginLevels: (levels: Record<string, PluginLevels>) => void
  setWetDryMixes: (mixes: Record<string, number>) => void

  setReorderPreview: (preview: ReorderPreviewState) => void

  setShowKeyboardHelp: (open: boolean) => void
  setShowPerformModal: (open: boolean) => void
  setShowAudioNodesModal: (open: boolean) => void
  setShowProgressModal: (open: boolean) => void
  setProgressModalInitialTab: (tab: ProgressModalTab) => void
  setProgressModalInitialSection: (section: ProgressModalSection) => void
  setShowLiveRuntimeModal: (open: boolean) => void
  setShowVersionHistoryModal: (open: boolean) => void
  setShowImportDialog: (open: boolean) => void

  setCompactTab: (tab: CompactTabId) => void
  setFocusedBranchId: (id: string | null) => void
  setExpandedTabletBranchId: (id: string | null) => void
  setBranchPageByFlowId: (pages: Record<string, number>) => void
  setTabletEditorOpen: (open: boolean) => void

  setAutomationTimelineExpanded: (expanded: boolean) => void
  setAutomationPanelHeight: (height: number) => void
  setAutomationPlaying: (playing: boolean) => void
  setAutomationRecording: (recording: boolean) => void
  setAutomationLoopEnabled: (enabled: boolean) => void
  setAutomationCurrentTime: (time: number) => void
  setAutomationDuration: (duration: number) => void
  setAutomationLanes: (lanes: AutomationLane[]) => void
  setLanePickerOpen: (open: boolean) => void

  setSnapshotIoModalState: (state: SnapshotIoModalState) => void
  setOutputReferenceThresholdDraft: (value: number) => void
  setNoiseGateThresholdDraft: (value: number) => void
  setNoiseGateReleaseDraft: (value: number) => void

  setSnapshotsDirty: (dirty: boolean) => void
  setSnapshotSetlistModePending: (pending: boolean) => void
  setEditorSnapshotOverride: (snapshot: SnapshotDetail | null) => void
  setEditorSnapshotContext: (snapshot: SnapshotDetail | null) => void
  setPendingGoLiveSnapshotId: (id: number | null) => void
  setPendingGoLiveRequestedAt: (timestamp: number | null) => void
  setConfirmedGoLiveSnapshotId: (id: number | null) => void
  setFailedGoLiveSnapshotId: (id: number | null) => void
  setGoLiveFailureReason: (reason: string | null) => void
  setGoLiveFailureDetail: (detail: GoLiveFailureDetail | null) => void
  setGoLiveDiffExpanded: (expanded: boolean) => void
  setDismissedGoLiveDiffKey: (key: string | null) => void

  setFlowClipTimestamps: (timestamps: Record<string, number>) => void
  setFlowInputClipTimestamps: (timestamps: Record<string, number>) => void
  setFlowOutputClipTimestamps: (timestamps: Record<string, number>) => void

  setRoutingInspectorId: (id: JuceGridRoutingMarkerId | null) => void
  setRoutingLiveApplyState: (state: SnapshotRoutingLiveApplyState) => void

  setFootswitchLabelDrafts: (drafts: FootswitchLabelDrafts) => void

  setPortSelectorFlowIndex: (index: number | null) => void

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

export const useSnapshotEditorStore = create<SnapshotEditorStore>()((set) => ({
  ...DEFAULT_STATE,

  setFlowSlots: (flowSlots) => set({ flowSlots }),
  setRouting: (routing) => set({ routing }),
  setActiveFlowIndex: (activeFlowIndex) => set({ activeFlowIndex }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setCollapsedCategories: (collapsedCategories) => set({ collapsedCategories }),

  setSelectedPluginUri: (selectedPluginUri) => set({ selectedPluginUri }),
  setSelectedPluginPosition: (selectedPluginPosition) => set({ selectedPluginPosition }),
  setSelectedPluginSelection: (uri, position) =>
    set({
      selectedPluginUri: uri,
      selectedPluginPosition:
        uri && typeof position === 'number' && Number.isFinite(position) ? position : null,
    }),
  setEffectModalOpen: (effectModalOpen) => set({ effectModalOpen }),
  setShowPluginBrowser: (showPluginBrowser) => set({ showPluginBrowser }),
  setShowPresetBrowser: (showPresetBrowser) => set({ showPresetBrowser }),
  setPluginSearchQuery: (pluginSearchQuery) => set({ pluginSearchQuery }),
  setDetailsPlugin: (detailsPlugin) => set({ detailsPlugin }),
  setIsRefreshingPlugins: (isRefreshingPlugins) => set({ isRefreshingPlugins }),

  setShowSavePresetModal: (showSavePresetModal) => set({ showSavePresetModal }),
  setSavePresetName: (savePresetName) => set({ savePresetName }),
  setEditingSnapshotName: (editingSnapshotName) => set({ editingSnapshotName }),
  setRenameSnapshotName: (renameSnapshotName) => set({ renameSnapshotName }),
  setShowRenameChainModal: (showRenameChainModal) => set({ showRenameChainModal }),
  setRenameChainName: (renameChainName) => set({ renameChainName }),

  setPresetPendingDelete: (presetPendingDelete) => set({ presetPendingDelete }),
  setShowClearFlowsModal: (showClearFlowsModal) => set({ showClearFlowsModal }),
  setPendingTabletDeletePlugin: (pendingTabletDeletePlugin) => set({ pendingTabletDeletePlugin }),

  setAssignmentDialogOpen: (assignmentDialogOpen) => set({ assignmentDialogOpen }),
  setSelectedFlowForAssignment: (selectedFlowForAssignment) => set({ selectedFlowForAssignment }),
  setAssignmentSelectedNodeId: (assignmentSelectedNodeId) => set({ assignmentSelectedNodeId }),
  setAssignmentRedundancyEnabled: (assignmentRedundancyEnabled) => set({ assignmentRedundancyEnabled }),
  setIsAssigningFlow: (isAssigningFlow) => set({ isAssigningFlow }),

  setMidiLearnActive: (midiLearnActive) => set({ midiLearnActive }),
  setMidiScope: (midiScope) => set({ midiScope }),
  setMidiRangeDrafts: (midiRangeDrafts) => set({ midiRangeDrafts }),
  setLastMidiActivityWs: (lastMidiActivityWs) => set({ lastMidiActivityWs }),
  setMidiModalOpen: (midiModalOpen) => set({ midiModalOpen }),
  setAbSwitchMidiMessageTypeDraft: (abSwitchMidiMessageTypeDraft) =>
    set({ abSwitchMidiMessageTypeDraft }),
  setAbSwitchMidiChannelDraft: (abSwitchMidiChannelDraft) => set({ abSwitchMidiChannelDraft }),
  setAbSwitchMidiNumberDraft: (abSwitchMidiNumberDraft) => set({ abSwitchMidiNumberDraft }),
  setBlockFocusMidiChannelDraft: (blockFocusMidiChannelDraft) => set({ blockFocusMidiChannelDraft }),
  setBlockFocusStartNoteDraft: (blockFocusStartNoteDraft) => set({ blockFocusStartNoteDraft }),

  setFavoritePlugins: (favoritePlugins) => set({ favoritePlugins }),
  setPluginLevels: (pluginLevels) => set({ pluginLevels }),
  setWetDryMixes: (wetDryMixes) => set({ wetDryMixes }),

  setReorderPreview: (reorderPreview) => set({ reorderPreview }),

  setShowKeyboardHelp: (showKeyboardHelp) => set({ showKeyboardHelp }),
  setShowPerformModal: (showPerformModal) => set({ showPerformModal }),
  setShowAudioNodesModal: (showAudioNodesModal) => set({ showAudioNodesModal }),
  setShowProgressModal: (showProgressModal) => set({ showProgressModal }),
  setProgressModalInitialTab: (progressModalInitialTab) => set({ progressModalInitialTab }),
  setProgressModalInitialSection: (progressModalInitialSection) =>
    set({ progressModalInitialSection }),
  setShowLiveRuntimeModal: (showLiveRuntimeModal) => set({ showLiveRuntimeModal }),
  setShowVersionHistoryModal: (showVersionHistoryModal) => set({ showVersionHistoryModal }),
  setShowImportDialog: (showImportDialog) => set({ showImportDialog }),

  setCompactTab: (compactTab) => set({ compactTab }),
  setFocusedBranchId: (focusedBranchId) => set({ focusedBranchId }),
  setExpandedTabletBranchId: (expandedTabletBranchId) => set({ expandedTabletBranchId }),
  setBranchPageByFlowId: (branchPageByFlowId) => set({ branchPageByFlowId }),
  setTabletEditorOpen: (tabletEditorOpen) => set({ tabletEditorOpen }),

  setAutomationTimelineExpanded: (automationTimelineExpanded) => set({ automationTimelineExpanded }),
  setAutomationPanelHeight: (automationPanelHeight) => set({ automationPanelHeight }),
  setAutomationPlaying: (automationPlaying) => set({ automationPlaying }),
  setAutomationRecording: (automationRecording) => set({ automationRecording }),
  setAutomationLoopEnabled: (automationLoopEnabled) => set({ automationLoopEnabled }),
  setAutomationCurrentTime: (automationCurrentTime) => set({ automationCurrentTime }),
  setAutomationDuration: (automationDuration) => set({ automationDuration }),
  setAutomationLanes: (automationLanes) => set({ automationLanes }),
  setLanePickerOpen: (lanePickerOpen) => set({ lanePickerOpen }),

  setSnapshotIoModalState: (snapshotIoModalState) => set({ snapshotIoModalState }),
  setOutputReferenceThresholdDraft: (outputReferenceThresholdDraft) =>
    set({ outputReferenceThresholdDraft }),
  setNoiseGateThresholdDraft: (noiseGateThresholdDraft) => set({ noiseGateThresholdDraft }),
  setNoiseGateReleaseDraft: (noiseGateReleaseDraft) => set({ noiseGateReleaseDraft }),

  setSnapshotsDirty: (snapshotsDirty) => set({ snapshotsDirty }),
  setSnapshotSetlistModePending: (snapshotSetlistModePending) => set({ snapshotSetlistModePending }),
  setEditorSnapshotOverride: (editorSnapshotOverride) => set({ editorSnapshotOverride }),
  setEditorSnapshotContext: (editorSnapshotContext) => set({ editorSnapshotContext }),
  setPendingGoLiveSnapshotId: (pendingGoLiveSnapshotId) => set({ pendingGoLiveSnapshotId }),
  setPendingGoLiveRequestedAt: (pendingGoLiveRequestedAt) => set({ pendingGoLiveRequestedAt }),
  setConfirmedGoLiveSnapshotId: (confirmedGoLiveSnapshotId) => set({ confirmedGoLiveSnapshotId }),
  setFailedGoLiveSnapshotId: (failedGoLiveSnapshotId) => set({ failedGoLiveSnapshotId }),
  setGoLiveFailureReason: (goLiveFailureReason) => set({ goLiveFailureReason }),
  setGoLiveFailureDetail: (goLiveFailureDetail) => set({ goLiveFailureDetail }),
  setGoLiveDiffExpanded: (goLiveDiffExpanded) => set({ goLiveDiffExpanded }),
  setDismissedGoLiveDiffKey: (dismissedGoLiveDiffKey) => set({ dismissedGoLiveDiffKey }),

  setFlowClipTimestamps: (flowClipTimestamps) => set({ flowClipTimestamps }),
  setFlowInputClipTimestamps: (flowInputClipTimestamps) => set({ flowInputClipTimestamps }),
  setFlowOutputClipTimestamps: (flowOutputClipTimestamps) => set({ flowOutputClipTimestamps }),

  setRoutingInspectorId: (routingInspectorId) => set({ routingInspectorId }),
  setRoutingLiveApplyState: (routingLiveApplyState) => set({ routingLiveApplyState }),

  setFootswitchLabelDrafts: (footswitchLabelDrafts) => set({ footswitchLabelDrafts }),

  setPortSelectorFlowIndex: (portSelectorFlowIndex) => set({ portSelectorFlowIndex }),

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
}))
