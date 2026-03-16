import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent,
} from 'react'

import { sensitivityProfiles, type ParameterDescriptor } from '../../data/parameterSchema'
import { applyNumericDelta, clampNumericValue, quantizeToStep } from './numericInputLogic'
import './NumericInput.css'

export interface NumericInputProps {
  descriptor: ParameterDescriptor
  value: number
  onChange: (value: number) => void
  onChangeEnd?: (value: number) => void
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
}

interface TouchDragState {
  pointerId: number
  startY: number
  startValue: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

function getPrecision(descriptor: ParameterDescriptor): number {
  if (descriptor.precision != null) {
    return descriptor.precision
  }

  const normalized = descriptor.step.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
  if (!normalized.includes('.')) {
    return 0
  }
  return normalized.split('.')[1]?.length ?? 0
}

function trimNumericString(value: string): string {
  if (!value.includes('.')) {
    return value
  }
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/\.$/, '')
}

function formatRawValue(value: number, descriptor: ParameterDescriptor): string {
  const precision = Math.max(0, getPrecision(descriptor))
  return trimNumericString(value.toFixed(precision))
}

function parseInputValue(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function NumericInput({
  descriptor,
  value,
  onChange,
  onChangeEnd,
  label,
  ariaLabel,
  accentColor = '#0f62fe',
  className = '',
  disabled = false,
  inline = false,
  showBounds = !inline,
  showLabel = true,
  size = 'medium',
  valueFormatter,
}: NumericInputProps) {
  const inputId = useId()
  const labelId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const lastCommittedValueRef = useRef(value)
  const lastWheelTsRef = useRef<number>(0)
  const touchDragRef = useRef<TouchDragState | null>(null)
  const activeTouchIdsRef = useRef<Set<number>>(new Set())

  const [isFocused, setIsFocused] = useState(false)
  const [isTouchDragging, setIsTouchDragging] = useState(false)
  const [inputText, setInputText] = useState(() => {
    const normalized = quantizeToStep(clampNumericValue(value, descriptor), descriptor)
    return valueFormatter ? valueFormatter(normalized) : formatRawValue(normalized, descriptor)
  })

  const profileConfig = sensitivityProfiles[descriptor.profile] ?? sensitivityProfiles.default
  const currentValue = useMemo(
    () => quantizeToStep(clampNumericValue(value, descriptor), descriptor),
    [descriptor, value],
  )

  const formatDisplayValue = useCallback((nextValue: number) => {
    return valueFormatter ? valueFormatter(nextValue) : formatRawValue(nextValue, descriptor)
  }, [descriptor, valueFormatter])

  const syncDisplayedValue = useCallback((nextValue: number, focused = isFocused) => {
    setInputText(focused ? formatRawValue(nextValue, descriptor) : formatDisplayValue(nextValue))
  }, [descriptor, formatDisplayValue, isFocused])

  useEffect(() => {
    lastCommittedValueRef.current = currentValue
    if (!isFocused && !isTouchDragging) {
      syncDisplayedValue(currentValue, false)
    }
  }, [currentValue, isFocused, isTouchDragging, syncDisplayedValue])

  const emitCommittedValue = useCallback((nextValue: number, notifyEnd = false) => {
    const normalized = quantizeToStep(clampNumericValue(nextValue, descriptor), descriptor)
    const previous = lastCommittedValueRef.current
    const changed = Math.abs(normalized - previous) > 1e-9

    lastCommittedValueRef.current = normalized

    if (changed) {
      onChange(normalized)
    }

    syncDisplayedValue(normalized)

    if (notifyEnd) {
      onChangeEnd?.(normalized)
    }

    return normalized
  }, [descriptor, onChange, onChangeEnd, syncDisplayedValue])

  const commitInputText = useCallback((notifyEnd = true) => {
    const parsed = parseInputValue(inputText.trim())
    const nextValue = parsed == null ? lastCommittedValueRef.current : parsed
    const committed = emitCommittedValue(nextValue, notifyEnd)
    syncDisplayedValue(committed, false)
    setIsFocused(false)
    return committed
  }, [emitCommittedValue, inputText, syncDisplayedValue])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    setInputText(formatRawValue(lastCommittedValueRef.current, descriptor))
  }, [descriptor])

  const handleBlur = useCallback(() => {
    commitInputText(true)
  }, [commitInputText])

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(event.target.value)
  }, [])

  const handleDiscreteValue = useCallback((nextValue: number) => {
    emitCommittedValue(nextValue, true)
  }, [emitCommittedValue])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return
    }

    const fine = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
    const baseValue = lastCommittedValueRef.current

    if (event.key === 'Enter') {
      event.preventDefault()
      commitInputText(true)
      inputRef.current?.blur()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      syncDisplayedValue(baseValue, false)
      setIsFocused(false)
      inputRef.current?.blur()
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      handleDiscreteValue(descriptor.min)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      handleDiscreteValue(descriptor.max)
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const deltaSteps = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1
      const nextValue = applyNumericDelta({
        value: baseValue,
        deltaSteps,
        descriptor,
        modifiers: { fine },
      })
      handleDiscreteValue(nextValue)
    }
  }, [commitInputText, descriptor, disabled, handleDiscreteValue, syncDisplayedValue])

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (disabled) {
      return
    }

    event.preventDefault()

    const now = Date.now()
    const elapsed = lastWheelTsRef.current > 0 ? Math.max(16, now - lastWheelTsRef.current) : Number.POSITIVE_INFINITY
    lastWheelTsRef.current = now

    const fine = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
    const direction = event.deltaY < 0 ? 1 : -1
    const magnitude = Math.max(1, Math.round(Math.abs(event.deltaY) / 100))
    const velocity = Number.isFinite(elapsed) ? Math.abs(event.deltaY) / elapsed : 0
    const nextValue = applyNumericDelta({
      value: lastCommittedValueRef.current,
      deltaSteps: direction * magnitude * profileConfig.wheelStep,
      descriptor,
      modifiers: { fine },
      velocity,
    })

    emitCommittedValue(nextValue, true)
  }, [descriptor, disabled, emitCommittedValue, profileConfig.wheelStep])

  const clearTouchPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    activeTouchIdsRef.current.delete(event.pointerId)

    if (touchDragRef.current?.pointerId === event.pointerId) {
      touchDragRef.current = null
      setIsTouchDragging(false)
      onChangeEnd?.(lastCommittedValueRef.current)
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [onChangeEnd])

  const beginTouchDrag = useCallback((pointerId: number, clientY: number) => {
    activeTouchIdsRef.current.add(pointerId)

    if (!touchDragRef.current) {
      touchDragRef.current = {
        pointerId,
        startY: clientY,
        startValue: lastCommittedValueRef.current,
      }
      setIsTouchDragging(true)
    }
  }, [])

  const updateTouchDrag = useCallback((pointerId: number, clientY: number, touchCount: number) => {
    const dragState = touchDragRef.current
    if (!dragState || dragState.pointerId !== pointerId || disabled) {
      return
    }

    const fine = touchCount >= 2
    const deltaSteps = (dragState.startY - clientY) / profileConfig.pixelsPerStep
    const nextValue = applyNumericDelta({
      value: dragState.startValue,
      deltaSteps,
      descriptor,
      modifiers: { fine },
    })
    emitCommittedValue(nextValue, false)
  }, [descriptor, disabled, emitCommittedValue, profileConfig.pixelsPerStep])

  const finishTouchDrag = useCallback((pointerId: number) => {
    activeTouchIdsRef.current.delete(pointerId)

    if (touchDragRef.current?.pointerId === pointerId) {
      touchDragRef.current = null
      setIsTouchDragging(false)
      onChangeEnd?.(lastCommittedValueRef.current)
    }
  }, [onChangeEnd])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerType = event.pointerType || 'touch'
    if (disabled || (pointerType !== 'touch' && pointerType !== 'pen')) {
      return
    }

    event.preventDefault()
    beginTouchDrag(event.pointerId, event.clientY)

    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [beginTouchDrag, disabled])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = touchDragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId || disabled) {
      return
    }

    event.preventDefault()
    updateTouchDrag(event.pointerId, event.clientY, activeTouchIdsRef.current.size)
  }, [disabled, updateTouchDrag])

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (disabled || event.touches.length === 0) {
      return
    }

    const primaryTouch = event.touches[0]
    if (!touchDragRef.current) {
      beginTouchDrag(primaryTouch.identifier, primaryTouch.clientY)
    }

    for (const touch of Array.from(event.changedTouches)) {
      activeTouchIdsRef.current.add(touch.identifier)
    }
  }, [beginTouchDrag, disabled])

  const handleTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const dragState = touchDragRef.current
    if (!dragState || disabled) {
      return
    }

    const activeTouch = Array.from(event.touches).find((touch) => touch.identifier === dragState.pointerId)
    if (!activeTouch) {
      return
    }

    event.preventDefault()
    updateTouchDrag(dragState.pointerId, activeTouch.clientY, event.touches.length)
  }, [disabled, updateTouchDrag])

  const handleTouchEnd = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    for (const touch of Array.from(event.changedTouches)) {
      finishTouchDrag(touch.identifier)
    }
  }, [finishTouchDrag])

  const handleDoubleClick = useCallback(() => {
    if (disabled) {
      return
    }
    emitCommittedValue(descriptor.defaultValue, true)
  }, [descriptor.defaultValue, disabled, emitCommittedValue])

  const progress = clamp01((lastCommittedValueRef.current - descriptor.min) / (descriptor.max - descriptor.min))
  const metaMin = formatRawValue(descriptor.min, descriptor)
  const metaDefault = formatRawValue(descriptor.defaultValue, descriptor)
  const metaMax = formatRawValue(descriptor.max, descriptor)
  const describedValue = formatDisplayValue(lastCommittedValueRef.current)

  return (
    <div
      className={[
        'numeric-input',
        `numeric-input--${size}`,
        inline ? 'numeric-input--inline' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ '--numeric-input-accent': accentColor } as CSSProperties}
    >
      {showLabel && label && (
        <label className="numeric-input__label" htmlFor={inputId} id={labelId}>
          {label}
        </label>
      )}
      <div
        className={[
          'numeric-input__control',
          disabled ? 'is-disabled' : '',
          isTouchDragging ? 'is-dragging' : '',
        ].filter(Boolean).join(' ')}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearTouchPointer}
        onPointerCancel={clearTouchPointer}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
      >
        <div className="numeric-input__track" aria-hidden="true">
          <div
            className="numeric-input__track-fill"
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        <input
          ref={inputRef}
          id={inputId}
          className="numeric-input__field"
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          inputMode={descriptor.profile === 'integer' ? 'numeric' : 'decimal'}
          role="slider"
          aria-label={ariaLabel}
          aria-labelledby={showLabel && label ? labelId : undefined}
          aria-valuemin={descriptor.min}
          aria-valuemax={descriptor.max}
          aria-valuenow={lastCommittedValueRef.current}
          aria-valuetext={descriptor.unit ? `${describedValue} ${descriptor.unit}` : describedValue}
        />
        {descriptor.unit && <span className="numeric-input__unit" aria-hidden="true">{descriptor.unit}</span>}
      </div>
      {showBounds && (
        <div className="numeric-input__meta" aria-hidden="true">
          <span>{metaMin}</span>
          <span>default {metaDefault}</span>
          <span>{metaMax}</span>
        </div>
      )}
    </div>
  )
}

export default NumericInput
