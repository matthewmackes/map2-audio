import type {
  AuthoritativeAudioState,
  SnapshotDetail,
  SnapshotRuntimeLiveState,
} from '../../map2/types'
import {
  buildObservedRuntimeNodeCards,
  formatAuthoritySyncStatusLabel,
  resolveAuthoritySnapshotId,
  resolveControlPlaneSnapshotId,
  resolveControlPlaneSnapshot,
  resolveEditorActiveSnapshot,
  resolvePreferredLiveRuntimeDisplayLabel,
  resolvePreferredLiveRuntimeDisplayState,
  resolveSnapshotControlPlaneStatus,
} from './snapshotAuthorityState'

function buildSnapshotDetail(id: number, name: string): SnapshotDetail {
  return {
    id,
    name,
    description: '',
    tags: [],
    display_order: id,
    is_favorite: false,
    is_locked: false,
    is_active: false,
    program_number: null,
    tempo_bpm: 120,
    active_tempo_bpm: 120,
    tempo_source: 'stored',
    output_level_reference_dbfs: null,
    output_level_warning_threshold_db: 3,
    input_device: null,
    output_device: null,
    activated_at: null,
    lineage: {
      derived_from_snapshot_id: null,
      derived_from_snapshot_name: null,
      derived_from_revision_number: null,
      derived_at: null,
    },
    io_bindings: {
      input_device: null,
      output_device: null,
      monitoring_output_index: null,
    },
    controls: {
      midi_map: [],
      monitoring_output_index: null,
      maschine_encoder_map: null,
    },
    paths: [],
    channels: [],
    chains: [],
    routing: {
      mode: 'series',
      active_channel_key: null,
      blend_positions: {},
      morph_position: 0,
      series_order: [],
    },
    midi_map: [],
    flowSlots: [],
    activeFlowIndex: 0,
    live_state: {
      snapshot_id: id,
      snapshot_name: name,
      snapshot_revision: null,
      active_path_ids: [],
      paths: [],
      runtime_chains: [],
      display_state: 'live',
      display_label: 'Live',
      is_warning: false,
      is_offline: false,
      last_runtime_event_at: null,
      node_id: 'node-a',
    },
  }
}

