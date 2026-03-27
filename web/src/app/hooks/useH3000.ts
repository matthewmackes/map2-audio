/**
 * Ultra-Harmonizer Hook
 * Pitch shifting and effects emulation with 10 legendary algorithms
 * Defined the sound of studio pitch shifting in the late 80s and 90s
 */

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clusterScopeKey } from '../utils/clusterTransport'
import { getPluginIdentityKeyFromParts } from '../../map2/utils/pluginIdentity'
import { withRuntimeQuery } from './runtimeScopedQuery'

// ========================================
// Types
// ========================================

export interface H3000Parameters {
  algorithm: number          // 0-9 algorithm index
  algorithmName: string      // Algorithm name string
  pitchL: number             // -2400 to +2400 cents (left)
  pitchR: number             // -2400 to +2400 cents (right)
  delayL: number             // 0-1000ms (left)
  delayR: number             // 0-1000ms (right)
  feedback: number           // 0-100%
  crossFeedback: number      // 0-100%
  modDepth: number           // 0-100%
  modRate: number            // 0.1-10Hz
  lowCut: number             // 20-500Hz
  highCut: number            // 2000-20000Hz
  mix: number                // 0-100%
  levelL: number             // 0-100%
  levelR: number             // 0-100%
  glide: number              // 0-1000ms pitch glide time
  bypass: boolean
}

export interface H3000Metering {
  inputLevelL: number
  inputLevelR: number
  outputLevelL: number
  outputLevelR: number
  pitchLActual: number
  pitchRActual: number
  delayLActual: number
  delayRActual: number
  modPhase: number
}

export interface H3000Algorithm {
  index: number
  id: string
  name: string
  shortName: string
  description: string
}

// ========================================
// Algorithm Definitions
// ========================================

export const H3000_ALGORITHMS: H3000Algorithm[] = [
  { index: 0, id: 'micropitch', name: 'MicroPitch', shortName: 'MICRO', description: 'Subtle pitch detune for stereo widening and ADT effects' },
  { index: 1, id: 'dual_shift', name: 'Dual Shift', shortName: 'DUAL', description: 'Independent left/right pitch shifters with modulation' },
  { index: 2, id: 'crystal_echoes', name: 'Crystal Echoes', shortName: 'CRYST', description: 'Shimmering delays with pitch-shifted feedback' },
  { index: 3, id: 'stereo_shift', name: 'Stereo Shift', shortName: 'STERE', description: 'Wide stereo field with complementary pitch offsets' },
  { index: 4, id: 'layered_shift', name: 'Layered Shift', shortName: 'LAYER', description: 'Multiple harmonized voices stacked in unison' },
  { index: 5, id: 'swept_combs', name: 'Swept Combs', shortName: 'COMB', description: 'Modulated comb filters for flanging and metallic effects' },
  { index: 6, id: 'stutter_shift', name: 'Stutter Shift', shortName: 'STUTT', description: 'Glitch-style retriggering with pitch bending' },
  { index: 7, id: 'reverse_pitch', name: 'Reverse Pitch', shortName: 'REVRS', description: 'Reversed grains with pitch manipulation' },
  { index: 8, id: 'band_delays', name: 'Band Delays', shortName: 'BAND', description: 'Multi-band delay with per-band pitch shifting' },
  { index: 9, id: 'patch_factory', name: 'Patch Factory', shortName: 'PATCH', description: 'Complex multi-effect combinations' },
]

// ========================================
// useH3000 Hook
// ========================================

interface UseH3000Options {
  nodeId?: string | null
  instanceId?: number | null
  pluginPosition?: number | null
}

const H3000_URI = 'map2://juce/pitch/h3000'

