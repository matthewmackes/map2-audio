import { getLauncherCatalogItem, normalizeLandingTiles } from './launcherCatalog'

describe('launcherCatalog', () => {
  it('keeps non-shared launchers out of the catalog and marks hardware submenu triggers as nav-only', () => {
    expect(getLauncherCatalogItem('/platforms/launchers')).toBeNull()
    expect(getLauncherCatalogItem('/drums')).toBeNull()
    expect(getLauncherCatalogItem('/synth-forge')).toBeNull()
    expect(getLauncherCatalogItem('/hardware-interfaces')).toMatchObject({
      landingEligible: false,
      navEligible: true,
      directory: 'nav-only',
    })
    expect(getLauncherCatalogItem('/labs')).toMatchObject({
      landingEligible: true,
      directory: 'core',
    })
  })

  it('normalizes landing tiles to canonical route-backed launchers only', () => {
    expect(normalizeLandingTiles([
      { route: '/drums', size: 'small' },
      { route: '/synth-forge', size: 'large' },
      { route: '/platform', size: 'medium' },
      { route: '/hardware-interfaces', size: 'large' },
      { route: '/labs', size: 'giant' },
      { route: '/labs', size: 'small' },
      { route: '/labs', size: 'medium' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/labs', size: 'small' },
    ])
  })
})
