import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pipewireApi } from '../../map2/api'
import type {
  PipeWireMetrics,
  PipeWireAlert,
  PipeWireNodeInfo,
  PipeWireSettings,
} from '../../map2/types'

// ============================================================================
// Default state
// ============================================================================

const DEFAULT_METRICS: PipeWireMetrics = {
  daemon: {
    running: false, version: '', name: '', hostname: '', cookie: '',
    uptime_seconds: 0,
  },
  settings: {
    clock_rate: 48000, clock_force_rate: 0, clock_quantum: 1024,
    clock_force_quantum: 0, clock_min_quantum: 32, clock_max_quantum: 2048,
    clock_allowed_rates: [48000],
  },
  default_sink: null,
  default_source: null,
  devices: [],
  nodes: [],
  streams: [],
  links: [],
  client_count: 0,
  xruns: 0,
  graph_latency_ms: 0,
  driver_latency_ms: 0,
  total_latency_ms: 0,
  alerts: [],
  timestamp: '',
}

// ============================================================================
// Hook options
// ============================================================================

interface UsePipeWireOptions {
  /** Use WebSocket for real-time updates (default: true) */
  useWebSocket?: boolean
  /** Polling interval in ms when WebSocket is disabled (default: 2000) */
  pollingInterval?: number
  /** Latency warning threshold in ms (default: 20) */
  latencyWarningMs?: number
}

// ============================================================================
// Hook
// ============================================================================

export function usePipeWire(options: UsePipeWireOptions = {}) {
  const {
    useWebSocket: useWs = true,
    pollingInterval = 2000,
    latencyWarningMs = 20,
  } = options

  const [metrics, setMetrics] = useState<PipeWireMetrics>(DEFAULT_METRICS)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()

  // ---------------------------------------------------------------
  // WebSocket real-time path
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!useWs) return

    const ws = new WebSocket(`ws://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'pipewire' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'pipewire_metrics' && message.data) {
          setMetrics(message.data as PipeWireMetrics)
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => setIsConnected(false)

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [useWs])

  // ---------------------------------------------------------------
  // Polling fallback via react-query
  // ---------------------------------------------------------------
  const pollingQuery = useQuery<PipeWireMetrics>({
    queryKey: ['pipewire-status'],
    queryFn: async () => {
      const data = await pipewireApi.getStatus()
      return data
    },
    refetchInterval: useWs ? false : pollingInterval,
    enabled: !useWs,
  })

  const current = useWs ? metrics : (pollingQuery.data ?? DEFAULT_METRICS)

  // ---------------------------------------------------------------
  // Mutations (quantum, rate, volume, mute)
  // ---------------------------------------------------------------
  const setQuantumMutation = useMutation({
    mutationFn: (quantum: number) => pipewireApi.setQuantum(quantum),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipewire-status'] }),
  })

  const setRateMutation = useMutation({
    mutationFn: (rate: number) => pipewireApi.setRate(rate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipewire-status'] }),
  })

  const setVolumeMutation = useMutation({
    mutationFn: ({ nodeId, volume }: { nodeId: number; volume: number }) =>
      pipewireApi.setVolume(nodeId, volume),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipewire-status'] }),
  })

  const setMuteMutation = useMutation({
    mutationFn: ({ nodeId, mute }: { nodeId: number; mute: boolean }) =>
      pipewireApi.setMute(nodeId, mute),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipewire-status'] }),
  })

  // ---------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------
  const isDaemonRunning = current.daemon.running
  const hasDevices = current.devices.length > 0
  const hasXruns = current.xruns > 0
  const isHighLatency = current.total_latency_ms > latencyWarningMs

  const errorAlerts = current.alerts.filter((a: PipeWireAlert) => a.severity === 'error')
  const warningAlerts = current.alerts.filter((a: PipeWireAlert) => a.severity === 'warning')

  const overallStatus: 'ok' | 'warning' | 'error' | 'offline' =
    !isDaemonRunning ? 'offline'
    : errorAlerts.length > 0 ? 'error'
    : warningAlerts.length > 0 ? 'warning'
    : 'ok'

  const effectiveQuantum = current.settings.clock_force_quantum || current.settings.clock_quantum
  const effectiveRate = current.settings.clock_force_rate || current.settings.clock_rate

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------
  return {
    // Full snapshot
    metrics: current,

    // Connection state
    isConnected: useWs ? isConnected : !pollingQuery.isError,
    isLoading: useWs ? false : pollingQuery.isLoading,

    // Daemon
    isDaemonRunning,
    daemonVersion: current.daemon.version,

    // Topology
    devices: current.devices,
    nodes: current.nodes,
    streams: current.streams,
    links: current.links,
    clientCount: current.client_count,
    defaultSink: current.default_sink,
    defaultSource: current.default_source,

    // Latency
    graphLatencyMs: current.graph_latency_ms,
    driverLatencyMs: current.driver_latency_ms,
    totalLatencyMs: current.total_latency_ms,
    isHighLatency,

    // Settings
    settings: current.settings,
    effectiveQuantum,
    effectiveRate,

    // Health
    xruns: current.xruns,
    hasXruns,
    alerts: current.alerts,
    overallStatus,

    // Mutations
    setQuantum: setQuantumMutation.mutateAsync,
    isSettingQuantum: setQuantumMutation.isPending,
    setRate: setRateMutation.mutateAsync,
    isSettingRate: setRateMutation.isPending,
    setVolume: (nodeId: number, volume: number) =>
      setVolumeMutation.mutateAsync({ nodeId, volume }),
    setMute: (nodeId: number, mute: boolean) =>
      setMuteMutation.mutateAsync({ nodeId, mute }),
  }
}
