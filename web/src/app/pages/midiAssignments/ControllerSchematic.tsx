/**
 * ControllerSchematic — capability-driven SVG representation of a controller.
 *
 * Renders pads / knobs / encoders / faders / footswitches / pedals based on the
 * surface's schematic counts. Click a control to capture a guessed (kind, value)
 * tuple — matching how the design works in the prototype:
 *   pads      → Note (starting at MIDI note 36, the standard "GM kit")
 *   knobs     → CC 16+
 *   encoders  → CC 16+
 *   faders    → CC 7 (volume) + offsets
 *   footswitches → CC 80+ (toggle slots)
 *   pedals    → CC 11 (expression) / CC 4 (foot controller)
 */

import type { SurfaceSchematic } from './walkthroughSurfaceMeta'

export type ControlGuess =
  | { kind: 'cc'; value: number }
  | { kind: 'note'; value: number }
  | { kind: 'pc'; value: number }

interface ControllerSchematicProps {
  schematic: SurfaceSchematic | null | undefined
  /** Control id currently lit (e.g. last-touched). */
  activeId?: string | null
  /** Set of control ids that already have a binding. */
  mappedIds?: Set<string>
  /** When provided, this control gets a dashed "next target" outline. */
  targetId?: string | null
  /** Click handler; receives the synthetic control id and a (kind,value) guess. */
  onPick?: (controlId: string, guess: ControlGuess) => void
}

