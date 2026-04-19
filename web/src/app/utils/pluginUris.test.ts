import { canonicalizePluginUri } from './pluginUris'

describe('canonicalizePluginUri', () => {
  it('maps legacy JUCE aliases to their canonical URIs', () => {
    expect(canonicalizePluginUri('map2://juce/amp/nam')).toBe('map2://juce/nam')
    expect(canonicalizePluginUri('map2://juce/delay/stereo')).toBe('map2://juce/delay')
    expect(canonicalizePluginUri('map2://juce/delay/stereo-delay')).toBe('map2://juce/delay')
    expect(canonicalizePluginUri('map2://juce/dynamics/comp')).toBe('map2://juce/dynamics/compressor')
    expect(canonicalizePluginUri('map2://juce/ir/cabinet')).toBe('map2://juce/convolution/cabinet')
    expect(canonicalizePluginUri('map2://juce/ir/reverb')).toBe('map2://juce/convolution/reverb')
    expect(canonicalizePluginUri('map2://juce/pitch/evh')).toBe('map2://juce/pitch/shifter')
  })

  it('preserves canonical and empty inputs', () => {
    expect(canonicalizePluginUri('map2://juce/delay')).toBe('map2://juce/delay')
    expect(canonicalizePluginUri('')).toBe('')
    expect(canonicalizePluginUri(null)).toBe('')
    expect(canonicalizePluginUri(undefined)).toBe('')
  })
})
