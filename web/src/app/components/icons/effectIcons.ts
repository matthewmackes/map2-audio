/**
 * Universal Effect Icon Provider
 *
 * Single source of truth for all effect category icons across the platform.
 * Replaces the fragmented PiPedal / MapAppIcons / Carbon icon lookups with
 * one API: `getEffectIcon(category)`.
 *
 * Icon assets now resolve from the staged MAP noun set where available,
 * with remaining legacy HorizontalSignalChain SVGs preserved until their
 * migration wave lands.
 */

import type { FC, SVGProps } from 'react'

// ── SVG icon components (Vite ?react loader) ──────────────────────────
import FxAmplifier from './noun/amplifier/fx-amplifier.svg?react'
import FxAnalyzer from '../HorizontalSignalChain/icons/fx_analyzer.svg?react'
import FxChorus from '../HorizontalSignalChain/icons/fx_chorus.svg?react'
import FxCompressor from './noun/dynamics/fx-compressor.svg?react'
import FxDelay from '../HorizontalSignalChain/icons/fx_delay.svg?react'
import FxDistortion from './noun/distortion/fx-distortion.svg?react'
import FxDrums from './noun/drums/fx-drums.svg?react'
import FxEq from '../HorizontalSignalChain/icons/fx_eq.svg?react'
import FxFilter from '../HorizontalSignalChain/icons/fx_filter.svg?react'
import FxGate from '../HorizontalSignalChain/icons/fx_gate.svg?react'
import FxLimiter from '../HorizontalSignalChain/icons/fx_limiter.svg?react'
import FxMixer from '../HorizontalSignalChain/icons/fx_mixer.svg?react'
import FxModulator from './noun/modulation/fx-modulation.svg?react'
import FxPhaser from '../HorizontalSignalChain/icons/fx_phaser.svg?react'
import FxPitch from '../HorizontalSignalChain/icons/fx_pitch.svg?react'
import FxPlugin from './noun/multi-effect/fx-plugin.svg?react'
import FxRack from './noun/multi-effect/fx-rack.svg?react'
import FxReverb from './noun/reverb/fx-reverb-category.svg?react'
import FxSimulator from '../HorizontalSignalChain/icons/fx_simulator.svg?react'
import FxUtility from './noun/utility/fx-utility.svg?react'

// Also keep these PiPedal originals that have no branding replacement
import FxConstant from '../HorizontalSignalChain/icons/fx_constant.svg?react'
import FxConverter from '../HorizontalSignalChain/icons/fx_converter.svg?react'
import FxDial from '../HorizontalSignalChain/icons/fx_dial.svg?react'
import FxEmpty from '../HorizontalSignalChain/icons/fx_empty.svg?react'
import FxError from '../HorizontalSignalChain/icons/fx_error.svg?react'
import FxFilterHp from '../HorizontalSignalChain/icons/fx_filter_hp.svg?react'
import FxFlanger from '../HorizontalSignalChain/icons/fx_flanger.svg?react'
import FxFlanger2 from '../HorizontalSignalChain/icons/fx_flanger2.svg?react'
import FxFunction from '../HorizontalSignalChain/icons/fx_function.svg?react'
import FxGenerator from '../HorizontalSignalChain/icons/fx_generator.svg?react'
import FxInstrument from '../HorizontalSignalChain/icons/fx_instrument.svg?react'
import FxLexicon from './noun/reverb/fx-lexicon.svg?react'
import FxLr from '../HorizontalSignalChain/icons/fx_lr.svg?react'
import FxNam from '../HorizontalSignalChain/icons/fx_nam.svg?react'
import FxOscillator from '../HorizontalSignalChain/icons/fx_oscillator.svg?react'
import FxParametricEq from './noun/eq/fx-parametric-eq.svg?react'
import FxSpatial from './noun/reverb/fx-spatial.svg?react'
import FxSpectral from './noun/monitoring/fx-spectral.svg?react'
import FxSplitA from './noun/routing/fx-split.svg?react'
import FxSplitB from '../HorizontalSignalChain/icons/fx_split_b.svg?react'
import FxTerminal from './noun/utility/fx-terminal.svg?react'

export type EffectIconComponent = FC<SVGProps<SVGSVGElement>>

