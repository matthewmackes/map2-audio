/**
 * useDynamics - React hook for dynamics processor control and real-time metering
 *
 * Provides control and metering for Compressor, Limiter, and Noise Gate
 * from the JUCE audio engine.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWsUrl } from '../../map2/api'
import { clusterScopeKey, withNodeQuery, withNodeTopic } from '../utils/clusterTransport'
import { getPluginIdentityKeyFromParts } from '../../map2/utils/pluginIdentity'

// ========================================
// Types
// ========================================

export interface DynamicsMetering {
  inputLevel: number
  outputLevel: number
  gainReduction: number
  inputRms: number
  outputRms: number
}

export interface CompressorParams {
  threshold: number
  ratio: number
  attack: number
  release: number
  knee: number
  makeupGain: number
  autoMakeup: boolean
  bypass: boolean
}

export interface LimiterParams {
  threshold: number
  release: number
  bypass: boolean
}

export interface GateParams {
  threshold: number
  ratio: number
  attack: number
  release: number
  bypass: boolean
}

export interface DynamicsState {
  compressor: {
    parameters: CompressorParams
    metering: DynamicsMetering
  }
  limiter: {
    parameters: LimiterParams
    metering: DynamicsMetering
  }
  gate: {
    parameters: GateParams
    metering: DynamicsMetering
  }
  running: boolean
}

// ========================================
// Defaults
// ========================================

const DEFAULT_METERING: DynamicsMetering = {
  inputLevel: -100,
  outputLevel: -100,
  gainReduction: 0,
  inputRms: -100,
  outputRms: -100
}

const DEFAULT_COMPRESSOR: CompressorParams = {
  threshold: -12,
  ratio: 4,
  attack: 10,
  release: 100,
  knee: 6,
  makeupGain: 0,
  autoMakeup: false,
  bypass: false
}

const DEFAULT_LIMITER: LimiterParams = {
  threshold: -1,
  release: 100,
  bypass: false
}

const DEFAULT_GATE: GateParams = {
  threshold: -40,
  ratio: 10,
  attack: 1,
  release: 100,
  bypass: false
}

const DEFAULT_STATE: DynamicsState = {
  compressor: {
    parameters: DEFAULT_COMPRESSOR,
    metering: DEFAULT_METERING
  },
  limiter: {
    parameters: DEFAULT_LIMITER,
    metering: DEFAULT_METERING
  },
  gate: {
    parameters: DEFAULT_GATE,
    metering: DEFAULT_METERING
  },
  running: false
}

// ========================================
// Options
// ========================================

interface UseDynamicsOptions {
  /** Use WebSocket for real-time metering updates */
  useWebSocket?: boolean
  /** Polling interval in ms when not using WebSocket */
  pollingInterval?: number
  /** Cluster node to target. Omit for local node. */
  nodeId?: string | null
  /** Runtime instance ID for selected-block duplicate-safe routing. */
  instanceId?: number | null
  /** Chain position for duplicate-safe routing and stale instance recovery. */
  pluginPosition?: number | null
  /** Limit the hook to a single processor when a card is scoped to one plugin instance. */
  processor?: 'compressor' | 'limiter' | 'gate' | null
}

type DynamicsProcessor = 'compressor' | 'limiter' | 'gate'

const COMPRESSOR_URI = 'map2://juce/dynamics/compressor'
const LIMITER_URI = 'map2://juce/dynamics/limiter'
const GATE_URI = 'map2://juce/dynamics/gate'

// ========================================
// Helper to convert snake_case to camelCase
// ========================================

function parseMetering(data: Record<string, number>): DynamicsMetering {
  return {
    inputLevel: data.input_level ?? -100,
    outputLevel: data.output_level ?? -100,
    gainReduction: data.gain_reduction ?? 0,
    inputRms: data.input_rms ?? -100,
    outputRms: data.output_rms ?? -100
  }
}

function parseCompressorParams(data: Record<string, unknown>): CompressorParams {
  return {
    threshold: (data.threshold as number) ?? -12,
    ratio: (data.ratio as number) ?? 4,
    attack: (data.attack as number) ?? 10,
    release: (data.release as number) ?? 100,
    knee: (data.knee as number) ?? 6,
    makeupGain: (data.makeup_gain as number) ?? 0,
    autoMakeup: (data.auto_makeup as boolean) ?? false,
    bypass: (data.bypass as boolean) ?? false
  }
}

function parseLimiterParams(data: Record<string, unknown>): LimiterParams {
  return {
    threshold: (data.threshold as number) ?? -1,
    release: (data.release as number) ?? 100,
    bypass: (data.bypass as boolean) ?? false
  }
}

