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
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent,
} from 'react'

import {
  sensitivityProfiles,
  type ParameterCommitStrategy,
  type ParameterDescriptor,
} from '../../data/parameterSchema'
import {
  applyNumericDelta,
  clampNumericValue,
  getFineStep,
  getLargeStep,
  quantizeToStep,
} from './numericInputLogic'
import './NumericInput.css'

export interface NumericInputProps {
  descriptor: ParameterDescriptor
  value: number
  onChange: (value: number) => void
  onChangeEnd?: (value: number) => void
  commitStrategy?: ParameterCommitStrategy
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
  commitStrategy = descriptor.commitStrategy ?? 'pointer-up',
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
  displayOverlay,
}: NumericInputProps) {
  const inputId = useId()
  const labelId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const lastCommittedValueRef = useRef(value)
  const liveValueRef = useRef(value)
  const lastWheelTsRef = useRef<number>(0)
  const wheelCommitTimeoutRef = useRef<number | null>(null)
  const touchDragRef = useRef<TouchDragState | null>(null)
  const activeTouchIdsRef = useRef<Set<number>>(new Set())
  const hasPendingLiveChangeRef = useRef(false)

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
  const usesDeferredCommit = true

  const formatDisplayValue = useCallback((nextValue: number) => {
    return valueFormatter ? valueFormatter(nextValue) : formatRawValue(nextValue, descriptor)
  }, [descriptor, valueFormatter])

  const syncDisplayedValue = useCallback((nextValue: number, focused = isFocused) => {
    setInputText(focused ? formatRawValue(nextValue, descriptor) : formatDisplayValue(nextValue))
  }, [descriptor, formatDisplayValue, isFocused])

  const clearPendingWheelCommit = useCallback(() => {
    if (wheelCommitTimeoutRef.current != null) {
      window.clearTimeout(wheelCommitTimeoutRef.current)
      wheelCommitTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!usesDeferredCommit) {
      lastCommittedValueRef.current = currentValue
      liveValueRef.current = currentValue
      hasPendingLiveChangeRef.current = false
      syncDisplayedValue(currentValue, false)
      return
    }

    if (!isFocused && !isTouchDragging) {
      lastCommittedValueRef.current = currentValue
      liveValueRef.current = currentValue
      hasPendingLiveChangeRef.current = false
      syncDisplayedValue(currentValue, false)
    }
  }, [currentValue, isFocused, isTouchDragging, syncDisplayedValue, usesDeferredCommit])

  useEffect(() => {
    return () => {
      clearPendingWheelCommit()
    }
  }, [clearPendingWheelCommit])

  const emitCommittedValue = useCallback((nextValue: number, notifyEnd = false) => {
    const normalized = quantizeToStep(clampNumericValue(nextValue, descriptor), descriptor)
    const previous = lastCommittedValueRef.current
    const changed = Math.abs(normalized - previous) > 1e-9

    lastCommittedValueRef.current = normalized
    liveValueRef.current = normalized

    if (changed) {
      onChange(normalized)
    }

    syncDisplayedValue(normalized)

    if (notifyEnd) {
      onChangeEnd?.(normalized)
    }

    return normalized
  }, [descriptor, onChange, onChangeEnd, syncDisplayedValue])

  const emitLiveValue = useCallback((nextValue: number) => {
    const normalized = quantizeToStep(clampNumericValue(nextValue, descriptor), descriptor)
    const previous = liveValueRef.current
    const changed = Math.abs(normalized - previous) > 1e-9

    liveValueRef.current = normalized

    if (changed) {
      hasPendingLiveChangeRef.current = true
      onChange(normalized)
    }

    syncDisplayedValue(normalized)
    return normalized
  }, [descriptor, onChange, syncDisplayedValue])

  const commitLiveValue = useCallback((nextValue = liveValueRef.current) => {
    const normalized = quantizeToStep(clampNumericValue(nextValue, descriptor), descriptor)
    const previous = lastCommittedValueRef.current
    const changed = Math.abs(normalized - previous) > 1e-9
    const shouldNotifyEnd = changed || hasPendingLiveChangeRef.current
    liveValueRef.current = normalized
    lastCommittedValueRef.current = normalized
    hasPendingLiveChangeRef.current = false
    syncDisplayedValue(normalized)

    if (shouldNotifyEnd) {
      onChangeEnd?.(normalized)
    }

    return normalized
  }, [descriptor, onChangeEnd, syncDisplayedValue])

  const revertToCommittedValue = useCallback(() => {
    liveValueRef.current = lastCommittedValueRef.current
    hasPendingLiveChangeRef.current = false
    syncDisplayedValue(lastCommittedValueRef.current, false)
    setIsFocused(false)
    clearPendingWheelCommit()
  }, [clearPendingWheelCommit, syncDisplayedValue])

  const commitInputText = useCallback((notifyEnd = true) => {
    const parsed = parseInputValue(inputText.trim())
    const nextValue = parsed == null ? lastCommittedValueRef.current : parsed
    const committed = usesDeferredCommit
      ? (() => {
          const live = emitLiveValue(nextValue)
          return notifyEnd ? commitLiveValue(live) : live
        })()
      : emitCommittedValue(nextValue, notifyEnd)
    syncDisplayedValue(committed, false)
    setIsFocused(false)
    clearPendingWheelCommit()
    return committed
  }, [
    clearPendingWheelCommit,
    commitLiveValue,
    emitCommittedValue,
    emitLiveValue,
    inputText,
    syncDisplayedValue,
    usesDeferredCommit,
  ])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    setInputText(formatRawValue(liveValueRef.current, descriptor))
  }, [descriptor])

  const handleBlur = useCallback(() => {
    if (commitStrategy === 'explicit') {
      revertToCommittedValue()
      return
    }
    commitInputText(true)
  }, [commitInputText, commitStrategy, revertToCommittedValue])

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
    const baseValue = usesDeferredCommit ? liveValueRef.current : lastCommittedValueRef.current

    if (event.key === 'Enter') {
      event.preventDefault()
      commitInputText(true)
      inputRef.current?.blur()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      revertToCommittedValue()
      inputRef.current?.blur()
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      if (usesDeferredCommit) {
        emitLiveValue(descriptor.min)
      } else {
        handleDiscreteValue(descriptor.min)
      }
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      if (usesDeferredCommit) {
        emitLiveValue(descriptor.max)
      } else {
        handleDiscreteValue(descriptor.max)
      }
      return
    }

    if (
      event.key === 'ArrowUp'
      || event.key === 'ArrowRight'
      || event.key === 'ArrowDown'
      || event.key === 'ArrowLeft'
      || event.key === 'PageUp'
      || event.key === 'PageDown'
    ) {
      event.preventDefault()
      const isIncrement = event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'PageUp'
      const direction = isIncrement ? 1 : -1
      const nextValue = event.key === 'PageUp' || event.key === 'PageDown'
        ? quantizeToStep(
            clampNumericValue(
              baseValue + direction * (fine ? getFineStep(descriptor) : getLargeStep(descriptor)),
              descriptor,
            ),
            descriptor,
            fine ? getFineStep(descriptor) : getLargeStep(descriptor),
          )
        : applyNumericDelta({
            value: baseValue,
            deltaSteps: direction,
            descriptor,
            modifiers: { fine },
          })

      if (usesDeferredCommit) {
        emitLiveValue(nextValue)
      } else {
        handleDiscreteValue(nextValue)
      }
    }
  }, [
    commitInputText,
    descriptor,
    disabled,
    emitLiveValue,
    handleDiscreteValue,
    revertToCommittedValue,
    usesDeferredCommit,
  ])

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
    const baseValue = usesDeferredCommit ? liveValueRef.current : lastCommittedValueRef.current
    const nextValue = applyNumericDelta({
      value: baseValue,
      deltaSteps: direction * magnitude * profileConfig.wheelStep,
      descriptor,
      modifiers: { fine },
      velocity,
    })

    if (usesDeferredCommit) {
      emitLiveValue(nextValue)
      clearPendingWheelCommit()
      if (commitStrategy !== 'explicit') {
        wheelCommitTimeoutRef.current = window.setTimeout(() => {
          commitLiveValue(nextValue)
          wheelCommitTimeoutRef.current = null
        }, 180)
      }
      return
    }

    emitCommittedValue(nextValue, true)
  }, [
    clearPendingWheelCommit,
    commitLiveValue,
    commitStrategy,
    descriptor,
    disabled,
    emitCommittedValue,
    emitLiveValue,
    profileConfig.wheelStep,
    usesDeferredCommit,
  ])

  const clearTouchPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    activeTouchIdsRef.current.delete(event.pointerId)

    if (touchDragRef.current?.pointerId === event.pointerId) {
      touchDragRef.current = null
      setIsTouchDragging(false)
      if (usesDeferredCommit) {
        if (commitStrategy !== 'explicit') {
          commitLiveValue()
        }
      } else {
        onChangeEnd?.(lastCommittedValueRef.current)
      }
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [commitLiveValue, commitStrategy, onChangeEnd, usesDeferredCommit])

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
    if (usesDeferredCommit) {
      emitLiveValue(nextValue)
      return
    }
    emitCommittedValue(nextValue, false)
  }, [descriptor, disabled, emitCommittedValue, emitLiveValue, profileConfig.pixelsPerStep, usesDeferredCommit])

  const finishTouchDrag = useCallback((pointerId: number) => {
    activeTouchIdsRef.current.delete(pointerId)

    if (touchDragRef.current?.pointerId === pointerId) {
      touchDragRef.current = null
      setIsTouchDragging(false)
      if (usesDeferredCommit) {
        if (commitStrategy !== 'explicit') {
          commitLiveValue()
        }
      } else {
        onChangeEnd?.(lastCommittedValueRef.current)
      }
    }
  }, [commitLiveValue, commitStrategy, onChangeEnd, usesDeferredCommit])

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
    if (activeTouchIdsRef.current.size === 0 && usesDeferredCommit && commitStrategy !== 'explicit') {
      commitLiveValue()
    }
  }, [commitLiveValue, commitStrategy, finishTouchDrag, usesDeferredCommit])

  const handleDoubleClick = useCallback(() => {
    if (disabled) {
      return
    }
    clearPendingWheelCommit()
    if (usesDeferredCommit) {
      emitLiveValue(descriptor.defaultValue)
      commitLiveValue(descriptor.defaultValue)
      return
    }
    emitCommittedValue(descriptor.defaultValue, true)
  }, [
    clearPendingWheelCommit,
    commitLiveValue,
    descriptor.defaultValue,
    disabled,
    emitCommittedValue,
    emitLiveValue,
    usesDeferredCommit,
  ])

  const renderedValue = usesDeferredCommit ? liveValueRef.current : lastCommittedValueRef.current
  const progress = clamp01((renderedValue - descriptor.min) / (descriptor.max - descriptor.min))
  const metaMin = formatRawValue(descriptor.min, descriptor)
  const metaDefault = formatRawValue(descriptor.defaultValue, descriptor)
  const metaMax = formatRawValue(descriptor.max, descriptor)
  const describedValue = formatDisplayValue(renderedValue)

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
          displayOverlay ? 'has-display-overlay' : '',
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
        {displayOverlay && !isFocused && (
          <div className="numeric-input__display-overlay" aria-hidden="true">
            {displayOverlay}
          </div>
        )}
        <input
          ref={inputRef}
          id={inputId}
          className={[
            'numeric-input__field',
            displayOverlay && !isFocused ? 'is-overlay-hidden' : '',
          ].filter(Boolean).join(' ')}
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
          aria-valuenow={renderedValue}
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
