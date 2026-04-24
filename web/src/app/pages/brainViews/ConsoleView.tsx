import { BoKV, BoTag, formatMs, formatPercent, slotColor, type BrainOverviewSharedProps } from './brainViewShared'

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
}) {
  const levelPct = Math.round(Math.max(0, Math.min(1, level)) * 100)
  const metricBars = 18
  return (
    <div className="bo-chstrip" style={{ opacity: mute ? 0.55 : 1 }}>
      <div className="bo-chstrip__head">
        <div className="bo-chstrip__color" style={{ background: color }} />
        <div className="bo-chstrip__num">{String(index).padStart(2, '0')}</div>
        <div className="bo-chstrip__name">{name}</div>
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
                background: '#1f2838',
              }}
            />
          ))}
          <div className="bo-chstrip__cap" style={{ top: `${100 - levelPct}%` }}>
            <div className="bo-chstrip__cap-line" style={{ background: color }} />
          </div>
        </div>
        <div className="bo-chstrip__meter" data-placeholder="channel-meter">
          {Array.from({ length: metricBars }).map((_, k) => {
            const v = k / metricBars
            const on = v < level
            const segC = v > 0.85 ? 'var(--bo-danger)' : v > 0.7 ? 'var(--bo-warn)' : 'var(--bo-ok)'
            return (
              <div
                key={k}
                className="bo-chstrip__meter-seg"
                style={{ background: on ? segC : 'rgba(255,255,255,0.04)' }}
              />
            )
          })}
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

  return (
    <>
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
          </div>
        </div>

        <div
          className="bo-mixer__grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(visibleSlots.length, 4)}, 1fr)` }}
        >
          {visibleSlots.map((slot, i) => {
            const color = slotColor(slot, i)
            const bus = mixer.buses[slot.output_bus] ?? mixer.buses[0]
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
                  background: q.ready ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
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
