import type { ComponentType } from 'react'
import {
  Catalog,
  ChartLineSmooth,
  Code,
  DataBase,
  Devices,
  Events,
  Flash,
  Information,
  Network_3,
  PaintBrush,
  PlugFilled,
  SettingsAdjust,
  Share,
  Terminal,
} from '@carbon/icons-react'

import { MapOs2DrivesIcon, MapOs2HomeIcon } from '../components/icons/map'
import { PLATFORM_LAYER_META, type PlatformLayerId } from '../platform/model'

type PlatformIcon = ComponentType<any>

export type StandalonePanel =
  | 'host-machine'
  | 'audio-engine'
  | 'theme'
  | 'about'
  | 'adoption'
  | 'midpoint'
export const PLATFORM_UTILITY_PANEL_IDS = ['theme', 'about'] as const

export function isStandalonePanel(value: string | null | undefined): value is StandalonePanel {
  return value === 'host-machine'
    || value === 'audio-engine'
    || value === 'theme'
    || value === 'about'
    || value === 'adoption'
    || value === 'midpoint'
}

export function isPlatformUtilityPanel(
  value: string | null | undefined,
): value is (typeof PLATFORM_UTILITY_PANEL_IDS)[number] {
  return typeof value === 'string'
    && (PLATFORM_UTILITY_PANEL_IDS as readonly string[]).includes(value)
}

export interface PlatformPanelNavItem {
  to: string
  label: string
  shortLabel: string
  icon: PlatformIcon
  description: string
  color: string
  pinnable: boolean
  maturity: 'beta'
  kind: 'link'
  target: { layer?: PlatformLayerId; panel?: StandalonePanel }
}

export type PlatformPinnedNavItem = PlatformPanelNavItem & { pinnable: true }

const PLATFORM_LAYER_ICONS: Record<PlatformLayerId, PlatformIcon> = {
  overview: MapOs2DrivesIcon,
  management: Devices,
  'avb-routing': Network_3,
  'network-discovery': Share,
  'cluster-dashboard': DataBase,
}

const STANDALONE_PANEL_ITEMS: Record<StandalonePanel, {
  label: string
  shortLabel: string
  description: string
  color: string
  icon: PlatformIcon
  pinnable: boolean
}> = {
  'audio-engine': {
    label: 'Audio Engine',
    shortLabel: 'Engine',
    description: 'Open the audio-engine workspace for runtime, latency, and engine-state inspection.',
    color: 'var(--cds-support-error)',
    icon: Terminal,
    pinnable: true,
  },
  'midpoint': {
    label: 'Midpoint',
    shortLabel: 'Midpoint',
    description: 'Open the operator midpoint for the platform event bus live feed, outbound webhook targets, and the web SSH console for discovered cluster nodes.',
    color: 'var(--cds-link-primary)',
    icon: Flash,
    pinnable: true,
  },
  'adoption': {
    label: 'Adoption',
    shortLabel: 'Adopt',
    description: 'Open the dedicated Platforms adoption workflow for unmanaged, blocked, or standby nodes.',
    color: 'var(--cds-support-warning)',
    icon: SettingsAdjust,
    pinnable: true,
  },
  'host-machine': {
    label: 'Host Machine',
    shortLabel: 'Host',
    description: 'Open hardware posture, services, and interface readiness for the local MAP2 host.',
    color: 'var(--cds-support-warning)',
    icon: MapOs2HomeIcon,
    pinnable: true,
  },
  'theme': {
    label: 'Theme',
    shortLabel: 'Theme',
    description: 'Open the appearance workspace for Carbon theme presets, GUI typography, motion reduction, and category accents.',
    color: 'var(--cds-link-primary)',
    icon: PaintBrush,
    pinnable: true,
  },
  'about': {
    label: 'Platform Guide',
    shortLabel: 'Guide',
    description: 'Open the platform guide, version context, and operational documentation surface.',
    color: 'var(--cds-support-info)',
    icon: Information,
    pinnable: true,
  },
}

function buildPlatformLayerPinnedRoute(layerId: PlatformLayerId): string {
  return `/platforms/${layerId}`
}

function buildPlatformPanelPinnedRoute(panel: StandalonePanel): string {
  return `/platforms/${panel}`
}

function buildPlatformLayerNavItem(layerId: PlatformLayerId): PlatformPanelNavItem {
  const layer = PLATFORM_LAYER_META.find((candidate) => candidate.id === layerId)
  if (!layer) {
    throw new Error(`Unknown platform layer: ${layerId}`)
  }

  return {
    to: buildPlatformLayerPinnedRoute(layer.id),
    label: layer.label,
    shortLabel: layer.shortLabel,
    icon: PLATFORM_LAYER_ICONS[layer.id],
    description: layer.description,
    color: layer.accent,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    target: { layer: layer.id },
  }
}

