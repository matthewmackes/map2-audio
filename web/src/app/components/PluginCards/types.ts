/**
 * PluginCards Type Definitions
 *
 * Types for the plugin card system including templates, visualizations,
 * and parameter grouping.
 */

import type { Plugin, PluginParameter, OutputPort } from '../../../map2/types'
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
import type { FC, SVGProps } from 'react'

// Icon component type
export type IconComponent = FC<SVGProps<SVGSVGElement> & { size?: number }>

// ==================== Plugin Card Types ====================

/** Props passed to all plugin card components */
export interface PluginCardProps {
  plugin: Plugin
  parameterValues: Record<number, number>
  onParameterChange: (paramIndex: number, value: number) => void
  onParameterChangeEnd?: () => void
  onBypassToggle?: (bypassed: boolean) => void
  accentColor: string
  disabled?: boolean
  compact?: boolean
  /** Real-time data for visualizations (gain reduction, meters, etc.) */
  realtimeData?: PluginRealtimeData
}

/** Configuration for a plugin card in the registry */
export interface PluginCardConfig {
  /** Custom component to render (if any) */
  component?: React.ComponentType<PluginCardProps>
  /** Lazy loader for the component — loaded on demand */
  loader?: () => Promise<{ default: React.ComponentType<PluginCardProps> }>
  /** Template to use if no custom component */
  template?: PluginCardTemplate
  /** Lazy loader for a template component */
  templateLoader?: () => Promise<{ default: React.ComponentType<PluginCardProps> }>
  /** Additional visualizations to include */
  visualizations?: VisualizationType[]
  /** Custom parameter grouping */
  parameterGroups?: ParameterGroupConfig[]
  /** Card-specific options */
  options?: PluginCardOptions
}

/** Available category templates */
export type PluginCardTemplate =
  | 'dynamics'
  | 'reverb'
  | 'eq'
  | 'delay'
  | 'distortion'
  | 'modulation'
  | 'pitch'
  | 'utility'
  | 'instrument'
  | 'filter'

/** Available visualization components */
export type VisualizationType =
  | 'gain-reduction-meter'
  | 'transfer-curve'
  | 'eq-curve'
  | 'reverb-decay'
  | 'delay-tap-grid'
  | 'lfo-waveform'
  | 'distortion-curve'
  | 'pitch-display'
  | 'spectrum-analyzer'
  | 'tuner'
  | 'level-meter'

/** Card display options */
export interface PluginCardOptions {
  /** Show visualization section */
  showVisualization?: boolean
  /** Default knob size */
  knobSize?: 'small' | 'medium' | 'large'
  /** Show meters if available */
  showMeters?: boolean
  /** Collapsible parameter sections */
  collapsibleSections?: boolean
  /** Show preset selector in header */
  showPresetSelector?: boolean
}

// ==================== Parameter Grouping ====================

/** Parameter group configuration */
export interface ParameterGroupConfig {
  /** Group identifier */
  id: string
  /** Display label */
  label: string
  /** Icon name (lucide-react) */
  icon?: string
  /** Parameter indices or symbols to include */
  parameters: (number | string)[]
  /** Group is collapsible */
  collapsible?: boolean
  /** Start collapsed */
  defaultCollapsed?: boolean
  /** Knob size for this group */
  knobSize?: 'small' | 'medium' | 'large'
  /** Layout style */
  layout?: 'row' | 'grid' | 'column'
  /** Number of columns (for grid layout) */
  columns?: number
}

/** Standard parameter group types */
export type StandardGroup =
  | 'INPUT'
  | 'OUTPUT'
  | 'TIMING'
  | 'THRESHOLD'
  | 'FREQUENCY'
  | 'MODULATION'
  | 'SPATIAL'
  | 'MIX'
  | 'OTHER'

/** Parameter group keywords for auto-detection */
export const PARAMETER_GROUP_KEYWORDS: Record<StandardGroup, string[]> = {
  INPUT: ['input', 'drive', 'gain_in', 'level_in', 'sensitivity', 'in_level', 'input_gain'],
  OUTPUT: ['output', 'level', 'gain', 'volume', 'master', 'out_level', 'output_gain', 'makeup'],
  TIMING: ['attack', 'release', 'hold', 'decay', 'time', 'delay', 'predelay', 'pre_delay'],
  THRESHOLD: ['threshold', 'knee', 'ratio', 'ceiling', 'limit'],
  FREQUENCY: ['freq', 'frequency', 'cutoff', 'hz', 'tone', 'color', 'lowpass', 'highpass', 'filter'],
  MODULATION: ['rate', 'depth', 'speed', 'lfo', 'mod', 'amount'],
  SPATIAL: ['width', 'pan', 'stereo', 'spread', 'size', 'room', 'space', 'diffusion'],
  MIX: ['mix', 'wet', 'dry', 'blend', 'balance'],
  OTHER: [],
}

