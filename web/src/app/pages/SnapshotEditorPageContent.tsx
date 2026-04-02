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

import { useState, useCallback, useMemo, useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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
  Meter,
  MachineLearningModel,
  Music,
  Pause,
  Play,
  Recording,
  Renew,
  Stop,
  TrashCan,
  VolumeMute,
  VolumeUp,
  ArrowsHorizontal,
  Close,
  Edit,
  Information,
  Network_3,
} from '@carbon/icons-react'
import {
  Accordion,
  AccordionItem,
  Button,
  Checkbox,
  Column,
  Grid,
  InlineLoading,
  Layer,
  MenuButton,
  MenuItem,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  Search,
  Select,
  SelectItem,
  Tab,
  TabList,
  Tabs,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useIsMobile } from '../hooks/useIsMobile'
import { useRealtimeCadence } from '../hooks/useRealtimeCadence'
import { useRouteActive } from '../hooks/useRouteActive'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import { fetchLiveSnapshotOrNull, removeRuntimeChainsFromLiveSnapshot } from './snapshotLiveState'
import { getCategoryConfig } from '../grid/shared'
import type { AutomationLane } from '../grid/shared'
import {
  chainsApi,
  pluginsApi,
  historyApi,
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
import { fetchJson } from '../../map2/http'
import { useToasts } from '../components/Toasts'
import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { usePluginOutputs } from '../hooks/usePluginOutputs'
import { useSnapshots } from '../hooks/useSnapshots'
import { useSnapshotRuntimeLiveState } from '../hooks/useSnapshotRuntimeState'
import { useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import { getEffectIcon } from '../components/icons/effectIcons'
import MidiLearnButton from '../../map2/components/MIDI/MidiLearnButton'
import { PluginDetailsModal } from '../components/PluginDetailsModal'
import { NumberInput } from '../components/ParameterControl'
import { SegmentedLedText } from '../components/Displays/SegmentedLedText'
import { MapAudioGridIcon } from '../components/icons/map'
import { SnapshotImportDialog } from '../components/snapshots/SnapshotImportDialog'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'
import type { Chain, Plugin, PluginOrderRef, HistoryStatus, SnapshotDraftData, ChainSnapshot, ChainsResponse, Snapshot, SnapshotDetail, SnapshotSummary, MIDIMappingV2, MIDIStatus, PluginParameter } from '../../map2/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import { buildPluginOrderRef } from '../../map2/utils/pluginIdentity'
import { sortPluginsForBrowser } from '../utils/pluginBrowserSort'
import { canonicalizePluginUri } from '../utils/pluginUris'
import {
  sortFavoriteSnapshotsForSetlist,
  sortSnapshotsByProgramNumber,
} from '../utils/snapshotSetlist'
import {
  buildDefaultSnapshotName,
  normalizeSnapshotName,
  validateSnapshotName,
} from '../utils/snapshotNames'
import {
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
  buildSnapshotActivationFailureToastMessage,
  buildSnapshotActivationToastMessage,
  extractSnapshotActivationFailureReason,
} from '../utils/snapshotActivationToast'
import {
  isSnapshotCurrentRuntimeLive,
  resolveSnapshotGoLiveState,
} from '../utils/snapshotGoLiveState'
import { JuceGridAudioPortModal } from '../components/modals/JuceGridAudioPortModal'
import { JuceGridSelectedBlockMidiPanel } from '../components/SnapshotEditor/SnapshotEditorSelectedBlockMidiPanel'
import { SnapshotChainManagementCard } from '../components/SnapshotEditor/SnapshotChainManagementCard'
import { SnapshotVersionHistoryModal } from '../components/SnapshotEditor/SnapshotVersionHistoryModal'
import { RoutingTopologyModal } from '../components/modals/RoutingTopologyModal'
import { AudioNodesModal } from '../components/modals/AudioNodesModal'
import { LiveRuntimePathsModal } from '../components/modals/LiveRuntimePathsModal'
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
  FLOW_CARD_SLOT_COLORS,
  buildFlowCardMetadataLines,
  normalizeFlowCardLabel,
  resolveFlowEdgeClipTimestamp,
  resolveFlowClipTimestamp,
  validateFlowCardLabel,
} from '../components/SnapshotEditor/snapshotEditorFlowCard'
import { buildJuceGridLivePath } from '../components/SnapshotEditor/snapshotEditorLivePath'
import {
  applyOptimisticJuceGridLiveChainSet,
  buildJuceGridLiveChainProjection,
  buildJuceGridRevertedStateFromLiveProjection,
  getJuceGridDesiredLiveChainIds,
  hasJuceGridLiveChainMismatch,
} from '../components/SnapshotEditor/snapshotEditorLiveChains'
import {
  createDefaultJuceGridFlowSlots,
  createDefaultJuceGridRouting,
  normalizeJuceGridStateSources,
} from '../components/SnapshotEditor/snapshotEditorFlowState'
import type { JuceGridRoutingState } from '../components/SnapshotEditor/snapshotEditorFlowState'
import {
  buildSnapshotGoLiveDiff,
} from '../components/SnapshotEditor/snapshotEditorComparison'
import {
  buildEffectiveLiveSnapshotChains,
  buildSnapshotEditorLiveSnapshotHydration,
} from '../components/SnapshotEditor/snapshotEditorLiveSnapshotHydration'
import './SnapshotEditorPage.css'
import { PerformPage } from './PerformPage'
import { ExpressionOverlay } from '../components/PluginCards/Dialogs/ExpressionOverlay'
import { PluginCardRouter } from '../components/PluginCards'
import { resolveLivePluginCardStrategy } from '../components/PluginCards/liveEditorRouting'
import type { CcChannelPair } from './ExpressionPage'

const API_BASE = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port
  if (isLocalhost) return '/api'
  if (port === '' || port === '80' || port === '8080') return '/api'
  return `http://${window.location.hostname}:8080/api`
})()

const SESSION_NOTES_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
})

const FEATURED_NATIVE_BROWSER_GROUPS = [
  {
    key: 'linear-nonlinear-modeling',
    title: 'Linear and Nonlinear Modeling',
    icon: MachineLearningModel,
    pluginUris: [
      'map2://juce/nam',
      'map2://juce/convolution/reverb',
      'map2://juce/convolution/cabinet',
    ],
  },
  {
    key: 'instruments',
    title: 'Instruments',
    icon: Music,
    pluginUris: [
      'map2://juce/drums',
      'map2://juce/synthforge',
    ],
  },
] as const

interface SnapshotEditorPerformanceEvent {
  seq: number
  action: string
  payload?: Record<string, unknown>
  channel: number
  timestamp_ns: number
  source_port: string
}

interface SnapshotEditorPerformanceEventsResponse {
  events: SnapshotEditorPerformanceEvent[]
  last_seq: number
}

interface FlowLevelControlProps {
  flowId: string
  flowLabel: string
  value: number
  accentColor: string
  onChange: (value: number) => void
  disabled?: boolean
}

function FlowLevelControl({
  flowId,
  flowLabel,
  value,
  accentColor,
  onChange,
  disabled = false,
}: FlowLevelControlProps) {
  const clampedValue = Math.max(0, Math.min(100, Math.round(value)))
  const levelLabel = `Signal chain ${flowLabel} level`

  return (
    <div
      className="juce-grid-page__flow-level-shell"
      data-testid={`juce-grid-flow-level-${flowId}`}
      title={`${levelLabel}: ${clampedValue}%`}
    >
      <NumberInput
        label={levelLabel}
        value={clampedValue}
        min={0}
        max={100}
        step={1}
        defaultValue={100}
        valueFormatter={(nextValue) => `${Math.round(nextValue)}%`}
        displayOverlay={(
          <div className="juce-grid-page__flow-level-overlay">
            <SegmentedLedText
              value={`${clampedValue}%`}
              size="md"
              color={FLOW_CARD_LED_COLOR}
              className="juce-grid-page__flow-level-readout"
            />
          </div>
        )}
        onChange={onChange}
        size="small"
        showLabel={false}
        showBounds={false}
        accentColor={accentColor}
        disabled={disabled}
        className="juce-grid-page__flow-level-input"
      />
    </div>
  )
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

interface RoutingInspectorContent {
  heading: string
  summary: string
  tags: string[]
  rows: Array<{ label: string; value: string }>
}

type LivePathArrowTone = 'active' | 'dim' | 'sidechain'
type LivePathGroupKind = 'series' | 'parallel' | 'ab' | 'morph' | 'sidechain' | 'inactive'

function formatInspectorList(values: string[]): string {
  if (values.length === 0) {
    return 'None'
  }
  return values.join(', ')
}

function formatMidiMappingValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }

  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function parseMidiMappingValue(rawValue: string, fallback: number): number {
  const parsed = Number.parseFloat(rawValue)
  return Number.isFinite(parsed) ? parsed : fallback
}

function fallbackPluginLabel(pluginUri: string | null): string {
  if (!pluginUri) {
    return 'Processor'
  }

  const tail = pluginUri.split('/').pop()
  return tail ? tail.replace(/[-_]+/g, ' ') : pluginUri
}

function getSelectedPluginHeroIcon(meta: Plugin | null, plugin: Chain['plugins'][number] | null) {
  const iconHints = [
    meta?.name,
    meta?.category,
    meta?.class_label,
    plugin?.plugin_display_type,
    plugin?.name,
    plugin?.uri,
  ].filter((value): value is string => Boolean(value && value.trim()))

  for (const hint of iconHints) {
    const icon = getEffectIcon(hint)
    if (icon) {
      return icon
    }
  }

  return getEffectIcon('plugin')
}

function getAudioRouteLabels(
  selectedPorts: number[] | undefined,
  ports: AudioPort[] | undefined,
  selectedAvbEndpoints: string[] | undefined,
  avbEndpoints: AudioAvbEndpoint[] | undefined,
): string[] {
  const portLabels = (selectedPorts ?? []).map((portIndex) => {
    const match = ports?.find((port) => port.index === portIndex)
    return match ? match.name : `Port ${portIndex + 1}`
  })

  const avbLabels = (selectedAvbEndpoints ?? []).map((endpointId) => {
    const match = avbEndpoints?.find((endpoint) => endpoint.endpoint_id === endpointId)
    if (match?.device_name) {
      return match.device_name
    }
    return endpointId
  })

  return [...portLabels, ...avbLabels]
}

function countAudioBindingChannels(
  bindings: AudioRoutingSelectionBinding[] | undefined,
  fallbackPortCount: number,
  fallbackAvbCount: number,
) {
  if (!bindings || bindings.length === 0) {
    return fallbackPortCount + fallbackAvbCount
  }

  return bindings.reduce((sum, binding) => (
    sum + (binding.selection_type === 'local_port' ? 1 : Math.max(1, binding.channels || 1))
  ), 0)
}

function getLivePathArrowTone(
  flowState: { activeAudio?: boolean; dimmed?: boolean; sidechainKey?: boolean } | undefined,
): LivePathArrowTone {
  if (flowState?.sidechainKey) {
    return 'sidechain'
  }
  if (flowState?.activeAudio) {
    return 'active'
  }
  return 'dim'
}

function getLivePathStateLabel(
  flowState: { activeAudio?: boolean; dimmed?: boolean; sidechainKey?: boolean } | undefined,
): string | null {
  if (flowState?.sidechainKey) {
    return 'Key'
  }
  if (flowState?.activeAudio) {
    return 'Live'
  }
  if (flowState?.dimmed) {
    return 'Dim'
  }
  return null
}

function getLivePathBranchLabel(
  routingMode: RoutingMode,
  groupKind: LivePathGroupKind,
  flowState: { annotation?: string } | undefined,
): string | null {
  if (!flowState?.annotation) {
    return null
  }

  if (routingMode === 'series' && (groupKind === 'series' || groupKind === 'inactive')) {
    return null
  }

  return flowState.annotation
}

// ============================================================================
// Types
// ============================================================================

interface FlowSlot {
  id: string
  chainId: number | null
  label: string
  color: string
  muted: boolean
  solo: boolean
  dryWetMix: number
}

type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

interface RoutingConfig {
  mode: RoutingMode
  activeSlotId: string | null
  blendPositions: Record<string, number>
  morphProgress: number
  morphSourceSlotId: string | null
  morphTargetSlotId: string | null
  seriesOrder: string[]
}

type CompactTabId =
  | 'grid'
  | 'editor'
  | 'routing'
  | 'presets'

type JuceGridMidiScope = 'all' | 'active-chain' | 'selected-plugin'
type ReorderDirection = 'left' | 'right'
type MidiRangeDraft = {
  min: string
  max: string
  sourceMin: string
  sourceMax: string
}

type ReorderPreviewState = {
  pluginUri: string
  pluginPosition: number
  targetUri: string
  targetPosition: number
  direction: ReorderDirection
} | null

interface PendingTabletDeletePluginState {
  uri: string
  position: number
  name: string
}

// ============================================================================
// Constants
// ============================================================================

const SLOT_COLORS = FLOW_CARD_SLOT_COLORS

function sanitizeTraceableNamePart(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w -]/g, '')

  return normalized.length > 0 ? normalized : fallback
}

function formatCompactTimestamp(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

function buildTraceableChannelChainName(snapshotName: string | null, channelLabel: string): string {
  const baseName = sanitizeTraceableNamePart(snapshotName, 'Snapshot Editor')
  const normalizedChannelLabel = sanitizeTraceableNamePart(channelLabel, 'A')
  return `${baseName} - ${formatCompactTimestamp()} - Channel ${normalizedChannelLabel}`
}

const FLOW_CARD_ROUTING_MODE_LABELS: Record<NonNullable<JuceGridAudioInterfaceStatus['routingMode']>, string> = {
  parallel_blend: 'MIX',
  ab_switch: 'A/B',
  series: 'SER',
  parameter_morph: 'MOR',
  sidechain: 'S/C',
}

function getRoutingFocusFlowSummary(
  routingMode: JuceGridRoutingState['mode'],
  flowIndex: number,
  flowId: string,
  activeFlowId: string | null,
  secondaryFlowId: string | null,
  blendPercent: number,
): string {
  switch (routingMode) {
    case 'parallel_blend':
      return `${Math.round(blendPercent)}% blend`
    case 'ab_switch':
      return flowId === activeFlowId ? 'Primary branch' : 'Standby branch'
    case 'parameter_morph':
      if (flowId === activeFlowId) return 'Morph focus'
      if (flowId === secondaryFlowId) return 'Morph target'
      return 'Morph context'
    case 'sidechain':
      return flowIndex === 0 ? 'Main audio' : 'Sidechain key'
    case 'series':
    default:
      return flowIndex === 0 ? 'Input stage' : 'Serial stage'
  }
}

const MIN_FLOWS = 2
const MAX_FLOWS = 6
const DEFAULT_FLOW_COUNT = 3
const COMPACT_TAB_ORDER: Array<{ id: CompactTabId; label: string }> = [
  { id: 'grid', label: 'Grid' },
  { id: 'editor', label: 'Editor' },
  { id: 'routing', label: 'Routing' },
  { id: 'presets', label: 'Presets' },
]

const ROUTING_MODE_OPTIONS: Array<{
  id: RoutingMode
  label: string
  summary: string
}> = [
  { id: 'series', label: 'Series', summary: 'Sequentially process each flow before output.' },
  { id: 'parallel_blend', label: 'Parallel', summary: 'Run flows side-by-side and blend them together.' },
  { id: 'ab_switch', label: 'A/B', summary: 'Only one focus flow is active at a time.' },
  { id: 'parameter_morph', label: 'Morph', summary: 'Crossfade parameter states between two flows.' },
  { id: 'sidechain', label: 'Sidechain', summary: 'Drive one flow with another as control input.' },
]

const MIDI_CURVE_LABELS: Record<MIDIMappingV2['curve_type'], string> = {
  linear: 'Linear',
  logarithmic: 'Log',
  exponential: 'Exp',
  s_curve: 'S-Curve',
}

const KEYBOARD_SHORTCUT_SECTIONS: Array<{
  title: string
  rows: Array<{ keys: string[]; description: string }>
}> = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['1-6'], description: 'Select flow slot' },
      { keys: ['Left', 'Right'], description: 'Navigate selected blocks' },
      { keys: ['Esc'], description: 'Close modal or clear selection' },
    ],
  },
  {
    title: 'Plugin actions',
    rows: [
      { keys: ['A'], description: 'Open block browser' },
      { keys: ['B'], description: 'Toggle bypass' },
      { keys: ['Delete'], description: 'Remove selected block' },
      { keys: ['I'], description: 'Open block details' },
      { keys: ['F'], description: 'Toggle favorite' },
    ],
  },
  {
    title: 'Chain actions',
    rows: [
      { keys: ['S'], description: 'Save preset' },
      { keys: ['Ctrl', 'Z'], description: 'Undo' },
      { keys: ['Ctrl', 'Y'], description: 'Redo' },
    ],
  },
  {
    title: 'General',
    rows: [
      { keys: ['?'], description: 'Toggle keyboard help' },
    ],
  },
]

const JUCE_GRID_SELECTED_PLUGIN_KEY = 'map2_juce_grid_selected_plugin_uri'
const JUCE_GRID_EFFECT_MODAL_OPEN_KEY = 'map2_juce_grid_effect_modal_open'
const JUCE_GRID_SCROLL_TOP_KEY = 'map2_juce_grid_scroll_top'

// ============================================================================
// Helper Functions
// ============================================================================

function createDefaultFlows(count: number = DEFAULT_FLOW_COUNT): FlowSlot[] {
  return createDefaultJuceGridFlowSlots(SLOT_COLORS, count)
}

function createDefaultRouting(): RoutingConfig {
  return createDefaultJuceGridRouting()
}

const FLOW_SLOT_NORMALIZATION_OPTIONS = {
  palette: SLOT_COLORS,
  defaultCount: DEFAULT_FLOW_COUNT,
  maxFlows: MAX_FLOWS,
}

function parseStoredGridJson(...keys: string[]): unknown {
  for (const key of keys) {
    const storedValue = localStorage.getItem(key)
    if (!storedValue) {
      continue
    }
    try {
      return JSON.parse(storedValue)
    } catch {}
  }
  return null
}

function normalizeRuntimeGridState(
  flowSlotSource: unknown,
  routingSource: unknown,
  activeIndexSource: unknown,
): { flowSlots: FlowSlot[]; routing: RoutingConfig; activeFlowIndex: number } {
  return normalizeJuceGridStateSources(
    flowSlotSource,
    routingSource,
    activeIndexSource,
    FLOW_SLOT_NORMALIZATION_OPTIONS,
  )
}

// Migration from legacy localStorage format
function migrateLocalStorage(): { slots: FlowSlot[]; routing: RoutingConfig; activeIndex: number } | null {
  const MIGRATION_KEY = 'map2_juce_grid_migrated_v2'

  if (localStorage.getItem(MIGRATION_KEY) === 'true') {
    return null
  }

  try {
    const oldFlows = localStorage.getItem('map2_juce_grid_flows')
      ?? localStorage.getItem('map2_grid_flows')
    if (oldFlows) {
      const parsed = JSON.parse(oldFlows)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Check if already has new properties
        if (parsed[0] && parsed[0].dryWetMix !== undefined) {
          localStorage.setItem(MIGRATION_KEY, 'true')
          return null
        }
        const migratedState = normalizeRuntimeGridState(parsed, createDefaultRouting(), 0)

        localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify(migratedState.flowSlots))
        localStorage.setItem('map2_juce_grid_routing_v2', JSON.stringify(migratedState.routing))
        localStorage.setItem('map2_juce_grid_active_v2', String(migratedState.activeFlowIndex))
        localStorage.setItem(MIGRATION_KEY, 'true')

        return {
          slots: migratedState.flowSlots,
          routing: migratedState.routing,
          activeIndex: migratedState.activeFlowIndex,
        }
      }
    }
    localStorage.setItem(MIGRATION_KEY, 'true')
    return null
  } catch (e) {
    console.error('Grid migration failed:', e)
    localStorage.setItem(MIGRATION_KEY, 'true')
    return null
  }
}

