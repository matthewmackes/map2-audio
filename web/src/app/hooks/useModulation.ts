/**
 * Modulation Processor Hooks
 * Hooks for Chorus, Phaser, and EVH Pitch Shifter processors
 */

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../map2/api'

// ========================================
// Types
// ========================================

export interface ChorusParameters {
  rate: number
  depth: number
  centreDelay: number
  feedback: number
  mix: number
  spread: number
  bypass: boolean
}

export interface ChorusMetering {
  inputLevel: number
  outputLevel: number
  lfoPhase: number
}

export interface PhaserParameters {
  rate: number
  depth: number
  centreFrequency: number
  feedback: number
  mix: number
  bypass: boolean
}

export interface PhaserMetering {
  inputLevel: number
  outputLevel: number
  lfoPhase: number
}

export interface PitchShifterParameters {
  pitchL: number
  pitchR: number
  delayL: number
  delayR: number
  feedback: number
  mix: number
  spread: number
  preset: number
  bypass: boolean
}

export interface PitchShifterMetering {
  inputLevelL: number
  inputLevelR: number
  outputLevelL: number
  outputLevelR: number
  grainPhase: number
}

export interface VanHalenPreset {
  index: number
  name: string
  song: string
  album: string
  year: string
  description: string
  settings: {
    pitch_l?: number
    pitch_r?: number
    delay_l?: number
    delay_r?: number
    feedback?: number
    mix?: number
  }
}

// ========================================
// Van Halen Presets (local reference)
// ========================================

export const VAN_HALEN_PRESETS: VanHalenPreset[] = [
  { index: 0, name: 'Manual', song: 'Custom', album: '-', year: '-', description: 'User-defined settings', settings: {} },
  { index: 1, name: 'Eruption', song: 'Eruption', album: 'Van Halen', year: '1978', description: 'Classic VH1 tone - subtle +/-4c', settings: { pitch_l: 4, pitch_r: -4, delay_l: 3, delay_r: 6, mix: 40 } },
  { index: 2, name: 'Unchained', song: 'Unchained', album: 'Fair Warning', year: '1981', description: 'Punchy rack detune', settings: { pitch_l: 4, pitch_r: -4, delay_l: 3, delay_r: 6, mix: 35 } },
  { index: 3, name: 'Little Guitars', song: 'Little Guitars', album: 'Diver Down', year: '1982', description: 'Delicate shimmer', settings: { pitch_l: 5, pitch_r: -5, delay_l: 5, delay_r: 10, mix: 30 } },
  { index: 4, name: 'Mean Street', song: 'Mean Street', album: 'Fair Warning', year: '1981', description: 'Heavier detune', settings: { pitch_l: 7, pitch_r: -7, delay_l: 8, delay_r: 16, mix: 45 } },
  { index: 5, name: 'Drop Dead Legs', song: 'Drop Dead Legs', album: '1984', year: '1984', description: 'Sub-octave effect', settings: { pitch_l: -1200, pitch_r: 0, delay_l: 0, delay_r: 0, mix: 25 } },
  { index: 6, name: 'Panama', song: 'Panama', album: '1984', year: '1984', description: 'Classic rack detune', settings: { pitch_l: 7, pitch_r: -9, delay_l: 8, delay_r: 20, mix: 40 } },
  { index: 7, name: 'Cathedral', song: 'Cathedral', album: 'Diver Down', year: '1982', description: 'Shimmer with feedback', settings: { pitch_l: 12, pitch_r: -12, delay_l: 80, delay_r: 100, feedback: 40, mix: 50 } },
  { index: 8, name: 'Hot For Teacher', song: 'Hot For Teacher', album: '1984', year: '1984', description: 'Punchy detune', settings: { pitch_l: 6, pitch_r: -6, delay_l: 5, delay_r: 12, mix: 35 } },
  { index: 9, name: "Why Can't This Be Love", song: "Why Can't This Be Love", album: '1986 Album', year: '1986', description: 'Micropitch', settings: { pitch_l: 9, pitch_r: -9, delay_l: 0, delay_r: 25, mix: 45 } },
  { index: 10, name: 'Dreams', song: 'Dreams', album: '1986 Album', year: '1986', description: 'Wide stereo micropitch', settings: { pitch_l: 9, pitch_r: -9, delay_l: 20, delay_r: 50, mix: 50 } },
  { index: 11, name: 'Finish What Ya Started', song: 'Finish What Ya Started', album: 'OU812', year: '1988', description: 'Clean subtle micropitch', settings: { pitch_l: 6, pitch_r: -6, delay_l: 0, delay_r: 15, mix: 35 } },
  { index: 12, name: 'Right Now', song: 'Right Now', album: 'F.U.C.K.', year: '1991', description: 'Thick micropitch', settings: { pitch_l: 9, pitch_r: -9, delay_l: 0, delay_r: 25, mix: 50 } },
  { index: 13, name: "Can't Stop Lovin' You", song: "Can't Stop Lovin' You", album: 'Balance', year: '1995', description: 'Smooth ballad tone', settings: { pitch_l: 9, pitch_r: -9, delay_l: 0, delay_r: 20, mix: 40 } },
  { index: 14, name: 'Humans Being', song: 'Humans Being', album: 'Twister', year: '1996', description: 'Thick dramatic detune', settings: { pitch_l: 12, pitch_r: -12, delay_l: 0, delay_r: 30, feedback: 15, mix: 55 } },
]

