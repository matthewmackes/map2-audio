/**
 * useCPUMetrics - React hook for real-time CPU monitoring data
 *
 * Provides CPU usage metrics from the JUCE audio engine for
 * performance monitoring and optimization.
 */

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWsUrl, API_BASE } from '../../map2/api'

export interface CPUMetrics {
  totalCpuPercent: number
  audioCallbackPercent: number
  peakCpuPercent: number
  averageCpuPercent: number
  xrunCount: number
  budgetMs: number
  currentCallbackMs: number
  headroomPercent: number
  perPluginPercent: Record<string, number>
  running: boolean
}

const DEFAULT_CPU_METRICS: CPUMetrics = {
  totalCpuPercent: 0,
  audioCallbackPercent: 0,
  peakCpuPercent: 0,
  averageCpuPercent: 0,
  xrunCount: 0,
  budgetMs: 0,
  currentCallbackMs: 0,
  headroomPercent: 100,
  perPluginPercent: {},
  running: false
}

interface UseCPUMetricsOptions {
  /** Use WebSocket for real-time updates */
  useWebSocket?: boolean
  /** Polling interval in ms when not using WebSocket */
  pollingInterval?: number
  /** Warning threshold for CPU usage (percentage) */
  warningThreshold?: number
  /** Critical threshold for CPU usage (percentage) */
  criticalThreshold?: number
}

export function useCPUMetrics(options: UseCPUMetricsOptions = {}) {
  const {
    useWebSocket = true,
    pollingInterval = 500, // 2fps
    warningThreshold = 70,
    criticalThreshold = 90
  } = options

  const [metrics, setMetrics] = useState<CPUMetrics>(DEFAULT_CPU_METRICS)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // WebSocket-based real-time updates
  useEffect(() => {
    if (!useWebSocket) return

    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      // Subscribe to CPU topic
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'cpu' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'cpu_update' && message.data) {
          const data: CPUMetrics = {
            totalCpuPercent: message.data.total_cpu_percent || 0,
            audioCallbackPercent: message.data.audio_callback_percent || 0,
            peakCpuPercent: message.data.peak_cpu_percent || 0,
            averageCpuPercent: message.data.average_cpu_percent || 0,
            xrunCount: message.data.xrun_count || 0,
            budgetMs: message.data.budget_ms || 0,
            currentCallbackMs: message.data.current_callback_ms || 0,
            headroomPercent: message.data.headroom_percent || 100,
            perPluginPercent: message.data.per_plugin_percent || {},
            running: message.data.running ?? true
          }
          setMetrics(data)
        }
      } catch (e) {
        console.error('Error parsing CPU WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onerror = (error) => {
      console.error('CPU WebSocket error:', error)
      setIsConnected(false)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'cpu' }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [useWebSocket])

  // Polling — always enabled for initial load + fallback
  const pollingQuery = useQuery<CPUMetrics>({
    queryKey: ['cpu-metrics'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/engine/cpu`)
      if (!res.ok) throw new Error('Failed to fetch CPU metrics')
      const data = await res.json()
      return {
        totalCpuPercent: data.total_cpu_percent || 0,
        audioCallbackPercent: data.audio_callback_percent || 0,
        peakCpuPercent: data.peak_cpu_percent || 0,
        averageCpuPercent: data.average_cpu_percent || 0,
        xrunCount: data.xrun_count || 0,
        budgetMs: data.budget_ms || 0,
        currentCallbackMs: data.current_callback_ms || 0,
        headroomPercent: data.headroom_percent || 100,
        perPluginPercent: data.per_plugin_percent || {},
        running: data.running ?? true
      }
    },
    refetchInterval: useWebSocket ? 5000 : pollingInterval,
    enabled: true
  })

  const wsHasData = useWebSocket && metrics.running
  const currentMetrics = wsHasData
    ? metrics
    : (pollingQuery.data || metrics)

  // Status helpers
  const status = currentMetrics.totalCpuPercent >= criticalThreshold
    ? 'critical'
    : currentMetrics.totalCpuPercent >= warningThreshold
      ? 'warning'
      : 'ok'

  const hasXruns = currentMetrics.xrunCount > 0

  // Get CPU for specific plugin
  const getPluginCpu = (instanceId: string | number) => {
    return currentMetrics.perPluginPercent[String(instanceId)] || 0
  }

  // Get top CPU consumers
  const getTopConsumers = (limit = 5) => {
    return Object.entries(currentMetrics.perPluginPercent)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([pluginId, cpu]) => ({ pluginId, cpu }))
  }

  return {
    metrics: currentMetrics,
    isConnected: useWebSocket ? isConnected : true,
    isLoading: !useWebSocket && pollingQuery.isLoading,
    isError: !useWebSocket && pollingQuery.isError,
    status,
    hasXruns,
    getPluginCpu,
    getTopConsumers,
    warningThreshold,
    criticalThreshold
  }
}

export default useCPUMetrics
