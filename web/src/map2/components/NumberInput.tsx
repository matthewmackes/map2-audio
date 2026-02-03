import React, { useState, useCallback, useEffect } from 'react'
import { Box, IconButton, TextField, Typography, InputAdornment } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'

interface NumberInputProps {
  label?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange?: (value: number) => void
  onChangeCommitted?: (value: number) => void
  disabled?: boolean
  size?: 'small' | 'medium'
  sx?: object
  fullWidth?: boolean
}

export function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  onChangeCommitted,
  disabled = false,
  size = 'small',
  sx = {},
  fullWidth = false
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
    if (step < 0.01) return v.toFixed(3)
    if (step < 0.1) return v.toFixed(2)
    if (step < 1) return v.toFixed(1)
    return v.toFixed(0)
  }, [step])

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
      onChangeCommitted?.(clamped)
    }
  }, [inputText, clamp, onChange, onChangeCommitted])

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
    onChangeCommitted?.(newValue)
  }, [disabled, clamp, localValue, step, onChange, onChangeCommitted])

  const decrement = useCallback(() => {
    if (disabled) return
    const newValue = clamp(localValue - step)
    setLocalValue(newValue)
    onChange?.(newValue)
    onChangeCommitted?.(newValue)
  }, [disabled, clamp, localValue, step, onChange, onChangeCommitted])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', ...sx }}>
      {label && (
        <Typography variant="caption" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', width: fullWidth ? '100%' : 'auto' }}>
        <IconButton
          size="small"
          onClick={decrement}
          disabled={disabled || localValue <= min}
          sx={{ p: 0.5 }}
        >
          <RemoveIcon fontSize="small" />
        </IconButton>
        <TextField
          size={size}
          value={isEditing ? inputText : `${formatValue(localValue)}${unit ? ` ${unit}` : ''}`}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          disabled={disabled}
          sx={{
            mx: 0.5,
            width: fullWidth ? '100%' : 80,
            '& .MuiInputBase-input': {
              textAlign: 'center',
              py: size === 'small' ? 0.5 : 1,
            },
          }}
          InputProps={{
            endAdornment: unit && !isEditing ? undefined : undefined,
          }}
        />
        <IconButton
          size="small"
          onClick={increment}
          disabled={disabled || localValue >= max}
          sx={{ p: 0.5 }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  )
}

export default NumberInput
