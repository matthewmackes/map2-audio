import { useMemo, useState } from 'react'

import { COLUMN_WIDTHS, ROW_HEIGHTS, type UnifiedChannelRow } from './gridConstants'

export type WireKind = 'send' | 'parallel' | 'sidechain'

export interface WireEndpoint {
  rowId: string
  slotIndex: number
}

export interface Wire {
  id: string
  kind: WireKind
  from: WireEndpoint
  to: WireEndpoint
}

export interface WireOverlayProps {
  rows: UnifiedChannelRow[]
  wires: Wire[]
  activeWireId?: string | null
  onHoverWire?: (wireId: string | null) => void
}

function rowIndex(rows: UnifiedChannelRow[], rowId: string): number {
  return rows.findIndex((row) => row.id === rowId)
}

function slotCenter(slotIndex: number): number {
  return COLUMN_WIDTHS.channelHeader + COLUMN_WIDTHS.slot * slotIndex + COLUMN_WIDTHS.slot / 2
}

function rowCenterY(rowIdx: number): number {
  return ROW_HEIGHTS.ruler + ROW_HEIGHTS.channel * rowIdx + ROW_HEIGHTS.channel / 2
}

const KIND_STROKE: Record<WireKind, string> = {
  send: 'var(--cds-interactive, #4589ff)',
  parallel: 'var(--cds-support-info, #33b1ff)',
  sidechain: 'var(--cds-support-warning, #f1c21b)',
}

export function WireOverlay({ rows, wires, activeWireId = null, onHoverWire }: WireOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const viewBox = useMemo(() => {
    const width = COLUMN_WIDTHS.channelHeader + COLUMN_WIDTHS.slot * 8
    const height = ROW_HEIGHTS.ruler + ROW_HEIGHTS.channel * Math.max(rows.length, 1)
    return { width, height }
  }, [rows.length])

  const activeId = activeWireId ?? hoveredId

  const paths = useMemo(() => {
    return wires
      .map((wire) => {
        const fromRow = rowIndex(rows, wire.from.rowId)
        const toRow = rowIndex(rows, wire.to.rowId)
        if (fromRow < 0 || toRow < 0) return null

        const x1 = slotCenter(wire.from.slotIndex)
        const y1 = rowCenterY(fromRow)
        const x2 = slotCenter(wire.to.slotIndex)
        const y2 = rowCenterY(toRow)
        const midX = (x1 + x2) / 2
        const midY = (y1 + y2) / 2

        const dAttr = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
        const stroke = KIND_STROKE[wire.kind]
        const isActive = wire.id === activeId

        return { wire, dAttr, stroke, midX, midY, isActive }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
  }, [wires, rows, activeId])

  return (
    <svg
      className="ucg-wire-overlay"
      width={viewBox.width}
      height={viewBox.height}
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      role="img"
      aria-label={`Routing overlay with ${wires.length} wires`}
      data-wire-count={wires.length}
    >
      {paths.map(({ wire, dAttr, stroke, midX, midY, isActive }) => (
        <g
          key={wire.id}
          className={`ucg-wire ucg-wire--${wire.kind}${isActive ? ' ucg-wire--active' : ''}`}
          data-wire-id={wire.id}
          data-wire-kind={wire.kind}
          data-active={isActive ? 'true' : 'false'}
          onMouseEnter={() => {
            setHoveredId(wire.id)
            onHoverWire?.(wire.id)
          }}
          onMouseLeave={() => {
            setHoveredId(null)
            onHoverWire?.(null)
          }}
          onFocus={() => {
            setHoveredId(wire.id)
            onHoverWire?.(wire.id)
          }}
          onBlur={() => {
            setHoveredId(null)
            onHoverWire?.(null)
          }}
          tabIndex={0}
        >
          <path
            d={dAttr}
            stroke={stroke}
            strokeWidth={isActive ? 3 : 1.5}
            fill="none"
            opacity={isActive ? 1 : 0.6}
          />
          <rect
            x={midX - 14}
            y={midY - 8}
            width={28}
            height={16}
            rx={3}
            fill="var(--cds-layer-01, #161616)"
            stroke={stroke}
          />
          <text
            x={midX}
            y={midY + 4}
            textAnchor="middle"
            fontSize={10}
            fill="var(--cds-text-primary, #f4f4f4)"
          >
            {wire.kind === 'sidechain' ? 'SC' : wire.kind === 'parallel' ? '∥' : '↪'}
          </text>
        </g>
      ))}
    </svg>
  )
}
