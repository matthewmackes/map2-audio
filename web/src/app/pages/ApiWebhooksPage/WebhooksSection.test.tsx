import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver

import { WebhooksSection } from './WebhooksSection'

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

type FetchHandler = (
  url: string,
  init?: RequestInit,
) => { ok: boolean; status?: number; body?: unknown }

function installFetchMock(handler: FetchHandler): jest.Mock {
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

const SAMPLE_TARGET = {
  id: 'wh-1',
  url: 'https://example.com/hook',
  filter: { kinds: ['system.cpu.critical'], severities: [], nodes: [], min_priority: 0 },
  enabled: true,
  created_at: '2026-04-21T12:00:00Z',
  last_attempt_at: null,
  last_status: null,
  has_secret: true,
}

describe('WebhooksSection', () => {
  beforeEach(() => {
    mockMatchMedia()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads registered targets from /api/webhooks and renders the URL', async () => {
    installFetchMock((url) => {
      if (url === '/api/webhooks') {
        return { ok: true, body: { targets: [SAMPLE_TARGET], count: 1 } }
      }
      return { ok: false, status: 404 }
    })

    await act(async () => {
      render(<WebhooksSection />)
    })
    await waitFor(() =>
      expect(screen.getByText('https://example.com/hook')).toBeInTheDocument(),
    )
    expect(screen.getByText(/1 registered/i)).toBeInTheDocument()
  })

  it('POSTs a registration when Register is submitted with a URL', async () => {
    const fetchMock = installFetchMock((url, init) => {
      if (url === '/api/webhooks' && (!init || init.method === undefined)) {
        return { ok: true, body: { targets: [], count: 0 } }
      }
      if (url === '/api/webhooks' && init?.method === 'POST') {
        return { ok: true, status: 201, body: { ...SAMPLE_TARGET } }
      }
      return { ok: false, status: 404 }
    })

    await act(async () => {
      render(<WebhooksSection />)
    })

    const registerBtn = await screen.findByRole('button', { name: /register target/i })
    await act(async () => {
      fireEvent.click(registerBtn)
    })

    const urlInput = await screen.findByLabelText(/^url$/i)
    await act(async () => {
      fireEvent.change(urlInput, { target: { value: 'https://hooks.example.com/a' } })
    })

    // Primary button in Modal is labeled "Register"
    const modalRegister = screen.getAllByRole('button', { name: /^register$/i }).pop()!
    await act(async () => {
      fireEvent.click(modalRegister)
    })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/webhooks',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === '/api/webhooks' && (c[1] as RequestInit | undefined)?.method === 'POST',
    )
    expect(postCall).toBeTruthy()
    const body = JSON.parse((postCall![1] as RequestInit).body as string)
    expect(body.url).toBe('https://hooks.example.com/a')
  })

  it('surfaces an error when GET /api/webhooks fails', async () => {
    installFetchMock(() => ({ ok: false, status: 500 }))
    await act(async () => {
      render(<WebhooksSection />)
    })
    await waitFor(() => expect(screen.getByText(/webhook error/i)).toBeInTheDocument())
  })

  it('opens the deliveries modal and fetches deliveries for the target', async () => {
    const fetchMock = installFetchMock((url) => {
      if (url === '/api/webhooks') {
        return { ok: true, body: { targets: [SAMPLE_TARGET], count: 1 } }
      }
      if (url.startsWith(`/api/webhooks/${SAMPLE_TARGET.id}/deliveries`)) {
        return {
          ok: true,
          body: {
            deliveries: [
              {
                id: 'd1',
                target_id: SAMPLE_TARGET.id,
                event_id: 'evt-abcdef12',
                attempt: 1,
                status_code: 200,
                ok: true,
                error: null,
                duration_ms: 42,
                sent_at: '2026-04-21T12:00:01Z',
              },
            ],
            count: 1,
          },
        }
      }
      return { ok: false, status: 404 }
    })

    await act(async () => {
      render(<WebhooksSection />)
    })
    await waitFor(() =>
      expect(screen.getByText('https://example.com/hook')).toBeInTheDocument(),
    )

    const viewBtn = screen.getByRole('button', { name: /view deliveries/i })
    await act(async () => {
      fireEvent.click(viewBtn)
    })

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) =>
            typeof c[0] === 'string' &&
            (c[0] as string).startsWith(`/api/webhooks/${SAMPLE_TARGET.id}/deliveries`),
        ),
      ).toBe(true),
    )
    await waitFor(() => expect(screen.getByText(/42ms/)).toBeInTheDocument())
  })
})
