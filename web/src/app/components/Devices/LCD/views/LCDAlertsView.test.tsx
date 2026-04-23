import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LCDAlertsView } from './LCDAlertsView'

const mockGetAlertConfig = jest.fn()
const mockGetActiveAlerts = jest.fn()
const mockUpdateAlertConfig = jest.fn()

jest.mock('../../../../../map2/lcd', () => ({
  lcdApi: {
    getAlertConfig: (...a: unknown[]) => mockGetAlertConfig(...a),
    getActiveAlerts: (...a: unknown[]) => mockGetActiveAlerts(...a),
    updateAlertConfig: (...a: unknown[]) => mockUpdateAlertConfig(...a),
  },
}))

jest.mock('../../../Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

jest.mock('../LCDView', () => ({
  AlertRouterConfig: ({ config }: { config: unknown }) => (
    <div data-testid="alert-router-config">{config ? 'config-present' : 'config-null'}</div>
  ),
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LCDAlertsView (T2430-E)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders AlertRouterConfig with loaded config', async () => {
    mockGetAlertConfig.mockResolvedValue({ routing: { XRUN: { enabled: true } }, pages: {} })
    mockGetActiveAlerts.mockResolvedValue({ queue_length: 0, alerts: [] })
    wrap(<LCDAlertsView />)
    expect(await screen.findByText('config-present')).toBeInTheDocument()
  })

  it('hides Active Alerts panel when queue is empty', async () => {
    mockGetAlertConfig.mockResolvedValue({ routing: {}, pages: {} })
    mockGetActiveAlerts.mockResolvedValue({ queue_length: 0, alerts: [] })
    wrap(<LCDAlertsView />)
    await screen.findByTestId('alert-router-config')
    expect(screen.queryByText(/Active Alerts/)).not.toBeInTheDocument()
  })

  it('shows Active Alerts panel with queued items', async () => {
    mockGetAlertConfig.mockResolvedValue({ routing: {}, pages: {} })
    mockGetActiveAlerts.mockResolvedValue({
      queue_length: 2,
      alerts: [
        { alert_type: 'XRUN', message: 'xrun detected', target_lcd: 0 },
        { alert_type: 'CPU_HIGH', message: '85% load', target_lcd: -1 },
      ],
    })
    wrap(<LCDAlertsView />)
    expect(await screen.findByText(/Active Alerts \(2\)/)).toBeInTheDocument()
    expect(screen.getByText('XRUN')).toBeInTheDocument()
    expect(screen.getByText('CPU_HIGH')).toBeInTheDocument()
    expect(screen.getByText(/LCD Both/)).toBeInTheDocument()
  })
})
