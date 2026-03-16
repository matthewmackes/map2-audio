import {
  createParameterDescriptor,
  getParameterDescriptor,
  hydrateParameterSchema,
  hasParameterDescriptor,
  inferSensitivityProfile,
  requireParameterDescriptor,
  resetParameterSchema,
  sensitivityProfiles,
  validateParameterSchema,
  parameterSchema,
  type ParameterRegistry,
} from './parameterSchema'

describe('parameterSchema', () => {
  afterEach(() => {
    resetParameterSchema()
  })

  it('returns descriptor for an existing key', () => {
    const descriptor = getParameterDescriptor('juce-grid', 'dryWet')
    expect(descriptor).toEqual(parameterSchema['juce-grid:dryWet'])
  })

  it('reports descriptor presence and absence', () => {
    expect(hasParameterDescriptor('juce-grid', 'dryWet')).toBe(true)
    expect(hasParameterDescriptor('juce-grid', 'does-not-exist')).toBe(false)
  })

  it('throws for missing descriptor through requireParameterDescriptor', () => {
    expect(() => {
      requireParameterDescriptor('juce-grid', 'does-not-exist')
    }).toThrow('Missing numeric parameter descriptor for juce-grid::does-not-exist')
  })

  it('validates the default registry as valid', () => {
    const result = validateParameterSchema()
    expect(result.valid).toBe(true)
    expect(result.invalidEntries).toHaveLength(0)
  })

  it('flags invalid parameter descriptors', () => {
    const invalidRegistry: ParameterRegistry = {
      ...parameterSchema,
      'invalid:mismatch': {
        min: 10,
        max: 5,
        step: 0,
        unit: 'dB',
        defaultValue: 20,
        profile: 'default',
      },
    }

    const result = validateParameterSchema(invalidRegistry)
    expect(result.valid).toBe(false)
    expect(result.invalidEntries).toContain('invalid:mismatch')
  })

  it('hydrates runtime descriptors while preserving base registry entries', () => {
    hydrateParameterSchema({
      'lv2://plate:mix': {
        min: 0,
        max: 100,
        step: 1,
        unit: '%',
        defaultValue: 50,
        profile: 'default',
      },
    })

    expect(getParameterDescriptor('lv2://plate', 'mix')).toEqual({
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      defaultValue: 50,
      profile: 'default',
    })
    expect(getParameterDescriptor('juce-grid', 'dryWet')).toEqual(parameterSchema['juce-grid:dryWet'])
  })

  it('infers profile hints for normalized, frequency, and gain ranges', () => {
    expect(inferSensitivityProfile({ min: 0, max: 1, unit: '', name: 'Mix', symbol: 'mix' })).toBe('normalized_0_1')
    expect(inferSensitivityProfile({ min: 20, max: 20_000, unit: 'Hz', name: 'Cutoff', symbol: 'cutoff' })).toBe('frequency')
    expect(inferSensitivityProfile({ min: -24, max: 12, unit: 'dB', name: 'Output Gain', symbol: 'gain' })).toBe('gain-db')
  })

  it('creates parameter descriptors with inferred profile config defaults', () => {
    const descriptor = createParameterDescriptor({
      min: 0,
      max: 1,
      defaultValue: 0.5,
      name: 'Resonance',
      symbol: 'resonance',
    })

    expect(descriptor.profile).toBe('normalized_0_1')
    expect(descriptor.step).toBe(0.01)
    expect(descriptor.defaultValue).toBe(0.5)
    expect(sensitivityProfiles[descriptor.profile].fineDivisor).toBe(20)
  })
})
