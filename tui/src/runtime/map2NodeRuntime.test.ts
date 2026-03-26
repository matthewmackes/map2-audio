import { Map2WebSocket, getWebSocketClient } from '../../../web/src/map2/websocket'
import { healthApi } from '../../../web/src/map2/api'
import { resetMap2Runtime } from '../../../web/src/map2/runtime'
import { configureNodeMap2Runtime } from './map2NodeRuntime'

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(public readonly url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.({ type: 'open' } as Event)
    }, 0)
  }

  send(_data: string): void {}

  close(code = 1000, reason = 'Client disconnecting'): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }
}

describe('configureNodeMap2Runtime', () => {
  const originalFetch = global.fetch

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  beforeEach(() => {
    resetMap2Runtime()
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ status: 'healthy' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    resetMap2Runtime()
    global.fetch = originalFetch
  })

  it('wires the shared API and websocket clients for Node', async () => {
    const runtime = configureNodeMap2Runtime({
      apiBase: 'http://localhost:8080',
      webSocket: MockWebSocket as unknown as typeof WebSocket,
    })
    expect(runtime.apiBase).toBe('http://localhost:8080/api')

    const health = await healthApi.check()
    expect(health.status).toBe('healthy')

    const client = new Map2WebSocket({ url: `${runtime.wsBaseUrl}/ws/v1`, reconnect: false })
    await client.connect()
    expect(client.getStatus()).toBe('connected')
    client.disconnect()
  })

  it('reuses the singleton after runtime configuration', () => {
    configureNodeMap2Runtime({
      apiBase: 'http://localhost:8080',
      webSocket: MockWebSocket as unknown as typeof WebSocket,
    })
    const client = getWebSocketClient()
    expect(client).toBeDefined()
  })
})
