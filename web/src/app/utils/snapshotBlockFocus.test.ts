import type { SnapshotDetail, SnapshotMidiMapEntry } from '../../map2/types'
import {
  SNAPSHOT_BLOCK_FOCUS_ACTION,
  collectSnapshotMidiMapEntries,
  formatMidiNoteLabel,
  getSnapshotBlockFocusRange,
  normalizeSnapshotBlockFocusSnapshot,
  parseMidiActivityNoteOn,
  replaceSnapshotBlockFocusRange,
  resolveSnapshotBlockFocusIndex,
} from './snapshotBlockFocus'

function buildSnapshot(overrides: Partial<SnapshotDetail> = {}): SnapshotDetail {
  return {
    id: 12,
    name: 'VerseClean',
    description: '',
    tags: [],
    program_number: null,
    input_device: null,
    output_device: null,
    is_active: false,
    is_favorite: false,
    display_order: 0,
    channel_count: 1,
    chain_count: 1,
    community_shared: false,
    community_download_count: 0,
    community_rating: null,
    community_rating_count: 0,
    channels: [],
    chains: [],
    routing: {
      mode: 'series',
      active_channel_key: 'ch_a',
      blend_positions: {},
      morph_position: 0.5,
      morph_source_channel_key: null,
      morph_target_channel_key: null,
      series_order: ['ch_a'],
    },
    midi_map: [],
    paths: [],
    io_bindings: {
      input_device: null,
      output_device: null,
      remap_required: false,
    },
    controls: {
      midi_map: [],
      automation_lanes: [],
      expression_mappings: [],
      maschine_encoder_map: {},
    },
    assets: [],
    live_state: {
      is_live: false,
      paths: [],
      runtime_chains: [],
    },
    lineage: {
      derived_from_snapshot_id: null,
    },
    session_notes: [],
    active_channel_index: 0,
    deployments: [],
    ...overrides,
  } as SnapshotDetail
}

describe('snapshotBlockFocus', () => {
  it('prefers canonical controls midi-map entries and preserves compatibility fallback', () => {
    const snapshot = buildSnapshot({
      midi_map: [{ action: 'load_snapshot', program_number: 4 }],
      controls: {
        midi_map: [{ action: SNAPSHOT_BLOCK_FOCUS_ACTION, midi_channel: 2, start_note: 60 }],
        automation_lanes: [],
        expression_mappings: [],
        maschine_encoder_map: {},
      },
    })

    expect(collectSnapshotMidiMapEntries(snapshot)).toEqual([
      { action: SNAPSHOT_BLOCK_FOCUS_ACTION, midi_channel: 2, start_note: 60 },
    ])

    const compatibilityOnly = buildSnapshot({
      midi_map: [{ action: 'load_snapshot', program_number: 7 }],
    })
    expect(collectSnapshotMidiMapEntries(compatibilityOnly)).toEqual([
      { action: 'load_snapshot', program_number: 7 },
    ])
  })

  it('extracts and replaces block-focus ranges without disturbing unrelated entries', () => {
    const entries: SnapshotMidiMapEntry[] = [
      { action: 'load_snapshot', program_number: 11, channel: 1 },
      { action: SNAPSHOT_BLOCK_FOCUS_ACTION, midi_channel: 5, start_note: 48 },
      { action: 'expression_map', cc: 11, midi_channel: 2 },
    ]

    expect(getSnapshotBlockFocusRange(entries)).toEqual({
      midiChannel: 5,
      startNote: 48,
    })

    expect(replaceSnapshotBlockFocusRange(entries, {
      midiChannel: null,
      startNote: 60,
    })).toEqual([
      { action: 'load_snapshot', program_number: 11, channel: 1 },
      { action: 'expression_map', cc: 11, midi_channel: 2 },
      { action: SNAPSHOT_BLOCK_FOCUS_ACTION, midi_channel: null, start_note: 60 },
    ])

    expect(replaceSnapshotBlockFocusRange(entries, null)).toEqual([
      { action: 'load_snapshot', program_number: 11, channel: 1 },
      { action: 'expression_map', cc: 11, midi_channel: 2 },
    ])
  })

  it('normalizes API responses so controls and compatibility midi-map stay aligned', () => {
    const snapshot = buildSnapshot({
      midi_map: [{ action: 'load_snapshot', program_number: 8 }],
      controls: {
        midi_map: [{ action: 'load_snapshot', program_number: 1 }],
        automation_lanes: [],
        expression_mappings: [],
        maschine_encoder_map: {},
      },
    })

    const normalized = normalizeSnapshotBlockFocusSnapshot(snapshot, [
      { action: 'load_snapshot', program_number: 8 },
      { action: SNAPSHOT_BLOCK_FOCUS_ACTION, midi_channel: 3, start_note: 55 },
    ])

    expect(normalized.midi_map).toEqual(normalized.controls.midi_map)
    expect(normalized.controls.automation_lanes).toEqual([])
  })

  it('parses note-on activity from websocket payloads and ignores velocity-zero messages', () => {
    expect(parseMidiActivityNoteOn({
      message_type: 'note_on',
      raw_hex: '90 3C 64',
    })).toEqual({
      channel: 1,
      note: 60,
      velocity: 100,
    })

    expect(parseMidiActivityNoteOn({
      type: 'note_on',
      channel: 6,
      data1: 42,
      data2: 0,
    })).toBeNull()
  })

  it('resolves block indices with channel-aware matching and formats preview labels', () => {
    const omniRange = { midiChannel: null, startNote: 60 }
    const channelRange = { midiChannel: 7, startNote: 36 }

    expect(resolveSnapshotBlockFocusIndex(omniRange, {
      channel: 2,
      note: 62,
      velocity: 99,
    }, 4)).toBe(2)

    expect(resolveSnapshotBlockFocusIndex(channelRange, {
      channel: 6,
      note: 37,
      velocity: 99,
    }, 4)).toBeNull()

    expect(resolveSnapshotBlockFocusIndex(channelRange, {
      channel: 7,
      note: 40,
      velocity: 99,
    }, 4)).toBeNull()

    expect(formatMidiNoteLabel(60)).toBe('C3')
    expect(formatMidiNoteLabel(61)).toBe('C#3')
  })
})
