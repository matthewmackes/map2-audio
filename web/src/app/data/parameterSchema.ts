/**
 * Global numeric parameter schema registry used by the NumericInput primitive.
 */

export interface NumericInputAccelerationStep {
  minVelocity: number
  multiplier: number
}

export interface NumericInputSensitivityConfig {
  fineDivisor: number
  wheelStep: number
  pixelsPerStep: number
  acceleration: NumericInputAccelerationStep[]
  defaultUnit?: string
}

export type SensitivityProfile =
  | 'default'
  | 'integer'
  | 'frequency'
  | 'gain-db'
  | 'time-ms'
  | 'normalized_0_1'

export interface ParameterDescriptor {
  min: number
  max: number
  step: number
  unit: string
  defaultValue: number
  profile: SensitivityProfile
  precision?: number
}

export type ParameterRegistry = Record<string, ParameterDescriptor>

export interface ParameterSchemaValidationResult {
  valid: boolean
  invalidEntries: string[]
}

export interface ParameterDescriptorSeed {
  min: number
  max: number
  step?: number
  unit?: string
  defaultValue?: number
  precision?: number
  profile?: SensitivityProfile
  name?: string
  symbol?: string
}

export const sensitivityProfiles: Record<SensitivityProfile, NumericInputSensitivityConfig> = {
  default: {
    fineDivisor: 10,
    wheelStep: 1,
    pixelsPerStep: 18,
    acceleration: [
      { minVelocity: 0.5, multiplier: 1.5 },
      { minVelocity: 1.5, multiplier: 2 },
      { minVelocity: 3, multiplier: 4 },
    ],
  },
  integer: {
    fineDivisor: 1,
    wheelStep: 1,
    pixelsPerStep: 20,
    acceleration: [
      { minVelocity: 0.5, multiplier: 2 },
      { minVelocity: 1.5, multiplier: 4 },
      { minVelocity: 3, multiplier: 8 },
    ],
  },
  frequency: {
    fineDivisor: 20,
    wheelStep: 4,
    pixelsPerStep: 12,
    defaultUnit: 'Hz',
    acceleration: [
      { minVelocity: 0.5, multiplier: 2 },
      { minVelocity: 1.25, multiplier: 5 },
      { minVelocity: 2.5, multiplier: 10 },
    ],
  },
  'gain-db': {
    fineDivisor: 10,
    wheelStep: 1,
    pixelsPerStep: 16,
    defaultUnit: 'dB',
    acceleration: [
      { minVelocity: 0.5, multiplier: 1.5 },
      { minVelocity: 1.5, multiplier: 3 },
      { minVelocity: 3, multiplier: 6 },
    ],
  },
  'time-ms': {
    fineDivisor: 10,
    wheelStep: 1,
    pixelsPerStep: 14,
    defaultUnit: 'ms',
    acceleration: [
      { minVelocity: 0.5, multiplier: 1.5 },
      { minVelocity: 1.5, multiplier: 2.5 },
      { minVelocity: 3, multiplier: 5 },
    ],
  },
  normalized_0_1: {
    fineDivisor: 20,
    wheelStep: 1,
    pixelsPerStep: 20,
    acceleration: [
      { minVelocity: 0.5, multiplier: 1 },
      { minVelocity: 1.5, multiplier: 1.5 },
      { minVelocity: 3, multiplier: 2 },
    ],
  },
}

export function buildParameterKey(pluginId: string, paramKey: string): string {
  return `${pluginId}:${paramKey}`
}

const baseParameterSchema: ParameterRegistry = {
  [buildParameterKey('juce-grid', 'dryWet')]: {
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    defaultValue: 100,
    profile: 'default',
    precision: 1,
  },
  [buildParameterKey('juce-grid', 'solo')]: {
    min: 0,
    max: 1,
    step: 1,
    unit: '',
    defaultValue: 0,
    profile: 'integer',
  },
  [buildParameterKey('synthforge', 'cutoff')]: {
    min: 20,
    max: 20_000,
    step: 1,
    unit: 'Hz',
    defaultValue: 1000,
    profile: 'frequency',
  },
  [buildParameterKey('synthforge', 'resonance')]: {
    min: 0,
    max: 1,
    step: 0.01,
    unit: '',
    defaultValue: 0.5,
    profile: 'normalized_0_1',
    precision: 2,
  },
  [buildParameterKey('mixer', 'inputGain')]: {
    min: -60,
    max: 12,
    step: 0.1,
    unit: 'dB',
    defaultValue: 0,
    profile: 'gain-db',
    precision: 2,
  },
  [buildParameterKey('reverb', 'preDelay')]: {
    min: 0,
    max: 1000,
    step: 1,
    unit: 'ms',
    defaultValue: 20,
    profile: 'time-ms',
    precision: 0,
  },
  [buildParameterKey('global', 'program')]: {
    min: 0,
    max: 127,
    step: 1,
    unit: '',
    defaultValue: 0,
    profile: 'integer',
  },
}

export const parameterSchema: ParameterRegistry = {
  ...baseParameterSchema,
}

const INTEGER_HINTS = [
  'bank',
  'channel',
  'count',
  'index',
  'mode',
  'octave',
  'preset',
  'program',
  'quality',
  'root',
  'voice',
  'voices',
  'zone',
]

