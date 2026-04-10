import React from 'react'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LaunchControlPage } from './LaunchControlPage'

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({
    pushToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}))

jest.mock('../../map2/clients/launchControl', () => ({
  __esModule: true,
  default: {
    getStatus: jest.fn(),
    getProjection: jest.fn(),
    patchMapping: jest.fn(),
  },
}))

const launchControlApi = jest.requireMock('../../map2/clients/launchControl').default as {
  getStatus: jest.Mock
  getProjection: jest.Mock
  patchMapping: jest.Mock
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LaunchControlPage />
    </QueryClientProvider>,
  )
}

describe('LaunchControlPage', () => {
  beforeEach(() => {
    launchControlApi.getStatus.mockResolvedValue({
      status: 'ok',
      state: {
        connected: true,
        matched_ports: [{ port_id: 'lc-out', name: 'Launch Control XL', direction: 'duplex', variant: 'launch_control_xl' }],
        matched_port_count: 1,
        template_state_by_port: { 'lc-out': { template_index: 0 } },
        active_snapshot_mapping: { snapshot_id: 11, mapping_count: 2 },
        last_activation_push: { led_push_count: 2 },
        daemon_status: {
          enabled: true,
          state: 'connected',
          available: true,
          poll_interval_s: 2,
          last_checked_at: null,
          last_seen_at: null,
          last_repush_at: null,
          last_error: null,
          reconnect_count: 1,
          matched_port_count: 1,
          last_destination_ports: ['lc-out'],
          notification: null,
        },
        recent_event_count: 3,
        last_event: { type: 'launch_control_surface:event' },
      },
    })
    launchControlApi.getProjection.mockResolvedValue({
      status: 'ok',
      projection: {
        snapshot: { id: 11, name: 'Lead' },
        controls: [
          {
            control_id: 'knob-1',
            control_type: 'knob',
            label: 'Drive',
            assignment_summary: 'Parameter: urn:test:eq / gain',
          },
          {
            control_id: 'button-1',
            control_type: 'button',
            label: 'Lead On',
            led_override: 'green_full',
            assignment_summary: 'Bypass toggle: lead:0',
          },
        ],
        template_state_by_port: { 'lc-out': { template_index: 0 } },
        active_snapshot_mapping: { snapshot_id: 11, mapping_count: 2 },
        last_activation_push: { led_push_count: 2 },
        detected_ports: [{ port_id: 'lc-out', name: 'Launch Control XL', direction: 'duplex', variant: 'launch_control_xl' }],
      },
    })
    launchControlApi.patchMapping.mockResolvedValue({
      status: 'ok',
      projection: {
        snapshot: { id: 11, name: 'Lead' },
        controls: [],
        template_state_by_port: {},
        active_snapshot_mapping: null,
        last_activation_push: null,
        detected_ports: [],
      },
    })
  })

  it('renders the Launch Control panels and patches LED overrides', async () => {
    renderPage()

    expect(await screen.findByTestId('launch-control-connection-panel')).toBeTruthy()
    expect(screen.getByTestId('launch-control-grid-panel')).toBeTruthy()
    expect(await screen.findByTestId('launch-control-control-button-1')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('LED color'), { target: { value: 'amber_full' } })

    await waitFor(() =>
      expect(launchControlApi.patchMapping).toHaveBeenCalledWith('button-1', {
        led_override: 'amber_full',
      }),
    )
  })
})
