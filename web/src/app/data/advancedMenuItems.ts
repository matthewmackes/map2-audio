import type { ComponentType } from 'react'
import {
  BareMetalServer,
  Catalog,
  Dashboard,
  Devices as Monitor,
  Home as House,
  Music as MusicNotes,
  Usb,
  Waveform,
} from '@carbon/icons-react'
import {
  MapAudioGridIcon,
  MapMatrixProcessorIcon,
  MapRackDeviceIcon,
  MapStagePerformanceIcon,
} from '../components/icons/map'
import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'
import { platformPinnedItems, type PlatformPinnedNavItem } from './platformMenuItems'

export type NavigationMaturityState = 'production' | 'qualified-with-waiver' | 'beta' | 'experimental' | 'hardware-blocked'
export type NavigationRenderKind = 'link' | 'mpx1-mega-menu' | 'hardware-submenu'
export type NavigationHomeSection = 'Audio Grid' | 'AVB' | 'MIDI' | 'System' | 'Hardware'

export const DEFAULT_NAVIGATION_ALLOWED_STATES: NavigationMaturityState[] = ['production', 'qualified-with-waiver']
export const ADVANCED_NAVIGATION_ALLOWED_STATES: NavigationMaturityState[] = ['beta', 'experimental', 'hardware-blocked']
export const MAX_PINNED_NAV_ITEMS = 4
export const FIXED_START_MENU_TILE_ROUTES = ['/brain', '/juce-grid', '/midi-hub', '/hardware-interfaces'] as const
const FIXED_START_MENU_TILE_ROUTE_SET = new Set<string>(FIXED_START_MENU_TILE_ROUTES)
export const defaultPinnedRoutes: string[] = []

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
  includeInAdvancedMenu?: boolean
  pinnable: boolean
  maturity: NavigationMaturityState
  kind: 'link'
  gatedReason?: string
  showOnHome?: boolean
  showInHardwareSubmenu?: boolean
  deviceType?: string
}

