/**
 * T2485-7b — Expression pedalboard device manifest.
 * /expression remains the operator console; this manifest backs the
 * unified /midi/devices/expression entry. Full decomposition of the
 * 1361-LoC monolith into view-tabs is deferred to T2487 (a future
 * dedicated SHIP-loop epic).
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const EXPRESSION_PROFILE_KEY = 'expression'

export const expressionDeviceManifest: DeviceManifest = {
  profileKey: EXPRESSION_PROFILE_KEY,
  title: 'Expression Surface',
  purposeLines: [
    'Programmable expression-pedal layer that maps continuous-controller hardware (volume, wah, whammy) to any MIDI Services target.',
    'Per-pedal calibration (toe-position, heel-position, deadzone) plus pickup-mode safety so cue recall does not jump parameters.',
    'Authored end-to-end through MIDI Services bindings; the controller-host daemon owns realtime CC dispatch on the audio path.',
  ],
  views: [
    { id: 'overview', label: 'Overview', landing: true },
  ],
}

validateDeviceManifest(expressionDeviceManifest)
