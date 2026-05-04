import { useMemo } from 'react'

export interface TimingBreakdown {
  dns_ms?: number | null
  connect_ms?: number | null
  tls_ms?: number | null
  ttfb_ms?: number | null
  download_ms?: number | null
  total_ms: number
}

export function TimingBreakdownChart({ timing }: { timing: TimingBreakdown }) {
  const segments = useMemo(
    () => [
      { key: 'dns', label: 'DNS', value: Number(timing.dns_ms ?? 0), color: '#14b8a6' },
      { key: 'connect', label: 'Connect', value: Number(timing.connect_ms ?? 0), color: 'var(--cds-support-info)' },
      { key: 'tls', label: 'TLS', value: Number(timing.tls_ms ?? 0), color: '#8b5cf6' },
      { key: 'ttfb', label: 'TTFB', value: Number(timing.ttfb_ms ?? 0), color: 'var(--cds-support-warning)' },
      { key: 'download', label: 'Download', value: Number(timing.download_ms ?? 0), color: 'var(--cds-support-success)' },
    ],
    [timing.connect_ms, timing.dns_ms, timing.download_ms, timing.tls_ms, timing.ttfb_ms],
  )

  const total = Math.max(timing.total_ms, segments.reduce((sum, segment) => sum + segment.value, 0), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          height: 16,
          width: '100%',
          borderRadius: 999,
          overflow: 'hidden',
          background: 'rgba(30, 41, 59, 0.85)',
          border: '1px solid rgba(71, 85, 105, 0.45)',
        }}
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            title={`${segment.label}: ${segment.value.toFixed(2)}ms`}
            style={{
              width: `${(segment.value / total) * 100}%`,
              background: segment.color,
              minWidth: segment.value > 0 ? 2 : 0,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: 'var(--cds-text-primary)', fontSize: 11 }}>
        {segments.map((segment) => (
          <span
            key={segment.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              borderRadius: 999,
              // carbon-allow: dense surface; off-grid between Carbon stops.
              padding: '3px 8px',
              border: '1px solid rgba(71, 85, 105, 0.4)',
              background: 'rgba(15, 23, 42, 0.78)',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: segment.color }} />
            {segment.label}: {segment.value.toFixed(1)}ms
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontWeight: 700 }}>Total: {timing.total_ms.toFixed(2)}ms</span>
      </div>
    </div>
  )
}

export default TimingBreakdownChart
