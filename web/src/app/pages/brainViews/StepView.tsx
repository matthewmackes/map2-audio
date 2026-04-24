import { BoKV, BoTag, slotColor, type BrainOverviewSharedProps } from './brainViewShared'

function patternForLane(activeSteps: number, stepCount: number): number[] {
  const out = Array.from({ length: stepCount }, () => 0)
  if (activeSteps <= 0) return out
  const spacing = stepCount / Math.max(activeSteps, 1)
  for (let i = 0; i < activeSteps; i++) {
    const idx = Math.round(i * spacing) % stepCount
    out[idx] = i % 4 === 0 ? 2 : 1
  }
  return out
}

export function StepView({
  state,
  transport,
  slots,
  sequence,
  diagnostics,
  onTransportPatch,
}: BrainOverviewSharedProps) {
  const laneCount = 8
  const stepCount = 16
  const qualification = diagnostics.controller_qualification

  const lanes = sequence.lanes.slice(0, laneCount).map((lane, i) => {
    const slot = slots.find((s) => s.slot_id === lane.slot_id)
    return {
      name: slot?.name ?? lane.name ?? `Track ${i + 1}`,
      color: slotColor(slot ?? slots[0] ?? ({} as any), i),
      steps: patternForLane(lane.active_steps, stepCount),
      activeSteps: lane.active_steps,
    }
  })

  // Backfill lanes when sequence returns fewer than 8
  while (lanes.length < laneCount) {
    const i = lanes.length
    lanes.push({
      name: slots[i]?.name ?? `Lane ${i + 1}`,
      color: slotColor(slots[i] ?? ({} as any), i),
      steps: Array.from({ length: stepCount }, () => 0),
      activeSteps: 0,
    })
  }

  const playhead = transport.step % stepCount

  return (
    <>
      <div className="bo-stepgrid">
        <div className="bo-panel__head">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="bo-panel__title">
              Pattern {transport.pattern + 1} · Var {transport.variation}
            </div>
            <BoTag tone="accent">{transport.is_playing ? 'LIVE' : 'PAUSED'}</BoTag>
            <BoTag>
              {stepCount} STEPS · 1/{stepCount}
            </BoTag>
          </div>
          <div className="bo-variations">
            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label, i) => (
              <button
                key={label}
                type="button"
                className={`bo-variation-btn${transport.variation === i ? ' bo-variation-btn--active' : ''}`}
                onClick={() => onTransportPatch({ variation: i })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bo-stepgrid__row">
          <div />
          {Array.from({ length: stepCount }).map((_, s) => (
            <div
              key={s}
              className={`bo-stepgrid__step-label${
                s === playhead ? ' bo-stepgrid__step-label--play' : s % 4 === 0 ? ' bo-stepgrid__step-label--beat' : ''
              }`}
            >
              {String(s + 1).padStart(2, '0')}
            </div>
          ))}
          <div />
        </div>

        {lanes.map((lane, li) => (
          <div key={li} className="bo-stepgrid__row" data-placeholder="step-pattern">
            <div className="bo-stepgrid__track-name">
              <div className="bo-stepgrid__track-color" style={{ background: lane.color }} />
              <div>{lane.name}</div>
            </div>
            {lane.steps.map((v, s) => {
              const isPlay = s === playhead
              let bg = '#0b0e13'
              let border = 'var(--bo-border)'
              let glow: string | undefined
              if (v === 1) {
                bg = `${lane.color}55`
                border = `${lane.color}88`
              } else if (v === 2) {
                bg = lane.color
                border = lane.color
                glow = `0 0 10px ${lane.color}88`
              }
              if (isPlay) border = 'var(--bo-cyan)'
              return (
                <div
                  key={s}
                  className="bo-stepgrid__cell"
                  style={{
                    background: bg,
                    borderColor: border,
                    boxShadow: glow,
                  }}
                >
                  {isPlay && v === 0 ? (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(34,211,238,0.14)',
                      }}
                    />
                  ) : null}
                </div>
              )
            })}
            <div className="bo-stepgrid__cell-count">
              {lane.activeSteps}/{stepCount}
            </div>
          </div>
        ))}
      </div>

      <div className="bo-grid-2">
        <div className="bo-panel">
          <div className="bo-panel__head">
            <div className="bo-panel__title">Song arrangement</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <BoTag>{state.song.entries.length} ENTRIES</BoTag>
              <BoTag tone="accent">BAR {transport.bar + 1}</BoTag>
            </div>
          </div>
          {state.song.entries.length === 0 ? (
            <div style={{ fontFamily: 'var(--bo-mono)', fontSize: 11, color: 'var(--bo-text-muted)' }}>
              No song entries defined.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {state.song.entries.map((entry, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    background: 'var(--bo-surface-2)',
                    borderLeft: '3px solid var(--bo-accent)',
                    borderRadius: 3,
                    fontFamily: 'var(--bo-mono)',
                    fontSize: 11,
                    color: 'var(--bo-text)',
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {entry.label || `Pattern ${entry.pattern_id + 1} · Var ${entry.variation}`}
                  </span>
                  <span style={{ color: 'var(--bo-text-muted)' }}>×{entry.repeat_count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bo-panel">
          <div className="bo-panel__head">
            <div className="bo-panel__title">Step detail</div>
            <BoTag tone={qualification.sequence.ready ? 'ok' : 'warn'}>
              {qualification.sequence.ready ? 'READY' : 'ATTENTION'}
            </BoTag>
          </div>
          <div className="bo-grid-3" data-placeholder="step-detail">
            <BoKV label="Velocity" value="—" />
            <BoKV label="Probability" value="—" />
            <BoKV label="Micro" value="—" />
            <BoKV label="Retrig" value="—" />
            <BoKV label="Length" value="1/16" />
            <BoKV label="Cond" value="1:1" />
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: 'var(--bo-mono)',
              fontSize: 10,
              color: 'var(--bo-text-muted)',
            }}
          >
            {qualification.sequence.summary}
          </div>
        </div>
      </div>
    </>
  )
}
