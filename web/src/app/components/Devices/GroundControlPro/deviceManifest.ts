/**
 * T2485-7c — Voodoo Lab Ground Control Pro device manifest.
 * /ground-control-pro remains the operator console; this manifest
 * backs the unified /midi/devices/voodoo-lab-ground-control-pro entry.
 * Full decomposition of the 1338-LoC monolith into view-tabs is
 * deferred to T2488.
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const GROUND_CONTROL_PRO_PROFILE_KEY = 'voodoo-lab-ground-control-pro'

export const groundControlProDeviceManifest: DeviceManifest = {
  profileKey: GROUND_CONTROL_PRO_PROFILE_KEY,
  title: 'Voodoo Lab Ground Control Pro',
  purposeLines: [
    'Programmable ten-button MIDI foot controller — ten patches per bank, 100 banks, every button assignable to any MIDI Services target.',
    'Live-rig SysEx authoring: capture amp + pedalboard state to a patch, recall it on stage with a single foot-press, no laptop required.',
    'Built-in tuner mute, tap-tempo, and expression-jack support; every workflow flows through MIDI Services bindings authority.',
  ],
  views: [
    { id: 'console', label: 'Console', landing: true },
  ],
}

validateDeviceManifest(groundControlProDeviceManifest)
