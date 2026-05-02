/**
 * T2482 loop 11 / iter 108 — devicePackEditorRoutes test suite.
 *
 * Covers the static rule map that resolves a device-pack profile_key
 * to its first-party editor route. Per the iter-97 audit §3, this is
 * load-bearing for the /midi/devices DataTable Editor column AND the
 * /midi/devices/:profileKey detail page cross-link banner.
 */

import { resolveDevicePackEditor } from './devicePackEditorRoutes'

describe('resolveDevicePackEditor', () => {
  describe('canonical first-party editors', () => {
    it.each([
      ['native-instruments/maschine-mk1.midi', '/maschine', 'Maschine'],
      ['mackie/mcu.midi', '/mcu', 'MCU'],
      ['novation/launch-control-xl.midi', '/launch-control', 'Launch Control'],
      ['midi-commander/v1.midi', '/midi-commander', 'MIDI Commander'],
      ['lexicon/mpx-1.midi', '/mpx1', 'MPX-1'],
      ['ground-control-pro/v2.midi', '/ground-control-pro', 'Ground Control Pro'],
    ])('routes %s to %s (%s)', (profileKey, expectedRoute, expectedLabel) => {
      const result = resolveDevicePackEditor(profileKey)
      expect(result.isCanonical).toBe(true)
      expect(result.route).toBe(expectedRoute)
      expect(result.label).toBe(expectedLabel)
    })

    it('routes maschine-mk1 with midi-map suffix to the more specific editor', () => {
      const result = resolveDevicePackEditor('native-instruments/maschine-mk1.midi-map')
      expect(result.isCanonical).toBe(true)
      expect(result.route).toBe('/maschine/midi-map')
      expect(result.label).toBe('Maschine MIDI Map')
    })

    it('matches case-insensitively', () => {
      const result = resolveDevicePackEditor('NATIVE-INSTRUMENTS/Maschine-MK1.midi')
      expect(result.isCanonical).toBe(true)
      expect(result.route).toBe('/maschine')
    })
  })

  describe('generic stub fallback', () => {
    it('returns the generic stub for unknown profiles', () => {
      const result = resolveDevicePackEditor('acme/unknown-device.midi')
      expect(result.isCanonical).toBe(false)
      expect(result.route).toBe('/midi/devices/acme%2Funknown-device.midi')
      expect(result.label).toBe('Generic stub')
    })

    it('URI-encodes the profile_key in the stub route', () => {
      const result = resolveDevicePackEditor('weird vendor/with spaces.midi')
      expect(result.isCanonical).toBe(false)
      expect(result.route).toContain(encodeURIComponent('weird vendor/with spaces.midi'))
    })
  })
})
