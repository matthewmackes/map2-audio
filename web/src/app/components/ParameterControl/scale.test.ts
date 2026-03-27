import { createParameterDescriptor } from '../../data/parameterSchema'
import { denormalizeValue, normalizeValue, snapValue } from './scale'

describe('parameter control scale utilities', () => {
  it('round-trips linear values through normalized space', () => {
    const descriptor = createParameterDescriptor({
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 50,
    })

    expect(normalizeValue(50, descriptor)).toBeCloseTo(0.5, 6)
    expect(denormalizeValue(0.5, descriptor)).toBe(50)
  })

  it('round-trips logarithmic values through normalized space', () => {
    const descriptor = createParameterDescriptor({
      min: 20,
      max: 20_000,
      step: 1,
      defaultValue: 1000,
      unit: 'Hz',
      profile: 'frequency',
      scale: 'log',
    })

    const normalized = normalizeValue(200, descriptor)
    expect(normalized).toBeGreaterThan(0)
    expect(normalized).toBeLessThan(1)
    expect(denormalizeValue(normalized, descriptor)).toBe(200)
  })

  it('snaps stepped values after scale conversion', () => {
    const descriptor = createParameterDescriptor({
      min: 0,
      max: 12,
      step: 2,
      defaultValue: 4,
      profile: 'integer',
    })

    expect(snapValue(5, descriptor)).toBe(6)
    expect(snapValue(11, descriptor)).toBe(12)
  })
})
