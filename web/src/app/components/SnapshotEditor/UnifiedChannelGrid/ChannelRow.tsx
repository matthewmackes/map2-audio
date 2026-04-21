import type { CSSProperties } from 'react'

import { Block } from './Block'
import { ChannelHeader } from './ChannelHeader'
import { EmptySlot } from './EmptySlot'
import { COLUMN_WIDTHS, ROW_HEIGHTS, type UnifiedChannelRow } from './gridConstants'

export interface ChannelRowProps {
  row: UnifiedChannelRow
  selectedSlotIndex?: number | null
  onToggleMute?: (rowId: string) => void
  onToggleSolo?: (rowId: string) => void
  onSelectBlock?: (rowId: string, slotIndex: number) => void
  onAddBlock?: (rowId: string, slotIndex: number) => void
}

export function ChannelRow({
  row,
  selectedSlotIndex = null,
  onToggleMute,
  onToggleSolo,
  onSelectBlock,
  onAddBlock,
}: ChannelRowProps) {
  const rowStyle: CSSProperties = {
    height: ROW_HEIGHTS.channel,
  }
  const slotStyle: CSSProperties = {
    width: COLUMN_WIDTHS.slot,
    height: ROW_HEIGHTS.channel,
  }

  return (
    <div
      className={`ucg-channel-row ${row.stereo ? 'ucg-channel-row--stereo' : 'ucg-channel-row--mono'}`}
      style={rowStyle}
      role="row"
      data-row-id={row.id}
      data-stereo={row.stereo ? 'true' : 'false'}
      data-muted={row.muted ? 'true' : 'false'}
      data-solo={row.solo ? 'true' : 'false'}
    >
      <ChannelHeader row={row} onToggleMute={onToggleMute} onToggleSolo={onToggleSolo} />

      {row.slots.map((slot) => (
        <div
          key={`slot-${slot.index}`}
          className="ucg-channel-row__slot-cell"
          style={slotStyle}
          role="gridcell"
          data-slot-index={slot.index}
        >
          {slot.kind ? (
            <Block
              slot={slot}
              selected={selectedSlotIndex === slot.index}
              onClick={(idx) => onSelectBlock?.(row.id, idx)}
            />
          ) : (
            <EmptySlot
              slotIndex={slot.index}
              onAdd={(idx) => onAddBlock?.(row.id, idx)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
