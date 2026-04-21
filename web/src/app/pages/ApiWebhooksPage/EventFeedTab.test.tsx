import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver

jest.mock('../../services/platformEventTransport', () => {
  const subscribe = jest.fn(() => () => {})
  const start = jest.fn(() => () => {})
  return {
    __esModule: true,
    __mockSubscribe: subscribe,
    __mockStart: start,
    getPlatformEventTransport: () => ({
      start,
      subscribe,
      ack: jest.fn(),
      getSessionId: () => 'sess-test',
    }),
  }
})

const transportMock = jest.requireMock('../../services/platformEventTransport') as {
  __mockSubscribe: jest.Mock
  __mockStart: jest.Mock
}
const subscribeFn = transportMock.__mockSubscribe
const startFn = transportMock.__mockStart

import { EventFeedTab } from './EventFeedTab'

function mockMatchMedia(): void {
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
}

function installFetchMock(
  handler: (url: string, init?: RequestInit) => { ok: boolean; status?: number; body?: unknown },
): jest.Mock {
  const fn = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    const resp = handler(url, init)
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      json: () => Promise.resolve(resp.body ?? {}),
    } as Response)
  })
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch
  return fn
}

const SAMPLE_EVENT = {
  event_id: 'evt-1',
  kind: 'node.online',
  severity: 'info',
  source_node: 'node-a',
  source_service: 'engine',
  occurred_at: '2026-04-21T12:00:00Z',
  monotonic_ns: null,
  title: 'Node online',
  message: 'node-a came online',
  context: {},
  correlation_id: null,
  dedupe_key: null,
  ttl_seconds: 300,
  expires_at: null,
  priority: 0.5,
  icon: null,
  color: null,
  sound: null,
  sticky: false,
  resource: null,
  broadcast: true,
  target_nodes: [],
  target_surfaces: [],
  workflow: null,
  supersedes: null,
  ack_required: false,
}

describe('EventFeedTab', () => {
  beforeEach(() => {
    mockMatchMedia()
    subscribeFn.mockClear()
    startFn.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('hydrates from /api/platform-events and renders the returned row', async () => {
    installFetchMock((url) => {
      if (url.startsWith('/api/platform-events?')) {
        return { ok: true, body: { events: [SAMPLE_EVENT], count: 1 } }
      }
      return { ok: false, status: 404 }
    })

    await act(async () => {
      render(<EventFeedTab />)
    })
    await waitFor(() => expect(screen.getByText('Node online')).toBeInTheDocument())
    expect(screen.getByText('node-a')).toBeInTheDocument()
    expect(screen.getAllByText('info').length).toBeGreaterThan(0)
  })

  it('surfaces a hydrate failure via InlineNotification', async () => {
    installFetchMock(() => ({ ok: false, status: 500 }))
    await act(async () => {
      render(<EventFeedTab />)
    })
    await waitFor(() => expect(screen.getByText(/hydrate failed/i)).toBeInTheDocument())
  })

  it('toggles Pause → Resume and POSTs the synthetic test event', async () => {
    const fetchMock = installFetchMock((url, init) => {
      if (url.startsWith('/api/platform-events?')) {
        return { ok: true, body: { events: [], count: 0 } }
      }
      if (url === '/api/platform-events/test' && init?.method === 'POST') {
        return {
          ok: true,
          status: 202,
          body: { event: { event_id: 'evt-test-1', kind: 'platform.test.ping' } },
        }
      }
      return { ok: false, status: 404 }
    })

    await act(async () => {
      render(<EventFeedTab />)
    })

    const pauseBtn = await screen.findByRole('button', { name: /pause/i })
    await act(async () => {
      fireEvent.click(pauseBtn)
    })
    expect(await screen.findByRole('button', { name: /resume/i })).toBeInTheDocument()

    const fireBtn = screen.getByRole('button', { name: /fire test event/i })
    await act(async () => {
      fireEvent.click(fireBtn)
    })
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform-events/test',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    await waitFor(() =>
      expect(screen.getByText(/emitted evt-test-1/i)).toBeInTheDocument(),
    )
  })

  it('subscribes to the platform event transport on mount', async () => {
    installFetchMock(() => ({ ok: true, body: { events: [], count: 0 } }))
    await act(async () => {
      render(<EventFeedTab />)
    })
    expect(subscribeFn).toHaveBeenCalled()
    expect(startFn).toHaveBeenCalled()
  })
})
