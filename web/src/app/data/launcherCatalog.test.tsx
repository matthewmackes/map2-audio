import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  getLauncherCatalogTreeChildren,
  getLauncherCatalogMaturityLabel,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
} from './launcherCatalog'
import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'

// Nav reorg 2026-05-03 (second pass) — canonical post-reorg URLs:
//   /node-ops, /node-ops/<id>            (was /workspace, /platforms/<id>,
//                                          /workspace/platforms/<id>)
//   /artifacts, /artifacts/?category=<>  (was /workspace/artifacts)
//   /about                                (was /platforms/about)
// Audio Artifacts is now its own top-level service group; About is no
// longer a Node Ops child; AVB Routing is on /avb/routing; Device
// Manager is a Hardware nav child (URL stays under /node-ops/management);
// Theme is a Settings nav child (URL stays under /node-ops/theme); Chains
// is a top-level leaf.

describe('launcherCatalog', () => {
  it('keeps standalone routed workspaces in the catalog and removes the migrated fixed Start Menu routes', () => {
    expect(getLauncherCatalogItem('/platforms/launchers')).toBeNull()
    expect(getLauncherCatalogItem('/node-ops')).toMatchObject({
      heroTitle: 'Workspaces',
      landingEligible: true,
      navEligible: false,
      directory: 'core',
      storefrontCollections: expect.arrayContaining(['featured', 'platform-essentials']),
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/node-ops' }),
      ]),
    })
    expect(getLauncherCatalogItem('/artifacts')).toMatchObject({
      heroTitle: 'Audio Artifacts',
      landingEligible: true,
      navEligible: true,
      directory: 'core',
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/artifacts' }),
      ]),
    })
    expect(getLauncherCatalogItem('/sequencer')).toMatchObject({
      heroTitle: 'Sequencer',
      landingEligible: true,
      navEligible: false,
      directory: 'core',
      technicalSpecs: expect.arrayContaining([
        expect.objectContaining({ label: 'Launch path', value: '/sequencer' }),
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
    // Both legacy `/platforms/<id>` and post-reorg `/node-ops/<id>`
    // sub-routes are excluded from the catalog (they're sections
    // inside the Node Ops hub, not standalone tiles).
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
      '/node-ops/audio-engine',
      '/node-ops/management',
      '/node-ops/network-discovery',
      '/node-ops/cluster-dashboard',
      '/node-ops/adoption',
      '/node-ops/theme',
    ]) {
      expect(getLauncherCatalogItem(route)).toBeNull()
    }
  })

  it('normalizes landing tiles to canonical route-backed launchers only and drops removed fixed-tile/catalog routes', () => {
    expect(normalizeLandingTiles([
      { route: '/sequencer', size: 'large' },
      { route: '/juce-grid', size: 'small' },
      { route: '/midi-hub', size: 'medium' },
      { route: '/drums', size: 'small' },
      { route: '/synth-forge', size: 'large' },
      { route: '/audio-table', size: 'large' },
      { route: '/platform', size: 'medium' },
      { route: '/hardware-interfaces', size: 'large' },
      // `/artifacts` is now a real top-level catalog entry.
      { route: '/artifacts', size: 'large' },
      { route: '/platforms/workspace-catalog', size: 'giant' },
      { route: '/platforms/workspace-catalog', size: 'small' },
      { route: '/platforms/workspace-catalog', size: 'medium' },
    ])).toEqual([
      { route: '/sequencer', size: 'large' },
      // `/platform` resolves via PINNED_ROUTE_ALIASES to `/node-ops`.
      { route: '/node-ops', size: 'medium' },
      { route: '/artifacts', size: 'large' },
    ])
  })

  it('keeps the required Node Ops launcher first when present', () => {
    expect(prioritizeRequiredHomeLauncher([
      { route: '/perform', size: 'small' },
      { route: '/node-ops', size: 'medium' },
      { route: '/artifacts', size: 'large' },
    ])).toEqual([
      { route: '/node-ops', size: 'medium' },
      { route: '/perform', size: 'small' },
      { route: '/artifacts', size: 'large' },
    ])
  })

  it('injects the required Node Ops launcher when missing', () => {
    expect(ensureRequiredHomeLauncher([
      { route: '/perform', size: 'small' },
      { route: '/artifacts', size: 'large' },
    ])).toEqual([
      { route: '/node-ops', size: 'medium' },
      { route: '/perform', size: 'small' },
      { route: '/artifacts', size: 'large' },
    ])
  })

  it('renames hardware-blocked maturity for storefront presentation', () => {
    expect(getLauncherCatalogMaturityLabel('hardware-blocked')).toBe('Hardware Not Detected')
  })

  it('exports tree-child navigation metadata for catalog and nav-only parent routes', () => {
    // Node Ops children — pure platform infrastructure only.
    expect(getLauncherCatalogTreeChildren('/node-ops')).toEqual([
      { route: '/node-ops/overview', label: 'Overview' },
      { route: '/node-ops/audio-engine', label: 'Audio Engine' },
      { route: '/node-ops/network-discovery', label: 'Network Discovery' },
      { route: '/node-ops/cluster-dashboard', label: 'Cluster Dashboard' },
      { route: '/node-ops/midpoint', label: 'Midpoint' },
      { route: '/node-ops/adoption', label: 'Adoption' },
    ])

    // Promoted out of Node Ops:
    expect(getLauncherCatalogTreeChildren('/node-ops')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: '/chains' }),
        expect.objectContaining({ route: '/artifacts' }),
        expect.objectContaining({ route: '/workspace/artifacts' }),
        expect.objectContaining({ route: '/node-ops/management' }),
        expect.objectContaining({ route: '/node-ops/theme' }),
        expect.objectContaining({ route: '/node-ops/avb-routing' }),
      ]),
    )

    // Settings group exposes Theme as its sole child.
    expect(getLauncherCatalogTreeChildren('/settings')).toEqual([
      { route: '/node-ops/theme', label: 'Theme' },
    ])

    // Audio Artifacts is its own top-level service group.
    expect(getLauncherCatalogTreeChildren('/artifacts')).toEqual(
      expect.arrayContaining([
        { route: '/artifacts', label: 'Overview' },
        { route: '/artifacts?category=lv2-plugins', label: 'LV2 Plugins' },
        { route: '/artifacts?category=native-juce', label: 'Native JUCE' },
      ]),
    )

    // Legacy /workspace key still resolves to the same Node Ops
    // children object via the alias in LAUNCHER_STOREFRONT_OVERRIDES.
    expect(getLauncherCatalogTreeChildren('/workspace')).toEqual([
      { route: '/node-ops/overview', label: 'Overview' },
      { route: '/node-ops/audio-engine', label: 'Audio Engine' },
      { route: '/node-ops/network-discovery', label: 'Network Discovery' },
      { route: '/node-ops/cluster-dashboard', label: 'Cluster Dashboard' },
      { route: '/node-ops/midpoint', label: 'Midpoint' },
      { route: '/node-ops/adoption', label: 'Adoption' },
    ])

    expect(getLauncherCatalogTreeChildren('/workspace/physical-surfaces')).toEqual([])
    expect(getLauncherCatalogTreeChildren('/workspace/outboard-hardware')).toEqual([])

    // T2491 (2026-05-02 cleanup) — re-pointed children to canonical /midi/*.
    expect(getLauncherCatalogTreeChildren('/midi-hub')).toEqual([
      { route: '/midi/connections', label: 'Connections' },
      { route: '/midi/devices', label: 'Devices' },
      { route: '/midi/bindings', label: 'Bindings' },
      { route: '/midi/routing', label: 'Routing' },
      { route: '/midi/presets', label: 'Presets' },
      { route: '/midi/transport', label: 'Transport' },
      { route: '/midi/events', label: 'Events' },
      { route: '/midi/processing', label: 'Processing' },
      { route: '/midi/network', label: 'Network' },
      { route: '/midi/lab', label: 'Lab' },
    ])

    expect(getLauncherCatalogTreeChildren('/sequencer')).toEqual([
      // T2442: Brain Overview tabs are now first-class
      { route: '/sequencer?section=performance', label: 'Performance' },
      { route: '/sequencer?section=console', label: 'Console' },
      { route: '/sequencer?section=step', label: 'Step' },
      { route: '/sequencer?section=split', label: 'Split' },
      { route: '/sequencer?section=perform', label: 'Perform' },
      { route: '/sequencer?section=layers', label: 'Layers' },
      { route: '/sequencer?section=sequence', label: 'Sequence' },
      { route: '/sequencer?section=routing', label: 'Routing' },
      { route: '/sequencer?section=inputs', label: 'Inputs' },
      { route: '/sequencer?section=library', label: 'Library' },
      { route: '/sequencer?section=diagnostics', label: 'Diagnostics' },
      { route: '/sequencer?section=session_media', label: 'Session Media' },
      { route: '/sequencer?section=practice_coach', label: 'Practice Coach' },
    ])
  })
})
