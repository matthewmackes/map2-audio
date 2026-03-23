import { resolveLivePluginCardStrategy } from './liveEditorRouting'

describe('resolveLivePluginCardStrategy', () => {
  it('keeps IntelliFX on the safe custom card path', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/modulation/intellifx', 'Modulation')).toEqual({
      renderMode: 'custom',
    })
  })

  it('allows the flagship SynthForge card when it is the only SynthForge block in the family', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/synthforge', 'Instrument', { sameFamilyCount: 1 })).toEqual({
      renderMode: 'custom',
    })
  })

  it('keeps duplicate SynthForge family blocks on the generic editor path', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/synthforge', 'Instrument', { sameFamilyCount: 2 })).toEqual({
      renderMode: 'generic',
    })
  })

  it('forces broad native effect categories onto templates in the live editor', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/delay', 'Delay')).toEqual({
      renderMode: 'template',
      template: 'delay',
    })
  })

  it('routes NAM onto the custom live editor card', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/nam', 'Amplifier')).toEqual({
      renderMode: 'custom',
    })
  })

  it('routes cabinet IR onto the custom live editor card', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/convolution/cabinet', 'Convolution')).toEqual({
      renderMode: 'custom',
    })
  })

  it('routes reverb IR onto the custom live editor card', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/convolution/reverb', 'Convolution')).toEqual({
      renderMode: 'custom',
    })
  })
})
