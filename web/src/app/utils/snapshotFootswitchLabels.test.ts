import type { SnapshotDetail, SnapshotMidiMapEntry } from '../../map2/types'
import {
  createEmptyFootswitchLabelDrafts,
  getSnapshotFootswitchLabelMap,
  normalizeFootswitchLabelMap,
  normalizeSnapshotFootswitchLabelSnapshot,
  replaceSnapshotFootswitchLabelMap,
  sanitizeFootswitchLabel,
} from './snapshotFootswitchLabels'

function buildSnapshot(overrides: Partial<SnapshotDetail> = {}): SnapshotDetail {
  return {
    id: 22,
    name: 'LeadScene',
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
    active_channel_index: 0,
    deployments: [],
    ...overrides,
  } as SnapshotDetail
}

describe('snapshotFootswitchLabels', () => {
  it('creates bounded drafts and sanitizes labels to eight characters', () => {
    expect(Object.keys(createEmptyFootswitchLabelDrafts())).toHaveLength(8)
    expect(sanitizeFootswitchLabel('  Very Long Label  ')).toBe('Very Lon')
    expect(sanitizeFootswitchLabel('Lexicon Clean')).toBe('Clean')
  })

  it('reads and replaces the footswitch label midi-map entry without disturbing unrelated entries', () => {
    const entries: SnapshotMidiMapEntry[] = [
      { action: 'load_snapshot', program_number: 3 },
      { action: 'footswitch_label_map', label_map: { '1': 'Clean', '2': 'Lead', '11': 'Ignore me' } },
      { action: 'focus_block_note_range', midi_channel: 2, start_note: 60 },
    ]

    expect(getSnapshotFootswitchLabelMap(entries)).toEqual({
      '1': 'Clean',
      '2': 'Lead',
      '3': '',
      '4': '',
      '5': '',
      '6': '',
      '7': '',
      '8': '',
    })

    expect(replaceSnapshotFootswitchLabelMap(entries, {
      ...createEmptyFootswitchLabelDrafts(),
      '4': 'Solo',
    })).toEqual([
      { action: 'load_snapshot', program_number: 3 },
      { action: 'focus_block_note_range', midi_channel: 2, start_note: 60 },
      { action: 'footswitch_label_map', label_map: { '4': 'Solo' }, max_length: 8 },
    ])
  })

  it('normalizes response snapshots so controls and compatibility midi-map stay aligned', () => {
    const snapshot = buildSnapshot({
      midi_map: [{ action: 'load_snapshot', program_number: 5 }],
      controls: {
        midi_map: [{ action: 'footswitch_label_map', label_map: { '1': 'Clean' } }],
        automation_lanes: [],
        expression_mappings: [],
        maschine_encoder_map: {},
      },
    })

    const normalized = normalizeSnapshotFootswitchLabelSnapshot(snapshot, [
      { action: 'load_snapshot', program_number: 5 },
      { action: 'footswitch_label_map', label_map: { '1': 'Clean', '2': 'Lead' } },
    ])

    expect(normalizeFootswitchLabelMap(getSnapshotFootswitchLabelMap(normalized.midi_map))).toEqual({
      '1': 'Clean',
      '2': 'Lead',
      '3': '',
      '4': '',
      '5': '',
      '6': '',
      '7': '',
      '8': '',
    })
    expect(normalized.midi_map).toEqual(normalized.controls.midi_map)
  })
})
