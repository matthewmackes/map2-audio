import type { SnapshotSummary } from '../../map2/types'
import {
  buildSnapshotSetlistOrder,
  moveSnapshotInSetlist,
  sortFavoriteSnapshotsForSetlist,
  sortSnapshotsByProgramNumber,
} from './snapshotSetlist'

function buildSnapshot(overrides: Partial<SnapshotSummary>): SnapshotSummary {
  return {
    id: 1,
    name: 'Snapshot',
    description: '',
    tags: [],
    program_number: null,
    input_device: null,
    output_device: null,
    is_active: false,
    is_favorite: false,
    display_order: 0,
    channels: [],
    channel_count: 0,
    chain_count: 0,
    community_shared: false,
    community_download_count: 0,
    community_rating: null,
    community_rating_count: 0,
    created_at: '2026-04-01T12:00:00Z',
    updated_at: '2026-04-01T12:00:00Z',
    ...overrides,
  }
}

describe('snapshotSetlist', () => {
  it('orders snapshots by MIDI program number and pushes unassigned programs to the end', () => {
    const ordered = sortSnapshotsByProgramNumber([
      buildSnapshot({ id: 4, name: 'Pad', program_number: null, display_order: 3 }),
      buildSnapshot({ id: 2, name: 'Lead', program_number: 20, display_order: 1 }),
      buildSnapshot({ id: 1, name: 'Clean', program_number: 5, display_order: 4 }),
      buildSnapshot({ id: 3, name: 'Crunch', program_number: 20, display_order: 0 }),
    ])

    expect(ordered.map((snapshot) => snapshot.id)).toEqual([1, 3, 2, 4])
  })

  it('normalizes setlist order against the current favorite list and appends new favorites', () => {
    const favorites = [
      buildSnapshot({ id: 11, is_favorite: true, display_order: 2 }),
      buildSnapshot({ id: 12, is_favorite: true, display_order: 0 }),
      buildSnapshot({ id: 13, is_favorite: true, display_order: 1 }),
    ]

    expect(buildSnapshotSetlistOrder(favorites, [13, 99, 11])).toEqual([13, 11, 12])
  })

  it('sorts favorite snapshots using the persisted gig order', () => {
    const favorites = [
      buildSnapshot({ id: 21, name: 'Intro', is_favorite: true, display_order: 2 }),
      buildSnapshot({ id: 22, name: 'Verse', is_favorite: true, display_order: 0 }),
      buildSnapshot({ id: 23, name: 'Solo', is_favorite: true, display_order: 1 }),
    ]

    const ordered = sortFavoriteSnapshotsForSetlist(favorites, [23, 21, 22])

    expect(ordered.map((snapshot) => snapshot.id)).toEqual([23, 21, 22])
  })

  it('moves snapshots earlier and later within the gig order', () => {
    expect(moveSnapshotInSetlist([31, 32, 33], 32, 'earlier')).toEqual([32, 31, 33])
    expect(moveSnapshotInSetlist([31, 32, 33], 32, 'later')).toEqual([31, 33, 32])
    expect(moveSnapshotInSetlist([31, 32, 33], 31, 'earlier')).toBeNull()
  })
})
