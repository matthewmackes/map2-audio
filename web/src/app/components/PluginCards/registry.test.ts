import { getPluginCardConfig } from './registry'

describe('Plugin card registry fallbacks', () => {
  it('routes live and legacy Dragonfly URIs back to Carbon reverb templates', () => {
    expect(getPluginCardConfig('urn:dragonfly:room', 'Reverb')).toMatchObject({
      template: 'reverb',
    })
    expect(getPluginCardConfig('https://github.com/michaelwillis/dragonfly-reverb', 'Reverb')).toMatchObject({
      template: 'reverb',
    })
    expect(getPluginCardConfig('https://michaelwillis.github.io/dragonfly-reverb#hall', 'Reverb')).toMatchObject({
      template: 'reverb',
    })
  })

  it('routes stale REEV-R and Outotune matches to utility templates', () => {
    expect(getPluginCardConfig('https://github.com/tiagolr/reevr', 'Utility')).toMatchObject({
      template: 'utility',
    })
    expect(getPluginCardConfig('http://uralyx.cz/prog/outotune', 'Utility')).toMatchObject({
      template: 'utility',
    })
  })

  it('routes sfizz variants to the Carbon instrument template', () => {
    expect(getPluginCardConfig('http://sfztools.github.io/sfizz', 'Instrument')).toMatchObject({
      template: 'instrument',
    })
    expect(getPluginCardConfig('http://sfztools.github.io/sfizz-multi', 'Instrument')).toMatchObject({
      template: 'instrument',
    })
  })

  it('registers Performance Brain as a dedicated custom card', () => {
    expect(getPluginCardConfig('map2://juce/brain', 'Instrument')).toMatchObject({
      loader: expect.any(Function),
    })
  })
})
