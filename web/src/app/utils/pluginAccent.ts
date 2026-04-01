import { getCategoryConfig, type CategoryConfig } from '../data/categoryStyles'

const NAM_PLUGIN_URIS = new Set([
  'map2://juce/nam',
  'urn:map2:nam-player',
])

export function getPluginAccentConfig(pluginUri: string | undefined, category: string | undefined): CategoryConfig {
  if (pluginUri && NAM_PLUGIN_URIS.has(pluginUri)) {
    return getCategoryConfig('NAM')
  }
  return getCategoryConfig(category)
}
