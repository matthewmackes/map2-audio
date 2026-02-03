/**
 * Audio Effect Icons from PiPedal Project
 * https://github.com/rerdavies/pipedal
 * MIT License - Robin E. R. Davies
 */

import type { FxIconName } from '../types'

// Import all SVG icons as React components
import FxAmplifier from './fx_amplifier.svg?react'
import FxAnalyzer from './fx_analyzer.svg?react'
import FxChorus from './fx_chorus.svg?react'
import FxCompressor from './fx_compressor.svg?react'
import FxConstant from './fx_constant.svg?react'
import FxConverter from './fx_converter.svg?react'
import FxDelay from './fx_delay.svg?react'
import FxDial from './fx_dial.svg?react'
import FxDistortion from './fx_distortion.svg?react'
import FxEmpty from './fx_empty.svg?react'
import FxEq from './fx_eq.svg?react'
import FxError from './fx_error.svg?react'
import FxFilter from './fx_filter.svg?react'
import FxFilterHp from './fx_filter_hp.svg?react'
import FxFlanger from './fx_flanger.svg?react'
import FxFlanger2 from './fx_flanger2.svg?react'
import FxFunction from './fx_function.svg?react'
import FxGate from './fx_gate.svg?react'
import FxGenerator from './fx_generator.svg?react'
import FxInstrument from './fx_instrument.svg?react'
import FxLimiter from './fx_limiter.svg?react'
import FxLr from './fx_lr.svg?react'
import FxMixer from './fx_mixer.svg?react'
import FxModulator from './fx_modulator.svg?react'
import FxNam from './fx_nam.svg?react'
import FxOscillator from './fx_oscillator.svg?react'
import FxParametricEq from './fx_parametric_eq.svg?react'
import FxPhaser from './fx_phaser.svg?react'
import FxPitch from './fx_pitch.svg?react'
import FxPlugin from './fx_plugin.svg?react'
import FxReverb from './fx_reverb.svg?react'
import FxSimulator from './fx_simulator.svg?react'
import FxSpatial from './fx_spatial.svg?react'
import FxSpectral from './fx_spectral.svg?react'
import FxSplitA from './fx_split_a.svg?react'
import FxSplitB from './fx_split_b.svg?react'
import FxTerminal from './fx_terminal.svg?react'
import FxUtility from './fx_utility.svg?react'

/** Map of icon names to React components */
export const FX_ICONS: Record<FxIconName, React.FC<React.SVGProps<SVGSVGElement>>> = {
  fx_amplifier: FxAmplifier,
  fx_analyzer: FxAnalyzer,
  fx_chorus: FxChorus,
  fx_compressor: FxCompressor,
  fx_constant: FxConstant,
  fx_converter: FxConverter,
  fx_delay: FxDelay,
  fx_dial: FxDial,
  fx_distortion: FxDistortion,
  fx_empty: FxEmpty,
  fx_eq: FxEq,
  fx_error: FxError,
  fx_filter: FxFilter,
  fx_filter_hp: FxFilterHp,
  fx_flanger: FxFlanger,
  fx_flanger2: FxFlanger2,
  fx_function: FxFunction,
  fx_gate: FxGate,
  fx_generator: FxGenerator,
  fx_instrument: FxInstrument,
  fx_limiter: FxLimiter,
  fx_lr: FxLr,
  fx_mixer: FxMixer,
  fx_modulator: FxModulator,
  fx_nam: FxNam,
  fx_oscillator: FxOscillator,
  fx_parametric_eq: FxParametricEq,
  fx_phaser: FxPhaser,
  fx_pitch: FxPitch,
  fx_plugin: FxPlugin,
  fx_reverb: FxReverb,
  fx_simulator: FxSimulator,
  fx_spatial: FxSpatial,
  fx_spectral: FxSpectral,
  fx_split_a: FxSplitA,
  fx_split_b: FxSplitB,
  fx_terminal: FxTerminal,
  fx_utility: FxUtility,
}

/**
 * Map plugin categories/class labels to icon names
 * Keys are lowercase for case-insensitive matching
 */
