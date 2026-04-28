import { useEffect, useRef, useState } from 'react'
import { BoKV, BoTag, formatMs, formatPercent, slotColor, type BrainOverviewSharedProps } from './brainViewShared'
import { useBrainChannelMeters, type BrainChannelMeter } from '../../hooks/useBrainChannelMeters'
import { useBrainMonitorCandidates } from '../../components/Devices/hooks/useDeviceProfiles'
import { useDeviceConnections } from '../../components/Devices/hooks/useDeviceConnections'
import { useToasts } from '../../components/Toasts'

const METER_FLOOR_DB = -60
const METER_CEILING_DB = 0
const YELLOW_THRESHOLD_DB = -12
const RED_THRESHOLD_DB = -3
const METER_SEGMENT_COUNT = 18

const IDLE_METER: BrainChannelMeter = {
  slotId: -1,
  peakDb: METER_FLOOR_DB,
  rmsDb: METER_FLOOR_DB,
  clipping: false,
  peakHoldDb: METER_FLOOR_DB,
}

function dbToFraction(db: number): number {
  if (!Number.isFinite(db)) return 0
  if (db <= METER_FLOOR_DB) return 0
  if (db >= METER_CEILING_DB) return 1
  return (db - METER_FLOOR_DB) / (METER_CEILING_DB - METER_FLOOR_DB)
}

function dbToColor(db: number): string {
  if (db >= RED_THRESHOLD_DB) return 'var(--bo-danger)'
  if (db >= YELLOW_THRESHOLD_DB) return 'var(--bo-warn)'
  return 'var(--bo-ok)'
}

