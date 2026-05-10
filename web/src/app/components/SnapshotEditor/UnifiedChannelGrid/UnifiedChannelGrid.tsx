import { ChannelRow } from './ChannelRow'
import { SlotRuler } from './SlotRuler'
import { useGridKeyboard } from './useGridKeyboard'
import type { ChainMeterReading } from './useChainMeter'
import { WireOverlay, type Wire } from './WireOverlay'
import {
  SLOT_COUNT,
  type UnifiedChannelRow,
} from './gridConstants'

import './UnifiedChannelGrid.css'

export interface SelectedBlockCoord {
  rowId: string
  slotIndex: number
}

/**
 * Per-row "channel strip" props consolidated into the left ChannelHeader
 * column (T2474 / Signal Chain Update). Replaces the old flow-card toolbar
 * that previously sat above the grid: identity badge, dry/wet fader,
 * IN/OUT/CLIP segmented LEDs, and the delete-flow trash button now all
 * render inside ChannelHeader itself.
 */
export interface ChannelStripProps {
  flowLabel?: string
  identitySubtitle?: string
  pathLabel?: string
  flowDryWetMix?: number
  onFlowDryWetMixChange?: (value: number) => void
  flowInputClipActive?: boolean
  flowOutputClipActive?: boolean
  flowClipActive?: boolean
  onDeleteFlow?: () => void
  canDeleteFlow?: boolean
  flowControlsDisabled?: boolean
}

export interface UnifiedChannelGridProps {
  rows: UnifiedChannelRow[]
  selectedBlock?: SelectedBlockCoord | null
  wires?: Wire[]
  activeWireId?: string | null
  meters?: Record<string, ChainMeterReading>
  channelStrips?: Record<string, ChannelStripProps>
  onSelectBlock?: (rowId: string, slotIndex: number) => void
  onAddBlock?: (rowId: string, slotIndex: number) => void
  onToggleMute?: (rowId: string) => void
  onToggleSolo?: (rowId: string) => void
  onHoverWire?: (wireId: string | null) => void
  onReorderBlock?: (rowId: string, fromIndex: number, toIndex: number) => void
  onRemoveBlock?: (rowId: string, slotIndex: number) => void
  onDeselect?: () => void
}

export function UnifiedChannelGrid({
  rows,
  selectedBlock = null,
  wires,
  activeWireId = null,
  meters,
  channelStrips,
  onSelectBlock,
  onAddBlock,
  onToggleMute,
  onToggleSolo,
  onHoverWire,
  onReorderBlock,
  onRemoveBlock,
  onDeselect,
}: UnifiedChannelGridProps) {
  const handleKeyDown = useGridKeyboard(selectedBlock, {
    onReorder: onReorderBlock,
    onRemove: onRemoveBlock,
    onDeselect,
  })
  // Grid container has no inline width — it fills its parent so the row
  // CSS grid (`<header>px repeat(N, minmax(96px, 1fr))`) can flex slots
  // out to whatever real estate the page hands us. Below ~1008px total,
  // the .ucg-grid scrolls horizontally and the channel-header column
  // stays sticky-left.

  return (
    <div
      className="ucg-grid"
      role="grid"
      aria-label={`Unified channel grid with ${rows.length} rows and ${SLOT_COUNT} slots`}
      aria-rowcount={rows.length + 1}
      aria-colcount={SLOT_COUNT + 1}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <SlotRuler slotCount={SLOT_COUNT} />
      {rows.map((row) => (
        <ChannelRow
          key={row.id}
          row={row}
          selectedSlotIndex={
            selectedBlock?.rowId === row.id ? selectedBlock.slotIndex : null
          }
          meter={meters?.[row.id]}
          channelStrip={channelStrips?.[row.id]}
          onSelectBlock={onSelectBlock}
          onAddBlock={onAddBlock}
          onRemoveBlock={onRemoveBlock}
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
