/**
 * LexiLove Reverb Hook
 * Algorithmic reverb emulation with 9 legendary presets
 * Captures the legendary "depth and sparkle" sound
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ========================================
// Types
// ========================================

export interface LexiLoveParameters {
  algorithm: number          // 0-8 algorithm index
  algorithmName: string      // Algorithm name string
  preDelay: number           // 0-500ms
  decayTime: number          // 0.5-30s RT60
  diffusion: number          // 0-100%
  lowDecayMult: number       // 0.25-2.0
  highDecayMult: number      // 0.25-2.0
  lowCrossover: number       // 100-2000Hz
  highCrossover: number      // 2000-15000Hz
  earlyLevel: number         // 0-100%
  earlyPattern: number       // 0-100%
  modDepth: number           // 0-100%
  modRate: number            // 0.1-10Hz
  mix: number                // 0-100%
  highCut: number            // 1000-20000Hz
  lowCut: number             // 20-500Hz
  spillover: boolean
  bypass: boolean
}

export interface LexiLoveMetering {
  inputLevelL: number
  inputLevelR: number
  outputLevelL: number
  outputLevelR: number
  reverbLevelL: number
  reverbLevelR: number
  earlyLevel: number
  lateLevel: number
  modLfoPhase: number
  currentDecay: number
}

export interface LexiLoveAlgorithm {
  index: number
  id: string
  name: string
  shortName: string
  description: string
}

// ========================================
// Algorithm Definitions
// ========================================

export const LEXI_ALGORITHMS: LexiLoveAlgorithm[] = [
  { index: 0, id: 'tiled_room', name: 'Tiled Room V2.0', shortName: 'TILED', description: 'Legendary preset with "spitty" early reflections - lively on drums' },
  { index: 1, id: 'rich_plate', name: 'Rich Plate', shortName: 'PLATE', description: 'Warm vocals - the studio standard for countless recordings' },
  { index: 2, id: 'concert_hall', name: 'Concert Hall', shortName: 'HALL', description: 'Classic 80s reverb with time variation and sparkle' },
  { index: 3, id: 'small_room', name: 'Small Room', shortName: 'SMALL', description: 'Tight, customizable space for close-mic sounds' },
  { index: 4, id: 'rich_chamber', name: 'Rich Chamber', shortName: 'CHAMB', description: 'Warm thick chamber with prominent early reflections' },
  { index: 5, id: 'gymnasium', name: 'Gymnasium', shortName: 'GYM', description: 'Large acoustic space simulation with long decay' },
  { index: 6, id: 'long_hall', name: 'Long Hall', shortName: 'LONG', description: 'Extended decay concert hall for ambient textures' },
  { index: 7, id: 'gated_plate', name: 'Gated Plate', shortName: 'GATED', description: 'Compressed/gated reverb for drums and dramatic effects' },
  { index: 8, id: 'infinite', name: 'Infinite', shortName: 'INF', description: 'Special effects and atmospheric textures - near-infinite decay' },
]

// ========================================
// useLexiLove Hook
// ========================================

export function useLexiLove() {
  const queryClient = useQueryClient()

  const { data: lexiData, isLoading, error } = useQuery({
    queryKey: ['lexilove'],
    queryFn: async () => {
      const response = await fetch('/api/engine/lexilove')
      if (!response.ok) throw new Error('Failed to fetch Lexi Love data')
      return response.json()
    },
    refetchInterval: 100, // Real-time metering
  })

  const updateParam = useMutation({
    mutationFn: async (params: Partial<LexiLoveParameters>) => {
      // Convert from UI format to API format (snake_case)
      const apiParams: Record<string, any> = {}
      if (params.algorithm !== undefined) apiParams.algorithm = params.algorithm
      if (params.preDelay !== undefined) apiParams.pre_delay = params.preDelay
      if (params.decayTime !== undefined) apiParams.decay_time = params.decayTime
      if (params.diffusion !== undefined) apiParams.diffusion = params.diffusion
      if (params.lowDecayMult !== undefined) apiParams.low_decay_mult = params.lowDecayMult
      if (params.highDecayMult !== undefined) apiParams.high_decay_mult = params.highDecayMult
      if (params.lowCrossover !== undefined) apiParams.low_crossover = params.lowCrossover
      if (params.highCrossover !== undefined) apiParams.high_crossover = params.highCrossover
      if (params.earlyLevel !== undefined) apiParams.early_level = params.earlyLevel
      if (params.earlyPattern !== undefined) apiParams.early_pattern = params.earlyPattern
      if (params.modDepth !== undefined) apiParams.mod_depth = params.modDepth
      if (params.modRate !== undefined) apiParams.mod_rate = params.modRate
      if (params.mix !== undefined) apiParams.mix = params.mix
      if (params.highCut !== undefined) apiParams.high_cut = params.highCut
      if (params.lowCut !== undefined) apiParams.low_cut = params.lowCut
      if (params.spillover !== undefined) apiParams.spillover = params.spillover
      if (params.bypass !== undefined) apiParams.bypass = params.bypass

      const response = await fetch('/api/engine/lexilove/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update Lexi Love')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lexilove'] }),
  })

  const setAlgorithmMutation = useMutation({
    mutationFn: async (algorithmIndex: number) => {
      const response = await fetch(`/api/engine/lexilove/algorithm/${algorithmIndex}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set algorithm')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lexilove'] }),
  })

  const setBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const response = await fetch(`/api/engine/lexilove/bypass/${bypass}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set bypass')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lexilove'] }),
  })

  // Convert from API format (snake_case) to UI format (camelCase)
  const parameters: LexiLoveParameters = {
    algorithm: lexiData?.parameters?.algorithm_index ?? 1,
    algorithmName: lexiData?.parameters?.algorithm ?? 'rich_plate',
    preDelay: lexiData?.parameters?.pre_delay ?? 40,
    decayTime: lexiData?.parameters?.decay_time ?? 2.5,
    diffusion: lexiData?.parameters?.diffusion ?? 85,
    lowDecayMult: lexiData?.parameters?.low_decay_mult ?? 1.0,
    highDecayMult: lexiData?.parameters?.high_decay_mult ?? 0.8,
    lowCrossover: lexiData?.parameters?.low_crossover ?? 500,
    highCrossover: lexiData?.parameters?.high_crossover ?? 9000,
    earlyLevel: lexiData?.parameters?.early_level ?? 70,
    earlyPattern: lexiData?.parameters?.early_pattern ?? 50,
    modDepth: lexiData?.parameters?.mod_depth ?? 15,
    modRate: lexiData?.parameters?.mod_rate ?? 0.8,
    mix: lexiData?.parameters?.mix ?? 35,
    highCut: lexiData?.parameters?.high_cut ?? 12000,
    lowCut: lexiData?.parameters?.low_cut ?? 40,
    spillover: lexiData?.parameters?.spillover ?? true,
    bypass: lexiData?.parameters?.bypass ?? false,
  }

  const metering: LexiLoveMetering = {
    inputLevelL: lexiData?.metering?.input_level_l ?? -100,
    inputLevelR: lexiData?.metering?.input_level_r ?? -100,
    outputLevelL: lexiData?.metering?.output_level_l ?? -100,
    outputLevelR: lexiData?.metering?.output_level_r ?? -100,
    reverbLevelL: lexiData?.metering?.reverb_level_l ?? -100,
    reverbLevelR: lexiData?.metering?.reverb_level_r ?? -100,
    earlyLevel: lexiData?.metering?.early_level ?? -100,
    lateLevel: lexiData?.metering?.late_level ?? -100,
    modLfoPhase: lexiData?.metering?.mod_lfo_phase ?? 0,
    currentDecay: lexiData?.metering?.current_decay ?? 2.5,
  }

  // Get current algorithm info
  const currentAlgorithm = LEXI_ALGORITHMS[parameters.algorithm] || LEXI_ALGORITHMS[1]

  return {
    parameters,
    metering,
    algorithms: LEXI_ALGORITHMS,
    currentAlgorithm,
    isLoading,
    error,
    // Algorithm setter
    setAlgorithm: (index: number) => setAlgorithmMutation.mutate(index),
    // Individual parameter setters
    setPreDelay: (v: number) => updateParam.mutate({ preDelay: v }),
    setDecayTime: (v: number) => updateParam.mutate({ decayTime: v }),
    setDiffusion: (v: number) => updateParam.mutate({ diffusion: v }),
    setLowDecayMult: (v: number) => updateParam.mutate({ lowDecayMult: v }),
    setHighDecayMult: (v: number) => updateParam.mutate({ highDecayMult: v }),
    setLowCrossover: (v: number) => updateParam.mutate({ lowCrossover: v }),
    setHighCrossover: (v: number) => updateParam.mutate({ highCrossover: v }),
    setEarlyLevel: (v: number) => updateParam.mutate({ earlyLevel: v }),
    setEarlyPattern: (v: number) => updateParam.mutate({ earlyPattern: v }),
    setModDepth: (v: number) => updateParam.mutate({ modDepth: v }),
    setModRate: (v: number) => updateParam.mutate({ modRate: v }),
    setMix: (v: number) => updateParam.mutate({ mix: v }),
    setHighCut: (v: number) => updateParam.mutate({ highCut: v }),
    setLowCut: (v: number) => updateParam.mutate({ lowCut: v }),
    setSpillover: (v: boolean) => updateParam.mutate({ spillover: v }),
    setBypass: (v: boolean) => setBypassMutation.mutate(v),
    // Bulk update
    updateParameters: (params: Partial<LexiLoveParameters>) => updateParam.mutate(params),
    isConnected: !!lexiData,
    isPending: updateParam.isPending || setAlgorithmMutation.isPending || setBypassMutation.isPending,
  }
}

export default useLexiLove
