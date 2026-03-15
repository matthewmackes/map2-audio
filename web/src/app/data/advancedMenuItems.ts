import type { ComponentType } from 'react'
import {
  Catalog as SquaresFour,
  Dashboard as Gauge,
  Devices as Monitor,
  Home as House,
  Information as Info,
  Music as MusicNotes,
  Network_3,
  Package,
  SettingsAdjust as SlidersHorizontal,
  Terminal,
  Usb,
  Waveform,
} from '@carbon/icons-react'
import {
  MapAudioGridIcon,
  MapClusterFabricIcon,
  MapMatrixProcessorIcon,
  MapPatchLibraryIcon,
  MapRackDeviceIcon,
  MapRealtimeEngineIcon,
  MapRoutingMatrixIcon,
  MapStagePerformanceIcon,
} from '../components/icons/map'

export type NavigationMaturityState = 'production' | 'qualified-with-waiver' | 'beta' | 'experimental' | 'hardware-blocked'
export type NavigationRenderKind = 'link' | 'mpx1-mega-menu' | 'hardware-submenu'
export type NavigationHomeSection = 'Audio Grid' | 'AVB' | 'MIDI' | 'System' | 'Hardware'

export const DEFAULT_NAVIGATION_ALLOWED_STATES: NavigationMaturityState[] = ['production', 'qualified-with-waiver']
export const ADVANCED_NAVIGATION_ALLOWED_STATES: NavigationMaturityState[] = ['beta', 'experimental', 'hardware-blocked']
export const MAX_PINNED_NAV_ITEMS = 4
export const defaultPinnedRoutes: string[] = ['/juce-grid']

export interface ShellNavigationItem {
  to: string
  label: string
  shortLabel?: string
  icon: ComponentType<any>
  description: string
  color: string
  homeSection: NavigationHomeSection
  includeInAdvancedMenu: boolean
  pinnable: boolean
  maturity: NavigationMaturityState
  kind: NavigationRenderKind
  gatedReason?: string
  showOnHome?: boolean
  deviceType?: string
}

export interface AdvancedMenuItem extends ShellNavigationItem {
  includeInAdvancedMenu: true
}

export interface HardwareInterfaceMenuItem {
  to: string
  label: string
  shortLabel?: string
  icon: ComponentType<any>
  description: string
  color: string
  homeSection: 'Hardware'
  pinnable: boolean
  maturity: NavigationMaturityState
  kind: 'link'
  gatedReason?: string
  showOnHome?: boolean
  deviceType?: string
}

export interface NavigationSection {
  title: NavigationHomeSection
  items: Array<ShellNavigationItem | HardwareInterfaceMenuItem>
}

export const navigationMaturityMeta: Record<
  NavigationMaturityState,
  { label: NavigationMaturityState; description: string; accent: string; surface: string; border: string }
> = {
  production: {
    label: 'production',
    description: 'Qualified, operator-safe by default, and appropriate for default navigation.',
    accent: 'var(--cds-support-success)',
    surface: 'color-mix(in srgb, var(--cds-support-success) 14%, transparent)',
    border: 'color-mix(in srgb, var(--cds-support-success) 34%, transparent)',
  },
  'qualified-with-waiver': {
    label: 'qualified-with-waiver',
    description: 'Operationally credible, but still carrying documented caveats, qualification limits, or deployment waivers.',
    accent: 'var(--cds-support-info)',
    surface: 'color-mix(in srgb, var(--cds-support-info) 14%, transparent)',
    border: 'color-mix(in srgb, var(--cds-support-info) 34%, transparent)',
  },
  beta: {
    label: 'beta',
    description: 'Functionally substantial, but still missing closure, consistency, or enough operational proof for default trust.',
    accent: 'var(--cds-support-warning)',
    surface: 'color-mix(in srgb, var(--cds-support-warning) 14%, transparent)',
    border: 'color-mix(in srgb, var(--cds-support-warning) 34%, transparent)',
  },
  experimental: {
    label: 'experimental',
    description: 'Exploratory, incomplete, or weakly validated. Must never be presented as routine operator workflow.',
    accent: 'var(--cds-link-primary)',
    surface: 'color-mix(in srgb, var(--cds-link-primary) 14%, transparent)',
    border: 'color-mix(in srgb, var(--cds-link-primary) 34%, transparent)',
  },
  'hardware-blocked': {
    label: 'hardware-blocked',
    description: 'Depends on unavailable hardware, environment, or qualification evidence and should be hidden or explicitly blocked in normal operation.',
    accent: 'var(--cds-support-error)',
    surface: 'color-mix(in srgb, var(--cds-support-error) 14%, transparent)',
    border: 'color-mix(in srgb, var(--cds-support-error) 34%, transparent)',
  },
}

