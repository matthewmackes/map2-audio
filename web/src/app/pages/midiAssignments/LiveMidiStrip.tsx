/**
 * LiveMidiStrip — real-time MIDI activity panel.
 *
 * Q9 decisions:
 *   - Toggleable (collapse/expand) via header chevron
 *   - Filtered by default to the active surface; "Show all sources" widens
 *   - Subscribes to `midi_activity` WebSocket topic for real-time message stream
 *   - Falls back to /v2/midi/status polling if WS isn't carrying traffic yet
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from '@carbon/icons-react'
import { midiApiV2 } from '../../../map2/api'
import { useWebSocketTopic } from '../../../map2/hooks/useWebSocket'

export interface MidiMessage {
  type: 'cc' | 'note' | 'pc' | 'other'
  cc?: number
  note?: number
  pc?: number
  ch: number
  v?: number
  ts: string
  source?: string
}

export interface LiveMidiState {
  level: number
  last: MidiMessage | null
  feed: MidiMessage[]
  listening: boolean
}

interface LiveMidiStripProps {
  /** Set externally — when true, capture next message and clear the flag. */
  listening: boolean
  /** Called with the captured message when listening picks one up. */
  onCapture: (message: MidiMessage) => void
  /** Active surface short label / id used for the source filter. */
  activeSurfaceLabel: string | null
  /** Source filter setting; null = all sources. */
  sourceFilter: string | null
  /** Visible state from parent. */
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Optional: human-readable target preview line shown in the strip. */
  bindingPreview?: React.ReactNode
}

const FEED_MAX = 60

