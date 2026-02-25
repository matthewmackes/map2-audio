import React, { useEffect, useMemo, useRef, useState } from 'react'

interface MPX1KnobProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  formatter?: (value: number) => string
  onChange: (value: number) => void
}

interface DragState {
  startY: number
  startValue: number
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function quantize(value: number, step?: number): number {
  if (!step || step <= 0) return value
  return Math.round(value / step) * step
}

function toAngle(normalized: number): number {
  const startAngle = Math.PI * 0.72
  const endAngle = Math.PI * 2.28
  return startAngle + normalized * (endAngle - startAngle)
}

export function MPX1Knob({
  label,
  value,
  min,
  max,
  step = 0,
  disabled = false,
  formatter,
  onChange,
}: MPX1KnobProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const range = Math.max(0.0001, max - min)
  const normalized = clamp((value - min) / range, 0, 1)

  const displayValue = useMemo(() => {
    if (formatter) {
      return formatter(value)
    }
    return `${Math.round(value * 100) / 100}`
  }, [formatter, value])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const size = 96
    canvas.width = Math.floor(size * dpr)
    canvas.height = Math.floor(size * dpr)
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    const centerX = size / 2
    const centerY = size / 2
    const radius = 31
    const startAngle = Math.PI * 0.72
    const endAngle = Math.PI * 2.28

    // Track ring
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, startAngle, endAngle, false)
    ctx.stroke()

    // Value ring
    const accent = disabled ? 'rgba(100, 116, 139, 0.66)' : 'rgba(56, 189, 248, 0.95)'
    ctx.lineCap = 'round'
    ctx.strokeStyle = accent
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, startAngle, toAngle(normalized), false)
    ctx.stroke()

    // Knob body
    const knobRadius = 22
    const knobGradient = ctx.createRadialGradient(
      centerX - 5,
      centerY - 6,
      6,
      centerX,
      centerY,
      knobRadius
    )
    knobGradient.addColorStop(0, disabled ? '#223045' : '#2b3b54')
    knobGradient.addColorStop(1, disabled ? '#0f172a' : '#111827')
    ctx.fillStyle = knobGradient
    ctx.beginPath()
    ctx.arc(centerX, centerY, knobRadius, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Pointer dot
    const pointerAngle = toAngle(normalized)
    const pointerRadius = 16
    const pointerX = centerX + Math.cos(pointerAngle) * pointerRadius
    const pointerY = centerY + Math.sin(pointerAngle) * pointerRadius
    ctx.fillStyle = disabled ? 'rgba(148, 163, 184, 0.62)' : 'rgba(248, 250, 252, 0.95)'
    ctx.beginPath()
    ctx.arc(pointerX, pointerY, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }, [disabled, normalized])

  useEffect(() => {
    if (!isDragging) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragRef.current
      if (!dragState || disabled) {
        return
      }

      const deltaY = dragState.startY - event.clientY
      const fineScale = event.shiftKey ? 0.12 : 1
      const sensitivity = (range / 280) * fineScale
      const next = clamp(quantize(dragState.startValue + deltaY * sensitivity, step), min, max)
      onChange(next)
    }

    const handlePointerUp = () => {
      dragRef.current = null
      setIsDragging(false)
      document.body.classList.remove('mpx1-knob-dragging')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [disabled, isDragging, max, min, onChange, range, step])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) {
      return
    }

    event.preventDefault()
    dragRef.current = {
      startY: event.clientY,
      startValue: value,
    }
    setIsDragging(true)
    document.body.classList.add('mpx1-knob-dragging')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDoubleClick = () => {
    if (disabled) return
    const raw = window.prompt(`Set ${label}`, `${value}`)
    if (raw == null) return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const next = clamp(quantize(parsed, step), min, max)
    onChange(next)
  }

  return (
    <div className={`mpx1-knob${disabled ? ' is-disabled' : ''}`}>
      <canvas
        ref={canvasRef}
        className="mpx1-knob__canvas"
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number.isFinite(value) ? value : min}
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
      />
      <div className="mpx1-knob__value">{displayValue}</div>
      <div className="mpx1-knob__label">{label}</div>
    </div>
  )
}