const baseNavigationCatalog: ShellNavigationItem[] = [
  {
    to: '/',
    label: 'Home',
    shortLabel: 'Home',
    icon: House,
    description: 'Return to the navigation landing page where every MAP2 workflow is explained and available for pinning into the shell.',
    color: 'var(--cds-support-warning)',
    homeSection: 'System',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'qualified-with-waiver',
    kind: 'link',
    showOnHome: false,
  },
  {
    to: '/platform',
    label: 'Platform Stack',
    shortLabel: 'Platform',
    icon: MapClusterFabricIcon,
    description: 'Open the unified platform stack to move between overview, single-node, AVB, MIDI cluster, API observability, and fleet operations from one route.',
    color: 'var(--cds-support-warning)',
    homeSection: 'System',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: true,
  },
  {
    to: '/engine',
    label: 'Audio Engine',
    shortLabel: 'Engine',
    icon: MapRealtimeEngineIcon,
    description: 'Monitor the realtime audio engine, inspect metering and signal-path health, and adjust the runtime controls that drive the main processing path.',
    color: 'var(--cds-link-primary)',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'qualified-with-waiver',
    kind: 'link',
  },
  {
    to: '/host-machine',
    label: 'Host Machine',
    shortLabel: 'Host',
    icon: MapRackDeviceIcon,
    description: 'Review CPU, memory, storage, and machine-readiness signals that affect low-latency performance and host stability.',
    color: 'var(--cds-link-primary)',
    homeSection: 'System',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'qualified-with-waiver',
    kind: 'link',
  },
  {
    to: '/perform',
    label: 'Stage Mode',
    shortLabel: 'Stage',
    icon: MapStagePerformanceIcon,
    description: 'Open the full-screen live-performance surface for fast preset access, bypass control, tempo actions, and stage-focused guitar operation.',
    color: 'var(--cds-support-warning)',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
  },
  {
    to: '/about',
    label: 'Platform Guide',
    shortLabel: 'Guide',
    icon: Info,
    description: 'Open the canonical MAP2 information page for operator orientation, documentation, build identity, support details, and guided next steps.',
    color: 'var(--cds-support-info)',
    homeSection: 'System',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'production',
    kind: 'link',
  },
  {
    to: '/expression',
    label: 'Expression',
    icon: SlidersHorizontal,
    description: 'Configure expression-pedal and MIDI CC mappings that connect external controllers to engine parameters with live visual feedback.',
    color: 'var(--cds-support-info)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
  },
  {
    to: '/presets',
    label: 'Presets',
    icon: SquaresFour,
    description: 'Save, organize, recall, import, and export tone or session states so rigs can be restored quickly and consistently.',
    color: 'var(--cds-support-success)',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
  },
  {
    to: '/plugins',
    label: 'LV2 Plugins',
    icon: Package,
    description: 'Browse the LV2 plugin inventory, inspect what is installed, and manage the effect catalog used across MAP2 workflows.',
    color: 'var(--cds-support-info)',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
  },
  {
    to: '/midi',
    label: 'MIDI',
    icon: MusicNotes,
    description: 'Operate the core MIDI control surface for mappings, commands, devices, activity monitoring, and the broader MAP2 MIDI workflow.',
    color: 'var(--cds-support-error)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
  },
  {
    to: '/midi-hub',
    label: 'MIDI Hub',
    icon: MusicNotes,
    description: 'Run the native MIDI routing and automation hub for ports, scripts, presets, clock, diagnostics, and advanced controller workflows.',
    color: 'var(--cds-support-success)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: true,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
  },
  {
    to: '/mpx1',
    label: 'MPX1 Rack',
    icon: MapRackDeviceIcon,
    description: 'Control the Lexicon MPX-1 from MAP2, including editor access, live program changes, diagnostics, library tasks, and MIDI mapping tools.',
    color: 'var(--cds-link-primary)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: true,
    pinnable: true,
    maturity: 'beta',
    kind: 'mpx1-mega-menu',
    showOnHome: false,
    deviceType: 'lexicon-mpx1',
  },
  {
    to: '/intelfx',
    label: 'IntelFX Rack',
    icon: MapRackDeviceIcon,
    description: 'Control the Rocktron Intellifex from MAP2, including signal flow editing, preset library, MIDI mapping, scenes, and real-time parameter control.',
    color: '#e53935',
    homeSection: 'MIDI',
    includeInAdvancedMenu: true,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'rocktron-intelfx',
  },
  {
    to: '/tesira',
    label: 'Tesira AVB',
    icon: MapMatrixProcessorIcon as ComponentType<any>,
    description: 'Work with Biamp Tesira AVB devices for fleet views, device pages, DSP surfaces, AVB context, and multi-device operational control.',
    color: 'var(--cds-support-error)',
    homeSection: 'AVB',
    includeInAdvancedMenu: true,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'tesira-fleet',
  },
  {
    to: '/nodes',
    label: 'Nodes',
    shortLabel: 'Nodes',
    icon: Network_3,
    description: 'Open the node topology graph, inspect host identity and health, and switch which machine each page is currently viewing.',
    color: 'var(--cds-support-success)',
    homeSection: 'System',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
  },
  {
    to: '/multi-system',
    label: 'Multi-System',
    icon: MapClusterFabricIcon,
    description: 'Compare multiple systems side by side so state differences, host metrics, and distributed rig behavior are visible in one place.',
    color: 'var(--cds-support-info)',
    homeSection: 'System',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
  },
  {
    to: '/juce-grid',
    label: 'Audio Grid',
    shortLabel: 'Audio Grid',
    icon: MapAudioGridIcon,
    description: 'Open the Carbon-first Audio Grid editor for full signal-flow design, routing, automation, snapshots, MIDI mapping, and audio-workflow control.',
    color: 'var(--cds-link-primary)',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: true,
  },
  {
    to: '/library',
    label: 'IR & NAM Library',
    icon: MapPatchLibraryIcon,
    description: 'Browse impulse-response and model-management workflows for acquiring, curating, and testing NAM and IR content in MAP2.',
    color: 'var(--cds-support-info)',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'experimental',
    kind: 'link',
  },
  {
    to: '/lcd',
    label: 'LCD Console',
    icon: Monitor,
    description: 'Access the dedicated LCD console surface for external display and hardware-panel workflows that still depend on qualification evidence.',
    color: 'var(--cds-support-success)',
    homeSection: 'Hardware',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'hardware-blocked',
    kind: 'link',
    gatedReason: 'Requires the dedicated LCD hardware path and qualification evidence before routine use.',
  },
  {
    to: '/hardware-interfaces',
    label: 'Audio Interfaces',
    icon: Usb,
    description: 'Open the audio-interface submenu for interface-specific control pages and connection-state views for supported hardware profiles.',
    color: 'var(--cds-support-info)',
    homeSection: 'Hardware',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'hardware-submenu',
    gatedReason: 'Pages open directly and reflect current connection state instead of being hard-blocked.',
    showOnHome: false,
  },
]

