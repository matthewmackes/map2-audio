import { Map2WebSocket, getWebSocketClient } from '../../../web/src/map2/websocket'
import { healthApi } from '../../../web/src/map2/api'
import { configureNodeMap2Runtime } from './map2NodeRuntime'

describe('configureNodeMap2Runtime', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('wires the shared API and websocket clients for Node', async () => {
    const runtime = configureNodeMap2Runtime({ apiBase: 'http://localhost:8080' })
    expect(runtime.apiBase).toBe('http://localhost:8080/api')

    const health = await healthApi.check()
    expect(typeof health.status).toBe('string')

    const client = new Map2WebSocket({ url: `${runtime.wsBaseUrl}/ws/v1`, reconnect: false })
    await client.connect()
    expect(client.getStatus()).toBe('connected')
    client.disconnect()
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  it('reuses the singleton after runtime configuration', () => {
    configureNodeMap2Runtime({ apiBase: 'http://localhost:8080' })
    const client = getWebSocketClient()
    expect(client).toBeDefined()
  })
})
