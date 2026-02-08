/**
 * PassionFX Multi-Effect Processor Hook
 * Full signal chain multi-effect inspired by Steve Vai's legendary rack setup
 * Gate > Comp > Wah > Phaser > Chorus > Pitch > Harmonizer > Delay > Reverb > EQ > Exciter > Tremolo
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ========================================
// Types
// ========================================

export interface PassionFXParameters {
  // Gate
  gateEnabled: boolean
  gateThreshold: number       // -80 to 0 dB
  gateRelease: number         // 1-500 ms
  // Compressor
  compEnabled: boolean
  compThreshold: number       // -60 to 0 dB
  compRatio: number           // 1-20
  compAttack: number          // 0.1-100 ms
  compRelease: number         // 10-1000 ms
  compGlassy: boolean         // Vai-style glassy compression
  // Wah
  wahEnabled: boolean
  wahMode: number             // 0=Auto, 1=Manual, 2=Envelope
  wahPosition: number         // 0-100%
  wahQ: number                // 0.5-10
  // Phaser
  phaserEnabled: boolean
  phaserRate: number          // 0.05-10 Hz
  phaserDepth: number         // 0-100%
  phaserStages: number        // 2, 4, 6, 8, 10, 12
  phaserFeedback: number      // -100 to 100%
  // Chorus
  chorusEnabled: boolean
  chorusRate: number          // 0.1-5 Hz
  chorusDepth: number         // 0-100%
  chorusVoices: number        // 1-4
  chorusMix: number           // 0-100%
  // Pitch Shifter
  pitchEnabled: boolean
  pitchSemitones: number      // -24 to +24
  pitchMix: number            // 0-100%
  // Harmonizer
  harmEnabled: boolean
  harmVoice1Interval: number  // -12 to +12 semitones
  harmVoice2Interval: number  // -12 to +12 semitones
  harmDetuneCents: number     // -50 to +50 cents
  harmMix: number             // 0-100%
  // Delay
  delayEnabled: boolean
  delayTimeL: number          // 0-2000 ms
  delayTimeR: number          // 0-2000 ms
  delayFeedback: number       // 0-95%
  delayMix: number            // 0-100%
  delayFreeze: boolean
  delayPitchShiftL: number    // -12 to +12 semitones
  delayPitchShiftR: number    // -12 to +12 semitones
  // Reverb
  reverbEnabled: boolean
  reverbType: number          // 0=Hall, 1=Plate, 2=Chamber, 3=Spring, 4=Shimmer
  reverbDecay: number         // 0.1-30 s
  reverbShimmerAmount: number // 0-100%
  reverbShimmerInterval: number // semitones: 5, 7, 12, 19, 24
  reverbMix: number           // 0-100%
  reverbFreeze: boolean
  // EQ
  eqEnabled: boolean
  eqLowGain: number          // -12 to +12 dB
  eqMidGain: number          // -12 to +12 dB
  eqHighGain: number         // -12 to +12 dB
  eqTilt: number             // -6 to +6 dB
  // Exciter
  exciterEnabled: boolean
  exciterWarmth: number       // 0-100%
  exciterPresence: number     // 0-100%
  exciterAir: number          // 0-100%
  // Tremolo
  tremEnabled: boolean
  tremRate: number            // 0.5-15 Hz
  tremDepth: number           // 0-100%
  tremWaveform: number        // 0=Sine, 1=Triangle, 2=Square
  // Master
  mix: number                 // 0-100%
  outputLevel: number         // -24 to +12 dB
  preset: string              // Current preset ID
  bypass: boolean
}

export interface PassionFXMetering {
  inputLevel: number          // dB
  outputLevel: number         // dB
  gateGain: number            // dB reduction
  compGainReduction: number   // dB reduction
  reverbLevel: number         // dB
  delayLevel: number          // dB
}

export interface PassionFXPreset {
  id: string
  name: string
  track: string
}

// ========================================
// Preset Definitions - Passion and Warfare tracks
// ========================================

export const PASSIONFX_PRESETS: PassionFXPreset[] = [
  { id: 'manual', name: 'Manual', track: '' },
  { id: 'liberty', name: 'Liberty', track: 'Track 1' },
  { id: 'erotic_nightmares', name: 'Erotic Nightmares', track: 'Track 2' },
  { id: 'the_animal', name: 'The Animal', track: 'Track 3' },
  { id: 'answers', name: 'Answers', track: 'Track 4' },
  { id: 'the_riddle', name: 'The Riddle', track: 'Track 5' },
  { id: 'ballerina_12_24', name: 'Ballerina 12/24', track: 'Track 6' },
  { id: 'for_the_love_of_god', name: 'For the Love of God', track: 'Track 7' },
  { id: 'the_audience_is_listening', name: 'The Audience Is Listening', track: 'Track 8' },
  { id: 'i_would_love_to', name: 'I Would Love To', track: 'Track 9' },
  { id: 'blue_powder', name: 'Blue Powder', track: 'Track 10' },
  { id: 'greasy_kids_stuff', name: "Greasy Kid's Stuff", track: 'Track 11' },
  { id: 'alien_water_kiss', name: 'Alien Water Kiss', track: 'Track 12' },
  { id: 'sisters', name: 'Sisters', track: 'Track 13' },
  { id: 'love_secrets', name: 'Love Secrets', track: 'Track 14' },
]

// Map preset name to ID for quick lookup
export const PRESET_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  PASSIONFX_PRESETS.map((p) => [p.id, p.name])
)

// ========================================
// camelCase to snake_case mapping
// ========================================

const PARAM_KEY_MAP: Record<string, string> = {
  gateEnabled: 'gate_enabled',
  gateThreshold: 'gate_threshold',
  gateRelease: 'gate_release',
  compEnabled: 'comp_enabled',
  compThreshold: 'comp_threshold',
  compRatio: 'comp_ratio',
  compAttack: 'comp_attack',
  compRelease: 'comp_release',
  compGlassy: 'comp_glassy',
  wahEnabled: 'wah_enabled',
  wahMode: 'wah_mode',
  wahPosition: 'wah_position',
  wahQ: 'wah_q',
  phaserEnabled: 'phaser_enabled',
  phaserRate: 'phaser_rate',
  phaserDepth: 'phaser_depth',
  phaserStages: 'phaser_stages',
  phaserFeedback: 'phaser_feedback',
  chorusEnabled: 'chorus_enabled',
  chorusRate: 'chorus_rate',
  chorusDepth: 'chorus_depth',
  chorusVoices: 'chorus_voices',
  chorusMix: 'chorus_mix',
  pitchEnabled: 'pitch_enabled',
  pitchSemitones: 'pitch_semitones',
  pitchMix: 'pitch_mix',
  harmEnabled: 'harm_enabled',
  harmVoice1Interval: 'harm_voice1_interval',
  harmVoice2Interval: 'harm_voice2_interval',
  harmDetuneCents: 'harm_detune_cents',
  harmMix: 'harm_mix',
  delayEnabled: 'delay_enabled',
  delayTimeL: 'delay_time_l',
  delayTimeR: 'delay_time_r',
  delayFeedback: 'delay_feedback',
  delayMix: 'delay_mix',
  delayFreeze: 'delay_freeze',
  delayPitchShiftL: 'delay_pitch_shift_l',
  delayPitchShiftR: 'delay_pitch_shift_r',
  reverbEnabled: 'reverb_enabled',
  reverbType: 'reverb_type',
  reverbDecay: 'reverb_decay',
  reverbShimmerAmount: 'reverb_shimmer_amount',
  reverbShimmerInterval: 'reverb_shimmer_interval',
  reverbMix: 'reverb_mix',
  reverbFreeze: 'reverb_freeze',
  eqEnabled: 'eq_enabled',
  eqLowGain: 'eq_low_gain',
  eqMidGain: 'eq_mid_gain',
  eqHighGain: 'eq_high_gain',
  eqTilt: 'eq_tilt',
  exciterEnabled: 'exciter_enabled',
  exciterWarmth: 'exciter_warmth',
  exciterPresence: 'exciter_presence',
  exciterAir: 'exciter_air',
  tremEnabled: 'trem_enabled',
  tremRate: 'trem_rate',
  tremDepth: 'trem_depth',
  tremWaveform: 'trem_waveform',
  mix: 'mix',
  outputLevel: 'output_level',
  preset: 'preset',
  bypass: 'bypass',
}

// Reverse mapping: snake_case -> camelCase
const API_KEY_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(PARAM_KEY_MAP).map(([camel, snake]) => [snake, camel])
)

function toApiParams(params: Partial<PassionFXParameters>): Record<string, any> {
  const apiParams: Record<string, any> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      const apiKey = PARAM_KEY_MAP[key] || key
      apiParams[apiKey] = value
    }
  }
  return apiParams
}

function fromApiParams(api: Record<string, any>): Partial<PassionFXParameters> {
  const params: Record<string, any> = {}
  for (const [key, value] of Object.entries(api)) {
    const camelKey = API_KEY_MAP[key] || key
    params[camelKey] = value
  }
  return params as Partial<PassionFXParameters>
}

// ========================================
// Default parameter values
// ========================================

const DEFAULT_PARAMETERS: PassionFXParameters = {
  gateEnabled: false,
  gateThreshold: -40,
  gateRelease: 50,
  compEnabled: false,
  compThreshold: -20,
  compRatio: 4,
  compAttack: 10,
  compRelease: 100,
  compGlassy: false,
  wahEnabled: false,
  wahMode: 0,
  wahPosition: 50,
  wahQ: 3,
  phaserEnabled: false,
  phaserRate: 0.5,
  phaserDepth: 50,
  phaserStages: 4,
  phaserFeedback: 30,
  chorusEnabled: false,
  chorusRate: 0.8,
  chorusDepth: 40,
  chorusVoices: 2,
  chorusMix: 50,
  pitchEnabled: false,
  pitchSemitones: 0,
  pitchMix: 50,
  harmEnabled: false,
  harmVoice1Interval: 4,
  harmVoice2Interval: 7,
  harmDetuneCents: 0,
  harmMix: 50,
  delayEnabled: false,
  delayTimeL: 375,
  delayTimeR: 375,
  delayFeedback: 35,
  delayMix: 30,
  delayFreeze: false,
  delayPitchShiftL: 0,
  delayPitchShiftR: 0,
  reverbEnabled: false,
  reverbType: 0,
  reverbDecay: 2.5,
  reverbShimmerAmount: 0,
  reverbShimmerInterval: 12,
  reverbMix: 25,
  reverbFreeze: false,
  eqEnabled: false,
  eqLowGain: 0,
  eqMidGain: 0,
  eqHighGain: 0,
  eqTilt: 0,
  exciterEnabled: false,
  exciterWarmth: 30,
  exciterPresence: 40,
  exciterAir: 20,
  tremEnabled: false,
  tremRate: 4,
  tremDepth: 50,
  tremWaveform: 0,
  mix: 100,
  outputLevel: 0,
  preset: 'manual',
  bypass: false,
}

// ========================================
// usePassionFX Hook
// ========================================

export function usePassionFX() {
  const queryClient = useQueryClient()

  const { data: passionfxData, isLoading, error } = useQuery({
    queryKey: ['passionfx'],
    queryFn: async () => {
      const response = await fetch('/api/engine/multieffect/passionfx')
      if (!response.ok) throw new Error('Failed to fetch passionfx data')
      return response.json()
    },
    refetchInterval: 100, // Real-time metering
  })

  const updateParam = useMutation({
    mutationFn: async (params: Partial<PassionFXParameters>) => {
      const apiParams = toApiParams(params)

      const response = await fetch('/api/engine/multieffect/passionfx/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update passionfx')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['passionfx'] }),
  })

  const setPresetMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const response = await fetch(`/api/engine/multieffect/passionfx/preset/${presetId}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set preset')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['passionfx'] }),
  })

  const setBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const response = await fetch(`/api/engine/multieffect/passionfx/bypass/${bypass}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set bypass')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['passionfx'] }),
  })

  // Convert from API format (snake_case) to UI format (camelCase)
  const rawParams = passionfxData?.parameters
    ? fromApiParams(passionfxData.parameters)
    : {}

  const parameters: PassionFXParameters = {
    ...DEFAULT_PARAMETERS,
    ...rawParams,
  }

  const metering: PassionFXMetering = {
    inputLevel: passionfxData?.metering?.input_level ?? -100,
    outputLevel: passionfxData?.metering?.output_level ?? -100,
    gateGain: passionfxData?.metering?.gate_gain ?? 0,
    compGainReduction: passionfxData?.metering?.comp_gain_reduction ?? 0,
    reverbLevel: passionfxData?.metering?.reverb_level ?? -100,
    delayLevel: passionfxData?.metering?.delay_level ?? -100,
  }

  // Get current preset info
  const currentPreset = PASSIONFX_PRESETS.find((p) => p.id === parameters.preset) || PASSIONFX_PRESETS[0]

  return {
    parameters,
    metering,
    presets: PASSIONFX_PRESETS,
    currentPreset,
    isLoading,
    error,

    // Gate
    setGateEnabled: (v: boolean) => updateParam.mutate({ gateEnabled: v }),
    setGateThreshold: (v: number) => updateParam.mutate({ gateThreshold: v }),
    setGateRelease: (v: number) => updateParam.mutate({ gateRelease: v }),

    // Compressor
    setCompEnabled: (v: boolean) => updateParam.mutate({ compEnabled: v }),
    setCompThreshold: (v: number) => updateParam.mutate({ compThreshold: v }),
    setCompRatio: (v: number) => updateParam.mutate({ compRatio: v }),
    setCompAttack: (v: number) => updateParam.mutate({ compAttack: v }),
    setCompRelease: (v: number) => updateParam.mutate({ compRelease: v }),
    setCompGlassy: (v: boolean) => updateParam.mutate({ compGlassy: v }),

    // Wah
    setWahEnabled: (v: boolean) => updateParam.mutate({ wahEnabled: v }),
    setWahMode: (v: number) => updateParam.mutate({ wahMode: v }),
    setWahPosition: (v: number) => updateParam.mutate({ wahPosition: v }),
    setWahQ: (v: number) => updateParam.mutate({ wahQ: v }),

    // Phaser
    setPhaserEnabled: (v: boolean) => updateParam.mutate({ phaserEnabled: v }),
    setPhaserRate: (v: number) => updateParam.mutate({ phaserRate: v }),
    setPhaserDepth: (v: number) => updateParam.mutate({ phaserDepth: v }),
    setPhaserStages: (v: number) => updateParam.mutate({ phaserStages: v }),
    setPhaserFeedback: (v: number) => updateParam.mutate({ phaserFeedback: v }),

    // Chorus
    setChorusEnabled: (v: boolean) => updateParam.mutate({ chorusEnabled: v }),
    setChorusRate: (v: number) => updateParam.mutate({ chorusRate: v }),
    setChorusDepth: (v: number) => updateParam.mutate({ chorusDepth: v }),
    setChorusVoices: (v: number) => updateParam.mutate({ chorusVoices: v }),
    setChorusMix: (v: number) => updateParam.mutate({ chorusMix: v }),

    // Pitch Shifter
    setPitchEnabled: (v: boolean) => updateParam.mutate({ pitchEnabled: v }),
    setPitchSemitones: (v: number) => updateParam.mutate({ pitchSemitones: v }),
    setPitchMix: (v: number) => updateParam.mutate({ pitchMix: v }),

    // Harmonizer
    setHarmEnabled: (v: boolean) => updateParam.mutate({ harmEnabled: v }),
    setHarmVoice1Interval: (v: number) => updateParam.mutate({ harmVoice1Interval: v }),
    setHarmVoice2Interval: (v: number) => updateParam.mutate({ harmVoice2Interval: v }),
    setHarmDetuneCents: (v: number) => updateParam.mutate({ harmDetuneCents: v }),
    setHarmMix: (v: number) => updateParam.mutate({ harmMix: v }),

    // Delay
    setDelayEnabled: (v: boolean) => updateParam.mutate({ delayEnabled: v }),
    setDelayTimeL: (v: number) => updateParam.mutate({ delayTimeL: v }),
    setDelayTimeR: (v: number) => updateParam.mutate({ delayTimeR: v }),
    setDelayFeedback: (v: number) => updateParam.mutate({ delayFeedback: v }),
    setDelayMix: (v: number) => updateParam.mutate({ delayMix: v }),
    setDelayFreeze: (v: boolean) => updateParam.mutate({ delayFreeze: v }),
    setDelayPitchShiftL: (v: number) => updateParam.mutate({ delayPitchShiftL: v }),
    setDelayPitchShiftR: (v: number) => updateParam.mutate({ delayPitchShiftR: v }),

    // Reverb
    setReverbEnabled: (v: boolean) => updateParam.mutate({ reverbEnabled: v }),
    setReverbType: (v: number) => updateParam.mutate({ reverbType: v }),
    setReverbDecay: (v: number) => updateParam.mutate({ reverbDecay: v }),
    setReverbShimmerAmount: (v: number) => updateParam.mutate({ reverbShimmerAmount: v }),
    setReverbShimmerInterval: (v: number) => updateParam.mutate({ reverbShimmerInterval: v }),
    setReverbMix: (v: number) => updateParam.mutate({ reverbMix: v }),
    setReverbFreeze: (v: boolean) => updateParam.mutate({ reverbFreeze: v }),

    // EQ
    setEqEnabled: (v: boolean) => updateParam.mutate({ eqEnabled: v }),
    setEqLowGain: (v: number) => updateParam.mutate({ eqLowGain: v }),
    setEqMidGain: (v: number) => updateParam.mutate({ eqMidGain: v }),
    setEqHighGain: (v: number) => updateParam.mutate({ eqHighGain: v }),
    setEqTilt: (v: number) => updateParam.mutate({ eqTilt: v }),

    // Exciter
    setExciterEnabled: (v: boolean) => updateParam.mutate({ exciterEnabled: v }),
    setExciterWarmth: (v: number) => updateParam.mutate({ exciterWarmth: v }),
    setExciterPresence: (v: number) => updateParam.mutate({ exciterPresence: v }),
    setExciterAir: (v: number) => updateParam.mutate({ exciterAir: v }),

    // Tremolo
    setTremEnabled: (v: boolean) => updateParam.mutate({ tremEnabled: v }),
    setTremRate: (v: number) => updateParam.mutate({ tremRate: v }),
    setTremDepth: (v: number) => updateParam.mutate({ tremDepth: v }),
    setTremWaveform: (v: number) => updateParam.mutate({ tremWaveform: v }),

    // Master
    setMix: (v: number) => updateParam.mutate({ mix: v }),
    setOutputLevel: (v: number) => updateParam.mutate({ outputLevel: v }),
    setBypass: (v: boolean) => setBypassMutation.mutate(v),
    setPreset: (presetId: string) => setPresetMutation.mutate(presetId),

    // Bulk update
    updateParameters: (params: Partial<PassionFXParameters>) => updateParam.mutate(params),
    isConnected: !!passionfxData,
    isPending: updateParam.isPending || setPresetMutation.isPending || setBypassMutation.isPending,
  }
}

export default usePassionFX
