import React from 'react'
import '@testing-library/jest-dom'
import fs from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    <>
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
      <button
        type="button"
        onClick={() => {
          pushToast('AVB clock drift exceeded threshold.', 'warn', {
            id: 'clock-drift-warning',
            title: 'Clock drift',
            persistent: true,
            stage: {
              kind: 'warning_alert',
              severity: 'warning',
              resource: {
                kind: 'node',
                id: 'node-local',
              },
              compactLabel: 'AVB',
              replaceLiveBanner: true,
            },
          })
        }}
      >
        Trigger warning alert
      </button>
      <button
        type="button"
        onClick={() => {
          pushToast('Snapshot publish completed.', 'success', {
            id: 'publish-complete',
            title: 'Publish completed',
            stage: {
              kind: 'workflow',
              severity: 'success',
              resource: {
                kind: 'workflow',
                id: 'snapshot-publish',
              },
              compactLabel: 'Publish',
              replaceLiveBanner: true,
            },
          })
        }}
      >
        Trigger success alert
      </button>
    </>
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
    expect(screen.getByLabelText('Live snapshot chyron')).toBeInTheDocument()
    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.getByText('#12')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy snapshot identity' })).toBeInTheDocument()
    expect(screen.getByText('Master output')).toBeInTheDocument()
    expect(screen.getByLabelText('Stereo output meters')).toBeInTheDocument()
    expect(screen.getAllByText('12.5%').length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getAllByText('48k/64').length).toBeGreaterThan(0)
    })

    const warningsCard = screen.getByText('Warnings').closest('.stage-notification-card')

    expect(warningsCard).not.toBeNull()
    fireEvent.click(within(warningsCard as HTMLElement).getByRole('button', { name: 'Hide live snapshot banner' }))

    const rail = screen.getByLabelText('Notification rail')
    expect(rail).toBeInTheDocument()
    expect(within(rail).getByText('Workspace Live')).toBeInTheDocument()
    expect(within(rail).getByText('LIVE')).toBeInTheDocument()
    expect(within(rail).getByText('Arena Intro')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore live snapshot panel for Arena Intro' }))

    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.queryByLabelText('Notification rail')).not.toBeInTheDocument()
  })

  it('rotates the minimized live kyron ticker frames while collapsed', () => {
    jest.useFakeTimers()
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Hide live snapshot banner' }))

    const rail = screen.getByLabelText('Notification rail')
    expect(within(rail).getByText('Live confirmed')).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(2500)
    })

    expect(within(rail).getByText('2 channels active')).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(2500)
    })

    expect(within(rail).getByText('Program 12')).toBeInTheDocument()
    jest.useRealTimers()
  })

  it('plays the critical kyron takeover before restoring the normal alert surface', () => {
    jest.useFakeTimers()
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Trigger backend alert' }))

    const kyron = screen.getByLabelText('Stage notification kyron')
    expect(kyron).toBeInTheDocument()
    expect(within(kyron).getByText('Error')).toBeInTheDocument()
    expect(within(kyron).getByText('Backend unreachable - click to retry.')).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(4000)
    })

    expect(screen.getAllByText('Critical event active').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Backend unreachable' }))

    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.queryByText('Backend unreachable')).not.toBeInTheDocument()
    jest.useRealTimers()
  })

  it('reveals full identity metadata and copies it from the snapshot card', () => {
    renderProvider()

    expect(screen.getByText('rev-7f9')).toBeInTheDocument()
    expect(screen.getAllByText('node-local').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Copy snapshot identity' }))

    expect(screen.getByText('Copied')).toBeInTheDocument()
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

    expect(screen.getAllByText('Silence detected').length).toBeGreaterThan(0)
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

    expect(screen.getAllByText('Snapshot activation failed').length).toBeGreaterThan(0)
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

    const surface = screen.getByLabelText('Stage notification overview').closest('.stage-notification-surface')

    expect(screen.getAllByText('Clip latch x1').length).toBeGreaterThan(0)
    expect(screen.getByText('Master output has clipped during the current live run.')).toBeInTheDocument()
    expect(screen.getAllByText('Clip x1')).toHaveLength(2)
    expect(surface).toHaveClass('stage-notification-surface--success')
    expect(surface).not.toHaveClass('stage-notification-surface--critical')
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
      expect(screen.getAllByText('Audio driver lost').length).toBeGreaterThan(0)
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

    expect(screen.getAllByText('AVB sync loss').length).toBeGreaterThan(0)
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

    expect(screen.getAllByText('Activating Current rig -> Arena Intro').length).toBeGreaterThan(0)
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
    expect(screen.getByLabelText('Live KPI strap')).toBeInTheDocument()
    expect(document.querySelector('.stage-chyron__strap-scroll')).toHaveClass('stage-chyron__strap-scroll--static')
    expect(document.querySelector('.stage-mission-ticker__track')).toHaveClass('stage-mission-ticker__track--static')
    expect(document.querySelector('.stage-chyron__bug-dot')).not.toHaveClass('stage-chyron__bug-dot--pulse')
    expect(screen.getByLabelText('Stereo output meters')).toBeInTheDocument()
  })

  it('queues kyrons one by one in arrival order', () => {
    jest.useFakeTimers()
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Trigger warning alert' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trigger success alert' }))

    const firstKyron = screen.getByLabelText('Stage notification kyron')
    expect(firstKyron).toBeInTheDocument()
    expect(within(firstKyron).getByText('Warning')).toBeInTheDocument()
    expect(within(firstKyron).getByText('AVB clock drift exceeded threshold.')).toBeInTheDocument()
    expect(within(firstKyron).queryByText('Snapshot publish completed.')).not.toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(4000)
    })

    const secondKyron = screen.getByLabelText('Stage notification kyron')
    expect(secondKyron).toBeInTheDocument()
    expect(within(secondKyron).getByText('Update')).toBeInTheDocument()
    expect(within(secondKyron).getByText('Snapshot publish completed.')).toBeInTheDocument()
    jest.useRealTimers()
  })

  it('keeps the steady-state notification shell palette theme-driven', () => {
    const cssSource = fs.readFileSync(path.resolve(__dirname, 'Toasts.css'), 'utf8')
    const steadyStateBlock = cssSource.match(
      /\.stage-notification-surface--success,\s*\.stage-notification-surface--info\s*\{[\s\S]*?\n\}/
    )?.[0]

    expect(steadyStateBlock).toBeDefined()
    expect(steadyStateBlock).toContain('var(--cds-layer-01')
    expect(steadyStateBlock).toContain('var(--cds-layer-02')
    expect(steadyStateBlock).toContain('var(--cds-background')
    expect(steadyStateBlock).toContain('var(--cds-text-primary')
    expect(steadyStateBlock).toContain('var(--cds-text-secondary')
    expect(steadyStateBlock).not.toContain('var(--surface')
    expect(steadyStateBlock).not.toContain('var(--bg')
    expect(steadyStateBlock).not.toContain('#ffffff 92%')
    expect(steadyStateBlock).not.toContain('#eef4ff')
  })

  it('keeps the stage surface flush to the top edge without a dedicated toolbar strip', () => {
    const cssSource = fs.readFileSync(path.resolve(__dirname, 'Toasts.css'), 'utf8')

    expect(cssSource).not.toContain('padding-top: 2.9rem;')
    expect(cssSource).not.toContain('.stage-notification-surface__toolbar')
  })

  it('keeps the kyron lower-third edge aligned and animation driven by dedicated classes', () => {
    const cssSource = fs.readFileSync(path.resolve(__dirname, 'Toasts.css'), 'utf8')

    expect(cssSource).toContain('.stage-notification-kyron')
    expect(cssSource).toContain('left: 0;')
    expect(cssSource).toContain('right: 0;')
    expect(cssSource).toContain('.stage-notification-kyron--enter')
    expect(cssSource).toContain('.stage-notification-kyron--exit')
    expect(cssSource).toContain('@keyframes stage-notification-slide-in-left')
    expect(cssSource).toContain('@keyframes stage-notification-slide-out-right')
  })

  it('styles the minimized rail as a one-third-width broadcast kyron with marquee affordances', () => {
    const cssSource = fs.readFileSync(path.resolve(__dirname, 'Toasts.css'), 'utf8')

    expect(cssSource).toContain('.stage-notification-mini-kyron')
    expect(cssSource).toContain('inline-size: clamp(21rem, 33vw, 34rem);')
    expect(cssSource).toContain('.stage-notification-mini-kyron__bug')
    expect(cssSource).toContain('@keyframes stage-notification-mini-kyron-pulse')
    expect(cssSource).toContain('@keyframes stage-notification-mini-kyron-marquee')
    expect(cssSource).toContain('.stage-notification-mini-kyron__ticker-text[data-scroll=\'true\']')
  })
})