function parseGateParams(data: Record<string, unknown>): GateParams {
  return {
    threshold: (data.threshold as number) ?? -40,
    ratio: (data.ratio as number) ?? 10,
    attack: (data.attack as number) ?? 1,
    release: (data.release as number) ?? 100,
    bypass: (data.bypass as boolean) ?? false
  }
}

function parseProcessorState<T>(
  data: Record<string, unknown>,
  parseParameters: (params: Record<string, unknown>) => T,
): { parameters: T; metering: DynamicsMetering } {
  const rawParameters = (data.parameters as Record<string, unknown>) ?? {}
  const rawMetering = (data.metering as Record<string, number>) ?? {}
  return {
    parameters: parseParameters(rawParameters),
    metering: parseMetering(rawMetering),
  }
}

function hasScopedInstanceId(instanceId?: number | null): instanceId is number {
  return typeof instanceId === 'number' && Number.isFinite(instanceId) && instanceId > 0
}

function hasScopedPosition(pluginPosition?: number | null): pluginPosition is number {
  return typeof pluginPosition === 'number' && Number.isFinite(pluginPosition) && pluginPosition >= 0
}

function withRuntimeQuery(
  path: string,
  options: { instanceId?: number | null; pluginPosition?: number | null; nodeId?: string | null },
): string {
  const params = new URLSearchParams()

  if (hasScopedInstanceId(options.instanceId)) {
    params.set('instance_id', String(Math.trunc(options.instanceId)))
  }
  if (hasScopedPosition(options.pluginPosition)) {
    params.set('plugin_position', String(Math.trunc(options.pluginPosition)))
  }

  const scopedPath = params.size > 0 ? `${path}?${params.toString()}` : path
  return withNodeQuery(scopedPath, options.nodeId)
}

function getProcessorUri(processor: DynamicsProcessor): string {
  switch (processor) {
    case 'limiter':
      return LIMITER_URI
    case 'gate':
      return GATE_URI
    case 'compressor':
    default:
      return COMPRESSOR_URI
  }
}

// ========================================
// Hook
// ========================================