function derivePrecision(step: number, explicitPrecision?: number): number | undefined {
  if (explicitPrecision != null) {
    return explicitPrecision
  }

  if (!Number.isFinite(step) || step <= 0) {
    return undefined
  }

  const normalized = step.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
  if (!normalized.includes('.')) {
    return 0
  }
  return normalized.split('.')[1]?.length ?? 0
}

export function inferSensitivityProfile(seed: Pick<ParameterDescriptorSeed, 'min' | 'max' | 'unit' | 'name' | 'symbol' | 'step'>): SensitivityProfile {
  const token = `${seed.name ?? ''} ${seed.symbol ?? ''} ${seed.unit ?? ''}`.toLowerCase()

  if (seed.min === 0 && seed.max === 1) {
    return 'normalized_0_1'
  }
  if (token.includes('hz') || token.includes('freq') || token.includes('frequency') || token.includes('cutoff')) {
    return 'frequency'
  }
  if (token.includes('db') || token.includes('gain') || token.includes('threshold') || token.includes('level') || token.includes('trim')) {
    return 'gain-db'
  }
  if (
    token.includes('ms')
    || token.includes('delay')
    || token.includes('attack')
    || token.includes('release')
    || token.includes('time')
    || token.includes('predelay')
    || token.includes('pre-delay')
    || token.includes('decay')
    || token.includes('hold')
  ) {
    return 'time-ms'
  }
  if (
    Number.isInteger(seed.min)
    && Number.isInteger(seed.max)
    && (seed.step == null || Number.isInteger(seed.step))
    && INTEGER_HINTS.some((hint) => token.includes(hint))
  ) {
    return 'integer'
  }
  return 'default'
}

function inferDescriptorStep(seed: Pick<ParameterDescriptorSeed, 'min' | 'max' | 'profile'>): number {
  const span = Math.max(0, seed.max - seed.min)
  if (seed.profile === 'integer') {
    return 1
  }
  if (seed.profile === 'gain-db') {
    return 0.1
  }
  if (seed.profile === 'frequency') {
    return 1
  }
  if (seed.profile === 'time-ms') {
    return span >= 10 ? 1 : 0.1
  }
  if (seed.profile === 'normalized_0_1') {
    return 0.01
  }
  if (span <= 1) {
    return 0.01
  }
  if (span <= 10) {
    return 0.1
  }
  if (span <= 100) {
    return 0.5
  }
  return 1
}

export function createParameterDescriptor(seed: ParameterDescriptorSeed): ParameterDescriptor {
  const profile = seed.profile ?? inferSensitivityProfile(seed)
  const min = Number.isFinite(seed.min) ? seed.min : 0
  const max = Number.isFinite(seed.max) && seed.max > min ? seed.max : min + 1
  const step = seed.step && seed.step > 0 ? seed.step : inferDescriptorStep({ min, max, profile })
  const precision = derivePrecision(step, seed.precision)
  const defaultUnit = sensitivityProfiles[profile].defaultUnit ?? ''
  const defaultValue = Number.isFinite(seed.defaultValue)
    ? Math.min(max, Math.max(min, seed.defaultValue as number))
    : min

  const descriptor: ParameterDescriptor = {
    min,
    max,
    step,
    unit: seed.unit ?? defaultUnit,
    defaultValue,
    profile,
  }

  if (precision != null && precision > 0) {
    descriptor.precision = precision
  }

  return descriptor
}

export function hydrateParameterSchema(registry: ParameterRegistry): ParameterRegistry {
  for (const key of Object.keys(parameterSchema)) {
    delete parameterSchema[key]
  }

  Object.assign(parameterSchema, baseParameterSchema, registry)
  return parameterSchema
}

export function resetParameterSchema(): ParameterRegistry {
  return hydrateParameterSchema({})
}

export function getParameterDescriptor(pluginId: string, paramKey: string): ParameterDescriptor | undefined {
  return parameterSchema[buildParameterKey(pluginId, paramKey)]
}

export function hasParameterDescriptor(pluginId: string, paramKey: string): boolean {
  return getParameterDescriptor(pluginId, paramKey) !== undefined
}

export function requireParameterDescriptor(pluginId: string, paramKey: string): ParameterDescriptor {
  const descriptor = getParameterDescriptor(pluginId, paramKey)
  if (!descriptor) {
    throw new Error(`Missing numeric parameter descriptor for ${pluginId}::${paramKey}`)
  }
  return descriptor
}

export function validateParameterSchema(
  registry: ParameterRegistry = parameterSchema,
): ParameterSchemaValidationResult {
  const invalidEntries: string[] = []

  for (const [key, descriptor] of Object.entries(registry)) {
    const hasBounds = Number.isFinite(descriptor.min) && Number.isFinite(descriptor.max)
    const hasStep = Number.isFinite(descriptor.step) && descriptor.step > 0
    const hasDefault = Number.isFinite(descriptor.defaultValue)
    const validRange = hasBounds && descriptor.min < descriptor.max
    const defaultInRange = hasDefault && descriptor.defaultValue >= descriptor.min && descriptor.defaultValue <= descriptor.max
    const validProfile = Object.prototype.hasOwnProperty.call(sensitivityProfiles, descriptor.profile)

    if (!hasBounds || !hasStep || !hasDefault || !validRange || !defaultInRange || !validProfile) {
      invalidEntries.push(key)
    }
  }

  return {
    valid: invalidEntries.length === 0,
    invalidEntries,
  }
}
