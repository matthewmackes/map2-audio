/**
 * T2485-7d — Ableton Push 3 surface device manifest.
 * /labs/push-surface remains the operator console; this manifest backs
 * the unified /midi/devices/ableton-push-3 entry. Full decomposition
 * of the 1625-LoC monolith into view-tabs is deferred to T2489.
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const PUSH_SURFACE_PROFILE_KEY = 'ableton-push-3'

export const pushSurfaceDeviceManifest: DeviceManifest = {
  profileKey: PUSH_SURFACE_PROFILE_KEY,
  title: 'Ableton Push 3',
  purposeLines: [
    'Pad-grid performance surface — 64 RGB pressure-sensitive pads, 8 endless touch encoders, color LCD strip, transport, and per-track strip control.',
    'Studio-to-stage workflow: pad layouts switch between drum-rack, melodic, and clip-launch modes; encoder pickup-mode safe across cue recall.',
    'Authored end-to-end through MIDI Services bindings; controller-host daemon owns aftertouch + clock with sub-millisecond fast-path latency.',
  ],
  views: [
    { id: 'overview', label: 'Overview', landing: true },
  ],
}

validateDeviceManifest(pushSurfaceDeviceManifest)
