import type { AuthoritativeAudioState, SnapshotDetail } from '../../map2/types'

export type SnapshotGoLivePhase = 'idle' | 'activating' | 'live' | 'error'

export interface SnapshotGoLiveState {
  phase: SnapshotGoLivePhase
  label: string
  disabled: boolean
  errorMessage: string | null
}

type SnapshotGoLiveTarget = Pick<SnapshotDetail, 'id' | 'name' | 'is_active' | 'live_state'>

interface ResolveSnapshotGoLiveStateOptions {
  snapshot: SnapshotGoLiveTarget | null
  authoritativeAudioState?: AuthoritativeAudioState | null
  pendingSnapshotId?: number | null
  failedSnapshotId?: number | null
  failureReason?: string | null
}

export function isSnapshotCurrentAuthorityLive(
  snapshot: SnapshotGoLiveTarget | null,
  authoritativeAudioState?: AuthoritativeAudioState | null,
): boolean {
  if (!snapshot || !authoritativeAudioState) {
    return false
  }

  const authorityIsLive = authoritativeAudioState.engine.display_state === 'live'
    || authoritativeAudioState.engine.display_state === 'live_warning'
  if (!authorityIsLive) {
    return false
  }

  return authoritativeAudioState.source_snapshot?.snapshot_id === snapshot.id
}

export function resolveSnapshotGoLiveState({
  snapshot,
  authoritativeAudioState = null,
  pendingSnapshotId = null,
  failedSnapshotId = null,
  failureReason = null,
}: ResolveSnapshotGoLiveStateOptions): SnapshotGoLiveState {
  if (!snapshot) {
    return {
      phase: 'idle',
      label: 'Go Live',
      disabled: true,
      errorMessage: null,
    }
  }

  if (isSnapshotCurrentAuthorityLive(snapshot, authoritativeAudioState)) {
    return {
      phase: 'live',
      label: 'LIVE',
      disabled: true,
      errorMessage: null,
    }
  }

  if (pendingSnapshotId === snapshot.id) {
    return {
      phase: 'activating',
      label: 'Activating…',
      disabled: true,
      errorMessage: null,
    }
  }

  const normalizedFailureReason = failureReason?.trim() || null
  if (failedSnapshotId === snapshot.id && normalizedFailureReason) {
    return {
      phase: 'error',
      label: 'Activation failed — retry',
      disabled: false,
      errorMessage: normalizedFailureReason,
    }
  }

  return {
    phase: 'idle',
    label: 'Go Live',
    disabled: false,
    errorMessage: null,
  }
}
