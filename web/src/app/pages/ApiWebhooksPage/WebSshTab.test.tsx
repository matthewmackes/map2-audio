import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver

jest.mock('../../components/WebSsh/XTermTerminal', () => ({
  XTermTerminal: ({ connection }: { connection: { host: string; username: string } }) => (
    <div data-testid="mock-xterm" data-host={connection.host} data-user={connection.username}>
      mock xterm for {connection.username}@{connection.host}
    </div>
  ),
}))

jest.mock('../../components/WebSsh/sshTrustBootstrap', () => ({
  runSshTrustBootstrap: jest.fn(() =>
    Promise.resolve({
      local_node_id: 'local-1',
      local_fingerprint: 'fp',
      generated_key: false,
      already_trusted: [],
      newly_trusted: [],
      failed: [],
      skipped_offline: [],
      ok: true,
    }),
  ),
}))

import { WebSshTab } from './WebSshTab'

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

function installFetchMock(peers: unknown[]): jest.Mock {
  const fetchMock = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/peers')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ peers }),
      } as Response)
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response)
  })
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('WebSshTab', () => {
  beforeEach(() => {
    mockMatchMedia()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads peers from /api/peers and opens a session for the selected peer', async () => {
    installFetchMock([
      {
        node_id: 'node-a',
        hostname: 'alpha.local',
        host: '10.0.0.50',
        port: 22,
        ssh_trusted: true,
        is_online: true,
        node_mode: 'all-in-one',
      },
    ])

    await act(async () => {
      render(<WebSshTab />)
    })

    await waitFor(() =>
      expect(screen.getByRole('region', { name: /web ssh/i })).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(screen.getAllByText(/alpha\.local/i).length).toBeGreaterThan(0),
    )

    const openBtn = screen.getByRole('button', { name: /open session/i })
    expect(openBtn).toBeEnabled()

    await act(async () => {
      fireEvent.click(openBtn)
    })

    const term = await screen.findByTestId('mock-xterm')
    expect(term).toHaveAttribute('data-host', '10.0.0.50')
    expect(term).toHaveAttribute('data-user', 'mm')
  })

  it('disables Open session when no peers are available', async () => {
    installFetchMock([])
    await act(async () => {
      render(<WebSshTab />)
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open session/i })).toBeDisabled(),
    )
  })

  it('rejects manual connect without a host', async () => {
    installFetchMock([])
    await act(async () => {
      render(<WebSshTab />)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    })
    const manualBtn = await screen.findByRole('button', { name: /open manual session/i })
    await act(async () => {
      fireEvent.click(manualBtn)
    })
    expect(await screen.findByText(/host is required/i)).toBeInTheDocument()
  })

  it('opens a manual session when a host is provided', async () => {
    installFetchMock([])
    await act(async () => {
      render(<WebSshTab />)
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    })
    const hostInput = await screen.findByLabelText(/host \/ ip/i)
    await act(async () => {
      fireEvent.change(hostInput, { target: { value: '192.168.1.10' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /open manual session/i }))
    })
    const term = await screen.findByTestId('mock-xterm')
    expect(term).toHaveAttribute('data-host', '192.168.1.10')
  })
})
