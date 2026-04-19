import { useEffect, useMemo, useState } from 'react'

import { StatusBadge, MethodBadge, JsonTreeViewer } from '../../components/ApiObservatory/primitives'
import { useWebSocketTopic } from '../../../map2/hooks/useWebSocket'
import { useToasts } from '../../components/Toasts'
import {
  exportTrafficSession,
  getTrafficEvents,
  getTrafficSession,
  getTrafficStats,
  importTrafficSession,
  listTrafficSessions,
  startTrafficRecording,
  stopTrafficRecording,
} from './api'
import type { TrafficEventItem, TrafficStats } from './types'

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeTrafficEvent(value: unknown): TrafficEventItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  if (!id) {
    return null
  }

  const status = Number(row.status)
  const durationMs = Number(row.duration_ms)
  const requestSize = Number(row.request_size)
  const responseSize = Number(row.response_size)
  if (![status, durationMs, requestSize, responseSize].every(Number.isFinite)) {
    return null
  }

  return {
    id,
    timestamp: typeof row.timestamp === 'string' ? row.timestamp : new Date().toISOString(),
    method: typeof row.method === 'string' ? row.method : 'GET',
    path: typeof row.path === 'string' ? row.path : '/',
    status,
    duration_ms: durationMs,
    request_size: requestSize,
    response_size: responseSize,
    client_ip: typeof row.client_ip === 'string' ? row.client_ip : 'unknown',
    request_id: typeof row.request_id === 'string' ? row.request_id : '',
    node_id: typeof row.node_id === 'string' ? row.node_id : undefined,
    meta: row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
      ? row.meta as Record<string, unknown>
      : undefined,
  }
}

function sanitizeTrafficEvents(value: unknown): TrafficEventItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => normalizeTrafficEvent(item))
    .filter((item): item is TrafficEventItem => item !== null)
}