/** Categorize a parameter into a standard group */
export function categorizeParameter(param: PluginParameter): StandardGroup {
  const name = param.name.toLowerCase()
  const symbol = param.symbol.toLowerCase()

  for (const [group, keywords] of Object.entries(PARAMETER_GROUP_KEYWORDS)) {
    if (group === 'OTHER') continue
    if (keywords.some(kw => name.includes(kw) || symbol.includes(kw))) {
      return group as StandardGroup
    }
  }
  return 'OTHER'
}

/** Auto-generate parameter groups for a plugin */
export function generateParameterGroups(parameters: PluginParameter[]): ParameterGroupConfig[] {
  const grouped: Record<StandardGroup, PluginParameter[]> = {
    INPUT: [],
    OUTPUT: [],
    TIMING: [],
    THRESHOLD: [],
    FREQUENCY: [],
    MODULATION: [],
    SPATIAL: [],
    MIX: [],
    OTHER: [],
  }

  // Categorize each parameter
  parameters.forEach(param => {
    const group = categorizeParameter(param)
    grouped[group].push(param)
  })

  // Build group configs, only include non-empty groups
  const groupOrder: StandardGroup[] = ['INPUT', 'THRESHOLD', 'TIMING', 'FREQUENCY', 'SPATIAL', 'MODULATION', 'MIX', 'OUTPUT', 'OTHER']
  const groupLabels: Record<StandardGroup, string> = {
    INPUT: 'Input',
    OUTPUT: 'Output',
    TIMING: 'Timing',
    THRESHOLD: 'Dynamics',
    FREQUENCY: 'Tone',
    MODULATION: 'Modulation',
    SPATIAL: 'Space',
    MIX: 'Mix',
    OTHER: 'Other',
  }

  const configs: ParameterGroupConfig[] = []

  for (const group of groupOrder) {
    if (grouped[group].length > 0) {
      configs.push({
        id: group.toLowerCase(),
        label: groupLabels[group],
        parameters: grouped[group].map(p => p.index),
        layout: 'row',
        knobSize: 'medium',
      })
    }
  }

  // If only one or two groups, flatten to single "All Parameters" group
  if (configs.length <= 2 || parameters.length <= 8) {
    return [{
      id: 'all',
      label: 'Parameters',
      parameters: parameters.map(p => p.index),
      layout: 'grid',
      columns: Math.min(4, Math.ceil(parameters.length / 2)),
      knobSize: 'medium',
    }]
  }

  return configs
}

// ==================== Category Colors ====================

/** Category color configuration */
export interface CategoryColorConfig {
  color: string
  bg: string
  gradient?: string
  icon?: IconComponent
}

