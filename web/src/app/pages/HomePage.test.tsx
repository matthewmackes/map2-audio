import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './HomePage'

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
    case '/api/adoption/candidates':
      return makeJsonResponse({ items: [] })
    default:
      return makeJsonResponse({})
  }
}

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => mockNodePageContext,
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
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

  it('renders the integrated Carbon overview with primary workspace tiles', async () => {
    const { container } = renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    await screen.findByRole('heading', { name: 'Open a workspace' })

    expect(screen.getByRole('heading', { name: 'Open a workspace' })).toBeTruthy()
    expect(screen.getByText('Choose the part of MAP2 you need for sound, MIDI, files, or system setup.')).toBeTruthy()
    expect(screen.getByLabelText('Main workspaces')).toBeTruthy()
    expect(screen.getByLabelText('Node status')).toBeTruthy()
    expect(screen.queryByLabelText('Cluster summary')).toBeNull()
    expect(screen.queryByLabelText('Pin Audio Grid')).toBeNull()
    expect(screen.getByText('Platforms')).toBeTruthy()
    expect(screen.getByText('Audio Artifacts')).toBeTruthy()
    expect(screen.getAllByText('Audio Grid').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MIDI Hub').length).toBeGreaterThan(0)
    expect(screen.getByText('Labs')).toBeTruthy()
    expect(container.querySelector('.hp-shell__brand-mark')).toBeTruthy()
  })

  it('opens Platforms from the landing workspace tile using the canonical route', async () => {
    renderHome(
      <Routes>
        <Route
          path="*"
          element={(
            <>
              <HomePage />
              <LocationProbe />
            </>
          )}
        />
      </Routes>,
    )

    await screen.findByRole('heading', { name: 'Open a workspace' })

    const platformsCard = screen.getByText('Platforms').closest('.hp-workspace-card')
    expect(platformsCard).toBeTruthy()
    fireEvent.click(platformsCard as HTMLElement)

    expect(screen.getByTestId('location-probe').textContent).toBe('/platforms/overview')
  })

  it('orders the primary workspace tiles with Platforms before Labs and MIDI Hub', async () => {
    renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    await screen.findByRole('heading', { name: 'Open a workspace' })

    const workspaceTitles = Array.from(document.querySelectorAll('.hp-workspace-card__title')).map((node) => node.textContent)
    expect(workspaceTitles.slice(0, 5)).toEqual([
      'Platforms',
      'Audio Artifacts',
      'Audio Grid',
      'MIDI Hub',
      'Labs',
    ])
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

  it('counts peer-only visible nodes from /api/peers as online in the home summary', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/peers') {
          return makeJsonResponse({
            local_node_id: 'MANAGEMENT-NODE-1',
            peers: [
              {
                node_id: 'AUDIO-NODE-2',
                node_mode: 'AUDIO-NODE',
                hostname: 'MAP2-STAGE-R',
                host: '10.0.0.22',
                last_seen: '2026-03-23T09:00:00Z',
                latency_ms: null,
                is_online: true,
              },
            ],
          })
        }
        if (url === '/api/cluster/discovered') {
          return makeJsonResponse({ nodes: [] })
        }
        return defaultFetchResponse(input)
      },
    )

    renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    expect((await screen.findAllByText('MAP2-STAGE-R')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('2 of 2 nodes online')).toBeTruthy()
  })

  it('shows the adoption queue and drives claim, adopt, and promote actions', async () => {
    let adoptionItems = [
      {
        candidate_id: 'cand_peer-unmanaged',
        remote_node_id: 'peer-unmanaged',
        hostname: 'MAP2-STAGE-R',
        trust_state: 'unknown',
        adoption_state: 'candidate',
        activation_state: 'standby',
        readiness: { status: 'warning', blocking_count: 0, warning_count: 1 },
        registered: false,
        visible: true,
        routing_ready: false,
      },
    ]

    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/adoption/candidates') {
          return makeJsonResponse({ items: adoptionItems })
        }
        if (url === '/api/adoption/candidates/cand_peer-unmanaged/claim' && init?.method === 'POST') {
          adoptionItems = [
            {
              ...adoptionItems[0],
              trust_state: 'claimed',
              adoption_state: 'claimable',
            },
          ]
          return makeJsonResponse({ status: 'ok' })
        }
        if (url === '/api/adoption/candidates/cand_peer-unmanaged/adopt' && init?.method === 'POST') {
          adoptionItems = [
            {
              ...adoptionItems[0],
              node_id: 'peer-unmanaged',
              trust_state: 'trusted',
              adoption_state: 'adopted',
              activation_state: 'standby',
              registered: true,
              readiness: { status: 'ready', blocking_count: 0, warning_count: 0 },
            },
          ]
          return makeJsonResponse({ status: 'ok' })
        }
        if (url === '/api/adoption/nodes/peer-unmanaged/promote' && init?.method === 'POST') {
          adoptionItems = [
            {
              ...adoptionItems[0],
              node_id: 'peer-unmanaged',
              trust_state: 'trusted',
              adoption_state: 'ready',
              activation_state: 'active',
              registered: true,
              readiness: { status: 'ready', blocking_count: 0, warning_count: 0 },
              routing_ready: true,
            },
          ]
          return makeJsonResponse({ status: 'ok' })
        }
        return defaultFetchResponse(input)
      },
    )

    renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    await screen.findByRole('heading', { name: 'Adopt discovered nodes' })
    await screen.findByRole('button', { name: 'Claim' })
    expect((await screen.findAllByText('MAP2-STAGE-R')).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Pairing code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }))

    await screen.findByRole('button', { name: 'Adopt to standby' })
    fireEvent.click(screen.getByRole('button', { name: 'Adopt to standby' }))

    await screen.findByRole('button', { name: 'Promote to active' })
    fireEvent.click(screen.getByRole('button', { name: 'Promote to active' }))

    await waitFor(() => {
      expect(screen.getByText('No nodes are waiting for adoption')).toBeTruthy()
    })
  })

  it('can issue a bootstrap token and claim a candidate without manual pairing-code entry', async () => {
    let adoptionItems = [
      {
        candidate_id: 'cand_peer-unmanaged',
        remote_node_id: 'peer-unmanaged',
        hostname: 'MAP2-STAGE-R',
        api_url: 'http://10.0.0.60:8080',
        trust_state: 'unknown',
        adoption_state: 'candidate',
        activation_state: 'standby',
        readiness: { status: 'warning', blocking_count: 0, warning_count: 1 },
        registered: false,
        visible: true,
        routing_ready: false,
      },
    ]

    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/adoption/candidates') {
          return makeJsonResponse({ items: adoptionItems })
        }
        if (url === '/api/bootstrap/tokens/issue' && init?.method === 'POST') {
          return makeJsonResponse({ bootstrap_token: 'signed-bootstrap-token' })
        }
        if (url === '/api/adoption/candidates/cand_peer-unmanaged/claim' && init?.method === 'POST') {
          adoptionItems = [
            {
              ...adoptionItems[0],
              trust_state: 'claimed',
              adoption_state: 'claimable',
            },
          ]
          return makeJsonResponse({ status: 'ok' })
        }
        return defaultFetchResponse(input)
      },
    )

    renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    await screen.findByRole('button', { name: 'Claim with token' })
    fireEvent.click(screen.getByRole('button', { name: 'Claim with token' }))

    await screen.findByRole('button', { name: 'Adopt to standby' })

    const calledUrls = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(([input]) => String(input))
    expect(calledUrls).toContain('/api/bootstrap/tokens/issue')
    expect(calledUrls).toContain('/api/adoption/candidates/cand_peer-unmanaged/claim')
  })

  it('loads clone options for an adopted standby node and applies the selected clone groups', async () => {
    const adoptionItems = [
      {
        candidate_id: 'cand_peer-unmanaged',
        remote_node_id: 'peer-unmanaged',
        node_id: 'peer-unmanaged',
        hostname: 'MAP2-STAGE-R',
        trust_state: 'trusted',
        adoption_state: 'adopted',
        activation_state: 'standby',
        readiness: { status: 'ready', blocking_count: 0, warning_count: 0 },
        registered: true,
        visible: true,
        routing_ready: false,
      },
    ]

    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/adoption/candidates') {
          return makeJsonResponse({ items: adoptionItems })
        }
        if (url === '/api/adoption/nodes/peer-unmanaged/clone/sources') {
          return makeJsonResponse({
            items: [
              {
                node_id: 'source-node',
                hostname: 'MAP2-SOURCE',
                display_name: 'This node',
              },
            ],
          })
        }
        if (url === '/api/adoption/nodes/peer-unmanaged/clone/preview?source_node_id=source-node') {
          return makeJsonResponse({
            source: {
              node_id: 'source-node',
              hostname: 'MAP2-SOURCE',
            },
            groups: [
              {
                id: 'role_profile',
                label: 'Role and deployment mode',
                description: 'Copy deployment mode.',
                default_selected: true,
                items: [{ key: 'deployment.mode', label: 'Deployment mode', value: 'AUDIO-NODE' }],
              },
              {
                id: 'avb_defaults',
                label: 'AVB defaults',
                description: 'Copy AVB defaults.',
                default_selected: true,
                items: [{ key: 'avb.interface', label: 'AVB interface', value: 'enp11s0' }],
              },
            ],
          })
        }
        if (url === '/api/adoption/nodes/peer-unmanaged/clone' && init?.method === 'POST') {
          return makeJsonResponse({ status: 'ok' })
        }
        return defaultFetchResponse(input)
      },
    )

    renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    await screen.findByText('Clone safe settings from another node')
    await screen.findByRole('button', { name: 'Apply selected clone' })
    expect(await screen.findByLabelText('Role and deployment mode')).toBeTruthy()
    expect(await screen.findByText('AVB defaults')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Apply selected clone' }))

    await waitFor(() => {
      const calledUrls = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls.map(([input]) => String(input))
      expect(calledUrls).toContain('/api/adoption/nodes/peer-unmanaged/clone')
    })
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
