import type { Plugin, SnapshotDetail } from '../../../map2/types'
import { buildSnapshotGoLiveDiff } from './snapshotEditorComparison'

function buildSnapshot(overrides: Partial<SnapshotDetail> = {}): SnapshotDetail {
  return {
    id: 1,
    name: 'Snapshot',
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
    channel_count: 1,
    chain_count: 1,
    community_shared: false,
    community_download_count: 0,
    community_rating: null,
    community_rating_count: 0,
    created_at: '2026-04-01T20:00:00Z',
    updated_at: '2026-04-01T20:00:00Z',
    routing: {
      mode: 'parallel_blend',
      active_channel_key: 'clean',
      blend_positions: { clean: 100 },
      morph_position: 0,
      morph_source_channel_key: null,
      morph_target_channel_key: null,
      series_order: ['clean'],
    },
    midi_map: [],
    paths: [],
    chains: [],
    io_bindings: {
      input_device: null,
      output_device: null,
      remap_required: false,
    },
    controls: {
      midi_map: [],
      automation_lanes: [],
      expression_mappings: [],
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
        swing: null,
      },
    },
    assets: [],
    live_state: {
      is_live: false,
      activated_at: null,
      paths: [],
      runtime_chains: [],
    },
    lineage: null,
    active_channel_index: 0,
    deployments: [],
    ...overrides,
  } as SnapshotDetail
}

describe('snapshotEditorComparison', () => {
  it('builds a human-readable Go Live diff with routing, add/remove, bypass, parameter, and model changes', () => {
    const source = buildSnapshot({
      id: 7,
      name: 'Clean Intro',
      routing: {
        mode: 'series',
        active_channel_key: 'clean',
        blend_positions: { clean: 100 },
        morph_position: 0,
        morph_source_channel_key: null,
        morph_target_channel_key: null,
        series_order: ['clean'],
      },
      paths: [
        {
          id: 'clean',
          name: 'Clean',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          snapshot_chain_id: 101,
          runtime_chain_id: null,
          plugins: [
            {
              uri: 'map2://juce/nam',
              name: 'NAM',
              position: 0,
              bypass: false,
              parameters: { gain: 0.5 },
              loader_state: { selected_model: 'CleanTone' },
            },
            {
              uri: 'map2://juce/chorus',
              name: 'Chorus',
              position: 1,
              bypass: false,
              parameters: {},
            },
          ],
        },
      ],
    })
    const target = buildSnapshot({
      id: 8,
      name: 'Crunch Verse',
      paths: [
        {
          id: 'clean',
          name: 'Clean',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          snapshot_chain_id: 201,
          runtime_chain_id: null,
          plugins: [
            {
              uri: 'map2://juce/nam',
              name: 'NAM',
              position: 0,
              bypass: true,
              parameters: { gain: 0.8 },
              loader_state: { selected_model: 'Crunch' },
            },
            {
              uri: 'map2://juce/reverb',
              name: 'Reverb',
              position: 1,
              bypass: false,
              parameters: {},
            },
          ],
        },
      ],
    })
    const pluginMeta: Record<string, Plugin> = {
      'map2://juce/nam': {
        uri: 'map2://juce/nam',
        name: 'NAM',
        author: 'MAP2',
        category: 'amp',
        class_label: 'amp',
        version: '1.0',
        license: 'AGPL',
        has_ui: true,
        in_ports: 2,
        out_ports: 2,
        parameters: [
          {
            index: 0,
            name: 'Gain',
            symbol: 'gain',
            min: 0,
            max: 1,
            default: 0.5,
            is_toggled: false,
            is_log: false,
          },
        ],
      },
    }

    const diff = buildSnapshotGoLiveDiff(source, target, pluginMeta)

    expect(diff.items).toEqual([
      'Routing mode: Series -> Parallel Blend',
      'NAM: active -> bypassed on Channel Clean',
      'NAM model: CleanTone -> Crunch on Channel Clean',
      'NAM Gain: 0.5 -> 0.8 on Channel Clean',
      '- Chorus removed from Channel Clean',
      '+ Reverb added to Channel Clean',
    ])
    expect(diff.count).toBe(6)
  })
})
