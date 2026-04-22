import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DevicesOverview } from './DevicesOverview'

jest.mock('../../hooks/useDeviceLocation', () => ({
  __esModule: true,
  useClusterHardwareInventory: () => ({
    data: {
      nodes: {
        alpha: {
          hostname: 'alpha',
          status: 'online',
          usb_audio_devices: [
            { name: 'Edirol UA-1000', product: 'UA-1000' },
          ],
          midi_devices: [
            { name: 'Lexicon MPX 1', product: 'MPX 1' },
          ],
          audio_interfaces: [],
          pipewire_devices: [],
        },
      },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}))

jest.mock('../../../map2/clients/enrichedPhysicalSurfaces', () => ({
  enrichedPhysicalSurfacesApi: {
    getSummary: jest.fn().mockResolvedValue({
      status: 'ok',
      summary: {
        units: [
          {
            unit_id: 'maschine-mk1',
            display_name: 'NI Maschine MK1',
            family: 'maschine-mk1',
            device_type: 'maschine-mk1',
            status: 'online',
            status_reason: 'ok',
            host_detected: true,
            capabilities: [],
            integration_notes: [],
            transport_layers: [],
            matched_usb_devices: [],
            matched_sound_cards: [],
            matched_midi_devices: [],
            service_state: {},
          },
        ],
      },
    }),
  },
}))

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/devices']}>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DevicesOverview', () => {
  it('renders each hardware + control-surface entry as a hero card', async () => {
    renderWithProviders(<DevicesOverview />)
    expect(screen.getAllByText('Devices').length).toBeGreaterThan(0)
    expect(screen.getByText('Lexicon MPX-1')).toBeInTheDocument()
    expect(screen.getByText('Rocktron IntelliFex')).toBeInTheDocument()
    expect(screen.getByText('Biamp Tesira')).toBeInTheDocument()
    expect(screen.getByText('Edirol UA-1000')).toBeInTheDocument()
    expect(screen.getByText('HoTone JoGG')).toBeInTheDocument()
    expect(screen.getByText('LCD Console')).toBeInTheDocument()
    expect(screen.getByText('Native Instruments Maschine MK1')).toBeInTheDocument()
    expect(screen.getByText('Ableton Push')).toBeInTheDocument()
  })

  it('groups cards under kind section headings', () => {
    renderWithProviders(<DevicesOverview />)
    expect(screen.getByText('Audio interfaces')).toBeInTheDocument()
    expect(screen.getByText('Processors')).toBeInTheDocument()
    expect(screen.getByText('Consoles')).toBeInTheDocument()
    expect(screen.getByText('Physical Surfaces')).toBeInTheDocument()
  })

  it('marks devices as online when inventory matches', () => {
    renderWithProviders(<DevicesOverview />)
    const onlineTags = screen.getAllByText('online')
    expect(onlineTags.length).toBeGreaterThan(0)
  })

  it('shows planned for surfaces without a data source', () => {
    renderWithProviders(<DevicesOverview />)
    const plannedTags = screen.getAllByText('planned')
    expect(plannedTags.length).toBeGreaterThan(0)
  })
})
