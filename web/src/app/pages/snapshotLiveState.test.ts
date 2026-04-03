import type { SnapshotDetail } from '../../map2/types'
import {
  invalidateAuthorityAwareLiveSnapshot,
  removeRuntimeChainsFromLiveSnapshot,
  restoreAuthorityAwareLiveSnapshot,
  setAuthorityAwareLiveSnapshot,
} from './snapshotLiveState'

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
  paths: [
    {
      id: 'channel-a',
      name: 'Path A',
      label: 'A',
      color: '#2563eb',
      muted: false,
      solo: false,
      dry_wet_mix: 100,
      order_index: 0,
      snapshot_chain_id: 201,
      runtime_chain_id: 301,
      plugins: [],
      loop_insertions: [],
      effects_loops: [],
    },
    {
      id: 'channel-b',
      name: 'Path B',
      label: 'B',
      color: '#16a34a',
      muted: false,
      solo: false,
      dry_wet_mix: 100,
      order_index: 1,
      snapshot_chain_id: 202,
      runtime_chain_id: 302,
      plugins: [],
      loop_insertions: [],
      effects_loops: [],
    },
  ],
  controls: {
    midi_map: [],
    automation_lanes: [],
    expression_mappings: [],
  },
  assets: [],
  live_state: {
    is_live: true,
    activated_at: null,
    paths: [
      {
        path_id: 'channel-a',
        snapshot_chain_id: 201,
        runtime_chain_id: 301,
        runtime_chain_name: 'Path A',
        activation_status: 'active',
      },
      {
        path_id: 'channel-b',
        snapshot_chain_id: 202,
        runtime_chain_id: 302,
        runtime_chain_name: 'Path B',
        activation_status: 'active',
      },
    ],
    runtime_chains: [
      {
        id: 301,
        name: 'Path A',
        is_active: true,
        created_at: '2026-03-30T00:00:00.000Z',
        updated_at: '2026-03-30T00:00:00.000Z',
        plugins: [],
        loop_insertions: [],
        effects_loops: [],
        runtime_sync: {
          enabled: true,
          status: 'active',
          warnings: [],
          missing_positions: [],
          restored_positions: [],
          runtime_items: 0,
        },
      },
      {
        id: 302,
        name: 'Path B',
        is_active: true,
        created_at: '2026-03-30T00:00:00.000Z',
        updated_at: '2026-03-30T00:00:00.000Z',
        plugins: [],
        loop_insertions: [],
        effects_loops: [],
        runtime_sync: {
          enabled: true,
          status: 'active',
          warnings: [],
          missing_positions: [],
          restored_positions: [],
          runtime_items: 0,
        },
      },
    ],
  },
  active_channel_index: 0,
  deployments: [],
}

describe('removeRuntimeChainsFromLiveSnapshot', () => {
  it('clears matching runtime chain ids from the snapshot cache', () => {
    const next = removeRuntimeChainsFromLiveSnapshot(liveSnapshotFixture, [301])

    expect(next).not.toBe(liveSnapshotFixture)
    expect(next?.paths[0]?.runtime_chain_id).toBeNull()
    expect(next?.paths[1]?.runtime_chain_id).toBe(302)
    expect(next?.live_state.paths).toEqual([
      expect.objectContaining({ path_id: 'channel-b', runtime_chain_id: 302 }),
    ])
    expect(next?.live_state.runtime_chains.map((chain) => chain.id)).toEqual([302])
  })

  it('returns the original snapshot when nothing matches', () => {
    expect(removeRuntimeChainsFromLiveSnapshot(liveSnapshotFixture, [999])).toBe(liveSnapshotFixture)
  })
})

describe('authority-aware live snapshot cache helpers', () => {
  it('updates the authority-active detail cache when the snapshot matches authority state', () => {
    const setQueryData = jest.fn()

    setAuthorityAwareLiveSnapshot({ setQueryData }, liveSnapshotFixture, liveSnapshotFixture.id)

    expect(setQueryData).toHaveBeenCalledTimes(1)
    expect(setQueryData).toHaveBeenCalledWith(
      ['snapshots', 'detail', 'authority-active', liveSnapshotFixture.id],
      liveSnapshotFixture,
    )
  })

  it('does not restore any cache when the previous snapshot does not match authority state', () => {
    const setQueryData = jest.fn()

    restoreAuthorityAwareLiveSnapshot({ setQueryData }, liveSnapshotFixture, 999)

    expect(setQueryData).not.toHaveBeenCalled()
  })

  it('invalidates authority cache keys together', () => {
    const invalidateQueries = jest.fn()

    invalidateAuthorityAwareLiveSnapshot({ invalidateQueries }, { includeDesired: true })

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audio-state', 'committed'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audio-state', 'observed'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['snapshots', 'detail', 'authority-active'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audio-state', 'desired'] })
  })
})
