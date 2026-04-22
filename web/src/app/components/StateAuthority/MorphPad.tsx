import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Tag } from '@carbon/react'
import { stateAuthorityApi, type StateAuthorityMorphState } from '../../../map2/clients/stateAuthority'
import './MorphPad.css'

// A/B/C/D morph pad — plan Q33 + Q70. XY drag inside the pad immediately
// updates the engine's MorphEngine via POST /api/state-authority/morph/position,
// which triggers bilinear A/B/C/D parameter interpolation at audio-block rate
// in C++ (see app/services/state_authority_services.py + C++ MorphEngine).

export interface MorphPadProps {
  /** Optional initial XY. If absent the component fetches current engine state on mount. */
  initial?: StateAuthorityMorphState
  /** Suppress network calls; useful for Storybook / unit tests. */
  readonly?: boolean
  /** Callback after successful position set. */
  onPositionChange?: (state: StateAuthorityMorphState) => void
  /** Pixel size (square). Default 200. */
  size?: number
}

type Corner = 'A' | 'B' | 'C' | 'D'

// Corners laid out visually: A top-left, B top-right, D bottom-left, C bottom-right.
// X axis: 0 = left (A/D), 1 = right (B/C)
// Y axis: 0 = top (A/B),   1 = bottom (D/C)
const CORNER_POSITIONS: Record<Corner, { x: number; y: number }> = {
  A: { x: 0, y: 0 },
  B: { x: 1, y: 0 },
  D: { x: 0, y: 1 },
  C: { x: 1, y: 1 },
}

const CORNER_ORDER: Corner[] = ['A', 'B', 'C', 'D']

export function MorphPad({ initial, readonly, onPositionChange, size = 200 }: MorphPadProps) {
  const padRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<StateAuthorityMorphState>(() =>
    initial ?? { x: 0.5, y: 0.5, configured_corners: [] },
  )
  const [dragging, setDragging] = useState(false)
  const [inflight, setInflight] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guard against racing mutations — only the most-recent drag position gets
  // POSTed; mid-drag positions are coalesced to the next rAF tick.
  const pendingRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (readonly || initial !== undefined) return
    let cancelled = false
    stateAuthorityApi
      .getMorphState()
      .then((state) => {
        if (!cancelled) setPosition(state)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [initial, readonly])

  const commitPosition = useCallback(
    async (x: number, y: number) => {
      if (readonly) return
      pendingRef.current = { x, y }
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(async () => {
        rafRef.current = null
        const next = pendingRef.current
        pendingRef.current = null
        if (!next) return
        setInflight(true)
        try {
          const applied = await stateAuthorityApi.setMorphPosition(next.x, next.y)
          setPosition(applied)
          setError(null)
          onPositionChange?.(applied)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setInflight(false)
        }
      })
    },
    [onPositionChange, readonly],
  )

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current
      if (!pad) return
      const rect = pad.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      setPosition((prev) => ({ ...prev, x, y }))
      void commitPosition(x, y)
    },
    [commitPosition],
  )

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (readonly) return
      setDragging(true)
      updateFromPointer(event.clientX, event.clientY)
    },
    [readonly, updateFromPointer],
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (event: globalThis.MouseEvent) => {
      updateFromPointer(event.clientX, event.clientY)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, updateFromPointer])

  const knobStyle = useMemo(
    () => ({
      left: `${position.x * 100}%`,
      top: `${position.y * 100}%`,
    }),
    [position.x, position.y],
  )

  const configured = useMemo(() => new Set(position.configured_corners), [position.configured_corners])

  return (
    <div className="morph-pad" role="group" aria-label="A/B/C/D morph pad">
      <div
        ref={padRef}
        className={`morph-pad__surface${dragging ? ' morph-pad__surface--dragging' : ''}`}
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        role="application"
        aria-label="Morph position"
      >
        <div className="morph-pad__axes" aria-hidden="true">
          <div className="morph-pad__axis-x" />
          <div className="morph-pad__axis-y" />
        </div>
        {CORNER_ORDER.map((corner) => {
          const { x, y } = CORNER_POSITIONS[corner]
          return (
            <div
              key={corner}
              className={`morph-pad__corner morph-pad__corner--${corner.toLowerCase()}${
                configured.has(corner) ? '' : ' morph-pad__corner--empty'
              }`}
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              aria-label={`Corner ${corner}${configured.has(corner) ? '' : ' (not configured)'}`}
            >
              {corner}
            </div>
          )
        })}
        <div
          className={`morph-pad__knob${inflight ? ' morph-pad__knob--inflight' : ''}`}
          style={knobStyle}
          aria-label={`Position ${position.x.toFixed(2)} by ${position.y.toFixed(2)}`}
        />
      </div>
      <div className="morph-pad__status">
        <Tag size="sm" type={inflight ? 'cyan' : 'outline'}>
          X {position.x.toFixed(3)}
        </Tag>
        <Tag size="sm" type={inflight ? 'cyan' : 'outline'}>
          Y {position.y.toFixed(3)}
        </Tag>
        {position.configured_corners.length > 0 ? (
          <Tag size="sm" type="green">
            {position.configured_corners.length}/4 corners
          </Tag>
        ) : (
          <Tag size="sm" type="warm-gray">
            No corners configured
          </Tag>
        )}
        {error ? (
          <Tag size="sm" type="red">
            Error: {error}
          </Tag>
        ) : null}
      </div>
    </div>
  )
}

export default MorphPad
