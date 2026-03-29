import type { SnapshotDetail } from '../../map2/types'
import { ApiError } from '../../map2/http'
import { snapshotsApi } from '../../map2/clients/snapshots'
import { fetchLiveSnapshotOrNull } from './snapshotLiveState'

jest.mock('../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    getLive: jest.fn(),
  },
}))

const mockGetLive = snapshotsApi.getLive as jest.MockedFunction<typeof snapshotsApi.getLive>

const liveSnapshotFixture: SnapshotDetail = {
  id: 7,
  name: 'Live Snapshot',
  description: '',
  tags: [],
  program_number: null,
  input_device: null,
  output_device: null,
  is_active: true,
  is_favorite: false,
  display_order: 0,
  channels: [],
  channel_count: 0,
  chain_count: 0,
  community_shared: false,
  community_download_count: 0,
  community_rating: null,
  community_rating_count: 0,
  io_bindings: {
    input_device: null,
    output_device: null,
    remap_required: false,
  },
  lineage: {
    derived_from_snapshot_id: null,
  },
  routing: {
    mode: 'parallel_blend',
    active_channel_index: 0,
    active_channel_key: null,
    blend_positions: {},
    morph_position: 0.5,
    morph_source_channel_key: null,
    morph_target_channel_key: null,
    series_order: [],
  },
  midi_map: [],
  paths: [],
  controls: {
    midi_map: [],
    automation_lanes: [],
    expression_mappings: [],
  },
  assets: [],
  live_state: {
    is_live: true,
    activated_at: null,
    paths: [],
    runtime_chains: [],
  },
  active_channel_index: 0,
  deployments: [],
}

describe('fetchLiveSnapshotOrNull', () => {
  beforeEach(() => {
    mockGetLive.mockReset()
  })

  it('returns the live snapshot when one exists', async () => {
    mockGetLive.mockResolvedValue(liveSnapshotFixture)

    await expect(fetchLiveSnapshotOrNull()).resolves.toEqual(liveSnapshotFixture)
  })

  it('treats 404 as no live snapshot', async () => {
    mockGetLive.mockRejectedValue(new ApiError(404, 'Not Found', { detail: 'Live snapshot not found' }))

    await expect(fetchLiveSnapshotOrNull()).resolves.toBeNull()
  })

  it('rethrows non-404 API errors', async () => {
    const error = new ApiError(500, 'Internal Server Error', { detail: 'boom' })
    mockGetLive.mockRejectedValue(error)

    await expect(fetchLiveSnapshotOrNull()).rejects.toBe(error)
  })
})
