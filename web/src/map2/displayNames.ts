// GUI-only display sanitization for restricted brand/model terms.
// This does not alter plugin URIs or backend identifiers.

const RESTRICTED_TERMS = [
  /\bEventide\b/gi,
  /\bBoss\b/gi,
  /\bLexicon\b/gi,
  /\bH3000\b/gi,
  /\bH9\b/gi,
  /\bEVH\b/gi,
  /\bPeavey\b/gi,
  /\b5150\b/gi,
]

const PLUGIN_URI_OVERRIDES: Record<string, string> = {
  'map2://juce/pitch/shifter': 'Vintage Harmonizer',
  'map2://juce/pitch/boss-xs1': 'Mutii WR-2 Shifter',
  'map2://juce/modulation/intellifx': 'AMDiFX 8-Voice',
  'map2://juce/pitch/h3000': 'Ultra Harmonizer',
  'map2://juce/effects/eventide-h9': 'Multi-Effect Rack',
  'map2://juce/amp/peavey5150': 'Block Letter Amp',
}

function cleanupSpacing(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.:;!?)\]/-])/g, '$1')
    .replace(/([([/-])\s+/g, '$1')
    .replace(/[-/,:;]+$/g, '')
    .trim()
}

export function sanitizeRestrictedDisplayText(value: string | null | undefined): string {
  if (!value) return ''
  let result = value
  for (const pattern of RESTRICTED_TERMS) {
    result = result.replace(pattern, '')
  }
  return cleanupSpacing(result)
}

export function getDisplayPluginName(name: string | null | undefined, uri?: string | null): string {
  if (uri && PLUGIN_URI_OVERRIDES[uri]) {
    return PLUGIN_URI_OVERRIDES[uri]
  }
  const sanitized = sanitizeRestrictedDisplayText(name)
  if (sanitized) return sanitized
  return 'Processor'
}

function sanitizePluginNameWithUri(name: string, uri?: string | null): string {
  if (uri) {
    return getDisplayPluginName(name, uri)
  }
  const sanitized = sanitizeRestrictedDisplayText(name)
  return sanitized || 'Processor'
}

export function sanitizeDisplayPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDisplayPayload(item)) as T
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(record)) {
    result[key] = sanitizeDisplayPayload(entry)
  }

  const uri = typeof result.uri === 'string' ? result.uri : null
  if (uri && typeof result.name === 'string') {
    result.name = sanitizePluginNameWithUri(result.name, uri)
  }

  const pluginUriSnake = typeof result.plugin_uri === 'string' ? result.plugin_uri : null
  if (typeof result.plugin_name === 'string') {
    result.plugin_name = sanitizePluginNameWithUri(result.plugin_name, pluginUriSnake)
  }

  const pluginUriCamel = typeof result.pluginUri === 'string' ? result.pluginUri : null
  if (typeof result.pluginName === 'string') {
    result.pluginName = sanitizePluginNameWithUri(result.pluginName, pluginUriCamel)
  }

  for (const field of ['author', 'author_name', 'authorName', 'brand', 'description', 'function', 'tips']) {
    if (typeof result[field] === 'string') {
      result[field] = sanitizeRestrictedDisplayText(result[field])
    }
  }

  return result as T
}
