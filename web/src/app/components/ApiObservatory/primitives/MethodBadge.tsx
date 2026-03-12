import type { CSSProperties } from 'react'

const METHOD_COLORS: Record<string, { background: string; border: string; text: string }> = {
  GET: { background: 'rgba(22, 163, 74, 0.18)', border: 'rgba(34, 197, 94, 0.45)', text: '#86efac' },
  POST: { background: 'rgba(37, 99, 235, 0.18)', border: 'rgba(59, 130, 246, 0.45)', text: '#93c5fd' },
  PUT: { background: 'rgba(234, 88, 12, 0.2)', border: 'rgba(249, 115, 22, 0.45)', text: '#fdba74' },
  PATCH: { background: 'rgba(190, 24, 93, 0.2)', border: 'rgba(236, 72, 153, 0.45)', text: '#f9a8d4' },
  DELETE: { background: 'rgba(185, 28, 28, 0.2)', border: 'rgba(248, 113, 113, 0.45)', text: '#fca5a5' },
  HEAD: { background: 'rgba(76, 29, 149, 0.24)', border: 'rgba(167, 139, 250, 0.45)', text: '#ddd6fe' },
  OPTIONS: { background: 'rgba(8, 145, 178, 0.2)', border: 'rgba(6, 182, 212, 0.45)', text: '#67e8f9' },
  WS: { background: 'rgba(91, 33, 182, 0.24)', border: 'rgba(139, 92, 246, 0.45)', text: '#d8b4fe' },
  DEFAULT: { background: 'rgba(30, 41, 59, 0.62)', border: 'rgba(148, 163, 184, 0.35)', text: '#cbd5e1' },
}

export function MethodBadge({ method, compact = false }: { method: string; compact?: boolean }) {
  const normalized = method.toUpperCase()
  const tone = METHOD_COLORS[normalized] ?? METHOD_COLORS.DEFAULT

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
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: compact ? '3px 7px' : '4px 9px',
          minWidth: compact ? 42 : 48,
        } as CSSProperties
      }
      aria-label={`HTTP method ${normalized}`}
    >
      {normalized}
    </span>
  )
}

export default MethodBadge
