import type { CSSProperties } from 'react'

import { Block } from './Block'
import { ChannelHeader } from './ChannelHeader'
import { EmptySlot } from './EmptySlot'
import { COLUMN_WIDTHS, ROW_HEIGHTS, type UnifiedChannelRow } from './gridConstants'
import type { ChainMeterReading } from './useChainMeter'
import type { ChannelStripProps } from './UnifiedChannelGrid'

export interface ChannelRowProps {
  row: UnifiedChannelRow
  selectedSlotIndex?: number | null
  meter?: ChainMeterReading
  channelStrip?: ChannelStripProps
  onToggleMute?: (rowId: string) => void
  onToggleSolo?: (rowId: string) => void
  onSelectBlock?: (rowId: string, slotIndex: number) => void
  onAddBlock?: (rowId: string, slotIndex: number) => void
  onRemoveBlock?: (rowId: string, slotIndex: number) => void
}

export function ChannelRow({
  row,
  selectedSlotIndex = null,
  meter,
  channelStrip,
  onToggleMute,
  onToggleSolo,
  onSelectBlock,
  onAddBlock,
  onRemoveBlock,
}: ChannelRowProps) {
  // Match SlotRuler: fixed-width header column + N fluid slot tracks.
  const rowStyle: CSSProperties = {
    height: ROW_HEIGHTS.channel,
    gridTemplateColumns: `${COLUMN_WIDTHS.channelHeader}px repeat(${row.slots.length}, minmax(${COLUMN_WIDTHS.slot}px, 1fr))`,
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
      <ChannelHeader
        row={row}
        meter={meter}
        strip={channelStrip}
        onToggleMute={onToggleMute}
        onToggleSolo={onToggleSolo}
      />

      {row.slots.map((slot) => (
        <div
          key={`slot-${slot.index}`}
          className="ucg-channel-row__slot-cell"
          role="gridcell"
          data-slot-index={slot.index}
        >
          {slot.kind ? (
            <Block
              slot={slot}
              selected={selectedSlotIndex === slot.index}
              onClick={(idx) => onSelectBlock?.(row.id, idx)}
              onRemove={(idx) => onRemoveBlock?.(row.id, idx)}
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
