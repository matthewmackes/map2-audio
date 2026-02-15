/**
 * Multi-Effect Hook
 * Professional multi-effect with 10 legendary algorithms
 * Features phase vocoder pitch shifting, granular synthesis, and freeverb reverb
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ========================================
// Types
// ========================================

export interface H9Parameters {
  algorithm: number          // 0-9 algorithm index
  inputGain: number          // -12 to +12 dB
  outputGain: number         // -12 to +12 dB
  mix: number                // 0-1 (dry/wet)
  bypass: boolean
}

export interface H9Metering {
  inputLevelL: number
  inputLevelR: number
  outputLevelL: number
  outputLevelR: number
  clipping: boolean
}

export interface H9Algorithm {
  index: number
  id: string
  name: string
  shortName: string
  description: string
}

// ========================================
// Algorithm Definitions
// ========================================

export const H9_ALGORITHMS: H9Algorithm[] = [
  {
    index: 0,
    id: 'micropitch',
    name: 'MicroPitch',
    shortName: 'uPitch',
    description: 'LFO-detuned copies with modulation for lush chorus effects',
  },
  {
    index: 1,
    id: 'ultrashift',
    name: 'UltraShift',
    shortName: 'uShift',
    description: 'STFT pitch shift with formant preservation for natural shifting',
  },
  {
    index: 2,
    id: 'smartshift',
    name: 'SmartShift',
    shortName: 'Smart',
    description: 'Pitch detection + intelligent shifting for auto-harmonics',
  },
  {
    index: 3,
    id: 'transpose',
    name: 'Transpose',
    shortName: 'Xpose',
    description: 'Fast octave and interval shifting',
  },
  {
    index: 4,
    id: 'pitchfactor',
    name: 'PitchFactor',
    shortName: 'PFact',
    description: '4-voice harmonic harmonizer for rich harmonies',
  },
  {
    index: 5,
    id: 'reversedelays',
    name: 'ReverseDelays',
    shortName: 'RevDl',
    description: 'Time-reversed delay effects for creative textures',
  },
  {
    index: 6,
    id: 'shimmerverbs',
    name: 'ShimmerVerbs',
    shortName: 'Shimm',
    description: 'Freeverb + octave-up shimmer for ethereal ambience',
  },
  {
    index: 7,
    id: 'motionreverbs',
    name: 'MotionReverbs',
    shortName: 'Motion',
    description: 'Reverb with LFO modulation for evolving spaces',
  },
  {
    index: 8,
    id: 'granular',
    name: 'Granular',
    shortName: 'Grain',
    description: '32-grain cloud synthesis for ambient textures',
  },
  {
    index: 9,
    id: 'crystallize',
    name: 'Crystallize',
    shortName: 'Cryst',
    description: 'Granular synthesis + reverb fusion for crystalline effects',
  },
]

// ========================================
// Default Parameters
// ========================================

const DEFAULT_PARAMETERS: H9Parameters = {
  algorithm: 0,
  inputGain: 0,
  outputGain: 0,
  mix: 0.5,
  bypass: false,
}

const DEFAULT_METERING: H9Metering = {
  inputLevelL: 0,
  inputLevelR: 0,
  outputLevelL: 0,
  outputLevelR: 0,
  clipping: false,
}

// ========================================
// Hook Implementation
// ========================================

export function useH9() {
  const queryClient = useQueryClient()

  // Mock implementation - in real use, this would query the backend
  const { data: parameters = DEFAULT_PARAMETERS } = useQuery({
    queryKey: ['h9Parameters'],
    queryFn: async () => DEFAULT_PARAMETERS,
    staleTime: Infinity,
  })

  const { data: metering = DEFAULT_METERING } = useQuery({
    queryKey: ['h9Metering'],
    queryFn: async () => DEFAULT_METERING,
    staleTime: 0, // Always fresh for metering
    refetchInterval: 50, // Update every 50ms
  })

  // Parameter update mutations
  const setAlgorithmMutation = useMutation({
    mutationFn: async (value: number) => {
      queryClient.setQueryData(['h9Parameters'], (old: H9Parameters) => ({
        ...old,
        algorithm: value,
      }))
    },
  })

  const setInputGainMutation = useMutation({
    mutationFn: async (value: number) => {
      queryClient.setQueryData(['h9Parameters'], (old: H9Parameters) => ({
        ...old,
        inputGain: value,
      }))
    },
  })

  const setOutputGainMutation = useMutation({
    mutationFn: async (value: number) => {
      queryClient.setQueryData(['h9Parameters'], (old: H9Parameters) => ({
        ...old,
        outputGain: value,
      }))
    },
  })

  const setMixMutation = useMutation({
    mutationFn: async (value: number) => {
      queryClient.setQueryData(['h9Parameters'], (old: H9Parameters) => ({
        ...old,
        mix: value,
      }))
    },
  })

  const setBypassMutation = useMutation({
    mutationFn: async (value: boolean) => {
      queryClient.setQueryData(['h9Parameters'], (old: H9Parameters) => ({
        ...old,
        bypass: value,
      }))
    },
  })

  // Return hook interface
  return {
    // State
    parameters,
    metering,
    algorithms: H9_ALGORITHMS,
    currentAlgorithm: H9_ALGORITHMS[parameters.algorithm] || H9_ALGORITHMS[0],

    // Setters
    setAlgorithm: setAlgorithmMutation.mutate,
    setInputGain: setInputGainMutation.mutate,
    setOutputGain: setOutputGainMutation.mutate,
    setMix: setMixMutation.mutate,
    setBypass: setBypassMutation.mutate,

    // Status
    isConnected: true,
    isLoading: false,
  }
}
