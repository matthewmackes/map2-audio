/**
 * useDeviceConnections — hook unit tests.
 *
 * T2459-G2. Replaces global.WebSocket with a controllable mock so we
 * can drive open/message/close events and assert the hook reduces
 * them into the expected state transitions.
 */

import { act, render, waitFor } from '@testing-library/react'
import * as React from 'react'

import { useDeviceConnections } from './useDeviceConnections'

const ORIGINAL_WS = global.WebSocket

class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  url = ''
  readyState = 0
  onopen: ((e: unknown) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onclose: ((e: unknown) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }
  close(): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose(null)
  }
  // Helpers for tests:
  fireOpen(): void {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) this.onopen(null)
  }
  firePayload(payload: unknown): void {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) } as MessageEvent)
  }
}

afterEach(() => {
  global.WebSocket = ORIGINAL_WS
  MockWebSocket.instances = []
})

function Probe(): React.JSX.Element {
  const state = useDeviceConnections()
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="connected">{Array.from(state.connectedKeys).sort().join(',')}</span>
      <span data-testid="degraded">{Array.from(state.degradedPacks).sort().join(',')}</span>
      <span data-testid="last-event-type">{state.lastEvent?.type ?? ''}</span>
    </div>
  )
}


test('useDeviceConnections: connects WS and applies the initial snapshot', async () => {
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket

  const { getByTestId } = render(<Probe />)
  // Wait for constructor + assigned handlers.
  await waitFor(() => {
    expect(MockWebSocket.instances).toHaveLength(1)
  })
  const ws = MockWebSocket.instances[0]

  act(() => {
    ws.fireOpen()
    ws.firePayload({
      type: 'devices.snapshot',
      data: {
        connected_keys: ['edirol-ua/ua-1000.audio'],
        known_keys: ['edirol-ua/ua-1000.audio'],
        pinned_keys: [],
        degraded_packs: [],
      },
      timestamp: 1.0,
    })
  })

  await waitFor(() => {
    expect(getByTestId('status').textContent).toBe('open')
  })
  expect(getByTestId('connected').textContent).toBe('edirol-ua/ua-1000.audio')
  expect(getByTestId('last-event-type').textContent).toBe('devices.snapshot')
})


test('useDeviceConnections: device.connected adds the key to connectedKeys', async () => {
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket

  const { getByTestId } = render(<Probe />)
  await waitFor(() => {
    expect(MockWebSocket.instances).toHaveLength(1)
  })
  const ws = MockWebSocket.instances[0]

  act(() => {
    ws.fireOpen()
    ws.firePayload({
      type: 'devices.snapshot',
      data: { connected_keys: [], known_keys: [], pinned_keys: [], degraded_packs: [] },
      timestamp: 1.0,
    })
    ws.firePayload({
      type: 'device.connected',
      data: { profile_key: 'hotone/jogg.audio' },
      timestamp: 2.0,
    })
  })

  await waitFor(() => {
    expect(getByTestId('connected').textContent).toBe('hotone/jogg.audio')
  })
  expect(getByTestId('last-event-type').textContent).toBe('device.connected')
})


test('useDeviceConnections: device.disconnected removes the key', async () => {
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket

  const { getByTestId } = render(<Probe />)
  await waitFor(() => {
    expect(MockWebSocket.instances).toHaveLength(1)
  })
  const ws = MockWebSocket.instances[0]

  act(() => {
    ws.fireOpen()
    ws.firePayload({
      type: 'devices.snapshot',
      data: {
        connected_keys: ['edirol-ua/ua-1000.audio', 'hotone/jogg.audio'],
        known_keys: ['edirol-ua/ua-1000.audio', 'hotone/jogg.audio'],
        pinned_keys: [],
        degraded_packs: [],
      },
      timestamp: 1.0,
    })
    ws.firePayload({
      type: 'device.disconnected',
      data: { profile_key: 'hotone/jogg.audio', last_seen_at: 1.5 },
      timestamp: 2.0,
    })
  })

  await waitFor(() => {
    expect(getByTestId('connected').textContent).toBe('edirol-ua/ua-1000.audio')
  })
})


test('useDeviceConnections: pack.degraded adds to degradedPacks', async () => {
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket

  const { getByTestId } = render(<Probe />)
  await waitFor(() => {
    expect(MockWebSocket.instances).toHaveLength(1)
  })
  const ws = MockWebSocket.instances[0]

  act(() => {
    ws.fireOpen()
    ws.firePayload({
      type: 'pack.degraded',
      data: { pack_id: 'brokenco', degraded_files: ['/tmp/x.yaml'] },
      timestamp: 1.0,
    })
  })

  await waitFor(() => {
    expect(getByTestId('degraded').textContent).toBe('brokenco')
  })
})


test('useDeviceConnections: malformed JSON frame is ignored without crashing', async () => {
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket

  const { getByTestId } = render(<Probe />)
  await waitFor(() => {
    expect(MockWebSocket.instances).toHaveLength(1)
  })
  const ws = MockWebSocket.instances[0]

  act(() => {
    ws.fireOpen()
    if (ws.onmessage) ws.onmessage({ data: '{not valid json' } as MessageEvent)
  })

  // Hook stays mounted; status is open (no error transition).
  await waitFor(() => {
    expect(getByTestId('status').textContent).toBe('open')
  })
})
