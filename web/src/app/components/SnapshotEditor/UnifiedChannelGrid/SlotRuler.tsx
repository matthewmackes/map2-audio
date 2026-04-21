import type { CSSProperties } from 'react'

import { COLUMN_WIDTHS, ROW_HEIGHTS, SLOT_COUNT } from './gridConstants'

export interface SlotRulerProps {
  slotCount?: number
}

export function SlotRuler({ slotCount = SLOT_COUNT }: SlotRulerProps) {
  const rowStyle: CSSProperties = {
    height: ROW_HEIGHTS.ruler,
  }
  const headerStyle: CSSProperties = {
    width: COLUMN_WIDTHS.channelHeader,
    height: ROW_HEIGHTS.ruler,
  }
  const slotStyle: CSSProperties = {
    width: COLUMN_WIDTHS.slot,
    height: ROW_HEIGHTS.ruler,
  }

  return (
    <div className="ucg-slot-ruler" style={rowStyle} role="row">
      <div className="ucg-slot-ruler__channel-header" style={headerStyle} role="columnheader">
        <span className="ucg-slot-ruler__channel-label">Channel</span>
      </div>
      {Array.from({ length: slotCount }, (_, index) => (
        <div
          key={`slot-${index}`}
          className="ucg-slot-ruler__slot"
          style={slotStyle}
          role="columnheader"
          data-slot-index={index}
        >
          <span className="ucg-slot-ruler__slot-label">
            {`Slot ${String(index + 1).padStart(2, '0')}`}
          </span>
        </div>
      ))}
    </div>
  )
}
