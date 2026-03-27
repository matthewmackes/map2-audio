/**
 * useFilters - React hook for 8-band parametric EQ control
 *
 * Provides control and frequency response visualization for the EQ processor.
 */

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clusterScopeKey, withNodeQuery } from '../utils/clusterTransport'
import { getPluginIdentityKeyFromParts } from '../../map2/utils/pluginIdentity'

// ========================================
// Types
// ========================================

export type FilterType =
  | 'peak'
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'lowshelf'
  | 'highshelf'
  | 'allpass'

export interface EQBandParams {
  type: FilterType
  frequency: number
  gain: number
  q: number
  enabled: boolean
}

export interface EQParams {
  bands: EQBandParams[]
  outputGain: number
  bypass: boolean
}

export interface FrequencyResponseData {
  frequencies: number[]
  response: number[]
}

// ========================================
// Defaults
// ========================================

const DEFAULT_FREQUENCIES = [80, 160, 320, 640, 1280, 2560, 5120, 10240]

const DEFAULT_BAND: EQBandParams = {
  type: 'peak',
  frequency: 1000,
  gain: 0,
  q: 1,
  enabled: true
}

const DEFAULT_EQ: EQParams = {
  bands: DEFAULT_FREQUENCIES.map((freq) => ({
    ...DEFAULT_BAND,
    frequency: freq
  })),
  outputGain: 0,
  bypass: false
}

// ========================================
// Helper to convert snake_case API response
// ========================================

function parseBand(data: Record<string, unknown>): EQBandParams {
  return {
    type: (data.type as FilterType) ?? 'peak',
    frequency: (data.frequency as number) ?? 1000,
    gain: (data.gain as number) ?? 0,
    q: (data.q as number) ?? 1,
    enabled: (data.enabled as boolean) ?? true
  }
}

function parseEQParams(data: Record<string, unknown>): EQParams {
  const bands = data.bands as Record<string, unknown>[] ?? []
  return {
    bands: bands.map(parseBand),
    outputGain: (data.output_gain as number) ?? 0,
    bypass: (data.bypass as boolean) ?? false
  }
}

// ========================================
// Hook
// ========================================

interface UseFiltersOptions {
  nodeId?: string | null
  instanceId?: number | null
  pluginPosition?: number | null
}

const EQ_URI = 'map2://juce/eq/parametric'

function withRuntimeQuery(
  path: string,
  options: { instanceId?: number | null; pluginPosition?: number | null; nodeId?: string | null },
): string {
  const params = new URLSearchParams()

  if (typeof options.instanceId === 'number' && Number.isFinite(options.instanceId) && options.instanceId > 0) {
    params.set('instance_id', String(Math.trunc(options.instanceId)))
  }
  if (typeof options.pluginPosition === 'number' && Number.isFinite(options.pluginPosition) && options.pluginPosition >= 0) {
    params.set('plugin_position', String(Math.trunc(options.pluginPosition)))
  }

  const scopedPath = params.size > 0 ? `${path}?${params.toString()}` : path
  return withNodeQuery(scopedPath, options.nodeId)
}

