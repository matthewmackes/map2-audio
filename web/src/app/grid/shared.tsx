import type { CSSProperties, ComponentType } from 'react'
import {
  ChartLineData as ChartBar,
  FavoriteFilled as Star,
  Music as Broadcast,
  SettingsAdjust as GearSix,
  VolumeUp as SpeakerHigh,
} from '@carbon/icons-react'
import {
  MapAmplifierIcon,
  MapCabinetIcon,
  MapDelayIcon,
  MapDynamicsIcon,
  MapEqualizerIcon,
  MapMatrixProcessorIcon,
  MapModulationIcon,
  MapMultiEffectIcon,
  MapPitchIcon,
  MapRackDeviceIcon,
  MapReverbIcon,
} from '../components/icons/map'

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

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  Favorites: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', icon: Star },
  Distortion: { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: MapAmplifierIcon },
  Amplifier: { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: MapAmplifierIcon },
  Overdrive: { color: '#ff8c42', bg: 'rgba(255, 140, 66, 0.15)', icon: MapAmplifierIcon },
  Fuzz: { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: MapAmplifierIcon },
  Filter: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: MapEqualizerIcon },
  EQ: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: MapEqualizerIcon },
  Equaliser: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: MapEqualizerIcon },
  Equalizer: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: MapEqualizerIcon },
  Parametric: { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: MapEqualizerIcon },
  Delay: { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: MapDelayIcon },
  Echo: { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: MapDelayIcon },
  Reverb: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: MapReverbIcon },
  Spatial: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: MapReverbIcon },
  Modulation: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: MapModulationIcon },
  Chorus: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: MapModulationIcon },
  Flanger: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: MapModulationIcon },
  Phaser: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: MapModulationIcon },
  Tremolo: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: MapModulationIcon },
  Vibrato: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: MapModulationIcon },
  Compressor: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: MapDynamicsIcon },
  Dynamics: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: MapDynamicsIcon },
  Limiter: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: MapDynamicsIcon },
  Gate: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: MapDynamicsIcon },
  Expander: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: MapDynamicsIcon },
  Simulator: { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: MapMultiEffectIcon },
  Instrument: { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: MapMultiEffectIcon },
  Guitar: { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: MapAmplifierIcon },
  Cabinet: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: MapCabinetIcon },
  IR: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: MapCabinetIcon },
  Convolution: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: MapCabinetIcon },
  Pitch: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: MapPitchIcon },
  'Multi-Effect': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: MapMultiEffectIcon },
  Utility: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: GearSix },
  Gain: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: SpeakerHigh },
  Mixer: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: SpeakerHigh },
  Analyser: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: ChartBar },
  Analyzer: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: ChartBar },
  Tuner: { color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.15)', icon: Broadcast },
  Meter: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: MapDynamicsIcon },
  Spectrum: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: ChartBar },
  Generator: { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: MapMultiEffectIcon },
  lexicon: { color: '#C8A951', bg: 'rgba(200, 169, 81, 0.15)', icon: MapRackDeviceIcon },
  Hardware: { color: '#C8A951', bg: 'rgba(200, 169, 81, 0.15)', icon: MapMatrixProcessorIcon },
  Effect: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: MapMultiEffectIcon },
  default: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', icon: MapMultiEffectIcon },
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
