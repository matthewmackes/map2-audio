import {
  buildAuthoritativeSnapshotEditorLiveChainProjection,
  buildSnapshotEditorLiveChainProjection,
  getSnapshotEditorDesiredLiveChainIds,
  hasSnapshotEditorLiveChainMismatch,
} from './snapshotEditorLiveChains'
import type { Chain } from '../../../map2/types'

function createChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 1,
    name: 'Chain 1',
    is_active: true,
    created_at: '2026-03-29T00:00:00Z',
    updated_at: '2026-03-29T00:00:00Z',
    plugins: [],
    loop_insertions: [],
    effects_loops: [],
    runtime_sync: { enabled: true, status: 'active', warnings: [], runtime_items: 0, restored_positions: [], missing_positions: [] },
    ...overrides,
  }
}

describe('snapshotEditorLiveChains', () => {
  it('derives unique desired live chain ids from channel assignments', () => {
    const desired = getSnapshotEditorDesiredLiveChainIds([
      {
        id: 'channel-b',
        chainId: 22,
        label: 'B',
        color: '#22c55e',
        muted: false,
        solo: false,
        dryWetMix: 70,
      },
      {
        id: 'channel-a',
        chainId: 11,
        label: 'A',
        color: '#2563eb',
        muted: false,
        solo: false,
        dryWetMix: 100,
      },
      {
        id: 'channel-c',
        chainId: 11,
        label: 'C',
        color: '#f59e0b',
        muted: false,
        solo: false,
        dryWetMix: 40,
      },
    ])

    expect(desired).toEqual([11, 22])
  })

  it('projects live chain labels and runtime health for assigned channels', () => {
    const projection = buildSnapshotEditorLiveChainProjection(
      [
        createChain({
          id: 11,
          name: 'Lead Stack',
          plugins: [
            {
              uri: 'map2://juce/nam',
              name: 'NAM',
              position: 0,
              bypassed: false,
              parameters: {},
            },
          ],
        }),
      ],
      [
        {
          id: 'channel-a',
          chainId: 11,
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dryWetMix: 100,
        },
      ],
    )

    expect(projection).toHaveLength(1)
    expect(projection[0]).toMatchObject({
      chainId: 11,
      chainName: 'Lead Stack',
      status: 'live',
      flowLabels: ['A'],
      primaryFlowLabel: 'A',
      syntheticFlow: false,
    })
    expect(projection[0].representativeItems[0]).toMatchObject({
      kind: 'plugin',
      label: 'NAM',
    })
  })

  it('returns no authority projections when no control-plane snapshot is committed', () => {
    const projection = buildAuthoritativeSnapshotEditorLiveChainProjection({
      chains: [
        createChain({
          id: 11,
          name: 'Lead Stack',
        }),
      ],
      flowSlots: [
        {
          id: 'channel-a',
          chainId: 11,
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dryWetMix: 100,
        },
      ],
      authoritativeAudioState: null,
      authoritySnapshotPaths: null,
    })

    expect(projection).toEqual([])
  })

  it('treats snapshot-chain ids as valid matches for authority-backed runtime projections', () => {
    const projection = buildAuthoritativeSnapshotEditorLiveChainProjection({
      chains: [
        createChain({
          id: 301,
          name: 'Lead Stack',
          plugins: [
            {
              uri: 'map2://juce/nam',
              name: 'NAM',
              position: 0,
              bypassed: false,
              parameters: {},
            },
          ],
        }),
      ],
      flowSlots: [
        {
          id: 'channel-a',
          chainId: 201,
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dryWetMix: 100,
        },
      ],
      authoritativeAudioState: {
        schema_version: 1,
        state_version: 7,
        leader_epoch: 1,
        committed_at: '2026-04-03T18:00:00Z',
        origin_node_id: 'local-node',
        source_snapshot: {
          snapshot_id: 42,
          snapshot_revision_id: 4,
          name: 'Rig 42',
        },
        desired: {
          snapshot_id: 42,
          snapshot_revision_id: 4,
          compiled_at: '2026-04-03T18:00:00Z',
          intent_version: 1,
          io: {},
          routing: {
            mode: 'parallel_blend',
            active_path_ids: ['channel-a'],
            path_order: ['channel-a'],
          },
          deployment: {
            placement_mode: 'local_only',
            preferred_nodes: ['local-node'],
          },
          chains: [],
        },
        observed_summary: {},
        cluster: {
          sync_status: 'synced',
          applied_node_ids: ['local-node'],
          degraded_node_ids: [],
        },
        engine: {
          display_state: 'live',
          is_warning: false,
          is_offline: false,
        },
        paths: [
          {
            path_id: 'channel-a',
            label: 'A',
            snapshot_chain_id: 201,
            runtime_chain_id: 301,
            status: 'active',
            status_reason: null,
          },
        ],
        derived: {
          active_channel_count: 1,
          total_channel_count: 1,
          inactive_messages: [],
        },
      },
      authoritySnapshotPaths: [
        {
          id: 'channel-a',
          name: 'Lead Stack',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          snapshot_chain_id: 201,
          runtime_chain_id: 301,
          plugins: [
            {
              uri: 'map2://juce/nam',
              name: 'NAM',
              position: 0,
              bypass: false,
              parameters: {},
            },
          ],
          loop_insertions: [],
          effects_loops: [],
        },
      ],
    })

    expect(projection).toHaveLength(1)
    expect(projection[0]).toMatchObject({
      chainId: 301,
      runtimeChainId: 301,
      snapshotChainId: 201,
      chainName: 'Lead Stack',
      flowLabels: ['A'],
    })
    expect(hasSnapshotEditorLiveChainMismatch(projection, [
      {
        id: 'channel-a',
        chainId: 201,
        label: 'A',
        color: '#2563eb',
        muted: false,
        solo: false,
        dryWetMix: 100,
      },
    ])).toBe(false)
  })
})
