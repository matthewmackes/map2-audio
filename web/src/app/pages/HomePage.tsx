import { useQueries } from '@tanstack/react-query'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Column,
  Content,
  Grid,
  Header,
  HeaderGlobalBar,
  HeaderName,
  InlineLoading,
  OverflowMenu,
  OverflowMenuItem,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
} from '@carbon/react'
import {
  MAP2_PLATFORM_NAME,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import map2Logo from '../../assets/MAP2-LOGO.png'
import defaultWallpaperImage from '../../../../branding/MAP-GRID-HORIZON-2026.png'
import { completeHomeDesktopBoot, shouldShowHomeBootSplash } from './homeDesktopSession'
import { readDesktopWallpaperState } from './desktopWallpaper'
import { readHomeLandingPreferences } from './homeLandingPreferences'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { useShellSummaryData } from '../layout/useShellSummaryData'
import { DashboardCard } from '../components/shared/DashboardCard'
import { navigateHomeShellRoute, prefetchHomeShellRoute } from './homeShellNavigation'
import { useCluster } from '../contexts/useCluster'
import { buildPlatformNodeWorkspaceHref } from '../platform/routes'
import { useClusterHardwareInventory } from '../hooks/useDeviceLocation'
import { useClusterSnapshotRuntimeLiveState } from '../hooks/useSnapshotRuntimeState'
import { useAVBDiscovery, useAVBStreams } from '../hooks/useAvbStatus'
import { readPorts } from '../components/MidiHub/portUtils'
import { withNodeQuery } from '../utils/clusterTransport'
import { computeLatencyPressure } from '../utils/latencyPressure'
import { latencyV2Api, midiHubApi, type LatencyJitterStats, type MidiHubRoute } from '../../map2/api'
import '../layout/LauncherPanel/LauncherPanel.css'
import './HomePage.boot.css'
import './HomePage.landing.css'

const HOME_BOOT_SPLASH_DURATION_MS = 4_000

type InventoryNode = {
  status?: string
  audio_interfaces?: string[]
  usb_audio_devices?: Array<Record<string, unknown>>
  pipewire_devices?: Array<Record<string, unknown>>
}

type TelemetryRow = {
  id: string
  label: string
  value: string
  scope: string
  helper: string
  route?: string
  tone?: 'healthy' | 'warning' | 'critical' | 'neutral'
}

type TelemetrySectionProps = {
  eyebrow: string
  title: string
  description: string
  rows: TelemetryRow[]
  emptyLabel: string
  loading?: boolean
  navigate: ReturnType<typeof useNavigate>
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

function formatNodeScope(count: number): string {
  return `${count} node${count === 1 ? '' : 's'}`
}

function TelemetrySection({
  eyebrow,
  title,
  description,
  rows,
  emptyLabel,
  loading = false,
  navigate,
}: TelemetrySectionProps) {
  const displayRows: TelemetryRow[] = rows.length > 0
    ? rows
    : [{
        id: `${title}-empty`,
        label: loading ? 'Loading live telemetry' : emptyLabel,
        value: loading ? 'Waiting' : 'Idle',
        scope: 'Home',
        helper: loading ? 'Refreshing with the current runtime state.' : 'No live signals are currently reporting into this section.',
        tone: 'neutral' as const,
      }]

  return (
    <DashboardCard className="hp2-home-shell__telemetry-section">
      <div className="hp2-home-shell__telemetry-section-head">
        <div className="hp2-home-shell__telemetry-section-copy">
          <p className="hp2-home-shell__eyebrow dashboard-card__eyebrow">{eyebrow}</p>
          <h2 className="dashboard-card__title">{title}</h2>
          <p className="dashboard-card__body-copy">{description}</p>
        </div>
        <Tag type="cool-gray">{formatNodeScope(rows.length)}</Tag>
      </div>

      <div className="hp2-home-shell__telemetry-table-wrap">
        <StructuredListWrapper aria-label={`${title} structured list`} className="hp2-home-shell__telemetry-list">
          <StructuredListHead>
            <StructuredListRow head>
              <StructuredListCell head>Signal</StructuredListCell>
              <StructuredListCell head>Current state</StructuredListCell>
              <StructuredListCell head>Scope</StructuredListCell>
              <StructuredListCell head>Detail</StructuredListCell>
            </StructuredListRow>
          </StructuredListHead>
          <StructuredListBody>
            {displayRows.map((row) => {
              const isActionable = Boolean(row.route)
              return (
                <StructuredListRow
                  key={row.id}
                  className={`hp2-home-shell__telemetry-row${isActionable ? ' is-actionable' : ''}`}
                  data-tone={row.tone ?? 'neutral'}
                  tabIndex={isActionable ? 0 : -1}
                  role={isActionable ? 'link' : undefined}
                  onClick={isActionable ? () => navigateHomeShellRoute(navigate, row.route!) : undefined}
                  onMouseEnter={isActionable ? () => prefetchHomeShellRoute(row.route!) : undefined}
                  onFocus={isActionable ? () => prefetchHomeShellRoute(row.route!) : undefined}
                  onKeyDown={isActionable ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      navigateHomeShellRoute(navigate, row.route!)
                    }
                  } : undefined}
                >
                  <StructuredListCell>
                    <div className="hp2-home-shell__telemetry-row-primary">{row.label}</div>
                  </StructuredListCell>
                  <StructuredListCell>{row.value}</StructuredListCell>
                  <StructuredListCell>{row.scope}</StructuredListCell>
                  <StructuredListCell>
                    <div className="hp2-home-shell__telemetry-row-helper">{row.helper}</div>
                  </StructuredListCell>
                </StructuredListRow>
              )
            })}
          </StructuredListBody>
        </StructuredListWrapper>
      </div>
    </DashboardCard>
  )
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
  const shouldShowSplash = useMemo(() => landingPreferences.bootSplashEnabled && shouldShowHomeBootSplash(), [landingPreferences.bootSplashEnabled])
  const [showBootSplash, setShowBootSplash] = useState(shouldShowSplash)
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

  const midiDeviceRows = useMemo(() => {
    const rows = onlineNodes.flatMap((node, index) => {
      const status = midiStatusQueries[index]?.data as Record<string, unknown> | undefined
      return readPorts(status?.ports)
        .filter((port) => port.kind !== 'virtual' && !/virtual/i.test(port.name))
        .map((port) => ({
          id: `${node.nodeId}:${port.port_id}`,
          label: port.name,
          value: port.direction,
          scope: node.hostname,
          helper: `${port.kind} port · ${port.port_id}`,
          route: withNodeQuery('/midi-hub/connections', node.nodeId),
          tone: 'healthy' as const,
        }))
    })

    if (rows.length > 0) {
      return rows
    }

    return shellSummaryData.launcherInterfaceSummary.midiInterfaces.map((name, index) => ({
      id: `shell-midi-${index}`,
      label: name,
      value: 'Connected',
      scope: shellSummaryData.hostInfo?.hostname ?? 'Local node',
      helper: 'Local MIDI interface summary.',
      route: '/midi-hub/connections',
      tone: 'healthy' as const,
    }))
  }, [midiStatusQueries, onlineNodes, shellSummaryData.hostInfo?.hostname, shellSummaryData.launcherInterfaceSummary.midiInterfaces])

  const midiMappingRows = useMemo(
    () => onlineNodes.flatMap((node, index) => {
      const response = midiRouteQueries[index]?.data as { routes?: MidiHubRoute[] } | undefined
      const routes = response?.routes ?? []

      return routes
        .filter((route) => route.enabled)
        .map((route) => ({
          id: `${node.nodeId}:${route.route_id}`,
          label: route.source_port,
          value: route.destination_ports.join(', '),
          scope: node.hostname,
          helper: formatMidiFilter(route),
          route: resolveMidiMappingRoute(node.nodeId, route),
          tone: route.transform_chain.length > 0 || route.filter.message_types.length > 0 ? 'warning' as const : 'healthy' as const,
        }))
    }),
    [midiRouteQueries, onlineNodes],
  )

  const audioInterfaceRows = useMemo(() => {
    const inventoryNodes = hardwareInventoryQuery.data?.nodes ?? {}
    const rows = Object.entries(inventoryNodes).flatMap(([nodeId, node]) => {
      const nodeName = nodeLabelById.get(nodeId) ?? nodeId
      return collectAudioInterfaces(node).map((name, index) => ({
        id: `${nodeId}:audio:${index}:${name}`,
        label: name,
        value: 'Connected',
        scope: nodeName,
        helper: 'Node-aware audio interface inventory.',
        route: buildPlatformNodeWorkspaceHref('audio-engine', nodeId),
        tone: 'healthy' as const,
      }))
    })

    if (rows.length > 0) {
      return rows
    }

    return shellSummaryData.launcherInterfaceSummary.audioInterfaces.map((name, index) => ({
      id: `shell-audio-${index}`,
      label: name,
      value: 'Connected',
      scope: shellSummaryData.hostInfo?.hostname ?? 'Local node',
      helper: 'Launcher interface summary fallback.',
      route: buildPlatformNodeWorkspaceHref('audio-engine'),
      tone: 'healthy' as const,
    }))
  }, [
    hardwareInventoryQuery.data?.nodes,
    nodeLabelById,
    shellSummaryData.hostInfo?.hostname,
    shellSummaryData.launcherInterfaceSummary.audioInterfaces,
  ])

  const avbEndpointRows = useMemo(() => {
    const runningStreams = (avbStreamsQuery.data?.streams ?? []).filter((stream) => stream.state === 'running').length
    const discovery = avbDiscoveryQuery.data
    const summaryRow: TelemetryRow = {
      id: 'avb-fabric',
      label: 'Fabric state',
      value: shellSummaryData.platformStatus.avb.label,
      scope: `${discovery?.total_discovered ?? 0} endpoints`,
      helper: `${discovery?.talker_nodes ?? 0} talkers · ${discovery?.listener_nodes ?? 0} listeners · ${runningStreams} running streams`,
      route: buildPlatformNodeWorkspaceHref('avb-routing'),
      tone: shellSummaryData.platformStatus.avb.state === 'ok' ? 'healthy' : 'warning',
    }

    const nodeRows = (discovery?.nodes ?? []).map((node) => {
      const capabilities = node.avb_capabilities
      return {
        id: `avb-node:${node.node_id}`,
        label: node.hostname,
        value: `${capabilities?.talker_streams ?? 0} talkers · ${capabilities?.listener_streams ?? 0} listeners`,
        scope: capabilities?.interface ?? 'AVB fabric',
        helper: `${capabilities?.ptp_synced ? 'PTP synced' : 'PTP pending'} · ${capabilities?.sample_rate ?? 'n/a'} Hz · ${capabilities?.channels ?? 'n/a'} ch`,
        route: buildPlatformNodeWorkspaceHref('avb-routing', node.node_id),
        tone: capabilities?.ptp_synced ? 'healthy' as const : 'warning' as const,
      }
    })

    return [summaryRow, ...nodeRows]
  }, [avbDiscoveryQuery.data, avbStreamsQuery.data?.streams, shellSummaryData.platformStatus.avb.label, shellSummaryData.platformStatus.avb.state])

  const snapshotRows = useMemo(() => {
    const states = clusterSnapshotQuery.data?.nodes ?? []
    const visibleStates = states.filter((state) => !state.is_offline)
    const grouped = new Map<string, {
      id: string
      label: string
      value: string
      helperParts: string[]
      nodeIds: string[]
      route: string
      tone: TelemetryRow['tone']
    }>()

    for (const state of visibleStates) {
      const label = state.snapshot_name ?? (state.snapshot_id != null ? `Snapshot ${state.snapshot_id}` : 'No snapshot live')
      const value = state.display_label
      const key = `${state.snapshot_id ?? 'none'}:${state.snapshot_revision ?? 'none'}:${value}`
      const existing = grouped.get(key)
      const nodeLabel = nodeLabelById.get(state.node_id) ?? state.node_id
      const tone = state.state === 'live' ? 'healthy' as const : 'warning' as const

      if (existing) {
        existing.nodeIds.push(nodeLabel)
        continue
      }

      grouped.set(key, {
        id: key,
        label,
        value,
        helperParts: [
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
      label: group.label,
      value: group.value,
      scope: formatNodeScope(group.nodeIds.length),
      helper: `${group.helperParts.join(' · ')} · ${group.nodeIds.join(', ')}`,
      route: group.nodeIds.length === 1 ? group.route : '/snapshot-editor',
      tone: group.tone,
    }))
  }, [clusterSnapshotQuery.data?.nodes, nodeLabelById])

  const latencyPressureRows = useMemo<TelemetryRow[]>(
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
        label: node.hostname,
        value: `${analysis.statusLabel} ${analysis.scoreDisplay}/10`,
        scope: 'Audio Engine',
        helper: analysis.isAvailable
          ? [
              analysis.inputs.effectiveLatencyMs != null ? `RTL p95 ${analysis.inputs.effectiveLatencyMs.toFixed(2)} ms` : null,
              analysis.inputs.jitterP95Ms != null ? `Jitter p95 ${analysis.inputs.jitterP95Ms.toFixed(3)} ms` : null,
              analysis.inputs.xrunCount != null ? `${analysis.inputs.xrunCount} xruns` : null,
            ].filter((part): part is string => Boolean(part)).join(' · ')
          : 'Waiting for realtime telemetry.',
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
          src={defaultWallpaperImage}
          alt=""
          className="hp2-root__default-wallpaper"
          data-testid="home-desktop-default-wallpaper-image"
          aria-hidden="true"
        />
      ) : null}
      <div className="hp2-root__backdrop" aria-hidden="true" />

      <Header aria-label="MAP2 home shell" className="hp2-home-shell__masthead">
        <HeaderName href="/" prefix="">
          {MAP2_PLATFORM_NAME}
        </HeaderName>
        <HeaderGlobalBar>
          <Tag type="blue">Operator telemetry</Tag>
          <OverflowMenu ariaLabel="Landing actions" size="lg" flipped>
            <OverflowMenuItem itemText="Display settings" onClick={() => navigateHomeShellRoute(navigate, '/platforms/theme')} />
            <OverflowMenuItem itemText="About MAP2" onClick={() => navigateHomeShellRoute(navigate, '/platforms/about')} />
          </OverflowMenu>
        </HeaderGlobalBar>
      </Header>

      <Content className="hp2-home-shell__content">
        <Grid className="hp2-home-shell__grid" condensed>
          <Column lg={16} md={8} sm={4} className="hp2-home-shell__main">
            <section className="hp2-home-shell__telemetry-shell" aria-label="Engineering telemetry">
              <DashboardCard className="hp2-home-shell__telemetry-intro">
                <p className="hp2-home-shell__eyebrow dashboard-card__eyebrow">Home</p>
                <h1 className="hp2-home-shell__title">
                  <Map2BrandMark decorative className="hp2-home-shell__title-icon" />
                  MAP: Mackes Audio Platform
                </h1>
                <p className="hp2-home-shell__lede">
                  Live cluster-facing status for connected MIDI, mapped control paths, audio interfaces, AVB endpoints, snapshots, and latency pressure.
                </p>
                <div className="hp2-home-shell__telemetry-tags" aria-label="Telemetry overview">
                  <Tag type="green">{shellSummaryData.platformStatus.nodes.label}</Tag>
                  <Tag type={shellSummaryData.platformStatus.avb.state === 'ok' ? 'green' : 'warm-gray'}>
                    {shellSummaryData.platformStatus.avb.label}
                  </Tag>
                  <Tag type="cool-gray">{`${midiDeviceRows.length} MIDI devices`}</Tag>
                  <Tag type="cool-gray">{`${audioInterfaceRows.length} audio interfaces`}</Tag>
                  <Tag type="cool-gray">{`${snapshotRows.length} snapshot groups`}</Tag>
                </div>
              </DashboardCard>

              <div className="hp2-home-shell__telemetry-stack">
                <TelemetrySection
                  eyebrow="MIDI Devices"
                  title="Current MIDI Devices Connected"
                  description="Per-node MIDI port inventory across the live cluster. Click any row to open the node-aware MIDI connections workspace."
                  rows={midiDeviceRows}
                  emptyLabel="No MIDI devices detected"
                  loading={telemetryLoading}
                  navigate={navigate}
                />
                <TelemetrySection
                  eyebrow="Mapped MIDI"
                  title="Current MAPPED MIDI"
                  description="Enabled live mappings with routing filters, transforms, and destination context. Rows resolve to the owning GUI page when device ownership is detectable."
                  rows={midiMappingRows}
                  emptyLabel="No active MIDI mappings"
                  loading={telemetryLoading}
                  navigate={navigate}
                />
                <TelemetrySection
                  eyebrow="Audio Interfaces"
                  title="Current Audio Interfaces Connected"
                  description="Connected interface inventory gathered from all reporting nodes. Rows open Audio Engine in the correct node context."
                  rows={audioInterfaceRows}
                  emptyLabel="No audio interfaces reported"
                  loading={telemetryLoading}
                  navigate={navigate}
                />
                <TelemetrySection
                  eyebrow="AVB Endpoints"
                  title="Current AVB Endpoints Connected"
                  description="Discovery-backed AVB endpoint state with node ownership, talker/listener counts, and fabric timing context."
                  rows={avbEndpointRows}
                  emptyLabel="No AVB endpoints discovered"
                  loading={telemetryLoading}
                  navigate={navigate}
                />
                <TelemetrySection
                  eyebrow="Snapshots"
                  title="Current Snapshot Loaded and Live"
                  description="Grouped live snapshot authority state across nodes. Shared snapshots collapse into one row; divergent runtime states remain visible."
                  rows={snapshotRows}
                  emptyLabel="No live snapshots reported"
                  loading={telemetryLoading}
                  navigate={navigate}
                />
                <TelemetrySection
                  eyebrow="Latency Pressure"
                  title="Current Latency Pressure"
                  description="Per-node latency pressure derived from the existing realtime measurement path. Click through to Audio Engine for full runtime diagnostics."
                  rows={latencyPressureRows}
                  emptyLabel="No latency telemetry available"
                  loading={telemetryLoading}
                  navigate={navigate}
                />
              </div>
            </section>
          </Column>
        </Grid>
      </Content>
    </div>
  )
}

export default HomePage
