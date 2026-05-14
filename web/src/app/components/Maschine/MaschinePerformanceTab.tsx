import { Tag, Tile } from '@carbon/react'
import { useEffect, useMemo, useState } from 'react'

import { MaschinePadCurveEditor } from './MaschinePadCurveEditor'
import { MaschineQuadMorphZone } from './MaschineQuadMorphZone'
import { MaschineStepSequencer } from './MaschineStepSequencer'
import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
  MaschineHidEvent,
  MaschinePadLedState,
} from '../../../map2/types'

// T2522-C — Performance tab v1.
//
// Player-facing surface (vs. the engineering Diagnostics tab and the
// debug-oriented Hardware Twin). Cycle 5 ships:
//
//   • Big 4×4 pad grid with live LED color/state, last-velocity
//     readout (from the most recent pad_press in the last 800ms),
//     and a bottom-up pressure-fill bar driven by pad_aftertouch
//     events.
//   • Header strip — kit/snapshot name, live BPM (best-effort from
//     the encoder-map tempo slot), connection status.
//   • Scene strip — 8 group-button slots A-H, lit when their LED
//     slot in led_array is non-zero. Cycle 7 wires this to real
//     scene-recall semantics; today it surfaces the LED state.
//   • Foot zone — Quad Morph XY placeholder (cycle 8 adds the real
//     touch-target XY plus AutomationEngine ModulationSource hookup).
//
// Subsequent cycles (6/7/8) extend this same component; the shell
// shape stays stable so we can iterate the inner panels without
// re-laying out the page.

const PAD_COLOR_MAP: Record<string, string> = {
  empty: '#1c2030',
  red: '#fa4d56',
  orange: '#ff832b',
  yellow: '#f1c21b',
  green: '#42be65',
  cyan: '#33b1ff',
  blue: '#4589ff',
  magenta: '#ff7eb6',
  white: '#f4f4f4',
}

const VELOCITY_DECAY_MS = 800
const PRESSURE_DECAY_MS = 250

interface PadEventState {
  velocity: number
  pressure: number
  velocityTimestamp: number
  pressureTimestamp: number
}

function emptyPadState(): PadEventState {
  return { velocity: 0, pressure: 0, velocityTimestamp: 0, pressureTimestamp: 0 }
}

function padFill(pad: MaschinePadLedState | undefined): string {
  if (!pad) return PAD_COLOR_MAP.empty
  const base = PAD_COLOR_MAP[pad.color] ?? PAD_COLOR_MAP.empty
  return pad.state === 'off' ? PAD_COLOR_MAP.empty : base
}

function padOpacity(pad: MaschinePadLedState | undefined): number {
  if (!pad) return 0.45
  if (pad.state === 'off') return 0.45
  if (pad.state === 'dim') return 0.7
  return 1.0
}

interface MaschinePerformanceTabProps {
  status: MaschineDaemonStatus | null
  encoderMap: MaschineEncoderMap | null
  hidEvents: MaschineHidEvent[]
  onPadClick?: (padIndex: number) => void
}

