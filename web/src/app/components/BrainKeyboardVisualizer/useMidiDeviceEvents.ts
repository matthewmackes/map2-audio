// Subscribes to the midi:traffic WS topic for the lifetime of the hook
// and surfaces (a) currently-pressed notes (for the SVG piano visualizer)
// and (b) a recent event log buffer (for the scrolling event list in the
// "Connect a new keyboard" Test phase).
//
// Filtering: every record on midi:traffic includes a `source_port` field;
// we keep only those whose `source_port` matches the hook's `portName`
// argument. When `portName` is null/empty the hook stays disconnected.
//
// The bound buffer caps memory + render cost: we retain the last
// MAX_LOG_SIZE events (default 200) so the operator can scroll back
// without paying unbounded re-render cost.
//
// Released notes auto-evict from `activeNotes` on note-off OR after a
// safety timeout (3000 ms) in case a note-on comes through without a
// matching note-off (sustain pedal weirdness, dropped MIDI cable mid-press).

import { useCallback, useEffect, useRef, useState } from 'react'

import { getWsUrl } from '@/map2/transport'
import { computeBackoffMs } from './wsBackoff'

export interface MidiNoteEvent {
  // Monotonic id assigned client-side so React keys stay stable.
  id: number
  timestamp_ns: number
  message_type: 'note_on' | 'note_off' | 'control_change' | 'program_change' | 'pitch_bend' | 'aftertouch' | 'channel_pressure' | 'sysex' | 'other'
  channel: number | null
  note: number | null
  velocity: number | null
  source_port: string
  raw_hex: string
}

interface ActiveNote {
  note: number
  velocity: number
  channel: number
  // ms-since-epoch, used for the safety eviction timeout.
  pressed_at: number
}

const MAX_LOG_SIZE = 200
const ACTIVE_NOTE_TIMEOUT_MS = 3000

