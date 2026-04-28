// HealthMetric — labeled metric with health-band coloring.
// Used for CPU%, MEM%, latency-pressure, and similar "operator must
// see if this is OK" readouts. Bands map to MAP health tokens from B1.
//
// Default thresholds: ok < 70%, caution 70-85%, critical >= 85%.
// Override via `cautionAt` / `criticalAt` props (in the same unit as
// `value`, on a 0-100 scale).

import type { ReactNode } from 'react'
import './HealthMetric.css'

type HealthBand = 'ok' | 'caution' | 'critical'

interface HealthMetricProps {
  label: string
  /** Current value, expected on a 0-100 scale unless `max` overrides. */
  value: number
  max?: number
  /** Display unit suffix (e.g., "%", "ms"). */
  unit?: string
  /** Threshold (in same unit as value/max) above which band becomes caution. */
  cautionAt?: number
  /** Threshold above which band becomes critical. */
  criticalAt?: number
  /** Optional secondary text (e.g., "of 8 cores"). */
  secondary?: ReactNode
  className?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function bandForHealthValue(
  value: number,
  cautionAt: number,
  criticalAt: number,
): HealthBand {
  if (value >= criticalAt) return 'critical'
  if (value >= cautionAt) return 'caution'
  return 'ok'
}

export function HealthMetric({
  label,
  value,
  max = 100,
  unit = '%',
  cautionAt = 70,
  criticalAt = 85,
  secondary,
  className,
}: HealthMetricProps) {
  const safeValue = Number.isFinite(value) ? value : 0
  const safeMax = max > 0 ? max : 100
  const pct = Math.max(0, Math.min(100, (safeValue / safeMax) * 100))
  const band = bandForHealthValue(safeValue, cautionAt, criticalAt)
  const display = `${Math.round(safeValue)}${unit}`
  return (
    <div className={joinClasses('map2-health-metric', `map2-health-metric--${band}`, className)}>
      <div className="map2-health-metric__head">
        <span className="map2-health-metric__label">{label}</span>
        <span className="map2-health-metric__value">{display}</span>
      </div>
      <div className="map2-health-metric__bar" role="progressbar" aria-valuenow={safeValue} aria-valuemin={0} aria-valuemax={safeMax}>
        <div className="map2-health-metric__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {secondary ? <div className="map2-health-metric__secondary">{secondary}</div> : null}
    </div>
  )
}

export default HealthMetric
