/**
 * T2485-1 — deviceManifest schema unit tests.
 */

import {
  DeviceManifestSchemaError,
  getLandingViewId,
  validateDeviceManifest,
} from './deviceManifest'
import type { DeviceManifest } from './deviceManifest'

const VALID: DeviceManifest = {
  profileKey: 'lexicon/mpx-1.midi',
  title: 'Lexicon MPX-1',
  purposeLines: [
    'Reverb and effects processor with 250 program slots.',
    'Two effect blocks (REV/PIT/DLY/CHO/EQ/MOD) per program.',
    'MIDI-controlled with full SysEx state recall.',
  ],
  views: [
    { id: 'panel', label: 'Panel', landing: true },
    { id: 'editor', label: 'Editor' },
  ],
}

describe('validateDeviceManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(() => validateDeviceManifest(VALID)).not.toThrow()
  })

  it('rejects empty profileKey', () => {
    expect(() => validateDeviceManifest({ ...VALID, profileKey: '' })).toThrow(DeviceManifestSchemaError)
  })

  it('rejects empty title', () => {
    expect(() => validateDeviceManifest({ ...VALID, title: '' })).toThrow(/title is required/)
  })

  it('rejects fewer than 3 purpose lines', () => {
    expect(() =>
      validateDeviceManifest({
        ...VALID,
        purposeLines: ['one', 'two'] as unknown as DeviceManifest['purposeLines'],
      })
    ).toThrow(/purposeLines must contain exactly 3 entries/)
  })

  it('rejects more than 3 purpose lines', () => {
    expect(() =>
      validateDeviceManifest({
        ...VALID,
        purposeLines: ['a', 'b', 'c', 'd'] as unknown as DeviceManifest['purposeLines'],
      })
    ).toThrow(/purposeLines must contain exactly 3 entries/)
  })

  it('rejects whitespace-only purpose lines', () => {
    expect(() =>
      validateDeviceManifest({
        ...VALID,
        purposeLines: ['ok', '   ', 'ok'] as DeviceManifest['purposeLines'],
      })
    ).toThrow(/non-empty strings/)
  })

  it('rejects empty views array', () => {
    expect(() => validateDeviceManifest({ ...VALID, views: [] })).toThrow(/at least one entry/)
  })

  it('rejects duplicate view ids', () => {
    expect(() =>
      validateDeviceManifest({
        ...VALID,
        views: [
          { id: 'panel', label: 'Panel', landing: true },
          { id: 'panel', label: 'Panel 2' },
        ],
      })
    ).toThrow(/duplicated/)
  })

  it('rejects zero landing views', () => {
    expect(() =>
      validateDeviceManifest({
        ...VALID,
        views: [{ id: 'panel', label: 'Panel' }],
      })
    ).toThrow(/exactly one view must be marked landing/)
  })

  it('rejects multiple landing views', () => {
    expect(() =>
      validateDeviceManifest({
        ...VALID,
        views: [
          { id: 'panel', label: 'Panel', landing: true },
          { id: 'editor', label: 'Editor', landing: true },
        ],
      })
    ).toThrow(/exactly one view must be marked landing/)
  })

  it('rejects view without id or label', () => {
    expect(() =>
      validateDeviceManifest({
        ...VALID,
        views: [{ id: '', label: 'X', landing: true }],
      })
    ).toThrow(/view.id and view.label are required/)
  })
})

describe('getLandingViewId', () => {
  it('returns the landing view id', () => {
    expect(getLandingViewId(VALID)).toBe('panel')
  })

  it('returns the correct id when landing is not first', () => {
    const m: DeviceManifest = {
      ...VALID,
      views: [
        { id: 'panel', label: 'Panel' },
        { id: 'editor', label: 'Editor', landing: true },
      ],
    }
    validateDeviceManifest(m)
    expect(getLandingViewId(m)).toBe('editor')
  })
})
