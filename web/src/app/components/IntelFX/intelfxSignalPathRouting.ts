/**
 * intelfxSignalPathRouting.ts — Pure data model + geometry helpers for the IntelFX signal-path canvas.
 *
 * The Digitech IntelFX is a purely serial signal chain (no upper/lower lane routing):
 *   INPUT -> HUSH -> Compressor -> Wah -> EQ -> Pitch -> Chorus -> Flanger -> Phaser -> Tremolo -> Delay -> Reverb -> OUTPUT
 */

import type { IntelFXRegistry, IntelFXRegistryParam } from '../../../map2/intelfxApi'

export type IntelFXEffectBlockId =
  | 'hush'
  | 'compressor'
  | 'wah'
  | 'eq'
  | 'pitch'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'tremolo'
  | 'delay'
  | 'reverb'

export const INTELFX_DEFAULT_EFFECT_ORDER: IntelFXEffectBlockId[] = [
  'hush',
  'compressor',
  'wah',
  'eq',
  'pitch',
  'chorus',
  'flanger',
  'phaser',
  'tremolo',
  'delay',
  'reverb',
]

export const INTELFX_BLOCK_META: Record<
  IntelFXEffectBlockId,
  { label: string; shortLabel: string; color: string; category: string }
> = {
  hush: { label: 'HUSH', shortLabel: 'HSH', color: '#6b7280', category: 'dynamics' },
  compressor: { label: 'Compressor', shortLabel: 'CMP', color: '#ef4444', category: 'dynamics' },
  wah: { label: 'Wah', shortLabel: 'WAH', color: '#f59e0b', category: 'filter' },
  eq: { label: 'EQ', shortLabel: 'EQ', color: '#22c55e', category: 'eq' },
  pitch: { label: 'Pitch', shortLabel: 'PIT', color: '#06b6d4', category: 'pitch' },
  chorus: { label: 'Chorus', shortLabel: 'CHO', color: '#ec4899', category: 'modulation' },
  flanger: { label: 'Flanger', shortLabel: 'FLG', color: '#8b5cf6', category: 'modulation' },
  phaser: { label: 'Phaser', shortLabel: 'PHA', color: '#a855f7', category: 'modulation' },
  tremolo: { label: 'Tremolo', shortLabel: 'TRM', color: '#f97316', category: 'modulation' },
  delay: { label: 'Delay', shortLabel: 'DLY', color: '#3b82f6', category: 'time' },
  reverb: { label: 'Reverb', shortLabel: 'REV', color: '#14b8a6', category: 'ambience' },
}

// ── Block state types ────────────────────────────────────────────────────────

export interface IntelFXBlockState {
  blockIndex: number // 1–11 (serial position)
  effectType: IntelFXEffectBlockId
  label: string
  shortLabel: string
  color: string
  category: string
  bypassed: boolean
  /** Key parameter value to show on the card (e.g. mix level) */
  keyParamValue: number | null
  keyParamLabel: string | null
}

export interface IntelFXSerialLayout {
  /** Block indices in signal flow order */
  blocks: number[]
  /** X,Y positions for each block index (keyed by blockIndex) */
  positions: Record<number, { x: number; y: number; row: number; col: number }>
  /** Number of columns in the top row */
  topRowCount: number
  /** Number of columns in the bottom row */
  bottomRowCount: number
}

