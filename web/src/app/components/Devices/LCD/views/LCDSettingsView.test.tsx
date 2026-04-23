import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LCDSettingsView } from './LCDSettingsView'

const mockGetConfig = jest.fn()
const mockUpdateConfig = jest.fn()

jest.mock('../../../../../map2/lcd', () => ({
  lcdApi: {
    getDisplaysConfig: (...a: unknown[]) => mockGetConfig(...a),
    updateDisplaysConfig: (...a: unknown[]) => mockUpdateConfig(...a),
  },
  LCD_SNAPSHOT_AWARE_FIELDS: [
    'default_page',
    'auto_cycle_enabled',
    'auto_cycle_interval_s',
    'alert_sound',
    'idle_dim_timeout_s',
  ],
}))

jest.mock('../../../Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const defaultDisplay = (id: number, address: number) => ({
  id,
  address,
  enabled: true,
  adapter: 'native-i2c',
  brightness: 200,
  contrast: 40,
  auto_scroll: true,
  scroll_delay_ms: 300,
  alert_sound: true,
  alert_sound_freq_hz: 1000,
  alert_sound_duration_ms: 100,
  idle_dim_timeout_s: 300,
  idle_dim_brightness: 50,
  auto_cycle_enabled: false,
  auto_cycle_interval_s: 30,
  default_page: 'status',
})

describe('LCDSettingsView (T2430-G)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetConfig.mockResolvedValue({
      displays: [defaultDisplay(0, 0x27), defaultDisplay(1, 0x3F)],
    })
    mockUpdateConfig.mockResolvedValue({ success: true, displays: [] })
  })

  it('renders two DisplayEditorCards with per-LCD headings', async () => {
    wrap(<LCDSettingsView />)
    await screen.findByText('LCD 1')
    expect(screen.getByText('LCD 2')).toBeInTheDocument()
  })

  it('Save button is disabled when draft is clean', async () => {
    wrap(<LCDSettingsView />)
    await screen.findByText('LCD 1')
    const saveBtn = screen.getByRole('button', { name: /Save/i })
    expect(saveBtn).toBeDisabled()
  })

  it('editing brightness marks draft dirty + enables Save', async () => {
    wrap(<LCDSettingsView />)
    await screen.findByText('LCD 1')

    const brightnessInputs = screen.getAllByDisplayValue('200') // two LCDs at brightness=200
    fireEvent.change(brightnessInputs[0], { target: { value: '128' } })

    expect(await screen.findByText(/Unsaved changes/i)).toBeInTheDocument()
    const saveBtn = screen.getByRole('button', { name: /Save/i })
    expect(saveBtn).not.toBeDisabled()
  })

  it('Save sends full draft to updateDisplaysConfig', async () => {
    wrap(<LCDSettingsView />)
    await screen.findByText('LCD 1')

    const brightnessInputs = screen.getAllByDisplayValue('200')
    fireEvent.change(brightnessInputs[0], { target: { value: '150' } })

    const saveBtn = await screen.findByRole('button', { name: /Save/i })
    fireEvent.click(saveBtn)

    await new Promise((r) => setTimeout(r, 20))
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1)
    const [draft] = mockUpdateConfig.mock.calls[0]
    expect(draft[0].brightness).toBe(150)
    expect(draft[1].brightness).toBe(200)
  })

  it('snapshot-aware fields render with the snapshot-aware Tag', async () => {
    wrap(<LCDSettingsView />)
    await screen.findByText('LCD 1')
    // 5 snapshot-aware fields × 2 LCDs = 10 tags, + 1 reference in the
    // descriptive paragraph at the top of the page = 11 total matches.
    const tags = screen.getAllByText(/snapshot-aware/i)
    expect(tags.length).toBe(11)
  })

  it('address field parses hex strings', async () => {
    wrap(<LCDSettingsView />)
    await screen.findByText('LCD 1')
    const addressInputs = screen.getAllByDisplayValue(/^0x(27|3F)$/)
    expect(addressInputs).toHaveLength(2)

    fireEvent.change(addressInputs[0], { target: { value: '0x20' } })
    expect(await screen.findByText(/Unsaved changes/i)).toBeInTheDocument()
  })
})