// ========================================
// useChorus Hook
// ========================================

export function useChorus() {
  const queryClient = useQueryClient()

  const { data: chorusData } = useQuery({
    queryKey: ['chorus'],
    queryFn: async () => {
      const response = await fetch('/api/engine/modulation/chorus')
      if (!response.ok) throw new Error('Failed to fetch chorus data')
      return response.json()
    },
    refetchInterval: 100, // Real-time metering
  })

  const updateParam = useMutation({
    mutationFn: async (params: Partial<ChorusParameters>) => {
      // Convert to API format
      const apiParams: Record<string, any> = {}
      if (params.rate !== undefined) apiParams.rate = params.rate
      if (params.depth !== undefined) apiParams.depth = params.depth * 100
      if (params.centreDelay !== undefined) apiParams.centre_delay = params.centreDelay
      if (params.feedback !== undefined) apiParams.feedback = params.feedback * 100
      if (params.mix !== undefined) apiParams.mix = params.mix * 100
      if (params.spread !== undefined) apiParams.spread = params.spread * 100
      if (params.bypass !== undefined) apiParams.bypass = params.bypass

      const response = await fetch('/api/engine/modulation/chorus/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update chorus')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chorus'] }),
  })

  const parameters: ChorusParameters = {
    rate: chorusData?.parameters?.rate ?? 1.0,
    depth: (chorusData?.parameters?.depth ?? 50) / 100,
    centreDelay: chorusData?.parameters?.centre_delay ?? 7,
    feedback: (chorusData?.parameters?.feedback ?? 0) / 100,
    mix: (chorusData?.parameters?.mix ?? 50) / 100,
    spread: (chorusData?.parameters?.spread ?? 100) / 100,
    bypass: chorusData?.parameters?.bypass ?? false,
  }

  const metering: ChorusMetering = {
    inputLevel: chorusData?.metering?.input_level ?? -100,
    outputLevel: chorusData?.metering?.output_level ?? -100,
    lfoPhase: chorusData?.metering?.lfo_phase ?? 0,
  }

  return {
    parameters,
    metering,
    setRate: (v: number) => updateParam.mutate({ rate: v }),
    setDepth: (v: number) => updateParam.mutate({ depth: v }),
    setCentreDelay: (v: number) => updateParam.mutate({ centreDelay: v }),
    setFeedback: (v: number) => updateParam.mutate({ feedback: v }),
    setMix: (v: number) => updateParam.mutate({ mix: v }),
    setSpread: (v: number) => updateParam.mutate({ spread: v }),
    setBypass: (v: boolean) => updateParam.mutate({ bypass: v }),
    isConnected: !!chorusData,
  }
}

// ========================================
// usePhaser Hook
// ========================================

export function usePhaser() {
  const queryClient = useQueryClient()

  const { data: phaserData } = useQuery({
    queryKey: ['phaser'],
    queryFn: async () => {
      const response = await fetch('/api/engine/modulation/phaser')
      if (!response.ok) throw new Error('Failed to fetch phaser data')
      return response.json()
    },
    refetchInterval: 100,
  })

  const updateParam = useMutation({
    mutationFn: async (params: Partial<PhaserParameters>) => {
      const apiParams: Record<string, any> = {}
      if (params.rate !== undefined) apiParams.rate = params.rate
      if (params.depth !== undefined) apiParams.depth = params.depth * 100
      if (params.centreFrequency !== undefined) apiParams.centre_frequency = params.centreFrequency
      if (params.feedback !== undefined) apiParams.feedback = params.feedback * 100
      if (params.mix !== undefined) apiParams.mix = params.mix * 100
      if (params.bypass !== undefined) apiParams.bypass = params.bypass

      const response = await fetch('/api/engine/modulation/phaser/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update phaser')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['phaser'] }),
  })

  const parameters: PhaserParameters = {
    rate: phaserData?.parameters?.rate ?? 0.5,
    depth: (phaserData?.parameters?.depth ?? 50) / 100,
    centreFrequency: phaserData?.parameters?.centre_frequency ?? 1000,
    feedback: (phaserData?.parameters?.feedback ?? 50) / 100,
    mix: (phaserData?.parameters?.mix ?? 50) / 100,
    bypass: phaserData?.parameters?.bypass ?? false,
  }

  const metering: PhaserMetering = {
    inputLevel: phaserData?.metering?.input_level ?? -100,
    outputLevel: phaserData?.metering?.output_level ?? -100,
    lfoPhase: phaserData?.metering?.lfo_phase ?? 0,
  }

  return {
    parameters,
    metering,
    setRate: (v: number) => updateParam.mutate({ rate: v }),
    setDepth: (v: number) => updateParam.mutate({ depth: v }),
    setCentreFrequency: (v: number) => updateParam.mutate({ centreFrequency: v }),
    setFeedback: (v: number) => updateParam.mutate({ feedback: v }),
    setMix: (v: number) => updateParam.mutate({ mix: v }),
    setBypass: (v: boolean) => updateParam.mutate({ bypass: v }),
    isConnected: !!phaserData,
  }
}

