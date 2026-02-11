import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pipewireApi, getWsUrl } from '../../map2/api'
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
  // WebSocket real-time path with reconnection
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!useWs) return

    let reconnectAttempts = 0
    let reconnectTimeout: NodeJS.Timeout | null = null
    let mounted = true

    const connect = () => {
      if (!mounted) return

      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)
        reconnectAttempts = 0  // Reset on successful connection
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

      ws.onclose = () => {
        setIsConnected(false)
        wsRef.current = null
        
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        if (mounted) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
          reconnectAttempts++
          reconnectTimeout = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        setIsConnected(false)
        ws.close()  // Trigger onclose which will reconnect
      }
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [useWs])

  // ---------------------------------------------------------------
  // REST polling — always enabled for initial load + fallback
  // When WebSocket is active, polls slowly (every 5s) as a safety net.
  // When WebSocket is disabled, polls at the configured interval.
  // ---------------------------------------------------------------
  const pollingQuery = useQuery<PipeWireMetrics>({
    queryKey: ['pipewire-status'],
    queryFn: async () => {
      const data = await pipewireApi.getStatus()
      return data
    },
    refetchInterval: useWs ? 5000 : pollingInterval,
    enabled: true,
  })

  // If WebSocket has delivered data, prefer it (real-time).
  // Otherwise fall back to the REST query result.
  const wsHasData = useWs && metrics.daemon.running
  const current = wsHasData ? metrics : (pollingQuery.data ?? metrics)

  // ---------------------------------------------------------------
  // Mutations (quantum, rate, volume, mute)
  // ---------------------------------------------------------------
  const setQuantumMutation = useMutation({
    mutationFn: (quantum: number) => pipewireApi.setQuantum(quantum),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pipewire-status'] })
      // In WebSocket mode, force a refresh by briefly fetching
      if (useWs) {
        queryClient.refetchQueries({ queryKey: ['pipewire-status'] })
      }
    },
  })

  const setRateMutation = useMutation({
    mutationFn: (rate: number) => pipewireApi.setRate(rate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pipewire-status'] })
      if (useWs) {
        queryClient.refetchQueries({ queryKey: ['pipewire-status'] })
      }
    },
  })

  const setVolumeMutation = useMutation({
    mutationFn: ({ nodeId, volume }: { nodeId: number; volume: number }) =>
      pipewireApi.setVolume(nodeId, volume),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pipewire-status'] })
      if (useWs) {
        queryClient.refetchQueries({ queryKey: ['pipewire-status'] })
      }
    },
  })

  const setMuteMutation = useMutation({
    mutationFn: ({ nodeId, mute }: { nodeId: number; mute: boolean }) =>
      pipewireApi.setMute(nodeId, mute),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pipewire-status'] })
      if (useWs) {
        queryClient.refetchQueries({ queryKey: ['pipewire-status'] })
      }
    },
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
    quantumError: setQuantumMutation.error,
    setRate: setRateMutation.mutateAsync,
    isSettingRate: setRateMutation.isPending,
    rateError: setRateMutation.error,
    setVolume: (nodeId: number, volume: number) =>
      setVolumeMutation.mutateAsync({ nodeId, volume }),
    volumeError: setVolumeMutation.error,
    setMute: (nodeId: number, mute: boolean) =>
      setMuteMutation.mutateAsync({ nodeId, mute }),
    muteError: setMuteMutation.error,
  }
}
