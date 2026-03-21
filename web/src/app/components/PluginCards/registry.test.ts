import { getPluginCardConfig } from './registry'

describe('Plugin card registry fallbacks', () => {
  it('routes stale Dragonfly custom URIs back to Carbon reverb templates', () => {
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
})
