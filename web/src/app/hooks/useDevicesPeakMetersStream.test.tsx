// SPDX-License-Identifier: AGPL-3.0-only
//
// pivot-13b cycle 3 — useDevicesPeakMetersStream hook tests. Uses a
// fake WebSocket constructor so the hook never opens a real socket
// during jsdom runs.

import { act, renderHook, waitFor } from '@testing-library/react'

import { useDevicesPeakMetersStream } from './useDevicesPeakMetersStream'

interface FakeSocket {
  send: jest.Mock
  close: jest.Mock
  url: string
  readyState: number
  onopen: ((event?: Event) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onerror: ((event?: Event) => void) | null
  onclose: ((event?: CloseEvent) => void) | null
}

let lastSocket: FakeSocket | null = null

class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  send = jest.fn()
  close = jest.fn()
  readyState = MockWebSocket.OPEN
  url: string
  onopen: ((event?: Event) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event?: Event) => void) | null = null
  onclose: ((event?: CloseEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    lastSocket = this as unknown as FakeSocket
  }
}

const originalWebSocket = global.WebSocket
beforeAll(() => {
  ;(global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket
})
afterAll(() => {
  ;(global as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket
})

beforeEach(() => {
  lastSocket = null
})

const FRAME = {
  type: 'device_peak_meters:registry',
  schema_version: 1,
  data: {
    devices: [
      {
        device_id: 'edirol-ua-1000',
        input_channels: 10,
        output_channels: 10,
        has_engine_source: false,
        snapshot: {
          input_peak_db: [-150, -150],
          output_peak_db: [-150, -150],
          source: 'placeholder',
          captured_at: 1715731200.5,
        },
      },
    ],
  },
}

describe('useDevicesPeakMetersStream', () => {
  it('opens a websocket to the configured url', () => {
    renderHook(() => useDevicesPeakMetersStream({ url: 'ws://test/peak' }))
    expect(lastSocket).not.toBeNull()
    expect(lastSocket?.url).toBe('ws://test/peak')
  })

  it('marks connected on open and updates devices on frame', async () => {
    const { result } = renderHook(() =>
      useDevicesPeakMetersStream({ url: 'ws://test/peak' }),
    )
    expect(result.current.isConnected).toBe(false)
    expect(result.current.hasFirstFrame).toBe(false)
    act(() => {
      lastSocket?.onopen?.()
    })
    expect(result.current.isConnected).toBe(true)
    act(() => {
      lastSocket?.onmessage?.({ data: JSON.stringify(FRAME) })
    })
    await waitFor(() => {
      expect(result.current.hasFirstFrame).toBe(true)
    })
    expect(result.current.devices).toHaveLength(1)
    expect(result.current.devices[0].device_id).toBe('edirol-ua-1000')
    expect(result.current.devices[0].snapshot?.captured_at).toBeCloseTo(
      1715731200.5,
    )
  })

  it('records a parse error on malformed json frame', async () => {
    const { result } = renderHook(() =>
      useDevicesPeakMetersStream({ url: 'ws://test/peak' }),
    )
    act(() => {
      lastSocket?.onopen?.()
      lastSocket?.onmessage?.({ data: 'not-json' })
    })
    await waitFor(() => {
      expect(result.current.lastError).not.toBeNull()
    })
  })

  it('does not open a socket when enabled=false', () => {
    renderHook(() =>
      useDevicesPeakMetersStream({ url: 'ws://test/peak', enabled: false }),
    )
    expect(lastSocket).toBeNull()
  })
})
