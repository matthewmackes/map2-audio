import React, { useState, useCallback, useEffect } from 'react'

interface NumberInputProps {
  label?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange?: (value: number) => void
  onChangeEnd?: () => void
  disabled?: boolean
  size?: 'small' | 'medium'
  showLabel?: boolean
  valueFormatter?: (value: number) => string
  inline?: boolean
}

export function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  onChangeEnd,
  disabled = false,
  size = 'medium',
  showLabel = true,
  valueFormatter,
  inline = false
}: NumberInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const [isEditing, setIsEditing] = useState(false)
  const [inputText, setInputText] = useState('')

  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value)
    }
  }, [value, isEditing])

  const formatValue = useCallback((v: number) => {
    if (valueFormatter) return valueFormatter(v)
    // Auto-format based on step size
    if (step < 0.01) return v.toFixed(3)
    if (step < 0.1) return v.toFixed(2)
    if (step < 1) return v.toFixed(1)
    return v.toFixed(0)
  }, [valueFormatter, step])

  const clamp = useCallback((v: number) => {
    return Math.min(max, Math.max(min, v))
  }, [min, max])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value)
  }, [])

  const handleInputBlur = useCallback(() => {
    setIsEditing(false)
    const parsed = parseFloat(inputText)
    if (!isNaN(parsed)) {
      const clamped = clamp(parsed)
      setLocalValue(clamped)
      onChange?.(clamped)
      onChangeEnd?.()
    }
  }, [inputText, clamp, onChange, onChangeEnd])

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur()
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setInputText('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newValue = clamp(localValue + step)
      setLocalValue(newValue)
      setInputText(formatValue(newValue))
      onChange?.(newValue)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newValue = clamp(localValue - step)
      setLocalValue(newValue)
      setInputText(formatValue(newValue))
      onChange?.(newValue)
    }
  }, [handleInputBlur, clamp, localValue, step, formatValue, onChange])

  const handleFocus = useCallback(() => {
    setIsEditing(true)
    setInputText(formatValue(localValue))
  }, [formatValue, localValue])

  const increment = useCallback(() => {
    if (disabled) return
    const newValue = clamp(localValue + step)
    setLocalValue(newValue)
    onChange?.(newValue)
    onChangeEnd?.()
  }, [disabled, clamp, localValue, step, onChange, onChangeEnd])

  const decrement = useCallback(() => {
    if (disabled) return
    const newValue = clamp(localValue - step)
    setLocalValue(newValue)
    onChange?.(newValue)
    onChangeEnd?.()
  }, [disabled, clamp, localValue, step, onChange, onChangeEnd])

  const inputHeight = size === 'small' ? 24 : 32
  const fontSize = size === 'small' ? 11 : 13
  const buttonWidth = size === 'small' ? 20 : 24

  const containerStyle: React.CSSProperties = inline
    ? { display: 'inline-flex', alignItems: 'center', gap: 6 }
    : { marginBottom: 12 }

  return (
    <div style={containerStyle}>
      {showLabel && label && !inline && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ fontSize: 12, color: '#888' }}>
            {label}
          </label>
        </div>
      )}
      {showLabel && label && inline && (
        <label style={{ fontSize: fontSize, color: '#888', marginRight: 4 }}>
          {label}
        </label>
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: disabled ? '#1a1a2e' : '#252540',
        borderRadius: 4,
        border: '1px solid #3a3a5a',
        overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
      }}>
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || localValue <= min}
          style={{
            width: buttonWidth,
            height: inputHeight,
            border: 'none',
            background: 'transparent',
            color: disabled || localValue <= min ? '#555' : '#888',
            cursor: disabled || localValue <= min ? 'not-allowed' : 'pointer',
            fontSize: fontSize + 2,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          −
        </button>
        <input
          type="text"
          value={isEditing ? inputText : `${formatValue(localValue)}${unit ? ` ${unit}` : ''}`}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          disabled={disabled}
          style={{
            width: size === 'small' ? 50 : 70,
            height: inputHeight,
            border: 'none',
            background: 'transparent',
            color: '#f2f6ff',
            fontSize: fontSize,
            fontWeight: 500,
            textAlign: 'center',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          type="button"
          onClick={increment}
          disabled={disabled || localValue >= max}
          style={{
            width: buttonWidth,
            height: inputHeight,
            border: 'none',
            background: 'transparent',
            color: disabled || localValue >= max ? '#555' : '#888',
            cursor: disabled || localValue >= max ? 'not-allowed' : 'pointer',
            fontSize: fontSize + 2,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}
