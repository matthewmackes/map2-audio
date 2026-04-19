import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { ToastProvider, useToasts } from './Toasts'

const mockUseClusterSnapshotRuntimeLiveState = jest.fn()
const mockUseVuMeters = jest.fn()
const mockUseCPUMetrics = jest.fn()
const mockGetStatus = jest.fn()
let prefersReducedMotion = false

jest.mock('../hooks/useSnapshotRuntimeState', () => ({
  useClusterSnapshotRuntimeLiveState: (...args: unknown[]) => mockUseClusterSnapshotRuntimeLiveState(...args),
}))

jest.mock('../hooks/useVuMeters', () => ({
  useVuMeters: (...args: unknown[]) => mockUseVuMeters(...args),
}))

jest.mock('../hooks/useCPUMetrics', () => ({
  useCPUMetrics: (...args: unknown[]) => mockUseCPUMetrics(...args),
}))

jest.mock('../../map2/clients/audio', () => ({
  audioApi: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
  },
}))

function Harness() {
  const { pushToast } = useToasts()

  return (
    <button
      type="button"
      onClick={() => {
        pushToast('Backend unreachable - click to retry.', 'error', {
          id: 'backend-unreachable',
          title: 'Backend unreachable',
          persistent: true,
          stage: {
            kind: 'critical_alert',
            severity: 'critical',
            resource: {
              kind: 'backend',
              id: 'primary',
            },
            compactLabel: 'Backend',
            replaceLiveBanner: true,
          },
        })
      }}
    >
      Trigger backend alert
    </button>
  )
}

