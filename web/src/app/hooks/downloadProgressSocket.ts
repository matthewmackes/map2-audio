import { getWebSocketClient, type WebSocketMessage, type WebSocketTopic } from '../../map2/websocket'

type DownloadProgressTopic = 'download:progress' | 'soundfont:download:progress'
type DownloadProgressListener = (message: WebSocketMessage) => void

type TopicSubscriptionState = {
  listeners: Set<DownloadProgressListener>
  unsubscribe: (() => void) | null
}

const subscriptionState = new Map<DownloadProgressTopic, TopicSubscriptionState>()

function getTopicState(topic: DownloadProgressTopic): TopicSubscriptionState {
  const existing = subscriptionState.get(topic)
  if (existing) {
    return existing
  }

  const created: TopicSubscriptionState = {
    listeners: new Set(),
    unsubscribe: null,
  }
  subscriptionState.set(topic, created)
  return created
}

function closeTopicSubscription(topic: DownloadProgressTopic, state: TopicSubscriptionState) {
  state.unsubscribe?.()
  state.unsubscribe = null
  if (state.listeners.size === 0) {
    subscriptionState.delete(topic)
  }
}

function ensureTopicSubscription(topic: DownloadProgressTopic, state: TopicSubscriptionState) {
  if (state.unsubscribe || state.listeners.size === 0) {
    return
  }

  const client = getWebSocketClient()
  state.unsubscribe = client.subscribe(topic as WebSocketTopic, (message) => {
    state.listeners.forEach((listener) => listener(message))
  })

  if (!client.isConnected()) {
    void client.connect().catch((error) => {
      console.debug(`WebSocket connect failed for ${topic}, polling fallback remains active`, error)
    })
  }
}

export function subscribeToDownloadProgressTopic(
  topic: DownloadProgressTopic,
  listener: DownloadProgressListener,
): () => void {
  const state = getTopicState(topic)
  state.listeners.add(listener)
  ensureTopicSubscription(topic, state)

  return () => {
    const latestState = getTopicState(topic)
    latestState.listeners.delete(listener)
    if (latestState.listeners.size === 0) {
      closeTopicSubscription(topic, latestState)
    }
  }
}

