/**
 * Peavey 5150 Block Letter Amp Simulator Hook
 * 6-stage preamp with cold clipper, Yeh/Smith tone stack,
 * push-pull 6L6GC power amp with supply sag and transformer saturation
 *
 * Uses RT WebSocket for parameter control (no polling pop-back).
 */

import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useJucePluginRT, type JuceParamDef } from './useJucePluginRT'

// ========================================
// Types
// ========================================

export interface Peavey5150Parameters {
  preGain: number       // 0-10 Preamp drive
  postGain: number      // 0-10 Master volume
  low: number           // 0-10 Bass tone
  mid: number           // 0-10 Mid tone
  high: number          // 0-10 Treble tone
  presence: number      // 0-10 Power amp HF NFB
  resonance: number     // 0-10 Power amp LF NFB
  bright: boolean       // Bright cap switch
  bias: number          // 0-10 Power tube bias
  preset: number        // Current preset index
  bypass: boolean
}

export interface Peavey5150Metering {
  inputLevel: number
  outputLevel: number
  preampLevel: number
  powerLevel: number
  supplySag: number
  cpuLoad: number
}

export interface Peavey5150Preset {
  id: string
  name: string
  description: string
}

// ========================================
// Constants
// ========================================

const PEAVEY5150_URI = 'map2://juce/amp/peavey5150'

const PEAVEY5150_PARAMS: JuceParamDef[] = [
  { symbol: 'pre_gain', default: 5.0 },
  { symbol: 'post_gain', default: 3.0 },
  { symbol: 'low', default: 5.0 },
  { symbol: 'mid', default: 5.0 },
  { symbol: 'high', default: 5.0 },
  { symbol: 'presence', default: 5.0 },
  { symbol: 'resonance', default: 5.0 },
  { symbol: 'bright', default: 0 },
  { symbol: 'bias', default: 3.0 },
  { symbol: 'bypass', default: 0 },
]

// Parameter indices for direct access
const P = {
  PRE_GAIN: 0,
  POST_GAIN: 1,
  LOW: 2,
  MID: 3,
  HIGH: 4,
  PRESENCE: 5,
  RESONANCE: 6,
  BRIGHT: 7,
  BIAS: 8,
  BYPASS: 9,
} as const

export const PEAVEY5150_PRESETS: Peavey5150Preset[] = [
  { id: 'manual', name: 'Manual', description: 'User-defined settings' },
  { id: 'brown_sound', name: 'Brown Sound', description: 'Classic Van Halen studio tone' },
  { id: 'pantera_scoop', name: 'Pantera Scoop', description: 'Scooped mids, high gain, cold bias' },
  { id: 'modern_metal', name: 'Modern Metal', description: 'Maximum gain, cold bias, high presence' },
  { id: 'hard_rock', name: 'Hard Rock', description: 'Medium gain, bumped mids, warm power' },
  { id: 'crunch', name: 'Crunch', description: 'Low gain, bright switch, touch sensitive' },
]

// ========================================
// usePeavey5150 Hook
// ========================================

export function usePeavey5150() {
  const queryClient = useQueryClient()

  // RT WebSocket for parameter control
  const rt = useJucePluginRT({
    pluginUri: PEAVEY5150_URI,
    params: PEAVEY5150_PARAMS,
    meteringEndpoint: '/api/engine/amp/peavey5150/metering',
    meteringInterval: 500,
  })

  // Preset loading still via REST (one-shot operation)
  const setPresetMutation = useMutation({
    mutationFn: async (presetName: string) => {
      const response = await fetch(`/api/engine/amp/peavey5150/preset/${presetName}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set preset')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PEAVEY5150_URI, 'metering'] }),
  })

  const parameters: Peavey5150Parameters = useMemo(() => ({
    preGain: rt.values.pre_gain ?? 5.0,
    postGain: rt.values.post_gain ?? 3.0,
    low: rt.values.low ?? 5.0,
    mid: rt.values.mid ?? 5.0,
    high: rt.values.high ?? 5.0,
    presence: rt.values.presence ?? 5.0,
    resonance: rt.values.resonance ?? 5.0,
    bright: !!(rt.values.bright),
    bias: rt.values.bias ?? 3.0,
    preset: rt.values.preset ?? 0,
    bypass: !!(rt.values.bypass),
  }), [rt.values])

  const metering: Peavey5150Metering = useMemo(() => ({
    inputLevel: rt.metering?.input_level ?? -100,
    outputLevel: rt.metering?.output_level ?? -100,
    preampLevel: rt.metering?.preamp_level ?? -100,
    powerLevel: rt.metering?.power_level ?? -100,
    supplySag: rt.metering?.supply_sag ?? 1.0,
    cpuLoad: rt.metering?.cpu_load ?? 0,
  }), [rt.metering])

  const currentPreset = PEAVEY5150_PRESETS[parameters.preset] || PEAVEY5150_PRESETS[0]

  return {
    parameters,
    metering,
    presets: PEAVEY5150_PRESETS,
    currentPreset,
    isLoading: false,
    error: null,
    setPreGain: (v: number) => rt.setParamByIndex(P.PRE_GAIN, v),
    setPostGain: (v: number) => rt.setParamByIndex(P.POST_GAIN, v),
    setLow: (v: number) => rt.setParamByIndex(P.LOW, v),
    setMid: (v: number) => rt.setParamByIndex(P.MID, v),
    setHigh: (v: number) => rt.setParamByIndex(P.HIGH, v),
    setPresence: (v: number) => rt.setParamByIndex(P.PRESENCE, v),
    setResonance: (v: number) => rt.setParamByIndex(P.RESONANCE, v),
    setBright: (v: boolean) => rt.setParamByIndex(P.BRIGHT, v ? 1 : 0),
    setBias: (v: number) => rt.setParamByIndex(P.BIAS, v),
    setBypass: (v: boolean) => rt.setParamByIndex(P.BYPASS, v ? 1 : 0),
    setPreset: (presetName: string) => setPresetMutation.mutate(presetName),
    updateParameters: (params: Record<string, any>) => rt.updateParams(params),
    isConnected: rt.isConnected,
    isPending: setPresetMutation.isPending,
  }
}

export default usePeavey5150
