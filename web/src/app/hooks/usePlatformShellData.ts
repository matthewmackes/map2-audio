import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getTrafficStats } from '../pages/ApiObservatory/api'
import { type AVBNode, type AVBStream, useAVBDiscovery, useAVBStatus, useAVBStreams, useAvbRealtimeSync, usePTPStatus, useTsnStatus } from './useAvbStatus'
import { useCPUMetrics } from './useCPUMetrics'
import { useNodeIdentity, useNodeTopology } from './useNodeTopology'
import { useOpenApiSchema } from './useOpenApiSchema'
import { usePeerDiscoveryStatus } from './usePeerDiscovery'
import { usePipeWire } from './usePipeWire'
import {
  networkApi,
  wwwApi,
} from '../../map2/api'
import { useViewedNode } from '../stores/viewedNodeStore'
import type { NodeSummary } from '../types/node'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import type { NetworkStatus, WWWStatus } from '../../map2/types'
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
import type {
  PlatformVersionInfo,
  UpdateStatusInfo,
  BackupStatusInfo,
  HealthCheckInfo,
  RemediationSummaryInfo,
  ManifestDriftInfo,
  DeploymentStatusInfo,
  HybridApplicationStatusInfo,
  UpdateHybridVersionInfo,
} from './useNodeOperations'
import { fetchUpdateApplicationStatus, fetchUpdateApplicationVersion } from './updateApplicationApi'
import { useRealtimeCadence } from './useRealtimeCadence'
import { useRouteActive } from './useRouteActive'

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

const EMPTY_AVB_NODES: AVBNode[] = []
const EMPTY_AVB_STREAMS: AVBStream[] = []

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

