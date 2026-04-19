import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ToastProvider, useNotifications as useAppNotifications } from '../components/Toasts'
import { AlertNotificationsContainer, type AlertNotification } from './useAlertNotifications'
import { useAlertNotifications } from './useAlertNotifications'

const mockUseClusterSnapshotRuntimeLiveState = jest.fn()
const mockUseVuMeters = jest.fn()
const mockUseCPUMetrics = jest.fn()
const mockGetStatus = jest.fn()

jest.mock('./useSnapshotRuntimeState', () => ({
  useClusterSnapshotRuntimeLiveState: (...args: unknown[]) => mockUseClusterSnapshotRuntimeLiveState(...args),
}))

jest.mock('./useVuMeters', () => ({
  useVuMeters: (...args: unknown[]) => mockUseVuMeters(...args),
}))

jest.mock('./useCPUMetrics', () => ({
  useCPUMetrics: (...args: unknown[]) => mockUseCPUMetrics(...args),
}))

jest.mock('../../map2/clients/audio', () => ({
  audioApi: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
  },
}))

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <ToastProvider>{children}</ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('AlertNotificationsContainer', () => {
  beforeEach(() => {
    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: {
        nodes: [],
      },
    })
    mockUseVuMeters.mockReturnValue({
      levels: {
        outputLeft: -12,
        outputRight: -12,
      },
      peakHold: {
        outputLeft: -9,
        outputRight: -9,
      },
      isConnected: true,
      isRunning: false,
      resetPeaks: jest.fn(),
    })
    mockUseCPUMetrics.mockReturnValue({
      metrics: {
        totalCpuPercent: 0,
        audioCallbackPercent: 0,
        peakCpuPercent: 0,
        averageCpuPercent: 0,
        xrunCount: 0,
        budgetMs: 0,
        currentCallbackMs: 0,
        headroomPercent: 100,
        perPluginPercent: {},
        running: false,
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
      running: false,
      sample_rate: 48000,
      buffer_size: 64,
      cpu_load: 0,
      engine: 'JUCE',
      available: true,
    })
  })

  it('renders notifications without MUI wrappers and allows dismiss', () => {
    const onDismiss = jest.fn()
    const notifications: AlertNotification[] = [
      {
        id: 'alert-1',
        type: 'cpu',
        severity: 'critical',
        title: 'CPU Usage Alert',
        message: 'CPU usage at 98% (threshold: 80%)',
        timestamp: Date.now(),
      },
    ]

    const { container } = render(
      <AlertNotificationsContainer notifications={notifications} onDismiss={onDismiss} />
    )

    expect(screen.getByRole('alert').textContent).toContain('CPU Usage Alert')
    expect(container.querySelector('.MuiPaper-root')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss CPU Usage Alert' }))
    expect(onDismiss).toHaveBeenCalledWith('alert-1')
  })
})

describe('useAlertNotifications', () => {
  it('routes alert toasts through the shared notification provider with a stable id', () => {
    const wrapper = makeWrapper()
    const { result } = renderHook(() => ({
      alertNotifications: useAlertNotifications(),
      appNotifications: useAppNotifications(),
    }), { wrapper })

    let firstId = ''
    let secondId = ''
    act(() => {
      firstId = result.current.alertNotifications.showToastNotification('cpu', 'critical', 98, 80)
      secondId = result.current.alertNotifications.showToastNotification('cpu', 'critical', 99, 80)
    })

    expect(firstId).toBe('system-alert:cpu')
    expect(secondId).toBe('system-alert:cpu')
    expect(result.current.alertNotifications.notifications).toHaveLength(1)
    expect(result.current.appNotifications.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'system-alert:cpu',
          title: 'CPU Usage Alert',
          tone: 'error',
        }),
      ]),
    )
  })
})
