import type { ParameterDescriptor, SensitivityProfile } from '../../data/parameterSchema'

export interface NumericInputModifiers {
  fine?: boolean
}

export interface NumericInputDeltaRequest {
  value: number
  deltaSteps: number
  descriptor: ParameterDescriptor
  modifiers?: NumericInputModifiers
  velocity?: number
}

export interface NumericInputAccelerationProfile {
  minVelocity: number
  multiplier: number
}

const FINE_DIVISOR_BY_PROFILE: Record<SensitivityProfile, number> = {
  default: 10,
  integer: 1,
  frequency: 20,
  'gain-db': 10,
  'time-ms': 10,
}

const ACCELERATION_BY_PROFILE: Record<SensitivityProfile, NumericInputAccelerationProfile[]> = {
  default: [
    { minVelocity: 0.5, multiplier: 1.5 },
    { minVelocity: 1.5, multiplier: 2 },
    { minVelocity: 3, multiplier: 4 },
  ],
  integer: [
    { minVelocity: 0.5, multiplier: 2 },
    { minVelocity: 1.5, multiplier: 4 },
    { minVelocity: 3, multiplier: 8 },
  ],
  frequency: [
    { minVelocity: 0.5, multiplier: 2 },
    { minVelocity: 1.25, multiplier: 5 },
    { minVelocity: 2.5, multiplier: 10 },
  ],
  'gain-db': [
    { minVelocity: 0.5, multiplier: 1.5 },
    { minVelocity: 1.5, multiplier: 3 },
    { minVelocity: 3, multiplier: 6 },
  ],
  'time-ms': [
    { minVelocity: 0.5, multiplier: 1.5 },
    { minVelocity: 1.5, multiplier: 2.5 },
    { minVelocity: 3, multiplier: 5 },
  ],
}

function getPrecision(step: number, fallback = 6): number {
  const serialized = step.toString()
  if (!serialized.includes('.')) {
    return 0
  }
  return Math.min(fallback, serialized.split('.')[1]?.length ?? 0)
}

export function clampNumericValue(value: number, descriptor: ParameterDescriptor): number {
  if (value <= descriptor.min) {
    return descriptor.min
  }
  if (value >= descriptor.max) {
    return descriptor.max
  }
  return value
}

export function getFineStep(descriptor: ParameterDescriptor): number {
  const divisor = FINE_DIVISOR_BY_PROFILE[descriptor.profile] ?? 10
  if (divisor <= 1) {
    return descriptor.step
  }
  return descriptor.step / divisor
}

export function getEffectiveStep(descriptor: ParameterDescriptor, modifiers?: NumericInputModifiers): number {
  return modifiers?.fine ? getFineStep(descriptor) : descriptor.step
}

export function quantizeToStep(value: number, descriptor: ParameterDescriptor, step = descriptor.step): number {
  const offset = value - descriptor.min
  const snapped = descriptor.min + Math.round(offset / step) * step
  const precision = Math.max(descriptor.precision ?? 0, getPrecision(step))
  const rounded = Number(snapped.toFixed(precision))
  return clampNumericValue(rounded, descriptor)
}

export function getAccelerationMultiplier(
  descriptor: ParameterDescriptor,
  velocity?: number,
): number {
  if (velocity == null || !Number.isFinite(velocity) || velocity <= 0) {
    return 1
  }

  const profile = ACCELERATION_BY_PROFILE[descriptor.profile] ?? ACCELERATION_BY_PROFILE.default
  let multiplier = 1
  for (const entry of profile) {
    if (velocity >= entry.minVelocity) {
      multiplier = entry.multiplier
    }
  }
  return multiplier
}

export function applyNumericDelta({
  value,
  deltaSteps,
  descriptor,
  modifiers,
  velocity,
}: NumericInputDeltaRequest): number {
  if (!Number.isFinite(value) || !Number.isFinite(deltaSteps) || deltaSteps === 0) {
    return quantizeToStep(clampNumericValue(value, descriptor), descriptor, getEffectiveStep(descriptor, modifiers))
  }

  const effectiveStep = getEffectiveStep(descriptor, modifiers)
  const acceleration = modifiers?.fine ? 1 : getAccelerationMultiplier(descriptor, velocity)
  const delta = deltaSteps * effectiveStep * acceleration
  const nextValue = clampNumericValue(value + delta, descriptor)
  return quantizeToStep(nextValue, descriptor, effectiveStep)
}
