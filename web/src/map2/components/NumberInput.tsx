import type { CSSProperties } from 'react'

import { createParameterDescriptor, type SensitivityProfile } from '../../app/data/parameterSchema'
import { ParameterNumericInput } from '../../app/components/ParameterControl'

interface NumberInputProps {
  label?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  defaultValue?: number
  precision?: number
  profile?: SensitivityProfile
  onChange?: (value: number) => void
  onChangeCommitted?: (value: number) => void
  disabled?: boolean
  size?: 'small' | 'medium' | 'large' | 'responsive'
  sx?: object
  fullWidth?: boolean
  showLabel?: boolean
  showBounds?: boolean
  valueFormatter?: (value: number) => string
  inline?: boolean
  accentColor?: string
  className?: string
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
  onChangeCommitted,
  disabled = false,
  size = 'small',
  sx = {},
  fullWidth = false,
  showLabel = true,
  showBounds = false,
  valueFormatter,
  inline = false,
  accentColor = '#0f62fe',
  className = '',
}: NumberInputProps) {
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
    <div style={{ width: fullWidth ? '100%' : undefined, ...(sx as CSSProperties) }}>
      <ParameterNumericInput
        label={label}
        ariaLabel={label}
        descriptor={descriptor}
        value={value}
        onLiveChange={(nextValue) => onChange?.(nextValue)}
        onCommit={(nextValue) => onChangeCommitted?.(nextValue)}
        commitStrategy="legacy"
        disabled={disabled}
        size={size}
        showLabel={showLabel}
        showBounds={showBounds}
        valueFormatter={valueFormatter}
        inline={inline}
        accentColor={accentColor}
        className={className}
      />
    </div>
  )
}

export default NumberInput
