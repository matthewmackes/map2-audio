/**
 * useLatency - React hook for audio latency monitoring
 *
 * Provides total and per-plugin latency information from the
 * JUCE audio engine for latency-aware monitoring.
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWsUrl, API_BASE } from '../../map2/api'
import { sanitizeRestrictedDisplayText } from '../../map2/displayNames'

export interface PluginLatency {
  pluginId: string | number
  latencySamples: number
  latencyMs: number
  pluginName?: string
}

export interface LatencyInfo {
  totalSamples: number
  totalMs: number
  breakdown: PluginLatency[]
  running: boolean
}

const DEFAULT_LATENCY: LatencyInfo = {
  totalSamples: 0,
  totalMs: 0,
  breakdown: [],
  running: false
}

interface UseLatencyOptions {
  /** Use WebSocket for real-time updates */
  useWebSocket?: boolean
  /** Polling interval in ms when not using WebSocket */
  pollingInterval?: number
  /** Warning threshold for latency in ms */
  warningThresholdMs?: number
}

export function useLatency(options: UseLatencyOptions = {}) {
  const {
    useWebSocket = true,
    pollingInterval = 1000, // 1fps - latency doesn't change often
    warningThresholdMs = 10
  } = options

  const [latency, setLatency] = useState<LatencyInfo>(DEFAULT_LATENCY)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // WebSocket-based real-time updates
  useEffect(() => {
    if (!useWebSocket) return

    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      // Subscribe to latency topic
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'latency' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'latency_update' && message.data) {
          const data: LatencyInfo = {
            totalSamples: message.data.total_samples || 0,
            totalMs: message.data.total_ms || 0,
            breakdown: (message.data.breakdown || []).map((item: any) => ({
              pluginId: item.plugin_id,
              latencySamples: item.latency_samples || 0,
              latencyMs: item.latency_ms || 0,
              pluginName: sanitizeRestrictedDisplayText(item.plugin_name)
            })),
            running: message.data.running ?? true
          }
          setLatency(data)
        }
      } catch (e) {
        console.error('Error parsing latency WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onerror = (error) => {
      console.error('Latency WebSocket error:', error)
      setIsConnected(false)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'latency' }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [useWebSocket])

  // Polling — always enabled for initial load + fallback
  const pollingQuery = useQuery<LatencyInfo>({
    queryKey: ['latency'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/engine/loudness/latency`)
      if (!res.ok) throw new Error('Failed to fetch latency')
      const data = await res.json()
      return {
        totalSamples: data.total_samples || 0,
        totalMs: data.total_ms || 0,
        breakdown: (data.breakdown || []).map((item: any) => ({
          pluginId: item.plugin_id,
          latencySamples: item.latency_samples || 0,
          latencyMs: item.latency_ms || 0,
          pluginName: sanitizeRestrictedDisplayText(item.plugin_name)
        })),
        running: true
      }
    },
    refetchInterval: useWebSocket ? 5000 : pollingInterval,
    enabled: true
  })

  const wsHasData = useWebSocket && latency.running
  const currentLatency = wsHasData
    ? latency
    : (pollingQuery.data || latency)

  // Calculate statistics
  const stats = useMemo(() => {
    const breakdown = currentLatency.breakdown
    if (breakdown.length === 0) {
      return {
        highestLatencyPlugin: null,
        averagePluginLatencyMs: 0,
        pluginCount: 0
      }
    }

    const sorted = [...breakdown].sort((a, b) => b.latencyMs - a.latencyMs)
    const totalPluginLatency = breakdown.reduce((sum, p) => sum + p.latencyMs, 0)

    return {
      highestLatencyPlugin: sorted[0],
      averagePluginLatencyMs: totalPluginLatency / breakdown.length,
      pluginCount: breakdown.length
    }
  }, [currentLatency])

  // Get latency for specific plugin
  const getPluginLatency = (pluginId: string | number) => {
    return currentLatency.breakdown.find(p =>
      String(p.pluginId) === String(pluginId)
    ) || null
  }

  // Status helpers
  const status = currentLatency.totalMs >= warningThresholdMs ? 'warning' : 'ok'
  const isHighLatency = currentLatency.totalMs >= warningThresholdMs

  // Format latency as string
  const formatLatency = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)} us`
    if (ms < 10) return `${ms.toFixed(2)} ms`
    return `${ms.toFixed(1)} ms`
  }

  return {
    latency: currentLatency,
    isConnected: useWebSocket ? isConnected : true,
    isLoading: !useWebSocket && pollingQuery.isLoading,
    isError: !useWebSocket && pollingQuery.isError,
    stats,
    getPluginLatency,
    status,
    isHighLatency,
    formatLatency,
    warningThresholdMs
  }
}

export default useLatency
