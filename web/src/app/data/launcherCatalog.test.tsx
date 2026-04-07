import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  getLauncherCatalogMaturityLabel,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
} from './launcherCatalog'

describe('launcherCatalog', () => {
  it('keeps the remaining standalone routed workspaces in the catalog and removes the fixed Start Menu routes', () => {
    expect(getLauncherCatalogItem('/platforms/launchers')).toBeNull()
    expect(getLauncherCatalogItem('/artifacts')).toMatchObject({
      heroTitle: 'Audio Artifacts',
      landingEligible: true,
      navEligible: true,
      directory: 'core',
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/artifacts' }),
      ]),
    })
    expect(getLauncherCatalogItem('/audio-table')).toBeNull()
    expect(getLauncherCatalogItem('/drums')).toBeNull()
    expect(getLauncherCatalogItem('/synth-forge')).toBeNull()
    for (const route of [
      '/brain',
      '/juce-grid',
      '/midi-hub',
      '/hardware-interfaces',
      '/platforms/workspace-catalog',
      '/platforms/audio-engine',
      '/platforms/management',
      '/platforms/avb-routing',
      '/platforms/network-discovery',
      '/platforms/cluster-dashboard',
      '/platforms/adoption',
      '/platforms/host-machine',
      '/platforms/theme',
      '/platforms/about',
    ]) {
      expect(getLauncherCatalogItem(route)).toBeNull()
    }
  })

  it('normalizes landing tiles to canonical route-backed launchers only and drops removed fixed-tile/catalog routes', () => {
    expect(normalizeLandingTiles([
      { route: '/brain', size: 'large' },
      { route: '/juce-grid', size: 'small' },
      { route: '/midi-hub', size: 'medium' },
      { route: '/drums', size: 'small' },
      { route: '/synth-forge', size: 'large' },
      { route: '/audio-table', size: 'large' },
      { route: '/platform', size: 'medium' },
      { route: '/hardware-interfaces', size: 'large' },
      { route: '/artifacts', size: 'large' },
      { route: '/platforms/workspace-catalog', size: 'giant' },
      { route: '/platforms/workspace-catalog', size: 'small' },
      { route: '/platforms/workspace-catalog', size: 'medium' },
      { route: '/platforms/about', size: 'large' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/artifacts', size: 'large' },
    ])
  })

  it('keeps the required Platforms launcher first when present', () => {
    expect(prioritizeRequiredHomeLauncher([
      { route: '/perform', size: 'small' },
      { route: '/platforms/overview', size: 'medium' },
      { route: '/artifacts', size: 'large' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/perform', size: 'small' },
      { route: '/artifacts', size: 'large' },
    ])
  })

  it('injects the required Platforms launcher when missing', () => {
    expect(ensureRequiredHomeLauncher([
      { route: '/perform', size: 'small' },
      { route: '/artifacts', size: 'large' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/perform', size: 'small' },
      { route: '/artifacts', size: 'large' },
    ])
  })

  it('renames hardware-blocked maturity for storefront presentation', () => {
    expect(getLauncherCatalogMaturityLabel('hardware-blocked')).toBe('Hardware Not Detected')
  })
})
