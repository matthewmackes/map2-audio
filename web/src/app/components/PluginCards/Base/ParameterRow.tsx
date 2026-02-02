/**
 * ParameterRow Component
 *
 * Horizontal row of parameter controls (typically knobs).
 * Used for grouping related parameters in a single line.
 */

import type { ReactNode } from 'react'

interface ParameterRowProps {
  children: ReactNode
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'
  align?: 'start' | 'center' | 'end'
  gap?: number
  wrap?: boolean
  className?: string
}

export function ParameterRow({
  children,
  justify = 'space-around',
  align = 'center',
  gap = 16,
  wrap = true,
  className = '',
}: ParameterRowProps) {
  return (
    <div
      className={`parameter-row ${className}`}
      style={{
        display: 'flex',
        justifyContent: justify,
        alignItems: align,
        gap: `${gap}px`,
        flexWrap: wrap ? 'wrap' : 'nowrap',
      }}
    >
      {children}
    </div>
  )
}

export default ParameterRow
