import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LCDHardwareView } from './LCDHardwareView'

const mockGetStatus = jest.fn()
const mockGetDriverHealth = jest.fn()
const mockReconnect = jest.fn()
const mockWriteNative = jest.fn()
const mockScanI2C = jest.fn()

jest.mock('../../../../../map2/lcd', () => ({
  lcdApi: {
    getStatus: (...a: unknown[]) => mockGetStatus(...a),
    getDriverHealth: (...a: unknown[]) => mockGetDriverHealth(...a),
    reconnectDriver: (...a: unknown[]) => mockReconnect(...a),
    writeNative: (...a: unknown[]) => mockWriteNative(...a),
    scanI2C: (...a: unknown[]) => mockScanI2C(...a),
    scanFT232H: jest.fn().mockResolvedValue({ status: { connected: false, url: '', frequency: 0 }, devices: [], lcd_count: 0 }),
    writeFT232H: jest.fn(),
    testFT232H: jest.fn(),
    testDisplay: jest.fn(),
    toggleBacklight: jest.fn(),
    resetDisplay: jest.fn(),
  },
}))

jest.mock('../../../Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

jest.mock('../LCDView', () => ({
  HardwareControls: () => <div data-testid="hardware-controls">hw-controls</div>,
  FT232HConfig: () => <div data-testid="ft232h-config">ft232h-config</div>,
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LCDHardwareView (T2430-F)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetStatus.mockResolvedValue({
      running: true,
      simulation_mode: true,
      current_page: 'status',
      uptime_seconds: 125,
      hardware: null,
      statistics: { updates: 10, page_changes: 2, errors: 0, input_events: 5, start_time: null },
    })
    mockGetDriverHealth.mockResolvedValue({
      drivers: [
        { lcd_id: 0, driver_class: 'MockLCDDisplay', connected: true, adapter: 'native-i2c',
          address: 0x27, backlight_level: 100, last_write_ago_s: 0.5, write_error_count: 0, is_mock: true },
        { lcd_id: 1, driver_class: 'FT232HLCDDisplay', connected: true, adapter: 'ft232h',
          address: 0x3F, backlight_level: 100, last_write_ago_s: 1.2, write_error_count: 2, is_mock: false },
      ],
    })
    mockReconnect.mockResolvedValue({ success: true, lcd_id: 0 })
    mockWriteNative.mockResolvedValue({ success: true, lines: ['x', '', '', ''] })
  })

  it('renders driver health panel with per-driver rows', async () => {
    wrap(<LCDHardwareView />)
    await screen.findByText('LCD 1')
    expect(screen.getByText('LCD 2')).toBeInTheDocument()
    // native-i2c and ft232h may appear multiple times (Tag + driver_class text).
    expect(screen.getAllByText(/native-i2c/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/ft232h/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/errors: 2/)).toBeInTheDocument()
  })

  it('shows MOCK tag for mock drivers, CONNECTED for real', async () => {
    wrap(<LCDHardwareView />)
    await screen.findByText('LCD 1')
    expect(screen.getByText('MOCK')).toBeInTheDocument()
    expect(screen.getByText('CONNECTED')).toBeInTheDocument()
  })

  it('reconnect button calls reconnectDriver with the lcd_id', async () => {
    wrap(<LCDHardwareView />)
    await screen.findByText('LCD 1')
    const reconnectBtns = screen.getAllByRole('button', { name: /Reconnect/i })
    expect(reconnectBtns).toHaveLength(2)
    fireEvent.click(reconnectBtns[0])
    // First click targets lcd_id=0.
    await new Promise((r) => setTimeout(r, 20))
    expect(mockReconnect.mock.calls[0][0]).toBe(0)
  })

  it('native raw write sends all 4 lines', async () => {
    wrap(<LCDHardwareView />)
    await screen.findByText('Native I²C raw write (debug)')

    const inputs = screen.getAllByPlaceholderText(/Line \d+/)
    fireEvent.change(inputs[0], { target: { value: 'HELLO' } })
    fireEvent.change(inputs[1], { target: { value: 'WORLD' } })

    const sendBtn = screen.getByRole('button', { name: /Send raw write/i })
    fireEvent.click(sendBtn)

    await new Promise((r) => setTimeout(r, 20))
    // TanStack Query passes a mutation context as the second arg; check the
    // first positional argument only.
    expect(mockWriteNative.mock.calls[0][0]).toEqual({
      line1: 'HELLO', line2: 'WORLD', line3: '', line4: '',
    })
  })

  it('renders HardwareControls and FT232HConfig sections', async () => {
    wrap(<LCDHardwareView />)
    expect(await screen.findByTestId('hardware-controls')).toBeInTheDocument()
    expect(screen.getByTestId('ft232h-config')).toBeInTheDocument()
  })
})