export function MaschinePerformanceTab({
  status,
  encoderMap,
  hidEvents,
  onPadClick,
}: MaschinePerformanceTabProps) {
  // Per-pad live velocity + pressure derived from the rolling HID
  // history. Stored in component state so we can re-render when the
  // decay window elapses.
  const [padState, setPadState] = useState<Map<number, PadEventState>>(() => new Map())
  const [, forceTick] = useState(0)

  // Re-derive pad state whenever the HID history updates. Walk the
  // events newest-first and stop once we have the most recent press
  // and aftertouch per pad — anything older is irrelevant for the
  // live readout.
  useEffect(() => {
    if (!hidEvents || hidEvents.length === 0) return
    const next = new Map<number, PadEventState>()
    for (let i = hidEvents.length - 1; i >= 0; i -= 1) {
      const event = hidEvents[i]
      const payload = (event.payload ?? {}) as {
        pad_index?: number
        velocity?: number
        pressure?: number
      }
      const padIdx = payload.pad_index
      if (typeof padIdx !== 'number') continue
      const existing = next.get(padIdx) ?? emptyPadState()
      const ts = Date.parse(event.timestamp ?? '') || Date.now()
      if (event.decoded_type === 'pad_press' && existing.velocityTimestamp === 0) {
        existing.velocity = payload.velocity ?? 0
        existing.velocityTimestamp = ts
      }
      if (
        (event.decoded_type === 'pad_press' || event.decoded_type === 'pad_aftertouch') &&
        existing.pressureTimestamp === 0
      ) {
        existing.pressure = payload.pressure ?? 0
        existing.pressureTimestamp = ts
      }
      next.set(padIdx, existing)
      if (next.size === 16) break
    }
    setPadState(next)
  }, [hidEvents])

  // Tick re-render so decay clears the readouts even when no new HID
  // events arrive. ~60fps would be wasted for a UI surface; 10fps is
  // plenty for velocity decay visuals.
  useEffect(() => {
    const handle = window.setInterval(() => {
      forceTick((n) => n + 1)
    }, 100)
    return () => window.clearInterval(handle)
  }, [])

  const padLeds = useMemo(() => {
    const map = new Map<number, MaschinePadLedState>()
    for (const pad of status?.led_state?.pads ?? []) {
      map.set(pad.index, pad)
    }
    return map
  }, [status])


  // Best-effort BPM: encoderMap.tempo carries the master MIDI clock
  // BPM as a fixed-label slot; if the daemon hasn't reported it, fall
  // back to the snapshot heading.
  const tempoLabel: string = useMemo(() => {
    const tempo = (encoderMap as unknown as Record<string, { label?: string } | null> | null)?.tempo
    return tempo?.label ?? 'BPM —'
  }, [encoderMap])

  const snapshotName = status?.audio_grid?.snapshot_name ?? 'No snapshot'
  const isConnected = Boolean(status?.connected)

  const blocksByPad = useMemo(() => {
    const map = new Map<number, { name: string; bypassed: boolean }>()
    for (const block of status?.audio_grid?.blocks ?? []) {
      const padIdx = block.pad_index
      if (padIdx === undefined || padIdx === null) continue
      map.set(padIdx, {
        name: block.plugin_name ?? block.chain_name ?? `Block ${block.block_id}`,
        bypassed: Boolean(block.bypassed),
      })
    }
    return map
  }, [status])

  const renderPad = (visualRow: number, col: number) => {
    // Pad 0 sits at bottom-left in the cabl protocol; the visual top-
    // left shows pad 12. Translate visual coordinates to pad index.
    const cablRow = 3 - visualRow
    const padIdx = cablRow * 4 + col
    const led = padLeds.get(padIdx)
    const fill = padFill(led)
    const opacity = padOpacity(led)
    const state = padState.get(padIdx) ?? emptyPadState()
    const now = Date.now()
    const velocityFresh = now - state.velocityTimestamp < VELOCITY_DECAY_MS
    const pressureFresh = now - state.pressureTimestamp < PRESSURE_DECAY_MS
    const block = blocksByPad.get(padIdx)
    const isClickable = Boolean(block && onPadClick)

    return (
      <button
        key={`perf-pad-${padIdx}`}
        type="button"
        className={[
          'maschine-perf__pad',
          led?.selected ? 'maschine-perf__pad--selected' : '',
          isClickable ? 'maschine-perf__pad--clickable' : 'maschine-perf__pad--static',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          background: fill,
          opacity,
        }}
        onClick={() => isClickable && onPadClick?.(padIdx)}
        disabled={!isClickable}
        aria-label={`Pad ${padIdx + 1} (MIDI note ${36 + padIdx})${block ? `, mapped to ${block.name}` : ''}`}
      >
        <div className="maschine-perf__pad-pressure" style={{ height: `${(state.pressure / 127) * 100}%`, opacity: pressureFresh ? 1 : 0 }} />
        <div className="maschine-perf__pad-content">
          <span className="maschine-perf__pad-index">{padIdx + 1}</span>
          <span className="maschine-perf__pad-note">N{36 + padIdx}</span>
          {velocityFresh && state.velocity > 0 ? (
            <span className="maschine-perf__pad-velocity">v{state.velocity}</span>
          ) : null}
          {block ? (
            <span className="maschine-perf__pad-block" title={block.name}>
              {block.name.slice(0, 10)}
            </span>
          ) : null}
        </div>
      </button>
    )
  }

  return (
    <div className="maschine-perf">
      <Tile className="maschine-perf__header">
        <div className="maschine-perf__header-info">
          <h3>Performance</h3>
          <p className="maschine-perf__header-sub">Player surface — live pad velocity &amp; pressure, scene strip, kit metadata.</p>
        </div>
        <div className="maschine-perf__header-meta">
          <Tag size="md" type={isConnected ? 'green' : 'warm-gray'}>
            {isConnected ? 'Live' : 'Disconnected'}
          </Tag>
          <Tag size="md" type="cyan">{tempoLabel}</Tag>
          <Tag size="md" type="purple">Kit: {snapshotName}</Tag>
        </div>
      </Tile>

      <Tile className="maschine-perf__pad-grid-tile">
        <div className="maschine-perf__grid">
          {[0, 1, 2, 3].map((visualRow) => (
            <div key={`row-${visualRow}`} className="maschine-perf__grid-row">
              {[0, 1, 2, 3].map((col) => renderPad(visualRow, col))}
            </div>
          ))}
        </div>
      </Tile>

      <MaschinePadCurveEditor hidEvents={hidEvents} />

      <MaschineStepSequencer />

      <MaschineQuadMorphZone hidEvents={hidEvents} />
    </div>
  )
}
