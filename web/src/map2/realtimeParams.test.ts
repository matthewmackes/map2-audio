import { createRTParameterClient } from './realtimeParams'

class MockConnectedSocket {
  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Set<(event: { data: string }) => void>>()

  send(payload: string) {
    this.sent.push(payload)
  }

  addEventListener(type: string, handler: (event: { data: string }) => void) {
    const handlers = this.listeners.get(type) ?? new Set()
    handlers.add(handler)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type: string, handler: (event: { data: string }) => void) {
    this.listeners.get(type)?.delete(handler)
  }

  emitJson(payload: Record<string, unknown>) {
    const event = { data: JSON.stringify(payload) }
    this.listeners.get('message')?.forEach((handler) => handler(event))
  }
}

describe('RTParameterClient identity routing', () => {
  it('separates duplicate plugin subscriptions by plugin_position', async () => {
    const client = createRTParameterClient({ url: 'ws://unit.test/ws/rt', reconnect: false })
    const socket = new MockConnectedSocket()
    socket.readyState = 1
    ;(client as any).ws = socket

    const receivedA: number[] = []
    const receivedB: number[] = []

    client.subscribeToParameter(
      'urn:test:duplicate',
      0,
      (update) => receivedA.push(update.value),
      { plugin_position: 0 },
    )
    client.subscribeToParameter(
      'urn:test:duplicate',
      0,
      (update) => receivedB.push(update.value),
      { plugin_position: 1 },
    )

    client.sendParameterUpdate('urn:test:duplicate', 0, 0.42, { plugin_position: 1 })

    ;(client as any).handleMessage(JSON.stringify({
      type: 'param_update',
      plugin_uri: 'urn:test:duplicate',
      param_index: 0,
      plugin_position: 1,
      value: 0.77,
      source: 'internal',
    }))

    expect(receivedA).toEqual([])
    expect(receivedB).toEqual([0.77])

    const sentMessages = socket.sent.map((payload) => JSON.parse(payload))
    expect(sentMessages).toEqual(
      expect.arrayContaining([
        {
          action: 'subscribe',
          plugin_uri: 'urn:test:duplicate',
          param_index: 0,
          plugin_position: 0,
        },
        {
          action: 'subscribe',
          plugin_uri: 'urn:test:duplicate',
          param_index: 0,
          plugin_position: 1,
        },
        {
          action: 'param_update',
          plugin_uri: 'urn:test:duplicate',
          param_index: 0,
          plugin_position: 1,
          value: 0.42,
        },
      ]),
    )
  })
})
