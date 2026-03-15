import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getTrafficStats } from '../pages/ApiObservatory/api'
import { type AVBNode, type AVBStream, useAVBDiscovery, useAVBStatus, useAVBStreams, usePTPStatus, useTsnStatus } from './useAvbStatus'
import { useCPUMetrics } from './useCPUMetrics'
import {
  useMidiClusterClock,
  useMidiClusterConnections,
  useMidiClusterEndpoints,
  useMidiClusterHealth,
  useMidiClusterNodes,
  useMidiClusterSummary,
} from './useMidiCluster'
import { useNodeIdentity, useNodeTopology } from './useNodeTopology'
import { useOpenApiSchema } from './useOpenApiSchema'
import { usePipeWire } from './usePipeWire'
import {
  networkApi,
  type MidiClusterConnection,
  type MidiClusterEndpoint,
  type MidiClusterNode,
  wwwApi,
} from '../../map2/api'
import { useViewedNode } from '../stores/viewedNodeStore'
import type { NodeSummary } from '../types/node'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import type { AccessLog, APIEndpoint, NetworkStatus, WebSocketStats, WWWStatus } from '../../map2/types'
import type {
  PlatformAlert,
  PlatformGridItem,
  PlatformHealth,
  PlatformLayerData,
  PlatformLayerId,
  PlatformNotification,
  PlatformSummaryMetric,
  PlatformTableColumn,
  PlatformTableRow,
} from '../platform/model'
import { PLATFORM_LAYER_META, makePlatformHealthRecord } from '../platform/model'

interface DeploymentModeResponse {
  mode?: string
}

interface ClusterStatusResponse {
  online_count?: number
  total_count?: number
  aggregate_health_score?: number | null
}

interface TrafficStatsResponse {
  total_requests: number
  avg_response_ms: number
  p95_ms: number
  p99_ms: number
  error_rate_percent: number
  requests_per_second: number
}

export interface PlatformShellData {
  layers: PlatformLayerData[]
  layerHealth: Record<PlatformLayerId, PlatformHealth>
  summaryMetrics: PlatformSummaryMetric[]
  alerts: PlatformAlert[]
}

const EMPTY_ACCESS_LOGS: AccessLog[] = []
const EMPTY_API_ENDPOINTS: APIEndpoint[] = []
const EMPTY_AVB_NODES: AVBNode[] = []
const EMPTY_AVB_STREAMS: AVBStream[] = []
const EMPTY_MIDI_CONNECTIONS: MidiClusterConnection[] = []
const EMPTY_MIDI_ENDPOINTS: MidiClusterEndpoint[] = []
const EMPTY_MIDI_NODES: MidiClusterNode[] = []

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (!Number.isFinite(value ?? NaN)) {
    return 'n/a'
  }
  return Number(value).toFixed(fractionDigits)
}

function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (!Number.isFinite(value ?? NaN)) {
    return 'n/a'
  }
  return `${Number(value).toFixed(fractionDigits)}%`
}

function formatLatencyMs(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) {
    return 'n/a'
  }
  return `${Number(value).toFixed(1)} ms`
}

