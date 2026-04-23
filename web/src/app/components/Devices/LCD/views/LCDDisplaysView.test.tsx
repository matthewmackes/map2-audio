import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LCDDisplaysView } from './LCDDisplaysView'

const mockGetStatus = jest.fn()
const mockGetDualSimulation = jest.fn()

jest.mock('../../../../../map2/lcd', () => ({
  lcdApi: {
    getStatus: (...a: unknown[]) => mockGetStatus(...a),
    getDualSimulation: (...a: unknown[]) => mockGetDualSimulation(...a),
    setLCDPage: jest.fn(),
    simulateInput: jest.fn(),
    displayMessage: jest.fn(),
  },
}))

jest.mock('../../../Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

jest.mock('../LCDView', () => ({
  LCDSimulator: ({ lcdId, lines, address }: { lcdId: number; lines: string[]; address: string }) => (
    <div data-testid={`lcd-simulator-${lcdId}`}>
      <span>addr:{address}</span>
      <span>lines:{lines.join('|')}</span>
    </div>
  ),
  InputController: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="input-controller">{disabled ? 'disabled' : 'enabled'}</div>
  ),
  CustomMessageComposer: () => <div data-testid="message-composer">composer</div>,
  EventTriggers: () => <div data-testid="event-triggers">triggers</div>,
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LCDDisplaysView (T2430-B)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders two LCDSimulator instances with address + lines', async () => {
    mockGetStatus.mockResolvedValue({
      running: true, simulation_mode: true, current_page: 'status',
      uptime_seconds: 10, hardware: null,
      statistics: { updates: 0, page_changes: 0, errors: 0, input_events: 0, start_time: null },
    })
    mockGetDualSimulation.mockResolvedValue({
      lcd_1: { output: '', lines: ['HELLO 1', 'LINE 2'], address: '0x27' },
      lcd_2: { output: '', lines: ['HELLO 2', 'LINE 2'], address: '0x3F' },
    })
    wrap(<LCDDisplaysView />)
    const sim0 = await screen.findByTestId('lcd-simulator-0')
    const sim1 = await screen.findByTestId('lcd-simulator-1')
    expect(sim0.textContent).toContain('addr:0x27')
    expect(sim0.textContent).toContain('HELLO 1')
    expect(sim1.textContent).toContain('addr:0x3F')
  })

  it('InputController is enabled when isRunning=true', async () => {
    mockGetStatus.mockResolvedValue({
      running: true, simulation_mode: true, current_page: 'status',
      uptime_seconds: 10, hardware: null,
      statistics: { updates: 0, page_changes: 0, errors: 0, input_events: 0, start_time: null },
    })
    mockGetDualSimulation.mockResolvedValue({
      lcd_1: { output: '', lines: [], address: '0x27' },
      lcd_2: { output: '', lines: [], address: '0x3F' },
    })
    wrap(<LCDDisplaysView />)
    // Wait for the status query to resolve before checking the enabled state.
    await screen.findByText('enabled')
  })

  it('InputController is disabled when LCD manager is stopped', async () => {
    mockGetStatus.mockResolvedValue({
      running: false, simulation_mode: true, current_page: 'status',
      uptime_seconds: 0, hardware: null,
      statistics: { updates: 0, page_changes: 0, errors: 0, input_events: 0, start_time: null },
    })
    mockGetDualSimulation.mockResolvedValue({
      lcd_1: { output: '', lines: [], address: '0x27' },
      lcd_2: { output: '', lines: [], address: '0x3F' },
    })
    wrap(<LCDDisplaysView />)
    expect((await screen.findByTestId('input-controller')).textContent).toBe('disabled')
  })

  it('falls back to "Waiting..." lines when simulation absent', async () => {
    mockGetStatus.mockResolvedValue({
      running: false, simulation_mode: true, current_page: 'status',
      uptime_seconds: 0, hardware: null,
      statistics: { updates: 0, page_changes: 0, errors: 0, input_events: 0, start_time: null },
    })
    mockGetDualSimulation.mockResolvedValue(null)
    wrap(<LCDDisplaysView />)
    const sim0 = await screen.findByTestId('lcd-simulator-0')
    expect(sim0.textContent).toContain('LCD 1')
    expect(sim0.textContent).toContain('Waiting...')
  })
})
