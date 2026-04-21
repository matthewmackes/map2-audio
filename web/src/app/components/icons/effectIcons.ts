/**
 * Universal Effect Icon Provider
 *
 * Single source of truth for all effect category icons across the platform.
 * Backed by the canonical fx_*.svg set at `web/src/assets/fx-icons/` (39
 * icons, blueprint line-art aesthetic). Icons use `stroke="currentColor"`
 * so Carbon theme tokens drive color.
 */

import type { FC, SVGProps } from 'react'

// ── Handoff fx_*.svg icons (blueprint line-art) ───────────────────────
import FxAmplifier from '../../../assets/fx-icons/fx_amplifier.svg?react'
import FxAnalyzer from '../../../assets/fx-icons/fx_analyzer.svg?react'
import FxChorus from '../../../assets/fx-icons/fx_chorus.svg?react'
import FxCompressor from '../../../assets/fx-icons/fx_compressor.svg?react'
import FxConstant from '../../../assets/fx-icons/fx_constant.svg?react'
import FxConverter from '../../../assets/fx-icons/fx_converter.svg?react'
import FxDelay from '../../../assets/fx-icons/fx_delay.svg?react'
import FxDial from '../../../assets/fx-icons/fx_dial.svg?react'
import FxDistortion from '../../../assets/fx-icons/fx_distortion.svg?react'
import FxEmpty from '../../../assets/fx-icons/fx_empty.svg?react'
import FxEq from '../../../assets/fx-icons/fx_eq.svg?react'
import FxError from '../../../assets/fx-icons/fx_error.svg?react'
import FxFilter from '../../../assets/fx-icons/fx_filter.svg?react'
import FxFilterHp from '../../../assets/fx-icons/fx_filter_hp.svg?react'
import FxFlanger from '../../../assets/fx-icons/fx_flanger.svg?react'
import FxFlanger2 from '../../../assets/fx-icons/fx_flanger2.svg?react'
import FxFunction from '../../../assets/fx-icons/fx_function.svg?react'
import FxGate from '../../../assets/fx-icons/fx_gate.svg?react'
import FxGenerator from '../../../assets/fx-icons/fx_generator.svg?react'
import FxInstrument from '../../../assets/fx-icons/fx_instrument.svg?react'
import FxLexicon from '../../../assets/fx-icons/fx_lexicon.svg?react'
import FxLimiter from '../../../assets/fx-icons/fx_limiter.svg?react'
import FxLr from '../../../assets/fx-icons/fx_lr.svg?react'
import FxMixer from '../../../assets/fx-icons/fx_mixer.svg?react'
import FxModulator from '../../../assets/fx-icons/fx_modulator.svg?react'
import FxNam from '../../../assets/fx-icons/fx_nam.svg?react'
import FxOscillator from '../../../assets/fx-icons/fx_oscillator.svg?react'
import FxParametricEq from '../../../assets/fx-icons/fx_parametric_eq.svg?react'
import FxPhaser from '../../../assets/fx-icons/fx_phaser.svg?react'
import FxPitch from '../../../assets/fx-icons/fx_pitch.svg?react'
import FxPlugin from '../../../assets/fx-icons/fx_plugin.svg?react'
import FxReverb from '../../../assets/fx-icons/fx_reverb.svg?react'
import FxSimulator from '../../../assets/fx-icons/fx_simulator.svg?react'
import FxSpatial from '../../../assets/fx-icons/fx_spatial.svg?react'
import FxSpectral from '../../../assets/fx-icons/fx_spectral.svg?react'
import FxSplitA from '../../../assets/fx-icons/fx_split_a.svg?react'
import FxSplitB from '../../../assets/fx-icons/fx_split_b.svg?react'
import FxTerminal from '../../../assets/fx-icons/fx_terminal.svg?react'
import FxUtility from '../../../assets/fx-icons/fx_utility.svg?react'

// Aliases for removed noun/ icons (T710-sub03):
//   FxDrums → FxInstrument (drum machines are instruments)
//   FxExpression → FxDial (expression pedals are single-dial controllers)
//   FxRack → FxPlugin (multi-effect rack is a plugin container)
const FxDrums = FxInstrument
const FxExpression = FxDial
const FxRack = FxPlugin

export type EffectIconComponent = FC<SVGProps<SVGSVGElement>>
export type EffectIconTone = 'outline' | 'solid'

export interface EffectIconSpec {
  component: EffectIconComponent
  tone: EffectIconTone
  matched: boolean
}

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
  expression: FxExpression,
  'expression pedal': FxExpression,
  wah: FxExpression,
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

// Handoff fx_*.svg set is uniform line-art; every icon is outline-toned.
function getEffectIconTone(_component: EffectIconComponent): EffectIconTone {
  return 'outline'
}

function resolveEffectIcon(category: string | undefined): { component: EffectIconComponent; matched: boolean } {
  if (!category) {
    return { component: FxPlugin, matched: false }
  }

  const key = category.toLowerCase().trim()

  // Exact match
  if (key in EFFECT_ICON_MAP) {
    return { component: EFFECT_ICON_MAP[key], matched: true }
  }

  // Partial match
  for (const [mapKey, icon] of Object.entries(EFFECT_ICON_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      return { component: icon, matched: true }
    }
  }

  return { component: FxPlugin, matched: false }
}

/**
 * Get the effect icon component for a category string.
 * Single universal lookup — use this everywhere.
 */
export function getEffectIcon(category: string | undefined): EffectIconComponent {
  return resolveEffectIcon(category).component
}

// ── PedalKind → effect icon ────────────────────────────────────────────
// Mirrors the PedalKind union from StagePedalChain without importing it
// (avoids a circular dependency through the SVG asset chain).
const PEDAL_KIND_CATEGORY: Record<string, string> = {
  tuner:      'tuner',
  comp:       'compressor',
  overdrive:  'overdrive',
  distortion: 'distortion',
  fuzz:       'fuzz',
  eq:         'eq',
  wah:        'wah',
  chorus:     'chorus',
  phaser:     'phaser',
  flanger:    'flanger',
  tremolo:    'tremolo',
  pitch:      'pitch',
  delay:      'delay',
  reverb:     'reverb',
  looper:     'modulator',
}

/**
 * Canonical icon for a PedalKind value.
 * Use wherever a signal-chain stage needs an icon — chyron, snapshot editor, etc.
 */
export function getPedalKindIcon(kind: string): EffectIconComponent {
  return getEffectIcon(PEDAL_KIND_CATEGORY[kind] ?? kind)
}

export function getPedalKindIconSpec(kind: string): EffectIconSpec {
  return getEffectIconSpec(PEDAL_KIND_CATEGORY[kind] ?? kind)
}

export function getEffectIconSpec(category: string | undefined): EffectIconSpec {
  const { component, matched } = resolveEffectIcon(category)

  return {
    component,
    tone: getEffectIconTone(component),
    matched,
  }
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
  FxExpression,
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
