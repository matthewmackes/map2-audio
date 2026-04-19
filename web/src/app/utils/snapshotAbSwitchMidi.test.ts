import type { SnapshotDetail, SnapshotMidiMapEntry } from '../../map2/types'
import {
  getSnapshotAbSwitchMidiBinding,
  normalizeSnapshotAbSwitchMidiSnapshot,
  replaceSnapshotAbSwitchMidiBinding,
} from './snapshotAbSwitchMidi'

function buildSnapshot(entries: SnapshotMidiMapEntry[]): SnapshotDetail {
  return {
    id: 1,
    name: 'A/B Snapshot',
    description: '',
    tags: [],
    program_number: null,
    tempo_bpm: 120,
    live_tempo_bpm: null,
    active_tempo_bpm: 120,
    tempo_source: 'stored',
    tempo_updated_at: null,
    output_level_reference_dbfs: null,
    output_level_warning_threshold_db: 3,
    input_device: null,
    output_device: null,
    is_active: false,
    is_favorite: false,
    is_locked: false,
    display_order: 0,
    channels: [],
    channel_count: 0,
    chain_count: 0,
    community_shared: false,
    community_download_count: 0,
    community_rating: null,
    community_rating_count: 0,
    created_at: null,
    updated_at: null,
    routing: {
      mode: 'ab_switch',
      active_channel_key: 'channel-a',
      blend_positions: {},
      morph_position: 0.5,
      morph_source_channel_key: null,
      morph_target_channel_key: null,
      series_order: [],
    },
    midi_map: entries,
    paths: [],
    chains: [],
    io_bindings: {
      input_device: null,
      output_device: null,
      remap_required: false,
    },
    controls: {
      midi_map: entries,
      automation_lanes: [],
      expression_mappings: [],
      monitoring_output_index: null,
      maschine_encoder_map: {
        enc1: null,
        enc2: null,
        enc3: null,
        enc4: null,
        enc5: null,
        enc6: null,
        enc7: null,
        enc8: null,
        vol: {},
        tempo: {},
      },
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
  }
}

describe('snapshotAbSwitchMidi', () => {
  it('extracts a CC binding from a snapshot MIDI map entry', () => {
    expect(getSnapshotAbSwitchMidiBinding([
      {
        action: 'set_routing',
        routing_action: 'ab_switch_toggle',
        midi_channel: 3,
        cc_number: 81,
      },
    ])).toEqual({
      messageType: 'cc_toggle',
      midiChannel: 3,
      number: 81,
    })
  })

  it('replaces existing A/B bindings while preserving other snapshot MIDI entries', () => {
    const entries = replaceSnapshotAbSwitchMidiBinding(
      [
        { action: 'load_snapshot', program_number: 9 },
        { action: 'set_routing', routing_action: 'ab_switch_toggle', cc_number: 80 },
      ],
      {
        messageType: 'note_on',
        midiChannel: 2,
        number: 60,
      },
    )

    expect(entries).toEqual([
      { action: 'load_snapshot', program_number: 9 },
      {
        action: 'set_routing',
        routing_action: 'ab_switch_toggle',
        message_type: 'note_on',
        midi_channel: 2,
        active_channel_key: '__toggle__',
        mode: 'ab_switch',
        note: 60,
      },
    ])
  })

  it('normalizes the returned snapshot payload across compatibility and canonical MIDI fields', () => {
    const entries = replaceSnapshotAbSwitchMidiBinding([], {
      messageType: 'cc_toggle',
      midiChannel: null,
      number: 82,
    })
    const snapshot = buildSnapshot([])

    expect(normalizeSnapshotAbSwitchMidiSnapshot(snapshot, entries)).toMatchObject({
      midi_map: entries,
      controls: {
        midi_map: entries,
      },
    })
  })
})