export function useFilters(options: UseFiltersOptions = {}) {
  const { nodeId, instanceId, pluginPosition } = options
  const queryClient = useQueryClient()
  const scopeKey = clusterScopeKey(nodeId)
  const pluginScopeKey = getPluginIdentityKeyFromParts(EQ_URI, pluginPosition, instanceId)
  const queryScopeKey = ['eq', scopeKey, pluginScopeKey] as const
  const buildScopedUrl = useCallback((path: string) => withRuntimeQuery(path, {
    instanceId,
    pluginPosition,
    nodeId,
  }), [instanceId, nodeId, pluginPosition])

  // ========================================
  // Query for EQ parameters
  // ========================================

  const eqQuery = useQuery({
    queryKey: [...queryScopeKey, 'parameters'],
    queryFn: async () => {
      const res = await fetch(buildScopedUrl('/api/engine/eq/parameters'))
      if (!res.ok) throw new Error('Failed to fetch EQ parameters')
      return parseEQParams(await res.json())
    },
    staleTime: 5000
  })

  // ========================================
  // Band update mutation
  // ========================================

  const updateBand = useMutation({
    mutationFn: async ({ index, params }: { index: number; params: Partial<EQBandParams> }) => {
      const body: Record<string, unknown> = {}
      if (params.type !== undefined) body.type = params.type
      if (params.frequency !== undefined) body.frequency = params.frequency
      if (params.gain !== undefined) body.gain = params.gain
      if (params.q !== undefined) body.q = params.q
      if (params.enabled !== undefined) body.enabled = params.enabled

      const res = await fetch(buildScopedUrl(`/api/engine/eq/bands/${index}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('Failed to update EQ band')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryScopeKey })
    }
  })

  // ========================================
  // Global EQ update mutation
  // ========================================

  const updateEQ = useMutation({
    mutationFn: async (params: { outputGain?: number; bypass?: boolean }) => {
      const body: Record<string, unknown> = {}
      if (params.outputGain !== undefined) body.output_gain = params.outputGain
      if (params.bypass !== undefined) body.bypass = params.bypass

      const res = await fetch(buildScopedUrl('/api/engine/eq'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('Failed to update EQ')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryScopeKey })
    }
  })

  // ========================================
  // Frequency response query
  // ========================================

  const frequencyResponseQuery = useQuery({
    queryKey: [...queryScopeKey, 'frequency-response'],
    queryFn: async (): Promise<FrequencyResponseData> => {
      const res = await fetch(buildScopedUrl('/api/engine/eq/frequency-response/default'))
      if (!res.ok) throw new Error('Failed to fetch frequency response')
      return res.json()
    },
    staleTime: 1000,
    refetchInterval: 2000  // Refresh every 2 seconds
  })

  // ========================================
  // Convenience setters
  // ========================================

  const setBandFrequency = useCallback((index: number, frequency: number) => {
    updateBand.mutate({ index, params: { frequency } })
  }, [updateBand])

  const setBandGain = useCallback((index: number, gain: number) => {
    updateBand.mutate({ index, params: { gain } })
  }, [updateBand])

  const setBandQ = useCallback((index: number, q: number) => {
    updateBand.mutate({ index, params: { q } })
  }, [updateBand])

  const setBandType = useCallback((index: number, type: FilterType) => {
    updateBand.mutate({ index, params: { type } })
  }, [updateBand])

  const setBandEnabled = useCallback((index: number, enabled: boolean) => {
    updateBand.mutate({ index, params: { enabled } })
  }, [updateBand])

  const setOutputGain = useCallback((outputGain: number) => {
    updateEQ.mutate({ outputGain })
  }, [updateEQ])

  const setBypass = useCallback((bypass: boolean) => {
    updateEQ.mutate({ bypass })
  }, [updateEQ])

  // ========================================
  // Current state
  // ========================================

  const eq = eqQuery.data ?? DEFAULT_EQ

  // ========================================
  // Return
  // ========================================

  return {
    // State
    eq,
    bands: eq.bands,
    outputGain: eq.outputGain,
    bypass: eq.bypass,

    // Frequency response
    frequencyResponse: frequencyResponseQuery.data ?? { frequencies: [], response: [] },

    // Loading states
    isLoading: eqQuery.isLoading,
    isUpdating: updateBand.isPending || updateEQ.isPending,

    // Band setters
    setBandFrequency,
    setBandGain,
    setBandQ,
    setBandType,
    setBandEnabled,
    updateBand: (index: number, params: Partial<EQBandParams>) => updateBand.mutate({ index, params }),

    // Global setters
    setOutputGain,
    setBypass,
    updateEQ: updateEQ.mutate,

    // Invalidate to refresh
    refresh: () => queryClient.invalidateQueries({ queryKey: queryScopeKey })
  }
}

export default useFilters
