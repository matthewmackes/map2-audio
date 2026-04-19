import type { PlatformEvent } from '../../map2/platformEvent'
import type { ConnectionStatus, Map2WebSocket, WebSocketMessage } from '../../map2/websocket'
import { getWebSocketClient } from '../../map2/websocket'

export const PLATFORM_EVENT_SESSION_STORAGE_KEY = 'map2_platform_event_session_id'
export const PLATFORM_EVENT_CURSOR_STORAGE_KEY = 'map2_platform_event_cursor'

export interface PlatformEventTransportUpdate {
  events?: PlatformEvent[]
  connected?: boolean
  replayComplete?: boolean
  sessionId?: string
  replayCursor?: string | null
}

export interface PlatformEventTransport {
  start: () => () => void
  subscribe: (listener: (update: PlatformEventTransportUpdate) => void) => () => void
  ack: (eventId: string) => void
  getSessionId: () => string
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.sessionStorage
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.localStorage
}

function createSessionId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `platform-session-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

export function getOrCreatePlatformEventSessionId(): string {
  const storage = getSessionStorage()
  const existing = storage?.getItem(PLATFORM_EVENT_SESSION_STORAGE_KEY)?.trim()
  if (existing) {
    return existing
  }
  const created = createSessionId()
  storage?.setItem(PLATFORM_EVENT_SESSION_STORAGE_KEY, created)
  return created
}

export function getStoredPlatformEventCursor(): string | null {
  return getLocalStorage()?.getItem(PLATFORM_EVENT_CURSOR_STORAGE_KEY) ?? null
}

function storePlatformEventCursor(cursor: string | null | undefined): void {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }
  if (!cursor) {
    storage.removeItem(PLATFORM_EVENT_CURSOR_STORAGE_KEY)
    return
  }
  storage.setItem(PLATFORM_EVENT_CURSOR_STORAGE_KEY, cursor)
}

function toPlatformEvents(message: WebSocketMessage): PlatformEvent[] {
  const payload = message.data
  if (Array.isArray(payload)) {
    return payload.filter((item): item is PlatformEvent => Boolean(item && typeof item === 'object' && 'event_id' in item))
  }
  if (payload && typeof payload === 'object') {
    if (Array.isArray((payload as { events?: unknown[] }).events)) {
      return (payload as { events: unknown[] }).events.filter(
        (item): item is PlatformEvent => Boolean(item && typeof item === 'object' && 'event_id' in item),
      )
    }
    if ('event_id' in payload) {
      return [payload as PlatformEvent]
    }
  }
  return []
}

export function createPlatformEventTransport(
  client: Map2WebSocket = getWebSocketClient(),
): PlatformEventTransport {
  const listeners = new Set<(update: PlatformEventTransportUpdate) => void>()
  const sessionId = getOrCreatePlatformEventSessionId()
  let started = false

  const emit = (update: PlatformEventTransportUpdate) => {
    if (update.replayCursor !== undefined) {
      storePlatformEventCursor(update.replayCursor)
    }
    listeners.forEach((listener) => listener(update))
  }

  const requestReplay = () => {
    client.sendAction({
      action: 'replay',
      topic: 'platform:events',
      session_id: sessionId,
      cursor: getStoredPlatformEventCursor(),
    })
  }

  const handleStatusChange = (status: ConnectionStatus) => {
    const connected = status === 'connected'
    emit({ connected, sessionId })
    if (connected) {
      requestReplay()
    }
  }

  const handleMessage = (message: WebSocketMessage) => {
    const events = toPlatformEvents(message)
    if (events.length > 0) {
      const replayCursor = events[0]?.event_id ?? null
      emit({
        events,
        replayCursor,
      })
    }

    if (message.type === 'platform_event_replay_complete' || (message.data && (message.data as { replay_complete?: boolean }).replay_complete)) {
      emit({ replayComplete: true })
    }
  }

  return {
    start: () => {
      if (started) {
        return () => {}
      }
      started = true
      emit({
        connected: client.getStatus() === 'connected',
        replayCursor: getStoredPlatformEventCursor(),
        sessionId,
      })
      const unsubscribeStatus = client.onStatusChange(handleStatusChange)
      const unsubscribeTopic = client.subscribe('platform:events', handleMessage)
      if (client.isConnected()) {
        requestReplay()
      }
      return () => {
        unsubscribeStatus()
        unsubscribeTopic()
        started = false
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    ack: (eventId) => {
      client.sendAction({
        action: 'platform_event_ack',
        topic: 'platform:events',
        session_id: sessionId,
        event_id: eventId,
      })
    },
    getSessionId: () => sessionId,
  }
}

let globalPlatformEventTransport: PlatformEventTransport | null = null

export function getPlatformEventTransport(): PlatformEventTransport {
  if (!globalPlatformEventTransport) {
    globalPlatformEventTransport = createPlatformEventTransport()
  }
  return globalPlatformEventTransport
}

