/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 *
 * Live monitor column body — pedal + parameter dual meters, rolling
 * 10-second waveform overlay, and the embedded retime footer.
 * Renders an EmptyState placeholder when no assignment is selected.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

import { INSTANT_TRANSITION } from '../../../styles/useReducedMotionSafeVariants'
import { useReducedEffectsPreference } from '../../../hooks/useReducedEffectsPreference'
import { EmptyState } from '../../shared/EmptyState'
import styles from '../../../pages/ExpressionPage.module.css'
import { apiFetch, clamp01 } from './expressionUtils'
import { expressionTokens } from './expressionTokens'
import { RetimeFooter } from './RetimeFooter'
import type { Assignment, LiveState } from './expressionTypes'

export function LiveDualGraphic({
  assignment,
  paramUnit,
}: {
  assignment: Assignment | null
  paramUnit: string
}) {
  const [pedalNormalized, setPedalNormalized] = useState(0)
  const [paramNormalized, setParamNormalized] = useState(0)
  const [paramDisplay, setParamDisplay] = useState('--')
  const [history, setHistory] = useState<Array<{ pedal: number; param: number }>>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => (shouldReduceEffects ? INSTANT_TRANSITION : trans),
    [shouldReduceEffects],
  )

  useEffect(() => {
    if (!assignment) return undefined

    const poll = async () => {
      try {
        const state = await apiFetch<LiveState>('/v2/expression/live-state')
        const item = state[assignment.id]
        if (!item) return
        const rangeLo = Math.min(assignment.out_min, assignment.out_max)
        const rangeHi = Math.max(assignment.out_min, assignment.out_max)
        const span = Math.max(0.0001, rangeHi - rangeLo)
        let mappedNorm = clamp01((item.mapped_value - rangeLo) / span)
        if (assignment.out_max < assignment.out_min) {
          mappedNorm = 1 - mappedNorm
        }
        setPedalNormalized(clamp01(item.normalized))
        setParamNormalized(mappedNorm)
        const suffix = paramUnit ? ` ${paramUnit}` : ''
        setParamDisplay(`${item.mapped_value.toFixed(2)}${suffix}`)
        setHistory((prev) => [
          ...prev.slice(-299),
          { pedal: clamp01(item.normalized), param: mappedNorm },
        ])
      } catch {
        // Keep UI responsive if polling temporarily fails.
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 33)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [assignment, paramUnit])

  if (!assignment) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: expressionTokens.colors.textTertiary,
          textAlign: 'center',
          padding: 16,
        }}
      >
        <EmptyState
          title="No assignment selected"
          description="Create an assignment to see live data."
          compact
        />
      </div>
    )
  }

  const chartW = 260
  const chartH = 70
  const pathFor = (key: 'pedal' | 'param') => {
    if (history.length < 2) return ''
    const dx = chartW / (history.length - 1)
    return history
      .map((point, index) => {
        const x = index * dx
        const y = (1 - point[key]) * chartH
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }

  const Meter = (props: {
    value: number
    color: string
    label: string
    valueLabel: string
  }) => (
    <div className={styles.meterColumn}>
      <div className={styles.meterValueLabel}>{props.valueLabel}</div>
      <motion.div
        className={styles.meterContainer}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t({ duration: 0.3 })}
      >
        <motion.div
          className={styles.meterFill}
          style={{ background: props.color, height: '0%' }}
          animate={{ height: `${Math.round(clamp01(props.value) * 100)}%` }}
          transition={t({ duration: 0.03, ease: 'linear' })}
        />
      </motion.div>
      <span className={styles.meterLabel}>{props.label}</span>
    </div>
  )

  return (
    <motion.div
      className={styles.monitorContent}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t({ duration: 0.4 })}
    >
      <div className={styles.meterRow}>
        <Meter
          value={pedalNormalized}
          color={expressionTokens.colors.liveIndicator}
          label={`Pedal (CC ${assignment.cc})`}
          valueLabel={`${Math.round(pedalNormalized * 100)}%`}
        />
        <Meter
          value={paramNormalized}
          color={expressionTokens.colors.curve}
          label={assignment.param_label || assignment.param_id}
          valueLabel={paramDisplay}
        />
      </div>

      <div className={styles.waveformContainer}>
        <span className={styles.waveformLabel}>10s overlay</span>
        <motion.svg
          className={styles.waveformSVG}
          width={chartW}
          height={chartH}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={t({ duration: 0.3, delay: 0.1 })}
        >
          <line
            x1={0}
            y1={chartH * 0.25}
            x2={chartW}
            y2={chartH * 0.25}
            stroke={expressionTokens.colors.borderSubtle}
            strokeDasharray="2,2"
            strokeWidth={1}
          />
          <line
            x1={0}
            y1={chartH * 0.75}
            x2={chartW}
            y2={chartH * 0.75}
            stroke={expressionTokens.colors.borderSubtle}
            strokeDasharray="2,2"
            strokeWidth={1}
          />
          <path
            d={pathFor('pedal')}
            fill="none"
            stroke={expressionTokens.colors.liveIndicator}
            strokeWidth={1.5}
          />
          <path
            d={pathFor('param')}
            fill="none"
            stroke={expressionTokens.colors.curve}
            strokeWidth={1.5}
          />
        </motion.svg>
      </div>

      <RetimeFooter />
    </motion.div>
  )
}
