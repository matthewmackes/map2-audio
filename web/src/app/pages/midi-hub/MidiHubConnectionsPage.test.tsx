import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationProvider } from '../../components/Toasts'
import { MidiHubNodeScopeProvider } from '../../components/MidiHub/MidiHubNodeScope'

const mockMidiHubApi = {
  getStatus: jest.fn(async () => ({
    ports: [
      { port_id: 'usb-in', name: 'USB In', direction: 'input', kind: 'usb' },
      { port_id: 'din-out', name: 'DIN Out', direction: 'output', kind: 'din' },
    ],
  })),
  getRoutes: jest.fn(async () => ({
    routes: [
      {
        route_id: 'route-1',
        source_port: 'usb-in',
        destination_ports: ['din-out'],
        enabled: true,
        priority: 100,
        route_type: 'pass_through',
        filter: { message_types: [], channels: [] },
        transform_chain: [],
      },
    ],
    match_mode: 'all',
  })),
  getTopology: jest.fn(async () => ({
    nodes: ['usb-in', 'din-out'],
  })),
  getTrafficSnapshot: jest.fn(async () => ({
    count: 1,
    captured_total: 1,
    capacity: 500,
    records: [
      {
        timestamp_ns: 1_700_000_000_000_000_000,
        source_port: 'usb-in',
        destination_port: 'din-out',
        direction: 'outbound',
        raw_hex: '90 3C 7F',
        route_id: 'route-1',
        origin_node_id: 'local',
        decoded: { message_type: 'note_on', channel: 1, data1: 60, data2: 127 },
      },
    ],
  })),
  getTrafficStats: jest.fn(async () => ({
    messages_per_second: 12.4,
  })),
  createRoute: jest.fn(async () => ({ ok: true, route: {} })),
  updateRoute: jest.fn(async () => ({ ok: true })),
  deleteRoute: jest.fn(async () => ({ ok: true })),
  enableRoute: jest.fn(async () => ({ ok: true })),
  disableRoute: jest.fn(async () => ({ ok: true })),
  clearTraffic: jest.fn(async () => ({ ok: true })),
  exportTraffic: jest.fn(async () => ({ path: '/tmp/traffic.csv', count: 1 })),
}

jest.mock('../../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('./MidiHubAreaLayout', () => ({
  MidiHubAreaLayout: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}))

jest.mock('../../components/MidiHub/MidiHubHelpPrimitives', () => ({
  MidiHubPanelShell: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}))

jest.mock('../../components/MidiHub/useMidiHubOverview', () => ({
  useMidiHubOverview: () => ({
    ports: [
      { port_id: 'usb-in', name: 'USB In', direction: 'input', kind: 'usb' },
      { port_id: 'din-out', name: 'DIN Out', direction: 'output', kind: 'din' },
    ],
    routes: [
      {
        route_id: 'route-1',
        source_port: 'usb-in',
        destination_ports: ['din-out'],
        enabled: true,
        priority: 100,
        route_type: 'pass_through',
        filter: { message_types: [], channels: [] },
        transform_chain: [],
      },
    ],
    clockStatus: {
      output_ports: ['din-out'],
    },
  }),
}))

const { MidiHubConnectionsPage } =
  require('./MidiHubConnectionsPage') as typeof import('./MidiHubConnectionsPage')

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <MidiHubNodeScopeProvider nodeId={null} scopeKey="local">
          <MidiHubConnectionsPage />
        </MidiHubNodeScopeProvider>
      </NotificationProvider>
    </QueryClientProvider>,
  )
}

describe('MidiHubConnectionsPage', () => {
  beforeEach(() => {
    Object.values(mockMidiHubApi).forEach((value) => value.mockClear())

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

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
  })

  it('renders ports, switches workspace views, reports connected devices, shows traffic data, and opens the route modal', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Connections' })).toBeTruthy()
    expect(screen.getByText('USB In')).toBeTruthy()
    expect(screen.getAllByText('DIN Out').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Connected MIDI devices' })).toBeTruthy()
    expect(screen.getByText('Sends to DIN Out')).toBeTruthy()
    expect(screen.getByText(/Receives from USB In/)).toBeTruthy()
    expect(screen.getByText(/Clock output enabled/)).toBeTruthy()
    expect(await screen.findByText('note_on')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Patchbay graph' }))
    expect(await screen.findByText('Patchbay workflow')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Port matrix' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit route' }))
    expect(await screen.findByRole('heading', { name: 'Edit route' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Edit route' })).toBeNull()
    })
  })
})