function buildAuthoritativeAudioState(snapshotId: number): AuthoritativeAudioState {
  return {
    schema_version: 1,
    state_version: 4,
    leader_epoch: 2,
    committed_at: '2026-04-03T12:00:00Z',
    origin_node_id: 'node-a',
    source_snapshot: {
      snapshot_id: snapshotId,
      snapshot_revision_id: 7,
      name: `Snapshot ${snapshotId}`,
    },
    desired: {
      snapshot_id: snapshotId,
      snapshot_revision_id: 7,
      compiled_at: '2026-04-03T11:59:59Z',
      intent_version: 1,
      io: {
        requested_input_device: 'In',
        requested_output_device: 'Out',
        monitoring_output_index: null,
      },
      routing: {
        mode: 'series',
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
      effective_input_device: 'In',
      effective_output_device: 'Out',
    },
    cluster: {
      sync_status: 'synced',
      applied_node_ids: ['node-a'],
      degraded_node_ids: [],
    },
    engine: {
      display_state: 'live_warning',
      is_warning: true,
      is_offline: false,
    },
    paths: [],
    derived: {
      active_channel_count: 0,
      total_channel_count: 0,
      inactive_messages: [],
    },
  }
}

function buildRuntimeLiveState(snapshotId: number): SnapshotRuntimeLiveState {
  return {
    node_id: 'node-a',
    seq: 5,
    emitted_at: '2026-04-03T12:00:01Z',
    state: 'live',
    snapshot_id: snapshotId,
    snapshot_revision: '7',
    snapshot_name: `Snapshot ${snapshotId}`,
    triggered_by: 'ui',
    live_snapshot_payload: null,
    last_successful_request_id: null,
    failure_reason: null,
    runtime_metrics: {},
    warning_threshold_seconds: 10,
    offline_threshold_seconds: 20,
    age_seconds: 0.1,
    is_warning: false,
    is_offline: false,
    display_state: 'live',
    display_label: 'Live',
  }
}

describe('snapshotAuthorityState', () => {
  it('resolves the authority snapshot id from committed state', () => {
    expect(resolveAuthoritySnapshotId(buildAuthoritativeAudioState(42))).toBe(42)
    expect(resolveAuthoritySnapshotId(null)).toBeNull()
  })

  it('prefers authority-backed snapshot detail for control-plane selection', () => {
    const authoritySnapshot = buildSnapshotDetail(42, 'Authority live')

    expect(resolveControlPlaneSnapshot({
      committedAudioState: buildAuthoritativeAudioState(42),
      authoritySnapshotDetail: authoritySnapshot,
    })?.id).toBe(42)
  })

  it('returns no control-plane snapshot when authority detail is unavailable', () => {
    expect(resolveControlPlaneSnapshot({
      committedAudioState: buildAuthoritativeAudioState(42),
      authoritySnapshotDetail: null,
    })).toBeNull()
  })

  it('lets an editor override outrank the control-plane snapshot', () => {
    const controlPlaneSnapshot = buildSnapshotDetail(42, 'Authority live')
    const editorOverride = buildSnapshotDetail(77, 'Editor override')

    expect(resolveEditorActiveSnapshot({
      editorSnapshotOverride: editorOverride,
      controlPlaneSnapshot,
    })?.id).toBe(77)
  })

  it('prefers authoritative engine display state over legacy runtime display state', () => {
    expect(resolvePreferredLiveRuntimeDisplayState({
      runtimeLiveState: buildRuntimeLiveState(42),
      authoritativeAudioState: buildAuthoritativeAudioState(42),
    })).toBe('live_warning')
  })

  it('prefers authoritative runtime display labels over legacy runtime labels', () => {
    expect(resolvePreferredLiveRuntimeDisplayLabel({
      runtimeLiveState: buildRuntimeLiveState(42),
      authoritativeAudioState: buildAuthoritativeAudioState(42),
    })).toBe('Live + Warning')
  })

  it('prefers authority-backed control-plane status over legacy runtime status', () => {
    expect(resolveSnapshotControlPlaneStatus({
      snapshotId: 42,
      authoritySnapshotId: 42,
      authoritativeAudioState: buildAuthoritativeAudioState(42),
    })).toMatchObject({
      displayState: 'live_warning',
      displayLabel: 'Live + Warning',
      isLive: true,
      source: 'authority',
    })
  })

  it('treats non-authority snapshots as saved even if legacy runtime state still names them', () => {
    expect(resolveSnapshotControlPlaneStatus({
      snapshotId: 11,
      authoritySnapshotId: 42,
      authoritativeAudioState: buildAuthoritativeAudioState(42),
    })).toMatchObject({
      displayState: 'saved',
      displayLabel: 'Saved',
      isLive: false,
      source: 'saved',
    })
  })

  it('maps authority observations into runtime-card data for artifacts workspace', () => {
    expect(buildObservedRuntimeNodeCards([
      {
        node_id: 'node-b',
        observed_state_version: 4,
        applied: false,
        effective_input_device: 'Input B',
        effective_output_device: 'Output B',
        runtime_paths: [],
        engine: {
          display_state: 'offline',
          is_warning: false,
          is_offline: true,
        },
        runtime_metrics: {},
        observed_at: '2026-04-03T12:00:02Z',
      },
    ])).toEqual([
      expect.objectContaining({
        node_id: 'node-b',
        display_state: 'offline',
        display_label: 'Offline',
        failure_reason: 'Node has not applied the committed authority state.',
      }),
    ])
  })

  it('resolves the control-plane snapshot id from authority state before runtime fallback', () => {
    expect(resolveControlPlaneSnapshotId({
      controlPlaneSnapshot: null,
      authoritySnapshotId: 42,
      runtimeLiveState: buildRuntimeLiveState(11),
    })).toBe(42)
  })

  it('formats operator-facing authority sync labels', () => {
    expect(formatAuthoritySyncStatusLabel('pending_apply')).toBe('Pending apply')
    expect(formatAuthoritySyncStatusLabel('cluster_recovering')).toBe('Cluster Recovering')
  })
})
