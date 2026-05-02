/**
 * T2482 loop 10 / iter 98 — known per-device editor route map.
 *
 * Per the iter-97 audit (§1), MAP2 currently ships 8+ first-party
 * per-device editor surfaces. /midi/devices is an INDEX surface that
 * cross-links into them; this map answers "given a device-pack
 * profile_key, what's the canonical editor route?".
 *
 * If a profile has no known editor, the iter-99 generic detail stub
 * at /midi/devices/:profileKey serves as the fallback.
 */

interface EditorRouteRule {
  match: (profileKey: string) => boolean
  route: string
  label: string
}

const RULES: EditorRouteRule[] = [
  {
    match: (k) => k.includes('maschine-mk1') && k.includes('midi-map'),
    route: '/maschine/midi-map',
    label: 'Maschine MIDI Map',
  },
  {
    match: (k) => k.includes('maschine'),
    route: '/maschine',
    label: 'Maschine',
  },
  {
    match: (k) => k.includes('mcu') || k.includes('mackie'),
    route: '/mcu',
    label: 'MCU',
  },
  {
    match: (k) => k.includes('launch-control') || k.includes('launchcontrol'),
    route: '/launch-control',
    label: 'Launch Control',
  },
  {
    match: (k) => k.includes('midi-commander') || k.includes('midicommander'),
    route: '/midi-commander',
    label: 'MIDI Commander',
  },
  {
    match: (k) => k.includes('mpx1') || k.includes('mpx-1'),
    route: '/mpx1',
    label: 'MPX-1',
  },
  {
    match: (k) => k.includes('intelfx') || k.includes('intellifx'),
    route: '/intelfx',
    label: 'IntelFX',
  },
  {
    match: (k) => k.includes('ground-control') || k.includes('groundcontrol'),
    route: '/ground-control-pro',
    label: 'Ground Control Pro',
  },
]

export interface DevicePackEditorTarget {
  route: string
  label: string
  isCanonical: boolean  // true = first-party editor; false = generic stub
}

export function resolveDevicePackEditor(profileKey: string): DevicePackEditorTarget {
  const lowered = profileKey.toLowerCase()
  for (const rule of RULES) {
    if (rule.match(lowered)) {
      return { route: rule.route, label: rule.label, isCanonical: true }
    }
  }
  return {
    route: `/midi/devices/${encodeURIComponent(profileKey)}`,
    label: 'Generic stub',
    isCanonical: false,
  }
}
