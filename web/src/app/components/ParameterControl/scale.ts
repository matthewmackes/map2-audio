import type { ParameterDescriptor } from '../../data/parameterSchema'
import { clampNumericValue, quantizeToStep } from '../NumericInput/numericInputLogic'

const MIN_LOG_VALUE = 1e-6

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

export function clampValue(value: number, descriptor: ParameterDescriptor): number {
  return clampNumericValue(value, descriptor)
}

export function snapValue(
  value: number,
  descriptor: ParameterDescriptor,
  step = descriptor.step,
): number {
  return quantizeToStep(clampValue(value, descriptor), descriptor, step)
}

export function normalizeValue(value: number, descriptor: ParameterDescriptor): number {
  const clamped = clampValue(value, descriptor)
  const scale = descriptor.scale ?? 'linear'

  if (scale === 'log') {
    const min = Math.max(descriptor.min, MIN_LOG_VALUE)
    const max = Math.max(descriptor.max, min + MIN_LOG_VALUE)
    return clamp01((Math.log(clamped) - Math.log(min)) / (Math.log(max) - Math.log(min)))
  }

  if (scale === 'skew') {
    const position = (clamped - descriptor.min) / (descriptor.max - descriptor.min)
    const exponent = descriptor.skewExponent ?? 2
    return clamp01(Math.pow(position, 1 / exponent))
  }

  return clamp01((clamped - descriptor.min) / (descriptor.max - descriptor.min))
}

export function denormalizeValue(position: number, descriptor: ParameterDescriptor): number {
  const normalizedPosition = clamp01(position)
  const scale = descriptor.scale ?? 'linear'

  if (scale === 'log') {
    const min = Math.max(descriptor.min, MIN_LOG_VALUE)
    const max = Math.max(descriptor.max, min + MIN_LOG_VALUE)
    return snapValue(min * Math.exp(normalizedPosition * (Math.log(max) - Math.log(min))), descriptor)
  }

  if (scale === 'skew') {
    const exponent = descriptor.skewExponent ?? 2
    return snapValue(
      descriptor.min + Math.pow(normalizedPosition, exponent) * (descriptor.max - descriptor.min),
      descriptor,
    )
  }

  return snapValue(
    descriptor.min + normalizedPosition * (descriptor.max - descriptor.min),
    descriptor,
  )
}
