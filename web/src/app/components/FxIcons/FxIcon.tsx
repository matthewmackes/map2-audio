import type { FC, SVGProps } from 'react'

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

import type { FxIconName } from './fxIconRegistry'

const ICON_COMPONENTS: Record<FxIconName, FC<SVGProps<SVGSVGElement>>> = {
  amplifier: FxAmplifier,
  analyzer: FxAnalyzer,
  chorus: FxChorus,
  compressor: FxCompressor,
  constant: FxConstant,
  converter: FxConverter,
  delay: FxDelay,
  dial: FxDial,
  distortion: FxDistortion,
  empty: FxEmpty,
  eq: FxEq,
  error: FxError,
  filter: FxFilter,
  filter_hp: FxFilterHp,
  flanger: FxFlanger,
  flanger2: FxFlanger2,
  function: FxFunction,
  gate: FxGate,
  generator: FxGenerator,
  instrument: FxInstrument,
  lexicon: FxLexicon,
  limiter: FxLimiter,
  lr: FxLr,
  mixer: FxMixer,
  modulator: FxModulator,
  nam: FxNam,
  oscillator: FxOscillator,
  parametric_eq: FxParametricEq,
  phaser: FxPhaser,
  pitch: FxPitch,
  plugin: FxPlugin,
  reverb: FxReverb,
  simulator: FxSimulator,
  spatial: FxSpatial,
  spectral: FxSpectral,
  split_a: FxSplitA,
  split_b: FxSplitB,
  terminal: FxTerminal,
  utility: FxUtility,
}

export type FxIconSize = 16 | 20 | 24

export interface FxIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  name: FxIconName
  size?: FxIconSize
  title?: string
}

export function FxIcon({ name, size = 20, title, ...rest }: FxIconProps) {
  const Component = ICON_COMPONENTS[name]
  return (
    <Component
      width={size}
      height={size}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable={false}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
    </Component>
  )
}
