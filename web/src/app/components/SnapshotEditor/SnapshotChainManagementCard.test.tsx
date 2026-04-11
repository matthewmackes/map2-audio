import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import type { AuthoritativeAudioState, SnapshotDetail } from '../../../map2/types'
import { SnapshotChainManagementCard } from './SnapshotChainManagementCard'

function buildLiveSnapshot(overrides: Partial<SnapshotDetail> = {}): SnapshotDetail {
  return {
    id: 42,
    name: 'Friday Night Drive',
    description: 'Lead-ready snapshot for the main performance set.',
    tags: [],
    program_number: 23,
    tempo_bpm: 128,
    live_tempo_bpm: null,
    active_tempo_bpm: 128,
    tempo_source: 'stored',
    tempo_updated_at: '2026-03-29T18:05:00Z',
    output_level_reference_dbfs: null,
    output_level_warning_threshold_db: 3,
    input_device: 'Stage Input',
    output_device: 'House Left/Right',
    is_active: true,
    is_favorite: true,
    display_order: 0,
    channels: [],
    channel_count: 2,
    chain_count: 2,
    community_shared: false,
    community_download_count: 0,
    community_rating: null,
    community_rating_count: 0,
    created_at: '2026-03-29T16:45:00Z',
    updated_at: '2026-03-29T18:05:00Z',
    routing: {
      mode: 'parallel_blend',
      active_channel_key: 'ch_a',
      blend_positions: { ch_a: 100, ch_b: 100 },
      morph_position: 0.5,
      morph_source_channel_key: null,
      morph_target_channel_key: null,
      series_order: ['ch_a', 'ch_b'],
    },
    midi_map: [],
    paths: [
      {
        id: 'ch_a',
        name: 'Drive',
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
        id: 'ch_b',
        name: 'Echo',
        label: 'B',
        color: '#22c55e',
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
    chains: [],
    io_bindings: {
      input_device: 'Stage Input',
      output_device: 'House Left/Right',
      monitoring_output_index: null,
      remap_required: false,
    },
    controls: {
      midi_map: [],
      automation_lanes: [],
      expression_mappings: [],
      monitoring_output_index: null,
      maschine_encoder_map: {
        enc1: null,
        enc2: null,
        enc3: null,
        enc4: null,
        enc5: null,
        enc6: null,
        enc7: null,
        enc8: null,
        vol: {},
        tempo: {},
      },
    },
    assets: [],
    live_state: {
      is_live: true,
      activated_at: '2026-03-29T18:10:00Z',
      paths: [
        { path_id: 'ch_a', snapshot_chain_id: 201, runtime_chain_id: 301 },
        { path_id: 'ch_b', snapshot_chain_id: 202, runtime_chain_id: 302 },
      ],
      runtime_chains: [],
    },
    lineage: {
      derived_from_snapshot_id: 7,
    },
    active_channel_index: 0,
    deployments: [],
    ...overrides,
  }
}

function buildAuthoritativeAudioState(overrides: Partial<AuthoritativeAudioState> = {}): AuthoritativeAudioState {
  return {
    schema_version: 1,
    state_version: 1,
    leader_epoch: 1,
    committed_at: '2026-03-29T18:10:01Z',
    origin_node_id: 'local',
    source_snapshot: {
      snapshot_id: 42,
      name: 'Friday Night Drive',
    },
    desired: {
      snapshot_id: 42,
      compiled_at: '2026-03-29T18:10:00Z',
      intent_version: 1,
      io: {},
      routing: {
        mode: 'parallel_blend',
        active_path_ids: ['ch_a', 'ch_b'],
        path_order: ['ch_a', 'ch_b'],
      },
      deployment: {
        placement_mode: 'local',
        preferred_nodes: ['local'],
      },
      chains: [],
    },
    observed_summary: {
      effective_input_device: 'Stage Input',
      effective_output_device: 'House Left/Right',
    },
    cluster: {
      sync_status: 'synced',
      applied_node_ids: ['local'],
      degraded_node_ids: [],
    },
    engine: {
      display_state: 'live',
      is_warning: false,
      is_offline: false,
    },
    paths: [
      {
        path_id: 'ch_a',
        label: 'A',
        snapshot_chain_id: 201,
        runtime_chain_id: 301,
        status: 'active',
      },
      {
        path_id: 'ch_b',
        label: 'B',
        snapshot_chain_id: 202,
        runtime_chain_id: 302,
        status: 'active',
      },
    ],
    derived: {
      active_channel_count: 2,
      total_channel_count: 2,
      inactive_messages: [],
    },
    ...overrides,
  }
}

function renderCard(overrides: Partial<React.ComponentProps<typeof SnapshotChainManagementCard>> = {}) {
  const props: React.ComponentProps<typeof SnapshotChainManagementCard> = {
    onToggleSelectedChainActive: jest.fn(),
    onDuplicateChain: jest.fn(),
    onRenameChain: jest.fn(),
    liveSnapshot: buildLiveSnapshot(),
    authoritativeAudioState: buildAuthoritativeAudioState(),
    onOpenProgressModal: jest.fn(),
    ...overrides,
  }

  render(<SnapshotChainManagementCard {...props} />)
  return props
}

describe('SnapshotChainManagementCard', () => {
  it('renders the snapshot title and opens snapshot progress from the activity indicator', () => {
    const props = renderCard()

    expect(screen.getByText('Audio Grid')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Friday Night Drive' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'All 2 channels are active.' }))

    expect(props.onOpenProgressModal).toHaveBeenCalledTimes(1)
  })

  it('shows waiting-channel progress text from authoritative status reasons', () => {
    renderCard({
      authoritativeAudioState: buildAuthoritativeAudioState({
        derived: {
          active_channel_count: 0,
          total_channel_count: 2,
          inactive_messages: ['Channel A pending apply.', 'Channel B pending apply.'],
        },
        paths: [
          {
            path_id: 'ch_a',
            label: 'A',
            snapshot_chain_id: 201,
            runtime_chain_id: null,
            status: 'pending',
            status_reason: 'Channel A pending apply.',
          },
          {
            path_id: 'ch_b',
            label: 'B',
            snapshot_chain_id: 202,
            runtime_chain_id: null,
            status: 'pending',
            status_reason: 'Channel B pending apply.',
          },
        ],
      }),
    })

    expect(screen.getByRole('button', { name: 'Channel A is waiting for the engine. Channel B is waiting for the engine.' })).toBeInTheDocument()
    expect(screen.getByText('0 of 2 channels active')).toBeInTheDocument()
  })

  it('supports inline snapshot rename editing', () => {
    const onSnapshotNameDraftChange = jest.fn()
    const onSubmitSnapshotName = jest.fn()

    renderCard({
      snapshotNameEditing: true,
      snapshotNameDraft: 'Friday Night Drive v2',
      onSnapshotNameDraftChange,
      onSubmitSnapshotName,
    })

    fireEvent.change(screen.getByLabelText('Snapshot name'), {
      target: { value: 'Friday Night Drive v3' },
    })
    fireEvent.keyDown(screen.getByLabelText('Snapshot name'), { key: 'Enter' })

    expect(onSnapshotNameDraftChange).toHaveBeenCalled()
    expect(onSubmitSnapshotName).toHaveBeenCalledTimes(1)
  })
})