export function ControllerSchematic({
  schematic,
  activeId,
  mappedIds = new Set(),
  targetId,
  onPick,
}: ControllerSchematicProps) {
  if (!schematic) {
    return (
      <div className="schematic">
        <div className="empty">No schematic for this surface — pick a CC manually in Mode B.</div>
      </div>
    )
  }

  const groups: React.ReactNode[] = []

  if (schematic.pads) {
    const pads: React.ReactNode[] = []
    for (let i = 0; i < schematic.pads; i++) {
      const id = `pad-${i}`
      const cls = ['pad']
      if (activeId === id) cls.push('lit')
      if (mappedIds.has(id)) cls.push('mapped')
      if (targetId === id) cls.push('target')
      pads.push(
        <div
          key={id}
          className={cls.join(' ')}
          onClick={() => onPick?.(id, { kind: 'note', value: 36 + i })}
          title={`Pad ${i + 1} → Note ${36 + i}`}
        >
          {i + 1}
        </div>,
      )
    }
    const cols = schematic.pads >= 64 ? 8 : 4
    groups.push(
      <div className="group" key="pads">
        <div className="gname">{schematic.pads} velocity pads · Note 36+</div>
        <div className="pads" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>{pads}</div>
      </div>,
    )
  }

  if (schematic.knobs) {
    const knobs: React.ReactNode[] = []
    for (let i = 0; i < schematic.knobs; i++) {
      const id = `knob-${i}`
      const cls = ['knob']
      if (activeId === id) cls.push('lit')
      if (mappedIds.has(id)) cls.push('mapped')
      if (targetId === id) cls.push('target')
      const rot = activeId === id ? 90 : -90 + (i * 13) % 180
      knobs.push(
        <div
          key={id}
          className={cls.join(' ')}
          style={{ ['--rot' as string]: `${rot}deg` } as React.CSSProperties}
          onClick={() => onPick?.(id, { kind: 'cc', value: 16 + i })}
          title={`Knob ${i + 1} → CC ${16 + i}`}
        />,
      )
    }
    groups.push(
      <div className="group" key="knobs">
        <div className="gname">{schematic.knobs} rotary knobs · CC 16+</div>
        <div className="knobs">{knobs}</div>
      </div>,
    )
  }

  if (schematic.encoders) {
    const encs: React.ReactNode[] = []
    for (let i = 0; i < schematic.encoders; i++) {
      const id = `encoder-${i}`
      const cls = ['encoder']
      if (activeId === id) cls.push('lit')
      if (mappedIds.has(id)) cls.push('mapped')
      if (targetId === id) cls.push('target')
      encs.push(
        <div
          key={id}
          className={cls.join(' ')}
          onClick={() => onPick?.(id, { kind: 'cc', value: 16 + i })}
          title={`Encoder ${i + 1} → CC ${16 + i}`}
        >
          E{i + 1}
        </div>,
      )
    }
    groups.push(
      <div className="group" key="encoders">
        <div className="gname">{schematic.encoders} encoders · CC 16+</div>
        <div className="encoders">{encs}</div>
      </div>,
    )
  }

  if (schematic.faders) {
    const faders: React.ReactNode[] = []
    for (let i = 0; i < schematic.faders; i++) {
      const id = `fader-${i}`
      const cls = ['fader']
      if (activeId === id) cls.push('lit')
      if (mappedIds.has(id)) cls.push('mapped')
      if (targetId === id) cls.push('target')
      faders.push(
        <div
          key={id}
          className={cls.join(' ')}
          onClick={() => onPick?.(id, { kind: 'cc', value: 7 + i })}
          title={`Fader ${i + 1} → CC ${7 + i}`}
        >
          <div className="cap" />
        </div>,
      )
    }
    groups.push(
      <div className="group" key="faders">
        <div className="gname">{schematic.faders} faders · CC 7+</div>
        <div className="faders">{faders}</div>
      </div>,
    )
  }

  if (schematic.footswitches) {
    const feet: React.ReactNode[] = []
    for (let i = 0; i < schematic.footswitches; i++) {
      const id = `foot-${i}`
      const cls = ['foot']
      if (activeId === id) cls.push('lit')
      if (mappedIds.has(id)) cls.push('mapped')
      if (targetId === id) cls.push('target')
      feet.push(
        <div
          key={id}
          className={cls.join(' ')}
          onClick={() => onPick?.(id, { kind: 'cc', value: 80 + i })}
          title={`Footswitch ${i + 1} → CC ${80 + i}`}
        >
          {i + 1}
        </div>,
      )
    }
    groups.push(
      <div className="group" key="feet">
        <div className="gname">{schematic.footswitches} footswitches · CC 80+</div>
        <div className="feet">{feet}</div>
      </div>,
    )
  }

  if (schematic.pedals) {
    const pedals: React.ReactNode[] = []
    for (let i = 0; i < schematic.pedals; i++) {
      const id = `pedal-${i}`
      const cls = ['pedal']
      if (activeId === id) cls.push('lit')
      if (mappedIds.has(id)) cls.push('mapped')
      if (targetId === id) cls.push('target')
      const cc = i === 0 ? 11 : 4
      pedals.push(
        <div
          key={id}
          className={cls.join(' ')}
          onClick={() => onPick?.(id, { kind: 'cc', value: cc })}
          title={`Expression pedal ${i + 1} → CC ${cc}`}
        >
          EXP{i + 1}
        </div>,
      )
    }
    groups.push(
      <div className="group" key="pedals">
        <div className="gname">{schematic.pedals} expression pedals · CC 11/4</div>
        <div className="pedals">{pedals}</div>
      </div>,
    )
  }

  if (schematic.transport) {
    const trans: React.ReactNode[] = []
    const labels = ['◀◀', '▶', '■', '●', '◀', '▶▶', '⟲', '⟳']
    for (let i = 0; i < schematic.transport; i++) {
      const id = `transport-${i}`
      const cls = ['transport-btn']
      if (activeId === id) cls.push('lit')
      if (mappedIds.has(id)) cls.push('mapped')
      trans.push(
        <div
          key={id}
          className={cls.join(' ')}
          onClick={() => onPick?.(id, { kind: 'cc', value: 90 + i })}
          title={`Transport ${labels[i] || i + 1} → CC ${90 + i}`}
        >
          {labels[i] || `T${i + 1}`}
        </div>,
      )
    }
    groups.push(
      <div className="group" key="transport">
        <div className="gname">{schematic.transport} transport · CC 90+</div>
        <div className="transport">{trans}</div>
      </div>,
    )
  }

  return <div className="schematic">{groups}</div>
}