export function TrafficMonitorTab() {
  const [events, setEvents] = useState<TrafficEventItem[]>([])
  const [stats, setStats] = useState<TrafficStats | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [methodFilter, setMethodFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pathFilter, setPathFilter] = useState('')
  const [durationFilter, setDurationFilter] = useState('')
  const [sizeFilter, setSizeFilter] = useState('')
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Array<{ session_id: string; name: string; started_at: string; stopped_at: string | null; event_count: number }>>([])
  const { pushToast } = useToasts()

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null

  const reload = async () => {
    const filters = {
      method: methodFilter || undefined,
      status_min: statusFilter || undefined,
      path_pattern: pathFilter || undefined,
      min_duration_ms: durationFilter || undefined,
      min_size_bytes: sizeFilter || undefined,
      limit: 1000,
    }
    const [traffic, summary, sessionList] = await Promise.all([
      getTrafficEvents(filters),
      getTrafficStats(filters),
      listTrafficSessions(),
    ])
    setEvents(sanitizeTrafficEvents(traffic.events))
    setStats(summary)
    setSessions(sessionList.sessions)
    setRecordingSessionId(traffic.recording_session_id)
  }

  useEffect(() => {
    void reload()
    const timer = window.setInterval(() => {
      if (!paused) {
        void reload()
      }
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [methodFilter, pathFilter, paused, sizeFilter, statusFilter, durationFilter])

  useWebSocketTopic('traffic_event', (data) => {
    if (paused) {
      return
    }
    const event = normalizeTrafficEvent(data)
    if (!event) {
      return
    }
    setEvents((prev) => [...prev.filter((item) => Boolean(item?.id)), event].slice(-1000))
    if (event.duration_ms > 2000) {
      pushToast(`Slow request detected: ${event.path} took ${event.duration_ms.toFixed(0)}ms`, 'warn')
    }
  })

  const waterfall = useMemo(() => {
    const maxDuration = Math.max(...events.map((event) => event.duration_ms), 1)
    return events.slice(-80).map((event) => ({
      ...event,
      width: Math.max((event.duration_ms / maxDuration) * 100, 1),
    }))
  }, [events])

  const startRecording = async () => {
    const session = await startTrafficRecording(`Session ${new Date().toLocaleTimeString()}`)
    setRecordingSessionId(session.session_id)
    pushToast(`Traffic recording started: ${session.name}`, 'info')
    await reload()
  }

  const stopRecording = async () => {
    try {
      const session = await stopTrafficRecording()
      setRecordingSessionId(null)
      pushToast(`Traffic recording saved: ${session.event_count} events`, 'success')
      await reload()
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Failed to stop recording', 'error')
    }
  }

  const loadSession = async (sessionId: string) => {
    const session = await getTrafficSession(sessionId)
    const nextEvents = sanitizeTrafficEvents(session.events)
    setEvents(nextEvents)
    setStats(session.stats)
    setSelectedEventId(nextEvents[0]?.id ?? null)
  }

  return (
    <section className="api-observatory-panel api-observatory-traffic">
      <div className="api-observatory-traffic__controls">
        <button type="button" onClick={() => setPaused((prev) => !prev)}>{paused ? 'Resume live' : 'Pause live'}</button>
        {!recordingSessionId ? (
          <button type="button" onClick={startRecording}>Record</button>
        ) : (
          <button type="button" onClick={stopRecording}>Stop Recording</button>
        )}
        <button type="button" onClick={() => void reload()}>Refresh</button>

        <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
          <option value="">All methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>

        <input value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} placeholder="Status >=" />
        <input value={pathFilter} onChange={(event) => setPathFilter(event.target.value)} placeholder="Path regex" />
        <input value={durationFilter} onChange={(event) => setDurationFilter(event.target.value)} placeholder="Min ms" />
        <input value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)} placeholder="Min bytes" />
      </div>

      <div className="api-observatory-traffic__stats-grid">
        <div><span>Total</span><strong>{stats?.total_requests ?? 0}</strong></div>
        <div><span>Avg</span><strong>{stats?.avg_response_ms?.toFixed(1) ?? '0.0'}ms</strong></div>
        <div><span>P95</span><strong>{stats?.p95_ms?.toFixed(1) ?? '0.0'}ms</strong></div>
        <div><span>P99</span><strong>{stats?.p99_ms?.toFixed(1) ?? '0.0'}ms</strong></div>
        <div><span>Error rate</span><strong>{stats?.error_rate_percent?.toFixed(1) ?? '0.0'}%</strong></div>
        <div><span>Req/s</span><strong>{stats?.requests_per_second?.toFixed(2) ?? '0.00'}</strong></div>
      </div>

      <section className="api-observatory-traffic__waterfall">
        <header>
          <h3>Waterfall</h3>
        </header>
        <div className="api-observatory-traffic__waterfall-bars">
          {waterfall.map((event) => (
            <button
              key={event.id}
              type="button"
              className={`api-observatory-traffic__bar api-observatory-traffic__bar--${event.method.toLowerCase()}`}
              style={{ width: `${event.width}%` }}
              onClick={() => setSelectedEventId(event.id)}
              title={`${event.method} ${event.path} ${event.duration_ms.toFixed(1)}ms`}
            >
              <span>{event.method} {event.path}</span>
              <span>{event.duration_ms.toFixed(1)}ms</span>
            </button>
          ))}
        </div>
      </section>

      <div className="api-observatory-traffic__layout">
        <section className="api-observatory-traffic__table">
          <h3>Requests</h3>
          <div className="api-observatory-traffic__table-rows">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`api-observatory-traffic__row${selectedEventId === event.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedEventId(event.id)}
              >
                <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                <MethodBadge method={event.method} compact />
                <StatusBadge status={event.status} compact />
                <span>{event.path}</span>
                <span>{event.duration_ms.toFixed(1)}ms</span>
                <span>{fmtBytes(event.response_size)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="api-observatory-traffic__detail">
          <h3>Request Detail</h3>
          {selectedEvent ? (
            <>
              <p>
                <strong>{selectedEvent.method}</strong> {selectedEvent.path} · <StatusBadge status={selectedEvent.status} compact />
              </p>
              <JsonTreeViewer value={selectedEvent} maxHeight={340} />
            </>
          ) : (
            <p>Select a request to inspect details.</p>
          )}
        </section>

        <section className="api-observatory-traffic__sessions">
          <h3>Sessions</h3>
          <div className="api-observatory-traffic__session-list">
            {sessions.map((session) => (
              <div key={session.session_id}>
                <button type="button" onClick={() => void loadSession(session.session_id)}>
                  {session.name} ({session.event_count})
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const payload = await exportTrafficSession(session.session_id, 'json')
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                    const href = URL.createObjectURL(blob)
                    const anchor = document.createElement('a')
                    anchor.href = href
                    anchor.download = `${session.name.replace(/\s+/g, '-').toLowerCase()}.json`
                    anchor.click()
                    URL.revokeObjectURL(href)
                  }}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const payload = await exportTrafficSession(session.session_id, 'har')
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                    const href = URL.createObjectURL(blob)
                    const anchor = document.createElement('a')
                    anchor.href = href
                    anchor.download = `${session.name.replace(/\s+/g, '-').toLowerCase()}.har.json`
                    anchor.click()
                    URL.revokeObjectURL(href)
                  }}
                >
                  Export HAR
                </button>
              </div>
            ))}
            {sessions.length === 0 && <p>No saved sessions.</p>}
          </div>
          <label className="api-observatory-traffic__import">
            Import Session
            <input
              type="file"
              accept="application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) {
                  return
                }
                const text = await file.text()
                try {
                  const payload = JSON.parse(text) as Record<string, unknown>
                  await importTrafficSession(payload)
                  pushToast('Session imported', 'success')
                  await reload()
                } catch {
                  pushToast('Failed to import session JSON', 'error')
                }
              }}
            />
          </label>
        </section>
      </div>

      {stats && (
        <section className="api-observatory-traffic__analytics">
          <h3>Top Endpoints</h3>
          <div>
            <h4>Slowest</h4>
            <ul>
              {stats.top_slowest_endpoints.map((entry) => (
                <li key={`${entry.method}-${entry.path}-${entry.duration_ms}`}>
                  <MethodBadge method={entry.method} compact /> {entry.path} - {entry.duration_ms.toFixed(1)}ms
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Most Called</h4>
            <ul>
              {stats.top_called_endpoints.map((entry) => (
                <li key={entry.path}>{entry.path} - {entry.count}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Response Size</h4>
            <ul>
              {stats.response_size_by_endpoint.map((entry) => (
                <li key={entry.path}>{entry.path} - {fmtBytes(entry.size_bytes)}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </section>
  )
}

export default TrafficMonitorTab
