// Connection Highlight — row/column highlights on hovered/focused
// matrix cells. T2475 (E1) Carbon migration: Box → semantic divs.
// MUI primary.main color routed through --map2-state-staged
// (== Carbon blue-50 #4589ff), which is what 'primary.main' resolved
// to in the existing routing dark theme.

interface ConnectionHighlightProps {
  talkerIndex: number | null
  listenerIndex: number | null
  cellWidth: number
  cellHeight: number
  headerWidth: number
  headerHeight: number
  gridWidth: number
  gridHeight: number
}

const ACCENT = 'var(--map2-state-staged, #4589ff)'

export function ConnectionHighlight({
  talkerIndex,
  listenerIndex,
  cellWidth,
  cellHeight,
  headerWidth,
  headerHeight,
  gridWidth,
  gridHeight,
}: ConnectionHighlightProps) {
  if (talkerIndex === null || listenerIndex === null) {
    return null
  }

  const columnLeft = talkerIndex * cellWidth
  const rowTop = listenerIndex * cellHeight

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: headerHeight,
          left: headerWidth + columnLeft,
          width: cellWidth,
          height: gridHeight - headerHeight,
          background: ACCENT,
          opacity: 0.08,
          pointerEvents: 'none',
          zIndex: 5,
          transition: 'left var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: headerHeight + rowTop,
          left: headerWidth,
          width: gridWidth - headerWidth,
          height: cellHeight,
          background: ACCENT,
          opacity: 0.08,
          pointerEvents: 'none',
          zIndex: 5,
          transition: 'top var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: headerHeight + rowTop,
          left: headerWidth + columnLeft,
          width: cellWidth,
          height: cellHeight,
          border: `2px solid ${ACCENT}`,
          opacity: 0.5,
          pointerEvents: 'none',
          zIndex: 10,
          transition: 'top var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease), left var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
          boxShadow: '0 0 8px rgba(69, 137, 255, 0.3)',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: headerWidth + columnLeft,
          width: cellWidth,
          height: headerHeight,
          background: ACCENT,
          opacity: 0.12,
          pointerEvents: 'none',
          zIndex: 15,
          transition: 'left var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: headerHeight + rowTop,
          left: 0,
          width: headerWidth,
          height: cellHeight,
          background: ACCENT,
          opacity: 0.12,
          pointerEvents: 'none',
          zIndex: 15,
          transition: 'top var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
        }}
      />
    </>
  )
}

export default ConnectionHighlight
