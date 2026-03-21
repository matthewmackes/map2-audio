const CANONICAL_PLUGIN_URI_ALIASES: Record<string, string> = {
  'map2://juce/amp/nam': 'map2://juce/nam',
  'map2://juce/delay/stereo': 'map2://juce/delay',
  'map2://juce/delay/stereo-delay': 'map2://juce/delay',
  'map2://juce/dynamics/comp': 'map2://juce/dynamics/compressor',
  'map2://juce/ir/cabinet': 'map2://juce/convolution/cabinet',
  'map2://juce/ir/reverb': 'map2://juce/convolution/reverb',
  'map2://juce/pitch/evh': 'map2://juce/pitch/shifter',
}

export function canonicalizePluginUri(uri?: string | null): string {
  const normalized = (uri ?? '').trim()
  if (!normalized) {
    return ''
  }

  return CANONICAL_PLUGIN_URI_ALIASES[normalized] ?? normalized
}
