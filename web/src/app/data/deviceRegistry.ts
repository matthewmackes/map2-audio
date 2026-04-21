/**
 * Device Registry — canonical catalog of all hardware devices and control
 * surfaces managed by the platform. Consumed by the Unified Devices view
 * (T2420) to drive a single `/devices` shell + sidebar + grid overview.
 *
 * This is the Phase 1 foundation (T2420-subA): the registry is additive and
 * not yet wired into any shell. Subsequent phases wire `DevicesShell`,
 * `DevicesOverview`, `DeviceContextBridge`, and `DeviceViewRouter`.
 *
 * Source of truth for:
 *  - which devices appear in the sidebar + overview grid
 *  - each device's flattened sub-view list (replaces per-device
 *    `SIDEBAR_SECTIONS` arrays inside page files)
 *  - status detection endpoint / hook key
 *
 * When adding a device: append to DEVICE_REGISTRY below, include `views[]`,
 * set `defaultView`, and declare `status` for the landing-grid badge.
 */

import type { ComponentType } from 'react'
import {
  Activity,
  Book,
  Branch,
  Categories,
  Connect,
  Dashboard,
  Devices as DevicesIcon,
  Equalizer,
  HeatMap,
  Information,
  Music,
  Network_3,
  Play,
  Renew,
  ScreenMap,
  Settings,
  SettingsAdjust,
  Terminal,
  VolumeUp,
  WarningAlt,
  Waveform,
} from '@carbon/icons-react'

type DeviceIcon = ComponentType<any>

export interface DeviceView {
  /** Stable view id (used in URL: `/devices/:deviceId/:view`). */
  id: string
  /** Sidebar label. */
  label: string
  /** Sidebar icon. */
  icon: DeviceIcon
  /** Accent color for the sub-view chip. */
  color: string
}

export type DeviceStatusKind =
  | 'online'
  | 'detected'
  | 'offline'
  | 'planned'
  | 'unknown'

export type DeviceStatusSource =
  /** Use `useDeviceLocation(key)` from `useDeviceLocation.ts` — primarily audio interfaces and processors. */
  | { kind: 'device-location'; deviceKey: string | string[] }
  /** Use `enrichedPhysicalSurfacesApi.getSummary()` — primarily physical control surfaces. */
  | { kind: 'physical-surface'; surfaceId: string }
  /** Device is declared but no live detection is performed (planned/placeholder). */
  | { kind: 'planned' }

export interface DeviceRegistryEntry {
  /** URL slug: `/devices/:deviceId`. */
  id: string
  /** Long human label for cards + dialogs. */
  label: string
  /** Short sidebar-safe label. */
  shortLabel: string
  /** Card + sidebar icon. */
  icon: DeviceIcon
  /** Accent color for the device's card + sidebar row. */
  color: string
  /** One-sentence description for the card tile. */
  description: string
  /** Sub-view id to land on when navigating to `/devices/:deviceId`. */
  defaultView: string
  /** Flattened sub-views that appear as indented children under this device in the sidebar. */
  views: DeviceView[]
  /** How to determine live status for the overview grid badge. */
  statusSource: DeviceStatusSource
  /** Taxonomy hint: used to group cards in the overview grid (audio/processor/surface). */
  kind: 'audio-interface' | 'processor' | 'console' | 'control-surface'
  /** Optional legacy route — used by `App.tsx` redirect shim during migration. */
  legacyRoute?: string
}

// =============================================================================
// Hardware devices (audio interfaces, processors, consoles)
// =============================================================================

const MPX1_VIEWS: DeviceView[] = [
  { id: 'panel', label: 'Panel', color: '#38bdf8', icon: Categories },
  { id: 'editor', label: 'Editor', color: '#f59e0b', icon: SettingsAdjust },
  { id: 'midi-map', label: 'MIDI Mapper', color: '#ec4899', icon: Music },
  { id: 'matrix', label: 'Mod Matrix', color: '#22c55e', icon: Waveform },
  { id: 'library', label: 'Library', color: '#a78bfa', icon: Book },
  { id: 'perform', label: 'Perform', color: '#f97316', icon: Play },
  { id: 'diag', label: 'Diagnostics', color: '#14b8a6', icon: Activity },
  { id: 'flow', label: 'Signal Flow', color: '#818cf8', icon: Branch },
]