function buildStandalonePanelNavItem(panelId: StandalonePanel): PlatformPanelNavItem {
  const panel = STANDALONE_PANEL_ITEMS[panelId]

  return {
    to: buildPlatformPanelPinnedRoute(panelId),
    label: panel.label,
    shortLabel: panel.shortLabel,
    icon: panel.icon,
    description: panel.description,
    color: panel.color,
    pinnable: panel.pinnable,
    maturity: 'beta',
    kind: 'link',
    target: { panel: panelId },
  }
}

export type MidpointChildTabId =
  | 'catalog'
  | 'traffic'
  | 'event-feed'
  | 'websocket'
  | 'web-ssh'
  | 'builder'
  | 'collections'

interface MidpointChildSpec {
  tabId: MidpointChildTabId
  label: string
  shortLabel: string
  description: string
  icon: PlatformIcon
}

const MIDPOINT_CHILD_SPECS: MidpointChildSpec[] = [
  {
    tabId: 'catalog',
    label: 'Midpoint · API Catalog',
    shortLabel: 'API Catalog',
    description: 'OpenAPI-driven endpoint explorer with hand-authored context and schema diffs.',
    icon: Catalog,
  },
  {
    tabId: 'traffic',
    label: 'Midpoint · Traffic Monitor',
    shortLabel: 'Traffic',
    description: 'Watch real-time request waterfall, statistics, and session recordings.',
    icon: ChartLineSmooth,
  },
  {
    tabId: 'event-feed',
    label: 'Midpoint · Event Feed',
    shortLabel: 'Events',
    description: 'Open the platform event bus live feed and outbound webhook targets.',
    icon: Events,
  },
  {
    tabId: 'websocket',
    label: 'Midpoint · WebSocket Inspector',
    shortLabel: 'WebSocket',
    description: 'Open multiple WS connections, inspect messages, record/replay, and diff payloads.',
    icon: PlugFilled,
  },
  {
    tabId: 'web-ssh',
    label: 'Midpoint · Web SSH',
    shortLabel: 'Web SSH',
    description: 'Open the in-browser SSH console for discovered cluster nodes.',
    icon: Terminal,
  },
  {
    tabId: 'builder',
    label: 'Midpoint · Request Builder',
    shortLabel: 'Builder',
    description: 'Send REST requests through a cluster-aware proxy with scripts, tests, and history.',
    icon: Code,
  },
  {
    tabId: 'collections',
    label: 'Midpoint · Collections',
    shortLabel: 'Collections',
    description: 'Manage workspaces, environments, saved requests, and collection automation.',
    icon: DataBase,
  },
]

export interface MidpointChildNavItem extends PlatformPanelNavItem {
  parentPanel: 'midpoint'
  tabId: MidpointChildTabId
}

function buildMidpointChildNavItem(spec: MidpointChildSpec): MidpointChildNavItem {
  return {
    to: `/platforms/midpoint?tab=${spec.tabId}`,
    label: spec.label,
    shortLabel: spec.shortLabel,
    icon: spec.icon,
    description: spec.description,
    color: 'var(--cds-link-primary)',
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    target: { panel: 'midpoint' },
    parentPanel: 'midpoint',
    tabId: spec.tabId,
  }
}

export const midpointChildNavItems: MidpointChildNavItem[] = MIDPOINT_CHILD_SPECS.map(
  buildMidpointChildNavItem,
)

export function isMidpointChildNavItem(
  item: PlatformPanelNavItem,
): item is MidpointChildNavItem {
  return (item as MidpointChildNavItem).parentPanel === 'midpoint'
}

export const platformPanelItems: PlatformPanelNavItem[] = [
  buildPlatformLayerNavItem('overview'),
  buildStandalonePanelNavItem('audio-engine'),
  buildPlatformLayerNavItem('management'),
  buildPlatformLayerNavItem('avb-routing'),
  buildPlatformLayerNavItem('network-discovery'),
  buildPlatformLayerNavItem('cluster-dashboard'),
  buildStandalonePanelNavItem('midpoint'),
  ...midpointChildNavItems,
  buildStandalonePanelNavItem('adoption'),
  buildStandalonePanelNavItem('theme'),
  buildStandalonePanelNavItem('about'),
]

export const platformPinnedItems: PlatformPinnedNavItem[] = platformPanelItems.filter(
  (item): item is PlatformPinnedNavItem => item.pinnable,
)

const platformPinnedRouteSet = new Set(platformPinnedItems.map((item) => item.to))

export function isPlatformPinnedRoute(value: string | null | undefined): value is PlatformPinnedNavItem['to'] {
  return typeof value === 'string' && platformPinnedRouteSet.has(value)
}
