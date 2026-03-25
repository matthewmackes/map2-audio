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

export function isStandalonePanel(value: string | null | undefined): value is StandalonePanel {
  return value === 'host-machine' || value === 'audio-engine' || value === 'theme' || value === 'about' || value === 'adoption'
}

export interface PlatformPinnedNavItem {
  to: string
  label: string
  shortLabel: string
  icon: CarbonIconType
  description: string
  color: string
  pinnable: true
  maturity: 'beta'
  kind: 'link'
  target: { layer?: PlatformLayerId; panel?: StandalonePanel }
}

const PLATFORM_LAYER_ICONS: Record<PlatformLayerId, CarbonIconType> = {
  overview: ChartColumn,
  'single-node': Devices,
  'avb-routing': Network_3,
  'midi-cluster': Share,
  'api-observatory': Terminal,
  'cluster-dashboard': DataBase,
}

const STANDALONE_PANEL_ITEMS: Array<{
  id: StandalonePanel
  label: string
  shortLabel: string
  description: string
  color: string
  icon: CarbonIconType
}> = [
  {
    id: 'host-machine',
    label: 'Host Machine',
    shortLabel: 'Host',
    description: 'Open hardware posture, services, and interface readiness for the local MAP2 host.',
    color: 'var(--cds-support-warning)',
    icon: Screen,
  },
  {
    id: 'audio-engine',
    label: 'Audio Engine',
    shortLabel: 'Engine',
    description: 'Open the audio-engine workspace for runtime, latency, and engine-state inspection.',
    color: 'var(--cds-support-error)',
    icon: Terminal,
  },
  {
    id: 'theme',
    label: 'Theme',
    shortLabel: 'Theme',
    description: 'Open the appearance workspace for Carbon theme presets, GUI typography, motion reduction, and category accents.',
    color: 'var(--cds-link-primary)',
    icon: PaintBrush,
  },
  {
    id: 'about',
    label: 'Platform Guide',
    shortLabel: 'Guide',
    description: 'Open the platform guide, version context, and operational documentation surface.',
    color: 'var(--cds-support-info)',
    icon: Information,
  },
  {
    id: 'adoption',
    label: 'Adoption',
    shortLabel: 'Adopt',
    description: 'Open the dedicated Platforms adoption workflow for unmanaged, blocked, or standby nodes.',
    color: 'var(--cds-support-warning)',
    icon: SettingsAdjust,
  },
]

function buildPlatformLayerPinnedRoute(layerId: PlatformLayerId): string {
  return `/platforms/${layerId}`
}

function buildPlatformPanelPinnedRoute(panel: StandalonePanel): string {
  return `/platforms/${panel}`
}

export const platformPinnedItems: PlatformPinnedNavItem[] = [
  ...PLATFORM_LAYER_META.map((layer) => ({
    to: buildPlatformLayerPinnedRoute(layer.id),
    label: layer.label,
    shortLabel: layer.shortLabel,
    icon: PLATFORM_LAYER_ICONS[layer.id],
    description: layer.description,
    color: layer.accent,
    pinnable: true as const,
    maturity: 'beta' as const,
    kind: 'link' as const,
    target: { layer: layer.id },
  })),
  ...STANDALONE_PANEL_ITEMS.map((panel) => ({
    to: buildPlatformPanelPinnedRoute(panel.id),
    label: panel.label,
    shortLabel: panel.shortLabel,
    icon: panel.icon,
    description: panel.description,
    color: panel.color,
    pinnable: true as const,
    maturity: 'beta' as const,
    kind: 'link' as const,
    target: { panel: panel.id },
  })),
]

const platformPinnedRouteSet = new Set(platformPinnedItems.map((item) => item.to))

export function isPlatformPinnedRoute(value: string | null | undefined): value is PlatformPinnedNavItem['to'] {
  return typeof value === 'string' && platformPinnedRouteSet.has(value)
}