// ========================================
// usePitchShifter Hook
// ========================================

// ========================================
// Musical Interval Definitions
// ========================================

export interface MusicalInterval {
  name: string
  shortName: string
  semitones: number
  description: string
}

export const MUSICAL_INTERVALS: MusicalInterval[] = [
  { name: 'Unison', shortName: '0', semitones: 0, description: 'No shift' },
  { name: 'Minor 2nd', shortName: 'm2', semitones: 1, description: 'Half step up' },
  { name: 'Major 2nd', shortName: 'M2', semitones: 2, description: 'Whole step up' },
  { name: 'Minor 3rd', shortName: 'm3', semitones: 3, description: 'Minor third up' },
  { name: 'Major 3rd', shortName: 'M3', semitones: 4, description: 'Major third up' },
  { name: 'Perfect 4th', shortName: 'P4', semitones: 5, description: 'Fourth up' },
  { name: 'Tritone', shortName: 'TT', semitones: 6, description: 'Augmented 4th / Diminished 5th' },
  { name: 'Perfect 5th', shortName: 'P5', semitones: 7, description: 'Fifth up' },
  { name: 'Minor 6th', shortName: 'm6', semitones: 8, description: 'Minor sixth up' },
  { name: 'Major 6th', shortName: 'M6', semitones: 9, description: 'Major sixth up' },
  { name: 'Minor 7th', shortName: 'm7', semitones: 10, description: 'Minor seventh up' },
  { name: 'Major 7th', shortName: 'M7', semitones: 11, description: 'Major seventh up' },
  { name: 'Octave', shortName: 'Oct', semitones: 12, description: 'Octave up' },
]

export interface IntervalPreset {
  name: string
  description: string
  semitonesL: number
  semitonesR: number
  mix?: number
}