const INTELFX_VIEWS: DeviceView[] = [
  { id: 'panel', label: 'Panel', color: '#38bdf8', icon: Dashboard },
  { id: 'editor', label: 'Editor', color: '#f59e0b', icon: SettingsAdjust },
  { id: 'midi-map', label: 'MIDI Mapper', color: '#ec4899', icon: Music },
  { id: 'library', label: 'Library', color: '#a78bfa', icon: Book },
  { id: 'perform', label: 'Perform', color: '#f97316', icon: Play },
  { id: 'diag', label: 'Diagnostics', color: '#14b8a6', icon: WarningAlt },
  { id: 'flow', label: 'Signal Flow', color: '#818cf8', icon: Branch },
]

const TESIRA_VIEWS: DeviceView[] = [
  { id: 'dashboard', label: 'Dashboard', color: '#38bdf8', icon: Dashboard },
  { id: 'design', label: 'Design', color: '#a78bfa', icon: Branch },
  { id: 'dsp', label: 'DSP', color: '#22c55e', icon: Waveform },
  { id: 'levels', label: 'Levels', color: '#f59e0b', icon: VolumeUp },
  { id: 'mixer', label: 'Mixer', color: '#ec4899', icon: HeatMap },
  { id: 'eq', label: 'EQ', color: '#818cf8', icon: Equalizer },
  { id: 'presets', label: 'Presets', color: '#f97316', icon: Book },
  { id: 'avb', label: 'AVB', color: '#14b8a6', icon: Network_3 },
  { id: 'faults', label: 'Faults', color: '#da1e28', icon: WarningAlt },
  { id: 'loops', label: 'Loops', color: '#ff8389', icon: Renew },
  { id: 'settings', label: 'Settings', color: '#8d8d8d', icon: Settings },
  { id: 'firmware', label: 'Firmware', color: '#bebebe', icon: Information },
]

const EDIROL_UA1000_VIEWS: DeviceView[] = [
  { id: 'overview', label: 'Overview', color: '#38bdf8', icon: Music },
  { id: 'routing', label: 'Routing', color: '#a78bfa', icon: Branch },
  { id: 'clocking', label: 'Clocking', color: '#14b8a6', icon: Renew },
  { id: 'diag', label: 'Diagnostics', color: '#f59e0b', icon: Activity },
]

const HOTONE_JOGG_VIEWS: DeviceView[] = [
  { id: 'overview', label: 'Overview', color: '#38bdf8', icon: Music },
]

const LCD_VIEWS: DeviceView[] = [
  { id: 'displays', label: 'Displays', color: '#38bdf8', icon: ScreenMap },
  { id: 'events', label: 'Events', color: '#f59e0b', icon: Activity },
  { id: 'nodes', label: 'Nodes', color: '#22c55e', icon: Connect },
  { id: 'alerts', label: 'Alerts', color: '#da1e28', icon: WarningAlt },
  { id: 'hardware', label: 'Hardware', color: '#a78bfa', icon: DevicesIcon },
  { id: 'settings', label: 'Settings', color: '#8d8d8d', icon: Settings },
]

// =============================================================================
// Control surfaces (physical MIDI-based performers)
// =============================================================================

const CONTROL_SURFACE_PLANNED_VIEWS: DeviceView[] = [
  { id: 'overview', label: 'Overview', color: '#38bdf8', icon: Terminal },
]

// =============================================================================
// Registry
// =============================================================================

