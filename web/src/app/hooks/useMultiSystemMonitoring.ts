/**
 * useMultiSystemMonitoring Hook - Manage monitoring for multiple host systems
 * Enables side-by-side comparison and aggregated metrics across all MAP2 services
 *
 * **WHO**: Cluster administrators, audio engineers, system operators
 * **WHAT**: Comprehensive multi-node monitoring for MAP2 Audio Platform clusters
 * **WHERE**: Deployed across distributed MAP2 nodes (on-premises, edge, cloud)
 * **WHEN**: Real-time monitoring with historical comparison capabilities
 *
 * This dashboard provides visibility into:
 * - JUCE Audio Engine performance (sample rate, buffer size, xruns, CPU load)
 * - Cluster Services health (mDNS discovery, RAFT consensus, health monitoring)
 * - AVB/TSN Network Audio (IEEE 1722 streams, gPTP sync, AVDECC entities)
 * - System Resources (CPU, memory, temperature, disk, network)
 * - Software Versions & Updates (backend, frontend, JUCE engine, dependencies)
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { HostMachineInfo, SystemHealthOverview, DiskHealthData } from '@/map2/types'

export interface AudioEngineStatus {
  isRunning: boolean
  sampleRate: number
  bufferSize: number
  inputChannels: number
  outputChannels: number
  cpuLoad: number
  xrunCount: number
  deviceName: string
  deviceType: 'JACK' | 'AVB' | 'ALSA' | 'Unknown'
}

export interface ClusterServiceStatus {
  mdnsDiscovery: { enabled: boolean; status: 'active' | 'inactive' | 'error' }
  raftConsensus: { enabled: boolean; role: 'leader' | 'follower' | 'candidate' | 'offline' }
  healthMonitor: { enabled: boolean; status: 'active' | 'inactive' | 'error' }
  configDistributor: { enabled: boolean; status: 'active' | 'inactive' | 'error' }
  eventProducer: { enabled: boolean; status: 'active' | 'inactive' | 'error' }
}

export interface AvbNetworkStatus {
  enabled: boolean
  ptpSynced: boolean
  ptpOffsetNs: number
  discoveredEntities: number
  activeStreams: { talker: number; listener: number }
  interfaceName: string
  linkSpeed: string
}

export interface VersionInfo {
  backend: string
  frontend: string
  juceEngine: string
  pythonVersion: string
  lastUpdateCheck: number
}

export interface SystemSnapshot {
  systemId: string
  systemName: string
  hostInfo: HostMachineInfo | null
  health: SystemHealthOverview | null
  disk: DiskHealthData | null
  audioEngine: AudioEngineStatus | null
  clusterServices: ClusterServiceStatus | null
  avbNetwork: AvbNetworkStatus | null
  versionInfo: VersionInfo | null
  isConnected: boolean
  lastUpdate: number
  status: 'online' | 'offline' | 'error'
  errorMessage?: string
}

export interface SystemComparison {
  metric: string
  values: Record<string, number>
  unit: string
  highest: { systemId: string; value: number }
  lowest: { systemId: string; value: number }
  average: number
}

export interface MultiSystemStats {
  totalSystems: number
  onlineSystems: number
  offlineSystems: number
  criticalAlerts: number
  warningAlerts: number
  avgCpuUsage: number
  avgMemoryUsage: number
  avgDiskUsage: number
  avgAudioCpuLoad: number
  totalXruns: number
  avbNodesActive: number
  ptpSyncedNodes: number
  raftLeaders: number
  totalAvbStreams: number
}

interface ClusterNodePayload {
  id?: string
  node_id?: string
  hostname?: string
  status?: string
  role?: string
  version?: string
  metadata?: unknown
}

interface ClusterMetricPayload {
  node_id?: string
  timestamp?: string | number
  cpu_percent?: number
  memory_percent?: number
  dsp_load_percent?: number
  xrun_count?: number
  latency_ms?: number
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function parseMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata === 'string') {
    try {
      return asRecord(JSON.parse(metadata))
    } catch {
      return {}
    }
  }
  return asRecord(metadata)
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const ts = Date.parse(value)
    if (Number.isFinite(ts)) return ts
  }
  return 0
}

function mapStatus(value: unknown): 'online' | 'offline' | 'error' {
  const status = toStringValue(value, 'offline').toLowerCase()
  if (status === 'online' || status === 'healthy') return 'online'
  if (status === 'offline' || status === 'failed') return 'offline'
  return 'error'
}

/**
 * Hook for managing multiple system monitoring
 */
