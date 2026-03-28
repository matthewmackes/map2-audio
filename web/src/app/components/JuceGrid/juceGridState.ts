export type JuceGridRoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

export interface JuceGridFlowSlotState {
  id: string
  chainId: number | null
  label: string
  color: string
  muted: boolean
  solo: boolean
  dryWetMix: number
}

export interface JuceGridRoutingState {
  mode: JuceGridRoutingMode
  activeSlotId: string | null
  blendPositions: Record<string, number>
  morphProgress: number
  morphSourceSlotId: string | null
  morphTargetSlotId: string | null
  seriesOrder: string[]
}

export interface JuceGridSlotPaletteEntry {
  label: string
  color: string
}

export interface JuceGridFlowNormalizationOptions {
  palette: JuceGridSlotPaletteEntry[]
  defaultCount: number
  maxFlows: number
}

export interface JuceGridHydratedState {
  flowSlots: JuceGridFlowSlotState[]
  routing: JuceGridRoutingState
  activeFlowIndex: number
}

const ROUTING_MODES: JuceGridRoutingMode[] = [
  'parallel_blend',
  'ab_switch',
  'series',
  'parameter_morph',
  'sidechain',
]

const ROUTING_MODE_SET = new Set<JuceGridRoutingMode>(ROUTING_MODES)
const DEFAULT_FLOW_COLOR = '#2563eb'
const DEFAULT_DRY_WET_MIX = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function fallbackLabelForIndex(index: number): string {
  return String.fromCharCode(65 + index)
}

