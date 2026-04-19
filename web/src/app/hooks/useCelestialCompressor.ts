import { useState, useCallback } from 'react'
import { useDynamics } from './useDynamics'
import { CELESTIAL_PRESETS, getPresetById } from '../components/PluginCards/Custom/JUCE/celestial/presets'
import type { CelestialPreset, Topology } from '../components/PluginCards/Custom/JUCE/celestial/types'

export function useCelestialCompressor() {
  const dynamics = useDynamics()
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  const selectedPreset = selectedPresetId ? getPresetById(selectedPresetId) ?? null : null
  const topology: Topology = selectedPreset?.topology ?? 'fet'

  const setPreset = useCallback((preset: CelestialPreset) => {
    setSelectedPresetId(preset.id)

    // Send all parameters to the compressor at once
    dynamics.updateCompressor({
      threshold: preset.params.threshold,
      ratio: preset.params.ratio,
      attack: preset.params.attack,
      release: preset.params.release,
      knee: preset.params.knee,
      makeupGain: preset.params.makeupGain,
      autoMakeup: preset.params.autoMakeup,
    })
  }, [dynamics.updateCompressor])

  return {
    // Preset state
    selectedPreset,
    selectedPresetId,
    topology,
    presets: CELESTIAL_PRESETS,
    setPreset,

    // Compressor parameters (from useDynamics)
    parameters: dynamics.compressor.parameters,
    metering: dynamics.compressor.metering,
    isLoading: dynamics.compressor.isLoading,

    // Individual parameter setters
    setThreshold: dynamics.setCompressorThreshold,
    setRatio: dynamics.setCompressorRatio,
    setAttack: dynamics.setCompressorAttack,
    setRelease: dynamics.setCompressorRelease,
    setKnee: dynamics.setCompressorKnee,
    setMakeupGain: dynamics.setCompressorMakeupGain,
    setAutoMakeup: dynamics.setCompressorAutoMakeup,
    setBypass: dynamics.setCompressorBypass,

    // Connection
    isConnected: dynamics.isConnected,
  }
}
