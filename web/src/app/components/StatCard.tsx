import type { ReactNode } from 'react'
import { Tag, Tile } from '@carbon/react'

interface Props {
  label: string
  value: ReactNode
  helper?: string
  tone?: 'default' | 'success' | 'warn'
  icon?: string
  secondary?: string
  color?: string
}

export function StatCard({ label, value, helper, tone = 'default', icon, secondary, color }: Props) {
  const toneType = tone === 'success' ? 'green' : tone === 'warn' ? 'warm-gray' : 'cool-gray'

  return (
    <Tile style={{ display: 'grid', gap: 8, minHeight: 120 }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--type-body)', letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 'var(--type-heading)', color: color ?? 'var(--text-primary)' }}>{value}</div>
          {secondary ? (
            <div style={{ marginTop: 4, color: 'var(--text-tertiary)', fontSize: 'var(--type-caption)' }}>{secondary}</div>
          ) : null}
        </div>
        <Tag type={toneType}>{helper ?? 'Live'}</Tag>
      </div>
      {icon ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--type-caption)' }}>{icon}</div>
      ) : null}
    </Tile>
  )
}
