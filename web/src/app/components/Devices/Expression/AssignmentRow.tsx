/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 * Single row in the left-column assignment list.
 */

import { useCallback } from 'react'
import { motion } from 'framer-motion'

import { INSTANT_TRANSITION } from '../../../styles/useReducedMotionSafeVariants'
import { useReducedEffectsPreference } from '../../../hooks/useReducedEffectsPreference'
import styles from '../../../pages/ExpressionPage.module.css'
import type { Assignment } from './expressionTypes'

export function AssignmentRow({
  assignment,
  selected,
  onSelect,
  isHighlighted,
}: {
  assignment: Assignment
  selected: boolean
  onSelect: () => void
  isHighlighted?: boolean
}) {
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => (shouldReduceEffects ? INSTANT_TRANSITION : trans),
    [shouldReduceEffects],
  )
  return (
    <motion.button
      className={`${styles.assignmentRow} ${selected ? styles.assignmentRowSelected : ''} ${
        isHighlighted && !selected ? styles.assignmentRowHighlighted : ''
      } ${selected && isHighlighted ? styles.assignmentRowSelectedHighlighted : ''}`}
      onClick={onSelect}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={t({ duration: 0.2 })}
    >
      <span className={styles.assignmentCCLabel}>CC{assignment.cc}</span>
      <div className={styles.assignmentContent}>
        <div className={styles.assignmentParamName}>
          {assignment.param_label || assignment.param_id}
        </div>
        <div className={styles.assignmentMetadata}>
          ch{assignment.channel || '*'} | {assignment.curve}
        </div>
      </div>
      {isHighlighted && !selected && (
        <motion.span
          className={styles.assignmentMidiLabel}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={t({ duration: 0.2 })}
        >
          MIDI
        </motion.span>
      )}
      <motion.div
        className={`${styles.assignmentStatusIndicator} ${assignment.active ? styles.assignmentStatusIndicatorActive : ''}`}
        animate={{
          boxShadow: assignment.active
            ? '0 0 8px color-mix(in srgb, var(--support-success) 30%, transparent)'
            : 'none',
        }}
        transition={t({ duration: 0.3 })}
      />
    </motion.button>
  )
}