/** Category colors (matching existing system) with FontAudio icons */
export const CATEGORY_COLORS: Record<string, CategoryColorConfig> = {
  'Distortion': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', gradient: 'linear-gradient(135deg, #ff6b6b20 0%, #ff6b6b05 100%)' },
  'Amplifier': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)', gradient: 'linear-gradient(135deg, #ff6b6b20 0%, #ff6b6b05 100%)', icon: AmplifierIcon },
  'Filter': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', gradient: 'linear-gradient(135deg, #4ecdc420 0%, #4ecdc405 100%)' },
  'EQ': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)', gradient: 'linear-gradient(135deg, #4ecdc420 0%, #4ecdc405 100%)', icon: EQIcon },
  'Delay': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)', gradient: 'linear-gradient(135deg, #45b7d120 0%, #45b7d105 100%)', icon: DelayIcon },
  'Reverb': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', gradient: 'linear-gradient(135deg, #a855f720 0%, #a855f705 100%)', icon: ReverbIcon },
  'Modulation': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', gradient: 'linear-gradient(135deg, #f59e0b20 0%, #f59e0b05 100%)', icon: ModulationIcon },
  'Compressor': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', gradient: 'linear-gradient(135deg, #22c55e20 0%, #22c55e05 100%)', icon: DynamicsIcon },
  'Dynamics': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', gradient: 'linear-gradient(135deg, #22c55e20 0%, #22c55e05 100%)', icon: DynamicsIcon },
  'Limiter': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', gradient: 'linear-gradient(135deg, #22c55e20 0%, #22c55e05 100%)', icon: DynamicsIcon },
  'Gate': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', gradient: 'linear-gradient(135deg, #22c55e20 0%, #22c55e05 100%)', icon: DynamicsIcon },
  'Simulator': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', gradient: 'linear-gradient(135deg, #ec489920 0%, #ec489905 100%)' },
  'Cabinet': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', gradient: 'linear-gradient(135deg, #f9731620 0%, #f9731605 100%)', icon: CabinetIcon },
  'Utility': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', gradient: 'linear-gradient(135deg, #64748b20 0%, #64748b05 100%)' },
  'Generator': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', gradient: 'linear-gradient(135deg, #8b5cf620 0%, #8b5cf605 100%)' },
  'Instrument': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', gradient: 'linear-gradient(135deg, #8b5cf620 0%, #8b5cf605 100%)' },
  'Pitch': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', gradient: 'linear-gradient(135deg, #06b6d420 0%, #06b6d405 100%)', icon: PitchIcon },
  'Multi-Effect': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', gradient: 'linear-gradient(135deg, #ec489920 0%, #ec489905 100%)', icon: MultiEffectIcon },
}

/** Get color configuration for a category */
export function getCategoryConfig(category: string): CategoryColorConfig {
  return CATEGORY_COLORS[category] || {
    color: '#37d6c9',
    bg: 'rgba(55, 214, 201, 0.15)',
    gradient: 'linear-gradient(135deg, #37d6c920 0%, #37d6c905 100%)'
  }
}

/** Get icon component for a category */
export function getCategoryIcon(category: string): IconComponent | null {
  const config = CATEGORY_COLORS[category]
  return config?.icon || null
}

/** Map category to template type */
export function categoryToTemplate(category: string): PluginCardTemplate {
  const mapping: Record<string, PluginCardTemplate> = {
    'Compressor': 'dynamics',
    'Dynamics': 'dynamics',
    'Limiter': 'dynamics',
    'Gate': 'dynamics',
    'Reverb': 'reverb',
    'EQ': 'eq',
    'Filter': 'filter',
    'Delay': 'delay',
    'Distortion': 'distortion',
    'Amplifier': 'distortion',
    'Modulation': 'modulation',
    'Pitch': 'pitch',
    'Generator': 'instrument',
    'Instrument': 'instrument',
    'Utility': 'utility',
    'Simulator': 'distortion',
    'Cabinet': 'utility',
  }
  return mapping[category] || 'utility'
}

// ==================== Visualization Props ====================

/** Props for the gain reduction meter */
export interface GainReductionMeterProps {
  gainReduction: number
  maxReduction?: number
  height?: number
  width?: number
  showLabel?: boolean
  accentColor?: string
}

/** Props for transfer curve (compressor/limiter) */
export interface TransferCurveProps {
  threshold: number
  ratio: number
  knee: number
  makeupGain?: number
  width?: number
  height?: number
  accentColor?: string
  inputLevel?: number
  outputLevel?: number
}

/** Props for EQ curve display */
export interface EQCurveProps {
  bands: EQBand[]
  width?: number
  height?: number
  accentColor?: string
  showGrid?: boolean
  interactive?: boolean
  onBandChange?: (index: number, band: EQBand) => void
}

export interface EQBand {
  frequency: number
  gain: number
  q: number
  type?: 'lowshelf' | 'highshelf' | 'peak' | 'lowpass' | 'highpass' | 'notch'
  enabled?: boolean
}

/** Props for reverb decay curve */
export interface ReverbDecayCurveProps {
  decayTime: number
  preDelay?: number
  earlyReflections?: number
  damping?: number
  width?: number
  height?: number
  accentColor?: string
}

/** Props for delay tap grid */
export interface DelayTapGridProps {
  delayTimeL: number
  delayTimeR?: number
  feedback: number
  pingPong?: boolean
  width?: number
  height?: number
  accentColor?: string
  maxTaps?: number
}

/** Props for LFO waveform display */
export interface LFOWaveformProps {
  rate: number
  depth: number
  waveform?: 'sine' | 'triangle' | 'square' | 'saw'
  phase?: number
  width?: number
  height?: number
  accentColor?: string
  animated?: boolean
}

/** Props for distortion curve */
export interface DistortionCurveProps {
  drive: number
  type?: 'soft' | 'hard' | 'tube' | 'tape' | 'fuzz'
  bias?: number
  width?: number
  height?: number
  accentColor?: string
}

/** Props for pitch display */
export interface PitchDisplayProps {
  semitones: number
  cents?: number
  detune?: number
  width?: number
  height?: number
  accentColor?: string
  showNote?: boolean
}

// ==================== Real-time Data ====================

/** Real-time plugin data for visualizations */
export interface PluginRealtimeData {
  /** Gain reduction amount (0-1 normalized, or dB) */
  gainReduction?: number
  /** Input level in dB */
  inputLevel?: number
  /** Output level in dB */
  outputLevel?: number
  /** Tuner data */
  tuner?: {
    frequency: number
    note: string
    octave: number
    cents: number
    confidence: number
  }
  /** Spectrum data */
  spectrum?: {
    frequencies: number[]
    magnitudes: number[]
  }
  /** Output port values by index */
  outputPorts: Record<number, number>
  /** Peak data by port symbol */
  peaks: Record<string, {
    peak: number
    rms: number
    holdPeak: number
    isClipping: boolean
  }>
  /** Connection status */
  connected: boolean
}