export const navigationCatalogItems = baseNavigationCatalog

export const advancedMenuItems = navigationCatalogItems.filter(
  (item): item is AdvancedMenuItem => item.includeInAdvancedMenu,
)

export const hardwareInterfaceMenuItems: HardwareInterfaceMenuItem[] = [
  {
    to: '/edirol-ua1000',
    label: 'Edirol UA-1000',
    shortLabel: 'UA-1000',
    icon: Usb,
    description: 'Open the Edirol UA-1000 control page to inspect device status and interface-specific audio controls for that hardware path.',
    color: 'var(--cds-link-primary)',
    homeSection: 'Hardware',
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    gatedReason: 'Opens even when the interface is offline; live controls reflect detected UA-1000 hardware.',
    deviceType: 'edirol-ua1000',
  },
  {
    to: '/hotone-jogg',
    label: 'HoTone JoGG',
    shortLabel: 'JoGG',
    icon: Waveform,
    description: 'Open the HoTone JoGG interface page for connection-state visibility and device-specific controls when that interface profile is active.',
    color: 'var(--cds-support-error)',
    homeSection: 'Hardware',
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    gatedReason: 'Opens directly; live status reflects whether the HoTone JoGG is detected on this host.',
    deviceType: 'hotone-jogg',
  },
  {
    to: '/hotone-jogg',
    label: 'Generic Interface',
    shortLabel: 'Generic',
    icon: Waveform,
    description: 'Open the generic interface profile built on the HoTone workflow for fallback, experimental, or profile-based hardware testing.',
    color: 'var(--cds-text-secondary)',
    homeSection: 'Hardware',
    pinnable: false,
    maturity: 'experimental',
    kind: 'link',
    gatedReason: 'Uses the shared HoTone page route for profile experimentation; live hardware state is still shown in-page.',
    deviceType: 'generic-interface',
  },
]