export function useMultiSystemMonitoring() {
  const [systems, setSystems] = useState<Record<string, SystemSnapshot>>({})

  const { data: clusterNodesPayload } = useQuery({
    queryKey: ['cluster', 'nodes', 'multi-system-monitoring'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/nodes')
      if (!res.ok) throw new Error('Failed to fetch cluster nodes')
      return res.json()
    },
    refetchInterval: 5000,
    staleTime: 3000,
  })

  const { data: clusterMetricsPayload } = useQuery({
    queryKey: ['cluster', 'metrics', 'multi-system-monitoring'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/metrics')
      if (!res.ok) throw new Error('Failed to fetch cluster metrics')
      return res.json()
    },
    refetchInterval: 5000,
    staleTime: 3000,
  })

  useEffect(() => {
    const nodeRecords = Array.isArray(clusterNodesPayload?.nodes)
      ? (clusterNodesPayload.nodes as ClusterNodePayload[])
      : []

    if (nodeRecords.length === 0) return

    const metricRecords = Array.isArray(clusterMetricsPayload?.metrics)
      ? (clusterMetricsPayload.metrics as ClusterMetricPayload[])
      : []

    const latestMetricByNode = new Map<string, ClusterMetricPayload>()
    metricRecords.forEach(metric => {
      const nodeId = toStringValue(metric.node_id)
      if (!nodeId) return
      const prev = latestMetricByNode.get(nodeId)
      if (!prev || parseTimestamp(metric.timestamp) >= parseTimestamp(prev.timestamp)) {
        latestMetricByNode.set(nodeId, metric)
      }
    })

    const discoveredSystems: Record<string, SystemSnapshot> = {}
    nodeRecords.forEach((node, index) => {
      const systemId = toStringValue(node.id, toStringValue(node.node_id, `node-${index + 1}`))
      if (!systemId) return

      const metadata = parseMetadata(node.metadata)
      const metric = latestMetricByNode.get(systemId)
      const status = mapStatus(node.status)
      const role = toStringValue(node.role, 'AUDIO-NODE').toUpperCase()
      const cpuUsage = toNumber(metric?.cpu_percent, 0)
      const memoryUsage = toNumber(metric?.memory_percent, 0)
      const dspUsage = toNumber(metric?.dsp_load_percent, 0)
      const xrunCount = Math.max(0, Math.round(toNumber(metric?.xrun_count, 0)))
      const latencyMs = toNumber(metric?.latency_ms, 0)

      const health: SystemHealthOverview = {
        cpu_temp_celsius: toNumber(
          metadata.cpu_temp_celsius,
          toNumber((metadata as { temperature?: { cpu_c?: number } }).temperature?.cpu_c, 0)
        ),
        max_temp_celsius: toNumber(
          metadata.max_temp_celsius,
          toNumber((metadata as { temperature?: { max_c?: number } }).temperature?.max_c, 0)
        ),
        cpu_usage_percent: cpuUsage,
        memory_usage_percent: memoryUsage,
        fans: [],
        power: { power_status: 'unknown' },
        overall_health: status === 'online' ? 'good' : status === 'error' ? 'warning' : 'critical',
        health_details: {
          temperature_status: 'unknown',
          fan_status: 'unknown',
          power_status: 'unknown',
        },
      }

      const diskUsePercent = toNumber(
        metadata.disk_use_percent,
        toNumber(metadata.storage_use_percent, toNumber(metadata.disk_usage_percent, 0))
      )
      const disk: DiskHealthData | null =
        diskUsePercent > 0
          ? {
              disks: [],
              use_percent: diskUsePercent,
              overall_health:
                diskUsePercent > 90 ? 'critical' : diskUsePercent > 80 ? 'warning' : 'good',
            }
          : null

      const deviceTypeRaw = toStringValue(metadata.device_type, 'Unknown').toUpperCase()
      const deviceType: AudioEngineStatus['deviceType'] =
        deviceTypeRaw === 'JACK' || deviceTypeRaw === 'AVB' || deviceTypeRaw === 'ALSA'
          ? deviceTypeRaw
          : 'Unknown'

      const audioEngine: AudioEngineStatus | null =
        role.includes('AUDIO') || role === 'ALL-IN-ONE'
          ? {
              isRunning: status === 'online',
              sampleRate: Math.round(toNumber(metadata.sample_rate, 48000)),
              bufferSize: Math.round(toNumber(metadata.buffer_size, 256)),
              inputChannels: Math.round(toNumber(metadata.input_channels, 2)),
              outputChannels: Math.round(toNumber(metadata.output_channels, 2)),
              cpuLoad: dspUsage,
              xrunCount,
              deviceName: toStringValue(metadata.audio_device, 'Audio Device'),
              deviceType,
            }
          : null

      const serviceStatus: ClusterServiceStatus['mdnsDiscovery']['status'] =
        status === 'online' ? 'active' : status === 'error' ? 'error' : 'inactive'
      const raftRoleRaw = toStringValue(metadata.raft_role).toLowerCase()
      const raftRole: ClusterServiceStatus['raftConsensus']['role'] =
        raftRoleRaw === 'leader' || raftRoleRaw === 'follower' || raftRoleRaw === 'candidate'
          ? raftRoleRaw
          : status === 'offline'
            ? 'offline'
            : role.includes('MANAGEMENT')
              ? 'follower'
              : 'offline'

      const clusterServices: ClusterServiceStatus = {
        mdnsDiscovery: { enabled: true, status: serviceStatus },
        raftConsensus: { enabled: role.includes('MANAGEMENT'), role: raftRole },
        healthMonitor: { enabled: true, status: serviceStatus },
        configDistributor: { enabled: role.includes('MANAGEMENT'), status: serviceStatus },
        eventProducer: { enabled: true, status: serviceStatus },
      }

      const avbEnabled =
        Boolean(metadata.avb_enabled) ||
        Boolean(metadata.tsn_configured) ||
        deviceType === 'AVB'

      const avbNetwork: AvbNetworkStatus | null = avbEnabled
        ? {
            enabled: true,
            ptpSynced: Boolean(metadata.ptp_synced),
            ptpOffsetNs: Math.round(toNumber(metadata.ptp_offset_ns, 0)),
            discoveredEntities: Math.round(toNumber(metadata.avdecc_entities, 0)),
            activeStreams: {
              talker: Math.round(toNumber(metadata.talker_streams, 0)),
              listener: Math.round(toNumber(metadata.listener_streams, 0)),
            },
            interfaceName: toStringValue(metadata.avb_interface, toStringValue(metadata.interface, 'eth0')),
            linkSpeed: toStringValue(metadata.link_speed, 'unknown'),
          }
        : null

      const versionInfo: VersionInfo = {
        backend: toStringValue(node.version, toStringValue(metadata.backend_version, 'unknown')),
        frontend: toStringValue(metadata.frontend_version, 'unknown'),
        juceEngine: toStringValue(metadata.juce_version, 'unknown'),
        pythonVersion: toStringValue(metadata.python_version, 'unknown'),
        lastUpdateCheck: Date.now(),
      }

      discoveredSystems[systemId] = {
        systemId,
        systemName: toStringValue(node.hostname, systemId),
        hostInfo: null,
        health,
        disk,
        audioEngine,
        clusterServices,
        avbNetwork,
        versionInfo,
        isConnected: status === 'online',
        lastUpdate: Date.now(),
        status,
        errorMessage: status === 'error' ? `Node ${systemId} is degraded` : undefined,
      }

      // Keep latency visible via metadata for future views.
      if (latencyMs > 0 && discoveredSystems[systemId].health) {
        discoveredSystems[systemId].health = {
          ...discoveredSystems[systemId].health!,
          health_details: {
            ...discoveredSystems[systemId].health!.health_details,
            power_status: `${latencyMs.toFixed(1)}ms latency`,
          },
        }
      }
    })

    setSystems(prev => {
      const next = { ...prev }
      Object.entries(discoveredSystems).forEach(([id, snapshot]) => {
        next[id] = snapshot
      })
      return next
    })
  }, [clusterNodesPayload, clusterMetricsPayload])

  /**
   * Add or update a system in the monitoring list
   */
  const addSystem = useCallback(
    (systemId: string, systemName: string, initialData?: Partial<SystemSnapshot>) => {
      setSystems((prev) => ({
        ...prev,
        [systemId]: {
          systemId,
          systemName,
          hostInfo: initialData?.hostInfo || null,
          health: initialData?.health || null,
          disk: initialData?.disk || null,
          audioEngine: initialData?.audioEngine || null,
          clusterServices: initialData?.clusterServices || null,
          avbNetwork: initialData?.avbNetwork || null,
          versionInfo: initialData?.versionInfo || null,
          isConnected: initialData?.isConnected ?? false,
          lastUpdate: Date.now(),
          status: initialData?.status || 'offline',
          errorMessage: initialData?.errorMessage,
        },
      }))
    },
    []
  )

  /**
   * Update system data
   */
  const updateSystem = useCallback(
    (systemId: string, updates: Partial<SystemSnapshot>) => {
      setSystems((prev) => ({
        ...prev,
        [systemId]: {
          ...(prev[systemId] || {
            systemId,
            systemName: systemId,
            hostInfo: null,
            health: null,
            disk: null,
            audioEngine: null,
            clusterServices: null,
            avbNetwork: null,
            versionInfo: null,
            isConnected: false,
            lastUpdate: Date.now(),
            status: 'offline' as const,
          }),
          ...updates,
          lastUpdate: Date.now(),
        },
      }))
    },
    []
  )

  /**
   * Remove a system from monitoring
   */
  const removeSystem = useCallback((systemId: string) => {
    setSystems((prev) => {
      const updated = { ...prev }
      delete updated[systemId]
      return updated
    })
  }, [])

  /**
   * Get all systems
   */
  const getSystems = useCallback(() => Object.values(systems), [systems])

  /**
   * Get a specific system
   */
  const getSystem = useCallback((systemId: string) => systems[systemId], [systems])

  /**
   * Calculate comparison metrics
   */
  const getComparisons = useCallback((): SystemComparison[] => {
    const comparisons: SystemComparison[] = []

    const systemList = Object.values(systems)
    if (systemList.length === 0) return []

    // CPU Usage Comparison
    const cpuValues: Record<string, number> = {}
    systemList.forEach((sys) => {
      if (sys.health) {
        cpuValues[sys.systemId] = sys.health.cpu_usage_percent
      }
    })

    if (Object.keys(cpuValues).length > 0) {
      const values = Object.values(cpuValues)
      comparisons.push({
        metric: 'CPU Usage',
        values: cpuValues,
        unit: '%',
        highest: {
          systemId: Object.entries(cpuValues).sort(([, a], [, b]) => b - a)[0][0],
          value: Math.max(...values),
        },
        lowest: {
          systemId: Object.entries(cpuValues).sort(([, a], [, b]) => a - b)[0][0],
          value: Math.min(...values),
        },
        average: values.reduce((a, b) => a + b, 0) / values.length,
      })
    }

    // Memory Usage Comparison
    const memValues: Record<string, number> = {}
    systemList.forEach((sys) => {
      if (sys.health) {
        memValues[sys.systemId] = sys.health.memory_usage_percent
      }
    })

    if (Object.keys(memValues).length > 0) {
      const values = Object.values(memValues)
      comparisons.push({
        metric: 'Memory Usage',
        values: memValues,
        unit: '%',
        highest: {
          systemId: Object.entries(memValues).sort(([, a], [, b]) => b - a)[0][0],
          value: Math.max(...values),
        },
        lowest: {
          systemId: Object.entries(memValues).sort(([, a], [, b]) => a - b)[0][0],
          value: Math.min(...values),
        },
        average: values.reduce((a, b) => a + b, 0) / values.length,
      })
    }

    // Temperature Comparison
    const tempValues: Record<string, number> = {}
    systemList.forEach((sys) => {
      if (sys.health) {
        tempValues[sys.systemId] = sys.health.cpu_temp_celsius
      }
    })

    if (Object.keys(tempValues).length > 0) {
      const values = Object.values(tempValues)
      comparisons.push({
        metric: 'Temperature',
        values: tempValues,
        unit: '°C',
        highest: {
          systemId: Object.entries(tempValues).sort(([, a], [, b]) => b - a)[0][0],
          value: Math.max(...values),
        },
        lowest: {
          systemId: Object.entries(tempValues).sort(([, a], [, b]) => a - b)[0][0],
          value: Math.min(...values),
        },
        average: values.reduce((a, b) => a + b, 0) / values.length,
      })
    }

    return comparisons
  }, [systems])

  /**
   * Calculate aggregated statistics
   */
  const getStats = useCallback((): MultiSystemStats => {
    const systemList = Object.values(systems)

    const onlineSystems = systemList.filter((s) => s.isConnected).length
    const offlineSystems = systemList.length - onlineSystems

    const healthySystems = systemList.filter((s) => s.health)
    const avgCpuUsage =
      healthySystems.length > 0
        ? healthySystems.reduce((sum, s) => sum + (s.health?.cpu_usage_percent || 0), 0) /
          healthySystems.length
        : 0

    const avgMemoryUsage =
      healthySystems.length > 0
        ? healthySystems.reduce((sum, s) => sum + (s.health?.memory_usage_percent || 0), 0) /
          healthySystems.length
        : 0

    const diskSystems = systemList.filter((s) => s.disk)
    const avgDiskUsage =
      diskSystems.length > 0
        ? diskSystems.reduce((sum, s) => sum + (s.disk?.use_percent || 0), 0) / diskSystems.length
        : 0

    // Audio Engine Statistics
    const audioSystems = systemList.filter((s) => s.audioEngine?.isRunning)
    const avgAudioCpuLoad =
      audioSystems.length > 0
        ? audioSystems.reduce((sum, s) => sum + (s.audioEngine?.cpuLoad || 0), 0) /
          audioSystems.length
        : 0
    const totalXruns = systemList.reduce((sum, s) => sum + (s.audioEngine?.xrunCount || 0), 0)

    // AVB Network Statistics
    const avbSystems = systemList.filter((s) => s.avbNetwork?.enabled)
    const avbNodesActive = avbSystems.length
    const ptpSyncedNodes = systemList.filter((s) => s.avbNetwork?.ptpSynced).length
    const totalAvbStreams = systemList.reduce(
      (sum, s) =>
        sum + (s.avbNetwork?.activeStreams.talker || 0) + (s.avbNetwork?.activeStreams.listener || 0),
      0
    )

    // Cluster Statistics
    const raftLeaders = systemList.filter(
      (s) => s.clusterServices?.raftConsensus.role === 'leader'
    ).length

    return {
      totalSystems: systemList.length,
      onlineSystems,
      offlineSystems,
      criticalAlerts: 0, // Would be calculated from alert history
      warningAlerts: 0, // Would be calculated from alert history
      avgCpuUsage: Math.round(avgCpuUsage * 10) / 10,
      avgMemoryUsage: Math.round(avgMemoryUsage * 10) / 10,
      avgDiskUsage: Math.round(avgDiskUsage * 10) / 10,
      avgAudioCpuLoad: Math.round(avgAudioCpuLoad * 10) / 10,
      totalXruns,
      avbNodesActive,
      ptpSyncedNodes,
      raftLeaders,
      totalAvbStreams,
    }
  }, [systems])

  /**
   * Get systems sorted by metric (for ranking)
   */
  const getSystemsRankedBy = useCallback(
    (metric: 'cpu' | 'memory' | 'temperature' | 'disk'): SystemSnapshot[] => {
      const systemList = Object.values(systems)

      return systemList.sort((a, b) => {
        switch (metric) {
          case 'cpu':
            return (b.health?.cpu_usage_percent || 0) - (a.health?.cpu_usage_percent || 0)
          case 'memory':
            return (b.health?.memory_usage_percent || 0) - (a.health?.memory_usage_percent || 0)
          case 'temperature':
            return (b.health?.cpu_temp_celsius || 0) - (a.health?.cpu_temp_celsius || 0)
          case 'disk':
            return (b.disk?.use_percent || 0) - (a.disk?.use_percent || 0)
          default:
            return 0
        }
      })
    },
    [systems]
  )

  /**
   * Export comparison data as CSV
   */
  const exportComparison = useCallback((): string => {
    const comparisons = getComparisons()
    const systemList = Object.values(systems)

    if (systemList.length === 0) return ''

    let csv = 'Multi-System Comparison Report\n'
    csv += `Generated: ${new Date().toLocaleString()}\n\n`

    // Aggregated Stats
    const stats = getStats()
    csv += 'AGGREGATED STATISTICS\n'
    csv += `Total Systems,${stats.totalSystems}\n`
    csv += `Online,${stats.onlineSystems}\n`
    csv += `Offline,${stats.offlineSystems}\n`
    csv += `Avg CPU Usage,${stats.avgCpuUsage}%\n`
    csv += `Avg Memory Usage,${stats.avgMemoryUsage}%\n`
    csv += `Avg Disk Usage,${stats.avgDiskUsage}%\n\n`

    // Comparison Tables
    comparisons.forEach((comparison) => {
      csv += `${comparison.metric} (${comparison.unit})\n`
      csv += 'System,Value,Rank\n'

      const sorted = Object.entries(comparison.values).sort(([, a], [, b]) => b - a)
      sorted.forEach(([systemId, value], index) => {
        const systemName = systemList.find((s) => s.systemId === systemId)?.systemName || systemId
        csv += `${systemName},${value.toFixed(1)},${index + 1}\n`
      })
      csv += `Highest,${comparison.highest.value.toFixed(1)}\n`
      csv += `Lowest,${comparison.lowest.value.toFixed(1)}\n`
      csv += `Average,${comparison.average.toFixed(1)}\n\n`
    })

    return csv
  }, [systems, getComparisons, getStats])

  return {
    systems: getSystems(),
    addSystem,
    updateSystem,
    removeSystem,
    getSystem,
    getComparisons,
    getStats,
    getSystemsRankedBy,
    exportComparison,
  }
}
