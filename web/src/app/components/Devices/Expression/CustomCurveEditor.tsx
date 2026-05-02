/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 * Two-handle bezier curve editor for the Curve='custom' setting.
 */

import { useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

import { INSTANT_TRANSITION } from '../../../styles/useReducedMotionSafeVariants'
import { useReducedEffectsPreference } from '../../../hooks/useReducedEffectsPreference'
import styles from '../../../pages/ExpressionPage.module.css'
import { clamp01, curvePath } from './expressionUtils'
import { expressionTokens } from './expressionTokens'
import type { CurvePoint } from './expressionTypes'

export function CustomCurveEditor({
  points,
  onChange,
}: {
  points: CurvePoint[]
  onChange: (points: CurvePoint[]) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragging = useRef<number | null>(null)
  const safePoints =
    points.length === 2 ? points : [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }]
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => (shouldReduceEffects ? INSTANT_TRANSITION : trans),
    [shouldReduceEffects],
  )

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (dragging.current == null || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const px = clamp01((clientX - rect.left) / rect.width)
      const py = clamp01(1 - (clientY - rect.top) / rect.height)
      const next = safePoints.map((p) => ({ ...p }))
      const idx = dragging.current
      next[idx] = { x: px, y: py }

      if (idx === 0 && next[0].x >= next[1].x)
        next[0].x = Math.max(0, next[1].x - 0.02)
      if (idx === 1 && next[1].x <= next[0].x)
        next[1].x = Math.min(1, next[0].x + 0.02)
      onChange(next)
    },
    [onChange, safePoints],
  )

  useEffect(() => {
    const onMove = (event: MouseEvent) => applyPointer(event.clientX, event.clientY)
    const onUp = () => {
      dragging.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [applyPointer])

  return (
    <motion.svg
      ref={svgRef}
      className={styles.curveSVG}
      width={200}
      height={200}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={t({ duration: 0.3 })}
      style={{ touchAction: 'none' }}
      onMouseLeave={() => {
        dragging.current = null
      }}
    >
      <line
        x1={0}
        y1={100}
        x2={200}
        y2={100}
        stroke={expressionTokens.colors.borderSubtle}
        strokeWidth={1}
      />
      <line
        x1={100}
        y1={0}
        x2={100}
        y2={200}
        stroke={expressionTokens.colors.borderSubtle}
        strokeWidth={1}
      />
      <path
        d={curvePath('custom', safePoints, 200, 200)}
        fill="none"
        stroke={expressionTokens.colors.curve}
        strokeWidth={2}
      />
      {safePoints.map((point, index) => (
        <motion.circle
          key={index === 0 ? 'p1' : 'p2'}
          cx={point.x * 200}
          cy={(1 - point.y) * 200}
          r={6}
          fill={
            index === 0
              ? expressionTokens.colors.liveIndicator
              : expressionTokens.colors.curve
          }
          stroke={expressionTokens.colors.textPrimary}
          strokeWidth={1}
          whileHover={{ r: 8 }}
          style={{ cursor: 'grab' }}
          onMouseDown={(event) => {
            event.preventDefault()
            dragging.current = index
            applyPointer(event.clientX, event.clientY)
          }}
        />
      ))}
    </motion.svg>
  )
}
