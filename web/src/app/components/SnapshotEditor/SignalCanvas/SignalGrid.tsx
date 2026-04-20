import type { CSSProperties, ReactNode } from 'react'

export interface SignalGridProps {
  cols: number
  rows: number
  gridBackdrop?: boolean
  children: ReactNode
}

export function SignalGrid({ cols, rows, gridBackdrop = true, children }: SignalGridProps) {
  const columnCount = Math.max(1, Math.floor(cols))
  const rowCount = Math.max(1, Math.floor(rows))

  return (
    <div
      className="snapshot-signal-grid"
      data-grid-backdrop={gridBackdrop ? 'true' : 'false'}
      style={{
        '--snapshot-grid-cols': columnCount,
        '--snapshot-grid-rows': rowCount,
      } as CSSProperties}
      aria-label={`${columnCount} by ${rowCount} signal grid`}
    >
      {children}
    </div>
  )
}
