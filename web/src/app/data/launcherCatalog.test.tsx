import { getLauncherCatalogItem, normalizeLandingTiles } from './launcherCatalog'

describe('launcherCatalog', () => {
  it('keeps the organizer panel out of the launcher catalog and marks hardware submenu triggers as nav-only', () => {
    expect(getLauncherCatalogItem('/platforms/launchers')).toBeNull()
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