export interface IntelFXPatchCord {
  id: string
  fromKey: string // 'input' | 'block_1'..'block_11' | 'output'
  toKey: string
  color: string
  dashed: boolean // true when source or destination is bypassed
  animated: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function algorithmKey(index: number): string {
  return `alg_${Math.max(0, index).toString().padStart(2, '0')}`
}

// ── Compute functions ────────────────────────────────────────────────────────

/**
 * Derive live block states from shadow + registry.
 * The IntelFX has no routing modes — all blocks are serial.
 */
export function computeBlockStates(
  shadow: Record<string, number>,
  registry: IntelFXRegistry | null,
  effectOrder: IntelFXEffectBlockId[] = INTELFX_DEFAULT_EFFECT_ORDER,
): IntelFXBlockState[] {
  const paramsById = new Map<string, IntelFXRegistryParam>()
  for (const param of registry?.params ?? []) {
    paramsById.set(param.id, param)
  }

  return effectOrder.map((effectType, position) => {
    const blockIndex = position + 1
    const meta = INTELFX_BLOCK_META[effectType]

    // Bypass detection: look for {effectType}.bypass or {effectType}.alg_NN.bypass
    // Try direct bypass first, then algorithm-specific
    let bypassed = false
    const directBypass = shadow[`${effectType}.bypass`]
    if (Number.isFinite(directBypass)) {
      bypassed = directBypass >= 0.5
    } else {
      // Try algorithm-specific bypass
      const algParamId = `program.${effectType}.algorithm`
      const algParam = paramsById.get(algParamId)
      const algMin = algParam ? Math.round(Number(algParam.range?.min ?? 0)) : 0
      const algMax = algParam ? Math.round(Number(algParam.range?.max ?? 0)) : 0
      const rawAlg = shadow[algParamId]
      const algorithmIndex = Number.isFinite(rawAlg)
        ? clamp(Math.round(rawAlg), algMin, algMax)
        : 0
      const bypassParamId = `${effectType}.${algorithmKey(algorithmIndex)}.bypass`
      const bypassRaw = shadow[bypassParamId]
      if (Number.isFinite(bypassRaw)) {
        bypassed = bypassRaw >= 0.5
      } else {
        const bypassParam = paramsById.get(bypassParamId)
        if (bypassParam) {
          bypassed = (bypassParam.default ?? 0) >= 0.5
        }
      }
    }

    // Try to find a key display parameter (mix or level)
    let keyParamValue: number | null = null
    let keyParamLabel: string | null = null
    const mixParamId = `${effectType}.mix`
    const levelParamId = `${effectType}.level`
    if (Number.isFinite(shadow[mixParamId])) {
      keyParamValue = shadow[mixParamId]
      keyParamLabel = 'Mix'
    } else if (Number.isFinite(shadow[levelParamId])) {
      keyParamValue = shadow[levelParamId]
      keyParamLabel = 'Level'
    }

    return {
      blockIndex,
      effectType,
      label: meta.label,
      shortLabel: meta.shortLabel,
      color: meta.color,
      category: meta.category,
      bypassed,
      keyParamValue,
      keyParamLabel,
    }
  })
}

/**
 * Compute a 2-row grid layout for the serial chain.
 * Top row: first 6 blocks (INPUT + 6 blocks)
 * Bottom row: remaining 5 blocks (5 blocks + OUTPUT)
 * This gives a natural left-to-right-then-wrap flow.
 */
export function computeSerialLayout(blockStates: IntelFXBlockState[]): IntelFXSerialLayout {
  const totalBlocks = blockStates.length
  const topRowCount = Math.ceil(totalBlocks / 2)
  const bottomRowCount = totalBlocks - topRowCount
  const positions: Record<number, { x: number; y: number; row: number; col: number }> = {}
  const blocks: number[] = []

  for (let i = 0; i < totalBlocks; i++) {
    const block = blockStates[i]
    blocks.push(block.blockIndex)

    if (i < topRowCount) {
      positions[block.blockIndex] = { x: i, y: 0, row: 0, col: i }
    } else {
      positions[block.blockIndex] = { x: i - topRowCount, y: 1, row: 1, col: i - topRowCount }
    }
  }

  return { blocks, positions, topRowCount, bottomRowCount }
}

/**
 * Build patch cord descriptors for the SVG overlay.
 * Serial chain: INPUT -> block_1 -> block_2 -> ... -> block_11 -> OUTPUT
 */
export function computePatchCords(
  blockStates: IntelFXBlockState[],
  _layout: IntelFXSerialLayout,
): IntelFXPatchCord[] {
  const cords: IntelFXPatchCord[] = []
  const blockByIndex = new Map<number, IntelFXBlockState>()
  for (const b of blockStates) blockByIndex.set(b.blockIndex, b)

  function isNodeBypassed(key: string): boolean {
    if (!key.startsWith('block_')) return false
    const idx = parseInt(key.replace('block_', ''), 10)
    return blockByIndex.get(idx)?.bypassed ?? false
  }

  function cordColor(toKey: string): string {
    if (toKey.startsWith('block_')) {
      const idx = parseInt(toKey.replace('block_', ''), 10)
      const b = blockByIndex.get(idx)
      return b ? b.color : '#94a3b8'
    }
    return '#475569'
  }

  // Build the serial sequence: input -> all blocks -> output
  const seq = [
    'input',
    ...blockStates.map((b) => `block_${b.blockIndex}`),
    'output',
  ]

  for (let i = 0; i < seq.length - 1; i++) {
    const from = seq[i]
    const to = seq[i + 1]
    const dashed = isNodeBypassed(to) || isNodeBypassed(from)
    cords.push({
      id: `${from}->${to}`,
      fromKey: from,
      toKey: to,
      color: cordColor(to),
      dashed,
      animated: !dashed,
    })
  }

  return cords
}
