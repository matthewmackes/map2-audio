export interface SnapshotEditorFlowCardPaletteEntry {
  label: string
  color: string
  bg: string
}

export interface SnapshotEditorFlowLabelRef {
  id: string
  label: string
}

export interface SnapshotEditorFlowCardMetadataOptions {
  flowSummary: string
  isActive: boolean
  activeAudio: boolean
  branchLabel?: string | null
  secondaryAnnotation?: string | null
  ioLabel: string
  clockLabel: string
  routingMode: string
  avbLabel: string
}

export const FLOW_CARD_LED_COLOR = 'var(--cds-link-primary)'
export const FLOW_CARD_CLIP_LED_COLOR = 'var(--cds-support-warning)'
export const FLOW_CARD_CLIP_HOLD_MS = 1000

export interface SnapshotEditorFlowClipPluginRef {
  uri: string
  position?: number | null
}

export interface SnapshotEditorFlowClipPeakEntry {
  uri: string
  pluginPosition?: number | null
  isClipping: boolean
  portSymbol?: string | null
}

export type SnapshotEditorFlowClipEdge = 'input' | 'output'

export const FLOW_CARD_SLOT_COLORS: SnapshotEditorFlowCardPaletteEntry[] = [
  {
    label: 'A',
    color: 'var(--cds-green-50, #24a148)',
    bg: 'color-mix(in srgb, var(--cds-green-50, #24a148) 14%, transparent)',
  },
  {
    label: 'B',
    color: 'var(--cds-red-50, #fa4d56)',
    bg: 'color-mix(in srgb, var(--cds-red-50, #fa4d56) 14%, transparent)',
  },
  {
    label: 'C',
    color: 'var(--cds-blue-50, #0f62fe)',
    bg: 'color-mix(in srgb, var(--cds-blue-50, #0f62fe) 14%, transparent)',
  },
  {
    label: 'D',
    color: 'var(--cds-purple-50, #8a3ffc)',
    bg: 'color-mix(in srgb, var(--cds-purple-50, #8a3ffc) 14%, transparent)',
  },
  {
    label: 'E',
    color: 'var(--cds-teal-50, #009d9a)',
    bg: 'color-mix(in srgb, var(--cds-teal-50, #009d9a) 14%, transparent)',
  },
  {
    label: 'F',
    color: 'var(--cds-orange-50, #eb6200)',
    bg: 'color-mix(in srgb, var(--cds-orange-50, #eb6200) 14%, transparent)',
  },
]

export function getFlowCardPaletteEntry(index: number): SnapshotEditorFlowCardPaletteEntry {
  const normalizedIndex = ((index % FLOW_CARD_SLOT_COLORS.length) + FLOW_CARD_SLOT_COLORS.length) % FLOW_CARD_SLOT_COLORS.length
  return FLOW_CARD_SLOT_COLORS[normalizedIndex]
}

function pushUnique(items: string[], value: string | null | undefined): void {
  const nextValue = value?.trim()
  if (!nextValue) {
    return
  }

  if (items[items.length - 1] === nextValue) {
    return
  }

  items.push(nextValue)
}

export function buildFlowCardMetadataItems({
  flowSummary,
  isActive,
  activeAudio,
  branchLabel,
  secondaryAnnotation,
  ioLabel,
  clockLabel,
  routingMode,
  avbLabel,
}: SnapshotEditorFlowCardMetadataOptions): string[] {
  const items: string[] = []

  pushUnique(items, flowSummary)
  if (isActive) {
    pushUnique(items, 'Selected')
  }

  pushUnique(items, activeAudio ? 'Configured path' : branchLabel)
  pushUnique(items, secondaryAnnotation)
  pushUnique(items, 'I/O routing')
  pushUnique(items, ioLabel)
  pushUnique(items, clockLabel)
  pushUnique(items, routingMode.toUpperCase())
  pushUnique(items, avbLabel.toUpperCase())

  return items
}

export function buildFlowCardMetadataLine(options: SnapshotEditorFlowCardMetadataOptions): string {
  return buildFlowCardMetadataItems(options).join(' / ')
}

