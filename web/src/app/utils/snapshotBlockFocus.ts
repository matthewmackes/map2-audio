import type { SnapshotDetail, SnapshotMidiMapEntry } from '../../map2/types'

export const SNAPSHOT_BLOCK_FOCUS_ACTION = 'focus_block_note_range'

export interface SnapshotBlockFocusRange {
  midiChannel: number | null
  startNote: number
}

export interface SnapshotBlockFocusNoteOn {
  channel: number | null
  note: number
  velocity: number
}

const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

function normalizeMidiNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed.toLowerCase() === 'omni') {
      return null
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function normalizeMidiChannel(value: unknown): number | null {
  const normalized = normalizeMidiNumber(value)
  if (normalized == null || normalized <= 0) {
    return null
  }
  if (normalized > 16) {
    return null
  }
  return normalized
}

function normalizeMidiNote(value: unknown): number | null {
  const normalized = normalizeMidiNumber(value)
  if (normalized == null || normalized < 0 || normalized > 127) {
    return null
  }
  return normalized
}

function parseRawHexBytes(value: unknown): number[] {
  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  return value
    .trim()
    .split(/\s+/)
    .map((segment) => Number.parseInt(segment, 16))
    .filter((byte) => Number.isFinite(byte))
}

function isBlockFocusEntry(entry: SnapshotMidiMapEntry): boolean {
  return entry.action === SNAPSHOT_BLOCK_FOCUS_ACTION
}

export function collectSnapshotMidiMapEntries(
  snapshot: Pick<SnapshotDetail, 'controls' | 'midi_map'> | null | undefined,
): SnapshotMidiMapEntry[] {
  const canonicalEntries = Array.isArray(snapshot?.controls?.midi_map) ? snapshot.controls.midi_map : []
  if (canonicalEntries.length > 0) {
    return canonicalEntries.map((entry) => ({ ...entry }))
  }

  const compatibilityEntries = Array.isArray(snapshot?.midi_map) ? snapshot.midi_map : []
  return compatibilityEntries.map((entry) => ({ ...entry }))
}

export function getSnapshotBlockFocusRange(entries: readonly SnapshotMidiMapEntry[]): SnapshotBlockFocusRange | null {
  const entry = entries.find(isBlockFocusEntry)
  if (!entry) {
    return null
  }

  const startNote = normalizeMidiNote(entry.start_note ?? entry.startNote ?? entry.note_start ?? entry.noteStart)
  if (startNote == null) {
    return null
  }

  return {
    midiChannel: normalizeMidiChannel(entry.midi_channel ?? entry.midiChannel ?? entry.channel),
    startNote,
  }
}

export function replaceSnapshotBlockFocusRange(
  entries: readonly SnapshotMidiMapEntry[],
  range: SnapshotBlockFocusRange | null,
): SnapshotMidiMapEntry[] {
  const preservedEntries = entries
    .filter((entry) => !isBlockFocusEntry(entry))
    .map((entry) => ({ ...entry }))

  if (!range) {
    return preservedEntries
  }

  return [
    ...preservedEntries,
    {
      action: SNAPSHOT_BLOCK_FOCUS_ACTION,
      midi_channel: range.midiChannel,
      start_note: range.startNote,
    },
  ]
}

export function normalizeSnapshotBlockFocusSnapshot(
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

export function parseMidiActivityNoteOn(data: Record<string, unknown>): SnapshotBlockFocusNoteOn | null {
  const messageType = data.message_type ?? data.type
  if (messageType !== 'note_on') {
    return null
  }

  const rawBytes = parseRawHexBytes(data.raw_hex)
  const note = normalizeMidiNote(data.data1 ?? rawBytes[1])
  const velocity = normalizeMidiNote(data.data2 ?? rawBytes[2])
  if (note == null || velocity == null || velocity <= 0) {
    return null
  }

  return {
    channel: normalizeMidiChannel(data.channel ?? (rawBytes[0] != null && rawBytes[0] < 0xF0 ? (rawBytes[0] & 0x0F) + 1 : null)),
    note,
    velocity,
  }
}

export function resolveSnapshotBlockFocusIndex(
  range: SnapshotBlockFocusRange | null,
  noteOn: SnapshotBlockFocusNoteOn | null,
  blockCount: number,
): number | null {
  if (!range || !noteOn || !Number.isFinite(blockCount) || blockCount <= 0) {
    return null
  }

  if (range.midiChannel != null && noteOn.channel !== range.midiChannel) {
    return null
  }

  const blockIndex = noteOn.note - range.startNote
  if (blockIndex < 0 || blockIndex >= blockCount) {
    return null
  }

  return blockIndex
}

export function formatMidiNoteLabel(note: number): string {
  const normalizedNote = normalizeMidiNote(note)
  if (normalizedNote == null) {
    return '--'
  }

  const noteName = MIDI_NOTE_NAMES[normalizedNote % MIDI_NOTE_NAMES.length]
  const octave = Math.floor(normalizedNote / 12) - 2
  return `${noteName}${octave}`
}