interface MidiTrafficWsPayload {
  timestamp_ns?: number
  source_port?: string
  destination_port?: string
  direction?: 'inbound' | 'outbound'
  raw_hex?: string
  decoded?: {
    message_type?: string
    channel?: number | null
    note?: number | null
    velocity?: number | null
  }
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function classifyMessage(decoded: MidiTrafficWsPayload['decoded']): MidiNoteEvent['message_type'] {
  const mt = decoded?.message_type
  if (mt === 'note_on' || mt === 'note_off' || mt === 'control_change' || mt === 'program_change' || mt === 'pitch_bend' || mt === 'aftertouch' || mt === 'channel_pressure' || mt === 'sysex') {
    return mt
  }
  return 'other'
}

interface UseMidiDeviceEventsResult {
  activeNotes: Map<number, ActiveNote>
  log: MidiNoteEvent[]
  isConnected: boolean
  totalReceived: number
  /** Number of times the WS has been (re)opened during this hook's
   * lifetime. 1 on the first successful connect, 2+ after each
   * reconnect. The visualizer header reads this to surface
   * "Reconnecting (attempt N)" when the connection is bouncing. */
  connectAttempts: number
  clearLog: () => void
}

export function useMidiDeviceEvents(portName: string | null): UseMidiDeviceEventsResult {
  const [activeNotes, setActiveNotes] = useState<Map<number, ActiveNote>>(() => new Map())
  const [log, setLog] = useState<MidiNoteEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [totalReceived, setTotalReceived] = useState(0)
  const [connectAttempts, setConnectAttempts] = useState(0)
  const idCounterRef = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)
  const retryTimerRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)

  const clearLog = useCallback(() => {
    setLog([])
    setActiveNotes(new Map())
  }, [])

  useEffect(() => {
    if (!portName) {
      setIsConnected(false)
      return undefined
    }

    let cancelled = false

    const cancelPendingRetry = () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (cancelled) return
      try {
        const message = JSON.parse(event.data)
        if (message?.type !== 'midi:traffic' || !message?.data) return
        const data: MidiTrafficWsPayload = message.data
        if (!data.source_port || data.source_port !== portName) return
        // We only surface inbound traffic in the Test phase — the operator
        // is verifying the keyboard is sending events, not echoing what we
        // route back out.
        if (data.direction && data.direction !== 'inbound') return

        const messageType = classifyMessage(data.decoded)
        const channel = asNumberOrNull(data.decoded?.channel)
        const note = asNumberOrNull(data.decoded?.note)
        const velocity = asNumberOrNull(data.decoded?.velocity)
        idCounterRef.current += 1
        const evt: MidiNoteEvent = {
          id: idCounterRef.current,
          timestamp_ns: typeof data.timestamp_ns === 'number' ? data.timestamp_ns : Date.now() * 1_000_000,
          message_type: messageType,
          channel,
          note,
          velocity,
          source_port: data.source_port,
          raw_hex: typeof data.raw_hex === 'string' ? data.raw_hex : '',
        }

        setLog((prev) => {
          const next = prev.concat(evt)
          if (next.length > MAX_LOG_SIZE) return next.slice(next.length - MAX_LOG_SIZE)
          return next
        })
        setTotalReceived((prev) => prev + 1)

        if (note !== null && channel !== null) {
          if (messageType === 'note_on' && (velocity ?? 0) > 0) {
            setActiveNotes((prev) => {
              const next = new Map(prev)
              next.set(note, { note, velocity: velocity ?? 0, channel, pressed_at: Date.now() })
              return next
            })
          } else if (messageType === 'note_off' || (messageType === 'note_on' && (velocity ?? 0) === 0)) {
            setActiveNotes((prev) => {
              if (!prev.has(note)) return prev
              const next = new Map(prev)
              next.delete(note)
              return next
            })
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('useMidiDeviceEvents: failed to parse message', err)
      }
    }

    const connect = () => {
      if (cancelled) return
      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        if (cancelled) return
        // Successful connect resets the backoff so the next disconnect
        // starts at attempt 1 again. connectAttempts (the user-visible
        // counter) keeps climbing across reconnects so the UI can show
        // "Reconnected (attempt 4)" rather than always "attempt 1".
        reconnectAttemptRef.current = 0
        setConnectAttempts((prev) => prev + 1)
        setIsConnected(true)
        try {
          ws.send(JSON.stringify({ action: 'subscribe', topic: 'midi:traffic' }))
        } catch {
          // ignore — the next onclose / onerror will trigger a reconnect.
        }
      }

      ws.onmessage = handleMessage

      const scheduleReconnect = () => {
        if (cancelled) return
        cancelPendingRetry()
        reconnectAttemptRef.current += 1
        const delay = computeBackoffMs(reconnectAttemptRef.current)
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null
          connect()
        }, delay)
      }

      ws.onerror = () => {
        if (cancelled) return
        setIsConnected(false)
        // The browser fires onerror followed by onclose for transport
        // failures; let onclose drive the reconnect to avoid scheduling
        // two retries for the same disconnect.
      }

      ws.onclose = () => {
        if (cancelled) return
        setIsConnected(false)
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      cancelled = true
      cancelPendingRetry()
      const ws = wsRef.current
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'midi:traffic' }))
          } catch {
            // ignore
          }
        }
        // Detach handlers before close so the close-driven reconnect path
        // we just installed doesn't fire on the teardown close event.
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.close()
        wsRef.current = null
      }
    }
  }, [portName])

  // Safety eviction: any note that has been "pressed" longer than
  // ACTIVE_NOTE_TIMEOUT_MS without a note-off gets cleared.
  useEffect(() => {
    if (activeNotes.size === 0) return undefined
    const interval = window.setInterval(() => {
      setActiveNotes((prev) => {
        if (prev.size === 0) return prev
        const cutoff = Date.now() - ACTIVE_NOTE_TIMEOUT_MS
        let mutated = false
        const next = new Map(prev)
        for (const [note, entry] of prev) {
          if (entry.pressed_at < cutoff) {
            next.delete(note)
            mutated = true
          }
        }
        return mutated ? next : prev
      })
    }, 500)
    return () => window.clearInterval(interval)
  }, [activeNotes.size])

  return {
    activeNotes,
    log,
    isConnected,
    totalReceived,
    connectAttempts,
    clearLog,
  }
}
