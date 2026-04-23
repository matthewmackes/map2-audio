import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LCDPresetsView } from './LCDPresetsView'

const mockGetPresets = jest.fn()
const mockSavePreset = jest.fn()
const mockApplyPreset = jest.fn()
const mockDeletePreset = jest.fn()

jest.mock('../../../../../map2/lcd', () => ({
  lcdApi: {
    getPresets: (...args: unknown[]) => mockGetPresets(...args),
    savePreset: (...args: unknown[]) => mockSavePreset(...args),
    applyPreset: (...args: unknown[]) => mockApplyPreset(...args),
    deletePreset: (...args: unknown[]) => mockDeletePreset(...args),
    renamePreset: jest.fn(),
    duplicatePreset: jest.fn(),
  },
}))

jest.mock('../../../Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LCDPresetsView (T2430-H)', () => {
  beforeEach(() => {
    mockGetPresets.mockResolvedValue({
      presets: [
        { name: 'factory-default', description: 'Factory', created_at: null, builtin: true, config: {} },
        { name: 'performing', description: 'Performing', created_at: null, builtin: true, config: {} },
        { name: 'my-custom', description: 'Mine', created_at: '2026-04-23', builtin: false, config: {} },
      ],
    })
  })

  it('renders built-in and user preset sections', async () => {
    wrap(<LCDPresetsView />)
    expect(await screen.findByText('factory-default')).toBeInTheDocument()
    expect(screen.getByText('performing')).toBeInTheDocument()
    expect(screen.getByText('my-custom')).toBeInTheDocument()
    expect(screen.getAllByText(/built-in/i).length).toBeGreaterThanOrEqual(2)
  })

  it('Apply button calls applyPreset for any preset card', async () => {
    mockApplyPreset.mockResolvedValue({ success: true, name: 'factory-default', applied_displays: 2 })
    wrap(<LCDPresetsView />)
    await screen.findByText('factory-default')

    const applyButtons = screen.getAllByRole('button', { name: /Apply/i })
    expect(applyButtons.length).toBeGreaterThanOrEqual(3) // 2 built-ins + 1 user
    fireEvent.click(applyButtons[0])
    await waitFor(() => expect(mockApplyPreset).toHaveBeenCalled())
    // First applyButton corresponds to factory-default (first built-in rendered).
    // React Query may wrap mutation args; check the first positional arg.
    expect(mockApplyPreset.mock.calls[0][0]).toBe('factory-default')
  })

  it('built-in presets do not render Delete buttons', async () => {
    wrap(<LCDPresetsView />)
    await screen.findByText('factory-default')
    const deleteButtons = screen.queryAllByRole('button', { name: /^Delete$/i })
    // Delete button only appears for user presets (my-custom).
    expect(deleteButtons.length).toBe(1)
  })

  it('save button is disabled without a name', async () => {
    wrap(<LCDPresetsView />)
    await screen.findByText('factory-default')
    const saveBtn = screen.getByRole('button', { name: /^Save$/i })
    expect(saveBtn).toBeDisabled()
  })
})
