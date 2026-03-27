import type { ReactNode } from 'react'

import type { ParameterCommitStrategy, ParameterDescriptor } from '../../data/parameterSchema'
import { formatParameterValue } from './format'
import { useParameterControlState } from './useParameterControlState'
import { NumericInput } from '../NumericInput/NumericInput'

export interface ParameterNumericInputProps {
  descriptor: ParameterDescriptor
  value: number
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
  displayOverlay?: ReactNode
}

export function ParameterNumericInput({
  descriptor,
  value,
  onLiveChange,
  onCommit,
  commitStrategy,
  label,
  ariaLabel,
  accentColor,
  className,
  disabled,
  inline,
  showBounds,
  showLabel,
  size,
  valueFormatter,
  displayOverlay,
}: ParameterNumericInputProps) {
  const controlState = useParameterControlState({
    descriptor,
    value,
    onLiveChange,
    onCommit,
    commitStrategy,
    valueFormatter,
  })

  return (
    <NumericInput
      descriptor={controlState.descriptor}
      value={controlState.liveValue}
      onChange={controlState.setLiveValue}
      onChangeEnd={controlState.commitValue}
      commitStrategy={controlState.commitStrategy}
      label={label}
      ariaLabel={ariaLabel}
      accentColor={accentColor}
      className={className}
      disabled={disabled}
      inline={inline}
      showBounds={showBounds}
      showLabel={showLabel}
      size={size}
      valueFormatter={valueFormatter ?? ((nextValue) => formatParameterValue(nextValue, descriptor, { includeUnit: false }))}
      displayOverlay={displayOverlay}
    />
  )
}
