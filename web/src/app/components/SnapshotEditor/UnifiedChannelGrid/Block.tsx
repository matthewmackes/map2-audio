import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { Tag } from '@carbon/react'

import { FxIcon } from '../../FxIcons/FxIcon'
import type { FxIconName } from '../../FxIcons/fxIconRegistry'
import type { MAP2Category } from '../categoryHues'
import { useSnapshotSlotStyle } from '../../../hooks/useSnapshotSlotStyle'

import { BLOCK_DIMENSIONS, CATEGORY_COLOR_TOKENS, type BlockKind, type UnifiedSlot } from './gridConstants'

const CATEGORY_ICON: Record<MAP2Category, FxIconName> = {
  Amplifier: 'amplifier',
  Cabinet: 'simulator',
  EQ: 'eq',
  Dynamics: 'compressor',
  Modulation: 'modulator',
  Delay: 'delay',
  Reverb: 'reverb',
  Distortion: 'distortion',
  Utility: 'utility',
  Instrument: 'instrument',
  Drums: 'generator',
  Pitch: 'pitch',
  'Multi-Effect': 'plugin',
  Effects: 'plugin',
  AVB: 'converter',
}

const KIND_ICON: Record<BlockKind, FxIconName> = {
  plugin: 'plugin',
  nam: 'nam',
  'cabinet-ir': 'simulator',
  'reverb-ir': 'reverb',
  eq: 'eq',
  dynamics: 'compressor',
  utility: 'utility',
}

export interface BlockProps {
  slot: UnifiedSlot
  selected?: boolean
  onClick?: (slotIndex: number) => void
  onRemove?: (slotIndex: number) => void
}

function formatCpuPercent(value: number): string {
  const cpu = Number.isFinite(value) ? Math.max(0, value) : 0
  if (cpu >= 10 || Number.isInteger(cpu)) return `${Math.round(cpu)}%`
  return `${cpu.toFixed(1)}%`
}

// Geometry of the V4 CPU-ring overlay. Drawn at 32×32 viewBox; CSS sizes the
// SVG to match the icon span and absolute-positions it behind the glyph.
const RING_RADIUS = 13
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

// Clamp ranges shared by V4 (ring) and V6 (LED bar). The visible-floor of 4%
// keeps idle slots reading as "alive" — a fully-empty ring or a 0px LED bar
// reads as "this slot is broken / has no data". The ceiling of 95% prevents a
// genuinely heavy slot from looking like a complete loop with no room to grow.
const VISUAL_CPU_FLOOR = 4
const VISUAL_CPU_CEILING = 95

function clampVisualCpu(raw: number): number {
  const cpu = Number.isFinite(raw) ? Math.max(0, raw) : 0
  return Math.min(VISUAL_CPU_CEILING, Math.max(VISUAL_CPU_FLOOR, cpu))
}

export function Block({ slot, selected = false, onClick, onRemove }: BlockProps) {
  const category = slot.category ?? 'Unknown'
  const stripColor = CATEGORY_COLOR_TOKENS[category]
  const iconName: FxIconName = slot.category
    ? CATEGORY_ICON[slot.category]
    : slot.kind
      ? KIND_ICON[slot.kind]
      : 'plugin'
  const [slotStyle] = useSnapshotSlotStyle()

  const style: CSSProperties = {
    width: BLOCK_DIMENSIONS.width,
    height: BLOCK_DIMENSIONS.height,
    borderLeft: `${BLOCK_DIMENSIONS.categoryStripWidth}px solid ${stripColor}`,
    opacity: slot.bypass ? 0.5 : 1,
    // Per-block accent surfaced as a CSS variable so the tinted/ring/LED
    // variants can paint without re-selecting on data-category.
    ['--ucg-accent' as string]: stripColor,
  }

  const visualCpu = clampVisualCpu(slot.cpuPercent)
  const ringDash = (visualCpu / 100) * RING_CIRCUMFERENCE

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    onClick?.(slot.index)
  }

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
    onClick?.(slot.index)
  }

  const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onRemove?.(slot.index)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`ucg-block${selected ? ' ucg-block--selected' : ''}`}
      style={style}
      data-category={category}
      data-kind={slot.kind ?? 'none'}
      data-bypass={slot.bypass ? 'true' : 'false'}
      data-slot-style={slotStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={slot.label ?? `Slot ${slot.index + 1}`}
      aria-pressed={selected}
    >
      {slotStyle === 'v6-led' ? (
        <span className="ucg-block__led-bar" aria-hidden="true">
          <span
            className="ucg-block__led-bar-fill"
            style={{ width: `${visualCpu}%` }}
          />
        </span>
      ) : null}
      <span className="ucg-block__icon">
        {slotStyle === 'v4-ring' ? (
          <svg
            className="ucg-block__cpu-ring"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <circle cx="16" cy="16" r={RING_RADIUS} className="ucg-block__cpu-ring-track" />
            <circle
              cx="16"
              cy="16"
              r={RING_RADIUS}
              className="ucg-block__cpu-ring-fill"
              strokeDasharray={`${ringDash} ${RING_CIRCUMFERENCE}`}
              transform="rotate(-90 16 16)"
            />
          </svg>
        ) : null}
        <FxIcon name={iconName} size={20} />
      </span>
      <span className="ucg-block__label">{slot.label ?? '—'}</span>
      {slot.sidechainSourceLabel ? (
        <Tag size="sm" type="cool-gray" className="ucg-block__sc-tag">
          {`SC←${slot.sidechainSourceLabel}`}
        </Tag>
      ) : null}
      <span className="ucg-block__lower-third" aria-label={`CPU ${formatCpuPercent(slot.cpuPercent)}`}>
        <span className="ucg-block__cpu">{formatCpuPercent(slot.cpuPercent)}</span>
        {onRemove ? (
          <button
            type="button"
            className="ucg-block__remove"
            aria-label={`Remove block from slot ${slot.index + 1}`}
            onClick={handleRemove}
          >
            X
          </button>
        ) : null}
      </span>
    </div>
  )
}
