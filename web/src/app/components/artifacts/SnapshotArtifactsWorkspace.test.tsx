import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SnapshotArtifactsWorkspace } from './SnapshotArtifactsWorkspace'
import type { SnapshotDetail, SnapshotSummary } from '../../../map2/types'

const mockSnapshotsList = jest.fn()
const mockSnapshotsGet = jest.fn()
const mockListNodes = jest.fn()
const mockListDeployments = jest.fn()
const mockUseCommittedAudioState = jest.fn()
const mockUseObservedAudioState = jest.fn()
const mockUseClusterSnapshotRuntimeLiveState = jest.fn()
const mockUseSnapshotActivationEvents = jest.fn()

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    list: (...args: unknown[]) => mockSnapshotsList(...args),
    get: (...args: unknown[]) => mockSnapshotsGet(...args),
    listNodes: (...args: unknown[]) => mockListNodes(...args),
    listDeployments: (...args: unknown[]) => mockListDeployments(...args),
    duplicate: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deploy: jest.fn(),
    failover: jest.fn(),
    setProgram: jest.fn(),
    create: jest.fn(),
    importSnapshot: jest.fn(),
    importSnapshotBundle: jest.fn(),
  },
  snapshotDetailToDraftData: jest.fn(() => ({
    flowSlots: [],
    routing: {},
    activeFlowIndex: 0,
    chains: {},
  })),
}))

jest.mock('../../../map2/clients/audioState', () => ({
  audioStateApi: {
    activateSnapshot: jest.fn(),
  },
}))

jest.mock('../../hooks/useAuthoritativeAudioState', () => ({
  useCommittedAudioState: (...args: unknown[]) => mockUseCommittedAudioState(...args),
  useObservedAudioState: (...args: unknown[]) => mockUseObservedAudioState(...args),
}))

jest.mock('../../hooks/useRealtimeCadence', () => ({
  useRealtimeCadence: jest.fn(() => false),
}))

jest.mock('../../hooks/useRouteActive', () => ({
  useRouteActive: jest.fn(() => true),
}))

jest.mock('../../hooks/useSnapshotRuntimeState', () => ({
  useClusterSnapshotRuntimeLiveState: (...args: unknown[]) => mockUseClusterSnapshotRuntimeLiveState(...args),
  useSnapshotActivationEvents: (...args: unknown[]) => mockUseSnapshotActivationEvents(...args),
}))

jest.mock('../SnapshotEditor/SnapshotPinButton', () => ({
  SnapshotPinButton: ({ snapshotId }: { snapshotId: number }) => (
    <span data-testid={`snapshot-pin-${snapshotId}`}>Pin</span>
  ),
}))

const snapshotSummary: SnapshotSummary = {
  id: 42,
  version: 7,
  name: 'Ambient Lead',
  description: 'Playable rig',
  tags: ['ambient'],
  program_number: 12,
  input_device: null,
  output_device: null,
  is_active: false,
  is_favorite: false,
  is_locked: false,
  display_order: 0,
  channels: [],
  channel_count: 2,
  chain_count: 3,
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
  created_at: '2026-05-15T13:00:00Z',
  updated_at: '2026-05-15T13:10:00Z',
}

const snapshotDetail: SnapshotDetail = {
  ...snapshotSummary,
  channels: [],
  chains: [],
  routing: {
    mode: 'parallel_blend',
    active_channel_key: null,
    blend_positions: {},
    morph_position: 0,
    morph_source_channel_key: null,
    morph_target_channel_key: null,
    series_order: [],
  },
  midi_map: [],
  paths: [],
  io_bindings: snapshotSummary.io_bindings!,
  controls: {
    midi_map: [],
    automation_lanes: [],
    expression_mappings: [],
    maschine_encoder_map: {
      enc1: null,
      enc2: null,
      enc3: null,
      enc4: null,
      enc5: null,
      enc6: null,
      enc7: null,
      enc8: null,
      vol: { fixed: true, label: 'Master Gain' },
      tempo: { fixed: true, label: 'MIDI Clock BPM' },
      swing: { label: 'Swing' },
    },
  },
  assets: [],
  live_state: {
    is_live: false,
    paths: [],
    runtime_chains: [],
    display_state: 'offline',
  },
  lineage: snapshotSummary.lineage!,
  active_channel_index: 0,
  deployments: [],
  revision_number: 1,
  snapshot_revision: 'rev-1',
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SnapshotArtifactsWorkspace
        searchQuery=""
        onSearchQueryChange={jest.fn()}
        isClusterMode={false}
        nodes={[]}
        localNodeId="local"
        onToast={jest.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('SnapshotArtifactsWorkspace', () => {
  beforeEach(() => {
    mockSnapshotsList.mockResolvedValue({
      snapshots: [snapshotSummary],
      count: 1,
      available_tags: ['ambient'],
    })
    mockSnapshotsGet.mockResolvedValue(snapshotDetail)
    mockListNodes.mockResolvedValue({ nodes: [] })
    mockListDeployments.mockResolvedValue({ deployments: [], total: 0 })
    mockUseCommittedAudioState.mockReturnValue({
      data: { value: null },
      isSuccess: true,
    })
    mockUseObservedAudioState.mockReturnValue({
      data: { observations: [] },
    })
    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: { nodes: [] },
    })
    mockUseSnapshotActivationEvents.mockReturnValue({
      data: { events: [] },
      isLoading: false,
    })
  })

  it('exposes the existing .map2snapshot bundle download route for every snapshot card', async () => {
    renderWorkspace()

    const link = await screen.findByRole('link', {
      name: 'Download bundle for Ambient Lead',
    })

    expect(link).toHaveAttribute('href', '/api/snapshots/42/export')
    expect(link).toHaveAttribute('download')
    expect(link).toHaveTextContent('Download bundle')
  })
})
