/**
 * Peavey 5150 Block Letter Amp Simulator Hook
 * 6-stage preamp with cold clipper, Yeh/Smith tone stack,
 * push-pull 6L6GC power amp with supply sag and transformer saturation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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
// Preset Definitions
// ========================================

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

  const { data: ampData, isLoading, error } = useQuery({
    queryKey: ['peavey5150'],
    queryFn: async () => {
      const response = await fetch('/api/engine/amp/peavey5150')
      if (!response.ok) throw new Error('Failed to fetch Peavey 5150 data')
      return response.json()
    },
    refetchInterval: 100,
  })

  const updateParam = useMutation({
    mutationFn: async (params: Record<string, any>) => {
      const response = await fetch('/api/engine/amp/peavey5150/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!response.ok) throw new Error('Failed to update Peavey 5150')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['peavey5150'] }),
  })

  const setPresetMutation = useMutation({
    mutationFn: async (presetName: string) => {
      const response = await fetch(`/api/engine/amp/peavey5150/preset/${presetName}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set preset')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['peavey5150'] }),
  })

  const setBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const response = await fetch(`/api/engine/amp/peavey5150/bypass/${bypass}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set bypass')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['peavey5150'] }),
  })

  const parameters: Peavey5150Parameters = {
    preGain: ampData?.parameters?.pre_gain ?? 5.0,
    postGain: ampData?.parameters?.post_gain ?? 3.0,
    low: ampData?.parameters?.low ?? 5.0,
    mid: ampData?.parameters?.mid ?? 5.0,
    high: ampData?.parameters?.high ?? 5.0,
    presence: ampData?.parameters?.presence ?? 5.0,
    resonance: ampData?.parameters?.resonance ?? 5.0,
    bright: ampData?.parameters?.bright ?? false,
    bias: ampData?.parameters?.bias ?? 3.0,
    preset: ampData?.parameters?.preset ?? 0,
    bypass: ampData?.parameters?.bypass ?? false,
  }

  const metering: Peavey5150Metering = {
    inputLevel: ampData?.metering?.input_level ?? -100,
    outputLevel: ampData?.metering?.output_level ?? -100,
    preampLevel: ampData?.metering?.preamp_level ?? -100,
    powerLevel: ampData?.metering?.power_level ?? -100,
    supplySag: ampData?.metering?.supply_sag ?? 1.0,
    cpuLoad: ampData?.metering?.cpu_load ?? 0,
  }

  const currentPreset = PEAVEY5150_PRESETS[parameters.preset] || PEAVEY5150_PRESETS[0]

  return {
    parameters,
    metering,
    presets: PEAVEY5150_PRESETS,
    currentPreset,
    isLoading,
    error,
    setPreGain: (v: number) => updateParam.mutate({ pre_gain: v }),
    setPostGain: (v: number) => updateParam.mutate({ post_gain: v }),
    setLow: (v: number) => updateParam.mutate({ low: v }),
    setMid: (v: number) => updateParam.mutate({ mid: v }),
    setHigh: (v: number) => updateParam.mutate({ high: v }),
    setPresence: (v: number) => updateParam.mutate({ presence: v }),
    setResonance: (v: number) => updateParam.mutate({ resonance: v }),
    setBright: (v: boolean) => updateParam.mutate({ bright: v }),
    setBias: (v: number) => updateParam.mutate({ bias: v }),
    setBypass: (v: boolean) => setBypassMutation.mutate(v),
    setPreset: (presetName: string) => setPresetMutation.mutate(presetName),
    updateParameters: (params: Record<string, any>) => updateParam.mutate(params),
    isConnected: !!ampData,
    isPending: updateParam.isPending || setPresetMutation.isPending || setBypassMutation.isPending,
  }
}

export default usePeavey5150
