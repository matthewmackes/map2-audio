export interface SnapshotEditorFlowCardPaletteEntry {
  label: string
  color: string
  bg: string
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

export const FLOW_CARD_SLOT_COLORS: SnapshotEditorFlowCardPaletteEntry[] = [
  {
    label: 'A',
    color: 'var(--cds-link-primary)',
    bg: 'color-mix(in srgb, var(--cds-link-primary) 15%, transparent)',
  },
  {
    label: 'B',
    color: 'var(--cds-support-info)',
    bg: 'color-mix(in srgb, var(--cds-support-info) 15%, transparent)',
  },
  {
    label: 'C',
    color: 'var(--cds-support-success)',
    bg: 'color-mix(in srgb, var(--cds-support-success) 15%, transparent)',
  },
  {
    label: 'D',
    color: 'var(--cds-support-warning)',
    bg: 'color-mix(in srgb, var(--cds-support-warning) 16%, transparent)',
  },
  {
    label: 'E',
    color: 'color-mix(in srgb, var(--cds-link-primary) 72%, var(--cds-support-info) 28%)',
    bg: 'color-mix(in srgb, var(--cds-link-primary) 11%, transparent)',
  },
  {
    label: 'F',
    color: 'color-mix(in srgb, var(--cds-support-success) 62%, var(--cds-link-primary) 38%)',
    bg: 'color-mix(in srgb, var(--cds-support-success) 12%, transparent)',
  },
]

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

  pushUnique(items, activeAudio ? 'Live path' : branchLabel)
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
    activeAudio ? 'Live path' : branchLabel,
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