function formatLastSeen(value: string | null | undefined): string {
  if (!value) {
    return 'n/a'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleTimeString()
}

function formatBandwidthMbps(channels: number | undefined, sampleRate: number | undefined): string {
  if (!Number.isFinite(channels ?? NaN) || !Number.isFinite(sampleRate ?? NaN)) {
    return 'n/a'
  }
  const bitrateMbps = ((channels ?? 0) * (sampleRate ?? 0) * 32) / 1_000_000
  return `${bitrateMbps.toFixed(1)} Mb/s`
}

function healthRank(health: PlatformHealth): number {
  switch (health) {
    case 'critical':
      return 4
    case 'offline':
      return 3
    case 'warning':
      return 2
    case 'healthy':
      return 1
    default:
      return 0
  }
}

function worstHealth(...healthValues: PlatformHealth[]): PlatformHealth {
  if (healthValues.length === 0) {
    return 'unknown'
  }
  return [...healthValues].sort((left, right) => healthRank(right) - healthRank(left))[0] ?? 'unknown'
}

function stringToHealth(value: string | null | undefined): PlatformHealth {
  if (!value) return 'unknown'
  const normalized = value.toLowerCase()
  if (normalized.includes('critical') || normalized.includes('error')) return 'critical'
  if (normalized.includes('offline') || normalized.includes('disabled')) return 'offline'
  if (normalized.includes('warn') || normalized.includes('degrad')) return 'warning'
  if (
    normalized.includes('healthy') ||
    normalized.includes('ok') ||
    normalized.includes('ready') ||
    normalized.includes('operational') ||
    normalized.includes('running')
  ) {
    return 'healthy'
  }
  return 'unknown'
}

function statusToHealth(node: NodeSummary | undefined): PlatformHealth {
  if (!node) return 'unknown'
  switch (node.status) {
    case 'critical':
      return 'critical'
    case 'offline':
      return 'offline'
    case 'warn':
      return 'warning'
    case 'ok':
      return 'healthy'
    default:
      return 'unknown'
  }
}

function healthToTone(health: PlatformHealth | 'info'): PlatformHealth | 'info' {
  return health
}

function pushNotification(
  target: PlatformNotification[],
  id: string,
  severity: PlatformNotification['severity'],
  title: string,
  subtitle: string,
) {
  target.push({ id, severity, title, subtitle })
}

function endpointErrorCount(logs: AccessLog[], endpoint: APIEndpoint): number {
  return logs.filter((log) => log.path === endpoint.path && log.method.toUpperCase() === endpoint.method.toUpperCase() && log.status_code >= 400).length
}

function endpointStatus(endpoint: APIEndpoint, errorCount: number): PlatformHealth {
  if (errorCount > 0) {
    return errorCount >= 3 ? 'critical' : 'warning'
  }
  if (endpoint.avg_response_time !== null && endpoint.avg_response_time > 750) {
    return 'warning'
  }
  return 'healthy'
}

function endpointActivity(endpoint: MidiClusterEndpoint, activeConnections: number): string {
  if (!endpoint.available) return 'Unavailable'
  if (activeConnections > 0) return `${activeConnections} route${activeConnections === 1 ? '' : 's'}`
  return 'Idle'
}

export function usePlatformShellData(): PlatformShellData {
  const topologyQuery = useNodeTopology()
  const identityQuery = useNodeIdentity()
  const pipewire = usePipeWire({ useWebSocket: false, pollingInterval: 5000 })
  const cpu = useCPUMetrics({ useWebSocket: false, pollingInterval: 5000 })

  const networkQuery = useQuery<NetworkStatus>({
    queryKey: ['platform', 'network-status'],
    queryFn: networkApi.getStatus,
    refetchInterval: 10000,
    staleTime: 5000,
  })

  const deploymentModeQuery = useQuery<DeploymentModeResponse>({
    queryKey: ['platform', 'deployment-mode'],
    queryFn: async () => {
      const response = await fetch('/api/deployment/mode')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response.json() as Promise<DeploymentModeResponse>
    },
    refetchInterval: 10000,
    staleTime: 5000,
  })

  const clusterStatusQuery = useQuery<ClusterStatusResponse>({
    queryKey: ['platform', 'cluster-status'],
    queryFn: async () => {
      const response = await fetch('/api/cluster/status')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response.json() as Promise<ClusterStatusResponse>
    },
    refetchInterval: 10000,
    staleTime: 5000,
  })

  const avbStatusQuery = useAVBStatus()
  const avbStreamsEnabled = avbStatusQuery.data?.enabled !== false
  const avbStreamsQuery = useAVBStreams(avbStreamsEnabled)
  const avbDiscoveryQuery = useAVBDiscovery(avbStreamsEnabled)
  const ptpStatusQuery = usePTPStatus(avbStreamsEnabled)
  const tsnStatusQuery = useTsnStatus(avbStreamsEnabled)

  const midiNodesQuery = useMidiClusterNodes()
  const midiConnectionsQuery = useMidiClusterConnections()
  const midiEndpointsQuery = useMidiClusterEndpoints()
  const midiClockQuery = useMidiClusterClock()
  const midiHealthQuery = useMidiClusterHealth()
  const midiSummaryQuery = useMidiClusterSummary()

  const observatorySchema = useOpenApiSchema()
  const trafficStatsQuery = useQuery<TrafficStatsResponse>({
    queryKey: ['platform', 'observatory', 'traffic-stats'],
    queryFn: () => getTrafficStats() as Promise<TrafficStatsResponse>,
    refetchInterval: 10000,
    staleTime: 5000,
  })
  const observatoryEndpointsQuery = useQuery<{ endpoints: APIEndpoint[] }>({
    queryKey: ['platform', 'observatory', 'endpoints'],
    queryFn: wwwApi.getEndpoints,
    refetchInterval: 15000,
    staleTime: 10000,
  })
  const observatoryLogsQuery = useQuery<{ logs: AccessLog[] }>({
    queryKey: ['platform', 'observatory', 'logs'],
    queryFn: () => wwwApi.getAccessLogs(40),
    refetchInterval: 15000,
    staleTime: 10000,
  })
  const observatoryWsQuery = useQuery<WebSocketStats>({
    queryKey: ['platform', 'observatory', 'websocket'],
    queryFn: wwwApi.getWebSocketStats,
    refetchInterval: 10000,
    staleTime: 5000,
  })
  const observatoryStatusQuery = useQuery<WWWStatus>({
    queryKey: ['platform', 'observatory', 'status'],
    queryFn: wwwApi.getStatus,
    refetchInterval: 10000,
    staleTime: 5000,
  })

  const topology = topologyQuery.data
  const localNode = topology?.nodes.find((node) => node.is_local) ?? topology?.nodes[0]
  const platformViewedNodeId = useViewedNode(NODE_PAGE_KEYS.platform, localNode?.node_id ?? 'local')
  const platformViewedNode = topology?.nodes.find((node) => node.node_id === platformViewedNodeId) ?? localNode
  const platformNode = platformViewedNode ?? localNode
  const platformNodeIsRemote = Boolean(platformNode && localNode && platformNode.node_id !== localNode.node_id)
  const onlineNodes = topology?.nodes.filter((node) => node.status !== 'offline').length ?? 0
  const totalNodes = topology?.nodes.length ?? 0
  const criticalNodes = topology?.nodes.filter((node) => node.status === 'critical' || node.status === 'offline').length ?? 0
  const warningNodes = topology?.nodes.filter((node) => node.status === 'warn').length ?? 0
  const activeAudioEdges = topology?.audio_edges.filter((edge) => edge.active).length ?? 0
  const activeNetworkEdges = topology?.network_edges.filter((edge) => edge.latency_ms !== null).length ?? 0
  const deploymentMode = deploymentModeQuery.data?.mode ?? 'Unknown'
  const clusterHealthScore = clusterStatusQuery.data?.aggregate_health_score

  const avbStreams = avbStreamsQuery.data?.streams ?? EMPTY_AVB_STREAMS
  const runningAvbStreams = avbStreams.filter((stream) => stream.state === 'running')
  const avbStreamErrors = avbStreams.filter((stream) => stream.state === 'error' || Boolean(stream.error)).length
  const avbDiscoveredNodes = avbDiscoveryQuery.data?.nodes ?? EMPTY_AVB_NODES

  const midiEndpoints = midiEndpointsQuery.data ?? EMPTY_MIDI_ENDPOINTS
  const midiConnections = midiConnectionsQuery.data ?? EMPTY_MIDI_CONNECTIONS
  const midiNodes = midiNodesQuery.data ?? EMPTY_MIDI_NODES
  const midiConnectionCountByEndpoint = useMemo(
    () => midiConnections.reduce<Record<string, number>>((acc, connection) => {
      acc[connection.source.endpoint_id] = (acc[connection.source.endpoint_id] ?? 0) + 1
      acc[connection.destination.endpoint_id] = (acc[connection.destination.endpoint_id] ?? 0) + 1
      return acc
    }, {}),
    [midiConnections],
  )
  const midiNodeNameById = useMemo(
    () => new Map(midiNodes.map((node) => [node.node_id, node.hostname])),
    [midiNodes],
  )

  const observatoryEndpoints = observatoryEndpointsQuery.data?.endpoints ?? EMPTY_API_ENDPOINTS
  const observatoryLogs = observatoryLogsQuery.data?.logs ?? EMPTY_ACCESS_LOGS
  const observatoryTraffic = trafficStatsQuery.data
  const observatoryWs = observatoryWsQuery.data
  const observatoryStatus = observatoryStatusQuery.data
  const operationCount = observatorySchema.catalog.reduce((sum, group) => sum + group.endpoints.length, 0)
  const diffCount = observatorySchema.diff.added.length + observatorySchema.diff.modified.length + observatorySchema.diff.removed.length

  const layers = useMemo<PlatformLayerData[]>(() => {
    const overviewNotifications: PlatformNotification[] = []
    const nodeNotifications: PlatformNotification[] = []
    const avbNotifications: PlatformNotification[] = []
    const midiNotifications: PlatformNotification[] = []
    const observatoryNotifications: PlatformNotification[] = []
    const clusterNotifications: PlatformNotification[] = []

    if (criticalNodes > 0) {
      pushNotification(
        overviewNotifications,
        'overview-critical-nodes',
        'critical',
        'Nodes need attention',
        `${criticalNodes} node${criticalNodes === 1 ? '' : 's'} are critical or offline.`,
      )
    } else if (warningNodes > 0) {
      pushNotification(
        overviewNotifications,
        'overview-warning-nodes',
        'warning',
        'Warnings are active',
        `${warningNodes} node${warningNodes === 1 ? '' : 's'} are degraded.`,
      )
    }

    const clusterHealth = clusterHealthScore !== null && clusterHealthScore !== undefined
      ? clusterHealthScore < 50
        ? 'critical'
        : clusterHealthScore < 80
          ? 'warning'
          : 'healthy'
      : worstHealth(...(topology?.nodes.map((node) => statusToHealth(node)) ?? ['unknown']))

    if (clusterStatusQuery.error) {
      pushNotification(
        clusterNotifications,
        'cluster-status-error',
        'critical',
        'Cluster status unavailable',
        clusterStatusQuery.error instanceof Error ? clusterStatusQuery.error.message : 'Failed to load cluster status.',
      )
    } else if (clusterHealthScore !== null && clusterHealthScore !== undefined && clusterHealthScore < 80) {
      pushNotification(
        clusterNotifications,
        'cluster-health-score',
        clusterHealthScore < 50 ? 'critical' : 'warning',
        'Cluster health degraded',
        `Aggregate health score is ${formatPercent(clusterHealthScore, 0)}.`,
      )
    }

    if ((platformNode?.xrun_count ?? 0) > 0 || (!platformNodeIsRemote && pipewire.hasXruns)) {
      pushNotification(
        nodeNotifications,
        'node-xruns',
        'warning',
        'XRuns detected',
        `${platformNode?.xrun_count ?? pipewire.xruns} xrun${(platformNode?.xrun_count ?? pipewire.xruns) === 1 ? '' : 's'} observed on the ${platformNodeIsRemote ? 'selected node' : 'local node'}.`,
      )
    }
    if (!platformNode?.services.backend || !platformNode?.services.juce_engine || !platformNode?.services.pipewire) {
      pushNotification(
        nodeNotifications,
        'node-services',
        'critical',
        `${platformNodeIsRemote ? 'Selected' : 'Local'} services are degraded`,
        'Backend, JUCE engine, and PipeWire should all be online for steady operation.',
      )
    }

    if (avbStatusQuery.error) {
      pushNotification(
        avbNotifications,
        'avb-status-error',
        'critical',
        'AVB status unavailable',
        avbStatusQuery.error.message,
      )
    } else if (avbStatusQuery.data?.enabled === false) {
      pushNotification(
        avbNotifications,
        'avb-disabled',
        'warning',
        'AVB is disabled',
        'Routing is configured off on this host.',
      )
    } else if (avbStreamErrors > 0) {
      pushNotification(
        avbNotifications,
        'avb-stream-errors',
        'critical',
        'AVB stream errors present',
        `${avbStreamErrors} stream${avbStreamErrors === 1 ? '' : 's'} report transport or reservation errors.`,
      )
    }

    if (midiSummaryQuery.data?.enabled === false) {
      pushNotification(
        midiNotifications,
        'midi-disabled',
        'warning',
        'MIDI cluster disabled',
        'Cluster MIDI is disabled in configuration.',
      )
    } else if ((midiHealthQuery.data?.degraded_connections ?? 0) > 0) {
      pushNotification(
        midiNotifications,
        'midi-degraded-connections',
        'warning',
        'MIDI routes are degraded',
        `${midiHealthQuery.data?.degraded_connections ?? 0} connection${(midiHealthQuery.data?.degraded_connections ?? 0) === 1 ? '' : 's'} need attention.`,
      )
    }
    if (Math.abs(midiClockQuery.data?.drift_ms ?? 0) > 5) {
      pushNotification(
        midiNotifications,
        'midi-clock-drift',
        'warning',
        'Clock drift rising',
        `Cluster clock drift is ${formatLatencyMs(Math.abs(midiClockQuery.data?.drift_ms ?? 0))}.`,
      )
    }

    if (observatorySchema.error) {
      pushNotification(
        observatoryNotifications,
        'observatory-schema-error',
        'critical',
        'OpenAPI schema unavailable',
        observatorySchema.error,
      )
    }
    if ((observatoryTraffic?.error_rate_percent ?? 0) > 5) {
      pushNotification(
        observatoryNotifications,
        'observatory-error-rate',
        'warning',
        'API error rate elevated',
        `${formatPercent(observatoryTraffic?.error_rate_percent ?? 0, 1)} of recent requests failed.`,
      )
    }
    if (observatoryStatus && (!observatoryStatus.backend_running || !observatoryStatus.frontend_running)) {
      pushNotification(
        observatoryNotifications,
        'observatory-service-state',
        'critical',
        'Web services are degraded',
        `Backend ${observatoryStatus.backend_running ? 'up' : 'down'} · Frontend ${observatoryStatus.frontend_running ? 'up' : 'down'}.`,
      )
    }

    if (onlineNodes < totalNodes) {
      pushNotification(
        clusterNotifications,
        'cluster-offline-nodes',
        'warning',
        'Nodes are offline',
        `${onlineNodes}/${totalNodes} nodes are currently online.`,
      )
    }
    if (activeNetworkEdges === 0 && totalNodes > 1) {
      pushNotification(
        clusterNotifications,
        'cluster-network-links',
        'warning',
        'Peer latency links missing',
        'No active network-edge latency links are being reported across the cluster.',
      )
    }

    const overviewHealth = worstHealth(
      clusterHealth,
      warningNodes > 0 ? 'warning' : 'healthy',
      criticalNodes > 0 ? 'critical' : 'healthy',
    )
    const nodeHealth = worstHealth(
      statusToHealth(platformNode),
      platformNodeIsRemote ? 'healthy' : stringToHealth(pipewire.overallStatus),
      (platformNode?.xrun_count ?? 0) > 0 || cpu.hasXruns ? 'warning' : 'healthy',
    )
    const avbHealth = worstHealth(
      stringToHealth(avbStatusQuery.data?.state ?? (avbStatusQuery.data?.available ? 'operational' : 'offline')),
      avbStreamErrors > 0 ? 'critical' : 'healthy',
      stringToHealth(ptpStatusQuery.data?.state),
    )
    const midiHealth = worstHealth(
      stringToHealth(midiHealthQuery.data?.status),
      stringToHealth(midiHealthQuery.data?.clock_status),
      (midiHealthQuery.data?.degraded_connections ?? 0) > 0 ? 'warning' : 'healthy',
    )
    const observatoryHealth = worstHealth(
      observatorySchema.error ? 'critical' : 'healthy',
      (observatoryTraffic?.error_rate_percent ?? 0) > 5 ? 'warning' : 'healthy',
      observatoryStatus && (!observatoryStatus.backend_running || !observatoryStatus.frontend_running) ? 'critical' : 'healthy',
    )

    const overviewLayer = {
      ...PLATFORM_LAYER_META[0],
      health: overviewHealth,
      activityLevel: clampPercent(
        ((clusterStatusQuery.data?.aggregate_health_score ?? 0) * 0.45) +
        (activeAudioEdges * 6) +
        (runningAvbStreams.length * 5),
      ),
      alertCount: overviewNotifications.length,
      isLoading: topologyQuery.isLoading && !topology,
      error: topologyQuery.error instanceof Error ? topologyQuery.error.message : null,
      summaryMetrics: [
        {
          id: 'overview-nodes',
          label: 'Nodes online',
          value: `${onlineNodes}/${totalNodes || 1}`,
          helper: `Deployment: ${deploymentMode}`,
          tone: healthToTone(overviewHealth),
        },
        {
          id: 'overview-health',
          label: 'Cluster score',
          value: clusterHealthScore !== null && clusterHealthScore !== undefined ? formatPercent(clusterHealthScore, 0) : 'n/a',
          helper: 'Aggregate health posture',
          tone: healthToTone(clusterHealth),
        },
        {
          id: 'overview-audio',
          label: 'Streams',
          value: `${activeAudioEdges + runningAvbStreams.length}`,
          helper: 'Audio + AVB active paths',
          tone: 'info',
        },
      ],
      gridItems: [
        {
          id: 'platform-health',
          title: 'Platform Health',
          eyebrow: 'Overview',
          metric: clusterHealthScore !== null && clusterHealthScore !== undefined ? formatPercent(clusterHealthScore, 0) : `${onlineNodes}/${totalNodes || 1}`,
          helper: `Deployment mode: ${deploymentMode}`,
          status: overviewHealth,
          alertCount: overviewNotifications.length,
        },
        {
          id: 'active-alerts',
          title: 'Active Alerts',
          eyebrow: 'Signals',
          metric: String(
            overviewNotifications.length +
            nodeNotifications.length +
            avbNotifications.length +
            midiNotifications.length +
            observatoryNotifications.length +
            clusterNotifications.length,
          ),
          helper: 'Cross-layer notifications in scope',
          status: overviewNotifications.length > 0 ? overviewHealth : 'healthy',
        },
        {
          id: 'active-nodes',
          title: 'Active Nodes',
          eyebrow: 'Topology',
          metric: `${onlineNodes}/${totalNodes || 1}`,
          helper: `${warningNodes} warn · ${criticalNodes} critical/offline`,
          status: criticalNodes > 0 ? 'critical' : warningNodes > 0 ? 'warning' : 'healthy',
        },
        {
          id: 'active-streams',
          title: 'Active Streams',
          eyebrow: 'Transport',
          metric: String(activeAudioEdges + runningAvbStreams.length),
          helper: `${runningAvbStreams.length} AVB · ${activeAudioEdges} node edges`,
          status: avbStreamErrors > 0 ? 'critical' : 'healthy',
        },
        {
          id: 'api-availability',
          title: 'API Availability',
          eyebrow: 'Services',
          metric: observatoryStatus?.backend_running && observatoryStatus.frontend_running ? 'Online' : 'Degraded',
          helper: `Req/min ${formatNumber(observatoryStatus?.requests_per_minute)}`,
          status: observatoryStatus?.backend_running && observatoryStatus.frontend_running ? 'healthy' : 'critical',
        },
        {
          id: 'cluster-capacity',
          title: 'Cluster Capacity',
          eyebrow: 'Runtime',
          metric: formatPercent(100 - cpu.metrics.totalCpuPercent, 0),
          helper: `CPU ${formatPercent(cpu.metrics.totalCpuPercent, 0)} · Memory ${formatPercent(localNode?.memory_percent, 0)}`,
          status: cpu.status === 'critical' ? 'critical' : cpu.status === 'warning' ? 'warning' : 'healthy',
        },
      ],
      tableColumns: [
        { key: 'name', header: 'Name' },
        { key: 'status', header: 'Status' },
        { key: 'role', header: 'Role' },
        { key: 'metric1', header: 'CPU' },
        { key: 'metric2', header: 'Memory' },
        { key: 'alerts', header: 'Alerts' },
      ] satisfies PlatformTableColumn[],
      tableRows: (topology?.nodes ?? []).map((node) => ({
        id: node.node_id,
        name: node.display_label ? `${node.hostname} (${node.display_label})` : node.hostname,
        status: node.status,
        role: node.role.replace('_', ' '),
        metric1: formatPercent(node.cpu_percent, 0),
        metric2: formatPercent(node.memory_percent, 0),
        alerts: node.xrun_count > 0 ? `${node.xrun_count} xruns` : node.status === 'ok' ? 'Clear' : 'Investigate',
      })),
      tableTitle: 'Platform node rollup',
      tableDescription: 'Cluster nodes summarized from the unified node topology feed.',
      notifications: overviewNotifications,
    } satisfies PlatformLayerData

    const localInterfaces = (networkQuery.data?.ethernet.length ?? 0) + (networkQuery.data?.wifi.length ?? 0)
    const platformNodeStreamCount = (topology?.audio_edges ?? []).filter((edge) => edge.source_node_id === platformNode?.node_id || edge.dest_node_id === platformNode?.node_id).length
    const platformNodeDisplayName = platformNode?.display_label ? `${platformNode.hostname} (${platformNode.display_label})` : (platformNode?.hostname ?? 'pending')

    const nodeLayer = {
      ...PLATFORM_LAYER_META[1],
      health: nodeHealth,
      activityLevel: clampPercent(((platformNode?.cpu_percent ?? cpu.metrics.totalCpuPercent) * 0.7) + (platformNodeStreamCount * 8)),
      alertCount: nodeNotifications.length,
      isLoading: (identityQuery.isLoading || topologyQuery.isLoading) && !platformNode,
      error: topologyQuery.error instanceof Error ? topologyQuery.error.message : null,
      summaryMetrics: [
        {
          id: 'node-identity',
          label: platformNodeIsRemote ? 'Viewed node' : 'Local node',
          value: platformNodeDisplayName,
          helper: platformNode?.node_id ?? 'Waiting for identity',
          tone: nodeHealth,
        },
        {
          id: 'node-cpu',
          label: 'CPU',
          value: formatPercent(platformNode?.cpu_percent ?? cpu.metrics.totalCpuPercent, 1),
          helper: platformNodeIsRemote ? 'Remote node telemetry from cluster topology' : `Headroom ${formatPercent(cpu.metrics.headroomPercent, 0)}`,
          tone: platformNode?.status === 'critical' || cpu.status === 'critical'
            ? 'critical'
            : platformNode?.status === 'warn' || cpu.status === 'warning'
              ? 'warning'
              : 'healthy',
        },
        {
          id: 'node-latency',
          label: 'Latency',
          value: formatLatencyMs(platformNode?.audio_latency_ms ?? pipewire.totalLatencyMs),
          helper: `XRuns ${platformNode?.xrun_count ?? pipewire.xruns}`,
          tone: (platformNode?.xrun_count ?? pipewire.xruns) > 0 ? 'warning' : 'healthy',
        },
      ],
      gridItems: [
        {
          id: 'node-services',
          title: 'Node Services',
          eyebrow: 'Single Node',
          metric: `${Number(Boolean(platformNode?.services.backend)) + Number(Boolean(platformNode?.services.juce_engine)) + Number(Boolean(platformNode?.services.pipewire))}/3 online`,
          helper: 'Backend, JUCE engine, PipeWire',
          status: nodeHealth,
          alertCount: nodeNotifications.length,
        },
        {
          id: 'node-interfaces',
          title: 'Node Interfaces',
          eyebrow: 'Network',
          metric: platformNodeIsRemote ? 'Remote' : String(localInterfaces),
          helper: platformNodeIsRemote
            ? `${platformNode?.hostname ?? 'pending'} · interface inventory only available on the local host`
            : `${networkQuery.data?.hostname ?? platformNode?.hostname ?? 'pending'} · ${networkQuery.data?.internet_connected ? 'Internet up' : 'Isolated'}`,
          status: platformNodeIsRemote || localInterfaces > 0 ? 'healthy' : 'warning',
        },
        {
          id: 'node-streams',
          title: 'Node Streams',
          eyebrow: 'Audio',
          metric: String(platformNodeStreamCount + (platformNodeIsRemote ? 0 : pipewire.streams.length)),
          helper: platformNodeIsRemote
            ? `${platformNodeStreamCount} cluster edges visible for this remote node`
            : `${platformNodeStreamCount} cluster edges · ${pipewire.streams.length} PipeWire streams`,
          status: (platformNode?.xrun_count ?? 0) > 0 || pipewire.hasXruns ? 'warning' : 'healthy',
        },
      ],
      tableColumns: [
        { key: 'name', header: 'Service' },
        { key: 'status', header: 'Status' },
        { key: 'metric1', header: 'CPU' },
        { key: 'metric2', header: 'Memory' },
        { key: 'alerts', header: 'Alerts' },
      ] satisfies PlatformTableColumn[],
      tableRows: [
        {
          id: 'backend',
          name: 'Backend API',
          status: platformNode?.services.backend ? 'healthy' : 'critical',
          metric1: formatPercent(platformNode?.cpu_percent ?? cpu.metrics.totalCpuPercent, 0),
          metric2: formatPercent(platformNode?.memory_percent, 0),
          alerts: platformNode?.services.backend ? 'Clear' : 'Down',
        },
        {
          id: 'juce',
          name: 'JUCE Engine',
          status: platformNode?.services.juce_engine ? ((platformNode?.xrun_count ?? pipewire.xruns) > 0 ? 'warning' : 'healthy') : 'critical',
          metric1: formatPercent(platformNode?.cpu_percent ?? cpu.metrics.audioCallbackPercent, 0),
          metric2: formatLatencyMs(platformNode?.audio_latency_ms ?? pipewire.totalLatencyMs),
          alerts: (platformNode?.xrun_count ?? pipewire.xruns) > 0 ? `${platformNode?.xrun_count ?? pipewire.xruns} xruns` : 'Clear',
        },
        {
          id: 'pipewire',
          name: 'PipeWire',
          status: platformNode?.services.pipewire ? (platformNodeIsRemote ? 'healthy' : stringToHealth(pipewire.overallStatus)) : 'critical',
          metric1: platformNodeIsRemote ? formatPercent(platformNode?.memory_percent, 0) : formatNumber(pipewire.clientCount),
          metric2: platformNodeIsRemote ? formatLastSeen(platformNode?.last_seen) : formatNumber(localInterfaces),
          alerts: platformNodeIsRemote
            ? (platformNode?.services.pipewire ? 'Cluster topology healthy' : 'Unavailable')
            : pipewire.alerts.length > 0 ? `${pipewire.alerts.length} alert${pipewire.alerts.length === 1 ? '' : 's'}` : 'Clear',
        },
      ],
      tableTitle: 'Single-node services',
      tableDescription: platformNodeIsRemote
        ? 'Operational service posture for the selected remote node using cluster topology telemetry.'
        : 'Operational service posture for the local node, aligned to CPU, memory, and alert pressure.',
      notifications: nodeNotifications,
    } satisfies PlatformLayerData

    const avbLayer = {
      ...PLATFORM_LAYER_META[2],
      health: avbHealth,
      activityLevel: clampPercent((runningAvbStreams.length * 15) + ((avbDiscoveryQuery.data?.total_discovered ?? 0) * 5)),
      alertCount: avbNotifications.length,
      isLoading: avbStatusQuery.isLoading && !avbStatusQuery.data,
      error: avbStatusQuery.error instanceof Error ? avbStatusQuery.error.message : null,
      summaryMetrics: [
        {
          id: 'avb-state',
          label: 'AVB state',
          value: avbStatusQuery.data?.state ?? (avbStatusQuery.data?.available ? 'operational' : 'offline'),
          helper: avbStatusQuery.data?.interface || 'Interface pending',
          tone: avbHealth,
        },
        {
          id: 'avb-ptp',
          label: 'PTP',
          value: ptpStatusQuery.data?.state ?? 'pending',
          helper: `Offset ${formatNumber(ptpStatusQuery.data?.offset_ns, 0)} ns`,
          tone: stringToHealth(ptpStatusQuery.data?.state),
        },
        {
          id: 'avb-streams',
          label: 'Running streams',
          value: String(runningAvbStreams.length),
          helper: `${avbStreamErrors} errors`,
          tone: avbStreamErrors > 0 ? 'critical' : 'healthy',
        },
      ],
      gridItems: [
        {
          id: 'avb-stream-groups',
          title: 'Stream Groups',
          eyebrow: 'AVB Routing',
          metric: String(avbStreams.length),
          helper: `${runningAvbStreams.length} running · ${avbStreamErrors} errors`,
          status: avbStreamErrors > 0 ? 'critical' : avbHealth,
          alertCount: avbNotifications.length,
        },
        {
          id: 'avb-routing-endpoints',
          title: 'Routing Endpoints',
          eyebrow: 'Discovery',
          metric: String(avbDiscoveredNodes.length),
          helper: `${avbDiscoveryQuery.data?.talker_nodes ?? 0} talkers · ${avbDiscoveryQuery.data?.listener_nodes ?? 0} listeners`,
          status: avbDiscoveredNodes.length > 0 ? 'healthy' : 'warning',
        },
        {
          id: 'avb-ptp-lock',
          title: 'PTP Lock',
          eyebrow: 'Timing',
          metric: ptpStatusQuery.data?.state ?? 'pending',
          helper: `Path delay ${formatNumber(ptpStatusQuery.data?.mean_path_delay_ns, 0)} ns`,
          status: stringToHealth(ptpStatusQuery.data?.state),
        },
        {
          id: 'avb-tsn',
          title: 'TSN Queueing',
          eyebrow: 'Traffic Class',
          metric: tsnStatusQuery.data?.available ? 'Configured' : 'Unavailable',
          helper: tsnStatusQuery.data?.interface ?? 'No TSN interface',
          status: tsnStatusQuery.data?.available ? 'healthy' : 'warning',
        },
      ],
      tableColumns: [
        { key: 'name', header: 'Stream Name' },
        { key: 'source', header: 'Source' },
        { key: 'sink', header: 'Sink' },
        { key: 'latency', header: 'Latency' },
        { key: 'bandwidth', header: 'Bandwidth' },
        { key: 'status', header: 'Status' },
      ] satisfies PlatformTableColumn[],
      tableRows: avbStreams.map((stream) => ({
        id: stream.stream_id,
        name: stream.stream_id,
        source: stream.interface ?? 'unknown',
        sink: stream.dest_mac ?? 'multicast',
        latency: formatLatencyMs((stream.health?.ptp.mean_path_delay_ns ?? ptpStatusQuery.data?.mean_path_delay_ns ?? null) ? Number(stream.health?.ptp.mean_path_delay_ns ?? ptpStatusQuery.data?.mean_path_delay_ns) / 1_000_000 : null),
        bandwidth: formatBandwidthMbps(stream.channels, stream.sample_rate),
        status: stream.state,
      })),
      tableTitle: 'AVB stream inventory',
      tableDescription: 'Discovered and active AVB stream rows with timing and bandwidth context.',
      notifications: avbNotifications,
    } satisfies PlatformLayerData

    const midiLayer = {
      ...PLATFORM_LAYER_META[3],
      health: midiHealth,
      activityLevel: clampPercent((midiConnections.length * 12) + (midiEndpoints.length * 3)),
      alertCount: midiNotifications.length,
      isLoading: midiNodesQuery.isLoading && midiNodes.length === 0,
      error: midiNodesQuery.error instanceof Error ? midiNodesQuery.error.message : null,
      summaryMetrics: [
        {
          id: 'midi-enabled',
          label: 'Cluster MIDI',
          value: midiSummaryQuery.data?.enabled ? 'Enabled' : 'Disabled',
          helper: `${midiSummaryQuery.data?.node_count ?? 0} nodes`,
          tone: midiHealth,
        },
        {
          id: 'midi-clock',
          label: 'Clock master',
          value: midiClockQuery.data?.master_node_id ?? 'auto',
          helper: `Drift ${formatLatencyMs(Math.abs(midiClockQuery.data?.drift_ms ?? 0))}`,
          tone: Math.abs(midiClockQuery.data?.drift_ms ?? 0) > 5 ? 'warning' : 'healthy',
        },
        {
          id: 'midi-routes',
          label: 'Routes',
          value: String(midiConnections.length),
          helper: `${midiHealthQuery.data?.healthy_connection_count ?? 0} healthy`,
          tone: (midiHealthQuery.data?.degraded_connections ?? 0) > 0 ? 'warning' : 'healthy',
        },
      ],
      gridItems: [
        {
          id: 'midi-endpoints',
          title: 'MIDI Endpoints',
          eyebrow: 'MIDI Cluster',
          metric: String(midiEndpoints.length),
          helper: `${midiSummaryQuery.data?.device_count ?? 0} devices`,
          status: midiHealth,
          alertCount: midiNotifications.length,
        },
        {
          id: 'midi-routing-groups',
          title: 'Routing Groups',
          eyebrow: 'Connections',
          metric: String(midiConnections.length),
          helper: `${midiHealthQuery.data?.healthy_connection_count ?? 0} healthy · ${(midiHealthQuery.data?.degraded_connections ?? 0)} degraded`,
          status: (midiHealthQuery.data?.degraded_connections ?? 0) > 0 ? 'warning' : 'healthy',
        },
        {
          id: 'midi-clock-master',
          title: 'Clock Master',
          eyebrow: 'Sync',
          metric: midiClockQuery.data?.master_node_id ?? 'auto',
          helper: midiClockQuery.data?.strategy ?? 'Pending strategy',
          status: Math.abs(midiClockQuery.data?.drift_ms ?? 0) > 5 ? 'warning' : 'healthy',
        },
        {
          id: 'midi-activity',
          title: 'Cluster Activity',
          eyebrow: 'Transport',
          metric: String(midiConnections.reduce((sum, connection) => sum + connection.messages_forwarded, 0)),
          helper: 'Messages forwarded across active routes',
          status: midiConnections.length > 0 ? 'healthy' : 'warning',
        },
      ],
      tableColumns: [
        { key: 'device', header: 'Device' },
        { key: 'port', header: 'Port' },
        { key: 'clusterNode', header: 'Cluster Node' },
        { key: 'activity', header: 'Activity' },
        { key: 'status', header: 'Status' },
      ] satisfies PlatformTableColumn[],
      tableRows: midiEndpoints.map((endpoint) => ({
        id: endpoint.endpoint_id,
        device: endpoint.device_name,
        port: `${endpoint.port_name} (${endpoint.direction})`,
        clusterNode: midiNodeNameById.get(endpoint.node_id) ?? endpoint.node_id,
        activity: endpointActivity(endpoint, midiConnectionCountByEndpoint[endpoint.endpoint_id] ?? 0),
        status: endpoint.available ? 'healthy' : 'offline',
      })),
      tableTitle: 'MIDI endpoint inventory',
      tableDescription: 'Distributed MIDI ports, node ownership, and active route pressure.',
      notifications: midiNotifications,
    } satisfies PlatformLayerData

    const observatoryLayer = {
      ...PLATFORM_LAYER_META[4],
      health: observatoryHealth,
      activityLevel: clampPercent((observatoryTraffic?.requests_per_second ?? 0) * 12 + ((observatoryWs?.active_connections ?? 0) * 10)),
      alertCount: observatoryNotifications.length,
      isLoading: observatorySchema.loading && observatoryEndpoints.length === 0,
      error: observatorySchema.error,
      summaryMetrics: [
        {
          id: 'observatory-paths',
          label: 'OpenAPI paths',
          value: String(observatorySchema.catalog.length),
          helper: `${operationCount} operations`,
          tone: observatoryHealth,
        },
        {
          id: 'observatory-traffic',
          label: 'Traffic',
          value: `${formatNumber(observatoryTraffic?.requests_per_second, 1)} rps`,
          helper: `P95 ${formatLatencyMs(observatoryTraffic?.p95_ms)}`,
          tone: (observatoryTraffic?.error_rate_percent ?? 0) > 5 ? 'warning' : 'healthy',
        },
        {
          id: 'observatory-diff',
          label: 'Schema diff',
          value: String(diffCount),
          helper: diffCount > 0 ? 'Recent spec drift detected' : 'No spec drift',
          tone: diffCount > 0 ? 'warning' : 'healthy',
        },
      ],
      gridItems: [
        {
          id: 'observatory-services',
          title: 'Services',
          eyebrow: 'API Observatory',
          metric: observatoryStatus?.backend_running && observatoryStatus.frontend_running ? '2/2 online' : 'Degraded',
          helper: `WS ${observatoryWs?.active_connections ?? 0} active`,
          status: observatoryStatus?.backend_running && observatoryStatus.frontend_running ? 'healthy' : 'critical',
          alertCount: observatoryNotifications.length,
        },
        {
          id: 'observatory-endpoint-groups',
          title: 'Endpoint Groups',
          eyebrow: 'Catalog',
          metric: String(observatorySchema.catalog.length),
          helper: `${operationCount} operations indexed`,
          status: observatoryHealth,
        },
        {
          id: 'observatory-rate',
          title: 'Request Rate',
          eyebrow: 'Traffic',
          metric: `${formatNumber(observatoryTraffic?.requests_per_second, 1)} rps`,
          helper: `${formatPercent(observatoryTraffic?.error_rate_percent, 1)} error rate`,
          status: (observatoryTraffic?.error_rate_percent ?? 0) > 5 ? 'warning' : 'healthy',
        },
        {
          id: 'observatory-websocket',
          title: 'WebSocket Load',
          eyebrow: 'Realtime',
          metric: String(observatoryWs?.active_connections ?? 0),
          helper: `${formatNumber(observatoryWs?.messages_per_second, 1)} msg/s`,
          status: (observatoryWs?.active_connections ?? 0) > 0 ? 'healthy' : 'warning',
        },
      ],
      tableColumns: [
        { key: 'endpoint', header: 'Endpoint' },
        { key: 'latency', header: 'Latency' },
        { key: 'requests', header: 'Requests' },
        { key: 'errors', header: 'Errors' },
        { key: 'status', header: 'Status' },
      ] satisfies PlatformTableColumn[],
      tableRows: observatoryEndpoints.map((endpoint) => {
        const errorCount = endpointErrorCount(observatoryLogs, endpoint)
        return {
          id: `${endpoint.method}-${endpoint.path}`,
          endpoint: `${endpoint.method.toUpperCase()} ${endpoint.path}`,
          latency: endpoint.avg_response_time !== null ? formatLatencyMs(endpoint.avg_response_time) : 'n/a',
          requests: endpoint.request_count,
          errors: errorCount,
          status: endpointStatus(endpoint, errorCount),
        }
      }),
      tableTitle: 'Observed API endpoints',
      tableDescription: 'Endpoint latency and failure posture from the live web-service telemetry surfaces.',
      notifications: observatoryNotifications,
    } satisfies PlatformLayerData

    const clusterLayer = {
      ...PLATFORM_LAYER_META[5],
      health: clusterHealth,
      activityLevel: clampPercent(((clusterStatusQuery.data?.aggregate_health_score ?? 0) * 0.55) + (activeNetworkEdges * 9)),
      alertCount: clusterNotifications.length,
      isLoading: clusterStatusQuery.isLoading && !clusterStatusQuery.data,
      error: clusterStatusQuery.error instanceof Error ? clusterStatusQuery.error.message : null,
      summaryMetrics: [
        {
          id: 'cluster-online',
          label: 'Online nodes',
          value: `${onlineNodes}/${totalNodes || 1}`,
          helper: `${activeNetworkEdges} latency links`,
          tone: clusterHealth,
        },
        {
          id: 'cluster-mode',
          label: 'Deployment mode',
          value: deploymentMode,
          helper: `${midiNodes.length} MIDI nodes`,
          tone: 'info',
        },
        {
          id: 'cluster-health-score',
          label: 'Health score',
          value: clusterHealthScore !== null && clusterHealthScore !== undefined ? formatPercent(clusterHealthScore, 0) : 'n/a',
          helper: `${criticalNodes} critical/offline`,
          tone: clusterHealth,
        },
      ],
      gridItems: [
        {
          id: 'cluster-node-groups',
          title: 'Node Groups',
          eyebrow: 'Cluster Dashboard',
          metric: `${onlineNodes}/${totalNodes || 1}`,
          helper: `${criticalNodes} critical/offline · ${warningNodes} warning`,
          status: clusterHealth,
          alertCount: clusterNotifications.length,
        },
        {
          id: 'cluster-zones',
          title: 'Cluster Zones',
          eyebrow: 'Fabric',
          metric: String(Math.max(1, activeNetworkEdges)),
          helper: `${midiNodes.length} MIDI peers · ${avbDiscoveredNodes.length} AVB peers`,
          status: activeNetworkEdges > 0 || totalNodes <= 1 ? 'healthy' : 'warning',
        },
        {
          id: 'cluster-deployment',
          title: 'Deployment',
          eyebrow: 'Mode',
          metric: deploymentMode,
          helper: localNode?.role.replace('_', ' ') ?? 'pending role',
          status: deploymentMode === 'ALL-IN-ONE' ? 'healthy' : clusterHealth,
        },
        {
          id: 'cluster-workload',
          title: 'Cluster Workload',
          eyebrow: 'Pressure',
          metric: formatPercent(topology?.nodes.reduce((sum, node) => sum + node.cpu_percent, 0) ?? 0 / Math.max(totalNodes, 1), 0),
          helper: `${activeAudioEdges + runningAvbStreams.length} streams active`,
          status: clusterHealth,
        },
      ],
      tableColumns: [
        { key: 'node', header: 'Node' },
        { key: 'status', header: 'Status' },
        { key: 'cpu', header: 'CPU' },
        { key: 'memory', header: 'Memory' },
        { key: 'workloads', header: 'Workloads' },
        { key: 'alerts', header: 'Alerts' },
      ] satisfies PlatformTableColumn[],
      tableRows: (topology?.nodes ?? []).map((node) => ({
        id: node.node_id,
        node: node.display_label ? `${node.hostname} (${node.display_label})` : node.hostname,
        status: node.status,
        cpu: formatPercent(node.cpu_percent, 0),
        memory: formatPercent(node.memory_percent, 0),
        workloads: `${(topology?.audio_edges ?? []).filter((edge) => edge.source_node_id === node.node_id || edge.dest_node_id === node.node_id).length} streams`,
        alerts: node.xrun_count > 0 ? `${node.xrun_count} xruns` : statusToHealth(node) === 'healthy' ? 'Clear' : `Last seen ${formatLastSeen(node.last_seen)}`,
      })),
      tableTitle: 'Cluster node workloads',
      tableDescription: 'Node fleet operating posture with CPU, memory, workload, and alert context.',
      notifications: clusterNotifications,
    } satisfies PlatformLayerData

    return [
      overviewLayer,
      nodeLayer,
      avbLayer,
      midiLayer,
      observatoryLayer,
      clusterLayer,
    ]
  }, [
    activeAudioEdges,
    activeNetworkEdges,
    avbDiscoveryQuery.data,
    avbDiscoveryQuery.error,
    avbDiscoveryQuery.isLoading,
    avbStatusQuery.data,
    avbStatusQuery.error,
    avbStatusQuery.isLoading,
    avbStreamErrors,
    avbStreams,
    clusterHealthScore,
    clusterStatusQuery.data,
    clusterStatusQuery.error,
    clusterStatusQuery.isLoading,
    cpu.hasXruns,
    cpu.metrics.audioCallbackPercent,
    cpu.metrics.headroomPercent,
    cpu.metrics.totalCpuPercent,
    cpu.status,
    criticalNodes,
    deploymentMode,
    deploymentModeQuery.data,
    diffCount,
    identityQuery.data,
    identityQuery.isLoading,
    localNode,
    midiClockQuery.data,
    midiConnections,
    midiConnectionCountByEndpoint,
    midiEndpoints,
    midiHealthQuery.data,
    midiNodes,
    midiNodeNameById,
    midiNodesQuery.error,
    midiNodesQuery.isLoading,
    midiSummaryQuery.data,
    networkQuery.data,
    observatoryEndpoints,
    observatoryLogs,
    observatorySchema.catalog,
    observatorySchema.error,
    observatorySchema.loading,
    observatoryStatus,
    observatoryTraffic,
    observatoryWs,
    onlineNodes,
    operationCount,
    pipewire.alerts.length,
    pipewire.clientCount,
    pipewire.hasXruns,
    pipewire.overallStatus,
    pipewire.streams.length,
    pipewire.totalLatencyMs,
    pipewire.xruns,
    ptpStatusQuery.data,
    runningAvbStreams.length,
    topology,
    topologyQuery.error,
    topologyQuery.isLoading,
    totalNodes,
    tsnStatusQuery.data,
    warningNodes,
  ])

  const summaryMetrics = useMemo<PlatformSummaryMetric[]>(() => {
    const activeAlerts = layers.reduce((sum, layer) => sum + layer.alertCount, 0)
    return [
      {
        id: 'summary-nodes',
        label: 'Nodes',
        value: `${onlineNodes}/${totalNodes || 1}`,
        helper: 'Online across the fabric',
        tone: criticalNodes > 0 ? 'critical' : warningNodes > 0 ? 'warning' : 'healthy',
      },
      {
        id: 'summary-streams',
        label: 'Streams',
        value: String(activeAudioEdges + runningAvbStreams.length),
        helper: 'Cluster + AVB transports',
        tone: 'info',
      },
      {
        id: 'summary-rps',
        label: 'API Rate',
        value: `${formatNumber(observatoryTraffic?.requests_per_second, 1)} rps`,
        helper: `${formatPercent(observatoryTraffic?.error_rate_percent, 1)} error rate`,
        tone: (observatoryTraffic?.error_rate_percent ?? 0) > 5 ? 'warning' : 'healthy',
      },
      {
        id: 'summary-alerts',
        label: 'Alerts',
        value: String(activeAlerts),
        helper: 'Current notifications across all layers',
        tone: activeAlerts > 0 ? (criticalNodes > 0 ? 'critical' : 'warning') : 'healthy',
      },
    ]
  }, [
    activeAudioEdges,
    criticalNodes,
    layers,
    observatoryTraffic,
    onlineNodes,
    runningAvbStreams.length,
    totalNodes,
    warningNodes,
  ])

  const layerHealth = useMemo(
    () => layers.reduce<Record<PlatformLayerId, PlatformHealth>>((acc, layer) => {
      acc[layer.id] = layer.health
      return acc
    }, makePlatformHealthRecord(() => 'unknown')),
    [layers],
  )

  const alerts = useMemo<PlatformAlert[]>(
    () => layers.flatMap((layer) =>
      layer.notifications.map((notification) => ({
        ...notification,
        layerId: layer.id,
      })),
    ),
    [layers],
  )

  return {
    layers,
    layerHealth,
    summaryMetrics,
    alerts,
  }
}
