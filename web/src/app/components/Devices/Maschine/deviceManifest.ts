/**
 * T2485-6 — Maschine MK1 device manifest.
 *
 * Per the locked T2485 decision, /maschine remains the primary
 * hardware-console surface (T700 made it the headless primary
 * interface). The unified /midi/devices/native-instruments-maschine-mk1
 * landing renders a brief intro + cross-link into the console;
 * the operator workflow stays on /maschine itself.
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const MASCHINE_MK1_PROFILE_KEY = 'native-instruments-maschine-mk1'

export const maschineMk1DeviceManifest: DeviceManifest = {
  profileKey: MASCHINE_MK1_PROFILE_KEY,
  title: 'Native Instruments Maschine MK1',
  purposeLines: [
    'MAP2’s primary headless control surface — pad grid, eight encoders, and twin LCDs drive the live rig from outside the laptop.',
    'Per-pad MIDI mapping with operator-curated map versions, LED color feedback, and pressure-sensitive aftertouch.',
    'Routes through the controller-host daemon for sub-millisecond latency on note + clock events; mappings are MIDI Services authored.',
  ],
  views: [
    { id: 'overview', label: 'Overview', landing: true },
  ],
}

validateDeviceManifest(maschineMk1DeviceManifest)
