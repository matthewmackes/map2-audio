import type { Chain, SnapshotDetail } from '../../../map2/types'
import { resolveSnapshotChainId, resolveSnapshotPluginIdentity } from './snapshotEditorMutationIdentity'

function buildSnapshotDetail(): SnapshotDetail {
  return {
    id: 77,
    name: 'Rig',
    description: '',
    tags: [],
    program_number: null,
    input_device: null,
    output_device: null,
    is_active: true,
    is_favorite: false,
    display_order: 0,
    channels: [
      {
        id: 1,
        snapshot_id: 77,
        channel_key: 'ch_b',
        label: 'B',
        color: '#ff6666',
        muted: false,
        solo: false,
        dry_wet_mix: 100,
        order_index: 0,
        chain_id: 201,
      },
    ],
    chains: [
      {
        id: 201,
        name: 'Chain B',
        plugins: [
          {
            id: 5001,
            uri: 'map2://juce/sequencer',
            name: 'Sequencer',
            position: 1,
            bypass: false,
            parameters: {},
          },
        ],
        loop_insertions: [],
        effects_loops: [],
      },
    ],
    routing: {
      mode: 'parallel_blend',
      active_channel_key: 'ch_b',
      blend_positions: { ch_b: 100 },
      morph_position: 0.5,
      morph_source_channel_key: null,
      morph_target_channel_key: null,
      series_order: ['ch_b'],
    },
    midi_map: [],
    paths: [
      {
        id: 'ch_b',
        name: 'Chain B',
        label: 'B',
        color: '#ff6666',
        muted: false,
        solo: false,
        dry_wet_mix: 100,
        order_index: 0,
        snapshot_chain_id: 201,
        runtime_chain_id: 301,
        plugins: [
          {
            id: 5001,
            uri: 'map2://juce/sequencer',
            name: 'Sequencer',
            position: 1,
            bypass: false,
            parameters: {},
          },
        ],
        loop_insertions: [],
        effects_loops: [],
      },
    ],
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
      is_live: true,
      activated_at: null,
      paths: [
        {
          path_id: 'ch_b',
          snapshot_chain_id: 201,
          runtime_chain_id: 301,
        },
      ],
      runtime_chains: [],
    },
    lineage: {
      derived_from_snapshot_id: null,
    },
    active_channel_index: 0,
    deployments: [],
    channel_count: 1,
    chain_count: 1,
    community_uuid: null,
    community_shared: false,
    community_author: null,
    community_download_count: 0,
    community_rating: null,
    community_rating_count: 0,
    created_at: null,
    updated_at: null,
  }
}

describe('snapshotEditorMutationIdentity', () => {
  it('maps a runtime chain id back to the snapshot chain id', () => {
    expect(resolveSnapshotChainId({
      detail: buildSnapshotDetail(),
      chainId: 301,
    })).toBe(201)
  })

  it('prefers the effective chain snapshot metadata when present', () => {
    expect(resolveSnapshotChainId({
      detail: buildSnapshotDetail(),
      effectiveChain: {
        id: 301,
        name: 'Chain B',
        is_active: true,
        created_at: '2026-04-17T10:00:00Z',
        updated_at: '2026-04-17T10:00:00Z',
        plugins: [],
        loop_insertions: [],
        effects_loops: [],
        runtime_sync: null,
        snapshot_chain_id: 201,
      },
      chainId: 301,
    })).toBe(201)
  })

  it('falls back to snapshot detail plugin ids when the effective runtime chain lacks snapshot_plugin_id', () => {
    const effectiveRuntimeChain: Chain = {
      id: 301,
      name: 'Chain B',
      is_active: true,
      created_at: '2026-04-17T10:00:00Z',
      updated_at: '2026-04-17T10:00:00Z',
      plugins: [
        {
          uri: 'map2://juce/sequencer',
          name: 'Sequencer',
          position: 1,
          bypassed: false,
          parameters: {},
        },
      ],
      loop_insertions: [],
      effects_loops: [],
      runtime_sync: null,
    }

    expect(resolveSnapshotPluginIdentity({
      detail: buildSnapshotDetail(),
      effectiveChain: effectiveRuntimeChain,
      chainId: 301,
      pluginUri: 'map2://juce/sequencer',
      pluginPosition: 1,
    })).toEqual({
      snapshotChainId: 201,
      snapshotPluginId: 5001,
    })
  })
})
