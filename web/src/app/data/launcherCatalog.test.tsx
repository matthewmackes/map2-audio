import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  getLauncherCatalogTreeChildren,
  getLauncherCatalogMaturityLabel,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
} from './launcherCatalog'

describe('launcherCatalog', () => {
  it('keeps standalone routed workspaces in the catalog and removes the migrated fixed Start Menu routes', () => {
    expect(getLauncherCatalogItem('/platforms/launchers')).toBeNull()
    expect(getLauncherCatalogItem('/workspace')).toMatchObject({
      heroTitle: 'Workspaces',
      landingEligible: true,
      navEligible: false,
      directory: 'core',
      storefrontCollections: expect.arrayContaining(['featured', 'platform-essentials']),
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/workspace' }),
      ]),
    })
    expect(getLauncherCatalogItem('/workspace/artifacts')).toMatchObject({
      heroTitle: 'Audio Artifacts',
      landingEligible: true,
      navEligible: true,
      directory: 'core',
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/workspace/artifacts' }),
      ]),
    })
    expect(getLauncherCatalogItem('/brain')).toMatchObject({
      heroTitle: 'Brain',
      landingEligible: true,
      navEligible: false,
      directory: 'core',
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/brain' }),
      ]),
    })
    expect(getLauncherCatalogItem('/outboard-hardware')).toMatchObject({
      heroTitle: 'Outboard Hardware',
      landingEligible: true,
      navEligible: false,
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/workspace/outboard-hardware' }),
      ]),
    })
    expect(getLauncherCatalogItem('/audio-table')).toBeNull()
    expect(getLauncherCatalogItem('/drums')).toBeNull()
    expect(getLauncherCatalogItem('/synth-forge')).toBeNull()
    for (const route of [
      '/juce-grid',
      '/midi-hub',
      '/hardware-interfaces',
      '/labs/push-surface',
      '/ground-control-pro',
      '/maschine',
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
      { route: '/brain', size: 'large' },
      { route: '/workspace', size: 'medium' },
      { route: '/workspace/artifacts', size: 'large' },
    ])
  })

  it('keeps the required Workspaces launcher first when present', () => {
    expect(prioritizeRequiredHomeLauncher([
      { route: '/perform', size: 'small' },
      { route: '/workspace', size: 'medium' },
      { route: '/workspace/artifacts', size: 'large' },
    ])).toEqual([
      { route: '/workspace', size: 'medium' },
      { route: '/perform', size: 'small' },
      { route: '/workspace/artifacts', size: 'large' },
    ])
  })

  it('injects the required Workspaces launcher when missing', () => {
    expect(ensureRequiredHomeLauncher([
      { route: '/perform', size: 'small' },
      { route: '/workspace/artifacts', size: 'large' },
    ])).toEqual([
      { route: '/workspace', size: 'medium' },
      { route: '/perform', size: 'small' },
      { route: '/workspace/artifacts', size: 'large' },
    ])
  })

  it('renames hardware-blocked maturity for storefront presentation', () => {
    expect(getLauncherCatalogMaturityLabel('hardware-blocked')).toBe('Hardware Not Detected')
  })

  it('exports tree-child navigation metadata for catalog and nav-only parent routes', () => {
    expect(getLauncherCatalogTreeChildren('/workspace')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: '/workspace/platforms/overview', label: 'Overview' }),
        expect.objectContaining({ route: '/chains', label: 'Chains' }),
      ]),
    )
    expect(getLauncherCatalogTreeChildren('/workspace')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: '/workspace/artifacts', label: 'Audio Artifacts' }),
        expect.objectContaining({ route: '/workspace/physical-surfaces', label: 'Physical Surfaces' }),
        expect.objectContaining({ route: '/workspace/outboard-hardware/intelfx-rack', label: 'IntelFX Rack' }),
      ]),
    )

    expect(getLauncherCatalogTreeChildren('/workspace/artifacts')).toEqual(
      expect.arrayContaining([
        { route: '/workspace/artifacts', label: 'Overview' },
        { route: '/workspace/artifacts?category=lv2-plugins', label: 'LV2 Plugins' },
        { route: '/workspace/artifacts?category=native-juce', label: 'Native JUCE' },
      ]),
    )

    expect(getLauncherCatalogTreeChildren('/workspace/physical-surfaces')).toEqual(
      expect.arrayContaining([
        { route: '/workspace/physical-surfaces', label: 'Overview' },
        { route: '/workspace/physical-surfaces/ableton-push', label: 'Ableton Push' },
        { route: '/workspace/physical-surfaces/mackie-mcu-pro', label: 'MCU Pro' },
      ]),
    )

    expect(getLauncherCatalogTreeChildren('/workspace/outboard-hardware')).toEqual(
      expect.arrayContaining([
        { route: '/workspace/outboard-hardware', label: 'Overview' },
        { route: '/workspace/outboard-hardware/tesira', label: 'Tesira AVB' },
        { route: '/workspace/outboard-hardware/intelfx-rack', label: 'IntelFX Rack' },
      ]),
    )

    expect(getLauncherCatalogTreeChildren('/midi-hub')).toEqual([
      { route: '/midi-hub/connections', label: 'Connections' },
      { route: '/midi-hub/presets', label: 'Presets' },
      { route: '/midi-hub/transport', label: 'Transport' },
      { route: '/midi-hub/events', label: 'Events' },
      { route: '/midi-hub/processing', label: 'Processing' },
      { route: '/midi-hub/network', label: 'Network' },
      { route: '/midi-hub/lab', label: 'Lab' },
    ])
  })
})
