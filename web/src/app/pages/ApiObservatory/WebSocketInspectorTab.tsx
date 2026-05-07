import { useMemo, useRef, useState } from 'react'
import { Checkbox, Select, SelectItem, TextInput } from '@carbon/react'

import { JsonDiffViewer, JsonTreeViewer } from '../../components/ApiObservatory/primitives'
import { EmptyState } from '../../components/shared/EmptyState'
import { CodeEditor } from './CodeEditor'
import type { WsConnectionState, WsInspectorMessage } from './types'
import { wsUrl } from '../../utils/apiTarget'

const WS_TEMPLATES = [
  '{"action":"ping"}',
  '{"action":"subscribe","topic":"meters"}',
  '{"action":"subscribe","topic":"schema_changed"}',
  '{"action":"subscribe","topic":"traffic_event"}',
]

function decodeEventType(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>
    return String(candidate.type ?? candidate.topic ?? 'message')
  }
  return 'message'
}

export function WebSocketInspectorTab() {
  const [connections, setConnections] = useState<WsConnectionState[]>([])
  const [messages, setMessages] = useState<WsInspectorMessage[]>([])
  const socketsRef = useRef<Map<string, WebSocket>>(new Map())
  const reconnectTimersRef = useRef<Map<string, number>>(new Map())

  const [newConnectionName, setNewConnectionName] = useState('Local')
  const [newConnectionUrl, setNewConnectionUrl] = useState(wsUrl('/ws'))
  const [composerConnectionId, setComposerConnectionId] = useState<string | null>(null)
  const [composerPayload, setComposerPayload] = useState('{"action":"ping"}')
  const [filterConnectionId, setFilterConnectionId] = useState<string>('all')
  const [filterDirection, setFilterDirection] = useState<'all' | 'sent' | 'received' | 'system'>('all')
  const [filterType, setFilterType] = useState('')
  const [filterText, setFilterText] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordedMessages, setRecordedMessages] = useState<WsInspectorMessage[]>([])
  const [diffIds, setDiffIds] = useState<[string | null, string | null]>([null, null])

  const appendMessage = (message: WsInspectorMessage) => {
    setMessages((prev) => [...prev, message].slice(-10_000))
    if (recording) {
      setRecordedMessages((prev) => [...prev, message])
    }
  }

  const updateConnection = (connectionId: string, updater: (state: WsConnectionState) => WsConnectionState) => {
    setConnections((prev) => prev.map((connection) => (connection.id === connectionId ? updater(connection) : connection)))
  }

  const closeConnection = (connectionId: string) => {
    const socket = socketsRef.current.get(connectionId)
    socket?.close()
    socketsRef.current.delete(connectionId)
    const timer = reconnectTimersRef.current.get(connectionId)
    if (timer) {
      window.clearTimeout(timer)
      reconnectTimersRef.current.delete(connectionId)
    }
    setConnections((prev) => prev.filter((connection) => connection.id !== connectionId))
  }

  const openConnection = (state: WsConnectionState, reconnect = false) => {
    const socket = new WebSocket(state.url)
    socketsRef.current.set(state.id, socket)

    updateConnection(state.id, (current) => ({
      ...current,
      status: 'connecting',
      errorMessage: undefined,
      reconnectAttempts: reconnect ? current.reconnectAttempts + 1 : current.reconnectAttempts,
    }))

    socket.onopen = () => {
      updateConnection(state.id, (current) => ({
        ...current,
        status: 'open',
        openedAt: new Date().toISOString(),
      }))
      appendMessage({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        connectionId: state.id,
        direction: 'system',
        timestamp: new Date().toISOString(),
        eventType: 'connected',
        payload: { message: `Connected to ${state.url}` },
      })
    }

    socket.onmessage = (event) => {
      let payload: unknown = event.data
      if (typeof event.data === 'string') {
        try {
          payload = JSON.parse(event.data)
        } catch {
          payload = event.data
        }
      }

      appendMessage({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        connectionId: state.id,
        direction: 'received',
        timestamp: new Date().toISOString(),
        eventType: decodeEventType(payload),
        payload,
      })

      updateConnection(state.id, (current) => ({
        ...current,
        messageCount: current.messageCount + 1,
      }))
    }

    socket.onerror = () => {
      updateConnection(state.id, (current) => ({
        ...current,
        status: 'error',
        errorMessage: 'WebSocket connection error',
      }))
    }

    socket.onclose = () => {
      updateConnection(state.id, (current) => ({
        ...current,
        status: 'closed',
      }))

      const current = connections.find((connection) => connection.id === state.id)
      const attempts = current?.reconnectAttempts ?? 0
      const maxAttempts = 8
      if (attempts >= maxAttempts) {
        return
      }
      const delay = Math.min(30_000, 500 * Math.pow(2, attempts))
      const timer = window.setTimeout(() => {
        openConnection(state, true)
      }, delay)
      reconnectTimersRef.current.set(state.id, timer)
    }
  }

  const handleAddConnection = () => {
    const trimmedUrl = newConnectionUrl.trim()
    if (!trimmedUrl) {
      return
    }

    const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const state: WsConnectionState = {
      id,
      name: newConnectionName.trim() || `Connection ${connections.length + 1}`,
      url: trimmedUrl,
      status: 'connecting',
      reconnectAttempts: 0,
      messageCount: 0,
      openedAt: null,
    }

    setConnections((prev) => [...prev, state])
    setComposerConnectionId(id)
    openConnection(state)
  }

  const sendMessage = () => {
    if (!composerConnectionId) {
      return
    }
    const socket = socketsRef.current.get(composerConnectionId)
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }
    socket.send(composerPayload)
    appendMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      connectionId: composerConnectionId,
      direction: 'sent',
      timestamp: new Date().toISOString(),
      eventType: decodeEventType(composerPayload),
      payload: (() => {
        try {
          return JSON.parse(composerPayload)
        } catch {
          return composerPayload
        }
      })(),
    })
  }

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      if (filterConnectionId !== 'all' && message.connectionId !== filterConnectionId) {
        return false
      }
      if (filterDirection !== 'all' && message.direction !== filterDirection) {
        return false
      }
      if (filterType.trim() && !message.eventType.toLowerCase().includes(filterType.trim().toLowerCase())) {
        return false
      }
      if (filterText.trim()) {
        const payloadText = typeof message.payload === 'string' ? message.payload : JSON.stringify(message.payload)
        if (!payloadText.toLowerCase().includes(filterText.trim().toLowerCase())) {
          return false
        }
      }
      return true
    })
  }, [filterConnectionId, filterDirection, filterText, filterType, messages])

  const statistics = useMemo(() => {
    const byConnection = new Map<string, { total: number; bytes: number }>()
    filteredMessages.forEach((message) => {
      const payloadText = typeof message.payload === 'string' ? message.payload : JSON.stringify(message.payload)
      const current = byConnection.get(message.connectionId) ?? { total: 0, bytes: 0 }
      current.total += 1
      current.bytes += payloadText.length
      byConnection.set(message.connectionId, current)
    })

    return [...byConnection.entries()].map(([connectionId, data]) => ({
      connectionId,
      total: data.total,
      avgSize: data.total > 0 ? Math.round(data.bytes / data.total) : 0,
    }))
  }, [filteredMessages])

  const diffLeft = filteredMessages.find((message) => message.id === diffIds[0])
  const diffRight = filteredMessages.find((message) => message.id === diffIds[1])

  return (
    <section className="api-observatory-panel api-observatory-websocket">
      <div className="api-observatory-websocket__layout">
        <aside className="api-observatory-websocket__connections">
          <h3>Connections</h3>
          <div className="api-observatory-websocket__new-connection">
            <TextInput
              id="ws-new-connection-name"
              labelText="Connection name"
              hideLabel
              value={newConnectionName}
              onChange={(event) => setNewConnectionName(event.target.value)}
              placeholder="Connection name"
            />
            <TextInput
              id="ws-new-connection-url"
              labelText="Connection URL"
              hideLabel
              value={newConnectionUrl}
              onChange={(event) => setNewConnectionUrl(event.target.value)}
              placeholder="ws://..."
            />
            <button type="button" onClick={handleAddConnection}>Connect</button>
          </div>
          <div className="api-observatory-websocket__connection-list">
            {connections.map((connection) => (
              <div key={connection.id} className={`api-observatory-websocket__connection api-observatory-websocket__connection--${connection.status}`}>
                <div>
                  <strong>{connection.name}</strong>
                  <p>{connection.url}</p>
                  <p>{connection.status} · messages {connection.messageCount} · retries {connection.reconnectAttempts}</p>
                </div>
                <div>
                  <button type="button" onClick={() => setComposerConnectionId(connection.id)}>Use</button>
                  <button type="button" onClick={() => closeConnection(connection.id)}>Close</button>
                </div>
              </div>
            ))}
            {connections.length === 0 && <p>No active connections.</p>}
          </div>

          <h3>Compose and Send</h3>
          <Select
            id="ws-composer-connection"
            labelText="Compose connection"
            hideLabel
            value={composerConnectionId ?? ''}
            onChange={(event) => setComposerConnectionId(event.target.value)}
          >
            <SelectItem value="" text="Select connection" />
            {connections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id} text={connection.name} />
            ))}
          </Select>
          <CodeEditor language="json" value={composerPayload} onChange={setComposerPayload} height={170} />
          <div className="api-observatory-websocket__templates">
            {WS_TEMPLATES.map((template) => (
              <button key={template} type="button" onClick={() => setComposerPayload(template)}>
                Template
              </button>
            ))}
            <button type="button" onClick={sendMessage}>Send</button>
          </div>

          <div className="api-observatory-websocket__recording">
            <button type="button" onClick={() => {
              setRecording((prev) => !prev)
              if (!recording) {
                setRecordedMessages([])
              }
            }}>
              {recording ? 'Stop Recording' : 'Start Recording'}
            </button>
            {recordedMessages.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(recordedMessages, null, 2)], { type: 'application/json' })
                    const href = URL.createObjectURL(blob)
                    const anchor = document.createElement('a')
                    anchor.href = href
                    anchor.download = 'ws-recording.json'
                    anchor.click()
                    URL.revokeObjectURL(href)
                  }}
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => {
                    recordedMessages.forEach((message, index) => {
                      window.setTimeout(() => {
                        const socket = socketsRef.current.get(message.connectionId)
                        if (socket && socket.readyState === WebSocket.OPEN && message.direction === 'sent') {
                          socket.send(typeof message.payload === 'string' ? message.payload : JSON.stringify(message.payload))
                        }
                      }, index * 120)
                    })
                  }}
                >
                  Replay Sent
                </button>
              </>
            )}
          </div>

          <h3>Stats</h3>
          <ul>
            {statistics.map((entry) => (
              <li key={entry.connectionId}>{entry.connectionId}: {entry.total} msgs · avg {entry.avgSize} bytes</li>
            ))}
          </ul>
        </aside>

        <section className="api-observatory-websocket__messages" aria-label="Message stream">
          <header>
            <h3>Message Stream</h3>
            <div className="api-observatory-websocket__filters">
              <Select
                id="ws-filter-connection"
                labelText="Filter by connection"
                hideLabel
                value={filterConnectionId}
                onChange={(event) => setFilterConnectionId(event.target.value)}
              >
                <SelectItem value="all" text="All connections" />
                {connections.map((connection) => (
                  <SelectItem key={connection.id} value={connection.id} text={connection.name} />
                ))}
              </Select>
              <Select
                id="ws-filter-direction"
                labelText="Filter by direction"
                hideLabel
                value={filterDirection}
                onChange={(event) => setFilterDirection(event.target.value as 'all' | 'sent' | 'received' | 'system')}
              >
                <SelectItem value="all" text="All directions" />
                <SelectItem value="sent" text="Sent" />
                <SelectItem value="received" text="Received" />
                <SelectItem value="system" text="System" />
              </Select>
              <TextInput
                id="ws-filter-type"
                labelText="Filter by event type"
                hideLabel
                value={filterType}
                onChange={(event) => setFilterType(event.target.value)}
                placeholder="Event type"
              />
              <TextInput
                id="ws-filter-text"
                labelText="Filter by payload text"
                hideLabel
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder="Payload text"
              />
            </div>
          </header>

          <div className="api-observatory-websocket__message-list">
            {filteredMessages.map((message) => (
              <article key={message.id} className={`api-observatory-websocket__message api-observatory-websocket__message--${message.direction}`}>
                <header>
                  <div>
                    <strong>{message.eventType}</strong>
                    <span>{message.connectionId}</span>
                  </div>
                  <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                </header>
                <JsonTreeViewer value={message.payload} maxHeight={180} />
                <Checkbox
                  id={`ws-diff-${message.id}`}
                  labelText="Diff"
                  checked={diffIds[0] === message.id || diffIds[1] === message.id}
                  onChange={(_event, { checked }) => {
                    if (!checked) {
                      setDiffIds((prev) => [prev[0] === message.id ? null : prev[0], prev[1] === message.id ? null : prev[1]])
                      return
                    }
                    setDiffIds((prev) => {
                      if (!prev[0]) return [message.id, prev[1]]
                      if (!prev[1]) return [prev[0], message.id]
                      return [prev[1], message.id]
                    })
                  }}
                />
              </article>
            ))}
            {filteredMessages.length === 0 && (
              <EmptyState
                title="No messages match the current filters"
                description="Adjust the filter fields or wait for more WebSocket traffic."
                compact
                align="left"
              />
            )}
          </div>

          {diffLeft && diffRight && (
            <div className="api-observatory-websocket__diff">
              <h4>Message Diff</h4>
              <JsonDiffViewer left={diffLeft.payload} right={diffRight.payload} />
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

export default WebSocketInspectorTab
