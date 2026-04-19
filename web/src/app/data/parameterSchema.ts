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

export type ParameterScale = 'linear' | 'log' | 'skew'

export type ParameterClassification =
  | 'CONTINUOUS_LINEAR'
  | 'CONTINUOUS_LOG'
  | 'CONTINUOUS_SKEWED'
  | 'STEPPED_NUMERIC'
  | 'CALIBRATION'

export type ParameterCommitStrategy = 'pointer-up' | 'blur' | 'idle' | 'explicit'

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
  scale?: ParameterScale
  fineStep?: number
  largeStep?: number
  classification?: ParameterClassification
  commitStrategy?: ParameterCommitStrategy
  skewExponent?: number
}

export type ParameterRegistry = Record<string, ParameterDescriptor>

export interface NormalizedParameterDescriptor extends ParameterDescriptor {
  precision: number
  scale: ParameterScale
  fineStep: number
  largeStep: number
  classification: ParameterClassification
  commitStrategy: ParameterCommitStrategy
}

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
  scale?: ParameterScale
  fineStep?: number
  largeStep?: number
  classification?: ParameterClassification
  commitStrategy?: ParameterCommitStrategy
  skewExponent?: number
}

export interface ParameterDescriptorLookup {
  pluginId?: string | null
  paramKey?: string | null
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
  [buildParameterKey('drums', 'transportSwing')]: {
    min: 0,
    max: 100,
    step: 1,
    unit: '%',
    defaultValue: 0,
    profile: 'default',
    precision: 0,
    classification: 'CONTINUOUS_LINEAR',
    fineStep: 1,
    largeStep: 5,
    commitStrategy: 'pointer-up',
  },
  [buildParameterKey('map2://juce/eq/parametric', 'bandFrequency')]: {
    min: 20,
    max: 20_000,
    step: 1,
    unit: 'Hz',
    defaultValue: 1000,
    profile: 'frequency',
    precision: 0,
    scale: 'log',
    classification: 'CONTINUOUS_LOG',
    fineStep: 1,
    largeStep: 500,
    commitStrategy: 'pointer-up',
  },
  [buildParameterKey('map2://juce/multieffect/passionfx', 'phaserStages')]: {
    min: 2,
    max: 16,
    step: 2,
    unit: '',
    defaultValue: 4,
    profile: 'integer',
    precision: 0,
    classification: 'STEPPED_NUMERIC',
    fineStep: 2,
    largeStep: 4,
    commitStrategy: 'pointer-up',
  },
}

export const parameterSchema: ParameterRegistry = {}

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

