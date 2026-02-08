/**
 * Tweed Bassman 5F6-A Amplifier Simulator Hook
 * Fender Bassman (1958-60) with full mod suite:
 * 12AY7/12AX7 preamp, Yeh/Smith tone stack, push-pull 6L6 power amp,
 * rectifier sag, NFB with presence, 14 factory presets.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ========================================
// Types
// ========================================

export interface TweedBassmanParameters {
  // Channel
  channelMode: number       // 0=Normal, 1=Bright, 2=Jumped
  normalVolume: number      // 0-10
  brightVolume: number      // 0-10
  brightCap: boolean        // 100pF bright cap

  // Preamp
  v1TubeType: number        // 0=12AY7, 1=12AX7, 2=5751, 3=12AT7
  cathodeBypass: boolean    // V2A cathode bypass cap
  cathodeBias: number       // 0=Hot(820), 1=Normal(1.5k), 2=Cool(2.7k)

  // Tone
  treble: number            // 0-10
  mid: number               // 0-10
  bass: number              // 0-10
  rawSwitch: boolean        // Tone stack bypass

  // Master
  masterVolume: number      // 0-10

  // Power amp
  presence: number          // 0-10
  nfbMode: number           // 0=Stock(27k), 1=None, 2=High(10k)
  powerTubeType: number     // 0=6L6, 1=6V6, 2=EL34, 3=KT66
  biasMode: number          // 0=Fixed, 1=Cathode
  rectifierType: number     // 0=GZ34, 1=5U4G, 2=5Y3, 3=SS

  // Output
  outputLevel: number       // -24 to +6 dB
  cabinetEnabled: boolean
  cabinetIR: number         // 0=SM57, 1=Ribbon, 2=Room

  // State
  preset: number
  bypass: boolean
}

export interface TweedBassmanMetering {
  inputLevel: number
  outputLevel: number
  preampLevel: number
  powerLevel: number
  supplySag: number
  cpuLoad: number
}

export interface TweedBassmanPreset {
  id: string
  name: string
  description: string
}

// ========================================
// Preset Definitions
// ========================================

export const TWEED_BASSMAN_PRESETS: TweedBassmanPreset[] = [
  { id: 'manual', name: 'Manual', description: 'User-defined settings' },
  { id: 'stock_5f6a', name: 'Stock 5F6-A', description: 'All stock, clean to edge of breakup' },
  { id: 'cranked_tweed', name: 'Cranked Tweed', description: 'Classic pushed Bassman' },
  { id: 'blues_breakup', name: 'Blues Breakup', description: 'Warm, touch-sensitive' },
  { id: 'country_clean', name: 'Country Clean', description: 'Sparkly headroom' },
  { id: 'jumped_dirty', name: 'Jumped & Dirty', description: 'Fat overdriven tone' },
  { id: 'high_gain_mod', name: 'High Gain Mod', description: 'Hot-rodded preamp' },
  { id: 'neil_young', name: 'Neil Young', description: 'Ragged, searing leads' },
  { id: 'tweed_deluxe', name: 'Tweed Deluxe', description: 'Simulates 5E3 character' },
  { id: 'jtm45_flavor', name: 'JTM45 Flavor', description: 'Marshall-esque' },
  { id: 'sag_monster', name: 'Sag Monster', description: 'Maximum compression/bloom' },
  { id: 'pedal_platform', name: 'Pedal Platform', description: 'Maximum clean headroom' },
  { id: 'bright_chimey', name: 'Bright & Chimey', description: 'Fender sparkle' },
  { id: 'srv_tone', name: 'SRV Tone', description: 'Thick Texas blues' },
  { id: 'recording_di', name: 'Recording DI', description: 'Balanced, mix-ready' },
]

// ========================================
// Enum labels for UI
// ========================================

export const CHANNEL_MODES = ['Normal', 'Bright', 'Jumped']
export const V1_TUBE_TYPES = ['12AY7', '12AX7', '5751', '12AT7']
export const CATHODE_BIAS_MODES = ['Hot (820\u03A9)', 'Normal (1.5k\u03A9)', 'Cool (2.7k\u03A9)']
export const NFB_MODES = ['Stock (27k)', 'None', 'High (10k)']
export const POWER_TUBE_TYPES = ['6L6', '6V6', 'EL34', 'KT66']
export const BIAS_MODES = ['Fixed', 'Cathode']
export const RECTIFIER_TYPES = ['GZ34', '5U4G', '5Y3', 'Solid State']
export const CABINET_IRS = ['SM57', 'Ribbon', 'Room']

// ========================================
// useTweedBassman Hook
// ========================================

export function useTweedBassman() {
  const queryClient = useQueryClient()

  const { data: ampData, isLoading, error } = useQuery({
    queryKey: ['tweedbassman'],
    queryFn: async () => {
      const response = await fetch('/api/engine/amp/tweedbassman')
      if (!response.ok) throw new Error('Failed to fetch Tweed Bassman data')
      return response.json()
    },
    refetchInterval: 100,
  })

  const updateParam = useMutation({
    mutationFn: async (params: Record<string, any>) => {
      const response = await fetch('/api/engine/amp/tweedbassman/parameters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!response.ok) throw new Error('Failed to update Tweed Bassman')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tweedbassman'] }),
  })

  const setPresetMutation = useMutation({
    mutationFn: async (presetName: string) => {
      const response = await fetch(`/api/engine/amp/tweedbassman/preset/${presetName}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set preset')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tweedbassman'] }),
  })

  const setBypassMutation = useMutation({
    mutationFn: async (bypass: boolean) => {
      const response = await fetch(`/api/engine/amp/tweedbassman/bypass/${bypass}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to set bypass')
      return response.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tweedbassman'] }),
  })

  const parameters: TweedBassmanParameters = {
    channelMode: ampData?.parameters?.channel_mode ?? 0,
    normalVolume: ampData?.parameters?.normal_volume ?? 5.0,
    brightVolume: ampData?.parameters?.bright_volume ?? 5.0,
    brightCap: ampData?.parameters?.bright_cap ?? true,
    v1TubeType: ampData?.parameters?.v1_tube_type ?? 0,
    cathodeBypass: ampData?.parameters?.cathode_bypass ?? false,
    cathodeBias: ampData?.parameters?.cathode_bias ?? 0,
    treble: ampData?.parameters?.treble ?? 5.0,
    mid: ampData?.parameters?.mid ?? 5.0,
    bass: ampData?.parameters?.bass ?? 5.0,
    rawSwitch: ampData?.parameters?.raw_switch ?? false,
    masterVolume: ampData?.parameters?.master_volume ?? 5.0,
    presence: ampData?.parameters?.presence ?? 5.0,
    nfbMode: ampData?.parameters?.nfb_mode ?? 0,
    powerTubeType: ampData?.parameters?.power_tube_type ?? 0,
    biasMode: ampData?.parameters?.bias_mode ?? 0,
    rectifierType: ampData?.parameters?.rectifier_type ?? 0,
    outputLevel: ampData?.parameters?.output_level ?? 0.0,
    cabinetEnabled: ampData?.parameters?.cabinet_enabled ?? true,
    cabinetIR: ampData?.parameters?.cabinet_ir ?? 0,
    preset: ampData?.parameters?.preset ?? 0,
    bypass: ampData?.parameters?.bypass ?? false,
  }

  const metering: TweedBassmanMetering = {
    inputLevel: ampData?.metering?.input_level ?? -100,
    outputLevel: ampData?.metering?.output_level ?? -100,
    preampLevel: ampData?.metering?.preamp_level ?? -100,
    powerLevel: ampData?.metering?.power_level ?? -100,
    supplySag: ampData?.metering?.supply_sag ?? 1.0,
    cpuLoad: ampData?.metering?.cpu_load ?? 0,
  }

  const currentPreset = TWEED_BASSMAN_PRESETS[parameters.preset] || TWEED_BASSMAN_PRESETS[0]

  return {
    parameters,
    metering,
    presets: TWEED_BASSMAN_PRESETS,
    currentPreset,
    isLoading,
    error,
    // Channel
    setChannelMode: (v: number) => updateParam.mutate({ channel_mode: v }),
    setNormalVolume: (v: number) => updateParam.mutate({ normal_volume: v }),
    setBrightVolume: (v: number) => updateParam.mutate({ bright_volume: v }),
    setBrightCap: (v: boolean) => updateParam.mutate({ bright_cap: v }),
    // Preamp
    setV1TubeType: (v: number) => updateParam.mutate({ v1_tube_type: v }),
    setCathodeBypass: (v: boolean) => updateParam.mutate({ cathode_bypass: v }),
    setCathodeBias: (v: number) => updateParam.mutate({ cathode_bias: v }),
    // Tone
    setTreble: (v: number) => updateParam.mutate({ treble: v }),
    setMid: (v: number) => updateParam.mutate({ mid: v }),
    setBass: (v: number) => updateParam.mutate({ bass: v }),
    setRawSwitch: (v: boolean) => updateParam.mutate({ raw_switch: v }),
    // Master
    setMasterVolume: (v: number) => updateParam.mutate({ master_volume: v }),
    // Power amp
    setPresence: (v: number) => updateParam.mutate({ presence: v }),
    setNFBMode: (v: number) => updateParam.mutate({ nfb_mode: v }),
    setPowerTubeType: (v: number) => updateParam.mutate({ power_tube_type: v }),
    setBiasMode: (v: number) => updateParam.mutate({ bias_mode: v }),
    setRectifierType: (v: number) => updateParam.mutate({ rectifier_type: v }),
    // Output
    setOutputLevel: (v: number) => updateParam.mutate({ output_level: v }),
    setCabinetEnabled: (v: boolean) => updateParam.mutate({ cabinet_enabled: v }),
    setCabinetIR: (v: number) => updateParam.mutate({ cabinet_ir: v }),
    // State
    setBypass: (v: boolean) => setBypassMutation.mutate(v),
    setPreset: (presetName: string) => setPresetMutation.mutate(presetName),
    updateParameters: (params: Record<string, any>) => updateParam.mutate(params),
    isConnected: !!ampData,
    isPending: updateParam.isPending || setPresetMutation.isPending || setBypassMutation.isPending,
  }
}

export default useTweedBassman
