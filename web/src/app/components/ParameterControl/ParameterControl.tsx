import type { ParameterCommitStrategy, ParameterDescriptor } from '../../data/parameterSchema'
import { ParameterKnob } from './ParameterKnob'
import { ParameterNumericInput } from './ParameterNumericInput'
import { ParameterSlider } from './ParameterSlider'

export type ParameterControlVariant = 'auto' | 'knob' | 'slider' | 'numeric'

export interface ParameterControlProps {
  descriptor: ParameterDescriptor
  value: number
  variant?: ParameterControlVariant
  onLiveChange?: (value: number) => void
  onCommit?: (value: number) => void
  commitStrategy?: ParameterCommitStrategy | 'legacy'
  label?: string
  ariaLabel?: string
  accentColor?: string
  className?: string
  disabled?: boolean
  inline?: boolean
  showBounds?: boolean
  showLabel?: boolean
  size?: 'small' | 'medium' | 'large' | 'responsive'
  valueFormatter?: (value: number) => string
}

function resolveVariant(
  explicitVariant: ParameterControlVariant | undefined,
  descriptor: ParameterDescriptor,
): Exclude<ParameterControlVariant, 'auto'> {
  if (explicitVariant && explicitVariant !== 'auto') {
    return explicitVariant
  }

  if (descriptor.classification === 'CALIBRATION') {
    return 'numeric'
  }

  if (descriptor.scale === 'log') {
    return 'knob'
  }

  return 'slider'
}

export function ParameterControl({
  variant = 'auto',
  ...props
}: ParameterControlProps) {
  const resolvedVariant = resolveVariant(variant, props.descriptor)

  if (resolvedVariant === 'knob') {
    return <ParameterKnob {...props} />
  }

  if (resolvedVariant === 'slider') {
    return <ParameterSlider {...props} />
  }

  return <ParameterNumericInput {...props} />
}
