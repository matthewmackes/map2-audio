import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  getLauncherCatalogTreeChildren,
  getLauncherCatalogMaturityLabel,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
} from './launcherCatalog'
import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'

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
    for (const legacyDevicesRoute of [
      '/outboard-hardware',
      '/workspace/outboard-hardware',
      '/physical-surfaces',
      '/workspace/physical-surfaces',
    ]) {
      expect(getLauncherCatalogItem(legacyDevicesRoute)).toMatchObject({
        heroTitle: 'Devices',
        route: '/devices',
      })
    }
    expect(getLauncherCatalogItem('/audio-table')).toBeNull()
    expect(getLauncherCatalogItem('/drums')).toBeNull()
    expect(getLauncherCatalogItem('/synth-forge')).toBeNull()
    for (const route of [
      '/juce-grid',
      '/midi-hub',
      '/hardware-interfaces',
      HOST_MACHINE_ROUTE,
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
      ]),
    )
    expect(getLauncherCatalogTreeChildren('/workspace')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: '/workspace/platforms/host-machine', label: 'Host Machine' }),
      ]),
    )

    expect(getLauncherCatalogTreeChildren('/workspace/artifacts')).toEqual(
      expect.arrayContaining([
        { route: '/workspace/artifacts', label: 'Overview' },
        { route: '/workspace/artifacts?category=lv2-plugins', label: 'LV2 Plugins' },
        { route: '/workspace/artifacts?category=native-juce', label: 'Native JUCE' },
      ]),
    )

    expect(getLauncherCatalogTreeChildren('/workspace/physical-surfaces')).toEqual([])
    expect(getLauncherCatalogTreeChildren('/workspace/outboard-hardware')).toEqual([])

    expect(getLauncherCatalogTreeChildren('/midi-hub')).toEqual([
      { route: '/midi-hub/connections', label: 'Connections' },
      { route: '/midi-hub/presets', label: 'Presets' },
      { route: '/midi-hub/transport', label: 'Transport' },
      { route: '/midi-hub/events', label: 'Events' },
      { route: '/midi-hub/processing', label: 'Processing' },
      { route: '/midi-hub/network', label: 'Network' },
      { route: '/midi-hub/lab', label: 'Lab' },
    ])

    expect(getLauncherCatalogTreeChildren('/brain')).toEqual([
      // T2442: Brain Overview tabs are now first-class
      { route: '/brain?section=performance', label: 'Performance' },
      { route: '/brain?section=console', label: 'Console' },
      { route: '/brain?section=step', label: 'Step' },
      { route: '/brain?section=split', label: 'Split' },
      { route: '/brain?section=perform', label: 'Perform' },
      { route: '/brain?section=layers', label: 'Layers' },
      { route: '/brain?section=sequence', label: 'Sequence' },
      { route: '/brain?section=routing', label: 'Routing' },
      { route: '/brain?section=inputs', label: 'Inputs' },
      { route: '/brain?section=library', label: 'Library' },
      { route: '/brain?section=diagnostics', label: 'Diagnostics' },
      { route: '/brain?section=session_media', label: 'Session Media' },
      { route: '/brain?section=practice_coach', label: 'Practice Coach' },
    ])
  })
})
