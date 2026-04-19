import React from 'react'

import { ParameterKnob } from '../ParameterControl'

interface MPX1KnobProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  size?: number
  compact?: boolean
  formatter?: (value: number) => string
  onChange: (value: number) => void
}

function resolveKnobSize(size: number, compact: boolean) {
  if (compact || size <= 72) {
    return 'small' as const
  }
  if (size >= 112) {
    return 'large' as const
  }
  return 'medium' as const
}

export function MPX1Knob({
  label,
  value,
  min,
  max,
  step = 0,
  disabled = false,
  size = 96,
  compact = false,
  formatter,
  onChange,
}: MPX1KnobProps) {
  return (
    <ParameterKnob
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      size={resolveKnobSize(size, compact)}
      showBounds={false}
      valueFormatter={formatter}
      accentColor="#38bdf8"
      className={`mpx1-knob${disabled ? ' is-disabled' : ''}${compact ? ' is-compact' : ''}`}
      onChange={onChange}
    />
  )
}
