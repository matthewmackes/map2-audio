/**
 * Category Configuration for Grid Flow Components
 * Shared color/icon mappings for plugin categories
 */

import {
  Star,
  Zap,
  SlidersHorizontal,
  Timer,
  Waves,
  Activity,
  Gauge,
  Guitar,
  Mic,
  Volume2,
  Settings2,
  AudioLines,
  Sparkles,
  Radio,
  BarChart2,
} from 'lucide-react'

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
  'Distortion': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: Zap },
  'Amplifier': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: Zap },
  'Overdrive': { color: '#ff8c42', bg: 'rgba(255, 140, 66, 0.15)', icon: Zap },
  'Fuzz': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', icon: Zap },
  // EQ/Filter
  'Filter': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'EQ': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'Equaliser': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'Equalizer': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  'Parametric': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', icon: SlidersHorizontal },
  // Delay
  'Delay': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: Timer },
  'Echo': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', icon: Timer },
  // Reverb
  'Reverb': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: Waves },
  'Spatial': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: Waves },
  // Modulation
  'Modulation': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Chorus': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Flanger': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Phaser': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Tremolo': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  'Vibrato': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Activity },
  // Dynamics
  'Compressor': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Dynamics': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Limiter': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Gate': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  'Expander': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', icon: Gauge },
  // Simulator/Instrument
  'Simulator': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: Guitar },
  'Instrument': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: Guitar },
  'Guitar': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: Guitar },
  // Cabinet/IR
  'Cabinet': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: Mic },
  'IR': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: Mic },
  'Convolution': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: Mic },
  // Utility
  'Utility': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: Settings2 },
  'Gain': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: Volume2 },
  'Mixer': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', icon: Volume2 },
  // Analyser/Tuner/Meter
  'Analyser': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: BarChart2 },
  'Analyzer': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: BarChart2 },
  'Tuner': { color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.15)', icon: Radio },
  'Meter': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: Gauge },
  'Spectrum': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', icon: BarChart2 },
  // Generator
  'Generator': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', icon: AudioLines },
  // Default
  'Effect': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', icon: Sparkles },
  'default': { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', icon: AudioLines },
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