// ── Canonical category → icon mapping ─────────────────────────────────
// Keys are lowercase for case-insensitive matching.
const EFFECT_ICON_MAP: Record<string, EffectIconComponent> = {
  // Product / processor-specific overrides
  'lexi love': FxReverb,
  'pcm 70': FxReverb,
  'tweed bassman': FxAmplifier,
  bassman: FxAmplifier,
  'ultra harmonizer': FxPitch,
  'interval shifter': FxPitch,
  'graillon': FxPitch,
  'drum machine': FxDrums,
  drums: FxDrums,
  'cabinet ir': FxSimulator,
  'reverb ir': FxReverb,
  'synthforge': FxInstrument,

  // Distortion family
  distortion: FxDistortion,
  amplifier: FxAmplifier,
  amp: FxAmplifier,
  overdrive: FxDistortion,
  fuzz: FxDistortion,
  waveshaper: FxDistortion,
  saturation: FxDistortion,

  // EQ / Filter family
  filter: FxFilter,
  eq: FxEq,
  equaliser: FxEq,
  equalizer: FxEq,
  parametric: FxParametricEq,
  'parametric eq': FxParametricEq,
  highpass: FxFilterHp,
  'high-pass': FxFilterHp,
  lowpass: FxFilter,
  'low-pass': FxFilter,
  bandpass: FxFilter,
  'band-pass': FxFilter,
  allpass: FxFilter,
  'all-pass': FxFilter,
  notch: FxFilter,
  comb: FxFilter,
  multiband: FxEq,

  // Time-based
  delay: FxDelay,
  echo: FxDelay,
  reverb: FxReverb,
  spatial: FxSpatial,
  convolution: FxReverb,
  room: FxReverb,
  hall: FxReverb,
  plate: FxReverb,
  spring: FxReverb,

  // Modulation
  chorus: FxChorus,
  intellifx: FxChorus,
  flanger: FxFlanger,
  phaser: FxPhaser,
  modulator: FxModulator,
  modulation: FxModulator,
  tremolo: FxModulator,
  vibrato: FxModulator,
  rotary: FxModulator,
  leslie: FxModulator,
  ringmod: FxModulator,
  'ring modulator': FxModulator,

  // Dynamics
  compressor: FxCompressor,
  dynamics: FxCompressor,
  limiter: FxLimiter,
  gate: FxGate,
  'noise gate': FxGate,
  expander: FxGate,
  envelope: FxCompressor,
  transient: FxCompressor,

  // Simulator / Cabinet
  simulator: FxSimulator,
  cabinet: FxSimulator,
  cab: FxSimulator,
  ir: FxSimulator,
  'impulse response': FxSimulator,
  'amp sim': FxSimulator,
  'amp simulator': FxSimulator,

  // Analysis / Metering
  analyser: FxAnalyzer,
  analyzer: FxAnalyzer,
  spectrum: FxSpectral,
  tuner: FxAnalyzer,
  meter: FxAnalyzer,
  'level meter': FxAnalyzer,
  oscilloscope: FxAnalyzer,
  fft: FxSpectral,

  // Utility
  utility: FxUtility,
  gain: FxMixer,
  volume: FxMixer,
  mixer: FxMixer,
  balance: FxLr,
  pan: FxLr,
  stereo: FxLr,
  'mid/side': FxLr,
  'mid-side': FxLr,
  splitter: FxSplitA,
  constant: FxConstant,

  // Instruments / Generators
  instrument: FxInstrument,
  synth: FxInstrument,
  synthesizer: FxInstrument,
  generator: FxGenerator,
  oscillator: FxOscillator,

  // Pitch
  pitch: FxPitch,
  'pitch shifter': FxPitch,
  'pitch shift': FxPitch,
  harmonizer: FxPitch,
  vocoder: FxPitch,
  autotune: FxPitch,
  'auto-tune': FxPitch,

  // Hardware
  lexicon: FxLexicon,
  'lexicon mpx-1': FxLexicon,
  'mpx-1': FxLexicon,
  mpx1: FxLexicon,
  hardware: FxLexicon,
  'multi-effect': FxRack,
  multieffects: FxRack,
  'multi effects': FxRack,
  rack: FxRack,

  // Neural / ML
  nam: FxNam,
  'neural amp': FxNam,
  'neural amp modeler': FxNam,
  ml: FxNam,
  'machine learning': FxNam,

  // Generic fallback
  effect: FxPlugin,
  plugin: FxPlugin,
  unknown: FxPlugin,
  other: FxPlugin,
}

/**
 * Get the effect icon component for a category string.
 * Single universal lookup — use this everywhere.
 */
export function getEffectIcon(category: string | undefined): EffectIconComponent {
  if (!category) return FxPlugin
  const key = category.toLowerCase().trim()

  // Exact match
  if (key in EFFECT_ICON_MAP) return EFFECT_ICON_MAP[key]

  // Partial match
  for (const [mapKey, icon] of Object.entries(EFFECT_ICON_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return icon
  }

  return FxPlugin
}

// ── Named re-exports for direct use ───────────────────────────────────
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
  FxDrums,
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
  FxLexicon,
  FxLimiter,
  FxLr,
  FxMixer,
  FxModulator,
  FxRack,
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
