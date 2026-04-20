import type { SnapshotDetail } from '../../map2/types'
import {
  createDefaultSnapshotExpressionMapping,
  normalizeSnapshotExpressionMappings,
  normalizeSnapshotExpressionMappingsSnapshot,
} from './snapshotExpressionMappings'

function buildSnapshot(): SnapshotDetail {
  return {
    id: 1,
    name: 'Expression Snapshot',
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
      mode: 'parallel_blend',
      active_channel_key: null,
      blend_positions: {},
      morph_position: 0.5,
      morph_source_channel_key: null,
      morph_target_channel_key: null,
      series_order: [],
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
        swing: null,
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

describe('snapshotExpressionMappings', () => {
  it('normalizes legacy single-target entries into grouped snapshot mappings', () => {
    expect(normalizeSnapshotExpressionMappings([
      {
        id: 'expr-1',
        cc: 11,
        channel: 1,
        cc_min: 0,
        cc_max: 127,
        param_id: 'engine.reverb_mix',
        param_label: 'Reverb Mix',
        out_min: 0.2,
        out_max: 0.8,
        curve: 'exp',
      },
    ])).toEqual([
      {
        id: 'expr-1',
        label: 'Expression 1',
        cc: 11,
        channel: 1,
        cc_min: 0,
        cc_max: 127,
        active: true,
        targets: [{
          id: 'expr-1',
          param_id: 'engine.reverb_mix',
          param_label: 'Reverb Mix',
          target_plugin_uri: null,
          target_plugin_position: null,
          param_index: null,
          parameter_symbol: null,
          out_min: 0.2,
          out_max: 0.8,
          curve: 'exponential',
          custom_curve: [],
          active: true,
        }],
      },
    ])
  })

  it('preserves grouped multi-target mappings and snapshot control updates', () => {
    const mappings = normalizeSnapshotExpressionMappings([{
      id: 'expr-1',
      label: 'EXP 1',
      cc: 11,
      channel: 0,
      targets: [
        {
          id: 'target-a',
          param_id: 'engine.reverb_mix',
          param_label: 'Reverb Mix',
          out_min: 0,
          out_max: 1,
          curve: 'linear',
        },
        {
          id: 'target-b',
          param_id: 'engine.delay_mix',
          param_label: 'Delay Mix',
          out_min: 0.1,
          out_max: 0.9,
          curve: 's_curve',
        },
      ],
    }])

    expect(normalizeSnapshotExpressionMappingsSnapshot(buildSnapshot(), mappings).controls.expression_mappings).toEqual(mappings)
  })

  it('creates a default mapping seeded from an available target', () => {
    expect(createDefaultSnapshotExpressionMapping(1, {
      id: 'engine.wah_freq',
      label: 'Wah Frequency',
      min: 200,
      max: 4000,
    })).toMatchObject({
      label: 'Expression 2',
      targets: [{
        param_id: 'engine.wah_freq',
        param_label: 'Wah Frequency',
        out_min: 200,
        out_max: 4000,
      }],
    })
  })
})