export type AdvancedNavigationItem = AdvancedMenuItem | HardwareInterfaceMenuItem

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
    description: 'Return to the navigation landing page where every MAP2 workflow is explained and available from the desktop shell.',
    color: 'var(--cds-support-warning)',
    homeSection: 'System',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'qualified-with-waiver',
    kind: 'link',
    showOnHome: false,
  },
  {
    to: '/workspace',
    label: 'Workspaces',
    shortLabel: 'Workspaces',
    icon: Dashboard,
    description: 'Open the unified Workspace Hub for platforms, physical surfaces, audio artifacts, and outboard hardware from one integrated operational surface.',
    color: 'var(--cds-support-warning)',
    homeSection: 'System',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    showOnHome: true,
  },
  {
    to: '/brain',
    label: 'Brain',
    shortLabel: 'Brain',
    icon: MusicNotes,
    description: 'Open the Performance Brain workspace for unified triggering, sequencing, routing, input control, library work, and diagnostics.',
    color: 'var(--cds-link-primary)',
    homeSection: 'Audio Grid',
    showOnHome: false,
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
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
    showOnHome: false,
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
  },
  {
    to: '/workspace/artifacts',
    label: 'Audio Artifacts',
    shortLabel: 'Artifacts',
    icon: Catalog,
    description: 'Browse and manage all audio artifacts — LV2 plugins, NAM models, cabinet and reverb IRs, SoundFonts, and native JUCE processors — in a unified node-aware library.',
    color: '#be95ff',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: true,
  },
  {
    // T2482 loop 10 / iter 94 — "MIDI Hub" → "MIDI Services" rename.
    // The route still points at /midi-hub for now; iter 95+ deep-link
    // /midi/connections directly. Iter 100 roll-up documents the
    // operator-facing renames so the change can be flagged in release
    // notes.
    to: '/midi',
    label: 'MIDI Services',
    icon: MusicNotes,
    description: 'Canonical MIDI Services surface — unified authority for MIDI bindings, routing, devices, transport/clock, processing, presets, network, and advanced controller orchestration. Replaces the legacy MIDI Hub mount.',
    color: 'var(--cds-support-success)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: true,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: true,
  },
  {
    to: '/devices',
    label: 'Devices',
    shortLabel: 'Devices',
    icon: Monitor,
    description: 'Unified landing for every hardware unit and control surface on this stack — processors, audio interfaces, consoles, and planned surfaces in one grid.',
    color: 'var(--cds-link-primary)',
    homeSection: 'Hardware',
    includeInAdvancedMenu: true,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'devices-overview',
  },
  {
    to: HOST_MACHINE_ROUTE,
    label: 'Host Machine',
    shortLabel: 'Host',
    icon: BareMetalServer,
    description: 'Open hardware posture, storage health, services, and interface readiness for the active MAP2 host context.',
    color: 'var(--cds-support-warning)',
    homeSection: 'Hardware',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
  },
  {
    to: '/state-authority',
    label: 'State Authority',
    shortLabel: 'State',
    icon: Waveform,
    description: 'Tonechaser workspace — A/B/C/D morph pad, canonical URI catalog block picker, and live reconciliation metrics for the State Authority control plane.',
    color: 'var(--cds-link-primary)',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: true,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
  },
  {
    // T2485-8 — Push Surface; sidebar entry retired (operator finds it via /midi/devices/ableton-push-3 or homepage MIDI section).
    to: '/labs/push-surface',
    label: 'Push Surface',
    shortLabel: 'Push',
    icon: MusicNotes,
    description: 'Program Ableton Push mappings, layers, welcome routines, live feedback, and advanced control-surface behavior from a dedicated Labs route.',
    color: 'var(--cds-link-primary)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'ableton-push',
  },
  {
    // T2485-8 — MCU; sidebar entry retired.
    to: '/mcu',
    label: 'MCU Pro',
    shortLabel: 'MCU',
    icon: MusicNotes,
    description: 'Open the dedicated Mackie MCU Pro editor for connection posture, fader-bank preview, scribble strips, parameter-page browsing, and transport status.',
    color: 'var(--cds-support-info)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'mackie-mcu-pro',
  },
  {
    // T2485-8 — Launch Control; sidebar entry retired.
    to: '/launch-control',
    label: 'Launch Control',
    shortLabel: 'Launch',
    icon: MusicNotes,
    description: 'Open the dedicated Novation Launch Control editor for connection posture, template status, live mapping review, and LED override editing.',
    color: 'var(--cds-support-success)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'novation-launch-control',
  },
  {
    // T2485-8 — MIDI Commander; sidebar entry retired.
    to: '/midi-commander',
    label: 'MIDI Commander',
    shortLabel: 'Commander',
    icon: MusicNotes,
    description: 'Open the dedicated MeloAudio MIDI Commander editor for connection posture, manual setup guidance, and per-button or expression assignment editing.',
    color: 'var(--cds-support-warning)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'meloaudio-midi-commander',
  },
  {
    // T2485-8 — MPX1; sidebar entry retired AND mega-menu kind retired
    // (kind: 'mpx1-mega-menu' → 'link'). The unified /midi/devices/lexicon-mpx1
    // mount is the canonical authoring path now.
    // Route flipped to the new canonical /midi/devices/lexicon-mpx1/panel
    // so launcher / homepage cards point at the unified mount; the legacy
    // /mpx1 path still hard-redirects there from App.tsx.
    to: '/midi/devices/lexicon-mpx1/panel',
    label: 'MPX1 Rack',
    icon: MapRackDeviceIcon,
    description: 'Control the Lexicon MPX-1 from MAP2, including editor access, live program changes, diagnostics, library tasks, and MIDI mapping tools.',
    color: 'var(--cds-link-primary)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'lexicon-mpx1',
  },
  {
    // T2485-8 — IntelFX; sidebar entry retired. Route flipped to unified mount.
    to: '/midi/devices/rocktron-intelfx/panel',
    label: 'IntelFX Rack',
    icon: MapRackDeviceIcon,
    description: 'Control the Rocktron Intellifex from MAP2, including signal flow editing, preset library, MIDI mapping, scenes, and real-time parameter control.',
    color: '#e53935',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'rocktron-intelfx',
  },
  {
    to: '/ground-control-pro',
    label: 'Ground Control Pro',
    shortLabel: 'GCP',
    icon: MusicNotes,
    description: 'Import, diff, validate, back up, and transmit full-memory SysEx dumps for the Voodoo Lab Ground Control Pro.',
    color: 'var(--cds-support-info)',
    homeSection: 'MIDI',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    showOnHome: false,
    deviceType: 'ground-control-pro',
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
    to: '/juce-grid',
    label: 'Audio Grid',
    shortLabel: 'Audio Grid',
    icon: MapAudioGridIcon,
    description: 'Open Audio Grid to build signal flow, set routing, save snapshots, map MIDI, and control audio work from one editor.',
    color: 'var(--cds-link-primary)',
    homeSection: 'Audio Grid',
    includeInAdvancedMenu: false,
    pinnable: true,
    maturity: 'beta',
    kind: 'link',
    showOnHome: true,
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
    showOnHome: false,
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

export const hardwareInterfaceMenuItems: HardwareInterfaceMenuItem[] = [
  {
    to: '/maschine',
    label: 'Maschine MK1',
    shortLabel: 'Maschine',
    icon: MusicNotes,
    description: 'Open the Maschine MK1 control page for daemon connectivity, encoder ownership, LCD simulation, LED state, HID traffic, and firmware diagnostics.',
    color: 'var(--cds-support-success)',
    homeSection: 'Hardware',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    gatedReason: 'Opens directly; live status still reflects whether the Maschine daemon and HID path are currently online.',
    showOnHome: false,
    showInHardwareSubmenu: false,
    deviceType: 'maschine-mk1',
  },
  {
    to: '/maschine/midi-map',
    label: 'Maschine MIDI Map',
    shortLabel: 'MIDI Map',
    icon: MusicNotes,
    description: 'Configure MIDI assignments for every pad, button, and encoder on the Maschine MK1. Test LEDs, set velocity curves, and save as unit default.',
    color: 'var(--cds-support-success)',
    homeSection: 'Hardware',
    includeInAdvancedMenu: false,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    gatedReason: 'Opens directly; requires daemon connection for hardware testing.',
    showOnHome: false,
    showInHardwareSubmenu: false,
    deviceType: 'maschine-mk1',
  },
  {
    to: '/edirol-ua1000',
    label: 'Edirol UA-1000',
    shortLabel: 'UA-1000',
    icon: Usb,
    description: 'Open the Edirol UA-1000 control page to inspect device status and interface-specific audio controls for that hardware path.',
    color: 'var(--cds-link-primary)',
    homeSection: 'Hardware',
    includeInAdvancedMenu: true,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    gatedReason: 'Opens even when the interface is offline; live controls reflect detected UA-1000 hardware.',
    showOnHome: false,
    showInHardwareSubmenu: false,
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
    includeInAdvancedMenu: true,
    pinnable: false,
    maturity: 'beta',
    kind: 'link',
    gatedReason: 'Opens directly; live status reflects whether the HoTone JoGG is detected on this host.',
    showOnHome: false,
    showInHardwareSubmenu: false,
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
    showOnHome: false,
    deviceType: 'generic-interface',
  },
]

export const advancedMenuItems: AdvancedNavigationItem[] = [
  ...navigationCatalogItems.filter(
    (item): item is AdvancedMenuItem => item.includeInAdvancedMenu,
  ),
  ...hardwareInterfaceMenuItems.filter((item) => item.includeInAdvancedMenu),
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

export const allPinnableNavigationItems: Array<ShellNavigationItem | HardwareInterfaceMenuItem | PlatformPinnedNavItem> = [
  ...pinnableNavigationItems,
  ...platformPinnedItems,
]

const PINNABLE_ROUTE_SET = new Set(allPinnableNavigationItems.map((item) => item.to))

export const PINNED_ROUTE_ALIASES: Record<string, string> = {
  '/welcome': '/platforms/about',
  '/grid': '/juce-grid',
  '/grid-3d': '/juce-grid',
  '/nodes': '/workspace',
  '/multi-system': '/workspace',
  '/overview': '/workspace',
  '/platform': '/workspace',
  '/platforms/overview': '/workspace',
  '/about': '/platforms/about',
  '/theme': '/platforms/theme',
  '/midpoint': '/platforms/midpoint',
  '/host-machine': HOST_MACHINE_ROUTE,
  '/platforms/host-machine': HOST_MACHINE_ROUTE,
  '/workspace/platforms/host-machine': HOST_MACHINE_ROUTE,
  '/workspace/platforms/midpoint': '/platforms/midpoint',
  '/engine': '/platforms/audio-engine',
  '/avb-routing': '/platforms/avb-routing',
  '/midi-cluster': '/midi-hub/connections',
  '/cluster-dashboard': '/platforms/cluster-dashboard',
  '/plugins': '/workspace/artifacts',
  '/library': '/workspace/artifacts',
  '/audio-artifacts': '/workspace/artifacts',
  '/artifacts': '/workspace/artifacts',
  '/physical-surfaces': '/devices',
  '/outboard-hardware': '/devices',
  '/workspace/physical-surfaces': '/devices',
  '/workspace/outboard-hardware': '/devices',
  '/midi': '/midi-hub',
  'platform:layer:overview': '/workspace',
  'platform:layer:single-node': '/platforms/management',
  'platform:layer:management': '/platforms/management',
  'platform:layer:avb-routing': '/platforms/avb-routing',
  'platform:layer:midi-cluster': '/midi-hub/connections',
  'platform:layer:network-discovery': '/platforms/network-discovery',
  'platform:layer:cluster-dashboard': '/platforms/cluster-dashboard',
  'platform:panel:host-machine': HOST_MACHINE_ROUTE,
  'platform:panel:audio-engine': '/platforms/audio-engine',
  'platform:panel:api-webhooks': '/platforms/midpoint',
  'platform:panel:midpoint': '/platforms/midpoint',
  'platform:panel:theme': '/platforms/theme',
  'platform:panel:about': '/platforms/about',
  '/platforms/api-webhooks': '/platforms/midpoint',
  '/workspace/platforms/api-webhooks': '/workspace/platforms/midpoint',
}

export const pinnableNavigationItemsByRoute = new Map(
  allPinnableNavigationItems.map((item) => [item.to, item] as const),
)

export function canonicalizeNavigationRoute(route: string): string {
  return PINNED_ROUTE_ALIASES[route] ?? route
}

export function findPinnableNavigationItem(
  route: string | null | undefined,
): ShellNavigationItem | HardwareInterfaceMenuItem | PlatformPinnedNavItem | null {
  if (!route) {
    return null
  }

  return pinnableNavigationItemsByRoute.get(canonicalizeNavigationRoute(route)) ?? null
}

export function normalizePinnedRoutes(routes: string[] | null | undefined): string[] {
  if (!routes || routes.length === 0) {
    return []
  }

  const normalized: string[] = []
  const seen = new Set<string>()

  for (const rawRoute of routes) {
    const route = typeof rawRoute === 'string' ? rawRoute.trim() : ''
    const canonicalRoute = canonicalizeNavigationRoute(route)
    if (!canonicalRoute || !PINNABLE_ROUTE_SET.has(canonicalRoute) || FIXED_START_MENU_TILE_ROUTE_SET.has(canonicalRoute) || seen.has(canonicalRoute)) {
      continue
    }
    seen.add(canonicalRoute)
    normalized.push(canonicalRoute)
  }

  return normalized
}
