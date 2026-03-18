import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './HomePage'

const mockUpdateSettings = jest.fn()
const mockSpecialSettings = {
  enabled: true,
  hiddenPlugins: [],
  menuLocation: 'top-nav' as const,
  pinnedRoutes: [] as string[],
}
const mockNodePageContext = {
  localNode: {
    node_id: 'MANAGEMENT-NODE-1',
    hostname: 'MAP2-TESTBED',
    display_label: null,
    role: 'all_in_one' as const,
  },
  topology: {
    nodes: [
      {
        node_id: 'MANAGEMENT-NODE-1',
        hostname: 'MAP2-TESTBED',
        display_label: null,
        role: 'all_in_one' as const,
        status: 'ok' as const,
        cpu_percent: 10,
        memory_percent: 12,
        xrun_count: 0,
        audio_latency_ms: 1.1,
        services: { backend: true, juce_engine: true, pipewire: true },
        last_seen: '2026-03-15T10:00:00Z',
        is_local: true,
        is_viewed: true,
      },
    ],
    audio_edges: [],
    network_edges: [],
  },
  viewedNodeId: 'MANAGEMENT-NODE-1',
}
const originalFetch = global.fetch

function makeJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response
}

function defaultFetchResponse(input: RequestInfo | URL): Response {
  const url = String(input)

  switch (url) {
    case '/api/system/host-machine-info':
      return makeJsonResponse({
        hostname: 'MAP2-TESTBED',
        cpu_cores: 6,
        total_memory_mb: 32003.8,
      })
    case '/api/network/status':
      return makeJsonResponse({
        hostname: 'MAP2-TESTBED',
        ethernet: [
          {
            enabled: true,
            connected: true,
            ip_address: '172.20.146.63',
          },
        ],
        wifi: [],
      })
    case '/api/cluster/health/extended/devices':
      return makeJsonResponse({
        nodes: {
          'MANAGEMENT-NODE-1': {
            node_id: 'MANAGEMENT-NODE-1',
            hostname: 'MAP2-TESTBED',
            audio_interfaces: ['Hotone Jogg USB Audio', 'Built-in Audio'],
            usb_audio_devices: [{ name: 'Hotone Jogg USB Audio' }],
          },
        },
      })
    case '/api/peers':
      return makeJsonResponse({
        local_node_id: 'MANAGEMENT-NODE-1',
        peers: [],
      })
    case '/api/cluster/discovered':
      return makeJsonResponse({ nodes: [] })
    case '/api/deployment/mode':
      return makeJsonResponse({ mode: 'ALL-IN-ONE' })
    default:
      return makeJsonResponse({})
  }
}

jest.mock('../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({
    settings: mockSpecialSettings,
    isLoading: false,
    error: null,
    updateSettings: mockUpdateSettings,
    reload: jest.fn(),
  }),
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => mockNodePageContext,
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

function renderHome(ui: React.ReactNode) {
  return render(
    <MemoryRouter
      initialEntries={['/']}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {ui}
    </MemoryRouter>,
  )
}

