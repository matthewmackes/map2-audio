import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ToastProvider, useNotifications as useAppNotifications } from '../components/Toasts'
import { AlertNotificationsContainer, type AlertNotification } from './useAlertNotifications'
import { useAlertNotifications } from './useAlertNotifications'

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
