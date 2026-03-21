import { resolveLivePluginCardStrategy } from './liveEditorRouting'

describe('resolveLivePluginCardStrategy', () => {
  it('keeps IntelliFX on the safe custom card path', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/modulation/intellifx', 'Modulation')).toEqual({
      renderMode: 'custom',
    })
  })

  it('forces broad native effect categories onto templates in the live editor', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/delay', 'Delay')).toEqual({
      renderMode: 'template',
      template: 'delay',
    })
  })

  it('keeps singleton or special-case processors on the generic editor path', () => {
    expect(resolveLivePluginCardStrategy('map2://juce/nam', 'Amplifier')).toEqual({
      renderMode: 'generic',
    })
  })
})
