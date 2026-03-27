import type { ReactNode } from 'react'

import { createParameterDescriptor, type SensitivityProfile } from '../../data/parameterSchema'
import { ParameterSlider as SharedParameterSlider } from '../ParameterControl'

interface ParameterSliderProps {
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
  disabled?: boolean
  size?: 'small' | 'medium' | 'large' | 'responsive'
  showLabel?: boolean
  showBounds?: boolean
  valueFormatter?: (value: number) => string
  displayOverlay?: ReactNode
  inline?: boolean
  accentColor?: string
  className?: string
}

export function ParameterSlider({
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
  disabled = false,
  size = 'medium',
  showLabel = true,
  showBounds = false,
  valueFormatter,
  displayOverlay,
  inline = false,
  accentColor = '#0f62fe',
  className = '',
}: ParameterSliderProps) {
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
    <SharedParameterSlider
      label={label}
      ariaLabel={label}
      descriptor={descriptor}
      value={value ?? min}
      onLiveChange={(nextValue) => onChange?.(nextValue)}
      onCommit={() => onChangeEnd?.()}
      commitStrategy="legacy"
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
  )
}

export default ParameterSlider
