import { useCallback } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { SLOT_COUNT } from './gridConstants'
import type { SelectedBlockCoord } from './UnifiedChannelGrid'

export interface GridKeyboardHandlers {
  onReorder?: (rowId: string, fromIndex: number, toIndex: number) => void
  onRemove?: (rowId: string, slotIndex: number) => void
  onDeselect?: () => void
}

/**
 * Returns a React `onKeyDown` handler for the UnifiedChannelGrid:
 *   - ArrowLeft  → reorder selected block one slot earlier (clamped to 0)
 *   - ArrowRight → reorder selected block one slot later (clamped to SLOT_COUNT-1)
 *   - Delete / Backspace → remove the selected block
 *   - Escape     → deselect
 *
 * If no block is selected, the handler is a no-op for reorder/remove but still
 * calls `onDeselect` for Escape (keeping the UI responsive).
 */
export function useGridKeyboard(
  selectedBlock: SelectedBlockCoord | null,
  handlers: GridKeyboardHandlers,
) {
  const { onReorder, onRemove, onDeselect } = handlers

  return useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDeselect?.()
        return
      }

      if (!selectedBlock) return

      if (event.key === 'ArrowLeft') {
        const target = Math.max(0, selectedBlock.slotIndex - 1)
        if (target !== selectedBlock.slotIndex) {
          event.preventDefault()
          onReorder?.(selectedBlock.rowId, selectedBlock.slotIndex, target)
        }
        return
      }

      if (event.key === 'ArrowRight') {
        const target = Math.min(SLOT_COUNT - 1, selectedBlock.slotIndex + 1)
        if (target !== selectedBlock.slotIndex) {
          event.preventDefault()
          onReorder?.(selectedBlock.rowId, selectedBlock.slotIndex, target)
        }
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        onRemove?.(selectedBlock.rowId, selectedBlock.slotIndex)
      }
    },
    [selectedBlock, onReorder, onRemove, onDeselect],
  )
}