export const CATEGORY_ICON_MAP: Record<string, FxIconName> = {
  // Distortion types
  distortion: 'fx_distortion',
  amplifier: 'fx_amplifier',
  amp: 'fx_amplifier',
  overdrive: 'fx_distortion',
  fuzz: 'fx_distortion',
  waveshaper: 'fx_distortion',
  saturation: 'fx_distortion',

  // EQ/Filter types
  filter: 'fx_filter',
  eq: 'fx_eq',
  equaliser: 'fx_eq',
  equalizer: 'fx_eq',
  parametric: 'fx_parametric_eq',
  'parametric eq': 'fx_parametric_eq',
  highpass: 'fx_filter_hp',
  'high-pass': 'fx_filter_hp',
  lowpass: 'fx_filter',
  'low-pass': 'fx_filter',
  bandpass: 'fx_filter',
  'band-pass': 'fx_filter',
  allpass: 'fx_filter',
  'all-pass': 'fx_filter',
  notch: 'fx_filter',
  comb: 'fx_filter',
  multiband: 'fx_eq',

  // Time-based effects
  delay: 'fx_delay',
  echo: 'fx_delay',
  reverb: 'fx_reverb',
  spatial: 'fx_spatial',
  convolution: 'fx_reverb',
  room: 'fx_reverb',
  hall: 'fx_reverb',
  plate: 'fx_reverb',
  spring: 'fx_reverb',

  // Modulation effects
  chorus: 'fx_chorus',
  intellifx: 'fx_chorus',
  flanger: 'fx_flanger',
  phaser: 'fx_phaser',
  modulator: 'fx_modulator',
  modulation: 'fx_modulator',
  tremolo: 'fx_modulator',
  vibrato: 'fx_modulator',
  rotary: 'fx_modulator',
  leslie: 'fx_modulator',
  ringmod: 'fx_modulator',
  'ring modulator': 'fx_modulator',

  // Dynamics
  compressor: 'fx_compressor',
  dynamics: 'fx_compressor',
  limiter: 'fx_limiter',
  gate: 'fx_gate',
  'noise gate': 'fx_gate',
  expander: 'fx_gate',
  envelope: 'fx_compressor',
  transient: 'fx_compressor',

  // Simulator/Cabinet
  simulator: 'fx_simulator',
  cabinet: 'fx_simulator',
  cab: 'fx_simulator',
  ir: 'fx_simulator',
  'impulse response': 'fx_simulator',
  'amp sim': 'fx_simulator',
  'amp simulator': 'fx_simulator',

  // Analysis/Metering
  analyser: 'fx_analyzer',
  analyzer: 'fx_analyzer',
  spectrum: 'fx_spectral',
  tuner: 'fx_analyzer',
  meter: 'fx_analyzer',
  'level meter': 'fx_analyzer',
  oscilloscope: 'fx_analyzer',
  fft: 'fx_spectral',

  // Utility
  utility: 'fx_utility',
  gain: 'fx_mixer',
  volume: 'fx_mixer',
  mixer: 'fx_mixer',
  balance: 'fx_lr',
  pan: 'fx_lr',
  stereo: 'fx_lr',
  'mid/side': 'fx_lr',
  'mid-side': 'fx_lr',
  splitter: 'fx_split_a',
  constant: 'fx_constant',

  // Special
  instrument: 'fx_instrument',
  synth: 'fx_instrument',
  synthesizer: 'fx_instrument',
  generator: 'fx_generator',
  oscillator: 'fx_oscillator',
  pitch: 'fx_pitch',
  'pitch shifter': 'fx_pitch',
  'pitch shift': 'fx_pitch',
  harmonizer: 'fx_pitch',
  vocoder: 'fx_pitch',
  autotune: 'fx_pitch',
  'auto-tune': 'fx_pitch',

  // Neural/ML
  nam: 'fx_nam',
  'neural amp': 'fx_nam',
  'neural amp modeler': 'fx_nam',
  ml: 'fx_nam',
  'machine learning': 'fx_nam',

  // Default/Generic
  effect: 'fx_plugin',
  plugin: 'fx_plugin',
  unknown: 'fx_plugin',
  other: 'fx_plugin',
}

/**
 * Get the icon component for a given plugin category or class label
 * @param category - Plugin category string (case-insensitive)
 * @returns The appropriate icon component
 */
export function getIconForCategory(category: string | undefined): React.FC<React.SVGProps<SVGSVGElement>> {
  if (!category) return FX_ICONS.fx_plugin

  const normalizedCategory = category.toLowerCase().trim()

  // Check for exact match first
  if (normalizedCategory in CATEGORY_ICON_MAP) {
    return FX_ICONS[CATEGORY_ICON_MAP[normalizedCategory]]
  }

  // Check for partial matches
  for (const [key, iconName] of Object.entries(CATEGORY_ICON_MAP)) {
    if (normalizedCategory.includes(key) || key.includes(normalizedCategory)) {
      return FX_ICONS[iconName]
    }
  }

  // Default fallback
  return FX_ICONS.fx_plugin
}

/**
 * Get icon name for a category (useful for debugging)
 */
export function getIconNameForCategory(category: string | undefined): FxIconName {
  if (!category) return 'fx_plugin'

  const normalizedCategory = category.toLowerCase().trim()

  if (normalizedCategory in CATEGORY_ICON_MAP) {
    return CATEGORY_ICON_MAP[normalizedCategory]
  }

  for (const [key, iconName] of Object.entries(CATEGORY_ICON_MAP)) {
    if (normalizedCategory.includes(key) || key.includes(normalizedCategory)) {
      return iconName
    }
  }

  return 'fx_plugin'
}

// Named exports for individual icons
export {
  FxAmplifier,
  FxAnalyzer,
  FxChorus,
  FxCompressor,
  FxConstant,
  FxConverter,
  FxDelay,
  FxDial,
  FxDistortion,
  FxEmpty,
  FxEq,
  FxError,
  FxFilter,
  FxFilterHp,
  FxFlanger,
  FxFlanger2,
  FxFunction,
  FxGate,
  FxGenerator,
  FxInstrument,
  FxLimiter,
  FxLr,
  FxMixer,
  FxModulator,
  FxNam,
  FxOscillator,
  FxParametricEq,
  FxPhaser,
  FxPitch,
  FxPlugin,
  FxReverb,
  FxSimulator,
  FxSpatial,
  FxSpectral,
  FxSplitA,
  FxSplitB,
  FxTerminal,
  FxUtility,
}
