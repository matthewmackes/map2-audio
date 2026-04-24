import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { ToastProvider } from '../components/Toasts'
import { McuPage } from './McuPage'

jest.mock('../../map2/clients/mcu', () => ({
  __esModule: true,
  default: {
    getStatus: jest.fn(),
    getProjection: jest.fn(),
    dispatchEvent: jest.fn(),
  },
}))

const mcuApi = jest.requireMock('../../map2/clients/mcu').default as {
  getStatus: jest.Mock
  getProjection: jest.Mock
  dispatchEvent: jest.Mock
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ToastProvider>
          <McuPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('McuPage', () => {
  beforeEach(() => {
    mcuApi.getStatus.mockResolvedValue({
      status: 'ok',
      state: {
        connected: true,
        matched_ports: [{ port_id: 'mcu-in', name: 'Mackie MCU Pro', direction: 'duplex' }],
        matched_port_count: 1,
        identity: { version: '1.2.3.4' },
        recent_event_count: 4,
        last_event: { status: 'completed' },
        daemon_status: {
          enabled: true,
          state: 'connected',
          available: true,
          poll_interval_s: 2,
          last_checked_at: '2026-04-09T22:30:00Z',
          last_seen_at: '2026-04-09T22:30:00Z',
          last_repush_at: '2026-04-09T22:29:59Z',
          last_error: null,
          reconnect_count: 1,
          matched_port_count: 1,
          last_destination_ports: ['mcu-out'],
          last_transport_owner: 'midi_recorder',
          notification: {
            severity: 'info',
            title: 'MCU surface state restored',
            subtitle: 'Parametric EQ restored to 1 destination.',
            emitted_at: '2026-04-09T22:30:00Z',
          },
        },
      },
    })

    mcuApi.getProjection.mockResolvedValue({
      status: 'ok',
      projection: {
        selected_plugin: {
          block_id: 'path-a:0',
          plugin_name: 'Parametric EQ',
          plugin_uri: 'urn:test:eq',
          bank_group: 'eq',
        },
        bank_index: 0,
        bank_count: 2,
        focused_strip_index: 1,
        banks: [
          { bank_index: 0, page_index: 0, page_count: 2, group_id: 'eq', group_label: 'EQ', title: 'EQ 1/2', parameters: [{ symbol: 'band0_freq' }] },
          { bank_index: 1, page_index: 1, page_count: 2, group_id: 'eq', group_label: 'EQ', title: 'EQ 2/2', parameters: [{ symbol: 'band2_freq' }] },
        ],
        active_bank: { bank_index: 0, page_index: 0, page_count: 2, group_id: 'eq', group_label: 'EQ', title: 'EQ 1/2', parameters: [{ symbol: 'band0_freq' }] },
        scribble_labels: ['Freq', 'Gain', 'Q', 'Freq2'],
        channel_strips: [
          { slot_index: 0, assigned: true, scribble_label: 'Freq', value: 120, normalized_value: 0.45, focused: false },
          { slot_index: 1, assigned: true, scribble_label: 'Gain', value: 3, normalized_value: 0.62, focused: true },
          { slot_index: 2, assigned: false, scribble_label: '', normalized_value: 0 },
          { slot_index: 3, assigned: false, scribble_label: '', normalized_value: 0 },
          { slot_index: 4, assigned: false, scribble_label: '', normalized_value: 0 },
          { slot_index: 5, assigned: false, scribble_label: '', normalized_value: 0 },
          { slot_index: 6, assigned: false, scribble_label: '', normalized_value: 0 },
          { slot_index: 7, assigned: false, scribble_label: '', normalized_value: 0 },
        ],
      },
      transport: {
        active_owner: 'midi_recorder',
        owners: [],
      },
    })

    mcuApi.dispatchEvent.mockResolvedValue({
      status: 'ok',
      result: {
        status: 'completed',
      },
    })
  })

  it('renders MCU status, projection, scribble preview, faders, and transport state', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Parametric EQ' })).toBeTruthy()
    expect(screen.getByTestId('mcu-connection-panel')).toBeTruthy()
    expect(screen.getByTestId('mcu-plugin-panel')).toBeTruthy()
    expect(screen.getByTestId('mcu-scribble-panel')).toBeTruthy()
    expect(screen.getByTestId('mcu-faders-panel')).toBeTruthy()
    expect(screen.getByTestId('mcu-transport-panel')).toBeTruthy()
    expect(screen.getAllByText('Mackie MCU Pro').length).toBeGreaterThan(0)
    expect(screen.getAllByText('EQ 1/2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('midi recorder').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MCU surface state restored').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Parametric EQ restored to 1 destination.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Freq').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Gain').length).toBeGreaterThan(0)
  })

  it('dispatches bank navigation events from the page browser', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Parametric EQ' })).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: 'Next Bank' }))

    await waitFor(() => {
      expect(mcuApi.dispatchEvent).toHaveBeenCalledWith({ event_type: 'button', pressed: true, note: 0x2F })
    })
  })
})
