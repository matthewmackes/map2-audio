import type { AuthoritativeAudioState, SnapshotDetail } from '../../map2/types'
import {
  isSnapshotCurrentAuthorityLive,
  resolveSnapshotGoLiveState,
} from './snapshotGoLiveState'

function buildSnapshot(overrides: Partial<SnapshotDetail> = {}): SnapshotDetail {
  return {
    id: 42,
    name: 'Friday Night Drive',
    is_active: false,
    live_state: {
      is_live: false,
      paths: [],
      runtime_chains: [],
    },
    ...overrides,
  } as SnapshotDetail
}

function buildAuthoritativeAudioState(overrides: Partial<AuthoritativeAudioState> = {}): AuthoritativeAudioState {
  return {
    schema_version: 1,
    state_version: 7,
    leader_epoch: 1,
    committed_at: '2026-04-01T20:00:00Z',
    origin_node_id: 'local-node',
    source_snapshot: {
      snapshot_id: 42,
      snapshot_revision_id: 9,
      name: 'Friday Night Drive',
    },
    desired: {
      snapshot_id: 42,
      snapshot_revision_id: 9,
      compiled_at: '2026-04-01T19:59:59Z',
      intent_version: 1,
      io: {
        requested_input_device: 'Input Alpha',
        requested_output_device: 'Output Beta',
        monitoring_output_index: null,
      },
      routing: {
        mode: 'parallel_blend',
        active_path_ids: [],
        path_order: [],
      },
      deployment: {
        placement_mode: 'local_only',
        preferred_nodes: [],
      },
      chains: [],
    },
    observed_summary: {
      effective_input_device: 'Input Alpha',
      effective_output_device: 'Output Beta',
    },
    cluster: {
      sync_status: 'synced',
      applied_node_ids: ['local-node'],
      degraded_node_ids: [],
    },
    engine: {
      display_state: 'stopped',
      is_warning: false,
      is_offline: false,
    },
    paths: [],
    derived: {
      active_channel_count: 0,
      total_channel_count: 0,
      inactive_messages: [],
    },
    ...overrides,
  }
}

describe('snapshotGoLiveState', () => {
  it('returns a disabled idle state when no snapshot is selected', () => {
    expect(resolveSnapshotGoLiveState({ snapshot: null })).toEqual({
      phase: 'idle',
      label: 'Go Live',
      disabled: true,
      errorMessage: null,
    })
  })

  it('stays in activating until committed authority state confirms the target snapshot is live', () => {
    const snapshot = buildSnapshot()

    expect(resolveSnapshotGoLiveState({
      snapshot,
      pendingSnapshotId: snapshot.id,
      authoritativeAudioState: buildAuthoritativeAudioState(),
    })).toEqual({
      phase: 'activating',
      label: 'Activating…',
      disabled: true,
      errorMessage: null,
    })
  })

  it('switches to live when committed authority state matches the target snapshot', () => {
    const snapshot = buildSnapshot()
    const authoritativeAudioState = buildAuthoritativeAudioState({
      engine: {
        display_state: 'live',
        is_warning: false,
        is_offline: false,
      },
    })

    expect(isSnapshotCurrentAuthorityLive(snapshot, authoritativeAudioState)).toBe(true)
    expect(resolveSnapshotGoLiveState({
      snapshot,
      pendingSnapshotId: snapshot.id,
      authoritativeAudioState,
    })).toEqual({
      phase: 'live',
      label: 'LIVE',
      disabled: true,
      errorMessage: null,
    })
  })

  it('surfaces runtime activation failures inline for the failed snapshot', () => {
    const snapshot = buildSnapshot()

    expect(resolveSnapshotGoLiveState({
      snapshot,
      failedSnapshotId: snapshot.id,
      failureReason: 'Channel Lead not loaded.',
    })).toEqual({
      phase: 'error',
      label: 'Activation failed — retry',
      disabled: false,
      errorMessage: 'Channel Lead not loaded.',
    })
  })

  it('stays idle when no committed authority state marks the selected snapshot live', () => {
    const snapshot = buildSnapshot({
      is_active: true,
      live_state: {
        is_live: true,
        paths: [],
        runtime_chains: [],
      },
    })

    expect(resolveSnapshotGoLiveState({ snapshot })).toEqual({
      phase: 'idle',
      label: 'Go Live',
      disabled: false,
      errorMessage: null,
    })
  })
})
