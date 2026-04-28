// DeviceNodeCard — node identity card surfaced in cluster lists, host
// switchers, and node tearsheets. Shows host/role/health/presence in a
// consistent layout. Composes StatusChip for the health pill.
//
// This is intentionally a *display* primitive — node selection /
// "set as page node" UX lives in the global NodeNavChip (per the
// Unified Pill Directive in docs/CLAUDE.md). DeviceNodeCard is for
// list/grid contexts where the chip is too small.

import type { ReactNode } from 'react'
import { Tile } from '@carbon/react'

import { StatusChip, type StatusChipTone } from './StatusChip'
import './DeviceNodeCard.css'

export type NodeHealth = 'ok' | 'caution' | 'critical' | 'offline'
export type NodePresence = 'local' | 'view' | 'peer'

interface DeviceNodeCardProps {
  hostname: string
  /** Human-readable role label (e.g., "Audio Node", "Management Node", "All-In-One"). */
  role?: string
  /** Optional explicit display label rendered as eyebrow. */
  displayLabel?: string
  health: NodeHealth
  /** Optional health percent — renders inside the StatusChip value slot. */
  healthPercent?: number
  /** Drives the left accent stripe. */
  presence?: NodePresence
  /** Optional footer slot (often holds open-tearsheet button or per-node metric). */
  footer?: ReactNode
  className?: string
  onClick?: () => void
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function toneForHealth(health: NodeHealth): StatusChipTone {
  switch (health) {
    case 'ok':
      return 'ok'
    case 'caution':
      return 'caution'
    case 'critical':
      return 'critical'
    case 'offline':
    default:
      return 'offline'
  }
}

function labelForHealth(health: NodeHealth): string {
  switch (health) {
    case 'ok':
      return 'OK'
    case 'caution':
      return 'WARN'
    case 'critical':
      return 'CRITICAL'
    case 'offline':
    default:
      return 'OFFLINE'
  }
}

export function DeviceNodeCard({
  hostname,
  role,
  displayLabel,
  health,
  healthPercent,
  presence = 'peer',
  footer,
  className,
  onClick,
}: DeviceNodeCardProps) {
  const healthValue =
    healthPercent !== undefined && Number.isFinite(healthPercent)
      ? `${Math.round(healthPercent)}%`
      : undefined
  return (
    <Tile
      className={joinClasses(
        'map2-device-node-card',
        `map2-device-node-card--${presence}`,
        onClick && 'map2-device-node-card--interactive',
        className,
      )}
      onClick={onClick}
    >
      <div className="map2-device-node-card__head">
        <div className="map2-device-node-card__copy">
          {displayLabel ? (
            <span className="map2-device-node-card__eyebrow">{displayLabel}</span>
          ) : null}
          <strong className="map2-device-node-card__hostname">{hostname}</strong>
          {role ? <span className="map2-device-node-card__role">{role}</span> : null}
        </div>
        <StatusChip
          tone={toneForHealth(health)}
          label={labelForHealth(health)}
          value={healthValue}
          size="sm"
          dot
        />
      </div>
      {footer ? <div className="map2-device-node-card__footer">{footer}</div> : null}
    </Tile>
  )
}

export default DeviceNodeCard
