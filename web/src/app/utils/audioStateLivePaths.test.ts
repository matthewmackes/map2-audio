import type { AuthoritativeAudioState, SnapshotPath } from '../../map2/types'
import { buildAuthorityLivePathSelectionUpdate } from './audioStateLivePaths'

function buildAuthoritativeAudioState(): AuthoritativeAudioState {
  return {
    schema_version: 1,
    state_version: 7,
    leader_epoch: 3,
    committed_at: '2026-04-03T18:00:00Z',
    origin_node_id: 'node-a',
    source_snapshot: {
      snapshot_id: 44,
      snapshot_revision_id: 2,
      name: 'Authority Snapshot',
    },
    desired: {
      snapshot_id: 44,
      snapshot_revision_id: 2,
      compiled_at: '2026-04-03T17:59:59Z',
      intent_version: 1,
      io: {
        requested_input_device: 'In',
        requested_output_device: 'Out',
        monitoring_output_index: null,
      },
      routing: {
        mode: 'series',
        active_path_ids: ['ch_a'],
        path_order: ['ch_a'],
      },
      deployment: {
        placement_mode: 'local_only',
        preferred_nodes: [],
      },
      chains: [],
    },
    observed_summary: {
      effective_input_device: 'In',
      effective_output_device: 'Out',
    },
    cluster: {
      sync_status: 'synced',
      applied_node_ids: ['node-a'],
      degraded_node_ids: [],
    },
    engine: {
      display_state: 'live',
      is_warning: false,
      is_offline: false,
    },
    paths: [
      {
        path_id: 'ch_a',
        label: 'A',
        snapshot_chain_id: 101,
        runtime_chain_id: 301,
        owner_node_id: 'node-a',
        status: 'active',
        status_reason: null,
      },
    ],
    derived: {
      active_channel_count: 1,
      total_channel_count: 1,
      inactive_messages: [],
    },
  }
}

function buildAuthoritySnapshotPaths(): SnapshotPath[] {
  return [
    {
      id: 'ch_a',
      name: 'Path A',
      label: 'A',
      color: '#2563eb',
      muted: false,
      solo: false,
      dry_wet_mix: 1,
      order_index: 0,
      snapshot_chain_id: 101,
      runtime_chain_id: 301,
      plugins: [],
    },
    {
      id: 'ch_b',
      name: 'Path B',
      label: 'B',
      color: '#22c55e',
      muted: false,
      solo: false,
      dry_wet_mix: 1,
      order_index: 1,
      snapshot_chain_id: 102,
      runtime_chain_id: 302,
      plugins: [],
    },
  ]
}

describe('audioStateLivePaths', () => {
  it('builds an authority update for the selected live path order', () => {
    const update = buildAuthorityLivePathSelectionUpdate({
      authoritativeAudioState: buildAuthoritativeAudioState(),
      authoritySnapshotPaths: buildAuthoritySnapshotPaths(),
      nextActiveChainIds: [102, 101],
      requestedBy: 'ui-test',
      committedAt: '2026-04-03T18:30:00Z',
    })

    expect(update.request.requested_by).toBe('ui-test')
    expect(update.nextCommittedState.state_version).toBe(8)
    expect(update.nextCommittedState.desired.routing.active_path_ids).toEqual(['ch_b', 'ch_a'])
    expect(update.nextCommittedState.desired.routing.path_order).toEqual(['ch_b', 'ch_a'])
    expect(update.nextCommittedState.cluster.sync_status).toBe('pending_apply')
  })

  it('preserves existing authority path records that stay selected', () => {
    const update = buildAuthorityLivePathSelectionUpdate({
      authoritativeAudioState: buildAuthoritativeAudioState(),
      authoritySnapshotPaths: buildAuthoritySnapshotPaths(),
      nextActiveChainIds: [301],
      requestedBy: 'ui-test',
      committedAt: '2026-04-03T18:30:00Z',
    })

    expect(update.nextCommittedState.paths).toEqual([
      expect.objectContaining({
        path_id: 'ch_a',
        runtime_chain_id: 301,
        status: 'active',
      }),
    ])
    expect(update.nextCommittedState.derived.active_channel_count).toBe(1)
  })

  it('seeds newly selected authority paths as pending apply', () => {
    const update = buildAuthorityLivePathSelectionUpdate({
      authoritativeAudioState: buildAuthoritativeAudioState(),
      authoritySnapshotPaths: buildAuthoritySnapshotPaths(),
      nextActiveChainIds: [301, 102],
      requestedBy: 'ui-test',
      committedAt: '2026-04-03T18:30:00Z',
    })

    expect(update.nextCommittedState.paths).toEqual([
      expect.objectContaining({
        path_id: 'ch_a',
        status: 'active',
      }),
      expect.objectContaining({
        path_id: 'ch_b',
        status: 'pending',
        status_reason: 'Awaiting node observation after desired-state publish',
      }),
    ])
    expect(update.nextCommittedState.derived.inactive_messages).toEqual([
      'Channel B pending apply.',
    ])
  })

  it('rejects live path updates when no authority-backed snapshot is loaded', () => {
    const state = buildAuthoritativeAudioState()
    state.source_snapshot = null

    expect(() => buildAuthorityLivePathSelectionUpdate({
      authoritativeAudioState: state,
      authoritySnapshotPaths: buildAuthoritySnapshotPaths(),
      nextActiveChainIds: [101],
      requestedBy: 'ui-test',
      committedAt: '2026-04-03T18:30:00Z',
    })).toThrow('No authority-backed snapshot is loaded.')
  })

  it('rejects chain ids that do not map to an authority path', () => {
    expect(() => buildAuthorityLivePathSelectionUpdate({
      authoritativeAudioState: buildAuthoritativeAudioState(),
      authoritySnapshotPaths: buildAuthoritySnapshotPaths(),
      nextActiveChainIds: [999],
      requestedBy: 'ui-test',
      committedAt: '2026-04-03T18:30:00Z',
    })).toThrow('No authority path matches chain 999.')
  })
})
