import { PauseFilled, PlayFilled, Renew } from '@carbon/icons-react'

import {
  BoKV,
  BoTag,
  formatMs,
  formatPercent,
  formatPosition,
  gridClassForCount,
  slotColor,
  type BrainOverviewSharedProps,
} from './brainViewShared'

function MiniMeter({ value, peak, label }: { value: number; peak: number; label: string }) {
  const segs = 24
  const activeSeg = Math.round(Math.max(0, Math.min(1, value)) * segs)
  const peakSeg = Math.round(Math.max(0, Math.min(1, peak)) * segs)
  const color = (i: number) => {
    const ratio = i / segs
    if (ratio > 0.85) return 'var(--bo-danger)'
    if (ratio > 0.7) return 'var(--bo-warn)'
    return 'var(--bo-ok)'
  }
  return (
    <div className="bo-meter">
      <div className="bo-meter__label">{label}</div>
      <div className="bo-meter__segs">
        {Array.from({ length: segs }).map((_, i) => (
          <div
            key={i}
            className="bo-meter__seg"
            style={{
              background: i < activeSeg ? color(i) : undefined,
              outline: i === peakSeg ? `1px solid ${color(i)}` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function PerformanceView({
  state,
  transport,
  slots,
  diagnostics,
  onTransportPatch,
  onSlotSelect,
}: BrainOverviewSharedProps) {
  const voiceFraction = diagnostics.peak_voices > 0
    ? diagnostics.active_voices / Math.max(diagnostics.peak_voices, 1)
    : 0
  const cpuFraction = Math.max(0, Math.min(1, diagnostics.cpu_load_percent / 100))
  const qualification = diagnostics.controller_qualification

  return (
    <>
      <div className="bo-transport">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="bo-transport__buttons">
            <button
              className="bo-transport__btn"
              onClick={() => onTransportPatch({ is_playing: false })}
              title="Stop"
            >
              ■
            </button>
            <button
              className="bo-transport__btn bo-transport__btn--play"
              onClick={() => onTransportPatch({ is_playing: !transport.is_playing })}
              title={transport.is_playing ? 'Pause' : 'Play'}
            >
              {transport.is_playing ? <PauseFilled size={18} /> : <PlayFilled size={18} />}
            </button>
            <button
              className="bo-transport__btn bo-transport__btn--rec"
              title="Record (placeholder)"
              disabled
              data-placeholder="transport-record"
            >
              <svg width={14} height={14} viewBox="0 0 24 24">
                <circle cx={12} cy={12} r={6} fill="currentColor" />
              </svg>
            </button>
          </div>
          <div className="bo-transport__divider" />
          <div>
            <div className="bo-transport__readout-label">TEMPO</div>
            <div className="bo-transport__readout-value">
              {transport.bpm.toFixed(1)}
              <span style={{ fontSize: 14, color: 'var(--bo-text-muted)', marginLeft: 4 }}>BPM</span>
            </div>
          </div>
          <div className="bo-transport__divider" />
          <div>
            <div className="bo-transport__readout-label">POSITION</div>
            <div className="bo-transport__readout-value bo-transport__readout-value--small">
              {formatPosition(transport)}
            </div>
          </div>
        </div>

        <div className="bo-transport__waveform" data-placeholder="transport-waveform">
          <div className="bo-transport__waveform-header">
            <span>PATTERN {transport.pattern + 1} · VAR {transport.variation}</span>
            <span>SWITCH Q {transport.switch_quantization_beats} BEATS</span>
          </div>
          <div className="bo-transport__waveform-bars">
            {Array.from({ length: 64 }).map((_, i) => {
              const h = 20 + Math.abs(Math.sin(i * 0.7) * 18) + Math.abs(Math.cos(i * 1.3) * 10)
              const played = i < Math.floor((transport.step / 15) * 64)
              return (
                <div
                  key={i}
                  className="bo-transport__waveform-bar"
                  style={{
                    height: h,
                    background: played ? 'var(--bo-accent)' : i % 4 === 0 ? 'var(--bo-text-dim)' : '#2a3240',
                    opacity: played ? 0.9 : 0.7,
                  }}
                />
              )
            })}
          </div>
          <div
            style={{
              position: 'absolute',
              left: `${(transport.step / 15) * 100}%`,
              top: 4,
              bottom: 4,
              width: 2,
              background: 'var(--bo-cyan)',
              boxShadow: '0 0 8px var(--bo-cyan)',
            }}
          />
        </div>

        <div className="bo-transport__meters">
          <MiniMeter value={voiceFraction} peak={1} label="V" />
          <MiniMeter value={cpuFraction} peak={cpuFraction} label="C" />
          <div style={{ marginLeft: 10 }}>
            <div className="bo-transport__readout-label">VOICES</div>
            <div style={{ fontFamily: 'var(--bo-mono)', fontSize: 20, lineHeight: 1, marginTop: 2 }}>
              {String(diagnostics.active_voices).padStart(2, '0')}
              <span style={{ color: 'var(--bo-text-muted)' }}>
                /{String(diagnostics.peak_voices).padStart(2, '0')}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--bo-mono)', fontSize: 9, color: 'var(--bo-ok)', marginTop: 4 }}>
              ● {diagnostics.polyphony_headroom} HEADROOM
            </div>
            <div
              className="bo-transport__readout-label"
              style={{ marginTop: 10 }}
            >
              LATENCY
            </div>
            <div style={{ fontFamily: 'var(--bo-mono)', fontSize: 14 }}>
              {formatMs(diagnostics.roundtrip_latency_ms)}
              <span style={{ color: 'var(--bo-text-muted)', fontSize: 11 }}> ms</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bo-pads">
        <div className="bo-panel__head">
          <div>
            <div className="bo-panel__eyebrow">LAYER · {state.active_layer_id.toUpperCase()}</div>
            <div className="bo-panel__title">Pad Matrix</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <BoTag tone="accent">{slots.length} SLOTS</BoTag>
            <BoTag tone={qualification.controller_ready ? 'ok' : 'warn'}>
              {qualification.controller_ready ? 'READY' : 'ATTENTION'}
            </BoTag>
          </div>
        </div>
        <div className={`bo-pads__grid ${gridClassForCount(slots.length)}`}>
          {slots.map((slot, idx) => {
            const color = slotColor(slot, idx)
            const isActive = slot.slot_id === state.active_slot
            return (
              <button
                key={slot.slot_id}
                type="button"
                className={`bo-pad${isActive ? ' bo-pad--active' : ''}`}
                style={{
                  background: isActive ? color : 'var(--bo-surface-2)',
                  borderColor: isActive ? color : undefined,
                  boxShadow: isActive
                    ? `inset 0 0 0 1px ${color}55, 0 0 14px ${color}33`
                    : undefined,
                }}
                onClick={() => onSlotSelect(slot.slot_id)}
              >
                <div className="bo-pad__num">{String(slot.slot_id + 1).padStart(2, '0')}</div>
                <div className="bo-pad__name">{slot.name}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bo-strip" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="bo-strip__cell">
          <div className="bo-strip__label">Snapshot</div>
          <div className="bo-strip__value">{state.snapshot_integration.authority_model}</div>
        </div>
        <div className="bo-strip__cell">
          <div className="bo-strip__label">Workspace</div>
          <div className="bo-strip__value">{state.instance_id || 'workspace'}</div>
        </div>
        <div className="bo-strip__cell">
          <div className="bo-strip__label">Tier</div>
          <div className="bo-strip__value">
            {qualification.tier_a_runtime_locked ? 'A · LOCKED' : 'OPEN'}
          </div>
        </div>
        <div className="bo-strip__cell">
          <div className="bo-strip__label">Qualification</div>
          <div className="bo-strip__value">{qualification.ready_surface_count} / 4 surfaces</div>
        </div>
        <div className="bo-strip__cell">
          <div className="bo-strip__label">CPU</div>
          <div className="bo-strip__value">{formatPercent(diagnostics.cpu_load_percent)}</div>
        </div>
        <div className="bo-strip__cell">
          <div className="bo-strip__label">Roundtrip</div>
          <div className="bo-strip__value">{formatMs(diagnostics.roundtrip_latency_ms)} ms</div>
        </div>
      </div>

      <div className="bo-grid-2">
        <div className="bo-attention">
          <div className="bo-panel__head">
            <div className="bo-panel__title">Qualification checklist</div>
            <BoTag tone={qualification.issues.length > 0 ? 'warn' : 'ok'}>
              {qualification.issues.length > 0
                ? `${qualification.issues.length} TO RESOLVE`
                : 'ALL CLEAR'}
            </BoTag>
          </div>
          {[
            { ready: qualification.keyboard.ready, title: qualification.keyboard.summary, issue: qualification.keyboard.issues[0] },
            { ready: qualification.triggers.ready, title: qualification.triggers.summary, issue: qualification.triggers.issues[0] },
            { ready: qualification.sequence.ready, title: qualification.sequence.summary, issue: qualification.sequence.issues[0] },
            { ready: qualification.routing.ready, title: qualification.routing.summary, issue: qualification.routing.issues[0] },
          ].map((item, i) => (
            <div
              key={i}
              className={`bo-attention__item ${item.ready ? 'bo-attention__item--ok' : 'bo-attention__item--warn'}`}
            >
              <div
                style={{
                  color: item.ready ? 'var(--bo-ok)' : 'var(--bo-warn)',
                  paddingTop: 2,
                  fontWeight: 700,
                }}
              >
                {item.ready ? '✓' : '!'}
              </div>
              <div className="bo-attention__item-body">
                <div className="bo-attention__item-title">{item.title}</div>
                <div className="bo-attention__item-sub">
                  {item.issue ?? (item.ready ? 'Qualified' : 'Attention required')}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bo-panel">
          <div className="bo-panel__head">
            <div className="bo-panel__title">Focused slot</div>
            <BoTag tone="accent">
              {slots[state.active_slot]?.name ?? 'NONE'} · BUS{' '}
              {(slots[state.active_slot]?.output_bus ?? 0) + 1}
            </BoTag>
          </div>
          <div className="bo-pads__grid bo-pads__grid--8" style={{ marginBottom: 10 }}>
            {slots.slice(0, 8).map((slot, idx) => {
              const color = slotColor(slot, idx)
              const active = slot.slot_id === state.active_slot
              return (
                <button
                  key={slot.slot_id}
                  type="button"
                  className={`bo-pad${active ? ' bo-pad--active' : ''}`}
                  style={{
                    aspectRatio: '1/1',
                    background: active ? color : 'var(--bo-surface-2)',
                    borderColor: active ? color : undefined,
                    fontFamily: 'var(--bo-mono)',
                    fontSize: 12,
                  }}
                  onClick={() => onSlotSelect(slot.slot_id)}
                >
                  {slot.slot_id + 1}
                </button>
              )
            })}
          </div>
          <div
            className="bo-grid-3"
            style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}
          >
            <BoKV
              label="Sample"
              value={slots[state.active_slot]?.asset_path?.split('/').pop() ?? '—'}
            />
            <BoKV label="Mode" value={slots[state.active_slot]?.mode ?? '—'} />
            <BoKV
              label="Tune"
              value={`${(slots[state.active_slot]?.tune ?? 0).toFixed(0)} st`}
            />
            <BoKV
              label="Poly"
              value={(slots[state.active_slot]?.polyphony ?? 0).toString()}
            />
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: 'var(--bo-mono)',
              fontSize: 10,
              color: 'var(--bo-text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>LAYER · TIER {qualification.tier_a_runtime_locked ? 'A LOCKED' : 'OPEN'}</span>
            <button
              type="button"
              className="bo-attention__resolve"
              onClick={() => onTransportPatch({ is_playing: !transport.is_playing })}
              title="Toggle transport"
            >
              <Renew size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              RESET
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