export const INTERVAL_PRESETS: IntervalPreset[] = [
  // Drop tunings (full steps = 2 semitones each)
  { name: 'Drop 1 Step', description: '1 full step down (-2st)', semitonesL: -2, semitonesR: -2, mix: 100 },
  { name: 'Drop 2 Steps', description: '2 full steps down (-4st)', semitonesL: -4, semitonesR: -4, mix: 100 },
  { name: 'Drop 3 Steps', description: '3 full steps down (-6st)', semitonesL: -6, semitonesR: -6, mix: 100 },
  { name: 'Drop 4 Steps', description: '4 full steps down (-8st)', semitonesL: -8, semitonesR: -8, mix: 100 },
  // Simple shifts
  { name: 'Octave Down', description: 'Full octave lower (-12st)', semitonesL: -12, semitonesR: -12, mix: 100 },
  { name: 'Octave Up', description: 'Full octave higher (+12st)', semitonesL: 12, semitonesR: 12, mix: 100 },
  { name: 'Fifth Up', description: 'Power chord harmony (+7st)', semitonesL: 7, semitonesR: 7, mix: 50 },
  { name: 'Fifth Down', description: 'Drop power chord (-5st)', semitonesL: -5, semitonesR: -5, mix: 50 },
  { name: 'Fourth Up', description: 'Perfect fourth (+5st)', semitonesL: 5, semitonesR: 5, mix: 50 },
  { name: 'Major 3rd Up', description: 'Major harmony (+4st)', semitonesL: 4, semitonesR: 4, mix: 50 },
  { name: 'Minor 3rd Up', description: 'Minor harmony (+3st)', semitonesL: 3, semitonesR: 3, mix: 50 },
  // Stereo harmonies
  { name: '3rd/5th Harmony', description: 'Major chord stereo', semitonesL: 4, semitonesR: 7, mix: 40 },
  { name: 'Octave + 5th', description: 'Rich octave', semitonesL: 12, semitonesR: 7, mix: 50 },
  { name: 'Detune Shimmer', description: 'Slight detune + octave', semitonesL: 12, semitonesR: -12, mix: 25 },
  // Whammy-style
  { name: '1 Octave Whammy', description: 'DigiTech style +1 oct', semitonesL: 12, semitonesR: 12, mix: 100 },
  { name: '2 Octave Whammy', description: 'DigiTech style +2 oct', semitonesL: 24, semitonesR: 24, mix: 100 },
  { name: 'Dive Bomb', description: 'Octave down effect', semitonesL: -12, semitonesR: -12, mix: 100 },
]

export interface IntervalShifterParameters {
  semitonesL: number  // -24 to +24
  semitonesR: number  // -24 to +24
  mix: number         // 0-100
  bypass: boolean
}

// ========================================
// useIntervalShifter Hook
// ========================================

