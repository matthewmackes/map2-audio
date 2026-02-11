/**
 * Plugin Card Registry
 *
 * Maps plugin URIs to their custom card components or templates.
 * Provides fallback chain: Custom Card → Category Template → Generic Editor
 */

import type { ComponentType } from 'react'
import type {
  PluginCardProps,
  PluginCardConfig,
  PluginCardTemplate,
  VisualizationType,
} from './types'
import { categoryToTemplate } from './types'

// ==================== Registry Storage ====================

/** Registry of plugin URIs to card configurations */
const PLUGIN_REGISTRY = new Map<string, PluginCardConfig>()

/** Registry of URI patterns to card configurations */
const PATTERN_REGISTRY: Array<{ pattern: RegExp; config: PluginCardConfig }> = []

/** Registry of templates */
const TEMPLATE_REGISTRY = new Map<PluginCardTemplate, ComponentType<PluginCardProps>>()

// ==================== Registration Functions ====================

/**
 * Register a custom card component for a specific plugin URI
 */
export function registerPluginCard(
  uri: string,
  config: PluginCardConfig
): void {
  PLUGIN_REGISTRY.set(uri, config)
}

/**
 * Register a custom card for plugins matching a URI pattern
 */
export function registerPluginPattern(
  pattern: RegExp,
  config: PluginCardConfig
): void {
  PATTERN_REGISTRY.push({ pattern, config })
}

/**
 * Register a template component for a category
 */
export function registerTemplate(
  template: PluginCardTemplate,
  component: ComponentType<PluginCardProps>
): void {
  TEMPLATE_REGISTRY.set(template, component)
}

// ==================== Lookup Functions ====================

/**
 * Get the card configuration for a plugin
 * Fallback chain: Exact URI → Pattern match → Category template → null
 */
export function getPluginCardConfig(
  uri: string,
  category: string
): PluginCardConfig | null {
  // 1. Check exact URI match
  const exactMatch = PLUGIN_REGISTRY.get(uri)
  if (exactMatch) {
    return exactMatch
  }

  // 2. Check pattern matches
  for (const { pattern, config } of PATTERN_REGISTRY) {
    if (pattern.test(uri)) {
      return config
    }
  }

  // 3. Use category template
  const template = categoryToTemplate(category)
  if (TEMPLATE_REGISTRY.has(template)) {
    return { template }
  }

  // 4. No match found
  return null
}

/**
 * Get the card component for a plugin
 */
export function getPluginCardComponent(
  uri: string,
  category: string
): ComponentType<PluginCardProps> | null {
  const config = getPluginCardConfig(uri, category)

  if (!config) {
    return null
  }

  // Custom component takes priority
  if (config.component) {
    return config.component
  }

  // Fall back to template
  if (config.template) {
    return TEMPLATE_REGISTRY.get(config.template) || null
  }

  return null
}

/**
 * Get the template component directly
 */
export function getTemplateComponent(
  template: PluginCardTemplate
): ComponentType<PluginCardProps> | null {
  return TEMPLATE_REGISTRY.get(template) || null
}

/**
 * Check if a plugin has a custom card
 */
export function hasCustomCard(uri: string): boolean {
  return PLUGIN_REGISTRY.has(uri)
}

/**
 * Get all registered plugin URIs
 */
export function getRegisteredPlugins(): string[] {
  return Array.from(PLUGIN_REGISTRY.keys())
}

/**
 * Get all registered templates
 */
export function getRegisteredTemplates(): PluginCardTemplate[] {
  return Array.from(TEMPLATE_REGISTRY.keys())
}

// ==================== Default Configurations ====================

/**
 * Default visualizations for each template type
 */
