// SystemStatusBar — horizontal row of status chips for the system-wide
// state operators always need to see (engine status, latency, clock sync,
// AVB, node health). Replaces the per-workspace ad-hoc status displays
// audit-flagged in B0 (MidiHubShell action slots, AudioEnginePage inline
// metering, AvbRouting inline Tags, etc.).
//
// Designed to live at the top of a workspace page or inline within a
// PageHeader's `actions` slot. Children are arbitrary chips; in practice
// callers compose StatusChip + LatencyChip + ClockSyncChip + AvbStatusChip
// as they need them.

import type { ReactNode } from 'react'
import './SystemStatusBar.css'

interface SystemStatusBarProps {
  /** Optional left-aligned label (e.g., "SYSTEM"). */
  label?: string
  children: ReactNode
  className?: string
  /** When true, the bar is rendered as a divider row across the page. */
  bordered?: boolean
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function SystemStatusBar({ label, children, className, bordered = false }: SystemStatusBarProps) {
  return (
    <div
      className={joinClasses(
        'map2-system-status-bar',
        bordered && 'map2-system-status-bar--bordered',
        className,
      )}
      role="status"
      aria-label={label ?? 'System status'}
    >
      {label ? <span className="map2-system-status-bar__label">{label}</span> : null}
      <div className="map2-system-status-bar__chips">{children}</div>
    </div>
  )
}

export default SystemStatusBar
