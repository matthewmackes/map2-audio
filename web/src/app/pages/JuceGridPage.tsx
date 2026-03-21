/**
 * JuceGridPage - Carbon-first JUCE grid editor replacement
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

import { useState, useCallback, useMemo, useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Add,
  Book,
  Branch,
  Camera,
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Flow,
  Headphones,
  Launch,
  Link,
  Meter,
  Music,
  Pause,
  Play,
  Recording,
  Renew,
  Stop,
  Timer,
  TrashCan,
  VolumeMute,
  VolumeUp,
  WarningAlt,
  ArrowsHorizontal,
  Close,
  Edit,
  Network_3,
} from '@carbon/icons-react'
import {
  Accordion,
  AccordionItem,
  Button,
  Checkbox,
  InlineLoading,
  Layer,
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
  TextInput,
  Tile,
} from '@carbon/react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useIsMobile } from '../hooks/useIsMobile'
import { getCategoryConfig } from '../grid/shared'
import type { AutomationLane } from '../grid/shared'
import {
  chainsApi,
  pluginsApi,
  historyApi,
  audioApi,
  metricsApi,
  flowSnapshotsApi,
  midiApiV2,
  type AudioAvbEndpoint,
  type AudioPort,
  type AudioRoutingSelectionBinding,
} from '../../map2/api'
import { useToasts } from '../components/Toasts'
import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { usePluginOutputs } from '../hooks/usePluginOutputs'
import { useFlowSnapshots } from '../hooks/useFlowSnapshots'
import { getEffectIcon } from '../components/icons/effectIcons'
import MidiLearnButton from '../../map2/components/MIDI/MidiLearnButton'
import { PluginDetailsModal } from '../components/PluginDetailsModal'
import { NumberInput } from '../components/Controls/NumberInput'
import { SegmentedLedText } from '../components/Displays/SegmentedLedText'
import { MapAudioGridIcon } from '../components/icons/map'
import { SnapshotImportDialog } from '../components/snapshots/SnapshotImportDialog'
import { SnapshotModal } from '../components/snapshots/SnapshotModal'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'
import type { Chain, Plugin, PluginOrderRef, HistoryStatus, FlowSnapshot, FlowSnapshotData, ChainSnapshot, ChainsResponse, Snapshot, MIDIMappingV2, MIDIStatus } from '../../map2/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import { buildPluginOrderRef } from '../../map2/utils/pluginIdentity'
import { sortPluginsForBrowser } from '../utils/pluginBrowserSort'
import { JuceGridAudioPortModal } from './JuceGridAudioPortModal'
import { JuceGridChainManagementCard } from './JuceGridChainManagementCard'
import { ChainAssignmentModal } from './ChainAssignmentModal'
import { RoutingTopologyModal } from './RoutingTopologyModal'
import { AudioNodesModal } from './AudioNodesModal'
import { JuceGridParameterEditor } from './JuceGridParameterEditor'
import {
  JuceGridRoutingVisualizer,
  getJuceGridRoutingInspectorItems,
  type JuceGridRoutingMarkerId,
} from './JuceGridRoutingVisualizer'
import { JuceGridSignalCanvas, type JuceGridAudioInterfaceStatus } from './JuceGridSignalCanvas'
import { buildJuceGridLivePath } from './juceGridLivePath'
import {
  createDefaultJuceGridFlowSlots,
  createDefaultJuceGridRouting,
  normalizeJuceGridStateSources,
} from './juceGridState'
import type { JuceGridRoutingState } from './juceGridState'
import {
  fingerprintSnapshotData,
} from './juceGridSnapshots'
import './JuceGridPage.css'
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

const FLOW_CARD_LED_COLOR = '#59a8ff'

function isTabletViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.innerWidth > 768 && window.innerWidth <= 1184
}

function isTouchCapableViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const navigatorTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0
  const ontouchstartSupported = 'ontouchstart' in window
  return navigatorTouchPoints > 0 || ontouchstartSupported
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

// ============================================================================
// Constants
// ============================================================================

const SLOT_COLORS = [
  { label: 'A', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.15)' },
  { label: 'B', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  { label: 'C', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  { label: 'D', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  { label: 'E', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
  { label: 'F', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)' },
]

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

export function JuceGridPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const isMobile = useIsMobile()
  const [isTablet, setIsTablet] = useState<boolean>(() => isTabletViewport())
  const [isTouchCapable, setIsTouchCapable] = useState<boolean>(() => isTouchCapableViewport())
  const [compactTab, setCompactTab] = useState<CompactTabId>('grid')

  useEffect(() => {
    const handleResize = () => {
      setIsTablet(isTabletViewport())
      setIsTouchCapable(isTouchCapableViewport())
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isCompactLayout = isMobile || isTablet
  const isTabletTouchLayout = isTablet && isTouchCapable && !isMobile
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
  const flowCountLabel = `${flowSlots.length} ${flowSlots.length === 1 ? 'flow' : 'flows'}`

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
  const [showRenameChainModal, setShowRenameChainModal] = useState(false)
  const [renameChainName, setRenameChainName] = useState('')
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
  const bottomEditorTouchStartYRef = useRef<number | null>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const [showPerformModal, setShowPerformModal] = useState(false)
  const [showAudioNodesModal, setShowAudioNodesModal] = useState(false)
  const [showRoutingTopologyModal, setShowRoutingTopologyModal] = useState(false)
  const openPlatformDocs = useCallback((doc?: string) => {
    const params = new URLSearchParams({
      panel: 'about',
      context: 'juce-grid',
    })
    if (doc) {
      params.set('doc', doc)
    }
    navigate(`/platform?${params.toString()}`)
  }, [navigate])

  // Chain assignment modal — flowId drives which flow is being edited
  const [chainModalFlowId, setChainModalFlowId] = useState<string | null>(null)
  // When rename is triggered from inside the chain assignment modal we need the
  // specific chainId rather than currentChain (which may differ from the modal's
  // pending selection while a different flow is focused).
  const [renameChainForId, setRenameChainForId] = useState<number | null>(null)
  
  // Special settings for plugin filtering
  const { settings: specialSettings } = useSpecialSettings()

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

  // Flow Snapshots Panel State
  const [snapshotsModalOpen, setSnapshotsModalOpen] = useState(false)
  const [midiModalOpen, setMidiModalOpen] = useState(false)
  const [showExpressionOverlay, setShowExpressionOverlay] = useState(false)
  const [snapshotsDirty, setSnapshotsDirty] = useState(false)
  const [routingInspectorId, setRoutingInspectorId] = useState<JuceGridRoutingMarkerId | null>(null)
  const bottomEditorRef = useRef<HTMLElement | null>(null)
  const midiLearnWasInProgressRef = useRef(false)
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

  // Derived: the flow slot currently targeted by the chain assignment modal
  const chainModalFlow = chainModalFlowId
    ? flowSlots.find((s) => s.id === chainModalFlowId) ?? null
    : null

  // Auto-open chain assignment modal when a flow has no chain assigned.
  // We target the first unassigned flow found (or the active flow if it's unassigned).
  useEffect(() => {
    const firstUnassigned = flowSlots.find((s) => s.chainId === null)
    if (firstUnassigned && chainModalFlowId === null) {
      setChainModalFlowId(firstUnassigned.id)
    }
  // Only re-run when flowSlots change — not when the modal opens/closes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowSlots])

  // ============================================================================
  // Queries
  // ============================================================================

  // Fetch chains
  const chainsQuery = useQuery({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    refetchInterval: 5000,
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
    refetchInterval: 2000,
  })

  // Fetch presets
  const presetsQuery = useQuery({
    queryKey: ['chains', 'presets'],
    queryFn: () => chainsApi.listPresets(),
  })

  const midiStatusQuery = useQuery({
    queryKey: ['midi', 'status'],
    queryFn: midiApiV2.getStatus,
    refetchInterval: 2000,
  })

  const midiLearnStatusQuery = useQuery({
    queryKey: ['midi', 'learn', 'status'],
    queryFn: midiApiV2.getLearnStatus,
    refetchInterval: (query) => {
      const learnStatus = query.state.data as { learning?: boolean } | undefined
      return midiLearnActive || learnStatus?.learning ? 500 : 2000
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

      if (midiScope === 'selected-plugin' && activeFlowChainId !== null) {
        return midiApiV2.getMappings({ chain_id: activeFlowChainId })
      }

      return midiApiV2.getMappings()
    },
    refetchInterval: 5000,
  })

  const flowSnapshotsQuery = useQuery<{
    snapshots: FlowSnapshot[]
    count: number
    active_id: number | null
  }>({
    queryKey: ['flow-snapshots'],
    queryFn: () => flowSnapshotsApi.list(),
    refetchInterval: 5000,
  })

  // Fetch audio status
  const audioQuery = useQuery({
    queryKey: ['audio', 'status'],
    queryFn: () => audioApi.getStatus(),
    refetchInterval: 5000,
  })

  const audioLevelsQuery = useQuery({
    queryKey: ['audio', 'levels'],
    queryFn: audioApi.getLevels,
    refetchInterval: 500,
  })

  // Fetch JACK metrics
  const jackQuery = useQuery({
    queryKey: ['metrics', 'jack'],
    queryFn: metricsApi.getJack,
    refetchInterval: 2000,
  })

  // Fetch audio port routing
  const portsQuery = useQuery({
    queryKey: ['audio', 'ports'],
    queryFn: audioApi.getPorts,
    refetchInterval: 10000,
  })

  const routingQuery = useQuery({
    queryKey: ['audio', 'routing'],
    queryFn: audioApi.getRouting,
    refetchInterval: 5000,
  })

  const clusterNodesQuery = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/cluster/nodes`)
      if (!res.ok) throw new Error('Failed to load cluster nodes')
      return res.json()
    },
    refetchInterval: 2000,
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
  const { metrics: cpuMetrics, status: cpuStatus, hasXruns, getPluginCpu } = useCPUMetrics({
    useWebSocket: true,
    pollingInterval: 500,
  })

  // Plugin output metering hook
  const { outputPorts: pluginOutputPorts, peaks: pluginPeaks, connected: outputsConnected } = usePluginOutputs()

  // Flow snapshots WebSocket hook for MIDI PC triggered loads
  const { isConnected: snapshotsWsConnected } = useFlowSnapshots({
    enabled: true,
    onSnapshotLoaded: useCallback((event) => {
      // Handle MIDI-triggered snapshot loads
      if (event.triggered_by === 'midi_pc') {
        const normalizedSnapshotState = normalizeRuntimeGridState(
          event.snapshot_data?.flowSlots,
          event.snapshot_data?.routing,
          event.snapshot_data?.activeFlowIndex,
        )
        setFlowSlots(normalizedSnapshotState.flowSlots)
        setRouting(normalizedSnapshotState.routing)
        setActiveFlowIndex(normalizedSnapshotState.activeFlowIndex)

        // Invalidate queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
        clearSnapshotsDirty()

        pushToast(`Loaded: ${event.snapshot_name} (MIDI PC#${event.program_number})`, 'success')
      }
    }, [queryClient, clearSnapshotsDirty, pushToast]),
  })

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


  // ============================================================================
  // Derived State
  // ============================================================================

  const chains = chainsQuery.data?.chains || []
  const historyStatus = historyQuery.data as HistoryStatus | undefined
  const presets = presetsQuery.data?.presets || []
  const armedAutomationLane = useMemo(
    () => automationLanes.find((lane) => lane.armed) ?? null,
    [automationLanes],
  )
  const audioStatus = audioQuery.data
  const audioLevels = audioLevelsQuery.data
  const jackMetrics = jackQuery.data

  const getChainForFlow = useCallback((slot: FlowSlot): Chain | undefined => {
    return chains.find(c => c.id === slot.chainId)
  }, [chains])

  // Flow Snapshots: Capture current state for saving
  const captureCurrentState = useCallback((): FlowSnapshotData => {
    const chainSnapshots: Record<string, ChainSnapshot> = {}

    for (const slot of flowSlots) {
      if (slot.chainId) {
        const chain = chains.find(c => c.id === slot.chainId)
        if (chain) {
          chainSnapshots[String(slot.chainId)] = {
            name: chain.name,
            plugins: chain.plugins.map((p, i) => ({
              uri: p.uri,
              position: i,
              bypass: p.bypassed || false,
              parameters: p.parameters || {},
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
  }, [flowSlots, routing, activeFlowIndex, chains])

  const currentSnapshotDraft = useMemo(() => captureCurrentState(), [captureCurrentState])
  const currentSnapshotFingerprint = useMemo(
    () => fingerprintSnapshotData(currentSnapshotDraft),
    [currentSnapshotDraft],
  )

  const applySnapshotState = useCallback((
    data: FlowSnapshotData,
    options?: { toastMessage?: string | null; invalidateChains?: boolean },
  ) => {
    const normalizedSnapshotState = normalizeRuntimeGridState(
      data.flowSlots,
      data.routing,
      data.activeFlowIndex,
    )
    setFlowSlots(normalizedSnapshotState.flowSlots)
    setRouting(normalizedSnapshotState.routing)
    setActiveFlowIndex(normalizedSnapshotState.activeFlowIndex)
    if (options?.invalidateChains ?? true) {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
    }
    if (options?.toastMessage) {
      pushToast(options.toastMessage, 'success')
    }
  }, [pushToast, queryClient])

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
    return chains.find(c => c.id === activeFlow.chainId) || null
  }, [chains, activeFlow])

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
  const secondaryRoutingFlowId = useMemo(
    () => flowSlots.find((flow) => flow.id !== routing.activeSlotId)?.id ?? null,
    [flowSlots, routing.activeSlotId],
  )
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

  const selectedPlugin = useMemo(() => {
    if (!selectedPluginUri || !currentChain) return null
    return currentChain.plugins.find((plugin) => (
      plugin.uri === selectedPluginUri
      && (typeof selectedPluginPosition !== 'number' || plugin.position === selectedPluginPosition)
    )) || null
  }, [selectedPluginPosition, selectedPluginUri, currentChain])

  const selectedPluginMeta = useMemo(() => {
    if (!selectedPluginUri) return null
    const meta = pluginMeta[selectedPluginUri]
    // Debug: log when metadata lookup fails
    if (!meta && selectedPluginUri) {
      console.warn('[JuceGridPage] Plugin metadata not found for URI:', selectedPluginUri)
      console.warn('[JuceGridPage] Available URIs:', Object.keys(pluginMeta).slice(0, 5), '...')
      console.warn('[JuceGridPage] pluginsQuery status:', pluginsQuery.status, 'data count:', pluginsQuery.data?.plugins?.length ?? 0)
    }
    return meta || null
  }, [selectedPluginUri, pluginMeta, pluginsQuery.status, pluginsQuery.data?.plugins?.length])

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

    return resolveLivePluginCardStrategy(selectedPluginCard.uri, selectedPluginCard.category)
  }, [selectedPluginCard])

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
  const lastMidiEvent = useMemo(() => {
    if (!midiStatus || midiStatus.last_channel <= 0) {
      return null
    }

    return {
      cc: midiStatus.last_cc,
      value: midiStatus.last_value,
      channel: midiStatus.last_channel,
    }
  }, [midiStatus])

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
    return slot ? chains.find(c => c.id === slot.chainId) : undefined
  }, [flowSlots, activeFlowIndex, chains])

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
      pushToast('Chain activated', 'success')
    },
    onError: (error) => pushToast(`Failed to activate: ${error}`, 'error'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (chainId: number) => chainsApi.deactivate(chainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
      pushToast('Chain deactivated', 'info')
    },
    onError: (error) => pushToast(`Failed to deactivate: ${error}`, 'error'),
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
      setRenameChainForId(null)
      pushToast('Chain renamed', 'success')
    },
    onError: (error) => pushToast(`Failed to rename: ${error}`, 'error'),
  })

  // ============================================================================
  // Handlers
  // ============================================================================

  // Flow management
  const addFlow = useCallback(() => {
    if (flowSlots.length >= MAX_FLOWS) return
    const nextIndex = flowSlots.length
    const colorConfig = SLOT_COLORS[nextIndex] || SLOT_COLORS[nextIndex % SLOT_COLORS.length]
    const newSlot: FlowSlot = {
      id: `flow-${Date.now()}`,
      chainId: null,
      label: colorConfig.label,
      color: colorConfig.color,
      muted: false,
      solo: false,
      dryWetMix: 100,
    }
    setFlowSlots(prev => [...prev, newSlot])
    setRouting(prev => ({
      ...prev,
      seriesOrder: [...prev.seriesOrder, newSlot.id],
    }))
  }, [flowSlots.length])

  const removeFlow = useCallback((flowId: string) => {
    if (flowSlots.length <= MIN_FLOWS) return
    const removedIndex = flowSlots.findIndex(f => f.id === flowId)
    setFlowSlots(prev => prev.filter(f => f.id !== flowId))
    setRouting(prev => ({
      ...prev,
      seriesOrder: prev.seriesOrder.filter(id => id !== flowId),
    }))
    if (activeFlowIndex >= removedIndex && activeFlowIndex > 0) {
      setActiveFlowIndex(prev => prev - 1)
    }
  }, [flowSlots, activeFlowIndex])

  const clearFlows = useCallback(() => {
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
  }, [pushToast])

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
    setFlowSlots(prev => prev.map(f => f.id === flowId ? { ...f, ...updates } : f))
  }, [])

  const selectFlowIndex = useCallback((index: number) => {
    const slot = flowSlots[index]
    if (!slot) {
      return
    }

    setActiveFlowIndex(index)
    setRouting((previous) => {
      if (previous.activeSlotId === slot.id) {
        return previous
      }
      return {
        ...previous,
        activeSlotId: slot.id,
      }
    })
  }, [flowSlots])

  const closeAssignmentDialog = useCallback(() => {
    setAssignmentDialogOpen(false)
    setSelectedFlowForAssignment(null)
    setAssignmentSelectedNodeId('')
    setAssignmentRedundancyEnabled(false)
    setIsAssigningFlow(false)
  }, [])

  const openAssignmentDialog = useCallback((flow: FlowSlot) => {
    setSelectedFlowForAssignment(flow)
    setAssignmentSelectedNodeId('')
    setAssignmentRedundancyEnabled(false)
    setAssignmentDialogOpen(true)
  }, [])

  const handleAssignFlow = useCallback(async (nodeId: string, redundancyEnabled: boolean) => {
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
  }, [selectedFlowForAssignment, closeAssignmentDialog, pushToast, queryClient])

  // Routing
  const setRoutingMode = useCallback((mode: RoutingMode) => {
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
  }, [activeFlow?.id, flowSlots, markSnapshotsDirty])

  const setBlendPosition = useCallback((slotId: string, position: number) => {
    setRouting(prev => ({
      ...prev,
      blendPositions: { ...prev.blendPositions, [slotId]: position },
    }))
  }, [])

  const setMorphProgress = useCallback((progress: number) => {
    setRouting(prev => ({ ...prev, morphProgress: progress }))
  }, [])

  // Plugin operations
  const openEffectModal = useCallback(() => {
    setEffectModalOpen(true)
  }, [])

  const handlePluginSelect = useCallback((uri: string, position: number) => {
    if (selectedPluginUri === uri && selectedPluginPosition === position && effectModalOpen) {
      setEffectModalOpen(false)
      return
    }

    setSelectedPluginSelection(uri, position)
    if (isTabletTouchLayout && (selectedPluginUri !== uri || selectedPluginPosition !== position)) {
      return
    }

    openEffectModal()
    if (isCompactLayout) {
      setCompactTab('editor')
    }
  }, [
    effectModalOpen,
    isCompactLayout,
    isTabletTouchLayout,
    openEffectModal,
    selectedPluginPosition,
    selectedPluginUri,
    setSelectedPluginSelection,
  ])

  const handleCloseEffectModal = useCallback(() => {
    setEffectModalOpen(false)
  }, [])

  const handleBottomEditorTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!isTabletTouchLayout) {
      return
    }

    bottomEditorTouchStartYRef.current = event.changedTouches[0]?.clientY ?? null
  }, [isTabletTouchLayout])

  const handleBottomEditorTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!isTabletTouchLayout) {
      return
    }

    const startY = bottomEditorTouchStartYRef.current
    const endY = event.changedTouches[0]?.clientY ?? null
    bottomEditorTouchStartYRef.current = null

    if (startY === null || endY === null) {
      return
    }

    if (endY - startY >= 72) {
      handleCloseEffectModal()
    }
  }, [handleCloseEffectModal, isTabletTouchLayout])

  useEffect(() => {
    if (!effectModalOpen) {
      return
    }

    const panel = bottomEditorRef.current
    if (!panel || typeof panel.scrollIntoView !== 'function') {
      return
    }

    requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [effectModalOpen])

  const handleFlowSlotKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectFlowIndex(index)
    }
  }, [selectFlowIndex])

  const handleToggleBypass = useCallback((uri: string, bypassed: boolean, position: number) => {
    if (!currentChain) return
    bypassMutation.mutate({ chainId: currentChain.id, pluginUri: uri, bypass: bypassed, pluginPosition: position })
  }, [currentChain, bypassMutation])

  const handleDeletePlugin = useCallback((uri: string, position?: number) => {
    if (!currentChain) return
    deleteMutation.mutate({ chainId: currentChain.id, pluginUri: uri, pluginPosition: position })
  }, [currentChain, deleteMutation])

  const handleReorderPlugins = useCallback((pluginOrder: PluginOrderRef[]) => {
    if (!currentChain) return
    reorderMutation.mutate({ chainId: currentChain.id, pluginOrder })
  }, [currentChain, reorderMutation])

  const moveSelectedPlugin = useCallback((direction: ReorderDirection) => {
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
  }, [currentChain, reorderMutation, selectedPluginPosition, selectedPluginUri])

  const handleAddPlugin = useCallback(() => {
    setShowPluginBrowser(true)
  }, [])

  const handleAddPluginToCurrentChain = useCallback((pluginUri: string) => {
    if (!currentChain) {
      pushToast('Select a chain before adding a plugin', 'warn')
      return
    }
    addPluginMutation.mutate({ chainId: currentChain.id, pluginUri })
  }, [currentChain, addPluginMutation, pushToast])

  const handleAddPluginDirect = useCallback((uri: string) => {
    if (!currentChain) return
    addPluginMutation.mutate({ chainId: currentChain.id, pluginUri: uri })
  }, [currentChain, addPluginMutation])

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
    startMidiLearnMutation,
  ])

  const handleParameterChangeEnd = useCallback(() => {
    pluginsApi.flushParameterBatch()
    queryClient.invalidateQueries({ queryKey: ['chains'] })
    markSnapshotsDirty()
  }, [queryClient, markSnapshotsDirty])

  const handleToggleSelectedBypass = useCallback(() => {
    if (!selectedPlugin || !currentChain) return
    bypassMutation.mutate({
      chainId: currentChain.id,
      pluginUri: selectedPlugin.uri,
      bypass: !selectedPlugin.bypassed,
      pluginPosition: selectedPlugin.position,
    })
  }, [selectedPlugin, currentChain, bypassMutation])

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
  const handleToggleChainActive = useCallback(() => {
    if (!currentChain) return
    if (currentChain.is_active) {
      deactivateMutation.mutate(currentChain.id)
    } else {
      activateMutation.mutate(currentChain.id)
    }
  }, [currentChain, activateMutation, deactivateMutation])

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
  }, [currentChain, queryClient, pushToast, markSnapshotsDirty])

  const handleRenameChain = useCallback(() => {
    if (!currentChain) return
    setRenameChainName(currentChain.name)
    setShowRenameChainModal(true)
  }, [currentChain])

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
    // Use renameChainForId when triggered from the chain assignment modal
    const targetId = renameChainForId ?? currentChain?.id
    if (!targetId || !normalizedName) {
      setShowRenameChainModal(false)
      setRenameChainForId(null)
      return
    }
    renameMutation.mutate({ chainId: targetId, name: normalizedName })
  }, [currentChain, renameChainName, renameChainForId, renameMutation])

  // Modal-context lifecycle handlers — receive chainId from the modal's pending selection
  const handleModalToggleActive = useCallback((chainId: number) => {
    const chain = chains.find((c) => c.id === chainId)
    if (!chain) return
    if (chain.is_active) {
      deactivateMutation.mutate(chainId)
    } else {
      activateMutation.mutate(chainId)
    }
  }, [chains, activateMutation, deactivateMutation])

  const handleModalDuplicate = useCallback((chainId: number) => {
    const chain = chains.find((c) => c.id === chainId)
    if (!chain) return
    const newName = `${chain.name} Copy`
    chainsApi.create(newName)
      .then((newChain) => {
        queryClient.setQueryData<ChainsResponse>(['chains'], (current) => {
          if (!current) return current
          const alreadyPresent = current.chains.some((c) => c.id === newChain.id)
          if (alreadyPresent) return current
          return { ...current, chains: [...current.chains, newChain], count: current.count + 1 }
        })
        queryClient.invalidateQueries({ queryKey: ['chains'] })
        markSnapshotsDirty()
        pushToast(`Chain "${newName}" created`, 'success')
      })
      .catch((error) => pushToast(`Failed to duplicate: ${error}`, 'error'))
  }, [chains, queryClient, pushToast, markSnapshotsDirty])

  const handleModalRename = useCallback((chainId: number) => {
    const chain = chains.find((c) => c.id === chainId)
    if (!chain) return
    setRenameChainForId(chainId)
    setRenameChainName(chain.name)
    setShowRenameChainModal(true)
  }, [chains])

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

  const snapshotCount = flowSnapshotsQuery.data?.snapshots.length ?? 0
  const snapshotCountLabel = snapshotCount > 99 ? '99+' : String(snapshotCount)
  const midiMappingCount = midiMappings.length
  const midiMappingCountLabel = midiMappingCount > 99 ? '99+' : String(midiMappingCount)
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const renderSnapshotsTrigger = () => (
    <div className="snapshot-rail-trigger snapshot-floating-trigger">
      {snapshotsDirty && (
        prefersReducedMotion ? (
          <span className="snapshot-rail-trigger__pulse" aria-hidden />
        ) : (
          <motion.span
            className="snapshot-rail-trigger__pulse"
            aria-hidden
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: [0.95, 1.25, 0.95], opacity: [0.8, 0.25, 0.8] }}
            transition={{ repeat: Infinity, repeatType: 'loop', stiffness: 80, damping: 20, duration: 1 }}
          />
        )
      )}
      <Button
        hasIconOnly
        size="lg"
        kind="ghost"
        renderIcon={Camera}
        iconDescription="Open Snapshots"
        aria-label="Open Snapshots"
        aria-expanded={snapshotsModalOpen}
        aria-controls="snapshots-modal"
        className="snapshot-rail-trigger__button"
        onClick={() => setSnapshotsModalOpen(true)}
      />
      <div className="snapshot-rail-trigger__label-group">
        <span className="snapshot-rail-trigger__label">Snapshots</span>
        <span className="snapshot-rail-trigger__count">{snapshotCountLabel}</span>
      </div>
    </div>
  )

  const renderMidiTrigger = () => (
    <div className="snapshot-rail-trigger snapshot-floating-trigger snapshot-floating-trigger--midi">
      {(midiLearnActive || midiLearnInProgress) && (
        prefersReducedMotion ? (
          <span className="snapshot-rail-trigger__pulse snapshot-rail-trigger__pulse--learn" aria-hidden />
        ) : (
          <motion.span
            className="snapshot-rail-trigger__pulse snapshot-rail-trigger__pulse--learn"
            aria-hidden
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: [0.95, 1.3, 0.95], opacity: [0.9, 0.3, 0.9] }}
            transition={{ repeat: Infinity, repeatType: 'loop', duration: 0.8 }}
          />
        )
      )}
      <Button
        hasIconOnly
        size="lg"
        kind="ghost"
        renderIcon={Music}
        iconDescription="Open MIDI"
        aria-label="Open MIDI"
        aria-expanded={midiModalOpen}
        aria-controls="juce-grid-midi-modal"
        className="snapshot-rail-trigger__button"
        onClick={() => setMidiModalOpen(true)}
      />
      <div className="snapshot-rail-trigger__label-group">
        <span className="snapshot-rail-trigger__label">MIDI</span>
        <span className="snapshot-rail-trigger__count">
          {midiLearnActive || midiLearnInProgress ? 'Learn armed' : midiMappingCountLabel}
        </span>
      </div>
    </div>
  )

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
                  <strong>{getMidiMappingParameterName(mapping)}</strong>
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
          <strong>Automation</strong>
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
                  <strong>{lane.parameterName}</strong>
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

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEntryTarget(e.target)) {
        if (e.key === 'Escape') {
          if (showSavePresetModal) setShowSavePresetModal(false)
          else if (showRenameChainModal) setShowRenameChainModal(false)
          else if (presetPendingDelete) setPresetPendingDelete(null)
          else if (showClearFlowsModal) setShowClearFlowsModal(false)
          else if (snapshotsModalOpen) setSnapshotsModalOpen(false)
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

      // Left/Right = Move selected plugin through the signal chain
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && currentChain) {
        e.preventDefault()
        if (!selectedPluginUri) {
          const fallbackIndex = e.key === 'ArrowLeft' ? currentChain.plugins.length - 1 : 0
          const fallbackPlugin = currentChain.plugins[fallbackIndex]
          if (fallbackPlugin) {
            setSelectedPluginSelection(fallbackPlugin.uri, fallbackPlugin.position)
            openEffectModal()
          }
          return
        }

        moveSelectedPlugin(e.key === 'ArrowLeft' ? 'left' : 'right')
        return
      }

      // Escape = Close modals/deselect
      if (e.key === 'Escape') {
        if (showSavePresetModal) setShowSavePresetModal(false)
        else if (showRenameChainModal) setShowRenameChainModal(false)
        else if (presetPendingDelete) setPresetPendingDelete(null)
        else if (showClearFlowsModal) setShowClearFlowsModal(false)
        else if (snapshotsModalOpen) setSnapshotsModalOpen(false)
        else if (midiModalOpen) setMidiModalOpen(false)
        else if (routingInspectorId) setRoutingInspectorId(null)
        else if (showPluginBrowser) setShowPluginBrowser(false)
        else if (showPresetBrowser) setShowPresetBrowser(false)
        else if (showKeyboardHelp) setShowKeyboardHelp(false)
        else if (detailsPlugin) setDetailsPlugin(null)
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
    flowSlots, showSavePresetModal, showRenameChainModal, presetPendingDelete,
    showClearFlowsModal, snapshotsModalOpen, midiModalOpen, routingInspectorId, showPluginBrowser,
    showPresetBrowser, showKeyboardHelp, detailsPlugin, effectModalOpen,
    handleSavePreset, toggleFavorite, selectFlowIndex, openEffectModal, moveSelectedPlugin, setSelectedPluginSelection,
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
    const flowSummary = flowChain
      ? `${flowChain.plugins.length} loaded ${flowChain.plugins.length === 1 ? 'block' : 'blocks'}`
      : 'Assign a chain to start editing'
    const arrowTone = getLivePathArrowTone(flowState)
    const arrowDashed = Boolean(flowState?.dimmed || flowState?.sidechainKey)
    const stateLabel = getLivePathStateLabel(flowState)
    const branchLabel = getLivePathBranchLabel(routing.mode, groupKind, flowState)
    const mobileStatusLabels = [stateLabel, branchLabel].filter((label): label is string => Boolean(label))
    const flowCardTitle = routing.mode === 'series'
      ? 'Flow'
      : flowState?.sidechainKey
        ? 'Key lane'
        : groupKind === 'morph'
          ? 'Morph lane'
          : isActive
            ? 'Selected branch'
            : 'Branch'

    return (
      <div
        key={flow.id}
        className={`juce-grid-page__live-path-row juce-grid-page__live-path-row--${groupKind} ${flowState?.activeAudio ? 'is-live' : ''} ${flowState?.dimmed ? 'is-dimmed' : ''}`}
      >
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

        <article
          className={`juce-grid-page__flow-card ${isActive ? 'is-active' : ''} ${flow.muted ? 'is-muted' : ''} ${flow.solo ? 'is-solo' : ''} ${flowState?.dimmed ? 'is-path-dimmed' : ''} ${flowState?.activeAudio ? 'is-path-live' : ''}`}
          style={{ '--flow-color': flow.color } as React.CSSProperties}
          onClick={() => selectFlowIndex(index)}
          onKeyDown={(event) => handleFlowSlotKeyDown(event, index)}
          role="button"
          tabIndex={0}
          aria-pressed={isActive}
          aria-label={`Select flow ${flowLabel}`}
        >
          <div className="juce-grid-page__flow-card-title">
            <Branch size={14} />
            <span>{flowCardTitle}</span>
          </div>

          <div className="juce-grid-page__flow-card-body">
            <div className="juce-grid-page__flow-card-header">
              <div className="juce-grid-page__flow-card-heading">
                <span className="juce-grid-page__flow-card-label">{flowLabel}</span>
                <div className="juce-grid-page__flow-card-copy">
                  <strong>{flowTitle}</strong>
                  <p>
                    <SegmentedLedText value={flowSummary} size="sm" color={FLOW_CARD_LED_COLOR} />
                  </p>
                </div>
              </div>

              <div className="juce-grid-page__flow-card-meta">
                {isActive && <Tag type="blue">Selected</Tag>}
                {flowState?.activeAudio && <Tag type="green">Live path</Tag>}
                {!flowState?.activeAudio && branchLabel && (
                  <Tag type="cool-gray">{branchLabel}</Tag>
                )}
                {flowState?.secondaryAnnotation && (
                  <Tag type="cool-gray">
                    <SegmentedLedText value={flowState.secondaryAnnotation} size="xs" color={FLOW_CARD_LED_COLOR} />
                  </Tag>
                )}
                {flow.solo && <Tag type="warm-gray">Solo</Tag>}
                {flow.muted && <Tag type="red">Muted</Tag>}
                {flowChain && (
                  <Tag type="cool-gray">
                    <SegmentedLedText value={`${flowChain.plugins.length} blocks`} size="xs" color={FLOW_CARD_LED_COLOR} />
                  </Tag>
                )}
                {pluginCpuSum > 0 && (
                  <Tag type={pluginCpuSum >= 50 ? 'red' : 'blue'}>
                    <SegmentedLedText value={`CPU ${pluginCpuSum.toFixed(0)}%`} size="xs" color={FLOW_CARD_LED_COLOR} />
                  </Tag>
                )}
              </div>

              <div className="juce-grid-page__flow-card-actions">
                <button
                  type="button"
                  className="juce-grid-page__flow-card-routing-summary"
                  onClick={(event) => {
                    event.stopPropagation()
                    selectFlowIndex(index)
                    setPortSelectorFlowIndex(index)
                  }}
                  title={flowCardRoutingSummary.title}
                >
                  <span className="juce-grid-page__flow-card-routing-label">I/O routing</span>
                  <span>{flowCardRoutingSummary.statusLabel}</span>
                  <span>
                    <SegmentedLedText value={flowCardRoutingSummary.ioLabel} size="xs" color={FLOW_CARD_LED_COLOR} />
                  </span>
                  <span>
                    <SegmentedLedText value={flowCardRoutingSummary.clockLabel} size="xs" color={FLOW_CARD_LED_COLOR} />
                  </span>
                  <span>{flowCardRoutingSummary.routingMode}</span>
                  <span>{flowCardRoutingSummary.avbLabel}</span>
                </button>

                <Button
                  type="button"
                  hasIconOnly
                  renderIcon={Edit}
                  iconDescription={flowChain ? `Edit chain for flow ${flowLabel}` : `Assign chain to flow ${flowLabel}`}
                  size="sm"
                  kind={!flowChain ? 'primary' : 'ghost'}
                  className="juce-grid-page__flow-card-action"
                  onClick={(event) => {
                    event.stopPropagation()
                    setChainModalFlowId(flow.id)
                  }}
                />

                <div className="juce-grid-page__flow-card-input" onClick={(event) => event.stopPropagation()} title={`Dry/Wet: ${flow.dryWetMix}%`}>
                  <NumberInput
                    value={flow.dryWetMix}
                    min={0}
                    max={100}
                    step={1}
                    valueFormatter={(value) => `${Math.round(value)}%`}
                    displayOverlay={(
                      <SegmentedLedText
                        value={`${Math.round(flow.dryWetMix)}%`}
                        size="sm"
                        color={FLOW_CARD_LED_COLOR}
                        className="juce-grid-page__flow-card-led-overlay"
                      />
                    )}
                    onChange={(value) => updateFlow(flow.id, { dryWetMix: value })}
                    size="small"
                    showLabel={false}
                  />
                </div>

                <Button
                  type="button"
                  hasIconOnly
                  renderIcon={Link}
                  iconDescription={`Assign ${flowLabel} to node`}
                  size="sm"
                  kind="ghost"
                  className="juce-grid-page__flow-card-action"
                  onClick={(event) => {
                    event.stopPropagation()
                    openAssignmentDialog(flow)
                  }}
                />

                <Button
                  type="button"
                  hasIconOnly
                  renderIcon={Headphones}
                  iconDescription={`${flow.solo ? 'Disable' : 'Enable'} solo for flow ${flowLabel}`}
                  size="sm"
                  kind={flow.solo ? 'secondary' : 'ghost'}
                  className="juce-grid-page__flow-card-action"
                  onClick={(event) => {
                    event.stopPropagation()
                    updateFlow(flow.id, { solo: !flow.solo })
                  }}
                  aria-pressed={flow.solo}
                />

                <Button
                  type="button"
                  hasIconOnly
                  renderIcon={flow.muted ? VolumeMute : VolumeUp}
                  iconDescription={`${flow.muted ? 'Disable' : 'Enable'} mute for flow ${flowLabel}`}
                  size="sm"
                  kind={flow.muted ? 'danger--tertiary' : 'ghost'}
                  className="juce-grid-page__flow-card-action"
                  onClick={(event) => {
                    event.stopPropagation()
                    updateFlow(flow.id, { muted: !flow.muted })
                  }}
                  aria-pressed={flow.muted}
                />

                {flowSlots.length > MIN_FLOWS && (
                  <Button
                    type="button"
                    hasIconOnly
                    renderIcon={TrashCan}
                    iconDescription={`Delete flow ${flowLabel}`}
                    size="sm"
                    kind="danger--tertiary"
                    className="juce-grid-page__flow-card-action"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeFlow(flow.id)
                    }}
                  />
                )}
              </div>
            </div>

            <div className="juce-grid-page__flow-card-content">
              <JuceGridSignalCanvas
                chain={flowChain || null}
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
                onAddPlugin={handleAddPlugin}
                audioStatus={audioInterfaceStatus}
                audioOutputStatus={audioOutputStatus}
                pluginLevels={pluginLevels}
                automationSummary={signalAutomationSummary}
              />

              {isActive && isTabletTouchLayout && selectedPlugin && (
                <div className="juce-grid-page__touch-toolbar" aria-label="Selected block touch actions">
                  <div className="juce-grid-page__touch-toolbar-copy">
                    <span className="juce-grid-page__toolbar-label">Selected block</span>
                    <strong>{getDisplayPluginName(selectedPluginMeta?.name || selectedPlugin.name, selectedPlugin.uri)}</strong>
                  </div>
                  <div className="juce-grid-page__touch-toolbar-actions">
                    <Button
                      size="sm"
                      kind={effectModalOpen ? 'secondary' : 'primary'}
                      renderIcon={Edit}
                      onClick={() => {
                        openEffectModal()
                        setCompactTab('editor')
                      }}
                      disabled={effectModalOpen}
                    >
                      Open editor
                    </Button>
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={ArrowLeft}
                      onClick={() => moveSelectedPlugin('left')}
                      disabled={!canMoveSelectedPluginLeft || reorderMutation.isPending}
                    >
                      Move left
                    </Button>
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={ArrowRight}
                      onClick={() => moveSelectedPlugin('right')}
                      disabled={!canMoveSelectedPluginRight || reorderMutation.isPending}
                    >
                      Move right
                    </Button>
                    <Button
                      size="sm"
                      kind={selectedPlugin.bypassed ? 'ghost' : 'secondary'}
                      onClick={handleToggleSelectedBypass}
                    >
                      {selectedPlugin.bypassed ? 'Enable block' : 'Bypass block'}
                    </Button>
                    <Button
                      size="sm"
                      kind="danger--tertiary"
                      renderIcon={TrashCan}
                      onClick={() => handleDeletePlugin(selectedPlugin.uri, selectedPlugin.position)}
                      disabled={deleteMutation.isPending}
                    >
                      Remove block
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </article>

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
      </div>
    )
  }

  const SelectedPluginHeroIcon = getSelectedPluginHeroIcon(selectedPluginMeta, selectedPlugin)
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

  if (showViewportBlockScreen) {
    return (
      <div className="juce-grid-page__viewport-block" role="alert" aria-live="polite">
        <MapAudioGridIcon size={120} />
        <strong>This experience requires an iPad or larger display</strong>
        {showViewportRotateHint && (
          <p>Rotate your tablet or exit Split View, then reopen Audio Grid.</p>
        )}
      </div>
    )
  }

  return (
    <div className="juce-grid-page">
      <LandscapePrompt componentId="juce-grid" />
      <div className="juce-grid-page__header-shell">
        <Layer className="juce-grid-page__thin-bar">
          <div className="juce-grid-page__thin-bar-main">
            <div className="juce-grid-page__thin-bar-brand">
              <MapAudioGridIcon size={38} />
              <span className="juce-grid-page__thin-bar-title">Audio Grid</span>
            </div>
            <div className="juce-grid-page__hero-tags" aria-label="Audio Grid status">
              <Tag type={livePathLayout.status === 'available' ? 'green' : 'cool-gray'}>
                {livePathLayout.status === 'available' ? 'Live' : 'Unavailable'}
              </Tag>
              <Tag type="cool-gray">{activeRoutingMode.label}</Tag>
              <Tag type="gray">{flowCountLabel}</Tag>
              <Tag type={currentChain?.is_active ? 'green' : 'red'}>
                {currentChain?.is_active ? 'Active chain' : 'Standby chain'}
              </Tag>
              {currentChain && <Tag type="cool-gray">{currentChain.name}</Tag>}
            </div>
          </div>
          <div className="juce-grid-page__masthead-actions">
            <div className="juce-grid-page__masthead-primary-actions">
              <Button
                size="sm"
                kind="tertiary"
                renderIcon={Flow}
                onClick={() => setShowRoutingTopologyModal(true)}
              >
                Configure routing
              </Button>
              <Button size="sm" kind="secondary" onClick={addFlow} disabled={flowSlots.length >= MAX_FLOWS}>
                Add flow
              </Button>
              <Button
                size="sm"
                kind="danger--tertiary"
                onClick={() => setShowClearFlowsModal(true)}
                disabled={flowSlots.length <= 1}
              >
                Clear flows
              </Button>
              <Button size="sm" kind="primary" renderIcon={Music} onClick={() => setShowPerformModal(true)}>
                Perform
              </Button>
            </div>
            <div className="juce-grid-page__masthead-secondary-actions">
              {!isCompactLayout && (
                <>
                  <Button size="sm" kind="ghost" renderIcon={Book} onClick={() => openPlatformDocs()}>
                    Docs
                  </Button>
                  <Button size="sm" kind="ghost" onClick={() => setShowKeyboardHelp(true)}>
                    Shortcuts
                  </Button>
                  <Button size="sm" kind="ghost" renderIcon={Network_3} onClick={() => setShowAudioNodesModal(true)}>
                    Audio Nodes
                  </Button>
                </>
              )}
              {isCompactLayout && (
                <OverflowMenu
                  ariaLabel="Audio Grid secondary actions"
                  iconDescription="Audio Grid secondary actions"
                  size="sm"
                  flipped
                >
                  <OverflowMenuItem itemText="Docs" onClick={() => openPlatformDocs()} />
                  <OverflowMenuItem itemText="Shortcuts" onClick={() => setShowKeyboardHelp(true)} />
                  <OverflowMenuItem itemText="Audio Nodes" onClick={() => setShowAudioNodesModal(true)} />
                </OverflowMenu>
              )}
            </div>
          </div>
        </Layer>
      </div>

      {isCompactLayout && (
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

      <div className="juce-grid-page__unified-block">
        {/* Main content area */}
        <div className="juce-grid-page__workspace">
          <main className="juce-grid-page__main">
          {/* Multi-flow signal grids */}
          <section className="juce-grid-page__slot-grid" aria-label="Signal flows">
            {livePathLayout.groups.map((group, groupIndex) => (
              <Layer
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
              </Layer>
            ))}
          </section>

          </main>
        </div>
      </div>

      {isCompactLayout && (
        <div className="juce-grid-page__compact-shell">
          <section className="juce-grid-page__compact-panel">
            {compactTab === 'grid' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
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
                  <h2>Editor</h2>
                  <p>{selectedPlugin ? 'The selected block editor opens in the bottom panel below the workspace.' : 'Select a block in the grid to open its editor.'}</p>
                </div>
                <Tile className="juce-grid-page__effect-modal-placeholder">
                  <div className="juce-grid-page__parameter-editor-copy">
                    <strong>{selectedPlugin ? 'Selected block ready' : 'No block selected'}</strong>
                    <p>
                      {selectedPlugin
                        ? 'Use the flow card selection to reopen the bottom editor panel.'
                        : 'Tap a processor in the grid to open the bottom editor panel.'}
                    </p>
                  </div>
                  {selectedPlugin && (
                    <Button size="sm" kind="secondary" onClick={openEffectModal}>
                      Reopen editor panel
                    </Button>
                  )}
                </Tile>
              </Layer>
            )}

            {compactTab === 'routing' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <h2>Routing topology</h2>
                  <p>Configure how Chains and Flows are routed in reference to one another.</p>
                </div>
                <div className="juce-grid-page__toolbar-buttons">
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Flow}
                    onClick={() => setShowRoutingTopologyModal(true)}
                  >
                    Configure routing
                  </Button>
                </div>
                <div className="juce-grid-page__compact-tags" style={{ marginTop: '0.75rem' }}>
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
                  <h2>Presets</h2>
                  <p>Preset save/load/import and selected-chain controls now live in the Chains card above.</p>
                </div>
              </Layer>
            )}
          </section>
        </div>
      )}

      {effectModalOpen && selectedPlugin && (
        <section
          ref={bottomEditorRef}
          className={`juce-grid-page__bottom-editor-shell ${isTabletTouchLayout ? 'is-touch-mode' : ''}`}
          aria-label="Block parameter editor"
          onTouchStart={handleBottomEditorTouchStart}
          onTouchEnd={handleBottomEditorTouchEnd}
          onTouchCancel={() => {
            bottomEditorTouchStartYRef.current = null
          }}
        >
          <Layer className={`juce-grid-page__bottom-editor-panel ${isTabletTouchLayout ? 'is-touch-mode' : ''}`}>
            <div className="juce-grid-page__bottom-editor-header">
              <div className="juce-grid-page__bottom-editor-identity">
                <div
                  className={`juce-grid-page__bottom-editor-icon ${selectedPlugin.bypassed ? 'is-bypassed' : ''}`}
                  aria-hidden
                  style={{ '--juce-grid-editor-accent': getCategoryConfig(selectedPluginMeta?.category || 'Utility').color } as CSSProperties}
                >
                  <SelectedPluginHeroIcon width={32} height={32} />
                </div>
                <div className="juce-grid-page__bottom-editor-copy">
                  <div className="juce-grid-page__bottom-editor-tags">
                    {selectedPluginMeta?.category && <Tag type="cool-gray">{selectedPluginMeta.category}</Tag>}
                    {selectedPluginMeta?.format && <Tag type="blue">{selectedPluginMeta.format}</Tag>}
                    <Tag type={selectedPlugin.bypassed ? 'red' : 'green'}>{selectedPlugin.bypassed ? 'Bypassed' : 'Active'}</Tag>
                  </div>
                  <strong>{getDisplayPluginName(selectedPluginMeta?.name || selectedPlugin.name, selectedPlugin.uri)}</strong>
                  <p>
                    {selectedPluginMeta?.parameters?.length ?? 0} parameter{(selectedPluginMeta?.parameters?.length ?? 0) === 1 ? '' : 's'}
                    {' '}
                    {isTabletTouchLayout
                      ? 'with swipe-down dismiss and touch-first smart controls.'
                      : 'organized in always-visible Carbon groups.'}
                  </p>
                </div>
              </div>
              <div className="juce-grid-page__bottom-editor-actions">
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={ArrowLeft}
                  onClick={() => moveSelectedPlugin('left')}
                  disabled={!canMoveSelectedPluginLeft || reorderMutation.isPending}
                >
                  Move left
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={ArrowRight}
                  onClick={() => moveSelectedPlugin('right')}
                  disabled={!canMoveSelectedPluginRight || reorderMutation.isPending}
                >
                  Move right
                </Button>
                <Button size="sm" kind={selectedPlugin.bypassed ? 'ghost' : 'secondary'} onClick={handleToggleSelectedBypass}>
                  {selectedPlugin.bypassed ? 'Enable block' : 'Bypass block'}
                </Button>
                <Button size="sm" kind="ghost" renderIcon={Close} onClick={handleCloseEffectModal}>
                  Close editor
                </Button>
              </div>
            </div>

            <div className="juce-grid-page__bottom-editor-body">
              {selectedPluginCard
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
                  compact={isTabletTouchLayout}
                  forceTemplate={selectedPluginCardStrategy.renderMode === 'template' ? selectedPluginCardStrategy.template : undefined}
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
                />
              )}
            </div>
          </Layer>
        </section>
      )}

      <div className="juce-grid-page__floating-actions" aria-label="Audio Grid floating actions">
        {renderSnapshotsTrigger()}
        {renderMidiTrigger()}
      </div>

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
          modalLabel={currentChain?.name || chains.find((c) => c.id === renameChainForId)?.name || 'Current chain'}
          primaryButtonText={renameMutation.isPending ? 'Saving...' : 'Rename chain'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={(!currentChain && !renameChainForId) || renameChainName.trim().length === 0 || renameMutation.isPending}
          onRequestClose={() => {
            setShowRenameChainModal(false)
            setRenameChainName('')
            setRenameChainForId(null)
          }}
          onSecondarySubmit={() => {
            setShowRenameChainModal(false)
            setRenameChainName('')
            setRenameChainForId(null)
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
              Delete <strong>{presetPendingDelete.name}</strong> from the preset library. This action cannot be undone.
            </p>
          </div>
        </Modal>
      )}

      {showClearFlowsModal && (
        <Modal
          open
          size="sm"
          modalHeading="Clear flows"
          modalLabel="Audio Grid workspace"
          primaryButtonText="Clear flows"
          secondaryButtonText="Cancel"
          onRequestClose={() => setShowClearFlowsModal(false)}
          onSecondarySubmit={() => setShowClearFlowsModal(false)}
          onRequestSubmit={confirmClearFlows}
          danger
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Reset the workspace to a single empty flow and discard the current multi-flow layout state.
            </p>
          </div>
        </Modal>
      )}
      <SnapshotModal
        open={snapshotsModalOpen}
        onClose={() => setSnapshotsModalOpen(false)}
        snapshotDraft={currentSnapshotDraft}
        applySnapshotData={applySnapshotState}
        onSnapshotSave={clearSnapshotsDirty}
      />
      {midiModalOpen && (
        <div className="platform-modal-overlay" role="dialog" aria-modal="true" aria-label="Audio Grid MIDI mappings" id="juce-grid-midi-modal">
          <div className="platform-modal__body" style={{ position: 'relative' }}>
            <div className="platform-modal__header">
              <span className="platform-modal__header-title">Audio Grid · MIDI Mappings</span>
              <button
                type="button"
                className="platform-modal__close"
                onClick={() => { setMidiModalOpen(false); setShowExpressionOverlay(false) }}
                aria-label="Close MIDI mappings"
              >
                <Close size={20} aria-hidden />
              </button>
            </div>
            <div className="platform-modal__scroll">
              {renderMidiMappingsWorkspace({ closable: false })}
            </div>
            {showExpressionOverlay && (
              <ExpressionOverlay
                onBack={() => setShowExpressionOverlay(false)}
                highlightedCcPairs={midiMappings.map((m): CcChannelPair => ({ cc: m.cc, channel: m.channel }))}
                initialCc={midiMappings[0]?.cc ?? null}
                initialChannel={midiMappings[0]?.channel ?? null}
                onAssignmentMutated={() => {}}
              />
            )}
          </div>
        </div>
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
                <div key={row.label} className="juce-grid-page__routing-inspector-row" role="listitem">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
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
              <div className="juce-grid-page__browser-categories">
                {categories.map((category) => {
                  return (
                    <Button
                      key={category}
                      size="sm"
                      kind={selectedCategory === category ? 'secondary' : 'ghost'}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category === 'all' ? 'All plugins' : category}
                    </Button>
                  )
                })}
              </div>

              <div className="juce-grid-page__browser-meta">
                <div className="juce-grid-page__compact-tags">
                  <Tag type="cool-gray">{nativeProcessors.length} native</Tag>
                  <Tag type="cool-gray">{lv2Plugins.length} LV2</Tag>
                  <Tag type="cool-gray">{favoriteVisibleCount} favorites</Tag>
                  {!currentChain && <Tag type="warm-gray">No active chain</Tag>}
                </div>
                <div className="juce-grid-page__compact-actions">
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
              {nativeProcessors.length > 0 && (
                <section className="juce-grid-page__browser-section">
                  <div className="juce-grid-page__browser-section-header">
                    <div className="juce-grid-page__browser-section-title">
                      <Meter size={16} />
                      <span>Core integrated</span>
                    </div>
                    <div className="juce-grid-page__compact-tags">
                      <Tag type="green">Zero latency</Tag>
                      <Tag type="cool-gray">{nativeProcessors.length} plugins</Tag>
                    </div>
                  </div>
                  <div className="juce-grid-page__browser-native-grid">
                    {nativeProcessors.map((plugin) => {
                      const catConfig = getCategoryConfig(plugin.category)
                      const displayName = getDisplayPluginName(plugin.name, plugin.uri)
                      return (
                        <Tile
                          key={plugin.uri}
                          className="juce-grid-page__browser-plugin-tile juce-grid-page__browser-plugin-tile--native"
                          style={{ '--browser-accent': catConfig.color } as React.CSSProperties}
                        >
                          <div className="juce-grid-page__browser-plugin-header">
                            <div>
                              <h3>{displayName}</h3>
                              <p>{sanitizeRestrictedDisplayText(plugin.author) || 'Integrated JUCE processor'}</p>
                            </div>
                            <Tag type="blue">{plugin.category}</Tag>
                          </div>
                          <div className="juce-grid-page__compact-actions">
                            <Button
                              size="sm"
                              kind="primary"
                              onClick={() => handleAddPluginToCurrentChain(plugin.uri)}
                              disabled={!currentChain}
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
                      <span>LV2 plugin library</span>
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
                                    <div>
                                      <h3>{getDisplayPluginName(plugin.name, plugin.uri)}</h3>
                                      <p>{plugin.author ? sanitizeRestrictedDisplayText(plugin.author) : 'No author metadata'}</p>
                                    </div>
                                    {isFavorite && <Tag type="blue">Favorite</Tag>}
                                  </div>
                                  <div className="juce-grid-page__compact-tags">
                                    <Tag type="cool-gray">{plugin.category}</Tag>
                                    <Tag type="warm-gray">{plugin.format || 'LV2'}</Tag>
                                  </div>
                                  <div className="juce-grid-page__compact-actions">
                                    <Button
                                      size="sm"
                                      kind="primary"
                                      onClick={() => handleAddPluginToCurrentChain(plugin.uri)}
                                      disabled={!currentChain}
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
                        <div>
                          <h3>{preset.name}</h3>
                          <p>{preset.description || 'Saved chain preset ready for instant recall.'}</p>
                        </div>
                        <div className="juce-grid-page__compact-tags">
                          {preset.category && <Tag type="cool-gray">{preset.category}</Tag>}
                          {preset.is_favorite && <Tag type="blue">Favorite</Tag>}
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
          modalLabel={selectedFlowForAssignment.chainId ? `Chain ${selectedFlowForAssignment.chainId}` : 'No chain assigned'}
          primaryButtonText={isAssigningFlow ? 'Assigning...' : 'Assign flow'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={!selectedFlowForAssignment.chainId || !assignmentSelectedNodeId || isAssigningFlow}
          onRequestClose={closeAssignmentDialog}
          onSecondarySubmit={closeAssignmentDialog}
          onRequestSubmit={() => handleAssignFlow(assignmentSelectedNodeId, assignmentRedundancyEnabled)}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Select a target node for the active flow. Recommendations favor headroom and GPU compatibility when the chain analysis requires it.
            </p>

            {!selectedFlowForAssignment.chainId && (
              <p className="juce-grid-page__modal-copy">
                Assign a chain to this flow before deploying it to a cluster node.
              </p>
            )}

            {assignmentAnalysisQuery.isLoading && (
              <InlineLoading description="Analyzing chain requirements" status="active" />
            )}

            {recommendedAssignmentNodes.length > 0 && (
              <div className="juce-grid-page__assignment-recommended">
                <span className="juce-grid-page__toolbar-label">Recommended</span>
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
                      <strong>{node.hostname}</strong>
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
                <span className="juce-grid-page__toolbar-label">Chain requirements</span>
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
                <h3>{section.title}</h3>
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
                      <h3>{getDisplayPluginName(plugin.name, plugin.uri)}</h3>
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
        <div className="juce-grid-page__automation-panel">
          {renderAutomationWorkspace({ compact: isCompactLayout })}
        </div>
      )}

      {/* Unified Audio Port Selector — per-flow or global */}
      <JuceGridAudioPortModal
        open={portSelectorFlowIndex !== null}
        onClose={() => setPortSelectorFlowIndex(null)}
        chainId={portSelectorFlowIndex !== null ? flowSlots[portSelectorFlowIndex]?.chainId : null}
        flowLabel={portSelectorFlowIndex !== null ? (SLOT_COLORS[portSelectorFlowIndex]?.label || '') : undefined}
        flowColor={portSelectorFlowIndex !== null ? (SLOT_COLORS[portSelectorFlowIndex]?.color || '#2563eb') : undefined}
        onPortsChange={() => {
          queryClient.invalidateQueries({ queryKey: ['audio', 'routing'] })
          const label = portSelectorFlowIndex !== null ? SLOT_COLORS[portSelectorFlowIndex]?.label : ''
          pushToast(`Flow ${label} port routing updated`, 'success')
        }}
      />

      {/* Footer Status Bar */}
      <footer className="juce-grid-page__footer">
        <button
          type="button"
          className={`juce-grid-page__automation-footer-toggle ${automationTimelineExpanded ? 'is-expanded' : ''}`}
          onClick={() => setAutomationTimelineExpanded((previous) => !previous)}
          aria-expanded={automationTimelineExpanded}
        >
          <div className="juce-grid-page__automation-footer-copy">
            <strong>Automation</strong>
            <span>
              {automationRecording
                ? 'Recording'
                : automationPlaying
                  ? 'Playing'
                  : automationLanes.length > 0
                    ? 'Ready'
                    : 'Idle'}
            </span>
          </div>
          <div className="juce-grid-page__automation-footer-meta">
            <span>{formatAutomationTime(automationCurrentTime)} / {formatAutomationTime(automationDuration)}</span>
            <span>{automationLanes.length} lanes</span>
            {automationLoopEnabled && <span>Loop</span>}
            {armedAutomationLane && <span>Armed {armedAutomationLane.parameterName}</span>}
          </div>
          <ChevronRight size={16} className={`juce-grid-page__automation-footer-chevron ${automationTimelineExpanded ? 'is-open' : ''}`} />
        </button>

        <div
          className={`juce-grid-page__status-chip ${cpuStatus}`}
          title={`CPU: ${cpuMetrics.totalCpuPercent.toFixed(1)}%`}
        >
          <Meter size={14} />
          <span>CPU {cpuMetrics.totalCpuPercent.toFixed(0)}%</span>
        </div>

        {jackMetrics && (
          <div
            className="juce-grid-page__status-chip"
            title={`Buffer: ${jackMetrics.buffer_size} @ ${jackMetrics.sample_rate}Hz`}
          >
            <Timer size={14} />
            <span>{((jackMetrics.buffer_size / jackMetrics.sample_rate) * 1000).toFixed(1)}ms</span>
          </div>
        )}

        {hasXruns && (
          <div className="juce-grid-page__status-chip juce-grid-page__status-chip--warning" title={`${cpuMetrics.xrunCount} XRuns`}>
            <WarningAlt size={14} />
            <span>{cpuMetrics.xrunCount} xruns</span>
          </div>
        )}

        <div className="juce-grid-page__status-chip">
          <Flow size={14} />
          <span>{flowSlots.length} flows</span>
        </div>
      </footer>

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
      <AudioNodesModal
        open={showAudioNodesModal}
        onClose={() => setShowAudioNodesModal(false)}
      />

      {/* Routing Topology Modal */}
      <RoutingTopologyModal
        open={showRoutingTopologyModal}
        onClose={() => setShowRoutingTopologyModal(false)}
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

      {/* Chain Assignment Modal — auto-opens for unassigned flows; manual via Edit button */}
      <ChainAssignmentModal
        open={chainModalFlowId !== null}
        flowLabel={chainModalFlow?.label ?? ''}
        currentChainId={chainModalFlow?.chainId ?? null}
        flowSlots={flowSlots}
        pluginMeta={pluginMeta}
        onApply={(chainId) => {
          if (chainModalFlowId) {
            updateFlow(chainModalFlowId, { chainId })
          }
        }}
        onClose={() => setChainModalFlowId(null)}
        onSelectedChainRemoved={handleChainRemoved}
        onPluginChipClick={(chainId, pluginUri, pluginPosition) => {
          if (chainModalFlowId) {
            updateFlow(chainModalFlowId, { chainId })
          }
          setChainModalFlowId(null)
          handlePluginSelect(pluginUri, pluginPosition)
        }}
        onToggleActive={handleModalToggleActive}
        onDuplicate={handleModalDuplicate}
        onRename={handleModalRename}
      />
    </div>
  )
}

export default JuceGridPage
