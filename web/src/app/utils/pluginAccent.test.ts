import { getPluginAccentConfig } from './pluginAccent'

describe('pluginAccent', () => {
  it('uses the Carbon green drive mapping for drive blocks', () => {
    expect(getPluginAccentConfig('plugin://drive', 'Drive').color).toBe('#42be65')
  })

  it('uses the NAM magenta mapping for the native NAM processor', () => {
    expect(getPluginAccentConfig('map2://juce/nam', 'Amplifier').color).toBe('#ff7eb6')
  })
})