export function useIntervalShifter() {
  const queryClient = useQueryClient()

  const { data: pitchData } = useQuery({
    queryKey: ['pitchShifter'],
    queryFn: async () => {
      const response = await fetch('/api/engine/modulation/pitch-shifter')
      if (!response.ok) throw new Error('Failed to fetch pitch shifter data')
      return response.json()
    },
    refetchInterval: 100,
  })

  const updateParam = useMutation({
    mutationFn: async (params: { pitchL?: number; pitchR?: number; mix?: number; bypass?: boolean }) => {
      const apiParams: Record<string, any> = {}
      // Convert semitones to cents for the API
      if (params.pitchL !== undefined) apiParams.pitch_l = params.pitchL * 100
      if (params.pitchR !== undefined) apiParams.pitch_r = params.pitchR * 100
      if (params.mix !== undefined) apiParams.mix = params.mix
      if (params.bypass !== undefined) apiParams.bypass = params.bypass
      // Reset delay and feedback for clean interval shifts
      apiParams.delay_l = 0
      apiParams.delay_r = 0
      apiParams.feedback = 0

      const response = await fetch('/api/engine/modulation/pitch-shifter/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update interval shifter')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pitchShifter'] }),
  })

  // Convert cents from API to semitones
  const parameters: IntervalShifterParameters = {
    semitonesL: Math.round((pitchData?.parameters?.pitch_l ?? 0) / 100),
    semitonesR: Math.round((pitchData?.parameters?.pitch_r ?? 0) / 100),
    mix: pitchData?.parameters?.mix ?? 50,
    bypass: pitchData?.parameters?.bypass ?? false,
  }

  const metering = {
    inputLevelL: pitchData?.metering?.input_level_l ?? -100,
    inputLevelR: pitchData?.metering?.input_level_r ?? -100,
    outputLevelL: pitchData?.metering?.output_level_l ?? -100,
    outputLevelR: pitchData?.metering?.output_level_r ?? -100,
  }

  // Find matching interval name
  const getIntervalName = (semitones: number): string => {
    const absSemitones = Math.abs(semitones) % 12
    const octaves = Math.floor(Math.abs(semitones) / 12)
    const interval = MUSICAL_INTERVALS.find(i => i.semitones === absSemitones)
    const direction = semitones < 0 ? '-' : (semitones > 0 ? '+' : '')

    if (octaves > 0 && absSemitones === 0) {
      return `${direction}${octaves} Oct`
    } else if (octaves > 0) {
      return `${direction}${octaves} Oct + ${interval?.shortName || absSemitones}`
    }
    return interval?.shortName || `${direction}${Math.abs(semitones)}st`
  }

  return {
    parameters,
    metering,
    intervals: MUSICAL_INTERVALS,
    presets: INTERVAL_PRESETS,
    setSemitonesL: (v: number) => updateParam.mutate({ pitchL: v }),
    setSemitonesR: (v: number) => updateParam.mutate({ pitchR: v }),
    setSemitonesBoth: (l: number, r: number) => updateParam.mutate({ pitchL: l, pitchR: r }),
    setMix: (v: number) => updateParam.mutate({ mix: v }),
    setBypass: (v: boolean) => updateParam.mutate({ bypass: v }),
    applyPreset: (preset: IntervalPreset) => updateParam.mutate({
      pitchL: preset.semitonesL,
      pitchR: preset.semitonesR,
      mix: preset.mix ?? 50,
    }),
    getIntervalName,
    isConnected: !!pitchData,
  }
}

// ========================================
// usePitchShifter Hook (EVH Style)
// ========================================

export function usePitchShifter() {
  const queryClient = useQueryClient()

  const { data: pitchData } = useQuery({
    queryKey: ['pitchShifter'],
    queryFn: async () => {
      const response = await fetch('/api/engine/modulation/pitch-shifter')
      if (!response.ok) throw new Error('Failed to fetch pitch shifter data')
      return response.json()
    },
    refetchInterval: 100,
  })

  const updateParam = useMutation({
    mutationFn: async (params: Partial<PitchShifterParameters>) => {
      const apiParams: Record<string, any> = {}
      if (params.pitchL !== undefined) apiParams.pitch_l = params.pitchL
      if (params.pitchR !== undefined) apiParams.pitch_r = params.pitchR
      if (params.delayL !== undefined) apiParams.delay_l = params.delayL
      if (params.delayR !== undefined) apiParams.delay_r = params.delayR
      if (params.feedback !== undefined) apiParams.feedback = params.feedback * 100
      if (params.mix !== undefined) apiParams.mix = params.mix
      if (params.spread !== undefined) apiParams.spread = params.spread
      if (params.preset !== undefined) apiParams.preset = params.preset
      if (params.bypass !== undefined) apiParams.bypass = params.bypass

      const response = await fetch('/api/engine/modulation/pitch-shifter/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update pitch shifter')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pitchShifter'] }),
  })

  const setPreset = useMutation({
    mutationFn: async (presetIndex: number) => {
      const response = await fetch(`/api/engine/modulation/pitch-shifter/preset/${presetIndex}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set preset')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pitchShifter'] }),
  })

  const parameters: PitchShifterParameters = {
    pitchL: pitchData?.parameters?.pitch_l ?? 0,
    pitchR: pitchData?.parameters?.pitch_r ?? 0,
    delayL: pitchData?.parameters?.delay_l ?? 0,
    delayR: pitchData?.parameters?.delay_r ?? 0,
    feedback: (pitchData?.parameters?.feedback ?? 0) / 100,
    mix: pitchData?.parameters?.mix ?? 50,
    spread: pitchData?.parameters?.spread ?? 100,
    preset: pitchData?.parameters?.preset ?? 0,
    bypass: pitchData?.parameters?.bypass ?? false,
  }

  const metering: PitchShifterMetering = {
    inputLevelL: pitchData?.metering?.input_level_l ?? -100,
    inputLevelR: pitchData?.metering?.input_level_r ?? -100,
    outputLevelL: pitchData?.metering?.output_level_l ?? -100,
    outputLevelR: pitchData?.metering?.output_level_r ?? -100,
    grainPhase: pitchData?.metering?.grain_phase ?? 0,
  }

  return {
    parameters,
    metering,
    presets: VAN_HALEN_PRESETS,
    setPitchL: (v: number) => updateParam.mutate({ pitchL: v }),
    setPitchR: (v: number) => updateParam.mutate({ pitchR: v }),
    setPitchBoth: (l: number, r: number) => updateParam.mutate({ pitchL: l, pitchR: r }),
    setDelayL: (v: number) => updateParam.mutate({ delayL: v }),
    setDelayR: (v: number) => updateParam.mutate({ delayR: v }),
    setFeedback: (v: number) => updateParam.mutate({ feedback: v }),
    setMix: (v: number) => updateParam.mutate({ mix: v }),
    setSpread: (v: number) => updateParam.mutate({ spread: v }),
    setPreset: (v: number) => setPreset.mutate(v),
    setBypass: (v: boolean) => updateParam.mutate({ bypass: v }),
    isConnected: !!pitchData,
  }
}

// ========================================
// Boss XS-1 Polyphonic Pitch Shifter Types
// ========================================

export interface BossXS1Parameters {
  shiftAmount: number       // -7 to +7 semitones
  balance: number           // 0-100%
  detuneMode: boolean       // false = pitch shift, true = detune ±20c
  detuneAmount: number      // ±20 cents
  glide: number             // 0-100 ms
  feedback: number          // 0-0.7
  pedalEnabled: boolean
  pedalPosition: number     // 0-100%
  pedalMin: number          // semitones
  pedalMax: number          // semitones
  preset: number
  bypass: boolean
}

export interface BossXS1Metering {
  inputLevel: number
  outputLevel: number
}

export interface BossXS1Preset {
  id: string
  name: string
  category?: string
}

// Boss XS-1 preset definitions
export const BOSS_XS1_PRESETS: BossXS1Preset[] = [
  { id: 'manual', name: 'Manual', category: 'manual' },
  // Tuning presets
  { id: 'drop_d', name: 'Drop D', category: 'tuning' },
  { id: 'drop_d_sharp', name: 'Drop D#', category: 'tuning' },
  { id: 'half_step_down', name: 'Half Step Down', category: 'tuning' },
  // Capo presets
  { id: 'capo_2nd_fret', name: 'Capo 2nd Fret', category: 'capo' },
  { id: 'capo_3rd_fret', name: 'Capo 3rd Fret', category: 'capo' },
  { id: 'capo_5th_fret', name: 'Capo 5th Fret', category: 'capo' },
  // Octave presets
  { id: 'octave_up', name: 'Octave Up', category: 'octave' },
  { id: 'octave_down', name: 'Octave Down', category: 'octave' },
  { id: 'octave_up_down', name: 'Octave Up/Down', category: 'octave' },
  // Doubling presets
  { id: 'micro_pitch_wide', name: 'Micro Pitch Wide', category: 'doubling' },
  { id: 'micro_pitch_narrow', name: 'Micro Pitch Narrow', category: 'doubling' },
  { id: 'voice_doubling', name: 'Voice Doubling', category: 'doubling' },
  { id: 'string_doubling', name: 'String Doubling', category: 'doubling' },
  { id: 'pianist_octaves', name: 'Pianist Octaves', category: 'doubling' },
  // Extreme presets
  { id: 'sub_bass', name: 'Sub Bass', category: 'extreme' },
  { id: 'sonic_screamer', name: 'Sonic Screamer', category: 'extreme' },
  { id: 'unique_intervals', name: 'Unique Intervals', category: 'creative' },
  { id: 'minor_third', name: 'Minor Third', category: 'creative' },
  { id: 'chord_shift', name: 'Chord Shift', category: 'creative' },
  // Experimental presets
  { id: 'detune_chorus', name: 'Detune Chorus', category: 'experimental' },
  { id: 'spacey_vibrato', name: 'Spacey Vibrato', category: 'experimental' },
  { id: 'robotic_mod', name: 'Robotic Mod', category: 'experimental' },
]

// ========================================
// useBossXS1 Hook
// ========================================

export function useBossXS1() {
  const queryClient = useQueryClient()

  const { data: bossData } = useQuery({
    queryKey: ['bossXS1'],
    queryFn: async () => {
      const response = await fetch('/api/engine/pitch/boss-xs1')
      if (!response.ok) throw new Error('Failed to fetch poly shifter data')
      return response.json()
    },
    refetchInterval: 100,
  })

  const updateParam = useMutation({
    mutationFn: async (params: Partial<BossXS1Parameters>) => {
      const apiParams: Record<string, any> = {}
      if (params.shiftAmount !== undefined) apiParams.shift_amount = params.shiftAmount
      if (params.balance !== undefined) apiParams.balance = params.balance
      if (params.detuneMode !== undefined) apiParams.detune_mode = params.detuneMode
      if (params.detuneAmount !== undefined) apiParams.detune_amount = params.detuneAmount
      if (params.glide !== undefined) apiParams.glide = params.glide
      if (params.feedback !== undefined) apiParams.feedback = params.feedback
      if (params.pedalEnabled !== undefined) apiParams.pedal_enabled = params.pedalEnabled
      if (params.pedalPosition !== undefined) apiParams.pedal_position = params.pedalPosition
      if (params.pedalMin !== undefined) apiParams.pedal_min = params.pedalMin
      if (params.pedalMax !== undefined) apiParams.pedal_max = params.pedalMax
      if (params.bypass !== undefined) apiParams.bypass = params.bypass

      const response = await fetch('/api/engine/pitch/boss-xs1/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      })
      if (!response.ok) throw new Error('Failed to update poly shifter')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bossXS1'] }),
  })

  const setPreset = useMutation({
    mutationFn: async (presetIndex: number) => {
      const response = await fetch(`/api/engine/pitch/boss-xs1/preset/${presetIndex}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set preset')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bossXS1'] }),
  })

  const parameters: BossXS1Parameters = {
    shiftAmount: bossData?.parameters?.shift_amount ?? 0,
    balance: bossData?.parameters?.balance ?? 50,
    detuneMode: bossData?.parameters?.detune_mode ?? false,
    detuneAmount: bossData?.parameters?.detune_amount ?? 20,
    glide: bossData?.parameters?.glide ?? 0,
    feedback: bossData?.parameters?.feedback ?? 0,
    pedalEnabled: bossData?.parameters?.pedal_enabled ?? false,
    pedalPosition: bossData?.parameters?.pedal_position ?? 0,
    pedalMin: bossData?.parameters?.pedal_min ?? -7,
    pedalMax: bossData?.parameters?.pedal_max ?? 7,
    preset: bossData?.parameters?.preset ?? 0,
    bypass: bossData?.parameters?.bypass ?? false,
  }

  const metering: BossXS1Metering = {
    inputLevel: bossData?.metering?.input_level ?? -100,
    outputLevel: bossData?.metering?.output_level ?? -100,
  }

  return {
    parameters,
    metering,
    presets: BOSS_XS1_PRESETS,
    setShiftAmount: (v: number) => updateParam.mutate({ shiftAmount: v }),
    setBalance: (v: number) => updateParam.mutate({ balance: v }),
    setDetuneMode: (v: boolean) => updateParam.mutate({ detuneMode: v }),
    setDetuneAmount: (v: number) => updateParam.mutate({ detuneAmount: v }),
    setGlide: (v: number) => updateParam.mutate({ glide: v }),
    setFeedback: (v: number) => updateParam.mutate({ feedback: v }),
    setPedalEnabled: (v: boolean) => updateParam.mutate({ pedalEnabled: v }),
    setPedalPosition: (v: number) => updateParam.mutate({ pedalPosition: v }),
    setPedalRange: (min: number, max: number) => updateParam.mutate({ pedalMin: min, pedalMax: max }),
    setPreset: (v: number) => setPreset.mutate(v),
    setBypass: (v: boolean) => updateParam.mutate({ bypass: v }),
    isConnected: !!bossData,
  }
}