export const DEFAULT_TEMPLATE_VISUALIZATIONS: Record<PluginCardTemplate, VisualizationType[]> = {
  dynamics: ['gain-reduction-meter', 'transfer-curve'],
  reverb: ['reverb-decay'],
  eq: ['eq-curve'],
  delay: ['delay-tap-grid'],
  distortion: ['distortion-curve'],
  modulation: ['lfo-waveform'],
  pitch: ['pitch-display', 'tuner'],
  utility: ['level-meter'],
  instrument: ['spectrum-analyzer'],
  filter: ['eq-curve'],
}

/**
 * Get default visualizations for a template
 */
export function getDefaultVisualizations(template: PluginCardTemplate): VisualizationType[] {
  return DEFAULT_TEMPLATE_VISUALIZATIONS[template] || []
}

// ==================== Pre-register Known Plugins ====================

// Dragonfly Reverbs (template fallback)
registerPluginCard('urn:dragonfly:room', {
  template: 'reverb',
  visualizations: ['reverb-decay', 'level-meter'],
})

registerPluginCard('urn:dragonfly:hall', {
  template: 'reverb',
  visualizations: ['reverb-decay', 'level-meter'],
})

registerPluginCard('urn:dragonfly:plate', {
  template: 'reverb',
  visualizations: ['reverb-decay'],
})

registerPluginCard('urn:dragonfly:early', {
  template: 'reverb',
  visualizations: ['reverb-decay'],
})

// MVerb
registerPluginCard('http://distrho.sf.net/plugins/MVerb', {
  template: 'reverb',
  visualizations: ['reverb-decay'],
})

// Compressors (SWH)
registerPluginPattern(/plugin\.org\.uk\/swh-plugins\/sc[1-4]$/, {
  template: 'dynamics',
  visualizations: ['gain-reduction-meter', 'transfer-curve'],
})

registerPluginPattern(/plugin\.org\.uk\/swh-plugins\/se4$/, {
  template: 'dynamics',
  visualizations: ['gain-reduction-meter', 'transfer-curve'],
})

// Limiters
registerPluginPattern(/lookahead.?limiter/i, {
  template: 'dynamics',
  visualizations: ['gain-reduction-meter'],
})

// Delays
registerPluginPattern(/delay/i, {
  template: 'delay',
  visualizations: ['delay-tap-grid'],
})

// EQ
registerPluginPattern(/\beq\b|equalizer/i, {
  template: 'eq',
  visualizations: ['eq-curve'],
})

// Modulation effects
registerPluginPattern(/chorus|flanger|phaser|tremolo|vibrato/i, {
  template: 'modulation',
  visualizations: ['lfo-waveform'],
})

// Distortion
registerPluginPattern(/dist|drive|fuzz|overdrive|saturate|valve|tube/i, {
  template: 'distortion',
  visualizations: ['distortion-curve'],
})

// ==================== JUCE Native Processors ====================
// Best-in-class processors built into the C++ audio engine
// Using default exports to get wrapped components with MIDI dialog

import CompressorCard from './Custom/JUCE/CompressorCard'
import LimiterCard from './Custom/JUCE/LimiterCard'
import GateCard from './Custom/JUCE/GateCard'
import ParametricEQCard from './Custom/JUCE/ParametricEQCard'
import CabinetIRCard from './Custom/JUCE/CabinetIRCard'
import ReverbIRCard from './Custom/JUCE/ReverbIRCard'
import NAMCard from './Custom/JUCE/NAMCard'
import NativeDelayCard from './Custom/JUCE/NativeDelayCard'
import ChorusCard from './Custom/JUCE/ChorusCard'
import JUCEPhaserCard from './Custom/JUCE/PhaserCard'
import IntelliFXCard from './Custom/JUCE/IntelliFXCard'
import EVHPitchShifterCard from './Custom/JUCE/EVHPitchShifterCard'
import IntervalShifterCard from './Custom/JUCE/IntervalShifterCard'
import BossXS1Card from './Custom/JUCE/BossXS1Card'
import ShoeGazeCard from './Custom/JUCE/ShoeGazeCard'
import LexiLoveCard from './Custom/JUCE/LexiLoveCard'
import H3000Card from './Custom/JUCE/H3000Card'
import { EventideH9Card } from './Custom/JUCE/EventideH9Card'
import Peavey5150Card from './Custom/JUCE/Peavey5150Card'
import TweedBassmanCard from './Custom/JUCE/TweedBassmanCard'
import PassionFXCard from './Custom/JUCE/PassionFXCard'
import CelestialCompressorCard from './Custom/JUCE/CelestialCompressorCard'
import DrumMachineCard from './Custom/JUCE/DrumMachineCard'