const CALIBRATION_HINTS = [
  'buffer',
  'calibration',
  'deadzone',
  'latency',
  'trim',
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

export function inferParameterScale(
  seed: Pick<ParameterDescriptorSeed, 'name' | 'symbol' | 'unit' | 'profile'>,
): ParameterScale {
  if (seed.profile === 'frequency' || seed.profile === 'time-ms') {
    return 'log'
  }

  const token = `${seed.name ?? ''} ${seed.symbol ?? ''} ${seed.unit ?? ''}`.toLowerCase()
  if (
    token.includes('hz')
    || token.includes('freq')
    || token.includes('frequency')
    || token.includes('cutoff')
    || token.includes('attack')
    || token.includes('release')
    || token.includes('delay')
    || token.includes('time')
    || token.includes('decay')
  ) {
    return 'log'
  }

  return 'linear'
}

export function inferParameterClassification(
  seed: Pick<ParameterDescriptorSeed, 'min' | 'max' | 'step' | 'name' | 'symbol' | 'unit' | 'profile' | 'scale'>,
): ParameterClassification {
  const scale = seed.scale ?? inferParameterScale(seed)
  const token = `${seed.name ?? ''} ${seed.symbol ?? ''} ${seed.unit ?? ''}`.toLowerCase()

  if (CALIBRATION_HINTS.some((hint) => token.includes(hint))) {
    return 'CALIBRATION'
  }

  if (
    scale === 'linear'
    && Number.isInteger(seed.min)
    && Number.isInteger(seed.max)
    && (seed.step == null || Number.isInteger(seed.step))
  ) {
    return 'STEPPED_NUMERIC'
  }

  if (scale === 'log') {
    return 'CONTINUOUS_LOG'
  }

  if (scale === 'skew') {
    return 'CONTINUOUS_SKEWED'
  }

  return 'CONTINUOUS_LINEAR'
}

function deriveFineStep(
  step: number,
  profile: SensitivityProfile,
  explicitFineStep?: number,
): number {
  if (Number.isFinite(explicitFineStep) && (explicitFineStep as number) > 0) {
    return explicitFineStep as number
  }

  const divisor = sensitivityProfiles[profile]?.fineDivisor ?? sensitivityProfiles.default.fineDivisor
  if (divisor <= 1) {
    return step
  }
  return step / divisor
}

function deriveLargeStep(
  step: number,
  min: number,
  max: number,
  classification: ParameterClassification,
  explicitLargeStep?: number,
): number {
  if (Number.isFinite(explicitLargeStep) && (explicitLargeStep as number) > 0) {
    return explicitLargeStep as number
  }

  const span = Math.max(step, max - min)
  const defaultLargeStep = classification === 'STEPPED_NUMERIC'
    ? Math.max(step, Math.round(step * 10))
    : step * 10

  return Math.min(span, defaultLargeStep)
}

function deriveCommitStrategy(
  classification: ParameterClassification,
  explicitCommitStrategy?: ParameterCommitStrategy,
): ParameterCommitStrategy {
  if (explicitCommitStrategy) {
    return explicitCommitStrategy
  }

  return classification === 'CALIBRATION' ? 'blur' : 'pointer-up'
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

export function normalizeParameterDescriptor(seed: ParameterDescriptorSeed): NormalizedParameterDescriptor {
  const profile = seed.profile ?? inferSensitivityProfile(seed)
  const min = Number.isFinite(seed.min) ? seed.min : 0
  const max = Number.isFinite(seed.max) && seed.max > min ? seed.max : min + 1
  const step = seed.step && seed.step > 0 ? seed.step : inferDescriptorStep({ min, max, profile })
  const precision = derivePrecision(step, seed.precision) ?? 0
  const defaultUnit = sensitivityProfiles[profile].defaultUnit ?? ''
  const defaultValue = Number.isFinite(seed.defaultValue)
    ? Math.min(max, Math.max(min, seed.defaultValue as number))
    : min
  const scale = seed.scale ?? inferParameterScale({ ...seed, profile })
  const classification = seed.classification ?? inferParameterClassification({
    ...seed,
    min,
    max,
    step,
    profile,
    scale,
  })
  const fineStep = deriveFineStep(step, profile, seed.fineStep)
  const largeStep = deriveLargeStep(step, min, max, classification, seed.largeStep)
  const commitStrategy = deriveCommitStrategy(classification, seed.commitStrategy)

  return {
    min,
    max,
    step,
    unit: seed.unit ?? defaultUnit,
    defaultValue,
    profile,
    precision,
    scale,
    fineStep,
    largeStep,
    classification,
    commitStrategy,
    skewExponent: seed.skewExponent,
  }
}

function normalizeRegistry(registry: ParameterRegistry): ParameterRegistry {
  return Object.fromEntries(
    Object.entries(registry).map(([key, descriptor]) => [key, normalizeParameterDescriptor(descriptor)]),
  )
}

export function createParameterDescriptor(seed: ParameterDescriptorSeed): NormalizedParameterDescriptor {
  return normalizeParameterDescriptor(seed)
}

export function resolveParameterDescriptor(
  seed: ParameterDescriptorSeed,
  lookup: ParameterDescriptorLookup = {},
): NormalizedParameterDescriptor {
  const pluginId = typeof lookup.pluginId === 'string' ? lookup.pluginId.trim() : ''
  const paramKey = typeof lookup.paramKey === 'string' ? lookup.paramKey.trim() : ''
  const canonicalDescriptor = pluginId && paramKey ? getParameterDescriptor(pluginId, paramKey) : undefined

  return normalizeParameterDescriptor({
    ...seed,
    ...(canonicalDescriptor ?? {}),
  })
}

export function hydrateParameterSchema(registry: ParameterRegistry): ParameterRegistry {
  for (const key of Object.keys(parameterSchema)) {
    delete parameterSchema[key]
  }

  const normalizedRegistry = normalizeRegistry(registry)

  Object.assign(parameterSchema, normalizeRegistry(baseParameterSchema), normalizedRegistry)
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
    const normalized = normalizeParameterDescriptor(descriptor)
    const validScale = ['linear', 'log', 'skew'].includes(normalized.scale)
    const validClassification = [
      'CONTINUOUS_LINEAR',
      'CONTINUOUS_LOG',
      'CONTINUOUS_SKEWED',
      'STEPPED_NUMERIC',
      'CALIBRATION',
    ].includes(normalized.classification)
    const validCommitStrategy = ['pointer-up', 'blur', 'idle', 'explicit'].includes(normalized.commitStrategy)
    const validPrecision = Number.isFinite(normalized.precision) && normalized.precision >= 0
    const validFineStep = Number.isFinite(normalized.fineStep) && normalized.fineStep > 0
    const validLargeStep = Number.isFinite(normalized.largeStep) && normalized.largeStep > 0

    if (
      !hasBounds
      || !hasStep
      || !hasDefault
      || !validRange
      || !defaultInRange
      || !validProfile
      || !validScale
      || !validClassification
      || !validCommitStrategy
      || !validPrecision
      || !validFineStep
      || !validLargeStep
    ) {
      invalidEntries.push(key)
    }
  }

  return {
    valid: invalidEntries.length === 0,
    invalidEntries,
  }
}

resetParameterSchema()
