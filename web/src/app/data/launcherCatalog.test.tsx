import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  getLauncherCatalogMaturityLabel,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
} from './launcherCatalog'

describe('launcherCatalog', () => {
  it('keeps standalone routed workspaces in the catalog and marks hardware submenu triggers as nav-only', () => {
    expect(getLauncherCatalogItem('/platforms/launchers')).toBeNull()
    expect(getLauncherCatalogItem('/drums')).toMatchObject({
      heroTitle: 'Drum Machine',
      landingEligible: true,
      navEligible: false,
      directory: 'core',
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/drums' }),
      ]),
    })
    expect(getLauncherCatalogItem('/synth-forge')).toMatchObject({
      heroTitle: 'SynthForge',
      landingEligible: true,
      navEligible: false,
      directory: 'core',
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/synth-forge' }),
      ]),
    })
    expect(getLauncherCatalogItem('/audio-table')).toBeNull()
    expect(getLauncherCatalogItem('/hardware-interfaces')).toMatchObject({
      category: 'Audio Interface',
      landingEligible: false,
      navEligible: true,
      directory: 'nav-only',
    })
    expect(getLauncherCatalogItem('/midi-hub')).toMatchObject({
      heroTitle: 'MIDI Hub',
      category: 'Human Interface',
      storefrontCollections: expect.arrayContaining(['featured']),
      documentLinks: expect.arrayContaining([
        expect.objectContaining({ label: 'Storefront brief' }),
      ]),
    })
    expect(getLauncherCatalogItem('/platforms/workspace-catalog')).toMatchObject({
      heroTitle: 'Workspace Catalog',
      category: 'Platform',
      landingEligible: true,
      directory: 'core',
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Presentation model', value: 'Carbon digital storefront' }),
      ]),
    })
  })

  it('normalizes landing tiles to canonical route-backed launchers only', () => {
    expect(normalizeLandingTiles([
      { route: '/drums', size: 'small' },
      { route: '/synth-forge', size: 'large' },
      { route: '/audio-table', size: 'large' },
      { route: '/platform', size: 'medium' },
      { route: '/hardware-interfaces', size: 'large' },
      { route: '/platforms/workspace-catalog', size: 'giant' },
      { route: '/platforms/workspace-catalog', size: 'small' },
      { route: '/platforms/workspace-catalog', size: 'medium' },
    ])).toEqual([
      { route: '/drums', size: 'small' },
      { route: '/synth-forge', size: 'large' },
      { route: '/platforms/overview', size: 'medium' },
      { route: '/platforms/workspace-catalog', size: 'small' },
    ])
  })

  it('keeps the required Platforms launcher first when present', () => {
    expect(prioritizeRequiredHomeLauncher([
      { route: '/midi-hub', size: 'small' },
      { route: '/platforms/overview', size: 'medium' },
      { route: '/platforms/workspace-catalog', size: 'large' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/midi-hub', size: 'small' },
      { route: '/platforms/workspace-catalog', size: 'large' },
    ])
  })

  it('injects the required Platforms launcher when missing', () => {
    expect(ensureRequiredHomeLauncher([
      { route: '/midi-hub', size: 'small' },
      { route: '/platforms/workspace-catalog', size: 'large' },
    ])).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/midi-hub', size: 'small' },
      { route: '/platforms/workspace-catalog', size: 'large' },
    ])
  })

  it('renames hardware-blocked maturity for storefront presentation', () => {
    expect(getLauncherCatalogMaturityLabel('hardware-blocked')).toBe('Hardware Not Detected')
  })
})
