/**
 * Global numeric parameter schema registry used by the NumericInput primitive.
 */

export type SensitivityProfile = 'default' | 'integer' | 'frequency' | 'gain-db' | 'time-ms'

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

export const sensitivityProfiles: Record<SensitivityProfile, Omit<ParameterDescriptor, 'unit' | 'precision'>> = {
  default: { min: 0, max: 1, step: 1, defaultValue: 0, profile: 'default' },
  integer: { min: 0, max: 1, step: 1, defaultValue: 0, profile: 'integer' },
  frequency: { min: 20, max: 20_000, step: 1, defaultValue: 1000, profile: 'frequency' },
  'gain-db': { min: -96, max: 12, step: 0.1, defaultValue: 0, profile: 'gain-db' },
  'time-ms': { min: 0, max: 10_000, step: 1, defaultValue: 0, profile: 'time-ms' },
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
    profile: 'default',
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
