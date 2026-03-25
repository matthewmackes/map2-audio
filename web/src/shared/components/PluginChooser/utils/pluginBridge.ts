// ============================================================================
// PluginChooser - Plugin Bridge Utility
// Normalizes legacy PiPedal-shaped UiPlugin payloads and map2 Plugin payloads
// ============================================================================

import { UiPlugin, PluginType, UiControl, pluginTypeFromCategory } from '../pluginLegacyCompat'
import { Plugin, PluginParameter } from '../../../../map2/types'
import { UnifiedPlugin, ParameterPreview, PluginFormat } from '../types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../../map2/displayNames'

/**
 * Extract top parameters for preview from UiControl array
 */
function extractTopParameters(controls: UiControl[], limit = 3): ParameterPreview[] {
  const visibleControls = controls.filter(c => !c.isHidden?.() && c.is_input)
  return visibleControls.slice(0, limit).map(c => ({
    name: c.name,
    symbol: c.symbol,
    defaultValue: c.default_value ?? c.min_value,
    minValue: c.min_value,
    maxValue: c.max_value,
    unit: c.units ?? undefined,
  }))
}

/**
 * Extract top parameters for preview from PluginParameter array
 */
function extractTopParametersFromMap2(
  params: PluginParameter[] | undefined,
  limit = 3
): ParameterPreview[] {
  if (!params) return []
  return params.slice(0, limit).map(p => ({
    name: p.name,
    symbol: p.symbol,
    defaultValue: p.default,
    minValue: p.min,
    maxValue: p.max,
  }))
}

/**
 * Generate auto-tags from UiPlugin metadata
 */
function generateAutoTags(plugin: UiPlugin): string[] {
  const tags: string[] = []

  // I/O tags
  if (plugin.audio_inputs === 2 || plugin.audio_outputs === 2) {
    tags.push('Stereo')
  } else if (plugin.audio_inputs === 1 && plugin.audio_outputs === 1) {
    tags.push('Mono')
  }
  if (plugin.audio_inputs === 1 && plugin.audio_outputs === 2) {
    tags.push('Mono→Stereo')
  }

  // MIDI tags
  if (plugin.has_midi_input > 0) {
    tags.push('MIDI-In')
  }
  if (plugin.has_midi_output > 0) {
    tags.push('MIDI-Out')
  }

  // UI tags
  if (plugin.modGui !== null) {
    tags.push('Has-UI')
  }

  // Format tags
  if (plugin.is_vst3) {
    tags.push('VST3')
  } else {
    tags.push('LV2')
  }

  // Special plugin tags
  if (plugin.uri.includes('nam')) {
    tags.push('NAM-Compatible')
  }

  return tags
}

/**
 * Generate auto-tags from Map2 Plugin metadata
 */
function generateAutoTagsFromMap2(plugin: Plugin): string[] {
  const tags: string[] = []

  // I/O tags
  if (plugin.in_ports >= 2 && plugin.out_ports >= 2) {
    tags.push('Stereo')
  } else if (plugin.in_ports === 1 && plugin.out_ports === 1) {
    tags.push('Mono')
  }
  if (plugin.in_ports === 1 && plugin.out_ports >= 2) {
    tags.push('Mono→Stereo')
  }

  // UI tags
  if (plugin.has_ui) {
    tags.push('Has-UI')
  }

  // Format tags
  if (plugin.is_hardware || plugin.format === 'Hardware') {
    tags.push('Hardware')
    tags.push('S/PDIF')
  } else {
    tags.push('LV2')
  }

  return tags
}

/**
 * Normalize a UiPlugin (from pipedal) to UnifiedPlugin format
 */
export function normalizeUiPlugin(
  plugin: UiPlugin,
  favorites: Record<string, boolean> = {},
  stats?: { lastUsed?: number; usageCount?: number; customTags?: string[]; folders?: string[] }
): UnifiedPlugin {
  const visibleControls = plugin.controls.filter(c => !c.isHidden?.() && c.is_input)

  return {
    uri: plugin.uri,
    name: getDisplayPluginName(plugin.name, plugin.uri),
    format: plugin.is_vst3 ? 'vst3' : 'lv2',
    authorName: sanitizeRestrictedDisplayText(plugin.author_name || 'Unknown'),
    authorHomepage: plugin.author_homepage || undefined,
    category: plugin.plugin_display_type || 'Plugin',
    displayType: plugin.plugin_display_type || 'Plugin',
    pluginType: plugin.plugin_type,
    tags: generateAutoTags(plugin),
    audioInputs: plugin.audio_inputs,
    audioOutputs: plugin.audio_outputs,
    hasMidiInput: plugin.has_midi_input > 0,
    hasMidiOutput: plugin.has_midi_output > 0,
    isStereo: plugin.audio_inputs === 2 || plugin.audio_outputs === 2,
    hasUi: plugin.modGui !== null,
    hasModGui: plugin.modGui !== null,
    parameterCount: visibleControls.length,
    topParameters: extractTopParameters(plugin.controls),
    description: plugin.description || undefined,
    version: plugin.minorVersion > 0 || plugin.microVersion > 0
      ? `${plugin.minorVersion}.${plugin.microVersion}`
      : undefined,
    isFavorite: favorites[plugin.uri] ?? false,
    lastUsed: stats?.lastUsed,
    usageCount: stats?.usageCount ?? 0,
    customTags: stats?.customTags ?? [],
    folders: stats?.folders ?? [],
  }
}

