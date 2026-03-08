import { act, renderHook, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { useLatency } from '../useLatency'
import { useVuMeters } from '../useVuMeters'

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}))

jest.mock('../../../map2/api', () => ({
  API_BASE: 'http://localhost:8080/api',
  getWsUrl: () => 'ws://localhost:8080/ws/v1',
}))

class MockWebSocket {
  static instances: MockWebSocket[] = []

  readonly url: string
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  send = jest.fn()
  close = jest.fn(() => {
    this.readyState = 3
    if (this.onclose) {
      this.onclose({} as CloseEvent)
    }
  })

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  triggerOpen() {
    this.readyState = 1
    if (this.onopen) {
      this.onopen({} as Event)
    }
  }
}

describe('real-time polling gating', () => {
  const useQueryMock = useQuery as jest.Mock

  beforeEach(() => {
    ;(globalThis as any).WebSocket = MockWebSocket
    MockWebSocket.instances = []
    useQueryMock.mockReset()
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    })
  })

  it('disables VU meter polling once websocket is connected', async () => {
    const { unmount } = renderHook(() => useVuMeters({ useWebSocket: true, pollingInterval: 33 }))

    const firstCall = useQueryMock.mock.calls[0][0]
    expect(firstCall.enabled).toBe(true)
    expect(firstCall.refetchInterval).toBe(33)

    act(() => {
      MockWebSocket.instances[0].triggerOpen()
    })

    await waitFor(() => {
      const latestCall = useQueryMock.mock.calls[useQueryMock.mock.calls.length - 1][0]
      expect(latestCall.enabled).toBe(false)
      expect(latestCall.refetchInterval).toBe(false)
    })

    unmount()
  })

  it('disables latency polling once websocket is connected', async () => {
    const { unmount } = renderHook(() => useLatency({ useWebSocket: true, pollingInterval: 1000 }))

    const firstCall = useQueryMock.mock.calls[0][0]
    expect(firstCall.enabled).toBe(true)
    expect(firstCall.refetchInterval).toBe(1000)

    act(() => {
      MockWebSocket.instances[0].triggerOpen()
    })

    await waitFor(() => {
      const latestCall = useQueryMock.mock.calls[useQueryMock.mock.calls.length - 1][0]
      expect(latestCall.enabled).toBe(false)
      expect(latestCall.refetchInterval).toBe(false)
    })

    unmount()
  })
})
