/**
 * useDelay - React hook for native JUCE delay processor control and metering
 *
 * Provides full control of the Stereo Delay processor with tap tempo support.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ========================================
// Types
// ========================================

export interface DelayMetering {
  inputLevelL: number
  inputLevelR: number
  outputLevelL: number
  outputLevelR: number
  delayLevelL: number
  delayLevelR: number
  duckingGain: number
  modPhase: number
}

export interface DelayParams {
  // Core
  delayTimeL: number
  delayTimeR: number
  feedback: number
  mix: number
  // Tempo sync
  tempo: number
  tempoSyncL: number
  tempoSyncR: number
  // Multi-tap
  tap1Level: number
  tap2Level: number
  tap2Ratio: number
  tap3Level: number
  tap3Ratio: number
  tap4Level: number
  tap4Ratio: number
  // Stereo
  stereoMode: number
  stereoSpread: number
  pan: number
  // Modulation
  modRate: number
  modDepth: number
  modWaveform: number
  // Filtering
  lowCut: number
  highCut: number
  filterInLoop: boolean
  // Diffusion
  diffusion: number
  // Ducking
  duckThreshold: number
  duckAmount: number
  duckRelease: number
  // Output
  outputLevel: number
  spillover: boolean
  bypass: boolean
}

export interface TempoDivision {
  index: number
  name: string
  beats: number
}

// ========================================
// Defaults
// ========================================

const DEFAULT_METERING: DelayMetering = {
  inputLevelL: -100,
  inputLevelR: -100,
  outputLevelL: -100,
  outputLevelR: -100,
  delayLevelL: -100,
  delayLevelR: -100,
  duckingGain: 0,
  modPhase: 0
}

const DEFAULT_PARAMS: DelayParams = {
  delayTimeL: 500,
  delayTimeR: 500,
  feedback: 30,
  mix: 50,
  tempo: 120,
  tempoSyncL: 0,
  tempoSyncR: 0,
  tap1Level: 100,
  tap2Level: 0,
  tap2Ratio: 0.5,
  tap3Level: 0,
  tap3Ratio: 0.33,
  tap4Level: 0,
  tap4Ratio: 0.25,
  stereoMode: 1,
  stereoSpread: 100,
  pan: 0,
  modRate: 0.5,
  modDepth: 0,
  modWaveform: 0,
  lowCut: 20,
  highCut: 12000,
  filterInLoop: true,
  diffusion: 0,
  duckThreshold: -20,
  duckAmount: 0,
  duckRelease: 200,
  outputLevel: 0,
  spillover: true,
  bypass: false
}

export const TEMPO_DIVISIONS: TempoDivision[] = [
  { index: 0, name: 'Off', beats: 0 },
  { index: 1, name: '1/1', beats: 4.0 },
  { index: 2, name: '1/2', beats: 2.0 },
  { index: 3, name: '1/4', beats: 1.0 },
  { index: 4, name: '1/8', beats: 0.5 },
  { index: 5, name: '1/16', beats: 0.25 },
  { index: 6, name: '1/32', beats: 0.125 },
  { index: 7, name: '1/1D', beats: 6.0 },
  { index: 8, name: '1/2D', beats: 3.0 },
  { index: 9, name: '1/4D', beats: 1.5 },
  { index: 10, name: '1/8D', beats: 0.75 },
  { index: 11, name: '1/16D', beats: 0.375 },
  { index: 12, name: '1/1T', beats: 2.667 },
  { index: 13, name: '1/2T', beats: 1.333 },
  { index: 14, name: '1/4T', beats: 0.667 },
  { index: 15, name: '1/8T', beats: 0.333 },
  { index: 16, name: '1/16T', beats: 0.167 },
]

export const STEREO_MODES = [
  { index: 0, name: 'Mono' },
  { index: 1, name: 'Stereo' },
  { index: 2, name: 'Ping-Pong' },
  { index: 3, name: 'Dual Mono' },
]

export const MOD_WAVEFORMS = [
  { index: 0, name: 'Sine' },
  { index: 1, name: 'Triangle' },
  { index: 2, name: 'Random' },
]

// ========================================
// Utility Functions
// ========================================

export function calculateDelayFromSync(division: number, bpm: number): number {
  if (division === 0 || bpm <= 0) return 0
  const beats = TEMPO_DIVISIONS[division]?.beats ?? 0
  return beats * 60000 / bpm
}

function parseMetering(data: Record<string, number>): DelayMetering {
  return {
    inputLevelL: data.input_level_l ?? -100,
    inputLevelR: data.input_level_r ?? -100,
    outputLevelL: data.output_level_l ?? -100,
    outputLevelR: data.output_level_r ?? -100,
    delayLevelL: data.delay_level_l ?? -100,
    delayLevelR: data.delay_level_r ?? -100,
    duckingGain: data.ducking_gain ?? 0,
    modPhase: data.mod_phase ?? 0
  }
}

function parseParams(data: Record<string, unknown>): DelayParams {
  return {
    delayTimeL: (data.delay_time_l as number) ?? 500,
    delayTimeR: (data.delay_time_r as number) ?? 500,
    feedback: (data.feedback as number) ?? 30,
    mix: (data.mix as number) ?? 50,
    tempo: (data.tempo as number) ?? 120,
    tempoSyncL: (data.tempo_sync_l as number) ?? 0,
    tempoSyncR: (data.tempo_sync_r as number) ?? 0,
    tap1Level: (data.tap1_level as number) ?? 100,
    tap2Level: (data.tap2_level as number) ?? 0,
    tap2Ratio: (data.tap2_ratio as number) ?? 0.5,
    tap3Level: (data.tap3_level as number) ?? 0,
    tap3Ratio: (data.tap3_ratio as number) ?? 0.33,
    tap4Level: (data.tap4_level as number) ?? 0,
    tap4Ratio: (data.tap4_ratio as number) ?? 0.25,
    stereoMode: (data.stereo_mode as number) ?? 1,
    stereoSpread: (data.stereo_spread as number) ?? 100,
    pan: (data.pan as number) ?? 0,
    modRate: (data.mod_rate as number) ?? 0.5,
    modDepth: (data.mod_depth as number) ?? 0,
    modWaveform: (data.mod_waveform as number) ?? 0,
    lowCut: (data.low_cut as number) ?? 20,
    highCut: (data.high_cut as number) ?? 12000,
    filterInLoop: (data.filter_in_loop as boolean) ?? true,
    diffusion: (data.diffusion as number) ?? 0,
    duckThreshold: (data.duck_threshold as number) ?? -20,
    duckAmount: (data.duck_amount as number) ?? 0,
    duckRelease: (data.duck_release as number) ?? 200,
    outputLevel: (data.output_level as number) ?? 0,
    spillover: (data.spillover as boolean) ?? true,
    bypass: (data.bypass as boolean) ?? false
  }
}

// ========================================
// Hook Options
// ========================================

interface UseDelayOptions {
  useWebSocket?: boolean
  pollingInterval?: number
}

// ========================================
// Hook
// ========================================

export function useDelay(options: UseDelayOptions = {}) {
  const { useWebSocket = true, pollingInterval = 100 } = options

  const queryClient = useQueryClient()
  const [metering, setMetering] = useState<DelayMetering>(DEFAULT_METERING)
  const [isConnected, setIsConnected] = useState(false)
  const [tapCount, setTapCount] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)

  // ========================================
  // WebSocket for real-time metering
  // ========================================

  useEffect(() => {
    if (!useWebSocket) return

    const ws = new WebSocket(`ws://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'delay' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'delay_update' && message.data) {
          setMetering(parseMetering(message.data))
        }
      } catch (e) {
        console.error('Error parsing delay WebSocket message:', e)
      }
    }

    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => setIsConnected(false)

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'delay' }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [useWebSocket])

  // ========================================
  // Query for parameters
  // ========================================

  const paramsQuery = useQuery({
    queryKey: ['delay', 'parameters'],
    queryFn: async () => {
      const res = await fetch('/api/engine/delay/parameters')
      if (!res.ok) throw new Error('Failed to fetch delay parameters')
      return parseParams(await res.json())
    },
    staleTime: 5000
  })

  // ========================================
  // Mutation for parameter updates
  // ========================================

  const updateParams = useMutation({
    mutationFn: async (params: Partial<Record<string, unknown>>) => {
      const res = await fetch('/api/engine/delay/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })
      if (!res.ok) throw new Error('Failed to update delay parameters')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delay', 'parameters'] })
    }
  })

  // ========================================
  // Tap Tempo
  // ========================================

  const tapTempo = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/engine/delay/tap-tempo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: Date.now() })
      })
      if (!res.ok) throw new Error('Failed to record tap')
      return res.json() as Promise<{ tempo: number | null; taps: number }>
    },
    onSuccess: (data) => {
      setTapCount(data.taps)
      if (data.tempo) {
        queryClient.invalidateQueries({ queryKey: ['delay', 'parameters'] })
      }
    }
  })

  const clearTaps = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/engine/delay/tap-tempo/clear', {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Failed to clear taps')
      return res.json()
    },
    onSuccess: () => {
      setTapCount(0)
    }
  })

  // ========================================
  // Convenience setters
  // ========================================

  const setDelayTimeL = useCallback((v: number) => updateParams.mutate({ delay_time_l: v }), [updateParams])
  const setDelayTimeR = useCallback((v: number) => updateParams.mutate({ delay_time_r: v }), [updateParams])
  const setFeedback = useCallback((v: number) => updateParams.mutate({ feedback: v }), [updateParams])
  const setMix = useCallback((v: number) => updateParams.mutate({ mix: v }), [updateParams])
  const setTempo = useCallback((v: number) => updateParams.mutate({ tempo: v }), [updateParams])
  const setTempoSyncL = useCallback((v: number) => updateParams.mutate({ tempo_sync_l: v }), [updateParams])
  const setTempoSyncR = useCallback((v: number) => updateParams.mutate({ tempo_sync_r: v }), [updateParams])
  const setTap1Level = useCallback((v: number) => updateParams.mutate({ tap1_level: v }), [updateParams])
  const setTap2Level = useCallback((v: number) => updateParams.mutate({ tap2_level: v }), [updateParams])
  const setTap2Ratio = useCallback((v: number) => updateParams.mutate({ tap2_ratio: v }), [updateParams])
  const setTap3Level = useCallback((v: number) => updateParams.mutate({ tap3_level: v }), [updateParams])
  const setTap3Ratio = useCallback((v: number) => updateParams.mutate({ tap3_ratio: v }), [updateParams])
  const setTap4Level = useCallback((v: number) => updateParams.mutate({ tap4_level: v }), [updateParams])
  const setTap4Ratio = useCallback((v: number) => updateParams.mutate({ tap4_ratio: v }), [updateParams])
  const setStereoMode = useCallback((v: number) => updateParams.mutate({ stereo_mode: v }), [updateParams])
  const setStereoSpread = useCallback((v: number) => updateParams.mutate({ stereo_spread: v }), [updateParams])
  const setPan = useCallback((v: number) => updateParams.mutate({ pan: v }), [updateParams])
  const setModRate = useCallback((v: number) => updateParams.mutate({ mod_rate: v }), [updateParams])
  const setModDepth = useCallback((v: number) => updateParams.mutate({ mod_depth: v }), [updateParams])
  const setModWaveform = useCallback((v: number) => updateParams.mutate({ mod_waveform: v }), [updateParams])
  const setLowCut = useCallback((v: number) => updateParams.mutate({ low_cut: v }), [updateParams])
  const setHighCut = useCallback((v: number) => updateParams.mutate({ high_cut: v }), [updateParams])
  const setFilterInLoop = useCallback((v: boolean) => updateParams.mutate({ filter_in_loop: v }), [updateParams])
  const setDiffusion = useCallback((v: number) => updateParams.mutate({ diffusion: v }), [updateParams])
  const setDuckThreshold = useCallback((v: number) => updateParams.mutate({ duck_threshold: v }), [updateParams])
  const setDuckAmount = useCallback((v: number) => updateParams.mutate({ duck_amount: v }), [updateParams])
  const setDuckRelease = useCallback((v: number) => updateParams.mutate({ duck_release: v }), [updateParams])
  const setOutputLevel = useCallback((v: number) => updateParams.mutate({ output_level: v }), [updateParams])
  const setSpillover = useCallback((v: boolean) => updateParams.mutate({ spillover: v }), [updateParams])
  const setBypass = useCallback((v: boolean) => updateParams.mutate({ bypass: v }), [updateParams])

  // Link L/R helper
  const setDelayTimeBoth = useCallback((v: number) => {
    updateParams.mutate({ delay_time_l: v, delay_time_r: v })
  }, [updateParams])

  const setTempoSyncBoth = useCallback((v: number) => {
    updateParams.mutate({ tempo_sync_l: v, tempo_sync_r: v })
  }, [updateParams])

  // ========================================
  // Effective delay times (considering sync)
  // ========================================

  const params = paramsQuery.data ?? DEFAULT_PARAMS
  const effectiveDelayL = params.tempoSyncL > 0
    ? calculateDelayFromSync(params.tempoSyncL, params.tempo)
    : params.delayTimeL
  const effectiveDelayR = params.tempoSyncR > 0
    ? calculateDelayFromSync(params.tempoSyncR, params.tempo)
    : params.delayTimeR

  // ========================================
  // Return
  // ========================================

  return {
    // State
    parameters: params,
    metering,
    effectiveDelayL,
    effectiveDelayR,
    isLoading: paramsQuery.isLoading,
    isUpdating: updateParams.isPending,
    isConnected,
    tapCount,

    // Setters - Core
    setDelayTimeL,
    setDelayTimeR,
    setDelayTimeBoth,
    setFeedback,
    setMix,

    // Setters - Tempo Sync
    setTempo,
    setTempoSyncL,
    setTempoSyncR,
    setTempoSyncBoth,

    // Setters - Multi-tap
    setTap1Level,
    setTap2Level,
    setTap2Ratio,
    setTap3Level,
    setTap3Ratio,
    setTap4Level,
    setTap4Ratio,

    // Setters - Stereo
    setStereoMode,
    setStereoSpread,
    setPan,

    // Setters - Modulation
    setModRate,
    setModDepth,
    setModWaveform,

    // Setters - Filtering
    setLowCut,
    setHighCut,
    setFilterInLoop,

    // Setters - Diffusion
    setDiffusion,

    // Setters - Ducking
    setDuckThreshold,
    setDuckAmount,
    setDuckRelease,

    // Setters - Output
    setOutputLevel,
    setSpillover,
    setBypass,

    // Tap Tempo
    tapTempo: tapTempo.mutate,
    clearTaps: clearTaps.mutate,
    isTapping: tapTempo.isPending,

    // Bulk update
    updateParams: updateParams.mutate
  }
}

export default useDelay
