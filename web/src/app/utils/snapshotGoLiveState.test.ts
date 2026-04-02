import type { SnapshotDetail, SnapshotRuntimeLiveState } from '../../map2/types'
import {
  isSnapshotCurrentRuntimeLive,
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

function buildRuntimeLiveState(overrides: Partial<SnapshotRuntimeLiveState> = {}): SnapshotRuntimeLiveState {
  return {
    node_id: 'local-node',
    seq: 1,
    emitted_at: '2026-04-01T20:00:00Z',
    state: 'stopped',
    snapshot_id: null,
    snapshot_revision: null,
    snapshot_name: null,
    triggered_by: 'ui',
    live_snapshot_payload: null,
    last_successful_request_id: null,
    failure_reason: null,
    runtime_metrics: {},
    warning_threshold_seconds: 10,
    offline_threshold_seconds: 15,
    age_seconds: 0,
    is_warning: false,
    is_offline: false,
    display_state: 'stopped',
    display_label: 'Stopped',
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

  it('stays in activating until runtime live-state confirms the target snapshot is live', () => {
    const snapshot = buildSnapshot()

    expect(resolveSnapshotGoLiveState({
      snapshot,
      pendingSnapshotId: snapshot.id,
      runtimeLiveState: buildRuntimeLiveState(),
    })).toEqual({
      phase: 'activating',
      label: 'Activating…',
      disabled: true,
      errorMessage: null,
    })
  })

  it('switches to live when runtime live-state matches the target snapshot', () => {
    const snapshot = buildSnapshot()
    const runtimeLiveState = buildRuntimeLiveState({
      state: 'live',
      snapshot_id: snapshot.id,
      snapshot_name: snapshot.name,
      display_state: 'live',
      display_label: 'Live',
    })

    expect(isSnapshotCurrentRuntimeLive(snapshot, runtimeLiveState)).toBe(true)
    expect(resolveSnapshotGoLiveState({
      snapshot,
      pendingSnapshotId: snapshot.id,
      runtimeLiveState,
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

  it('falls back to LIVE when the selected snapshot is already active and runtime state is unavailable', () => {
    const snapshot = buildSnapshot({
      is_active: true,
      live_state: {
        is_live: true,
        paths: [],
        runtime_chains: [],
      },
    })

    expect(resolveSnapshotGoLiveState({ snapshot })).toEqual({
      phase: 'live',
      label: 'LIVE',
      disabled: true,
      errorMessage: null,
    })
  })
})
