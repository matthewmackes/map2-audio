import React from 'react'
import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { MidiCommanderPage } from './MidiCommanderPage'

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({
    pushToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}))

jest.mock('../../map2/clients/midiCommander', () => ({
  __esModule: true,
  default: {
    getStatus: jest.fn(),
    getProjection: jest.fn(),
    patchMapping: jest.fn(),
  },
}))

const midiCommanderApi = jest.requireMock('../../map2/clients/midiCommander').default as {
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
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <MidiCommanderPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('MidiCommanderPage', () => {
  beforeEach(() => {
    midiCommanderApi.getStatus.mockResolvedValue({
      status: 'ok',
      state: {
        connected: true,
        matched_ports: [{ port_id: 'mc-in', name: 'MIDI Commander', direction: 'duplex', variant: 'midi_commander' }],
        matched_port_count: 1,
        active_snapshot_mapping: {
          snapshot_id: 11,
          mapping_count: 12,
          manual_setup: { supported: false, transport: 'manual_setup', lines: ['line 1', 'line 2'] },
        },
        last_activation_push: { configuration_transport: 'manual_setup' },
        active_profile: { name: 'MeloAudio MIDI Commander' },
        current_bank: 0,
        expression_calibrations: { EXP1: { min_raw: 0 } },
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
          notification: null,
        },
        recent_event_count: 1,
        last_event: { type: 'midi_commander_surface:event' },
      },
    })
    midiCommanderApi.getProjection.mockResolvedValue({
      status: 'ok',
      projection: {
        snapshot: { id: 11, name: 'Lead' },
        controls: [
          {
            control_id: '1',
            control_type: 'button',
            label: 'Switch 1',
            message_type: 'control_change',
            assignment: { kind: 'transport', transport_action: 'play' },
            assignment_summary: 'Transport: play',
          },
          {
            control_id: 'EXP1',
            control_type: 'expression',
            label: 'EXP1',
            message_type: 'control_change',
            assignment: { kind: 'expression_target', param_id: 'gain' },
            assignment_summary: 'Parameter: plugin / gain',
          },
        ],
        active_snapshot_mapping: {
          snapshot_id: 11,
          snapshot_name: 'Lead',
          mapping_count: 12,
          manual_setup: { supported: false, transport: 'manual_setup', lines: ['line 1', 'line 2'] },
        },
        last_activation_push: { configuration_transport: 'manual_setup' },
        detected_ports: [{ port_id: 'mc-in', name: 'MIDI Commander', direction: 'duplex', variant: 'midi_commander' }],
        active_profile: { name: 'MeloAudio MIDI Commander' },
        current_bank: 0,
        expression_calibrations: {},
      },
    })
    midiCommanderApi.patchMapping.mockResolvedValue({
      status: 'ok',
      projection: {
        snapshot: { id: 11, name: 'Lead' },
        controls: [],
        active_snapshot_mapping: null,
        last_activation_push: null,
        detected_ports: [],
        active_profile: null,
        current_bank: 0,
        expression_calibrations: {},
      },
    })
  })

  it('renders the MIDI Commander panels and patches assignments', async () => {
    renderPage()

    expect(await screen.findByTestId('midi-commander-connection-panel')).toBeTruthy()
    expect(screen.getByTestId('midi-commander-setup-panel')).toBeTruthy()
    expect(await screen.findByTestId('midi-commander-control-1')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Action type'), { target: { value: 'focus_block' } })

    await waitFor(() =>
      expect(midiCommanderApi.patchMapping).toHaveBeenCalledWith('1', {
        assignment: {
          kind: 'focus_block',
          transport_action: 'play',
        },
      }),
    )
  })
})
