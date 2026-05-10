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

// T2502: every MAP2 category resolves to a distinct accent so chains that
// mix similar plugin types stay scannable. Collision history (pre-T2502):
//   Distortion + Drums         → both rose
//   Pitch + Multi-Effect       → both purple
//   Cabinet + Utility + Effects → all warm-gray
//   Dynamics + Instrument      → both green
//   Delay + AVB                → both sky
// Resolved by reassigning Drums (coral), Pitch (indigo), Utility (cool slate),
// Effects (taupe), Instrument (mint-cyan), and AVB (steel) below.
export const CATEGORY_COLOR_TOKENS: Record<MAP2Category | 'Unknown', string> = {
  Amplifier: 'var(--map2-cat-amplifier, #e48a3a)',
  Cabinet: 'var(--map2-cat-cabinet, #8a8f95)',
  EQ: 'var(--map2-cat-eq, #e0b446)',
  Dynamics: 'var(--map2-cat-dynamics, #3fbf8a)',
  Modulation: 'var(--map2-cat-modulation, #5bc9a8)',
  Delay: 'var(--map2-cat-delay, #5fa8e0)',
  Reverb: 'var(--map2-cat-reverb, #3db7c9)',
  Distortion: 'var(--map2-cat-distortion, #e36b8e)',
  Utility: 'var(--map2-cat-utility, #6f7a8a)',
  Instrument: 'var(--map2-cat-instrument, #6dd0a8)',
  Drums: 'var(--map2-cat-drums, #e89478)',
  Pitch: 'var(--map2-cat-pitch, #7d6acb)',
  'Multi-Effect': 'var(--map2-cat-multi-effect, #9b7cd6)',
  Effects: 'var(--map2-cat-effects, #a89c8a)',
  AVB: 'var(--map2-cat-avb, #4a85b8)',
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
