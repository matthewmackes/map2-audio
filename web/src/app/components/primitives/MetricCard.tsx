// MetricCard — token-driven replacement for the inline-style-heavy
// StatCard at web/src/app/components/StatCard.tsx. Same semantics, no
// inline styles, MAP semantic tokens for tone.
//
// StatCard remains for compat; new code uses MetricCard. B12 retires
// StatCard if all consumers have migrated.

import type { ReactNode } from 'react'
import { Tile } from '@carbon/react'

import { StatusChip, type StatusChipTone } from './StatusChip'
import './MetricCard.css'

interface MetricCardProps {
  label: string
  value: ReactNode
  /** Optional secondary readout (e.g., "1.3 ms / 64 samples"). */
  secondary?: ReactNode
  /** Status helper renders as a StatusChip in the top-right corner. */
  helper?: string
  helperTone?: StatusChipTone
  /** Optional small footer line (e.g., last-update timestamp). */
  footer?: ReactNode
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function MetricCard({
  label,
  value,
  secondary,
  helper,
  helperTone = 'neutral',
  footer,
  className,
}: MetricCardProps) {
  return (
    <Tile className={joinClasses('map2-metric-card', className)}>
      <div className="map2-metric-card__head">
        <span className="map2-metric-card__label">{label}</span>
        {helper ? <StatusChip tone={helperTone} label={helper} size="sm" /> : null}
      </div>
      <div className="map2-metric-card__value">{value}</div>
      {secondary ? <div className="map2-metric-card__secondary">{secondary}</div> : null}
      {footer ? <div className="map2-metric-card__footer">{footer}</div> : null}
    </Tile>
  )
}

export default MetricCard
