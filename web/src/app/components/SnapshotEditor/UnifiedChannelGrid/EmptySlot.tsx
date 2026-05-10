import type { MouseEvent } from 'react'
import { Add } from '@carbon/icons-react'

export interface EmptySlotProps {
  slotIndex: number
  onAdd?: (slotIndex: number) => void
  disabled?: boolean
}

export function EmptySlot({ slotIndex, onAdd, disabled = false }: EmptySlotProps) {
  // Width/height come from CSS — the slot cell is a fluid grid track and
  // the empty-slot button stretches to fill it.

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onAdd?.(slotIndex)
  }

  return (
    <button
      type="button"
      className="ucg-empty-slot"
      disabled={disabled}
      onClick={handleClick}
      aria-label={`Add block to slot ${slotIndex + 1}`}
      data-slot-index={slotIndex}
    >
      <Add size={20} aria-hidden />
    </button>
  )
}
