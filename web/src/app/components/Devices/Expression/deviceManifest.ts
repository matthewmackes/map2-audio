/**
 * T2485-7b — Expression pedalboard device manifest.
 * T2487 (2026-05-02) Path A: file decomposed into per-component
 * modules under this directory; the integrated 3-column workflow
 * mounts at /midi/devices/expression/console (single view, NOT
 * multi-tab — see PROJECT_WORKLIST.md T2487 entry for the audit-
 * driven Q2=A revision rationale).
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
    { id: 'console', label: 'Console', landing: true },
  ],
}

validateDeviceManifest(expressionDeviceManifest)