describe('HomePage navigation landing', () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset()
    mockSpecialSettings.pinnedRoutes = []
    mockNodePageContext.localNode = {
      node_id: 'MANAGEMENT-NODE-1',
      hostname: 'MAP2-TESTBED',
      display_label: null,
      role: 'all_in_one',
    }
    mockNodePageContext.topology = {
      nodes: [
        {
          node_id: 'MANAGEMENT-NODE-1',
          hostname: 'MAP2-TESTBED',
          display_label: null,
          role: 'all_in_one',
          status: 'ok',
          cpu_percent: 10,
          memory_percent: 12,
          xrun_count: 0,
          audio_latency_ms: 1.1,
          services: { backend: true, juce_engine: true, pipewire: true },
          last_seen: '2026-03-15T10:00:00Z',
          is_local: true,
          is_viewed: true,
        },
      ],
      audio_edges: [],
      network_edges: [],
    }
    mockNodePageContext.viewedNodeId = 'MANAGEMENT-NODE-1'
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL) =>
      defaultFetchResponse(input),
    ) as typeof fetch
  })

  afterEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = originalFetch
  })

  it('renders sectioned navigation cards with detailed feature descriptions', async () => {
    const { container } = renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    await screen.findByText('MAP2-TESTBED')

    expect(screen.getByText('MAP2')).toBeTruthy()
    expect(screen.queryByText(/MAP2 Node Status/i)).toBeNull()
    expect(screen.getByLabelText('Cluster node status')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Audio Grid/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /AVB/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /MIDI/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /System/i })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Hardware/i })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.replace(/\d+$/, '').trim())).toEqual([
      'Audio Grid',
      'AVB',
      'MIDI',
      'System',
      'Hardware',
    ])
    expect(screen.getAllByText('Audio Engine').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Audio Grid').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: /System/i }))
    expect(screen.getAllByText('Platform Stack').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Host Machine').length).toBeGreaterThan(0)
    expect(container.querySelector('.hp-hero__brand-mark')).toBeTruthy()
  })

  it('pins a card without navigating away from Home', async () => {
    renderHome(
      <Routes>
        <Route
          path="/"
          element={(
            <>
              <HomePage />
              <LocationProbe />
            </>
          )}
        />
      </Routes>,
    )

    await screen.findByText('MAP2-TESTBED')

    fireEvent.click(screen.getByRole('tab', { name: /Audio Grid/i }))
    fireEvent.click(screen.getByLabelText('Pin Audio Engine'))

    expect(mockUpdateSettings).toHaveBeenCalledWith({ pinnedRoutes: ['/engine'] })
    expect(screen.getByTestId('location-probe').textContent).toBe('/')
  })

  it('renders the local node tile from host and network APIs when peers fail', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/peers') {
          return makeJsonResponse({ detail: 'Internal Server Error' }, false)
        }
        return defaultFetchResponse(input)
      },
    )

    renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    expect((await screen.findAllByText('MAP2-TESTBED')).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('127.0.0.1')).toBeNull()
    expect(screen.queryByText('LOCAL-NODE')).toBeNull()

    const calledUrls = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(([input]) => String(input))
    expect(calledUrls).toContain('/api/system/host-machine-info')
    expect(calledUrls).toContain('/api/network/status')
    expect(calledUrls).toContain('/api/cluster/health/extended/devices')
  })

  it('proxies home telemetry through the viewed remote node when page scope is remote', async () => {
    mockNodePageContext.topology = {
      nodes: [
        mockNodePageContext.topology.nodes[0],
        {
          node_id: 'AUDIO-NODE-2',
          hostname: 'MAP2-STAGE-R',
          display_label: 'Stage Right',
          role: 'audio_node',
          status: 'ok',
          cpu_percent: 18,
          memory_percent: 24,
          xrun_count: 0,
          audio_latency_ms: 1.7,
          services: { backend: true, juce_engine: true, pipewire: true },
          last_seen: '2026-03-15T10:00:00Z',
          is_local: false,
          is_viewed: true,
        },
      ],
      audio_edges: [],
      network_edges: [],
    }
    mockNodePageContext.viewedNodeId = 'AUDIO-NODE-2'

    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input)
        const proxyBase = '/api/node/AUDIO-NODE-2/proxy'

        switch (url) {
          case `${proxyBase}/system/host-machine-info`:
            return makeJsonResponse({
              hostname: 'MAP2-STAGE-R',
              cpu_cores: 8,
              total_memory_mb: 16384,
            })
          case `${proxyBase}/network/status`:
            return makeJsonResponse({
              hostname: 'MAP2-STAGE-R',
              ethernet: [{ enabled: true, connected: true, ip_address: '172.20.146.88' }],
              wifi: [],
            })
          case `${proxyBase}/cluster/health/extended/devices`:
            return makeJsonResponse({
              nodes: {
                'AUDIO-NODE-2': {
                  node_id: 'AUDIO-NODE-2',
                  hostname: 'MAP2-STAGE-R',
                  audio_interfaces: ['Remote Stage Interface'],
                  usb_audio_devices: [],
                },
              },
            })
          case `${proxyBase}/peers`:
            return makeJsonResponse({ local_node_id: 'AUDIO-NODE-2', peers: [] })
          case `${proxyBase}/cluster/discovered`:
            return makeJsonResponse({ nodes: [] })
          case `${proxyBase}/deployment/mode`:
            return makeJsonResponse({ mode: 'AUDIO-NODE' })
          default:
            return makeJsonResponse({})
        }
      },
    )

    renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    expect((await screen.findAllByText('MAP2-STAGE-R')).length).toBeGreaterThanOrEqual(1)

    const calledUrls = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(([input]) => String(input))
    expect(calledUrls).toContain('/api/node/AUDIO-NODE-2/proxy/system/host-machine-info')
    expect(calledUrls).toContain('/api/node/AUDIO-NODE-2/proxy/network/status')
    expect(calledUrls).toContain('/api/node/AUDIO-NODE-2/proxy/cluster/health/extended/devices')
    expect(calledUrls).not.toContain('/api/system/host-machine-info')
  })
})
