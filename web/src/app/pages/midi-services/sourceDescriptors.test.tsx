/**
 * T2482 loop 12 / iter 119 — sourceDescriptors test suite.
 *
 * Pure unit tests for the iter-112 SOURCE_TYPE_SPECS catalogue and
 * its helpers. No React, no fetch, no async.
 */

import {
  SOURCE_TYPE_SPECS,
  defaultDescriptorFor,
  extractKnownAndUnknown,
  getSourceSpec,
  mergeForSave,
} from './sourceDescriptors'

describe('SOURCE_TYPE_SPECS', () => {
  it('covers all 12 BindingSourceType variants', () => {
    expect(SOURCE_TYPE_SPECS).toHaveLength(12)
  })

  it('every spec has a citation back to the projection file', () => {
    for (const spec of SOURCE_TYPE_SPECS) {
      expect(spec.citation).toMatch(/(app|libremidi)/i)
    }
  })

  it('every spec has at least one field', () => {
    for (const spec of SOURCE_TYPE_SPECS) {
      expect(spec.fields.length).toBeGreaterThan(0)
    }
  })

  it('numeric spec fields with min/max have min <= max', () => {
    for (const spec of SOURCE_TYPE_SPECS) {
      for (const f of spec.fields) {
        if (f.min !== undefined && f.max !== undefined) {
          expect(f.min).toBeLessThanOrEqual(f.max)
        }
      }
    }
  })
})

describe('getSourceSpec', () => {
  it('returns the spec for a known source_type', () => {
    expect(getSourceSpec('midi_cc')?.label).toBe('MIDI CC')
  })

  it('returns undefined for an unknown source_type', () => {
    // @ts-expect-error testing unknown vocab
    expect(getSourceSpec('not_a_source_type')).toBeUndefined()
  })
})

describe('defaultDescriptorFor', () => {
  it('seeds defaults for fields with defaultValue', () => {
    expect(defaultDescriptorFor('midi_cc')).toEqual({ curve: 'linear' })
  })

  it('returns empty object for source_type with no defaults', () => {
    expect(defaultDescriptorFor('midi_pc')).toEqual({})
  })
})

describe('extractKnownAndUnknown', () => {
  it('splits a midi_cc descriptor into known + unknown', () => {
    const result = extractKnownAndUnknown(
      { channel: 1, cc: 74, custom_extension: 'x' },
      'midi_cc',
    )
    expect(result.known).toEqual({ channel: 1, cc: 74 })
    expect(result.unknown).toEqual({ custom_extension: 'x' })
  })

  it('puts everything in unknown when source_type has no spec', () => {
    // @ts-expect-error testing unknown vocab
    const result = extractKnownAndUnknown({ a: 1, b: 2 }, 'not_a_source_type')
    expect(result.known).toEqual({})
    expect(result.unknown).toEqual({ a: 1, b: 2 })
  })

  it('handles empty descriptor', () => {
    const result = extractKnownAndUnknown({}, 'midi_cc')
    expect(result.known).toEqual({})
    expect(result.unknown).toEqual({})
  })
})

describe('mergeForSave', () => {
  it('merges editor output with preserved unknowns', () => {
    const merged = mergeForSave({ cc: 74 }, { custom_extension: 'x' })
    expect(merged).toEqual({ cc: 74, custom_extension: 'x' })
  })

  it('editor output overrides unknowns when keys collide', () => {
    // Defensive: shouldn't happen because extractKnownAndUnknown splits
    // by knownKeys, but if it does, editor wins (operator intent).
    const merged = mergeForSave({ cc: 74 }, { cc: 99 })
    expect(merged).toEqual({ cc: 74 })
  })

  it('round-trips: extract then merge equals identity', () => {
    const original = { channel: 1, cc: 74, custom_extension: 'x' }
    const split = extractKnownAndUnknown(original, 'midi_cc')
    const merged = mergeForSave(split.known, split.unknown)
    expect(merged).toEqual(original)
  })
})
