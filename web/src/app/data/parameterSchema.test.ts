import {
  createParameterDescriptor,
  getParameterDescriptor,
  hydrateParameterSchema,
  hasParameterDescriptor,
  inferParameterClassification,
  inferParameterScale,
  inferSensitivityProfile,
  normalizeParameterDescriptor,
  requireParameterDescriptor,
  resetParameterSchema,
  sensitivityProfiles,
  validateParameterSchema,
  parameterSchema,
  resolveParameterDescriptor,
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

    expect(getParameterDescriptor('lv2://plate', 'mix')).toMatchObject({
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      defaultValue: 50,
      profile: 'default',
      scale: 'linear',
      classification: 'STEPPED_NUMERIC',
      commitStrategy: 'pointer-up',
    })
    expect(getParameterDescriptor('juce-grid', 'dryWet')).toEqual(parameterSchema['juce-grid:dryWet'])
  })

  it('infers profile hints for normalized, frequency, and gain ranges', () => {
    expect(inferSensitivityProfile({ min: 0, max: 1, unit: '', name: 'Mix', symbol: 'mix' })).toBe('normalized_0_1')
    expect(inferSensitivityProfile({ min: 20, max: 20_000, unit: 'Hz', name: 'Cutoff', symbol: 'cutoff' })).toBe('frequency')
    expect(inferSensitivityProfile({ min: -24, max: 12, unit: 'dB', name: 'Output Gain', symbol: 'gain' })).toBe('gain-db')
  })

  it('infers scale and classification hints for log and calibration controls', () => {
    expect(inferParameterScale({ profile: 'frequency', name: 'Frequency', symbol: 'freq', unit: 'Hz' })).toBe('log')
    expect(inferParameterClassification({
      min: 20,
      max: 20_000,
      step: 1,
      profile: 'frequency',
      scale: 'log',
      name: 'Frequency',
      symbol: 'freq',
      unit: 'Hz',
    })).toBe('CONTINUOUS_LOG')
    expect(inferParameterClassification({
      min: 0,
      max: 127,
      step: 1,
      profile: 'integer',
      scale: 'linear',
      name: 'Deadzone Low',
      symbol: 'deadzone_low',
      unit: '',
    })).toBe('CALIBRATION')
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
    expect(descriptor.scale).toBe('linear')
    expect(descriptor.precision).toBe(2)
    expect(descriptor.fineStep).toBe(0.0005)
    expect(descriptor.largeStep).toBe(0.1)
    expect(descriptor.commitStrategy).toBe('pointer-up')
    expect(sensitivityProfiles[descriptor.profile].fineDivisor).toBe(20)
  })

  it('normalizes calibration descriptors with blur commit semantics', () => {
    const descriptor = normalizeParameterDescriptor({
      min: 0,
      max: 127,
      step: 1,
      defaultValue: 2,
      name: 'Deadzone Low',
      symbol: 'deadzone_low',
    })

    expect(descriptor.classification).toBe('CALIBRATION')
    expect(descriptor.commitStrategy).toBe('blur')
    expect(descriptor.fineStep).toBe(1)
    expect(descriptor.largeStep).toBe(10)
  })

  it('seeds canonical descriptors for the first pilot controls', () => {
    expect(getParameterDescriptor('drums', 'transportSwing')).toMatchObject({
      min: 0,
      max: 100,
      unit: '%',
      classification: 'CONTINUOUS_LINEAR',
      largeStep: 5,
    })
    expect(getParameterDescriptor('map2://juce/eq/parametric', 'bandFrequency')).toMatchObject({
      min: 20,
      max: 20_000,
      unit: 'Hz',
      scale: 'log',
      classification: 'CONTINUOUS_LOG',
    })
    expect(getParameterDescriptor('map2://juce/multieffect/passionfx', 'phaserStages')).toMatchObject({
      min: 2,
      max: 16,
      step: 2,
      classification: 'STEPPED_NUMERIC',
      largeStep: 4,
    })
  })

  it('resolves canonical overrides for runtime-derived editor descriptors', () => {
    const descriptor = resolveParameterDescriptor({
      min: 0,
      max: 100,
      defaultValue: 50,
      step: 5,
      unit: '%',
      name: 'Stages',
      symbol: 'phaserStages',
    }, {
      pluginId: 'map2://juce/multieffect/passionfx',
      paramKey: 'phaserStages',
    })

    expect(descriptor).toMatchObject({
      min: 2,
      max: 16,
      step: 2,
      defaultValue: 4,
      classification: 'STEPPED_NUMERIC',
      largeStep: 4,
    })
  })
})