function ChannelStrip({
  index,
  name,
  color,
  level,
  mute,
  solo,
  onToggleMute,
  onToggleSolo,
  reverbSend,
  waveformSeed,
  meter,
}: {
  index: number
  name: string
  color: string
  level: number
  mute: boolean
  solo: boolean
  onToggleMute: () => void
  onToggleSolo: () => void
  reverbSend: number
  waveformSeed: number
  meter: BrainChannelMeter
}) {
  const levelPct = Math.round(Math.max(0, Math.min(1, level)) * 100)
  const peakFraction = mute ? 0 : dbToFraction(meter.peakDb)
  const rmsFraction = mute ? 0 : dbToFraction(meter.rmsDb)
  const peakHoldFraction = mute ? 0 : dbToFraction(meter.peakHoldDb)
  const clipping = !mute && meter.clipping
  const peakColor = clipping ? 'var(--bo-danger)' : dbToColor(meter.peakDb)
  return (
    <div className="bo-chstrip" style={{ opacity: mute ? 0.55 : 1 }}>
      <div className="bo-chstrip__head">
        <div className="bo-chstrip__color" style={{ background: color }} />
        <div className="bo-chstrip__num">{String(index).padStart(2, '0')}</div>
        <div className="bo-chstrip__name">{name}</div>
        <div
          className="bo-chstrip__clip"
          data-on={clipping ? 'true' : 'false'}
          aria-label={clipping ? 'Clipping' : 'No clip'}
          title={clipping ? 'Clipping at 0 dBFS' : ''}
        />
      </div>
      <div className="bo-chstrip__wf" data-placeholder="channel-waveform">
        {Array.from({ length: 24 }).map((_, k) => {
          const h = 4 + Math.abs(Math.sin((k + waveformSeed) * 0.8) * 9) + Math.abs(Math.cos(k * 1.4) * 6)
          return (
            <div
              key={k}
              className="bo-chstrip__wf-bar"
              style={{ background: color, height: h }}
            />
          )
        })}
      </div>
      <div className="bo-chstrip__fader">
        <div className="bo-chstrip__track">
          {[0, 25, 50, 75].map((y) => (
            <div
              key={y}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${y}%`,
                height: 1,
                background: 'var(--bo-border)',
              }}
            />
          ))}
          <div className="bo-chstrip__cap" style={{ top: `${100 - levelPct}%` }}>
            <div className="bo-chstrip__cap-line" style={{ background: color }} />
          </div>
        </div>
        <div
          className="bo-chstrip__meter"
          role="meter"
          aria-label={`Channel ${index} peak`}
          aria-valuemin={METER_FLOOR_DB}
          aria-valuemax={METER_CEILING_DB}
          aria-valuenow={Math.round(meter.peakDb)}
        >
          {/* RMS underlay — gradient that fades behind the peak segments */}
          <div
            className="bo-chstrip__meter-rms"
            style={{
              height: `${rmsFraction * 100}%`,
              background:
                'linear-gradient(to top, color-mix(in srgb, var(--bo-ok) 18%, transparent), color-mix(in srgb, var(--bo-warn) 18%, transparent) 70%, color-mix(in srgb, var(--bo-danger) 18%, transparent))',
            }}
          />
          {Array.from({ length: METER_SEGMENT_COUNT }).map((_, k) => {
            const segFraction = (k + 1) / METER_SEGMENT_COUNT
            const on = segFraction <= peakFraction
            const segDb = METER_FLOOR_DB + segFraction * (METER_CEILING_DB - METER_FLOOR_DB)
            return (
              <div
                key={k}
                className="bo-chstrip__meter-seg"
                style={{ background: on ? dbToColor(segDb) : 'color-mix(in srgb, var(--bo-text) 4%, transparent)' }}
              />
            )
          })}
          {peakHoldFraction > 0 && (
            <div
              className="bo-chstrip__meter-hold"
              style={{
                bottom: `${peakHoldFraction * 100}%`,
                background: peakColor,
              }}
            />
          )}
        </div>
      </div>
      <div className="bo-chstrip__ms">
        <button
          type="button"
          className="bo-chstrip__btn bo-chstrip__btn--mute"
          data-on={mute ? 'true' : 'false'}
          onClick={onToggleMute}
        >
          M
        </button>
        <button
          type="button"
          className="bo-chstrip__btn bo-chstrip__btn--solo"
          data-on={solo ? 'true' : 'false'}
          onClick={onToggleSolo}
        >
          S
        </button>
      </div>
      <div className="bo-chstrip__sends" data-placeholder="channel-sends">
        {['A', 'B', 'C'].map((s, k) => (
          <div
            key={s}
            className={`bo-chstrip__send${k === 0 && reverbSend > 0 ? ' bo-chstrip__send--active' : ''}`}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ConsoleView({
  slots,
  mixer,
  diagnostics,
  onSlotUpdate,
}: BrainOverviewSharedProps) {
  const visibleSlots = slots.slice(0, 16)
  const qualification = diagnostics.controller_qualification
  const { meters } = useBrainChannelMeters()
  const { pushToast } = useToasts()

  // T2461-A2 — Brain strip clip → bench notification.
  // Watches each slot's meter; when `clipping` flips false→true,
  // emits a single warn toast scoped to that slot. The Hardware Store
  // listens via its own useHotPlugToast hook, so the operator sees
  // the same alert from either surface.
  const lastClipRef = useRef<Record<number, boolean>>({})
  useEffect(() => {
    for (const meter of Object.values(meters)) {
      const wasClipping = lastClipRef.current[meter.slotId] ?? false
      if (meter.clipping && !wasClipping) {
        pushToast(`Brain slot ${meter.slotId + 1} is clipping`, 'warn',
          { durationMs: 4000 })
      }
      lastClipRef.current[meter.slotId] = meter.clipping
    }
  }, [meters, pushToast])

  // T2461-A2 — Bench-device disconnect mid-performance → ConsoleView banner.
  // Subscribes to the same WS hook the Hardware Store uses; tracks the
  // most recent disconnect for 30 s.
  const ws = useDeviceConnections()
  const [recentDisconnect, setRecentDisconnect] = useState<{
    profileKey: string; ts: number
  } | null>(null)
  useEffect(() => {
    const evt = ws.lastEvent
    if (!evt || evt.type !== 'device.disconnected') return
    const key = String(evt.data?.profile_key ?? '')
    if (!key) return
    setRecentDisconnect({ profileKey: key, ts: evt.timestamp })
    const t = window.setTimeout(() => setRecentDisconnect(null), 30_000)
    return () => window.clearTimeout(t)
  }, [ws.lastEvent])

  // T2461-A5 — Bench monitor summary: surface the worst jitter from any
  // connected loopback-capable device so operators see a regression chip
  // without leaving the ConsoleView.
  const monitorQuery = useBrainMonitorCandidates()
  const benchMonitor = (() => {
    const candidates = monitorQuery.data?.candidates ?? []
    if (candidates.length === 0) return null
    let worstJitter: number | null = null
    let worstFrom: string | null = null
    for (const c of candidates) {
      const j = c.latest_measurement?.jitter_p95_ms
      if (typeof j === 'number' && (worstJitter === null || j > worstJitter)) {
        worstJitter = j
        worstFrom = c.model
      }
    }
    if (worstJitter === null) return { count: candidates.length, jitterText: '—', tone: 'idle' as const, from: null }
    const tone = worstJitter > 0.5 ? 'warn' as const : 'ok' as const
    return { count: candidates.length, jitterText: `${worstJitter.toFixed(2)} ms`, tone, from: worstFrom }
  })()

  return (
    <>
      {recentDisconnect ? (
        <div
          className="bo-panel__head"
          role="status"
          style={{
            background: 'color-mix(in srgb, var(--bo-warn) 22%, var(--bo-surface))',
            color: 'var(--bo-text)',
            border: '1px solid var(--bo-warn)',
            padding: '6px 12px',
            marginBottom: 8,
            borderRadius: 4,
          }}
        >
          Bench device disconnected: <code>{recentDisconnect.profileKey}</code>
          <span style={{ marginLeft: 8, opacity: 0.75 }}>(banner clears in ~30s)</span>
        </div>
      ) : null}
      <div className="bo-mixer">
        <div className="bo-panel__head">
          <div className="bo-panel__title">Mixer · {visibleSlots.length} tracks</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <BoKV
              label="Voices"
              value={`${diagnostics.active_voices} / ${diagnostics.peak_voices}`}
            />
            <BoKV label="CPU" value={formatPercent(diagnostics.cpu_load_percent)} />
            <BoKV label="Latency" value={`${formatMs(diagnostics.roundtrip_latency_ms)} ms`} />
            <BoKV label="Buses" value={mixer.buses.length.toString()} />
            {benchMonitor !== null ? (
              <BoKV
                label={`Bench monitor (${benchMonitor.count})`}
                value={benchMonitor.from
                  ? `${benchMonitor.from} jitter ${benchMonitor.jitterText}${benchMonitor.tone === 'warn' ? ' (high)' : ''}`
                  : `${benchMonitor.count} candidate${benchMonitor.count === 1 ? '' : 's'}`}
              />
            ) : null}
          </div>
        </div>

        <div
          className="bo-mixer__grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(visibleSlots.length, 4)}, 1fr)` }}
        >
          {visibleSlots.map((slot, i) => {
            const color = slotColor(slot, i)
            const bus = mixer.buses[slot.output_bus] ?? mixer.buses[0]
            const meter = meters[slot.slot_id] ?? IDLE_METER
            return (
              <ChannelStrip
                key={slot.slot_id}
                index={slot.slot_id + 1}
                name={slot.name}
                color={color}
                level={slot.level}
                mute={slot.mute}
                solo={slot.solo}
                onToggleMute={() => onSlotUpdate(slot.slot_id, { mute: !slot.mute })}
                onToggleSolo={() => onSlotUpdate(slot.slot_id, { solo: !slot.solo })}
                reverbSend={bus?.reverb_send ?? 0}
                waveformSeed={slot.slot_id}
                meter={meter}
              />
            )
          })}
        </div>
      </div>

      <div className="bo-grid-2">
        <div className="bo-panel">
          <div className="bo-panel__head">
            <div className="bo-panel__title">
              Bus routing · {mixer.buses.length} buses
            </div>
            <BoTag tone={qualification.routing.ready ? 'ok' : 'warn'}>
              {qualification.routing.ready ? 'READY' : 'CHECK'}
            </BoTag>
          </div>
          <div
            className="bo-matrix__grid"
            style={{
              gridTemplateColumns: `repeat(${Math.max(mixer.buses.length, 4)}, 1fr)`,
            }}
          >
            {Array.from({ length: Math.max(mixer.buses.length, 4) * 8 }).map((_, cellIdx) => {
              const busIdx = cellIdx % Math.max(mixer.buses.length, 4)
              const rowIdx = Math.floor(cellIdx / Math.max(mixer.buses.length, 4))
              const bus = mixer.buses[busIdx]
              const on = bus ? bus.output_pair === rowIdx % 2 : false
              return (
                <div
                  key={cellIdx}
                  className={`bo-matrix__cell${on ? ' bo-matrix__cell--on' : ''}`}
                />
              )
            })}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 10,
              fontFamily: 'var(--bo-mono)',
              fontSize: 10,
              color: 'var(--bo-text-muted)',
            }}
          >
            <span>ROWS: OUTPUT PAIRS</span>
            <span>·</span>
            <span>COLS: BUSES</span>
            <span style={{ marginLeft: 'auto', color: 'var(--bo-accent)' }}>
              {qualification.routing.used_bus_count} buses in use · {qualification.routing.output_pair_count} output pairs
            </span>
          </div>
        </div>

        <div className="bo-panel">
          <div className="bo-panel__head">
            <div className="bo-panel__title">Qualification</div>
          </div>
          {[
            { ready: qualification.keyboard.ready, label: 'Keyboard', value: qualification.keyboard.summary },
            { ready: qualification.triggers.ready, label: 'Triggers', value: qualification.triggers.summary },
            { ready: qualification.sequence.ready, label: 'Sequence', value: qualification.sequence.summary },
            { ready: qualification.routing.ready, label: 'Routing', value: qualification.routing.summary },
          ].map((q, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 0',
                borderBottom: i < 3 ? '1px solid var(--bo-border)' : 'none',
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: q.ready
                    ? 'color-mix(in srgb, var(--bo-ok) 15%, transparent)'
                    : 'color-mix(in srgb, var(--bo-warn) 15%, transparent)',
                  color: q.ready ? 'var(--bo-ok)' : 'var(--bo-warn)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 10,
                }}
              >
                {q.ready ? '✓' : '!'}
              </div>
              <div style={{ flex: 1, fontSize: 12 }}>{q.label}</div>
              <div style={{ fontFamily: 'var(--bo-mono)', fontSize: 11, color: 'var(--bo-text-dim)' }}>
                {q.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
