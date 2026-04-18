import { fireEvent, render, screen } from '@testing-library/react'

import { AlertNotificationsContainer, type AlertNotification } from './useAlertNotifications'

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
