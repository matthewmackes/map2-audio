import { resolveSnapshotRoutingLiveStatus } from './snapshotRoutingLiveState'

describe('resolveSnapshotRoutingLiveStatus', () => {
  it('reports draft-only editing when the snapshot is not authority-live', () => {
    expect(
      resolveSnapshotRoutingLiveStatus({
        isAuthorityLive: false,
        isApplying: false,
        applyState: 'idle',
      }),
    ).toEqual({
      tagLabel: 'Draft',
      tagType: 'cool-gray',
      message: 'Edits change the current draft. Save or Go Live to apply them.',
    })
  })

  it('reports in-flight live routing updates while a mutation is pending', () => {
    expect(
      resolveSnapshotRoutingLiveStatus({
        isAuthorityLive: true,
        isApplying: true,
        applyState: 'idle',
      }),
    ).toEqual({
      tagLabel: 'Applying',
      tagType: 'blue',
      message: 'Applying the latest live routing change…',
    })
  })

  it('still exposes the pending-live state when explicitly requested', () => {
    expect(
      resolveSnapshotRoutingLiveStatus({
        isAuthorityLive: true,
        isApplying: false,
        applyState: 'reactivation-required',
      }),
    ).toEqual({
      tagLabel: 'Pending live',
      tagType: 'warm-gray',
      message: 'Saved to the live snapshot. Reactivate to apply the new routing mode.',
    })
  })

  it('reports immediate live routing when no reactivation is pending', () => {
    expect(
      resolveSnapshotRoutingLiveStatus({
        isAuthorityLive: true,
        isApplying: false,
        applyState: 'live-applied',
      }),
    ).toEqual({
      tagLabel: 'Live',
      tagType: 'green',
      message: 'Routing mode, morph, and branch focus edits apply immediately to the live snapshot.',
    })
  })
})