export function useDynamics(options: UseDynamicsOptions = {}) {
  const {
    useWebSocket = true,
    pollingInterval = 100,  // 10fps for metering
    nodeId,
    instanceId,
    pluginPosition,
    processor = null,
  } = options

  const queryClient = useQueryClient()
  const scopeKey = clusterScopeKey(nodeId)
  const hasRuntimeIdentity = hasScopedInstanceId(instanceId) || hasScopedPosition(pluginPosition)
  const useRealtimeWebSocket = useWebSocket && !hasRuntimeIdentity
  const usePolledState = hasRuntimeIdentity || !useRealtimeWebSocket
  const shouldUseProcessor = useCallback((name: DynamicsProcessor) => (
    processor === null || processor === name
  ), [processor])
  const buildScopedUrl = useCallback((path: string) => withRuntimeQuery(path, {
    instanceId,
    pluginPosition,
    nodeId,
  }), [instanceId, nodeId, pluginPosition])
  const compressorScopeKey = getPluginIdentityKeyFromParts(COMPRESSOR_URI, pluginPosition, instanceId)
  const limiterScopeKey = getPluginIdentityKeyFromParts(LIMITER_URI, pluginPosition, instanceId)
  const gateScopeKey = getPluginIdentityKeyFromParts(GATE_URI, pluginPosition, instanceId)
  const [metering, setMetering] = useState({
    compressor: DEFAULT_METERING,
    limiter: DEFAULT_METERING,
    gate: DEFAULT_METERING,
    running: false
  })
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // ========================================
  // WebSocket for real-time metering
  // ========================================

  useEffect(() => {
    if (!useRealtimeWebSocket) {
      setIsConnected(false)
      return
    }

    const ws = new WebSocket(getWsUrl())
    const topic = withNodeTopic('dynamics', nodeId)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(JSON.stringify({ action: 'subscribe', topic }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'dynamics_update' && message.data) {
          setMetering({
            compressor: parseMetering(message.data.compressor || {}),
            limiter: parseMetering(message.data.limiter || {}),
            gate: parseMetering(message.data.gate || {}),
            running: message.data.running ?? true
          })
        }
      } catch (e) {
        console.error('Error parsing dynamics WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onerror = (error) => {
      console.error('Dynamics WebSocket error:', error)
      setIsConnected(false)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [nodeId, useRealtimeWebSocket])

  // ========================================
  // Queries for parameters and polled metering
  // ========================================

  const compressorStateQuery = useQuery({
    queryKey: ['dynamics', scopeKey, 'compressor', compressorScopeKey, 'state'],
    queryFn: async () => {
      const res = await fetch(buildScopedUrl('/api/engine/dynamics/compressor'))
      if (!res.ok) throw new Error('Failed to fetch compressor state')
      return parseProcessorState(await res.json(), parseCompressorParams)
    },
    staleTime: 1000,
    refetchInterval: usePolledState ? pollingInterval : false,
    enabled: usePolledState && shouldUseProcessor('compressor'),
  })

  const compressorQuery = useQuery({
    queryKey: ['dynamics', scopeKey, 'compressor', compressorScopeKey, 'parameters'],
    queryFn: async () => {
      const res = await fetch(buildScopedUrl('/api/engine/dynamics/compressor/parameters'))
      if (!res.ok) throw new Error('Failed to fetch compressor parameters')
      return parseCompressorParams(await res.json())
    },
    staleTime: 5000,
    enabled: !usePolledState && shouldUseProcessor('compressor'),
  })

  const limiterStateQuery = useQuery({
    queryKey: ['dynamics', scopeKey, 'limiter', limiterScopeKey, 'state'],
    queryFn: async () => {
      const res = await fetch(buildScopedUrl('/api/engine/dynamics/limiter'))
      if (!res.ok) throw new Error('Failed to fetch limiter state')
      return parseProcessorState(await res.json(), parseLimiterParams)
    },
    staleTime: 1000,
    refetchInterval: usePolledState ? pollingInterval : false,
    enabled: usePolledState && shouldUseProcessor('limiter'),
  })

  const limiterQuery = useQuery({
    queryKey: ['dynamics', scopeKey, 'limiter', limiterScopeKey, 'parameters'],
    queryFn: async () => {
      const res = await fetch(buildScopedUrl('/api/engine/dynamics/limiter/parameters'))
      if (!res.ok) throw new Error('Failed to fetch limiter parameters')
      return parseLimiterParams(await res.json())
    },
    staleTime: 5000,
    enabled: !usePolledState && shouldUseProcessor('limiter'),
  })

  const gateStateQuery = useQuery({
    queryKey: ['dynamics', scopeKey, 'gate', gateScopeKey, 'state'],
    queryFn: async () => {
      const res = await fetch(buildScopedUrl('/api/engine/dynamics/gate'))
      if (!res.ok) throw new Error('Failed to fetch gate state')
      return parseProcessorState(await res.json(), parseGateParams)
    },
    staleTime: 1000,
    refetchInterval: usePolledState ? pollingInterval : false,
    enabled: usePolledState && shouldUseProcessor('gate'),
  })

  const gateQuery = useQuery({
    queryKey: ['dynamics', scopeKey, 'gate', gateScopeKey, 'parameters'],
    queryFn: async () => {
      const res = await fetch(buildScopedUrl('/api/engine/dynamics/gate/parameters'))
      if (!res.ok) throw new Error('Failed to fetch gate parameters')
      return parseGateParams(await res.json())
    },
    staleTime: 5000,
    enabled: !usePolledState && shouldUseProcessor('gate'),
  })

  // ========================================
  // Mutations for parameter updates
  // ========================================

  const updateCompressor = useMutation({
    mutationFn: async (params: Partial<CompressorParams>) => {
      const body: Record<string, unknown> = {}
      if (params.threshold !== undefined) body.threshold = params.threshold
      if (params.ratio !== undefined) body.ratio = params.ratio
      if (params.attack !== undefined) body.attack = params.attack
      if (params.release !== undefined) body.release = params.release
      if (params.knee !== undefined) body.knee = params.knee
      if (params.makeupGain !== undefined) body.makeup_gain = params.makeupGain
      if (params.autoMakeup !== undefined) body.auto_makeup = params.autoMakeup
      if (params.bypass !== undefined) body.bypass = params.bypass

      const res = await fetch(buildScopedUrl('/api/engine/dynamics/compressor'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('Failed to update compressor')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamics', scopeKey, 'compressor', compressorScopeKey] })
    }
  })

  const updateLimiter = useMutation({
    mutationFn: async (params: Partial<LimiterParams>) => {
      const body: Record<string, unknown> = {}
      if (params.threshold !== undefined) body.threshold = params.threshold
      if (params.release !== undefined) body.release = params.release
      if (params.bypass !== undefined) body.bypass = params.bypass

      const res = await fetch(buildScopedUrl('/api/engine/dynamics/limiter'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('Failed to update limiter')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamics', scopeKey, 'limiter', limiterScopeKey] })
    }
  })

  const updateGate = useMutation({
    mutationFn: async (params: Partial<GateParams>) => {
      const body: Record<string, unknown> = {}
      if (params.threshold !== undefined) body.threshold = params.threshold
      if (params.ratio !== undefined) body.ratio = params.ratio
      if (params.attack !== undefined) body.attack = params.attack
      if (params.release !== undefined) body.release = params.release
      if (params.bypass !== undefined) body.bypass = params.bypass

      const res = await fetch(buildScopedUrl('/api/engine/dynamics/gate'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('Failed to update gate')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamics', scopeKey, 'gate', gateScopeKey] })
    }
  })

  // ========================================
  // Convenience setters
  // ========================================

  const setCompressorThreshold = useCallback((value: number) => {
    updateCompressor.mutate({ threshold: value })
  }, [updateCompressor])

  const setCompressorRatio = useCallback((value: number) => {
    updateCompressor.mutate({ ratio: value })
  }, [updateCompressor])

  const setCompressorAttack = useCallback((value: number) => {
    updateCompressor.mutate({ attack: value })
  }, [updateCompressor])

  const setCompressorRelease = useCallback((value: number) => {
    updateCompressor.mutate({ release: value })
  }, [updateCompressor])

  const setCompressorKnee = useCallback((value: number) => {
    updateCompressor.mutate({ knee: value })
  }, [updateCompressor])

  const setCompressorMakeupGain = useCallback((value: number) => {
    updateCompressor.mutate({ makeupGain: value })
  }, [updateCompressor])

  const setCompressorAutoMakeup = useCallback((value: boolean) => {
    updateCompressor.mutate({ autoMakeup: value })
  }, [updateCompressor])

  const setCompressorBypass = useCallback((value: boolean) => {
    updateCompressor.mutate({ bypass: value })
  }, [updateCompressor])

  const setLimiterThreshold = useCallback((value: number) => {
    updateLimiter.mutate({ threshold: value })
  }, [updateLimiter])

  const setLimiterRelease = useCallback((value: number) => {
    updateLimiter.mutate({ release: value })
  }, [updateLimiter])

  const setLimiterBypass = useCallback((value: boolean) => {
    updateLimiter.mutate({ bypass: value })
  }, [updateLimiter])

  const setGateThreshold = useCallback((value: number) => {
    updateGate.mutate({ threshold: value })
  }, [updateGate])

  const setGateRatio = useCallback((value: number) => {
    updateGate.mutate({ ratio: value })
  }, [updateGate])

  const setGateAttack = useCallback((value: number) => {
    updateGate.mutate({ attack: value })
  }, [updateGate])

  const setGateRelease = useCallback((value: number) => {
    updateGate.mutate({ release: value })
  }, [updateGate])

  const setGateBypass = useCallback((value: boolean) => {
    updateGate.mutate({ bypass: value })
  }, [updateGate])

  // ========================================
  // Return
  // ========================================

  return {
    // State
    compressor: {
      parameters: usePolledState
        ? (compressorStateQuery.data?.parameters ?? DEFAULT_COMPRESSOR)
        : (compressorQuery.data ?? DEFAULT_COMPRESSOR),
      metering: useRealtimeWebSocket
        ? metering.compressor
        : (compressorStateQuery.data?.metering ?? DEFAULT_METERING),
      isLoading: usePolledState ? compressorStateQuery.isLoading : compressorQuery.isLoading,
      isUpdating: updateCompressor.isPending
    },
    limiter: {
      parameters: usePolledState
        ? (limiterStateQuery.data?.parameters ?? DEFAULT_LIMITER)
        : (limiterQuery.data ?? DEFAULT_LIMITER),
      metering: useRealtimeWebSocket
        ? metering.limiter
        : (limiterStateQuery.data?.metering ?? DEFAULT_METERING),
      isLoading: usePolledState ? limiterStateQuery.isLoading : limiterQuery.isLoading,
      isUpdating: updateLimiter.isPending
    },
    gate: {
      parameters: usePolledState
        ? (gateStateQuery.data?.parameters ?? DEFAULT_GATE)
        : (gateQuery.data ?? DEFAULT_GATE),
      metering: useRealtimeWebSocket
        ? metering.gate
        : (gateStateQuery.data?.metering ?? DEFAULT_METERING),
      isLoading: usePolledState ? gateStateQuery.isLoading : gateQuery.isLoading,
      isUpdating: updateGate.isPending
    },

    // Connection status
    isConnected,
    isRunning: useRealtimeWebSocket ? metering.running : true,

    // Compressor setters
    setCompressorThreshold,
    setCompressorRatio,
    setCompressorAttack,
    setCompressorRelease,
    setCompressorKnee,
    setCompressorMakeupGain,
    setCompressorAutoMakeup,
    setCompressorBypass,
    updateCompressor: updateCompressor.mutate,

    // Limiter setters
    setLimiterThreshold,
    setLimiterRelease,
    setLimiterBypass,
    updateLimiter: updateLimiter.mutate,

    // Gate setters
    setGateThreshold,
    setGateRatio,
    setGateAttack,
    setGateRelease,
    setGateBypass,
    updateGate: updateGate.mutate
  }
}

export default useDynamics
