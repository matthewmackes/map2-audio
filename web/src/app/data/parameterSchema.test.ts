import {
  getParameterDescriptor,
  hydrateParameterSchema,
  hasParameterDescriptor,
  requireParameterDescriptor,
  resetParameterSchema,
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
})
