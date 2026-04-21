import { useQueries, useQuery } from '@tanstack/react-query'
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Column,
  Content,
  DataTable,
  Grid,
  InlineLoading,
  OverflowMenu,
  OverflowMenuItem,
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
} from '@carbon/react'

import {
  MAP2_PLATFORM_NAME,
} from '../components/branding/map2Branding'
import map2Logo from '../../assets/MAP2-LOGO.png'
import mapGridHorizonImage from '../../../../branding/MAP-GRID-HORIZON-2026.png'
import landingHeroBrandImage from '../../../../branding/MAP-LOGO-2026.png'
import { completeHomeDesktopBoot, shouldShowHomeBootSplash } from './homeDesktopSession'
import { readDesktopWallpaperState } from './desktopWallpaper'
import { readHomeLandingPreferences } from './homeLandingPreferences'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { useShellSummaryData } from '../layout/useShellSummaryData'
import { navigateHomeShellRoute, prefetchHomeShellRoute } from './homeShellNavigation'
import { useCluster } from '../contexts/useCluster'
import { buildPlatformNodeWorkspaceHref } from '../platform/routes'
import { useClusterHardwareInventory } from '../hooks/useDeviceLocation'
import { useClusterSnapshotRuntimeLiveState } from '../hooks/useSnapshotRuntimeState'
import { useAVBDiscovery, useAVBStreams } from '../hooks/useAvbStatus'
import { readPorts } from '../components/MidiHub/portUtils'
import { withNodeQuery } from '../utils/clusterTransport'
import { computeLatencyPressure } from '../utils/latencyPressure'
import {
  irApi,
  latencyV2Api,
  midiHubApi,
  pluginsApi,
  pluginPresetsApi,
  type LatencyJitterStats,
  type MidiHubRoute,
} from '../../map2/api'
import {
  WelcomeHero,
  type WelcomeHeroArtifact,
  type WelcomeHeroHardwareDevice,
  type WelcomeHeroRibbonItem,
} from '../components/landing/WelcomeHero'
import './HomePage.boot.css'
import './HomePage.landing.css'

const HOME_BOOT_SPLASH_DURATION_MS = 4_000

const HOME_TABLE_HEADERS = [
  { key: 'surface', header: 'Surface' },
  { key: 'signal', header: 'Signal' },
  { key: 'currentState', header: 'Current state' },
  { key: 'scope', header: 'Scope' },
  { key: 'detail', header: 'Detail' },
  { key: 'workspace', header: 'Workspace' },
] as const

type InventoryNode = {
  status?: string
  audio_interfaces?: string[]
  usb_audio_devices?: Array<Record<string, unknown>>
  pipewire_devices?: Array<Record<string, unknown>>
}

type HomeTelemetryTone = 'healthy' | 'warning' | 'critical' | 'neutral'

type HomeTelemetryRow = {
  id: string
  category: string
  signal: string
  currentState: string
  scope: string
  detail: string
  workspace: string
  route?: string
  tone: HomeTelemetryTone
}

