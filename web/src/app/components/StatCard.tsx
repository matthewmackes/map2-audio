import type { ReactNode } from 'react'

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
  const toneClass = tone === 'success' ? 'pill success' : tone === 'warn' ? 'pill warn' : 'pill muted'

  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="flex-between" style={{ marginTop: 6 }}>
        <div className="stat-value">{value}</div>
        <span className={toneClass}>{helper ?? 'Live'}</span>
      </div>
    </div>
  )
}
