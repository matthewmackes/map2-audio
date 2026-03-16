import { useEffect, useRef, useState, useCallback } from 'react'
import { useWebSocketTopic } from '../../../map2/hooks/useWebSocket'
import './ApiActivityOverlay.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrafficEventData {
  timestamp?: string
  method?: string
  path?: string
  status?: number
  duration_ms?: number
  meta?: {
    req_body?: string | null
    res_body?: string | null
  }
}

interface LogLine {
  id: string
  method: string
  path: string
  status: number
  durationMs: number
  timestamp: string
  reqBody: string | null
  resBody: string | null
  fading: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let lineCounter = 0
function nextId(): string {
  return `al-${++lineCounter}`
}

function statusTier(status: number): '2xx' | '4xx' | '5xx' {
  if (status >= 500) return '5xx'
  if (status >= 400) return '4xx'
  return '2xx'
}

/** Left-truncate a string so the right side is always visible. */
function leftTruncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  return '…' + s.slice(s.length - maxChars + 1)
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch {
    return ''
  }
}

function buildPreview(line: LogLine): string {
  const parts: string[] = []
  parts.push(`${line.method} ${line.path} → ${line.status} ${Math.round(line.durationMs)}ms`)
  if (line.reqBody) parts.push(`req: ${line.reqBody}`)
  if (line.resBody) parts.push(`res: ${line.resBody}`)
  return parts.join('\n')
}

const TTL_MS = 5000
const FADE_MS = 800
const MAX_LINES = 200 // safety cap; display fills height naturally

// ── Component ─────────────────────────────────────────────────────────────────

interface ApiActivityOverlayProps {
  visible: boolean
}

export function ApiActivityOverlay({ visible }: ApiActivityOverlayProps) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Subscribe to the existing traffic_event WS topic
  useWebSocketTopic<TrafficEventData>('traffic_event', useCallback((data) => {
    const path = data?.path ?? ''
    // Only /api/* paths, skip observatory noise
    if (!path.startsWith('/api/') || path.startsWith('/api/observatory')) return

    const line: LogLine = {
      id: nextId(),
      method: data?.method ?? 'GET',
      path,
      status: data?.status ?? 0,
      durationMs: data?.duration_ms ?? 0,
      timestamp: data?.timestamp ?? new Date().toISOString(),
      reqBody: data?.meta?.req_body ?? null,
      resBody: data?.meta?.res_body ?? null,
      fading: false,
    }

    setLines((prev) => {
      const next = [...prev, line]
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
    })

    // Schedule fade-out after TTL
    const fadeTimer = setTimeout(() => {
      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, fading: true } : l)))

      // Remove after fade animation completes
      const removeTimer = setTimeout(() => {
        setLines((prev) => prev.filter((l) => l.id !== line.id))
        timersRef.current.delete(line.id)
      }, FADE_MS)
      timersRef.current.set(line.id + '-rm', removeTimer)
    }, TTL_MS)

    timersRef.current.set(line.id, fadeTimer)
  }, []))

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  // Reset lines when overlay is hidden (route change / toggle)
  useEffect(() => {
    if (!visible) {
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
      setLines([])
      setHoveredId(null)
    }
  }, [visible])

  const hasLines = lines.length > 0
  const hoveredLine = hoveredId ? lines.find((l) => l.id === hoveredId) ?? null : null

  if (!visible || !hasLines) return null

  return (
    <div className="api-overlay" aria-hidden="true">
      {/* Fixed preview box — slides in from top on hover */}
      <div
        className={`api-overlay__preview${hoveredLine ? ' api-overlay__preview--visible' : ''}`}
      >
        {hoveredLine ? buildPreview(hoveredLine) : ''}
      </div>

      {/* Log lines */}
      <div className="api-overlay__log">
        {lines.map((line) => {
          const tier = statusTier(line.status)
          const isHovered = hoveredId === line.id
          const label = leftTruncate(
            `${line.method} ${line.path} → ${line.status} ${Math.round(line.durationMs)}ms`,
            60,
          )
          return (
            <div
              key={line.id}
              className={[
                'api-overlay__line',
                `api-overlay__line--${tier}`,
                line.fading ? 'api-overlay__line--fading' : '',
                isHovered ? 'api-overlay__line--hovered' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setHoveredId(line.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {label}
              {' '}
              <span className="api-overlay__ts">{formatTs(line.timestamp)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ApiActivityOverlay
