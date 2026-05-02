/**
 * T2485-5 — IntelFX device manifest.
 * See web/src/app/components/Devices/Shared/deviceManifest.ts for the schema.
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const INTELFX_PROFILE_KEY = 'rocktron-intelfx'

export const intelfxDeviceManifest: DeviceManifest = {
  profileKey: INTELFX_PROFILE_KEY,
  title: 'Rocktron IntelliFX',
  purposeLines: [
    'Eleven-block guitar effects rack covering HUSH gate, compression, wah, EQ, pitch, chorus, flange, phase, tremolo, delay, and reverb.',
    'Live-rig workflow: instant program recall, per-block bypass pills, and undo/redo on every parameter change.',
    'MIDI-first authoring through the unified MIDI Services hub — every block parameter mappable, every program saveable.',
  ],
  views: [
    { id: 'panel', label: 'Panel', landing: true },
    { id: 'editor', label: 'Editor' },
    { id: 'midi-map', label: 'MIDI Map' },
    { id: 'library', label: 'Library' },
    { id: 'perform', label: 'Perform' },
    { id: 'diag', label: 'Diagnostics' },
    { id: 'flow', label: 'Signal Flow' },
  ],
}

validateDeviceManifest(intelfxDeviceManifest)
