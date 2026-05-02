/**
 * T2485-4 — MPX1 device manifest.
 * See web/src/app/components/Devices/Shared/deviceManifest.ts for the schema.
 */

import {
  validateDeviceManifest,
  type DeviceManifest,
} from '../Shared/deviceManifest'

export const MPX1_PROFILE_KEY = 'lexicon-mpx1'

export const mpx1DeviceManifest: DeviceManifest = {
  profileKey: MPX1_PROFILE_KEY,
  title: 'Lexicon MPX-1',
  purposeLines: [
    'Studio reverb and effects processor with 250 program slots and two parallel effect blocks per program.',
    'Stage-recall workflow: SysEx state capture, program morphing between scenes, and beat-synced tap tempo.',
    'MIDI-first control surface — every parameter mappable, every program saveable from the unified MIDI Services hub.',
  ],
  views: [
    { id: 'panel', label: 'Panel', landing: true },
    { id: 'editor', label: 'Editor' },
    { id: 'midi-map', label: 'MIDI Map' },
    { id: 'matrix', label: 'Mod Matrix' },
    { id: 'library', label: 'Library' },
    { id: 'perform', label: 'Perform' },
    { id: 'diag', label: 'Diagnostics' },
    { id: 'flow', label: 'Signal Flow' },
  ],
}

// Validate at module load — surface any structural issues during build/test.
validateDeviceManifest(mpx1DeviceManifest)
