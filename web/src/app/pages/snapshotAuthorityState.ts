import type {
  AudioStateObservation,
  AudioStateEngineStatus,
  AuthoritativeAudioState,
  SnapshotDetail,
  SnapshotRuntimeDisplayState,
  SnapshotRuntimeLiveState,
} from '../../map2/types'

export interface SnapshotControlPlaneStatus {
  displayState: AudioStateEngineStatus | SnapshotRuntimeDisplayState | 'saved'
  displayLabel: string
  isLive: boolean
  source: 'authority' | 'saved'
}

export function resolveAuthoritySnapshotId(
  committedAudioState: AuthoritativeAudioState | null | undefined,
): number | null {
  return committedAudioState?.source_snapshot?.snapshot_id ?? null
}

export function resolveControlPlaneSnapshot(params: {
  committedAudioState: AuthoritativeAudioState | null
  authoritySnapshotDetail: SnapshotDetail | null
}): SnapshotDetail | null {
  const { committedAudioState, authoritySnapshotDetail } = params
  const authoritySnapshotId = resolveAuthoritySnapshotId(committedAudioState)

  if (authoritySnapshotId != null && authoritySnapshotDetail?.id === authoritySnapshotId) {
    return authoritySnapshotDetail
  }

  return null
}

export function resolveEditorActiveSnapshot(params: {
  editorSnapshotOverride: SnapshotDetail | null
  controlPlaneSnapshot: SnapshotDetail | null
}): SnapshotDetail | null {
  return params.editorSnapshotOverride ?? params.controlPlaneSnapshot
}

export function resolvePreferredLiveRuntimeDisplayState(params: {
  runtimeLiveState: SnapshotRuntimeLiveState | null
  authoritativeAudioState: AuthoritativeAudioState | null
}): SnapshotRuntimeDisplayState | null {
  return params.authoritativeAudioState?.engine.display_state ?? params.runtimeLiveState?.display_state ?? null
}

export function resolvePreferredLiveRuntimeDisplayLabel(params: {
  runtimeLiveState: SnapshotRuntimeLiveState | null
  authoritativeAudioState: AuthoritativeAudioState | null
}): string | null {
  if (params.authoritativeAudioState) {
    return buildDisplayLabel(params.authoritativeAudioState.engine.display_state)
  }

  return params.runtimeLiveState?.display_label ?? buildDisplayLabel(params.runtimeLiveState?.display_state ?? 'stopped')
}

function buildDisplayLabel(displayState: AudioStateEngineStatus | SnapshotRuntimeDisplayState): string {
  switch (displayState) {
    case 'live':
      return 'Live'
    case 'live_warning':
      return 'Live + Warning'
    case 'offline':
      return 'Offline'
    case 'stopped':
      return 'Stopped'
    default:
      return 'Saved'
  }
}

export function resolveSnapshotControlPlaneStatus(params: {
  snapshotId: number
  authoritySnapshotId: number | null
  authoritativeAudioState: AuthoritativeAudioState | null
}): SnapshotControlPlaneStatus {
  const { snapshotId, authoritySnapshotId, authoritativeAudioState } = params

  if (authoritySnapshotId === snapshotId && authoritativeAudioState) {
    const displayState = authoritativeAudioState.engine.display_state
    return {
      displayState,
      displayLabel: buildDisplayLabel(displayState),
      isLive: true,
      source: 'authority',
    }
  }

  return {
    displayState: 'saved',
    displayLabel: 'Saved',
    isLive: false,
    source: 'saved',
  }
}

export function resolveControlPlaneSnapshotId(params: {
  controlPlaneSnapshot: SnapshotDetail | null
  authoritySnapshotId: number | null
  runtimeLiveState: SnapshotRuntimeLiveState | null
}): number | null {
  return params.controlPlaneSnapshot?.id
    ?? params.authoritySnapshotId
    ?? params.runtimeLiveState?.snapshot_id
    ?? null
}

export function formatAuthoritySyncStatusLabel(syncStatus: string): string {
  switch (syncStatus) {
    case 'synced':
      return 'Synced'
    case 'partial_apply':
      return 'Partial apply'
    case 'pending_apply':
      return 'Pending apply'
    case 'degraded':
      return 'Degraded'
    default:
      return syncStatus
        .split('_')
        .filter((segment) => segment.length > 0)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
    }
}

export function buildObservedRuntimeNodeCards(
  observations: AudioStateObservation[] | null | undefined,
): SnapshotRuntimeLiveState[] {
  return (observations ?? []).map((observation, index) => ({
    node_id: observation.node_id,
    seq: index,
    emitted_at: observation.observed_at,
    state: observation.applied ? 'live' : 'stopped',
    snapshot_id: null,
    snapshot_revision: null,
    snapshot_name: null,
    triggered_by: null,
    live_snapshot_payload: null,
    last_successful_request_id: null,
    failure_reason: observation.applied ? null : 'Node has not applied the committed authority state.',
    runtime_metrics: observation.runtime_metrics,
    warning_threshold_seconds: 0,
    offline_threshold_seconds: 0,
    age_seconds: null,
    is_warning: observation.engine.is_warning,
    is_offline: observation.engine.is_offline,
    display_state: observation.engine.display_state,
    display_label: buildDisplayLabel(observation.engine.display_state),
  }))
}
