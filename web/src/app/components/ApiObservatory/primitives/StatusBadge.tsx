// HTTP status badge for the API Observatory traffic monitor.
//
// T2474 B7: Migrated from a hand-rolled inline-style component using
// Tailwind palette literals (#86efac, #bfdbfe, #fdba74, #fecaca,
// #cbd5e1) to the canonical StatusChip primitive (B4). HTTP status
// classes map to MAP semantic tones:
//   2xx  → 'ok'        (success)
//   3xx  → 'info'      (redirect — neutral context)
//   4xx  → 'caution'   (client error — operator-correctable)
//   5xx  → 'critical'  (server error — likely blocking)
//   else → 'neutral'   (unknown / pre-flight)

import { StatusChip } from '../../primitives'

function statusTone(status: number): 'ok' | 'info' | 'caution' | 'critical' | 'neutral' {
  if (status >= 200 && status < 300) return 'ok'
  if (status >= 300 && status < 400) return 'info'
  if (status >= 400 && status < 500) return 'caution'
  if (status >= 500) return 'critical'
  return 'neutral'
}

function statusText(status: number): string {
  if (status === 200) return 'OK'
  if (status === 201) return 'Created'
  if (status === 204) return 'No Content'
  if (status === 400) return 'Bad Request'
  if (status === 401) return 'Unauthorized'
  if (status === 403) return 'Forbidden'
  if (status === 404) return 'Not Found'
  if (status === 409) return 'Conflict'
  if (status === 422) return 'Unprocessable Entity'
  if (status === 500) return 'Server Error'
  if (status === 502) return 'Bad Gateway'
  if (status === 504) return 'Gateway Timeout'
  return ''
}

export function StatusBadge({ status, compact = false }: { status: number; compact?: boolean }) {
  const tone = statusTone(status)
  const label = statusText(status)
  const display = label ? `${status} ${label}` : String(status)
  return (
    <StatusChip
      tone={tone}
      label={display}
      size={compact ? 'sm' : 'md'}
      title={`HTTP status ${status}`}
    />
  )
}

export default StatusBadge
