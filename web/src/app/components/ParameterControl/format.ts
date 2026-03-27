import type { ParameterDescriptor } from '../../data/parameterSchema'
import { clampValue } from './scale'

function trimNumericString(value: string): string {
  if (!value.includes('.')) {
    return value
  }
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/\.$/, '')
}

function formatWithPrecision(value: number, precision: number): string {
  return trimNumericString(value.toFixed(Math.max(0, precision)))
}

interface FormatParameterValueOptions {
  includeUnit?: boolean
}

export function formatParameterValue(
  value: number,
  descriptor: ParameterDescriptor,
  options: FormatParameterValueOptions = {},
): string {
  const clamped = clampValue(value, descriptor)
  const precision = descriptor.precision ?? 0
  const includeUnit = options.includeUnit ?? true
  const unit = descriptor.unit.trim()

  if (unit === 'Hz' && Math.abs(clamped) >= 1000) {
    const valueText = `${formatWithPrecision(clamped / 1000, Math.max(0, precision + 1))}k`
    return includeUnit ? `${valueText}Hz` : valueText
  }

  if (unit === 'ms' && Math.abs(clamped) >= 1000) {
    const valueText = formatWithPrecision(clamped / 1000, Math.max(0, precision + 1))
    return includeUnit ? `${valueText} s` : valueText
  }

  if (unit === 'dB') {
    const sign = clamped > 0 ? '+' : ''
    const valueText = `${sign}${formatWithPrecision(clamped, precision)}`
    return includeUnit ? `${valueText} dB` : valueText
  }

  const formatted = formatWithPrecision(clamped, precision)
  return includeUnit && unit ? `${formatted} ${unit}` : formatted
}

export function formatEditableParameterValue(value: number, descriptor: ParameterDescriptor): string {
  return formatWithPrecision(clampValue(value, descriptor), descriptor.precision ?? 0)
}

export function parseParameterValue(value: string, descriptor: ParameterDescriptor): number | null {
  const numeric = Number(value.replace(/[^0-9+\-.]/g, ''))
  if (!Number.isFinite(numeric)) {
    return null
  }
  return clampValue(numeric, descriptor)
}
