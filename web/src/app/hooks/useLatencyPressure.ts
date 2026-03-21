import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { type LatencyJitterStats, latencyV2Api } from '../../map2/api'
import { clusterScopeKey } from '../utils/clusterTransport'
import { computeLatencyPressure } from '../utils/latencyPressure'
import { useCPUMetrics } from './useCPUMetrics'
import { usePipeWire } from './usePipeWire'

interface UseLatencyPressureOptions {
  nodeId?: string | null
  useWebSocket?: boolean
}

export function useLatencyPressure(options: UseLatencyPressureOptions = {}) {
  const {
    nodeId,
    useWebSocket = true,
  } = options
  const scopeKey = clusterScopeKey(nodeId)
  const queryClient = useQueryClient()
  const pipewire = usePipeWire({ nodeId, useWebSocket, pollingInterval: 1000 })
  const cpu = useCPUMetrics({ nodeId, useWebSocket, pollingInterval: 1000 })

  const jitterQuery = useQuery<LatencyJitterStats>({
    queryKey: ['latency-jitter-stats', scopeKey],
    queryFn: () => latencyV2Api.getJitterStats(nodeId),
    refetchInterval: 1000,
    staleTime: 500,
  })

  const resetMutation = useMutation({
    mutationFn: () => latencyV2Api.resetXruns(nodeId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['latency-jitter-stats', scopeKey] }),
        queryClient.invalidateQueries({ queryKey: ['cpu-metrics', scopeKey] }),
        queryClient.invalidateQueries({ queryKey: ['pipewire-status', scopeKey] }),
      ])
    },
  })

  const analysis = useMemo(() => {
    const hasPipeWireSignal = pipewire.isDaemonRunning ||
      pipewire.totalLatencyMs > 0 ||
      pipewire.graphLatencyMs > 0 ||
      pipewire.driverLatencyMs > 0 ||
      pipewire.devices.length > 0 ||
      pipewire.links.length > 0 ||
      pipewire.streams.length > 0
    const hasCpuSignal = cpu.metrics.running ||
      cpu.metrics.budgetMs > 0 ||
      cpu.metrics.currentCallbackMs > 0 ||
      cpu.metrics.totalCpuPercent > 0 ||
      cpu.metrics.xrunCount > 0
    const jitterStats = jitterQuery.data ?? null
    const running = jitterStats?.running === false
      ? false
      : hasPipeWireSignal
        ? pipewire.isDaemonRunning
        : hasCpuSignal
          ? cpu.metrics.running
          : null
    const fallbackBudgetMs = hasPipeWireSignal && pipewire.effectiveRate > 0
      ? (pipewire.effectiveQuantum / pipewire.effectiveRate) * 1000
      : null

    return computeLatencyPressure({
      running,
      totalLatencyMs: hasPipeWireSignal ? pipewire.totalLatencyMs : null,
      rtlP95Ms: jitterStats?.rtl_p95_ms ?? (hasPipeWireSignal ? pipewire.totalLatencyMs : null),
      jitterP95Ms: jitterStats?.p95_ms ?? null,
      xrunCount: jitterStats
        ? jitterStats.xrun_count
        : hasCpuSignal || hasPipeWireSignal
          ? Math.max(cpu.metrics.xrunCount, pipewire.xruns)
          : null,
      callbackBudgetMs: hasCpuSignal
        ? (cpu.metrics.budgetMs > 0 ? cpu.metrics.budgetMs : fallbackBudgetMs)
        : null,
      currentCallbackMs: hasCpuSignal ? cpu.metrics.currentCallbackMs : null,
      headroomPercent: hasCpuSignal ? cpu.metrics.headroomPercent : null,
    })
  }, [
    cpu.metrics.budgetMs,
    cpu.metrics.currentCallbackMs,
    cpu.metrics.headroomPercent,
    cpu.metrics.running,
    cpu.metrics.totalCpuPercent,
    cpu.metrics.xrunCount,
    jitterQuery.data,
    pipewire.devices.length,
    pipewire.driverLatencyMs,
    pipewire.effectiveQuantum,
    pipewire.effectiveRate,
    pipewire.graphLatencyMs,
    pipewire.isDaemonRunning,
    pipewire.links.length,
    pipewire.streams.length,
    pipewire.totalLatencyMs,
    pipewire.xruns,
  ])

  const helperText = useMemo(() => {
    if (!analysis.isAvailable) {
      return 'Waiting for realtime telemetry.'
    }

    const parts = [`Score ${analysis.scoreDisplay}/10`]

    if (analysis.inputs.effectiveLatencyMs != null) {
      parts.push(`RTL p95 ${analysis.inputs.effectiveLatencyMs.toFixed(2)} ms`)
    }

    if (analysis.inputs.jitterP95Ms != null) {
      parts.push(`Jitter p95 ${analysis.inputs.jitterP95Ms.toFixed(3)} ms`)
    }

    if (analysis.inputs.callbackLoadPercent != null) {
      parts.push(`Callback ${analysis.inputs.callbackLoadPercent}% of budget`)
    }

    if ((analysis.inputs.xrunCount ?? 0) > 0) {
      parts.push(`${analysis.inputs.xrunCount} xruns`)
    }

    return parts.join(' · ')
  }, [analysis])

  return {
    ...analysis,
    cpuMetrics: cpu.metrics,
    pipewire,
    jitterStats: jitterQuery.data ?? null,
    helperText,
    isLoading: !analysis.isAvailable && jitterQuery.isLoading,
    isResetting: resetMutation.isPending,
    resetXruns: () => resetMutation.mutateAsync(),
  }
}

export default useLatencyPressure
