import { buildWorkspaceHubPlatformPath } from '../platform/routes'
import { allRouteNavigationItems } from '../data/advancedMenuItems'
import { platformPinnedItems } from '../data/platformMenuItems'
import type { ShellNavigationRenderItem } from './NavigationItems'

type StartMenuDefinition = {
  lookupRoute: string
  route: string
  label: string
  shortLabel: string
  homeGroup: string
  description: string
}

const START_MENU_DEFINITIONS: StartMenuDefinition[] = [
  {
    lookupRoute: '/platforms/management',
    route: buildWorkspaceHubPlatformPath('management'),
    label: 'Device(s) Manager',
    shortLabel: 'Device(s) Manager',
    homeGroup: 'Device Operations',
    description: 'Open the unified platform device-management surface for host posture, discovery, adoption, and hardware readiness.',
  },
  {
    lookupRoute: '/juce-grid',
    route: '/snapshot-editor',
    label: 'Snapshot Editor',
    shortLabel: 'Snapshot Editor',
    homeGroup: 'Workspace',
    description: 'Open the snapshot-first editing surface for graph state, routing, plugin work, and recall operations.',
  },
  {
    lookupRoute: '/midi-hub',
    route: '/midi-hub/connections',
    label: 'Advanced MIDI',
    shortLabel: 'Advanced MIDI',
    homeGroup: 'MIDI',
    description: 'Open the MIDI control and routing shell for connections, presets, transport, network, and diagnostics.',
  },
  {
    lookupRoute: '/brain',
    route: '/brain',
    label: 'Brain',
    shortLabel: 'Brain',
    homeGroup: 'Performance',
    description: 'Open the performance brain workspace for sequencing, triggering, routing, and live control.',
  },
  {
    lookupRoute: '/brain',
    route: '/brain?import_source=drums',
    label: 'Drum-Machine',
    shortLabel: 'Drum-Machine',
    homeGroup: 'Performance',
    description: 'Open the brain workflow seeded from the drum-machine import path for rehearsal and pattern-driven rhythm work.',
  },
  {
    lookupRoute: '/brain',
    route: '/brain?import_source=synthforge',
    label: 'SynthForge',
    shortLabel: 'SynthForge',
    homeGroup: 'Performance',
    description: 'Open the brain workflow seeded from the SynthForge import path for instrument and sampler-driven performance work.',
  },
]

function findSourceItem(route: string) {
  return platformPinnedItems.find((item) => item.to === route)
    ?? allRouteNavigationItems.find((item) => item.to === route)
}

export function buildStartMenuItems(): ShellNavigationRenderItem[] {
  return START_MENU_DEFINITIONS.flatMap((definition) => {
    const source = findSourceItem(definition.lookupRoute)
    if (!source) {
      return []
    }

    return [{
      route: definition.route,
      label: definition.label,
      shortLabel: definition.shortLabel,
      homeGroup: definition.homeGroup,
      icon: source.icon,
      description: definition.description,
      color: source.color,
      maturity: source.maturity,
    } satisfies ShellNavigationRenderItem]
  })
}
