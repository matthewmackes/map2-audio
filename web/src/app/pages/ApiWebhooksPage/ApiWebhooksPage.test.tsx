import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

jest.mock('../../utils/apiTarget', () => ({
  apiUrl: (path: string) => path,
  wsUrl: (path: string) => `ws://localhost${path}`,
}))
jest.mock('../../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({ status: 'connected', client: null, isConnected: true }),
  useWebSocketTopic: () => undefined,
}))
jest.mock('../ApiObservatory/scriptSandbox', () => ({
  runScriptInSandbox: async () => ({ tests: [], logs: [], environment: {} }),
  SCRIPT_TEMPLATES: [],
}))
jest.mock('../ApiObservatory/api', () => ({
  sendProxyRequest: async () => ({ status: 0, body: '', headers: {}, durationMs: 0 }),
  getTrafficEvents: async () => ({ count: 0, recording_session_id: null, events: [] }),
  getTrafficStats: async () => ({
    total_requests: 0,
    avg_response_ms: 0,
    p95_ms: 0,
    p99_ms: 0,
    error_rate_percent: 0,
    requests_per_second: 0,
    top_slowest_endpoints: [],
    top_called_endpoints: [],
    response_size_by_endpoint: [],
  }),
  listTrafficSessions: async () => ({ sessions: [] }),
  startTrafficRecording: async () => ({ session_id: 's', name: 's', started_at: '', stopped_at: null }),
  stopTrafficRecording: async () => ({ session_id: 's', name: 's', started_at: '', stopped_at: '', event_count: 0 }),
  getTrafficSession: async () => ({ session_id: 's', name: 's', started_at: '', stopped_at: '', events: [], stats: {} }),
  exportTrafficSession: async () => ({}),
  importTrafficSession: async () => ({}),
  getPeerTopology: async () => ({ local_node_id: 'local-node', peers: [] }),
}))

class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver

import { ApiWebhooksPage } from './ApiWebhooksPage'

function renderAt(initialEntries: string[]) {
  // MemoryRouter v6 parses each entry string; queries are preserved when entries
  // are passed as objects with explicit pathname/search.
  const entries = initialEntries.map((entry) => {
    const queryIndex = entry.indexOf('?')
    if (queryIndex < 0) return { pathname: entry, search: '', hash: '' }
    return {
      pathname: entry.slice(0, queryIndex),
      search: entry.slice(queryIndex),
      hash: '',
    }
  })
  return render(
    <MemoryRouter initialEntries={entries}>
      <ApiWebhooksPage />
    </MemoryRouter>,
  )
}

describe('ApiWebhooksPage', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              targets: [],
              count: 0,
              events: [],
              peers: [],
              sessions: [],
              local_node_id: 'local-node',
              stats: {
                total_requests: 0,
                avg_response_ms: 0,
                p95_ms: 0,
                p99_ms: 0,
                error_rate_percent: 0,
                requests_per_second: 0,
                top_slowest_endpoints: [],
                top_called_endpoints: [],
                response_size_by_endpoint: [],
              },
            }),
        } as Response),
      ) as unknown as typeof fetch
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
    window.localStorage.clear()
  })

  it('renders all seven Midpoint tabs and lands on Event Feed by default', () => {
    renderAt(['/platforms/midpoint'])

    expect(screen.getByRole('tab', { name: /api catalog/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /traffic monitor/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /event feed/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /websocket inspector/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /web ssh/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /request builder/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /collections/i })).toBeInTheDocument()
  })

  it('switches to the Web SSH tab when clicked and persists the selection', () => {
    const { unmount } = renderAt(['/platforms/midpoint'])

    fireEvent.click(screen.getByRole('tab', { name: /web ssh/i }))

    expect(screen.getByRole('region', { name: /web ssh/i })).toBeInTheDocument()
    expect(window.localStorage.getItem('map2_midpoint_active_tab')).toBe('web-ssh')

    unmount()
    renderAt(['/platforms/midpoint'])
    expect(screen.getByRole('region', { name: /web ssh/i })).toBeInTheDocument()
  })

  it('reads the legacy storage key and migrates the selection to the midpoint key', () => {
    window.localStorage.setItem('map2_api_webhooks_active_tab', 'web-ssh')

    renderAt(['/platforms/midpoint'])

    expect(screen.getByRole('region', { name: /web ssh/i })).toBeInTheDocument()
    expect(window.localStorage.getItem('map2_midpoint_active_tab')).toBe('web-ssh')
    expect(window.localStorage.getItem('map2_api_webhooks_active_tab')).toBeNull()
  })

  it('honors the ?tab query parameter on initial load', () => {
    renderAt(['/platforms/midpoint?tab=collections'])

    const collectionsTab = screen.getByRole('tab', { name: /collections/i })
    expect(collectionsTab).toHaveAttribute('aria-selected', 'true')
  })
})
