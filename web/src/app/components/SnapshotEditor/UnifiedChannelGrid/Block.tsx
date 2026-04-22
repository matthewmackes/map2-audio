import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { Tag } from '@carbon/react'

import { FxIcon } from '../../FxIcons/FxIcon'
import type { FxIconName } from '../../FxIcons/fxIconRegistry'
import type { MAP2Category } from '../categoryHues'

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

export function Block({ slot, selected = false, onClick, onRemove }: BlockProps) {
  const category = slot.category ?? 'Unknown'
  const stripColor = CATEGORY_COLOR_TOKENS[category]
  const iconName: FxIconName = slot.category
    ? CATEGORY_ICON[slot.category]
    : slot.kind
      ? KIND_ICON[slot.kind]
      : 'plugin'

  const style: CSSProperties = {
    width: BLOCK_DIMENSIONS.width,
    height: BLOCK_DIMENSIONS.height,
    borderLeft: `${BLOCK_DIMENSIONS.categoryStripWidth}px solid ${stripColor}`,
    opacity: slot.bypass ? 0.5 : 1,
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
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
      onClick={() => onClick?.(slot.index)}
      onKeyDown={handleKeyDown}
      aria-label={slot.label ?? `Slot ${slot.index + 1}`}
      aria-pressed={selected}
    >
      <span className="ucg-block__icon">
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