function renderProvider(initialEntries: string[] = ['/workspace/platforms/overview']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ToastProvider>
          <Harness />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ToastProvider stage notification surface', () => {
  beforeEach(() => {
    prefersReducedMotion = false
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)' ? prefersReducedMotion : false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })

    Object.defineProperty(global, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        clipboard: {
          writeText: jest.fn(),
        },
      },
    })

    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: {
        nodes: [
          {
            node_id: 'node-local',
            seq: 4,
            emitted_at: '2026-04-18T15:00:00Z',
            state: 'live',
            snapshot_id: 44,
            snapshot_revision: '7',
            snapshot_name: 'Arena Intro',
            triggered_by: 'operator',
            live_snapshot_payload: {
              program_number: 12,
              snapshot_revision: 'rev-7f9a2c1',
              paths: [
                { id: 'frontline', label: 'Frontline Input' },
                { id: 'wet-stack', label: 'Wet Stack' },
              ],
            },
            last_successful_request_id: 'req-44',
            failure_reason: null,
            runtime_metrics: {},
            warning_threshold_seconds: 30,
            offline_threshold_seconds: 60,
            age_seconds: 2,
            is_warning: false,
            is_offline: false,
            display_state: 'live',
            display_label: 'Live confirmed',
          },
        ],
      },
    })

    mockUseVuMeters.mockReturnValue({
      levels: {
        outputLeft: -6,
        outputRight: -4,
      },
      peakHold: {
        outputLeft: -3,
        outputRight: -2,
      },
      isConnected: true,
      isRunning: true,
      resetPeaks: jest.fn(),
    })

    mockUseCPUMetrics.mockReturnValue({
      metrics: {
        totalCpuPercent: 12.5,
        audioCallbackPercent: 8.2,
        peakCpuPercent: 17.4,
        averageCpuPercent: 10.1,
        xrunCount: 0,
        budgetMs: 1.33,
        currentCallbackMs: 0.44,
        headroomPercent: 87.5,
        perPluginPercent: {},
        running: true,
      },
      isConnected: true,
      isLoading: false,
      isError: false,
      status: 'ok',
      hasXruns: false,
      getPluginCpu: jest.fn(),
      getTopConsumers: jest.fn(() => []),
      warningThreshold: 70,
      criticalThreshold: 90,
    })

    mockGetStatus.mockResolvedValue({
      running: true,
      sample_rate: 48000,
      buffer_size: 64,
      cpu_load: 12.5,
      engine: 'JUCE',
      available: true,
    })
  })

  it('renders the live snapshot banner with telemetry, collapses into the rail, and restores on click', async () => {
    renderProvider()

    expect(screen.getByLabelText('Stage notification overview')).toBeInTheDocument()
    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByLabelText('Snapshot path thumbnail')).toBeInTheDocument()
    expect(screen.getByLabelText('Live snapshot pulse')).toBeInTheDocument()
    expect(screen.getByText('Master output')).toBeInTheDocument()
    expect(screen.getByLabelText('Stereo output meters')).toBeInTheDocument()
    expect(screen.getByText('12.5%')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('48k / 64')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hide live snapshot banner' }))

    expect(screen.getByLabelText('Notification rail')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Arena Intro/i }))

    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.queryByLabelText('Notification rail')).not.toBeInTheDocument()
  })

  it('replaces the live snapshot banner with a critical alert and restores it after dismissal', () => {
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Trigger backend alert' }))

    expect(screen.getByText('Critical event active')).toBeInTheDocument()
    expect(screen.getByText('Backend unreachable - click to retry.')).toBeInTheDocument()
    expect(screen.getByText('Arena Intro')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Backend unreachable' }))

    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.queryByText('Backend unreachable')).not.toBeInTheDocument()
  })

  it('reveals full identity metadata and copies it from the snapshot card', () => {
    renderProvider()

    expect(screen.getByText('Rev rev-7f9')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy full snapshot identity' }))

    expect(screen.getByText('Revision rev-7f9a2c1')).toBeInTheDocument()
    expect(screen.getByText('Node node-local')).toBeInTheDocument()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('revision=rev-7f9a2c1 node=node-local')
  })

  it('suppresses the pinned live snapshot banner on Snapshot Editor routes', () => {
    renderProvider(['/snapshot-editor'])

    expect(screen.queryByText('Arena Intro')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Notification rail')).not.toBeInTheDocument()
  })

  it('renders the idle heartbeat rail when no live snapshot or alert exists', () => {
    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: {
        nodes: [],
      },
    })

    renderProvider()

    expect(screen.getByLabelText('Node idle rail')).toBeInTheDocument()
    expect(screen.getByText('Node idle')).toBeInTheDocument()
    expect(screen.queryByLabelText('Stage notification overview')).not.toBeInTheDocument()
  })

  it('surfaces silence detection in the warnings card', () => {
    jest.useFakeTimers()
    mockUseVuMeters.mockReturnValue({
      levels: {
        outputLeft: -60,
        outputRight: -60,
      },
      peakHold: {
        outputLeft: -60,
        outputRight: -60,
      },
      isConnected: true,
      isRunning: true,
      resetPeaks: jest.fn(),
    })

    renderProvider()
    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(screen.getByText('Silence detected')).toBeInTheDocument()
    expect(screen.getByText('Output has stayed below -60 dBFS for more than three seconds while live.')).toBeInTheDocument()
    jest.useRealTimers()
  })

  it('special-cases activation failure with the shared snapshot failure descriptor', () => {
    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: {
        nodes: [
          {
            node_id: 'node-local',
            seq: 4,
            emitted_at: '2026-04-18T15:00:00Z',
            state: 'live',
            snapshot_id: 44,
            snapshot_revision: '7',
            snapshot_name: 'Arena Intro',
            triggered_by: 'operator',
            live_snapshot_payload: {
              program_number: 12,
              snapshot_revision: 'rev-7f9a2c1',
              paths: [{ id: 'frontline', label: 'Frontline Input' }],
            },
            last_successful_request_id: 'req-44',
            failure_reason: 'Engine rejected the live graph.',
            runtime_metrics: {
              activation_progress: {
                current_phase: 'APPLYING',
                status: 'failed',
                note: 'Engine rejected the live graph.',
              },
            },
            warning_threshold_seconds: 30,
            offline_threshold_seconds: 60,
            age_seconds: 2,
            is_warning: false,
            is_offline: false,
            display_state: 'live',
            display_label: 'Live confirmed',
          },
        ],
      },
    })

    renderProvider()

    expect(screen.getByText('Snapshot activation failed')).toBeInTheDocument()
    expect(screen.getByText('Arena Intro: Engine rejected the live graph.')).toBeInTheDocument()
  })

  it('shows the latched clip warning when output clips', () => {
    mockUseVuMeters.mockReturnValue({
      levels: {
        outputLeft: 0.2,
        outputRight: -0.1,
      },
      peakHold: {
        outputLeft: 0.2,
        outputRight: -0.1,
      },
      isConnected: true,
      isRunning: true,
      resetPeaks: jest.fn(),
    })
    mockUseCPUMetrics.mockReturnValue({
      metrics: {
        totalCpuPercent: 12.5,
        audioCallbackPercent: 8.2,
        peakCpuPercent: 17.4,
        averageCpuPercent: 10.1,
        xrunCount: 6,
        budgetMs: 1.33,
        currentCallbackMs: 0.44,
        headroomPercent: 87.5,
        perPluginPercent: {},
        running: true,
      },
      isConnected: true,
      isLoading: false,
      isError: false,
      status: 'warning',
      hasXruns: true,
      getPluginCpu: jest.fn(),
      getTopConsumers: jest.fn(() => []),
      warningThreshold: 70,
      criticalThreshold: 90,
    })

    renderProvider()

    expect(screen.getByText('Clip latch x1')).toBeInTheDocument()
    expect(screen.getByText('Master output has clipped during the current live run.')).toBeInTheDocument()
    expect(screen.getAllByText('Clip x1')).toHaveLength(2)
  })

  it('escalates audio driver loss into a critical warning card', async () => {
    mockGetStatus.mockResolvedValue({
      running: false,
      sample_rate: 48000,
      buffer_size: 64,
      cpu_load: 12.5,
      engine: 'JUCE',
      available: false,
      audio_device: 'HoTone Jogg',
      error: 'USB audio interface disconnected.',
    })

    renderProvider()

    await waitFor(() => {
      expect(screen.getByText('Audio driver lost')).toBeInTheDocument()
    })
    expect(screen.getByText('USB audio interface disconnected.')).toBeInTheDocument()
  })

  it('classifies AVB sync warnings explicitly in the warnings card', () => {
    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: {
        nodes: [
          {
            node_id: 'node-local',
            seq: 4,
            emitted_at: '2026-04-18T15:00:00Z',
            state: 'live',
            snapshot_id: 44,
            snapshot_revision: '7',
            snapshot_name: 'Arena Intro',
            triggered_by: 'operator',
            live_snapshot_payload: {
              program_number: 12,
              snapshot_revision: 'rev-7f9a2c1',
              paths: [{ id: 'frontline', label: 'Frontline Input' }],
            },
            last_successful_request_id: 'req-44',
            failure_reason: null,
            runtime_metrics: {
              warnings: [
                {
                  code: 'avb_clock_drift',
                  severity: 'warning',
                  operator_message: 'PTP drift exceeded the stable threshold.',
                },
              ],
            },
            warning_threshold_seconds: 30,
            offline_threshold_seconds: 60,
            age_seconds: 2,
            is_warning: false,
            is_offline: false,
            display_state: 'live',
            display_label: 'Live confirmed',
          },
        ],
      },
    })

    renderProvider()

    expect(screen.getByText('AVB sync loss')).toBeInTheDocument()
    expect(screen.getByText('PTP drift exceeded the stable threshold.')).toBeInTheDocument()
  })

  it('replaces the snapshot card with a cluster summary when multiple nodes are live', () => {
    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: {
        nodes: [
          {
            node_id: 'node-local',
            seq: 4,
            emitted_at: '2026-04-18T15:00:00Z',
            state: 'live',
            snapshot_id: 44,
            snapshot_revision: '7',
            snapshot_name: 'Arena Intro',
            triggered_by: 'operator',
            live_snapshot_payload: {
              program_number: 12,
              snapshot_revision: 'rev-7f9a2c1',
              paths: [{ id: 'frontline', label: 'Frontline Input' }],
            },
            last_successful_request_id: 'req-44',
            failure_reason: null,
            runtime_metrics: {},
            warning_threshold_seconds: 30,
            offline_threshold_seconds: 60,
            age_seconds: 2,
            is_warning: false,
            is_offline: false,
            display_state: 'live',
            display_label: 'Live confirmed',
          },
          {
            node_id: 'node-remote',
            seq: 3,
            emitted_at: '2026-04-18T15:00:01Z',
            state: 'live',
            snapshot_id: 45,
            snapshot_revision: '8',
            snapshot_name: 'Verse Lift',
            triggered_by: 'operator',
            live_snapshot_payload: {
              program_number: 13,
              snapshot_revision: 'rev-1234567',
              paths: [{ id: 'wet-stack', label: 'Wet Stack' }],
            },
            last_successful_request_id: 'req-45',
            failure_reason: null,
            runtime_metrics: {},
            warning_threshold_seconds: 30,
            offline_threshold_seconds: 60,
            age_seconds: 1,
            is_warning: false,
            is_offline: false,
            display_state: 'live',
            display_label: 'Live confirmed',
          },
        ],
      },
    })

    renderProvider()

    expect(screen.getByText('2 nodes live')).toBeInTheDocument()
    expect(screen.getByText('node-local: Arena Intro')).toBeInTheDocument()
    expect(screen.getByText('node-remote: Verse Lift')).toBeInTheDocument()
  })

  it('shows the disconnected takeover banner when audio status polling fails', async () => {
    mockGetStatus.mockRejectedValueOnce(new Error('offline'))

    renderProvider()

    await waitFor(() => {
      expect(screen.getByText('DISCONNECTED')).toBeInTheDocument()
    })
  })

  it('shows activation progress and collapses on Escape', async () => {
    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: {
        nodes: [
          {
            node_id: 'node-local',
            seq: 4,
            emitted_at: '2026-04-18T15:00:00Z',
            state: 'live',
            snapshot_id: 44,
            snapshot_revision: '7',
            snapshot_name: 'Arena Intro',
            triggered_by: 'operator',
            live_snapshot_payload: {
              program_number: 12,
              snapshot_revision: 'rev-7f9a2c1',
              paths: [{ id: 'frontline', label: 'Frontline Input' }],
            },
            last_successful_request_id: 'req-44',
            failure_reason: null,
            runtime_metrics: {
              activation_progress: {
                current_phase: 'APPLYING',
                status: 'in_progress',
                note: 'Applying engine state.',
                current_snapshot_name: 'Current rig',
                target_snapshot_name: 'Arena Intro',
              },
            },
            warning_threshold_seconds: 30,
            offline_threshold_seconds: 60,
            age_seconds: 2,
            is_warning: false,
            is_offline: false,
            display_state: 'live',
            display_label: 'Live confirmed',
          },
        ],
      },
    })

    renderProvider()

    expect(screen.getByText('Activating Current rig -> Arena Intro')).toBeInTheDocument()
    expect(screen.getByLabelText('Activation progress')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.getByLabelText('Notification rail')).toBeInTheDocument()
    })
  })

  it('marks the surface and sparklines for reduced motion while keeping the meters rendered', async () => {
    prefersReducedMotion = true

    renderProvider()

    const overview = await screen.findByLabelText('Stage notification overview')
    expect(overview.closest('.stage-notification-surface')).toHaveAttribute('data-reduced-motion', 'true')
    expect(screen.getByLabelText('CPU history')).toHaveAttribute('data-reduced-motion', 'true')
    expect(screen.getByLabelText('XRun history')).toHaveAttribute('data-reduced-motion', 'true')
    expect(screen.getByLabelText('Live snapshot pulse')).toHaveAttribute('data-reduced-motion', 'true')
    expect(screen.getByLabelText('Stereo output meters')).toBeInTheDocument()
  })
})
