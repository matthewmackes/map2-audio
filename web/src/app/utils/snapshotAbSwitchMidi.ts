import type { SnapshotDetail, SnapshotMidiMapEntry } from '../../map2/types'

export const SNAPSHOT_AB_SWITCH_MIDI_ACTION = 'set_routing'
export const SNAPSHOT_AB_SWITCH_ROUTING_ACTION = 'ab_switch_toggle'

export type SnapshotAbSwitchMidiMessageType = 'cc_toggle' | 'note_on'

export interface SnapshotAbSwitchMidiBinding {
  messageType: SnapshotAbSwitchMidiMessageType
  midiChannel: number | null
  number: number
}

function normalizeMidiNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function normalizeMidiChannel(value: unknown): number | null {
  const normalized = normalizeMidiNumber(value)
  if (normalized == null || normalized <= 0 || normalized > 16) {
    return null
  }
  return normalized
}

function normalizeBindingNumber(value: unknown): number | null {
  const normalized = normalizeMidiNumber(value)
  if (normalized == null || normalized < 0 || normalized > 127) {
    return null
  }
  return normalized
}

function isAbSwitchMidiEntry(entry: SnapshotMidiMapEntry): boolean {
  return entry.action === SNAPSHOT_AB_SWITCH_MIDI_ACTION
    && (entry.routing_action === SNAPSHOT_AB_SWITCH_ROUTING_ACTION || entry.routingAction === SNAPSHOT_AB_SWITCH_ROUTING_ACTION)
}

export function getSnapshotAbSwitchMidiBinding(
  entries: readonly SnapshotMidiMapEntry[],
): SnapshotAbSwitchMidiBinding | null {
  const entry = entries.find(isAbSwitchMidiEntry)
  if (!entry) {
    return null
  }

  const messageType: SnapshotAbSwitchMidiMessageType = (
    entry.message_type === 'note_on'
    || entry.messageType === 'note_on'
    || entry.note != null
    || entry.start_note != null
    || entry.note_number != null
  )
    ? 'note_on'
    : 'cc_toggle'

  const number = messageType === 'note_on'
    ? normalizeBindingNumber(entry.note ?? entry.start_note ?? entry.note_number)
    : normalizeBindingNumber(entry.cc_number ?? entry.cc ?? entry.control_number)
  if (number == null) {
    return null
  }

  return {
    messageType,
    midiChannel: normalizeMidiChannel(entry.midi_channel ?? entry.midiChannel ?? entry.channel),
    number,
  }
}

export function replaceSnapshotAbSwitchMidiBinding(
  entries: readonly SnapshotMidiMapEntry[],
  binding: SnapshotAbSwitchMidiBinding | null,
): SnapshotMidiMapEntry[] {
  const preservedEntries = entries
    .filter((entry) => !isAbSwitchMidiEntry(entry))
    .map((entry) => ({ ...entry }))

  if (!binding) {
    return preservedEntries
  }

  const normalizedBinding: SnapshotMidiMapEntry = {
    action: SNAPSHOT_AB_SWITCH_MIDI_ACTION,
    routing_action: SNAPSHOT_AB_SWITCH_ROUTING_ACTION,
    message_type: binding.messageType,
    midi_channel: binding.midiChannel,
    active_channel_key: '__toggle__',
    mode: 'ab_switch',
  }

  if (binding.messageType === 'note_on') {
    normalizedBinding.note = binding.number
  } else {
    normalizedBinding.cc_number = binding.number
  }

  return [...preservedEntries, normalizedBinding]
}

export function normalizeSnapshotAbSwitchMidiSnapshot(
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
