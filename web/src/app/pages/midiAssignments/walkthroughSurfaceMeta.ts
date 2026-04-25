/**
 * Walkthrough surface metadata overlay.
 *
 * Per Q3: surface list comes from the live device registry (enrichedPhysicalSurfaces),
 * but the wizard wants extra visual data — accent color and a controller schematic
 * (pad/knob/encoder/fader/footswitch/pedal counts) — that the registry doesn't carry.
 *
 * This module is a tiny overlay keyed by surface id. Surfaces present here render
 * a rich, hand-tuned schematic; surfaces not present here fall through to a generic
 * schematic derived from their declared capabilities.
 */

export interface SurfaceSchematic {
  pads?: number
  knobs?: number
  encoders?: number
  faders?: number
  footswitches?: number
  pedals?: number
  transport?: number
}

export interface WalkthroughSurfaceMeta {
  /** Hex accent color used to tint the wizard. */
  color: string
  /** Short label for chips, status rows, summaries. */
  shortLabel: string
  /** Eyebrow / kicker text shown above the surface name. */
  eyebrow: string
  /** Capability tags (visual only — the platform's own capabilities[] still drives behavior). */
  capabilities: string[]
  /** Counts that drive the controller schematic SVG. */
  schematic: SurfaceSchematic
  /** Specialized route on the platform (the Devices page link target). */
  route?: string
}

/** Keys mirror enrichedPhysicalSurfaces unit_id values. Add entries as new surfaces ship. */
export const WALKTHROUGH_SURFACE_META: Record<string, WalkthroughSurfaceMeta> = {
  'maschine-mk1': {
    color: '#ec4899',
    shortLabel: 'Maschine',
    eyebrow: 'maschine',
    capabilities: ['pads', 'encoders', 'transport', 'group buttons'],
    schematic: { pads: 16, encoders: 8, transport: 6 },
    route: '/maschine',
  },
  'ableton-push': {
    color: '#8d8d8d',
    shortLabel: 'Push',
    eyebrow: 'push',
    capabilities: ['pads', 'encoders', 'display feedback', 'button feedback'],
    schematic: { pads: 64, encoders: 8, transport: 8 },
  },
  'ground-control-pro': {
    color: '#f97316',
    shortLabel: 'GCP',
    eyebrow: 'ground-control-pro',
    capabilities: ['footswitches', 'expression pedals', 'snapshot recall'],
    schematic: { footswitches: 10, pedals: 2 },
    route: '/ground-control-pro',
  },
  'meloaudio-midi-commander': {
    color: '#a78bfa',
    shortLabel: 'MIDI Cmd',
    eyebrow: 'meloaudio',
    capabilities: ['footswitches', 'expression pedals', 'profile-based mapping', 'calibration'],
    schematic: { footswitches: 10, pedals: 2 },
    route: '/midi-commander',
  },
  'novation-launch-control': {
    color: '#22c55e',
    shortLabel: 'Launch',
    eyebrow: 'launch-control',
    capabilities: ['knobs', 'pads', 'sliders', 'LED feedback'],
    schematic: { knobs: 24, pads: 16, faders: 8 },
    route: '/launch-control',
  },
  'mackie-mcu-pro': {
    color: '#14b8a6',
    shortLabel: 'MCU',
    eyebrow: 'mcu-pro',
    capabilities: ['motor faders', 'VPots', 'transport', 'scribble strips'],
    schematic: { faders: 8, encoders: 8, transport: 6 },
    route: '/mcu',
  },
}

/** Soft fallback for surfaces the registry knows about but the overlay doesn't. */
export const GENERIC_SURFACE_META: Pick<WalkthroughSurfaceMeta, 'color' | 'capabilities' | 'schematic'> = {
  color: '#4589ff',
  capabilities: [],
  schematic: { knobs: 8 },
}

export function getSurfaceMeta(surfaceId: string | null | undefined): WalkthroughSurfaceMeta | null {
  if (!surfaceId) return null
  return WALKTHROUGH_SURFACE_META[surfaceId] ?? null
}

/** Convert hex to rgba; used for soft accent fills. */
export function hexToRgba(hex: string | undefined, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(236, 72, 153, ${alpha})`
  const stripped = hex.replace('#', '')
  const expanded = stripped.length === 3
    ? stripped.split('').map((c) => c + c).join('')
    : stripped
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Pin handshake: the existing `usePinnedDevices()` hook (state/uiSettings.ts) already
 * persists pinned device IDs as an array — we use the first entry as the wizard's
 * "default surface". The Devices page's existing Pin/Unpin button thus does double
 * duty: pinning a surface there makes it the wizard's pre-selected surface.
 *
 * Kept as a constant for grep-ability and any cross-tab fallback we may add later.
 */
export const PINNED_DEVICES_LEGACY_KEY = 'map2.ui.settings'
