/**
 * ParameterKnob Component
 *
 * Minimal rotary knob inspired by Cortex Control / Neural DSP style.
 * Features: SVG-based, vertical drag for value changes, accent ring, label/value display.
 */

import { useState, useCallback, useRef, useEffect } from 'react'

interface ParameterKnobProps {
  label: string
  value: number
  min: number
  max: number
  defaultValue?: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  onChangeEnd?: () => void
  accentColor?: string
  disabled?: boolean
  isLogarithmic?: boolean
  valueFormatter?: (value: number) => string
  size?: 'small' | 'medium' | 'large'
}

// Convert linear position (0-1) to value
function positionToValue(
  position: number,
  min: number,
  max: number,
  isLog: boolean
): number {
  if (isLog && min > 0) {
    const logMin = Math.log(min)
    const logMax = Math.log(max)
    return Math.exp(logMin + position * (logMax - logMin))
  }
  return min + position * (max - min)
}

// Convert value to linear position (0-1)
function valueToPosition(
  value: number,
  min: number,
  max: number,
  isLog: boolean
): number {
  if (isLog && min > 0) {
    const logMin = Math.log(min)
    const logMax = Math.log(max)
    return (Math.log(value) - logMin) / (logMax - logMin)
  }
  return (value - min) / (max - min)
}

// Default value formatter
function defaultFormatter(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  if (Math.abs(value) < 0.01 && value !== 0) {
    return value.toExponential(1)
  }
  if (Number.isInteger(value)) {
    return value.toString()
  }
  return value.toFixed(1)
}

export function ParameterKnob({
  label,
  value,
  min,
  max,
  defaultValue,
  step,
  unit = '',
  onChange,
  onChangeEnd,
  accentColor = '#ff3333',
  disabled = false,
  isLogarithmic = false,
  valueFormatter = defaultFormatter,
  size = 'medium',
}: ParameterKnobProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const dragStartRef = useRef<{ y: number; value: number } | null>(null)
  const knobRef = useRef<HTMLDivElement>(null)

  // Sync local value with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value)
    }
  }, [value, isDragging])

  // Calculate rotation angle (270 degree arc, from -135 to +135)
  const position = valueToPosition(localValue, min, max, isLogarithmic)
  const rotation = -135 + position * 270

  // Size configurations
  const sizeConfig = {
    small: { knobSize: 40, strokeWidth: 3, fontSize: 10 },
    medium: { knobSize: 56, strokeWidth: 4, fontSize: 11 },
    large: { knobSize: 72, strokeWidth: 5, fontSize: 12 },
  }
  const { knobSize, strokeWidth, fontSize } = sizeConfig[size]
  const radius = (knobSize - strokeWidth) / 2
  const center = knobSize / 2

  // Calculate arc path for background and value indicator
  const arcStart = -135 * (Math.PI / 180)
  const arcEnd = 135 * (Math.PI / 180)
  const valueArcEnd = (-135 + position * 270) * (Math.PI / 180)

  const describeArc = (startAngle: number, endAngle: number): string => {
    const start = {
      x: center + radius * Math.cos(startAngle - Math.PI / 2),
      y: center + radius * Math.sin(startAngle - Math.PI / 2),
    }
    const end = {
      x: center + radius * Math.cos(endAngle - Math.PI / 2),
      y: center + radius * Math.sin(endAngle - Math.PI / 2),
    }
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return
      e.preventDefault()
      setIsDragging(true)
      dragStartRef.current = { y: e.clientY, value: localValue }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragStartRef.current) return

        // Vertical drag: up = increase, down = decrease
        const deltaY = dragStartRef.current.y - moveEvent.clientY
        const sensitivity = moveEvent.shiftKey ? 0.001 : 0.005 // Fine control with Shift
        const deltaPosition = deltaY * sensitivity

        const startPosition = valueToPosition(
          dragStartRef.current.value,
          min,
          max,
          isLogarithmic
        )
        const newPosition = Math.max(0, Math.min(1, startPosition + deltaPosition))
        let newValue = positionToValue(newPosition, min, max, isLogarithmic)

        // Apply step if specified
        if (step) {
          newValue = Math.round(newValue / step) * step
        }
        newValue = Math.max(min, Math.min(max, newValue))

        setLocalValue(newValue)
        onChange(newValue)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        dragStartRef.current = null
        onChangeEnd?.()
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [disabled, localValue, min, max, step, isLogarithmic, onChange, onChangeEnd]
  )

  // Handle wheel scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (disabled) return
      e.preventDefault()

      const delta = e.deltaY < 0 ? 0.02 : -0.02
      const currentPosition = valueToPosition(localValue, min, max, isLogarithmic)
      const newPosition = Math.max(0, Math.min(1, currentPosition + delta))
      let newValue = positionToValue(newPosition, min, max, isLogarithmic)

      if (step) {
        newValue = Math.round(newValue / step) * step
      }
      newValue = Math.max(min, Math.min(max, newValue))

      setLocalValue(newValue)
      onChange(newValue)
      onChangeEnd?.()
    },
    [disabled, localValue, min, max, step, isLogarithmic, onChange, onChangeEnd]
  )

  // Handle double-click to reset
  const handleDoubleClick = useCallback(() => {
    if (disabled) return
    const resetValue = defaultValue ?? (min + max) / 2
    setLocalValue(resetValue)
    onChange(resetValue)
    onChangeEnd?.()
  }, [disabled, defaultValue, min, max, onChange, onChangeEnd])

  return (
    <div
      className={`param-knob ${disabled ? 'disabled' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ '--knob-accent': accentColor } as React.CSSProperties}
    >
      {/* Label */}
      <div className="param-knob-label" style={{ fontSize }}>
        {label}
      </div>

      {/* Knob */}
      <div
        ref={knobRef}
        className="param-knob-dial"
        style={{ width: knobSize, height: knobSize }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={localValue}
        tabIndex={disabled ? -1 : 0}
      >
        <svg width={knobSize} height={knobSize} viewBox={`0 0 ${knobSize} ${knobSize}`}>
          {/* Background arc (dark) */}
          <path
            d={describeArc(arcStart, arcEnd)}
            fill="none"
            stroke="#333"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Value arc (accent color) */}
          {position > 0.01 && (
            <path
              d={describeArc(arcStart, valueArcEnd)}
              fill="none"
              stroke={accentColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={{
                filter: isDragging ? `drop-shadow(0 0 4px ${accentColor})` : 'none',
              }}
            />
          )}

          {/* Inner circle (knob body) */}
          <circle
            cx={center}
            cy={center}
            r={radius - strokeWidth - 2}
            fill="#1a1a1a"
            stroke="#444"
            strokeWidth={1}
          />

          {/* Indicator line */}
          <line
            x1={center}
            y1={center}
            x2={center}
            y2={center - radius + strokeWidth + 4}
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            transform={`rotate(${rotation}, ${center}, ${center})`}
          />
        </svg>
      </div>

      {/* Value */}
      <div className="param-knob-value" style={{ fontSize }}>
        {valueFormatter(localValue)}{unit && ` ${unit}`}
      </div>
    </div>
  )
}

export default ParameterKnob
