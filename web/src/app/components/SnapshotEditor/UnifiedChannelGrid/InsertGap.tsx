import type { CSSProperties } from 'react'
import { Add } from '@carbon/icons-react'

import { COLUMN_WIDTHS, ROW_HEIGHTS } from './gridConstants'

export interface InsertGapProps {
  beforeSlotIndex: number
  onInsert?: (beforeSlotIndex: number) => void
  disabled?: boolean
}

export function InsertGap({ beforeSlotIndex, onInsert, disabled = false }: InsertGapProps) {
  const style: CSSProperties = {
    width: COLUMN_WIDTHS.insertGap,
    height: ROW_HEIGHTS.channel - 12,
  }

  return (
    <button
      type="button"
      className="ucg-insert-gap"
      style={style}
      disabled={disabled}
      onClick={() => onInsert?.(beforeSlotIndex)}
      aria-label={`Insert block before slot ${beforeSlotIndex + 1}`}
      data-before-slot-index={beforeSlotIndex}
    >
      <Add size={16} aria-hidden />
    </button>
  )
}