type SummaryMetric = {
  id: string
  value: string
  label: string
  helper: string
  route: string
  tone: HomeTelemetryTone
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeHardwareDeviceName(value: unknown): string | null {
  if (typeof value === 'string') {
    return normalizeText(value)
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  for (const key of ['description', 'name', 'product', 'nick']) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

function dedupeNames(names: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  for (const rawName of names) {
    const name = normalizeText(rawName)
    if (!name) {
      continue
    }

    const key = name.toLocaleLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    output.push(name)
  }

  return output
}

function collectAudioInterfaces(node: InventoryNode | undefined): string[] {
  if (!node || node.status === 'offline') {
    return []
  }

  return dedupeNames([
    ...(node.audio_interfaces ?? []),
    ...(node.usb_audio_devices ?? []).map(normalizeHardwareDeviceName),
    ...(node.pipewire_devices ?? []).map(normalizeHardwareDeviceName),
  ]).filter((name) => !/^(alsa|jack|pipewire|pulseaudio|default|system)$/i.test(name))
}

function formatMidiFilter(route: MidiHubRoute): string {
  const parts: string[] = [route.route_type]

  if (route.filter.message_types.length > 0) {
    parts.push(route.filter.message_types.join('/'))
  }

  if (route.filter.channels.length > 0) {
    parts.push(`Ch ${route.filter.channels.join(', ')}`)
  }

  if (route.transform_chain.length > 0) {
    parts.push(`${route.transform_chain.length} transform${route.transform_chain.length === 1 ? '' : 's'}`)
  }

  const latencyTargets = Object.entries(route.destination_latency_ms ?? {})
  if (latencyTargets.length > 0) {
    parts.push(
      latencyTargets
        .map(([destinationId, latencyMs]) => `${destinationId} ${latencyMs} ms`)
        .join(' · '),
    )
  }

  return parts.join(' · ')
}

function resolveMidiMappingRoute(nodeId: string, route: MidiHubRoute): string {
  const haystack = `${route.source_port} ${route.destination_ports.join(' ')}`.toLocaleLowerCase()

  if (haystack.includes('mpx1')) {
    return withNodeQuery('/mpx1/midi-map', nodeId)
  }
  if (haystack.includes('intelfx')) {
    return withNodeQuery('/intelfx/midi-map', nodeId)
  }
  if (haystack.includes('jogg') || haystack.includes('hotone')) {
    return withNodeQuery('/hotone-jogg', nodeId)
  }
  if (haystack.includes('edirol') || haystack.includes('ua-1000')) {
    return withNodeQuery('/edirol-ua1000', nodeId)
  }
  if (haystack.includes('ground control')) {
    return withNodeQuery('/ground-control-pro', nodeId)
  }

  return withNodeQuery(
    route.transform_chain.length > 0 || route.filter.message_types.length > 0
      ? '/midi-hub/processing'
      : '/midi-hub/connections',
    nodeId,
  )
}

function countRowsByTone(rows: HomeTelemetryRow[], tone: HomeTelemetryTone): number {
  return rows.filter((row) => row.tone === tone).length
}

function filterTelemetryRows(rows: HomeTelemetryRow[], query: string): HomeTelemetryRow[] {
  const search = query.trim().toLocaleLowerCase()
  if (!search) {
    return rows
  }

  return rows.filter((row) => (
    `${row.category} ${row.signal} ${row.currentState} ${row.scope} ${row.detail} ${row.workspace}`
      .toLocaleLowerCase()
      .includes(search)
  ))
}

function toneToTagType(tone: HomeTelemetryTone): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  if (tone === 'healthy') {
    return 'green'
  }
  if (tone === 'warning') {
    return 'warm-gray'
  }
  if (tone === 'critical') {
    return 'red'
  }

  return 'cool-gray'
}

function toneToLabel(tone: HomeTelemetryTone): string {
  if (tone === 'healthy') {
    return 'Healthy'
  }
  if (tone === 'warning') {
    return 'Watch'
  }
  if (tone === 'critical') {
    return 'Critical'
  }

  return 'Info'
}

export function HomePage() {
  const navigate = useNavigate()
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const { nodes: clusterNodes } = useCluster()
  const shellSummaryData = useShellSummaryData({
    pathname: '/',
    navOpen: true,
  })
  const hardwareInventoryQuery = useClusterHardwareInventory(true)
  const clusterSnapshotQuery = useClusterSnapshotRuntimeLiveState({
    refetchInterval: 5_000,
  })
  const avbDiscoveryQuery = useAVBDiscovery(true)
  const avbStreamsQuery = useAVBStreams(true)
  const wallpaper = useMemo(() => readDesktopWallpaperState(), [])
  const landingPreferences = useMemo(() => readHomeLandingPreferences(), [])
  const shouldShowSplash = useMemo(
    () => landingPreferences.bootSplashEnabled && shouldShowHomeBootSplash(),
    [landingPreferences.bootSplashEnabled],
  )
  const [showBootSplash, setShowBootSplash] = useState(shouldShowSplash)
  const [searchValue, setSearchValue] = useState('')

  const onlineNodes = useMemo(
    () => clusterNodes.filter((node) => node.isOnline !== false),
    [clusterNodes],
  )
  const nodeLabelById = useMemo(
    () => new Map(clusterNodes.map((node) => [node.nodeId, node.hostname] as const)),
    [clusterNodes],
  )

  const midiStatusQueries = useQueries({
    queries: onlineNodes.map((node) => ({
      queryKey: ['home', 'telemetry', 'midi-status', node.nodeId],
      queryFn: () => midiHubApi.getStatusForNode(node.nodeId),
      staleTime: 1_000,
      refetchInterval: 3_000,
    })),
  })
  const midiRouteQueries = useQueries({
    queries: onlineNodes.map((node) => ({
      queryKey: ['home', 'telemetry', 'midi-routes', node.nodeId],
      queryFn: () => midiHubApi.getRoutesForNode(node.nodeId),
      staleTime: 1_000,
      refetchInterval: 3_000,
    })),
  })
  const latencyQueries = useQueries({
    queries: onlineNodes.map((node) => ({
      queryKey: ['home', 'telemetry', 'latency-pressure', node.nodeId],
      queryFn: () => latencyV2Api.getJitterStats(node.nodeId),
      staleTime: 500,
      refetchInterval: 1_000,
    })),
  })

  const pluginListQuery = useQuery({
    queryKey: ['home', 'welcome', 'plugin-list'],
    queryFn: () => pluginsApi.list(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const pluginDiscoverQuery = useQuery({
    queryKey: ['home', 'welcome', 'plugin-discover'],
    queryFn: () => pluginsApi.discover(false),
    staleTime: 60_000,
  })
  const cabinetIrQuery = useQuery({
    queryKey: ['home', 'welcome', 'ir-cabinets'],
    queryFn: () => irApi.listCabinets(),
    staleTime: 60_000,
  })
  const reverbIrQuery = useQuery({
    queryKey: ['home', 'welcome', 'ir-reverbs'],
    queryFn: () => irApi.listReverbs(),
    staleTime: 60_000,
  })
  const pluginPresetsQuery = useQuery({
    queryKey: ['home', 'welcome', 'plugin-presets'],
    queryFn: () => pluginPresetsApi.list(),
    staleTime: 60_000,
  })

  const midiDeviceRows = useMemo<HomeTelemetryRow[]>(() => {
    const rows = onlineNodes.flatMap((node, index) => {
      const status = midiStatusQueries[index]?.data as Record<string, unknown> | undefined
      return readPorts(status?.ports)
        .filter((port) => port.kind !== 'virtual' && !/virtual/i.test(port.name))
        .map((port) => ({
          id: `${node.nodeId}:${port.port_id}`,
          category: 'MIDI device',
          signal: port.name,
          currentState: port.direction,
          scope: node.hostname,
          detail: `${port.kind} port · ${port.port_id}`,
          workspace: 'MIDI connections',
          route: withNodeQuery('/midi-hub/connections', node.nodeId),
          tone: 'healthy' as const,
        }))
    })

    if (rows.length > 0) {
      return rows
    }

    return shellSummaryData.launcherInterfaceSummary.midiInterfaces.map((name, index) => ({
      id: `shell-midi-${index}`,
      category: 'MIDI device',
      signal: name,
      currentState: 'Connected',
      scope: shellSummaryData.hostInfo?.hostname ?? 'Local node',
      detail: 'Local MIDI interface summary.',
      workspace: 'MIDI connections',
      route: '/midi-hub/connections',
      tone: 'healthy' as const,
    }))
  }, [
    midiStatusQueries,
    onlineNodes,
    shellSummaryData.hostInfo?.hostname,
    shellSummaryData.launcherInterfaceSummary.midiInterfaces,
  ])

  const midiMappingRows = useMemo<HomeTelemetryRow[]>(
    () => onlineNodes.flatMap((node, index) => {
      const response = midiRouteQueries[index]?.data as { routes?: MidiHubRoute[] } | undefined
      const routes = response?.routes ?? []

      return routes
        .filter((route) => route.enabled)
        .map((route) => ({
          id: `${node.nodeId}:${route.route_id}`,
          category: 'Mapped MIDI',
          signal: route.source_port,
          currentState: route.destination_ports.join(', '),
          scope: node.hostname,
          detail: formatMidiFilter(route),
          workspace: 'MIDI mapping',
          route: resolveMidiMappingRoute(node.nodeId, route),
          tone: route.transform_chain.length > 0 || route.filter.message_types.length > 0
            ? 'warning' as const
            : 'healthy' as const,
        }))
    }),
    [midiRouteQueries, onlineNodes],
  )

  const audioInterfaceRows = useMemo<HomeTelemetryRow[]>(() => {
    const inventoryNodes = hardwareInventoryQuery.data?.nodes ?? {}
    const rows = Object.entries(inventoryNodes).flatMap(([nodeId, node]) => {
      const nodeName = nodeLabelById.get(nodeId) ?? nodeId
      return collectAudioInterfaces(node).map((name, index) => ({
        id: `${nodeId}:audio:${index}:${name}`,
        category: 'Audio interface',
        signal: name,
        currentState: 'Connected',
        scope: nodeName,
        detail: 'Node-aware audio interface inventory.',
        workspace: 'Audio engine',
        route: buildPlatformNodeWorkspaceHref('audio-engine', nodeId),
        tone: 'healthy' as const,
      }))
    })

    if (rows.length > 0) {
      return rows
    }

    return shellSummaryData.launcherInterfaceSummary.audioInterfaces.map((name, index) => ({
      id: `shell-audio-${index}`,
      category: 'Audio interface',
      signal: name,
      currentState: 'Connected',
      scope: shellSummaryData.hostInfo?.hostname ?? 'Local node',
      detail: 'Launcher interface summary fallback.',
      workspace: 'Audio engine',
      route: buildPlatformNodeWorkspaceHref('audio-engine'),
      tone: 'healthy' as const,
    }))
  }, [
    hardwareInventoryQuery.data?.nodes,
    nodeLabelById,
    shellSummaryData.hostInfo?.hostname,
    shellSummaryData.launcherInterfaceSummary.audioInterfaces,
  ])

  const avbEndpointRows = useMemo<HomeTelemetryRow[]>(() => {
    const runningStreams = (avbStreamsQuery.data?.streams ?? []).filter((stream) => stream.state === 'running').length
    const discovery = avbDiscoveryQuery.data
    const summaryRow: HomeTelemetryRow = {
      id: 'avb-fabric',
      category: 'AVB fabric',
      signal: 'Fabric state',
      currentState: shellSummaryData.platformStatus.avb.label,
      scope: `${discovery?.total_discovered ?? 0} endpoints`,
      detail: `${discovery?.talker_nodes ?? 0} talkers · ${discovery?.listener_nodes ?? 0} listeners · ${runningStreams} running streams`,
      workspace: 'AVB routing',
      route: buildPlatformNodeWorkspaceHref('avb-routing'),
      tone: shellSummaryData.platformStatus.avb.state === 'ok' ? 'healthy' : 'warning',
    }

    const nodeRows = (discovery?.nodes ?? []).map((node) => {
      const capabilities = node.avb_capabilities
      return {
        id: `avb-node:${node.node_id}`,
        category: 'AVB endpoint',
        signal: node.hostname,
        currentState: `${capabilities?.talker_streams ?? 0} talkers · ${capabilities?.listener_streams ?? 0} listeners`,
        scope: capabilities?.interface ?? 'AVB fabric',
        detail: `${capabilities?.ptp_synced ? 'PTP synced' : 'PTP pending'} · ${capabilities?.sample_rate ?? 'n/a'} Hz · ${capabilities?.channels ?? 'n/a'} ch`,
        workspace: 'AVB routing',
        route: buildPlatformNodeWorkspaceHref('avb-routing', node.node_id),
        tone: capabilities?.ptp_synced ? 'healthy' as const : 'warning' as const,
      } satisfies HomeTelemetryRow
    })

    return [summaryRow, ...nodeRows]
  }, [
    avbDiscoveryQuery.data,
    avbStreamsQuery.data?.streams,
    shellSummaryData.platformStatus.avb.label,
    shellSummaryData.platformStatus.avb.state,
  ])

  const snapshotRows = useMemo<HomeTelemetryRow[]>(() => {
    const states = clusterSnapshotQuery.data?.nodes ?? []
    const visibleStates = states.filter((state) => !state.is_offline)
    const grouped = new Map<string, {
      id: string
      signal: string
      currentState: string
      detailParts: string[]
      nodeIds: string[]
      route: string
      tone: HomeTelemetryTone
    }>()

    for (const state of visibleStates) {
      const signal = state.snapshot_name ?? (state.snapshot_id != null ? `Snapshot ${state.snapshot_id}` : 'No snapshot live')
      const currentState = state.display_label
      const key = `${state.snapshot_id ?? 'none'}:${state.snapshot_revision ?? 'none'}:${currentState}`
      const existing = grouped.get(key)
      const nodeLabel = nodeLabelById.get(state.node_id) ?? state.node_id
      const tone = state.state === 'live' ? 'healthy' as const : 'warning' as const

      if (existing) {
        existing.nodeIds.push(nodeLabel)
        continue
      }

      grouped.set(key, {
        id: key,
        signal,
        currentState,
        detailParts: [
          state.snapshot_id != null ? `Snapshot ${state.snapshot_id}` : 'No active snapshot ID',
          state.snapshot_revision ? `Revision ${state.snapshot_revision}` : 'No revision',
        ],
        nodeIds: [nodeLabel],
        route: withNodeQuery('/snapshot-editor', state.node_id),
        tone,
      })
    }

    return Array.from(grouped.values()).map((group) => ({
      id: group.id,
      category: 'Snapshot',
      signal: group.signal,
      currentState: group.currentState,
      scope: `${group.nodeIds.length} node${group.nodeIds.length === 1 ? '' : 's'}`,
      detail: `${group.detailParts.join(' · ')} · ${group.nodeIds.join(', ')}`,
      workspace: 'Snapshot editor',
      route: group.nodeIds.length === 1 ? group.route : '/snapshot-editor',
      tone: group.tone,
    }))
  }, [clusterSnapshotQuery.data?.nodes, nodeLabelById])

  const latencyPressureRows = useMemo<HomeTelemetryRow[]>(
    () => onlineNodes.map((node, index) => {
      const jitter = latencyQueries[index]?.data as LatencyJitterStats | undefined
      const analysis = computeLatencyPressure({
        running: jitter?.running ?? null,
        rtlP95Ms: jitter?.rtl_p95_ms ?? null,
        jitterP95Ms: jitter?.p95_ms ?? null,
        xrunCount: jitter?.xrun_count ?? null,
      })

      return {
        id: `latency:${node.nodeId}`,
        category: 'Latency',
        signal: node.hostname,
        currentState: `${analysis.statusLabel} ${analysis.scoreDisplay}/10`,
        scope: 'Audio engine',
        detail: analysis.isAvailable
          ? [
              analysis.inputs.effectiveLatencyMs != null ? `RTL p95 ${analysis.inputs.effectiveLatencyMs.toFixed(2)} ms` : null,
              analysis.inputs.jitterP95Ms != null ? `Jitter p95 ${analysis.inputs.jitterP95Ms.toFixed(3)} ms` : null,
              analysis.inputs.xrunCount != null ? `${analysis.inputs.xrunCount} xruns` : null,
            ].filter((part): part is string => Boolean(part)).join(' · ')
          : 'Waiting for realtime telemetry.',
        workspace: 'Audio engine',
        route: buildPlatformNodeWorkspaceHref('audio-engine', node.nodeId),
        tone: analysis.status === 'critical' || analysis.status === 'offline'
          ? 'critical'
          : analysis.status === 'watch'
            ? 'warning'
            : analysis.isAvailable
              ? 'healthy'
              : 'neutral',
      }
    }),
    [latencyQueries, onlineNodes],
  )

  const telemetryLoading = (
    hardwareInventoryQuery.isLoading
    || clusterSnapshotQuery.isLoading
    || avbDiscoveryQuery.isLoading
    || midiStatusQueries.some((query) => query.isLoading)
    || midiRouteQueries.some((query) => query.isLoading)
    || latencyQueries.some((query) => query.isLoading)
  )

  const allTelemetryRows = useMemo(
    () => [
      ...midiDeviceRows,
      ...midiMappingRows,
      ...audioInterfaceRows,
      ...avbEndpointRows,
      ...snapshotRows,
      ...latencyPressureRows,
    ],
    [
      audioInterfaceRows,
      avbEndpointRows,
      latencyPressureRows,
      midiDeviceRows,
      midiMappingRows,
      snapshotRows,
    ],
  )

  const criticalRowCount = useMemo(
    () => countRowsByTone(allTelemetryRows, 'critical'),
    [allTelemetryRows],
  )
  const warningRowCount = useMemo(
    () => countRowsByTone(allTelemetryRows, 'warning'),
    [allTelemetryRows],
  )

  const summaryMetrics = useMemo<SummaryMetric[]>(() => {
    const nodesState = shellSummaryData.platformStatus.nodes.state
    const avbState = shellSummaryData.platformStatus.avb.state
    const avdeccState = shellSummaryData.platformStatus.avdecc.state

    const stateToTone = (state: 'ok' | 'warn' | 'off' | 'loading'): HomeTelemetryTone => {
      if (state === 'warn') return 'warning'
      if (state === 'off') return 'critical'
      if (state === 'ok') return 'healthy'
      return 'neutral'
    }

    const telemetryTone: HomeTelemetryTone = criticalRowCount > 0
      ? 'critical'
      : warningRowCount > 0
        ? 'warning'
        : 'healthy'

    const avbDiscovered = avbDiscoveryQuery.data?.total_discovered ?? Math.max(avbEndpointRows.length - 1, 0)

    return [
      {
        id: 'nodes',
        value: String(onlineNodes.length),
        label: 'live nodes',
        helper: shellSummaryData.platformStatus.nodes.label,
        route: buildPlatformNodeWorkspaceHref('audio-engine'),
        tone: stateToTone(nodesState),
      },
      {
        id: 'midi-devices',
        value: String(midiDeviceRows.length),
        label: 'MIDI devices',
        helper: 'physical ports reporting into the cluster',
        route: '/midi-hub/connections',
        tone: midiDeviceRows.length > 0 ? 'healthy' : 'neutral',
      },
      {
        id: 'midi-mappings',
        value: String(midiMappingRows.length),
        label: 'mapped routes',
        helper: 'enabled transforms and routing filters',
        route: '/midi-hub/processing',
        tone: midiMappingRows.length > 0 ? 'healthy' : 'neutral',
      },
      {
        id: 'audio-interfaces',
        value: String(audioInterfaceRows.length),
        label: 'audio interfaces',
        helper: 'connected interface inventory across nodes',
        route: buildPlatformNodeWorkspaceHref('audio-engine'),
        tone: telemetryTone,
      },
      {
        id: 'avb-endpoints',
        value: String(avbDiscovered),
        label: 'AVB endpoints',
        helper: shellSummaryData.platformStatus.avb.label,
        route: buildPlatformNodeWorkspaceHref('avb-routing'),
        tone: stateToTone(avbState),
      },
      {
        id: 'avdecc',
        value: String(shellSummaryData.platformStatus.avdecc.label.match(/\d+/)?.[0] ?? 0),
        label: 'AVDECC entities',
        helper: shellSummaryData.platformStatus.avdecc.label,
        route: buildPlatformNodeWorkspaceHref('avb-routing'),
        tone: stateToTone(avdeccState),
      },
      {
        id: 'snapshots',
        value: String(snapshotRows.length),
        label: 'snapshot groups',
        helper: 'live runtime snapshot states',
        route: '/snapshot-editor',
        tone: snapshotRows.length > 0 ? 'healthy' : 'neutral',
      },
    ]
  }, [
    audioInterfaceRows.length,
    avbDiscoveryQuery.data?.total_discovered,
    avbEndpointRows.length,
    criticalRowCount,
    midiDeviceRows.length,
    midiMappingRows.length,
    onlineNodes.length,
    shellSummaryData.platformStatus.avb.label,
    shellSummaryData.platformStatus.avb.state,
    shellSummaryData.platformStatus.avdecc.label,
    shellSummaryData.platformStatus.avdecc.state,
    shellSummaryData.platformStatus.nodes.label,
    shellSummaryData.platformStatus.nodes.state,
    snapshotRows.length,
    warningRowCount,
  ])

  const filteredTelemetryRows = useMemo(
    () => filterTelemetryRows(allTelemetryRows, searchValue),
    [allTelemetryRows, searchValue],
  )

  const tableRows = useMemo<HomeTelemetryRow[]>(() => {
    if (filteredTelemetryRows.length > 0) {
      return filteredTelemetryRows
    }

    const trimmedSearch = searchValue.trim()
    return [{
      id: trimmedSearch ? 'home-empty-search' : 'home-empty',
      category: 'Status',
      signal: trimmedSearch ? 'No matching telemetry' : telemetryLoading ? 'Loading telemetry' : 'No telemetry reported',
      currentState: trimmedSearch ? 'No results' : telemetryLoading ? 'Refreshing' : 'Idle',
      scope: 'Home',
      detail: trimmedSearch
        ? `No home telemetry rows match "${trimmedSearch}".`
        : 'No live signals are currently reporting into the unified operations table.',
      workspace: 'Home',
      tone: 'neutral',
    }]
  }, [filteredTelemetryRows, searchValue, telemetryLoading])

  const tableRowLookup = useMemo(
    () => new Map(tableRows.map((row) => [row.id, row] as const)),
    [tableRows],
  )

  // ---------- Welcome Hero props ----------
  const welcomeArtifacts = useMemo<WelcomeHeroArtifact[]>(() => {
    const pluginCount = (
      pluginDiscoverQuery.data?.count
      ?? pluginDiscoverQuery.data?.plugins?.length
      ?? pluginListQuery.data?.count
      ?? pluginListQuery.data?.loaded?.length
      ?? 0
    )
    const cabinetCount = cabinetIrQuery.data?.count ?? cabinetIrQuery.data?.irs?.length ?? 0
    const reverbCount = reverbIrQuery.data?.count ?? reverbIrQuery.data?.irs?.length ?? 0
    const irCount = cabinetCount + reverbCount
    const presetCount = pluginPresetsQuery.data?.count ?? pluginPresetsQuery.data?.presets?.length ?? 0
    const snapshotCount = snapshotRows.length
    const graphCount = midiMappingRows.length

    return [
      {
        key: 'presets',
        count: presetCount,
        label: 'Presets',
        sub: 'Plugin presets across the library',
        accent: 'var(--wh-primary)',
        route: '/workspace/artifacts?category=plugin-presets',
      },
      {
        key: 'irs',
        count: irCount,
        label: 'Impulse Responses',
        sub: `${cabinetCount} cabinets · ${reverbCount} reverbs`,
        accent: 'var(--wh-accent-teal)',
        route: '/workspace/artifacts?category=cabinet-irs',
      },
      {
        key: 'plugins',
        count: pluginCount,
        label: 'LV2 & CLAP Plugins',
        sub: 'Indexed & parameter-mapped',
        accent: 'var(--wh-accent-green)',
        route: '/workspace/artifacts?category=plugin-packs',
      },
      {
        key: 'snapshots',
        count: snapshotCount,
        label: 'Snapshot Groups',
        sub: 'Live runtime states',
        accent: 'var(--wh-accent-amber)',
        route: '/snapshot-editor',
      },
      {
        key: 'graphs',
        count: graphCount,
        label: 'Routing Graphs',
        sub: 'Enabled MIDI transforms & filters',
        accent: 'var(--wh-accent-magenta)',
        route: '/midi-hub/processing',
      },
      {
        key: 'samples',
        count: 0,
        unit: 'clips',
        label: 'Sample Pool',
        sub: 'Drum hits, loops, one-shots',
        accent: 'var(--wh-primary-soft)',
        route: '/workspace/artifacts?category=soundfonts',
      },
    ]
  }, [
    pluginDiscoverQuery.data,
    pluginListQuery.data,
    cabinetIrQuery.data,
    reverbIrQuery.data,
    pluginPresetsQuery.data,
    snapshotRows.length,
    midiMappingRows.length,
  ])

  const welcomeMidiDevices = useMemo<WelcomeHeroHardwareDevice[]>(() => (
    midiDeviceRows.map((row) => ({
      id: row.id,
      name: row.signal,
      port: `${row.scope} · ${row.detail}`,
      status: row.tone === 'critical' ? 'standby' : 'live',
      kind: 'midi',
      route: row.route,
    }))
  ), [midiDeviceRows])

  const welcomeAudioDevices = useMemo<WelcomeHeroHardwareDevice[]>(() => (
    audioInterfaceRows.map((row) => ({
      id: row.id,
      name: row.signal,
      port: `${row.scope} · ${row.detail}`,
      status: row.tone === 'critical' ? 'standby' : 'live',
      kind: 'audio',
      route: row.route,
    }))
  ), [audioInterfaceRows])

  const hardwareCounts = useMemo(() => {
    const midiTotal = welcomeMidiDevices.length
    const midiLive = welcomeMidiDevices.filter((d) => d.status === 'live').length
    const cardsTotal = welcomeAudioDevices.length
    const cardsLive = welcomeAudioDevices.filter((d) => d.status === 'live').length
    return { midiLive, midiTotal, cardsLive, cardsTotal, aggregateIoChannels: 0 }
  }, [welcomeMidiDevices, welcomeAudioDevices])

  const welcomeRibbon = useMemo<WelcomeHeroRibbonItem[]>(() => {
    const avbState = shellSummaryData.platformStatus.avb.state
    const avdeccMatch = shellSummaryData.platformStatus.avdecc.label.match(/\d+/)?.[0] ?? '0'
    const nodes = shellSummaryData.platformStatus.nodes.label.replace(/^Nodes:\s*/i, '')
    return [
      {
        id: 'avb',
        label: 'AVB',
        value: avbState === 'ok' ? 'operational' : avbState === 'warn' ? 'degraded' : avbState === 'off' ? 'disabled' : '…',
        tone: avbState === 'ok' ? 'ok' : avbState === 'warn' ? 'warn' : 'neutral',
        route: buildPlatformNodeWorkspaceHref('avb-routing'),
      },
      {
        id: 'avdecc',
        label: 'AVDECC',
        value: `${avdeccMatch} entities`,
        tone: shellSummaryData.platformStatus.avdecc.state === 'ok' ? 'ok' : 'neutral',
        route: buildPlatformNodeWorkspaceHref('avb-routing'),
      },
      {
        id: 'cluster',
        label: 'Cluster',
        value: nodes,
        tone: shellSummaryData.platformStatus.nodes.state === 'ok' ? 'ok' : 'neutral',
        route: buildPlatformNodeWorkspaceHref('audio-engine'),
      },
      {
        id: 'clock',
        label: 'Clock',
        value: 'internal 96 kHz',
        tone: 'ok',
      },
      {
        id: 'storage',
        label: 'Storage',
        value: 'session ready',
        tone: 'ok',
      },
    ]
  }, [
    shellSummaryData.platformStatus.avb.state,
    shellSummaryData.platformStatus.avdecc.label,
    shellSummaryData.platformStatus.avdecc.state,
    shellSummaryData.platformStatus.nodes.label,
    shellSummaryData.platformStatus.nodes.state,
  ])

  const welcomeTopbar = useMemo(() => ({
    nodeLabel: shellSummaryData.hostInfo?.hostname ?? (onlineNodes[0]?.hostname ?? 'local'),
    versionLabel: '2026.4.2',
    sampleRateLabel: '96 kHz',
    bufferLabel: '64 / 0.67 ms',
    cpuLabel: '—',
  }), [shellSummaryData.hostInfo?.hostname, onlineNodes])

  const welcomeSession = useMemo(() => {
    const liveSnapshotCount = snapshotRows.length
    return {
      lastSessionLabel: liveSnapshotCount > 0
        ? `${liveSnapshotCount} snapshot group${liveSnapshotCount === 1 ? '' : 's'} live`
        : 'No live snapshot',
      openPatchLabel: `${onlineNodes.length} node${onlineNodes.length === 1 ? '' : 's'} online`,
      uptimeLabel: 'live',
    }
  }, [snapshotRows, onlineNodes.length])

  const librarianScanLabel = useMemo(() => {
    const anyLoading = (
      pluginListQuery.isFetching
      || cabinetIrQuery.isFetching
      || reverbIrQuery.isFetching
      || pluginPresetsQuery.isFetching
    )
    return anyLoading ? 'scanning…' : 'last scan just now'
  }, [
    pluginListQuery.isFetching,
    cabinetIrQuery.isFetching,
    reverbIrQuery.isFetching,
    pluginPresetsQuery.isFetching,
  ])

  const handleEnterLiveSurface = useCallback(() => {
    navigateHomeShellRoute(navigate, buildPlatformNodeWorkspaceHref('audio-engine'))
  }, [navigate])
  const handleBrowseLibrary = useCallback(() => {
    navigateHomeShellRoute(navigate, '/workspace/artifacts')
  }, [navigate])
  const handleArtifactClick = useCallback((artifact: WelcomeHeroArtifact) => {
    if (artifact.route) {
      navigateHomeShellRoute(navigate, artifact.route)
    }
  }, [navigate])
  const handleHardwareClick = useCallback((device: WelcomeHeroHardwareDevice) => {
    if (device.route) {
      navigateHomeShellRoute(navigate, device.route)
    }
  }, [navigate])
  const handleHardwareSummaryClick = useCallback((kind: 'midi' | 'audio') => {
    if (kind === 'midi') {
      navigateHomeShellRoute(navigate, '/midi-hub/connections')
    } else {
      navigateHomeShellRoute(navigate, buildPlatformNodeWorkspaceHref('audio-engine'))
    }
  }, [navigate])
  const handleRibbonClick = useCallback((item: WelcomeHeroRibbonItem) => {
    if (item.route) {
      navigateHomeShellRoute(navigate, item.route)
    }
  }, [navigate])

  useEffect(() => {
    if (!landingPreferences.bootSplashEnabled && shouldShowHomeBootSplash()) {
      completeHomeDesktopBoot()
    }
  }, [landingPreferences.bootSplashEnabled])

  useEffect(() => {
    if (!showBootSplash) {
      return undefined
    }

    if (shouldReduceEffects) {
      completeHomeDesktopBoot()
      startTransition(() => {
        setShowBootSplash(false)
      })
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      completeHomeDesktopBoot()
      startTransition(() => {
        setShowBootSplash(false)
      })
    }, HOME_BOOT_SPLASH_DURATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [showBootSplash, shouldReduceEffects])

  if (showBootSplash) {
    return (
      <section className="hp2-boot" aria-label="MAP2 boot splash">
        <div className="hp2-boot__center">
          <div className="hp2-boot__mark-wrap">
            <img src={map2Logo} alt="MAP2 logo" className="hp2-boot__mark" />
          </div>
          <h1 className="hp2-boot__title">{MAP2_PLATFORM_NAME}</h1>
          <p className="hp2-boot__subtitle">Starting up and restoring your settings.</p>
        </div>
        <div className="hp2-boot__progress" role="status" aria-live="polite">
          <InlineLoading
            status="active"
            description="Restoring your desktop"
            iconDescription="Boot in progress"
          />
          <p className="hp2-boot__progress-copy">
            Loading your desktop and settings.
          </p>
        </div>
      </section>
    )
  }

  return (
    <div
      className={`hp2-root hp2-root--landing${landingPreferences.cinematicBackdropEnabled ? ` hp2-root--${wallpaper.mode}` : ' hp2-root--minimal'}`}
      data-testid="home-shell"
      data-wallpaper-mode={landingPreferences.cinematicBackdropEnabled ? wallpaper.mode : 'minimal'}
      data-reduced-effects={shouldReduceEffects ? 'true' : 'false'}
    >
      {landingPreferences.cinematicBackdropEnabled && wallpaper.mode === 'uploaded-image' && wallpaper.imageDataUrl ? (
        <img
          src={wallpaper.imageDataUrl}
          alt=""
          className="hp2-root__wallpaper"
          data-testid="home-desktop-wallpaper-image"
          aria-hidden="true"
        />
      ) : null}
      {landingPreferences.cinematicBackdropEnabled && wallpaper.mode === 'default-image' ? (
        <img
          src={mapGridHorizonImage}
          alt=""
          className="hp2-root__default-wallpaper"
          data-testid="home-desktop-default-wallpaper-image"
          aria-hidden="true"
        />
      ) : null}
      <div className="hp2-root__backdrop" aria-hidden="true" />

      <Content className="hp2-home-shell__content">
        <Grid className="hp2-home-shell__grid" condensed>
          <Column lg={16} md={8} sm={4}>
            <section className="hp2-home-shell__operations-shell" aria-label="MAP2 home telemetry">
              <WelcomeHero
                topbar={welcomeTopbar}
                artifacts={welcomeArtifacts}
                midiDevices={welcomeMidiDevices}
                audioDevices={welcomeAudioDevices}
                hardwareCounts={hardwareCounts}
                session={welcomeSession}
                ribbon={welcomeRibbon}
                librarianScanLabel={librarianScanLabel}
                onEnterLiveSurface={handleEnterLiveSurface}
                onBrowseLibrary={handleBrowseLibrary}
                onArtifactClick={handleArtifactClick}
                onHardwareClick={handleHardwareClick}
                onHardwareSummaryClick={handleHardwareSummaryClick}
                onRibbonClick={handleRibbonClick}
              />

              <div className="hp2-home-shell__landing-actions">
                <p className="hp2-home-shell__hero-kicker">Live operations surface</p>
                <div className="hp2-home-shell__landing-actions-spacer" aria-hidden="true" />
                <OverflowMenu ariaLabel="Landing actions" size="lg" flipped>
                  <OverflowMenuItem itemText="Display settings" onClick={() => navigateHomeShellRoute(navigate, '/platforms/theme')} />
                  <OverflowMenuItem itemText="About MAP2" onClick={() => navigateHomeShellRoute(navigate, '/platforms/about')} />
                </OverflowMenu>
              </div>

              <h1 className="hp2-home-shell__operations-title hp2-home-shell__operations-title--visually-hidden">
                <img
                  src={landingHeroBrandImage}
                  alt="MAP: Mackes Audio Platform"
                  className="hp2-home-shell__title-brand-image"
                />
              </h1>

              <aside className="hp2-home-shell__summary-rail" aria-label="Telemetry overview">
                {summaryMetrics.map((metric) => (
                  <button
                    type="button"
                    key={metric.id}
                    className="hp2-home-shell__summary-metric"
                    data-tone={metric.tone}
                    onMouseEnter={() => prefetchHomeShellRoute(metric.route)}
                    onFocus={() => prefetchHomeShellRoute(metric.route)}
                    onClick={() => navigateHomeShellRoute(navigate, metric.route)}
                  >
                    <span className="hp2-home-shell__summary-value">{metric.value}</span>
                    <span className="hp2-home-shell__summary-label">{metric.label}</span>
                    <span className="hp2-home-shell__summary-helper">{metric.helper}</span>
                  </button>
                ))}
              </aside>

              <div className="hp2-home-shell__operations-table-shell">
                <DataTable
                  rows={tableRows.map((row) => ({
                    id: row.id,
                    surface: row.category,
                    signal: row.signal,
                    currentState: row.currentState,
                    scope: row.scope,
                    detail: row.detail,
                    workspace: row.workspace,
                  }))}
                  headers={[...HOME_TABLE_HEADERS]}
                  isSortable
                  useZebraStyles
                >
                  {({
                    rows,
                    headers,
                    getHeaderProps,
                    getRowProps,
                    getTableProps,
                    getTableContainerProps,
                    getToolbarProps,
                  }) => (
                    <TableContainer
                      {...getTableContainerProps()}
                      title="Operations table"
                      description="All live home telemetry collapsed into one searchable Carbon table. Select a row to open the owning workspace."
                      className="hp2-home-shell__table-container"
                    >
                      <TableToolbar {...getToolbarProps()}>
                        <TableToolbarContent className="hp2-home-shell__table-toolbar">
                          <TableToolbarSearch
                            persistent
                            value={searchValue}
                            onChange={(_event, value) => {
                              startTransition(() => {
                                setSearchValue(value ?? '')
                              })
                            }}
                          />
                          <Tag type="cool-gray" size="sm">
                            {filteredTelemetryRows.length} results
                          </Tag>
                          <Tag type="cool-gray" size="sm">
                            {onlineNodes.length} nodes
                          </Tag>
                          <Tag type={criticalRowCount > 0 ? 'red' : warningRowCount > 0 ? 'warm-gray' : 'green'} size="sm">
                            {criticalRowCount > 0
                              ? `${criticalRowCount} critical`
                              : warningRowCount > 0
                                ? `${warningRowCount} watch`
                                : 'stable'}
                          </Tag>
                          <Tag type={telemetryLoading ? 'warm-gray' : 'green'} size="sm">
                            {telemetryLoading ? 'refreshing' : 'live'}
                          </Tag>
                        </TableToolbarContent>
                      </TableToolbar>

                      <div className="hp2-home-shell__table-wrap">
                        <Table
                          {...getTableProps()}
                          aria-label="Home telemetry table"
                          size="sm"
                          className="hp2-home-shell__table"
                        >
                          <TableHead>
                            <TableRow>
                              {headers.map((header) => {
                                const { key: _key, ...headerProps } = getHeaderProps({ header })
                                return (
                                  <TableHeader key={header.key} {...headerProps}>
                                    {header.header}
                                  </TableHeader>
                                )
                              })}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {rows.map((row) => {
                              const sourceRow = tableRowLookup.get(row.id)
                              if (!sourceRow) {
                                return null
                              }

                              const { key: _key, ...rowProps } = getRowProps({ row })
                              const isActionable = Boolean(sourceRow.route)

                              return (
                                <TableRow
                                  key={row.id}
                                  {...rowProps}
                                  className={`hp2-home-shell__table-row${isActionable ? ' is-actionable' : ''}`}
                                  data-tone={sourceRow.tone}
                                  tabIndex={isActionable ? 0 : -1}
                                  role={isActionable ? 'link' : undefined}
                                  onClick={isActionable ? () => navigateHomeShellRoute(navigate, sourceRow.route!) : undefined}
                                  onMouseEnter={isActionable ? () => prefetchHomeShellRoute(sourceRow.route!) : undefined}
                                  onFocus={isActionable ? () => prefetchHomeShellRoute(sourceRow.route!) : undefined}
                                  onKeyDown={isActionable ? (event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      navigateHomeShellRoute(navigate, sourceRow.route!)
                                    }
                                  } : undefined}
                                >
                                  <TableCell>
                                    <Tag type="cool-gray" size="sm">{sourceRow.category}</Tag>
                                  </TableCell>
                                  <TableCell>
                                    <div className="hp2-home-shell__table-signal">{sourceRow.signal}</div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="hp2-home-shell__table-state">
                                      <span className="hp2-home-shell__table-state-label">{sourceRow.currentState}</span>
                                      <Tag type={toneToTagType(sourceRow.tone)} size="sm">
                                        {toneToLabel(sourceRow.tone)}
                                      </Tag>
                                    </div>
                                  </TableCell>
                                  <TableCell>{sourceRow.scope}</TableCell>
                                  <TableCell>
                                    <div className="hp2-home-shell__table-detail">{sourceRow.detail}</div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="hp2-home-shell__table-workspace">{sourceRow.workspace}</span>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </TableContainer>
                  )}
                </DataTable>
              </div>
            </section>
          </Column>
        </Grid>
      </Content>
    </div>
  )
}

export default HomePage
