/**
 * mpx1SignalPathRouting.ts — Pure data model + geometry helpers for the signal-path canvas.
 *
 * Routing modes (routing.block_N.routing):
 *   0 = Upper   — block is in the upper signal path
 *   1 = Lower   — block is in the lower signal path
 *   2 = Split   — block is upper AND starts a parallel lower branch
 *   3 = Parallel— block runs in parallel with upper path (goes to lower row)
 *   4 = Merge   — block is upper AND merges the lower branch back in
 *
 * If routing keys are absent from shadow, all blocks default to Upper (0).
 */

import type { MPX1Registry, MPX1RegistryParam } from '../../../map2/mpx1Api'

export type EffectBlockId = 'pitch' | 'chorus' | 'eq' | 'mod' | 'reverb' | 'delay'

/** All six effect types. */
export const ALL_EFFECT_BLOCKS: readonly EffectBlockId[] = [
  'pitch', 'chorus', 'eq', 'mod', 'delay', 'reverb',
]

/**
 * Factory default signal-chain order (matches hardware manual Ord P=C=E=M=D=R).
 * Position 0 = first block processed, position 5 = last.
 */
export const DEFAULT_EFFECT_ORDER: readonly EffectBlockId[] = [
  'pitch', 'chorus', 'eq', 'mod', 'delay', 'reverb',
]

/** Canonical hardware signal-chain order (1=first block processed, 6=last) */
export const BLOCK_SIGNAL_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6]

export const BLOCK_EFFECT_MAP: Readonly<Record<number, EffectBlockId>> = {
  1: 'pitch',
  2: 'chorus',
  3: 'eq',
  4: 'mod',
  5: 'delay',
  6: 'reverb',
}

export const BLOCK_LABELS: Readonly<Record<EffectBlockId, string>> = {
  pitch: 'Pitch',
  chorus: 'Chorus',
  eq: 'EQ',
  mod: 'Mod',
  reverb: 'Reverb',
  delay: 'Delay',
}

/** Colors duplicated from MPX1BlockEditor.tsx — intentionally kept separate to avoid coupling */
export const BLOCK_COLORS: Readonly<Record<EffectBlockId, string>> = {
  pitch: '#22d3ee',
  chorus: '#ec4899',
  eq: '#34d399',
  mod: '#a78bfa',
  reverb: '#f59e0b',
  delay: '#60a5fa',
}

export interface BlockRoutingState {
  blockIndex: number       // 1–6
  effectType: EffectBlockId
  label: string
  color: string
  algorithmIndex: number
  algorithmName: string
  bypassed: boolean
  routingMode: number      // 0=Upper, 1=Lower, 2=Split, 3=Parallel, 4=Merge
  pathType: number         // 0=Single, 1=Double
}

export interface FlowLayout {
  upperRow: number[]            // block indices (ascending) in the upper lane
  lowerRow: number[]            // block indices (ascending) in the lower lane; empty if no split
  splitAtBlock: number | null   // first block index that initiates a split (routingMode=2)
  mergeAtBlock: number | null   // first block index that merges paths (routingMode=4)
}

export interface PatchCord {
  id: string
  fromKey: string    // 'input' | 'block_1'..'block_6' | 'output'
  toKey: string
  color: string
  dashed: boolean    // true when source or destination is bypassed
  animated: boolean
  isLowerBranch: boolean
}

