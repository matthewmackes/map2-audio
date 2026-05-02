/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 * Static SVG preview of a response curve.
 */

import { useCallback } from 'react'
import { motion } from 'framer-motion'

import { INSTANT_TRANSITION } from '../../../styles/useReducedMotionSafeVariants'
import { useReducedEffectsPreference } from '../../../hooks/useReducedEffectsPreference'
import styles from '../../../pages/ExpressionPage.module.css'
import { curvePath } from './expressionUtils'
import { expressionTokens } from './expressionTokens'
import type { Curve, CurvePoint } from './expressionTypes'

export function CurvePreview({
  curve,
  customCurve,
}: {
  curve: Curve
  customCurve: CurvePoint[]
}) {
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => (shouldReduceEffects ? INSTANT_TRANSITION : trans),
    [shouldReduceEffects],
  )
  return (
    <motion.svg
      className={styles.curveSVG}
      width={120}
      height={120}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t({ duration: 0.3 })}
    >
      <line
        x1={0}
        y1={60}
        x2={120}
        y2={60}
        stroke={expressionTokens.colors.borderSubtle}
        strokeWidth={1}
      />
      <line
        x1={60}
        y1={0}
        x2={60}
        y2={120}
        stroke={expressionTokens.colors.borderSubtle}
        strokeWidth={1}
      />
      <path
        d={curvePath(curve, customCurve, 120, 120)}
        fill="none"
        stroke={expressionTokens.colors.liveIndicator}
        strokeWidth={2}
      />
    </motion.svg>
  )
}
