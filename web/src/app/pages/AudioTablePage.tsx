/**
 * AudioTablePage — Carbon DataTable-driven signal flow editor.
 *
 * Full parity with JuceGridPage using a table interface:
 * - One DataTable per flow slot (A–F)
 * - Inline editable cells (number inputs, dropdowns, checkboxes)
 * - Dynamic per-plugin parameter columns with column picker
 * - MIDI mapping columns, automation indicators, real-time levels
 * - Shared state with JuceGridPage (same localStorage keys + React Query cache)
 * - Table-optimized keyboard navigation
 */

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type CSSProperties,
  type ChangeEvent,
} from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Add,
  Redo,
  Subtract,
  TrashCan,
  Undo,
  Play,
  Recording,
  Renew,
  Pause,
  Stop,
} from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  DataTable,
  Dropdown,
  IconButton,
  Layer,
  NumberInput as CarbonNumberInput,
  OverflowMenu,
  OverflowMenuItem,
  Select,
  SelectItem,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  TextInput,
  Toggle,
} from '@carbon/react'

import {
  chainsApi,
  pluginsApi,
  historyApi,
  audioApi,
  midiApiV2,
  flowSnapshotsApi,
} from '../../map2/api'
import type { AudioPort } from '../../map2/api'
import type {
  Chain,
  Plugin,
  PluginParameter,
  PluginOrderRef,
  HistoryStatus,
  MIDIMappingV2,
  MIDICurveType,
  MIDIStatus,
  PeakData,
  Snapshot,
} from '../../map2/types'
import { getDisplayPluginName } from '../../map2/displayNames'
import { useToasts } from '../components/Toasts'
import { useIsMobile } from '../hooks/useIsMobile'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import { usePluginOutputs } from '../hooks/usePluginOutputs'
import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'
import { sortPluginsForBrowser } from '../utils/pluginBrowserSort'
import { useCluster } from '../contexts/ClusterContext'
import { AudioNodesModal } from '../components/modals/AudioNodesModal'
import {
  createDefaultJuceGridFlowSlots,
  createDefaultJuceGridRouting,
  normalizeJuceGridStateSources,
} from '../components/JuceGrid/juceGridState'
import type {
  JuceGridFlowSlotState,
  JuceGridRoutingState,
  JuceGridRoutingMode,
  JuceGridSlotPaletteEntry,
} from '../components/JuceGrid/juceGridState'
import {
  STATIC_COLUMNS,
  LEVEL_COLUMNS,
  MIDI_COLUMNS,
  AUTOMATION_COLUMNS,
  DEFAULT_COLUMN_VISIBILITY,
  buildParameterColumns,
  assembleVisibleColumns,
  toDataTableHeaders,
  type AudioTableColumnVisibility,
  type ColumnDef,
} from '../components/AudioTable/audioTableColumns'
import { createAudioTableKeyHandler } from '../components/AudioTable/audioTableKeyboard'

// ============================================================================
// Constants — shared with JuceGridPage
// ============================================================================

const SLOT_COLORS: JuceGridSlotPaletteEntry[] = [
  { label: 'A', color: '#2563eb' },
  { label: 'B', color: '#60a5fa' },
  { label: 'C', color: '#22c55e' },
  { label: 'D', color: '#f59e0b' },
  { label: 'E', color: '#60a5fa' },
  { label: 'F', color: '#60a5fa' },
]

const MIN_FLOWS = 2
const MAX_FLOWS = 6
const DEFAULT_FLOW_COUNT = 3

const FLOW_SLOT_NORMALIZATION_OPTIONS = {
  palette: SLOT_COLORS,
  defaultCount: DEFAULT_FLOW_COUNT,
  maxFlows: MAX_FLOWS,
}

const ROUTING_MODE_OPTIONS: Array<{ id: JuceGridRoutingMode; label: string }> = [
  { id: 'parallel_blend', label: 'Parallel / Blend' },
  { id: 'ab_switch', label: 'A/B Switch' },
  { id: 'series', label: 'Series' },
  { id: 'parameter_morph', label: 'Parameter Morph' },
  { id: 'sidechain', label: 'Sidechain' },
]

const MIDI_CURVE_OPTIONS: Array<{ id: MIDICurveType; label: string }> = [
  { id: 'linear', label: 'Linear' },
  { id: 'logarithmic', label: 'Log' },
  { id: 'exponential', label: 'Exp' },
  { id: 's_curve', label: 'S-Curve' },
]

const LS_FLOWS_KEY = 'map2_juce_grid_flows_v2'
const LS_ROUTING_KEY = 'map2_juce_grid_routing_v2'
const LS_ACTIVE_KEY = 'map2_juce_grid_active_v2'
const LS_COLUMN_VIS_KEY = 'map2_audio_table_column_visibility'

// ============================================================================
// localStorage helpers
// ============================================================================

function parseStoredJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function loadInitialState(): {
  flowSlots: JuceGridFlowSlotState[]
  routing: JuceGridRoutingState
  activeFlowIndex: number
} {
  return normalizeJuceGridStateSources(
    parseStoredJson(LS_FLOWS_KEY),
    parseStoredJson(LS_ROUTING_KEY),
    localStorage.getItem(LS_ACTIVE_KEY),
    FLOW_SLOT_NORMALIZATION_OPTIONS,
  )
}

function loadColumnVisibility(): AudioTableColumnVisibility {
  const stored = parseStoredJson(LS_COLUMN_VIS_KEY)
  if (stored && typeof stored === 'object') {
    return { ...DEFAULT_COLUMN_VISIBILITY, ...(stored as Partial<AudioTableColumnVisibility>) }
  }
  return { ...DEFAULT_COLUMN_VISIBILITY }
}

// ============================================================================
// Plugin categorization for add-plugin dropdown
// ============================================================================

interface PluginGroup {
  label: string
  plugins: Plugin[]
}

function categorizePlugins(allPlugins: Plugin[], favorites: Set<string>): PluginGroup[] {
  const groups: PluginGroup[] = []

  const favs = allPlugins.filter(p => favorites.has(p.uri))
  if (favs.length > 0) {
    groups.push({ label: 'Favorites', plugins: sortPluginsForBrowser(favs) })
  }

  const effects = allPlugins.filter(p =>
    !p.uri.startsWith('map2://juce/drums') &&
    !p.uri.startsWith('map2://juce/synthforge') &&
    (p.category?.toLowerCase().includes('effect') ||
     p.category?.toLowerCase().includes('filter') ||
     p.category?.toLowerCase().includes('dynamics') ||
     p.category?.toLowerCase().includes('delay') ||
     p.category?.toLowerCase().includes('reverb') ||
     p.category?.toLowerCase().includes('modulation') ||
     p.category?.toLowerCase().includes('distortion') ||
     p.category?.toLowerCase().includes('utility') ||
     !p.category)
  )
  if (effects.length > 0) {
    groups.push({ label: 'Effects', plugins: sortPluginsForBrowser(effects) })
  }

  const instruments = allPlugins.filter(p =>
    p.category?.toLowerCase().includes('instrument') ||
    p.uri.startsWith('map2://juce/drums') ||
    p.uri.startsWith('map2://juce/synthforge')
  )
  if (instruments.length > 0) {
    groups.push({ label: 'Instruments', plugins: sortPluginsForBrowser(instruments) })
  }

  const natives = allPlugins.filter(p => p.uri.startsWith('map2://juce/'))
  if (natives.length > 0) {
    groups.push({ label: 'Native', plugins: sortPluginsForBrowser(natives) })
  }

  return groups
}

// ============================================================================
// Styles (inline Carbon overrides — no external CSS file)
// ============================================================================

const pageStyle: CSSProperties = {
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  minHeight: '100vh',
  background: 'var(--cds-background)',
}

const toolbarWrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  flexWrap: 'wrap',
  padding: '0.75rem 1rem',
  background: 'var(--cds-layer-01)',
  borderRadius: '4px',
}

const flowSectionStyle: CSSProperties = {
  marginBottom: '1rem',
}

const flowHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.5rem 1rem',
  background: 'var(--cds-layer-02)',
  borderRadius: '4px 4px 0 0',
  flexWrap: 'wrap',
}

const flowDotStyle = (color: string): CSSProperties => ({
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
})

const addFlowBarStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '0.75rem',
}

const clusterSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  padding: '1rem',
  background: 'var(--cds-layer-01)',
  borderRadius: '4px',
}

const clusterHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  flexWrap: 'wrap',
}

const mobileBlockStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
}

const compactTabStyle: CSSProperties = {
  padding: '1rem',
}

// ============================================================================
// Main Component
// ============================================================================

export function AudioTablePage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const isMobile = useIsMobile()
  const { isTabletTouchRoute } = useTabletTouchRouteLayout('/audio-table')
  const containerRef = useRef<HTMLDivElement>(null)
  const { nodes: clusterNodes, localNodeId, activeNodeId, setActiveNode, isClusterMode } = useCluster()

  // ── Shared state (same localStorage keys as JuceGridPage) ───────────────
  const [{ flowSlots, routing, activeFlowIndex }, setGridState] = useState(loadInitialState)
  const [columnVisibility, setColumnVisibility] = useState<AudioTableColumnVisibility>(loadColumnVisibility)

  // UI state
  const [search, setSearch] = useState('')
  const [tabletTab, setTabletTab] = useState(0)
  const [showAudioNodesModal, setShowAudioNodesModal] = useState(false)

  // Automation state (local — synced via shared queries)
  const [automationPlaying, setAutomationPlaying] = useState(false)
  const [automationRecording, setAutomationRecording] = useState(false)
  const [automationLoop, setAutomationLoop] = useState(false)

  // Persist flow state to localStorage
  const persistFlowState = useCallback((
    slots: JuceGridFlowSlotState[],
    route: JuceGridRoutingState,
    activeIdx: number,
  ) => {
    localStorage.setItem(LS_FLOWS_KEY, JSON.stringify(slots))
    localStorage.setItem(LS_ROUTING_KEY, JSON.stringify(route))
    localStorage.setItem(LS_ACTIVE_KEY, String(activeIdx))
  }, [])

  const updateFlowSlots = useCallback((updater: (prev: JuceGridFlowSlotState[]) => JuceGridFlowSlotState[]) => {
    setGridState(prev => {
      const next = updater(prev.flowSlots)
      persistFlowState(next, prev.routing, prev.activeFlowIndex)
      return { ...prev, flowSlots: next }
    })
  }, [persistFlowState])

  const updateRouting = useCallback((updater: (prev: JuceGridRoutingState) => JuceGridRoutingState) => {
    setGridState(prev => {
      const next = updater(prev.routing)
      persistFlowState(prev.flowSlots, next, prev.activeFlowIndex)
      return { ...prev, routing: next }
    })
  }, [persistFlowState])

  const updateActiveFlow = useCallback((index: number) => {
    setGridState(prev => {
      const clamped = Math.max(0, Math.min(index, prev.flowSlots.length - 1))
      persistFlowState(prev.flowSlots, prev.routing, clamped)
      return { ...prev, activeFlowIndex: clamped }
    })
  }, [persistFlowState])

  // Persist column visibility
  useEffect(() => {
    localStorage.setItem(LS_COLUMN_VIS_KEY, JSON.stringify(columnVisibility))
  }, [columnVisibility])

  // ── Queries ─────────────────────────────────────────────────────────────

  const chainsQuery = useQuery({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    refetchInterval: 5000,
  })

  const pluginsQuery = useQuery({
    queryKey: ['plugins', 'discover'],
    queryFn: () => pluginsApi.discover(),
    staleTime: 300_000,
  })

  const historyQuery = useQuery({
    queryKey: ['history', 'status'],
    queryFn: () => historyApi.getStatus(),
    refetchInterval: 2000,
  })

  const portsQuery = useQuery({
    queryKey: ['audio', 'ports'],
    queryFn: () => audioApi.getPorts(),
  })

  const midiStatusQuery = useQuery({
    queryKey: ['midi', 'status'],
    queryFn: () => midiApiV2.getStatus(),
    refetchInterval: 2000,
  })

  const midiMappingsQuery = useQuery({
    queryKey: ['midi', 'mappings', 'audio-table'],
    queryFn: () => midiApiV2.getMappings(),
    refetchInterval: 5000,
  })

  const presetsQuery = useQuery<{ presets: Snapshot[]; count: number }>({
    queryKey: ['chains', 'presets'],
    queryFn: () => chainsApi.listPresets(),
    refetchInterval: 5000,
  })

  const flowSnapshotsQuery = useQuery<{
    snapshots: Array<{ id: number; name: string }>
    count: number
    active_id: number | null
  }>({
    queryKey: ['flow-snapshots'],
    queryFn: () => flowSnapshotsApi.list(),
    refetchInterval: 5000,
  })

  // Per-chain preset queries
  const activeChainIds = useMemo(
    () => flowSlots.map(s => s.chainId).filter((id): id is number => id !== null),
    [flowSlots],
  )

  // Plugin outputs for real-time levels
  const pluginOutputState = usePluginOutputs()
  const peaksMap = pluginOutputState.peaks

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('map2-favorite-plugins')
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  // ── Mutations ───────────────────────────────────────────────────────────

  const reorderMutation = useMutation({
    mutationFn: async ({ chainId, order }: { chainId: number; order: PluginOrderRef[] }) =>
      chainsApi.reorderPlugins(chainId, order),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['chains'] }),
    onError: () => pushToast('Reorder failed', 'error'),
  })

  const bypassMutation = useMutation({
    mutationFn: async ({ chainId, uri, bypass, position }: { chainId: number; uri: string; bypass: boolean; position: number }) =>
      chainsApi.togglePluginBypass(chainId, uri, bypass, position),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['chains'] }),
    onError: () => pushToast('Bypass toggle failed', 'error'),
  })

  const removeMutation = useMutation({
    mutationFn: async ({ chainId, uri, position }: { chainId: number; uri: string; position: number }) =>
      chainsApi.removePlugin(chainId, uri, position),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Plugin removed', 'success')
    },
    onError: () => pushToast('Remove failed', 'error'),
  })

  const addPluginMutation = useMutation({
    mutationFn: async ({ chainId, uri }: { chainId: number; uri: string }) =>
      chainsApi.addPlugin(chainId, uri),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Plugin added', 'success')
    },
    onError: () => pushToast('Failed to add plugin', 'error'),
  })

  const createChainMutation = useMutation({
    mutationFn: async (name: string) => chainsApi.create(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain created', 'success')
    },
    onError: () => pushToast('Failed to create chain', 'error'),
  })

  const deleteChainMutation = useMutation({
    mutationFn: async (chainId: number) => chainsApi.delete(chainId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain deleted', 'success')
    },
    onError: () => pushToast('Failed to delete chain', 'error'),
  })

  const renameChainMutation = useMutation({
    mutationFn: async ({ chainId, name }: { chainId: number; name: string }) =>
      chainsApi.rename(chainId, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain renamed', 'success')
    },
    onError: () => pushToast('Failed to rename chain', 'error'),
  })

  const savePresetMutation = useMutation({
    mutationFn: async ({ chainId, name }: { chainId: number; name: string }) =>
      chainsApi.savePreset(chainId, name),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
      pushToast(`Preset "${variables.name}" saved`, 'success')
    },
    onError: () => pushToast('Failed to save preset', 'error'),
  })

  const loadPresetMutation = useMutation({
    mutationFn: async ({ presetId }: { presetId: number }) =>
      chainsApi.loadPreset(presetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['chains'] })
      void queryClient.invalidateQueries({ queryKey: ['history'] })
      pushToast('Preset loaded', 'success')
    },
    onError: () => pushToast('Failed to load preset', 'error'),
  })

  const undoMutation = useMutation({
    mutationFn: () => historyApi.undo(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['chains'] }),
  })

  const redoMutation = useMutation({
    mutationFn: () => historyApi.redo(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['chains'] }),
  })

  const setParameterMutation = useMutation({
    mutationFn: async ({
      uri,
      paramIndex,
      value,
      instanceId,
      pluginPosition,
    }: {
      chainId: number
      uri: string
      paramIndex: number
      value: number
      instanceId?: number
      pluginPosition?: number
    }) => {
      pluginsApi.setParameterBatched(uri, paramIndex, value, instanceId, pluginPosition)
      await pluginsApi.flushParameterBatch()
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['chains'] }),
  })

  const createMidiMappingMutation = useMutation({
    mutationFn: (payload: Partial<MIDIMappingV2>) => midiApiV2.createMapping(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi', 'mappings'] })
      pushToast('MIDI mapping created', 'success')
    },
    onError: () => pushToast('Failed to create MIDI mapping', 'error'),
  })

  const updateMidiMappingMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<MIDIMappingV2> }) =>
      midiApiV2.updateMapping(id, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi', 'mappings'] })
      pushToast('MIDI mapping updated', 'success')
    },
    onError: () => pushToast('Failed to update MIDI mapping', 'error'),
  })

  const batchVisibleMutation = useMutation({
    mutationFn: async ({
      action,
      chainId,
      plugins,
    }: {
      action: 'toggle-bypass' | 'remove'
      chainId: number
      plugins: Chain['plugins']
    }) => {
      if (action === 'toggle-bypass') {
        await Promise.all(
          plugins.map(plugin =>
            chainsApi.togglePluginBypass(chainId, plugin.uri, !plugin.bypassed, plugin.position),
          ),
        )
        return
      }

      await Promise.all(
        plugins.map(plugin => chainsApi.removePlugin(chainId, plugin.uri, plugin.position)),
      )
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast(
        variables.action === 'toggle-bypass'
          ? `Updated bypass for ${variables.plugins.length} plugin${variables.plugins.length === 1 ? '' : 's'}`
          : `Removed ${variables.plugins.length} plugin${variables.plugins.length === 1 ? '' : 's'}`,
        variables.action === 'toggle-bypass' ? 'success' : 'info',
      )
    },
    onError: (_error, variables) => {
      pushToast(
        variables.action === 'toggle-bypass' ? 'Failed to update bypass state' : 'Failed to remove visible plugins',
        'error',
      )
    },
  })

  // ── Derived data ────────────────────────────────────────────────────────

  const chains: Chain[] = useMemo(() => chainsQuery.data?.chains ?? [], [chainsQuery.data])

  const allPlugins: Plugin[] = useMemo(() => pluginsQuery.data?.plugins ?? [], [pluginsQuery.data])
  const pluginInventoryByUri = useMemo(() => {
    const inventory = new Map<string, Plugin>()
    for (const plugin of allPlugins) {
      inventory.set(plugin.uri, plugin)
    }
    return inventory
  }, [allPlugins])

  const pluginGroups = useMemo(
    () => categorizePlugins(allPlugins, favorites),
    [allPlugins, favorites],
  )

  const historyStatus = historyQuery.data as HistoryStatus | undefined
  const ports = useMemo<AudioPort[]>(
    () => (portsQuery.data ? [...portsQuery.data.inputs, ...portsQuery.data.outputs] : []),
    [portsQuery.data],
  )

  // Map chain IDs to chains
  const chainMap = useMemo(() => {
    const map = new Map<number, Chain>()
    for (const c of chains) map.set(c.id, c)
    return map
  }, [chains])

  // Per-flow chain and plugin data
  const flowData = useMemo(() => {
    return flowSlots.map(slot => {
      const chain = slot.chainId ? chainMap.get(slot.chainId) : undefined
      return {
        slot,
        chain,
        plugins: chain?.plugins ?? [],
      }
    })
  }, [flowSlots, chainMap])

  const activeFlowData = flowData[activeFlowIndex] ?? flowData[0] ?? null
  const activeFlowOptions = useMemo(
    () => flowData.map((fd, index) => ({
      id: String(index),
      label: `Flow ${fd.slot.label}${fd.chain ? ` · ${fd.chain.name}` : ' · Unassigned'}`,
    })),
    [flowData],
  )
  const selectedActiveFlowOption = activeFlowOptions[activeFlowIndex] ?? activeFlowOptions[0] ?? null
  const activeChainPresets = useMemo(
    () => (activeFlowData?.chain ? (presetsQuery.data?.presets ?? []).filter(preset => preset.chain_id === activeFlowData.chain?.id) : []),
    [activeFlowData?.chain, presetsQuery.data?.presets],
  )
  const presetItems = useMemo(
    () => activeChainPresets.map(preset => ({ id: String(preset.id), label: preset.name })),
    [activeChainPresets],
  )
  const midiMappings = useMemo(() => midiMappingsQuery.data?.mappings ?? [], [midiMappingsQuery.data?.mappings])
  const snapshotCount = flowSnapshotsQuery.data?.count ?? flowSnapshotsQuery.data?.snapshots.length ?? 0

  // Dynamic parameter columns per flow
  const parameterColumnsPerFlow = useMemo(() => {
    return flowData.map(fd => {
      const paramMap = new Map<string, PluginParameter[]>()
      for (const p of fd.plugins) {
        const key = `${p.uri}::${p.position}`
        const catalogParams = pluginInventoryByUri.get(p.uri)?.parameters ?? []
        const valuesBySymbol = p.parameters ?? {}
        const params: PluginParameter[] = []
        const seenSymbols = new Set<string>()

        for (const meta of catalogParams) {
          if (!(meta.symbol in valuesBySymbol)) {
            continue
          }
          seenSymbols.add(meta.symbol)
          params.push({
            ...meta,
            value: valuesBySymbol[meta.symbol],
          })
        }

        for (const [symbol, value] of Object.entries(valuesBySymbol)) {
          if (seenSymbols.has(symbol)) {
            continue
          }
          params.push({
            index: params.length,
            name: symbol,
            symbol,
            min: 0,
            max: 1,
            default: value,
            value,
            is_toggled: false,
            is_log: false,
          })
        }

        paramMap.set(key, params)
      }
      return buildParameterColumns(fd.plugins, paramMap)
    })
  }, [flowData, pluginInventoryByUri])

  const allParameterColumns = useMemo(() => {
    const deduped = new Map<string, ColumnDef>()
    for (const flowColumns of parameterColumnsPerFlow) {
      for (const column of flowColumns) {
        deduped.set(column.key, column)
      }
    }
    return Array.from(deduped.values())
  }, [parameterColumnsPerFlow])

  // Assembled visible columns
  const visibleColumnsPerFlow = useMemo(
    () => parameterColumnsPerFlow.map(parameterColumns => assembleVisibleColumns(columnVisibility, parameterColumns)),
    [columnVisibility, parameterColumnsPerFlow],
  )

  const dataTableHeadersPerFlow = useMemo(
    () => visibleColumnsPerFlow.map(columns => toDataTableHeaders(columns)),
    [visibleColumnsPerFlow],
  )

  // ── Keyboard navigation ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = createAudioTableKeyHandler(containerRef, {
      onUndo: () => undoMutation.mutate(),
      onRedo: () => redoMutation.mutate(),
      onDeleteRow: (flowIdx, rowIdx) => {
        const fd = flowData[flowIdx]
        if (!fd?.chain) return
        const plugin = fd.plugins[rowIdx]
        if (!plugin) return
        removeMutation.mutate({
          chainId: fd.chain.id,
          uri: plugin.uri,
          position: plugin.position,
        })
      },
    })
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [flowData, undoMutation, redoMutation, removeMutation])

  // ── Flow slot management ────────────────────────────────────────────────

  const handleAddFlow = useCallback(() => {
    if (flowSlots.length >= MAX_FLOWS) return
    const nextIndex = flowSlots.length
    const paletteEntry = SLOT_COLORS[nextIndex % SLOT_COLORS.length]
    const newSlot: JuceGridFlowSlotState = {
      id: `flow-${nextIndex}`,
      chainId: null,
      label: paletteEntry.label,
      color: paletteEntry.color,
      muted: false,
      solo: false,
      dryWetMix: 100,
    }
    updateFlowSlots(prev => [...prev, newSlot])
  }, [flowSlots.length, updateFlowSlots])

  const handleRemoveFlow = useCallback((index: number) => {
    if (flowSlots.length <= MIN_FLOWS) return
    updateFlowSlots(prev => prev.filter((_, i) => i !== index))
    if (activeFlowIndex >= flowSlots.length - 1) {
      updateActiveFlow(Math.max(0, flowSlots.length - 2))
    }
  }, [flowSlots.length, activeFlowIndex, updateFlowSlots, updateActiveFlow])

  // ── Chain assignment ────────────────────────────────────────────────────

  const handleChainAssign = useCallback((flowIndex: number, chainId: number | null) => {
    updateFlowSlots(prev =>
      prev.map((s, i) => i === flowIndex ? { ...s, chainId } : s),
    )
  }, [updateFlowSlots])

  // ── Flow controls ───────────────────────────────────────────────────────

  const handleMuteToggle = useCallback((flowIndex: number) => {
    updateFlowSlots(prev =>
      prev.map((s, i) => i === flowIndex ? { ...s, muted: !s.muted } : s),
    )
  }, [updateFlowSlots])

  const handleSoloToggle = useCallback((flowIndex: number) => {
    updateFlowSlots(prev =>
      prev.map((s, i) => i === flowIndex ? { ...s, solo: !s.solo } : s),
    )
  }, [updateFlowSlots])

  const handleDryWetChange = useCallback((flowIndex: number, value: number) => {
    updateFlowSlots(prev =>
      prev.map((s, i) => i === flowIndex ? { ...s, dryWetMix: Math.max(0, Math.min(100, Math.round(value))) } : s),
    )
  }, [updateFlowSlots])

  // ── Routing ─────────────────────────────────────────────────────────────

  const handleRoutingModeChange = useCallback((mode: JuceGridRoutingMode) => {
    updateRouting(prev => ({ ...prev, mode }))
  }, [updateRouting])

  const handleMorphProgressChange = useCallback((value: number) => {
    updateRouting(prev => ({ ...prev, morphProgress: Math.max(0, Math.min(1, value)) }))
  }, [updateRouting])

  // ── Plugin actions ──────────────────────────────────────────────────────

  const handleBypassToggle = useCallback((chainId: number, uri: string, currentBypass: boolean, position: number) => {
    bypassMutation.mutate({ chainId, uri, bypass: !currentBypass, position })
  }, [bypassMutation])

  const handleRemovePlugin = useCallback((chainId: number, uri: string, position: number) => {
    removeMutation.mutate({ chainId, uri, position })
  }, [removeMutation])

  const handleAddPlugin = useCallback((chainId: number, pluginUri: string) => {
    addPluginMutation.mutate({ chainId, uri: pluginUri })
  }, [addPluginMutation])

  const handlePositionChange = useCallback((chainId: number, plugins: Chain['plugins'], fromPosition: number, toPosition: number) => {
    if (fromPosition === toPosition) return
    const order: PluginOrderRef[] = [...plugins]
      .sort((a, b) => a.position - b.position)
      .map(p => ({ uri: p.uri, position: p.position }))
    // Move plugin from fromPosition to toPosition
    const fromIdx = order.findIndex(o => o.position === fromPosition)
    if (fromIdx < 0) return
    const [moved] = order.splice(fromIdx, 1)
    const toIdx = Math.max(0, Math.min(order.length, toPosition))
    order.splice(toIdx, 0, moved)
    // Renumber positions
    const reordered = order.map((o, i) => ({ ...o, position: i }))
    reorderMutation.mutate({ chainId, order: reordered })
  }, [reorderMutation])

  const handleParameterChange = useCallback((
    chainId: number,
    uri: string,
    paramIndex: number,
    value: number,
    instanceId?: number,
    pluginPosition?: number,
  ) => {
    setParameterMutation.mutate({ chainId, uri, paramIndex, value, instanceId, pluginPosition })
  }, [setParameterMutation])

  const resolveDefaultMidiTarget = useCallback((plugin: Chain['plugins'][number]) => {
    const catalogParams = pluginInventoryByUri.get(plugin.uri)?.parameters ?? []
    const symbolValues = plugin.parameters ?? {}
    const preferred = catalogParams.find(param => param.symbol in symbolValues)
    if (preferred) {
      return { index: preferred.index, symbol: preferred.symbol }
    }

    const [firstSymbol] = Object.keys(symbolValues)
    if (!firstSymbol) {
      return null
    }

    return { index: 0, symbol: firstSymbol }
  }, [pluginInventoryByUri])

  const resolveMidiMappingForPlugin = useCallback((chainId: number, plugin: Chain['plugins'][number]) => {
    return [...midiMappings]
      .filter(mapping => (
        mapping.target_plugin_uri === plugin.uri
        && (mapping.chain_id === chainId || mapping.chain_id === null)
      ))
      .sort((left, right) => {
        const leftScope = left.chain_id === chainId ? 0 : 1
        const rightScope = right.chain_id === chainId ? 0 : 1
        if (leftScope !== rightScope) {
          return leftScope - rightScope
        }
        return (left.target_param_index ?? Number.MAX_SAFE_INTEGER) - (right.target_param_index ?? Number.MAX_SAFE_INTEGER)
      })[0] ?? null
  }, [midiMappings])

  const handleMidiMappingChange = useCallback((
    chainId: number,
    plugin: Chain['plugins'][number],
    updates: Partial<MIDIMappingV2>,
  ) => {
    const existing = resolveMidiMappingForPlugin(chainId, plugin)
    if (existing) {
      updateMidiMappingMutation.mutate({ id: existing.id, updates })
      return
    }

    const target = resolveDefaultMidiTarget(plugin)
    if (!target) {
      pushToast('No parameter available for MIDI mapping on this plugin', 'info')
      return
    }

    createMidiMappingMutation.mutate({
      channel: 0,
      cc: 0,
      chain_id: chainId,
      target_plugin_uri: plugin.uri,
      target_param_index: target.index,
      target_param_symbol: target.symbol,
      min_val: 0,
      max_val: 1,
      curve_type: 'linear',
      invert: false,
      feedback_enabled: false,
      feedback_cc: null,
      name: `${getDisplayPluginName(plugin.uri, plugin.name)} ${target.symbol}`,
      group_id: null,
      is_learned: false,
      is_enabled: true,
      ...updates,
    })
  }, [
    createMidiMappingMutation,
    pushToast,
    resolveDefaultMidiTarget,
    resolveMidiMappingForPlugin,
    updateMidiMappingMutation,
  ])

  const handleSavePreset = useCallback(() => {
    if (!activeFlowData?.chain) {
      pushToast('Assign a chain to the active flow before saving presets', 'info')
      return
    }
    const presetName = window.prompt('Preset name:', `${activeFlowData.chain.name} Preset`)
    if (!presetName?.trim()) {
      return
    }
    savePresetMutation.mutate({ chainId: activeFlowData.chain.id, name: presetName.trim() })
  }, [activeFlowData?.chain, pushToast, savePresetMutation])

  // ── Column picker ───────────────────────────────────────────────────────

  const toggleColumnGroup = useCallback((group: 'midiGroup' | 'automationGroup' | 'inputLevel' | 'outputLevel') => {
    setColumnVisibility(prev => ({ ...prev, [group]: !prev[group] }))
  }, [])

  // ── Search filter ───────────────────────────────────────────────────────

  const filterPlugins = useCallback((plugins: Chain['plugins']) => {
    if (!search.trim()) return plugins
    const q = search.toLowerCase()
    return plugins.filter(p => {
      const name = getDisplayPluginName(p.uri, p.name)
      return name.toLowerCase().includes(q)
    })
  }, [search])

  const activeVisiblePlugins = useMemo(
    () => (activeFlowData?.plugins ? filterPlugins(activeFlowData.plugins) : []),
    [activeFlowData?.plugins, filterPlugins],
  )

  const handleBatchVisibleAction = useCallback((action: 'toggle-bypass' | 'remove') => {
    if (!activeFlowData?.chain || activeVisiblePlugins.length === 0) {
      return
    }
    if (action === 'remove' && !window.confirm(`Remove ${activeVisiblePlugins.length} visible plugin(s) from ${activeFlowData.chain.name}?`)) {
      return
    }
    batchVisibleMutation.mutate({
      action,
      chainId: activeFlowData.chain.id,
      plugins: activeVisiblePlugins,
    })
  }, [activeFlowData?.chain, activeVisiblePlugins, batchVisibleMutation])

  // ── Mobile/Tablet handling ──────────────────────────────────────────────

  if (isMobile) {
    return (
      <div style={mobileBlockStyle}>
        <LandscapePrompt
          componentId="audio-table"
          title="Audio Table"
          description="Rotate your device to landscape or use a desktop browser for the Audio Table editor."
        />
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} style={pageStyle} data-testid="audio-table-page">

      {/* ── Shared Toolbar ────────────────────────────────────────────── */}
      <div style={toolbarWrapStyle} data-testid="audio-table-toolbar">

        <Dropdown
          id="audio-table-active-flow"
          titleText=""
          label="Active Flow"
          size="sm"
          items={activeFlowOptions}
          itemToString={(item: { id: string; label: string } | null) => item?.label ?? ''}
          selectedItem={selectedActiveFlowOption}
          onChange={({ selectedItem }: { selectedItem: { id: string; label: string } | null }) => {
            if (selectedItem) {
              updateActiveFlow(Number(selectedItem.id))
            }
          }}
          style={{ minWidth: 210 }}
        />

        {/* Routing mode */}
        <Dropdown
          id="audio-table-routing-mode"
          titleText=""
          label="Routing"
          size="sm"
          items={ROUTING_MODE_OPTIONS}
          itemToString={(item: typeof ROUTING_MODE_OPTIONS[number] | null) => item?.label ?? ''}
          selectedItem={ROUTING_MODE_OPTIONS.find(o => o.id === routing.mode) ?? ROUTING_MODE_OPTIONS[0]}
          onChange={({ selectedItem }: { selectedItem: typeof ROUTING_MODE_OPTIONS[number] | null }) => {
            if (selectedItem) handleRoutingModeChange(selectedItem.id)
          }}
          style={{ minWidth: 160 }}
        />

        {/* Mode-specific inline controls */}
        {routing.mode === 'parameter_morph' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Morph</span>
            <Slider
              id="audio-table-morph-slider"
              min={0}
              max={100}
              value={Math.round(routing.morphProgress * 100)}
              onChange={({ value }: { value: number }) => handleMorphProgressChange(value / 100)}
              hideTextInput
              style={{ width: 120 }}
            />
            <Tag type="blue" size="sm">{Math.round(routing.morphProgress * 100)}%</Tag>
          </div>
        )}

        <Tag type={isClusterMode ? 'blue' : 'cool-gray'} size="sm">
          {isClusterMode ? `${clusterNodes.length} nodes` : 'Local only'}
        </Tag>
        <Tag type="purple" size="sm">Snapshots {snapshotCount}</Tag>
        <Tag type={midiStatusQuery.data?.enabled ? 'green' : 'cool-gray'} size="sm">
          MIDI {midiStatusQuery.data?.enabled ? 'Ready' : 'Off'}
        </Tag>

        <div style={{ width: 1, height: 24, background: 'var(--cds-border-subtle)' }} />

        {/* Preset dropdown */}
        <Dropdown
          id="audio-table-presets"
          titleText=""
          label="Presets"
          size="sm"
          items={presetItems}
          itemToString={(item: { id: string; label: string } | null) => item?.label ?? ''}
          selectedItem={null}
          onChange={({ selectedItem }: { selectedItem: { id: string; label: string } | null }) => {
            if (selectedItem?.id) {
              loadPresetMutation.mutate({ presetId: Number(selectedItem.id) })
            }
          }}
          style={{ minWidth: 140 }}
          disabled={!activeFlowData?.chain || presetItems.length === 0}
        />
        <Button
          kind="ghost"
          size="sm"
          onClick={handleSavePreset}
          disabled={!activeFlowData?.chain || savePresetMutation.isPending}
        >
          Save Preset
        </Button>

        <div style={{ width: 1, height: 24, background: 'var(--cds-border-subtle)' }} />

        {/* Undo / Redo */}
        <IconButton
          kind="ghost"
          size="sm"
          label="Undo"
          onClick={() => undoMutation.mutate()}
          disabled={!historyStatus?.can_undo}
        >
          <Undo />
        </IconButton>
        <IconButton
          kind="ghost"
          size="sm"
          label="Redo"
          onClick={() => redoMutation.mutate()}
          disabled={!historyStatus?.can_redo}
        >
          <Redo />
        </IconButton>

        <div style={{ width: 1, height: 24, background: 'var(--cds-border-subtle)' }} />

        {/* Automation transport */}
        <IconButton
          kind={automationPlaying ? 'primary' : 'ghost'}
          size="sm"
          label={automationPlaying ? 'Pause' : 'Play'}
          onClick={() => setAutomationPlaying(p => !p)}
        >
          {automationPlaying ? <Pause /> : <Play />}
        </IconButton>
        <IconButton
          kind={automationRecording ? 'primary' : 'ghost'}
          size="sm"
          label="Record"
          onClick={() => setAutomationRecording(r => !r)}
        >
          <Recording />
        </IconButton>
        <IconButton
          kind={automationLoop ? 'primary' : 'ghost'}
          size="sm"
          label="Loop"
          onClick={() => setAutomationLoop(l => !l)}
        >
          <Renew />
        </IconButton>

        <div style={{ width: 1, height: 24, background: 'var(--cds-border-subtle)' }} />

        <TableToolbarSearch
          persistent
          size="sm"
          labelText="Search plugins"
          placeholder="Search visible plugins"
          value={search}
          onChange={(_e: unknown, value: string | undefined) => setSearch(value ?? '')}
        />

        <Button
          kind="ghost"
          size="sm"
          onClick={() => handleBatchVisibleAction('toggle-bypass')}
          disabled={!activeFlowData?.chain || activeVisiblePlugins.length === 0 || batchVisibleMutation.isPending}
        >
          Bypass Visible
        </Button>
        <Button
          kind="danger--ghost"
          size="sm"
          onClick={() => handleBatchVisibleAction('remove')}
          disabled={!activeFlowData?.chain || activeVisiblePlugins.length === 0 || batchVisibleMutation.isPending}
        >
          Remove Visible
        </Button>
        <Tag type="cool-gray" size="sm">
          {activeVisiblePlugins.length} visible
        </Tag>

        <div style={{ flex: 1 }} />

        {/* Column visibility toggles */}
        <OverflowMenu
          size="sm"
          flipped
          renderIcon={() => <span style={{ fontSize: '0.75rem' }}>Columns</span>}
        >
          <OverflowMenuItem
            itemText={`${columnVisibility.midiGroup ? '✓' : '  '} MIDI Columns`}
            onClick={() => toggleColumnGroup('midiGroup')}
          />
          <OverflowMenuItem
            itemText={`${columnVisibility.automationGroup ? '✓' : '  '} Automation Columns`}
            onClick={() => toggleColumnGroup('automationGroup')}
          />
          <OverflowMenuItem
            itemText={`${columnVisibility.inputLevel ? '✓' : '  '} Input Level`}
            onClick={() => toggleColumnGroup('inputLevel')}
          />
          <OverflowMenuItem
            itemText={`${columnVisibility.outputLevel ? '✓' : '  '} Output Level`}
            onClick={() => toggleColumnGroup('outputLevel')}
          />
          {allParameterColumns.length > 0 && (
            <OverflowMenuItem
              hasDivider
              itemText="Parameter Columns"
              onClick={() => {}}
            />
          )}
          {allParameterColumns.map(column => (
            <OverflowMenuItem
              key={column.key}
              itemText={`${columnVisibility.parameters[column.key] !== false ? '✓' : '  '} ${pluginInventoryByUri.get(column.pluginUri ?? '')?.name ?? column.pluginUri ?? 'Plugin'}: ${column.header}`}
              onClick={() => {
                setColumnVisibility(prev => ({
                  ...prev,
                  parameters: {
                    ...prev.parameters,
                    [column.key]: prev.parameters[column.key] === false,
                  },
                }))
              }}
            />
          ))}
        </OverflowMenu>
      </div>

      {/* ── Flow Table Sections ───────────────────────────────────────── */}
      {flowData.map((fd, flowIndex) => (
        <FlowTableSection
          key={fd.slot.id}
          flowIndex={flowIndex}
          slot={fd.slot}
          chain={fd.chain}
          plugins={filterPlugins(fd.plugins)}
          chains={chains}
          ports={ports}
          pluginGroups={pluginGroups}
          pluginInventoryByUri={pluginInventoryByUri}
          visibleColumns={visibleColumnsPerFlow[flowIndex] ?? assembleVisibleColumns(columnVisibility, [])}
          dataTableHeaders={dataTableHeadersPerFlow[flowIndex] ?? toDataTableHeaders(assembleVisibleColumns(columnVisibility, []))}
          search={search}
          peaksMap={peaksMap}
          midiMappings={midiMappings}
          onChainAssign={handleChainAssign}
          onMuteToggle={handleMuteToggle}
          onSoloToggle={handleSoloToggle}
          onDryWetChange={handleDryWetChange}
          onBypassToggle={handleBypassToggle}
          onRemovePlugin={handleRemovePlugin}
          onAddPlugin={handleAddPlugin}
          onPositionChange={handlePositionChange}
          onParameterChange={handleParameterChange}
          onMidiMappingChange={handleMidiMappingChange}
          onRemoveFlow={handleRemoveFlow}
          canRemoveFlow={flowSlots.length > MIN_FLOWS}
          onCreateChain={name => createChainMutation.mutate(name)}
          onDeleteChain={chainId => deleteChainMutation.mutate(chainId)}
          onRenameChain={(chainId, name) => renameChainMutation.mutate({ chainId, name })}
        />
      ))}

      {/* ── Add Flow Button ───────────────────────────────────────────── */}
      <div style={addFlowBarStyle}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Add}
          onClick={handleAddFlow}
          disabled={flowSlots.length >= MAX_FLOWS}
          data-testid="audio-table-add-flow"
        >
          Add Flow ({flowSlots.length}/{MAX_FLOWS})
        </Button>
      </div>

      <Layer>
        <div style={clusterSectionStyle} data-testid="audio-table-cluster-section">
          <div style={clusterHeaderStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Cluster Nodes</h3>
              <Tag type={isClusterMode ? 'blue' : 'cool-gray'} size="sm">
                {isClusterMode ? 'Cluster mode' : 'Single node'}
              </Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Tag type="cool-gray" size="sm">Focused {activeNodeId ?? localNodeId}</Tag>
              <Button kind="ghost" size="sm" onClick={() => setShowAudioNodesModal(true)}>
                Open Node Manager
              </Button>
            </div>
          </div>

          <DataTable
            rows={clusterNodes.map(node => ({
              id: node.nodeId,
              hostname: node.hostname,
              role: node.role,
              status: (
                <Tag type={node.isOnline ? 'green' : 'red'} size="sm">
                  {node.isOnline ? 'Online' : 'Offline'}
                </Tag>
              ),
              latency: node.latencyMs === null ? '—' : `${node.latencyMs.toFixed(1)} ms`,
              scope: (
                <Button
                  kind={((activeNodeId ?? localNodeId) === node.nodeId) ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveNode(node.nodeId === localNodeId ? null : node.nodeId)}
                >
                  {(activeNodeId ?? localNodeId) === node.nodeId ? 'Focused' : 'Focus'}
                </Button>
              ),
            }))}
            headers={[
              { key: 'hostname', header: 'Hostname' },
              { key: 'role', header: 'Role' },
              { key: 'status', header: 'Status' },
              { key: 'latency', header: 'Latency' },
              { key: 'scope', header: 'Scope' },
            ]}
            size="sm"
            useZebraStyles
          >
            {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
              <TableContainer {...getTableContainerProps()} title="Node Management" description="Audio Table keeps cluster focus aligned with the shared platform node scope.">
                <Table {...getTableProps()} size="sm">
                  <TableHead>
                    <TableRow>
                      {headers.map(header => {
                        const { key: _headerKey, ...headerProps } = getHeaderProps({ header })
                        return (
                          <TableHeader key={header.key} {...headerProps}>
                            {header.header}
                          </TableHeader>
                        )
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map(row => {
                      const { key: _rowKey, ...rowProps } = getRowProps({ row })
                      return (
                        <TableRow key={row.id} {...rowProps}>
                          {row.cells.map(cell => (
                            <TableCell key={cell.id}>{cell.value as React.ReactNode}</TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </div>
      </Layer>

      {showAudioNodesModal ? (
        <AudioNodesModal open={showAudioNodesModal} onClose={() => setShowAudioNodesModal(false)} />
      ) : null}
    </div>
  )
}

// ============================================================================
// FlowTableSection — one DataTable per flow slot
// ============================================================================

interface FlowTableSectionProps {
  flowIndex: number
  slot: JuceGridFlowSlotState
  chain: Chain | undefined
  plugins: Chain['plugins']
  chains: Chain[]
  ports: AudioPort[]
  pluginGroups: PluginGroup[]
  pluginInventoryByUri: Map<string, Plugin>
  visibleColumns: ColumnDef[]
  dataTableHeaders: Array<{ key: string; header: string }>
  search: string
  peaksMap: Record<string, Record<string, PeakData>>
  midiMappings: MIDIMappingV2[]
  onChainAssign: (flowIndex: number, chainId: number | null) => void
  onMuteToggle: (flowIndex: number) => void
  onSoloToggle: (flowIndex: number) => void
  onDryWetChange: (flowIndex: number, value: number) => void
  onBypassToggle: (chainId: number, uri: string, currentBypass: boolean, position: number) => void
  onRemovePlugin: (chainId: number, uri: string, position: number) => void
  onAddPlugin: (chainId: number, uri: string) => void
  onPositionChange: (chainId: number, plugins: Chain['plugins'], from: number, to: number) => void
  onParameterChange: (
    chainId: number,
    uri: string,
    paramIndex: number,
    value: number,
    instanceId?: number,
    pluginPosition?: number,
  ) => void
  onMidiMappingChange: (
    chainId: number,
    plugin: Chain['plugins'][number],
    updates: Partial<MIDIMappingV2>,
  ) => void
  onRemoveFlow: (index: number) => void
  canRemoveFlow: boolean
  onCreateChain: (name: string) => void
  onDeleteChain: (chainId: number) => void
  onRenameChain: (chainId: number, name: string) => void
}

function FlowTableSection({
  flowIndex,
  slot,
  chain,
  plugins,
  chains,
  ports,
  pluginGroups,
  pluginInventoryByUri,
  visibleColumns,
  dataTableHeaders,
  search,
  peaksMap,
  midiMappings,
  onChainAssign,
  onMuteToggle,
  onSoloToggle,
  onDryWetChange,
  onBypassToggle,
  onRemovePlugin,
  onAddPlugin,
  onPositionChange,
  onParameterChange,
  onMidiMappingChange,
  onRemoveFlow,
  canRemoveFlow,
  onCreateChain,
  onDeleteChain,
  onRenameChain,
}: FlowTableSectionProps) {
  const [addPluginUri, setAddPluginUri] = useState<string | null>(null)

  const renderParameterCell = useCallback((
    plugin: Chain['plugins'][number],
    rowIdx: number,
    column: ColumnDef,
  ): React.ReactNode => {
    if (!chain || column.group !== 'parameter' || !column.pluginUri || !column.paramSymbol) {
      return ''
    }
    if (plugin.uri !== column.pluginUri || !(column.paramSymbol in plugin.parameters)) {
      return ''
    }

    const paramValue = plugin.parameters[column.paramSymbol]
    const inputId = `${slot.id}-${rowIdx}-${column.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`

    if (column.paramIsToggled) {
      return (
        <Checkbox
          id={inputId}
          checked={paramValue >= 0.5}
          labelText=""
          hideLabel
          onChange={(_evt: ChangeEvent<HTMLInputElement>, data: { checked: boolean; id: string }) => {
            onParameterChange(
              chain.id,
              plugin.uri,
              column.paramIndex ?? 0,
              data.checked ? 1 : 0,
              plugin.instance_id,
              plugin.position,
            )
          }}
        />
      )
    }

    const isDiscreteIntegerRange = Number.isInteger(column.paramMin)
      && Number.isInteger(column.paramMax)
      && Number.isInteger(paramValue)
      && (column.paramMax ?? 0) - (column.paramMin ?? 0) <= 8

    if (isDiscreteIntegerRange) {
      const min = column.paramMin ?? 0
      const max = column.paramMax ?? min
      return (
        <Select
          id={inputId}
          size="sm"
          hideLabel
          labelText=""
          value={String(Math.round(paramValue))}
          onChange={(evt: ChangeEvent<HTMLSelectElement>) => {
            onParameterChange(
              chain.id,
              plugin.uri,
              column.paramIndex ?? 0,
              Number(evt.target.value),
              plugin.instance_id,
              plugin.position,
            )
          }}
        >
          {Array.from({ length: max - min + 1 }, (_, offset) => {
            const optionValue = min + offset
            return (
              <SelectItem
                key={optionValue}
                text={String(optionValue)}
                value={String(optionValue)}
              />
            )
          })}
        </Select>
      )
    }

    const min = column.paramMin ?? 0
    const max = column.paramMax ?? 1
    const span = Math.abs(max - min)
    const step = span > 0 ? Math.max(span / 100, 0.01) : 0.01

    return (
      <CarbonNumberInput
        id={inputId}
        size="sm"
        min={min}
        max={max}
        step={step}
        value={paramValue}
        label=""
        hideLabel
        hideSteppers
        onChange={(_evt: unknown, { value }: { value: string | number }) => {
          onParameterChange(
            chain.id,
            plugin.uri,
            column.paramIndex ?? 0,
            Number(value),
            plugin.instance_id,
            plugin.position,
          )
        }}
        style={{ width: 88 }}
      />
    )
  }, [chain, onParameterChange, slot.id])

  const renderMidiCell = useCallback((
    plugin: Chain['plugins'][number],
    rowIdx: number,
    column: ColumnDef,
  ): React.ReactNode => {
    if (!chain || column.group !== 'midi') {
      return ''
    }

    const mapping = [...midiMappings]
      .filter(candidate => (
        candidate.target_plugin_uri === plugin.uri
        && (candidate.chain_id === chain.id || candidate.chain_id === null)
      ))
      .sort((left, right) => {
        const leftScope = left.chain_id === chain.id ? 0 : 1
        const rightScope = right.chain_id === chain.id ? 0 : 1
        if (leftScope !== rightScope) {
          return leftScope - rightScope
        }
        return (left.target_param_index ?? Number.MAX_SAFE_INTEGER) - (right.target_param_index ?? Number.MAX_SAFE_INTEGER)
      })[0] ?? null

    const catalogParams = pluginInventoryByUri.get(plugin.uri)?.parameters ?? []
    const targetParam = mapping
      ? catalogParams.find(param => param.index === mapping.target_param_index)
      : catalogParams.find(param => param.symbol in (plugin.parameters ?? {})) ?? catalogParams[0] ?? null

    if (!mapping && !targetParam) {
      return '—'
    }

    const inputId = `${slot.id}-${rowIdx}-${column.key}`

    switch (column.key) {
      case 'midiCc':
        return (
          <CarbonNumberInput
            id={inputId}
            size="sm"
            min={0}
            max={127}
            step={1}
            value={mapping?.cc ?? 0}
            label=""
            hideLabel
            hideSteppers
            onChange={(_evt: unknown, { value }: { value: string | number }) => {
              onMidiMappingChange(chain.id, plugin, { cc: Math.max(0, Math.min(127, Math.round(Number(value)))) })
            }}
            style={{ width: 76 }}
          />
        )
      case 'midiChannel':
        return (
          <Select
            id={inputId}
            size="sm"
            hideLabel
            labelText=""
            value={String(mapping?.channel ?? 0)}
            onChange={(evt: ChangeEvent<HTMLSelectElement>) => {
              onMidiMappingChange(chain.id, plugin, { channel: Number(evt.target.value) })
            }}
          >
            <SelectItem value="0" text="Omni" />
            {Array.from({ length: 16 }, (_, index) => (
              <SelectItem key={index + 1} value={String(index + 1)} text={`Ch ${index + 1}`} />
            ))}
          </Select>
        )
      case 'midiCurve':
        return (
          <Select
            id={inputId}
            size="sm"
            hideLabel
            labelText=""
            value={mapping?.curve_type ?? 'linear'}
            onChange={(evt: ChangeEvent<HTMLSelectElement>) => {
              onMidiMappingChange(chain.id, plugin, { curve_type: evt.target.value as MIDICurveType })
            }}
          >
            {MIDI_CURVE_OPTIONS.map(option => (
              <SelectItem key={option.id} value={option.id} text={option.label} />
            ))}
          </Select>
        )
      case 'midiMin':
        return (
          <CarbonNumberInput
            id={inputId}
            size="sm"
            min={0}
            max={1}
            step={0.01}
            value={mapping?.min_val ?? 0}
            label=""
            hideLabel
            hideSteppers
            onChange={(_evt: unknown, { value }: { value: string | number }) => {
              onMidiMappingChange(chain.id, plugin, { min_val: Number(value) })
            }}
            style={{ width: 76 }}
          />
        )
      case 'midiMax':
        return (
          <CarbonNumberInput
            id={inputId}
            size="sm"
            min={0}
            max={1}
            step={0.01}
            value={mapping?.max_val ?? 1}
            label=""
            hideLabel
            hideSteppers
            onChange={(_evt: unknown, { value }: { value: string | number }) => {
              onMidiMappingChange(chain.id, plugin, { max_val: Number(value) })
            }}
            style={{ width: 76 }}
          />
        )
      default:
        return ''
    }
  }, [chain, midiMappings, onMidiMappingChange, pluginInventoryByUri, slot.id])

  // Build DataTable rows
  const rows = useMemo(() => {
    return plugins.map((plugin, rowIdx) => {
      const displayName = getDisplayPluginName(plugin.uri, plugin.name)
      const pluginPeaks = peaksMap[plugin.uri] ?? peaksMap[`${plugin.uri}::${plugin.position}`]
      let inputDb = '—'
      let outputDb = '—'
      if (pluginPeaks) {
        const ports = Object.values(pluginPeaks)
        const inPort = ports.find(p => p.port_symbol?.includes('in')) ?? ports[0]
        const outPort = ports.find(p => p.port_symbol?.includes('out')) ?? ports[ports.length > 1 ? 1 : 0]
        if (inPort) inputDb = (20 * Math.log10(Math.max(inPort.peak, 0.0001))).toFixed(1)
        if (outPort) outputDb = (20 * Math.log10(Math.max(outPort.peak, 0.0001))).toFixed(1)
      }

      const cells: Record<string, React.ReactNode> = {
        position: (
          <CarbonNumberInput
            id={`pos-${slot.id}-${rowIdx}`}
            size="sm"
            min={0}
            max={plugins.length - 1}
            value={plugin.position}
            label=""
            hideLabel
            hideSteppers
            onChange={(_e: unknown, { value }: { value: string | number }) => {
              if (chain) {
                onPositionChange(chain.id, plugins, plugin.position, Number(value))
              }
            }}
            style={{ width: 48 }}
          />
        ),
        name: displayName,
        bypass: (
          <Checkbox
            id={`bypass-${slot.id}-${rowIdx}`}
            checked={plugin.bypassed}
            labelText=""
            hideLabel
            onChange={() => {
              if (chain) onBypassToggle(chain.id, plugin.uri, plugin.bypassed, plugin.position)
            }}
          />
        ),
        actions: (
          <IconButton
            kind="ghost"
            size="sm"
            label="Remove"
            onClick={() => {
              if (chain) onRemovePlugin(chain.id, plugin.uri, plugin.position)
            }}
          >
            <TrashCan />
          </IconButton>
        ),
        inputLevel: inputDb,
        outputLevel: outputDb,
        // Automation columns
        autoArmed: <Tag type="cool-gray" size="sm">Off</Tag>,
        autoRecorded: <Tag type="cool-gray" size="sm">—</Tag>,
      }

      for (const column of visibleColumns) {
        if (column.group === 'parameter') {
          cells[column.key] = renderParameterCell(plugin, rowIdx, column)
          continue
        }
        if (column.group === 'midi') {
          cells[column.key] = renderMidiCell(plugin, rowIdx, column)
        }
      }

      return {
        id: `${slot.id}-plugin-${rowIdx}`,
        ...cells,
      }
    })
  }, [plugins, slot.id, chain, peaksMap, onBypassToggle, onRemovePlugin, onPositionChange, renderMidiCell, renderParameterCell, visibleColumns])

  // Chain selector items
  const chainItems = useMemo(() => {
    const items = chains.map(c => ({ id: String(c.id), label: c.name }))
    items.unshift({ id: '', label: '(None)' })
    return items
  }, [chains])

  const selectedChainItem = useMemo(
    () => chainItems.find(c => c.id === String(slot.chainId ?? '')) ?? chainItems[0],
    [chainItems, slot.chainId],
  )

  // Flatten plugin groups for add-plugin dropdown
  const addPluginItems = useMemo(() => {
    const items: Array<{ id: string; label: string; group: string }> = []
    for (const group of pluginGroups) {
      for (const p of group.plugins) {
        items.push({ id: p.uri, label: p.name, group: group.label })
      }
    }
    return items
  }, [pluginGroups])

  // Port items
  const portItems = useMemo(() => {
    const items = ports.map(p => ({ id: String(p.index), label: p.name }))
    items.unshift({ id: '', label: '(Default)' })
    return items
  }, [ports])

  return (
    <div style={flowSectionStyle} data-flow-index={flowIndex} data-testid={`audio-table-flow-${slot.id}`}>

      {/* ── Flow Header Row ──────────────────────────────────────── */}
      <div style={flowHeaderStyle}>
        <div style={flowDotStyle(slot.color)} />
        <Tag type="blue" size="sm">Flow {slot.label}</Tag>

        {/* Chain selector */}
        <Dropdown
          id={`chain-select-${slot.id}`}
          titleText=""
          label="Chain"
          size="sm"
          items={chainItems}
          itemToString={(item: typeof chainItems[number] | null) => item?.label ?? ''}
          selectedItem={selectedChainItem}
          onChange={({ selectedItem }: { selectedItem: typeof chainItems[number] | null }) => {
            const id = selectedItem?.id ? Number(selectedItem.id) : null
            onChainAssign(flowIndex, id)
          }}
          style={{ minWidth: 140 }}
        />

        {/* Chain CRUD overflow */}
        <OverflowMenu size="sm" flipped>
          <OverflowMenuItem
            itemText="New chain"
            onClick={() => onCreateChain(`Chain ${chains.length + 1}`)}
          />
          {chain && (
            <>
              <OverflowMenuItem
                itemText="Rename chain"
                onClick={() => {
                  const name = window.prompt('New name:', chain.name)
                  if (name?.trim()) onRenameChain(chain.id, name.trim())
                }}
              />
              <OverflowMenuItem
                itemText="Delete chain"
                isDelete
                onClick={() => {
                  if (window.confirm(`Delete chain "${chain.name}"?`)) {
                    onDeleteChain(chain.id)
                    onChainAssign(flowIndex, null)
                  }
                }}
              />
            </>
          )}
        </OverflowMenu>

        {/* Mute / Solo */}
        <Toggle
          id={`mute-${slot.id}`}
          size="sm"
          labelText="M"
          hideLabel
          toggled={slot.muted}
          onToggle={() => onMuteToggle(flowIndex)}
        />
        <Toggle
          id={`solo-${slot.id}`}
          size="sm"
          labelText="S"
          hideLabel
          toggled={slot.solo}
          onToggle={() => onSoloToggle(flowIndex)}
        />

        {/* Dry/Wet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>D/W</span>
          <CarbonNumberInput
            id={`drywet-${slot.id}`}
            size="sm"
            min={0}
            max={100}
            step={1}
            value={slot.dryWetMix}
            label=""
            hideLabel
            hideSteppers
            onChange={(_e: unknown, { value }: { value: string | number }) =>
              onDryWetChange(flowIndex, Number(value))
            }
            style={{ width: 56 }}
          />
        </div>

        {/* Audio ports */}
        <Dropdown
          id={`port-in-${slot.id}`}
          titleText=""
          label="In"
          size="sm"
          items={portItems}
          itemToString={(item: typeof portItems[number] | null) => item?.label ?? ''}
          selectedItem={portItems[0]}
          onChange={() => {}}
          style={{ minWidth: 100 }}
        />
        <Dropdown
          id={`port-out-${slot.id}`}
          titleText=""
          label="Out"
          size="sm"
          items={portItems}
          itemToString={(item: typeof portItems[number] | null) => item?.label ?? ''}
          selectedItem={portItems[0]}
          onChange={() => {}}
          style={{ minWidth: 100 }}
        />

        <div style={{ flex: 1 }} />

        {/* Remove flow */}
        <IconButton
          kind="ghost"
          size="sm"
          label="Remove flow"
          disabled={!canRemoveFlow}
          onClick={() => onRemoveFlow(flowIndex)}
        >
          <TrashCan />
        </IconButton>
      </div>

      {/* ── DataTable ────────────────────────────────────────────── */}
      {chain ? (
        <>
          <DataTable
            rows={rows}
            headers={dataTableHeaders}
            isSortable
            useZebraStyles
            size="sm"
          >
            {({ rows: tableRows, headers: tableHeaders, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
              <TableContainer {...getTableContainerProps()}>
                <TableToolbar {...getToolbarProps()} size="sm">
                  <TableToolbarContent>
                    <Tag type="cool-gray" size="sm">{plugins.length} plugins</Tag>
                    {search.trim() ? <Tag type="blue" size="sm">Filtered</Tag> : null}
                  </TableToolbarContent>
                </TableToolbar>
                <Table {...getTableProps()} size="sm">
                  <TableHead>
                    <TableRow>
                      {tableHeaders.map(h => {
                        const { key: _k, ...hp } = getHeaderProps({ header: h })
                        return <TableHeader key={h.key} {...hp}>{h.header}</TableHeader>
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableRows.map((row, rowIdx) => {
                      const { key: _k, ...rp } = getRowProps({ row })
                      return (
                        <TableRow key={row.id} {...rp}>
                          {row.cells.map((cell, colIdx) => (
                            <TableCell
                              key={cell.id}
                              data-row={rowIdx}
                              data-col={colIdx}
                            >
                              {cell.value as React.ReactNode}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}

                    {/* ── Add Plugin Row ───────────────────────────── */}
                    <TableRow>
                      <TableCell colSpan={dataTableHeaders.length}>
                        <Dropdown
                          id={`add-plugin-${slot.id}`}
                          titleText=""
                          label="Add plugin..."
                          size="sm"
                          items={addPluginItems}
                          itemToString={(item: typeof addPluginItems[number] | null) => {
                            if (!item) return ''
                            return `[${item.group}] ${item.label}`
                          }}
                          onChange={({ selectedItem }: { selectedItem: typeof addPluginItems[number] | null }) => {
                            if (selectedItem && chain) {
                              onAddPlugin(chain.id, selectedItem.id)
                            }
                          }}
                          style={{ maxWidth: 300 }}
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-secondary)', background: 'var(--cds-layer-01)' }}>
          No chain assigned — select a chain from the dropdown above.
        </div>
      )}
    </div>
  )
}
