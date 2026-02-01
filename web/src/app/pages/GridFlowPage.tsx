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
import {
  LayoutGrid,
  Search,
  Plus,
  RefreshCw,
  Power,
  Save,
  Copy,
  Cpu,
  Clock,
  Layers,
  ArrowRightLeft,
  Shuffle,
  GitBranch,
  Trash2,
  Volume2,
  VolumeX,
  Undo2,
  Redo2,
  Settings2,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Headphones,
  FolderOpen,
  Download,
  X,
  Star,
  Info,
  Keyboard,
  GripVertical,
  Music,
  PlayCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import {
  SignalGrid,
  KnobParameterPanel,
  ChainEndpoint,
  GridMidiMappingsPanel,
  GridAutomationTimeline,
  getCategoryConfig,
} from '../components/GridFlow'
import type { AudioInterfaceStatus, MidiMapping, AutomationLane } from '../components/GridFlow'
import { chainsApi, pluginsApi, historyApi, audioApi, metricsApi } from '../../map2/api'
import { useToasts } from '../components/Toasts'
import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { usePluginOutputs } from '../hooks/usePluginOutputs'
import MidiLearnButton from '../../map2/components/MIDI/MidiLearnButton'
import { AudioConfigDialog } from '../../map2/components/Audio'
import { PluginDetailsModal } from '../components/PluginDetailsModal'
import { ChainManagementCard } from '../components/ChainManagementCard'
import type { Chain, Plugin, HistoryStatus } from '../../map2/types'

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
  { label: 'A', color: '#00d4ff', bg: 'rgba(0, 212, 255, 0.15)' },
  { label: 'B', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  { label: 'C', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  { label: 'D', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  { label: 'E', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
  { label: 'F', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
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
          color: slot.color || SLOT_COLORS[i]?.color || '#00d4ff',
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
  const [pluginSearchQuery, setPluginSearchQuery] = useState('')
  const [midiLearnActive, setMidiLearnActive] = useState(false)

  // Enhanced UI State
  const [detailsPlugin, setDetailsPlugin] = useState<Plugin | null>(null)
  const [favoritePlugins, setFavoritePlugins] = useState<Set<string>>(new Set())
  const [pluginLevels, setPluginLevels] = useState<Record<string, { in: number; out: number }>>({})
  const [wetDryMixes, setWetDryMixes] = useState<Record<string, number>>({})
  const [draggedPluginUri, setDraggedPluginUri] = useState<string | null>(null)
  const [dragOverPluginUri, setDragOverPluginUri] = useState<string | null>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)

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
  const [automationPlaying, setAutomationPlaying] = useState(false)
  const [automationRecording, setAutomationRecording] = useState(false)
  const [automationLoopEnabled, setAutomationLoopEnabled] = useState(false)
  const [automationCurrentTime, setAutomationCurrentTime] = useState(0)
  const [automationDuration, setAutomationDuration] = useState(60)
  const [automationLanes, setAutomationLanes] = useState<AutomationLane[]>([])

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

  // ============================================================================
  // Queries
  // ============================================================================

  // Fetch chains
  const chainsQuery = useQuery({
    queryKey: ['chains'],
    queryFn: chainsApi.list,
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
    queryFn: chainsApi.listPresets,
  })

  // Fetch audio status
  const audioQuery = useQuery({
    queryKey: ['audio', 'status'],
    queryFn: audioApi.getStatus,
    refetchInterval: 5000,
  })

  // Fetch JACK metrics
  const jackQuery = useQuery({
    queryKey: ['metrics', 'jack'],
    queryFn: metricsApi.getJack,
    refetchInterval: 2000,
  })

  // CPU metrics hook
  const { metrics: cpuMetrics, status: cpuStatus, hasXruns, getPluginCpu } = useCPUMetrics({
    useWebSocket: true,
    pollingInterval: 500,
  })

  // Plugin output metering hook
  const { outputPorts: pluginOutputPorts, peaks: pluginPeaks, connected: outputsConnected } = usePluginOutputs()

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
    return pluginMeta[selectedPluginUri] || null
  }, [selectedPluginUri, pluginMeta])

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

  // Group plugins by category for collapsible display
  const groupedPlugins = useMemo(() => {
    const groups: Record<string, Plugin[]> = {}
    const favoritesList: Plugin[] = []

    filteredPlugins.forEach(p => {
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
  }, [filteredPlugins, favoritePlugins])

  // Compute audio interface status
  const audioInterfaceStatus: AudioInterfaceStatus = useMemo(() => ({
    deviceName: audioStatus?.engine || 'JACK Audio',
    sampleRate: jackMetrics?.sample_rate || 48000,
    bufferSize: jackMetrics?.buffer_size || 256,
    latencyMs: jackMetrics ? (jackMetrics.buffer_size / jackMetrics.sample_rate) * 1000 * 2 : 5.3,
    channels: 2,
    cpuLoad: cpuMetrics.totalCpuPercent,
    xruns: cpuMetrics.xrunCount,
    isRunning: audioStatus?.running ?? true,
  }), [audioStatus, jackMetrics, cpuMetrics])

  // ============================================================================
  // Mutations
  // ============================================================================

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
    mutationFn: ({ chainId, pluginUri }: { chainId: number; pluginUri: string }) =>
      chainsApi.removePlugin(chainId, pluginUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setSelectedPluginUri(null)
      pushToast('Plugin removed', 'success')
    },
    onError: (error) => pushToast(`Failed to remove: ${error}`, 'error'),
  })

  const addPluginMutation = useMutation({
    mutationFn: ({ chainId, pluginUri }: { chainId: number; pluginUri: string }) =>
      chainsApi.addPlugin(chainId, pluginUri),
    onSuccess: () => {
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

  const updateFlow = useCallback((flowId: string, updates: Partial<FlowSlot>) => {
    setFlowSlots(prev => prev.map(f => f.id === flowId ? { ...f, ...updates } : f))
  }, [])

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

  const handleDeletePlugin = useCallback((uri: string) => {
    if (!currentChain) return
    deleteMutation.mutate({ chainId: currentChain.id, pluginUri: uri })
  }, [currentChain, deleteMutation])

  const handleReorderPlugins = useCallback((pluginUris: string[]) => {
    if (!currentChain) return
    reorderMutation.mutate({ chainId: currentChain.id, pluginUris })
  }, [currentChain, reorderMutation])

  const handleAddPlugin = useCallback(() => {
    setShowPluginBrowser(true)
  }, [])

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
      .then(() => {
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
        deleteMutation.mutate({ chainId: currentChain.id, pluginUri: selectedPlugin.uri })
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
      {/* Header */}
      <header className="grid-flow-header">
        <div className="grid-flow-title">
          <LayoutGrid size={24} />
          <h1>Grid Editor</h1>
        </div>

        {/* System Status */}
        <div className="grid-flow-status">
          {/* CPU Status */}
          <div
            className={`grid-status-item ${cpuStatus}`}
            title={`CPU: ${cpuMetrics.totalCpuPercent.toFixed(1)}%`}
          >
            <Cpu size={14} />
            <span>{cpuMetrics.totalCpuPercent.toFixed(0)}%</span>
          </div>

          {/* Latency */}
          {jackMetrics && (
            <div className="grid-status-item" title={`Buffer: ${jackMetrics.buffer_size} @ ${jackMetrics.sample_rate}Hz`}>
              <Clock size={14} />
              <span>{((jackMetrics.buffer_size / jackMetrics.sample_rate) * 1000).toFixed(1)}ms</span>
            </div>
          )}

          {/* XRuns */}
          {hasXruns && (
            <div className="grid-status-item warning" title={`${cpuMetrics.xrunCount} XRuns`}>
              <AlertTriangle size={14} />
              <span>{cpuMetrics.xrunCount}</span>
            </div>
          )}

          {/* Flow count */}
          <div className="grid-status-item">
            <Layers size={14} />
            <span>{flowSlots.length} Flows</span>
          </div>
        </div>

        {/* Header Actions */}
        <div className="grid-flow-header-actions">
          {/* Undo */}
          <button
            className="grid-header-btn"
            onClick={() => undoMutation.mutate()}
            disabled={!historyStatus?.can_undo}
            title={historyStatus?.next_undo || 'Undo'}
          >
            <Undo2 size={18} />
          </button>

          {/* Redo */}
          <button
            className="grid-header-btn"
            onClick={() => redoMutation.mutate()}
            disabled={!historyStatus?.can_redo}
            title={historyStatus?.next_redo || 'Redo'}
          >
            <Redo2 size={18} />
          </button>

          <div className="grid-header-divider" />

          {/* Audio Config */}
          <button
            className="grid-header-btn"
            onClick={() => setShowAudioConfig(true)}
            title="Audio Settings"
          >
            <Sliders size={18} />
          </button>

          {/* Refresh */}
          <button
            className="grid-header-btn"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['chains'] })
              queryClient.invalidateQueries({ queryKey: ['plugins'] })
            }}
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>

          <div className="grid-header-divider" />

          {/* MIDI Mappings */}
          <button
            className={`grid-header-btn ${midiMappingsPanelOpen ? 'active' : ''}`}
            onClick={() => setMidiMappingsPanelOpen(!midiMappingsPanelOpen)}
            title="MIDI Mappings"
          >
            <Music size={18} />
          </button>

          {/* Automation Timeline */}
          <button
            className={`grid-header-btn ${automationTimelineExpanded ? 'active' : ''}`}
            onClick={() => setAutomationTimelineExpanded(!automationTimelineExpanded)}
            title="Automation Timeline"
          >
            <PlayCircle size={18} />
          </button>

          <div className="grid-header-divider" />

          {/* Keyboard Help */}
          <button
            className="grid-header-btn"
            onClick={() => setShowKeyboardHelp(true)}
            title="Keyboard Shortcuts (?)"
          >
            <Keyboard size={18} />
          </button>
        </div>
      </header>

      {/* Main content area */}
      <main className="grid-flow-main">
        {/* Multi-flow signal grids */}
        <div className="grid-flow-slots">
          {flowSlots.map((flow, index) => {
            const flowChain = getChainForFlow(flow)
            const isActive = activeFlowIndex === index
            const pluginCpuSum = flowChain?.plugins.reduce((sum, p) => sum + (getPluginCpu(p.uri) || 0), 0) || 0

            return (
              <div
                key={flow.id}
                className={`grid-flow-slot ${isActive ? 'active' : ''} ${flow.muted ? 'muted' : ''} ${flow.solo ? 'solo' : ''}`}
                style={{ '--flow-color': flow.color } as React.CSSProperties}
                onClick={() => setActiveFlowIndex(index)}
              >
                {/* Flow Header */}
                <div className="grid-flow-slot-header">
                  <span className="grid-flow-slot-label">{flow.label}</span>

                  {/* Chain selector */}
                  <select
                    className="grid-flow-slot-select"
                    value={flow.chainId ?? ''}
                    onChange={(e) => {
                      e.stopPropagation()
                      updateFlow(flow.id, { chainId: e.target.value ? Number(e.target.value) : null })
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">Select chain...</option>
                    {chains.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.is_active ? '●' : ''}
                      </option>
                    ))}
                  </select>

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
                    {/* Dry/Wet slider */}
                    <input
                      type="range"
                      className="grid-flow-slot-drywet"
                      min={0}
                      max={100}
                      value={flow.dryWetMix}
                      onChange={(e) => {
                        e.stopPropagation()
                        updateFlow(flow.id, { dryWetMix: Number(e.target.value) })
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title={`Dry/Wet: ${flow.dryWetMix}%`}
                    />

                    {/* Solo button */}
                    <button
                      className={`grid-flow-slot-btn ${flow.solo ? 'solo-active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateFlow(flow.id, { solo: !flow.solo })
                      }}
                      title={flow.solo ? 'Unsolo' : 'Solo'}
                    >
                      <Headphones size={14} />
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
                      {flow.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>

                    {/* Delete flow */}
                    {flowSlots.length > MIN_FLOWS && (
                      <button
                        className="grid-flow-slot-btn delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFlow(flow.id)
                        }}
                        title={`Delete flow ${flow.label}`}
                      >
                        <Trash2 size={14} />
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
                    onToggleBypass={handleToggleBypass}
                    onDeletePlugin={handleDeletePlugin}
                    onReorderPlugins={handleReorderPlugins}
                    onAddPlugin={handleAddPlugin}
                    audioStatus={audioInterfaceStatus}
                    pluginLevels={pluginLevels}
                    showEndpoints={isActive}
                  />
                </div>
              </div>
            )
          })}

          {/* Add Flow Button */}
          {flowSlots.length < MAX_FLOWS && (
            <button className="grid-flow-add-btn" onClick={addFlow} title="Add new flow">
              <Plus size={24} />
              <span>Add Flow</span>
            </button>
          )}
        </div>

        {/* Routing Toolbar */}
        <div className="grid-flow-toolbar">
          {/* Left: Chain Controls */}
          <div className="grid-flow-toolbar-left">
            <button
              className={`grid-toolbar-btn power ${currentChain?.is_active ? 'active' : ''}`}
              onClick={handleToggleChainActive}
              disabled={!currentChain}
              title={currentChain?.is_active ? 'Deactivate' : 'Activate'}
            >
              <Power size={16} />
              <span>{currentChain?.is_active ? 'Active' : 'Inactive'}</span>
            </button>

            <div className="grid-toolbar-divider" />

            <button
              className="grid-toolbar-btn"
              onClick={handleSavePreset}
              disabled={!currentChain}
              title="Save Preset"
            >
              <Save size={16} />
            </button>

            <button
              className="grid-toolbar-btn"
              onClick={() => setShowPresetBrowser(true)}
              title="Load Preset"
            >
              <FolderOpen size={16} />
            </button>

            <button
              className="grid-toolbar-btn"
              onClick={handleDuplicateChain}
              disabled={!currentChain}
              title="Duplicate"
            >
              <Copy size={16} />
            </button>

            {/* MIDI Learn */}
            <div className="grid-toolbar-divider" />
            <MidiLearnButton
              isActive={midiLearnActive}
              onToggle={() => setMidiLearnActive(prev => !prev)}
              position="relative"
              size="small"
            />
          </div>

          {/* Center: Chain Info */}
          <div className="grid-flow-toolbar-center">
            {currentChain && (
              <div className="grid-chain-info" onClick={handleRenameChain} title="Click to rename">
                <span className="grid-chain-name">{currentChain.name}</span>
                <span className="grid-chain-stats">
                  {currentChain.plugins.length} plugins
                </span>
              </div>
            )}
          </div>

          {/* Right: Routing Mode */}
          <div className="grid-flow-toolbar-right">
            <div className="grid-toolbar-routing">
              <span className="grid-toolbar-routing-label">Routing</span>
              <div className="grid-toolbar-routing-modes">
                <button
                  className={`grid-toolbar-route-btn ${routing.mode === 'series' ? 'active' : ''}`}
                  onClick={() => setRoutingMode('series')}
                  title="Series (Sequential)"
                >
                  <ArrowRightLeft size={14} />
                </button>
                <button
                  className={`grid-toolbar-route-btn ${routing.mode === 'parallel_blend' ? 'active' : ''}`}
                  onClick={() => setRoutingMode('parallel_blend')}
                  title="Parallel Blend"
                >
                  <GitBranch size={14} />
                </button>
                <button
                  className={`grid-toolbar-route-btn ${routing.mode === 'ab_switch' ? 'active' : ''}`}
                  onClick={() => setRoutingMode('ab_switch')}
                  title="A/B Switch"
                >
                  <Shuffle size={14} />
                </button>
                <button
                  className={`grid-toolbar-route-btn ${routing.mode === 'parameter_morph' ? 'active' : ''}`}
                  onClick={() => setRoutingMode('parameter_morph')}
                  title="Parameter Morph"
                >
                  <Settings2 size={14} />
                </button>
                <button
                  className={`grid-toolbar-route-btn ${routing.mode === 'sidechain' ? 'active' : ''}`}
                  onClick={() => setRoutingMode('sidechain')}
                  title="Sidechain View"
                >
                  <Link2 size={14} />
                </button>
              </div>
            </div>

            {/* Morph slider (when in morph mode) */}
            {routing.mode === 'parameter_morph' && (
              <div className="grid-toolbar-morph">
                <span>Morph</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={routing.morphProgress * 100}
                  onChange={(e) => setMorphProgress(Number(e.target.value) / 100)}
                />
                <span>{(routing.morphProgress * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Parameter panel */}
        <div className="grid-flow-param-area">
          <KnobParameterPanel
            plugin={selectedPlugin}
            meta={selectedPluginMeta}
            onParameterChange={handleParameterChange}
            onParameterChangeEnd={handleParameterChangeEnd}
            onToggleBypass={handleToggleSelectedBypass}
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
                  <Cpu size={10} /> {getPluginCpu(selectedPlugin.uri).toFixed(1)}%
                </span>
              )}

              {/* Latency */}
              {selectedPlugin.latency_samples && selectedPlugin.latency_samples > 0 && (
                <span className="grid-info-badge latency">
                  <Clock size={10} /> {selectedPlugin.latency_samples}smp
                </span>
              )}

              {/* PDC */}
              {selectedPlugin.latency_compensated && (
                <span className="grid-info-badge pdc">
                  <CheckCircle2 size={10} /> PDC
                </span>
              )}

              {/* Sidechain */}
              {selectedPlugin.sidechain_source && (
                <span className="grid-info-badge sidechain">
                  <Link2 size={10} /> SC
                </span>
              )}
            </div>
          )}
        </div>

        {/* Chains Section */}
        <section className="grid-flow-chains-section">
          <div className="grid-flow-section-header">
            <Layers size={24} />
            <h2>Chains</h2>
          </div>
          <ChainManagementCard
            selectedChainId={activeFlow?.chainId}
            onChainSelect={(chainId) => {
              if (activeFlow) {
                updateFlow(activeFlow.id, { chainId })
              }
            }}
            defaultExpanded={true}
          />
        </section>
      </main>

      {/* Plugin Browser Modal */}
      {showPluginBrowser && (
        <div className="grid-flow-modal-overlay" onClick={() => setShowPluginBrowser(false)}>
          <div className="grid-flow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="grid-flow-modal-header">
              <h2>Add Plugin</h2>
              <button onClick={() => setShowPluginBrowser(false)}><X size={20} /></button>
            </div>
            <div className="grid-flow-modal-search">
              <Search size={16} />
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
              {/* Grouped by category with collapse/expand */}
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
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
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
                              <Star size={14} fill={favoritePlugins.has(plugin.uri) ? 'currentColor' : 'none'} />
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
                              <span className="grid-flow-modal-item-name">{plugin.name}</span>
                              <span className="grid-flow-modal-item-meta">
                                <span
                                  className="grid-flow-modal-item-category"
                                  style={{ color: catConfig.color }}
                                >
                                  {plugin.category}
                                </span>
                                {plugin.author && <span className="grid-flow-modal-item-author">{plugin.author}</span>}
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
                              <Info size={14} />
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
          <div className="grid-flow-modal" onClick={(e) => e.stopPropagation()}>
            <div className="grid-flow-modal-header">
              <h2>Load Preset</h2>
              <button onClick={() => setShowPresetBrowser(false)}><X size={20} /></button>
            </div>
            <div className="grid-flow-modal-list">
              {presets.length === 0 ? (
                <div className="grid-flow-modal-empty">No presets saved</div>
              ) : (
                presets.map((preset) => (
                  <div key={preset.id} className="grid-flow-modal-item preset-item">
                    <button
                      className="grid-flow-preset-load"
                      onClick={() => loadPresetMutation.mutate(preset.id)}
                    >
                      <Download size={16} />
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
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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
              <button onClick={() => setShowKeyboardHelp(false)}><X size={20} /></button>
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
            onAddLane={() => {/* TODO: Lane picker dialog */}}
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
    </div>
  )
}

export default GridFlowPage