// JUCE Dynamics
registerPluginCard('map2://juce/dynamics/compressor', {
  component: CompressorCard,
})

// JUCE Dynamics - Celestial Compressor (50 artist presets with gear imagery)
registerPluginCard('map2://juce/dynamics/celestial', {
  component: CelestialCompressorCard,
})

registerPluginCard('map2://juce/dynamics/limiter', {
  component: LimiterCard,
})

registerPluginCard('map2://juce/dynamics/gate', {
  component: GateCard,
})

// JUCE EQ
registerPluginCard('map2://juce/eq/parametric', {
  component: ParametricEQCard,
})

// JUCE Convolution (IR)
registerPluginCard('map2://juce/convolution/cabinet', {
  component: CabinetIRCard,
})

registerPluginCard('map2://juce/convolution/reverb', {
  component: ReverbIRCard,
})

// JUCE Neural Amp Modeler
registerPluginCard('map2://juce/nam', {
  component: NAMCard,
})

// JUCE Stereo Delay
registerPluginCard('map2://juce/delay', {
  component: NativeDelayCard,
})

// JUCE Modulation
registerPluginCard('map2://juce/modulation/chorus', {
  component: ChorusCard,
})

registerPluginCard('map2://juce/modulation/phaser', {
  component: JUCEPhaserCard,
})

registerPluginCard('map2://juce/modulation/intellifx', {
  component: IntelliFXCard,
})

// JUCE Pitch - EVH Harmonizer with Van Halen presets
registerPluginCard('map2://juce/pitch/shifter', {
  component: EVHPitchShifterCard,
})

// JUCE Pitch - Musical Interval Shifter (semitone steps)
registerPluginCard('map2://juce/pitch/interval', {
  component: IntervalShifterCard,
})

// JUCE Pitch - Boss XS-1 Polyphonic Pitch Shifter
registerPluginCard('map2://juce/pitch/boss-xs1', {
  component: BossXS1Card,
})

// JUCE Multi-Effect - ShoeGaze (wall of sound)
registerPluginCard('map2://juce/multieffect/shoegaze', {
  component: ShoeGazeCard,
})

// JUCE Reverb - Lexi Love (PCM 70 algorithmic reverb)
registerPluginCard('map2://juce/reverb/pcm70', {
  component: LexiLoveCard,
})

// JUCE Pitch - H3000 Ultra-Harmonizer
registerPluginCard('map2://juce/pitch/h3000', {
  component: H3000Card,
})

// JUCE Multi-Effect - Eventide H9
registerPluginCard('map2://juce/effects/eventide-h9', {
  component: EventideH9Card,
})

// JUCE Amplifier - Peavey 5150 Block Letter
registerPluginCard('map2://juce/amp/peavey5150', {
  component: Peavey5150Card,
})

// JUCE Amplifier - Tweed Bassman 5F6-A
registerPluginCard('map2://juce/amp/tweedbassman', {
  component: TweedBassmanCard,
})

// JUCE Multi-Effect - PassionFX (Steve Vai Passion & Warfare)
registerPluginCard('map2://juce/multieffect/passionfx', {
  component: PassionFXCard,
})

// JUCE Drums - Sophisticated Drum Machine
registerPluginCard('map2://juce/drums', {
  component: DrumMachineCard,
})

// ==================== Dragonfly Reverbs ====================
// Best-in-class algorithmic reverbs