function getPaletteEntry(
  palette: JuceGridSlotPaletteEntry[],
  index: number,
): JuceGridSlotPaletteEntry {
  return palette[index] ?? {
    label: fallbackLabelForIndex(index),
    color: DEFAULT_FLOW_COLOR,
  }
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function normalizeBoolean(value: unknown, fallback: boolean = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    if (value === 'true') {
      return true
    }
    if (value === 'false') {
      return false
    }
  }
  if (typeof value === 'number') {
    if (value === 1) {
      return true
    }
    if (value === 0) {
      return false
    }
  }
  return fallback
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function normalizePercent(value: unknown, fallback: number): number {
  const parsed = normalizeNumber(value)
  if (parsed === null) {
    return fallback
  }
  return clamp(Math.round(parsed), 0, 100)
}

function normalizeUnitInterval(value: unknown, fallback: number): number {
  const parsed = normalizeNumber(value)
  if (parsed === null) {
    return fallback
  }
  return clamp(parsed, 0, 1)
}

function normalizeChainId(value: unknown): number | null {
  const parsed = normalizeNumber(value)
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

function createDefaultFlowSlot(
  index: number,
  palette: JuceGridSlotPaletteEntry[],
): JuceGridFlowSlotState {
  const paletteEntry = getPaletteEntry(palette, index)
  return {
    id: `flow-${index}`,
    chainId: null,
    label: paletteEntry.label,
    color: paletteEntry.color,
    muted: false,
    solo: false,
    dryWetMix: DEFAULT_DRY_WET_MIX,
  }
}

function resolveUniqueFlowId(
  value: unknown,
  fallback: string,
  seenIds: Set<string>,
): string {
  let candidate = normalizeString(value, fallback)
  if (!seenIds.has(candidate)) {
    seenIds.add(candidate)
    return candidate
  }

  if (!seenIds.has(fallback)) {
    seenIds.add(fallback)
    return fallback
  }

  let suffix = 1
  while (seenIds.has(`${fallback}-${suffix}`)) {
    suffix += 1
  }
  candidate = `${fallback}-${suffix}`
  seenIds.add(candidate)
  return candidate
}

function normalizeRoutingMode(value: unknown): JuceGridRoutingMode {
  return typeof value === 'string' && ROUTING_MODE_SET.has(value as JuceGridRoutingMode)
    ? value as JuceGridRoutingMode
    : 'parallel_blend'
}

function normalizeOptionalFlowId(
  value: unknown,
  validIds: Set<string>,
): string | null {
  return typeof value === 'string' && validIds.has(value) ? value : null
}

function normalizeBlendPositions(
  value: unknown,
  validIds: Set<string>,
): Record<string, number> {
  const positions: Record<string, number> = {}
  if (!isRecord(value)) {
    return positions
  }

  for (const [flowId, rawValue] of Object.entries(value)) {
    if (!validIds.has(flowId)) {
      continue
    }
    positions[flowId] = normalizePercent(rawValue, DEFAULT_DRY_WET_MIX)
  }

  return positions
}

function normalizeSeriesOrder(
  value: unknown,
  flowSlots: JuceGridFlowSlotState[],
): string[] {
  const validIds = new Set(flowSlots.map((slot) => slot.id))
  const seenIds = new Set<string>()
  const orderedIds: string[] = []

  if (Array.isArray(value)) {
    for (const rawId of value) {
      if (typeof rawId !== 'string' || !validIds.has(rawId) || seenIds.has(rawId)) {
        continue
      }
      seenIds.add(rawId)
      orderedIds.push(rawId)
    }
  }

  for (const slot of flowSlots) {
    if (seenIds.has(slot.id)) {
      continue
    }
    seenIds.add(slot.id)
    orderedIds.push(slot.id)
  }

  return orderedIds
}

export function createDefaultJuceGridFlowSlots(
  palette: JuceGridSlotPaletteEntry[],
  count: number,
): JuceGridFlowSlotState[] {
  return Array.from({ length: count }, (_, index) => createDefaultFlowSlot(index, palette))
}

export function createDefaultJuceGridRouting(): JuceGridRoutingState {
  return {
    mode: 'parallel_blend',
    activeSlotId: 'flow-0',
    blendPositions: {},
    morphProgress: 0.5,
    morphSourceSlotId: null,
    morphTargetSlotId: null,
    seriesOrder: [],
  }
}

export function normalizeJuceGridFlowSlots(
  value: unknown,
  options: JuceGridFlowNormalizationOptions,
): JuceGridFlowSlotState[] {
  const sourceSlots = Array.isArray(value) ? value : []
  const normalizedCount = sourceSlots.length > 0
    ? clamp(sourceSlots.length, 1, options.maxFlows)
    : options.defaultCount
  const seenIds = new Set<string>()

  return Array.from({ length: normalizedCount }, (_, index) => {
    const fallback = createDefaultFlowSlot(index, options.palette)
    const source = sourceSlots[index]

    if (!isRecord(source)) {
      return {
        ...fallback,
        id: resolveUniqueFlowId(undefined, fallback.id, seenIds),
      }
    }

    const paletteEntry = getPaletteEntry(options.palette, index)

    return {
      id: resolveUniqueFlowId(source.id, fallback.id, seenIds),
      chainId: normalizeChainId(source.chainId),
      label: normalizeString(source.label, paletteEntry.label),
      color: normalizeString(source.color, paletteEntry.color),
      muted: normalizeBoolean(source.muted, false),
      solo: normalizeBoolean(source.solo, false),
      dryWetMix: normalizePercent(source.dryWetMix, DEFAULT_DRY_WET_MIX),
    }
  })
}

export function normalizeJuceGridRouting(
  value: unknown,
  flowSlots: JuceGridFlowSlotState[],
): JuceGridRoutingState {
  const defaults = createDefaultJuceGridRouting()
  const source = isRecord(value) ? value : {}
  const validIds = new Set(flowSlots.map((slot) => slot.id))
  const firstFlowId = flowSlots[0]?.id ?? defaults.activeSlotId

  return {
    mode: normalizeRoutingMode(source.mode),
    activeSlotId: normalizeOptionalFlowId(source.activeSlotId, validIds) ?? firstFlowId,
    blendPositions: normalizeBlendPositions(source.blendPositions, validIds),
    morphProgress: normalizeUnitInterval(source.morphProgress, defaults.morphProgress),
    morphSourceSlotId: normalizeOptionalFlowId(source.morphSourceSlotId, validIds),
    morphTargetSlotId: normalizeOptionalFlowId(source.morphTargetSlotId, validIds),
    seriesOrder: normalizeSeriesOrder(source.seriesOrder, flowSlots),
  }
}

export function normalizeJuceGridActiveFlowIndex(
  value: unknown,
  flowSlots: JuceGridFlowSlotState[],
): number {
  const parsed = normalizeNumber(value)
  if (parsed === null || !Number.isInteger(parsed)) {
    return 0
  }
  return clamp(parsed, 0, Math.max(flowSlots.length - 1, 0))
}

export function normalizeJuceGridStateSources(
  flowSlotSource: unknown,
  routingSource: unknown,
  activeIndexSource: unknown,
  options: JuceGridFlowNormalizationOptions,
): JuceGridHydratedState {
  const flowSlots = normalizeJuceGridFlowSlots(flowSlotSource, options)
  return {
    flowSlots,
    routing: normalizeJuceGridRouting(routingSource, flowSlots),
    activeFlowIndex: normalizeJuceGridActiveFlowIndex(activeIndexSource, flowSlots),
  }
}
