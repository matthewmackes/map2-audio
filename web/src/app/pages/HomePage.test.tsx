import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './HomePage'

const originalFetch = global.fetch

jest.mock('../../assets/map2-landing-bg.png', () => 'map2-landing-bg.png')

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockNodePageContext = {
  localNode: {
    node_id: 'MANAGEMENT-NODE-1',
    hostname: 'MAP2-TESTBED',
    display_label: null,
    role: 'all_in_one' as const,
  },
}

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => mockNodePageContext,
}))

jest.mock('../hooks/useNodeTopology', () => ({
  useNodeTopology: () => ({
    data: {
      nodes: [
        {
          node_id: 'MANAGEMENT-NODE-1',
          hostname: 'MAP2-TESTBED',
          status: 'ok',
        },
      ],
    },
  }),
}))

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({
    status: 'connected',
    client: {
      onReconnectExhausted: () => () => undefined,
      retryNow: () => undefined,
    },
  }),
  useWebSocketTopic: () => undefined,
}))

function makeJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response
}

function defaultFetchResponse(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = String(input)

  if (url === '/api/platform-remediation/summary') {
    return makeJsonResponse({
      status: 'ok',
      counts: {
        adoption: {},
        sync: {},
        clone: {},
      },
      nodes: [],
    })
  }

  if (url === '/api/platform-remediation/sync/history') {
    return makeJsonResponse({
      status: 'ok',
      items: [],
    })
  }

  if (url === '/api/adoption/candidates') {
    return makeJsonResponse({ items: [] })
  }

  if (url.includes('/api/adoption/') && init?.method === 'POST') {
    return makeJsonResponse({ status: 'ok' })
  }

  return makeJsonResponse({})
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderHome(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomePage landing', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => defaultFetchResponse(input, init),
    ) as typeof fetch
  })

  afterEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = originalFetch
  })

  it('renders the current workspace tiles and online node summary', async () => {
    renderHome()

    expect(await screen.findByText('Platforms')).toBeTruthy()
    expect(screen.getByText('Audio Grid')).toBeTruthy()
    expect(screen.getByText('Labs')).toBeTruthy()
    expect(screen.getByText('Audio Artifacts')).toBeTruthy()
    expect(screen.getByText('Drum Machine')).toBeTruthy()
    expect(screen.getByText('SynthForge')).toBeTruthy()
    expect(screen.getByText('No Active Flow')).toBeTruthy()
    expect(screen.getByText('1 node online')).toBeTruthy()
    expect(screen.getByText(/MAP2-TESTBED/)).toBeTruthy()
  })

  it('opens Platforms from the landing tile using the canonical route', async () => {
    renderHome()

    const platformsCard = await screen.findByText('Platforms')
    fireEvent.click(platformsCard.closest('.hp2-card') as HTMLElement)

    expect(screen.getByTestId('location-probe').textContent).toBe('/platforms/overview')
  })

  it('routes adoption pills into the dedicated Platforms adoption workflow', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/platform-remediation/summary') {
          return makeJsonResponse({
            status: 'ok',
            counts: {
              adoption: { claimable: 1 },
              sync: {},
              clone: {},
            },
            nodes: [
              {
                node_id: 'NODE-2',
                hostname: 'MAP2-REMOTE-2',
                visible: true,
                registered: false,
                is_online: true,
                adoption_state: 'claimable',
                sync_states: [],
                clone_states: [],
                is_source_of_truth: false,
                rollback_available: false,
              },
            ],
          })
        }
        return defaultFetchResponse(input, init)
      },
    )

    renderHome()

    fireEvent.click(await screen.findByRole('button', { name: 'Claimable: 1' }))

    expect(screen.getByTestId('location-probe').textContent).toBe('/platforms/adoption?state=claimable')
  })

  it('opens the remediation modal when a sync pill is clicked', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/platform-remediation/summary') {
          return makeJsonResponse({
            status: 'ok',
            counts: {
              adoption: {},
              sync: { outdated: 1, held: 1 },
              clone: {},
            },
            manifest: {
              source_node: 'MANAGEMENT-NODE-1',
              timestamp: '2026-03-25T10:00:00Z',
            },
            nodes: [
              {
                node_id: 'NODE-2',
                hostname: 'MAP2-REMOTE-2',
                visible: true,
                registered: true,
                is_online: true,
                adoption_state: 'ready',
                version: '1.2.3',
                sync_states: ['outdated'],
                clone_states: [],
                is_source_of_truth: false,
                rollback_available: false,
              },
              {
                node_id: 'MANAGEMENT-NODE-1',
                hostname: 'MAP2-TESTBED',
                visible: true,
                registered: true,
                is_online: true,
                adoption_state: 'ready',
                version: '1.2.4',
                sync_states: ['held'],
                clone_states: [],
                is_source_of_truth: true,
                rollback_available: false,
              },
            ],
          })
        }
        return defaultFetchResponse(input, init)
      },
    )

    renderHome()

    fireEvent.click(await screen.findByRole('button', { name: 'Outdated: 1' }))

    expect((await screen.findAllByText('Platforms remediation')).length).toBeGreaterThan(0)
    expect(screen.getByText('Source-of-truth sync')).toBeTruthy()
    expect(screen.getByText('MAP2-REMOTE-2')).toBeTruthy()
  })

  it('shows a neutral sync unavailable indicator instead of sync remediation pills when manifest storage is unavailable', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/platform-remediation/summary') {
          return makeJsonResponse({
            status: 'degraded',
            counts: {
              adoption: { ready: 1 },
              sync: { outdated: 2, held: 1 },
              clone: {},
            },
            workflows: {
              adoption: { available: true, state: 'ready' },
              sync: {
                available: false,
                state: 'unavailable',
                reason: 'read_only_filesystem',
                detail: 'Version manifest storage is unavailable at /var/lib/map2/version_manifest_history because /var/lib/map2 is mounted read-only.',
              },
              clone: { available: true, state: 'ready' },
            },
            nodes: [
              {
                node_id: 'NODE-2',
                hostname: 'MAP2-REMOTE-2',
                visible: true,
                registered: true,
                is_online: true,
                adoption_state: 'ready',
                version: '1.2.3',
                sync_states: [],
                clone_states: [],
                is_source_of_truth: false,
                rollback_available: false,
              },
            ],
          })
        }
        return defaultFetchResponse(input, init)
      },
    )

    renderHome()

    expect((await screen.findAllByText('Sync unavailable')).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: 'Outdated: 2' })).toBeNull()
  })
})
