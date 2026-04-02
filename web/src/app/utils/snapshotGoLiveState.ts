import type { SnapshotDetail, SnapshotRuntimeLiveState } from '../../map2/types'

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
  runtimeLiveState?: SnapshotRuntimeLiveState | null
  pendingSnapshotId?: number | null
  failedSnapshotId?: number | null
  failureReason?: string | null
}

export function isSnapshotCurrentRuntimeLive(
  snapshot: SnapshotGoLiveTarget | null,
  runtimeLiveState?: SnapshotRuntimeLiveState | null,
): boolean {
  if (!snapshot || !runtimeLiveState) {
    return false
  }

  const runtimeIsLive = runtimeLiveState.display_state === 'live' || runtimeLiveState.display_state === 'live_warning'
  if (!runtimeIsLive) {
    return false
  }

  if (runtimeLiveState.snapshot_id != null) {
    return runtimeLiveState.snapshot_id === snapshot.id
  }

  const runtimeSnapshotName = runtimeLiveState.snapshot_name?.trim()
    || runtimeLiveState.live_snapshot_payload?.name?.trim()
    || null

  return runtimeSnapshotName === snapshot.name
}

export function resolveSnapshotGoLiveState({
  snapshot,
  runtimeLiveState = null,
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

  if (isSnapshotCurrentRuntimeLive(snapshot, runtimeLiveState)) {
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

  if (!runtimeLiveState && (snapshot.live_state?.is_live || snapshot.is_active)) {
    return {
      phase: 'live',
      label: 'LIVE',
      disabled: true,
      errorMessage: null,
    }
  }

  return {
    phase: 'idle',
    label: 'Go Live',
    disabled: false,
    errorMessage: null,
  }
}
