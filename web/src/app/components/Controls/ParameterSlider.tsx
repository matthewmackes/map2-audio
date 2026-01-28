import { useState, useCallback } from 'react'

interface ParameterSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange?: (value: number) => void
  showValue?: boolean
  valueFormatter?: (value: number) => string
}

export function ParameterSlider({
  label,
  value,
  min,
  max,
  step = (max - min) / 100,
  unit = '',
  onChange,
  showValue = true,
  valueFormatter = (v) => v.toFixed(1)
}: ParameterSliderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)

  const handleChange = useCallback((newValue: number) => {
    setDisplayValue(newValue)
    onChange?.(newValue)
  }, [onChange])

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: '#888' }}>
          {label}
        </label>
        {showValue && (
          <span style={{ fontSize: 12, color: '#f2f6ff', fontWeight: 500 }}>
            {valueFormatter(displayValue)} {unit}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={() => setIsDragging(false)}
        style={{
          width: '100%',
          height: 6,
          background: '#252540',
          borderRadius: 3,
          cursor: 'pointer',
          outline: 'none',
          accentColor: isDragging ? '#ff6b9d' : '#37d6c9',
          transition: 'accentColor 0.2s ease'
        }}
      />
    </div>
  )
}