export function useH3000(options: UseH3000Options = {}) {
  const { nodeId, instanceId, pluginPosition } = options
  const queryClient = useQueryClient()
  const scopeKey = clusterScopeKey(nodeId)
  const pluginScopeKey = getPluginIdentityKeyFromParts(H3000_URI, pluginPosition, instanceId)
  const buildScopedUrl = useCallback((path: string) => withRuntimeQuery(path, {
    instanceId,
    pluginPosition,
    nodeId,
  }), [instanceId, nodeId, pluginPosition])

  const { data: h3000Data, isLoading, error } = useQuery({
    queryKey: ['h3000', scopeKey, pluginScopeKey],
    queryFn: async () => {
      const response = await fetch(buildScopedUrl('/api/engine/h3000'))
      if (!response.ok) throw new Error('Failed to fetch pitch harmonizer data')
      return response.json()
    },
    refetchInterval: 100, // Real-time metering
  })

  const updateParam = useMutation({
    mutationFn: async (params: Partial<H3000Parameters>) => {
      // Convert from UI format to API format (snake_case)
      const apiParams: Record<string, any> = {}
      if (params.algorithm !== undefined) apiParams.algorithm = params.algorithm
      if (params.pitchL !== undefined) apiParams.pitch_l = params.pitchL
      if (params.pitchR !== undefined) apiParams.pitch_r = params.pitchR
      if (params.delayL !== undefined) apiParams.delay_l = params.delayL
      if (params.delayR !== undefined) apiParams.delay_r = params.delayR
      if (params.feedback !== undefined) apiParams.feedback = params.feedback
      if (params.crossFeedback !== undefined) apiParams.cross_feedback = params.crossFeedback
      if (params.modDepth !== undefined) apiParams.mod_depth = params.modDepth
      if (params.modRate !== undefined) apiParams.mod_rate = params.modRate
      if (params.lowCut !== undefined) apiParams.low_cut = params.lowCut
      if (params.highCut !== undefined) apiParams.high_cut = params.highCut
      if (params.mix !== undefined) apiParams.mix = params.mix
      if (params.levelL !== undefined) apiParams.level_l = params.levelL
      if (params.levelR !== undefined) apiParams.level_r = params.levelR
      if (params.glide !== undefined) apiParams.glide = params.glide
      if (params.bypass !== undefined) apiParams.bypass = params.bypass

      const response = await fetch(buildScopedUrl('/api/engine/h3000/parameters'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update pitch harmonizer')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['h3000', scopeKey, pluginScopeKey] }),
  })

  const setAlgorithmMutation = useMutation({
    mutationFn: async (algorithmIndex: number) => {
      const response = await fetch(buildScopedUrl(`/api/engine/h3000/algorithm/${algorithmIndex}`), {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set algorithm')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['h3000', scopeKey, pluginScopeKey] }),
  })

  const setBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const response = await fetch(buildScopedUrl(`/api/engine/h3000/bypass/${bypass}`), {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set bypass')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['h3000', scopeKey, pluginScopeKey] }),
  })

  // Convert from API format (snake_case) to UI format (camelCase)
  const parameters: H3000Parameters = {
    algorithm: h3000Data?.parameters?.algorithm_index ?? 0,
    algorithmName: h3000Data?.parameters?.algorithm ?? 'micropitch',
    pitchL: h3000Data?.parameters?.pitch_l ?? 0,
    pitchR: h3000Data?.parameters?.pitch_r ?? 0,
    delayL: h3000Data?.parameters?.delay_l ?? 15,
    delayR: h3000Data?.parameters?.delay_r ?? 20,
    feedback: h3000Data?.parameters?.feedback ?? 0,
    crossFeedback: h3000Data?.parameters?.cross_feedback ?? 0,
    modDepth: h3000Data?.parameters?.mod_depth ?? 0,
    modRate: h3000Data?.parameters?.mod_rate ?? 0.5,
    lowCut: h3000Data?.parameters?.low_cut ?? 80,
    highCut: h3000Data?.parameters?.high_cut ?? 12000,
    mix: h3000Data?.parameters?.mix ?? 50,
    levelL: h3000Data?.parameters?.level_l ?? 100,
    levelR: h3000Data?.parameters?.level_r ?? 100,
    glide: h3000Data?.parameters?.glide ?? 0,
    bypass: h3000Data?.parameters?.bypass ?? false,
  }

  const metering: H3000Metering = {
    inputLevelL: h3000Data?.metering?.input_level_l ?? -100,
    inputLevelR: h3000Data?.metering?.input_level_r ?? -100,
    outputLevelL: h3000Data?.metering?.output_level_l ?? -100,
    outputLevelR: h3000Data?.metering?.output_level_r ?? -100,
    pitchLActual: h3000Data?.metering?.pitch_l_actual ?? 0,
    pitchRActual: h3000Data?.metering?.pitch_r_actual ?? 0,
    delayLActual: h3000Data?.metering?.delay_l_actual ?? 0,
    delayRActual: h3000Data?.metering?.delay_r_actual ?? 0,
    modPhase: h3000Data?.metering?.mod_phase ?? 0,
  }

  // Get current algorithm info
  const currentAlgorithm = H3000_ALGORITHMS[parameters.algorithm] || H3000_ALGORITHMS[0]

  return {
    parameters,
    metering,
    algorithms: H3000_ALGORITHMS,
    currentAlgorithm,
    isLoading,
    error,
    // Algorithm setter
    setAlgorithm: (index: number) => setAlgorithmMutation.mutate(index),
    // Individual parameter setters
    setPitchL: (v: number) => updateParam.mutate({ pitchL: v }),
    setPitchR: (v: number) => updateParam.mutate({ pitchR: v }),
    setDelayL: (v: number) => updateParam.mutate({ delayL: v }),
    setDelayR: (v: number) => updateParam.mutate({ delayR: v }),
    setFeedback: (v: number) => updateParam.mutate({ feedback: v }),
    setCrossFeedback: (v: number) => updateParam.mutate({ crossFeedback: v }),
    setModDepth: (v: number) => updateParam.mutate({ modDepth: v }),
    setModRate: (v: number) => updateParam.mutate({ modRate: v }),
    setLowCut: (v: number) => updateParam.mutate({ lowCut: v }),
    setHighCut: (v: number) => updateParam.mutate({ highCut: v }),
    setMix: (v: number) => updateParam.mutate({ mix: v }),
    setLevelL: (v: number) => updateParam.mutate({ levelL: v }),
    setLevelR: (v: number) => updateParam.mutate({ levelR: v }),
    setGlide: (v: number) => updateParam.mutate({ glide: v }),
    setBypass: (v: boolean) => setBypassMutation.mutate(v),
    // Bulk update
    updateParameters: (params: Partial<H3000Parameters>) => updateParam.mutate(params),
    isConnected: !!h3000Data,
    isPending: updateParam.isPending || setAlgorithmMutation.isPending || setBypassMutation.isPending,
  }
}

export default useH3000
