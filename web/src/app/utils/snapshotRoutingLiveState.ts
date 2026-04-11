export type SnapshotRoutingLiveApplyState = 'idle' | 'live-applied' | 'reactivation-required'

export interface SnapshotRoutingLiveStatus {
  tagLabel: 'Draft' | 'Live' | 'Pending live' | 'Applying'
  tagType: 'cool-gray' | 'green' | 'warm-gray' | 'blue'
  message: string
}

interface ResolveSnapshotRoutingLiveStatusOptions {
  isAuthorityLive: boolean
  isApplying: boolean
  applyState: SnapshotRoutingLiveApplyState
}

export function resolveSnapshotRoutingLiveStatus({
  isAuthorityLive,
  isApplying,
  applyState,
}: ResolveSnapshotRoutingLiveStatusOptions): SnapshotRoutingLiveStatus {
  if (!isAuthorityLive) {
    return {
      tagLabel: 'Draft',
      tagType: 'cool-gray',
      message: 'Edits change the current draft. Save draft or make live to apply them.',
    }
  }

  if (isApplying) {
    return {
      tagLabel: 'Applying',
      tagType: 'blue',
      message: 'Applying the latest live routing change…',
    }
  }

  if (applyState === 'reactivation-required') {
    return {
      tagLabel: 'Pending live',
      tagType: 'warm-gray',
      message: 'Saved to the live snapshot. Make it live again to apply the new routing mode.',
    }
  }

  return {
    tagLabel: 'Live',
    tagType: 'green',
    message: 'Routing mode, morph, and branch focus edits apply immediately to the live snapshot.',
  }
}
