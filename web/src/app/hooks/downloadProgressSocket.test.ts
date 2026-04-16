import { subscribeToDownloadProgressTopic } from './downloadProgressSocket'
import { getWebSocketClient, type WebSocketMessage } from '../../map2/websocket'

jest.mock('../../map2/websocket', () => ({
  getWebSocketClient: jest.fn(),
}))

describe('subscribeToDownloadProgressTopic', () => {
  const subscribe = jest.fn()
  const connect = jest.fn()
  const isConnected = jest.fn()

  beforeEach(() => {
    subscribe.mockReset()
    connect.mockReset()
    isConnected.mockReset()

    ;(getWebSocketClient as jest.Mock).mockReturnValue({
      subscribe,
      connect,
      isConnected,
    })
  })

  it('shares one websocket subscription per topic across listeners and cleans up when the last listener leaves', () => {
    isConnected.mockReturnValue(true)

    let messageHandler: ((message: WebSocketMessage) => void) | undefined
    const unsubscribe = jest.fn()
    subscribe.mockImplementation((_topic: string, handler: (message: WebSocketMessage) => void) => {
      messageHandler = handler
      return unsubscribe
    })

    const firstListener = jest.fn()
    const secondListener = jest.fn()

    const stopFirst = subscribeToDownloadProgressTopic('download:progress', firstListener)
    const stopSecond = subscribeToDownloadProgressTopic('download:progress', secondListener)

    expect(subscribe).toHaveBeenCalledTimes(1)

    messageHandler?.({ type: 'download_progress', data: { percent: 42 } })

    expect(firstListener).toHaveBeenCalledWith({ type: 'download_progress', data: { percent: 42 } })
    expect(secondListener).toHaveBeenCalledWith({ type: 'download_progress', data: { percent: 42 } })

    stopFirst()
    expect(unsubscribe).not.toHaveBeenCalled()

    stopSecond()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('connects the shared websocket client when a topic listener is added while disconnected', () => {
    isConnected.mockReturnValue(false)
    subscribe.mockReturnValue(jest.fn())
    connect.mockResolvedValue(undefined)

    const stop = subscribeToDownloadProgressTopic('soundfont:download:progress', jest.fn())

    expect(connect).toHaveBeenCalledTimes(1)

    stop()
  })
})

