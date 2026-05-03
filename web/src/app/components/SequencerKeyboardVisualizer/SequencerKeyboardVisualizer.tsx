// SVG piano visualizer + scrolling event log for the Brain Setup task's
// Test phase. Reusable: takes a portName + the live state from
// useMidiDeviceEvents and renders the visualization. The hook lives
// alongside the component (same folder) so any other Brain surface
// (Practice Coach, Perform) can adopt the pair.
//
// The piano is render-cheap: ~30 white keys + ~20 black keys = 50 SVG
// rects, re-rendered on every active-note change. No external SVG
// library — flat <rect>/<line> elements only.

import { useEffect, useMemo, useRef } from 'react'

import { StatusChip } from '../primitives'
import { buildPianoLayout, midiToNoteName, velocityToTint } from './pianoGeometry'
import type { MidiNoteEvent } from './useMidiDeviceEvents'
import './sequencerKeyboardVisualizer.css'

interface SequencerKeyboardVisualizerProps {
  portName: string | null
  activeNotes: Map<number, { note: number; velocity: number; channel: number }>
  log: MidiNoteEvent[]
  isConnected: boolean
  totalReceived: number
  /** From useMidiDeviceEvents — counts every successful (re)connect.
   * 0 means "never connected"; >1 means "we have reconnected at least
   * once during this hook's lifetime". */
  connectAttempts?: number
}

const MAX_VISIBLE_LOG_ROWS = 50

function formatLogRow(evt: MidiNoteEvent): string {
  const parts: string[] = []
  parts.push(evt.message_type)
  if (evt.channel !== null) parts.push(`ch${evt.channel + 1}`)
  if (evt.note !== null) parts.push(midiToNoteName(evt.note))
  if (evt.velocity !== null) parts.push(`vel ${evt.velocity}`)
  return parts.join(' · ')
}

export function SequencerKeyboardVisualizer({
  portName,
  activeNotes,
  log,
  isConnected,
  totalReceived,
  connectAttempts = 0,
}: SequencerKeyboardVisualizerProps) {
  const layout = useMemo(() => buildPianoLayout(), [])
  const logRef = useRef<HTMLOListElement | null>(null)

  // Auto-scroll the log to the bottom on every new event so the operator
  // sees the most recent message without having to scroll. If the operator
  // intentionally scrolls up the auto-follow yields to them — we only
  // auto-scroll when the previous scroll was already pinned to the bottom.
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    const wasPinned = el.scrollHeight - el.scrollTop - el.clientHeight < 16
    if (wasPinned) {
      el.scrollTop = el.scrollHeight
    }
  }, [log.length])

  const visibleLog = log.length > MAX_VISIBLE_LOG_ROWS
    ? log.slice(log.length - MAX_VISIBLE_LOG_ROWS)
    : log

  return (
    <div className="brain-keyboard-visualizer">
      <div className="brain-keyboard-visualizer__header">
        <div className="brain-keyboard-visualizer__header-text">
          <div className="brain-keyboard-visualizer__eyebrow">LIVE MIDI</div>
          <div className="brain-keyboard-visualizer__port-name">
            {portName ?? '—'}
          </div>
        </div>
        <div className="brain-keyboard-visualizer__header-status">
          {(() => {
            // Three connection states:
            //  - never connected (connectAttempts === 0): "Connecting…"
            //    in neutral tone; the operator hasn't seen anything yet.
            //  - currently connected: "WS connected" in live tone, with
            //    "(attempt N)" suffix when N > 1 so reconnects are
            //    legible without being alarming.
            //  - was connected, now isn't: "Reconnecting…" in caution
            //    tone — the auto-reconnect is in flight.
            if (connectAttempts === 0 && !isConnected) {
              return <StatusChip tone="neutral" size="sm" label="Connecting…" />
            }
            if (isConnected) {
              const label = connectAttempts > 1
                ? `WS connected (attempt ${connectAttempts})`
                : 'WS connected'
              return <StatusChip tone="live" size="sm" label={label} />
            }
            return <StatusChip tone="caution" size="sm" label="Reconnecting…" />
          })()}
          <StatusChip
            tone={totalReceived > 0 ? 'ok' : 'neutral'}
            size="sm"
            label={`${totalReceived} events`}
          />
        </div>
      </div>

      <div className="brain-keyboard-visualizer__piano-frame">
        <svg
          className="brain-keyboard-visualizer__piano"
          viewBox={`0 0 ${layout.viewBoxWidth} ${layout.viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Live MIDI keyboard visualizer"
        >
          {/* White keys first (background), then black keys overlay. */}
          {layout.whiteKeys.map((key) => {
            const active = activeNotes.get(key.midi)
            const tint = active ? velocityToTint(active.velocity) : 0
            return (
              <rect
                key={`w-${key.midi}`}
                x={key.x}
                y={0}
                width={key.width}
                height={key.height}
                rx={0}
                ry={0}
                className={
                  'brain-keyboard-visualizer__key brain-keyboard-visualizer__key--white' +
                  (active ? ' brain-keyboard-visualizer__key--active' : '')
                }
                style={active ? { fillOpacity: tint } : undefined}
                data-midi={key.midi}
              />
            )
          })}
          {layout.blackKeys.map((key) => {
            const active = activeNotes.get(key.midi)
            const tint = active ? velocityToTint(active.velocity) : 0
            return (
              <rect
                key={`b-${key.midi}`}
                x={key.x}
                y={0}
                width={key.width}
                height={key.height}
                rx={0}
                ry={0}
                className={
                  'brain-keyboard-visualizer__key brain-keyboard-visualizer__key--black' +
                  (active ? ' brain-keyboard-visualizer__key--active' : '')
                }
                style={active ? { fillOpacity: tint } : undefined}
                data-midi={key.midi}
              />
            )
          })}
        </svg>
      </div>

      <div className="brain-keyboard-visualizer__log-frame">
        <div className="brain-keyboard-visualizer__log-eyebrow">EVENT LOG</div>
        <ol
          ref={logRef}
          className="brain-keyboard-visualizer__log"
          aria-label="Live MIDI event log"
        >
          {visibleLog.length === 0 ? (
            <li className="brain-keyboard-visualizer__log-empty">
              {portName
                ? 'Press a key on the keyboard. Events will appear here as they arrive.'
                : 'No keyboard selected.'}
            </li>
          ) : (
            visibleLog.map((evt) => (
              <li key={evt.id} className="brain-keyboard-visualizer__log-row">
                <span className="brain-keyboard-visualizer__log-row-text">
                  {formatLogRow(evt)}
                </span>
                <span className="brain-keyboard-visualizer__log-row-hex">
                  {evt.raw_hex}
                </span>
              </li>
            ))
          )}
        </ol>
      </div>
    </div>
  )
}
