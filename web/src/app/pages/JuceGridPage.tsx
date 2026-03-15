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

import { useState, useCallback, useMemo, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Add,
  Branch,
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Draggable,
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
  SideNav,
  SideNavFooter,
  SideNavItems,
  Tab,
  TabList,
  Tabs,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useIsMobile } from '../hooks/useIsMobile'
import { getCategoryConfig } from '../grid/shared'
import type { MidiMapping, AutomationLane } from '../grid/shared'
import { chainsApi, pluginsApi, historyApi, audioApi, metricsApi, flowSnapshotsApi, type AudioAvbEndpoint, type AudioPort } from '../../map2/api'
import { useToasts } from '../components/Toasts'
import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { usePluginOutputs } from '../hooks/usePluginOutputs'
import { useFlowSnapshots } from '../hooks/useFlowSnapshots'
import MidiLearnButton from '../../map2/components/MIDI/MidiLearnButton'
import { PluginDetailsModal } from '../components/PluginDetailsModal'
import { NumberInput } from '../components/Controls/NumberInput'
import { MapAudioGridIcon } from '../components/icons/map'
import { SnapshotImportDialog } from '../components/snapshots/SnapshotImportDialog'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'
import type { Chain, Plugin, HistoryStatus, FlowSnapshot, FlowSnapshotData, FlowSnapshotDetail, ChainSnapshot, ChainsResponse, Snapshot } from '../../map2/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import { sortPluginsForBrowser } from '../utils/pluginBrowserSort'
import { JuceGridAudioPortModal } from './JuceGridAudioPortModal'
import { JuceGridChainManagementCard } from './JuceGridChainManagementCard'
import { JuceGridClusterPanel, JuceGridFlowAssignmentPanel } from './JuceGridClusterPanels'
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
import {
  buildSnapshotComparisonSummary,
  checkSnapshotMorphCompatibility,
  fingerprintSnapshotData,
  interpolateSnapshotData,
  type SnapshotComparisonSummary,
} from './juceGridSnapshots'
import './JuceGridPage.css'

const API_BASE = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port
  if (isLocalhost) return '/api'
  if (port === '' || port === '80' || port === '8080') return '/api'
  return `http://${window.location.hostname}:8080/api`
})()

function isTabletViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.innerWidth > 768 && window.innerWidth <= 1184
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

function formatInspectorList(values: string[]): string {
  if (values.length === 0) {
    return 'None'
  }
  return values.join(', ')
}

