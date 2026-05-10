import type { CSSProperties } from 'react'

import { COLUMN_WIDTHS, ROW_HEIGHTS, SLOT_COUNT } from './gridConstants'

export interface SlotRulerProps {
  slotCount?: number
}

export function SlotRuler({ slotCount = SLOT_COUNT }: SlotRulerProps) {
  // Grid template: fixed-width channel header + N fluid slot tracks
  // (`minmax(slot-floor, 1fr)`). Slots flex to fill the viewport; below
  // the floor (~96px each), the parent .ucg-grid scrolls horizontally
  // and the channel header stays sticky-left.
  const rowStyle: CSSProperties = {
    height: ROW_HEIGHTS.ruler,
    gridTemplateColumns: `${COLUMN_WIDTHS.channelHeader}px repeat(${slotCount}, minmax(${COLUMN_WIDTHS.slot}px, 1fr))`,
  }

  return (
    <div className="ucg-slot-ruler" style={rowStyle} role="row">
      <div className="ucg-slot-ruler__channel-header" role="columnheader">
        <span className="ucg-slot-ruler__channel-label">Channel</span>
      </div>
      {Array.from({ length: slotCount }, (_, index) => (
        <div
          key={`slot-${index}`}
          className="ucg-slot-ruler__slot"
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