function algorithmKey(index: number): string {
  return `alg_${Math.max(0, index).toString().padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Derive live block states from shadow + registry.
 *  @param effectOrder — ordered list of effect types (default = DEFAULT_EFFECT_ORDER).
 *    Position 0 in the array = chain position 1 (first processed).
 *  @param routingOverrides — local-state routing modes keyed by chain position (1-6).
 *    Takes precedence over shadow values so UI changes are immediately reflected
 *    without waiting for a hardware echo of non-SysEx routing params.
 */
export function computeBlockStates(
  shadow: Record<string, number>,
  registry: MPX1Registry | null,
  effectOrder: readonly EffectBlockId[] = DEFAULT_EFFECT_ORDER,
  routingOverrides: Readonly<Record<number, number>> = {},
): BlockRoutingState[] {
  const paramsById = new Map<string, MPX1RegistryParam>()
  for (const param of registry?.params ?? []) {
    paramsById.set(param.id, param)
  }

  return effectOrder.map((effectType, position) => {
    const blockIndex = position + 1 // 1-based signal chain position
    const algParamId = `program.${effectType}.algorithm`
    const algParam = paramsById.get(algParamId)

    const algMin = algParam ? Math.round(Number(algParam.range?.min ?? 0)) : 0
    const algMax = algParam ? Math.round(Number(algParam.range?.max ?? 0)) : 0
    const rawAlg = shadow[algParamId]
    const algorithmIndex = Number.isFinite(rawAlg)
      ? clamp(Math.round(rawAlg), algMin, algMax)
      : 0

    const algorithmName = `Algorithm ${algorithmIndex.toString().padStart(2, '0')}`

    // Routing state: local overrides take precedence over shadow (routing params
    // are not real SysEx echoed values, so shadow reads would always be 0).
    const routingMode = routingOverrides[blockIndex] ?? shadow[`routing.block_${blockIndex}.routing`] ?? 0
    const pathType = shadow[`routing.block_${blockIndex}.path_type`] ?? 0

    // Bypass detection: look for {effectType}.alg_NN.bypass param
    const bypassParamId = `${effectType}.${algorithmKey(algorithmIndex)}.bypass`
    const bypassParam = paramsById.get(bypassParamId)
    const bypassRaw = bypassParam
      ? (shadow[bypassParamId] ?? bypassParam.default ?? 0)
      : 0
    const bypassed = bypassRaw >= 0.5

    return {
      blockIndex,
      effectType,
      label: BLOCK_LABELS[effectType],
      color: BLOCK_COLORS[effectType],
      algorithmIndex,
      algorithmName,
      bypassed,
      routingMode: Math.round(routingMode),
      pathType: Math.round(pathType),
    }
  })
}

/** Derive upper/lower lane layout from block routing modes */
export function computeFlowLayout(blocks: BlockRoutingState[]): FlowLayout {
  const upperRow: number[] = []
  const lowerRow: number[] = []
  let splitAtBlock: number | null = null
  let mergeAtBlock: number | null = null

  for (const block of blocks) {
    const { blockIndex, routingMode } = block
    if (routingMode === 2) {
      // Split — this block is on upper path and opens a lower branch
      if (splitAtBlock === null) splitAtBlock = blockIndex
      upperRow.push(blockIndex)
    } else if (routingMode === 4) {
      // Merge — this block is on upper path and closes the lower branch
      if (mergeAtBlock === null) mergeAtBlock = blockIndex
      upperRow.push(blockIndex)
    } else if (routingMode === 1 || routingMode === 3) {
      // Lower or Parallel — goes to lower lane
      lowerRow.push(blockIndex)
    } else {
      // Upper (0) or any unknown value — upper lane
      upperRow.push(blockIndex)
    }
  }

  return { upperRow, lowerRow, splitAtBlock, mergeAtBlock }
}

/** Build the list of patch cord descriptors for the SVG overlay */
export function computePatchCords(
  blocks: BlockRoutingState[],
  layout: FlowLayout,
): PatchCord[] {
  const cords: PatchCord[] = []
  const blockByIndex = new Map<number, BlockRoutingState>()
  for (const b of blocks) blockByIndex.set(b.blockIndex, b)

  function cordColor(toKey: string): string {
    if (toKey.startsWith('block_')) {
      const idx = parseInt(toKey.replace('block_', ''), 10)
      const b = blockByIndex.get(idx)
      return b ? b.color : '#94a3b8'
    }
    return '#475569'
  }

  function isNodeBypassed(key: string): boolean {
    if (!key.startsWith('block_')) return false
    const idx = parseInt(key.replace('block_', ''), 10)
    return blockByIndex.get(idx)?.bypassed ?? false
  }

  function makeCord(from: string, to: string, isLowerBranch = false): PatchCord {
    const dashed = isNodeBypassed(to) || isNodeBypassed(from)
    return {
      id: `${isLowerBranch ? 'lo:' : ''}${from}→${to}`,
      fromKey: from,
      toKey: to,
      color: cordColor(to),
      dashed,
      animated: !dashed,
      isLowerBranch,
    }
  }

  // Upper lane: input → upper blocks → output
  const upperSeq = ['input', ...layout.upperRow.map((i) => `block_${i}`), 'output']
  for (let i = 0; i < upperSeq.length - 1; i++) {
    cords.push(makeCord(upperSeq[i], upperSeq[i + 1], false))
  }

  // Lower lane: splitBlock → lower blocks → (mergeBlock if exists)
  if (layout.lowerRow.length > 0 && layout.splitAtBlock !== null) {
    const lowerSeq: string[] = [
      `block_${layout.splitAtBlock}`,
      ...layout.lowerRow.map((i) => `block_${i}`),
    ]
    if (layout.mergeAtBlock !== null) {
      lowerSeq.push(`block_${layout.mergeAtBlock}`)
    }
    for (let i = 0; i < lowerSeq.length - 1; i++) {
      cords.push(makeCord(lowerSeq[i], lowerSeq[i + 1], true))
    }
  }

  return cords
}
