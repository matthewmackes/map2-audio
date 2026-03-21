import { categoryToTemplate, type PluginCardTemplate } from './types'

export type LivePluginCardRenderMode = 'custom' | 'template' | 'generic'

export interface LivePluginCardStrategy {
  renderMode: LivePluginCardRenderMode
  template?: PluginCardTemplate
}

export interface LivePluginCardContext {
  sameFamilyCount?: number
}

const LIVE_SAFE_CUSTOM_URIS = new Set([
  'map2://juce/modulation/intellifx',
])

const LIVE_GENERIC_ONLY_URIS = new Set([
  'map2://juce/convolution/cabinet',
  'map2://juce/convolution/reverb',
  'map2://juce/nam',
  'map2://juce/drums',
])

function normalizeLiveEditorUri(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('map2://')) {
    return trimmed
  }

  const noQuery = trimmed.split(/[?#]/)[0] || trimmed
  const noTrailingSlash = noQuery.endsWith('/') ? noQuery.slice(0, -1) : noQuery
  return noTrailingSlash.toLowerCase()
}

function isSynthForgeUri(uri: string): boolean {
  return uri.includes('synthforge')
}

export function resolveLivePluginCardStrategy(
  uri: string,
  category: string,
  context: LivePluginCardContext = {},
): LivePluginCardStrategy {
  const normalizedUri = normalizeLiveEditorUri(uri)

  if (isSynthForgeUri(normalizedUri)) {
    return (context.sameFamilyCount ?? 1) <= 1
      ? { renderMode: 'custom' }
      : { renderMode: 'generic' }
  }

  if (LIVE_SAFE_CUSTOM_URIS.has(normalizedUri)) {
    return { renderMode: 'custom' }
  }

  if (LIVE_GENERIC_ONLY_URIS.has(normalizedUri)) {
    return { renderMode: 'generic' }
  }

  return {
    renderMode: 'template',
    template: categoryToTemplate(category),
  }
}
