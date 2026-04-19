/**
 * ParameterGrid Component
 *
 * Responsive grid layout for parameter controls.
 * Automatically adjusts columns based on container width.
 */

import type { ReactNode } from 'react'

interface ParameterGridProps {
  children: ReactNode
  columns?: number | 'auto'
  minColumnWidth?: number
  gap?: number
  rowGap?: number
  columnGap?: number
  className?: string
}

export function ParameterGrid({
  children,
  columns = 'auto',
  minColumnWidth = 100,
  gap = 16,
  rowGap,
  columnGap,
  className = '',
}: ParameterGridProps) {
  const gridTemplateColumns =
    columns === 'auto'
      ? `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`
      : `repeat(${columns}, 1fr)`

  return (
    <div
      className={`parameter-grid ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns,
        gap: rowGap !== undefined || columnGap !== undefined
          ? undefined
          : `var(--card-gap, ${gap}px)`,
        rowGap: rowGap !== undefined ? `var(--card-gap, ${rowGap}px)` : undefined,
        columnGap: columnGap !== undefined ? `var(--card-gap, ${columnGap}px)` : undefined,
      }}
    >
      {children}

      <style>{`
        .parameter-grid {
          width: 100%;
        }

        .parameter-grid > * {
          display: flex;
          justify-content: center;
        }
      `}</style>
    </div>
  )
}

export default ParameterGrid
