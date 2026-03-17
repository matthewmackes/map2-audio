import type { CSSProperties } from 'react'
import type { ReactNode } from 'react'

import { createParameterDescriptor, type SensitivityProfile } from '../../data/parameterSchema'
import { NumericInput } from '../NumericInput/NumericInput'

interface NumberInputProps {
  label?: string
  value: number | null
  min: number
  max: number
  step?: number
  unit?: string
  defaultValue?: number
  precision?: number
  profile?: SensitivityProfile
  onChange?: (value: number) => void
  onChangeEnd?: () => void
  onClear?: () => void
  disabled?: boolean
  size?: 'small' | 'medium' | 'large' | 'responsive'
  showLabel?: boolean
  showBounds?: boolean
  valueFormatter?: (value: number) => string
  displayOverlay?: ReactNode
  inline?: boolean
  accentColor?: string
  className?: string
  fullWidth?: boolean
  style?: CSSProperties
  nullable?: boolean
}

export function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  defaultValue = value,
  precision,
  profile,
  onChange,
  onChangeEnd,
  onClear,
  disabled = false,
  size = 'medium',
  showLabel = true,
  showBounds = false,
  valueFormatter,
  displayOverlay,
  inline = false,
  accentColor = '#0f62fe',
  className = '',
  fullWidth = false,
  style,
  nullable = false,
}: NumberInputProps) {
  const numericValue = value ?? min
  const descriptor = createParameterDescriptor({
    min,
    max,
    step,
    unit,
    defaultValue,
    name: label,
    symbol: label,
    precision,
    profile,
  })

  return (
    <div style={{ width: fullWidth ? '100%' : undefined, ...style, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
      <NumericInput
        label={label}
        ariaLabel={label}
        descriptor={descriptor}
        value={numericValue}
        onChange={(nextValue) => onChange?.(nextValue)}
        onChangeEnd={() => onChangeEnd?.()}
        disabled={disabled}
        size={size}
        showLabel={showLabel}
        inline={inline}
        showBounds={showBounds}
        valueFormatter={valueFormatter}
        displayOverlay={displayOverlay}
        accentColor={accentColor}
        className={className}
      />
      {nullable && onClear && (
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          aria-label={label ? `Clear ${label}` : 'Clear value'}
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
      )}
    </div>
  )
}

export default NumberInput
