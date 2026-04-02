import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
} from './launcherCatalog'

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
    expect(getLauncherCatalogItem('/platforms/workspace-catalog')).toMatchObject({
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
      { route: '/platforms/workspace-catalog', size: 'giant' },
      { route: '/platforms/workspace-catalog', size: 'small' },
      { route: '/platforms/workspace-catalog', size: 'medium' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/platforms/workspace-catalog', size: 'small' },
    ])
  })

  it('keeps the required Platforms launcher first when present', () => {
    expect(prioritizeRequiredHomeLauncher([
      { route: '/midi-hub', size: 'small' },
      { route: '/platforms/overview', size: 'medium' },
      { route: '/audio-table', size: 'large' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/midi-hub', size: 'small' },
      { route: '/audio-table', size: 'large' },
    ])
  })

  it('injects the required Platforms launcher when missing', () => {
    expect(ensureRequiredHomeLauncher([
      { route: '/midi-hub', size: 'small' },
      { route: '/audio-table', size: 'large' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/midi-hub', size: 'small' },
      { route: '/audio-table', size: 'large' },
    ])
  })
})
