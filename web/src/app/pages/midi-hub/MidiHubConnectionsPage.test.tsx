import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
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

const mockMaschineApi = {
  getStatus: jest.fn(async () => ({
    status: 'ok',
    state: {
      connected: true,
      status: 'connected',
      virtual_port_name: 'MAP2:Maschine-MK1',
      hid_device: { vendor_id: '17cc', product_id: '0808' },
      websocket_connected: true,
      daemon_version: '0.1.0',
      firmware_info: {},
      capabilities: {},
      lcd: { left: { width: 128, height: 64, format: 'xbm', data: '' }, right: { width: 128, height: 64, format: 'xbm', data: '' } },
      led_state: { pads: [] },
      audio_grid: { blocks: [], selected_block_id: null, page_index: 0 },
    },
  })),
}

jest.mock('../../../map2/api', () => ({
  API_BASE: '/api',
  getWsUrl: () => 'ws://localhost:8080/ws/v1',
  midiHubApi: mockMidiHubApi,
}))

jest.mock('../../../map2/clients/maschine', () => ({
  maschineApi: mockMaschineApi,
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
  MidiHubPanelShell: ({
    children,
    title,
  }: {
    children: React.ReactNode
    title?: React.ReactNode
  }) => (
    <section>
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  ),
  MidiHubEmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  ),
  MidiHubSurface: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <div className={className}>
      {children}
    </div>
  ),
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

jest.mock('../../components/MidiHub/MidiTrafficMonitor', () => ({
  MidiTrafficMonitor: ({ limit }: { limit?: number }) => (
    <div>{`Traffic sample ${limit ?? 'unknown'} note_on`}</div>
  ),
}))

jest.mock('../../components/MidiHub/MidiRoutingMatrix', () => ({
  MidiRoutingMatrix: () => <div>Route matrix ready</div>,
}))

jest.mock('../../components/MidiHub/MidiPatchbay', () => ({
  MidiPatchbay: () => <div>Patchbay workflow</div>,
}))

const { MidiHubConnectionsPage } =
  jest.requireActual('./MidiHubConnectionsPage') as typeof import('./MidiHubConnectionsPage')

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
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <NotificationProvider>
          <MidiHubNodeScopeProvider nodeId={null} scopeKey="local">
            <MidiHubConnectionsPage />
          </MidiHubNodeScopeProvider>
        </NotificationProvider>
      </MemoryRouter>
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

  it('renders ports, switches workspace views, and reports connected devices and traffic data', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Connections' })).toBeTruthy()
    expect(screen.getByText('USB In')).toBeTruthy()
    expect(screen.getAllByText('DIN Out').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Connected MIDI devices' })).toBeTruthy()
    expect(await screen.findByText('Maschine MK1')).toBeTruthy()
    expect(screen.getByText('MAP2:Maschine-MK1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Configure →' })).toBeTruthy()
    expect(screen.getByText('Sends to DIN Out')).toBeTruthy()
    expect(screen.getByText(/Receives from USB In/)).toBeTruthy()
    expect(screen.getByText(/Clock output enabled/)).toBeTruthy()
    expect(screen.getByText('Traffic Monitor')).toBeTruthy()
    expect(screen.getByText('Traffic sample 500 note_on')).toBeTruthy()

    expect(screen.getByText('Route matrix ready')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Patchbay graph' }))
    expect(await screen.findByText('Patchbay workflow')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Port matrix' }))
    expect(await screen.findByText('Route matrix ready')).toBeTruthy()
  })
})
