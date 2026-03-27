import type { ParameterDescriptor } from '../../data/parameterSchema'
import { formatParameterValue } from './format'

interface ParameterValueDisplayProps {
  descriptor: ParameterDescriptor
  value: number
  formatter?: (value: number) => string
  className?: string
}

export function ParameterValueDisplay({
  descriptor,
  value,
  formatter,
  className = '',
}: ParameterValueDisplayProps) {
  return (
    <span className={className}>
      {formatter ? formatter(value) : formatParameterValue(value, descriptor)}
    </span>
  )
}