function sumRemediationCounts(counts: RemediationSummaryInfo['counts'] | undefined): number {
  if (!counts) {
    return 0
  }
  return [counts.adoption, counts.sync, counts.clone]
    .flatMap((group) => Object.values(group ?? {}))
    .reduce((sum, value) => sum + value, 0)
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

export function usePlatformShellData(): PlatformShellData {
  const platformRouteActive = useRouteActive(['/platforms', '/workspace'])
  const platformFastCadence = useRealtimeCadence({
    routeActive: platformRouteActive,
    visibleMs: 5_000,
    hiddenMs: 20_000,
    inactiveMs: false,
  })
  const platformStandardCadence = useRealtimeCadence({
    routeActive: platformRouteActive,
    visibleMs: 10_000,
    hiddenMs: 30_000,
    inactiveMs: false,
  })
  const platformVerySlowCadence = useRealtimeCadence({
    routeActive: platformRouteActive,
    visibleMs: 30_000,
    hiddenMs: 60_000,
    inactiveMs: false,
  })
  const topologyQuery = useNodeTopology()
  const identityQuery = useNodeIdentity()
  const pipewire = usePipeWire({ useWebSocket: false, pollingInterval: typeof platformFastCadence === 'number' ? platformFastCadence : 5_000 })
  const cpu = useCPUMetrics({ useWebSocket: false, pollingInterval: typeof platformFastCadence === 'number' ? platformFastCadence : 5_000 })

  const networkQuery = useQuery<NetworkStatus>({
    queryKey: ['platform', 'network-status'],
    queryFn: networkApi.getStatus,
    refetchInterval: platformStandardCadence,
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
    refetchInterval: platformStandardCadence,
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
    refetchInterval: platformStandardCadence,
    staleTime: 5000,
  })

  const avbStatusQuery = useAVBStatus()
  const avbStreamsEnabled = avbStatusQuery.data?.enabled !== false
  useAvbRealtimeSync(avbStreamsEnabled)
  const avbStreamsQuery = useAVBStreams(avbStreamsEnabled)
  const avbDiscoveryQuery = useAVBDiscovery(avbStreamsEnabled)
  const ptpStatusQuery = usePTPStatus(avbStreamsEnabled)
  const tsnStatusQuery = useTsnStatus(avbStreamsEnabled)
  const discoveryQuery = usePeerDiscoveryStatus(typeof platformStandardCadence === 'number' ? platformStandardCadence : 10_000)

  const observatorySchema = useOpenApiSchema()
  const trafficStatsQuery = useQuery<TrafficStatsResponse>({
    queryKey: ['platform', 'observatory', 'traffic-stats'],
    queryFn: () => getTrafficStats() as Promise<TrafficStatsResponse>,
    refetchInterval: platformStandardCadence,
    staleTime: 5000,
  })
  const observatoryStatusQuery = useQuery<WWWStatus>({
    queryKey: ['platform', 'observatory', 'status'],
    queryFn: wwwApi.getStatus,
    refetchInterval: platformStandardCadence,
    staleTime: 5000,
  })

  // ── Node operations queries (version, update, backup, health, remediation) ──

  const nodeVersionQuery = useQuery<PlatformVersionInfo>({
    queryKey: ['platform', 'node-version'],
    queryFn: async () => {
      const r = await fetch('/api/version')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<PlatformVersionInfo>
    },
    refetchInterval: platformVerySlowCadence,
    staleTime: 20000,
  })

  const nodeUpdateStatusQuery = useQuery<UpdateStatusInfo>({
    queryKey: ['platform', 'node-update-status'],
    queryFn: async () => {
      const r = await fetch('/api/cluster/update/status')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<UpdateStatusInfo>
    },
    refetchInterval: platformStandardCadence,
    staleTime: 5000,
  })

  const nodeApplicationStatusQuery = useQuery<HybridApplicationStatusInfo>({
    queryKey: ['platform', 'node-application-status'],
    queryFn: () => fetchUpdateApplicationStatus(),
    refetchInterval: platformFastCadence,
    staleTime: 2000,
  })

  const nodeHybridVersionQuery = useQuery<UpdateHybridVersionInfo>({
    queryKey: ['platform', 'node-hybrid-version'],
    queryFn: () => fetchUpdateApplicationVersion(),
    refetchInterval: platformVerySlowCadence,
    staleTime: 20000,
  })

  const nodeBackupStatusQuery = useQuery<BackupStatusInfo>({
    queryKey: ['platform', 'node-backup-status'],
    queryFn: async () => {
      const r = await fetch('/api/backup/status')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<BackupStatusInfo>
    },
    refetchInterval: platformVerySlowCadence,
    staleTime: 20000,
  })

  const nodeHealthQuery = useQuery<HealthCheckInfo>({
    queryKey: ['platform', 'node-health'],
    queryFn: async () => {
      const r = await fetch('/api/health')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<HealthCheckInfo>
    },
    refetchInterval: platformStandardCadence,
    staleTime: 5000,
  })

  const nodeDeployStatusQuery = useQuery<DeploymentStatusInfo>({
    queryKey: ['platform', 'node-deploy-status'],
    queryFn: async () => {
      const r = await fetch('/api/deployment/status')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<DeploymentStatusInfo>
    },
    refetchInterval: platformStandardCadence,
    staleTime: 5000,
  })

  const nodeRemediationQuery = useQuery<RemediationSummaryInfo>({
    queryKey: ['platform', 'node-remediation'],
    queryFn: async () => {
      const r = await fetch('/api/platform-remediation/summary')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<RemediationSummaryInfo>
    },
    refetchInterval: platformStandardCadence,
    staleTime: 5000,
  })

  const nodeManifestDriftQuery = useQuery<ManifestDriftInfo>({
    queryKey: ['platform', 'node-manifest-drift'],
    queryFn: async () => {
      const r = await fetch('/api/cluster/update/manifest/drift')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<ManifestDriftInfo>
    },
    refetchInterval: platformVerySlowCadence,
    staleTime: 20000,
  })

  const topology = topologyQuery.data
  const topologyNodes = Array.isArray(topology?.nodes) ? topology.nodes : []
  const topologyAudioEdges = Array.isArray(topology?.audio_edges) ? topology.audio_edges : []
  const topologyNetworkEdges = Array.isArray(topology?.network_edges) ? topology.network_edges : []
  const localNode = topologyNodes.find((node) => node.is_local) ?? topologyNodes[0]
  const platformViewedNodeId = useViewedNode(NODE_PAGE_KEYS.platform, localNode?.node_id ?? 'local')
  const platformViewedNode = topologyNodes.find((node) => node.node_id === platformViewedNodeId) ?? localNode
  const platformNode = platformViewedNode ?? localNode
  const platformNodeIsRemote = Boolean(platformNode && localNode && platformNode.node_id !== localNode.node_id)
  const onlineNodes = topologyNodes.filter((node) => node.status !== 'offline').length
  const totalNodes = topologyNodes.length
  const criticalNodes = topologyNodes.filter((node) => node.status === 'critical' || node.status === 'offline').length
  const warningNodes = topologyNodes.filter((node) => node.status === 'warn').length
  const activeAudioEdges = topologyAudioEdges.filter((edge) => edge.active).length
  const activeNetworkEdges = topologyNetworkEdges.filter((edge) => edge.latency_ms !== null).length
  const deploymentMode = deploymentModeQuery.data?.mode ?? 'Unknown'
  const clusterHealthScore = clusterStatusQuery.data?.aggregate_health_score

  const avbStreams = avbStreamsQuery.data?.streams ?? EMPTY_AVB_STREAMS
  const runningAvbStreams = avbStreams.filter((stream) => stream.state === 'running')
  const avbStreamErrors = avbStreams.filter((stream) => stream.state === 'error' || Boolean(stream.error)).length
  const avbDiscoveredNodes = avbDiscoveryQuery.data?.nodes ?? EMPTY_AVB_NODES
  const discoveryPeers = discoveryQuery.data?.peers ?? []

  const observatoryTraffic = trafficStatsQuery.data
  const observatoryStatus = observatoryStatusQuery.data

  // ── Node operations derived values ──
  const nodeVersion = nodeVersionQuery.data
  const nodeUpdateStatus = nodeUpdateStatusQuery.data
  const nodeApplicationStatus = nodeApplicationStatusQuery.data
  const nodeHybridVersion = nodeHybridVersionQuery.data
  const nodeBackupStatus = nodeBackupStatusQuery.data
  const nodeHealthCheck = nodeHealthQuery.data
  const nodeDeployStatus = nodeDeployStatusQuery.data
  const nodeRemediation = nodeRemediationQuery.data
  const nodeManifestDrift = nodeManifestDriftQuery.data

  const layers = useMemo<PlatformLayerData[]>(() => {
    const overviewNotifications: PlatformNotification[] = []
    const nodeNotifications: PlatformNotification[] = []
    const avbNotifications: PlatformNotification[] = []
    const observatoryNotifications: PlatformNotification[] = []
    const discoveryNotifications: PlatformNotification[] = []
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
      : worstHealth(...(topologyNodes.map((node) => statusToHealth(node)) || ['unknown']))

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
    if (observatoryNotifications.length > 0) {
      overviewNotifications.push(
        ...observatoryNotifications.map((notification) => ({
          ...notification,
          id: `overview-${notification.id}`,
        })),
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
    if (discoveryQuery.error) {
      pushNotification(
        discoveryNotifications,
        'discovery-status-error',
        'critical',
        'Peer discovery unavailable',
        discoveryQuery.error instanceof Error ? discoveryQuery.error.message : 'Failed to load peer visibility telemetry.',
      )
    }
    const unmanagedDiscoveryPeers = discoveryPeers.filter((peer) => peer.registration_required).length
    const offlineManagedPeers = discoveryPeers.filter((peer) => !peer.is_online && !peer.registration_required).length
    const slowDiscoveryPeers = discoveryPeers.filter((peer) => (peer.latency_ms ?? 0) > 15).length
    if (unmanagedDiscoveryPeers > 0) {
      pushNotification(
        discoveryNotifications,
        'discovery-registration-required',
        'warning',
        'Peers still need registration',
        `${unmanagedDiscoveryPeers} discovered peer${unmanagedDiscoveryPeers === 1 ? '' : 's'} are visible but not yet registered into the managed cluster.`,
      )
    }
    if (offlineManagedPeers > 0) {
      pushNotification(
        discoveryNotifications,
        'discovery-offline-managed',
        'critical',
        'Managed peers are offline',
        `${offlineManagedPeers} registered peer${offlineManagedPeers === 1 ? '' : 's'} are currently offline or unreachable.`,
      )
    }
    if (slowDiscoveryPeers > 0) {
      pushNotification(
        discoveryNotifications,
        'discovery-latency-warning',
        'warning',
        'Peer latency rising',
        `${slowDiscoveryPeers} peer${slowDiscoveryPeers === 1 ? '' : 's'} are above the 15 ms watch threshold.`,
      )
    }

    const observatoryHealth = worstHealth(
      observatorySchema.error ? 'critical' : 'healthy',
      (observatoryTraffic?.error_rate_percent ?? 0) > 5 ? 'warning' : 'healthy',
      observatoryStatus && (!observatoryStatus.backend_running || !observatoryStatus.frontend_running) ? 'critical' : 'healthy',
    )
    const overviewHealth = worstHealth(
      clusterHealth,
      warningNodes > 0 ? 'warning' : 'healthy',
      criticalNodes > 0 ? 'critical' : 'healthy',
      observatoryHealth,
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
    const discoveryHealth = worstHealth(
      discoveryQuery.error ? 'critical' : 'healthy',
      offlineManagedPeers > 0 ? 'critical' : 'healthy',
      unmanagedDiscoveryPeers > 0 || slowDiscoveryPeers > 0 ? 'warning' : 'healthy',
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
            discoveryNotifications.length +
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
      tableRows: topologyNodes.map((node) => ({
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
    const platformNodeStreamCount = topologyAudioEdges.filter((edge) => edge.source_node_id === platformNode?.node_id || edge.dest_node_id === platformNode?.node_id).length
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
      gridItems: (() => {
        const applicationUpdateIsActive = Boolean(nodeApplicationStatus?.running)
        const orchestratorUpdateIsActive = nodeUpdateStatus?.status === 'in_progress' || nodeUpdateStatus?.status === 'rolling_back'
        const updateIsActive = applicationUpdateIsActive || orchestratorUpdateIsActive
        const updateStatusLabel = nodeApplicationStatus?.status ?? nodeUpdateStatus?.status ?? 'idle'
        const updateHealth: PlatformHealth = updateIsActive
          ? 'warning'
          : updateStatusLabel === 'failed'
            ? 'critical'
            : 'healthy'
        const applicationStepLabel = nodeApplicationStatus?.current_step_index !== null && nodeApplicationStatus?.current_step_index !== undefined
          ? `Question ${nodeApplicationStatus.current_step_index + 1}/10`
          : null
        const versionDisplay = nodeVersion?.version
          ? `${nodeVersion.version.slice(0, 8)}${nodeVersion.dirty ? '*' : ''}`
          : nodeHybridVersion?.version?.slice(0, 12) ?? 'pending'
        const deployModeLabel = deploymentMode
        const backupCount = nodeBackupStatus?.total_backups ?? 0
        const backupLatest = nodeBackupStatus?.latest_backup_date
          ? new Date(nodeBackupStatus.latest_backup_date).toLocaleDateString()
          : 'Never'
        const remediationCount = sumRemediationCounts(nodeRemediation?.counts)
        const manifestDrifted = nodeManifestDrift?.drifted ?? false
        const syncUnavailable = nodeRemediation?.workflows?.sync?.available === false
        const healthUptime = nodeHealthCheck?.uptime_seconds
          ? nodeHealthCheck.uptime_seconds >= 86400
            ? `${Math.floor(nodeHealthCheck.uptime_seconds / 86400)}d`
            : nodeHealthCheck.uptime_seconds >= 3600
              ? `${Math.floor(nodeHealthCheck.uptime_seconds / 3600)}h`
              : `${Math.floor(nodeHealthCheck.uptime_seconds / 60)}m`
          : 'n/a'

        return [
          {
            id: 'node-services',
            title: 'Node Services',
            eyebrow: 'Management',
            metric: `${Number(Boolean(platformNode?.services.backend)) + Number(Boolean(platformNode?.services.juce_engine)) + Number(Boolean(platformNode?.services.pipewire))}/3 online`,
            helper: 'Backend, JUCE engine, PipeWire',
            status: nodeHealth,
            alertCount: nodeNotifications.length,
          },
          {
            id: 'node-version',
            title: 'Platform Version',
            eyebrow: 'Release',
            metric: versionDisplay,
            helper: nodeVersion?.build_channel
              ? `Channel: ${nodeVersion.build_channel} · API ${nodeVersion.api_version ?? 'n/a'}`
              : nodeHybridVersion?.mode === 'git'
                ? `Branch: ${nodeHybridVersion.branch ?? 'master'}`
                : 'Version info pending',
            status: nodeVersion?.dirty ? 'warning' : 'healthy',
          },
          {
            id: 'node-deployment',
            title: 'Deployment Mode',
            eyebrow: 'Configuration',
            metric: deployModeLabel,
            helper: (() => {
              if (!nodeDeployStatus?.services) return 'Service status pending'
              const svcEntries = Object.entries(nodeDeployStatus.services)
              const running = svcEntries.filter(([, v]) => v.status === 'running').length
              return `${running}/${svcEntries.length} services running`
            })(),
            status: deployModeLabel === 'Unknown' ? 'warning' : 'healthy',
          },
          {
            id: 'node-update-status',
            title: 'Update Status',
            eyebrow: 'Updates',
            metric: updateIsActive ? 'In Progress' : updateStatusLabel === 'failed' ? 'Failed' : 'Idle',
            helper: updateIsActive
              ? applicationStepLabel
                ? `${applicationStepLabel} · ${nodeApplicationStatus?.message ?? 'Hybrid update in progress'}`
                : `${nodeUpdateStatus?.completed_nodes ?? 0}/${nodeUpdateStatus?.total_nodes ?? '?'} nodes done`
              : nodeApplicationStatus?.message ?? nodeUpdateStatus?.message ?? 'No update in progress',
            status: updateHealth,
          },
          {
            id: 'node-backup',
            title: 'Backups',
            eyebrow: 'Recovery',
            metric: `${backupCount} snapshot${backupCount === 1 ? '' : 's'}`,
            helper: `Latest: ${backupLatest}`,
            status: backupCount > 0 ? 'healthy' : 'warning',
          },
          {
            id: 'node-health-check',
            title: 'Health Check',
            eyebrow: 'Diagnostics',
            metric: nodeHealthCheck?.status ?? 'pending',
            helper: `Uptime ${healthUptime} · Audio ${nodeHealthCheck?.audio?.engine_running ? 'running' : 'stopped'}`,
            status: stringToHealth(nodeHealthCheck?.status),
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
          {
            id: 'node-remediation',
            title: 'Remediation',
            eyebrow: 'Maintenance',
            metric: syncUnavailable
              ? 'Sync unavailable'
              : remediationCount > 0
                ? `${remediationCount} action${remediationCount === 1 ? '' : 's'}`
                : 'Clear',
            helper: syncUnavailable
              ? 'Release sync is temporarily unavailable on this node.'
              : manifestDrifted
                ? 'Manifest drift detected'
                : 'No drift detected',
            status: syncUnavailable || manifestDrifted ? 'warning' : remediationCount > 0 ? 'warning' : 'healthy',
          },
        ] satisfies PlatformGridItem[]
      })(),
      tableColumns: [
        { key: 'name', header: 'Service / Subsystem' },
        { key: 'status', header: 'Status' },
        { key: 'metric1', header: 'Detail' },
        { key: 'metric2', header: 'Info' },
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
        {
          id: 'version',
          name: 'Platform Version',
          status: nodeVersion ? (nodeVersion.dirty ? 'warning' : 'healthy') : 'unknown',
          metric1: nodeVersion?.version ?? 'pending',
          metric2: nodeVersion?.build_channel ?? (nodeHybridVersion?.mode ?? 'n/a'),
          alerts: nodeVersion?.dirty ? 'Dirty build' : 'Clear',
        },
        {
          id: 'deployment',
          name: 'Deployment Mode',
          status: deploymentMode !== 'Unknown' ? 'healthy' : 'warning',
          metric1: deploymentMode,
          metric2: (() => {
            if (!nodeDeployStatus?.services) return 'pending'
            const svcEntries = Object.entries(nodeDeployStatus.services)
            const running = svcEntries.filter(([, v]) => v.status === 'running').length
            return `${running}/${svcEntries.length} running`
          })(),
          alerts: 'Clear',
        },
        {
          id: 'update',
          name: 'Update System',
          status: nodeApplicationStatus?.running || nodeUpdateStatus?.status === 'in_progress' || nodeUpdateStatus?.status === 'rolling_back'
            ? 'warning'
            : (nodeApplicationStatus?.status ?? nodeUpdateStatus?.status) === 'failed'
              ? 'critical'
              : 'healthy',
          metric1: nodeApplicationStatus?.running
            ? `Question ${(nodeApplicationStatus.current_step_index ?? 0) + 1}/10`
            : nodeApplicationStatus?.status ?? nodeUpdateStatus?.status ?? 'idle',
          metric2: nodeApplicationStatus?.running
            ? nodeApplicationStatus.message
            : nodeUpdateStatus?.current_node ?? nodeApplicationStatus?.message ?? 'n/a',
          alerts: (nodeApplicationStatus?.status ?? nodeUpdateStatus?.status) === 'failed'
            ? nodeApplicationStatus?.error ?? nodeApplicationStatus?.message ?? nodeUpdateStatus?.message ?? 'Update failed'
            : nodeApplicationStatus?.running
              ? nodeApplicationStatus.message
              : nodeUpdateStatus?.status === 'in_progress'
                ? `${nodeUpdateStatus.completed_nodes ?? 0}/${nodeUpdateStatus.total_nodes ?? '?'}`
                : 'Clear',
        },
        {
          id: 'backup',
          name: 'Backup System',
          status: (nodeBackupStatus?.total_backups ?? 0) > 0 ? 'healthy' : 'warning',
          metric1: `${nodeBackupStatus?.total_backups ?? 0} snapshots`,
          metric2: nodeBackupStatus?.latest_backup_date
            ? new Date(nodeBackupStatus.latest_backup_date).toLocaleDateString()
            : 'No backups',
          alerts: (nodeBackupStatus?.total_backups ?? 0) === 0 ? 'No backups' : 'Clear',
        },
        {
          id: 'health-check',
          name: 'Health Monitor',
          status: stringToHealth(nodeHealthCheck?.status),
          metric1: nodeHealthCheck?.status ?? 'pending',
          metric2: nodeHealthCheck?.uptime_seconds
            ? `Up ${Math.floor(nodeHealthCheck.uptime_seconds / 3600)}h`
            : 'n/a',
          alerts: nodeHealthCheck?.audio?.xrun_count
            ? `${nodeHealthCheck.audio.xrun_count} xruns`
            : 'Clear',
        },
        {
          id: 'remediation',
          name: 'Remediation',
          status: nodeRemediation?.workflows?.sync?.available === false || nodeManifestDrift?.drifted ? 'warning' : 'healthy',
          metric1: nodeRemediation?.status ?? 'pending',
          metric2: nodeRemediation?.workflows?.sync?.available === false
            ? 'Sync unavailable'
            : nodeManifestDrift?.drifted
              ? `${nodeManifestDrift.nodes?.length ?? 0} drifted`
              : 'No drift',
          alerts: nodeRemediation?.workflows?.sync?.available === false
            ? 'Sync unavailable'
            : nodeManifestDrift?.drifted
              ? 'Drift detected'
              : 'Clear',
        },
      ],
      tableTitle: 'Management services and platform operations',
      tableDescription: platformNodeIsRemote
        ? 'Service posture and platform operations for the selected remote management context.'
        : 'Service posture and platform operations for the local management context — version, deployment, updates, backups, health, and remediation.',
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

    const discoveryReadyPeers = discoveryPeers.filter((peer) => peer.routing_ready).length
    const discoverySourceLabel = platformNodeDisplayName
    const networkDiscoveryLayer = {
      ...PLATFORM_LAYER_META[3],
      health: discoveryHealth,
      activityLevel: clampPercent(
        (discoveryReadyPeers * 18) +
        (discoveryPeers.filter((peer) => peer.is_online).length * 8) +
        (discoveryPeers.filter((peer) => (peer.latency_ms ?? 0) > 15).length * 6),
      ),
      alertCount: discoveryNotifications.length,
      isLoading: discoveryQuery.isLoading && discoveryPeers.length === 0,
      error: discoveryQuery.error instanceof Error ? discoveryQuery.error.message : null,
      summaryMetrics: [
        {
          id: 'discovery-source',
          label: platformNodeIsRemote ? 'Viewed source' : 'Local source',
          value: discoverySourceLabel,
          helper: platformNode?.node_id ?? 'Waiting for topology',
          tone: discoveryHealth,
        },
        {
          id: 'discovery-visible',
          label: 'Visible peers',
          value: String(discoveryPeers.length),
          helper: `${discoveryPeers.filter((peer) => peer.is_online).length} online`,
          tone: discoveryHealth,
        },
        {
          id: 'discovery-routing-ready',
          label: 'Routing ready',
          value: String(discoveryReadyPeers),
          helper: `${discoveryPeers.filter((peer) => peer.registration_required).length} gated`,
          tone: discoveryReadyPeers > 0 ? 'healthy' : 'warning',
        },
      ],
      gridItems: [
        {
          id: 'discovery-peers',
          title: 'Visible Peers',
          eyebrow: 'Discovery',
          metric: String(discoveryPeers.length),
          helper: `${discoveryPeers.filter((peer) => peer.is_online).length} online · ${discoveryReadyPeers} ready`,
          status: discoveryHealth,
          alertCount: discoveryNotifications.length,
        },
        {
          id: 'discovery-ready',
          title: 'Routing Ready',
          eyebrow: 'Visibility',
          metric: String(discoveryReadyPeers),
          helper: `${discoveryPeers.filter((peer) => !peer.registration_required).length} registered`,
          status: discoveryReadyPeers > 0 ? 'healthy' : 'warning',
        },
        {
          id: 'discovery-registration',
          title: 'Registration Gates',
          eyebrow: 'Readiness',
          metric: String(discoveryPeers.filter((peer) => peer.registration_required).length),
          helper: `${discoveryPeers.filter((peer) => !peer.is_online && !peer.registration_required).length} managed offline`,
          status: discoveryPeers.some((peer) => peer.registration_required) ? 'warning' : 'healthy',
        },
        {
          id: 'discovery-source-node',
          title: 'Telemetry Source',
          eyebrow: 'Host Context',
          metric: platformNodeIsRemote ? 'Remote context' : 'Local context',
          helper: platformNodeIsRemote
            ? `${discoverySourceLabel} is selected without launching remote probes`
            : `${discoverySourceLabel} is supplying the active peer-visibility perspective`,
          status: discoveryHealth,
        },
      ],
      tableColumns: [
        { key: 'peer', header: 'Peer' },
        { key: 'status', header: 'Status' },
        { key: 'metric1', header: 'Latency' },
        { key: 'metric2', header: 'Sources' },
        { key: 'alerts', header: 'Routing' },
      ] satisfies PlatformTableColumn[],
      tableRows: discoveryPeers.map((peer) => ({
        id: peer.node_id,
        peer: peer.hostname || peer.host || peer.node_id,
        status: !peer.is_online && !peer.registration_required
          ? 'critical'
          : peer.registration_required || !peer.routing_ready
            ? 'warning'
            : 'healthy',
        metric1: formatLatencyMs(peer.latency_ms),
        metric2: peer.discovery_sources.join(', ') || 'No sources',
        alerts: peer.routing_ready ? 'Ready' : peer.registration_required ? 'Registration required' : 'Gated',
      })),
      tableTitle: 'Network discovery telemetry',
      tableDescription: 'Peer visibility, latency, and routing-readiness context sourced from existing discovery and heartbeat telemetry.',
      notifications: discoveryNotifications,
    } satisfies PlatformLayerData

    const clusterLayer = {
      ...PLATFORM_LAYER_META[4],
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
          helper: `${discoveryPeers.length} visible peers`,
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
          helper: `${discoveryPeers.length} discovery peers · ${avbDiscoveredNodes.length} AVB peers`,
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
          metric: formatPercent(topologyNodes.reduce((sum, node) => sum + node.cpu_percent, 0) / Math.max(totalNodes, 1), 0),
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
      tableRows: topologyNodes.map((node) => ({
        id: node.node_id,
        node: node.display_label ? `${node.hostname} (${node.display_label})` : node.hostname,
        status: node.status,
        cpu: formatPercent(node.cpu_percent, 0),
        memory: formatPercent(node.memory_percent, 0),
        workloads: `${topologyAudioEdges.filter((edge) => edge.source_node_id === node.node_id || edge.dest_node_id === node.node_id).length} streams`,
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
      networkDiscoveryLayer,
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
    discoveryPeers,
    discoveryQuery.error,
    discoveryQuery.isLoading,
    deploymentMode,
    deploymentModeQuery.data,
    identityQuery.data,
    identityQuery.isLoading,
    localNode,
    networkQuery.data,
    observatorySchema.error,
    observatoryStatus,
    observatoryTraffic,
    onlineNodes,
    platformNode,
    platformNodeIsRemote,
    platformViewedNodeId,
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
    nodeVersion,
    nodeUpdateStatus,
    nodeHybridVersion,
    nodeBackupStatus,
    nodeHealthCheck,
    nodeDeployStatus,
    nodeRemediation,
    nodeManifestDrift,
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
