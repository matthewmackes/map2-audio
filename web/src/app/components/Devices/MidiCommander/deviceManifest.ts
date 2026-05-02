/**
 * T2485-7a — MeloAudio MIDI Commander device manifest.
 * /midi-commander remains the operator console; this manifest backs
 * the unified /midi/devices/meloaudio-midi-commander entry.
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const MIDI_COMMANDER_PROFILE_KEY = 'meloaudio-midi-commander'

export const midiCommanderDeviceManifest: DeviceManifest = {
  profileKey: MIDI_COMMANDER_PROFILE_KEY,
  title: 'MeloAudio MIDI Commander',
  purposeLines: [
    'Eight-button, two-expression-jack MIDI floorboard for guitarists who need program-change + CC under their feet.',
    'Bank-up / bank-down workflow with per-bank assignments; expression pedals mapped to MIDI Services targets like wah and volume.',
    'Battery + USB powered; rugged metal chassis built for stage abuse. Authored end-to-end through the unified MIDI Services hub.',
  ],
  views: [
    { id: 'overview', label: 'Overview', landing: true },
  ],
}

validateDeviceManifest(midiCommanderDeviceManifest)
