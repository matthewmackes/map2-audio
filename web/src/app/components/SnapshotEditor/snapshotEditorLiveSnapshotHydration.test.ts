import type { Chain, ChainsResponse, SnapshotDetail } from '../../../map2/types'
import {
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
      expect.objectContaining({ id: 301, name: 'Snapshot Path A (A)' }),
      expect.objectContaining({ id: 302, name: 'Snapshot Path B (B)' }),
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

    expect(effective.chains).toEqual([
      expect.objectContaining({
        id: 501,
        name: 'Snapshot Path A',
        plugins: [
          expect.objectContaining({ uri: 'urn:test:gain', position: 0 }),
        ],
      }),
    ])
  })
})
