import type { ReactNode } from 'react'

import type { ParameterCommitStrategy, ParameterDescriptor } from '../../data/parameterSchema'
import { formatParameterValue } from './format'
import {
  isDescriptorBackedProps,
  resolveLegacyControlProps,
  type LegacyNumberInputProps,
} from './legacyProps'
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

function SharedParameterNumericInput({
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

function ClearButton({
  ariaLabel,
  disabled,
  onClear,
}: {
  ariaLabel: string
  disabled?: boolean
  onClear: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClear}
      aria-label={ariaLabel}
      style={{
        minHeight: '2rem',
        padding: '0 0.5rem',
        border: '1px solid var(--cds-border-subtle, var(--border))',
        background: 'transparent',
        color: 'var(--cds-text-secondary, var(--text-secondary))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      Clear
    </button>
  )
}

export function ParameterNumericInput(
  props: ParameterNumericInputProps | LegacyNumberInputProps,
) {
  if (isDescriptorBackedProps(props)) {
    return <SharedParameterNumericInput {...props} />
  }

  const resolved = resolveLegacyControlProps(props)
  const input = <SharedParameterNumericInput {...resolved} />

  if (!resolved.containerStyle && !(resolved.nullable && resolved.onClear)) {
    return input
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        ...resolved.containerStyle,
      }}
    >
      {input}
      {resolved.nullable && resolved.onClear ? (
        <ClearButton
          ariaLabel={resolved.label ? `Clear ${resolved.label}` : 'Clear value'}
          disabled={resolved.disabled}
          onClear={resolved.onClear}
        />
      ) : null}
    </div>
  )
}
