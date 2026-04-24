import { BoKV, BoTag, slotColor, type BrainOverviewSharedProps } from './brainViewShared'

function KeyboardModule({
  zones,
}: {
  zones: Array<{ zone_id: string; name: string; key_low: number; key_high: number; color: string; enabled: boolean }>
}) {
  const whiteKeys = 21
  const blackPattern = new Set([1, 3, 6, 8, 10])

  return (
    <div className="bo-panel">
      <div className="bo-panel__head">
        <div>
          <div className="bo-panel__eyebrow">KEYBOARD</div>
          <div className="bo-panel__title">{zones.length} zones</div>
        </div>
        <BoTag tone={zones.length === 0 ? 'warn' : 'ok'}>
          {zones.length === 0 ? 'NO ZONES' : 'READY'}
        </BoTag>
      </div>
      {zones.length > 0 ? (
        <div style={{ display: 'flex', gap: 0, height: 18, marginBottom: 10 }}>
          {zones.map((z, i) => (
            <div
              key={i}
              style={{
                flex: Math.max(1, z.key_high - z.key_low),
                background: `${z.color}33`,
                borderLeft: `3px solid ${z.color}`,
                fontFamily: 'var(--bo-mono)',
                fontSize: 10,
                color: 'var(--bo-text)',
                fontWeight: 600,
                padding: '2px 8px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {z.name}
            </div>
          ))}
        </div>
      ) : null}
      <div className="bo-keyboard" data-placeholder="keyboard-held-keys">
        <div className="bo-keyboard__whites">
          {Array.from({ length: whiteKeys }).map((_, i) => (
            <div
              key={i}
              className="bo-keyboard__white"
            >
              {i % 7 === 0 ? (
                <div className="bo-keyboard__white-label">C{Math.floor(i / 7) + 2}</div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="bo-keyboard__blacks">
          {Array.from({ length: whiteKeys }).map((_, i) => {
            const inOctave = i % 7
            if (!blackPattern.has(inOctave)) return null
            const whiteW = 100 / whiteKeys
            const left = (i + 1) * whiteW - whiteW * 0.3
            return (
              <div
                key={i}
                className="bo-keyboard__black"
                style={{ left: `${left}%`, width: `${whiteW * 0.6}%` }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function SplitView({
  state,
  slots,
  inputs,
  diagnostics,
  mixer,
  onSlotSelect,
}: BrainOverviewSharedProps) {
  const qualification = diagnostics.controller_qualification
  const zones = inputs.keyboard_zones.map((z, i) => ({
    ...z,
    color: slotColor(slots[0] ?? ({} as any), i),
  }))
  const visibleSlots = slots.slice(0, 8)

  return (
    <>
      <KeyboardModule zones={zones} />

      <div className="bo-grid-2">
        <div className="bo-panel">
          <div className="bo-panel__head">
            <div>
              <div className="bo-panel__eyebrow">PADS</div>
              <div className="bo-panel__title">
                {inputs.trigger_profiles.length} profiles · {slots.length} slots
              </div>
            </div>
            <BoTag tone={qualification.triggers.ready ? 'ok' : 'warn'}>
              {qualification.triggers.ready ? 'READY' : 'ATTENTION'}
            </BoTag>
          </div>
          <div className="bo-pads__grid bo-pads__grid--4">
            {visibleSlots.map((slot, i) => {
              const color = slotColor(slot, i)
              const isActive = slot.slot_id === state.active_slot
              return (
                <button
                  key={slot.slot_id}
                  type="button"
                  className={`bo-pad${isActive ? ' bo-pad--active' : ''}`}
                  style={{
                    background: isActive ? color : 'var(--bo-surface-2)',
                    borderColor: isActive ? color : undefined,
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

        <div className="bo-matrix">
          <div className="bo-panel__head">
            <div>
              <div className="bo-panel__eyebrow">ROUTING</div>
              <div className="bo-panel__title">
                {mixer.buses.length} buses · {qualification.routing.output_pair_count} output pairs
              </div>
            </div>
            <BoTag tone={qualification.routing.ready ? 'ok' : 'warn'}>
              {qualification.routing.ready ? 'READY' : 'ATTENTION'}
            </BoTag>
          </div>
          <div
            className="bo-matrix__grid"
            style={{
              gridTemplateColumns: `72px repeat(${Math.max(mixer.buses.length, 4)}, 1fr)`,
            }}
          >
            <div />
            {mixer.buses.slice(0, Math.max(mixer.buses.length, 4)).map((bus) => (
              <div key={bus.bus_id} className="bo-matrix__dest">
                {bus.name.slice(0, 6)}
              </div>
            ))}
            {visibleSlots.slice(0, 6).map((slot) => (
              <div key={slot.slot_id} style={{ display: 'contents' }}>
                <div className="bo-matrix__source">{slot.name}</div>
                {mixer.buses.map((bus) => {
                  const on = slot.output_bus === bus.bus_id
                  return (
                    <div
                      key={bus.bus_id}
                      className={`bo-matrix__cell${on ? ' bo-matrix__cell--on' : ''}`}
                    >
                      {on ? <div className="bo-matrix__cell--dot" /> : null}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="bo-grid-3" style={{ marginTop: 10 }}>
            <BoKV label="Buses" value={mixer.buses.length.toString()} />
            <BoKV
              label="Active"
              value={`${qualification.routing.used_bus_count} / ${mixer.buses.length}`}
            />
            <BoKV
              label="Output pairs"
              value={qualification.routing.output_pair_count.toString()}
            />
          </div>
        </div>
      </div>

      <div className="bo-panel">
        <div className="bo-panel__head">
          <div className="bo-panel__title">
            Qualification · {qualification.ready_surface_count}/4 ready
          </div>
          <BoTag tone={qualification.controller_ready ? 'ok' : 'warn'}>
            {qualification.controller_ready ? 'QUALIFIED' : 'ATTENTION'}
          </BoTag>
        </div>
        <div
          style={{
            height: 6,
            background: 'var(--bo-surface-2)',
            borderRadius: 3,
            overflow: 'hidden',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: `${(qualification.ready_surface_count / 4) * 100}%`,
              height: '100%',
              background: qualification.controller_ready ? 'var(--bo-ok)' : 'var(--bo-warn)',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--bo-mono)', fontSize: 11 }}>
          {[
            { ready: qualification.keyboard.ready, text: qualification.keyboard.summary },
            { ready: qualification.triggers.ready, text: qualification.triggers.summary },
            { ready: qualification.sequence.ready, text: qualification.sequence.summary },
            { ready: qualification.routing.ready, text: qualification.routing.summary },
          ].map((q, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: q.ready ? 'var(--bo-ok)' : 'var(--bo-warn)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 9,
                }}
              >
                {q.ready ? '✓' : '!'}
              </div>
              <span style={{ color: q.ready ? 'var(--bo-text-dim)' : 'var(--bo-text)' }}>{q.text}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
