/**
 * ShoeGaze Multi-Effect Processor Hook
 * Wall of sound multi-effect inspired by Eventide, Strymon, and Meris pedals
 * Captures the aesthetic of My Bloody Valentine, Slowdive, and Cocteau Twins
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ========================================
// Types
// ========================================

export interface ShoeGazeParameters {
  atmosphere: number       // 0-100% - Master dreamy control
  decay: number            // 0.5-30s - Reverb tail length
  shimmer: number          // 0-100% - Pitch-shifted reverb amount
  shimmerPitch: number     // -12 to +24 semitones
  modulation: number       // 0-100% - Chorus depth
  modRate: number          // 0.1-5Hz - Modulation speed
  drive: number            // 0-100% - Saturation warmth
  delayTime: number        // 0-1000ms - Pre-delay
  delayFeedback: number    // 0-90% - Delay feedback
  delayMod: number         // 0-100% - Delay modulation
  lowCut: number           // 20-500Hz
  highCut: number          // 2000-20000Hz
  mix: number              // 0-100% - Wet/dry blend
  stereoWidth: number      // 0-200% - Stereo spread
  duckingAmount: number    // 0-100% - Input-triggered wet reduction
  preset: number           // Current preset index
  bypass: boolean
}

export interface ShoeGazeMetering {
  inputLevel: number
  outputLevel: number
  reverbLevel: number
  shimmerLevel: number
  lfoPhase: number
  grainActivity: number
  duckingReduction: number
  feedbackLevel: number
  saturationLevel: number
  stereoCorrelation: number
  cpuLoad: number
}

export interface ShoeGazePreset {
  id: string
  name: string
  description: string
  artist?: string
  album?: string
}

// ========================================
// Preset Definitions
// ========================================

export const SHOEGAZE_PRESETS: ShoeGazePreset[] = [
  { id: 'manual', name: 'Manual', description: 'User-defined settings' },
  { id: 'loveless', name: 'Loveless', description: 'Dense, gliding walls of sound', artist: 'My Bloody Valentine', album: 'Loveless (1991)' },
  { id: 'souvlaki', name: 'Souvlaki', description: 'Ethereal, washy dream-pop', artist: 'Slowdive', album: 'Souvlaki (1993)' },
  { id: 'treasure', name: 'Treasure', description: 'Shimmering crystal highs', artist: 'Cocteau Twins', album: 'Treasure (1984)' },
  { id: 'spaceage', name: 'Space Age', description: 'Expansive, evolving soundscapes', artist: 'Spiritualized', album: 'Ladies and Gentlemen... (1997)' },
  { id: 'psychocandy', name: 'Psychocandy', description: 'Feedback-drenched noise-pop', artist: 'Jesus and Mary Chain', album: 'Psychocandy (1985)' },
  { id: 'nowhere', name: 'Nowhere', description: 'Swirling, propulsive textures', artist: 'Ride', album: 'Nowhere (1990)' },
]

// Map preset name to index
export const PRESET_NAME_TO_INDEX: Record<string, number> = {
  'manual': 0,
  'loveless': 1,
  'souvlaki': 2,
  'treasure': 3,
  'spaceage': 4,
  'psychocandy': 5,
  'nowhere': 6,
}

// ========================================
// useShoeGaze Hook
// ========================================

export function useShoeGaze() {
  const queryClient = useQueryClient()

  const { data: shoegazeData, isLoading, error } = useQuery({
    queryKey: ['shoegaze'],
    queryFn: async () => {
      const response = await fetch('/api/engine/shoegaze')
      if (!response.ok) throw new Error('Failed to fetch shoegaze data')
      return response.json()
    },
    refetchInterval: 100, // Real-time metering
  })

  const updateParam = useMutation({
    mutationFn: async (params: Partial<ShoeGazeParameters>) => {
      // Convert from UI format to API format (snake_case)
      const apiParams: Record<string, any> = {}
      if (params.atmosphere !== undefined) apiParams.atmosphere = params.atmosphere
      if (params.decay !== undefined) apiParams.decay = params.decay
      if (params.shimmer !== undefined) apiParams.shimmer = params.shimmer
      if (params.shimmerPitch !== undefined) apiParams.shimmer_pitch = params.shimmerPitch
      if (params.modulation !== undefined) apiParams.modulation = params.modulation
      if (params.modRate !== undefined) apiParams.mod_rate = params.modRate
      if (params.drive !== undefined) apiParams.drive = params.drive
      if (params.delayTime !== undefined) apiParams.delay_time = params.delayTime
      if (params.delayFeedback !== undefined) apiParams.delay_feedback = params.delayFeedback
      if (params.delayMod !== undefined) apiParams.delay_mod = params.delayMod
      if (params.lowCut !== undefined) apiParams.low_cut = params.lowCut
      if (params.highCut !== undefined) apiParams.high_cut = params.highCut
      if (params.mix !== undefined) apiParams.mix = params.mix
      if (params.stereoWidth !== undefined) apiParams.stereo_width = params.stereoWidth
      if (params.duckingAmount !== undefined) apiParams.ducking_amount = params.duckingAmount
      if (params.bypass !== undefined) apiParams.bypass = params.bypass

      const response = await fetch('/api/engine/shoegaze/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update shoegaze')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoegaze'] }),
  })

  const setPreset = useMutation({
    mutationFn: async (presetName: string) => {
      const response = await fetch(`/api/engine/shoegaze/preset/${presetName}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set preset')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoegaze'] }),
  })

  const setBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const response = await fetch(`/api/engine/shoegaze/bypass/${bypass}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set bypass')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shoegaze'] }),
  })

  // Convert from API format (snake_case) to UI format (camelCase)
  const parameters: ShoeGazeParameters = {
    atmosphere: shoegazeData?.parameters?.atmosphere ?? 50,
    decay: shoegazeData?.parameters?.decay ?? 4.0,
    shimmer: shoegazeData?.parameters?.shimmer ?? 25,
    shimmerPitch: shoegazeData?.parameters?.shimmer_pitch ?? 12,
    modulation: shoegazeData?.parameters?.modulation ?? 35,
    modRate: shoegazeData?.parameters?.mod_rate ?? 0.7,
    drive: shoegazeData?.parameters?.drive ?? 15,
    delayTime: shoegazeData?.parameters?.delay_time ?? 200,
    delayFeedback: shoegazeData?.parameters?.delay_feedback ?? 30,
    delayMod: shoegazeData?.parameters?.delay_mod ?? 20,
    lowCut: shoegazeData?.parameters?.low_cut ?? 80,
    highCut: shoegazeData?.parameters?.high_cut ?? 8000,
    mix: shoegazeData?.parameters?.mix ?? 50,
    stereoWidth: shoegazeData?.parameters?.stereo_width ?? 150,
    duckingAmount: shoegazeData?.parameters?.ducking_amount ?? 20,
    preset: shoegazeData?.parameters?.preset ?? 0,
    bypass: shoegazeData?.parameters?.bypass ?? false,
  }

  const metering: ShoeGazeMetering = {
    inputLevel: shoegazeData?.metering?.input_level ?? -100,
    outputLevel: shoegazeData?.metering?.output_level ?? -100,
    reverbLevel: shoegazeData?.metering?.reverb_level ?? -100,
    shimmerLevel: shoegazeData?.metering?.shimmer_level ?? -100,
    lfoPhase: shoegazeData?.metering?.lfo_phase ?? 0,
    grainActivity: shoegazeData?.metering?.grain_activity ?? 0,
    duckingReduction: shoegazeData?.metering?.ducking_reduction ?? 0,
    feedbackLevel: shoegazeData?.metering?.feedback_level ?? -100,
    saturationLevel: shoegazeData?.metering?.saturation_level ?? 0,
    stereoCorrelation: shoegazeData?.metering?.stereo_correlation ?? 1,
    cpuLoad: shoegazeData?.metering?.cpu_load ?? 0,
  }

  // Get current preset info
  const currentPreset = SHOEGAZE_PRESETS[parameters.preset] || SHOEGAZE_PRESETS[0]

  return {
    parameters,
    metering,
    presets: SHOEGAZE_PRESETS,
    currentPreset,
    isLoading,
    error,
    // Individual parameter setters
    setAtmosphere: (v: number) => updateParam.mutate({ atmosphere: v }),
    setDecay: (v: number) => updateParam.mutate({ decay: v }),
    setShimmer: (v: number) => updateParam.mutate({ shimmer: v }),
    setShimmerPitch: (v: number) => updateParam.mutate({ shimmerPitch: v }),
    setModulation: (v: number) => updateParam.mutate({ modulation: v }),
    setModRate: (v: number) => updateParam.mutate({ modRate: v }),
    setDrive: (v: number) => updateParam.mutate({ drive: v }),
    setDelayTime: (v: number) => updateParam.mutate({ delayTime: v }),
    setDelayFeedback: (v: number) => updateParam.mutate({ delayFeedback: v }),
    setDelayMod: (v: number) => updateParam.mutate({ delayMod: v }),
    setLowCut: (v: number) => updateParam.mutate({ lowCut: v }),
    setHighCut: (v: number) => updateParam.mutate({ highCut: v }),
    setMix: (v: number) => updateParam.mutate({ mix: v }),
    setStereoWidth: (v: number) => updateParam.mutate({ stereoWidth: v }),
    setDuckingAmount: (v: number) => updateParam.mutate({ duckingAmount: v }),
    setBypass: (v: boolean) => setBypassMutation.mutate(v),
    setPreset: (presetName: string) => setPreset.mutate(presetName),
    // Bulk update
    updateParameters: (params: Partial<ShoeGazeParameters>) => updateParam.mutate(params),
    isConnected: !!shoegazeData,
    isPending: updateParam.isPending || setPreset.isPending || setBypassMutation.isPending,
  }
}

export default useShoeGaze
