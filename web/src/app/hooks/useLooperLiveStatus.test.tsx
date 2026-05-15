import { renderHook, waitFor, act } from '@testing-library/react'

import { useLooperLiveStatus } from './useLooperLiveStatus'

const mockGetStatus = jest.fn()

jest.mock('../../map2/clients/looper', () => ({
  __esModule: true,
  looperApi: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
  },
}))

jest.mock('../../map2/transport', () => ({
  __esModule: true,
  getWsUrl: () => 'ws://test.local/ws',
}))

// Minimal MockWebSocket that captures the subscribe payload and lets
// tests push messages back from the "server" via dispatchMessage.
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null
  sentMessages: string[] = []
  readyState = 0
  closed = false

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.closed = true
    this.readyState = 3
    this.onclose?.call(this as unknown as WebSocket, new CloseEvent('close'))
  }

  open() {
    this.readyState = 1
    this.onopen?.call(this as unknown as WebSocket, new Event('open'))
  }

  dispatchMessage(payload: unknown) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent('message', { data: JSON.stringify(payload) }),
    )
  }
}

function makeStatus(overrides?: Record<string, unknown>) {
  return {
    tracks: [],
    active_track_count: 0,
    sync_master: false,
    master_level_db: 0,
    master_muted: false,
    bpm: null,
    sync_master_track: null,
    recent_activity: [],
    metrics: {},
    preset_names: [],
    ...overrides,
  }
}

describe('useLooperLiveStatus', () => {
  let originalWebSocket: typeof WebSocket
  beforeAll(() => {
    originalWebSocket = globalThis.WebSocket
    ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket
  })
  afterAll(() => {
    ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket
  })
  beforeEach(() => {
    mockGetStatus.mockReset()
    MockWebSocket.instances = []
  })

  it('fetches an initial status on mount', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus({ active_track_count: 2 }))
    const { result } = renderHook(() => useLooperLiveStatus())
    await waitFor(() => expect(result.current.status?.active_track_count).toBe(2))
    expect(result.current.error).toBeNull()
  })

  it('subscribes to looper:status on WS open and flips isConnected to true', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    const { result } = renderHook(() => useLooperLiveStatus())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.open()
    })
    expect(ws.sentMessages).toContainEqual(
      JSON.stringify({ action: 'subscribe', topic: 'looper:status' }),
    )
    await waitFor(() => expect(result.current.isConnected).toBe(true))
  })

  it('applies a looper_status frame from the WS without an HTTP call', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus({ active_track_count: 0 }))
    const { result } = renderHook(() => useLooperLiveStatus())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    act(() => ws.open())

    const httpCallCountBefore = mockGetStatus.mock.calls.length
    const pushed = makeStatus({ active_track_count: 3, master_level_db: -6 })
    act(() => {
      ws.dispatchMessage({ type: 'looper_status', payload: pushed })
    })

    await waitFor(() => expect(result.current.status?.active_track_count).toBe(3))
    expect(result.current.status?.master_level_db).toBe(-6)
    // No extra HTTP call between the open and the push.
    expect(mockGetStatus.mock.calls.length).toBe(httpCallCountBefore)
  })

  it('flips isConnected back to false when the WS closes', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    const { result } = renderHook(() => useLooperLiveStatus())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    act(() => ws.open())
    await waitFor(() => expect(result.current.isConnected).toBe(true))
    act(() => ws.close())
    await waitFor(() => expect(result.current.isConnected).toBe(false))
  })

  it('drops malformed frames silently', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus({ active_track_count: 1 }))
    const { result } = renderHook(() => useLooperLiveStatus())
    await waitFor(() => expect(result.current.status?.active_track_count).toBe(1))
    const ws = MockWebSocket.instances[0]
    act(() => ws.open())
    // A non-looper frame must be dropped without erroring.
    act(() => {
      ws.onmessage?.call(
        ws as unknown as WebSocket,
        new MessageEvent('message', { data: 'not-json' }),
      )
    })
    // Status stays as the initial fetch.
    expect(result.current.status?.active_track_count).toBe(1)
    expect(result.current.error).toBeNull()
  })

  it('captures an initial HTTP error in error state', async () => {
    mockGetStatus.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useLooperLiveStatus())
    await waitFor(() => expect(result.current.error).toBe('boom'))
  })

  it('clears error after a successful WS frame arrives', async () => {
    mockGetStatus.mockRejectedValueOnce(new Error('first-fail'))
    const { result } = renderHook(() => useLooperLiveStatus())
    await waitFor(() => expect(result.current.error).toBe('first-fail'))
    const ws = MockWebSocket.instances[0]
    act(() => ws.open())
    act(() => {
      ws.dispatchMessage({ type: 'looper_status', payload: makeStatus() })
    })
    await waitFor(() => expect(result.current.error).toBeNull())
  })

  it('closes the WS on unmount', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    const { unmount } = renderHook(() => useLooperLiveStatus())
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    expect(ws.closed).toBe(false)
    unmount()
    expect(ws.closed).toBe(true)
  })
})
