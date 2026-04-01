import {
  normalizeSnapshotEditorStateSources,
  snapshotDetailToEditorState,
  snapshotEditorStateToDetail,
} from './snapshotEditorState'

const options = {
  palette: [
    { label: 'A', color: '#2563eb' },
    { label: 'B', color: '#22c55e' },
    { label: 'C', color: '#f59e0b' },
  ],
  defaultCount: 2,
  maxChannels: 6,
}

describe('snapshotEditorState', () => {
  it('normalizes legacy morph routing inputs into snapshot editor state', () => {
    const state = normalizeSnapshotEditorStateSources(
      [
        {
          id: 'flow-0',
          chainId: 7,
          label: 'Lead',
          color: '#2563eb',
          muted: false,
          solo: false,
          dryWetMix: 84,
        },
        {
          id: 'flow-1',
          chainId: null,
          label: 'Ambient',
          color: '#22c55e',
          muted: true,
          solo: false,
          dryWetMix: 42,
        },
      ],
      {
        mode: 'parameter_morph',
        activeSlotId: 'flow-0',
        blendPositions: { 'flow-0': 84, 'flow-1': 42 },
        morphProgress: 0.33,
        morphSourceSlotId: 'flow-0',
        morphTargetSlotId: 'flow-1',
        seriesOrder: ['flow-1', 'flow-0'],
      },
      1,
      options,
    )

    expect(state.routing.mode).toBe('morph')
    expect(state.routing.activeChannelKey).toBe('flow-0')
    expect(state.routing.morphSourceChannelKey).toBe('flow-0')
    expect(state.routing.morphTargetChannelKey).toBe('flow-1')
    expect(state.activeChannelIndex).toBe(1)
    expect(state.channels[0]).toMatchObject({
      id: 'flow-0',
      chainId: 7,
      label: 'Lead',
      dryWetMix: 84,
    })
  })

  it('round-trips a snapshot detail payload through editor state', () => {
    const initialDetail = {
      id: 12,
      name: 'Snapshot Alpha',
      description: 'Round-trip test',
      tags: ['test'],
      program_number: 11,
      is_active: false,
      is_favorite: true,
      display_order: 3,
      channels: [
        {
          id: 101,
          snapshot_id: 12,
          channel_key: 'channel-a',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          chain_id: 44,
        },
      ],
      paths: [
        {
          id: 'channel-a',
          name: 'Primary Path',
          label: 'A',
          color: '#2563eb',
          muted: false,
          solo: false,
          dry_wet_mix: 100,
          order_index: 0,
          snapshot_chain_id: 44,
          runtime_chain_id: null,
          plugins: [],
          loop_insertions: [],
          effects_loops: [],
        },
      ],
      chains: [
        {
          id: 44,
          name: 'Primary Chain',
          plugins: [],
          loop_insertions: [],
          effects_loops: [],
        },
      ],
      routing: {
        mode: 'parallel_blend' as const,
        active_channel_key: 'channel-a',
        blend_positions: { 'channel-a': 100 },
        morph_position: 0.5,
        morph_source_channel_key: null,
        morph_target_channel_key: null,
        series_order: ['channel-a'],
      },
      midi_map: [{ action: 'load_snapshot', program_number: 11 }],
      io_bindings: {
        input_device: null,
        output_device: null,
        remap_required: false,
      },
      controls: {
        midi_map: [{ action: 'load_snapshot', program_number: 11 }],
        automation_lanes: [],
        expression_mappings: [],
      },
      assets: [],
      live_state: {
        is_live: false,
        paths: [],
        runtime_chains: [],
      },
      lineage: {
        derived_from_snapshot_id: null,
      },
      session_notes: [],
      active_channel_index: 0,
      channel_count: 1,
      chain_count: 1,
      community_uuid: null,
      community_shared: false,
      community_author: null,
      community_download_count: 0,
      community_rating: null,
      community_rating_count: 0,
      created_at: null,
      updated_at: null,
      deployments: [],
    }

    const state = snapshotDetailToEditorState(initialDetail, options)
    const nextDetail = snapshotEditorStateToDetail(
      {
        ...state,
        channels: [
          {
            ...state.channels[0],
            label: 'Main',
            dryWetMix: 91,
          },
        ],
      },
      initialDetail,
    )

    expect(nextDetail.channels[0]).toMatchObject({
      id: 101,
      channel_key: 'channel-a',
      label: 'Main',
      dry_wet_mix: 91,
      chain_id: 44,
    })
    expect(nextDetail.routing.series_order).toEqual(['channel-a'])
    expect(nextDetail.midi_map).toEqual([{ action: 'load_snapshot', program_number: 11 }])
    expect(nextDetail.chains[0].name).toBe('Primary Chain')
    expect(nextDetail.session_notes).toEqual([])
  })
})
