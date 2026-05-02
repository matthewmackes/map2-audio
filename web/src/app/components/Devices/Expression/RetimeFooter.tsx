/**
 * T2487 — extracted from web/src/app/pages/ExpressionPage.tsx.
 * Live retime/control-latency display anchored to the bottom of the
 * Live Monitor column.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'

import styles from '../../../pages/ExpressionPage.module.css'
import { apiFetch } from './expressionUtils'
import { expressionTokens } from './expressionTokens'
import type { RetimeStats } from './expressionTypes'

export function RetimeFooter() {
  const [stats, setStats] = useState<RetimeStats | null>(null)
  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<RetimeStats>('/v2/expression/retime-stats')
      setStats(next)
    } catch {
      setStats(null)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const p95 = stats?.p95_ms ?? 0
  const statusColor = !stats
    ? expressionTokens.colors.textMuted
    : p95 < 3.0
      ? expressionTokens.colors.active
      : p95 <= 5.0
        ? expressionTokens.colors.warning
        : expressionTokens.colors.error

  return (
    <div className={styles.retimeFooter}>
      <span className={styles.retimeStatsLabel}>
        Control latency p95:{' '}
        <span style={{ color: statusColor }} className={styles.retimeValue}>
          {stats ? `${stats.p95_ms.toFixed(2)}ms` : '--'}
        </span>
      </span>
      <motion.button
        className={styles.refreshButton}
        onClick={refresh}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        Refresh
      </motion.button>
    </div>
  )
}