export const homeNavigationItem = navigationCatalogItems.find((item) => item.to === '/') as ShellNavigationItem

const HOME_SECTION_ORDER: NavigationHomeSection[] = ['Audio Grid', 'AVB', 'MIDI', 'System', 'Hardware']

export const homeNavigationTabSections: NavigationSection[] = HOME_SECTION_ORDER.map((title) => {
  const catalogItems = navigationCatalogItems.filter(
    (item) => item.homeSection === title && item.showOnHome !== false,
  )

  if (title === 'Hardware') {
    const hardwareItems = hardwareInterfaceMenuItems.filter((item) => item.showOnHome !== false)
    return {
      title,
      items: [...catalogItems, ...hardwareItems],
    }
  }

  return {
    title,
    items: catalogItems,
  }
})

export const homeNavigationSections: NavigationSection[] = homeNavigationTabSections.filter((section) => section.items.length > 0)

export const allRouteNavigationItems: Array<ShellNavigationItem | HardwareInterfaceMenuItem> = [
  ...navigationCatalogItems.filter((item) => item.to.startsWith('/')),
  ...hardwareInterfaceMenuItems,
]

export const pinnableNavigationItems: Array<ShellNavigationItem | HardwareInterfaceMenuItem> = [
  ...navigationCatalogItems.filter((item) => item.pinnable),
  ...hardwareInterfaceMenuItems.filter((item) => item.pinnable),
]

const PINNED_ROUTE_ALIASES: Record<string, string> = {
  '/welcome': '/about',
  '/grid': '/juce-grid',
  '/grid-3d': '/juce-grid',
  '/overview': '/platform',
  '/avb-routing': '/platform',
  '/midi-cluster': '/platform',
  '/api-observatory': '/platform',
  '/cluster-dashboard': '/platform',
}

export function normalizePinnedRoutes(routes: string[] | null | undefined): string[] {
  if (!routes || routes.length === 0) {
    return []
  }

  const normalized: string[] = []
  const seen = new Set<string>()

  for (const rawRoute of routes) {
    const route = typeof rawRoute === 'string' ? rawRoute.trim() : ''
    const canonicalRoute = PINNED_ROUTE_ALIASES[route] ?? route
    if (!canonicalRoute || !canonicalRoute.startsWith('/') || seen.has(canonicalRoute)) {
      continue
    }
    seen.add(canonicalRoute)
    normalized.push(canonicalRoute)
  }

  return normalized
}
