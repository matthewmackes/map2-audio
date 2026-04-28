// MAP2 canonical status pill. Replaces the scattered NodeNavChip-derived,
// `.rtm__live-focus-chip`, `.node-nav-bar__overflow`, and ad-hoc
// `support-*` Tag implementations across the codebase.
//
// Tone maps onto MAP semantic tokens emitted by _semantic-tokens.scss:
//   - 'live'        → --map2-state-live (green-40)
//   - 'staged'      → --map2-state-staged (blue-50)
//   - 'uncommitted' → --map2-state-uncommitted (yellow-30)
//   - 'committed'   → --map2-state-committed (gray-60)
//   - 'ok'          → --map2-health-ok
//   - 'caution'     → --map2-health-caution
//   - 'critical'    → --map2-health-critical
//   - 'offline'     → --map2-health-offline
//   - 'info'        → --cds-link-primary (Carbon blue)
//   - 'neutral'     → --cds-text-secondary (no semantic, just neutral)
//
// The optional `value` slot renders a numeric or short readout next to the
// label (e.g., "96%", "1.3ms", "48k").

import type { ReactNode } from 'react'
import './StatusChip.css'

export type StatusChipTone =
  | 'live'
  | 'staged'
  | 'uncommitted'
  | 'committed'
  | 'ok'
  | 'caution'
  | 'critical'
  | 'offline'
  | 'info'
  | 'neutral'

export type StatusChipSize = 'sm' | 'md'

interface StatusChipProps {
  tone: StatusChipTone
  label: ReactNode
  value?: ReactNode
  size?: StatusChipSize
  /** When true, renders a leading dot in the tone color. */
  dot?: boolean
  className?: string
  /** Optional title/tooltip for screen readers + hover. */
  title?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function StatusChip({
  tone,
  label,
  value,
  size = 'md',
  dot = false,
  className,
  title,
}: StatusChipProps) {
  return (
    <span
      className={joinClasses(
        'map2-status-chip',
        `map2-status-chip--${tone}`,
        size === 'sm' && 'map2-status-chip--sm',
        className,
      )}
      title={title}
    >
      {dot ? <span className="map2-status-chip__dot" aria-hidden="true" /> : null}
      <span className="map2-status-chip__label">{label}</span>
      {value !== undefined && value !== null ? (
        <span className="map2-status-chip__value">{value}</span>
      ) : null}
    </span>
  )
}

export default StatusChip
