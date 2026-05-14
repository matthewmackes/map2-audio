import { Tag, Tile } from '@carbon/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { MorphPad } from '../StateAuthority/MorphPad'
import {
  stateAuthorityApi,
  type StateAuthorityMorphState,
} from '../../../map2/clients/stateAuthority'
import type { MaschineHidEvent } from '../../../map2/types'

// T2522-C cycle 8 — Quad Morph zone in the Performance tab.
//
// Mounts the existing State Authority <MorphPad>, surfaces the per-
// corner snapshot labels for operator orientation, and shows a live
// "encoders 1-4 → corner weights" hint with a flash on the matching
// corner whenever an MK1 encoder turns. The MorphPad itself owns
// the network round-trip (POST /api/state-authority/morph/position);
// nothing in the engine path changes for this cycle.
//
// MK1 encoder convention (per T700 Q72):
//   • Encoder 1 → corner A weight
//   • Encoder 2 → corner B weight
//   • Encoder 3 → corner C weight
//   • Encoder 4 → corner D weight
//
// The encoders don't drive the morph position directly in cycle 8 —
// the MorphPad XY drag does. The corner-flash is a visual cue so an
// operator playing the MK1 sees their physical input reflected in
// the GUI; cycle 11 wires real encoder→morph adjustment through
// State Authority.

const CORNER_FLASH_MS = 350
const CORNER_BY_HID_ENCODER: Record<number, 'A' | 'B' | 'C' | 'D'> = {
  0: 'A',
  1: 'B',
  2: 'C',
  3: 'D',
}

interface MaschineQuadMorphZoneProps {
  hidEvents: MaschineHidEvent[]
}

export function MaschineQuadMorphZone({ hidEvents }: MaschineQuadMorphZoneProps) {
  const [morphState, setMorphState] = useState<StateAuthorityMorphState | null>(null)
  const [stateError, setStateError] = useState<string | null>(null)
  const [activeCorner, setActiveCorner] = useState<'A' | 'B' | 'C' | 'D' | null>(null)
  const lastFoldedTimestampRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    stateAuthorityApi
      .getMorphState()
      .then((state) => {
        if (!cancelled) setMorphState(state)
      })
      .catch((err) => {
        if (!cancelled) setStateError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Watch for encoder events to flash the corresponding corner. We
  // only fold *new* events since the last render to avoid replaying
  // history when the parent re-renders.
  useEffect(() => {
    if (!hidEvents || hidEvents.length === 0) return
    const lastFolded = lastFoldedTimestampRef.current
    let foundAnchor = lastFolded === null
    let lastCorner: 'A' | 'B' | 'C' | 'D' | null = null
    let lastTimestamp: string | null = null
    for (const event of hidEvents) {
      if (!foundAnchor) {
        if (event.timestamp === lastFolded) foundAnchor = true
        continue
      }
      if (event.decoded_type !== 'encoder') continue
      const payload = (event.payload ?? {}) as { encoder?: number }
      const corner = payload.encoder !== undefined ? CORNER_BY_HID_ENCODER[payload.encoder] : null
      if (corner) {
        lastCorner = corner
        lastTimestamp = event.timestamp ?? null
      }
    }
    if (lastTimestamp) lastFoldedTimestampRef.current = lastTimestamp
    if (lastCorner) {
      setActiveCorner(lastCorner)
      const t = window.setTimeout(() => setActiveCorner(null), CORNER_FLASH_MS)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [hidEvents])

  const cornerSnapshotLabels: Record<'A' | 'B' | 'C' | 'D', string> = useMemo(() => {
    const out: Record<'A' | 'B' | 'C' | 'D', string> = { A: '—', B: '—', C: '—', D: '—' }
    for (const c of morphState?.configured_corners ?? []) {
      const corner = (c as unknown as { corner?: string; snapshot_name?: string }).corner
      const name = (c as unknown as { corner?: string; snapshot_name?: string }).snapshot_name
      if (corner && name && (corner === 'A' || corner === 'B' || corner === 'C' || corner === 'D')) {
        out[corner] = name
      }
    }
    return out
  }, [morphState])

  return (
    <Tile className="maschine-perf__morph-zone">
      <header className="maschine-curve-editor__head">
        <div>
          <h4 className="maschine-perf__strip-title">Quad Morph</h4>
          <p className="maschine-curve-editor__sub">
            Drag inside the pad to morph between the four corner snapshots. Position is interpolated at audio-block
            rate by the C++ MorphEngine. MK1 encoders 1-4 map to corner weights A/B/C/D; cycle 11 adds direct
            encoder → morph adjustment through State Authority.
          </p>
        </div>
        {stateError ? <Tag size="sm" type="red">{stateError}</Tag> : null}
      </header>

      <div className="maschine-morph">
        <div className="maschine-morph__pad-wrap">
          <MorphPad size={240} />
        </div>
        <div className="maschine-morph__legend">
          <h5 className="maschine-morph__legend-title">Corners</h5>
          <ul className="maschine-morph__corner-list">
            {(['A', 'B', 'C', 'D'] as const).map((corner, idx) => (
              <li
                key={corner}
                className={
                  activeCorner === corner
                    ? 'maschine-morph__corner-row maschine-morph__corner-row--active'
                    : 'maschine-morph__corner-row'
                }
              >
                <span className="maschine-morph__corner-letter">{corner}</span>
                <span className="maschine-morph__corner-snapshot">{cornerSnapshotLabels[corner]}</span>
                <span className="maschine-morph__corner-encoder">enc {idx + 1}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Tile>
  )
}
