import fxAmplifier from '../../../assets/fx-icons/fx_amplifier.svg?url'
import fxAnalyzer from '../../../assets/fx-icons/fx_analyzer.svg?url'
import fxChorus from '../../../assets/fx-icons/fx_chorus.svg?url'
import fxCompressor from '../../../assets/fx-icons/fx_compressor.svg?url'
import fxConstant from '../../../assets/fx-icons/fx_constant.svg?url'
import fxConverter from '../../../assets/fx-icons/fx_converter.svg?url'
import fxDelay from '../../../assets/fx-icons/fx_delay.svg?url'
import fxDial from '../../../assets/fx-icons/fx_dial.svg?url'
import fxDistortion from '../../../assets/fx-icons/fx_distortion.svg?url'
import fxEmpty from '../../../assets/fx-icons/fx_empty.svg?url'
import fxEq from '../../../assets/fx-icons/fx_eq.svg?url'
import fxError from '../../../assets/fx-icons/fx_error.svg?url'
import fxFilter from '../../../assets/fx-icons/fx_filter.svg?url'
import fxFilterHp from '../../../assets/fx-icons/fx_filter_hp.svg?url'
import fxFlanger from '../../../assets/fx-icons/fx_flanger.svg?url'
import fxFlanger2 from '../../../assets/fx-icons/fx_flanger2.svg?url'
import fxFunction from '../../../assets/fx-icons/fx_function.svg?url'
import fxGate from '../../../assets/fx-icons/fx_gate.svg?url'
import fxGenerator from '../../../assets/fx-icons/fx_generator.svg?url'
import fxInstrument from '../../../assets/fx-icons/fx_instrument.svg?url'
import fxLexicon from '../../../assets/fx-icons/fx_lexicon.svg?url'
import fxLimiter from '../../../assets/fx-icons/fx_limiter.svg?url'
import fxLr from '../../../assets/fx-icons/fx_lr.svg?url'
import fxMixer from '../../../assets/fx-icons/fx_mixer.svg?url'
import fxModulator from '../../../assets/fx-icons/fx_modulator.svg?url'
import fxNam from '../../../assets/fx-icons/fx_nam.svg?url'
import fxOscillator from '../../../assets/fx-icons/fx_oscillator.svg?url'
import fxParametricEq from '../../../assets/fx-icons/fx_parametric_eq.svg?url'
import fxPhaser from '../../../assets/fx-icons/fx_phaser.svg?url'
import fxPitch from '../../../assets/fx-icons/fx_pitch.svg?url'
import fxPlugin from '../../../assets/fx-icons/fx_plugin.svg?url'
import fxReverb from '../../../assets/fx-icons/fx_reverb.svg?url'
import fxSimulator from '../../../assets/fx-icons/fx_simulator.svg?url'
import fxSpatial from '../../../assets/fx-icons/fx_spatial.svg?url'
import fxSpectral from '../../../assets/fx-icons/fx_spectral.svg?url'
import fxSplitA from '../../../assets/fx-icons/fx_split_a.svg?url'
import fxSplitB from '../../../assets/fx-icons/fx_split_b.svg?url'
import fxTerminal from '../../../assets/fx-icons/fx_terminal.svg?url'
import fxUtility from '../../../assets/fx-icons/fx_utility.svg?url'

export const FX_ICONS = {
  amplifier: fxAmplifier,
  analyzer: fxAnalyzer,
  chorus: fxChorus,
  compressor: fxCompressor,
  constant: fxConstant,
  converter: fxConverter,
  delay: fxDelay,
  dial: fxDial,
  distortion: fxDistortion,
  empty: fxEmpty,
  eq: fxEq,
  error: fxError,
  filter: fxFilter,
  filter_hp: fxFilterHp,
  flanger: fxFlanger,
  flanger2: fxFlanger2,
  function: fxFunction,
  gate: fxGate,
  generator: fxGenerator,
  instrument: fxInstrument,
  lexicon: fxLexicon,
  limiter: fxLimiter,
  lr: fxLr,
  mixer: fxMixer,
  modulator: fxModulator,
  nam: fxNam,
  oscillator: fxOscillator,
  parametric_eq: fxParametricEq,
  phaser: fxPhaser,
  pitch: fxPitch,
  plugin: fxPlugin,
  reverb: fxReverb,
  simulator: fxSimulator,
  spatial: fxSpatial,
  spectral: fxSpectral,
  split_a: fxSplitA,
  split_b: fxSplitB,
  terminal: fxTerminal,
  utility: fxUtility,
} as const satisfies Record<string, string>

export type FxIconName = keyof typeof FX_ICONS

export const FX_ICON_NAMES = Object.keys(FX_ICONS) as FxIconName[]

export function getFxIconUrl(name: FxIconName): string {
  return FX_ICONS[name]
}

export function isFxIconName(value: string): value is FxIconName {
  return value in FX_ICONS
}
