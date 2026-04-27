/**
 * @deprecated T2459-G11. The /devices storefront is now driven by the
 * profile-registry-backed HardwareStorePage. This hand-coded registry
 * remains only because GlobalTreeNav still uses it for the left-rail
 * pinned-device list; that migration is queued as T2459-G11b.
 *
 * DO NOT add new entries here. New devices ship as profile YAML under
 * device-packs/<vendor>/profiles/ and surface automatically in the
 * Hardware Store.
 *
 * Original purpose (kept for context until G11b lands):
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

export interface DeviceTransportLayer {
  id: string
  label: string
  /** One-word status: 'online', 'detected', 'planned'. */
  status: 'online' | 'detected' | 'planned' | 'offline'
}

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
  /** Short eyebrow (family / category) rendered above the card title. */
  eyebrow: string
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
  /**
   * Key passed to `useDeviceNodeContext()` + `<DeviceContextBanner deviceKey={...} />`.
   * Only set for devices that resolve through the node-scoped device context system
   * (hardware interfaces and processors); control surfaces manage presence separately.
   */
  deviceContextKey?: string
  /** Capability chips shown on the hero card. */
  capabilities: string[]
  /** Transport layers rendered beneath the capability row. */
  transportLayers: DeviceTransportLayer[]
  /** One line under the card title above the hero image. */
  currentViewLabel: string
  /** Optional host-observation note shown once per overview (first match wins). */
  hostObservation?: string
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
  { id: 'presets', label: 'Presets', color: '#f97316', icon: Settings },
  { id: 'snapshots', label: 'Snapshots', color: '#14b8a6', icon: Connect },
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
    eyebrow: 'mpx1',
    description: 'Lexicon MPX-1 rack multi-effects processor with 601-parameter registry, editor, library, MIDI mapping, and diagnostics.',
    currentViewLabel: 'Panel',
    defaultView: 'panel',
    views: MPX1_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'lexicon-mpx1' },
    kind: 'processor',
    legacyRoute: '/mpx1',
    deviceContextKey: 'lexicon-mpx1',
    capabilities: ['601-parameter editor', 'Scenes & morph', 'MIDI SysEx', 'Library & .syx import'],
    transportLayers: [
      { id: 'midi-sysex', label: 'MIDI SysEx', status: 'online' },
      { id: 'realtime-params', label: 'Realtime parameter control', status: 'online' },
    ],
  },
  {
    id: 'intelfx',
    label: 'Rocktron IntelliFex',
    shortLabel: 'IntelFX',
    icon: Waveform,
    color: '#f59e0b',
    eyebrow: 'intelfx',
    description: 'Rocktron IntelliFex rack-mount guitar multi-effects — signal-flow editor, preset library, scenes, and realtime parameter work.',
    currentViewLabel: 'Panel',
    defaultView: 'panel',
    views: INTELFX_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'rocktron-intelfx' },
    kind: 'processor',
    legacyRoute: '/intelfx',
    deviceContextKey: 'rocktron-intelfx',
    capabilities: ['Signal-flow editor', 'Preset library', 'MIDI mapping', 'Monitor views'],
    transportLayers: [
      { id: 'midi-sysex', label: 'MIDI SysEx', status: 'online' },
      { id: 'realtime-params', label: 'Realtime parameter control', status: 'online' },
    ],
  },
  {
    id: 'tesira',
    label: 'Biamp Tesira',
    shortLabel: 'Tesira',
    icon: Network_3,
    color: '#38bdf8',
    eyebrow: 'biamp-tesira',
    description: 'Biamp Tesira AVB-Enterprise DSP — fleet supervision, AVB topology, DSP blocks, presets, and deployment posture.',
    currentViewLabel: 'Dashboard',
    defaultView: 'dashboard',
    views: TESIRA_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'biamp-tesira' },
    kind: 'processor',
    legacyRoute: '/tesira',
    deviceContextKey: 'biamp-tesira',
    capabilities: ['Fleet health', 'DSP block editing', 'AVB topology', 'Preset workflows'],
    transportLayers: [
      { id: 'ttp-ssh', label: 'TTP / SSH control', status: 'online' },
      { id: 'avb-transport', label: 'AVB transport', status: 'online' },
      { id: 'preset-orch', label: 'Preset orchestration', status: 'detected' },
    ],
  },
  {
    id: 'edirol-ua1000',
    label: 'Edirol UA-1000',
    shortLabel: 'UA-1000',
    icon: Music,
    color: '#14b8a6',
    eyebrow: 'edirol-ua1000',
    description: 'Roland/Edirol UA-1000 USB 2.0 10-in/10-out audio interface — latency posture, clocking, routing, and diagnostics.',
    currentViewLabel: 'Overview',
    defaultView: 'overview',
    views: EDIROL_UA1000_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'edirol-ua1000' },
    kind: 'audio-interface',
    legacyRoute: '/edirol-ua1000',
    deviceContextKey: 'edirol-ua1000',
    capabilities: ['Runtime status', 'Latency posture', 'Clocking', 'Host visibility'],
    transportLayers: [
      { id: 'usb-audio', label: 'USB audio', status: 'online' },
      { id: 'alsa-pipewire', label: 'ALSA / PipeWire', status: 'online' },
    ],
  },
  {
    id: 'hotone-jogg',
    label: 'HoTone JoGG',
    shortLabel: 'JoGG',
    icon: Music,
    color: '#818cf8',
    eyebrow: 'hotone-jogg',
    description: 'HoTone JoGG portable USB audio interface — host detection, profile-aware status, and interface controls.',
    currentViewLabel: 'Overview',
    defaultView: 'overview',
    views: HOTONE_JOGG_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'hotone-jogg' },
    kind: 'audio-interface',
    legacyRoute: '/hotone-jogg',
    deviceContextKey: 'hotone-jogg',
    capabilities: ['Runtime detection', 'Profile-specific controls', 'Host status'],
    transportLayers: [
      { id: 'usb-audio', label: 'USB audio', status: 'online' },
      { id: 'host-profile', label: 'Host profile detection', status: 'detected' },
    ],
  },
  {
    id: 'lcd',
    label: 'LCD Console',
    shortLabel: 'LCD',
    icon: ScreenMap,
    color: '#22c55e',
    eyebrow: 'lcd-console',
    description: 'MAP2 on-site LCD console — displays, events, nodes, alerts, and hardware settings.',
    currentViewLabel: 'Displays',
    defaultView: 'displays',
    views: LCD_VIEWS,
    statusSource: { kind: 'device-location', deviceKey: 'lcd-console' },
    deviceContextKey: 'lcd-console',
    kind: 'console',
    legacyRoute: '/lcd',
    capabilities: ['Display surfaces', 'Event feed', 'Node alerts', 'Hardware settings'],
    transportLayers: [
      { id: 'lcd-bridge', label: 'On-site LCD bridge', status: 'detected' },
    ],
  },

  // --- Control surfaces (physical performers)
  {
    id: 'maschine-mk1',
    label: 'Native Instruments Maschine MK1',
    shortLabel: 'Maschine',
    icon: Terminal,
    color: '#ec4899',
    eyebrow: 'maschine',
    description: 'Maschine daemon is registered and the enriched surface path is online through usb-bulk.',
    currentViewLabel: 'Primary Synth Parameters',
    defaultView: 'overview',
    legacyRoute: '/maschine',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'physical-surface', surfaceId: 'maschine-mk1' },
    kind: 'control-surface',
    capabilities: ['pads', 'encoders', 'transport', 'group buttons'],
    transportLayers: [
      { id: 'alsa-midi', label: 'ALSA MIDI', status: 'online' },
      { id: 'vendor-usb', label: 'Vendor USB feedback', status: 'online' },
    ],
    hostObservation: 'Current host sees Maschine as Native Instruments 17cc:0808 on snd-usb-caiaq with MIDI exposure but no PCM stream; existing MK1 daemon expects hidapi, so LCD/LED enrichment needs a shared vendor-transport path.',
  },
  {
    id: 'ableton-push',
    label: 'Ableton Push',
    shortLabel: 'Push',
    icon: Terminal,
    color: '#8d8d8d',
    eyebrow: 'push',
    description: 'No Push-class device is currently active.',
    currentViewLabel: 'Synth Grid',
    defaultView: 'overview',
    legacyRoute: '/labs/push-surface',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'planned' },
    kind: 'control-surface',
    capabilities: ['pads', 'encoders', 'display feedback', 'button feedback'],
    transportLayers: [
      { id: 'midihub-bridge', label: 'MidiHub device bridge', status: 'planned' },
      { id: 'display-light', label: 'Display and light renderer', status: 'planned' },
    ],
  },
  {
    id: 'ground-control-pro',
    label: 'Voodoo Lab Ground Control Pro',
    shortLabel: 'GCP',
    icon: Terminal,
    color: '#f97316',
    eyebrow: 'ground-control-pro',
    description: 'Ground Control Pro exposes 3 input(s) and 2 output(s) for the shared SysEx branch.',
    currentViewLabel: 'Snapshot Recall',
    defaultView: 'overview',
    legacyRoute: '/ground-control-pro',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'physical-surface', surfaceId: 'ground-control-pro' },
    kind: 'control-surface',
    capabilities: ['full-memory SysEx backup', 'structured validation', 'safe retransmit', 'transport selection'],
    transportLayers: [
      { id: 'sysex-imex', label: 'SysEx import/export', status: 'detected' },
      { id: 'port-transport', label: 'Port transport', status: 'detected' },
    ],
  },
  {
    id: 'meloaudio-midi-commander',
    label: 'MeloAudio MIDI Commander',
    shortLabel: 'MIDI Cmd',
    icon: Terminal,
    color: '#a78bfa',
    eyebrow: 'meloaudio',
    description: 'No matching hardware is currently visible on this host.',
    currentViewLabel: 'Synth Macros',
    defaultView: 'overview',
    legacyRoute: '/midi-commander',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'planned' },
    kind: 'control-surface',
    capabilities: ['footswitches', 'expression pedals', 'profile-based mapping', 'calibration'],
    transportLayers: [
      { id: 'profile-midi', label: 'Profile-driven MIDI mapping', status: 'planned' },
    ],
  },
  {
    id: 'novation-launch-control',
    label: 'Novation Launch Control Family',
    shortLabel: 'Launch',
    icon: Terminal,
    color: '#22c55e',
    eyebrow: 'launch-control',
    description: 'No matching hardware is currently visible on this host.',
    currentViewLabel: 'Synth Macros',
    defaultView: 'overview',
    legacyRoute: '/launch-control',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'planned' },
    kind: 'control-surface',
    capabilities: ['knobs', 'pads/buttons', 'LED feedback', 'template-driven MIDI control'],
    transportLayers: [
      { id: 'profile-midi', label: 'Profile-driven MIDI mapping', status: 'planned' },
      { id: 'pad-feedback', label: 'Pad and button feedback', status: 'planned' },
    ],
  },
  {
    id: 'mackie-mcu-pro',
    label: 'Mackie MCU Pro',
    shortLabel: 'MCU',
    icon: Terminal,
    color: '#14b8a6',
    eyebrow: 'mcu-pro',
    description: 'No matching hardware is currently visible on this host.',
    currentViewLabel: 'Current View Mix',
    defaultView: 'overview',
    legacyRoute: '/mcu',
    views: CONTROL_SURFACE_PLANNED_VIEWS,
    statusSource: { kind: 'planned' },
    kind: 'control-surface',
    capabilities: ['motor faders', 'VPots', 'transport', 'scribble strips'],
    transportLayers: [
      { id: 'mcu-protocol', label: 'MCU protocol', status: 'planned' },
      { id: 'motor-display', label: 'Motor and display feedback', status: 'planned' },
    ],
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

/**
 * Resolve the route that should open when a user clicks a device's hero tile.
 *
 * Devices that have a first-class unified Devices-shell route (the six hardware
 * entries mounted under `/devices/*` in App.tsx) use `buildDeviceRoute` so they
 * land in the shared shell. Devices that don't yet have a unified route — today
 * that's every control-surface registry entry — fall back to their legacy
 * standalone route (`/maschine`, `/labs/push-surface`, etc.). Without this
 * fallback, clicking a control-surface hero resolves to an un-registered
 * `/devices/<id>/<defaultView>` URL and nothing opens.
 */
export function resolveDeviceOpenRoute(deviceId: string): string {
  const device = getDeviceEntry(deviceId)
  if (!device) return buildDeviceRoute(deviceId)
  if (device.kind === 'control-surface' && device.legacyRoute) {
    return device.legacyRoute
  }
  return buildDeviceRoute(deviceId)
}
