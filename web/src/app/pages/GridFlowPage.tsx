/**
 * GridFlowPage - Grid-Based Chain Editor (Full Featured)
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

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import {
  GridFour,
  MagnifyingGlass,
  Plus,
  ArrowsClockwise,
  Power,
  FloppyDisk,
  Copy,
  Cpu,
  Clock,
  Stack,
  ArrowsLeftRight,
  Shuffle,
  GitBranch,
  Trash,
  SpeakerHigh,
  SpeakerX,
  ArrowCounterClockwise,
  ArrowClockwise,
  GearSix,
  Sliders,
  Warning,
  CheckCircle,
  Link,
  Headphones,
  FolderOpen,
  DownloadSimple,
  X,
  Star,
  Info,
  Keyboard,
  DotsSixVertical,
  MusicNote,
  PlayCircle,
  CaretDown,
  CaretRight,
  UploadSimple,
  Globe,
  Camera,
} from '@phosphor-icons/react'
import {
  SignalGrid,
  KnobParameterPanel,
  ChainEndpoint,
  GridMidiMappingsPanel,
  GridAutomationTimeline,
  AudioPortSelector,
  FlowSnapshotsPanel,
  ClusterDashboard,
  FlowAssignmentMatrix,
  FlowAssignmentDialog,
  FlowRoutingVisualizer,
  getCategoryConfig,
} from '../components/GridFlow'
import type { AudioInterfaceStatus, MidiMapping, AutomationLane } from '../components/GridFlow'
import { chainsApi, pluginsApi, historyApi, audioApi, metricsApi, flowSnapshotsApi } from '../../map2/api'
import { useToasts } from '../components/Toasts'
import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { usePluginOutputs } from '../hooks/usePluginOutputs'
import { useFlowSnapshots } from '../hooks/useFlowSnapshots'
import MidiLearnButton from '../../map2/components/MIDI/MidiLearnButton'
import { AudioConfigDialog } from '../../map2/components/Audio'
import { PluginDetailsModal } from '../components/PluginDetailsModal'
import { ChainManagementCard } from '../components/ChainManagementCard'
import { NumberInput } from '../components/Controls/NumberInput'
import { ToolbarTooltip } from '../components/GridFlow/ToolbarTooltip'
import { ContextMenu, type ContextMenuItem } from '../components/GridFlow/ContextMenu'
import { ConfirmationDialog } from '../components/GridFlow/ConfirmationDialog'
import { ButtonGroup } from '../components/GridFlow/ButtonGroup'
import { PresetImportDialog } from '../components/presets/PresetImportDialog'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'
import type { Chain, Plugin, HistoryStatus, FlowSnapshotData, ChainSnapshot, ChainsResponse } from '../../map2/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'

const API_BASE = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port
  if (isLocalhost) return '/api'
  if (port === '' || port === '80' || port === '8080') return '/api'
  return `http://${window.location.hostname}:8080/api`
})()

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

// ============================================================================
// Helper Functions
// ============================================================================

function createDefaultFlows(count: number = DEFAULT_FLOW_COUNT): FlowSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `flow-${i}`,
    chainId: null,
    label: SLOT_COLORS[i].label,
    color: SLOT_COLORS[i].color,
    muted: false,
    solo: false,
    dryWetMix: 100,
  }))
}

function createDefaultRouting(): RoutingConfig {
  return {
    mode: 'parallel_blend',
    activeSlotId: 'flow-0',
    blendPositions: {},
    morphProgress: 0.5,
    morphSourceSlotId: null,
    morphTargetSlotId: null,
    seriesOrder: [],
  }
}

// Migration from legacy localStorage format
function migrateLocalStorage(): { slots: FlowSlot[]; routing: RoutingConfig; activeIndex: number } | null {
  const MIGRATION_KEY = 'map2_grid_migrated_v2'

  if (localStorage.getItem(MIGRATION_KEY) === 'true') {
    return null
  }

  try {
    const oldFlows = localStorage.getItem('map2_grid_flows')
    if (oldFlows) {
      const parsed = JSON.parse(oldFlows)
      if (Array.isArray(parsed) && parsed.length >= MIN_FLOWS) {
        // Check if already has new properties
        if (parsed[0].dryWetMix !== undefined) {
          localStorage.setItem(MIGRATION_KEY, 'true')
          return null
        }
        // Migrate old format to new format
        const newSlots: FlowSlot[] = parsed.map((slot: any, i: number) => ({
          id: slot.id || `flow-${i}`,
          chainId: slot.chainId ?? null,
          label: slot.label || SLOT_COLORS[i]?.label || String.fromCharCode(65 + i),
          color: slot.color || SLOT_COLORS[i]?.color || '#2563eb',
          muted: slot.muted ?? false,
          solo: false,
          dryWetMix: 100,
        }))

        const newRouting = createDefaultRouting()
        newRouting.seriesOrder = newSlots.map(s => s.id)

        localStorage.setItem('map2_grid_flows_v2', JSON.stringify(newSlots))
        localStorage.setItem('map2_grid_routing_v2', JSON.stringify(newRouting))
        localStorage.setItem('map2_grid_active_v2', '0')
        localStorage.setItem(MIGRATION_KEY, 'true')

        return { slots: newSlots, routing: newRouting, activeIndex: 0 }
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

// ============================================================================
// Main Component
// ============================================================================

export function GridFlowPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  // Run migration on mount
  useEffect(() => {
    migrateLocalStorage()
  }, [])

  // Flow slots state (with migration support)
  const [flowSlots, setFlowSlots] = useState<FlowSlot[]>(() => {
    const migrated = migrateLocalStorage()
    if (migrated) return migrated.slots

    const saved = localStorage.getItem('map2_grid_flows_v2')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length >= MIN_FLOWS) {
          return parsed
        }
      } catch {}
    }
    return createDefaultFlows()
  })

  // Routing state
  const [routing, setRouting] = useState<RoutingConfig>(() => {
    const saved = localStorage.getItem('map2_grid_routing_v2')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {}
    }
    return createDefaultRouting()
  })

  // Active flow index
  const [activeFlowIndex, setActiveFlowIndex] = useState(() => {
    const saved = localStorage.getItem('map2_grid_active_v2')
    if (saved) {
      const idx = parseInt(saved, 10)
      if (!isNaN(idx)) return idx
    }
    return 0
  })

  // UI State
  const [selectedPluginUri, setSelectedPluginUri] = useState<string | null>(null)
  const [showPluginBrowser, setShowPluginBrowser] = useState(false)
  const [showPresetBrowser, setShowPresetBrowser] = useState(false)
  const [showAudioConfig, setShowAudioConfig] = useState(false)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedFlowForAssignment, setSelectedFlowForAssignment] = useState<FlowSlot | null>(null)
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
      return localStorage.getItem('map2_grid_plugin_category') || 'all'
    } catch { return 'all' }
  })

  // Collapsible Categories State
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const val = localStorage.getItem('map2_grid_collapsed_categories')
      return val ? new Set(JSON.parse(val)) : new Set()
    } catch { return new Set() }
  })

  // MIDI Mappings Panel State
  const [midiMappingsPanelOpen, setMidiMappingsPanelOpen] = useState(false)
  const [midiMappings, setMidiMappings] = useState<MidiMapping[]>([])

  // Automation Timeline State
  const [automationTimelineExpanded, setAutomationTimelineExpanded] = useState(false)

  // Flow Snapshots Panel State
  const [snapshotsPanelExpanded, setSnapshotsPanelExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('map2_grid_snapshots_panel')
      return saved !== null ? saved === 'true' : true // Default to expanded
    } catch { return true }
  })
  const [isCreatingFavorite, setIsCreatingFavorite] = useState(false)
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

  // Context Menus
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number }
    items: ContextMenuItem[]
  } | null>(null)

  // Undo/Redo Stack Visibility
  const [showUndoStack, setShowUndoStack] = useState(false)
  const [showRedoStack, setShowRedoStack] = useState(false)

  // Quick Presets Dropdown
  const [showQuickPresets, setShowQuickPresets] = useState(false)

  // Preset Import Dialog
  const [showImportDialog, setShowImportDialog] = useState(false)

  // Routing Preview
  const [routingPreview, setRoutingPreview] = useState<RoutingMode | null>(null)

  // MIDI Learn Feedback
  const [lastMidiEvent, setLastMidiEvent] = useState<{ cc: number; value: number } | null>(null)

  // Batch Operations
  const [batchMode, setBatchMode] = useState(false)
  const [selectedPluginUris, setSelectedPluginUris] = useState<Set<string>>(new Set())

  // Confirmation Dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string | React.ReactNode
    variant: 'danger' | 'warning' | 'info'
    confirmLabel: string
    cancelLabel: string
    onConfirm: () => void | Promise<void>
    onCancel: () => void
    isLoading: boolean
  } | null>(null)

  // Toolbar Customization
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('map2_toolbar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const [hiddenButtons, setHiddenButtons] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('map2_toolbar_hidden_buttons')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Flow Drag-and-Drop
  const [draggedFlowId, setDraggedFlowId] = useState<string | null>(null)
  const [dragOverFlowId, setDragOverFlowId] = useState<string | null>(null)

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem('map2_grid_flows_v2', JSON.stringify(flowSlots))
  }, [flowSlots])

  useEffect(() => {
    localStorage.setItem('map2_grid_routing_v2', JSON.stringify(routing))
  }, [routing])

  useEffect(() => {
    localStorage.setItem('map2_grid_active_v2', String(activeFlowIndex))
  }, [activeFlowIndex])

  // Persist toolbar collapsed state
  useEffect(() => {
    try {
      localStorage.setItem('map2_toolbar_collapsed', String(toolbarCollapsed))
    } catch {}
  }, [toolbarCollapsed])

  // Persist hidden buttons
  useEffect(() => {
    try {
      localStorage.setItem('map2_toolbar_hidden_buttons', JSON.stringify([...hiddenButtons]))
    } catch {}
  }, [hiddenButtons])

  // Persist snapshots panel state
  useEffect(() => {
    try {
      localStorage.setItem('map2_grid_snapshots_panel', String(snapshotsPanelExpanded))
    } catch {}
  }, [snapshotsPanelExpanded])

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
        // Restore flow slots
        setFlowSlots(event.snapshot_data.flowSlots.map(s => ({
          id: s.id,
          chainId: s.chainId,
          label: s.label,
          color: s.color,
          muted: s.muted,
          solo: s.solo,
          dryWetMix: s.dryWetMix,
        })))

        // Restore routing
        setRouting({
          mode: event.snapshot_data.routing.mode,
          activeSlotId: event.snapshot_data.routing.activeSlotId,
          blendPositions: event.snapshot_data.routing.blendPositions,
          morphProgress: event.snapshot_data.routing.morphProgress,
          morphSourceSlotId: event.snapshot_data.routing.morphSourceSlotId,
          morphTargetSlotId: event.snapshot_data.routing.morphTargetSlotId,
          seriesOrder: event.snapshot_data.routing.seriesOrder,
        })

        // Restore active flow index
        setActiveFlowIndex(event.snapshot_data.activeFlowIndex)

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
    localStorage.setItem('map2_grid_plugin_category', selectedCategory)
  }, [selectedCategory])

  // Persist collapsed categories
  useEffect(() => {
    localStorage.setItem('map2_grid_collapsed_categories', JSON.stringify([...collapsedCategories]))
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

  // Flow Snapshots: Quick favorite - auto-create snapshot with timestamp name
  const handleQuickFavorite = useCallback(async () => {
    if (isCreatingFavorite) return

    setIsCreatingFavorite(true)
    try {
      const now = new Date()
      const timestamp = now.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).replace(/[/,]/g, '-').replace(/\s+/g, ' ')
      const name = `Favorite ${timestamp}`

      const currentStateData = captureCurrentState()
      await flowSnapshotsApi.create({
        name,
        description: 'Quick favorite from toolbar',
        snapshot_data: currentStateData,
      })

      // Mark as favorite immediately after creation
      const listResult = await flowSnapshotsApi.list()
      const newSnapshot = listResult.snapshots.find(s => s.name === name)
      if (newSnapshot) {
        await flowSnapshotsApi.update(newSnapshot.id, { is_favorite: true })
      }

      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast(`Saved: ${name}`, 'success')
    } catch (error) {
      console.error('Failed to create favorite snapshot:', error)
      pushToast('Failed to save favorite', 'error')
    } finally {
      setIsCreatingFavorite(false)
    }
  }, [isCreatingFavorite, captureCurrentState, queryClient, pushToast])

  // Flow Snapshots: Handle snapshot loaded (from UI or MIDI PC)
  // Note: The backend applies plugin parameters and bypass states directly to the engine.
  // This handler only needs to update frontend UI state.
  const handleSnapshotLoaded = useCallback((data: FlowSnapshotData) => {
    // Debug: log incoming snapshot data
    console.log('[Snapshot Load] Received data:', JSON.stringify({
      flowSlotsCount: data.flowSlots?.length,
      flowSlots: data.flowSlots,
      routing: data.routing,
      activeFlowIndex: data.activeFlowIndex,
      chainsCount: Object.keys(data.chains || {}).length,
    }, null, 2))

    // Restore flow slots
    const restoredSlots = data.flowSlots.map(s => ({
      id: s.id,
      chainId: s.chainId,
      label: s.label,
      color: s.color,
      muted: s.muted,
      solo: s.solo,
      dryWetMix: s.dryWetMix,
    }))
    console.log('[Snapshot Load] Setting flowSlots:', restoredSlots)
    setFlowSlots(restoredSlots)

    // Restore routing
    setRouting({
      mode: data.routing.mode,
      activeSlotId: data.routing.activeSlotId,
      blendPositions: data.routing.blendPositions,
      morphProgress: data.routing.morphProgress,
      morphSourceSlotId: data.routing.morphSourceSlotId,
      morphTargetSlotId: data.routing.morphTargetSlotId,
      seriesOrder: data.routing.seriesOrder,
    })

    // Restore active flow index
    setActiveFlowIndex(data.activeFlowIndex)

    // Refresh chains data to reflect parameter changes applied by backend
    queryClient.invalidateQueries({ queryKey: ['chains'] })

    pushToast('Flow snapshot loaded', 'success')
  }, [pushToast, queryClient])

  const activeFlow = flowSlots[activeFlowIndex]
  const currentChain = useMemo(() => {
    if (!activeFlow) return null
    return chains.find(c => c.id === activeFlow.chainId) || null
  }, [chains, activeFlow])

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
      console.warn('[GridFlowPage] Plugin metadata not found for URI:', selectedPluginUri)
      console.warn('[GridFlowPage] Available URIs:', Object.keys(pluginMeta).slice(0, 5), '...')
      console.warn('[GridFlowPage] pluginsQuery status:', pluginsQuery.status, 'data count:', pluginsQuery.data?.plugins?.length ?? 0)
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
    return plugins.filter(p => {
      const matchCategory = selectedCategory === 'all' || p.category === selectedCategory
      const matchSearch = !pluginSearchQuery.trim() ||
        p.name.toLowerCase().includes(pluginSearchQuery.toLowerCase()) ||
        p.category?.toLowerCase().includes(pluginSearchQuery.toLowerCase()) ||
        p.author?.toLowerCase().includes(pluginSearchQuery.toLowerCase())
      return matchCategory && matchSearch
    })
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

  // Compute audio interface status
  // Get port routing data
  const portRouting = routingQuery.data
  const portsInfo = portsQuery.data

  const activeFlowChain = useMemo(() => {
    const slot = flowSlots[activeFlowIndex]
    return slot ? chains.find(c => c.id === slot.chainId) : undefined
  }, [flowSlots, activeFlowIndex, chains])

  const audioInterfaceStatus: AudioInterfaceStatus = useMemo(() => ({
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
  const audioOutputStatus: AudioInterfaceStatus = useMemo(() => ({
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

  const deleteMutation = useMutation({
    mutationFn: ({ chainId, pluginUri, pluginPosition }: { chainId: number; pluginUri: string; pluginPosition?: number }) =>
      chainsApi.removePlugin(chainId, pluginUri, pluginPosition),
    onSuccess: (_, variables) => {
      updateChainPluginsCache(variables.chainId, (plugins) => {
        if (typeof variables.pluginPosition !== 'number') {
          return plugins.filter((plugin) => plugin.uri !== variables.pluginUri)
        }
        return plugins.filter(
          (plugin) => !(plugin.uri === variables.pluginUri && plugin.position === variables.pluginPosition)
        )
      })
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setSelectedPluginUri(null)
      pushToast('Plugin removed', 'success')
    },
    onError: (error) => pushToast(`Failed to remove: ${error}`, 'error'),
  })

  const addPluginMutation = useMutation({
    mutationFn: ({ chainId, pluginUri }: { chainId: number; pluginUri: string }) =>
      chainsApi.addPlugin(chainId, pluginUri),
    onSuccess: (data, variables) => {
      if (typeof data.plugin_position === 'number') {
        const meta = pluginMeta[variables.pluginUri]
        updateChainPluginsCache(variables.chainId, (plugins) => {
          const alreadyPresent = plugins.some(
            (plugin) =>
              plugin.uri === variables.pluginUri && plugin.position === data.plugin_position
          )
          if (alreadyPresent) {
            return plugins
          }

          const nextPlugin: Chain['plugins'][number] = {
            uri: variables.pluginUri,
            name: meta?.name ?? variables.pluginUri,
            position: data.plugin_position,
            bypassed: false,
            parameters: {},
            in_ports: meta?.in_ports,
            out_ports: meta?.out_ports,
            format: meta?.format,
          }

          return [...plugins, nextPlugin].sort((a, b) => a.position - b.position)
        })
      }
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setShowPluginBrowser(false)
      setPluginSearchQuery('')
      pushToast('Plugin added', 'success')
    },
    onError: (error) => pushToast(`Failed to add: ${error}`, 'error'),
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
      pushToast('Preset deleted', 'success')
    },
    onError: (error) => pushToast(`Failed to delete preset: ${error}`, 'error'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ chainId, name }: { chainId: number; name: string }) =>
      chainsApi.rename(chainId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
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

  const updateFlow = useCallback((flowId: string, updates: Partial<FlowSlot>) => {
    setFlowSlots(prev => prev.map(f => f.id === flowId ? { ...f, ...updates } : f))
  }, [])

  const openAssignmentDialog = useCallback((flow: FlowSlot) => {
    setSelectedFlowForAssignment(flow)
    setAssignmentDialogOpen(true)
  }, [])

  const handleAssignFlow = useCallback(async (nodeId: string, redundancyEnabled: boolean) => {
    if (!selectedFlowForAssignment) return
    if (!selectedFlowForAssignment.chainId) {
      pushToast('Assign a chain to this flow first', 'error')
      return
    }

    try {
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
      setAssignmentDialogOpen(false)
      setSelectedFlowForAssignment(null)
      queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
    } catch (error) {
      pushToast('Failed to assign flow', 'error')
    }
  }, [selectedFlowForAssignment, pushToast, queryClient])

  // Routing
  const setRoutingMode = useCallback((mode: RoutingMode) => {
    setRouting(prev => ({ ...prev, mode }))
  }, [])

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
  }, [])

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
    const presetName = prompt('Enter preset name:', `${currentChain.name} Preset`)
    if (presetName) {
      chainsApi.savePreset(currentChain.id, presetName)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
          pushToast(`Preset "${presetName}" saved`, 'success')
        })
        .catch((error) => pushToast(`Failed to save: ${error}`, 'error'))
    }
  }, [currentChain, pushToast, queryClient])

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
    const newName = prompt('Enter new name:', currentChain.name)
    if (newName && newName !== currentChain.name) {
      renameMutation.mutate({ chainId: currentChain.id, name: newName })
    }
  }, [currentChain, renameMutation])

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

  // Category toggle for collapsible categories
  const toggleCategory = useCallback((categoryName: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryName)) {
        next.delete(categoryName)
      } else {
        next.add(categoryName)
      }
      return next
    })
  }, [])

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

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

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
          setActiveFlowIndex(index)
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
        if (showPluginBrowser) setShowPluginBrowser(false)
        else if (showPresetBrowser) setShowPresetBrowser(false)
        else if (showAudioConfig) setShowAudioConfig(false)
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
    flowSlots, showPluginBrowser, showPresetBrowser, showAudioConfig,
    showKeyboardHelp, detailsPlugin, handleSavePreset, toggleFavorite,
  ])

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="grid-flow-page">
      <LandscapePrompt componentId="grid-flow" />
      {/* Unified Header/Toolbar */}
      {!toolbarCollapsed && (
        <header className="grid-flow-header">
          {/* Left: Title + Chain Controls */}
          <div className="grid-flow-header-left grid-toolbar-section">
            <div className="grid-toolbar-section-label">CHAIN & PRESETS</div>
            <div className="grid-flow-title">
              <GridFour size={24} weight="duotone" />
              <h1>Grid Editor</h1>
            </div>

            <div className="grid-header-divider" />

            {/* Chain Controls */}
            <ToolbarTooltip content="Activate/Deactivate Chain" shortcut={currentChain?.is_active ? '' : ''}>
              <button
                className={`grid-header-btn ${currentChain?.is_active ? 'active power' : ''}`}
                onClick={handleToggleChainActive}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({
                    position: { x: e.clientX, y: e.clientY },
                    items: [
                      { label: 'Activate', icon: <Power size={14} weight="duotone" />, onClick: () => currentChain && activateMutation.mutate(currentChain.id), disabled: !currentChain || currentChain.is_active },
                      { label: 'Deactivate', icon: <Power size={14} weight="duotone" />, onClick: () => currentChain && deactivateMutation.mutate(currentChain.id), disabled: !currentChain || !currentChain.is_active },
                      { separator: true },
                      { label: 'Rename', icon: <Info size={14} weight="duotone" />, onClick: handleRenameChain, disabled: !currentChain },
                    ],
                  })
                }}
                disabled={!currentChain}
              >
                <Power size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            <ToolbarTooltip content="Save Preset" shortcut="S">
              <button
                className="grid-header-btn"
                onClick={handleSavePreset}
                disabled={!currentChain}
              >
                <FloppyDisk size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            <ToolbarTooltip content="Load Preset" shortcut="">
              <button
                className="grid-header-btn"
                onClick={() => setShowPresetBrowser(true)}
              >
                <FolderOpen size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            <ToolbarTooltip content="Import Preset (FXP, VST3, LV2)" shortcut="">
              <button
                className="grid-header-btn"
                onClick={() => setShowImportDialog(true)}
              >
                <UploadSimple size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            <ToolbarTooltip content="Duplicate Chain" shortcut="">
              <button
                className="grid-header-btn"
                onClick={handleDuplicateChain}
                disabled={!currentChain}
              >
                <Copy size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            <div className="grid-header-divider" />

            {/* MIDI Learn */}
            <MidiLearnButton
              isActive={midiLearnActive}
              onToggle={() => setMidiLearnActive(prev => !prev)}
              position="relative"
              size="small"
            />

            {midiLearnActive && (
              <div className="midi-learn-indicator">
                <div className="midi-learn-pulse" />
                <span className="midi-learn-status">
                  Listening... {lastMidiEvent && `CC ${lastMidiEvent.cc}`}
                </span>
              </div>
            )}
          </div>

          {/* Center: Routing */}
          <div className="grid-flow-header-center grid-toolbar-section">
            <div className="grid-toolbar-section-label">SIGNAL ROUTING</div>
            {/* Routing Mode */}
            <div className="grid-toolbar-routing">
              <span className="grid-toolbar-routing-label">Routing</span>
              <div className="grid-toolbar-routing-modes">
                <ToolbarTooltip content="Series (Sequential)" shortcut="">
                  <button
                    className={`grid-toolbar-route-btn ${routing.mode === 'series' ? 'active' : ''}`}
                    onClick={() => setRoutingMode('series')}
                    onMouseEnter={() => setRoutingPreview('series')}
                    onMouseLeave={() => setRoutingPreview(null)}
                  >
                    <ArrowsLeftRight size={14} weight="duotone" />
                  </button>
                </ToolbarTooltip>
                <ToolbarTooltip content="Parallel Blend" shortcut="">
                  <button
                    className={`grid-toolbar-route-btn ${routing.mode === 'parallel_blend' ? 'active' : ''}`}
                    onClick={() => setRoutingMode('parallel_blend')}
                    onMouseEnter={() => setRoutingPreview('parallel_blend')}
                    onMouseLeave={() => setRoutingPreview(null)}
                  >
                    <GitBranch size={14} weight="duotone" />
                  </button>
                </ToolbarTooltip>
                <ToolbarTooltip content="A/B Switch" shortcut="">
                  <button
                    className={`grid-toolbar-route-btn ${routing.mode === 'ab_switch' ? 'active' : ''}`}
                    onClick={() => setRoutingMode('ab_switch')}
                    onMouseEnter={() => setRoutingPreview('ab_switch')}
                    onMouseLeave={() => setRoutingPreview(null)}
                  >
                    <Shuffle size={14} weight="duotone" />
                  </button>
                </ToolbarTooltip>
                <ToolbarTooltip content="Parameter Morph" shortcut="">
                  <button
                    className={`grid-toolbar-route-btn ${routing.mode === 'parameter_morph' ? 'active' : ''}`}
                    onClick={() => setRoutingMode('parameter_morph')}
                    onMouseEnter={() => setRoutingPreview('parameter_morph')}
                    onMouseLeave={() => setRoutingPreview(null)}
                  >
                    <GearSix size={14} weight="duotone" />
                  </button>
                </ToolbarTooltip>
                <ToolbarTooltip content="Sidechain View" shortcut="">
                  <button
                    className={`grid-toolbar-route-btn ${routing.mode === 'sidechain' ? 'active' : ''}`}
                    onClick={() => setRoutingMode('sidechain')}
                    onMouseEnter={() => setRoutingPreview('sidechain')}
                    onMouseLeave={() => setRoutingPreview(null)}
                  >
                    <Link size={14} weight="duotone" />
                  </button>
                </ToolbarTooltip>
              </div>
            </div>

            {/* Flow Selection for A/B Mode */}
            {routing.mode === 'ab_switch' && (
              <div className="grid-toolbar-flow-selector">
                <span className="grid-toolbar-flow-selector-label">Flow:</span>
                {flowSlots.slice(0, 4).map((slot, idx) => (
                  <button
                    key={slot.id}
                    className={`grid-toolbar-flow-btn ${routing.activeSlotId === slot.id ? 'active' : ''}`}
                    style={{ '--flow-color': slot.color } as React.CSSProperties}
                    onClick={() => setRouting(prev => ({ ...prev, activeSlotId: slot.id }))}
                  >
                    {SLOT_COLORS[idx]?.label || String.fromCharCode(65 + idx)}
                  </button>
                ))}
              </div>
            )}

            {/* Morph value (when in morph mode) */}
            {routing.mode === 'parameter_morph' && (
              <div className="grid-toolbar-morph">
                <div className="grid-toolbar-morph-labels">
                  <span className="grid-toolbar-morph-label-start">
                    {routing.morphSourceSlotId
                      ? flowSlots.find(s => s.id === routing.morphSourceSlotId)?.label
                      : 'A'}
                  </span>
                  <NumberInput
                    label="Morph"
                    value={routing.morphProgress * 100}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onChange={(v) => setMorphProgress(v / 100)}
                    size="small"
                    inline
                  />
                  <span className="grid-toolbar-morph-label-end">
                    {routing.morphTargetSlotId
                      ? flowSlots.find(s => s.id === routing.morphTargetSlotId)?.label
                      : 'B'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="grid-flow-header-right grid-toolbar-section">
            <div className="grid-toolbar-section-label">UTILITIES</div>
            {/* Undo/Redo */}
            <div className="grid-toolbar-history-wrapper">
              <ToolbarTooltip content={`${historyStatus?.next_undo || 'Undo'}`} shortcut="Ctrl+Z">
                <button
                  className="grid-header-btn"
                  onClick={() => undoMutation.mutate()}
                  onMouseEnter={() => setShowUndoStack(true)}
                  onMouseLeave={() => setShowUndoStack(false)}
                  disabled={!historyStatus?.can_undo}
                >
                  <ArrowCounterClockwise size={18} weight="duotone" />
                </button>
              </ToolbarTooltip>
              {showUndoStack && historyStatus?.undo_stack && (
                <div className="toolbar-history-stack">
                  <div className="toolbar-history-stack-title">Undo History</div>
                  {historyStatus.undo_stack.slice(-5).reverse().map((entry, idx) => (
                    <button
                      key={idx}
                      className="toolbar-history-stack-item"
                      onClick={() => {
                        for (let i = 0; i <= idx; i++) {
                          undoMutation.mutate()
                        }
                        setShowUndoStack(false)
                      }}
                    >
                      {entry || 'Action'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid-toolbar-history-wrapper">
              <ToolbarTooltip content={`${historyStatus?.next_redo || 'Redo'}`} shortcut="Ctrl+Y">
                <button
                  className="grid-header-btn"
                  onClick={() => redoMutation.mutate()}
                  onMouseEnter={() => setShowRedoStack(true)}
                  onMouseLeave={() => setShowRedoStack(false)}
                  disabled={!historyStatus?.can_redo}
                >
                  <ArrowClockwise size={18} weight="duotone" />
                </button>
              </ToolbarTooltip>
              {showRedoStack && historyStatus?.redo_stack && (
                <div className="toolbar-history-stack">
                  <div className="toolbar-history-stack-title">Redo History</div>
                  {historyStatus.redo_stack.slice(-5).reverse().map((entry, idx) => (
                    <button
                      key={idx}
                      className="toolbar-history-stack-item"
                      onClick={() => {
                        for (let i = 0; i <= idx; i++) {
                          redoMutation.mutate()
                        }
                        setShowRedoStack(false)
                      }}
                    >
                      {entry || 'Action'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid-header-divider" />

            {/* Audio Config */}
            <ToolbarTooltip content="Audio Settings" shortcut="">
              <button
                className="grid-header-btn"
                onClick={() => setShowAudioConfig(true)}
              >
                <Sliders size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            {/* Refresh */}
            <ToolbarTooltip content="Refresh Plugin List" shortcut="">
              <button
                className="grid-header-btn"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['chains'] })
                  queryClient.invalidateQueries({ queryKey: ['plugins', 'discover'] })
                }}
                disabled={chainsQuery.isRefetching || pluginsQuery.isRefetching}
              >
                {(chainsQuery.isRefetching || pluginsQuery.isRefetching) ? (
                  <span className="spin">↻</span>
                ) : (
                  <ArrowsClockwise size={18} weight="duotone" />
                )}
              </button>
            </ToolbarTooltip>

            <div className="grid-header-divider" />

            {/* MIDI Mappings */}
            <ToolbarTooltip content="MIDI Mappings" shortcut="">
              <button
                className={`grid-header-btn ${midiMappingsPanelOpen ? 'active' : ''}`}
                onClick={() => setMidiMappingsPanelOpen(!midiMappingsPanelOpen)}
              >
                <MusicNote size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            {/* Automation Timeline */}
            <ToolbarTooltip content="Automation Timeline" shortcut="">
              <button
                className={`grid-header-btn ${automationTimelineExpanded ? 'active' : ''}`}
                onClick={() => setAutomationTimelineExpanded(!automationTimelineExpanded)}
              >
                <PlayCircle size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            {/* Quick Favorite (Auto-snapshot) */}
            <ToolbarTooltip content="Favorite Current State" shortcut="">
              <button
                className="grid-header-btn favorite-btn"
                onClick={handleQuickFavorite}
                disabled={isCreatingFavorite}
              >
                <Star size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            {/* Snapshots Panel Toggle */}
            <ToolbarTooltip content="Flow Snapshots Panel" shortcut="">
              <button
                className={`grid-header-btn ${snapshotsPanelExpanded ? 'active' : ''}`}
                onClick={() => setSnapshotsPanelExpanded(!snapshotsPanelExpanded)}
              >
                <Camera size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            <div className="grid-header-divider" />

            {/* Keyboard Help */}
            <ToolbarTooltip content="Keyboard Shortcuts" shortcut="?">
              <button
                className="grid-header-btn"
                onClick={() => setShowKeyboardHelp(true)}
              >
                <Keyboard size={18} weight="duotone" />
              </button>
            </ToolbarTooltip>

            {/* Toolbar Collapse */}
            <ToolbarTooltip content="Collapse Toolbar" shortcut="">
              <button
                className="grid-header-btn"
                onClick={() => setToolbarCollapsed(true)}
              >
                <CaretRight size={18} weight="bold" />
              </button>
            </ToolbarTooltip>
          </div>
        </header>
      )}

      {/* Collapsed Toolbar */}
      {toolbarCollapsed && (
        <div className="grid-flow-header-collapsed">
          <button className="grid-flow-header-collapsed-btn" onClick={() => setToolbarCollapsed(false)}>
            <GridFour size={18} weight="duotone" />
            <span>Show Toolbar</span>
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <ConfirmationDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          isLoading={confirmDialog.isLoading}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}

      {/* Chains Grid - below title */}
      <ChainManagementCard
        selectedChainId={activeFlow?.chainId}
        onChainSelect={(chainId) => {
          if (activeFlow) {
            updateFlow(activeFlow.id, { chainId })
          }
        }}
        flowSlots={flowSlots}
      />

      {/* Main content area */}
      <main className="grid-flow-main">
        <ClusterDashboard />
        <FlowAssignmentMatrix />

        {/* Signal Routing Topology Diagram */}
        <div style={{
          padding: '12px 24px 4px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <FlowRoutingVisualizer
            mode={routing.mode}
            flows={flowSlots.map((slot, i) => ({
              id: slot.id,
              label: SLOT_COLORS[i]?.label || slot.label,
              color: SLOT_COLORS[i]?.color || slot.color,
              muted: slot.muted,
              active: routing.activeSlotId === slot.id,
              blendPercent: routing.blendPositions[slot.id] ?? 100,
            }))}
            morphProgress={routing.morphProgress}
            activeFlowId={routing.activeSlotId}
            morphSourceId={routing.morphSourceSlotId}
            morphTargetId={routing.morphTargetSlotId}
            compact={flowSlots.length > 4}
          />
        </div>

        {/* Multi-flow signal grids */}
        <div className="grid-flow-slots">
          {flowSlots.map((flow, index) => {
            const flowChain = getChainForFlow(flow)
            const isActive = activeFlowIndex === index
            const pluginCpuSum = flowChain?.plugins.reduce((sum, p) => sum + (getPluginCpu(p.uri) || 0), 0) || 0

            return (
              <div
                key={flow.id}
                className={`grid-flow-slot ${isActive ? 'active' : ''} ${flow.muted ? 'muted' : ''} ${flow.solo ? 'solo' : ''} ${draggedFlowId === flow.id ? 'dragging' : ''} ${dragOverFlowId === flow.id ? 'drag-over' : ''}`}
                style={{ '--flow-color': SLOT_COLORS[index]?.color || flow.color } as React.CSSProperties}
                onClick={() => setActiveFlowIndex(index)}
                draggable
                onDragStart={(e) => {
                  setDraggedFlowId(flow.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (draggedFlowId && draggedFlowId !== flow.id) {
                    setDragOverFlowId(flow.id)
                  }
                }}
                onDragLeave={() => {
                  setDragOverFlowId(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (!draggedFlowId || draggedFlowId === flow.id) {
                    setDraggedFlowId(null)
                    setDragOverFlowId(null)
                    return
                  }

                  const draggedIndex = flowSlots.findIndex(s => s.id === draggedFlowId)
                  const dropIndex = flowSlots.findIndex(s => s.id === flow.id)

                  if (draggedIndex !== -1 && dropIndex !== -1) {
                    const newSlots = [...flowSlots]
                    const [draggedSlot] = newSlots.splice(draggedIndex, 1)
                    newSlots.splice(dropIndex, 0, draggedSlot)
                    setFlowSlots(newSlots)
                  }

                  setDraggedFlowId(null)
                  setDragOverFlowId(null)
                }}
                onDragEnd={() => {
                  setDraggedFlowId(null)
                  setDragOverFlowId(null)
                }}
              >
                {/* Drag Handle */}
                <div className="grid-flow-slot-drag-handle">
                  <DotsSixVertical size={16} weight="duotone" />
                </div>

                {/* Vertical title on the left */}
                <div className="grid-flow-slot-title">
                  <GitBranch size={14} weight="duotone" />
                  <span>Flow</span>
                </div>

                {/* Flow content wrapper */}
                <div className="grid-flow-slot-body">
                  {/* Flow Header */}
                  <div className="grid-flow-slot-header">
                  <span className="grid-flow-slot-label">{SLOT_COLORS[index]?.label || String.fromCharCode(65 + index)}</span>

                  {/* Slot info badges */}
                  {flowChain && (
                    <div className="grid-flow-slot-badges">
                      <span className="grid-badge" title={`${flowChain.plugins.length} plugins`}>
                        {flowChain.plugins.length}P
                      </span>
                      {pluginCpuSum > 0 && (
                        <span className="grid-badge cpu" title={`CPU: ${pluginCpuSum.toFixed(1)}%`}>
                          {pluginCpuSum.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid-flow-slot-actions">
                    {/* Dry/Wet input */}
                    <div onClick={(e) => e.stopPropagation()} title={`Dry/Wet: ${flow.dryWetMix}%`}>
                      <NumberInput
                        value={flow.dryWetMix}
                        min={0}
                        max={100}
                        step={1}
                        unit="%"
                        onChange={(v) => updateFlow(flow.id, { dryWetMix: v })}
                        size="small"
                        showLabel={false}
                      />
                    </div>

                    {/* Assign button */}
                    <button
                      className="grid-flow-slot-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        openAssignmentDialog(flow)
                      }}
                      title="Assign flow to node"
                    >
                      <Link size={14} weight="duotone" />
                    </button>

                    {/* Solo button */}
                    <button
                      className={`grid-flow-slot-btn ${flow.solo ? 'solo-active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateFlow(flow.id, { solo: !flow.solo })
                      }}
                      title={flow.solo ? 'Unsolo' : 'Solo'}
                    >
                      <Headphones size={14} weight="duotone" />
                    </button>

                    {/* Mute button */}
                    <button
                      className={`grid-flow-slot-btn ${flow.muted ? 'muted-active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateFlow(flow.id, { muted: !flow.muted })
                      }}
                      title={flow.muted ? 'Unmute' : 'Mute'}
                    >
                      {flow.muted ? <SpeakerX size={14} weight="duotone" /> : <SpeakerHigh size={14} weight="duotone" />}
                    </button>

                    {/* Delete flow */}
                    {flowSlots.length > MIN_FLOWS && (
                      <button
                        className="grid-flow-slot-btn delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFlow(flow.id)
                        }}
                        title={`Delete flow ${SLOT_COLORS[index]?.label || String.fromCharCode(65 + index)}`}
                      >
                        <Trash size={14} weight="duotone" />
                      </button>
                    )}
                  </div>
                </div>

                  {/* Signal Grid */}
                  <div className="grid-flow-slot-content">
                    <SignalGrid
                      chain={flowChain || null}
                      pluginMeta={pluginMeta}
                      selectedPluginUri={isActive ? selectedPluginUri : null}
                      onPluginSelect={(uri) => {
                        setActiveFlowIndex(index)
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
                      onAddPluginDirect={(uri) => {
                        if (!flowChain) return
                        addPluginMutation.mutate({ chainId: flowChain.id, pluginUri: uri })
                      }}
                      audioStatus={audioInterfaceStatus}
                      audioOutputStatus={audioOutputStatus}
                      pluginLevels={pluginLevels}
                      showEndpoints={true}
                      onInputPortSelectClick={() => setPortSelectorFlowIndex(index)}
                      onOutputPortSelectClick={() => setPortSelectorFlowIndex(index)}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Parameter panel */}
        <div className="grid-flow-param-area">
          <KnobParameterPanel
            plugin={selectedPlugin}
            meta={selectedPluginMeta}
            onParameterChange={handleParameterChange}
            onParameterChangeEnd={handleParameterChangeEnd}
            onToggleBypass={handleToggleSelectedBypass}
            onRefreshPlugins={handleRefreshPlugins}
            isRefreshing={isRefreshingPlugins}
          />

          {/* Plugin info badges when selected */}
          {selectedPlugin && selectedPluginMeta && (
            <div className="grid-plugin-info-badges">
              {/* Format badge */}
              {selectedPlugin.format && (
                <span className={`grid-info-badge format-${selectedPlugin.format?.toLowerCase()}`}>
                  {selectedPlugin.format}
                </span>
              )}

              {/* Port config */}
              <span className="grid-info-badge">
                {selectedPluginMeta.in_ports}→{selectedPluginMeta.out_ports}
              </span>

              {/* Parameter count */}
              <span className="grid-info-badge">
                {selectedPluginMeta.parameters?.length || 0} params
              </span>

              {/* CPU */}
              {getPluginCpu(selectedPlugin.uri) > 0 && (
                <span className="grid-info-badge cpu">
                  <Cpu size={10} weight="duotone" /> {getPluginCpu(selectedPlugin.uri).toFixed(1)}%
                </span>
              )}

              {/* Latency */}
              {selectedPlugin.latency_samples && selectedPlugin.latency_samples > 0 && (
                <span className="grid-info-badge latency">
                  <Clock size={10} weight="duotone" /> {selectedPlugin.latency_samples}smp
                </span>
              )}

              {/* PDC */}
              {selectedPlugin.latency_compensated && (
                <span className="grid-info-badge pdc">
                  <CheckCircle size={10} weight="bold" /> PDC
                </span>
              )}

              {/* Sidechain */}
              {selectedPlugin.sidechain_source && (
                <span className="grid-info-badge sidechain">
                  <Link size={10} weight="duotone" /> SC
                </span>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Plugin Browser Modal */}
      {showPluginBrowser && (
        <div className="grid-flow-modal-overlay" onClick={() => setShowPluginBrowser(false)}>
          <div className="grid-flow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="grid-flow-modal-header">
              <h2>Add Plugin</h2>
              <button onClick={() => setShowPluginBrowser(false)}><X size={20} weight="bold" /></button>
            </div>
            <div className="grid-flow-modal-search">
              <MagnifyingGlass size={16} weight="duotone" />
              <input
                type="text"
                placeholder="Search plugins..."
                value={pluginSearchQuery}
                onChange={(e) => setPluginSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {/* Category Filter Tabs */}
            <div className="grid-flow-modal-categories">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`grid-flow-modal-category-btn ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  style={cat !== 'all' ? { borderColor: getCategoryConfig(cat).color + '60' } : undefined}
                >
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>

            {/* Collapse/Expand controls */}
            <div className="grid-flow-modal-list-controls">
              <button onClick={expandAllCategories}>Expand All</button>
              <button onClick={collapseAllCategories}>Collapse All</button>
            </div>

            <div className="grid-flow-modal-list">
              {/* Core Integrated Capabilities - Always at top, never collapsed */}
              {nativeProcessors.length > 0 && (
                <div className="grid-flow-modal-native-section">
                  <div className="grid-flow-modal-native-header">
                    <Cpu size={16} weight="duotone" />
                    <span>Core Integrated</span>
                    <span className="grid-flow-modal-native-badge">Zero Latency</span>
                  </div>
                  <div className="grid-flow-modal-native-grid">
                    {nativeProcessors.map((plugin) => {
                      const catConfig = getCategoryConfig(plugin.category)
                      const displayName = getDisplayPluginName(plugin.name, plugin.uri)
                      return (
                        <button
                          key={plugin.uri}
                          className="grid-flow-modal-native-item"
                          onClick={() => {
                            if (currentChain) {
                              addPluginMutation.mutate({ chainId: currentChain.id, pluginUri: plugin.uri })
                            }
                          }}
                          style={{ '--accent': catConfig.color } as React.CSSProperties}
                        >
                          <span className="grid-flow-modal-native-name">{displayName}</span>
                          <span className="grid-flow-modal-native-category" style={{ color: catConfig.color }}>
                            {plugin.category}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* LV2 Plugin Library - Grouped by category, all collapsible */}
              {groupedPlugins.length > 0 && (
                <div className="grid-flow-modal-lv2-section">
                  <div className="grid-flow-modal-lv2-header">
                    <Stack size={14} weight="duotone" />
                    <span>LV2 Plugin Library</span>
                    <span className="grid-flow-modal-lv2-count">{lv2Plugins.length} plugins</span>
                  </div>
                </div>
              )}

              {/* LV2 Plugins - Grouped by category with collapse/expand */}
              {groupedPlugins.map(([category, plugins]) => {
                const catConfig = getCategoryConfig(category)
                const isCollapsed = collapsedCategories.has(category)

                return (
                  <div key={category} className="grid-flow-modal-category-group">
                    <button
                      className="grid-flow-modal-category-header"
                      onClick={() => toggleCategory(category)}
                      style={{ borderLeftColor: catConfig.color }}
                    >
                      {isCollapsed ? <CaretRight size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
                      <span style={{ color: catConfig.color }}>{category}</span>
                      <span className="grid-flow-modal-category-count">{plugins.length}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="grid-flow-modal-category-items">
                        {plugins.map((plugin) => (
                          <div
                            key={plugin.uri}
                            className={`grid-flow-modal-item ${favoritePlugins.has(plugin.uri) ? 'favorite' : ''}`}
                          >
                            {/* Favorite button */}
                            <button
                              className={`grid-flow-modal-item-fav ${favoritePlugins.has(plugin.uri) ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFavorite(plugin.uri)
                              }}
                              title={favoritePlugins.has(plugin.uri) ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <Star size={14} weight="duotone" fill={favoritePlugins.has(plugin.uri) ? 'currentColor' : 'none'} />
                            </button>

                            {/* Main plugin button */}
                            <button
                              className="grid-flow-modal-item-main"
                              onClick={() => {
                                if (currentChain) {
                                  addPluginMutation.mutate({ chainId: currentChain.id, pluginUri: plugin.uri })
                                }
                              }}
                            >
                              <span className="grid-flow-modal-item-name">{getDisplayPluginName(plugin.name, plugin.uri)}</span>
                              <span className="grid-flow-modal-item-meta">
                                <span
                                  className="grid-flow-modal-item-category"
                                  style={{ color: catConfig.color }}
                                >
                                  {plugin.category}
                                </span>
                                {plugin.author && <span className="grid-flow-modal-item-author">{sanitizeRestrictedDisplayText(plugin.author)}</span>}
                              </span>
                            </button>

                            {/* Info button */}
                            <button
                              className="grid-flow-modal-item-info"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleShowDetails(plugin)
                              }}
                              title="View plugin details"
                            >
                              <Info size={14} weight="duotone" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Preset Browser Modal */}
      {showPresetBrowser && (
        <div className="grid-flow-modal-overlay" onClick={() => setShowPresetBrowser(false)}>
          <div className="grid-flow-modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: '400px' }}>
            <div className="grid-flow-modal-header">
              <h2>Load Preset</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  className="grid-header-btn"
                  onClick={() => {
                    setShowPresetBrowser(false)
                    setShowImportDialog(true)
                  }}
                  title="Import from file (FXP, VST3, LV2, etc.)"
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <UploadSimple size={14} weight="duotone" />
                  <span style={{ fontSize: '0.8rem' }}>Import</span>
                </button>
                <button onClick={() => setShowPresetBrowser(false)}><X size={20} weight="bold" /></button>
              </div>
            </div>
            <div className="grid-flow-modal-list">
              {presets.length === 0 ? (
                <div className="grid-flow-modal-empty">
                  <p>No presets saved</p>
                  <p style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '8px' }}>
                    Press <kbd>S</kbd> to save current chain, or import from file
                  </p>
                </div>
              ) : (
                presets.map((preset) => (
                  <div key={preset.id} className="grid-flow-modal-item preset-item">
                    <button
                      className="grid-flow-preset-load"
                      onClick={() => loadPresetMutation.mutate(preset.id)}
                    >
                      <DownloadSimple size={16} weight="duotone" />
                      <span className="grid-flow-modal-item-name">{preset.name}</span>
                    </button>
                    <button
                      className="grid-flow-preset-delete"
                      onClick={() => {
                        if (confirm(`Delete preset "${preset.name}"?`)) {
                          deletePresetMutation.mutate(preset.id)
                        }
                      }}
                      title="Delete preset"
                    >
                      <Trash size={14} weight="duotone" />
                    </button>
                  </div>
                ))
              )}
            </div>
            {/* Footer with community link */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border, #333)',
              display: 'flex',
              justifyContent: 'center',
            }}>
              <a
                href="/presets"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--accent, #60a5fa)',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                }}
              >
                <Globe size={14} weight="duotone" />
                Browse Community Presets
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Preset Import Dialog */}
      <PresetImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportSuccess={(presetId, name) => {
          queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
          pushToast(`Imported "${name}" successfully`, 'success')
        }}
      />

      <FlowAssignmentDialog
        isOpen={assignmentDialogOpen}
        flowId={selectedFlowForAssignment?.id ?? null}
        chainId={selectedFlowForAssignment?.chainId ?? null}
        availableNodes={clusterNodesQuery.data?.nodes ?? []}
        onAssign={handleAssignFlow}
        onCancel={() => setAssignmentDialogOpen(false)}
      />

      {/* Audio Config Dialog */}
      <AudioConfigDialog
        open={showAudioConfig}
        onClose={() => setShowAudioConfig(false)}
        currentConfig={{
          deviceId: 'default',
          sampleRate: jackMetrics?.sample_rate ?? 48000,
          bufferSize: jackMetrics?.buffer_size ?? 256,
        }}
        devices={[{
          id: 'default',
          name: audioStatus?.engine ?? 'Default Audio Device',
          inputChannels: 2,
          outputChannels: 2,
          supportedSampleRates: [44100, 48000, 96000],
          isDefault: true,
        }]}
        onApply={async (config) => {
          try {
            const result = await audioApi.configure({
              sampleRate: config.sampleRate,
              bufferSize: config.bufferSize,
            })
            pushToast(`Audio configured: ${result.current_config.sample_rate}Hz, ${result.current_config.buffer_size} samples`, 'success')
            setShowAudioConfig(false)
          } catch (err) {
            pushToast(err instanceof Error ? err.message : 'Failed to apply audio config', 'error')
          }
        }}
      />

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
        <div className="grid-flow-modal-overlay" onClick={() => setShowKeyboardHelp(false)}>
          <div className="grid-flow-modal keyboard-help" onClick={(e) => e.stopPropagation()}>
            <div className="grid-flow-modal-header">
              <h2>Keyboard Shortcuts</h2>
              <button onClick={() => setShowKeyboardHelp(false)}><X size={20} weight="bold" /></button>
            </div>
            <div className="grid-flow-keyboard-help">
              <div className="keyboard-help-section">
                <h3>Navigation</h3>
                <div className="keyboard-help-row">
                  <kbd>1</kbd> - <kbd>6</kbd>
                  <span>Select flow slot</span>
                </div>
                <div className="keyboard-help-row">
                  <kbd>←</kbd> <kbd>→</kbd>
                  <span>Navigate plugins</span>
                </div>
                <div className="keyboard-help-row">
                  <kbd>Esc</kbd>
                  <span>Close modal / Deselect</span>
                </div>
              </div>

              <div className="keyboard-help-section">
                <h3>Plugin Actions</h3>
                <div className="keyboard-help-row">
                  <kbd>A</kbd>
                  <span>Add plugin</span>
                </div>
                <div className="keyboard-help-row">
                  <kbd>B</kbd>
                  <span>Toggle bypass</span>
                </div>
                <div className="keyboard-help-row">
                  <kbd>Del</kbd> / <kbd>⌫</kbd>
                  <span>Remove plugin</span>
                </div>
                <div className="keyboard-help-row">
                  <kbd>I</kbd>
                  <span>Show plugin info</span>
                </div>
                <div className="keyboard-help-row">
                  <kbd>F</kbd>
                  <span>Toggle favorite</span>
                </div>
              </div>

              <div className="keyboard-help-section">
                <h3>Chain Actions</h3>
                <div className="keyboard-help-row">
                  <kbd>S</kbd>
                  <span>Save preset</span>
                </div>
                <div className="keyboard-help-row">
                  <kbd>Ctrl</kbd> + <kbd>Z</kbd>
                  <span>Undo</span>
                </div>
                <div className="keyboard-help-row">
                  <kbd>Ctrl</kbd> + <kbd>Y</kbd>
                  <span>Redo</span>
                </div>
              </div>

              <div className="keyboard-help-section">
                <h3>General</h3>
                <div className="keyboard-help-row">
                  <kbd>?</kbd>
                  <span>Toggle this help</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MIDI Mappings Side Panel */}
      {midiMappingsPanelOpen && (
        <div className="grid-flow-midi-panel">
          <GridMidiMappingsPanel
            mappings={midiMappings}
            onClose={() => setMidiMappingsPanelOpen(false)}
            onDelete={(id) => setMidiMappings(prev => prev.filter(m => m.id !== id))}
            onUpdate={(id, updates) => setMidiMappings(prev =>
              prev.map(m => m.id === id ? { ...m, ...updates } : m)
            )}
          />
        </div>
      )}

      {/* Lane Picker Modal */}
      {lanePickerOpen && (
        <div className="grid-flow-modal-overlay" onClick={() => setLanePickerOpen(false)}>
          <div className="grid-flow-modal lane-picker" onClick={(e) => e.stopPropagation()}>
            <div className="grid-flow-modal-header">
              <h2>Add Automation Lane</h2>
              <button onClick={() => setLanePickerOpen(false)}><X size={20} weight="bold" /></button>
            </div>
            <div className="grid-flow-lane-picker-content">
              <p className="grid-flow-lane-picker-hint">Select a parameter to automate:</p>
              {currentChain?.plugins && currentChain.plugins.length > 0 ? (
                <div className="grid-flow-lane-picker-plugins">
                  {currentChain.plugins.map((plugin) => (
                    <div key={plugin.uri} className="grid-flow-lane-picker-plugin">
                      <div className="grid-flow-lane-picker-plugin-name">{getDisplayPluginName(plugin.name, plugin.uri)}</div>
                      <div className="grid-flow-lane-picker-params">
                        {Object.entries(plugin.parameters || {}).map(([symbol, value]) => {
                          const param = { symbol, value }
                          const laneColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD']
                          return (
                            <button
                              key={param.symbol}
                              className="grid-flow-lane-picker-param"
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
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="grid-flow-lane-picker-empty">
                  No plugins in the active flow. Add plugins first to create automation lanes.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Flow Palette - Snapshots + Flow Actions */}
      <div className="grid-flow-palette">
        {/* Flow Action Buttons */}
        <div className="grid-flow-palette-actions">
          <button
            className="grid-flow-palette-btn new-flow"
            onClick={addFlow}
            disabled={flowSlots.length >= MAX_FLOWS}
            title="Add new flow"
          >
            <Plus size={20} weight="bold" />
          </button>
          <button
            className="grid-flow-palette-btn clear-flows"
            onClick={() => {
              if (confirm('Clear all flows and start fresh?')) {
                clearFlows()
              }
            }}
            disabled={flowSlots.length <= 1}
            title="Clear all flows"
          >
            <Trash size={18} weight="duotone" />
          </button>
        </div>

        {/* Flow Snapshots Panel */}
        <FlowSnapshotsPanel
          currentState={captureCurrentState()}
          onSnapshotLoaded={handleSnapshotLoaded}
          expanded={snapshotsPanelExpanded}
          onToggleExpanded={() => setSnapshotsPanelExpanded(!snapshotsPanelExpanded)}
        />
      </div>

      {/* Automation Timeline Bottom Panel */}
      {automationTimelineExpanded && (
        <div className="grid-flow-automation-panel">
          <GridAutomationTimeline
            lanes={automationLanes}
            isPlaying={automationPlaying}
            isRecording={automationRecording}
            loopEnabled={automationLoopEnabled}
            currentTime={automationCurrentTime}
            duration={automationDuration}
            onPlay={() => setAutomationPlaying(!automationPlaying)}
            onStop={() => {
              setAutomationPlaying(false)
              setAutomationRecording(false)
              setAutomationCurrentTime(0)
            }}
            onRecord={() => {
              setAutomationRecording(!automationRecording)
              if (!automationPlaying) setAutomationPlaying(true)
            }}
            onToggleLoop={() => setAutomationLoopEnabled(!automationLoopEnabled)}
            onSeek={(time) => setAutomationCurrentTime(time)}
            onAddLane={() => setLanePickerOpen(true)}
            onDeleteLane={(laneId) => setAutomationLanes(prev => prev.filter(l => l.id !== laneId))}
            onToggleLaneEnabled={(laneId) => setAutomationLanes(prev =>
              prev.map(l => l.id === laneId ? { ...l, enabled: !l.enabled } : l)
            )}
            onToggleLaneArmed={(laneId) => setAutomationLanes(prev =>
              prev.map(l => l.id === laneId ? { ...l, armed: !l.armed } : l)
            )}
          />
        </div>
      )}

      {/* Unified Audio Port Selector — per-flow or global */}
      <AudioPortSelector
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
      <footer className="grid-flow-footer">
        <div
          className={`grid-footer-item ${cpuStatus}`}
          title={`CPU: ${cpuMetrics.totalCpuPercent.toFixed(1)}%`}
        >
          <Cpu size={12} weight="duotone" />
          <span>{cpuMetrics.totalCpuPercent.toFixed(0)}%</span>
        </div>

        {jackMetrics && (
          <div className="grid-footer-item" title={`Buffer: ${jackMetrics.buffer_size} @ ${jackMetrics.sample_rate}Hz`}>
            <Clock size={12} weight="duotone" />
            <span>{((jackMetrics.buffer_size / jackMetrics.sample_rate) * 1000).toFixed(1)}ms</span>
          </div>
        )}

        {hasXruns && (
          <div className="grid-footer-item warning" title={`${cpuMetrics.xrunCount} XRuns`}>
            <Warning size={12} weight="duotone" />
            <span>{cpuMetrics.xrunCount}</span>
          </div>
        )}

        <div className="grid-footer-item">
          <Stack size={12} weight="duotone" />
          <span>{flowSlots.length} Flows</span>
        </div>
      </footer>
    </div>
  )
}

export default GridFlowPage
