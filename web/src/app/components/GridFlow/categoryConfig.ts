/**
 * Category Configuration for Grid Flow Components
 * Shared color/icon mappings for plugin categories
 * Uses FontAudio icons for audio-specific visual representation
 */

import {
  Star,
  SpeakerHigh,
  GearSix,
  Sparkle,
  Broadcast,
  ChartBar,
} from '@phosphor-icons/react'
import {
  DynamicsIcon,
  EQIcon,
  CabinetIcon,
  ReverbIcon,
  AmplifierIcon,
  DelayIcon,
  ModulationIcon,
  PitchIcon,
  MultiEffectIcon,
} from '../icons/fontaudio'

type IconProps = { size?: number; style?: React.CSSProperties; className?: string }

export interface CategoryConfig {
  color: string
  bg: string
  icon: React.ComponentType<IconProps>
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  // Favorites (always at top)
  'Favorites': { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', icon: Star },
  // Amp/Distortion
  'Distortion': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: AmplifierIcon },
  'Amplifier': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: AmplifierIcon },
  'Overdrive': { color: '#ff8c42', bg: 'rgba(255, 140, 66, 0.15)', icon: AmplifierIcon },
  'Fuzz': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: AmplifierIcon },
  // EQ/Filter
  'Filter': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: EQIcon },
  'EQ': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: EQIcon },
  'Equaliser': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: EQIcon },
  'Equalizer': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: EQIcon },
  'Parametric': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: EQIcon },
  // Delay
  'Delay': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: DelayIcon },
  'Echo': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: DelayIcon },
  // Reverb
  'Reverb': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: ReverbIcon },
  'Spatial': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: ReverbIcon },
  // Modulation
  'Modulation': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: ModulationIcon },
  'Chorus': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: ModulationIcon },
  'Flanger': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: ModulationIcon },
  'Phaser': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: ModulationIcon },
  'Tremolo': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: ModulationIcon },
  'Vibrato': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: ModulationIcon },
  // Dynamics
  'Compressor': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: DynamicsIcon },
  'Dynamics': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: DynamicsIcon },
  'Limiter': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: DynamicsIcon },
  'Gate': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: DynamicsIcon },
  'Expander': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: DynamicsIcon },
  // Simulator/Instrument
  'Simulator': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: MultiEffectIcon },
  'Instrument': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: MultiEffectIcon },
  'Guitar': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: AmplifierIcon },
  // Cabinet/IR
  'Cabinet': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: CabinetIcon },
  'IR': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: CabinetIcon },
  'Convolution': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: CabinetIcon },
  // Pitch
  'Pitch': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: PitchIcon },
  // Multi-Effect
  'Multi-Effect': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: MultiEffectIcon },
  // Utility
  'Utility': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: GearSix },
  'Gain': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: SpeakerHigh },
  'Mixer': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: SpeakerHigh },
  // Analyser/Tuner/Meter
  'Analyser': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: ChartBar },
  'Analyzer': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: ChartBar },
  'Tuner': { color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.15)', icon: Broadcast },
  'Meter': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: DynamicsIcon },
  'Spectrum': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: ChartBar },
  // Generator
  'Generator': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: MultiEffectIcon },
  // Default
  'Effect': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: Sparkle },
  'default': { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', icon: MultiEffectIcon },
}

export function getCategoryConfig(category: string): CategoryConfig {
  // Check direct match
  if (CATEGORY_CONFIG[category]) return CATEGORY_CONFIG[category]
  // Check partial match
  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    if (category.toLowerCase().includes(key.toLowerCase())) return config
  }
  return CATEGORY_CONFIG['default']
}

export function getCategoryColor(category: string): string {
  return getCategoryConfig(category).color
}

export function getCategoryBg(category: string): string {
  return getCategoryConfig(category).bg
}

export function getCategoryIcon(category: string): React.ComponentType<IconProps> {
  return getCategoryConfig(category).icon
}
