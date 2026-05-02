/**
 * T2485-7a — Mackie MCU Pro device manifest.
 * /mcu remains the operator console; this manifest backs the unified
 * /midi/devices/mackie-mcu-pro entry which cross-links into it.
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const MCU_PROFILE_KEY = 'mackie-mcu-pro'

export const mcuDeviceManifest: DeviceManifest = {
  profileKey: MCU_PROFILE_KEY,
  title: 'Mackie MCU Pro',
  purposeLines: [
    'Studio-grade nine-fader control surface with 100mm motorized faders, twelve V-pots, and dual transport sections.',
    'DAW workflow: per-strip name and value LCD, channel-strip flip, transport-aware LED feedback, and Logic-style automation modes.',
    'MIDI Services author per-strip mappings; the controller-host daemon owns realtime fader echo back to the surface.',
  ],
  views: [
    { id: 'overview', label: 'Overview', landing: true },
  ],
}

validateDeviceManifest(mcuDeviceManifest)
