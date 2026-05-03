import type { Chain, ChainsResponse, SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import {
  applySnapshotDraftToChainsResponse,
  buildEffectiveLiveSnapshotChains,
  buildSnapshotEditorLiveSnapshotHydration,
  upsertRuntimeChains,
} from './snapshotEditorLiveSnapshotHydration'

function buildRuntimeChain(id: number, name: string): Chain {
  return {
    id,
    name,
    is_active: true,
    created_at: '2026-03-30T08:00:00Z',
    updated_at: '2026-03-30T08:00:00Z',
    plugins: [],
    loop_insertions: [],
    effects_loops: [],
    runtime_sync: null,
  }
}

describe('snapshotEditorLiveSnapshotHydration', () => {
  it('merges runtime chains into the existing chains response', () => {
    const current: ChainsResponse = {
      chains: [buildRuntimeChain(99, 'Existing Chain')],
      count: 1,
    }

    const next = upsertRuntimeChains(current, [buildRuntimeChain(301, 'Snapshot Path A (A)')])

    expect(next.count).toBe(2)
    expect(next.chains).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 99, name: 'Existing Chain' }),
      expect.objectContaining({ id: 301, name: 'Snapshot Path A (A)' }),
    ]))
  })

  it('hydrates flow slots against runtime chain ids when live runtime paths exist', () => {
    const detail: SnapshotDetail = {
      id: 17,
      name: 'Snapshot 1',
      description: '',
      tags: [],
      program_number: null,
      input_device: 'Built-in Audio',
      output_device: 'Built-in Audio',
      is_active: true,
      is_favorite: false,
      display_order: 0,
      channels: [
        {
          id: 1,
          snapshot_id: 17,
          channel_key: 'ch_a',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          chain_id: 201,
        },
        {
          id: 2,
          snapshot_id: 17,
          channel_key: 'ch_b',
          label: 'B',
          color: '#22c55e',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 1,
          chain_id: 202,
        },
      ],
      chains: [
        { id: 201, name: 'Snapshot Path A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Snapshot Path B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      paths: [
        {
          id: 'ch_a',
          name: 'Snapshot Path A',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          snapshot_chain_id: 201,
          runtime_chain_id: 301,
          plugins: [],
          loop_insertions: [],
          effects_loops: [],
        },
        {
          id: 'ch_b',
          name: 'Snapshot Path B',
          label: 'B',
          color: '#22c55e',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 1,
          snapshot_chain_id: 202,
          runtime_chain_id: 302,
          plugins: [],
          loop_insertions: [],
          effects_loops: [],
        },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      midi_map: [],
      io_bindings: {
        input_device: 'Built-in Audio',
        output_device: 'Built-in Audio',
        remap_required: false,
      },
      controls: {
        midi_map: [],
        automation_lanes: [],
        expression_mappings: [],
      },
      assets: [],
      live_state: {
        is_live: true,
        activated_at: '2026-03-30T08:00:00Z',
        paths: [
          { path_id: 'ch_a', snapshot_chain_id: 201, runtime_chain_id: 301 },
          { path_id: 'ch_b', snapshot_chain_id: 202, runtime_chain_id: 302 },
        ],
        runtime_chains: [
          buildRuntimeChain(301, 'Snapshot Path A (A)'),
          buildRuntimeChain(302, 'Snapshot Path B (B)'),
        ],
      },
      lineage: {
        derived_from_snapshot_id: null,
      },
      active_channel_index: 0,
      channel_count: 2,
      chain_count: 2,
      community_uuid: null,
      community_shared: false,
      community_author: null,
      community_download_count: 0,
      community_rating: null,
      community_rating_count: 0,
      created_at: null,
      updated_at: null,
      deployments: [],
    }

    const hydration = buildSnapshotEditorLiveSnapshotHydration(detail, undefined)

    expect(hydration.snapshotData.flowSlots).toEqual([
      expect.objectContaining({ id: 'ch_a', chainId: 301 }),
      expect.objectContaining({ id: 'ch_b', chainId: 302 }),
    ])
    expect(hydration.snapshotData.chains).toEqual(expect.objectContaining({
      '301': expect.objectContaining({ name: 'Snapshot Path A' }),
      '302': expect.objectContaining({ name: 'Snapshot Path B' }),
    }))
    expect(hydration.chainsResponse.chains).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 301,
        name: 'Snapshot Path A (A)',
        snapshot_id: 17,
        snapshot_chain_id: 201,
        snapshot_name: 'Snapshot 1',
        path_id: 'ch_a',
        management_scope: 'snapshot',
        can_mutate_from_chains: true,
      }),
      expect.objectContaining({
        id: 302,
        name: 'Snapshot Path B (B)',
        snapshot_id: 17,
        snapshot_chain_id: 202,
        snapshot_name: 'Snapshot 1',
        path_id: 'ch_b',
        management_scope: 'snapshot',
        can_mutate_from_chains: true,
      }),
    ]))
  })

  it('synthesizes effective runtime chains from live snapshot paths when runtime chains are absent', () => {
    const detail: SnapshotDetail = {
      id: 18,
      name: 'Snapshot 2',
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
          snapshot_id: 18,
          channel_key: 'ch_a',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          chain_id: 201,
        },
      ],
      chains: [
        { id: 201, name: 'Snapshot Path A', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      paths: [
        {
          id: 'ch_a',
          name: 'Snapshot Path A',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          snapshot_chain_id: 201,
          runtime_chain_id: 501,
          plugins: [
            {
              uri: 'urn:test:gain',
              name: 'Gain',
              position: 0,
              bypass: false,
              parameters: { gain: 0.75 },
            },
          ],
          loop_insertions: [],
          effects_loops: [],
        },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100 },
        morph_position: 0.5,
        morph_source_channel_key: null,
        morph_target_channel_key: null,
        series_order: ['ch_a'],
      },
      midi_map: [],
      io_bindings: {
        input_device: null,
        output_device: null,
        remap_required: false,
      },
      controls: {
        midi_map: [],
        automation_lanes: [],
        expression_mappings: [],
      },
      assets: [],
      live_state: {
        is_live: true,
        activated_at: '2026-03-30T08:00:00Z',
        paths: [
          { path_id: 'ch_a', snapshot_chain_id: 201, runtime_chain_id: 501 },
        ],
        runtime_chains: [],
      },
      lineage: {
        derived_from_snapshot_id: null,
      },
      active_channel_index: 0,
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
      deployments: [],
    }

    const effective = buildEffectiveLiveSnapshotChains(detail, { chains: [], count: 0 })

    expect(effective.chains).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 201,
        name: 'Snapshot Path A',
      }),
      expect.objectContaining({
        id: 501,
        name: 'Snapshot Path A',
        plugins: [
          expect.objectContaining({ uri: 'urn:test:gain', position: 0 }),
        ],
      }),
    ]))
  })

  it('preserves snapshot-authored parameters and loader state when runtime chains replace synthetic chains', () => {
    const detail: SnapshotDetail = {
      id: 19,
      name: 'Snapshot 3',
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
          snapshot_id: 19,
          channel_key: 'ch_a',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          chain_id: 201,
        },
      ],
      chains: [
        { id: 201, name: 'Snapshot Path A', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      paths: [
        {
          id: 'ch_a',
          name: 'Snapshot Path A',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          snapshot_chain_id: 201,
          runtime_chain_id: 701,
          plugins: [
            {
              uri: 'map2://juce/dynamics/gate',
              name: 'Noise Gate',
              position: 0,
              bypass: false,
              parameters: { threshold: -55, ratio: 10, attack: 1, release: 150 },
              loader_state: {
                system_block_role: 'noise_gate',
                system_block_locked: true,
                system_block_label: 'SYS',
              },
            },
          ],
          loop_insertions: [],
          effects_loops: [],
        },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100 },
        morph_position: 0.5,
        morph_source_channel_key: null,
        morph_target_channel_key: null,
        series_order: ['ch_a'],
      },
      midi_map: [],
      io_bindings: {
        input_device: null,
        output_device: null,
        remap_required: false,
      },
      controls: {
        midi_map: [],
        automation_lanes: [],
        expression_mappings: [],
      },
      assets: [],
      live_state: {
        is_live: true,
        activated_at: '2026-03-30T08:00:00Z',
        paths: [
          { path_id: 'ch_a', snapshot_chain_id: 201, runtime_chain_id: 701 },
        ],
        runtime_chains: [
          {
            ...buildRuntimeChain(701, 'Snapshot Path A (A)'),
            plugins: [
              {
                uri: 'map2://juce/dynamics/gate',
                name: 'Noise Gate',
                position: 0,
                bypassed: false,
                parameters: {},
              },
            ],
          },
        ],
      },
      lineage: {
        derived_from_snapshot_id: null,
      },
      active_channel_index: 0,
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
      deployments: [],
    }

    const effective = buildEffectiveLiveSnapshotChains(detail, { chains: [], count: 0 })

    expect(effective.chains).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 701,
        plugins: [
          expect.objectContaining({
            uri: 'map2://juce/dynamics/gate',
            parameters: { threshold: -55, ratio: 10, attack: 1, release: 150 },
            loader_state: {
              system_block_role: 'noise_gate',
              system_block_locked: true,
              system_block_label: 'SYS',
            },
          }),
        ],
      }),
    ]))
  })

  it('preserves snapshot plugin ids on snapshot-authored chains for later snapshot-scoped mutations', () => {
    const detail: SnapshotDetail = {
      id: 20,
      name: 'Snapshot 4',
      description: '',
      tags: [],
      program_number: null,
      input_device: null,
      output_device: null,
      is_active: false,
      is_favorite: false,
      display_order: 0,
      channels: [
        {
          id: 1,
          snapshot_id: 20,
          channel_key: 'ch_a',
          label: 'A',
          color: '#2563eb',
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
          name: 'Snapshot Path A',
          plugins: [
            {
              id: 9001,
              uri: 'urn:test:gain',
              name: 'Gain',
              position: 0,
              bypass: false,
              parameters: { gain: 0.75 },
            },
          ],
          loop_insertions: [],
          effects_loops: [],
        },
      ],
      paths: [],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100 },
        morph_position: 0.5,
        morph_source_channel_key: null,
        morph_target_channel_key: null,
        series_order: ['ch_a'],
      },
      midi_map: [],
      io_bindings: {
        input_device: null,
        output_device: null,
        remap_required: false,
      },
      controls: {
        midi_map: [],
        automation_lanes: [],
        expression_mappings: [],
      },
      assets: [],
      live_state: {
        is_live: false,
        activated_at: null,
        paths: [],
        runtime_chains: [],
      },
      lineage: {
        derived_from_snapshot_id: null,
      },
      active_channel_index: 0,
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
      deployments: [],
    }

    const effective = buildEffectiveLiveSnapshotChains(detail, { chains: [], count: 0 })
    const snapshotChain = effective.chains.find((chain) => chain.id === 201)

    expect(snapshotChain).toEqual(expect.objectContaining({
      id: 201,
      plugins: [
        expect.objectContaining({
          uri: 'urn:test:gain',
          snapshot_plugin_id: 9001,
        }),
      ],
    }))
  })

  it('overlays draft-only loader assignments onto the effective runtime chains', () => {
    const current: ChainsResponse = {
      chains: [
        {
          ...buildRuntimeChain(801, 'Runtime Path A'),
          plugins: [
            {
              uri: 'map2://juce/nam',
              name: 'Neural Amp Modeler',
              position: 0,
              bypassed: false,
              parameters: {},
            },
          ],
        },
      ],
      count: 1,
    }
    const draft: SnapshotDraftData = {
      flowSlots: [
        {
          id: 'ch_a',
          chainId: 801,
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dryWetMix: 100,
        },
      ],
      routing: {
        mode: 'parallel_blend',
        activeSlotId: 'ch_a',
        blendPositions: { ch_a: 100 },
        morphProgress: 0.5,
        morphSourceSlotId: null,
        morphTargetSlotId: null,
        seriesOrder: ['ch_a'],
      },
      activeFlowIndex: 0,
      chains: {
        '801': {
          name: 'Draft Path A',
          plugins: [
            {
              uri: 'map2://juce/nam',
              position: 0,
              bypass: false,
              parameters: {},
              loader_state: {
                selected_model: 'George B',
                selected_asset_name: 'George B',
                selected_asset_path: '/models/george-b.nam',
              },
            },
          ],
        },
      },
    }

    const next = applySnapshotDraftToChainsResponse(current, draft)

    expect(next.chains).toEqual([
      expect.objectContaining({
        id: 801,
        name: 'Draft Path A',
        plugins: [
          expect.objectContaining({
            uri: 'map2://juce/nam',
            name: 'Neural Amp Modeler',
            position: 0,
            loader_state: {
              selected_model: 'George B',
              selected_asset_name: 'George B',
              selected_asset_path: '/models/george-b.nam',
            },
          }),
        ],
      }),
    ])
  })

  it('preserves snapshot plugin ids after draft resequencing changes plugin positions', () => {
    const current: ChainsResponse = {
      chains: [
        {
          ...buildRuntimeChain(301, 'Chain B'),
          plugins: [
            {
              snapshot_plugin_id: 5001,
              uri: 'map2://juce/sequencer',
              name: 'Sequencer',
              position: 1,
              bypassed: false,
              parameters: {},
            },
            {
              snapshot_plugin_id: 5002,
              uri: 'map2://juce/sequencer',
              name: 'Sequencer',
              position: 2,
              bypassed: false,
              parameters: {},
            },
          ],
        },
      ],
      count: 1,
    }

    const draft: SnapshotDraftData = {
      flowSlots: [
        {
          id: 'ch_b',
          chainId: 301,
          label: 'B',
          color: '#ff6666',
          muted: false,
          solo: false,
          dryWetMix: 100,
        },
      ],
      routing: {
        mode: 'parallel_blend',
        activeSlotId: 'ch_b',
        blendPositions: { ch_b: 100 },
        morphProgress: 0.5,
        morphSourceSlotId: null,
        morphTargetSlotId: null,
        seriesOrder: ['ch_b'],
      },
      activeFlowIndex: 0,
      chains: {
        '301': {
          name: 'Chain B',
          plugins: [
            {
              snapshot_plugin_id: 5001,
              uri: 'map2://juce/sequencer',
              position: 0,
              bypass: false,
              parameters: {},
            },
            {
              snapshot_plugin_id: 5002,
              uri: 'map2://juce/sequencer',
              position: 1,
              bypass: false,
              parameters: {},
            },
          ],
        },
      },
    }

    const next = applySnapshotDraftToChainsResponse(current, draft)

    expect(next.chains).toEqual([
      expect.objectContaining({
        id: 301,
        plugins: [
          expect.objectContaining({
            uri: 'map2://juce/sequencer',
            position: 0,
            snapshot_plugin_id: 5001,
          }),
          expect.objectContaining({
            uri: 'map2://juce/sequencer',
            position: 1,
            snapshot_plugin_id: 5002,
          }),
        ],
      }),
    ])
  })
})
