import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const baseSlot = {
  enabled: false,
  source_port: '',
  message_type: 'control_change',
  channel_min: 1,
  channel_max: 16,
  value_min: 0,
  value_max: 127,
  target: '',
  curve: 'linear',
  created_at: 1,
  updated_at: 1,
  match_count: 0,
  last_matched_at: null,
  last_source_port: null,
  last_event_hex: null,
  last_output_hex: null,
  last_error: null,
}

const mockMidiHubApi = {
  listMessageMapperSlots: jest.fn(async () => ({
    count: 2,
    slots: [
      { ...baseSlot, slot_id: 'mapper-1' },
      {
        ...baseSlot,
        slot_id: 'mapper-2',
        enabled: true,
        source_port: 'src-b',
        target: 'dst-b',
        match_count: 3,
        last_source_port: 'src-b',
        last_event_hex: 'B0 07 40',
        last_output_hex: 'B0 07 64',
      },
    ],
  })),
  updateMessageMapperSlot: jest.fn(async (_slotId: string, payload: Record<string, unknown>) => ({
    ok: true,
    slot: { ...baseSlot, slot_id: 'mapper-1', ...payload },
  })),
  clearMessageMapperSlot: jest.fn(async (slotId: string) => ({
    ok: true,
    slot: { ...baseSlot, slot_id: slotId },
  })),
  resetMessageMapperSlots: jest.fn(async () => ({
    ok: true,
    count: 2,
    slots: [
      { ...baseSlot, slot_id: 'mapper-1' },
      { ...baseSlot, slot_id: 'mapper-2' },
    ],
  })),
}

jest.mock('../../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('./MidiHubNodeScope', () => ({
  useMidiHubNodeScope: () => ({ nodeId: null, scopeKey: 'local' }),
}))

jest.mock('./useMidiHubOverview', () => ({
  useMidiHubOverview: () => ({
    inputPorts: [
      { port_id: 'src-a', name: 'Source A', direction: 'input', kind: 'virtual' },
      { port_id: 'src-b', name: 'Source B', direction: 'input', kind: 'virtual' },
    ],
    outputPorts: [
      { port_id: 'dst-a', name: 'Dest A', direction: 'output', kind: 'virtual' },
      { port_id: 'dst-b', name: 'Dest B', direction: 'output', kind: 'virtual' },
    ],
  }),
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

const { MidiHubMessageMapper } =
  require('./MidiHubMessageMapper') as typeof import('./MidiHubMessageMapper')

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MidiHubMessageMapper />
    </QueryClientProvider>,
  )
}

describe('MidiHubMessageMapper', () => {
  beforeEach(() => {
    Object.values(mockMidiHubApi).forEach((value) => value.mockClear())
  })

  it('loads node-backed slots and saves, clears, and resets mapper state through the API', async () => {
    renderComponent()

    expect(await screen.findByText('16 node-backed slots')).toBeTruthy()
    expect(await screen.findByText('3 live matches')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Slot 1/i }))

    fireEvent.change(screen.getAllByLabelText('Destination port')[0], {
      target: { value: 'dst-a' },
    })
    fireEvent.change(screen.getAllByLabelText('Source port')[0], {
      target: { value: 'src-a' },
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Save slot' })[0])
    await waitFor(() =>
      expect(mockMidiHubApi.updateMessageMapperSlot).toHaveBeenCalledWith(
        'mapper-1',
        expect.objectContaining({
          source_port: 'src-a',
          target: 'dst-a',
          enabled: true,
        }),
        null,
      ),
    )

    fireEvent.click(screen.getAllByRole('button', { name: /Clear slot/i })[0])
    await waitFor(() => expect(mockMidiHubApi.clearMessageMapperSlot).toHaveBeenCalledWith('mapper-1', null))

    fireEvent.click(screen.getByRole('button', { name: 'Reset all mappers' }))
    await waitFor(() => expect(mockMidiHubApi.resetMessageMapperSlots).toHaveBeenCalledWith(null))
  })
})
