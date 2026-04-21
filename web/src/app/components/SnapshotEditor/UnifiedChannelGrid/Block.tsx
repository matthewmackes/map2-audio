import type { CSSProperties } from 'react'
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
}

export function Block({ slot, selected = false, onClick }: BlockProps) {
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

  return (
    <button
      type="button"
      className={`ucg-block${selected ? ' ucg-block--selected' : ''}`}
      style={style}
      data-category={category}
      data-kind={slot.kind ?? 'none'}
      data-bypass={slot.bypass ? 'true' : 'false'}
      onClick={() => onClick?.(slot.index)}
      aria-label={slot.label ?? `Slot ${slot.index + 1}`}
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
    </button>
  )
}
