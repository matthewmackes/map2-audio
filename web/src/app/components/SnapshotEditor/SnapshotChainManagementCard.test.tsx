import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'
import type { SnapshotDetail } from '../../../map2/types'
import { SnapshotChainManagementCard } from './SnapshotChainManagementCard'

function buildLiveSnapshot(overrides: Partial<SnapshotDetail> = {}): SnapshotDetail {
  return {
    id: 42,
    name: 'Friday Night Drive',
    description: 'Lead-ready snapshot for the main performance set.',
    tags: [],
    program_number: 23,
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
    midi_map: [
      { action: 'load_snapshot', program_number: 23, channel: 1 },
      { action: 'load_snapshot', channel: 5 },
    ],
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
    io_bindings: {
      input_device: 'Stage Input',
      output_device: 'House Left/Right',
      remap_required: false,
    },
    controls: {
      midi_map: [
        { action: 'load_snapshot', program_number: 23, midi_channel: 1 },
        { action: 'load_snapshot', midi_channels: [5] },
      ],
      automation_lanes: [],
      expression_mappings: [],
    },
    assets: [],
    live_state: {
      is_live: true,
      activated_at: '2026-03-29T18:10:00Z',
      paths: [],
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

function renderCard(liveSnapshot: SnapshotDetail | null = buildLiveSnapshot()) {
  return render(
    <SnapshotChainManagementCard
      onToggleSelectedChainActive={jest.fn()}
      onDuplicateChain={jest.fn()}
      onRenameChain={jest.fn()}
      liveSnapshot={liveSnapshot}
    />,
  )
}

describe('SnapshotChainManagementCard', () => {
  it('renders the live snapshot hero with LCD MIDI assignments and compact status tiles', () => {
    const { container } = renderCard()

    expect(screen.getByText('Friday Night Drive')).toBeInTheDocument()
    expect(container.querySelector('[aria-label="PC 023  CH 01/05"]')).toBeInTheDocument()
    expect(screen.queryByText('Live Snapshot')).not.toBeInTheDocument()
    expect(screen.queryByText('Description')).not.toBeInTheDocument()
    expect(screen.queryByText('Lead-ready snapshot for the main performance set.')).not.toBeInTheDocument()
    expect(screen.getByText('Input device')).toBeInTheDocument()
    expect(screen.getByText('Stage Input')).toBeInTheDocument()
    expect(screen.getByText('Output device')).toBeInTheDocument()
    expect(screen.getByText('House Left/Right')).toBeInTheDocument()
    expect(screen.getByText('Routing mode')).toBeInTheDocument()
    expect(screen.getByText('Parallel')).toBeInTheDocument()
    expect(screen.getByText('Path count')).toBeInTheDocument()
    expect(screen.getByText('2 paths')).toBeInTheDocument()
    expect(screen.getByText('Derived from snapshot')).toBeInTheDocument()
    expect(screen.getByText('Snapshot #7')).toBeInTheDocument()
  })

  it('renders a clear empty state when no live snapshot is active', () => {
    const { container } = renderCard(null)

    expect(screen.getByText('No live snapshot')).toBeInTheDocument()
    expect(screen.getByText('Recall or create a snapshot to populate live snapshot status here.')).toBeInTheDocument()
    expect(container.querySelector('[aria-label="PC --  CH --"]')).toBeInTheDocument()
  })
})
