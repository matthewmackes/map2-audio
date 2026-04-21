import type { CSSProperties } from 'react'

import { ChannelRow } from './ChannelRow'
import { SlotRuler } from './SlotRuler'
import { WireOverlay, type Wire } from './WireOverlay'
import {
  COLUMN_WIDTHS,
  SLOT_COUNT,
  type UnifiedChannelRow,
} from './gridConstants'

import './UnifiedChannelGrid.css'

export interface SelectedBlockCoord {
  rowId: string
  slotIndex: number
}

export interface UnifiedChannelGridProps {
  rows: UnifiedChannelRow[]
  selectedBlock?: SelectedBlockCoord | null
  wires?: Wire[]
  activeWireId?: string | null
  onSelectBlock?: (rowId: string, slotIndex: number) => void
  onAddBlock?: (rowId: string, slotIndex: number) => void
  onToggleMute?: (rowId: string) => void
  onToggleSolo?: (rowId: string) => void
  onHoverWire?: (wireId: string | null) => void
}

export function UnifiedChannelGrid({
  rows,
  selectedBlock = null,
  wires,
  activeWireId = null,
  onSelectBlock,
  onAddBlock,
  onToggleMute,
  onToggleSolo,
  onHoverWire,
}: UnifiedChannelGridProps) {
  const totalWidth = COLUMN_WIDTHS.channelHeader + COLUMN_WIDTHS.slot * SLOT_COUNT
  const style: CSSProperties = {
    width: totalWidth,
  }

  return (
    <div
      className="ucg-grid"
      style={style}
      role="grid"
      aria-label={`Unified channel grid with ${rows.length} rows and ${SLOT_COUNT} slots`}
      aria-rowcount={rows.length + 1}
      aria-colcount={SLOT_COUNT + 1}
    >
      <SlotRuler slotCount={SLOT_COUNT} />
      {rows.map((row) => (
        <ChannelRow
          key={row.id}
          row={row}
          selectedSlotIndex={
            selectedBlock?.rowId === row.id ? selectedBlock.slotIndex : null
          }
          onSelectBlock={onSelectBlock}
          onAddBlock={onAddBlock}
          onToggleMute={onToggleMute}
          onToggleSolo={onToggleSolo}
        />
      ))}
      {wires && wires.length > 0 ? (
        <WireOverlay
          rows={rows}
          wires={wires}
          activeWireId={activeWireId}
          onHoverWire={onHoverWire}
        />
      ) : null}
    </div>
  )
}
