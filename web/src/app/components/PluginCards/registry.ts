/**
 * Plugin Card Registry
 *
 * Maps plugin URIs to their custom card components or templates.
 * Provides fallback chain: Custom Card → Category Template → Generic Editor
 *
 * ALL custom cards and templates use lazy dynamic imports to avoid pulling
 * ~40 card components into the initial bundle. Cards are loaded on-demand
 * when the user opens a specific plugin.
 */

import { lazy, type ComponentType } from 'react'
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

/** Registry of lazy template loaders */
const TEMPLATE_LOADER_REGISTRY = new Map<PluginCardTemplate, () => Promise<{ default: ComponentType<PluginCardProps> }>>()

/** Cache for lazily-resolved components */
const LAZY_COMPONENT_CACHE = new Map<string, ComponentType<PluginCardProps>>()

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

/**
 * Register a lazy template loader for a category
 */
export function registerTemplateLazy(
  template: PluginCardTemplate,
  loader: () => Promise<{ default: ComponentType<PluginCardProps> }>
): void {
  TEMPLATE_LOADER_REGISTRY.set(template, loader)
}

function normalizeLookupUri(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('map2://')) {
    return trimmed
  }

  const noQuery = trimmed.split(/[?#]/)[0] || trimmed
  const noTrailingSlash = noQuery.endsWith('/') ? noQuery.slice(0, -1) : noQuery
  return noTrailingSlash.toLowerCase()
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
  const normalizedUri = normalizeLookupUri(uri)

  // 1. Check exact URI match
  const exactMatch = PLUGIN_REGISTRY.get(uri)
    ?? (normalizedUri !== uri ? PLUGIN_REGISTRY.get(normalizedUri) : undefined)
  if (exactMatch) {
    return exactMatch
  }

  // 2. Check pattern matches
  for (const { pattern, config } of PATTERN_REGISTRY) {
    if (pattern.test(uri) || (normalizedUri !== uri && pattern.test(normalizedUri))) {
      return config
    }
  }

  // 2b. Safety net: always resolve SynthForge to its dedicated card.
  const uriLower = uri.toLowerCase()
  if (uriLower.includes('synthforge') || normalizedUri.includes('synthforge')) {
    const synthForgeConfig = PLUGIN_REGISTRY.get('map2://juce/synthforge')
    if (synthForgeConfig) {
      return synthForgeConfig
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
 * Get the card component for a plugin.
 * Resolves lazy loaders to React.lazy components (cached).
 */
export function getPluginCardComponent(
  uri: string,
  category: string
): ComponentType<PluginCardProps> | null {
  const config = getPluginCardConfig(uri, category)

  if (!config) {
    return null
  }

  // Custom component takes priority (eagerly loaded)
  if (config.component) {
    return config.component
  }

  // Lazy-loaded custom component
  if (config.loader) {
    const cacheKey = `loader:${uri}`
    if (!LAZY_COMPONENT_CACHE.has(cacheKey)) {
      LAZY_COMPONENT_CACHE.set(cacheKey, lazy(config.loader))
    }
    return LAZY_COMPONENT_CACHE.get(cacheKey)!
  }

  // Fall back to template (eagerly loaded)
  if (config.template) {
    const eagerly = TEMPLATE_REGISTRY.get(config.template)
    if (eagerly) return eagerly

    // Fall back to lazy template loader
    const templateLoader = TEMPLATE_LOADER_REGISTRY.get(config.template)
    if (templateLoader) {
      const cacheKey = `template:${config.template}`
      if (!LAZY_COMPONENT_CACHE.has(cacheKey)) {
        LAZY_COMPONENT_CACHE.set(cacheKey, lazy(templateLoader))
      }
      return LAZY_COMPONENT_CACHE.get(cacheKey)!
    }
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
// All cards use lazy dynamic imports — loaded only when the plugin is opened

// JUCE Dynamics
registerPluginCard('map2://juce/dynamics/compressor', {
  loader: () => import('./Custom/JUCE/CompressorCard'),
})

// JUCE Dynamics - Celestial Compressor (50 artist presets with gear imagery)
registerPluginCard('map2://juce/dynamics/celestial', {
  loader: () => import('./Custom/JUCE/CelestialCompressorCard'),
})

registerPluginCard('map2://juce/dynamics/limiter', {
  loader: () => import('./Custom/JUCE/LimiterCard'),
})

registerPluginCard('map2://juce/dynamics/gate', {
  loader: () => import('./Custom/JUCE/GateCard'),
})

// JUCE EQ
registerPluginCard('map2://juce/eq/parametric', {
  loader: () => import('./Custom/JUCE/ParametricEQCard'),
})

// JUCE Convolution (IR)
registerPluginCard('map2://juce/convolution/cabinet', {
  loader: () => import('./Custom/JUCE/CabinetIRCard'),
})

registerPluginCard('map2://juce/convolution/reverb', {
  loader: () => import('./Custom/JUCE/ReverbIRCard'),
})

// JUCE Neural Amp Modeler
registerPluginCard('map2://juce/nam', {
  loader: () => import('./Custom/JUCE/NAMCard'),
})

// JUCE Stereo Delay
registerPluginCard('map2://juce/delay', {
  loader: () => import('./Custom/JUCE/NativeDelayCard'),
})

// JUCE Modulation
registerPluginCard('map2://juce/modulation/chorus', {
  loader: () => import('./Custom/JUCE/ChorusCard'),
})

registerPluginCard('map2://juce/modulation/phaser', {
  loader: () => import('./Custom/JUCE/PhaserCard'),
})

registerPluginCard('map2://juce/modulation/intellifx', {
  loader: () => import('./Custom/JUCE/IntelliFXCard'),
})

// JUCE Pitch - EVH Harmonizer with Van Halen presets
registerPluginCard('map2://juce/pitch/shifter', {
  loader: () => import('./Custom/JUCE/EVHPitchShifterCard'),
})

// JUCE Pitch - Musical Interval Shifter (semitone steps)
registerPluginCard('map2://juce/pitch/interval', {
  loader: () => import('./Custom/JUCE/IntervalShifterCard'),
})

// JUCE Pitch - Boss XS-1 Polyphonic Pitch Shifter
registerPluginCard('map2://juce/pitch/boss-xs1', {
  loader: () => import('./Custom/JUCE/BossXS1Card'),
})

// JUCE Multi-Effect - ShoeGaze (wall of sound)
registerPluginCard('map2://juce/multieffect/shoegaze', {
  loader: () => import('./Custom/JUCE/ShoeGazeCard'),
})

// JUCE Reverb - Lexi Love (PCM 70 algorithmic reverb)
registerPluginCard('map2://juce/reverb/pcm70', {
  loader: () => import('./Custom/JUCE/LexiLoveCard'),
})

// JUCE Pitch - Ultra-Harmonizer
registerPluginCard('map2://juce/pitch/h3000', {
  loader: () => import('./Custom/JUCE/H3000Card'),
})

// JUCE Multi-Effect
registerPluginCard('map2://juce/effects/eventide-h9', {
  loader: () => import('./Custom/JUCE/EventideH9Card').then(m => ({ default: m.EventideH9Card })),
})

// JUCE Amplifier - Peavey 5150 Block Letter
registerPluginCard('map2://juce/amp/peavey5150', {
  loader: () => import('./Custom/JUCE/Peavey5150Card'),
})

// JUCE Amplifier - Tweed Bassman 5F6-A
registerPluginCard('map2://juce/amp/tweedbassman', {
  loader: () => import('./Custom/JUCE/TweedBassmanCard'),
})

// JUCE Multi-Effect - PassionFX (Steve Vai Passion & Warfare)
registerPluginCard('map2://juce/multieffect/passionfx', {
  loader: () => import('./Custom/JUCE/PassionFXCard'),
})

// JUCE Drums - Sophisticated Drum Machine
registerPluginCard('map2://juce/drums', {
  loader: () => import('./Custom/JUCE/DrumMachineCard'),
})

// JUCE Instrument - SynthForge multitimbral sampler/module
const synthForgeCardConfig: PluginCardConfig = {
  loader: () => import('./Custom/JUCE/SynthForgeCard'),
}

registerPluginCard('map2://juce/synthforge', synthForgeCardConfig)
registerPluginCard('map2://juce/synthforge/', synthForgeCardConfig)
registerPluginCard('map2://juce/instrument/synthforge', synthForgeCardConfig)
registerPluginPattern(/map2:\/\/juce\/.*synthforge/i, synthForgeCardConfig)

// ==================== Dragonfly Reverbs ====================
// Best-in-class algorithmic reverbs

registerPluginCard('https://michaelwillis.github.io/dragonfly-reverb#room', {
  loader: () => import('./Custom/Dragonfly/DragonflyRoomCard').then(m => ({ default: m.DragonflyRoomCard })),
})

registerPluginCard('https://michaelwillis.github.io/dragonfly-reverb#hall', {
  loader: () => import('./Custom/Dragonfly/DragonflyHallCard').then(m => ({ default: m.DragonflyHallCard })),
})

registerPluginCard('https://michaelwillis.github.io/dragonfly-reverb#plate', {
  loader: () => import('./Custom/Dragonfly/DragonflyPlateCard').then(m => ({ default: m.DragonflyPlateCard })),
})

// ==================== TooB Plugins ====================
// ToobAmp LV2 plugin collection

// TooB Modulation
registerPluginCard('http://two-play.com/plugins/toob-ce2-chorus', {
  loader: () => import('./Custom/TooB/CE2ChorusCard').then(m => ({ default: m.CE2ChorusCard })),
})

registerPluginCard('http://two-play.com/plugins/toob-bf2-flanger', {
  loader: () => import('./Custom/TooB/BF2FlangerCard').then(m => ({ default: m.BF2FlangerCard })),
})

registerPluginCard('http://two-play.com/plugins/toob-phaser', {
  loader: () => import('./Custom/TooB/PhaserCard').then(m => ({ default: m.PhaserCard })),
})

registerPluginCard('http://two-play.com/plugins/toob-tremolo', {
  loader: () => import('./Custom/TooB/TremoloCard').then(m => ({ default: m.TremoloCard })),
})

// TooB Time-Based
registerPluginCard('http://two-play.com/plugins/toob-delay', {
  loader: () => import('./Custom/TooB/DelayCard').then(m => ({ default: m.DelayCard })),
})

// TooB Utility
registerPluginCard('http://two-play.com/plugins/toob-tuner', {
  loader: () => import('./Custom/TooB/TunerCard').then(m => ({ default: m.TunerCard })),
})

registerPluginCard('http://two-play.com/plugins/toob-4looper', {
  loader: () => import('./Custom/TooB/LooperCard').then(m => ({ default: m.LooperCard })),
})

// ==================== LV2 Plugin Cards ====================
// Third-party LV2 plugins with custom world-class interfaces

// REEV-R Reverb (FabFilter Pro-R inspired)
registerPluginPattern(/REEV-?R/i, {
  loader: () => import('./Custom/LV2/REEVRCard').then(m => ({ default: m.REEVRCard })),
})

// Outotune Auto-Tune (Antares inspired)
registerPluginPattern(/outotune/i, {
  loader: () => import('./Custom/LV2/OutotuneCard').then(m => ({ default: m.OutotuneCard })),
})

// dm-Whammy Pitch Shifter (DigiTech Whammy inspired)
registerPluginCard('http://drobilla.net/plugins/mda/dm-Whammy', {
  loader: () => import('./Custom/LV2/WhammyCard').then(m => ({ default: m.WhammyCard })),
})

registerPluginPattern(/whammy/i, {
  loader: () => import('./Custom/LV2/WhammyCard').then(m => ({ default: m.WhammyCard })),
})

// Sfizz - Keyboard Sampler (with soundfont browser)
registerPluginCard('http://sfztools.github.io/sfizz', {
  loader: () => import('./Custom/LV2/KeyboardSamplerCard').then(m => ({ default: m.KeyboardSamplerCard })),
})

// Also match sfizz variants
registerPluginPattern(/sfizz/i, {
  loader: () => import('./Custom/LV2/KeyboardSamplerCard').then(m => ({ default: m.KeyboardSamplerCard })),
})

// ==================== GlitchShifter ====================
// Airwindows plugin ported to LV2 by Hannes Braun

// GlitchShifter - Granular pitch shifter / harmonizer
registerPluginCard('https://hannesbraun.net/ns/lv2/airwindows/glitchshifter', {
  loader: () => import('./Custom/Airwindows/GlitchShifterCard').then(m => ({ default: m.GlitchShifterCard })),
})

// Also match by name pattern
registerPluginPattern(/airwindows.*glitchshifter/i, {
  loader: () => import('./Custom/Airwindows/GlitchShifterCard').then(m => ({ default: m.GlitchShifterCard })),
})

registerPluginPattern(/glitchshifter/i, {
  loader: () => import('./Custom/Airwindows/GlitchShifterCard').then(m => ({ default: m.GlitchShifterCard })),
})
