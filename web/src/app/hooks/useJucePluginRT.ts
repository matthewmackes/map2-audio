/**
 * useJucePluginRT - Shared hook for JUCE plugin real-time parameter control
 *
 * Wraps useRTPluginParameters to provide named parameter access (camelCase)
 * over the RT WebSocket, eliminating the 100ms REST polling that causes
 * knob pop-back.
 *
 * Parameters flow via WebSocket for <10ms latency with optimistic local state.
 * Metering uses a separate REST query at a relaxed interval.
 */

import { useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRTPluginParameters } from '../../map2/hooks/useRTParameter'

// ========================================
// Types
// ========================================

export interface JuceParamDef {
  /** API/engine parameter name (snake_case) */
  symbol: string
  /** Default value */
  default: number
}

export interface JucePluginRTConfig {
  /** Plugin URI, e.g. "map2://juce/amp/peavey5150" */
  pluginUri: string
  /** Ordered parameter definitions (index = RT param index) */
  params: JuceParamDef[]
  /** REST endpoint for metering data */
  meteringEndpoint?: string
  /** Metering poll interval in ms (default: 500) */
  meteringInterval?: number
}

export interface JucePluginRTResult {
  /** Current parameter values keyed by symbol */
  values: Record<string, number>
  /** Set a single parameter by symbol */
  setParam: (symbol: string, value: number) => void
  /** Set a single parameter by index */
  setParamByIndex: (index: number, value: number) => void
  /** Batch update multiple parameters by symbol */
  updateParams: (updates: Record<string, number>) => void
  /** Raw indexed values array from RT hook */
  rawValues: number[]
  /** Metering data from REST endpoint */
  metering: Record<string, any>
  /** Whether RT WebSocket is connected */
  isConnected: boolean
}

// ========================================
// Hook
// ========================================

export function useJucePluginRT(config: JucePluginRTConfig): JucePluginRTResult {
  const {
    pluginUri,
    params,
    meteringEndpoint,
    meteringInterval = 500,
  } = config

  const initialValues = useMemo(
    () => params.map(p => p.default),
    [params]
  )

  // RT WebSocket for parameter control (optimistic local state, no polling)
  const { values: rawValues, updateParameter, isConnected } =
    useRTPluginParameters(pluginUri, params.length, initialValues)

  // Symbol → index lookup (memoized)
  const symbolToIndex = useMemo(() => {
    const map: Record<string, number> = {}
    params.forEach((p, i) => { map[p.symbol] = i })
    return map
  }, [params])

  // Named values: { pre_gain: 5.0, post_gain: 3.0, ... }
  const values = useMemo(() => {
    const obj: Record<string, number> = {}
    params.forEach((p, i) => {
      obj[p.symbol] = rawValues[i] ?? p.default
    })
    return obj
  }, [rawValues, params])

  // Set by symbol
  const setParam = useCallback(
    (symbol: string, value: number) => {
      const idx = symbolToIndex[symbol]
      if (idx !== undefined) {
        updateParameter(idx, value)
      }
    },
    [symbolToIndex, updateParameter]
  )

  // Set by index
  const setParamByIndex = useCallback(
    (index: number, value: number) => {
      updateParameter(index, value)
    },
    [updateParameter]
  )

  // Batch update by symbol
  const updateParams = useCallback(
    (updates: Record<string, number>) => {
      for (const [symbol, value] of Object.entries(updates)) {
        const idx = symbolToIndex[symbol]
        if (idx !== undefined) {
          updateParameter(idx, value)
        }
      }
    },
    [symbolToIndex, updateParameter]
  )

  // Metering via REST (relaxed interval, no parameter data needed)
  const { data: meteringData } = useQuery({
    queryKey: [pluginUri, 'metering'],
    queryFn: async () => {
      if (!meteringEndpoint) return {}
      const response = await fetch(meteringEndpoint)
      if (!response.ok) return {}
      return response.json()
    },
    refetchInterval: meteringInterval,
    enabled: !!meteringEndpoint,
  })

  return {
    values,
    setParam,
    setParamByIndex,
    updateParams,
    rawValues,
    metering: meteringData ?? {},
    isConnected,
  }
}

export default useJucePluginRT