export const DEVICE_REGISTRY: DeviceRegistryEntry[] = [
  // --- Hardware devices
  {
    id: 'mpx1',
    label: 'Lexicon MPX-1',
    shortLabel: 'MPX1',
    icon: Waveform,
    color: '#a78bfa',
    description: 'Lexicon MPX-1 rack multi-effects processor with 601-parameter registry.',
    defaultView: 'panel',
    views: MPX1_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'lexicon-mpx1' },
    kind: 'processor',
    legacyRoute: '/mpx1',
  },
  {
    id: 'intelfx',
    label: 'Rocktron IntelliFex',
    shortLabel: 'IntelFX',
    icon: Waveform,
    color: '#f59e0b',
    description: 'Rocktron IntelliFex rack-mount guitar multi-effects.',
    defaultView: 'panel',
    views: INTELFX_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'rocktron-intelfx' },
    kind: 'processor',
    legacyRoute: '/intelfx',
  },
  {
    id: 'tesira',
    label: 'Biamp Tesira',
    shortLabel: 'Tesira',
    icon: Network_3,
    color: '#38bdf8',
    description: 'Biamp Tesira AVB-Enterprise DSP — 12 managed views.',
    defaultView: 'dashboard',
    views: TESIRA_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'biamp-tesira' },
    kind: 'processor',
    legacyRoute: '/tesira',
  },
  {
    id: 'edirol-ua1000',
    label: 'Edirol UA-1000',
    shortLabel: 'UA-1000',
    icon: Music,
    color: '#14b8a6',
    description: 'Roland/Edirol UA-1000 USB 2.0 10-in/10-out audio interface.',
    defaultView: 'overview',
    views: EDIROL_UA1000_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'edirol-ua1000' },
    kind: 'audio-interface',
    legacyRoute: '/edirol-ua1000',
  },
  {
    id: 'hotone-jogg',
    label: 'HoTone JoGG',
    shortLabel: 'JoGG',
    icon: Music,
    color: '#818cf8',
    description: 'HoTone JoGG portable USB audio interface.',
    defaultView: 'overview',
    views: HOTONE_JOGG_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'hotone-jogg' },
    kind: 'audio-interface',
    legacyRoute: '/hotone-jogg',
  },
  {
    id: 'lcd',
    label: 'LCD Console',
    shortLabel: 'LCD',
    icon: ScreenMap,
    color: '#22c55e',
    description: 'MAP2 on-site LCD console — displays, events, nodes, alerts.',
    defaultView: 'displays',
    views: LCD_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'lcd-console' },
    kind: 'console',
    legacyRoute: '/lcd',
  },

  // --- Control surfaces (physical performers)
  {
    id: 'maschine-mk1',
    label: 'NI Maschine MK1',
    shortLabel: 'Maschine',
    icon: Terminal,
    color: '#ec4899',
    description: 'Native Instruments Maschine MK1 — primary headless control surface.',
    defaultView: 'overview',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'physical-surface', surfaceId: 'maschine-mk1' },
    kind: 'control-surface',
  },
  {
    id: 'ableton-push',
    label: 'Ableton Push',
    shortLabel: 'Push',
    icon: Terminal,
    color: '#8d8d8d',
    description: 'Ableton Push — grid control surface (planned).',
    defaultView: 'overview',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'planned' },
    kind: 'control-surface',
  },
  {
    id: 'ground-control-pro',
    label: 'Voodoo Lab Ground Control Pro',
    shortLabel: 'GCP',
    icon: Terminal,
    color: '#f97316',
    description: 'Voodoo Lab Ground Control Pro MIDI foot controller.',
    defaultView: 'overview',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'physical-surface', surfaceId: 'ground-control-pro' },
    kind: 'control-surface',
  },
  {
    id: 'meloaudio-midi-commander',
    label: 'MeloAudio MIDI Commander',
    shortLabel: 'MIDI Cmd',
    icon: Terminal,
    color: '#a78bfa',
    description: 'MeloAudio MIDI Commander foot controller (planned).',
    defaultView: 'overview',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'planned' },
    kind: 'control-surface',
  },
  {
    id: 'novation-launch-control',
    label: 'Novation Launch Control',
    shortLabel: 'Launch',
    icon: Terminal,
    color: '#22c55e',
    description: 'Novation Launch Control MIDI surface (planned).',
    defaultView: 'overview',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'planned' },
    kind: 'control-surface',
  },
  {
    id: 'mackie-mcu-pro',
    label: 'Mackie MCU Pro',
    shortLabel: 'MCU',
    icon: Terminal,
    color: '#14b8a6',
    description: 'Mackie Universal Control Pro motorized fader surface (planned).',
    defaultView: 'overview',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'planned' },
    kind: 'control-surface',
  },
]

/** Look up a registry entry by id. Returns `null` if not found. */
export function getDeviceEntry(id: string): DeviceRegistryEntry | null {
  return DEVICE_REGISTRY.find((entry) => entry.id === id) ?? null
}

/** Look up a sub-view on a device by id. Returns `null` if either is not found. */
export function getDeviceView(
  deviceId: string,
  viewId: string,
): { device: DeviceRegistryEntry; view: DeviceView } | null {
  const device = getDeviceEntry(deviceId)
  if (!device) return null
  const view = device.views.find((v) => v.id === viewId)
  if (!view) return null
  return { device, view }
}

/** Build the canonical URL `/devices/:deviceId/:view` for a (device, view) pair. */
export function buildDeviceRoute(deviceId: string, viewId?: string | null): string {
  const device = getDeviceEntry(deviceId)
  const view = viewId ?? device?.defaultView ?? 'overview'
  return `/devices/${deviceId}/${view}`
}
