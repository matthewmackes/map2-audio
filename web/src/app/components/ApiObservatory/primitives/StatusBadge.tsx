import type { CSSProperties } from 'react'

function statusTone(status: number) {
  if (status >= 200 && status < 300) {
    return { background: 'rgba(21, 128, 61, 0.22)', border: 'rgba(34, 197, 94, 0.45)', text: '#86efac' }
  }
  if (status >= 300 && status < 400) {
    return { background: 'rgba(30, 64, 175, 0.24)', border: 'rgba(96, 165, 250, 0.45)', text: '#bfdbfe' }
  }
  if (status >= 400 && status < 500) {
    return { background: 'rgba(154, 52, 18, 0.22)', border: 'rgba(251, 146, 60, 0.45)', text: '#fdba74' }
  }
  if (status >= 500) {
    return { background: 'rgba(127, 29, 29, 0.3)', border: 'rgba(248, 113, 113, 0.45)', text: '#fecaca' }
  }
  return { background: 'rgba(30, 41, 59, 0.62)', border: 'rgba(148, 163, 184, 0.35)', text: '#cbd5e1' }
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

  return (
    <span
      style={
        {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          border: `1px solid ${tone.border}`,
          background: tone.background,
          color: tone.text,
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          padding: compact ? '3px 7px' : '4px 9px',
        } as CSSProperties
      }
      aria-label={`HTTP status ${status}`}
    >
      {status}{label ? ` ${label}` : ''}
    </span>
  )
}

export default StatusBadge
