import {
  ChartColumn,
  DataBase,
  Devices,
  Information,
  Network_3,
  PaintBrush,
  SettingsAdjust,
  Screen,
  Share,
  Terminal,
  type CarbonIconType,
} from '@carbon/icons-react'

import { PLATFORM_LAYER_META, type PlatformLayerId } from '../platform/model'

export type StandalonePanel = 'host-machine' | 'audio-engine' | 'theme' | 'about' | 'adoption'
export const PLATFORM_UTILITY_PANEL_IDS = ['host-machine', 'theme', 'about'] as const

export function isStandalonePanel(value: string | null | undefined): value is StandalonePanel {
  return value === 'host-machine'
    || value === 'audio-engine'
    || value === 'theme'
    || value === 'about'
    || value === 'adoption'
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
  icon: CarbonIconType
  description: string
  color: string
  pinnable: boolean
  maturity: 'beta'
  kind: 'link'
  target: { layer?: PlatformLayerId; panel?: StandalonePanel }
}

export type PlatformPinnedNavItem = PlatformPanelNavItem & { pinnable: true }

const PLATFORM_LAYER_ICONS: Record<PlatformLayerId, CarbonIconType> = {
  overview: ChartColumn,
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
  icon: CarbonIconType
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
    icon: Screen,
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

export const platformPanelItems: PlatformPanelNavItem[] = [
  buildPlatformLayerNavItem('overview'),
  buildStandalonePanelNavItem('audio-engine'),
  buildPlatformLayerNavItem('management'),
  buildPlatformLayerNavItem('avb-routing'),
  buildPlatformLayerNavItem('network-discovery'),
  buildPlatformLayerNavItem('cluster-dashboard'),
  buildStandalonePanelNavItem('adoption'),
  buildStandalonePanelNavItem('host-machine'),
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
