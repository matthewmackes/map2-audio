// Selection Overlay — drag-rectangle highlight on routing matrix.
// T2475 (E1) Carbon migration: Box → div, Typography → span, sx
// keyframes → CSS classes. Pre-existing #2196f3 / rgba(33,150,243,*)
// MUI primary literals replaced with the Carbon blue-50 family that
// --map2-state-staged resolves to.

import type { SelectionRect } from '../../hooks/useDragSelection'
import './SelectionOverlay.css'

interface SelectionOverlayProps {
  selectionRect: SelectionRect | null
  cellWidth: number
  cellHeight: number
  headerWidth: number
  headerHeight: number
  selectedCount: number
}

export function SelectionOverlay({
  selectionRect,
  cellWidth,
  cellHeight,
  headerWidth,
  headerHeight,
  selectedCount,
}: SelectionOverlayProps) {
  if (!selectionRect) {
    return null
  }

  const minRow = Math.min(selectionRect.startRow, selectionRect.endRow)
  const maxRow = Math.max(selectionRect.startRow, selectionRect.endRow)
  const minCol = Math.min(selectionRect.startCol, selectionRect.endCol)
  const maxCol = Math.max(selectionRect.startCol, selectionRect.endCol)

  const left = headerWidth + minCol * cellWidth
  const top = headerHeight + minRow * cellHeight
  const width = (maxCol - minCol + 1) * cellWidth
  const height = (maxRow - minRow + 1) * cellHeight

  return (
    <div className="selection-overlay" style={{ left, top, width, height }}>
      <div className="selection-overlay__rect" />

      {selectedCount > 1 && (
        <div className="selection-overlay__badge">
          <span className="selection-overlay__badge-label">
            {selectedCount} selected
          </span>
        </div>
      )}
    </div>
  )
}

export default SelectionOverlay