import { DragonflyRoomCard } from './Custom/Dragonfly/DragonflyRoomCard'
import { DragonflyHallCard } from './Custom/Dragonfly/DragonflyHallCard'
import { DragonflyPlateCard } from './Custom/Dragonfly/DragonflyPlateCard'

registerPluginCard('https://michaelwillis.github.io/dragonfly-reverb#room', {
  component: DragonflyRoomCard,
})

registerPluginCard('https://michaelwillis.github.io/dragonfly-reverb#hall', {
  component: DragonflyHallCard,
})

registerPluginCard('https://michaelwillis.github.io/dragonfly-reverb#plate', {
  component: DragonflyPlateCard,
})

// ==================== TooB Plugins ====================
// ToobAmp LV2 plugin collection

import { CE2ChorusCard } from './Custom/TooB/CE2ChorusCard'
import { BF2FlangerCard } from './Custom/TooB/BF2FlangerCard'
import { PhaserCard } from './Custom/TooB/PhaserCard'
import { TremoloCard } from './Custom/TooB/TremoloCard'
import { DelayCard } from './Custom/TooB/DelayCard'
import { TunerCard } from './Custom/TooB/TunerCard'
import { LooperCard } from './Custom/TooB/LooperCard'

// TooB Modulation
registerPluginCard('http://two-play.com/plugins/toob-ce2-chorus', {
  component: CE2ChorusCard,
})

registerPluginCard('http://two-play.com/plugins/toob-bf2-flanger', {
  component: BF2FlangerCard,
})

registerPluginCard('http://two-play.com/plugins/toob-phaser', {
  component: PhaserCard,
})

registerPluginCard('http://two-play.com/plugins/toob-tremolo', {
  component: TremoloCard,
})

// TooB Time-Based
registerPluginCard('http://two-play.com/plugins/toob-delay', {
  component: DelayCard,
})

// TooB Utility
registerPluginCard('http://two-play.com/plugins/toob-tuner', {
  component: TunerCard,
})

registerPluginCard('http://two-play.com/plugins/toob-4looper', {
  component: LooperCard,
})

// ==================== LV2 Plugin Cards ====================
// Third-party LV2 plugins with custom world-class interfaces

import { REEVRCard } from './Custom/LV2/REEVRCard'
import { OutotuneCard } from './Custom/LV2/OutotuneCard'
import { WhammyCard } from './Custom/LV2/WhammyCard'
import { KeyboardSamplerCard } from './Custom/LV2/KeyboardSamplerCard'

// REEV-R Reverb (FabFilter Pro-R inspired)
registerPluginPattern(/REEV-?R/i, {
  component: REEVRCard,
})

// Outotune Auto-Tune (Antares inspired)
registerPluginPattern(/outotune/i, {
  component: OutotuneCard,
})

// dm-Whammy Pitch Shifter (DigiTech Whammy inspired)
registerPluginCard('http://drobilla.net/plugins/mda/dm-Whammy', {
  component: WhammyCard,
})

registerPluginPattern(/whammy/i, {
  component: WhammyCard,
})

// Sfizz - Keyboard Sampler (with soundfont browser)
registerPluginCard('http://sfztools.github.io/sfizz', {
  component: KeyboardSamplerCard,
})

// Also match sfizz variants
registerPluginPattern(/sfizz/i, {
  component: KeyboardSamplerCard,
})

// ==================== GlitchShifter ====================
// Airwindows plugin ported to LV2 by Hannes Braun

import { GlitchShifterCard } from './Custom/Airwindows/GlitchShifterCard'

// GlitchShifter - Granular pitch shifter / harmonizer
registerPluginCard('https://hannesbraun.net/ns/lv2/airwindows/glitchshifter', {
  component: GlitchShifterCard,
})

// Also match by name pattern
registerPluginPattern(/airwindows.*glitchshifter/i, {
  component: GlitchShifterCard,
})

registerPluginPattern(/glitchshifter/i, {
  component: GlitchShifterCard,
})
