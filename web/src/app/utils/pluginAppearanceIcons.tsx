import type { CSSProperties, ComponentType } from 'react'
import {
  Accessibility,
  Activity,
  Add,
  Book,
  Branch,
  Categories,
  ChartLine,
  Flash,
  Headphones,
  Information,
  Launch,
  Meter,
  Music,
  PaintBrush,
  Play,
  Renew,
  Search,
  SettingsAdjust,
  VolumeUp,
  WarningAlt,
  Waveform,
} from '@carbon/icons-react'
import type { CarbonIconType } from '@carbon/icons-react'

import {
  FxAmplifier,
  FxAnalyzer,
  FxChorus,
  FxCompressor,
  FxDelay,
  FxDistortion,
  FxDrums,
  FxEq,
  FxExpression,
  FxFilter,
  FxFlanger,
  FxGate,
  FxInstrument,
  FxLexicon,
  FxLimiter,
  FxMixer,
  FxModulator,
  FxNam,
  FxParametricEq,
  FxPhaser,
  FxPitch,
  FxPlugin,
  FxRack,
  FxReverb,
  FxSimulator,
  FxSpatial,
  FxSpectral,
  FxTerminal,
  FxUtility,
  getEffectIcon,
  type EffectIconComponent,
} from '../components/icons/effectIcons'

type SvgIconProps = { size?: number; style?: CSSProperties; className?: string }

function wrapEffectIcon(SvgIcon: EffectIconComponent): ComponentType<SvgIconProps> {
  return function WrappedIcon({ size = 24, style, className }: SvgIconProps) {
    return <SvgIcon width={size} height={size} style={style} className={className} />
  }
}

export interface PluginAppearanceIconOption {
  identifier: string
  label: string
  keywords: string[]
  Icon: ComponentType<SvgIconProps>
}

const FX_ICON_COMPONENTS: Record<string, EffectIconComponent> = {
  amplifier: FxAmplifier,
  analyzer: FxAnalyzer,
  chorus: FxChorus,
  compressor: FxCompressor,
  delay: FxDelay,
  distortion: FxDistortion,
  drums: FxDrums,
  eq: FxEq,
  expression: FxExpression,
  filter: FxFilter,
  flanger: FxFlanger,
  gate: FxGate,
  instrument: FxInstrument,
  lexicon: FxLexicon,
  limiter: FxLimiter,
  mixer: FxMixer,
  modulation: FxModulator,
  nam: FxNam,
  'parametric-eq': FxParametricEq,
  phaser: FxPhaser,
  pitch: FxPitch,
  plugin: FxPlugin,
  rack: FxRack,
  reverb: FxReverb,
  simulator: FxSimulator,
  spatial: FxSpatial,
  spectral: FxSpectral,
  terminal: FxTerminal,
  utility: FxUtility,
}

const CARBON_ICON_COMPONENTS: Record<string, CarbonIconType> = {
  Accessibility,
  Activity,
  Add,
  Book,
  Branch,
  Categories,
  ChartLine,
  Flash,
  Headphones,
  Information,
  Launch,
  Meter,
  Music,
  PaintBrush,
  Play,
  Renew,
  Search,
  SettingsAdjust,
  VolumeUp,
  WarningAlt,
  Waveform,
}

function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export const CATEGORY_ICON_OPTIONS: PluginAppearanceIconOption[] = Object.entries(FX_ICON_COMPONENTS).map(([key, component]) => ({
  identifier: `fx:${key}`,
  label: titleCase(key),
  keywords: [key, titleCase(key).toLowerCase()],
  Icon: wrapEffectIcon(component),
}))

export const CARBON_ICON_OPTIONS: PluginAppearanceIconOption[] = Object.entries(CARBON_ICON_COMPONENTS).map(([key, component]) => ({
  identifier: `carbon:${key}`,
  label: key,
  keywords: [key.toLowerCase(), key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`).trim()],
  Icon: component,
}))

export function resolvePluginAppearanceIconOption(identifier: string | null | undefined): PluginAppearanceIconOption | null {
  if (!identifier) {
    return null
  }

  return [...CATEGORY_ICON_OPTIONS, ...CARBON_ICON_OPTIONS].find((option) => option.identifier === identifier) ?? null
}

export function renderPluginAppearanceFallback(category: string | undefined, size = 24) {
  const FallbackIcon = wrapEffectIcon(getEffectIcon(category))
  return <FallbackIcon size={size} />
}
