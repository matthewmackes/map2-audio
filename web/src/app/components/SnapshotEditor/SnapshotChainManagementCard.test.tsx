import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { SnapshotDetail, SnapshotDraftData, SnapshotRuntimeLiveState } from '../../../map2/types'
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
        plugins: [
          {
            uri: 'plugin://drive',
            name: 'Drive',
            position: 0,
            bypass: false,
            parameters: {},
            loader_state: null,
            is_placeholder: false,
          },
        ],
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
        plugins: [
          {
            uri: 'plugin://echo',
            name: 'Echo',
            position: 0,
            bypass: false,
            parameters: {},
            loader_state: null,
            is_placeholder: false,
          },
        ],
        loop_insertions: [],
        effects_loops: [],
      },
    ],
    chains: [
      {
        id: 201,
        name: 'Drive',
        plugins: [
          {
            uri: 'plugin://drive',
            name: 'Drive',
            position: 0,
            bypass: false,
            parameters: {},
            loader_state: null,
            is_placeholder: false,
          },
        ],
        loop_insertions: [],
        effects_loops: [],
      },
      {
        id: 202,
        name: 'Echo',
        plugins: [
          {
            uri: 'plugin://echo',
            name: 'Echo',
            position: 0,
            bypass: false,
            parameters: {},
            loader_state: null,
            is_placeholder: false,
          },
        ],
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

function renderCard(
  liveSnapshot: SnapshotDetail | null = buildLiveSnapshot(),
  options: {
    editorSnapshotDraft?: SnapshotDraftData | null
    onLoadPreviousSnapshot?: jest.Mock
    onLoadNextSnapshot?: jest.Mock
    onRenameSnapshot?: jest.Mock
    onToggleSnapshotFavorite?: jest.Mock
    onToggleSnapshotLock?: jest.Mock
    onSubmitSnapshotDescription?: jest.Mock
    onSubmitTempoBpm?: jest.Mock
    runtimeLiveState?: SnapshotRuntimeLiveState | null
    snapshotRenamePending?: boolean
    previousSnapshotDisabled?: boolean
    nextSnapshotDisabled?: boolean
    previousSnapshotDisabledReason?: string
    nextSnapshotDisabledReason?: string
    snapshotFavoritePending?: boolean
    snapshotLockPending?: boolean
    snapshotDescriptionPending?: boolean
    tempoPending?: boolean
  } = {},
) {
  return render(
    <SnapshotChainManagementCard
      onToggleSelectedChainActive={jest.fn()}
      onDuplicateChain={jest.fn()}
      onRenameChain={jest.fn()}
      liveSnapshot={liveSnapshot}
      editorSnapshotDraft={options.editorSnapshotDraft}
      runtimeLiveState={options.runtimeLiveState}
      onRenameSnapshot={options.onRenameSnapshot}
      snapshotRenamePending={options.snapshotRenamePending}
      onLoadPreviousSnapshot={options.onLoadPreviousSnapshot}
      onLoadNextSnapshot={options.onLoadNextSnapshot}
      previousSnapshotDisabled={options.previousSnapshotDisabled}
      nextSnapshotDisabled={options.nextSnapshotDisabled}
      previousSnapshotDisabledReason={options.previousSnapshotDisabledReason}
      nextSnapshotDisabledReason={options.nextSnapshotDisabledReason}
      onToggleSnapshotFavorite={options.onToggleSnapshotFavorite}
      snapshotFavoritePending={options.snapshotFavoritePending}
      onToggleSnapshotLock={options.onToggleSnapshotLock}
      snapshotLockPending={options.snapshotLockPending}
      onSubmitSnapshotDescription={options.onSubmitSnapshotDescription}
      snapshotDescriptionPending={options.snapshotDescriptionPending}
      onSubmitTempoBpm={options.onSubmitTempoBpm}
      tempoPending={options.tempoPending}
      detailsAction={<button type="button">Details</button>}
    />,
  )
}

function buildRuntimeLiveState(overrides: Partial<SnapshotRuntimeLiveState> = {}): SnapshotRuntimeLiveState {
  return {
    node_id: 'local-node',
    seq: 1,
    emitted_at: '2026-03-29T18:10:00Z',
    state: 'live',
    snapshot_id: 42,
    snapshot_revision: 'rev-42',
    snapshot_name: 'Friday Night Drive',
    triggered_by: 'ui',
    live_snapshot_payload: null,
    last_successful_request_id: 'request-1',
    failure_reason: null,
    runtime_metrics: {},
    warning_threshold_seconds: 10,
    offline_threshold_seconds: 15,
    age_seconds: 0.2,
    is_warning: false,
    is_offline: false,
    display_state: 'live',
    display_label: 'Live',
    ...overrides,
  }
}

describe('SnapshotChainManagementCard', () => {
  it('renders the unified live snapshot hero with title, details trigger, LCD readout, and right-side metadata table', () => {
    const { container } = renderCard(buildLiveSnapshot(), {
      onSubmitSnapshotDescription: jest.fn(),
      runtimeLiveState: buildRuntimeLiveState(),
    })
    const metadataTable = screen.getByRole('table', { name: 'Live snapshot metadata' })
    const metadataRows = metadataTable.querySelectorAll('tbody tr')
    const topRow = container.querySelector('.juce-grid-page__snapshot-status-top-row')
    const topTools = container.querySelector('.juce-grid-page__snapshot-status-top-tools')
    const bpmStack = container.querySelector('.juce-grid-page__snapshot-status-bpm-stack')
    const contentRow = container.querySelector('.juce-grid-page__snapshot-status-content-row')
    const midiReadout = container.querySelector('[aria-label="PC 023  CH 01/05"]')
    const midiPanel = container.querySelector('.juce-grid-page__snapshot-status-midi')

    expect(screen.getByText('Audio Grid')).toBeInTheDocument()
    expect(screen.getByText('Friday Night Drive')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(midiReadout).toBeInTheDocument()
    expect(screen.queryByText('Current snapshot')).not.toBeInTheDocument()
    expect(screen.queryByText('Description')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit snapshot description' })).toHaveTextContent('Lead-ready snapshot for the main performance set.')
    expect(screen.getByText('Stored BPM')).toBeInTheDocument()
    expect(screen.getByDisplayValue('128.0')).toBeInTheDocument()
    expect(screen.queryByText('Active 128.0 BPM • Stored tempo')).not.toBeInTheDocument()
    expect(screen.getByText('Input Device')).toBeInTheDocument()
    expect(screen.getByText('Stage Input')).toBeInTheDocument()
    expect(screen.getByText('Output Device')).toBeInTheDocument()
    expect(screen.getByText('House Left/Right')).toBeInTheDocument()
    expect(screen.getByText('Number of Blocks involved')).toBeInTheDocument()
    expect(screen.getByText('2 blocks')).toBeInTheDocument()
    expect(screen.getByText('Routing Mode')).toBeInTheDocument()
    expect(screen.getByText('Parallel')).toBeInTheDocument()
    expect(screen.getByText('Number of Channels')).toBeInTheDocument()
    expect(screen.getByText('2 channels')).toBeInTheDocument()
    expect(screen.getByText('Output Reference')).toBeInTheDocument()
    expect(screen.getByText('Unset • ±3.0 dB')).toBeInTheDocument()
    expect(screen.getByText('Last Updated')).toBeInTheDocument()
    expect(screen.getByText('Node Sync Status')).toBeInTheDocument()
    expect(screen.getByText('Local live only')).toBeInTheDocument()
    expect(container.querySelector('.juce-grid-page__snapshot-status-grid')).not.toBeInTheDocument()
    expect(metadataTable).toBeInTheDocument()
    expect(metadataRows).toHaveLength(3)
    expect(within(metadataRows[2] as HTMLTableRowElement).getByRole('button', { name: 'Details' })).toBeInTheDocument()
    expect(metadataTable).toContainElement(screen.getByText('Local live only'))
    expect(topRow).toContainElement(screen.getByText('Audio Grid'))
    expect(topTools).toContainElement(bpmStack as Element)
    expect(topTools).toContainElement(midiPanel as Element)
    expect(topRow).toContainElement(midiReadout as Element)
    expect(bpmStack?.compareDocumentPosition(midiPanel as Element) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(contentRow).toContainElement(screen.getByText('Friday Night Drive'))
    expect(contentRow).toContainElement(metadataTable)
    expect(container.querySelector('.juce-grid-page__snapshot-status-pill')).not.toBeInTheDocument()
    expect(screen.queryByText('Live now')).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Snapshot hero actions' })).not.toBeInTheDocument()
  })

  it('submits stored tempo edits and shows the MIDI tap override status', () => {
    const onSubmitTempoBpm = jest.fn()
    renderCard(buildLiveSnapshot({
      live_tempo_bpm: 132,
      active_tempo_bpm: 132,
      tempo_source: 'tap',
    }), {
      onSubmitTempoBpm,
    })

    fireEvent.change(screen.getByLabelText('Stored BPM'), { target: { value: '140' } })
    fireEvent.blur(screen.getByLabelText('Stored BPM'))
    expect(onSubmitTempoBpm).toHaveBeenCalledWith(140)

    expect(screen.queryByText('Active 132.0 BPM via MIDI tap')).not.toBeInTheDocument()
    expect(screen.getByText('MIDI tap override active')).toBeInTheDocument()
  })

  it('renders output reference state in the details grid and keeps warning messaging visible', () => {
    render(
      <SnapshotChainManagementCard
        onToggleSelectedChainActive={jest.fn()}
        onDuplicateChain={jest.fn()}
        onRenameChain={jest.fn()}
        liveSnapshot={buildLiveSnapshot({
          output_level_reference_dbfs: -15,
          output_level_warning_threshold_db: 3,
        })}
        outputLevelWarningMessage="Output is 5.5 dB above reference level."
        detailsAction={<button type="button">Details</button>}
      />,
    )

    expect(screen.getByText('Output Reference')).toBeInTheDocument()
    expect(screen.getByText('-15.0 dBFS • ±3.0 dB')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set Reference Level' })).not.toBeInTheDocument()
    expect(screen.getByText('Output is 5.5 dB above reference level.')).toBeInTheDocument()
  })

  it('uses the live snapshot title as the rename trigger when a rename handler is provided', () => {
    const onRenameSnapshot = jest.fn()

    renderCard(buildLiveSnapshot(), { onRenameSnapshot })

    const renameButton = screen.getByRole('button', { name: 'Rename snapshot Friday Night Drive' })
    expect(renameButton).toBeInTheDocument()

    fireEvent.click(renameButton)

    expect(onRenameSnapshot).toHaveBeenCalledTimes(1)
  })

  it('renders a snapshot favorite toggle and calls through when pressed', () => {
    const onToggleSnapshotFavorite = jest.fn()

    renderCard(buildLiveSnapshot({ is_favorite: false }), { onToggleSnapshotFavorite })

    const favoriteButton = screen.getByRole('button', { name: 'Favorite' })
    expect(favoriteButton).toBeInTheDocument()

    fireEvent.click(favoriteButton)

    expect(onToggleSnapshotFavorite).toHaveBeenCalledTimes(1)
  })

  it('places favorite and lock controls below the snapshot description instead of in the title row', () => {
    const onToggleSnapshotFavorite = jest.fn()
    const onToggleSnapshotLock = jest.fn()
    const { container } = renderCard(
      buildLiveSnapshot({ description: 'Created from Snapshot Editor', is_favorite: false }),
      {
        onToggleSnapshotFavorite,
        onToggleSnapshotLock,
        onSubmitSnapshotDescription: jest.fn(),
      },
    )

    const descriptionButton = screen.getByText('Created from Snapshot Editor')
    const actionGroup = screen.getByRole('group', { name: 'Snapshot actions' })
    const favoriteButton = screen.getByRole('button', { name: 'Favorite' })
    const lockButton = screen.getByRole('button', { name: 'Lock' })
    const liveRow = container.querySelector('.juce-grid-page__snapshot-status-live-row')

    expect(actionGroup).toContainElement(favoriteButton)
    expect(actionGroup).toContainElement(lockButton)
    expect(liveRow).not.toContainElement(favoriteButton)
    expect(liveRow).not.toContainElement(lockButton)
    expect(descriptionButton.compareDocumentPosition(actionGroup) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('renders previous and next snapshot buttons and disables them with the provided reasons', () => {
    const onLoadPreviousSnapshot = jest.fn()
    const onLoadNextSnapshot = jest.fn()

    renderCard(buildLiveSnapshot(), {
      onLoadPreviousSnapshot,
      onLoadNextSnapshot,
      previousSnapshotDisabled: true,
      nextSnapshotDisabled: false,
      previousSnapshotDisabledReason: 'No previous snapshot',
      nextSnapshotDisabledReason: 'No next snapshot',
    })

    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Prev' })).toHaveAttribute('title', 'No previous snapshot')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(onLoadPreviousSnapshot).not.toHaveBeenCalled()
    expect(onLoadNextSnapshot).toHaveBeenCalledTimes(1)
  })

  it('renders a snapshot lock toggle and disables stored BPM edits while locked', () => {
    const onToggleSnapshotLock = jest.fn()

    renderCard(buildLiveSnapshot({ is_locked: true }), { onToggleSnapshotLock })

    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Locked' })).toBeInTheDocument()
    expect(screen.getByLabelText('Stored BPM')).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Locked' }))

    expect(onToggleSnapshotLock).toHaveBeenCalledTimes(1)
  })

  it('edits the snapshot description inline and saves on enter', () => {
    const onSubmitSnapshotDescription = jest.fn()

    renderCard(buildLiveSnapshot(), { onSubmitSnapshotDescription })

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot description' }))

    const textarea = screen.getByRole('textbox', { name: 'Snapshot description' })
    fireEvent.change(textarea, { target: { value: 'Bridge pickup only' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onSubmitSnapshotDescription).toHaveBeenCalledWith('Bridge pickup only')
  })

  it('shows the inline placeholder when no description has been stored yet', () => {
    renderCard(buildLiveSnapshot({ description: '' }), {
      onSubmitSnapshotDescription: jest.fn(),
    })

    expect(screen.getByRole('button', { name: 'Add snapshot description' })).toHaveTextContent('Add rig notes...')
  })

  it('renders a clear empty state inside the same unified hero when no live snapshot is active', () => {
    const { container } = renderCard(null)

    expect(screen.getByText('Audio Grid')).toBeInTheDocument()
    expect(screen.getByText('No live snapshot')).toBeInTheDocument()
    expect(screen.getByText('Stopped')).toBeInTheDocument()
    expect(screen.getByText('Recall or create a snapshot to populate live snapshot status here.')).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(container.querySelector('[aria-label="PC --  CH --"]')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rename snapshot/i })).not.toBeInTheDocument()
  })

  it('shows the alternate live snapshot name when another known snapshot is live on the host', () => {
    renderCard(buildLiveSnapshot(), {
      runtimeLiveState: buildRuntimeLiveState({
        snapshot_id: 84,
        snapshot_name: 'Clean Intro',
      }),
    })

    expect(screen.getByText('LIVE: Clean Intro')).toBeInTheDocument()
  })

  it('uses the current editor snapshot draft for block count, routing mode, and channel count metadata', () => {
    renderCard(buildLiveSnapshot(), {
      editorSnapshotDraft: {
        flowSlots: [
          {
            id: 'ch_a',
            chainId: 301,
            label: 'A',
            color: '#2563eb',
            muted: false,
            solo: false,
            dryWetMix: 100,
          },
          {
            id: 'ch_b',
            chainId: 302,
            label: 'B',
            color: '#22c55e',
            muted: false,
            solo: false,
            dryWetMix: 100,
          },
          {
            id: 'ch_c',
            chainId: 303,
            label: 'C',
            color: '#ff832b',
            muted: false,
            solo: false,
            dryWetMix: 100,
          },
        ],
        routing: {
          mode: 'parameter_morph',
          activeSlotId: 'ch_a',
          blendPositions: { ch_a: 100, ch_b: 50, ch_c: 50 },
          morphProgress: 0.5,
          morphSourceSlotId: 'ch_a',
          morphTargetSlotId: 'ch_b',
          seriesOrder: ['ch_a', 'ch_b', 'ch_c'],
        },
        activeFlowIndex: 0,
        chains: {
          '301': {
            name: 'Drive',
            plugins: [
              { uri: 'plugin://drive', position: 0, bypass: false, parameters: {} },
              { uri: 'plugin://compressor', position: 1, bypass: false, parameters: {} },
            ],
          },
          '302': {
            name: 'Echo',
            plugins: [
              { uri: 'plugin://echo', position: 0, bypass: false, parameters: {} },
            ],
          },
          '303': {
            name: 'Shimmer',
            plugins: [
              { uri: 'plugin://reverb', position: 0, bypass: false, parameters: {} },
              { uri: 'plugin://widener', position: 1, bypass: false, parameters: {} },
            ],
          },
        },
      },
    })

    expect(screen.getByText('5 blocks')).toBeInTheDocument()
    expect(screen.getByText('Morph')).toBeInTheDocument()
    expect(screen.getByText('3 channels')).toBeInTheDocument()
  })
})
