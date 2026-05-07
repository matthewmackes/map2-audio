/**
 * T2459-H3-CFG Phase 5 slice 3 — Discovery Wizard panel tests.
 */

import '@testing-library/jest-dom'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mockGetOverride = jest.fn()
const mockDeleteOverride = jest.fn()

jest.mock('../../../map2/clients/meloaudioCommander', () => ({
  __esModule: true,
  default: {
    getStatus: jest.fn(),
    getOverride: (...args: unknown[]) => mockGetOverride(...args),
    deleteOverride: (...args: unknown[]) => mockDeleteOverride(...args),
    getBundledFirmware: jest.fn(),
  },
}))

import { MeloAudioCommanderDiscoveryPanel } from './MeloAudioCommanderDiscoveryPanel'

function renderPanel(supportsDiscoveryWizard = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MeloAudioCommanderDiscoveryPanel
        supportsDiscoveryWizard={supportsDiscoveryWizard}
      />
    </QueryClientProvider>,
  )
}

const ABSENT_OVERRIDE = {
  has_override: false,
  captured_at_utc: null,
  device_serial: null,
  notes: null,
  bindings: [],
  file_path: null,
}

const POPULATED_OVERRIDE = {
  has_override: true,
  captured_at_utc: '2026-05-07T15:00:00+00:00',
  device_serial: '000000000000011',
  notes: 'HIL bench capture',
  file_path: '/home/mm/.map2/devices/meloaudio-commander-discovered.yaml',
  bindings: [
    {
      control: 'top_1',
      status: '0xB0',
      midino: 24,
      channel: 1,
      raw_value: 127,
    },
    {
      control: 'bottom_a',
      status: '0xC0',
      midino: 0,
      channel: 1,
      raw_value: null,
    },
  ],
}

beforeEach(() => {
  mockGetOverride.mockReset()
  mockDeleteOverride.mockReset()
})

describe('MeloAudioCommanderDiscoveryPanel', () => {
  test('renders empty state when no override exists', async () => {
    mockGetOverride.mockResolvedValue(ABSENT_OVERRIDE)
    renderPanel()
    expect(
      await screen.findByText(/Stock-firmware Discovery Wizard/i),
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/No bindings captured yet/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Using device-pack defaults/i)).toBeInTheDocument()
    expect(screen.queryByText(/Reset to defaults/i)).toBeNull()
  })

  test('renders captured bindings table when override is loaded', async () => {
    mockGetOverride.mockResolvedValue(POPULATED_OVERRIDE)
    renderPanel()
    expect(await screen.findByText(/Override loaded/i)).toBeInTheDocument()
    expect(await screen.findByText(/Captured bindings/i)).toBeInTheDocument()
    expect(screen.getByText('top_1')).toBeInTheDocument()
    expect(screen.getByText('bottom_a')).toBeInTheDocument()
    expect(screen.getByText('0xB0')).toBeInTheDocument()
    expect(screen.getByText('0xC0')).toBeInTheDocument()
    expect(screen.getByText('HIL bench capture')).toBeInTheDocument()
    expect(screen.getByText('2026-05-07T15:00:00+00:00')).toBeInTheDocument()
    // raw_value=127 visible; raw_value=null rendered as em-dash (only one).
    expect(screen.getByText('127')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  test('shows wizard-not-available notice when device unsupported', async () => {
    mockGetOverride.mockResolvedValue(ABSENT_OVERRIDE)
    renderPanel(false)
    expect(
      await screen.findByText(/Discovery Wizard not available/i),
    ).toBeInTheDocument()
  })

  test('Reset to defaults opens modal and submits DELETE', async () => {
    mockGetOverride.mockResolvedValue(POPULATED_OVERRIDE)
    mockDeleteOverride.mockResolvedValue(undefined)
    renderPanel()
    const resetButton = await screen.findByRole('button', {
      name: /Reset to defaults/i,
    })
    fireEvent.click(resetButton)
    // Modal opens.
    expect(
      await screen.findByText(/This deletes the per-installation override/i),
    ).toBeInTheDocument()
    // Click confirm — the modal's primary danger button.
    const confirmButton = document.querySelector(
      '.cds--modal-footer .cds--btn--danger',
    ) as HTMLButtonElement
    expect(confirmButton).not.toBeNull()
    fireEvent.click(confirmButton)
    await waitFor(() => {
      expect(mockDeleteOverride).toHaveBeenCalledTimes(1)
    })
  })

  test('renders error notification when override endpoint errors', async () => {
    mockGetOverride.mockRejectedValue(new Error('boom'))
    renderPanel()
    expect(
      await screen.findByText(/Could not load override/i),
    ).toBeInTheDocument()
  })

  test('always shows the slice-3-deferred notice', async () => {
    mockGetOverride.mockResolvedValue(ABSENT_OVERRIDE)
    renderPanel()
    expect(
      await screen.findByText(/Interactive wizard ships in the next backend slice/i),
    ).toBeInTheDocument()
  })
})
