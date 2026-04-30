/**
 * T710-sub13 — Shared layout constants and row/slot/block types for the
 * Unified Channel Grid primitives (ChannelRow, ChannelHeader, Block,
 * EmptySlot, SlotRuler, UnifiedChannelGrid).
 *
 * Numeric values are in CSS pixels. Consumers import these constants as
 * CSS custom properties via `UnifiedChannelGrid.css` (added in sub19).
 */

import type { MAP2Category } from '../categoryHues'

export const SLOT_COUNT = 8 as const

export const COLUMN_WIDTHS = {
  channelHeader: 240,
  slot: 128,
  insertGap: 16,
} as const

export const ROW_HEIGHTS = {
  ruler: 28,
  channel: 148,
} as const

export const BLOCK_DIMENSIONS = {
  width: COLUMN_WIDTHS.slot - 12,
  height: 60,
  categoryStripWidth: 4,
} as const

export const CATEGORY_COLOR_TOKENS: Record<MAP2Category | 'Unknown', string> = {
  Amplifier: 'var(--map2-cat-amplifier, #d79a3a)',
  Cabinet: 'var(--map2-cat-cabinet, #a28463)',
  EQ: 'var(--map2-cat-eq, #4a7dff)',
  Dynamics: 'var(--map2-cat-dynamics, #3bb375)',
  Modulation: 'var(--map2-cat-modulation, #b268d9)',
  Delay: 'var(--map2-cat-delay, #34a6b8)',
  Reverb: 'var(--map2-cat-reverb, #34a6b8)',
  Distortion: 'var(--map2-cat-distortion, #e55a3a)',
  Utility: 'var(--map2-cat-utility, #8d8d8d)',
  Instrument: 'var(--map2-cat-instrument, #3bb375)',
  Drums: 'var(--map2-cat-drums, #e55a3a)',
  Pitch: 'var(--map2-cat-pitch, #34a6b8)',
  'Multi-Effect': 'var(--map2-cat-multi-effect, #b268d9)',
  Effects: 'var(--map2-cat-effects, #8d8d8d)',
  AVB: 'var(--map2-cat-avb, #4a7dff)',
  Unknown: 'var(--map2-cat-unknown, #525252)',
}

export type BlockKind = 'plugin' | 'nam' | 'cabinet-ir' | 'reverb-ir' | 'eq' | 'dynamics' | 'utility'

export interface UnifiedSlot {
  index: number
  kind: BlockKind | null
  uri: string | null
  label: string | null
  category: MAP2Category | null
  bypass: boolean
  sidechainSourceLabel: string | null
  cpuPercent: number
}

export interface UnifiedChannelRow {
  id: string
  name: string
  ioLabel: string
  muted: boolean
  solo: boolean
  stereo: boolean
  slots: UnifiedSlot[]
}

export function makeEmptySlot(index: number): UnifiedSlot {
  return {
    index,
    kind: null,
    uri: null,
    label: null,
    category: null,
    bypass: false,
    sidechainSourceLabel: null,
    cpuPercent: 0,
  }
}

export function makeEmptyRow(id: string, name: string): UnifiedChannelRow {
  return {
    id,
    name,
    ioLabel: '',
    muted: false,
    solo: false,
    stereo: false,
    slots: Array.from({ length: SLOT_COUNT }, (_, i) => makeEmptySlot(i)),
  }
}