function loadInitialJuceGridState(): { flowSlots: FlowSlot[]; routing: RoutingConfig; activeFlowIndex: number } {
  const migratedState = migrateLocalStorage()
  if (migratedState) {
    return normalizeRuntimeGridState(
      migratedState.slots,
      migratedState.routing,
      migratedState.activeIndex,
    )
  }

  return normalizeRuntimeGridState(
    parseStoredGridJson('map2_juce_grid_flows_v2', 'map2_grid_flows_v2'),
    parseStoredGridJson('map2_juce_grid_routing_v2', 'map2_grid_routing_v2'),
    localStorage.getItem('map2_juce_grid_active_v2') ?? localStorage.getItem('map2_grid_active_v2'),
  )
}

function loadInitialPluginPersistence(): {
  selectedPluginUri: string | null
  selectedPluginPosition: number | null
  effectModalOpen: boolean
  scrollTop: number
} {
  try {
    const rawSelectedPlugin = localStorage.getItem(JUCE_GRID_SELECTED_PLUGIN_KEY)
    let selectedPluginUri: string | null = null
    let selectedPluginPosition: number | null = null

    if (rawSelectedPlugin) {
      try {
        const parsed = JSON.parse(rawSelectedPlugin)
        if (typeof parsed === 'string') {
          selectedPluginUri = parsed || null
        } else if (parsed && typeof parsed === 'object') {
          const uri = typeof parsed.uri === 'string' ? parsed.uri.trim() : ''
          if (uri) {
            selectedPluginUri = uri
          }
          const parsedPosition = Number.parseInt(String(parsed.position ?? ''), 10)
          if (Number.isFinite(parsedPosition) && parsedPosition >= 0) {
            selectedPluginPosition = parsedPosition
          }
        }
      } catch {
        selectedPluginUri = rawSelectedPlugin || null
      }
    }

    const effectModalOpen = localStorage.getItem(JUCE_GRID_EFFECT_MODAL_OPEN_KEY) === 'true'
    const rawScrollTop = Number.parseFloat(localStorage.getItem(JUCE_GRID_SCROLL_TOP_KEY) ?? '0')
    return {
      selectedPluginUri,
      selectedPluginPosition,
      effectModalOpen,
      scrollTop: Number.isFinite(rawScrollTop) ? Math.max(0, rawScrollTop) : 0,
    }
  } catch {
    return {
      selectedPluginUri: null,
      selectedPluginPosition: null,
      effectModalOpen: false,
      scrollTop: 0,
    }
  }
}

