import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory } from 'history'
import { Route, Routes, unstable_HistoryRouter as HistoryRouter } from 'react-router-dom'

import { fingerprintSnapshotData } from '../components/SnapshotEditor/snapshotEditorComparison'
import { LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY } from '../utils/liveWorkingSnapshotDraft'
import { SnapshotPublishPage } from './SnapshotPublishPage'

const mockPushToast = jest.fn()
const mockGet = jest.fn()
const mockGetPublishReadiness = jest.fn()
const mockActivate = jest.fn()
const mockRetryPublish = jest.fn()
const mockRunPublishRepairAction = jest.fn()
const mockListNodes = jest.fn()
const mockDeploy = jest.fn()
const mockUpdate = jest.fn()
const mockAudioGetStatus = jest.fn()
const mockAudioGetPorts = jest.fn()
const mockActualSnapshotsModule = jest.requireActual('../../map2/clients/snapshots') as typeof import('../../map2/clients/snapshots')

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

jest.mock('../../map2/clients/snapshots', () => ({
  flowSnapshotDataToSnapshotPayload: (data: unknown) =>
    mockActualSnapshotsModule.flowSnapshotDataToSnapshotPayload(data as never),
  snapshotDetailToDraftData: (detail: unknown) => mockActualSnapshotsModule.snapshotDetailToDraftData(detail as never),
  snapshotsApi: {
    get: (...args: unknown[]) => mockGet(...args),
    getPublishReadiness: (...args: unknown[]) => mockGetPublishReadiness(...args),
    activate: (...args: unknown[]) => mockActivate(...args),
    retryPublish: (...args: unknown[]) => mockRetryPublish(...args),
    runPublishRepairAction: (...args: unknown[]) => mockRunPublishRepairAction(...args),
    listNodes: (...args: unknown[]) => mockListNodes(...args),
    deploy: (...args: unknown[]) => mockDeploy(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

jest.mock('../../map2/api', () => ({
  audioApi: {
    getStatus: (...args: unknown[]) => mockAudioGetStatus(...args),
    getPorts: (...args: unknown[]) => mockAudioGetPorts(...args),
  },
}))

jest.mock('../components/snapshots/SnapshotPublishAudioPortWorkspace', () => ({
  SnapshotPublishAudioPortWorkspace: ({ nodeId }: { nodeId?: string | null }) => (
    <div data-testid="publish-port-workspace">Port workspace {nodeId ?? 'none'}</div>
  ),
}))

jest.mock('../components/modals/RoutingTopologyContent', () => ({
  RoutingTopologyContent: () => <div data-testid="routing-topology-content">Routing topology</div>,
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
      node_id: 'node-local',
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
          request_id: 'req-12',
          node_id: 'node-local',
          triggered_by: 'publish_retry',
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
  const history = createMemoryHistory({
    initialEntries: [initialPath],
  })

  render(
    <QueryClientProvider client={client}>
      <HistoryRouter history={history}>
        <Routes>
          <Route path="/home" element={<div>Home route</div>} />
          <Route path="/snapshot-editor" element={<div>Editor route</div>} />
          <Route path="/workspace/artifacts" element={<div>Artifacts route</div>} />
          <Route path="/snapshots/:snapshotId/publish" element={<SnapshotPublishPage />} />
        </Routes>
      </HistoryRouter>
    </QueryClientProvider>,
  )

  return { history }
}

describe('SnapshotPublishPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.localStorage.clear()
    ;(globalThis as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        config: {
          snapshots: {
            default_input_device: 'Default input',
            default_output_device: 'Default output',
            default_monitoring_output_index: 0,
          },
        },
      }),
    })) as unknown as typeof fetch
    mockGet.mockResolvedValue({
      id: 12,
      name: 'Arena Main',
      revision_number: 9,
      input_device: 'Stage input',
      output_device: 'Main out',
      channels: [
        { id: 11, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, chain_id: 201 },
        { id: 12, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, chain_id: 202 },
      ],
      chains: [
        { id: 201, name: 'Chain A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Chain B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      paths: [],
      controls: {
        monitoring_output_index: 0,
      },
      io_bindings: {
        input_device: 'Stage input',
        output_device: 'Main out',
        monitoring_output_index: 0,
      },
      live_state: {
        is_live: true,
        paths: [],
        display_label: 'Waiting for confirmation',
      },
      deployments: [
        {
          id: 1,
          snapshot_id: 12,
          primary_node_id: 'node-local',
          standby_node_ids: [],
          deployment_status: 'active',
          assignment_strategy: 'manual',
          redundancy_enabled: false,
          history: [],
        },
      ],
    })
    mockListNodes.mockResolvedValue({
      nodes: [
        { id: 'node-local', status: 'online', hostname: 'local-rack' },
        { id: 'node-b', status: 'online', hostname: 'stage-rack' },
      ],
      count: 2,
    })
    mockDeploy.mockResolvedValue({
      status: 'deployed',
      snapshot_id: 12,
      node_id: 'node-b',
      deployment: {
        id: 1,
        snapshot_id: 12,
        primary_node_id: 'node-b',
        standby_node_ids: [],
        deployment_status: 'active',
        assignment_strategy: 'manual',
        redundancy_enabled: false,
        history: [],
      },
    })
    mockUpdate.mockResolvedValue({
      status: 'success',
      snapshot: {
        id: 12,
        revision_number: 10,
      },
    })
    mockAudioGetStatus.mockResolvedValue({
      running: true,
      input_device: 'Stage input',
      output_device: 'Main out',
      available_input_devices: ['Stage input', 'Rack input'],
      available_output_devices: ['Main out', 'Rack output'],
    })
    mockAudioGetPorts.mockResolvedValue({
      outputs: [
        { index: 0, name: 'Out 1', type: 'output' },
        { index: 1, name: 'Out 2', type: 'output' },
      ],
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
          repair_action_id: 'recover_local_audio_engine',
          prerequisite_of: [],
          related_path_ids: [],
          related_node_ids: ['node-local'],
        },
      ],
      warnings: [],
      available_repairs: [
        {
          id: 'recover_local_audio_engine',
          label: 'Start audio engine',
          related_path_ids: [],
          related_node_ids: ['node-local'],
        },
      ],
      applicable_steps: ['engine'],
    })
    mockActivate.mockResolvedValue({
      status: 'success',
      operator_message: 'The audio engine applied this snapshot and authority confirmation completed.',
    })
    mockRetryPublish.mockResolvedValue({
      status: 'degraded',
      operator_message: 'The audio engine applied this snapshot, but control-plane authority confirmation did not complete.',
    })
    mockRunPublishRepairAction.mockResolvedValue({
      status: 'success',
      operator_message: 'Local audio engine started',
      repair_action_id: 'recover_local_audio_engine',
    })
  })

  it('renders the publish workspace summary and checklist', async () => {
    renderPage()

    expect(await screen.findByText('Arena Main')).toBeTruthy()
    expect(screen.getByText('Publish snapshot')).toBeTruthy()
    expect(screen.getByText('Host')).toBeTruthy()
    expect(screen.getByText('Devices')).toBeTruthy()
    expect(screen.getByText('Per-channel live confirmation')).toBeTruthy()
    expect(screen.getByTestId('publish-port-workspace').textContent).toContain('Port workspace node-local')
    expect(screen.getByTestId('routing-topology-content')).toBeTruthy()
    expect(screen.getByText('Runtime is not ready')).toBeTruthy()
    expect(screen.getByText('Runtime can accept this publish')).toBeTruthy()
    expect(screen.getByText(/MAP2 is not waiting for a remote node\./)).toBeTruthy()
    expect(screen.getByText('Issue code')).toBeTruthy()
    expect(screen.getByText('engine_unavailable')).toBeTruthy()
    expect(screen.getByText('Request ID')).toBeTruthy()
    expect(screen.getByText('req-12')).toBeTruthy()
    expect(screen.getByText('Repair action')).toBeTruthy()
    expect(screen.getByText('recover_local_audio_engine')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start audio engine' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Retry publish' }).length).toBeGreaterThan(0)
  })

  it('renders the wizard mode as a true step-by-step publish flow', async () => {
    renderPage('/snapshots/12/publish?mode=wizard')

    expect(await screen.findByText('Fast path to live')).toBeTruthy()
    expect(screen.getByText('Save the snapshot')).toBeTruthy()
    expect(screen.getByText('Choose the live host')).toBeTruthy()
    expect(screen.getByText('Confirm the sound path')).toBeTruthy()
    expect(screen.getByText('Publish to live')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue to publish' })).toBeTruthy()
  })

  it('auto-saves the first revision before publishing when the only blocker is an unsaved draft', async () => {
    mockGet.mockResolvedValue({
      id: 12,
      name: 'Arena Main',
      revision_number: null,
      input_device: 'Stage input',
      output_device: 'Main out',
      channels: [
        { id: 11, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, chain_id: 201 },
        { id: 12, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, chain_id: 202 },
      ],
      chains: [
        { id: 201, name: 'Chain A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Chain B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      paths: [],
      controls: {
        monitoring_output_index: 0,
      },
      io_bindings: {
        input_device: 'Stage input',
        output_device: 'Main out',
        monitoring_output_index: 0,
      },
      live_state: {
        is_live: true,
        paths: [],
        display_label: 'Waiting for confirmation',
      },
      deployments: [
        {
          id: 1,
          snapshot_id: 12,
          primary_node_id: 'node-local',
          standby_node_ids: [],
          deployment_status: 'active',
          assignment_strategy: 'manual',
          redundancy_enabled: false,
          history: [],
        },
      ],
    })
    mockGetPublishReadiness.mockResolvedValue({
      snapshot_id: 12,
      draft_revision_id: null,
      requested_revision_id: null,
      confirmed_revision_id: null,
      status: 'blocked',
      requirements: [
        {
          id: 'draft_saved',
          label: 'Draft is saved',
          status: 'needs_attention',
          scope: 'draft',
          operator_message: 'Save the draft before publishing.',
          repair_actions: [],
        },
      ],
      blockers: [
        {
          id: 'unsaved_draft',
          code: 'unsaved_draft',
          severity: 'blocking',
          scope: 'draft',
          title: 'Save the draft before publishing',
          operator_message: 'This snapshot has not been saved as a revision yet.',
          technical_detail: 'No snapshot_revisions row exists for this snapshot.',
          recommended_action: 'Save draft',
          prerequisite_of: [],
          related_path_ids: [],
          related_node_ids: [],
        },
      ],
      warnings: [],
      available_repairs: [],
      applicable_steps: ['draft_saved'],
    })
    mockUpdate.mockResolvedValue({
      status: 'success',
      snapshot: {
        id: 12,
        revision_number: 1,
      },
    })

    renderPage()

    const publishButtons = await screen.findAllByRole('button', { name: 'Publish stage-ready asset' })
    expect(publishButtons.every((button) => !button.hasAttribute('disabled'))).toBe(true)

    fireEvent.click(publishButtons[0]!)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(12, { create_revision: true })
    })
    await waitFor(() => {
      expect(mockActivate).toHaveBeenCalledWith(12)
    })
  })

  it('shows the local machine as the host fallback when no cluster inventory is available', async () => {
    mockGet.mockResolvedValue({
      id: 12,
      name: 'Arena Main',
      revision_number: 9,
      input_device: 'Stage input',
      output_device: 'Main out',
      channels: [
        { id: 11, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, chain_id: 201 },
        { id: 12, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, chain_id: 202 },
      ],
      chains: [
        { id: 201, name: 'Chain A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Chain B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      paths: [],
      controls: {
        monitoring_output_index: 0,
      },
      io_bindings: {
        input_device: 'Stage input',
        output_device: 'Main out',
        monitoring_output_index: 0,
      },
      live_state: {
        is_live: true,
        paths: [],
        display_label: 'Waiting for confirmation',
      },
      deployments: [],
    })
    mockListNodes.mockResolvedValue({
      nodes: [],
      count: 0,
    })

    renderPage()

    expect(await screen.findByText('This machine')).toBeTruthy()
    expect(screen.queryByText('No host selected')).toBeNull()
  })

  it('runs the guided engine repair action', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Start audio engine' }))

    await waitFor(() => {
      expect(mockRunPublishRepairAction).toHaveBeenCalledWith(12, 'recover_local_audio_engine')
    })
    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith('Local audio engine started', 'success')
    })
  })

  it('publishes editor-only live changes before activating the stage-ready asset', async () => {
    const snapshotDetail = {
      id: 12,
      name: 'Arena Main',
      input_device: 'Stage input',
      output_device: 'Main out',
      channels: [
        { id: 11, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, chain_id: 201 },
        { id: 12, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, chain_id: 202 },
      ],
      chains: [
        { id: 201, name: 'Chain A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Chain B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      paths: [],
      controls: {
        monitoring_output_index: 0,
      },
      io_bindings: {
        input_device: 'Stage input',
        output_device: 'Main out',
        monitoring_output_index: 0,
      },
      live_state: {
        is_live: true,
        paths: [],
        display_label: 'Waiting for confirmation',
      },
      deployments: [
        {
          id: 1,
          snapshot_id: 12,
          primary_node_id: 'node-local',
          standby_node_ids: [],
          deployment_status: 'active',
          assignment_strategy: 'manual',
          redundancy_enabled: false,
          history: [],
        },
      ],
    }
    const snapshotDraft = mockActualSnapshotsModule.snapshotDetailToDraftData(snapshotDetail as never)

    window.localStorage.setItem(
      LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY,
      JSON.stringify({
        version: 1,
        drafts: {
          '12': {
            version: 1,
            snapshotId: 12,
            snapshotName: 'Arena Main',
            baseFingerprint: fingerprintSnapshotData(snapshotDraft),
            workingFingerprint: `${fingerprintSnapshotData(snapshotDraft)}:dirty`,
            draft: {
              ...snapshotDraft,
              flowSlots: snapshotDraft.flowSlots.map((slot) => ({
                ...slot,
                dryWetMix: Math.max(0, slot.dryWetMix - 10),
              })),
            },
            updatedAt: '2026-04-16T18:10:00.000Z',
          },
        },
      }),
    )

    mockGetPublishReadiness.mockResolvedValue({
      snapshot_id: 12,
      draft_revision_id: 9,
      requested_revision_id: 9,
      confirmed_revision_id: 9,
      status: 'ready',
      requirements: [],
      blockers: [],
      warnings: [],
      available_repairs: [],
      applicable_steps: [],
    })

    renderPage()

    expect(await screen.findByText('Editor live changes are pending')).toBeTruthy()
    expect(screen.getByText('Live changes are still only in the editor')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Publish stage-ready asset' }).every((button) => !button.hasAttribute('disabled'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Return to editor' })).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Publish stage-ready asset' })[0]!)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(12, expect.objectContaining({
        create_revision: true,
      }))
    })
    await waitFor(() => {
      expect(mockActivate).toHaveBeenCalledWith(12)
    })

    await waitFor(() => {
      expect(window.localStorage.getItem(LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY)).toBeNull()
    })
  })

  it('saves editor-only live changes before moving the live host', async () => {
    const snapshotDetail = {
      id: 12,
      name: 'Arena Main',
      input_device: 'Stage input',
      output_device: 'Main out',
      channels: [
        { id: 11, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, chain_id: 201 },
        { id: 12, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, chain_id: 202 },
      ],
      chains: [
        { id: 201, name: 'Chain A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Chain B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      paths: [],
      controls: {
        monitoring_output_index: 0,
      },
      io_bindings: {
        input_device: 'Stage input',
        output_device: 'Main out',
        monitoring_output_index: 0,
      },
      live_state: {
        is_live: true,
        paths: [],
        display_label: 'Waiting for confirmation',
      },
      deployments: [
        {
          id: 1,
          snapshot_id: 12,
          primary_node_id: 'node-local',
          standby_node_ids: [],
          deployment_status: 'active',
          assignment_strategy: 'manual',
          redundancy_enabled: false,
          history: [],
        },
      ],
    }
    const snapshotDraft = mockActualSnapshotsModule.snapshotDetailToDraftData(snapshotDetail as never)

    window.localStorage.setItem(
      LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY,
      JSON.stringify({
        version: 1,
        drafts: {
          '12': {
            version: 1,
            snapshotId: 12,
            snapshotName: 'Arena Main',
            baseFingerprint: fingerprintSnapshotData(snapshotDraft),
            workingFingerprint: `${fingerprintSnapshotData(snapshotDraft)}:dirty`,
            draft: {
              ...snapshotDraft,
              flowSlots: snapshotDraft.flowSlots.map((slot) => ({
                ...slot,
                dryWetMix: Math.max(0, slot.dryWetMix - 5),
              })),
            },
            updatedAt: '2026-04-16T18:10:00.000Z',
          },
        },
      }),
    )

    renderPage()

    expect(await screen.findByText('Editor live changes are pending')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /stage-rack/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(12, expect.objectContaining({
        create_revision: true,
      }))
    })
    await waitFor(() => {
      expect(mockDeploy).toHaveBeenCalledWith(expect.objectContaining({
        snapshot_id: 12,
        node_id: 'node-b',
      }))
    })
    await waitFor(() => {
      expect(window.localStorage.getItem(LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY)).toBeNull()
    })
    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith('Editor live changes saved and live host moved to node-b', 'success')
    })
  })

  it('allows returning to the editor without prompting when live changes are pending', async () => {
    const snapshotDetail = {
      id: 12,
      name: 'Arena Main',
      input_device: 'Stage input',
      output_device: 'Main out',
      channels: [
        { id: 11, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, chain_id: 201 },
        { id: 12, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, chain_id: 202 },
      ],
      chains: [
        { id: 201, name: 'Chain A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Chain B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      paths: [],
      controls: {
        monitoring_output_index: 0,
      },
      io_bindings: {
        input_device: 'Stage input',
        output_device: 'Main out',
        monitoring_output_index: 0,
      },
      live_state: {
        is_live: true,
        paths: [],
        display_label: 'Waiting for confirmation',
      },
      deployments: [
        {
          id: 1,
          snapshot_id: 12,
          primary_node_id: 'node-local',
          standby_node_ids: [],
          deployment_status: 'active',
          assignment_strategy: 'manual',
          redundancy_enabled: false,
          history: [],
        },
      ],
    }
    const snapshotDraft = mockActualSnapshotsModule.snapshotDetailToDraftData(snapshotDetail as never)

    window.localStorage.setItem(
      LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY,
      JSON.stringify({
        version: 1,
        drafts: {
          '12': {
            version: 1,
            snapshotId: 12,
            snapshotName: 'Arena Main',
            baseFingerprint: fingerprintSnapshotData(snapshotDraft),
            workingFingerprint: `${fingerprintSnapshotData(snapshotDraft)}:dirty`,
            draft: snapshotDraft,
            updatedAt: '2026-04-16T18:10:00.000Z',
          },
        },
      }),
    )

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)

    renderPage()

    expect(await screen.findByText('Editor live changes are pending')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back to editor' }))

    expect(await screen.findByText('Editor route')).toBeTruthy()
    expect(confirmSpy).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it('blocks leaving the snapshot flow when live changes are pending unless the user confirms', async () => {
    const snapshotDetail = {
      id: 12,
      name: 'Arena Main',
      input_device: 'Stage input',
      output_device: 'Main out',
      channels: [
        { id: 11, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, chain_id: 201 },
        { id: 12, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, chain_id: 202 },
      ],
      chains: [
        { id: 201, name: 'Chain A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Chain B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      paths: [],
      controls: {
        monitoring_output_index: 0,
      },
      io_bindings: {
        input_device: 'Stage input',
        output_device: 'Main out',
        monitoring_output_index: 0,
      },
      live_state: {
        is_live: true,
        paths: [],
        display_label: 'Waiting for confirmation',
      },
      deployments: [
        {
          id: 1,
          snapshot_id: 12,
          primary_node_id: 'node-local',
          standby_node_ids: [],
          deployment_status: 'active',
          assignment_strategy: 'manual',
          redundancy_enabled: false,
          history: [],
        },
      ],
    }
    const snapshotDraft = mockActualSnapshotsModule.snapshotDetailToDraftData(snapshotDetail as never)

    window.localStorage.setItem(
      LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY,
      JSON.stringify({
        version: 1,
        drafts: {
          '12': {
            version: 1,
            snapshotId: 12,
            snapshotName: 'Arena Main',
            baseFingerprint: fingerprintSnapshotData(snapshotDraft),
            workingFingerprint: `${fingerprintSnapshotData(snapshotDraft)}:dirty`,
            draft: snapshotDraft,
            updatedAt: '2026-04-16T18:10:00.000Z',
          },
        },
      }),
    )

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)

    const { history } = renderPage()

    expect(await screen.findByText('Editor live changes are pending')).toBeTruthy()

    await act(async () => {
      history.push('/home')
    })

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Leaving this flow will discard them'))
    expect(history.location.pathname).toBe('/snapshots/12/publish')
    expect(screen.queryByText('Home route')).toBeNull()

    confirmSpy.mockRestore()
  })

  it('can discard editor-only live changes from publish', async () => {
    const snapshotDetail = {
      id: 12,
      name: 'Arena Main',
      input_device: 'Stage input',
      output_device: 'Main out',
      channels: [
        { id: 11, channel_key: 'ch_a', label: 'A', color: '#2563eb', muted: false, chain_id: 201 },
        { id: 12, channel_key: 'ch_b', label: 'B', color: '#22c55e', muted: false, chain_id: 202 },
      ],
      chains: [
        { id: 201, name: 'Chain A', plugins: [], loop_insertions: [], effects_loops: [] },
        { id: 202, name: 'Chain B', plugins: [], loop_insertions: [], effects_loops: [] },
      ],
      routing: {
        mode: 'parallel_blend',
        active_channel_key: 'ch_a',
        blend_positions: { ch_a: 100, ch_b: 100 },
        morph_position: 0.5,
        morph_source_channel_key: 'ch_a',
        morph_target_channel_key: 'ch_b',
        series_order: ['ch_a', 'ch_b'],
      },
      paths: [],
      controls: {
        monitoring_output_index: 0,
      },
      io_bindings: {
        input_device: 'Stage input',
        output_device: 'Main out',
        monitoring_output_index: 0,
      },
      live_state: {
        is_live: true,
        paths: [],
        display_label: 'Waiting for confirmation',
      },
      deployments: [
        {
          id: 1,
          snapshot_id: 12,
          primary_node_id: 'node-local',
          standby_node_ids: [],
          deployment_status: 'active',
          assignment_strategy: 'manual',
          redundancy_enabled: false,
          history: [],
        },
      ],
    }
    const snapshotDraft = mockActualSnapshotsModule.snapshotDetailToDraftData(snapshotDetail as never)

    window.localStorage.setItem(
      LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY,
      JSON.stringify({
        version: 1,
        drafts: {
          '12': {
            version: 1,
            snapshotId: 12,
            snapshotName: 'Arena Main',
            baseFingerprint: fingerprintSnapshotData(snapshotDraft),
            workingFingerprint: `${fingerprintSnapshotData(snapshotDraft)}:dirty`,
            draft: snapshotDraft,
            updatedAt: '2026-04-16T18:10:00.000Z',
          },
        },
      }),
    )

    renderPage()

    expect(await screen.findByText('Editor live changes are pending')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Discard live changes' }))

    await waitFor(() => {
      expect(window.localStorage.getItem(LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY.STORAGE_KEY)).toBeNull()
    })
    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith('Discarded the unpublished editor live changes', 'success')
    })
  })
})
