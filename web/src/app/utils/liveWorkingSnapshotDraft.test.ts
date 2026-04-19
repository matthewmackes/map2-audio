import type { SnapshotDraftData } from '../../map2/types'
import {
  clearAllLiveWorkingSnapshotDrafts,
  clearLiveWorkingSnapshotDraft,
  LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY,
  readCompatibleLiveWorkingSnapshotDraft,
  readLiveWorkingSnapshotDraft,
  writeLiveWorkingSnapshotDraft,
} from './liveWorkingSnapshotDraft'

const SAMPLE_DRAFT: SnapshotDraftData = {
  flowSlots: [
    {
      id: 'flow-a',
      chainId: 11,
      label: 'A',
      color: '#22c55e',
      muted: false,
      solo: false,
      dryWetMix: 100,
    },
  ],
  routing: {
    mode: 'parallel_blend',
    activeSlotId: 'flow-a',
    blendPositions: {
      'flow-a': 100,
    },
    morphProgress: 0,
    morphSourceSlotId: null,
    morphTargetSlotId: null,
    seriesOrder: ['flow-a'],
  },
  activeFlowIndex: 0,
  chains: {
    '11': {
      name: 'Chain A',
      plugins: [
        {
          uri: 'urn:map2:test-plugin',
          position: 0,
          bypass: false,
          parameters: {
            gain: 0.5,
          },
        },
      ],
    },
  },
}

describe('liveWorkingSnapshotDraft', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('writes and reads a persisted working draft record', () => {
    writeLiveWorkingSnapshotDraft({
      snapshotId: 42,
      snapshotName: 'Arena Main',
      baseFingerprint: 'base-42',
      draft: SAMPLE_DRAFT,
    })

    const record = readLiveWorkingSnapshotDraft(42)
    expect(record?.snapshotId).toBe(42)
    expect(record?.snapshotName).toBe('Arena Main')
    expect(record?.baseFingerprint).toBe('base-42')
    expect(record?.workingFingerprint).toBeTruthy()
    expect(record?.draft).toEqual(SAMPLE_DRAFT)
  })

  it('returns only compatible working drafts for the matching base fingerprint', () => {
    writeLiveWorkingSnapshotDraft({
      snapshotId: 42,
      baseFingerprint: 'base-42',
      draft: SAMPLE_DRAFT,
    })

    expect(readCompatibleLiveWorkingSnapshotDraft(42, 'base-42')?.snapshotId).toBe(42)
    expect(readCompatibleLiveWorkingSnapshotDraft(42, 'other-base')).toBeNull()
  })

  it('clears one snapshot record without touching the others', () => {
    writeLiveWorkingSnapshotDraft({
      snapshotId: 42,
      baseFingerprint: 'base-42',
      draft: SAMPLE_DRAFT,
    })
    writeLiveWorkingSnapshotDraft({
      snapshotId: 84,
      baseFingerprint: 'base-84',
      draft: SAMPLE_DRAFT,
    })

    clearLiveWorkingSnapshotDraft(42)

    expect(readLiveWorkingSnapshotDraft(42)).toBeNull()
    expect(readLiveWorkingSnapshotDraft(84)?.snapshotId).toBe(84)
  })

  it('clears the storage payload completely when requested', () => {
    writeLiveWorkingSnapshotDraft({
      snapshotId: 42,
      baseFingerprint: 'base-42',
      draft: SAMPLE_DRAFT,
    })

    clearAllLiveWorkingSnapshotDrafts()

    expect(window.localStorage.getItem(LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY)).toBeNull()
  })
})