export function LiveMidiStrip({
  listening,
  onCapture,
  activeSurfaceLabel,
  sourceFilter,
  collapsed,
  onToggleCollapsed,
  bindingPreview,
}: LiveMidiStripProps) {
  const [state, setState] = useState<LiveMidiState>({ level: 0, last: null, feed: [], listening })
  const stateRef = useRef(state)
  stateRef.current = state
  const listeningRef = useRef(listening)
  listeningRef.current = listening

  // Decay the level meter
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setState((prev) => prev.level > 0 ? { ...prev, level: Math.max(0, prev.level - 0.05) } : prev)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const ingest = useCallback((message: MidiMessage) => {
    setState((prev) => {
      const feed = [message, ...prev.feed].slice(0, FEED_MAX)
      return { ...prev, feed, last: message, level: 1, listening: listeningRef.current }
    })
    if (listeningRef.current) {
      onCapture(message)
    }
  }, [onCapture])

  // WS topic — real-time messages. Backend uses `midi_activity` topic.
  // Backend payload shape varies (cc, note_on/off, program_change, etc.) so
  // the data is treated as an unknown record and each candidate field is
  // probed in turn — avoids `any` while keeping the loose backend contract.
  useWebSocketTopic<Record<string, unknown>>('midi_activity', (data, message) => {
    if (!data) return
    const ts = (() => {
      const t = new Date(message?.timestamp ?? Date.now())
      return `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`
    })()
    const messageType = (message as { type?: unknown } | undefined)?.type
    const t = (data.type ?? data.kind ?? messageType) as string | undefined
    const ch = Number(data.channel ?? data.ch ?? 0)
    const portRaw = data.port ?? data.source ?? data.device ?? null
    const port = portRaw == null ? null : String(portRaw)
    let parsed: MidiMessage | null = null
    if (t === 'cc' || t === 'control_change' || t === 'midi_cc') {
      parsed = { type: 'cc', cc: Number(data.cc ?? data.controller ?? data.data1), ch, v: Number(data.value ?? data.data2), ts, source: port }
    } else if (t === 'note' || t === 'note_on' || t === 'note_off') {
      parsed = { type: 'note', note: Number(data.note ?? data.data1), ch, v: Number(data.velocity ?? data.value ?? data.data2), ts, source: port }
    } else if (t === 'pc' || t === 'program_change') {
      parsed = { type: 'pc', pc: Number(data.program ?? data.pc ?? data.data1), ch, ts, source: port }
    }
    if (!parsed) return
    // Apply source filter (Q9 — by default scope to active surface)
    if (sourceFilter && parsed.source && !String(parsed.source).toLowerCase().includes(sourceFilter.toLowerCase())) {
      return
    }
    ingest(parsed)
  })

  // Polling fallback — if WS isn't carrying activity, /v2/midi/status still updates
  // last_channel/last_cc/last_value. Use it as a low-frequency tap.
  const statusQuery = useQuery({
    queryKey: ['midi', 'status'],
    queryFn: () => midiApiV2.getStatus(),
    refetchInterval: 500,
  })
  const lastSeenStatusKey = useRef<string>('')
  useEffect(() => {
    const s = statusQuery.data
    if (!s) return
    const key = `${s.last_channel}-${s.last_cc}-${s.last_value}`
    if (key === lastSeenStatusKey.current) return
    lastSeenStatusKey.current = key
    if (s.last_cc < 0) return
    const t = new Date()
    const ts = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`
    // Only ingest if WS hasn't been delivering — debounce window is the polling tick itself.
    const lastWs = stateRef.current.last
    if (lastWs && Date.now() - new Date(`1970-01-01T00:${lastWs.ts}Z`).getTime() < 1000) return
    ingest({ type: 'cc', cc: s.last_cc, ch: s.last_channel, v: s.last_value, ts, source: 'status-poll' })
  }, [statusQuery.data, ingest])

  const lastLabel = useMemo(() => {
    const last = state.last
    if (!last) return '—'
    if (last.type === 'cc') return <>CC <span className="accent">{last.cc}</span> · ch {last.ch} · v {last.v}</>
    if (last.type === 'note') return <>Note <span className="accent">{last.note}</span> · ch {last.ch} · v {last.v}</>
    if (last.type === 'pc') return <>PC <span className="accent">{last.pc}</span> · ch {last.ch}</>
    return '—'
  }, [state.last])

  if (collapsed) {
    return (
      <div className="live live--collapsed">
        <button type="button" className="live-toggle" onClick={onToggleCollapsed} aria-label="Expand live MIDI strip">
          <ChevronLeft size={14} /> Live MIDI
        </button>
      </div>
    )
  }

  return (
    <div className="live">
      <div className="head">
        <span>● Live MIDI</span>
        <span style={{ color: listening ? 'var(--accent)' : 'var(--text-3)' }}>
          {listening ? 'LISTENING' : 'monitoring'}
        </span>
        <button
          type="button"
          className="live-toggle"
          onClick={onToggleCollapsed}
          style={{ marginLeft: 'auto' }}
          aria-label="Collapse live MIDI strip"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="meter">
        <div className="bar" style={{ transform: `scaleX(${state.level})` }} />
      </div>

      <div className="last">
        <div className="lbl">last message</div>
        <div className="val">{lastLabel}</div>
      </div>

      {bindingPreview && (
        <div className="last">
          <div className="lbl">target binding</div>
          <div className="val" style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>
            {bindingPreview}
          </div>
        </div>
      )}

      <div className="last" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
        <div className="lbl" style={{ marginBottom: 6 }}>
          activity feed
          {sourceFilter && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>· filtered: {activeSurfaceLabel}</span>}
        </div>
        <div className="feed">
          {state.feed.length === 0 && <div className="row" style={{ color: 'var(--text-4)' }}>waiting for traffic…</div>}
          {state.feed.slice(0, 30).map((m, i) => (
            <div key={`${m.ts}-${i}`} className={`row ${m.type === 'pc' ? 'pc' : ''}`}>
              <span className="t">{m.ts}</span>{' '}
              <span className="ch">ch{m.ch}</span>{' '}
              {m.type === 'cc' && <><span className="cc">CC {m.cc}</span> v{m.v}</>}
              {m.type === 'note' && <><span className="cc">N {m.note}</span> v{m.v}</>}
              {m.type === 'pc' && <><span className="cc">PC {m.pc}</span></>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
