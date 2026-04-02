import type { SnapshotDetail, SnapshotMidiMapEntry } from '../../map2/types'
import { sanitizeRestrictedDisplayText } from '../../map2/displayNames'

export const SNAPSHOT_FOOTSWITCH_LABEL_ACTION = 'footswitch_label_map'
export const SNAPSHOT_FOOTSWITCH_LABEL_COUNT = 8
export const SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH = 8

export type SnapshotFootswitchLabelMap = Record<string, string>

export function sanitizeFootswitchLabel(value: unknown): string {
  const sanitized = sanitizeRestrictedDisplayText(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
  return sanitized.slice(0, SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH)
}

export function createEmptyFootswitchLabelDrafts(): SnapshotFootswitchLabelMap {
  return Object.fromEntries(
    Array.from({ length: SNAPSHOT_FOOTSWITCH_LABEL_COUNT }, (_, index) => [String(index + 1), '']),
  )
}

export function normalizeFootswitchLabelMap(value: unknown): SnapshotFootswitchLabelMap {
  const normalized = createEmptyFootswitchLabelDrafts()
  if (!value || typeof value !== 'object') {
    return normalized
  }

  for (const [rawSwitch, rawLabel] of Object.entries(value)) {
    const switchNumber = Number.parseInt(rawSwitch, 10)
    if (!Number.isFinite(switchNumber) || switchNumber < 1 || switchNumber > SNAPSHOT_FOOTSWITCH_LABEL_COUNT) {
      continue
    }
    normalized[String(switchNumber)] = sanitizeFootswitchLabel(rawLabel)
  }

  return normalized
}

function isFootswitchLabelEntry(entry: SnapshotMidiMapEntry): boolean {
  return entry.action === SNAPSHOT_FOOTSWITCH_LABEL_ACTION
}

export function getSnapshotFootswitchLabelMap(entries: readonly SnapshotMidiMapEntry[]): SnapshotFootswitchLabelMap {
  const entry = entries.find(isFootswitchLabelEntry)
  return normalizeFootswitchLabelMap(entry?.label_map ?? entry?.labels)
}

export function replaceSnapshotFootswitchLabelMap(
  entries: readonly SnapshotMidiMapEntry[],
  labelMap: SnapshotFootswitchLabelMap,
): SnapshotMidiMapEntry[] {
  const preservedEntries = entries
    .filter((entry) => !isFootswitchLabelEntry(entry))
    .map((entry) => ({ ...entry }))

  const normalizedLabelMap = normalizeFootswitchLabelMap(labelMap)
  const hasLabels = Object.values(normalizedLabelMap).some((label) => label.length > 0)
  if (!hasLabels) {
    return preservedEntries
  }

  return [
    ...preservedEntries,
    {
      action: SNAPSHOT_FOOTSWITCH_LABEL_ACTION,
      label_map: Object.fromEntries(
        Object.entries(normalizedLabelMap).filter(([, label]) => label.length > 0),
      ),
      max_length: SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH,
    },
  ]
}

export function normalizeSnapshotFootswitchLabelSnapshot(
  snapshot: SnapshotDetail,
  entries: readonly SnapshotMidiMapEntry[],
): SnapshotDetail {
  const normalizedEntries = entries.map((entry) => ({ ...entry }))
  return {
    ...snapshot,
    midi_map: normalizedEntries.map((entry) => ({ ...entry })),
    controls: {
      ...snapshot.controls,
      midi_map: normalizedEntries.map((entry) => ({ ...entry })),
    },
  }
}
