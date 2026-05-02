/**
 * T2485-7a — Novation Launch Control XL device manifest.
 * /launch-control remains the operator console; this manifest backs
 * the unified /midi/devices/novation-launch-control-xl entry.
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const LAUNCH_CONTROL_PROFILE_KEY = 'novation-launch-control-xl'

export const launchControlDeviceManifest: DeviceManifest = {
  profileKey: LAUNCH_CONTROL_PROFILE_KEY,
  title: 'Novation Launch Control XL',
  purposeLines: [
    'Compact eight-strip MIDI mixer with 24 endless rotary encoders and 16 pads laid out for live performance and DAW remixing.',
    'Per-template authoring: build a hardware-routed mix template in MIDI Services, recall it at gig time with a single program-change.',
    'RGB pad feedback driven by the controller-host daemon; encoders pickup-mode safe so cue-recall doesn’t jump parameters.',
  ],
  views: [
    { id: 'overview', label: 'Overview', landing: true },
  ],
}

validateDeviceManifest(launchControlDeviceManifest)
