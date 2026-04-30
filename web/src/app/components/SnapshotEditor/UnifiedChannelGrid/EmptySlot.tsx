import type { CSSProperties, MouseEvent } from 'react'
import { Add } from '@carbon/icons-react'

import { BLOCK_DIMENSIONS } from './gridConstants'

export interface EmptySlotProps {
  slotIndex: number
  onAdd?: (slotIndex: number) => void
  disabled?: boolean
}

export function EmptySlot({ slotIndex, onAdd, disabled = false }: EmptySlotProps) {
  const style: CSSProperties = {
    width: BLOCK_DIMENSIONS.width,
    height: BLOCK_DIMENSIONS.height,
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onAdd?.(slotIndex)
  }

  return (
    <button
      type="button"
      className="ucg-empty-slot"
      style={style}
      disabled={disabled}
      onClick={handleClick}
      aria-label={`Add block to slot ${slotIndex + 1}`}
      data-slot-index={slotIndex}
    >
      <Add size={20} aria-hidden />
    </button>
  )
}
