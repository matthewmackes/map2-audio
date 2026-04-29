// Crosshair Overlay — row/column highlight on hovered cells.
// T2475 (E1) Carbon migration: Box → div, sx animations → CSS class.
// Pre-existing rgba(33, 150, 243, ...) literals replaced with the
// Carbon blue-50 family that --map2-state-staged resolves to.

import './CrosshairOverlay.css'

interface CrosshairOverlayProps {
  columnIndex: number | null
  rowIndex: number | null
  cellWidth: number
  cellHeight: number
  headerWidth: number
  headerHeight: number
  totalColumns: number
  totalRows: number
}

export function CrosshairOverlay({
  columnIndex,
  rowIndex,
  cellWidth,
  cellHeight,
  headerWidth,
  headerHeight,
  totalColumns,
  totalRows,
}: CrosshairOverlayProps) {
  if (columnIndex === null && rowIndex === null) {
    return null
  }

  const gridWidth = totalColumns * cellWidth
  const gridHeight = totalRows * cellHeight

  return (
    <div
      className="crosshair-overlay"
      style={{
        width: headerWidth + gridWidth,
        height: headerHeight + gridHeight,
      }}
      aria-hidden="true"
    >
      {columnIndex !== null && (
        <div
          className="crosshair-overlay__column"
          style={{
            top: headerHeight,
            left: headerWidth + columnIndex * cellWidth,
            width: cellWidth,
            height: gridHeight,
          }}
        />
      )}

      {rowIndex !== null && (
        <div
          className="crosshair-overlay__row"
          style={{
            top: headerHeight + rowIndex * cellHeight,
            left: headerWidth,
            width: gridWidth,
            height: cellHeight,
          }}
        />
      )}

      {columnIndex !== null && rowIndex !== null && (
        <div
          className="crosshair-overlay__intersection"
          style={{
            top: headerHeight + rowIndex * cellHeight,
            left: headerWidth + columnIndex * cellWidth,
            width: cellWidth,
            height: cellHeight,
          }}
        />
      )}
    </div>
  )
}

export default CrosshairOverlay
