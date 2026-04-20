import type { CSSProperties } from 'react'

export interface ChainTabProps {
  label: string
  active?: boolean
  muted?: boolean
  accentVar?: string
}

export function ChainTab({ label, active = false, muted = false, accentVar = 'var(--snapshot-chain-accent-a)' }: ChainTabProps) {
  return (
    <div
      className={`snapshot-chain-tab${active ? ' is-active' : ''}${muted ? ' is-muted' : ''}`}
      style={{ '--snapshot-chain-accent': accentVar } as CSSProperties}
      aria-label={`Chain ${label}${active ? ' active' : ''}${muted ? ' muted' : ''}`}
    >
      <span>{label}</span>
    </div>
  )
}