export function buildFlowCardMetadataLines({
  flowSummary,
  isActive,
  activeAudio,
  branchLabel,
  secondaryAnnotation,
  ioLabel,
  clockLabel,
  routingMode,
  avbLabel,
}: SnapshotEditorFlowCardMetadataOptions): [string, string] {
  const primaryItems = [
    flowSummary,
    isActive ? 'Selected' : null,
    activeAudio ? 'Configured path' : branchLabel,
    secondaryAnnotation,
  ].filter((item): item is string => Boolean(item?.trim()))

  const secondaryItems = [
    'I/O routing',
    ioLabel,
    clockLabel,
    routingMode.toUpperCase(),
    avbLabel.toUpperCase(),
  ].filter((item): item is string => Boolean(item?.trim()))

  return [primaryItems.join(' / '), secondaryItems.join(' / ')]
}

export function normalizeFlowCardLabel(value: string): string {
  return value.trim()
}

export function validateFlowCardLabel(
  value: string,
  flowId: string,
  flowSlots: readonly SnapshotEditorFlowLabelRef[],
): string | null {
  const normalized = normalizeFlowCardLabel(value)
  if (!normalized) {
    return 'Channel name is required.'
  }

  const duplicate = flowSlots.some((flow) => (
    flow.id !== flowId && normalizeFlowCardLabel(flow.label).toLowerCase() === normalized.toLowerCase()
  ))
  if (duplicate) {
    return 'Channel names must be unique within this snapshot.'
  }

  return null
}

export function resolveFlowClipTimestamp(
  plugins: readonly SnapshotEditorFlowClipPluginRef[],
  peakEntries: readonly SnapshotEditorFlowClipPeakEntry[],
  previousTimestamp: number | null | undefined,
  now: number,
  holdMs: number = FLOW_CARD_CLIP_HOLD_MS,
): number | null {
  const clipped = plugins.some((plugin) => peakEntries.some((entry) => (
    entry.isClipping
      && entry.uri === plugin.uri
      && (
        entry.pluginPosition == null
        || plugin.position == null
        || entry.pluginPosition === plugin.position
      )
  )))

  if (clipped) {
    return now
  }

  if (typeof previousTimestamp === 'number' && now - previousTimestamp < holdMs) {
    return previousTimestamp
  }

  return null
}

function matchesFlowClipEdgePortSymbol(
  portSymbol: string | null | undefined,
  edge: SnapshotEditorFlowClipEdge,
): boolean {
  const token = portSymbol?.trim().toLowerCase()
  if (!token) {
    return false
  }

  if (edge === 'input') {
    return token.includes('input') || token.startsWith('in_') || token === 'in'
  }

  return token.includes('output') || token.startsWith('out_') || token === 'out'
}

export function resolveFlowEdgeClipTimestamp(
  plugins: readonly SnapshotEditorFlowClipPluginRef[],
  peakEntries: readonly SnapshotEditorFlowClipPeakEntry[],
  edge: SnapshotEditorFlowClipEdge,
  previousTimestamp: number | null | undefined,
  now: number,
  holdMs: number = FLOW_CARD_CLIP_HOLD_MS,
): number | null {
  const plugin = edge === 'input' ? plugins[0] : plugins[plugins.length - 1]

  if (!plugin) {
    return null
  }

  const matchingEntries = peakEntries.filter((entry) => (
    entry.uri === plugin.uri
      && (
        entry.pluginPosition == null
        || plugin.position == null
        || entry.pluginPosition === plugin.position
      )
  ))
  const edgeEntries = matchingEntries.filter((entry) => matchesFlowClipEdgePortSymbol(entry.portSymbol, edge))
  const entriesToCheck = edgeEntries.length > 0 ? edgeEntries : matchingEntries
  const clipped = entriesToCheck.some((entry) => entry.isClipping)

  if (clipped) {
    return now
  }

  if (typeof previousTimestamp === 'number' && now - previousTimestamp < holdMs) {
    return previousTimestamp
  }

  return null
}
