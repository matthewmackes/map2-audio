// LatencyChip — renders an audio latency value with band-coloring.
// Bands map to MAP semantic latency tokens defined in B1 _tokens.scss:
//   ≤ 5 ms      → 'good'      (--map2-latency-good)
//   ≤ 12 ms     → 'caution'   (--map2-latency-caution)
//   > 12 ms     → 'critical'  (--map2-latency-critical)
//
// Thresholds derived from docs/CLAUDE.md latency targets:
//   "Live guitar performance < 5 ms (Yes — drummer sync)"
//   "Studio recording < 10 ms (Less critical)"
//
// Pass `unknownLabel` if you want a placeholder when latency is null.

import { StatusChip, type StatusChipSize } from './StatusChip'

const GOOD_THRESHOLD_MS = 5
const CAUTION_THRESHOLD_MS = 12

interface LatencyChipProps {
  /** Round-trip latency in milliseconds, or null when unknown. */
  latencyMs: number | null | undefined
  size?: StatusChipSize
  /** Optional label override (default "LATENCY"). */
  label?: string
  /** Render text shown when latencyMs is null/undefined. */
  unknownLabel?: string
  className?: string
}

export function bandForLatency(ms: number): 'good' | 'caution' | 'critical' {
  if (ms <= GOOD_THRESHOLD_MS) return 'good'
  if (ms <= CAUTION_THRESHOLD_MS) return 'caution'
  return 'critical'
}

function toneForBand(band: 'good' | 'caution' | 'critical') {
  if (band === 'good') return 'ok' as const
  if (band === 'caution') return 'caution' as const
  return 'critical' as const
}

export function LatencyChip({
  latencyMs,
  size = 'sm',
  label = 'LATENCY',
  unknownLabel = '—',
  className,
}: LatencyChipProps) {
  if (latencyMs === null || latencyMs === undefined || !Number.isFinite(latencyMs)) {
    return (
      <StatusChip
        tone="offline"
        label={label}
        value={unknownLabel}
        size={size}
        dot
        className={className}
        title="Latency unknown"
      />
    )
  }
  const band = bandForLatency(latencyMs)
  const tone = toneForBand(band)
  const display = latencyMs >= 10 ? `${Math.round(latencyMs)} ms` : `${latencyMs.toFixed(1)} ms`
  const titleHint =
    band === 'good'
      ? 'Latency within live-performance budget (≤ 5 ms)'
      : band === 'caution'
        ? 'Latency above live-performance budget but acceptable for studio'
        : 'Latency exceeds studio budget — investigate before live use'
  return (
    <StatusChip
      tone={tone}
      label={label}
      value={display}
      size={size}
      dot
      className={className}
      title={titleHint}
    />
  )
}

export default LatencyChip