function JuceGridHeroMark() {
  return <MapAudioGridIcon className="juce-grid-page__hero-mark-svg" size={192} />
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
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

type CompactRailPanelId = 'snapshots' | 'midi' | null

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

// ============================================================================
// Main Component
// ============================================================================

export function JuceGridPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const isMobile = useIsMobile()
  const [isTablet, setIsTablet] = useState<boolean>(() => isTabletViewport())
  const [compactTab, setCompactTab] = useState<CompactTabId>('grid')
  const [compactRailPanel, setCompactRailPanel] = useState<CompactRailPanelId>(null)

  useEffect(() => {
    const handleResize = () => setIsTablet(isTabletViewport())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isCompactLayout = isMobile || isTablet

  const initialPersistedStateRef = useRef<ReturnType<typeof loadInitialJuceGridState> | null>(null)
  const initialPersistedState = initialPersistedStateRef.current
    ?? (initialPersistedStateRef.current = loadInitialJuceGridState())

  // Flow slots state (with migration support)
  const [flowSlots, setFlowSlots] = useState<FlowSlot[]>(initialPersistedState.flowSlots)

  // Routing state
  const [routing, setRouting] = useState<RoutingConfig>(initialPersistedState.routing)

  // Active flow index
  const [activeFlowIndex, setActiveFlowIndex] = useState(initialPersistedState.activeFlowIndex)

  // UI State
  const [selectedPluginUri, setSelectedPluginUri] = useState<string | null>(null)
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
  const [isRefreshingPlugins, setIsRefreshingPlugins] = useState(false)

  // Enhanced UI State
  const [detailsPlugin, setDetailsPlugin] = useState<Plugin | null>(null)
  const [favoritePlugins, setFavoritePlugins] = useState<Set<string>>(new Set())
  const [pluginLevels, setPluginLevels] = useState<Record<string, { in: number; out: number }>>({})
  const [wetDryMixes, setWetDryMixes] = useState<Record<string, number>>({})
  const [draggedPluginUri, setDraggedPluginUri] = useState<string | null>(null)
  const [dragOverPluginUri, setDragOverPluginUri] = useState<string | null>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  
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

  // MIDI Mappings Panel State
  const [midiMappings, setMidiMappings] = useState<MidiMapping[]>([])

  // Automation Timeline State
  const [automationTimelineExpanded, setAutomationTimelineExpanded] = useState(false)

  // Flow Snapshots Panel State
  const [snapshotsPanelExpanded, setSnapshotsPanelExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('map2_juce_grid_snapshots_panel')
        ?? localStorage.getItem('map2_grid_snapshots_panel')
      return saved !== null ? saved === 'true' : true // Default to expanded
    } catch { return true }
  })
  const [showSnapshotCreateModal, setShowSnapshotCreateModal] = useState(false)
  const [newSnapshotName, setNewSnapshotName] = useState('')
  const [snapshotPendingRename, setSnapshotPendingRename] = useState<FlowSnapshot | null>(null)
  const [snapshotRenameValue, setSnapshotRenameValue] = useState('')
  const [snapshotPendingDelete, setSnapshotPendingDelete] = useState<FlowSnapshot | null>(null)
  const [snapshotPendingProgram, setSnapshotPendingProgram] = useState<FlowSnapshot | null>(null)
  const [snapshotProgramValue, setSnapshotProgramValue] = useState('')
  const [draggedSnapshotId, setDraggedSnapshotId] = useState<number | null>(null)
  const [dragOverSnapshotId, setDragOverSnapshotId] = useState<number | null>(null)
  const [snapshotCompareTargetId, setSnapshotCompareTargetId] = useState<number | null>(null)
  const [momentarySnapshotId, setMomentarySnapshotId] = useState<number | null>(null)
  const [snapshotMorphTarget, setSnapshotMorphTarget] = useState<FlowSnapshot | null>(null)
  const [snapshotMorphDurationMs, setSnapshotMorphDurationMs] = useState(1200)
  const [snapshotMorphRunning, setSnapshotMorphRunning] = useState(false)
  const [snapshotLibraryExpanded, setSnapshotLibraryExpanded] = useState(false)
  const [midiRailExpanded, setMidiRailExpanded] = useState(false)
  const [midiPanelExpanded, setMidiPanelExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('map2_juce_grid_midi_panel')
      return saved !== null ? saved === 'true' : true // Default to expanded
    } catch { return true }
  })
  const [routingInspectorId, setRoutingInspectorId] = useState<JuceGridRoutingMarkerId | null>(null)
  const momentaryRestoreStateRef = useRef<FlowSnapshotData | null>(null)
  const [automationPlaying, setAutomationPlaying] = useState(false)
  const [automationRecording, setAutomationRecording] = useState(false)
  const [automationLoopEnabled, setAutomationLoopEnabled] = useState(false)
  const [automationCurrentTime, setAutomationCurrentTime] = useState(0)
  const [automationDuration, setAutomationDuration] = useState(60)
  const [automationLanes, setAutomationLanes] = useState<AutomationLane[]>([])
  const [lanePickerOpen, setLanePickerOpen] = useState(false)

  // Audio Port Selection State — unified per-flow selector
  const [portSelectorFlowIndex, setPortSelectorFlowIndex] = useState<number | null>(null)

  // ============================================================================
  // Toolbar Enhancement State
  // ============================================================================

  // Preset Import Dialog
  const [showImportDialog, setShowImportDialog] = useState(false)

  // MIDI Learn Feedback
  const [lastMidiEvent, setLastMidiEvent] = useState<{ cc: number; value: number } | null>(null)

  // Toolbar Customization
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('map2_juce_grid_toolbar_collapsed') === 'true'
    } catch {
      return false
    }
  })

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

  // Persist toolbar collapsed state
  useEffect(() => {
    try {
      localStorage.setItem('map2_juce_grid_toolbar_collapsed', String(toolbarCollapsed))
    } catch {}
  }, [toolbarCollapsed])

  // Persist snapshots panel state
  useEffect(() => {
    try {
      localStorage.setItem('map2_juce_grid_snapshots_panel', String(snapshotsPanelExpanded))
    } catch {}
  }, [snapshotsPanelExpanded])

  // Persist midi panel state
  useEffect(() => {
    try {
      localStorage.setItem('map2_juce_grid_midi_panel', String(midiPanelExpanded))
    } catch {}
  }, [midiPanelExpanded])

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

  const flowSnapshotsQuery = useQuery<{
    snapshots: FlowSnapshot[]
    count: number
    active_id: number | null
  }>({
    queryKey: ['flow-snapshots'],
    queryFn: () => flowSnapshotsApi.list(),
    refetchInterval: 5000,
  })

  const activeSnapshotId = flowSnapshotsQuery.data?.active_id ?? null

  const activeSnapshotDetailQuery = useQuery<FlowSnapshotDetail>({
    queryKey: ['flow-snapshots', 'detail', activeSnapshotId],
    queryFn: () => flowSnapshotsApi.get(activeSnapshotId as number),
    enabled: activeSnapshotId !== null,
  })

  const snapshotCompareDetailQuery = useQuery<FlowSnapshotDetail>({
    queryKey: ['flow-snapshots', 'compare-detail', snapshotCompareTargetId],
    queryFn: () => flowSnapshotsApi.get(snapshotCompareTargetId as number),
    enabled: snapshotCompareTargetId !== null,
  })

  // Fetch audio status
  const audioQuery = useQuery({
    queryKey: ['audio', 'status'],
    queryFn: () => audioApi.getStatus(),
    refetchInterval: 5000,
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

        pushToast(`Loaded: ${event.snapshot_name} (MIDI PC#${event.program_number})`, 'success')
      }
    }, [queryClient, pushToast]),
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
  const flowSnapshots = useMemo(() => {
    const raw = flowSnapshotsQuery.data?.snapshots || []
    return [...raw].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1
      if (!a.is_favorite && b.is_favorite) return 1
      return a.display_order - b.display_order
    })
  }, [flowSnapshotsQuery.data?.snapshots])
  const activeSnapshot = useMemo(
    () => flowSnapshots.find((snapshot) => snapshot.id === activeSnapshotId || snapshot.is_active) ?? null,
    [activeSnapshotId, flowSnapshots],
  )
  const favoriteSnapshots = useMemo(
    () => flowSnapshots.filter((snapshot) => snapshot.is_favorite),
    [flowSnapshots],
  )
  const librarySnapshots = useMemo(
    () => flowSnapshots.filter((snapshot) => !snapshot.is_favorite),
    [flowSnapshots],
  )
  const armedAutomationLane = useMemo(
    () => automationLanes.find((lane) => lane.armed) ?? null,
    [automationLanes],
  )
  const audioStatus = audioQuery.data
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
  const activeSnapshotFingerprint = useMemo(
    () => activeSnapshotDetailQuery.data?.snapshot_data
      ? fingerprintSnapshotData(activeSnapshotDetailQuery.data.snapshot_data)
      : null,
    [activeSnapshotDetailQuery.data?.snapshot_data],
  )
  const activeSnapshotNeedsUpdate = useMemo(
    () => Boolean(activeSnapshot && activeSnapshotFingerprint && activeSnapshotFingerprint !== currentSnapshotFingerprint),
    [activeSnapshot, activeSnapshotFingerprint, currentSnapshotFingerprint],
  )
  const compareTargetSnapshot = useMemo(
    () => flowSnapshots.find((snapshot) => snapshot.id === snapshotCompareTargetId) ?? null,
    [flowSnapshots, snapshotCompareTargetId],
  )
  const snapshotComparisonSummary = useMemo(() => {
    if (!snapshotCompareDetailQuery.data?.snapshot_data) {
      return null
    }
    const baseData = activeSnapshotDetailQuery.data?.snapshot_data ?? currentSnapshotDraft
    return buildSnapshotComparisonSummary(baseData, snapshotCompareDetailQuery.data.snapshot_data)
  }, [activeSnapshotDetailQuery.data?.snapshot_data, currentSnapshotDraft, snapshotCompareDetailQuery.data?.snapshot_data])

  const applySnapshotState = useCallback((
    data: FlowSnapshotData,
    options?: { toastMessage?: string | null; invalidateChains?: boolean },
  ) => {
    console.log('[Snapshot Load] Received data:', JSON.stringify({
      flowSlotsCount: data.flowSlots?.length,
      flowSlots: data.flowSlots,
      routing: data.routing,
      activeFlowIndex: data.activeFlowIndex,
      chainsCount: Object.keys(data.chains || {}).length,
    }, null, 2))

    const normalizedSnapshotState = normalizeRuntimeGridState(
      data.flowSlots,
      data.routing,
      data.activeFlowIndex,
    )
    console.log('[Snapshot Load] Setting flowSlots:', normalizedSnapshotState.flowSlots)
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

  // Flow Snapshots: Handle snapshot loaded (from UI or MIDI PC)
  // Note: The backend applies plugin parameters and bypass states directly to the engine.
  const handleSnapshotLoaded = useCallback((data: FlowSnapshotData) => {
    applySnapshotState(data, { toastMessage: 'Snapshot recalled', invalidateChains: true })
  }, [applySnapshotState])

  const createFlowSnapshotMutation = useMutation({
    mutationFn: flowSnapshotsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot saved', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to save snapshot', 'error')
    },
  })

  const loadFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.load(snapshotId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      handleSnapshotLoaded(data.snapshot_data)
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to recall snapshot', 'error')
    },
  })

  const updateFlowSnapshotMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Parameters<typeof flowSnapshotsApi.update>[1] }) =>
      flowSnapshotsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  const refreshActiveSnapshotMutation = useMutation({
    mutationFn: ({ id, snapshotData }: { id: number; snapshotData: FlowSnapshotData }) =>
      flowSnapshotsApi.update(id, { snapshot_data: snapshotData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  const deleteFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.delete(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot deleted', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to delete snapshot', 'error')
    },
  })

  const duplicateFlowSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.duplicate(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot duplicated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to duplicate snapshot', 'error')
    },
  })

  const setFlowSnapshotProgramMutation = useMutation({
    mutationFn: ({ id, programNumber }: { id: number; programNumber: number | null }) =>
      flowSnapshotsApi.setProgram(id, programNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot MIDI program updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot MIDI program', 'error')
    },
  })

  const reorderFlowSnapshotsMutation = useMutation({
    mutationFn: (snapshotIds: number[]) => flowSnapshotsApi.reorder(snapshotIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to reorder flow snapshots', 'error')
    },
  })

  const openSnapshotCreateModal = useCallback(() => {
    setNewSnapshotName(`Snapshot ${flowSnapshots.length + 1}`)
    setShowSnapshotCreateModal(true)
  }, [flowSnapshots.length])

  const submitSnapshotCreate = useCallback(() => {
    const name = newSnapshotName.trim()
    if (!name) {
      return
    }
    createFlowSnapshotMutation.mutate({
      name,
      description: 'Saved from Audio Grid',
      snapshot_data: captureCurrentState(),
    })
    setShowSnapshotCreateModal(false)
    setNewSnapshotName('')
  }, [captureCurrentState, createFlowSnapshotMutation, newSnapshotName])

  const openSnapshotRenameModal = useCallback((snapshot: FlowSnapshot) => {
    setSnapshotPendingRename(snapshot)
    setSnapshotRenameValue(snapshot.name)
  }, [])

  const submitSnapshotRename = useCallback(() => {
    if (!snapshotPendingRename) {
      return
    }
    const name = snapshotRenameValue.trim()
    if (!name) {
      return
    }
    updateFlowSnapshotMutation.mutate({
      id: snapshotPendingRename.id,
      updates: { name },
    })
    setSnapshotPendingRename(null)
    setSnapshotRenameValue('')
  }, [snapshotPendingRename, snapshotRenameValue, updateFlowSnapshotMutation])

  const requestSnapshotDelete = useCallback((snapshot: FlowSnapshot) => {
    setSnapshotPendingDelete(snapshot)
  }, [])

  const submitSnapshotDelete = useCallback(() => {
    if (!snapshotPendingDelete) {
      return
    }
    deleteFlowSnapshotMutation.mutate(snapshotPendingDelete.id)
    setSnapshotPendingDelete(null)
  }, [deleteFlowSnapshotMutation, snapshotPendingDelete])

  const openSnapshotProgramModal = useCallback((snapshot: FlowSnapshot) => {
    setSnapshotPendingProgram(snapshot)
    setSnapshotProgramValue(snapshot.program_number?.toString() || '')
  }, [])

  const closeSnapshotProgramModal = useCallback(() => {
    setSnapshotPendingProgram(null)
    setSnapshotProgramValue('')
  }, [])

  const submitSnapshotProgram = useCallback(() => {
    if (!snapshotPendingProgram) {
      return
    }
    const trimmed = snapshotProgramValue.trim()
    const programNumber = trimmed === '' ? null : Number.parseInt(trimmed, 10)
    if (programNumber !== null && (Number.isNaN(programNumber) || programNumber < 0 || programNumber > 127)) {
      pushToast('MIDI Program Change must be between 0 and 127', 'error')
      return
    }
    setFlowSnapshotProgramMutation.mutate({
      id: snapshotPendingProgram.id,
      programNumber,
    })
    closeSnapshotProgramModal()
  }, [closeSnapshotProgramModal, pushToast, setFlowSnapshotProgramMutation, snapshotPendingProgram, snapshotProgramValue])

  const clearSnapshotProgram = useCallback((snapshot: FlowSnapshot) => {
    setFlowSnapshotProgramMutation.mutate({ id: snapshot.id, programNumber: null })
  }, [setFlowSnapshotProgramMutation])

  const handleSnapshotFavoriteToggle = useCallback((snapshot: FlowSnapshot) => {
    updateFlowSnapshotMutation.mutate({
      id: snapshot.id,
      updates: { is_favorite: !snapshot.is_favorite },
    })
  }, [updateFlowSnapshotMutation])

  const handleSnapshotDuplicate = useCallback((snapshot: FlowSnapshot) => {
    duplicateFlowSnapshotMutation.mutate(snapshot.id)
  }, [duplicateFlowSnapshotMutation])

  const handleActiveSnapshotRefresh = useCallback(() => {
    if (!activeSnapshot) {
      return
    }
    refreshActiveSnapshotMutation.mutate({
      id: activeSnapshot.id,
      snapshotData: currentSnapshotDraft,
    })
  }, [activeSnapshot, currentSnapshotDraft, refreshActiveSnapshotMutation])

  const fetchSnapshotDetail = useCallback((snapshotId: number) => (
    queryClient.fetchQuery({
      queryKey: ['flow-snapshots', 'detail', snapshotId],
      queryFn: () => flowSnapshotsApi.get(snapshotId),
    })
  ), [queryClient])

  const previewSnapshotData = useCallback(async (snapshotData: FlowSnapshotData) => {
    const result = await flowSnapshotsApi.preview({ snapshot_data: snapshotData })
    applySnapshotState(result.snapshot_data, { toastMessage: null, invalidateChains: false })
    return result.snapshot_data
  }, [applySnapshotState])

  const toggleSnapshotCompare = useCallback((snapshot: FlowSnapshot) => {
    setSnapshotCompareTargetId((current) => current === snapshot.id ? null : snapshot.id)
  }, [])

  const startMomentaryPreview = useCallback(async (snapshot: FlowSnapshot) => {
    if (momentarySnapshotId !== null || snapshotMorphRunning) {
      return
    }

    try {
      const detail = await fetchSnapshotDetail(snapshot.id)
      momentaryRestoreStateRef.current = currentSnapshotDraft
      setMomentarySnapshotId(snapshot.id)
      await previewSnapshotData(detail.snapshot_data)
    } catch (error) {
      momentaryRestoreStateRef.current = null
      setMomentarySnapshotId(null)
      pushToast(error instanceof Error ? error.message : 'Failed to preview snapshot', 'error')
    }
  }, [currentSnapshotDraft, fetchSnapshotDetail, momentarySnapshotId, previewSnapshotData, pushToast, snapshotMorphRunning])

  const endMomentaryPreview = useCallback(async () => {
    if (momentarySnapshotId === null) {
      return
    }

    const restoreState = momentaryRestoreStateRef.current
    momentaryRestoreStateRef.current = null
    setMomentarySnapshotId(null)
    if (!restoreState) {
      return
    }

    try {
      await previewSnapshotData(restoreState)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to restore the current snapshot preview', 'error')
    }
  }, [momentarySnapshotId, previewSnapshotData, pushToast])

  const handleSnapshotMorphStart = useCallback(async () => {
    if (!snapshotMorphTarget || snapshotMorphRunning || !activeSnapshot) {
      return
    }
    if (activeSnapshotNeedsUpdate) {
      pushToast('Update the active snapshot before starting a morph.', 'error')
      return
    }

    try {
      const sourceDetail = activeSnapshotDetailQuery.data ?? await fetchSnapshotDetail(activeSnapshot.id)
      const targetDetail = await fetchSnapshotDetail(snapshotMorphTarget.id)
      const compatibility = checkSnapshotMorphCompatibility(sourceDetail.snapshot_data, targetDetail.snapshot_data)
      if (!compatibility.ok) {
        pushToast(compatibility.reason || 'Snapshots are not morph-compatible.', 'error')
        return
      }

      setSnapshotMorphRunning(true)
      const steps = Math.max(6, Math.min(20, Math.round(snapshotMorphDurationMs / 100)))
      for (let step = 1; step < steps; step += 1) {
        const frame = interpolateSnapshotData(
          sourceDetail.snapshot_data,
          targetDetail.snapshot_data,
          step / steps,
        )
        await previewSnapshotData(frame)
        await delay(snapshotMorphDurationMs / steps)
      }

      await loadFlowSnapshotMutation.mutateAsync(snapshotMorphTarget.id)
      setSnapshotCompareTargetId(snapshotMorphTarget.id)
      setSnapshotMorphTarget(null)
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to morph between snapshots', 'error')
    } finally {
      setSnapshotMorphRunning(false)
    }
  }, [
    activeSnapshot,
    activeSnapshotDetailQuery.data,
    activeSnapshotNeedsUpdate,
    fetchSnapshotDetail,
    loadFlowSnapshotMutation,
    previewSnapshotData,
    pushToast,
    snapshotMorphDurationMs,
    snapshotMorphRunning,
    snapshotMorphTarget,
  ])

  useEffect(() => {
    if (momentarySnapshotId === null) {
      return undefined
    }

    const releasePreview = () => {
      void endMomentaryPreview()
    }

    window.addEventListener('pointerup', releasePreview)
    window.addEventListener('keyup', releasePreview)
    window.addEventListener('blur', releasePreview)
    return () => {
      window.removeEventListener('pointerup', releasePreview)
      window.removeEventListener('keyup', releasePreview)
      window.removeEventListener('blur', releasePreview)
    }
  }, [endMomentaryPreview, momentarySnapshotId])

  const handleSnapshotCardKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, snapshot: FlowSnapshot) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      loadFlowSnapshotMutation.mutate(snapshot.id)
    }
  }, [loadFlowSnapshotMutation])

  const handleSnapshotDragStart = useCallback((event: React.DragEvent<HTMLElement>, snapshotId: number) => {
    setDraggedSnapshotId(snapshotId)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleSnapshotDragOver = useCallback((event: React.DragEvent<HTMLElement>, snapshotId: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (draggedSnapshotId !== snapshotId) {
      setDragOverSnapshotId(snapshotId)
    }
  }, [draggedSnapshotId])

  const handleSnapshotDragEnd = useCallback(() => {
    setDraggedSnapshotId(null)
    setDragOverSnapshotId(null)
  }, [])

  const handleSnapshotDrop = useCallback((event: React.DragEvent<HTMLElement>, targetSnapshotId: number) => {
    event.preventDefault()
    if (draggedSnapshotId === null || draggedSnapshotId === targetSnapshotId) {
      handleSnapshotDragEnd()
      return
    }

    const nextOrder = [...flowSnapshots]
    const draggedIndex = nextOrder.findIndex((snapshot) => snapshot.id === draggedSnapshotId)
    const targetIndex = nextOrder.findIndex((snapshot) => snapshot.id === targetSnapshotId)

    if (draggedIndex === -1 || targetIndex === -1) {
      handleSnapshotDragEnd()
      return
    }

    const [movedSnapshot] = nextOrder.splice(draggedIndex, 1)
    nextOrder.splice(targetIndex, 0, movedSnapshot)
    reorderFlowSnapshotsMutation.mutate(nextOrder.map((snapshot) => snapshot.id))
    handleSnapshotDragEnd()
  }, [draggedSnapshotId, flowSnapshots, handleSnapshotDragEnd, reorderFlowSnapshotsMutation])

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
    return currentChain.plugins.find((p) => p.uri === selectedPluginUri) || null
  }, [selectedPluginUri, currentChain])

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

  const audioInterfaceStatus: JuceGridAudioInterfaceStatus = useMemo(() => ({
    deviceName: portsInfo?.device || audioStatus?.engine || 'JACK Audio',
    sampleRate: jackMetrics?.sample_rate || 48000,
    bufferSize: jackMetrics?.buffer_size || 256,
    channels: (portRouting?.input_ports?.length || 0) + (portRouting?.input_avb_endpoints?.length || 0) || 2,
    isRunning: audioStatus?.running ?? true,
    selectedPorts: portRouting?.input_ports || [],
    selectedAvbEndpoints: portRouting?.input_avb_endpoints || [],
    totalPorts: portsInfo?.input_count || 2,
    routingMode: routing.mode,
    chainActive: activeFlowChain?.is_active ?? false,
    chainName: activeFlowChain?.name,
  }), [audioStatus, jackMetrics, portRouting, portsInfo, routing.mode, activeFlowChain])

  // Create separate output status with output port info
  const audioOutputStatus: JuceGridAudioInterfaceStatus = useMemo(() => ({
    deviceName: portsInfo?.device || audioStatus?.engine || 'JACK Audio',
    sampleRate: jackMetrics?.sample_rate || 48000,
    bufferSize: jackMetrics?.buffer_size || 256,
    channels: (portRouting?.output_ports?.length || 0) + (portRouting?.output_avb_endpoints?.length || 0) || 2,
    isRunning: audioStatus?.running ?? true,
    selectedPorts: portRouting?.output_ports || [],
    selectedAvbEndpoints: portRouting?.output_avb_endpoints || [],
    totalPorts: portsInfo?.output_count || 2,
    routingMode: routing.mode,
    chainActive: activeFlowChain?.is_active ?? false,
    chainName: activeFlowChain?.name,
  }), [audioStatus, jackMetrics, portRouting, portsInfo, routing.mode, activeFlowChain])

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

  const reorderMutation = useMutation({
    mutationFn: ({ chainId, pluginUris }: { chainId: number; pluginUris: string[] }) =>
      chainsApi.reorderPlugins(chainId, pluginUris),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chains'] }),
    onError: (error) => pushToast(`Failed to reorder: ${error}`, 'error'),
  })

  const bypassMutation = useMutation({
    mutationFn: ({ chainId, pluginUri, bypass }: { chainId: number; pluginUri: string; bypass: boolean }) =>
      chainsApi.togglePluginBypass(chainId, pluginUri, bypass),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chains'] }),
    onError: (error) => pushToast(`Failed to toggle bypass: ${error}`, 'error'),
  })

  type PluginMutationContext = {
    previousChains?: ChainsResponse
    previousSelectedPluginUri: string | null
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

      updateChainPluginsCache(variables.chainId, (plugins) => {
        if (typeof variables.pluginPosition !== 'number') {
          return plugins.filter((plugin) => plugin.uri !== variables.pluginUri)
        }
        return plugins.filter(
          (plugin) => !(plugin.uri === variables.pluginUri && plugin.position === variables.pluginPosition)
        )
      })
      if (selectedPluginUri === variables.pluginUri) {
        setSelectedPluginUri(null)
      }

      return {
        previousChains,
        previousSelectedPluginUri,
      }
    },
    onSuccess: () => {
      pushToast('Plugin removed', 'success')
    },
    onError: (error, _variables, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      setSelectedPluginUri(context?.previousSelectedPluginUri ?? null)
      pushToast(`Failed to remove: ${error}`, 'error')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
    },
  })

  const addPluginMutation = useMutation({
    mutationFn: ({ chainId, pluginUri }: { chainId: number; pluginUri: string }) =>
      chainsApi.addPlugin(chainId, pluginUri),
    onMutate: async (variables): Promise<AddPluginMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousSelectedPluginUri = selectedPluginUri
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
      setSelectedPluginUri(context?.previousSelectedPluginUri ?? null)
      setShowPluginBrowser(context?.previousShowPluginBrowser ?? false)
      setPluginSearchQuery(context?.previousPluginSearchQuery ?? '')
      pushToast(`Failed to add: ${error}`, 'error')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
    },
  })

  const activateMutation = useMutation({
    mutationFn: (chainId: number) => chainsApi.activate(chainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain activated', 'success')
    },
    onError: (error) => pushToast(`Failed to activate: ${error}`, 'error'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (chainId: number) => chainsApi.deactivate(chainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain deactivated', 'info')
    },
    onError: (error) => pushToast(`Failed to deactivate: ${error}`, 'error'),
  })

  const undoMutation = useMutation({
    mutationFn: () => historyApi.undo(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      queryClient.invalidateQueries({ queryKey: ['history'] })
      pushToast(data.message || 'Undo successful', 'success')
    },
    onError: (error) => pushToast(`Undo failed: ${error}`, 'error'),
  })

  const redoMutation = useMutation({
    mutationFn: () => historyApi.redo(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      queryClient.invalidateQueries({ queryKey: ['history'] })
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
  }, [activeFlow?.id, flowSlots])

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
  const handlePluginSelect = useCallback((uri: string) => {
    setSelectedPluginUri(uri)
    if (isCompactLayout) {
      setCompactTab('editor')
    }
  }, [isCompactLayout])

  const handleFlowSlotKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectFlowIndex(index)
    }
  }, [selectFlowIndex])

  const handleToggleBypass = useCallback((uri: string, bypassed: boolean) => {
    if (!currentChain) return
    bypassMutation.mutate({ chainId: currentChain.id, pluginUri: uri, bypass: bypassed })
  }, [currentChain, bypassMutation])

  const handleDeletePlugin = useCallback((uri: string, position?: number) => {
    if (!currentChain) return
    deleteMutation.mutate({ chainId: currentChain.id, pluginUri: uri, pluginPosition: position })
  }, [currentChain, deleteMutation])

  const handleReorderPlugins = useCallback((pluginUris: string[]) => {
    if (!currentChain) return
    reorderMutation.mutate({ chainId: currentChain.id, pluginUris })
  }, [currentChain, reorderMutation])

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

  // Parameter handling
  const handleParameterChange = useCallback((symbol: string, value: number) => {
    if (!selectedPluginMeta || !selectedPluginUri) return
    const paramIndex = selectedPluginMeta.parameters.findIndex((p) => p.symbol === symbol)
    if (paramIndex === -1) return
    pluginsApi.setParameterBatched(selectedPluginUri, paramIndex, value)
  }, [selectedPluginMeta, selectedPluginUri])

  const handleParameterChangeEnd = useCallback(() => {
    pluginsApi.flushParameterBatch()
    queryClient.invalidateQueries({ queryKey: ['chains'] })
  }, [queryClient])

  const handleToggleSelectedBypass = useCallback(() => {
    if (!selectedPlugin || !currentChain) return
    bypassMutation.mutate({
      chainId: currentChain.id,
      pluginUri: selectedPlugin.uri,
      bypass: !selectedPlugin.bypassed,
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
        pushToast(`Chain "${newName}" created`, 'success')
      })
      .catch((error) => pushToast(`Failed to duplicate: ${error}`, 'error'))
  }, [currentChain, queryClient, pushToast])

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

    setSelectedPluginUri((previous) => {
      if (!currentChain || currentChain.id !== chainId) {
        return previous
      }
      return null
    })
  }, [currentChain])

  const submitRenameChain = useCallback(() => {
    const normalizedName = renameChainName.trim()
    if (!currentChain || !normalizedName || normalizedName === currentChain.name) {
      setShowRenameChainModal(false)
      return
    }
    renameMutation.mutate({ chainId: currentChain.id, name: normalizedName })
  }, [currentChain, renameChainName, renameMutation])

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

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, uri: string) => {
    setDraggedPluginUri(uri)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', uri)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, uri: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedPluginUri && uri !== draggedPluginUri) {
      setDragOverPluginUri(uri)
    }
  }, [draggedPluginUri])

  const handleDragEnd = useCallback(() => {
    setDraggedPluginUri(null)
    setDragOverPluginUri(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dropUri: string) => {
    e.preventDefault()
    if (!currentChain || !draggedPluginUri || draggedPluginUri === dropUri) {
      handleDragEnd()
      return
    }

    const plugins = [...currentChain.plugins]
    const dragIdx = plugins.findIndex(p => p.uri === draggedPluginUri)
    const dropIdx = plugins.findIndex(p => p.uri === dropUri)

    if (dragIdx !== -1 && dropIdx !== -1) {
      const [dragged] = plugins.splice(dragIdx, 1)
      plugins.splice(dropIdx, 0, dragged)
      reorderMutation.mutate({
        chainId: currentChain.id,
        pluginUris: plugins.map(p => p.uri),
      })
    }

    handleDragEnd()
  }, [currentChain, draggedPluginUri, reorderMutation, handleDragEnd])

  // Show plugin details
  const handleShowDetails = useCallback((plugin: Plugin) => {
    setDetailsPlugin(plugin)
  }, [])

  const renderSnapshotLibraryContent = (options: { rail: boolean }) => {
    const activeSnapshotDisplayName = activeSnapshot?.name || 'Live Workspace'
    const activeSnapshotDisplayNumber = activeSnapshot ? String(activeSnapshot.id).padStart(2, '0') : 'LIVE'
    const activeSnapshotDescription = activeSnapshot?.description?.trim()
      || (activeSnapshot
        ? 'Recallable snapshot for the current multi-flow rig.'
        : 'Capture the current routing, chains, and active blocks into the snapshot library.')

    return (
      <>
        <div className={`juce-grid-page__snapshot-active-display ${options.rail ? 'juce-grid-page__snapshot-active-display--rail' : ''}`}>
          <div className="juce-grid-page__snapshot-active-header">
            <span className="juce-grid-page__snapshot-action-label">
              {activeSnapshot ? 'Active snapshot' : 'Live workspace'}
            </span>
            <div className="juce-grid-page__compact-tags">
              {activeSnapshot && <Tag type="blue">Active</Tag>}
              {activeSnapshot && activeSnapshotNeedsUpdate && <Tag type="warm-gray">Needs update</Tag>}
              {activeSnapshot && !activeSnapshotNeedsUpdate && <Tag type="green">Current</Tag>}
              {activeSnapshot?.is_favorite && <Tag type="cool-gray">Favorite</Tag>}
              {activeSnapshot?.program_number !== null && activeSnapshot?.program_number !== undefined && (
                <Tag type="purple">PC {activeSnapshot.program_number}</Tag>
              )}
            </div>
          </div>

          <div className="juce-grid-page__snapshot-active-line">
            <span className="juce-grid-page__snapshot-active-number">{activeSnapshotDisplayNumber}</span>
            <span className="juce-grid-page__snapshot-active-name">{activeSnapshotDisplayName}</span>
          </div>

          <p className="juce-grid-page__snapshot-active-description">{activeSnapshotDescription}</p>

          <div className="juce-grid-page__compact-tags">
            {activeSnapshot ? (
              <Tag type="warm-gray">
                Updated {new Date(activeSnapshot.updated_at).toLocaleString()}
              </Tag>
            ) : (
              <Tag type="warm-gray">{flowSnapshots.length} saved snapshots available</Tag>
            )}
            {activeSnapshot && activeSnapshotDetailQuery.isLoading && (
              <Tag type="blue">Inspecting active snapshot</Tag>
            )}
          </div>

          <div className="juce-grid-page__snapshot-command-row">
            {activeSnapshot && (
              <Button
                size="sm"
                kind={activeSnapshotNeedsUpdate ? 'primary' : 'secondary'}
                renderIcon={Renew}
                onClick={handleActiveSnapshotRefresh}
                disabled={!activeSnapshotNeedsUpdate || refreshActiveSnapshotMutation.isPending || activeSnapshotDetailQuery.isLoading}
              >
                {refreshActiveSnapshotMutation.isPending ? 'Updating...' : 'Update snapshot'}
              </Button>
            )}
            <Button
              size="sm"
              kind={activeSnapshot ? 'secondary' : 'primary'}
              renderIcon={Add}
              onClick={openSnapshotCreateModal}
            >
              Save as new snapshot
            </Button>
            {activeSnapshot && (
              <Button size="sm" kind="ghost" onClick={() => openSnapshotRenameModal(activeSnapshot)}>
                Rename
              </Button>
            )}
            {activeSnapshot && (
              <Button size="sm" kind="ghost" onClick={() => openSnapshotProgramModal(activeSnapshot)}>
                {activeSnapshot.program_number === null ? 'Set MIDI PC' : 'Edit MIDI PC'}
              </Button>
            )}
          </div>
        </div>

        {compareTargetSnapshot && snapshotComparisonSummary && (
          <div className={`juce-grid-page__snapshot-compare-display ${options.rail ? 'juce-grid-page__snapshot-compare-display--rail' : ''}`}>
            <div className="juce-grid-page__snapshot-active-header">
              <span className="juce-grid-page__snapshot-action-label">Snapshot compare</span>
              <div className="juce-grid-page__snapshot-command-row">
                <Button
                  size="sm"
                  kind="secondary"
                  onClick={() => setSnapshotMorphTarget(compareTargetSnapshot)}
                  disabled={!activeSnapshot || activeSnapshotNeedsUpdate}
                >
                  Prepare morph
                </Button>
                <Button size="sm" kind="ghost" onClick={() => setSnapshotCompareTargetId(null)}>
                  Clear compare
                </Button>
              </div>
            </div>

            <div className="juce-grid-page__snapshot-compare-line">
              <strong>{activeSnapshot?.name || 'Live Workspace'}</strong>
              <span>vs</span>
              <strong>{compareTargetSnapshot.name}</strong>
            </div>

            <div className="juce-grid-page__compact-tags">
              <Tag type="cool-gray">{snapshotComparisonSummary.flowChanges} flow changes</Tag>
              <Tag type="cool-gray">{snapshotComparisonSummary.chainChanges} chain changes</Tag>
              <Tag type="cool-gray">{snapshotComparisonSummary.paramChanges} param changes</Tag>
              {snapshotComparisonSummary.routingChanged && <Tag type="purple">Routing changed</Tag>}
              {snapshotComparisonSummary.activeFlowChanged && <Tag type="blue">Active flow changed</Tag>}
            </div>

            {activeSnapshot && activeSnapshotNeedsUpdate && (
              <p className="juce-grid-page__snapshot-compare-copy">
                Compare is using the saved active snapshot. Update it first if you want the current live edits included.
              </p>
            )}
          </div>
        )}

        {flowSnapshotsQuery.isLoading ? (
          <InlineLoading description="Loading snapshots" status="active" />
        ) : flowSnapshots.length === 0 ? (
          <div className="juce-grid-page__empty-state">
            <p>No snapshots saved yet</p>
            <p className="juce-grid-page__empty-state-copy">
              Capture the current multi-flow state to build a reusable snapshot library.
            </p>
          </div>
        ) : (
          <>
            <section className={`juce-grid-page__snapshot-group ${options.rail ? 'juce-grid-page__snapshot-group--rail' : ''}`}>
              <div className="juce-grid-page__snapshot-group-header">
                <div className="juce-grid-page__snapshot-group-title">
                  <strong>Favorites</strong>
                  <span>{favoriteSnapshots.length}</span>
                </div>
              </div>

              {favoriteSnapshots.length === 0 ? (
                <div className="juce-grid-page__snapshot-group-empty">
                  <p className="juce-grid-page__empty-state-copy">
                    Star any saved snapshot and it will show up here automatically.
                  </p>
                </div>
              ) : (
                <div className={`juce-grid-page__snapshot-list ${options.rail ? 'juce-grid-page__snapshot-list--rail' : ''}`}>
                  {favoriteSnapshots.map((snapshot) => {
                    const isActiveSnapshot = snapshot.id === activeSnapshotId || snapshot.is_active

                    return (
                      <Tile
                        key={snapshot.id}
                        className={`juce-grid-page__snapshot-tile ${options.rail ? 'juce-grid-page__snapshot-tile--rail' : ''} ${isActiveSnapshot ? 'is-active' : ''} ${draggedSnapshotId === snapshot.id ? 'is-dragging' : ''} ${dragOverSnapshotId === snapshot.id ? 'is-drag-over' : ''}`}
                        role="button"
                        tabIndex={0}
                        draggable
                        onClick={() => loadFlowSnapshotMutation.mutate(snapshot.id)}
                        onKeyDown={(event) => handleSnapshotCardKeyDown(event, snapshot)}
                        onDragStart={(event) => handleSnapshotDragStart(event, snapshot.id)}
                        onDragOver={(event) => handleSnapshotDragOver(event, snapshot.id)}
                        onDragEnd={handleSnapshotDragEnd}
                        onDrop={(event) => handleSnapshotDrop(event, snapshot.id)}
                      >
                        <div className="juce-grid-page__snapshot-main">
                          <div className="juce-grid-page__snapshot-top">
                            <div className="juce-grid-page__snapshot-name-row">
                              <Draggable size={14} aria-hidden />
                              <strong>{snapshot.name}</strong>
                            </div>
                            <div className="juce-grid-page__compact-tags">
                              {isActiveSnapshot && <Tag type="blue">Active</Tag>}
                              {isActiveSnapshot && activeSnapshotNeedsUpdate && <Tag type="warm-gray">Needs update</Tag>}
                              <Tag type="cool-gray">Favorite</Tag>
                              {snapshot.program_number !== null && <Tag type="purple">PC {snapshot.program_number}</Tag>}
                            </div>
                          </div>

                          <p className="juce-grid-page__snapshot-description">
                            {snapshot.description || 'A pinned recall for the sounds you return to most often.'}
                          </p>

                          <div className="juce-grid-page__snapshot-slot-row">
                            {snapshot.flow_slots.map((slot) => (
                              <span
                                key={`${snapshot.id}-${slot.id}`}
                                className="juce-grid-page__snapshot-slot"
                                style={{ '--snapshot-slot-color': slot.color } as React.CSSProperties}
                              >
                                {slot.label}
                              </span>
                            ))}
                          </div>

                          <div className="juce-grid-page__compact-tags">
                            <Tag type="warm-gray">
                              Updated {new Date(snapshot.updated_at).toLocaleDateString()}
                            </Tag>
                          </div>
                        </div>

                        <div className="juce-grid-page__snapshot-actions" onClick={(event) => event.stopPropagation()}>
                          <Button
                            size="sm"
                            kind="primary"
                            onClick={() => loadFlowSnapshotMutation.mutate(snapshot.id)}
                            disabled={loadFlowSnapshotMutation.isPending}
                          >
                            Recall
                          </Button>
                          {snapshot.id !== activeSnapshotId && (
                            <Button
                              size="sm"
                              kind={momentarySnapshotId === snapshot.id ? 'secondary' : 'ghost'}
                              onPointerDown={(event) => {
                                event.preventDefault()
                                void startMomentaryPreview(snapshot)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  void startMomentaryPreview(snapshot)
                                }
                              }}
                              disabled={(momentarySnapshotId !== null && momentarySnapshotId !== snapshot.id) || snapshotMorphRunning}
                            >
                              {momentarySnapshotId === snapshot.id ? 'Previewing...' : 'Hold to preview'}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            kind="secondary"
                            onClick={() => handleSnapshotFavoriteToggle(snapshot)}
                          >
                            Favorited
                          </Button>
                          <OverflowMenu
                            ariaLabel={`Actions for ${snapshot.name}`}
                            iconDescription={`Actions for ${snapshot.name}`}
                            size="sm"
                            flipped
                          >
                            <OverflowMenuItem itemText="Rename" onClick={() => openSnapshotRenameModal(snapshot)} />
                            <OverflowMenuItem itemText="Duplicate" onClick={() => handleSnapshotDuplicate(snapshot)} />
                            {snapshot.id !== activeSnapshotId && (
                              <OverflowMenuItem
                                itemText={snapshotCompareTargetId === snapshot.id ? 'Stop comparing' : activeSnapshot ? 'Compare with active snapshot' : 'Compare with live workspace'}
                                onClick={() => toggleSnapshotCompare(snapshot)}
                              />
                            )}
                            {snapshot.id !== activeSnapshotId && (
                              <OverflowMenuItem
                                itemText="Prepare morph"
                                disabled={!activeSnapshot || activeSnapshotNeedsUpdate}
                                onClick={() => {
                                  setSnapshotCompareTargetId(snapshot.id)
                                  setSnapshotMorphTarget(snapshot)
                                }}
                              />
                            )}
                            <OverflowMenuItem
                              itemText={snapshot.program_number === null ? 'Set MIDI PC' : 'Edit MIDI PC'}
                              onClick={() => openSnapshotProgramModal(snapshot)}
                            />
                            {snapshot.program_number !== null && (
                              <OverflowMenuItem itemText="Clear MIDI PC" onClick={() => clearSnapshotProgram(snapshot)} />
                            )}
                            <OverflowMenuItem itemText="Delete" isDelete onClick={() => requestSnapshotDelete(snapshot)} />
                          </OverflowMenu>
                        </div>
                      </Tile>
                    )
                  })}
                </div>
              )}
            </section>

            <section className={`juce-grid-page__snapshot-group ${options.rail ? 'juce-grid-page__snapshot-group--rail' : ''}`}>
              <div className="juce-grid-page__snapshot-group-header">
                <button
                  type="button"
                  className="juce-grid-page__snapshot-group-toggle"
                  onClick={() => setSnapshotLibraryExpanded((previous) => !previous)}
                  aria-expanded={snapshotLibraryExpanded}
                >
                  <ChevronRight size={16} className={`juce-grid-page__snapshot-group-chevron ${snapshotLibraryExpanded ? 'is-open' : ''}`} />
                  <strong>Snapshot Library</strong>
                  <span>{librarySnapshots.length}</span>
                </button>
              </div>

              {snapshotLibraryExpanded && (
                librarySnapshots.length === 0 ? (
                  <div className="juce-grid-page__snapshot-group-empty">
                    <p className="juce-grid-page__empty-state-copy">
                      Everything saved right now is favorited. Unfavorite a snapshot to park it in the wider library.
                    </p>
                  </div>
                ) : (
                  <div className={`juce-grid-page__snapshot-list ${options.rail ? 'juce-grid-page__snapshot-list--rail' : ''}`}>
                    {librarySnapshots.map((snapshot) => {
                      const isActiveSnapshot = snapshot.id === activeSnapshotId || snapshot.is_active

                      return (
                        <Tile
                          key={snapshot.id}
                          className={`juce-grid-page__snapshot-tile ${options.rail ? 'juce-grid-page__snapshot-tile--rail' : ''} ${isActiveSnapshot ? 'is-active' : ''} ${draggedSnapshotId === snapshot.id ? 'is-dragging' : ''} ${dragOverSnapshotId === snapshot.id ? 'is-drag-over' : ''}`}
                          role="button"
                          tabIndex={0}
                          draggable
                          onClick={() => loadFlowSnapshotMutation.mutate(snapshot.id)}
                          onKeyDown={(event) => handleSnapshotCardKeyDown(event, snapshot)}
                          onDragStart={(event) => handleSnapshotDragStart(event, snapshot.id)}
                          onDragOver={(event) => handleSnapshotDragOver(event, snapshot.id)}
                          onDragEnd={handleSnapshotDragEnd}
                          onDrop={(event) => handleSnapshotDrop(event, snapshot.id)}
                        >
                          <div className="juce-grid-page__snapshot-main">
                            <div className="juce-grid-page__snapshot-top">
                              <div className="juce-grid-page__snapshot-name-row">
                                <Draggable size={14} aria-hidden />
                                <strong>{snapshot.name}</strong>
                              </div>
                              <div className="juce-grid-page__compact-tags">
                                {isActiveSnapshot && <Tag type="blue">Active</Tag>}
                                {isActiveSnapshot && activeSnapshotNeedsUpdate && <Tag type="warm-gray">Needs update</Tag>}
                                {snapshot.program_number !== null && <Tag type="purple">PC {snapshot.program_number}</Tag>}
                              </div>
                            </div>

                            <p className="juce-grid-page__snapshot-description">
                              {snapshot.description || 'Recallable snapshot for the current multi-flow rig.'}
                            </p>

                            <div className="juce-grid-page__snapshot-slot-row">
                              {snapshot.flow_slots.map((slot) => (
                                <span
                                  key={`${snapshot.id}-${slot.id}`}
                                  className="juce-grid-page__snapshot-slot"
                                  style={{ '--snapshot-slot-color': slot.color } as React.CSSProperties}
                                >
                                  {slot.label}
                                </span>
                              ))}
                            </div>

                            <div className="juce-grid-page__compact-tags">
                              <Tag type="warm-gray">
                                Updated {new Date(snapshot.updated_at).toLocaleDateString()}
                              </Tag>
                            </div>
                          </div>

                          <div className="juce-grid-page__snapshot-actions" onClick={(event) => event.stopPropagation()}>
                            <Button
                              size="sm"
                              kind="primary"
                              onClick={() => loadFlowSnapshotMutation.mutate(snapshot.id)}
                              disabled={loadFlowSnapshotMutation.isPending}
                            >
                              Recall
                            </Button>
                            {snapshot.id !== activeSnapshotId && (
                              <Button
                                size="sm"
                                kind={momentarySnapshotId === snapshot.id ? 'secondary' : 'ghost'}
                                onPointerDown={(event) => {
                                  event.preventDefault()
                                  void startMomentaryPreview(snapshot)
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    void startMomentaryPreview(snapshot)
                                  }
                                }}
                                disabled={(momentarySnapshotId !== null && momentarySnapshotId !== snapshot.id) || snapshotMorphRunning}
                              >
                                {momentarySnapshotId === snapshot.id ? 'Previewing...' : 'Hold to preview'}
                              </Button>
                            )}
                            <Button size="sm" kind="ghost" onClick={() => handleSnapshotFavoriteToggle(snapshot)}>
                              Favorite
                            </Button>
                            <OverflowMenu
                              ariaLabel={`Actions for ${snapshot.name}`}
                              iconDescription={`Actions for ${snapshot.name}`}
                              size="sm"
                              flipped
                            >
                              <OverflowMenuItem itemText="Rename" onClick={() => openSnapshotRenameModal(snapshot)} />
                              <OverflowMenuItem itemText="Duplicate" onClick={() => handleSnapshotDuplicate(snapshot)} />
                              {snapshot.id !== activeSnapshotId && (
                                <OverflowMenuItem
                                  itemText={snapshotCompareTargetId === snapshot.id ? 'Stop comparing' : activeSnapshot ? 'Compare with active snapshot' : 'Compare with live workspace'}
                                  onClick={() => toggleSnapshotCompare(snapshot)}
                                />
                              )}
                              {snapshot.id !== activeSnapshotId && (
                                <OverflowMenuItem
                                  itemText="Prepare morph"
                                  disabled={!activeSnapshot || activeSnapshotNeedsUpdate}
                                  onClick={() => {
                                    setSnapshotCompareTargetId(snapshot.id)
                                    setSnapshotMorphTarget(snapshot)
                                  }}
                                />
                              )}
                              <OverflowMenuItem
                                itemText={snapshot.program_number === null ? 'Set MIDI PC' : 'Edit MIDI PC'}
                                onClick={() => openSnapshotProgramModal(snapshot)}
                              />
                              {snapshot.program_number !== null && (
                                <OverflowMenuItem itemText="Clear MIDI PC" onClick={() => clearSnapshotProgram(snapshot)} />
                              )}
                              <OverflowMenuItem itemText="Delete" isDelete onClick={() => requestSnapshotDelete(snapshot)} />
                            </OverflowMenu>
                          </div>
                        </Tile>
                      )
                    })}
                  </div>
                )
              )}
            </section>
          </>
        )}
      </>
    )
  }

  const renderSnapshotLibrary = () => {
    return (
      <div className="juce-grid-page__snapshot-panel">
        <div className="juce-grid-page__snapshot-header">
          <div className="juce-grid-page__snapshot-copy">
            <strong>Snapshots</strong>
            <span>{flowSnapshots.length} saved snapshots</span>
          </div>
          <div className="juce-grid-page__compact-actions">
            <Button size="sm" kind="primary" onClick={openSnapshotCreateModal}>
              Save as new snapshot
            </Button>
          </div>
        </div>

        <div className="juce-grid-page__snapshot-content">
          {renderSnapshotLibraryContent({ rail: false })}
        </div>
      </div>
    )
  }

  const renderSnapshotRail = () => {
    const activeSnapshotDisplayName = activeSnapshot?.name || 'Live Workspace'
    const activeSnapshotDisplayNumber = activeSnapshot ? String(activeSnapshot.id).padStart(2, '0') : 'LIVE'

    return (
      <aside className={`juce-grid-page__snapshot-rail-shell ${snapshotsPanelExpanded ? 'is-expanded' : 'is-collapsed'}`}>
        <SideNav
          aria-label="Audio Grid snapshots"
          expanded={snapshotsPanelExpanded}
          isChildOfHeader={false}
          isFixedNav={false}
          className="juce-grid-page__snapshot-rail"
        >
          <SideNavItems className="juce-grid-page__snapshot-rail-items" isSideNavExpanded={snapshotsPanelExpanded}>
            <li className="juce-grid-page__snapshot-rail-section juce-grid-page__snapshot-rail-section--header">
              <div className="juce-grid-page__snapshot-rail-header">
                <div className="juce-grid-page__snapshot-rail-heading">
                  <div className="juce-grid-page__snapshot-rail-mark" aria-hidden>
                    <Flow size={20} />
                  </div>
                  {snapshotsPanelExpanded && (
                    <div className="juce-grid-page__snapshot-rail-copy">
                      <strong>Snapshots</strong>
                    </div>
                  )}
                </div>

                {snapshotsPanelExpanded && (
                  <div className="juce-grid-page__snapshot-rail-toolbar">
                    <Button size="sm" kind="primary" onClick={openSnapshotCreateModal}>
                      Save as new snapshot
                    </Button>
                  </div>
                )}
              </div>
            </li>

            {snapshotsPanelExpanded ? (
              <li className="juce-grid-page__snapshot-rail-section juce-grid-page__snapshot-rail-section--content">
                <div className="juce-grid-page__snapshot-rail-scroll">
                  <div className="juce-grid-page__snapshot-content juce-grid-page__snapshot-content--rail">
                    {renderSnapshotLibraryContent({ rail: true })}
                  </div>
                </div>
              </li>
            ) : (
              <li className="juce-grid-page__snapshot-rail-section juce-grid-page__snapshot-rail-section--collapsed">
                <div className="juce-grid-page__snapshot-rail-collapsed">
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    renderIcon={Add}
                    iconDescription="Save as new snapshot"
                    onClick={openSnapshotCreateModal}
                  />
                  {activeSnapshot && (
                    <Button
                      hasIconOnly
                      size="sm"
                      kind={activeSnapshotNeedsUpdate ? 'primary' : 'ghost'}
                      renderIcon={Renew}
                      iconDescription={activeSnapshotNeedsUpdate ? 'Update active snapshot' : 'Active snapshot is current'}
                      onClick={handleActiveSnapshotRefresh}
                      disabled={!activeSnapshotNeedsUpdate || refreshActiveSnapshotMutation.isPending || activeSnapshotDetailQuery.isLoading}
                    />
                  )}
                  <button
                    type="button"
                    className="juce-grid-page__snapshot-rail-pill"
                    onClick={() => setSnapshotsPanelExpanded(true)}
                    aria-label={`Expand snapshot rail. Active state ${activeSnapshotDisplayName}`}
                  >
                    {activeSnapshot ? activeSnapshotDisplayNumber : 'L'}
                  </button>
                </div>
              </li>
            )}
          </SideNavItems>

          <SideNavFooter
            assistiveText={snapshotsPanelExpanded ? 'Collapse snapshots rail' : 'Expand snapshots rail'}
            expanded={snapshotsPanelExpanded}
            onToggle={() => setSnapshotsPanelExpanded((previous) => !previous)}
          />
        </SideNav>
      </aside>
    )
  }

  const renderMidiRail = () => (
    <aside className={`juce-grid-page__midi-rail-shell ${midiPanelExpanded ? 'is-expanded' : 'is-collapsed'}`}>
      <SideNav
        aria-label="Audio Grid MIDI"
        expanded={midiPanelExpanded}
        isChildOfHeader={false}
        isFixedNav={false}
        className="juce-grid-page__midi-rail"
      >
        <SideNavItems className="juce-grid-page__midi-rail-items" isSideNavExpanded={midiPanelExpanded}>
          <li className="juce-grid-page__midi-rail-section juce-grid-page__midi-rail-section--header">
            <div className="juce-grid-page__midi-rail-header">
              <div className="juce-grid-page__midi-rail-heading">
                <div className="juce-grid-page__midi-rail-mark" aria-hidden>
                  <Music size={20} />
                </div>
                {midiPanelExpanded && (
                  <div className="juce-grid-page__midi-rail-copy">
                    <strong>MIDI</strong>
                    <span>{midiMappings.length} mappings</span>
                  </div>
                )}
              </div>

              {midiPanelExpanded && (
                <div className="juce-grid-page__midi-rail-summary">
                  <Tag type={midiLearnActive ? 'green' : 'cool-gray'}>
                    {midiLearnActive ? `Learn active${lastMidiEvent ? ` · CC ${lastMidiEvent.cc}` : ''}` : 'Learn idle'}
                  </Tag>
                </div>
              )}

              {midiPanelExpanded && (
                <div className="juce-grid-page__midi-rail-toolbar">
                  <MidiLearnButton
                    isActive={midiLearnActive}
                    onToggle={() => setMidiLearnActive((prev) => !prev)}
                    position="relative"
                    size="small"
                  />
                </div>
              )}
            </div>
          </li>

          {midiPanelExpanded ? (
            <li className="juce-grid-page__midi-rail-section juce-grid-page__midi-rail-section--content">
              <div className="juce-grid-page__midi-rail-scroll">
                {renderMidiMappingsWorkspace({ closable: false })}
              </div>
            </li>
          ) : (
            <li className="juce-grid-page__midi-rail-section juce-grid-page__midi-rail-section--collapsed">
              <div className="juce-grid-page__midi-rail-collapsed">
                <Button
                  hasIconOnly
                  size="sm"
                  kind={midiLearnActive ? 'secondary' : 'ghost'}
                  renderIcon={Music}
                  iconDescription={midiLearnActive ? 'MIDI learn active' : 'Toggle MIDI learn'}
                  onClick={() => setMidiLearnActive((prev) => !prev)}
                />
                {midiMappings.length > 0 && (
                  <button
                    type="button"
                    className="juce-grid-page__midi-rail-pill"
                    onClick={() => setMidiPanelExpanded(true)}
                    aria-label={`Expand MIDI rail. ${midiMappings.length} mappings`}
                  >
                    {midiMappings.length}
                  </button>
                )}
              </div>
            </li>
          )}
        </SideNavItems>

        <SideNavFooter
          assistiveText={midiPanelExpanded ? 'Collapse MIDI rail' : 'Expand MIDI rail'}
          expanded={midiPanelExpanded}
          onToggle={() => setMidiPanelExpanded((previous) => !previous)}
        />
      </SideNav>
    </aside>
  )

  const updateMidiMapping = useCallback((id: string, updates: Partial<MidiMapping>) => {
    setMidiMappings((previous) => previous.map((mapping) => (
      mapping.id === id ? { ...mapping, ...updates } : mapping
    )))
  }, [])

  const deleteMidiMapping = useCallback((id: string) => {
    setMidiMappings((previous) => previous.filter((mapping) => mapping.id !== id))
  }, [])

  const renderMidiMappingsWorkspace = (options: { closable: boolean; onClose?: () => void }) => (
    <div className="juce-grid-page__midi-workspace">
      <div className="juce-grid-page__midi-header">
        <div className="juce-grid-page__midi-copy">
          <div className="juce-grid-page__browser-section-title">
            <Music size={16} />
            <span>MIDI mappings</span>
          </div>
          <p>Review learned assignments, adjust ranges, and flip response direction.</p>
        </div>
        <div className="juce-grid-page__compact-actions">
          <Tag type={midiLearnActive ? 'green' : 'cool-gray'}>
            {midiLearnActive ? `Learn active${lastMidiEvent ? ` · CC ${lastMidiEvent.cc}` : ''}` : 'Learn idle'}
          </Tag>
          <Tag type="cool-gray">{midiMappings.length} mappings</Tag>
          {options.closable && options.onClose && (
            <Button size="sm" kind="ghost" onClick={options.onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {midiMappings.length === 0 ? (
        <div className="juce-grid-page__empty-state">
          <p>No MIDI mappings yet</p>
          <p className="juce-grid-page__empty-state-copy">
            Enable MIDI Learn from the toolbar, then touch a block parameter to bind the next controller message.
          </p>
        </div>
      ) : (
        <div className="juce-grid-page__midi-list">
          {midiMappings.map((mapping) => (
            <Tile key={mapping.id} className="juce-grid-page__midi-tile">
              <div className="juce-grid-page__midi-tile-header">
                <div className="juce-grid-page__midi-tile-copy">
                  <strong>{mapping.parameterName}</strong>
                  <p>{sanitizeRestrictedDisplayText(mapping.pluginName) || 'Processor'}</p>
                </div>
                <div className="juce-grid-page__compact-tags">
                  <Tag type="purple">CC {mapping.ccNumber}</Tag>
                  <Tag type="cool-gray">Ch {mapping.channel}</Tag>
                  {mapping.inverted && <Tag type="warm-gray">Inverted</Tag>}
                </div>
              </div>

              <div className="juce-grid-page__midi-range-grid">
                <TextInput
                  id={`juce-grid-midi-min-${mapping.id}`}
                  labelText="Min"
                  type="number"
                  value={String(mapping.min)}
                  onChange={(event) => updateMidiMapping(mapping.id, { min: Number.parseInt(event.target.value || '0', 10) || 0 })}
                />
                <TextInput
                  id={`juce-grid-midi-max-${mapping.id}`}
                  labelText="Max"
                  type="number"
                  value={String(mapping.max)}
                  onChange={(event) => updateMidiMapping(mapping.id, { max: Number.parseInt(event.target.value || '0', 10) || 0 })}
                />
              </div>

              <div className="juce-grid-page__midi-actions">
                <Checkbox
                  id={`juce-grid-midi-invert-${mapping.id}`}
                  labelText="Invert response"
                  checked={mapping.inverted}
                  onChange={(_, data) => updateMidiMapping(mapping.id, { inverted: Boolean(data.checked) })}
                />
                <Button
                  size="sm"
                  kind="danger--tertiary"
                  onClick={() => deleteMidiMapping(mapping.id)}
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
          else if (showSnapshotCreateModal) setShowSnapshotCreateModal(false)
          else if (snapshotPendingRename) setSnapshotPendingRename(null)
          else if (snapshotPendingProgram) closeSnapshotProgramModal()
          else if (snapshotPendingDelete) setSnapshotPendingDelete(null)
          else if (snapshotMorphTarget && !snapshotMorphRunning) setSnapshotMorphTarget(null)
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

      // Left/Right = Navigate plugins
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && currentChain) {
        e.preventDefault()
        const plugins = currentChain.plugins
        if (plugins.length === 0) return

        const currentIdx = selectedPluginUri
          ? plugins.findIndex(p => p.uri === selectedPluginUri)
          : -1

        let newIdx: number
        if (e.key === 'ArrowLeft') {
          newIdx = currentIdx <= 0 ? plugins.length - 1 : currentIdx - 1
        } else {
          newIdx = currentIdx >= plugins.length - 1 ? 0 : currentIdx + 1
        }
        setSelectedPluginUri(plugins[newIdx].uri)
        return
      }

      // Escape = Close modals/deselect
      if (e.key === 'Escape') {
        if (showSavePresetModal) setShowSavePresetModal(false)
        else if (showRenameChainModal) setShowRenameChainModal(false)
        else if (presetPendingDelete) setPresetPendingDelete(null)
        else if (showClearFlowsModal) setShowClearFlowsModal(false)
        else if (showSnapshotCreateModal) setShowSnapshotCreateModal(false)
        else if (snapshotPendingRename) setSnapshotPendingRename(null)
        else if (snapshotPendingProgram) closeSnapshotProgramModal()
        else if (snapshotPendingDelete) setSnapshotPendingDelete(null)
        else if (snapshotMorphTarget && !snapshotMorphRunning) setSnapshotMorphTarget(null)
        else if (routingInspectorId) setRoutingInspectorId(null)
        else if (showPluginBrowser) setShowPluginBrowser(false)
        else if (showPresetBrowser) setShowPresetBrowser(false)
        else if (showKeyboardHelp) setShowKeyboardHelp(false)
        else if (detailsPlugin) setDetailsPlugin(null)
        else if (selectedPluginUri) setSelectedPluginUri(null)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    historyStatus, undoMutation, redoMutation, selectedPlugin, currentChain,
    bypassMutation, deleteMutation, selectedPluginUri, selectedPluginMeta,
    flowSlots, showSavePresetModal, showRenameChainModal, presetPendingDelete,
    showClearFlowsModal, showSnapshotCreateModal, snapshotPendingRename,
    snapshotPendingProgram, snapshotPendingDelete, snapshotMorphTarget,
    snapshotMorphRunning, routingInspectorId, showPluginBrowser,
    showPresetBrowser, showKeyboardHelp, detailsPlugin,
    handleSavePreset, toggleFavorite, closeSnapshotProgramModal, selectFlowIndex,
  ])

  // ============================================================================
  // Render
  // ============================================================================

  const renderRoutingSurface = (compact: boolean) => (
    <>
      <div className="juce-grid-page__routing-header">
        <div className="juce-grid-page__routing-copy">
          <strong>Routing topology</strong>
          <p>Keep topology selection and flow-routing actions inside the visual routing card.</p>
        </div>
        <div className="juce-grid-page__routing-meta">
          <Tag type="blue">{activeRoutingMode.label}</Tag>
          <Tag type="cool-gray">Focus {activeFlowLabel}</Tag>
          {routing.mode === 'parameter_morph' && (
            <Tag type="purple">Morph {Math.round(routing.morphProgress * 100)}%</Tag>
          )}
        </div>
      </div>

      <div className="juce-grid-page__routing-panel-grid">
        <Tile className="juce-grid-page__routing-panel">
          <span className="juce-grid-page__routing-panel-label">Topology</span>
          <p className="juce-grid-page__routing-panel-copy">{activeRoutingMode.summary}</p>
          <div className="juce-grid-page__toolbar-buttons">
            {ROUTING_MODE_OPTIONS.map((option) => (
              <Button
                key={option.id}
                size="sm"
                kind={routing.mode === option.id ? 'secondary' : 'ghost'}
                onClick={() => setRoutingMode(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Tile>

        <Tile className="juce-grid-page__routing-panel">
          <span className="juce-grid-page__routing-panel-label">Focus flow</span>
          <p className="juce-grid-page__routing-panel-copy">Choose which flow stays primary while editing and routing.</p>
          <div className="juce-grid-page__toolbar-buttons">
            {flowSlots.map((slot, index) => (
              <Button
                key={slot.id}
                size="sm"
                kind={activeFlowIndex === index ? 'secondary' : 'ghost'}
                onClick={() => selectFlowIndex(index)}
              >
                {SLOT_COLORS[index]?.label || slot.label}
              </Button>
            ))}
          </div>
        </Tile>

        <Tile className="juce-grid-page__routing-panel">
          <span className="juce-grid-page__routing-panel-label">Actions</span>
          <p className="juce-grid-page__routing-panel-copy">Open port routing or assign the active flow to a cluster node.</p>
          <div className="juce-grid-page__toolbar-buttons">
            <Button size="sm" kind="ghost" onClick={() => setPortSelectorFlowIndex(activeFlowIndex)}>
              Route ports
            </Button>
            <Button
              size="sm"
              kind="ghost"
              onClick={() => activeFlow && openAssignmentDialog(activeFlow)}
              disabled={!activeFlow}
            >
              Assign flow
            </Button>
          </div>
        </Tile>

        {routing.mode === 'parameter_morph' && (
          <Tile className="juce-grid-page__routing-panel juce-grid-page__routing-panel--morph">
            <span className="juce-grid-page__routing-panel-label">Morph amount</span>
            <p className="juce-grid-page__routing-panel-copy">Set the crossfade position used by the routing morph state.</p>
            <NumberInput
              label="Morph"
              value={routing.morphProgress * 100}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(value) => setMorphProgress(value / 100)}
              size="small"
              inline
            />
          </Tile>
        )}
      </div>

      <div className="juce-grid-page__routing-visual">
        <JuceGridRoutingVisualizer
          mode={routing.mode}
          flows={routingVisualizerFlows}
          morphProgress={routing.morphProgress}
          activeFlowId={routing.activeSlotId}
          morphSourceId={routing.morphSourceSlotId}
          morphTargetId={routing.morphTargetSlotId}
          compact={compact || flowSlots.length > 4}
          onMarkerSelect={setRoutingInspectorId}
        />
      </div>
    </>
  )

  const renderLivePathSummaryCard = () => (
    <Layer
      className={`juce-grid-page__live-path-summary ${livePathLayout.status === 'unavailable' ? 'is-unavailable' : ''}`}
      role="region"
      aria-label="Live audio path"
    >
      <div className="juce-grid-page__live-path-summary-header">
        <div className="juce-grid-page__live-path-summary-heading">
          <strong>Live audio path</strong>
          <p>Keep flow management inside the same Carbon surface used to monitor the active signal path.</p>
        </div>
        <div className="juce-grid-page__live-path-summary-header-actions">
          <div className="juce-grid-page__live-path-summary-meta">
            <Tag type={livePathLayout.status === 'available' ? 'green' : 'cool-gray'}>
              {livePathLayout.status === 'available' ? 'Live' : 'Unavailable'}
            </Tag>
            <Tag type="cool-gray">{activeRoutingMode.label}</Tag>
            <Tag type="cool-gray">
              {flowSlots.length} {flowSlots.length === 1 ? 'flow' : 'flows'}
            </Tag>
          </div>
          <div className="juce-grid-page__live-path-summary-flow-actions">
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
          </div>
        </div>
      </div>
      <div className="juce-grid-page__live-path-summary-copy">
        {livePathLayout.mobileSummary.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {isCompactLayout && compactRoutingInspectorItems.length > 0 && (
        <div className="juce-grid-page__routing-summary-actions">
          {compactRoutingInspectorItems.map((item) => (
            <Button
              key={item.id}
              size="sm"
              kind="ghost"
              onClick={() => setRoutingInspectorId(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
    </Layer>
  )

  const renderLivePathFlowCard = (
    flowId: string,
    groupKind: 'series' | 'parallel' | 'ab' | 'morph' | 'sidechain' | 'inactive',
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

    return (
      <div
        key={flow.id}
        className={`juce-grid-page__live-path-row juce-grid-page__live-path-row--${groupKind} ${flowState?.activeAudio ? 'is-live' : ''} ${flowState?.dimmed ? 'is-dimmed' : ''}`}
      >
        <div className="juce-grid-page__live-path-side juce-grid-page__live-path-side--entry" aria-hidden>
          <span
            className={`juce-grid-page__live-path-dot ${flowState?.activeAudio ? 'is-live' : ''} ${flowState?.sidechainKey ? 'is-sidechain' : ''}`}
            style={{ '--flow-color': flow.color } as React.CSSProperties}
          />
          <span className="juce-grid-page__live-path-side-copy">
            {flowState?.sidechainKey ? 'KEY' : flowState?.activeAudio ? 'LIVE' : 'DIM'}
          </span>
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
            <span>Flow</span>
          </div>

          <div className="juce-grid-page__flow-card-body">
            <div className="juce-grid-page__flow-card-header">
              <div className="juce-grid-page__flow-card-heading">
                <span className="juce-grid-page__flow-card-label">{flowLabel}</span>
                <div className="juce-grid-page__flow-card-copy">
                  <strong>{flowTitle}</strong>
                  <p>{flowSummary}</p>
                </div>
              </div>

              <div className="juce-grid-page__flow-card-meta">
                {isActive && <Tag type="blue">Selected</Tag>}
                {flowState?.activeAudio && <Tag type="green">Live path</Tag>}
                {!flowState?.activeAudio && flowState?.annotation && (
                  <Tag type="cool-gray">{flowState.annotation}</Tag>
                )}
                {flow.solo && <Tag type="warm-gray">Solo</Tag>}
                {flow.muted && <Tag type="red">Muted</Tag>}
                {flowChain && <Tag type="cool-gray">{flowChain.plugins.length} blocks</Tag>}
                {pluginCpuSum > 0 && (
                  <Tag type={pluginCpuSum >= 50 ? 'red' : 'blue'}>
                    CPU {pluginCpuSum.toFixed(0)}%
                  </Tag>
                )}
              </div>

              <div className="juce-grid-page__flow-card-actions">
                <div className="juce-grid-page__flow-card-input" onClick={(event) => event.stopPropagation()} title={`Dry/Wet: ${flow.dryWetMix}%`}>
                  <NumberInput
                    value={flow.dryWetMix}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
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
                onPluginSelect={(uri) => {
                  selectFlowIndex(index)
                  handlePluginSelect(uri)
                }}
                onToggleBypass={(uri, bypassed) => {
                  if (!flowChain) return
                  bypassMutation.mutate({ chainId: flowChain.id, pluginUri: uri, bypass: bypassed })
                }}
                onDeletePlugin={(uri, position) => {
                  if (!flowChain) return
                  deleteMutation.mutate({
                    chainId: flowChain.id,
                    pluginUri: uri,
                    pluginPosition: position,
                  })
                }}
                onReorderPlugins={(pluginUris) => {
                  if (!flowChain) return
                  reorderMutation.mutate({ chainId: flowChain.id, pluginUris })
                }}
                onAddPlugin={handleAddPlugin}
                audioStatus={audioInterfaceStatus}
                audioOutputStatus={audioOutputStatus}
                pluginLevels={pluginLevels}
                showEndpoints={true}
                onInputPortSelectClick={() => setPortSelectorFlowIndex(index)}
                onOutputPortSelectClick={() => setPortSelectorFlowIndex(index)}
              />
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
          <Tag type={flowState?.activeAudio ? 'green' : flowState?.sidechainKey ? 'purple' : 'cool-gray'}>
            {flowState?.annotation || 'Live path'}
          </Tag>
          {flowState?.secondaryAnnotation && (
            <span className="juce-grid-page__live-path-note">{flowState.secondaryAnnotation}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="juce-grid-page">
      <LandscapePrompt componentId="juce-grid" />
      {!toolbarCollapsed && (
        <div className="juce-grid-page__header-shell">
          <Layer className="juce-grid-page__hero">
            <div className="juce-grid-page__hero-brand">
              <div className="juce-grid-page__hero-mark">
                <JuceGridHeroMark />
              </div>
              <div className="juce-grid-page__hero-copy">
                <div className="juce-grid-page__hero-tags">
                  <Tag type="blue">Audio Grid</Tag>
                  <Tag type={currentChain?.is_active ? 'green' : 'red'}>
                    {currentChain?.is_active ? 'Active chain' : 'Standby chain'}
                  </Tag>
                  <Tag type="gray">{flowSlots.length} flows</Tag>
                  {currentChain && <Tag type="cool-gray">{currentChain.name}</Tag>}
                </div>
                <h1 className="juce-grid-page__title">Audio Grid</h1>
                <p className="juce-grid-page__subtitle">
                  MAP-integrated audio grid editor delivering full JUCE workflow coverage, enabling visual routing, real-time signal graph manipulation, and complete audio processing pipeline control.
                </p>
              </div>
            </div>
            <div className="juce-grid-page__hero-actions">
              <Button size="sm" kind="ghost" onClick={handleAddPlugin}>
                Add plugin
              </Button>
              <Button size="sm" kind="ghost" onClick={() => setShowKeyboardHelp(true)}>
                Shortcuts
              </Button>
            </div>
          </Layer>

          <Layer className="juce-grid-page__toolbar">
            <div className="juce-grid-page__toolbar-row">
              <div className="juce-grid-page__toolbar-buttons">
                <Button size="sm" kind="ghost" onClick={() => undoMutation.mutate()} disabled={!historyStatus?.can_undo}>
                  Undo
                </Button>
                <Button size="sm" kind="ghost" onClick={() => redoMutation.mutate()} disabled={!historyStatus?.can_redo}>
                  Redo
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ['chains'] })
                    queryClient.invalidateQueries({ queryKey: ['plugins', 'discover'] })
                  }}
                  disabled={chainsQuery.isRefetching || pluginsQuery.isRefetching}
                >
                  Refresh
                </Button>
              </div>

              <div className="juce-grid-page__toolbar-status">
                <MidiLearnButton
                  isActive={midiLearnActive}
                  onToggle={() => setMidiLearnActive((prev) => !prev)}
                  position="relative"
                  size="small"
                />
                {midiLearnActive && (
                  <span className="juce-grid-page__midi-status">
                    Listening{lastMidiEvent ? ` · CC ${lastMidiEvent.cc}` : ''}
                  </span>
                )}
                {selectedPlugin && (
                  <Tag type="purple">
                    {getDisplayPluginName(selectedPlugin.name, selectedPlugin.uri)}
                  </Tag>
                )}
                <Button size="sm" kind="tertiary" onClick={() => setToolbarCollapsed(true)}>
                  Collapse
                </Button>
              </div>
            </div>
          </Layer>
        </div>
      )}

      {toolbarCollapsed && (
        <div className="juce-grid-page__collapsed">
          <Button size="sm" kind="ghost" onClick={() => setToolbarCollapsed(false)}>
            Show Audio Grid controls
          </Button>
        </div>
      )}

      {/* Chains Grid - below title */}
      <JuceGridChainManagementCard
        selectedChainId={activeFlow?.chainId}
        onChainSelect={(chainId) => {
          if (activeFlow) {
            updateFlow(activeFlow.id, { chainId })
          }
        }}
        onSelectedChainRemoved={handleChainRemoved}
        flowSlots={flowSlots}
        focusedFlowLabel={activeFlowLabel}
        onToggleSelectedChainActive={handleToggleChainActive}
        onSavePreset={handleSavePreset}
        onLoadPreset={() => setShowPresetBrowser(true)}
        onImportPreset={() => setShowImportDialog(true)}
        onDuplicateChain={handleDuplicateChain}
        onRenameChain={handleRenameChain}
      />

      {isCompactLayout && (
        <Layer className="juce-grid-page__compact-tabs">
          <Tabs
            selectedIndex={Math.max(0, COMPACT_TAB_ORDER.findIndex((tab) => tab.id === compactTab))}
            onChange={({ selectedIndex }) => {
              setCompactRailPanel(null)
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

      {/* Main content area */}
      <div className={`juce-grid-page__workspace ${!isCompactLayout ? 'has-snapshot-rail has-midi-rail' : ''} ${snapshotsPanelExpanded ? 'is-snapshot-rail-expanded' : 'is-snapshot-rail-collapsed'} ${midiPanelExpanded ? 'is-midi-rail-expanded' : 'is-midi-rail-collapsed'}`}>
        {!isCompactLayout && renderSnapshotRail()}

        <main className="juce-grid-page__main">
        {!isCompactLayout && <JuceGridClusterPanel />}
        {!isCompactLayout && <JuceGridFlowAssignmentPanel />}

        {/* Signal Routing Topology Diagram */}
        <Layer className="juce-grid-page__routing-shell">
          {renderRoutingSurface(false)}
        </Layer>

        {/* Multi-flow signal grids */}
        <section className="juce-grid-page__slot-grid" aria-label="Signal flows">
          {renderLivePathSummaryCard()}

          {livePathLayout.groups.map((group) => (
            <Layer
              key={group.id}
              className={`juce-grid-page__live-path-group juce-grid-page__live-path-group--${group.kind} ${group.tone === 'dim' ? 'is-dim' : ''}`}
            >
              <div className="juce-grid-page__live-path-group-header">
                <div className="juce-grid-page__live-path-group-copy">
                  <strong>{group.title}</strong>
                  <p>
                    {group.entryLabel && group.exitLabel
                      ? `${group.entryLabel} to ${group.exitLabel}`
                      : 'Current live routing context'}
                  </p>
                </div>
                <div className="juce-grid-page__compact-tags">
                  {group.entryLabel && <Tag type="cool-gray">{group.entryLabel}</Tag>}
                  {group.exitLabel && <Tag type={group.dashed ? 'purple' : 'blue'}>{group.exitLabel}</Tag>}
                </div>
              </div>

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

        {!isCompactLayout && (
          <Layer className="juce-grid-page__editor-shell">
            <JuceGridParameterEditor
              plugin={selectedPlugin}
              meta={selectedPluginMeta}
              onParameterChange={handleParameterChange}
              onParameterChangeEnd={handleParameterChangeEnd}
              onToggleBypass={handleToggleSelectedBypass}
              onRefreshPlugins={handleRefreshPlugins}
              isRefreshing={isRefreshingPlugins}
            />

            {selectedPlugin && selectedPluginMeta && (
              <div className="juce-grid-page__editor-tags">
                {selectedPlugin.format && (
                  <Tag type="blue">
                    {selectedPlugin.format}
                  </Tag>
                )}
                <Tag type="cool-gray">
                  {selectedPluginMeta.in_ports}→{selectedPluginMeta.out_ports}
                </Tag>
                <Tag type="cool-gray">
                  {selectedPluginMeta.parameters?.length || 0} params
                </Tag>
                {getPluginCpu(selectedPlugin.uri) > 0 && (
                  <Tag type={getPluginCpu(selectedPlugin.uri) >= 50 ? 'red' : 'blue'}>
                    CPU {getPluginCpu(selectedPlugin.uri).toFixed(1)}%
                  </Tag>
                )}
                {selectedPlugin.latency_samples && selectedPlugin.latency_samples > 0 && (
                  <Tag type="warm-gray">Latency {selectedPlugin.latency_samples}smp</Tag>
                )}
                {selectedPlugin.latency_compensated && (
                  <Tag type="green">PDC</Tag>
                )}
                {selectedPlugin.sidechain_source && (
                  <Tag type="purple">Sidechain</Tag>
                )}
              </div>
            )}
          </Layer>
        )}
        </main>

        {!isCompactLayout && renderMidiRail()}
      </div>

      {isCompactLayout && (
        <div className="juce-grid-page__compact-shell">
          <aside className="juce-grid-page__compact-workflow-rail" aria-label="Compact workflow rail">
            <Button
              size="sm"
              kind={compactRailPanel === 'snapshots' ? 'secondary' : 'ghost'}
              onClick={() => setCompactRailPanel((previous) => previous === 'snapshots' ? null : 'snapshots')}
            >
              Snapshots
            </Button>
            <Button
              size="sm"
              kind={compactRailPanel === 'midi' ? 'secondary' : 'ghost'}
              onClick={() => setCompactRailPanel((previous) => previous === 'midi' ? null : 'midi')}
            >
              MIDI
            </Button>
          </aside>

          <section className="juce-grid-page__compact-panel">
            {compactRailPanel === 'snapshots' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <h2>Snapshots</h2>
                  <p>Your pinned favorites stay open, while the wider snapshot library stays tucked away until you need it.</p>
                </div>
                {renderSnapshotLibrary()}
              </Layer>
            )}

            {compactRailPanel === 'midi' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <h2>MIDI</h2>
                  <p>MIDI learn, mapping review, and parameter-range adjustments now live on the left rail too.</p>
                </div>
                {renderMidiMappingsWorkspace({ closable: false })}
              </Layer>
            )}

            {compactRailPanel === null && compactTab === 'grid' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <h2>Grid workspace</h2>
                  <p>Primary editing remains in the grid above. Use the other tabs for focused workflow panels.</p>
                </div>
                <div className="juce-grid-page__compact-stack">
                  <JuceGridClusterPanel />
                  <JuceGridFlowAssignmentPanel />
                </div>
              </Layer>
            )}

            {compactRailPanel === null && compactTab === 'editor' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <h2>Editor</h2>
                  <p>{selectedPlugin ? 'Selected block controls are ready.' : 'Select a block in the grid to open its editor.'}</p>
                </div>
                <JuceGridParameterEditor
                  plugin={selectedPlugin}
                  meta={selectedPluginMeta}
                  onParameterChange={handleParameterChange}
                  onParameterChangeEnd={handleParameterChangeEnd}
                  onToggleBypass={handleToggleSelectedBypass}
                  onRefreshPlugins={handleRefreshPlugins}
                  isRefreshing={isRefreshingPlugins}
                />
                {selectedPlugin && selectedPluginMeta && (
                  <div className="juce-grid-page__compact-tags">
                    {selectedPlugin.format && <Tag type="blue">{selectedPlugin.format}</Tag>}
                    <Tag type="cool-gray">{selectedPluginMeta.parameters?.length || 0} params</Tag>
                    <Tag type="cool-gray">{selectedPluginMeta.in_ports}→{selectedPluginMeta.out_ports}</Tag>
                  </div>
                )}
              </Layer>
            )}

            {compactRailPanel === null && compactTab === 'routing' && (
              <Layer className="juce-grid-page__compact-layer juce-grid-page__routing-shell juce-grid-page__routing-shell--compact">
                {renderRoutingSurface(true)}
              </Layer>
            )}

            {compactRailPanel === null && compactTab === 'presets' && (
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

      {showSnapshotCreateModal && (
        <Modal
          open
          size="sm"
          modalHeading="Save snapshot"
          modalLabel="Audio Grid workspace"
          primaryButtonText={createFlowSnapshotMutation.isPending ? 'Saving...' : 'Save snapshot'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={newSnapshotName.trim().length === 0 || createFlowSnapshotMutation.isPending}
          onRequestClose={() => {
            setShowSnapshotCreateModal(false)
            setNewSnapshotName('')
          }}
          onSecondarySubmit={() => {
            setShowSnapshotCreateModal(false)
            setNewSnapshotName('')
          }}
          onRequestSubmit={submitSnapshotCreate}
          selectorPrimaryFocus="#juce-grid-snapshot-name"
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Capture the current multi-flow layout, chain routing, and active block state into the snapshot library.
            </p>
            <TextInput
              id="juce-grid-snapshot-name"
              labelText="Snapshot name"
              value={newSnapshotName}
              onChange={(event) => setNewSnapshotName(event.target.value)}
              placeholder="Friday rehearsal"
            />
          </div>
        </Modal>
      )}

      {snapshotPendingRename && (
        <Modal
          open
          size="sm"
          modalHeading="Rename snapshot"
          modalLabel={snapshotPendingRename.name}
          primaryButtonText={updateFlowSnapshotMutation.isPending ? 'Saving...' : 'Save name'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={snapshotRenameValue.trim().length === 0 || updateFlowSnapshotMutation.isPending}
          onRequestClose={() => {
            setSnapshotPendingRename(null)
            setSnapshotRenameValue('')
          }}
          onSecondarySubmit={() => {
            setSnapshotPendingRename(null)
            setSnapshotRenameValue('')
          }}
          onRequestSubmit={submitSnapshotRename}
          selectorPrimaryFocus="#juce-grid-snapshot-rename"
        >
          <div className="juce-grid-page__form-modal-body">
            <TextInput
              id="juce-grid-snapshot-rename"
              labelText="Snapshot name"
              value={snapshotRenameValue}
              onChange={(event) => setSnapshotRenameValue(event.target.value)}
            />
          </div>
        </Modal>
      )}

      {snapshotPendingProgram && (
        <Modal
          open
          size="sm"
          modalHeading="Snapshot MIDI Program Change"
          modalLabel={snapshotPendingProgram.name}
          primaryButtonText={setFlowSnapshotProgramMutation.isPending ? 'Saving...' : 'Save MIDI PC'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={setFlowSnapshotProgramMutation.isPending}
          onRequestClose={closeSnapshotProgramModal}
          onSecondarySubmit={closeSnapshotProgramModal}
          onRequestSubmit={submitSnapshotProgram}
          selectorPrimaryFocus="#juce-grid-snapshot-program"
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Leave this field empty to clear the assigned Program Change number.
            </p>
            <TextInput
              id="juce-grid-snapshot-program"
              labelText="Program Change number"
              type="number"
              value={snapshotProgramValue}
              onChange={(event) => setSnapshotProgramValue(event.target.value)}
              placeholder="0-127"
            />
          </div>
        </Modal>
      )}

      {snapshotPendingDelete && (
        <Modal
          open
          size="sm"
          modalHeading="Delete snapshot"
          modalLabel={snapshotPendingDelete.name}
          primaryButtonText={deleteFlowSnapshotMutation.isPending ? 'Deleting...' : 'Delete snapshot'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={deleteFlowSnapshotMutation.isPending}
          onRequestClose={() => setSnapshotPendingDelete(null)}
          onSecondarySubmit={() => setSnapshotPendingDelete(null)}
          onRequestSubmit={submitSnapshotDelete}
          danger
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Delete <strong>{snapshotPendingDelete.name}</strong> from the snapshot library. This action cannot be undone.
            </p>
          </div>
        </Modal>
      )}

      {snapshotMorphTarget && (
        <Modal
          open
          size="sm"
          modalHeading="Morph snapshots"
          modalLabel={snapshotMorphTarget.name}
          primaryButtonText={snapshotMorphRunning ? 'Morphing...' : 'Start morph'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={!activeSnapshot || activeSnapshotNeedsUpdate || snapshotMorphRunning}
          onRequestClose={() => {
            if (!snapshotMorphRunning) {
              setSnapshotMorphTarget(null)
            }
          }}
          onSecondarySubmit={() => {
            if (!snapshotMorphRunning) {
              setSnapshotMorphTarget(null)
            }
          }}
          onRequestSubmit={() => {
            void handleSnapshotMorphStart()
          }}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Morph from <strong>{activeSnapshot?.name || 'the current source snapshot'}</strong> into <strong>{snapshotMorphTarget.name}</strong>. This uses the snapshot preview path and finishes by recalling the target snapshot.
            </p>
            {activeSnapshotNeedsUpdate && (
              <p className="juce-grid-page__snapshot-compare-copy">
                Update the active snapshot before starting a morph so the source state is deterministic.
              </p>
            )}
            <TextInput
              id="juce-grid-snapshot-morph-duration"
              labelText="Duration (ms)"
              type="number"
              value={String(snapshotMorphDurationMs)}
              onChange={(event) => {
                const nextValue = Number.parseInt(event.target.value || '0', 10)
                setSnapshotMorphDurationMs(Number.isFinite(nextValue) ? Math.max(250, Math.min(5000, nextValue)) : 1200)
              }}
            />
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
            <div className="juce-grid-page__modal-link">
              <a href="/snapshots">
                <Launch size={14} />
                Browse community snapshots
              </a>
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
          onRequestClose={() => setShowKeyboardHelp(false)}
          onRequestSubmit={() => setShowKeyboardHelp(false)}
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
    </div>
  )
}

export default JuceGridPage
