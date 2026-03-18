import type { CSSProperties, ComponentType } from 'react'
import {
  FavoriteFilled as Star,
} from '@carbon/icons-react'
import { getEffectIcon } from '../components/icons/effectIcons'
import type { EffectIconComponent } from '../components/icons/effectIcons'

type IconProps = { size?: number; style?: CSSProperties; className?: string }

export interface CategoryConfig {
  color: string
  bg: string
  icon: ComponentType<IconProps>
}

export interface MidiMapping {
  id: string
  parameterName: string
  pluginName: string
  pluginUri: string
  ccNumber: number
  channel: number
  min: number
  max: number
  inverted: boolean
}

export interface AutomationPoint {
  id: string
  time: number
  value: number
  curve: 'linear' | 'step' | 'smooth'
}

export interface AutomationLane {
  id: string
  parameterName: string
  pluginName: string
  pluginUri: string
  parameterSymbol: string
  points: AutomationPoint[]
  enabled: boolean
  armed: boolean
  color: string
}

/** Wrap an SVG effect icon so it also accepts { size, style, className } */
function wrapEffectIcon(SvgIcon: EffectIconComponent): ComponentType<IconProps> {
  return function WrappedIcon({ size = 24, style, className }: IconProps) {
    return <SvgIcon width={size} height={size} style={style} className={className} />
  }
}

/** Lazily-created wrapped icon cache to avoid re-creating on every render */
const wrappedCache = new Map<string, ComponentType<IconProps>>()
function getWrappedEffectIcon(category: string): ComponentType<IconProps> {
  let wrapped = wrappedCache.get(category)
  if (!wrapped) {
    wrapped = wrapEffectIcon(getEffectIcon(category))
    wrappedCache.set(category, wrapped)
  }
  return wrapped
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  Favorites: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', icon: Star },
  Distortion: { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: getWrappedEffectIcon('distortion') },
  Amplifier: { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: getWrappedEffectIcon('amplifier') },
  Overdrive: { color: '#ff8c42', bg: 'rgba(255, 140, 66, 0.15)', icon: getWrappedEffectIcon('distortion') },
  Fuzz: { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: getWrappedEffectIcon('distortion') },
  Filter: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: getWrappedEffectIcon('filter') },
  EQ: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: getWrappedEffectIcon('eq') },
  Equaliser: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: getWrappedEffectIcon('eq') },
  Equalizer: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: getWrappedEffectIcon('eq') },
  Parametric: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: getWrappedEffectIcon('parametric eq') },
  Delay: { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: getWrappedEffectIcon('delay') },
  Echo: { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: getWrappedEffectIcon('delay') },
  Reverb: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: getWrappedEffectIcon('reverb') },
  Spatial: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: getWrappedEffectIcon('reverb') },
  Modulation: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: getWrappedEffectIcon('modulation') },
  Chorus: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: getWrappedEffectIcon('chorus') },
  Flanger: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: getWrappedEffectIcon('flanger') },
  Phaser: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: getWrappedEffectIcon('phaser') },
  Tremolo: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: getWrappedEffectIcon('modulation') },
  Vibrato: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: getWrappedEffectIcon('modulation') },
  Compressor: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: getWrappedEffectIcon('compressor') },
  Dynamics: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: getWrappedEffectIcon('compressor') },
  Limiter: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: getWrappedEffectIcon('limiter') },
  Gate: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: getWrappedEffectIcon('gate') },
  Expander: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: getWrappedEffectIcon('gate') },
  Simulator: { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: getWrappedEffectIcon('simulator') },
  Instrument: { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: getWrappedEffectIcon('instrument') },
  Guitar: { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: getWrappedEffectIcon('amplifier') },
  Cabinet: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: getWrappedEffectIcon('cabinet') },
  IR: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: getWrappedEffectIcon('cabinet') },
  Convolution: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: getWrappedEffectIcon('cabinet') },
  Pitch: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: getWrappedEffectIcon('pitch') },
  'Multi-Effect': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: getWrappedEffectIcon('multi-effect') },
  Utility: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: getWrappedEffectIcon('utility') },
  Gain: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: getWrappedEffectIcon('gain') },
  Mixer: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: getWrappedEffectIcon('mixer') },
  Analyser: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: getWrappedEffectIcon('analyzer') },
  Analyzer: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: getWrappedEffectIcon('analyzer') },
  Tuner: { color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.15)', icon: getWrappedEffectIcon('tuner') },
  Meter: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: getWrappedEffectIcon('meter') },
  Spectrum: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: getWrappedEffectIcon('spectrum') },
  Generator: { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: getWrappedEffectIcon('generator') },
  lexicon: { color: '#C8A951', bg: 'rgba(200, 169, 81, 0.15)', icon: getWrappedEffectIcon('lexicon') },
  Hardware: { color: '#C8A951', bg: 'rgba(200, 169, 81, 0.15)', icon: getWrappedEffectIcon('hardware') },
  Effect: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: getWrappedEffectIcon('effect') },
  default: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', icon: getWrappedEffectIcon('plugin') },
}

export function getCategoryConfig(category: string): CategoryConfig {
  if (CATEGORY_CONFIG[category]) {
    return CATEGORY_CONFIG[category]
  }

  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    if (category.toLowerCase().includes(key.toLowerCase())) {
      return config
    }
  }

  return CATEGORY_CONFIG.default
}

export function getCategoryColor(category: string): string {
  return getCategoryConfig(category).color
}

export function getCategoryBg(category: string): string {
  return getCategoryConfig(category).bg
}

export function getCategoryIcon(category: string): ComponentType<IconProps> {
  return getCategoryConfig(category).icon
}
