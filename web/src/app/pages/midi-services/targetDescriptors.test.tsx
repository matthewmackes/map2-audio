/**
 * T2482 loop 12 / iter 119 — targetDescriptors test suite.
 *
 * Sister to sourceDescriptors.test.tsx. Same test shape mirrored
 * for the target-side catalogue.
 */

import {
  TARGET_TYPE_SPECS,
  defaultTargetDescriptorFor,
  extractTargetKnownAndUnknown,
  getTargetSpec,
  mergeTargetForSave,
} from './targetDescriptors'

describe('TARGET_TYPE_SPECS', () => {
  it('covers all 7 BindingTargetType variants', () => {
    expect(TARGET_TYPE_SPECS).toHaveLength(7)
  })

  it('every spec has a citation', () => {
    for (const spec of TARGET_TYPE_SPECS) {
      expect(spec.citation).toMatch(/(app|libremidi)/i)
    }
  })

  it('every spec has at least one field', () => {
    for (const spec of TARGET_TYPE_SPECS) {
      expect(spec.fields.length).toBeGreaterThan(0)
    }
  })

  it('numeric fields with min/max have min <= max', () => {
    for (const spec of TARGET_TYPE_SPECS) {
      for (const f of spec.fields) {
        if (f.min !== undefined && f.max !== undefined) {
          expect(f.min).toBeLessThanOrEqual(f.max)
        }
      }
    }
  })
})

describe('getTargetSpec', () => {
  it('returns the spec for a known target_type', () => {
    expect(getTargetSpec('engine_param')?.label).toBe('Engine plugin parameter')
  })

  it('returns undefined for an unknown target_type', () => {
    // @ts-expect-error testing unknown vocab
    expect(getTargetSpec('not_a_target_type')).toBeUndefined()
  })
})

describe('defaultTargetDescriptorFor', () => {
  it('seeds defaults for fields with defaultValue', () => {
    expect(defaultTargetDescriptorFor('brain_slot')).toEqual({ mode: 'momentary' })
  })

  it('seeds gpio_output mode default', () => {
    expect(defaultTargetDescriptorFor('gpio_output')).toEqual({ mode: 'pulse' })
  })

  it('returns empty object for target_type with no defaults', () => {
    expect(defaultTargetDescriptorFor('engine_param')).toEqual({})
  })
})

describe('extractTargetKnownAndUnknown', () => {
  it('splits an engine_param descriptor into known + unknown', () => {
    const result = extractTargetKnownAndUnknown(
      { plugin_uri: 'lv2:foo', param_index: 3, custom_ext: true },
      'engine_param',
    )
    expect(result.known).toEqual({ plugin_uri: 'lv2:foo', param_index: 3 })
    expect(result.unknown).toEqual({ custom_ext: true })
  })

  it('puts everything in unknown when target_type has no spec', () => {
    // @ts-expect-error testing unknown vocab
    const result = extractTargetKnownAndUnknown({ a: 1 }, 'not_a_type')
    expect(result.known).toEqual({})
    expect(result.unknown).toEqual({ a: 1 })
  })
})

describe('mergeTargetForSave', () => {
  it('merges editor output with preserved unknowns', () => {
    const merged = mergeTargetForSave(
      { plugin_uri: 'lv2:foo', param_index: 3 },
      { custom_ext: true },
    )
    expect(merged).toEqual({ plugin_uri: 'lv2:foo', param_index: 3, custom_ext: true })
  })

  it('round-trips through extract+merge', () => {
    const original = { plugin_uri: 'lv2:foo', param_index: 3, custom_ext: true }
    const split = extractTargetKnownAndUnknown(original, 'engine_param')
    const merged = mergeTargetForSave(split.known, split.unknown)
    expect(merged).toEqual(original)
  })
})