/**
 * Normalize a Plugin (from map2 API) to UnifiedPlugin format
 */
export function normalizeMap2Plugin(
  plugin: Plugin,
  favorites: string[] = [],
  stats?: { lastUsed?: number; usageCount?: number; customTags?: string[]; folders?: string[] }
): UnifiedPlugin {
  const isHw = plugin.is_hardware || plugin.format === 'Hardware';
  const format: PluginFormat = isHw ? 'hardware' : 'lv2';
  return {
    uri: plugin.uri,
    name: getDisplayPluginName(plugin.name, plugin.uri),
    format,
    authorName: sanitizeRestrictedDisplayText(plugin.author || 'Unknown'),
    authorHomepage: undefined,
    category: plugin.category || 'Plugin',
    displayType: isHw ? 'Hardware Effect' : (plugin.class_label || plugin.category || 'Plugin'),
    pluginType: pluginTypeFromCategory(plugin.category || ''),
    tags: generateAutoTagsFromMap2(plugin),
    audioInputs: plugin.in_ports,
    audioOutputs: plugin.out_ports,
    hasMidiInput: plugin.has_midi_input ?? false,
    hasMidiOutput: plugin.has_midi_output ?? false,
    isStereo: plugin.in_ports >= 2 && plugin.out_ports >= 2,
    hasUi: plugin.has_ui,
    hasModGui: false,
    parameterCount: plugin.parameters?.length ?? 0,
    topParameters: extractTopParametersFromMap2(plugin.parameters),
    version: plugin.version || undefined,
    license: plugin.license || undefined,
    isFavorite: favorites.includes(plugin.uri),
    lastUsed: stats?.lastUsed,
    usageCount: stats?.usageCount ?? 0,
    customTags: stats?.customTags ?? [],
    folders: stats?.folders ?? [],
  }
}

/**
 * Normalize an array of UiPlugins
 */
export function normalizeUiPlugins(
  plugins: UiPlugin[],
  favorites: Record<string, boolean> = {},
  statsMap?: Record<string, { lastUsed?: number; usageCount?: number; customTags?: string[]; folders?: string[] }>
): UnifiedPlugin[] {
  return plugins.map(p => normalizeUiPlugin(p, favorites, statsMap?.[p.uri]))
}

/**
 * Normalize an array of Map2 Plugins
 */
export function normalizeMap2Plugins(
  plugins: Plugin[],
  favorites: string[] = [],
  statsMap?: Record<string, { lastUsed?: number; usageCount?: number; customTags?: string[]; folders?: string[] }>
): UnifiedPlugin[] {
  return plugins.map(p => normalizeMap2Plugin(p, favorites, statsMap?.[p.uri]))
}

/**
 * Filter plugins that are virtual/special (NAM, IR) - for quick add buttons
 */
export function isVirtualPlugin(uri: string): boolean {
  return (
    uri === 'urn:map2:nam-player' ||
    uri === 'urn:map2:ir-cabinet' ||
    uri === 'urn:map2:ir-reverb'
  )
}

/**
 * Check if a plugin is a hardware effect (S/PDIF send/return)
 */
export function isHardwarePlugin(uri: string): boolean {
  return uri.startsWith('hardware://')
}

/**
 * Lexicon MPX-1 hardware URI constant
 */
export const LEXICON_MPX1_URI = 'hardware://lexicon-mpx1-spdif'

/**
 * Get display name for I/O configuration
 */
export function getIODisplayName(inputs: number, outputs: number): string {
  if (inputs === 1 && outputs === 1) return 'Mono'
  if (inputs === 2 && outputs === 2) return 'Stereo'
  if (inputs === 1 && outputs === 2) return 'Mono→Stereo'
  if (inputs === 2 && outputs === 1) return 'Stereo→Mono'
  return `${inputs}→${outputs}`
}

/**
 * Get IO badge color based on configuration
 */
export function getIOBadgeColor(inputs: number, outputs: number): string {
  if (inputs === 2 || outputs === 2) return '#00ff41' // Stereo - lime green
  return '#888888' // Mono - gray
}