// ============================================================================
// Main Component
// ============================================================================

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
  const [compactTab, setCompactTab] = useState<CompactTabId>('grid')

  const isCompactLayout = isMobile || isTablet
  const showCompactWorkflowPanels = isCompactLayout && !isTabletTouchLayout
  const showViewportBlockScreen = isMobile
  const showViewportRotateHint = showViewportBlockScreen && isTouchCapable

  const initialPersistedStateRef = useRef<ReturnType<typeof loadInitialJuceGridState> | null>(null)
  const initialPersistedState = initialPersistedStateRef.current
    ?? (initialPersistedStateRef.current = loadInitialJuceGridState())
  const initialPluginPersistenceRef = useRef<ReturnType<typeof loadInitialPluginPersistence> | null>(null)
  const initialPluginPersistence = initialPluginPersistenceRef.current
    ?? (initialPluginPersistenceRef.current = loadInitialPluginPersistence())

  // Flow slots state (with migration support)
  const [flowSlots, setFlowSlots] = useState<FlowSlot[]>(initialPersistedState.flowSlots)

  // Routing state
  const [routing, setRouting] = useState<RoutingConfig>(initialPersistedState.routing)

  // Active flow index
  const [activeFlowIndex, setActiveFlowIndex] = useState(initialPersistedState.activeFlowIndex)

  // UI State
  const [selectedPluginUri, setSelectedPluginUri] = useState<string | null>(initialPluginPersistence.selectedPluginUri)
  const [selectedPluginPosition, setSelectedPluginPosition] = useState<number | null>(initialPluginPersistence.selectedPluginPosition)
  const [effectModalOpen, setEffectModalOpen] = useState(initialPluginPersistence.effectModalOpen)
  const [showPluginBrowser, setShowPluginBrowser] = useState(false)
  const [showPresetBrowser, setShowPresetBrowser] = useState(false)
  const [showSavePresetModal, setShowSavePresetModal] = useState(false)
  const [savePresetName, setSavePresetName] = useState('')
  const [showRenameSnapshotModal, setShowRenameSnapshotModal] = useState(false)
  const [renameSnapshotName, setRenameSnapshotName] = useState('')
  const [showRenameChainModal, setShowRenameChainModal] = useState(false)
  const [renameChainName, setRenameChainName] = useState('')
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null)
  const [editingFlowLabel, setEditingFlowLabel] = useState('')
  const [editingFlowError, setEditingFlowError] = useState<string | null>(null)
  const [presetPendingDelete, setPresetPendingDelete] = useState<Snapshot | null>(null)
  const [showClearFlowsModal, setShowClearFlowsModal] = useState(false)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedFlowForAssignment, setSelectedFlowForAssignment] = useState<FlowSlot | null>(null)
  const [assignmentSelectedNodeId, setAssignmentSelectedNodeId] = useState('')
  const [assignmentRedundancyEnabled, setAssignmentRedundancyEnabled] = useState(false)
  const [isAssigningFlow, setIsAssigningFlow] = useState(false)
  const [pluginSearchQuery, setPluginSearchQuery] = useState('')
  const [midiLearnActive, setMidiLearnActive] = useState(false)
  const [midiScope, setMidiScope] = useState<JuceGridMidiScope>('all')
  const [midiRangeDrafts, setMidiRangeDrafts] = useState<Record<number, MidiRangeDraft>>({})
  const [isRefreshingPlugins, setIsRefreshingPlugins] = useState(false)

  // Enhanced UI State
  const [detailsPlugin, setDetailsPlugin] = useState<Plugin | null>(null)
  const [favoritePlugins, setFavoritePlugins] = useState<Set<string>>(new Set())
  const [pluginLevels, setPluginLevels] = useState<Record<string, { in: number; out: number }>>({})
  const [wetDryMixes, setWetDryMixes] = useState<Record<string, number>>({})
  const [reorderPreview, setReorderPreview] = useState<ReorderPreviewState>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [showPerformModal, setShowPerformModal] = useState(false)
  const [showAudioNodesModal, setShowAudioNodesModal] = useState(false)
  const [showRoutingTopologyModal, setShowRoutingTopologyModal] = useState(false)
  const [showLiveRuntimeModal, setShowLiveRuntimeModal] = useState(false)
  const [showOutputReferenceModal, setShowOutputReferenceModal] = useState(false)
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false)
  const [focusedBranchId, setFocusedBranchId] = useState<string | null>(null)
  const [expandedTabletBranchId, setExpandedTabletBranchId] = useState<string | null>(null)
  const [branchPageByFlowId, setBranchPageByFlowId] = useState<Record<string, number>>({})
  const [tabletEditorOpen, setTabletEditorOpen] = useState(false)
  const [pendingTabletDeletePlugin, setPendingTabletDeletePlugin] = useState<PendingTabletDeletePluginState | null>(null)
  const missingSelectedPluginMetaWarningKeyRef = useRef<string | null>(null)
  const openPlatformDocs = useCallback((doc?: string) => {
    const params = new URLSearchParams({ context: 'juce-grid' })
    if (doc) {
      params.set('doc', doc)
    }
    navigate(`/platforms/about?${params.toString()}`)
  }, [navigate])

  // Special settings for plugin filtering and snapshot editor setlist mode
  const { settings: specialSettings, updateSettings: updateSpecialSettings } = useSpecialSettings()

  // Category Filtering State
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    try {
      return localStorage.getItem('map2_juce_grid_plugin_category')
        || localStorage.getItem('map2_grid_plugin_category')
        || 'all'
    } catch { return 'all' }
  })

  // Collapsible Categories State
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const val = localStorage.getItem('map2_juce_grid_collapsed_categories')
        ?? localStorage.getItem('map2_grid_collapsed_categories')
      return val ? new Set(JSON.parse(val)) : new Set()
    } catch { return new Set() }
  })

  // Automation Timeline State
  const [automationTimelineExpanded, setAutomationTimelineExpanded] = useState(false)
  const [automationPanelHeight, setAutomationPanelHeight] = useState(0)
  const automationPanelRef = useRef<HTMLDivElement | null>(null)

  // Flow Snapshots Panel State
  const [midiModalOpen, setMidiModalOpen] = useState(false)
  const [showExpressionOverlay, setShowExpressionOverlay] = useState(false)
  const [outputReferenceThresholdDraft, setOutputReferenceThresholdDraft] = useState(3)
  const [snapshotsDirty, setSnapshotsDirty] = useState(false)
  const [snapshotSetlistModePending, setSnapshotSetlistModePending] = useState(false)
  const [editorSnapshotOverride, setEditorSnapshotOverride] = useState<SnapshotDetail | null>(null)
  const [pendingGoLiveSnapshotId, setPendingGoLiveSnapshotId] = useState<number | null>(null)
  const [failedGoLiveSnapshotId, setFailedGoLiveSnapshotId] = useState<number | null>(null)
  const [goLiveFailureReason, setGoLiveFailureReason] = useState<string | null>(null)
  const [goLiveDiffExpanded, setGoLiveDiffExpanded] = useState(false)
  const [dismissedGoLiveDiffKey, setDismissedGoLiveDiffKey] = useState<string | null>(null)
  const [sessionNoteDraft, setSessionNoteDraft] = useState('')
  const [flowClipTimestamps, setFlowClipTimestamps] = useState<Record<string, number>>({})
  const [flowInputClipTimestamps, setFlowInputClipTimestamps] = useState<Record<string, number>>({})
  const [flowOutputClipTimestamps, setFlowOutputClipTimestamps] = useState<Record<string, number>>({})
  const [routingInspectorId, setRoutingInspectorId] = useState<JuceGridRoutingMarkerId | null>(null)
  const bottomEditorRef = useRef<HTMLElement | null>(null)
  const midiLearnWasInProgressRef = useRef(false)
  const lastHydratedLiveSnapshotFingerprintRef = useRef<string | null>(null)
  const perfSeqRef = useRef(0)
  const [lastMidiActivityWs, setLastMidiActivityWs] = useState<{ cc: number; value: number; channel: number } | null>(null)
  const [automationPlaying, setAutomationPlaying] = useState(false)
  const [automationRecording, setAutomationRecording] = useState(false)
  const [automationLoopEnabled, setAutomationLoopEnabled] = useState(false)
  const [automationCurrentTime, setAutomationCurrentTime] = useState(0)
  const [automationDuration, setAutomationDuration] = useState(60)
  const [automationLanes, setAutomationLanes] = useState<AutomationLane[]>([])
  const [lanePickerOpen, setLanePickerOpen] = useState(false)

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

  // Audio Port Selection State — unified per-flow selector
  const [portSelectorFlowIndex, setPortSelectorFlowIndex] = useState<number | null>(null)

  // Preset Import Dialog
  const [showImportDialog, setShowImportDialog] = useState(false)

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

  useEffect(() => {
    try {
      if (selectedPluginUri) {
        localStorage.setItem(JUCE_GRID_SELECTED_PLUGIN_KEY, JSON.stringify({
          uri: selectedPluginUri,
          position: selectedPluginPosition,
        }))
      } else {
        localStorage.removeItem(JUCE_GRID_SELECTED_PLUGIN_KEY)
      }
    } catch {}
  }, [selectedPluginPosition, selectedPluginUri])

  useEffect(() => {
    try {
      localStorage.setItem(JUCE_GRID_EFFECT_MODAL_OPEN_KEY, effectModalOpen ? 'true' : 'false')
    } catch {}
  }, [effectModalOpen])

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

  useEffect(() => {
    const persistScrollPosition = () => {
      try {
        localStorage.setItem(JUCE_GRID_SCROLL_TOP_KEY, String(window.scrollY || window.pageYOffset || 0))
      } catch {}
    }

    const rafId = window.requestAnimationFrame(() => {
      if ((initialPluginPersistence.scrollTop || 0) > 0) {
        window.scrollTo({ top: initialPluginPersistence.scrollTop, behavior: 'auto' })
      }
    })

    window.addEventListener('scroll', persistScrollPosition, { passive: true })
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', persistScrollPosition)
    }
  }, [initialPluginPersistence.scrollTop])

  const markSnapshotsDirty = useCallback(() => {
    setSnapshotsDirty(true)
  }, [])

  const clearSnapshotsDirty = useCallback(() => {
    setSnapshotsDirty(false)
  }, [])

  useEffect(() => {
    try {
      localStorage.removeItem('map2_juce_grid_toolbar_collapsed')
    } catch {}
  }, [])

  const activeFlowChainId = flowSlots[activeFlowIndex]?.chainId ?? null
  const snapshotRouteActive = useRouteActive(['/snapshot-editor'])
  const snapshotStandardCadence = useRealtimeCadence({
    routeActive: snapshotRouteActive,
    visibleMs: 5_000,
    hiddenMs: 20_000,
    inactiveMs: false,
  })
  const snapshotFastCadence = useRealtimeCadence({
    routeActive: snapshotRouteActive,
    visibleMs: 2_000,
    hiddenMs: 10_000,
    inactiveMs: false,
  })
  const snapshotMeterCadence = useRealtimeCadence({
    routeActive: snapshotRouteActive,
    visibleMs: 1_000,
    hiddenMs: 5_000,
    inactiveMs: false,
  })
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

  // Fetch history status
  const historyQuery = useQuery({
    queryKey: ['history', 'status'],
    queryFn: historyApi.getStatus,
    refetchInterval: snapshotFastCadence,
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

  const liveSnapshotQuery = useQuery({
    queryKey: ['snapshots', 'live'],
    queryFn: fetchLiveSnapshotOrNull,
    refetchInterval: snapshotStandardCadence,
    retry: false,
  })
  const runtimeStateQuery = useSnapshotRuntimeLiveState(undefined, {
    refetchInterval: snapshotStandardCadence,
  })
  const snapshotsSummaryQuery = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => snapshotsApi.list(),
    refetchInterval: snapshotStandardCadence,
  })
  const currentEditorSnapshotId = editorSnapshotOverride?.id ?? liveSnapshotQuery.data?.id ?? null
  const snapshotRevisionsQuery = useQuery({
    queryKey: ['snapshots', 'revisions', currentEditorSnapshotId],
    queryFn: () => snapshotsApi.listRevisions(currentEditorSnapshotId!),
    enabled: showVersionHistoryModal && currentEditorSnapshotId != null,
    refetchOnWindowFocus: false,
  })
  const snapshotCount = snapshotsSummaryQuery.data?.count ?? 0
  const snapshotCountLabel = snapshotCount > 99 ? '99+' : String(snapshotCount)
  const existingSnapshotNames = useMemo(
    () => (snapshotsSummaryQuery.data?.snapshots ?? [])
      .map((snapshot) => snapshot.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0),
    [snapshotsSummaryQuery.data?.snapshots],
  )
  const snapshotEntryRequired = liveSnapshotQuery.isSuccess && currentEditorSnapshotId === null

  const openArtifactsSnapshots = useCallback(() => {
    navigate('/artifacts?category=snapshots')
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
    queryFn: audioApi.getPorts,
    refetchInterval: snapshotSlowCadence,
  })

  const routingQuery = useQuery({
    queryKey: ['audio', 'routing'],
    queryFn: audioApi.getRouting,
    refetchInterval: snapshotStandardCadence,
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
        queryClient.setQueryData(['snapshots', 'live'], event.snapshot_data)
        lastHydratedLiveSnapshotFingerprintRef.current = hydration.fingerprint
        setFlowSlots(normalizedSnapshotState.flowSlots)
        setRouting(normalizedSnapshotState.routing)
        setActiveFlowIndex(normalizedSnapshotState.activeFlowIndex)
        clearSnapshotsDirty()
        queryClient.invalidateQueries({ queryKey: ['snapshots'] })
        pushToast(
          buildSnapshotActivationToastMessage(event.snapshot_data, { programNumber: event.program_number ?? null }),
          'success',
          { durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS },
        )
      }
    }, [clearSnapshotsDirty, pushToast, queryClient]),
  })

  useWebSocketTopic('chain_updates', useCallback((_data, message) => {
    if (!message.type) {
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['chains'] })
    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'live'] })
  }, [queryClient]))

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
        const liveSnapshotId = liveSnapshotQuery.data?.id ?? null
        if (events.length > 0 && liveSnapshotId != null) {
          for (const event of events) {
            if (event.action === 'perform.tap_tempo') {
              const tapped = await snapshotsApi.tapTempo(liveSnapshotId, Date.now())
              if (tapped.snapshot) {
                queryClient.setQueryData(['snapshots', 'live'], tapped.snapshot)
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
  }, [liveSnapshotQuery.data?.id, queryClient, snapshotFastCadence])

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

  // Update plugin levels from WebSocket data
  useEffect(() => {
    if (pluginPeaks && outputsConnected) {
      const levels: Record<string, { in: number; out: number }> = {}
      for (const [uri, peaks] of Object.entries(pluginPeaks)) {
        levels[uri] = {
          in: (peaks as any).inputPeak || 0,
          out: (peaks as any).outputPeak || 0,
        }
      }
      setPluginLevels(levels)
    }
  }, [pluginPeaks, outputsConnected])

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
    const clipSourceChains = liveSnapshotQuery.data
      ? buildEffectiveLiveSnapshotChains(liveSnapshotQuery.data, chainsQuery.data).chains
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
  }, [chainsQuery.data, flowClipPeakEntries, flowSlots, liveSnapshotQuery.data])

  useEffect(() => {
    const now = Date.now()
    const clipSourceChains = liveSnapshotQuery.data
      ? buildEffectiveLiveSnapshotChains(liveSnapshotQuery.data, chainsQuery.data).chains
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
  }, [chainsQuery.data, flowClipPeakEntries, flowSlots, liveSnapshotQuery.data])

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
  const liveSnapshot = liveSnapshotQuery.data ?? null
  const runtimeLiveState = runtimeStateQuery.data ?? null
  const activeSnapshot = useMemo(
    () => editorSnapshotOverride ?? liveSnapshot,
    [editorSnapshotOverride, liveSnapshot],
  )
  const snapshotSetlistMode = specialSettings?.snapshotSetlistMode ?? false
  useEffect(() => {
    if (editorSnapshotOverride && liveSnapshot && editorSnapshotOverride.id === liveSnapshot.id) {
      setEditorSnapshotOverride(null)
    }
  }, [editorSnapshotOverride, liveSnapshot])
  const snapshotEditingLocked = Boolean(activeSnapshot?.is_locked)
  const snapshotGoLiveState = useMemo(
    () => resolveSnapshotGoLiveState({
      snapshot: activeSnapshot,
      runtimeLiveState,
      pendingSnapshotId: pendingGoLiveSnapshotId,
      failedSnapshotId: failedGoLiveSnapshotId,
      failureReason: goLiveFailureReason,
    }),
    [activeSnapshot, failedGoLiveSnapshotId, goLiveFailureReason, pendingGoLiveSnapshotId, runtimeLiveState],
  )
  const sessionNotes = activeSnapshot?.session_notes ?? []
  const effectiveChainsResponse = useMemo(
    () => (
      activeSnapshot
        ? buildEffectiveLiveSnapshotChains(activeSnapshot, chainsQuery.data)
        : (chainsQuery.data ?? { chains: [], count: 0 })
    ),
    [activeSnapshot, chainsQuery.data],
  )
  const effectiveChains = effectiveChainsResponse.chains
  const effectiveChainById = useMemo(
    () => new Map(effectiveChains.map((chain) => [chain.id, chain] as const)),
    [effectiveChains],
  )
  const historyStatus = historyQuery.data as HistoryStatus | undefined
  const presets = presetsQuery.data?.presets || []
  const liveChainProjection = useMemo(
    () => buildJuceGridLiveChainProjection(effectiveChains, flowSlots),
    [effectiveChains, flowSlots],
  )
  const pruneLiveSnapshotCache = useCallback((chainIds: readonly number[]) => {
    if (chainIds.length === 0) {
      return
    }

    queryClient.setQueryData<SnapshotDetail | null | undefined>(['snapshots', 'live'], (current) => (
      removeRuntimeChainsFromLiveSnapshot(current, chainIds)
    ))
  }, [queryClient])
  const desiredLiveChainIds = useMemo(
    () => getJuceGridDesiredLiveChainIds(flowSlots),
    [flowSlots],
  )
  const liveChainMismatch = useMemo(
    () => hasJuceGridLiveChainMismatch(liveChainProjection, flowSlots),
    [flowSlots, liveChainProjection],
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

  useEffect(() => {
    setOutputReferenceThresholdDraft(activeSnapshot?.output_level_warning_threshold_db ?? 3)
  }, [activeSnapshot?.output_level_warning_threshold_db])

  useEffect(() => {
    if (pendingGoLiveSnapshotId == null) {
      if (
        failedGoLiveSnapshotId != null
        && runtimeLiveState
        && (runtimeLiveState.display_state === 'live' || runtimeLiveState.display_state === 'live_warning')
        && runtimeLiveState.snapshot_id === failedGoLiveSnapshotId
      ) {
        setFailedGoLiveSnapshotId(null)
        setGoLiveFailureReason(null)
      }
      return
    }

    if (
      runtimeLiveState
      && (runtimeLiveState.display_state === 'live' || runtimeLiveState.display_state === 'live_warning')
      && runtimeLiveState.snapshot_id === pendingGoLiveSnapshotId
    ) {
      setPendingGoLiveSnapshotId(null)
      setFailedGoLiveSnapshotId(null)
      setGoLiveFailureReason(null)
      return
    }

    const runtimeFailureReason = runtimeLiveState?.failure_reason?.trim()
    if (runtimeFailureReason) {
      setPendingGoLiveSnapshotId(null)
      setFailedGoLiveSnapshotId(pendingGoLiveSnapshotId)
      setGoLiveFailureReason(runtimeFailureReason)
    }
  }, [failedGoLiveSnapshotId, pendingGoLiveSnapshotId, runtimeLiveState])

  useEffect(() => {
    if (
      activeSnapshot
      && failedGoLiveSnapshotId != null
      && failedGoLiveSnapshotId !== activeSnapshot.id
      && isSnapshotCurrentRuntimeLive(activeSnapshot, runtimeLiveState)
    ) {
      setFailedGoLiveSnapshotId(null)
      setGoLiveFailureReason(null)
    }
  }, [activeSnapshot, failedGoLiveSnapshotId, runtimeLiveState])

  const getChainForFlow = useCallback((slot: FlowSlot): Chain | undefined => {
    return slot.chainId !== null ? effectiveChainById.get(slot.chainId) : undefined
  }, [effectiveChainById])

  // Capture the current workspace as a snapshot draft
  const captureCurrentState = useCallback((): SnapshotDraftData => {
    const chainSnapshots: Record<string, ChainSnapshot> = {}

    for (const slot of flowSlots) {
      if (slot.chainId) {
        const chain = effectiveChainById.get(slot.chainId)
        if (chain) {
          chainSnapshots[String(slot.chainId)] = {
            name: chain.name,
            plugins: chain.plugins.map((p, i) => ({
              uri: p.uri,
              position: i,
              bypass: p.bypassed || false,
              parameters: p.parameters || {},
              loader_state: p.loader_state,
            })),
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
  }, [effectiveChainById, flowSlots, routing, activeFlowIndex])

  const currentSnapshotDraft = useMemo(() => captureCurrentState(), [captureCurrentState])
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

  const createSnapshotFromEditorMutation = useMutation({
    mutationFn: async (snapshotName: string) => {
      const created = await snapshotsApi.create({
        name: snapshotName,
        description: 'Created from Snapshot Editor',
        tempo_bpm: activeSnapshot?.tempo_bpm ?? 120,
        ...flowSnapshotDataToSnapshotPayload(currentSnapshotDraft),
      })
      return snapshotsApi.activate(created.snapshot_id)
    },
    onSuccess: (response) => {
      setEditorSnapshotOverride(null)
      queryClient.setQueryData(['snapshots', 'live'], response.snapshot_data)
      queryClient.setQueryData(['snapshots', 'detail', response.snapshot_id], response.snapshot_data)
      if (response.runtime_live_state) {
        queryClient.setQueryData(['snapshots', 'runtime', 'live-state', 'local'], response.runtime_live_state)
      }
      hydrateEditorFromSnapshot(response.snapshot_data, {
        toastMessage: buildSnapshotActivationToastMessage(response.snapshot_data),
        toastDurationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
        resetSelectedBlock: true,
        invalidateSnapshots: true,
      })
    },
    onError: (error, snapshotName) => {
      pushToast(
        buildSnapshotActivationFailureToastMessage(snapshotName, error),
        'warn',
        { durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS },
      )
    },
  })

  const openEditorSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.openDraft(snapshotId),
    onSuccess: (response) => {
      const detail = response.snapshot
      if (liveSnapshot?.id === detail.id) {
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
      })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  const activateCurrentSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.activate(snapshotId),
    onMutate: (snapshotId) => {
      setPendingGoLiveSnapshotId(snapshotId)
      setFailedGoLiveSnapshotId(null)
      setGoLiveFailureReason(null)
    },
    onSuccess: (response) => {
      queryClient.setQueryData(['snapshots', 'live'], response.snapshot_data)
      queryClient.setQueryData(['snapshots', 'detail', response.snapshot_id], response.snapshot_data)
      setEditorSnapshotOverride(null)
      hydrateEditorFromSnapshot(response.snapshot_data, {
        toastMessage: buildSnapshotActivationToastMessage(response.snapshot_data),
        toastDurationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
        resetSelectedBlock: true,
        invalidateSnapshots: true,
      })
    },
    onError: (error, snapshotId) => {
      const failureReason = extractSnapshotActivationFailureReason(error) ?? 'Activation failed.'
      const snapshotName = activeSnapshot?.id === snapshotId
        ? activeSnapshot.name
        : snapshotsSummaryQuery.data?.snapshots.find((snapshot) => snapshot.id === snapshotId)?.name ?? 'Snapshot'
      setPendingGoLiveSnapshotId((current) => (current === snapshotId ? null : current))
      setFailedGoLiveSnapshotId(snapshotId)
      setGoLiveFailureReason(failureReason)
      pushToast(
        buildSnapshotActivationFailureToastMessage(snapshotName, error),
        'warn',
        { durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS },
      )
    },
  })

  const toggleActiveSnapshotLockMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) {
        throw new Error('No active snapshot to lock')
      }
      return snapshotsApi.update(activeSnapshot.id, {
        is_locked: !Boolean(activeSnapshot.is_locked),
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

  const renameActiveSnapshotMutation = useMutation({
    mutationFn: async ({ snapshotId, name }: { snapshotId: number; name: string }) =>
      snapshotsApi.update(snapshotId, { name }),
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      setShowRenameSnapshotModal(false)
      setRenameSnapshotName('')
      pushToast(`Snapshot renamed to "${response.snapshot.name}"`, 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to rename snapshot', 'error')
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
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'revisions', response.snapshot.id] })
      setShowVersionHistoryModal(false)
      hydrateEditorFromSnapshot(response.snapshot, {
        toastMessage: `Restored revision ${response.restored_revision_number}`,
        invalidateSnapshots: true,
      })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to restore snapshot revision', 'error')
    },
  })

  const addSessionNoteMutation = useMutation({
    mutationFn: async ({ snapshotId, text }: { snapshotId: number; text: string }) =>
      snapshotsApi.addSessionNote(snapshotId, text),
    onSuccess: (response) => {
      queryClient.setQueryData<SnapshotDetail | null>(['snapshots', 'live'], (current) => (
        current && current.id === response.snapshot_id
          ? { ...current, session_notes: response.notes }
          : current
      ))
      queryClient.setQueryData<SnapshotDetail | undefined>(['snapshots', 'detail', response.snapshot_id], (current) => (
        current
          ? { ...current, session_notes: response.notes }
          : current
      ))
      setEditorSnapshotOverride((current) => (
        current && current.id === response.snapshot_id
          ? { ...current, session_notes: response.notes }
          : current
      ))
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      setSessionNoteDraft('')
      pushToast('Session note added', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to add session note', 'error')
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

  const syncSnapshotDetailCaches = useCallback((snapshot: SnapshotDetail) => {
    queryClient.setQueryData(['snapshots', 'detail', snapshot.id], snapshot)
    if (liveSnapshot?.id === snapshot.id) {
      queryClient.setQueryData(['snapshots', 'live'], snapshot)
      setEditorSnapshotOverride((current) => (current?.id === snapshot.id ? null : current))
      return
    }

    setEditorSnapshotOverride((current) => (current?.id === snapshot.id ? snapshot : current))
  }, [liveSnapshot?.id, queryClient])

  const hydrateEditorFromSnapshot = useCallback((
    detail: SnapshotDetail,
    options?: {
      toastMessage?: string | null
      toastDurationMs?: number
      resetSelectedBlock?: boolean
      invalidateSnapshots?: boolean
    },
  ) => {
    const hydration = buildSnapshotEditorLiveSnapshotHydration(
      detail,
      queryClient.getQueryData<ChainsResponse>(['chains']),
    )
    queryClient.setQueryData(['chains'], hydration.chainsResponse)
    queryClient.setQueryData(['snapshots', 'detail', detail.id], detail)
    lastHydratedLiveSnapshotFingerprintRef.current = hydration.fingerprint
    setEditorSnapshotState(hydration.snapshotData)
    if (options?.resetSelectedBlock) {
      setSelectedPluginSelection(null)
      setDetailsPlugin(null)
      setTabletEditorOpen(false)
      setEffectModalOpen(false)
    }
    clearSnapshotsDirty()
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
  }, [clearSnapshotsDirty, pushToast, queryClient, setEditorSnapshotState, setSelectedPluginSelection])

  useEffect(() => {
    if (!liveSnapshotQuery.isSuccess) {
      return
    }

    if (activeSnapshot === null) {
      lastHydratedLiveSnapshotFingerprintRef.current = null
      return
    }

    const hydration = buildSnapshotEditorLiveSnapshotHydration(
      activeSnapshot,
      queryClient.getQueryData<ChainsResponse>(['chains']),
    )
    if (lastHydratedLiveSnapshotFingerprintRef.current === hydration.fingerprint) {
      return
    }

    hydrateEditorFromSnapshot(activeSnapshot)
  }, [
    activeSnapshot,
    hydrateEditorFromSnapshot,
    liveSnapshotQuery.isSuccess,
    queryClient,
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
  const goLiveDiffSourceSnapshot = runtimeLiveState?.live_snapshot_payload ?? liveSnapshot
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
    if (!selectedPlugin || !selectedPluginMeta) {
      return null
    }

    const selectedParameters = selectedPlugin.parameters || {}

    return {
      ...selectedPluginMeta,
      name: selectedPluginMeta.name || selectedPlugin.name,
      bypassed: selectedPlugin.bypassed,
      instance_id: selectedPlugin.instance_id ?? selectedPluginMeta.instance_id,
      latency_samples: selectedPlugin.latency_samples ?? selectedPluginMeta.latency_samples,
      parameters: selectedPluginMeta.parameters.map((parameter) => ({
        ...parameter,
        value: selectedParameters[parameter.symbol] ?? parameter.value ?? parameter.default,
      })),
    }
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

  const midiScopeLabel = useMemo(() => {
    switch (midiScope) {
      case 'selected-plugin':
        return selectedPlugin
          ? `Selected block: ${getDisplayPluginName(selectedPlugin.name, selectedPlugin.uri)}`
          : 'Selected block'
      case 'active-chain':
        return currentChain ? `Active chain: ${currentChain.name}` : 'Active chain'
      case 'all':
      default:
        return 'All mappings'
    }
  }, [currentChain, midiScope, selectedPlugin])

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

  // Primary: WebSocket-driven instant MIDI activity (CC knob/fader feedback)
  useWebSocketTopic('midi_activity', useCallback((data: Record<string, any>) => {
    const msgType = data.message_type ?? data.type
    if (msgType === 'control_change') {
      setLastMidiActivityWs({
        cc: data.data1 ?? parseInt(data.raw_hex?.split(' ')[1] ?? '0', 16),
        value: data.data2 ?? parseInt(data.raw_hex?.split(' ')[2] ?? '0', 16),
        channel: data.channel ?? 0,
      })
    }
  }, []))

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

  const flowCardRoutingSummary = useMemo(() => {
    const inputCount = audioInterfaceStatus.channels || 0
    const outputCount = audioOutputStatus.channels || 0
    const sampleRate = Math.round((audioInterfaceStatus.sampleRate || audioOutputStatus.sampleRate || 48000) / 1000)
    const bufferSize = audioInterfaceStatus.bufferSize || audioOutputStatus.bufferSize || 256
    const routingMode = audioInterfaceStatus.routingMode
      ? FLOW_CARD_ROUTING_MODE_LABELS[audioInterfaceStatus.routingMode]
      : 'n/a'
    const allBindings = [...(audioInterfaceStatus.bindings || []), ...(audioOutputStatus.bindings || [])]
    const hasAvbRoutes = allBindings.some((binding) => binding.selection_type === 'avb_endpoint')
    const hasAvbWarning = allBindings.some(
      (binding) => binding.selection_type === 'avb_endpoint' && (binding.missing || !binding.available),
    ) || (hasAvbRoutes && !['operational', 'ready', 'locked'].includes(avbReadinessState.toLowerCase()))
    const statusLabel = audioInterfaceStatus.isRunning && audioOutputStatus.isRunning ? 'Run' : 'Stop'
    const avbLabel = hasAvbRoutes ? (hasAvbWarning ? 'AVB warning' : 'AVB routed') : 'Local only'

    return {
      statusLabel,
      ioLabel: `${inputCount} in / ${outputCount} out`,
      clockLabel: `${sampleRate}K / ${bufferSize}`,
      routingMode,
      avbLabel,
      title: [
        `Input: ${audioInterfaceStatus.deviceName || 'Audio interface'}`,
        `Output: ${audioOutputStatus.deviceName || 'Audio interface'}`,
        `State: ${statusLabel}`,
        `Channels: ${inputCount} in / ${outputCount} out`,
        `Clock: ${audioInterfaceStatus.sampleRate || audioOutputStatus.sampleRate || 48000}Hz / ${bufferSize} smp`,
        `Routing: ${routingMode}`,
        `Transport: ${avbLabel}`,
      ].join('\n'),
    }
  }, [audioInterfaceStatus, audioOutputStatus, avbReadinessState])

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
            { label: 'Live branches', value: formatInspectorList(activeFlowLabels) },
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
            { label: 'Live status', value: livePathLayout.status === 'available' ? 'Mix active' : 'Live path unavailable' },
          ],
        }
      case 'ab':
        return {
          heading: 'A/B selector',
          summary: 'One branch is live while alternate branches remain in standby for immediate recall.',
          tags: ['A/B', livePathLayout.status === 'available' ? 'Live' : 'Unavailable'],
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
    mutationFn: ({ chainId, pluginOrder }: { chainId: number; pluginOrder: PluginOrderRef[] }) =>
      chainsApi.reorderPlugins(chainId, pluginOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
    },
    onError: (error) => pushToast(`Failed to reorder: ${error}`, 'error'),
    onSettled: () => {
      setReorderPreview(null)
    },
  })

  const bypassMutation = useMutation({
    mutationFn: ({ chainId, pluginUri, bypass, pluginPosition }: { chainId: number; pluginUri: string; bypass: boolean; pluginPosition?: number }) =>
      chainsApi.togglePluginBypass(chainId, pluginUri, bypass, pluginPosition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
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
    previousLiveSnapshot?: SnapshotDetail | null
  }

  const deleteMutation = useMutation({
    mutationFn: ({ chainId, pluginUri, pluginPosition }: { chainId: number; pluginUri: string; pluginPosition?: number }) =>
      chainsApi.removePlugin(chainId, pluginUri, pluginPosition),
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
    onSuccess: () => {
      pushToast('Plugin removed', 'success')
    },
    onError: (error, _variables, context) => {
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

  const addPluginMutation = useMutation({
    mutationFn: ({ chainId, pluginUri }: { chainId: number; pluginUri: string }) =>
      chainsApi.addPlugin(chainId, pluginUri),
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
    onSuccess: () => {
      pushToast('Plugin added', 'success')
    },
    onError: (error, _variables, context) => {
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

  const activateMutation = useMutation({
    mutationFn: (chainId: number) => chainsApi.activate(chainId),
    onMutate: async (chainId): Promise<ChainActivationMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const nextActiveChainIds = new Set(
        (previousChains?.chains ?? [])
          .filter((chain) => chain.is_active)
          .map((chain) => chain.id),
      )
      nextActiveChainIds.add(chainId)
      queryClient.setQueryData<ChainsResponse>(['chains'], (current) => (
        applyOptimisticJuceGridLiveChainSet(current, nextActiveChainIds)
      ))
      return { previousChains }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'live'] })
      markSnapshotsDirty()
      pushToast('Chain activated', 'success')
    },
    onError: (error, _chainId, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      pushToast(`Failed to activate: ${error}`, 'error')
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (chainId: number) => chainsApi.deactivate(chainId),
    onMutate: async (chainId): Promise<ChainActivationMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      await queryClient.cancelQueries({ queryKey: ['snapshots', 'live'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousLiveSnapshot = queryClient.getQueryData<SnapshotDetail | null>(['snapshots', 'live'])
      const nextActiveChainIds = new Set(
        (previousChains?.chains ?? [])
          .filter((chain) => chain.is_active && chain.id !== chainId)
          .map((chain) => chain.id),
      )
      queryClient.setQueryData<ChainsResponse>(['chains'], (current) => (
        applyOptimisticJuceGridLiveChainSet(current, nextActiveChainIds)
      ))
      pruneLiveSnapshotCache([chainId])
      return { previousChains, previousLiveSnapshot }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'live'] })
      markSnapshotsDirty()
      pushToast('Chain deactivated', 'info')
    },
    onError: (error, _chainId, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      if (context?.previousLiveSnapshot !== undefined) {
        queryClient.setQueryData(['snapshots', 'live'], context.previousLiveSnapshot)
      }
      pushToast(`Failed to deactivate: ${error}`, 'error')
    },
  })

  const killLivePathMutation = useMutation({
    mutationFn: async (chainId: number) => {
      await chainsApi.deactivate(chainId)
      return chainId
    },
    onMutate: async (chainId): Promise<ChainActivationMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      await queryClient.cancelQueries({ queryKey: ['snapshots', 'live'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousLiveSnapshot = queryClient.getQueryData<SnapshotDetail | null>(['snapshots', 'live'])
      const nextActiveChainIds = new Set(
        (previousChains?.chains ?? [])
          .filter((chain) => chain.is_active && chain.id !== chainId)
          .map((chain) => chain.id),
      )
      queryClient.setQueryData<ChainsResponse>(['chains'], (current) => (
        applyOptimisticJuceGridLiveChainSet(current, nextActiveChainIds)
      ))
      pruneLiveSnapshotCache([chainId])
      return { previousChains, previousLiveSnapshot }
    },
    onSuccess: (chainId) => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'live'] })
      const killedChain = chains.find((chain) => chain.id === chainId)
      markSnapshotsDirty()
      pushToast(
        killedChain ? `Killed live path: ${killedChain.name}` : 'Killed live path',
        'info',
      )
    },
    onError: (error, _chainId, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      if (context?.previousLiveSnapshot !== undefined) {
        queryClient.setQueryData(['snapshots', 'live'], context.previousLiveSnapshot)
      }
      pushToast(`Failed to kill live path: ${error}`, 'error')
    },
  })

  const updateLiveChainsMutation = useMutation({
    mutationFn: async (nextActiveChainIds: number[]) => {
      const currentActiveChainIds = new Set(
        chains
          .filter((chain) => chain.is_active)
          .map((chain) => chain.id),
      )
      const desiredChainIdSet = new Set(nextActiveChainIds)
      const chainIdsToActivate = nextActiveChainIds.filter((chainId) => !currentActiveChainIds.has(chainId))
      const chainIdsToDeactivate = chains
        .filter((chain) => chain.is_active && !desiredChainIdSet.has(chain.id))
        .map((chain) => chain.id)

      for (const chainId of chainIdsToActivate) {
        await chainsApi.activate(chainId)
      }
      for (const chainId of chainIdsToDeactivate) {
        await chainsApi.deactivate(chainId)
      }

      return {
        chainIdsToActivate,
        chainIdsToDeactivate,
      }
    },
    onMutate: async (nextActiveChainIds): Promise<ChainActivationMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      await queryClient.cancelQueries({ queryKey: ['snapshots', 'live'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousLiveSnapshot = queryClient.getQueryData<SnapshotDetail | null>(['snapshots', 'live'])
      const currentActiveChainIds = new Set(
        (previousChains?.chains ?? [])
          .filter((chain) => chain.is_active)
          .map((chain) => chain.id),
      )
      const chainIdsToDeactivate = [...currentActiveChainIds].filter((chainId) => !nextActiveChainIds.includes(chainId))
      queryClient.setQueryData<ChainsResponse>(['chains'], (current) => (
        applyOptimisticJuceGridLiveChainSet(current, nextActiveChainIds)
      ))
      pruneLiveSnapshotCache(chainIdsToDeactivate)
      return { previousChains, previousLiveSnapshot }
    },
    onSuccess: ({ chainIdsToActivate, chainIdsToDeactivate }) => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'live'] })
      pushToast(
        chainIdsToActivate.length === 0 && chainIdsToDeactivate.length === 0
          ? 'Live chains already match the editor'
          : 'Live chains updated from the editor',
        'success',
      )
    },
    onError: (error, _nextActiveChainIds, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      if (context?.previousLiveSnapshot !== undefined) {
        queryClient.setQueryData(['snapshots', 'live'], context.previousLiveSnapshot)
      }
      pushToast(`Failed to update live chains: ${error}`, 'error')
    },
  })

  const undoMutation = useMutation({
    mutationFn: () => historyApi.undo(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      queryClient.invalidateQueries({ queryKey: ['history'] })
      markSnapshotsDirty()
      pushToast(data.message || 'Undo successful', 'success')
    },
    onError: (error) => pushToast(`Undo failed: ${error}`, 'error'),
  })

  const redoMutation = useMutation({
    mutationFn: () => historyApi.redo(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      queryClient.invalidateQueries({ queryKey: ['history'] })
      markSnapshotsDirty()
      pushToast(data.message || 'Redo successful', 'success')
    },
    onError: (error) => pushToast(`Redo failed: ${error}`, 'error'),
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
    mutationFn: ({ chainId, name }: { chainId: number; name: string }) =>
      chainsApi.rename(chainId, name),
    onSuccess: () => {
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
    if (snapshotEditingLocked || flowSlots.length >= MAX_FLOWS) return

    const nextIndex = flowSlots.length
    const colorConfig = SLOT_COLORS[nextIndex] || SLOT_COLORS[nextIndex % SLOT_COLORS.length]
    const chainName = buildTraceableChannelChainName(activeSnapshot?.name ?? null, colorConfig.label)

    try {
      const newChain = await chainsApi.create(chainName)
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

      setFlowSlots((prev) => [...prev, newSlot])
      setRouting((prev) => ({
        ...prev,
        seriesOrder: [...prev.seriesOrder, newSlot.id],
      }))
      markSnapshotsDirty()
      pushToast(`Channel ${colorConfig.label} created with ${chainName}`, 'success')
      queryClient.invalidateQueries({ queryKey: ['chains'] })
    } catch (error) {
      pushToast(`Failed to add channel: ${error}`, 'error')
    }
  }, [activeSnapshot?.name, flowSlots.length, markSnapshotsDirty, pushToast, queryClient, snapshotEditingLocked])

  const removeFlow = useCallback((flowId: string) => {
    if (snapshotEditingLocked || flowSlots.length <= MIN_FLOWS) return
    const removedIndex = flowSlots.findIndex(f => f.id === flowId)
    setFlowSlots(prev => prev.filter(f => f.id !== flowId))
    setRouting(prev => ({
      ...prev,
      seriesOrder: prev.seriesOrder.filter(id => id !== flowId),
    }))
    if (activeFlowIndex >= removedIndex && activeFlowIndex > 0) {
      setActiveFlowIndex(prev => prev - 1)
    }
  }, [flowSlots, activeFlowIndex, snapshotEditingLocked])

  const clearFlows = useCallback(() => {
    if (snapshotEditingLocked) {
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
    setFlowSlots([initialSlot])
    setActiveFlowIndex(0)
    setRouting(prev => ({
      ...prev,
      activeSlotId: initialSlot.id,
      seriesOrder: [initialSlot.id],
      blendPositions: { [initialSlot.id]: 100 },
    }))
    pushToast('Flows cleared', 'info')
  }, [pushToast, snapshotEditingLocked])

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
    if (snapshotEditingLocked) {
      return
    }
    setFlowSlots(prev => prev.map(f => f.id === flowId ? { ...f, ...updates } : f))
  }, [snapshotEditingLocked])

  const beginFlowRename = useCallback((flowId: string, currentLabel: string) => {
    if (snapshotEditingLocked) {
      return
    }
    setEditingFlowId(flowId)
    setEditingFlowLabel(currentLabel)
    setEditingFlowError(null)
  }, [snapshotEditingLocked])

  const cancelFlowRename = useCallback(() => {
    setEditingFlowId(null)
    setEditingFlowLabel('')
    setEditingFlowError(null)
  }, [])

  useEffect(() => {
    if (snapshotEditingLocked) {
      cancelFlowRename()
    }
  }, [cancelFlowRename, snapshotEditingLocked])

  const commitFlowRename = useCallback((flowId: string) => {
    const validationError = validateFlowCardLabel(editingFlowLabel, flowId, flowSlots)
    if (validationError) {
      setEditingFlowError(validationError)
      return false
    }

    updateFlow(flowId, { label: normalizeFlowCardLabel(editingFlowLabel) })
    markSnapshotsDirty()
    cancelFlowRename()
    return true
  }, [cancelFlowRename, editingFlowLabel, flowSlots, markSnapshotsDirty, updateFlow])

  const selectFlowIndex = useCallback((index: number) => {
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
  }, [flowSlots, isTabletTouchLayout])

  const closeAssignmentDialog = useCallback(() => {
    setAssignmentDialogOpen(false)
    setSelectedFlowForAssignment(null)
    setAssignmentSelectedNodeId('')
    setAssignmentRedundancyEnabled(false)
    setIsAssigningFlow(false)
  }, [])

  const openAssignmentDialog = useCallback((flow: FlowSlot) => {
    if (snapshotEditingLocked) {
      return
    }
    setSelectedFlowForAssignment(flow)
    setAssignmentSelectedNodeId('')
    setAssignmentRedundancyEnabled(false)
    setAssignmentDialogOpen(true)
  }, [snapshotEditingLocked])

  const handleAssignFlow = useCallback(async (nodeId: string, redundancyEnabled: boolean) => {
    if (snapshotEditingLocked) return
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
  }, [selectedFlowForAssignment, closeAssignmentDialog, pushToast, queryClient, snapshotEditingLocked])

  // Routing
  const setRoutingMode = useCallback((mode: RoutingMode) => {
    if (snapshotEditingLocked) {
      return
    }
    markSnapshotsDirty()
    setRouting((previous) => {
      const fallbackActiveId = previous.activeSlotId ?? activeFlow?.id ?? flowSlots[0]?.id ?? null
      if (mode === 'parameter_morph') {
        const morphSourceId = previous.morphSourceSlotId ?? fallbackActiveId
        const morphTargetId = previous.morphTargetSlotId
          ?? flowSlots.find((slot) => slot.id !== morphSourceId)?.id
          ?? null
        return {
          ...previous,
          mode,
          activeSlotId: fallbackActiveId,
          morphSourceSlotId: morphSourceId,
          morphTargetSlotId: morphTargetId,
        }
      }

      return {
        ...previous,
        mode,
        activeSlotId: fallbackActiveId,
      }
    })
  }, [activeFlow?.id, flowSlots, markSnapshotsDirty, snapshotEditingLocked])

  const setBlendPosition = useCallback((slotId: string, position: number) => {
    if (snapshotEditingLocked) {
      return
    }
    setRouting(prev => ({
      ...prev,
      blendPositions: { ...prev.blendPositions, [slotId]: position },
    }))
  }, [snapshotEditingLocked])

  const setMorphProgress = useCallback((progress: number) => {
    if (snapshotEditingLocked) {
      return
    }
    setRouting(prev => ({ ...prev, morphProgress: progress }))
  }, [snapshotEditingLocked])

  // Plugin operations
  const openSelectedBlockEditor = useCallback(() => {
    if (isTabletTouchLayout) {
      setTabletEditorOpen(true)
      return
    }

    setEffectModalOpen(true)
    if (isCompactLayout) {
      setCompactTab('editor')
    }
  }, [isCompactLayout, isTabletTouchLayout])

  const handlePluginSelect = useCallback((uri: string, position: number) => {
    if (!isTabletTouchLayout && selectedPluginUri === uri && selectedPluginPosition === position && effectModalOpen) {
      setEffectModalOpen(false)
      return
    }

    setSelectedPluginSelection(uri, position)
    if (isTabletTouchLayout) {
      return
    }

    openSelectedBlockEditor()
  }, [
    effectModalOpen,
    isTabletTouchLayout,
    openSelectedBlockEditor,
    selectedPluginPosition,
    selectedPluginUri,
    setSelectedPluginSelection,
  ])

  const handleCloseEffectModal = useCallback(() => {
    if (isTabletTouchLayout) {
      setTabletEditorOpen(false)
      return
    }
    setEffectModalOpen(false)
  }, [isTabletTouchLayout])

  const handleFlowSlotKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectFlowIndex(index)
    }
  }, [selectFlowIndex])

  const handleToggleBypass = useCallback((uri: string, bypassed: boolean, position: number) => {
    if (snapshotEditingLocked) return
    if (!currentChain) return
    bypassMutation.mutate({ chainId: currentChain.id, pluginUri: uri, bypass: bypassed, pluginPosition: position })
  }, [currentChain, bypassMutation, snapshotEditingLocked])

  const handleDeletePlugin = useCallback((uri: string, position?: number) => {
    if (snapshotEditingLocked) return
    if (!currentChain) return
    deleteMutation.mutate({ chainId: currentChain.id, pluginUri: uri, pluginPosition: position })
  }, [currentChain, deleteMutation, snapshotEditingLocked])

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
  }, [selectFlowIndex, snapshotEditingLocked, tabletFocusedFlow, tabletFocusedFlowIndex])

  const handleToggleTabletBranchDetails = useCallback((index: number, flowId: string) => {
    selectFlowIndex(index)
    setFocusedBranchId(flowId)
    setExpandedTabletBranchId((current) => current === flowId ? null : flowId)
  }, [selectFlowIndex])

  const confirmTabletDeleteSelectedPlugin = useCallback(() => {
    if (!pendingTabletDeletePlugin) {
      return
    }

    handleDeletePlugin(pendingTabletDeletePlugin.uri, pendingTabletDeletePlugin.position)
    setPendingTabletDeletePlugin(null)
    setTabletEditorOpen(false)
  }, [handleDeletePlugin, pendingTabletDeletePlugin])

  const handleReorderPlugins = useCallback((pluginOrder: PluginOrderRef[]) => {
    if (snapshotEditingLocked) return
    if (!currentChain) return
    reorderMutation.mutate({ chainId: currentChain.id, pluginOrder })
  }, [currentChain, reorderMutation, snapshotEditingLocked])

  const moveSelectedPlugin = useCallback((direction: ReorderDirection) => {
    if (snapshotEditingLocked) {
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

    const delta = direction === 'left' ? -1 : 1
    const targetIndex = currentIndex + delta
    if (targetIndex < 0 || targetIndex >= plugins.length) {
      return
    }

    const targetPlugin = plugins[targetIndex]
    const [movedPlugin] = plugins.splice(currentIndex, 1)
    plugins.splice(targetIndex, 0, movedPlugin)

    setReorderPreview({
      pluginUri: movedPlugin.uri,
      pluginPosition: movedPlugin.position,
      targetUri: targetPlugin.uri,
      targetPosition: targetPlugin.position,
      direction,
    })
    reorderMutation.mutate({
      chainId: currentChain.id,
      pluginOrder: plugins.map((plugin) => buildPluginOrderRef(plugin)),
    })
  }, [currentChain, reorderMutation, selectedPluginPosition, selectedPluginUri, snapshotEditingLocked])

  const handleAddPlugin = useCallback(() => {
    if (snapshotEditingLocked) {
      return
    }
    setShowPluginBrowser(true)
  }, [snapshotEditingLocked])

  const handleAddPluginToCurrentChain = useCallback((pluginUri: string) => {
    if (snapshotEditingLocked) {
      return
    }
    if (!currentChain) {
      pushToast('Select a chain before adding a plugin', 'warn')
      return
    }
    addPluginMutation.mutate({ chainId: currentChain.id, pluginUri })
  }, [currentChain, addPluginMutation, pushToast, snapshotEditingLocked])

  const handleAddPluginDirect = useCallback((uri: string) => {
    if (snapshotEditingLocked) return
    if (!currentChain) return
    addPluginMutation.mutate({ chainId: currentChain.id, pluginUri: uri })
  }, [currentChain, addPluginMutation, snapshotEditingLocked])

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
    if (snapshotEditingLocked) return
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

    pluginsApi.setParameterBatched(
      selectedPluginUri,
      paramIndex,
      value,
      selectedPlugin.instance_id,
      selectedPlugin.position,
    )
  }, [
    currentChain,
    midiLearnActive,
    midiLearnInProgress,
    pushToast,
    selectedPlugin,
    selectedPluginMeta,
    selectedPluginPosition,
    selectedPluginUri,
    snapshotEditingLocked,
    startMidiLearnMutation,
  ])

  const handleParameterChangeEnd = useCallback(() => {
    if (snapshotEditingLocked) return
    pluginsApi.flushParameterBatch()
    queryClient.invalidateQueries({ queryKey: ['chains'] })
    markSnapshotsDirty()
  }, [queryClient, markSnapshotsDirty, snapshotEditingLocked])

  const handleToggleSelectedBypass = useCallback(() => {
    if (snapshotEditingLocked) return
    if (!selectedPlugin || !currentChain) return
    bypassMutation.mutate({
      chainId: currentChain.id,
      pluginUri: selectedPlugin.uri,
      bypass: !selectedPlugin.bypassed,
      pluginPosition: selectedPlugin.position,
    })
  }, [selectedPlugin, currentChain, bypassMutation, snapshotEditingLocked])

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

  // Chain operations
  const handleUpdateLiveChains = useCallback(() => {
    if (!liveChainMismatch) {
      pushToast('Live chains already match the editor', 'info')
      return
    }
    updateLiveChainsMutation.mutate(desiredLiveChainIds)
  }, [desiredLiveChainIds, liveChainMismatch, pushToast, updateLiveChainsMutation])

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
    killLivePathMutation.mutate(chainId)
  }, [killLivePathMutation])

  const handleToggleChainActive = useCallback(() => {
    if (snapshotEditingLocked) return
    if (!currentChain) return
    if (currentChain.is_active) {
      deactivateMutation.mutate(currentChain.id)
    } else {
      activateMutation.mutate(currentChain.id)
    }
  }, [currentChain, activateMutation, deactivateMutation, snapshotEditingLocked])

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
    if (snapshotEditingLocked) return
    if (!currentChain) return
    const newName = `${currentChain.name} Copy`
    chainsApi.create(newName)
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
  }, [currentChain, queryClient, pushToast, markSnapshotsDirty, snapshotEditingLocked])

  const handleRenameChain = useCallback(() => {
    if (snapshotEditingLocked) return
    if (!currentChain) return
    setRenameChainName(currentChain.name)
    setShowRenameChainModal(true)
  }, [currentChain, snapshotEditingLocked])

  const handleRenameSnapshot = useCallback(() => {
    if (!activeSnapshot) {
      return
    }
    setRenameSnapshotName(activeSnapshot.name)
    setShowRenameSnapshotModal(true)
  }, [activeSnapshot])

  const handleChainRemoved = useCallback((chainId: number) => {
    setFlowSlots((previous) => previous.map((slot) => (
      slot.chainId === chainId
        ? { ...slot, chainId: null }
        : slot
    )))

    if (currentChain && currentChain.id === chainId) {
      setSelectedPluginSelection(null)
    }
    markSnapshotsDirty()
  }, [currentChain, markSnapshotsDirty, setSelectedPluginSelection])

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

  const submitSessionNote = useCallback(() => {
    const normalizedText = sessionNoteDraft.trim()
    if (!activeSnapshot || !normalizedText) {
      return
    }
    addSessionNoteMutation.mutate({ snapshotId: activeSnapshot.id, text: normalizedText })
  }, [activeSnapshot, addSessionNoteMutation, sessionNoteDraft])

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
    ? 'Setlist mode is active: snapshot stepping follows starred snapshots in gig order.'
    : 'Program mode is active: snapshot stepping follows all snapshots by MIDI program number.'
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
  const previousSnapshotDisabledReason = !activeSnapshot
    ? 'No previous snapshot'
    : activeSnapshotSequenceIndex === -1
      ? (snapshotSetlistMode ? 'Current snapshot is not in the setlist.' : 'No previous snapshot')
      : (previousEditorSnapshot ? undefined : 'No previous snapshot')
  const nextSnapshotDisabledReason = !activeSnapshot
    ? 'No next snapshot'
    : activeSnapshotSequenceIndex === -1
      ? (snapshotSetlistMode ? 'Current snapshot is not in the setlist.' : 'No next snapshot')
      : (nextEditorSnapshot ? undefined : 'No next snapshot')
  const loadEditorSnapshot = useCallback((snapshot: SnapshotSummary | null) => {
    if (!snapshot) {
      return
    }
    openEditorSnapshotMutation.mutate(snapshot.id)
  }, [openEditorSnapshotMutation])
  const goToPreviousSnapshot = useCallback(() => {
    loadEditorSnapshot(previousEditorSnapshot)
  }, [loadEditorSnapshot, previousEditorSnapshot])
  const goToNextSnapshot = useCallback(() => {
    loadEditorSnapshot(nextEditorSnapshot)
  }, [loadEditorSnapshot, nextEditorSnapshot])

  const handleGoLive = useCallback(() => {
    if (!activeSnapshot || snapshotGoLiveState.disabled || snapshotGoLiveState.phase === 'live') {
      return
    }

    activateCurrentSnapshotMutation.mutate(activeSnapshot.id)
  }, [activateCurrentSnapshotMutation, activeSnapshot, snapshotGoLiveState.disabled, snapshotGoLiveState.phase])

  const renderSnapshotsToolbar = () => (
    <div className={`snapshot-toolbar ${snapshotsDirty ? 'is-dirty' : ''}`} role="toolbar" aria-label="Snapshots toolbar">
      {snapshotsDirty && (
        prefersReducedMotion ? (
          <span className="snapshot-toolbar__pulse" aria-hidden />
        ) : (
          <motion.span
            className="snapshot-toolbar__pulse"
            aria-hidden
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: [0.95, 1.25, 0.95], opacity: [0.8, 0.25, 0.8] }}
            transition={{ repeat: Infinity, repeatType: 'loop', stiffness: 80, damping: 20, duration: 1 }}
          />
        )
      )}
      <div className="snapshot-toolbar__label" title={snapshotWorkspaceTitle}>
        <span className="snapshot-toolbar__title">Snapshots</span>
      </div>
      <div className="snapshot-toolbar__actions">
        {snapshotGoLiveState.phase === 'live' ? (
          <span
            className="snapshot-toolbar__live-indicator juce-grid-page__snapshot-status-state-label is-current is-blinking"
            aria-live="polite"
          >
            LIVE
          </span>
        ) : (
          <Button
            size="sm"
            kind={snapshotGoLiveState.phase === 'error' ? 'danger' : 'primary'}
            className={`snapshot-toolbar__button snapshot-toolbar__button--go-live ${snapshotGoLiveState.phase === 'activating' ? 'is-pending' : ''}`}
            renderIcon={snapshotGoLiveState.phase === 'activating' || snapshotGoLiveState.phase === 'error' ? Renew : Play}
            onClick={handleGoLive}
            disabled={!activeSnapshot || snapshotGoLiveState.disabled}
          >
            {snapshotGoLiveState.label}
          </Button>
        )}
        <Button
          size="sm"
          kind="secondary"
          className="snapshot-toolbar__button snapshot-toolbar__button--new"
          onClick={() => createSnapshotFromEditorMutation.mutate(buildDefaultSnapshotName(snapshotCount + 1))}
          disabled={createSnapshotFromEditorMutation.isPending}
        >
          {createSnapshotFromEditorMutation.isPending ? 'Creating…' : 'New'}
        </Button>
        <Button
          size="sm"
          kind="secondary"
          className="snapshot-toolbar__button snapshot-toolbar__button--update"
          onClick={() => updateActiveSnapshotMutation.mutate()}
          disabled={!activeSnapshot || snapshotEditingLocked || updateActiveSnapshotMutation.isPending}
        >
          {updateActiveSnapshotMutation.isPending ? 'Updating…' : 'Update'}
        </Button>
        <Button
          size="sm"
          kind="ghost"
          className="snapshot-toolbar__button snapshot-toolbar__button--prev"
          renderIcon={ArrowLeft}
          onClick={goToPreviousSnapshot}
          disabled={snapshotNavigationPending || !previousEditorSnapshot}
          title={previousSnapshotDisabledReason}
        >
          Prev
        </Button>
        <Button
          size="sm"
          kind="ghost"
          className="snapshot-toolbar__button snapshot-toolbar__button--next"
          renderIcon={ArrowRight}
          onClick={goToNextSnapshot}
          disabled={snapshotNavigationPending || !nextEditorSnapshot}
          title={nextSnapshotDisabledReason}
        >
          Next
        </Button>
        <Button
          size="sm"
          kind="ghost"
          className="snapshot-toolbar__button snapshot-toolbar__button--duplicate"
          renderIcon={Copy}
          onClick={() => duplicateActiveSnapshotMutation.mutate()}
          disabled={!activeSnapshot || duplicateActiveSnapshotMutation.isPending}
        >
          {duplicateActiveSnapshotMutation.isPending ? 'Duplicating…' : 'Duplicate'}
        </Button>
        {activeSnapshot ? (
          <Button
            size="sm"
            kind={snapshotEditingLocked ? 'secondary' : 'ghost'}
            className="snapshot-toolbar__button"
            onClick={() => toggleActiveSnapshotLockMutation.mutate()}
            disabled={toggleActiveSnapshotLockMutation.isPending}
          >
            {toggleActiveSnapshotLockMutation.isPending
              ? (snapshotEditingLocked ? 'Unlocking…' : 'Locking…')
              : (snapshotEditingLocked ? 'Locked' : 'Lock')}
          </Button>
        ) : null}
        {activeSnapshot ? (
          <Button
            size="sm"
            kind={activeSnapshot.is_favorite ? 'secondary' : 'ghost'}
            className="snapshot-toolbar__button snapshot-toolbar__button--favorite"
            renderIcon={activeSnapshot.is_favorite ? FavoriteFilled : Favorite}
            onClick={() => {
              toggleActiveSnapshotFavoriteMutation.mutate({
                snapshotId: activeSnapshot.id,
                isFavorite: !activeSnapshot.is_favorite,
              })
            }}
            disabled={toggleActiveSnapshotFavoriteMutation.isPending}
          >
            {toggleActiveSnapshotFavoriteMutation.isPending
              ? 'Saving…'
              : activeSnapshot.is_favorite
                ? 'Favorited'
                : 'Favorite'}
          </Button>
        ) : null}
        <Button
          size="sm"
          kind={snapshotSetlistMode ? 'secondary' : 'ghost'}
          className="snapshot-toolbar__button snapshot-toolbar__button--setlist"
          aria-pressed={snapshotSetlistMode}
          onClick={() => { void toggleSnapshotSetlistMode() }}
          disabled={snapshotSetlistModePending}
          title={snapshotSetlistModeTitle}
        >
          {snapshotSetlistModePending ? 'Saving…' : 'Setlist'}
        </Button>
        <Button
          size="sm"
          kind="secondary"
          className="snapshot-toolbar__button snapshot-toolbar__button--load"
          onClick={openArtifactsSnapshots}
          aria-label="Open snapshots workspace"
          title={snapshotWorkspaceTitle}
        >
          Load
        </Button>
      </div>
    </div>
  )

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
            kind="ghost"
            renderIcon={ArrowsHorizontal}
            onClick={() => setShowExpressionOverlay(true)}
          >
            Expression Mappings
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

      {midiMappingsQuery.isLoading ? (
        <div className="juce-grid-page__empty-state">
          <InlineLoading description="Loading MIDI mappings" />
        </div>
      ) : midiMappingsQuery.isError ? (
        <div className="juce-grid-page__empty-state">
          <p>Unable to load MIDI mappings</p>
          <p className="juce-grid-page__empty-state-copy">
            {midiMappingsQuery.error instanceof Error ? midiMappingsQuery.error.message : 'The MIDI API did not return a mapping list.'}
          </p>
        </div>
      ) : midiMappings.length === 0 ? (
        <div className="juce-grid-page__empty-state">
          <p>No MIDI mappings in this scope</p>
          <p className="juce-grid-page__empty-state-copy">
            {midiLearnActive
              ? 'Touch a block parameter to start canonical MIDI learn for the selected processor.'
              : 'Arm MIDI Learn, then touch a block parameter, or use the MIDI window for full mapping authoring.'}
          </p>
        </div>
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
        <div className="juce-grid-page__empty-state">
          <p>No automation lanes</p>
          <p className="juce-grid-page__empty-state-copy">
            Add a lane to capture parameter movement for the active flow.
          </p>
        </div>
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
    const statusLabel = automationRecording
      ? 'Recording'
      : automationPlaying
        ? 'Playing'
        : automationLanes.length > 0
          ? 'Ready'
          : 'Idle'
    const armedLabel = armedAutomationLane ? ` • Armed ${armedAutomationLane.parameterName}` : ''
    return `${statusLabel} • ${automationLanes.length} lanes${armedLabel}`
  }, [armedAutomationLane, automationLanes.length, automationPlaying, automationRecording])

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target)) {
        if (e.key === 'Escape') {
          if (showSavePresetModal) setShowSavePresetModal(false)
          else if (showRenameSnapshotModal) setShowRenameSnapshotModal(false)
          else if (showRenameChainModal) setShowRenameChainModal(false)
          else if (pendingTabletDeletePlugin) setPendingTabletDeletePlugin(null)
          else if (presetPendingDelete) setPresetPendingDelete(null)
          else if (showClearFlowsModal) setShowClearFlowsModal(false)
          else if (showLiveRuntimeModal) setShowLiveRuntimeModal(false)
          else if (showOutputReferenceModal) setShowOutputReferenceModal(false)
          else if (showVersionHistoryModal) setShowVersionHistoryModal(false)
          else if (midiModalOpen) setMidiModalOpen(false)
          else if (routingInspectorId) setRoutingInspectorId(null)
        }
        return
      }

      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (historyStatus?.can_undo) undoMutation.mutate()
        return
      }

      // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (historyStatus?.can_redo) redoMutation.mutate()
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
        if (snapshotEditingLocked) {
          pushToast('Unlock snapshot before editing it', 'warn')
          return
        }
        bypassMutation.mutate({
          chainId: currentChain.id,
          pluginUri: selectedPlugin.uri,
          bypass: !selectedPlugin.bypassed,
        })
        return
      }

      // Delete/Backspace = Remove selected plugin
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlugin && currentChain) {
        e.preventDefault()
        if (snapshotEditingLocked) {
          pushToast('Unlock snapshot before editing it', 'warn')
          return
        }
        deleteMutation.mutate({
          chainId: currentChain.id,
          pluginUri: selectedPlugin.uri,
          pluginPosition: selectedPlugin.position,
        })
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
        else if (showRenameSnapshotModal) setShowRenameSnapshotModal(false)
        else if (showRenameChainModal) setShowRenameChainModal(false)
        else if (pendingTabletDeletePlugin) setPendingTabletDeletePlugin(null)
        else if (presetPendingDelete) setPresetPendingDelete(null)
        else if (showClearFlowsModal) setShowClearFlowsModal(false)
        else if (showLiveRuntimeModal) setShowLiveRuntimeModal(false)
        else if (showOutputReferenceModal) setShowOutputReferenceModal(false)
        else if (showVersionHistoryModal) setShowVersionHistoryModal(false)
        else if (midiModalOpen) setMidiModalOpen(false)
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
    historyStatus, undoMutation, redoMutation, selectedPlugin, currentChain,
    bypassMutation, deleteMutation, selectedPluginUri, selectedPluginMeta,
    flowSlots, showSavePresetModal, showRenameSnapshotModal, showRenameChainModal, pendingTabletDeletePlugin, presetPendingDelete,
    showClearFlowsModal, showLiveRuntimeModal, showOutputReferenceModal, showVersionHistoryModal, midiModalOpen, routingInspectorId, showPluginBrowser,
    showPresetBrowser, showKeyboardHelp, detailsPlugin, effectModalOpen, isTabletTouchLayout, tabletEditorOpen,
    handleSavePreset, toggleFavorite, selectFlowIndex, openSelectedBlockEditor, moveSelectedPlugin, pushToast, setSelectedPluginSelection,
    goToPreviousSnapshot, goToNextSnapshot,
    snapshotEditingLocked,
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
    const flowLabel = flow.label || SLOT_COLORS[index]?.label || String.fromCharCode(65 + index)
    const flowTitle = flowChain?.name || `Flow ${flowLabel}`
    const isEditingFlow = editingFlowId === flow.id
    const flowSummary = flowChain
      ? `${flowChain.plugins.length} loaded ${flowChain.plugins.length === 1 ? 'block' : 'blocks'}`
      : 'Assign a chain to start editing'
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
    const [desktopFlowMetaLinePrimary, desktopFlowMetaLineSecondary] = buildFlowCardMetadataLines({
      flowSummary,
      isActive,
      activeAudio: Boolean(flowState?.activeAudio),
      branchLabel,
      secondaryAnnotation: flowState?.secondaryAnnotation ?? null,
      ioLabel: flowCardRoutingSummary.ioLabel,
      clockLabel: flowCardRoutingSummary.clockLabel,
      routingMode: flowCardRoutingSummary.routingMode,
      avbLabel: flowCardRoutingSummary.avbLabel,
    })
    const signalCanvas = (
      <JuceGridSignalCanvas
        chain={flowChain || null}
        branchId={flow.id}
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
          bypassMutation.mutate({ chainId: flowChain.id, pluginUri: uri, bypass: bypassed, pluginPosition: position })
        }}
        onDeletePlugin={(uri, position) => {
          if (!flowChain) return
          deleteMutation.mutate({
            chainId: flowChain.id,
            pluginUri: uri,
            pluginPosition: position,
          })
        }}
        onReorderPlugins={(pluginOrder) => {
          if (!flowChain) return
          reorderMutation.mutate({ chainId: flowChain.id, pluginOrder })
        }}
        onAddPlugin={flow.id === addEffectFlowId ? handleAddPlugin : undefined}
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
          onClick={isTabletTouchLayout ? undefined : () => selectFlowIndex(index)}
          onKeyDown={isTabletTouchLayout ? undefined : (event) => handleFlowSlotKeyDown(event, index)}
          role={isTabletTouchLayout ? undefined : 'button'}
          tabIndex={isTabletTouchLayout ? undefined : 0}
          aria-pressed={isTabletTouchLayout ? undefined : isActive}
          aria-label={isTabletTouchLayout ? undefined : `Select flow ${flowLabel}, ${flowTitle}`}
        >
          {isTabletTouchLayout ? (
            <>
              <button
                type="button"
                className={`juce-grid-page__tablet-flow-summary ${isTabletBranchExpanded ? 'is-expanded' : ''}`}
                onClick={() => handleToggleTabletBranchDetails(index, flow.id)}
                aria-expanded={isTabletBranchExpanded}
                aria-controls={`juce-grid-tablet-flow-details-${flow.id}`}
              >
                <div className="juce-grid-page__tablet-flow-summary-main">
                  <div className="juce-grid-page__tablet-flow-summary-copy">
                    <p className="juce-grid-page__dense-card-kicker">{flowLabel}</p>
                    {isEditingFlow ? (
                      <input
                        className="juce-grid-page__flow-card-title-input"
                        aria-label={`Rename flow ${flowLabel}`}
                        value={editingFlowLabel}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          setEditingFlowLabel(event.target.value)
                          setEditingFlowError(null)
                        }}
                        onBlur={() => { void commitFlowRename(flow.id) }}
                        onKeyDown={(event) => {
                          event.stopPropagation()
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void commitFlowRename(flow.id)
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            cancelFlowRename()
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className="juce-grid-page__flow-card-title-button"
                        disabled={snapshotEditingLocked}
                        onClick={(event) => {
                          event.stopPropagation()
                          beginFlowRename(flow.id, flowLabel)
                        }}
                      >
                        <h3 className="juce-grid-page__flow-card-title-heading">{flowLabel}</h3>
                      </button>
                    )}
                    {isEditingFlow && editingFlowError ? (
                      <p className="juce-grid-page__flow-card-error">{editingFlowError}</p>
                    ) : null}
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
                    <button
                      type="button"
                      className="juce-grid-page__flow-card-routing-summary"
                      disabled={snapshotEditingLocked}
                      onClick={() => {
                        selectFlowIndex(index)
                        setPortSelectorFlowIndex(index)
                      }}
                      title={flowCardRoutingSummary.title}
                    >
                      <span className="juce-grid-page__flow-card-routing-group juce-grid-page__flow-card-routing-group--identity">
                        <span className="juce-grid-page__flow-card-routing-copy">
                          <span className="juce-grid-page__flow-card-routing-label">I/O routing</span>
                          <span className="juce-grid-page__flow-card-routing-status">{flowCardRoutingSummary.statusLabel}</span>
                        </span>
                      </span>
                      <span className="juce-grid-page__flow-card-routing-divider" aria-hidden="true" />
                      <span className="juce-grid-page__flow-card-routing-group juce-grid-page__flow-card-routing-group--metrics">
                        <span className="juce-grid-page__flow-card-routing-readout">
                          <SegmentedLedText value={flowCardRoutingSummary.ioLabel} size="sm" color={FLOW_CARD_LED_COLOR} />
                        </span>
                        <span className="juce-grid-page__flow-card-routing-readout">
                          <SegmentedLedText value={flowCardRoutingSummary.clockLabel} size="sm" color={FLOW_CARD_LED_COLOR} />
                        </span>
                      </span>
                      <span className="juce-grid-page__flow-card-routing-divider" aria-hidden="true" />
                      <span className="juce-grid-page__flow-card-routing-group juce-grid-page__flow-card-routing-group--context">
                        <span className="juce-grid-page__flow-card-routing-badge">{flowCardRoutingSummary.routingMode}</span>
                        <span className="juce-grid-page__flow-card-routing-badge">{flowCardRoutingSummary.avbLabel}</span>
                      </span>
                    </button>
                    <div className="juce-grid-page__tablet-flow-detail-actions">
                      <Button
                        size="sm"
                        kind={!flowChain ? 'primary' : 'ghost'}
                        renderIcon={Edit}
                        onClick={() => selectFlowIndex(index)}
                      >
                        {flowChain ? 'Edit chain' : 'Assign chain'}
                      </Button>
                      <Button
                        size="sm"
                        kind="ghost"
                        renderIcon={Network_3}
                        onClick={() => openAssignmentDialog(flow)}
                        disabled={snapshotEditingLocked}
                      >
                        Audio nodes
                      </Button>
                      <Button
                        size="sm"
                        kind={flow.solo ? 'secondary' : 'ghost'}
                        renderIcon={Headphones}
                        onClick={() => updateFlow(flow.id, { solo: !flow.solo })}
                        disabled={snapshotEditingLocked}
                      >
                        {flow.solo ? 'Solo on' : 'Solo off'}
                      </Button>
                      <Button
                        size="sm"
                        kind={flow.muted ? 'secondary' : 'ghost'}
                        renderIcon={flow.muted ? VolumeMute : VolumeUp}
                        onClick={() => updateFlow(flow.id, { muted: !flow.muted })}
                        disabled={snapshotEditingLocked}
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
                      accentColor={flow.color}
                      onChange={(value) => updateFlow(flow.id, { dryWetMix: value })}
                      disabled={snapshotEditingLocked}
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
                <div className="juce-grid-page__flow-card-header">
                  <div className="juce-grid-page__flow-card-main">
                    <div className="juce-grid-page__flow-card-primary" role="group" aria-label={`${flowLabel} primary controls`}>
                      <span className="juce-grid-page__flow-card-label" title={flowTitle}>
                        <span className="juce-grid-page__flow-card-label-text">{flowLabel}</span>
                      </span>

                      <div className="juce-grid-page__flow-card-title-wrap">
                        {isEditingFlow ? (
                          <input
                            className="juce-grid-page__flow-card-title-input"
                            aria-label={`Rename flow ${flowLabel}`}
                            value={editingFlowLabel}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              setEditingFlowLabel(event.target.value)
                              setEditingFlowError(null)
                            }}
                            onBlur={() => { void commitFlowRename(flow.id) }}
                            onKeyDown={(event) => {
                              event.stopPropagation()
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                void commitFlowRename(flow.id)
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelFlowRename()
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            className="juce-grid-page__flow-card-title-button"
                            disabled={snapshotEditingLocked}
                            onClick={(event) => {
                              event.stopPropagation()
                              beginFlowRename(flow.id, flowLabel)
                            }}
                            title={`Rename ${flowLabel}`}
                          >
                            <span className="juce-grid-page__flow-card-title-heading">{flowLabel}</span>
                          </button>
                        )}
                        {isEditingFlow && editingFlowError ? (
                          <span className="juce-grid-page__flow-card-error">{editingFlowError}</span>
                        ) : null}
                      </div>

                      <div
                        className="juce-grid-page__flow-card-level"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <FlowLevelControl
                          flowId={flow.id}
                          flowLabel={flowLabel}
                          value={flow.dryWetMix}
                          accentColor={flow.color}
                          onChange={(value) => updateFlow(flow.id, { dryWetMix: value })}
                          disabled={snapshotEditingLocked}
                        />
                      </div>

                      <button
                        type="button"
                        className="juce-grid-page__flow-card-meta juce-grid-page__flow-card-meta--inline"
                        disabled={snapshotEditingLocked}
                        onClick={(event) => {
                          event.stopPropagation()
                          selectFlowIndex(index)
                          setPortSelectorFlowIndex(index)
                        }}
                        title={`${flowTitle}\n${flowCardRoutingSummary.title}`}
                      >
                        <span className="juce-grid-page__flow-card-meta-line">
                          {desktopFlowMetaLinePrimary}
                        </span>
                        <span className="juce-grid-page__flow-card-meta-line">
                          {desktopFlowMetaLineSecondary}
                        </span>
                      </button>

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

                      <button
                        type="button"
                        className={`juce-grid-page__flow-card-state juce-grid-page__flow-card-state--mute ${flow.muted ? 'is-active' : ''}`}
                        disabled={snapshotEditingLocked}
                        onClick={(event) => {
                          event.stopPropagation()
                          updateFlow(flow.id, { muted: !flow.muted })
                        }}
                        aria-pressed={flow.muted}
                        title={`${flow.muted ? 'Disable' : 'Enable'} mute for flow ${flowLabel}`}
                      >
                        M
                      </button>

                      <button
                        type="button"
                        className={`juce-grid-page__flow-card-state juce-grid-page__flow-card-state--solo ${flow.solo ? 'is-active' : ''}`}
                        disabled={snapshotEditingLocked}
                        onClick={(event) => {
                          event.stopPropagation()
                          updateFlow(flow.id, { solo: !flow.solo })
                        }}
                        aria-pressed={flow.solo}
                        title={`${flow.solo ? 'Disable' : 'Enable'} solo for flow ${flowLabel}`}
                      >
                        S
                      </button>
                    </div>
                  </div>

                  <div className="juce-grid-page__flow-card-side" role="toolbar" aria-label={`${flowLabel} flow services`}>
                    <button
                      type="button"
                      className="juce-grid-page__flow-card-assign"
                      disabled={snapshotEditingLocked}
                      onClick={(event) => {
                        event.stopPropagation()
                        openAssignmentDialog(flow)
                      }}
                      title={`Assign ${flowLabel} to node`}
                    >
                      <Network_3 size={16} />
                      <span>Assign</span>
                    </button>

                    {flowSlots.length > MIN_FLOWS && (
                      <button
                        type="button"
                        className="juce-grid-page__flow-card-delete"
                        disabled={snapshotEditingLocked}
                        onClick={(event) => {
                          event.stopPropagation()
                          removeFlow(flow.id)
                        }}
                        title={`Delete flow ${flowLabel}`}
                        aria-label={`Delete flow ${flowLabel}`}
                      >
                        <TrashCan size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="juce-grid-page__flow-card-content">
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
  const tabletEditorVisible = isTabletTouchLayout && tabletEditorOpen && bottomEditorHasSelection
  const bottomEditorOpen = !isTabletTouchLayout && effectModalOpen && bottomEditorHasSelection
  const bottomEditorAccentColor = getCategoryConfig(selectedPluginMeta?.category || 'Utility').color
  const selectedPluginIndex = selectedPlugin && currentChain
    ? currentChain.plugins.findIndex((plugin) => (
      plugin.uri === selectedPlugin.uri
      && plugin.position === selectedPlugin.position
    ))
    : -1
  const canMoveSelectedPluginLeft = selectedPluginIndex > 0
  const canMoveSelectedPluginRight = selectedPluginIndex >= 0 && currentChain
    ? selectedPluginIndex < currentChain.plugins.length - 1
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
        disabled={snapshotEditingLocked}
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
        readOnly={snapshotEditingLocked}
      />
    )
  ) : null
  const canPageTabletFocusedBranchBackward = tabletFocusedBranchPage > 0
  const canPageTabletFocusedBranchForward = tabletFocusedBranchPage < tabletFocusedBranchPageCount - 1
  const liveRuntimeDisplayState = runtimeStateQuery.data?.display_state
  const liveRuntimeActive = liveRuntimeDisplayState === 'live' || liveRuntimeDisplayState === 'live_warning'
  const liveRuntimeButtonLabel = liveRuntimeDisplayState === 'live_warning'
    ? 'Live Warning'
    : liveRuntimeDisplayState === 'offline'
      ? 'Offline'
      : liveRuntimeActive
        ? 'Live'
        : 'Live State'
  const snapshotDetailsAction = (
    <MenuButton
      label="Details"
      size="sm"
      kind="primary"
      menuAlignment="bottom-end"
      menuBorder
      className="juce-grid-page__snapshot-status-details-menu"
    >
      <MenuItem
        label="Add path"
        renderIcon={Add}
        className="juce-grid-page__snapshot-status-details-item juce-grid-page__snapshot-status-details-item--add"
        onClick={addFlow}
        disabled={snapshotEditingLocked || flowSlots.length >= MAX_FLOWS}
      />
      <MenuItem
        label="Reset paths"
        kind="danger"
        renderIcon={TrashCan}
        className="juce-grid-page__snapshot-status-details-item"
        onClick={() => setShowClearFlowsModal(true)}
        disabled={snapshotEditingLocked || flowSlots.length <= 1}
      />
      <MenuItem
        label="Network Routing"
        renderIcon={Network_3}
        className="juce-grid-page__snapshot-status-details-item"
        onClick={() => setShowAudioNodesModal(true)}
      />
      <MenuItem
        label={liveRuntimeButtonLabel}
        renderIcon={Launch}
        className={`juce-grid-page__snapshot-status-details-item juce-grid-page__snapshot-status-details-item--live ${liveRuntimeActive ? 'is-live' : ''}`}
        onClick={() => setShowLiveRuntimeModal(true)}
      />
      <MenuItem
        label="Local Routing"
        renderIcon={Flow}
        className="juce-grid-page__snapshot-status-details-item"
        onClick={() => setShowRoutingTopologyModal(true)}
        disabled={snapshotEditingLocked}
      />
      <MenuItem
        label="Output Reference"
        renderIcon={Meter}
        className="juce-grid-page__snapshot-status-details-item"
        disabled={!activeSnapshot}
        onClick={() => setShowOutputReferenceModal(true)}
      />
      <MenuItem
        label={duplicateActiveSnapshotMutation.isPending ? 'Duplicating…' : 'Duplicate'}
        renderIcon={Copy}
        className="juce-grid-page__snapshot-status-details-item"
        disabled={!activeSnapshot || duplicateActiveSnapshotMutation.isPending}
        onClick={() => duplicateActiveSnapshotMutation.mutate()}
      />
      <MenuItem
        label="Perform"
        renderIcon={Music}
        className="juce-grid-page__snapshot-status-details-item juce-grid-page__snapshot-status-details-item--perform"
        onClick={() => setShowPerformModal(true)}
      />
      <MenuItem
        label="MIDI"
        renderIcon={Music}
        className={`juce-grid-page__snapshot-status-details-item juce-grid-page__snapshot-status-details-item--midi ${midiLearnActive || midiLearnInProgress ? 'is-learning' : ''}`}
        title={midiLearnActive || midiLearnInProgress ? 'MIDI Learn armed' : `${midiMappingCountLabel} MIDI mappings`}
        onClick={() => setMidiModalOpen(true)}
      />
      <MenuItem
        label="Version History"
        renderIcon={Renew}
        className="juce-grid-page__snapshot-status-details-item"
        disabled={!activeSnapshot}
        onClick={() => setShowVersionHistoryModal(true)}
      />
      <MenuItem
        label="Shortcuts"
        renderIcon={Information}
        className="juce-grid-page__snapshot-status-details-item"
        onClick={() => setShowKeyboardHelp(true)}
      />
    </MenuButton>
  )

  if (showViewportBlockScreen) {
    return (
      <div className="juce-grid-page__viewport-block" role="alert" aria-live="polite">
        <MapAudioGridIcon size={120} />
        <h1 className="juce-grid-page__viewport-block-heading">This experience requires an iPad or larger display</h1>
        {showViewportRotateHint && (
          <p>Rotate your tablet or exit Split View, then reopen Audio Grid.</p>
        )}
      </div>
    )
  }

  return (
    <div className={`juce-grid-page ${isTabletTouchLayout ? 'is-tablet-mode' : ''}`}>
      <LandscapePrompt componentId="juce-grid" />
      <section className="juce-grid-page__signal-flow-shell juce-grid-page__signal-flow-shell--hero" aria-label="Snapshot hero">
        <div className="juce-grid-page__unified-block">
          <SnapshotChainManagementCard
            selectedChainId={activeFlow?.chainId ?? null}
            onChainSelect={(chainId) => {
              if (!activeFlow) return
              if (snapshotEditingLocked) return
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
              if (snapshotEditingLocked && activeFlow.chainId !== chainId) return
              updateFlow(activeFlow.id, { chainId })
              handlePluginSelect(pluginUri, pluginPosition)
            }}
            liveSnapshot={activeSnapshot}
            editorSnapshotDraft={currentSnapshotDraft}
            runtimeLiveState={runtimeLiveState}
            detailsAction={snapshotDetailsAction}
            onRenameSnapshot={handleRenameSnapshot}
            snapshotRenamePending={renameActiveSnapshotMutation.isPending}
            onLoadPreviousSnapshot={goToPreviousSnapshot}
            onLoadNextSnapshot={goToNextSnapshot}
            previousSnapshotDisabled={snapshotNavigationPending || !previousEditorSnapshot}
            nextSnapshotDisabled={snapshotNavigationPending || !nextEditorSnapshot}
            previousSnapshotDisabledReason={previousSnapshotDisabledReason}
            nextSnapshotDisabledReason={nextSnapshotDisabledReason}
            onToggleSnapshotFavorite={() => {
              if (!activeSnapshot) {
                return
              }
              toggleActiveSnapshotFavoriteMutation.mutate({
                snapshotId: activeSnapshot.id,
                isFavorite: !activeSnapshot.is_favorite,
              })
            }}
            snapshotFavoritePending={toggleActiveSnapshotFavoriteMutation.isPending}
            onToggleSnapshotLock={() => {
              if (!activeSnapshot) {
                return
              }
              toggleActiveSnapshotLockMutation.mutate()
            }}
            snapshotLockPending={toggleActiveSnapshotLockMutation.isPending}
            onGoLive={handleGoLive}
            goLiveState={snapshotGoLiveState}
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
            outputLevelWarningMessage={outputLevelWarningMessage}
          />
        </div>
      </section>

      <section className="juce-grid-page__signal-flow-shell juce-grid-page__session-notes-shell" aria-label="Snapshot session notes">
        <div className="juce-grid-page__unified-block">
          <Accordion align="start" className="juce-grid-page__session-notes-accordion">
            <AccordionItem title={`Session Notes${activeSnapshot ? ` (${sessionNotes.length})` : ''}`}>
              <div className="juce-grid-page__session-notes-panel">
                <p className="juce-grid-page__dense-card-kicker">Append-only snapshot log</p>
                <p className="juce-grid-page__session-notes-copy">
                  {activeSnapshot
                    ? 'Add dated gig or rehearsal notes to this snapshot. Entries are stored newest first and cannot be edited.'
                    : 'Load or create a snapshot before adding session notes.'}
                </p>
                <TextArea
                  id="snapshot-session-note-draft"
                  labelText="New session note"
                  rows={4}
                  value={sessionNoteDraft}
                  disabled={!activeSnapshot || addSessionNoteMutation.isPending}
                  onChange={(event) => setSessionNoteDraft(event.currentTarget.value)}
                  placeholder="Played the Ryman, this tone cut through perfectly at 110dB."
                />
                <div className="juce-grid-page__session-notes-actions">
                  <Button
                    size="sm"
                    kind="primary"
                    disabled={!activeSnapshot || !sessionNoteDraft.trim() || addSessionNoteMutation.isPending}
                    onClick={submitSessionNote}
                  >
                    {addSessionNoteMutation.isPending ? 'Saving…' : 'Add note'}
                  </Button>
                </div>
                <div className="juce-grid-page__session-notes-list" role="list">
                  {sessionNotes.length > 0 ? sessionNotes.map((note) => {
                    const formattedTimestamp = note.created_at
                      ? SESSION_NOTES_TIMESTAMP_FORMATTER.format(new Date(note.created_at))
                      : 'Unknown time'
                    return (
                      <article key={note.id} className="juce-grid-page__session-note" role="listitem">
                        <p className="juce-grid-page__session-note-timestamp">{formattedTimestamp}</p>
                        <p className="juce-grid-page__session-note-body">{note.body}</p>
                      </article>
                    )
                  }) : (
                    <p className="juce-grid-page__session-notes-empty">
                      {activeSnapshot ? 'No session notes yet.' : 'No snapshot is active.'}
                    </p>
                  )}
                </div>
              </div>
            </AccordionItem>
          </Accordion>
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
        className="juce-grid-page__signal-flow-shell juce-grid-page__signal-flow-shell--body"
        aria-label="Signal flow workspace"
        tabIndex={0}
        data-snapshot-canvas-focus-root="true"
      >

        <div className="juce-grid-page__unified-block">
          <main className="juce-grid-page__main">
            {snapshotEntryRequired ? (
              <Tile className="juce-grid-page__effect-modal-placeholder">
                <div className="juce-grid-page__parameter-editor-copy">
                  <p className="juce-grid-page__dense-card-kicker">Snapshot entry point</p>
                  <h3 className="juce-grid-page__selected-block-placeholder-heading">No snapshot loaded</h3>
                  <p>Open the Snapshots workspace to load an existing design or create a new one before editing the signal canvas.</p>
                </div>
                <Button size="sm" kind="primary" onClick={reopenSnapshotEntryPoint}>
                  Open snapshots workspace
                </Button>
              </Tile>
            ) : (
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
            )}
          </main>
        </div>
      </section>

      {showCompactWorkflowPanels && (
        <div className="juce-grid-page__compact-shell">
          <Grid className="juce-grid-page__section-frame juce-grid-page__section-frame--workspace">
            <Column sm={4} md={8} lg={16} className="juce-grid-page__section-column">
            <section className="juce-grid-page__compact-panel">
              {compactTab === 'grid' && (
                <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <p className="juce-grid-page__compact-section-kicker">Workspace</p>
                  <h2>Grid workspace</h2>
                  <p>Primary editing remains in the grid above. Use the other tabs for focused workflow panels.</p>
                </div>
                <div className="juce-grid-page__compact-stack">
                </div>
                </Layer>
              )}

              {compactTab === 'editor' && (
                <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <p className="juce-grid-page__compact-section-kicker">Selected block</p>
                  <h2>Editor</h2>
                  <p>{selectedPlugin ? 'The selected block editor opens in the bottom panel below the workspace.' : 'Select a block in the grid to open its editor.'}</p>
                </div>
                <Tile className="juce-grid-page__effect-modal-placeholder">
                  <div className="juce-grid-page__parameter-editor-copy">
                    <p className="juce-grid-page__dense-card-kicker">Editor state</p>
                    <h3 className="juce-grid-page__selected-block-placeholder-heading">{selectedPlugin ? 'Selected block ready' : 'No block selected'}</h3>
                    <p>
                      {selectedPlugin
                        ? 'Use the flow card selection to reopen the bottom editor panel.'
                        : 'Tap a processor in the grid to open the bottom editor panel.'}
                    </p>
                  </div>
                  {selectedPlugin && (
                    <Button size="sm" kind="secondary" onClick={openSelectedBlockEditor}>
                      Reopen editor panel
                    </Button>
                  )}
                </Tile>
                </Layer>
              )}

              {compactTab === 'routing' && (
                <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <p className="juce-grid-page__compact-section-kicker">Signal path</p>
                  <h2>Routing topology</h2>
                  <p>Configure how snapshot paths and their live routing interact.</p>
                </div>
                <div className="juce-grid-page__toolbar-buttons">
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Flow}
                    onClick={() => setShowRoutingTopologyModal(true)}
                    disabled={snapshotEditingLocked}
                  >
                    Configure routing
                  </Button>
                </div>
                <div className="juce-grid-page__compact-tags juce-grid-page__compact-tags--summary">
                  <Tag type="blue">{activeRoutingMode.label}</Tag>
                  <Tag type="cool-gray">Focus {activeFlowLabel}</Tag>
                  {routing.mode === 'parameter_morph' && (
                    <Tag type="purple">Morph {Math.round(routing.morphProgress * 100)}%</Tag>
                  )}
                </div>
                </Layer>
              )}

              {compactTab === 'presets' && (
                <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <p className="juce-grid-page__compact-section-kicker">Library</p>
                  <h2>Presets</h2>
                  <p>Preset save and recall state now appears in the live snapshot status card above.</p>
                </div>
                </Layer>
              )}
            </section>
            </Column>
          </Grid>
        </div>
      )}

      {!isTabletTouchLayout && (
        <section
          ref={bottomEditorRef}
          className={`juce-grid-page__bottom-editor-shell ${bottomEditorOpen ? 'is-open' : 'is-closed'}`}
          aria-label={bottomEditorOpen ? 'Block parameter editor' : undefined}
          aria-hidden={bottomEditorOpen ? undefined : true}
        >
          <Layer className={`juce-grid-page__bottom-editor-panel ${bottomEditorOpen ? 'is-open' : 'is-closed'}`}>
            <div className="juce-grid-page__bottom-editor-header">
              <div className="juce-grid-page__bottom-editor-identity">
                <div
                  className={`juce-grid-page__bottom-editor-icon ${selectedPlugin?.bypassed ? 'is-bypassed' : ''}`}
                  aria-hidden
                  style={{ '--juce-grid-editor-accent': bottomEditorAccentColor } as CSSProperties}
                >
                  {selectedPlugin ? <SelectedPluginHeroIcon width={32} height={32} /> : <Edit size={32} />}
                </div>
                <div className="juce-grid-page__bottom-editor-copy">
                  <p className="juce-grid-page__bottom-editor-kicker">Selected block</p>
                  <h2 className="juce-grid-page__bottom-editor-heading">
                    {bottomEditorOpen && selectedPlugin ? getDisplayPluginName(selectedPluginMeta?.name || selectedPlugin.name, selectedPlugin.uri) : 'Block editor'}
                  </h2>
                  <p className="juce-grid-page__bottom-editor-subtitle">
                    {bottomEditorOpen && selectedPlugin
                      ? selectedPluginMeta?.category || 'Processor'
                      : 'Open the pinned editor to work on the current block.'}
                  </p>
                </div>
              </div>
              <div className="juce-grid-page__bottom-editor-actions">
                {renderSelectedBlockNavBar({ disabled: !bottomEditorOpen || snapshotEditingLocked })}
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={bottomEditorOpen ? Close : Launch}
                  onClick={bottomEditorOpen ? handleCloseEffectModal : openSelectedBlockEditor}
                  disabled={!selectedPlugin}
                  aria-label={bottomEditorOpen ? 'Close editor' : 'Open editor'}
                  aria-controls="juce-grid-bottom-editor-panel"
                  aria-expanded={bottomEditorOpen}
                  className={`juce-grid-page__bottom-editor-toggle ${bottomEditorOpen ? 'is-open' : 'is-closed'}`}
                  style={{ '--juce-grid-editor-accent': bottomEditorAccentColor } as CSSProperties}
                >
                  {bottomEditorOpen ? 'Close editor' : 'Open editor'}
                </Button>
              </div>
            </div>

            <div
              id="juce-grid-bottom-editor-panel"
              className={`juce-grid-page__bottom-editor-body ${selectedBlockMidiPanelEnabled ? 'has-desktop-midi-panel' : ''}`}
            >
              {bottomEditorOpen && selectedPlugin ? (
                selectedBlockMidiPanelEnabled && selectedPluginMeta ? (
                  <div className="juce-grid-page__bottom-editor-desktop-layout">
                    <div className="juce-grid-page__bottom-editor-main">
                      {selectedPluginEditorContent}
                    </div>
                    <JuceGridSelectedBlockMidiPanel
                      plugin={selectedPlugin}
                      meta={selectedPluginMeta}
                      chainId={currentChain?.id ?? null}
                      lastMidiEvent={lastMidiEvent}
                      midiLearnInProgress={midiLearnInProgress}
                      midiLearnTarget={midiLearnStatus?.target ?? null}
                      onStartLearn={handleStartSelectedBlockMidiLearn}
                      onStopLearn={handleStopSelectedBlockMidiLearn}
                    />
                  </div>
                ) : (
                  selectedPluginEditorContent
                )
              ) : (
                <Tile className="juce-grid-page__bottom-editor-placeholder">
                  <div className="juce-grid-page__parameter-editor-copy">
                    <p className="juce-grid-page__dense-card-kicker">Editor state</p>
                    <h3 className="juce-grid-page__selected-block-placeholder-heading">{selectedPlugin ? 'Selected block ready' : 'No block selected'}</h3>
                    <p>
                      {selectedPlugin
                        ? 'The editor shell stays pinned here. Use Open editor when you want to work on the selected block.'
                        : 'Select a processor in the grid to load its controls here without shifting the page.'}
                    </p>
                  </div>
                </Tile>
              )}
            </div>
          </Layer>
        </section>
      )}

      {isTabletTouchLayout && (
        <>
          <section className="juce-grid-page__tablet-launcher" aria-label="Tablet workspace launcher">
            <div className="juce-grid-page__tablet-launcher-section juce-grid-page__tablet-launcher-section--left">
              <Button
                size="md"
                kind="primary"
                renderIcon={Add}
                className="juce-grid-page__tablet-launcher-utility juce-grid-page__tablet-launcher-utility--create"
                onClick={() => createSnapshotFromEditorMutation.mutate(buildDefaultSnapshotName(snapshotCount + 1))}
                disabled={createSnapshotFromEditorMutation.isPending}
              >
                {createSnapshotFromEditorMutation.isPending ? 'Creating…' : 'New Snapshot'}
              </Button>
              <Button
                size="md"
                kind="secondary"
                renderIcon={Renew}
                className="juce-grid-page__tablet-launcher-utility juce-grid-page__tablet-launcher-utility--update"
                onClick={() => updateActiveSnapshotMutation.mutate()}
                disabled={!activeSnapshot || snapshotEditingLocked || updateActiveSnapshotMutation.isPending}
              >
                {updateActiveSnapshotMutation.isPending ? 'Updating…' : 'Update Snapshot'}
              </Button>
              <Button
                size="md"
                kind={snapshotSetlistMode ? 'secondary' : 'ghost'}
                className="juce-grid-page__tablet-launcher-utility"
                aria-pressed={snapshotSetlistMode}
                onClick={() => { void toggleSnapshotSetlistMode() }}
                disabled={snapshotSetlistModePending}
                title={snapshotSetlistModeTitle}
              >
                {snapshotSetlistModePending ? 'Saving…' : 'Setlist'}
              </Button>
              {renderTabletLoadButton()}
            </div>

            <div className="juce-grid-page__tablet-launcher-section juce-grid-page__tablet-launcher-section--center">
              <Button
                size="md"
                kind="primary"
                renderIcon={selectedPlugin ? Launch : Add}
                onClick={selectedPlugin ? openSelectedBlockEditor : handleTabletAddEffect}
                disabled={selectedPlugin ? false : !tabletFocusedFlow || snapshotEditingLocked}
                aria-label={selectedPlugin ? 'Open editor' : 'Add effect'}
                aria-controls={selectedPlugin ? 'juce-grid-tablet-editor-panel' : undefined}
                aria-expanded={selectedPlugin ? tabletEditorVisible : undefined}
              >
                {selectedPlugin ? 'Open editor' : 'Add effect'}
              </Button>
            </div>

            <div className="juce-grid-page__tablet-launcher-section juce-grid-page__tablet-launcher-section--right">
              {renderSelectedBlockNavBar({ disabled: !selectedPlugin || snapshotEditingLocked })}
              <div className="juce-grid-page__tablet-launcher-pager" aria-label="Branch page controls">
                <Button
                  hasIconOnly
                  size="sm"
                  kind="ghost"
                  renderIcon={ChevronLeft}
                  iconDescription="Previous branch page"
                  aria-label="Previous branch page"
                  onClick={() => stepTabletFocusedBranchPage('left')}
                  disabled={!tabletFocusedFlow || !canPageTabletFocusedBranchBackward}
                />
                <span className="juce-grid-page__tablet-launcher-page-readout">{tabletFocusedBranchPageLabel}</span>
                <Button
                  hasIconOnly
                  size="sm"
                  kind="ghost"
                  renderIcon={ChevronRight}
                  iconDescription="Next branch page"
                  aria-label="Next branch page"
                  onClick={() => stepTabletFocusedBranchPage('right')}
                  disabled={!tabletFocusedFlow || !canPageTabletFocusedBranchForward}
                />
              </div>
              {selectedPlugin && (
                <OverflowMenu
                  ariaLabel="Tablet block actions"
                  iconDescription="Tablet block actions"
                  size="sm"
                  flipped
                >
                  <OverflowMenuItem
                    itemText={selectedPlugin.bypassed ? 'Enable block' : 'Bypass block'}
                    onClick={handleToggleSelectedBypass}
                    disabled={snapshotEditingLocked}
                  />
                  <OverflowMenuItem
                    itemText="Clear selection"
                    onClick={() => {
                      setSelectedPluginSelection(null)
                      setTabletEditorOpen(false)
                    }}
                  />
                  <OverflowMenuItem
                    itemText="Remove block"
                    isDelete
                    disabled={snapshotEditingLocked}
                    onClick={() => setPendingTabletDeletePlugin({
                      uri: selectedPlugin.uri,
                      position: selectedPlugin.position,
                      name: getDisplayPluginName(selectedPluginMeta?.name || selectedPlugin.name, selectedPlugin.uri),
                    })}
                  />
                </OverflowMenu>
              )}
            </div>
          </section>

          {tabletEditorVisible && (
            <>
              <button
                type="button"
                className="juce-grid-page__tablet-editor-scrim"
                aria-label="Close editor"
                onClick={handleCloseEffectModal}
              />
              <section
                id="juce-grid-tablet-editor-panel"
                ref={bottomEditorRef}
                className="juce-grid-page__tablet-editor-shell"
                aria-label="Block parameter editor"
              >
                <Layer className="juce-grid-page__tablet-editor-panel">
                  <div className="juce-grid-page__tablet-editor-header">
                    <div className="juce-grid-page__tablet-editor-identity">
                      <div
                        className={`juce-grid-page__bottom-editor-icon ${selectedPlugin?.bypassed ? 'is-bypassed' : ''}`}
                        aria-hidden
                        style={{ '--juce-grid-editor-accent': bottomEditorAccentColor } as CSSProperties}
                      >
                        {selectedPlugin ? <SelectedPluginHeroIcon width={28} height={28} /> : <Edit size={28} />}
                      </div>
                      <div className="juce-grid-page__tablet-editor-copy">
                        <p className="juce-grid-page__dense-card-kicker">Selected block</p>
                        <h2 className="juce-grid-page__tablet-editor-heading">{selectedPlugin ? getDisplayPluginName(selectedPluginMeta?.name || selectedPlugin.name, selectedPlugin.uri) : 'Block editor'}</h2>
                        <p>{selectedPluginMeta?.category || 'Processor'}</p>
                      </div>
                    </div>
                    <Button size="sm" kind="ghost" renderIcon={Close} onClick={handleCloseEffectModal}>
                      Close
                    </Button>
                  </div>
                  <div className="juce-grid-page__tablet-editor-body">
                    {selectedPluginEditorContent}
                  </div>
                </Layer>
              </section>
            </>
          )}
        </>
      )}

      {!isTabletTouchLayout && (
        <div className="juce-grid-page__floating-actions" aria-label="Snapshots floating toolbar">
          {renderSnapshotsToolbar()}
        </div>
      )}

      {pendingTabletDeletePlugin && (
        <Modal
          open
          size="sm"
          modalHeading="Remove block"
          modalLabel="Tablet block action"
          primaryButtonText={deleteMutation.isPending ? 'Removing...' : 'Remove block'}
          secondaryButtonText="Cancel"
          danger
          primaryButtonDisabled={deleteMutation.isPending}
          onRequestClose={() => setPendingTabletDeletePlugin(null)}
          onSecondarySubmit={() => setPendingTabletDeletePlugin(null)}
          onRequestSubmit={confirmTabletDeleteSelectedPlugin}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Remove "{pendingTabletDeletePlugin.name}" from the current branch?
            </p>
          </div>
        </Modal>
      )}

      {showSavePresetModal && (
        <Modal
          open
          size="sm"
          modalHeading="Save preset"
          modalLabel={currentChain?.name || 'Current chain'}
          primaryButtonText={savePresetMutation.isPending ? 'Saving...' : 'Save preset'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={!currentChain || savePresetName.trim().length === 0 || savePresetMutation.isPending}
          onRequestClose={() => {
            setShowSavePresetModal(false)
            setSavePresetName('')
          }}
          onSecondarySubmit={() => {
            setShowSavePresetModal(false)
            setSavePresetName('')
          }}
          onRequestSubmit={submitSavePreset}
          selectorPrimaryFocus="#juce-grid-save-preset-name"
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Save the current chain state into the preset library without leaving the grid workflow.
            </p>
            <TextInput
              id="juce-grid-save-preset-name"
              labelText="Preset name"
              value={savePresetName}
              onChange={(event) => setSavePresetName(event.target.value)}
              placeholder="My JUCE preset"
            />
          </div>
        </Modal>
      )}

      {showRenameChainModal && (
        <Modal
          open
          size="sm"
          modalHeading="Rename chain"
          modalLabel={currentChain?.name || 'Current chain'}
          primaryButtonText={renameMutation.isPending ? 'Saving...' : 'Rename chain'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={!currentChain || renameChainName.trim().length === 0 || renameMutation.isPending}
          onRequestClose={() => {
            setShowRenameChainModal(false)
            setRenameChainName('')
          }}
          onSecondarySubmit={() => {
            setShowRenameChainModal(false)
            setRenameChainName('')
          }}
          onRequestSubmit={submitRenameChain}
          selectorPrimaryFocus="#juce-grid-rename-chain-name"
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Rename the active chain while preserving the current routing, plugin, and snapshot state.
            </p>
            <TextInput
              id="juce-grid-rename-chain-name"
              labelText="Chain name"
              value={renameChainName}
              onChange={(event) => setRenameChainName(event.target.value)}
              placeholder="Main performance chain"
            />
          </div>
        </Modal>
      )}

      {showRenameSnapshotModal && (
        <Modal
          open
          size="sm"
          modalHeading="Rename snapshot"
          modalLabel={activeSnapshot?.name || 'Live snapshot'}
          primaryButtonText={renameActiveSnapshotMutation.isPending ? 'Saving...' : 'Rename snapshot'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={
            !activeSnapshot
            || renameSnapshotError !== null
            || normalizeSnapshotName(renameSnapshotName) === normalizeSnapshotName(activeSnapshot.name)
            || renameActiveSnapshotMutation.isPending
          }
          onRequestClose={() => {
            setShowRenameSnapshotModal(false)
            setRenameSnapshotName('')
          }}
          onSecondarySubmit={() => {
            setShowRenameSnapshotModal(false)
            setRenameSnapshotName('')
          }}
          onRequestSubmit={submitRenameSnapshot}
          selectorPrimaryFocus="#juce-grid-rename-snapshot-name"
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Rename the live snapshot directly from the hero card without leaving the Audio Grid workspace.
            </p>
            <TextInput
              id="juce-grid-rename-snapshot-name"
              labelText="Snapshot name"
              value={renameSnapshotName}
              onChange={(event) => setRenameSnapshotName(event.target.value)}
              invalid={Boolean(renameSnapshotError)}
              invalidText={renameSnapshotError ?? undefined}
              placeholder="Snapshot name"
            />
          </div>
        </Modal>
      )}

      {showOutputReferenceModal && activeSnapshot && (
        <Modal
          open
          size="sm"
          modalHeading="Output Reference"
          modalLabel={activeSnapshot.name || 'Live snapshot'}
          primaryButtonText="Close"
          onRequestClose={() => setShowOutputReferenceModal(false)}
          onRequestSubmit={() => setShowOutputReferenceModal(false)}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Set the live output reading as the snapshot reference level and adjust the warning window shown in the details grid.
            </p>
            <div className="juce-grid-page__compact-tags">
              <Tag type="cool-gray">
                Current {currentOutputLevelDbfs != null ? `${currentOutputLevelDbfs.toFixed(1)} dBFS` : 'Unavailable'}
              </Tag>
              <Tag type="warm-gray">
                Reference {activeSnapshot.output_level_reference_dbfs != null ? `${activeSnapshot.output_level_reference_dbfs.toFixed(1)} dBFS` : 'Unset'}
              </Tag>
            </div>
            <Button
              size="sm"
              kind="secondary"
              onClick={() => {
                if (currentOutputLevelDbfs == null) {
                  return
                }
                updateActiveSnapshotOutputReferenceMutation.mutate({
                  snapshotId: activeSnapshot.id,
                  outputLevelReferenceDbfs: currentOutputLevelDbfs,
                  outputLevelWarningThresholdDb: outputReferenceThresholdDraft,
                })
              }}
              disabled={updateActiveSnapshotOutputReferenceMutation.isPending || currentOutputLevelDbfs == null}
            >
              {updateActiveSnapshotOutputReferenceMutation.isPending ? 'Saving…' : 'Set Reference Level'}
            </Button>
            <NumberInput
              label="Warning threshold"
              value={outputReferenceThresholdDraft}
              min={0.1}
              max={24}
              step={0.1}
              precision={1}
              unit="dB"
              defaultValue={activeSnapshot.output_level_warning_threshold_db ?? 3}
              valueFormatter={(value) => value.toFixed(1)}
              onChange={setOutputReferenceThresholdDraft}
              onChangeCommitted={(thresholdDb) => {
                updateActiveSnapshotOutputReferenceMutation.mutate({
                  snapshotId: activeSnapshot.id,
                  outputLevelReferenceDbfs: activeSnapshot.output_level_reference_dbfs ?? null,
                  outputLevelWarningThresholdDb: thresholdDb,
                })
              }}
              disabled={updateActiveSnapshotOutputReferenceMutation.isPending}
              showBounds={false}
              accentColor="#f1c21b"
              className="juce-grid-page__snapshot-output-reference-threshold-input"
            />
            {outputLevelWarningMessage ? (
              <Tag type="warm-gray" className="juce-grid-page__snapshot-status-output-warning">
                {outputLevelWarningMessage}
              </Tag>
            ) : null}
          </div>
        </Modal>
      )}

      {presetPendingDelete && (
        <Modal
          open
          size="sm"
          modalHeading="Delete preset"
          modalLabel={presetPendingDelete.name}
          primaryButtonText={deletePresetMutation.isPending ? 'Deleting...' : 'Delete preset'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={deletePresetMutation.isPending}
          onRequestClose={() => setPresetPendingDelete(null)}
          onSecondarySubmit={() => setPresetPendingDelete(null)}
          onRequestSubmit={confirmDeletePreset}
          danger
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Delete <span className="juce-grid-page__modal-copy-emphasis">{presetPendingDelete.name}</span> from the preset library. This action cannot be undone.
            </p>
          </div>
        </Modal>
      )}

      {showClearFlowsModal && (
        <Modal
          open
          size="sm"
          modalHeading="Reset paths"
          modalLabel="Audio Grid workspace"
          primaryButtonText="Reset paths"
          secondaryButtonText="Cancel"
          onRequestClose={() => setShowClearFlowsModal(false)}
          onSecondarySubmit={() => setShowClearFlowsModal(false)}
          onRequestSubmit={confirmClearFlows}
          danger
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Reset the workspace to a single empty path and discard the current multi-path layout state.
            </p>
          </div>
        </Modal>
      )}
      {midiModalOpen && (
        <Modal
          open
          size="lg"
          modalHeading="Audio Grid MIDI mappings"
          primaryButtonText="Close"
          onRequestClose={() => { setMidiModalOpen(false); setShowExpressionOverlay(false) }}
          onRequestSubmit={() => { setMidiModalOpen(false); setShowExpressionOverlay(false) }}
        >
          <div className="juce-grid-page__modal-stack juce-grid-page__midi-modal-shell" id="juce-grid-midi-modal">
            <div className="juce-grid-page__midi-modal-panel">
              {renderMidiMappingsWorkspace({ closable: false })}
            </div>
            {showExpressionOverlay && (
              <div className="juce-grid-page__midi-modal-expression">
                <ExpressionOverlay
                  onBack={() => setShowExpressionOverlay(false)}
                  highlightedCcPairs={midiMappings.map((m): CcChannelPair => ({ cc: m.cc, channel: m.channel }))}
                  initialCc={midiMappings[0]?.cc ?? null}
                  initialChannel={midiMappings[0]?.channel ?? null}
                  onAssignmentMutated={() => {}}
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {routingInspectorContent && (
        <Modal
          open
          size="sm"
          modalHeading={routingInspectorContent.heading}
          modalLabel="Routing inspector"
          primaryButtonText="Close"
          onRequestClose={() => setRoutingInspectorId(null)}
          onRequestSubmit={() => setRoutingInspectorId(null)}
        >
          <div className="juce-grid-page__routing-inspector">
            <p className="juce-grid-page__routing-inspector-copy">{routingInspectorContent.summary}</p>
            <div className="juce-grid-page__compact-tags">
              {routingInspectorContent.tags.map((tag) => (
                <Tag key={tag} type="cool-gray">
                  {tag}
                </Tag>
              ))}
            </div>
            <div className="juce-grid-page__routing-inspector-grid" role="list" aria-label="Routing details">
              {routingInspectorContent.rows.map((row) => (
                <Tile key={row.label} className="juce-grid-page__routing-inspector-row" role="listitem">
                  <p className="juce-grid-page__routing-inspector-row-label">{row.label}</p>
                  <h3 className="juce-grid-page__routing-inspector-row-value">{row.value}</h3>
                </Tile>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Plugin Browser Modal */}
      {showPluginBrowser && (
        <Modal
          open
          size="lg"
          modalHeading="Add plugin"
          primaryButtonText="Close"
          onRequestClose={() => setShowPluginBrowser(false)}
          onRequestSubmit={() => setShowPluginBrowser(false)}
        >
          <div className="juce-grid-page__modal-stack juce-grid-page__browser-modal">
            <Search
              labelText="Search plugins"
              placeholder="Search plugins"
              value={pluginSearchQuery}
              onChange={(event) => setPluginSearchQuery(event.target.value)}
              size="lg"
            />

            <div className="juce-grid-page__browser-toolbar">
              <div className="juce-grid-page__browser-filters">
                <Select
                  id="juce-grid-plugin-browser-category"
                  className="juce-grid-page__browser-category-select"
                  labelText="Category"
                  size="md"
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                >
                  {categories.map((category) => (
                    <SelectItem
                      key={category}
                      value={category}
                      text={category === 'all' ? 'All plugins' : category}
                    />
                  ))}
                </Select>
              </div>

              <div className="juce-grid-page__browser-meta">
                <div className="juce-grid-page__browser-meta-tags">
                  <Tag type="cool-gray">{nativeProcessors.length} native</Tag>
                  <Tag type="cool-gray">{lv2Plugins.length} LV2</Tag>
                  <Tag type="cool-gray">{favoriteVisibleCount} favorites</Tag>
                  {!currentChain && <Tag type="warm-gray">No active chain</Tag>}
                </div>
                <div className="juce-grid-page__browser-toolbar-actions">
                  <Button size="sm" kind="ghost" onClick={expandAllCategories}>
                    Expand all
                  </Button>
                  <Button size="sm" kind="ghost" onClick={collapseAllCategories}>
                    Collapse all
                  </Button>
                </div>
              </div>
            </div>

            {!currentChain && (
              <p className="juce-grid-page__modal-copy">
                Select or assign a chain before adding plugins from the browser.
              </p>
            )}

            <div className="juce-grid-page__browser-results">
              {featuredNativeGroups.length > 0 && (
                <section
                  className={`juce-grid-page__browser-featured-groups${featuredNativeGroups.length === 1 ? ' juce-grid-page__browser-featured-groups--single' : ''}`}
                  aria-label="Featured core integrated plugins"
                >
                  {featuredNativeGroups.map((group) => {
                    const GroupIcon = group.icon

                    return (
                        <div key={group.key} className="juce-grid-page__browser-featured-group">
                          <div className="juce-grid-page__browser-section-header">
                            <div className="juce-grid-page__browser-section-title">
                              <GroupIcon size={16} />
                              <span className="juce-grid-page__browser-section-title-text">{group.title}</span>
                            </div>
                            <Tag type="cool-gray">{group.plugins.length}</Tag>
                          </div>

                        <div className="juce-grid-page__browser-featured-plugin-list">
                          {group.plugins.map((plugin) => {
                            const displayName = getDisplayPluginName(plugin.name, plugin.uri)

                            return (
                              <Tile
                                key={plugin.uri}
                                className="juce-grid-page__browser-plugin-tile juce-grid-page__browser-plugin-tile--native juce-grid-page__browser-plugin-tile--featured"
                              >
                                <div className="juce-grid-page__browser-plugin-header">
                                  <div className="juce-grid-page__browser-plugin-copy">
                                    <p className="juce-grid-page__browser-plugin-kicker">Integrated processor</p>
                                    <h3 className="juce-grid-page__browser-plugin-heading">{displayName}</h3>
                                    <p>{sanitizeRestrictedDisplayText(plugin.author) || 'Integrated JUCE processor'}</p>
                                  </div>
                                  <div className="juce-grid-page__browser-plugin-meta">
                                    <Tag type="cool-gray">{plugin.category}</Tag>
                                  </div>
                                </div>
                                <div className="juce-grid-page__browser-card-actions">
                                  <Button
                                    size="sm"
                                    kind="primary"
                                    onClick={() => handleAddPluginToCurrentChain(plugin.uri)}
                                    disabled={!currentChain || snapshotEditingLocked}
                                  >
                                    Add
                                  </Button>
                                  <Button size="sm" kind="ghost" onClick={() => handleShowDetails(plugin)}>
                                    Details
                                  </Button>
                                </div>
                              </Tile>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}

              {remainingNativeProcessors.length > 0 && (
                <section className="juce-grid-page__browser-section">
                  <div className="juce-grid-page__browser-section-header">
                    <div className="juce-grid-page__browser-section-title">
                      <Meter size={16} />
                      <span className="juce-grid-page__browser-section-title-text">Core integrated</span>
                    </div>
                    <div className="juce-grid-page__browser-meta-tags">
                      <Tag type="green">Zero latency</Tag>
                      <Tag type="cool-gray">{remainingNativeProcessors.length} plugins</Tag>
                    </div>
                  </div>
                  <div className="juce-grid-page__browser-native-grid">
                    {remainingNativeProcessors.map((plugin) => {
                      const displayName = getDisplayPluginName(plugin.name, plugin.uri)
                      return (
                        <Tile
                          key={plugin.uri}
                          className="juce-grid-page__browser-plugin-tile juce-grid-page__browser-plugin-tile--native"
                        >
                          <div className="juce-grid-page__browser-plugin-header">
                            <div className="juce-grid-page__browser-plugin-copy">
                              <p className="juce-grid-page__browser-plugin-kicker">Integrated processor</p>
                              <h3 className="juce-grid-page__browser-plugin-heading">{displayName}</h3>
                              <p>{sanitizeRestrictedDisplayText(plugin.author) || 'Integrated JUCE processor'}</p>
                            </div>
                            <div className="juce-grid-page__browser-plugin-meta">
                              <Tag type="cool-gray">{plugin.category}</Tag>
                            </div>
                          </div>
                          <div className="juce-grid-page__browser-card-actions">
                            <Button
                              size="sm"
                              kind="primary"
                              onClick={() => handleAddPluginToCurrentChain(plugin.uri)}
                              disabled={!currentChain || snapshotEditingLocked}
                            >
                              Add
                            </Button>
                            <Button size="sm" kind="ghost" onClick={() => handleShowDetails(plugin)}>
                              Details
                            </Button>
                          </div>
                        </Tile>
                      )
                    })}
                  </div>
                </section>
              )}

              {groupedPlugins.length > 0 && (
                <section className="juce-grid-page__browser-section">
                  <div className="juce-grid-page__browser-section-header">
                    <div className="juce-grid-page__browser-section-title">
                      <Flow size={14} />
                      <span className="juce-grid-page__browser-section-title-text">LV2 plugin library</span>
                    </div>
                    <Tag type="cool-gray">{lv2Plugins.length} plugins</Tag>
                  </div>

                  <Accordion align="start" className="juce-grid-page__browser-accordion">
                    {groupedPlugins.map(([category, plugins]) => {
                      const catConfig = getCategoryConfig(category)
                      const isOpen = !collapsedCategories.has(category)

                      return (
                        <AccordionItem
                          key={category}
                          open={isOpen}
                          onHeadingClick={({ isOpen: currentlyOpen }) => {
                            setCollapsedCategories((previous) => {
                              const next = new Set(previous)
                              if (currentlyOpen) {
                                next.add(category)
                              } else {
                                next.delete(category)
                              }
                              return next
                            })
                          }}
                          title={(
                            <span className="juce-grid-page__browser-category-title">
                              <span
                                className="juce-grid-page__browser-category-dot"
                                style={{ background: catConfig.color }}
                                aria-hidden
                              />
                              <span>{category}</span>
                              <Tag type="cool-gray">{plugins.length}</Tag>
                            </span>
                          )}
                        >
                          <div className="juce-grid-page__browser-plugin-grid">
                            {plugins.map((plugin) => {
                              const isFavorite = favoritePlugins.has(plugin.uri)
                              return (
                                <Tile key={plugin.uri} className="juce-grid-page__browser-plugin-tile">
                                  <div className="juce-grid-page__browser-plugin-header">
                                    <div className="juce-grid-page__browser-plugin-copy">
                                      <p className="juce-grid-page__browser-plugin-kicker">LV2 processor</p>
                                      <h3 className="juce-grid-page__browser-plugin-heading">
                                        {getDisplayPluginName(plugin.name, plugin.uri)}
                                      </h3>
                                      <p>{plugin.author ? sanitizeRestrictedDisplayText(plugin.author) : 'No author metadata'}</p>
                                    </div>
                                    <div className="juce-grid-page__browser-plugin-meta">
                                      {isFavorite && <Tag type="cool-gray">Favorite</Tag>}
                                    </div>
                                  </div>
                                  <div className="juce-grid-page__browser-card-meta">
                                    <Tag type="cool-gray">{plugin.category}</Tag>
                                    <Tag type="warm-gray">{plugin.format || 'LV2'}</Tag>
                                  </div>
                                  <div className="juce-grid-page__browser-card-actions">
                                    <Button
                                      size="sm"
                                      kind="primary"
                                      onClick={() => handleAddPluginToCurrentChain(plugin.uri)}
                                      disabled={!currentChain || snapshotEditingLocked}
                                    >
                                      Add
                                    </Button>
                                    <Button
                                      size="sm"
                                      kind={isFavorite ? 'secondary' : 'ghost'}
                                      onClick={() => toggleFavorite(plugin.uri)}
                                    >
                                      {isFavorite ? 'Favorited' : 'Favorite'}
                                    </Button>
                                    <Button size="sm" kind="ghost" onClick={() => handleShowDetails(plugin)}>
                                      Details
                                    </Button>
                                  </div>
                                </Tile>
                              )
                            })}
                          </div>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                </section>
              )}

              {nativeProcessors.length === 0 && groupedPlugins.length === 0 && (
                <div className="juce-grid-page__empty-state">
                  <p>No plugins match the current filters</p>
                  <p className="juce-grid-page__modal-copy">
                    Adjust the search or category filters to widen the results.
                  </p>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Preset Browser Modal */}
      {showPresetBrowser && (
        <Modal
          open
          size="md"
          modalHeading="Load preset"
          primaryButtonText="Close"
          secondaryButtonText="Import"
          onRequestClose={() => setShowPresetBrowser(false)}
          onRequestSubmit={() => setShowPresetBrowser(false)}
          onSecondarySubmit={() => {
            setShowPresetBrowser(false)
            setShowImportDialog(true)
          }}
        >
          <div className="juce-grid-page__modal-stack">
            <div className="juce-grid-page__browser-section">
              <div className="juce-grid-page__browser-section-header">
                <div className="juce-grid-page__browser-section-title">
                  <Download size={14} />
                  <span>Saved presets</span>
                </div>
                <Tag type="cool-gray">{presets.length} presets</Tag>
              </div>

              {presets.length === 0 ? (
                <div className="juce-grid-page__empty-state">
                  <p>No presets saved</p>
                  <p className="juce-grid-page__empty-state-copy">
                    Press <kbd>S</kbd> to save the current chain, or import from file.
                  </p>
                </div>
              ) : (
                <div className="juce-grid-page__preset-grid">
                  {presets.map((preset) => (
                    <Tile key={preset.id} className="juce-grid-page__browser-plugin-tile">
                      <div className="juce-grid-page__browser-plugin-header">
                        <div className="juce-grid-page__browser-plugin-copy">
                          <p className="juce-grid-page__browser-plugin-kicker">Saved preset</p>
                          <h3 className="juce-grid-page__browser-plugin-heading">{preset.name}</h3>
                          <p>{preset.description || 'Saved chain preset ready for instant recall.'}</p>
                        </div>
                        <div className="juce-grid-page__browser-plugin-meta">
                          {preset.category && <Tag type="cool-gray">{preset.category}</Tag>}
                          {preset.is_favorite && <Tag type="cool-gray">Favorite</Tag>}
                        </div>
                      </div>

                      <div className="juce-grid-page__compact-tags">
                        <Tag type="warm-gray">
                          Updated {new Date(preset.updated_at || preset.created_at).toLocaleDateString()}
                        </Tag>
                        {preset.tags.slice(0, 3).map((tag) => (
                          <Tag key={`${preset.id}-${tag}`} type="cool-gray">
                            {tag}
                          </Tag>
                        ))}
                      </div>

                      <div className="juce-grid-page__compact-actions">
                        <Button
                          size="sm"
                          kind="primary"
                          onClick={() => loadPresetMutation.mutate(preset.id)}
                          disabled={loadPresetMutation.isPending}
                        >
                          Load
                        </Button>
                        <Button
                          size="sm"
                          kind="ghost"
                          onClick={() => handleDeletePresetRequest(preset)}
                          disabled={deletePresetMutation.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </Tile>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Snapshot Import Dialog */}
      <SnapshotImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportSuccess={(presetId, name) => {
          queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
          pushToast(`Imported "${name}" successfully`, 'success')
        }}
      />

      {assignmentDialogOpen && selectedFlowForAssignment && (
        <Modal
          open
          size="lg"
          modalHeading={`Assign ${selectedFlowForAssignment.id}`}
          modalLabel={selectedFlowForAssignment.chainId ? `Path ${selectedFlowForAssignment.chainId}` : 'No path assigned'}
          primaryButtonText={isAssigningFlow ? 'Assigning...' : 'Assign path'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={!selectedFlowForAssignment.chainId || !assignmentSelectedNodeId || isAssigningFlow}
          onRequestClose={closeAssignmentDialog}
          onSecondarySubmit={closeAssignmentDialog}
          onRequestSubmit={() => handleAssignFlow(assignmentSelectedNodeId, assignmentRedundancyEnabled)}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Select a target node for the active path. Recommendations favor headroom and GPU compatibility when the underlying runtime chain analysis requires it.
            </p>

            {!selectedFlowForAssignment.chainId && (
              <p className="juce-grid-page__modal-copy">
                Assign a path to this slot before deploying it to a cluster node.
              </p>
            )}

            {assignmentAnalysisQuery.isLoading && (
              <InlineLoading description="Analyzing path requirements" status="active" />
            )}

            {recommendedAssignmentNodes.length > 0 && (
              <div className="juce-grid-page__assignment-recommended">
                <p className="juce-grid-page__assignment-section-kicker">Recommended</p>
                <div className="juce-grid-page__compact-actions">
                  {recommendedAssignmentNodes.slice(0, 3).map((node) => (
                    <Button
                      key={`recommended-${node.node_id}`}
                      size="sm"
                      kind={assignmentSelectedNodeId === node.node_id ? 'secondary' : 'ghost'}
                      onClick={() => setAssignmentSelectedNodeId(node.node_id)}
                    >
                      {node.hostname}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="juce-grid-page__assignment-grid">
              {assignmentNodes.map((node) => {
                const isSelected = assignmentSelectedNodeId === node.node_id
                const isSuitable = isSuitableAssignmentNode(node)

                return (
                  <button
                    key={node.node_id}
                    type="button"
                    className={`juce-grid-page__assignment-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => isSuitable && setAssignmentSelectedNodeId(node.node_id)}
                    disabled={!isSuitable}
                    aria-pressed={isSelected}
                  >
                    <div className="juce-grid-page__assignment-card-header">
                      <h3 className="juce-grid-page__assignment-card-heading">{node.hostname}</h3>
                      <div className="juce-grid-page__compact-tags">
                        {node.has_gpu && <Tag type="blue">GPU</Tag>}
                        {!isSuitable && <Tag type="red">Capacity limit</Tag>}
                      </div>
                    </div>
                    <div className="juce-grid-page__assignment-card-meta">
                      <span>CPU {node.cpu_percent ?? 0}%</span>
                      <span>
                        RAM {(node.memory_used_gb ?? 0).toFixed(1)}/{(node.memory_total_gb ?? 0).toFixed(1)} GB
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {assignmentAnalysis && (
              <div className="juce-grid-page__assignment-requirements">
                <p className="juce-grid-page__assignment-section-kicker">Chain requirements</p>
                <div className="juce-grid-page__compact-tags">
                  <Tag type="cool-gray">CPU {assignmentAnalysis.estimated_cpu_percent ?? 0}%</Tag>
                  <Tag type="cool-gray">Memory {assignmentAnalysis.estimated_memory_mb ?? 0} MB</Tag>
                  {assignmentAnalysis.requires_gpu && <Tag type="purple">GPU required</Tag>}
                </div>
              </div>
            )}

            <Checkbox
              id="juce-grid-assignment-redundancy"
              labelText="Enable redundancy (standby nodes)"
              checked={assignmentRedundancyEnabled}
              onChange={(_, data) => setAssignmentRedundancyEnabled(Boolean(data.checked))}
            />
          </div>
        </Modal>
      )}

      {/* Plugin Details Modal */}
      {detailsPlugin && (
        <PluginDetailsModal
          plugin={detailsPlugin}
          open={!!detailsPlugin}
          onClose={() => setDetailsPlugin(null)}
        />
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showKeyboardHelp && (
        <Modal
          open
          size="md"
          modalHeading="Keyboard shortcuts"
          primaryButtonText="Close"
          secondaryButtonText="Open docs"
          onRequestClose={() => setShowKeyboardHelp(false)}
          onRequestSubmit={() => setShowKeyboardHelp(false)}
          onSecondarySubmit={() => {
            setShowKeyboardHelp(false)
            openPlatformDocs('QUICK_REFERENCE.md')
          }}
        >
          <div className="juce-grid-page__shortcut-grid">
            {KEYBOARD_SHORTCUT_SECTIONS.map((section) => (
              <Tile key={section.title} className="juce-grid-page__shortcut-tile">
                <p className="juce-grid-page__dense-card-kicker">Shortcuts</p>
                <h3 className="juce-grid-page__dense-card-heading">{section.title}</h3>
                <div className="juce-grid-page__shortcut-rows">
                  {section.rows.map((row) => (
                    <div key={`${section.title}-${row.description}`} className="juce-grid-page__shortcut-row">
                      <div className="juce-grid-page__shortcut-keys" aria-label={row.keys.join(' + ')}>
                        {row.keys.map((key) => (
                          <kbd key={`${section.title}-${row.description}-${key}`}>{key}</kbd>
                        ))}
                      </div>
                      <span>{row.description}</span>
                    </div>
                  ))}
                </div>
              </Tile>
            ))}
          </div>
        </Modal>
      )}

      <SnapshotVersionHistoryModal
        open={showVersionHistoryModal}
        snapshotName={activeSnapshot?.name}
        revisions={snapshotRevisionsQuery.data?.revisions ?? []}
        loading={snapshotRevisionsQuery.isPending}
        errorMessage={
          snapshotRevisionsQuery.error instanceof Error
            ? snapshotRevisionsQuery.error.message
            : null
        }
        restoringRevisionNumber={
          restoreSnapshotRevisionMutation.isPending
            ? (restoreSnapshotRevisionMutation.variables?.revisionNumber ?? null)
            : null
        }
        onClose={() => setShowVersionHistoryModal(false)}
        onRestore={(revision) => {
          if (!activeSnapshot) {
            return
          }
          restoreSnapshotRevisionMutation.mutate({
            snapshotId: activeSnapshot.id,
            revisionNumber: revision.revision_number,
          })
        }}
      />

      {/* Lane Picker Modal */}
      {lanePickerOpen && (
        <Modal
          open
          size="md"
          modalHeading="Add automation lane"
          primaryButtonText="Close"
          onRequestClose={() => setLanePickerOpen(false)}
          onRequestSubmit={() => setLanePickerOpen(false)}
        >
          <div className="juce-grid-page__lane-picker">
            <p className="juce-grid-page__modal-copy">Select a parameter to automate from the active flow.</p>
            {currentChain?.plugins && currentChain.plugins.length > 0 ? (
              <div className="juce-grid-page__lane-picker-grid">
                {currentChain.plugins.map((plugin) => (
                  <Tile key={plugin.uri} className="juce-grid-page__lane-picker-tile">
                    <div className="juce-grid-page__lane-picker-header">
                      <div className="juce-grid-page__lane-picker-copy">
                        <p className="juce-grid-page__dense-card-kicker">Processor</p>
                        <h3 className="juce-grid-page__dense-card-heading">{getDisplayPluginName(plugin.name, plugin.uri)}</h3>
                      </div>
                      <Tag type="cool-gray">{Object.keys(plugin.parameters || {}).length} params</Tag>
                    </div>
                    <div className="juce-grid-page__lane-picker-params">
                      {Object.entries(plugin.parameters || {}).map(([symbol, value]) => {
                        const param = { symbol, value }
                        const laneColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD']
                        return (
                          <Button
                            key={param.symbol}
                            size="sm"
                            kind="ghost"
                            onClick={() => {
                              const newLane: AutomationLane = {
                                id: `${plugin.uri}:${param.symbol}`,
                                parameterName: param.symbol,
                                pluginName: getDisplayPluginName(plugin.name, plugin.uri),
                                pluginUri: plugin.uri,
                                parameterSymbol: param.symbol,
                                points: [],
                                enabled: true,
                                armed: false,
                                color: laneColors[automationLanes.length % laneColors.length],
                              }
                              setAutomationLanes(prev => [...prev, newLane])
                              setLanePickerOpen(false)
                            }}
                          >
                            {param.symbol}
                          </Button>
                        )
                      })}
                    </div>
                  </Tile>
                ))}
              </div>
            ) : (
              <p className="juce-grid-page__empty-state-copy">
                No plugins in the active flow. Add plugins first to create automation lanes.
              </p>
            )}
          </div>
        </Modal>
      )}

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

      <Button
        size="sm"
        kind="secondary"
        className={`juce-grid-page__automation-floating-toggle ${automationTimelineExpanded ? 'is-expanded' : ''}`}
        style={automationFloatingToggleStyle}
        onClick={() => setAutomationTimelineExpanded((previous) => !previous)}
        aria-controls="juce-grid-automation-panel"
        aria-expanded={automationTimelineExpanded}
        aria-label={automationTimelineExpanded ? 'Hide automation toolbar' : 'Show automation toolbar'}
        title={automationFloatingToggleTitle}
      >
        Automation
      </Button>

      {/* Unified Audio Port Selector — per-flow or global */}
      <JuceGridAudioPortModal
        open={portSelectorFlowIndex !== null}
        onClose={() => setPortSelectorFlowIndex(null)}
        chainId={portSelectorFlowIndex !== null ? flowSlots[portSelectorFlowIndex]?.chainId : null}
        flowLabel={portSelectorFlowIndex !== null ? (SLOT_COLORS[portSelectorFlowIndex]?.label || '') : undefined}
        flowColor={portSelectorFlowIndex !== null ? (SLOT_COLORS[portSelectorFlowIndex]?.color || '#2563eb') : undefined}
        readOnly={snapshotEditingLocked}
        onPortsChange={() => {
          queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
          const label = portSelectorFlowIndex !== null ? SLOT_COLORS[portSelectorFlowIndex]?.label : ''
          pushToast(`Flow ${label} port routing updated`, 'success')
        }}
      />

      {/* Perform Full-Screen Modal */}
      {showPerformModal && (
        <motion.div
          className="juce-grid-page__perform-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <PerformPage onExit={() => setShowPerformModal(false)} />
        </motion.div>
      )}

      {/* Audio Nodes Modal */}
      {showAudioNodesModal && (
        <AudioNodesModal
          open={showAudioNodesModal}
          onClose={() => setShowAudioNodesModal(false)}
        />
      )}

      {showLiveRuntimeModal ? (
        <LiveRuntimePathsModal
          open={showLiveRuntimeModal}
          onClose={() => setShowLiveRuntimeModal(false)}
          projections={liveChainProjection}
          summaryOnly={showLiveChainSummaryOnly}
          mismatch={liveChainMismatch}
          overflow={liveChainProjectionOverflow}
          onUpdateLive={handleUpdateLiveChains}
          onRevertToLive={handleRevertEditorToLive}
          updatePending={updateLiveChainsMutation.isPending}
          onKillLivePath={handleKillLiveChain}
          killPending={killLivePathMutation.isPending}
        />
      ) : null}

      {/* Routing Topology Modal */}
      <RoutingTopologyModal
        open={showRoutingTopologyModal}
        onClose={() => setShowRoutingTopologyModal(false)}
        readOnly={snapshotEditingLocked}
        routingMode={routing.mode}
        morphProgress={routing.morphProgress}
        activeFlowIndex={activeFlowIndex}
        flowSlots={flowSlots}
        routingVisualizerFlows={routingVisualizerFlows}
        activeSlotId={routing.activeSlotId}
        morphSourceSlotId={routing.morphSourceSlotId}
        morphTargetSlotId={routing.morphTargetSlotId}
        routingFocusButtons={routingFocusButtons}
        onSetRoutingMode={setRoutingMode}
        onSelectFlowIndex={selectFlowIndex}
        onSetMorphProgress={setMorphProgress}
        onOpenPortRouting={(flowIndex) => {
          setPortSelectorFlowIndex(flowIndex)
        }}
        onOpenAssignFlow={(flowId) => {
          const flow = flowSlots.find((s) => s.id === flowId)
          if (flow) openAssignmentDialog(flow)
        }}
        activeFlowId={routing.activeSlotId}
      />

    </div>
  )
}

export default SnapshotEditorPage
