import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { SnapshotPublishPage } from './SnapshotPublishPage'

const mockPushToast = jest.fn()
const mockGet = jest.fn()
const mockGetPublishReadiness = jest.fn()
const mockActivate = jest.fn()
const mockRetryPublish = jest.fn()
const mockRunPublishRepairAction = jest.fn()

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

jest.mock('../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    get: (...args: unknown[]) => mockGet(...args),
    getPublishReadiness: (...args: unknown[]) => mockGetPublishReadiness(...args),
    activate: (...args: unknown[]) => mockActivate(...args),
    retryPublish: (...args: unknown[]) => mockRetryPublish(...args),
    runPublishRepairAction: (...args: unknown[]) => mockRunPublishRepairAction(...args),
  },
}))

jest.mock('../hooks/useAuthoritativeAudioState', () => ({
  useCommittedAudioState: () => ({
    data: {
      value: {
        state_version: 7,
        observed_summary: {
          effective_input_device: 'Rack input',
          effective_output_device: 'Rack output',
        },
      },
    },
  }),
  useDesiredAudioState: () => ({
    data: {
      value: {
        io: {
          requested_input_device: 'Rack input',
          requested_output_device: 'Rack output',
        },
      },
    },
  }),
  useObservedAudioState: () => ({
    data: {
      observations: [
        {
          value: {
            effective_input_device: 'Rack input',
            effective_output_device: 'Rack output',
          },
        },
      ],
    },
  }),
}))

jest.mock('../hooks/useSnapshotRuntimeState', () => ({
  useSnapshotRuntimeLiveState: () => ({
    data: {
      display_label: 'Waiting for confirmation',
    },
  }),
  useSnapshotActivationEvents: () => ({
    data: {
      events: [
        {
          snapshot_id: 12,
          requested_at: '2026-04-10T17:20:00Z',
          outcome: 'failed',
          runtime_metrics: {
            node_confirmations: {
              'node-a': {
                node_id: 'node-a',
                status: 'failed',
                operator_message: 'Node A did not confirm the publish.',
              },
            },
            channel_confirmations: {
              ch_a: {
                path_id: 'ch_a',
                status: 'failed',
                operator_message: 'Channel A is still waiting.',
              },
            },
          },
        },
      ],
    },
  }),
}))

function renderPage(initialPath = '/snapshots/12/publish') {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/snapshot-editor" element={<div>Editor route</div>} />
          <Route path="/workspace/artifacts" element={<div>Artifacts route</div>} />
          <Route path="/snapshots/:snapshotId/publish" element={<SnapshotPublishPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SnapshotPublishPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockResolvedValue({
      id: 12,
      name: 'Arena Main',
      input_device: 'Stage input',
      output_device: 'Main out',
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
      },
      paths: [{ id: 'ch_a' }, { id: 'ch_b' }],
      live_state: {
        paths: [],
        display_label: 'Waiting for confirmation',
      },
    })
    mockGetPublishReadiness.mockResolvedValue({
      snapshot_id: 12,
      draft_revision_id: 9,
      requested_revision_id: 9,
      confirmed_revision_id: null,
      status: 'blocked',
      requirements: [
        {
          id: 'network_routing',
          label: 'Remote-node routing is ready',
          status: 'not_applicable',
          scope: 'cluster',
          operator_message: 'This snapshot stays on the local node on this machine. No remote-node routing is required.',
          repair_actions: [],
        },
        {
          id: 'engine_accepted_publish',
          label: 'Runtime can accept this publish',
          status: 'needs_attention',
          scope: 'intent',
          operator_message: 'The local audio engine on this machine is stopped or offline, so MAP2 cannot send this publish yet.',
          repair_actions: [],
        },
      ],
      blockers: [
        {
          id: 'engine_unavailable',
          code: 'engine_unavailable',
          severity: 'blocking',
          scope: 'node',
          title: 'Runtime is not ready',
          operator_message: 'The local audio engine on this machine is stopped, so MAP2 cannot publish this snapshot yet.',
          technical_detail: 'Local engine state: stopped.',
          recommended_action: 'Start the audio engine, then retry publish',
          repair_action_id: 'retry_publish',
          prerequisite_of: [],
          related_path_ids: [],
          related_node_ids: ['node-local'],
        },
      ],
      warnings: [],
      available_repairs: [
        {
          id: 'retry_publish',
          label: 'Retry publish',
          related_path_ids: [],
          related_node_ids: ['node-a'],
        },
      ],
      applicable_steps: ['engine'],
    })
    mockActivate.mockResolvedValue({})
    mockRetryPublish.mockResolvedValue({})
    mockRunPublishRepairAction.mockResolvedValue({})
  })

  it('renders the publish workspace summary and checklist', async () => {
    renderPage()

    expect(await screen.findByText('Arena Main')).toBeTruthy()
    expect(screen.getByText('Publish snapshot')).toBeTruthy()
    expect(screen.getByText('Runtime is not ready')).toBeTruthy()
    expect(screen.getByText('Runtime can accept this publish')).toBeTruthy()
    expect(screen.getByText(/MAP2 is not waiting for a remote node\./)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Retry publish' })).toHaveLength(2)
  })

  it('retries publish from the guided issue action', async () => {
    renderPage()

    const buttons = await screen.findAllByRole('button', { name: 'Retry publish' })
    fireEvent.click(buttons[0])

    await waitFor(() => {
      expect(mockRetryPublish).toHaveBeenCalledWith(12)
    })
  })
})
