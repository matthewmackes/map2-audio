import { Button, InlineLoading, NumberInput, Select, SelectItem, Tag, Tile } from '@carbon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import {
  maschineApi,
  type MaschinePressureCurves,
  type MaschinePadPressureCurve,
} from '../../../map2/clients/maschine'
import type { MaschineHidEvent } from '../../../map2/types'

// T2522-C cycle 6 — pressure / velocity curve editor.
//
// Wires GET/PUT /api/maschine/calibration/pressure-curves through to
// the operator-facing surface. The schema is the same one the
// onboarding orchestrator already writes (calibration_store.PAD_COUNT
// pads × polynomial-of-1..4 coefficients, plus a [-1, 1] global
// compensation that applies on top of every pad).
//
// UI shape:
//   • Pad selector (1-16) + global-compensation NumberInput in the
//     header strip. Switching pads pulls that pad's polynomial into
//     the editor; switching back is round-trip safe (we keep
//     unsaved edits in a working copy and only commit on Save).
//   • Two NumberInputs for the constant + linear coefficients (the
//     two terms that cover the v1 use-case — most operator pad
//     calibrations are linear or near-linear). Quadratic + cubic
//     coefficients ride along untouched if the existing polynomial
//     has them, but the editor doesn't yet expose handles for them
//     (cycle 6 follow-on slice if operators ask for it).
//   • Live SVG preview of the resulting v→y mapping for the active
//     pad. The vertical line tracks the most recent live HID press
//     velocity for that pad so operators can see exactly where on
//     the curve their playing lands.
//   • Save button → PUT to backend. Unsaved-changes badge guides
//     the operator if they navigate away mid-edit (no router-leave
//     interception in v1; cycle-15 chrome review covers that).

const PAD_COUNT = 16
const PREVIEW_SAMPLES = 64
const PREVIEW_VIEW = { width: 320, height: 200, padding: 28 }
const VELOCITY_DECAY_MS = 1500

interface PadEditorState {
  /** Coefficients ordered [c0, c1, c2, c3] — constant, linear,
   * quadratic, cubic. We always keep an array of length 2 minimum
   * so the polyval helper can render even when the file has only
   * the constant term. */
  polynomial: number[]
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function polyval(coeffs: number[], x: number): number {
  let acc = 0
  for (let i = coeffs.length - 1; i >= 0; i -= 1) {
    acc = acc * x + coeffs[i]
  }
  return acc
}

function curvePoints(coeffs: number[], globalCompensation: number): string {
  const pts: string[] = []
  for (let i = 0; i <= PREVIEW_SAMPLES; i += 1) {
    const x = i / PREVIEW_SAMPLES
    const y = clamp(polyval(coeffs, x) + globalCompensation, 0, 1)
    const px = PREVIEW_VIEW.padding + x * (PREVIEW_VIEW.width - 2 * PREVIEW_VIEW.padding)
    const py =
      PREVIEW_VIEW.height -
      PREVIEW_VIEW.padding -
      y * (PREVIEW_VIEW.height - 2 * PREVIEW_VIEW.padding)
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`)
  }
  return pts.join(' ')
}

interface MaschinePadCurveEditorProps {
  hidEvents: MaschineHidEvent[]
}

export function MaschinePadCurveEditor({ hidEvents }: MaschinePadCurveEditorProps) {
  const queryClient = useQueryClient()
  const curvesQuery = useQuery({
    queryKey: ['maschine', 'pressure-curves'],
    queryFn: () => maschineApi.getPressureCurves(),
    staleTime: 5_000,
  })

  const remoteCurves = curvesQuery.data?.pressure_curves ?? null

  // Working copy of the per-pad curves and the global compensation.
  // Initialized from the backend response and updated by user edits.
  // Saving PUTs the working copy and reloads from the server.
  const [workingCurves, setWorkingCurves] = useState<MaschinePadPressureCurve[] | null>(null)
  const [workingGlobal, setWorkingGlobal] = useState<number>(0)
  const [activePad, setActivePad] = useState<number>(0)

  useEffect(() => {
    if (remoteCurves && workingCurves === null) {
      setWorkingCurves(remoteCurves.per_pad.map((p) => ({ polynomial: [...p.polynomial] })))
      setWorkingGlobal(remoteCurves.global_compensation)
    }
  }, [remoteCurves, workingCurves])

  const padState: PadEditorState = useMemo(() => {
    const curve = workingCurves?.[activePad]
    if (!curve) return { polynomial: [0, 1] }
    const padded = [...curve.polynomial]
    while (padded.length < 2) padded.push(0)
    return { polynomial: padded }
  }, [workingCurves, activePad])

  const liveVelocityForPad: number | null = useMemo(() => {
    if (!hidEvents) return null
    const cutoff = Date.now() - VELOCITY_DECAY_MS
    for (let i = hidEvents.length - 1; i >= 0; i -= 1) {
      const event = hidEvents[i]
      if (event.decoded_type !== 'pad_press') continue
      const ts = Date.parse(event.timestamp ?? '') || 0
      if (ts < cutoff) return null
      const payload = (event.payload ?? {}) as { pad_index?: number; velocity?: number }
      if (payload.pad_index === activePad && typeof payload.velocity === 'number') {
        return payload.velocity
      }
    }
    return null
  }, [hidEvents, activePad])

  const updateCoefficient = (index: number, value: number) => {
    if (!workingCurves) return
    const next = workingCurves.map((p) => ({ polynomial: [...p.polynomial] }))
    while (next[activePad].polynomial.length <= index) next[activePad].polynomial.push(0)
    next[activePad].polynomial[index] = value
    setWorkingCurves(next)
  }

  const resetActivePad = () => {
    if (!workingCurves) return
    const next = workingCurves.map((p, i) =>
      i === activePad ? { polynomial: [0, 1] } : { polynomial: [...p.polynomial] },
    )
    setWorkingCurves(next)
  }

  const saveMutation = useMutation({
    mutationFn: (payload: MaschinePressureCurves) => maschineApi.updatePressureCurves(payload),
    onSuccess: (response) => {
      setWorkingCurves(response.pressure_curves.per_pad.map((p) => ({ polynomial: [...p.polynomial] })))
      setWorkingGlobal(response.pressure_curves.global_compensation)
      void queryClient.invalidateQueries({ queryKey: ['maschine', 'pressure-curves'] })
    },
  })

  const isDirty = useMemo(() => {
    if (!workingCurves || !remoteCurves) return false
    if (Math.abs(workingGlobal - remoteCurves.global_compensation) > 1e-9) return true
    for (let i = 0; i < PAD_COUNT; i += 1) {
      const a = workingCurves[i]?.polynomial ?? []
      const b = remoteCurves.per_pad[i]?.polynomial ?? []
      if (a.length !== b.length) return true
      for (let j = 0; j < a.length; j += 1) {
        if (Math.abs(a[j] - b[j]) > 1e-9) return true
      }
    }
    return false
  }, [workingCurves, remoteCurves, workingGlobal])

  const handleSave = () => {
    if (!workingCurves) return
    saveMutation.mutate({
      global_compensation: clamp(workingGlobal, -1, 1),
      per_pad: workingCurves,
    })
  }

  const polyline = curvePoints(padState.polynomial, workingGlobal)
  const livePos = liveVelocityForPad !== null ? liveVelocityForPad / 127 : null
  const livePosX =
    livePos !== null
      ? PREVIEW_VIEW.padding + livePos * (PREVIEW_VIEW.width - 2 * PREVIEW_VIEW.padding)
      : null
  const liveOutput = livePos !== null ? clamp(polyval(padState.polynomial, livePos) + workingGlobal, 0, 1) : null
  const livePosY =
    liveOutput !== null
      ? PREVIEW_VIEW.height -
        PREVIEW_VIEW.padding -
        liveOutput * (PREVIEW_VIEW.height - 2 * PREVIEW_VIEW.padding)
      : null

  const isLoading = curvesQuery.isLoading
  const errorMsg = curvesQuery.isError
    ? (curvesQuery.error as Error)?.message ?? 'Failed to load pressure curves'
    : saveMutation.isError
      ? (saveMutation.error as Error)?.message ?? 'Failed to save pressure curves'
      : null

  return (
    <Tile className="maschine-curve-editor">
      <header className="maschine-curve-editor__head">
        <div>
          <h4 className="maschine-perf__strip-title">Pressure / velocity curves</h4>
          <p className="maschine-curve-editor__sub">
            Per-pad pressure response polynomial. Edits stay local until you press Save; backend writes go through the
            same calibration store the onboarding orchestrator uses, so the daemon picks them up on the next reconnect.
          </p>
        </div>
        <div className="maschine-curve-editor__head-actions">
          {isDirty ? <Tag size="sm" type="magenta">Unsaved</Tag> : null}
          {saveMutation.isPending ? (
            <InlineLoading description="Saving…" />
          ) : (
            <Button kind="primary" size="sm" disabled={!isDirty} onClick={handleSave}>
              Save
            </Button>
          )}
        </div>
      </header>

      {errorMsg ? <p className="maschine-curve-editor__error">{errorMsg}</p> : null}

      {isLoading || !workingCurves ? (
        <InlineLoading description="Loading calibration…" />
      ) : (
        <div className="maschine-curve-editor__body">
          <div className="maschine-curve-editor__controls">
            <Select
              id="curve-active-pad"
              labelText="Active pad"
              value={String(activePad)}
              onChange={(e) => setActivePad(Number(e.target.value))}
              size="sm"
            >
              {Array.from({ length: PAD_COUNT }).map((_, i) => (
                <SelectItem key={i} value={String(i)} text={`Pad ${i + 1} (note ${36 + i})`} />
              ))}
            </Select>
            <NumberInput
              id="curve-coef-c0"
              label="Constant (offset)"
              min={-1}
              max={1}
              step={0.01}
              value={padState.polynomial[0]}
              onChange={(_e, { value }) => updateCoefficient(0, Number(value) || 0)}
              size="sm"
              hideSteppers
            />
            <NumberInput
              id="curve-coef-c1"
              label="Linear (slope)"
              min={0}
              max={4}
              step={0.05}
              value={padState.polynomial[1] ?? 1}
              onChange={(_e, { value }) => updateCoefficient(1, Number(value) || 0)}
              size="sm"
              hideSteppers
            />
            <NumberInput
              id="curve-global-comp"
              label="Global compensation"
              min={-1}
              max={1}
              step={0.01}
              value={workingGlobal}
              onChange={(_e, { value }) => setWorkingGlobal(clamp(Number(value) || 0, -1, 1))}
              size="sm"
              hideSteppers
            />
            <Button kind="ghost" size="sm" onClick={resetActivePad}>
              Reset pad to linear (y = x)
            </Button>
          </div>

          <div className="maschine-curve-editor__preview">
            <svg
              viewBox={`0 0 ${PREVIEW_VIEW.width} ${PREVIEW_VIEW.height}`}
              role="img"
              aria-label={`Pressure curve preview for pad ${activePad + 1}`}
            >
              {/* Grid */}
              <rect
                x={PREVIEW_VIEW.padding}
                y={PREVIEW_VIEW.padding}
                width={PREVIEW_VIEW.width - 2 * PREVIEW_VIEW.padding}
                height={PREVIEW_VIEW.height - 2 * PREVIEW_VIEW.padding}
                fill="#0b1020"
                stroke="#1f2937"
                strokeWidth={1}
              />
              {/* Identity reference */}
              <line
                x1={PREVIEW_VIEW.padding}
                y1={PREVIEW_VIEW.height - PREVIEW_VIEW.padding}
                x2={PREVIEW_VIEW.width - PREVIEW_VIEW.padding}
                y2={PREVIEW_VIEW.padding}
                stroke="#33b1ff"
                strokeOpacity={0.25}
                strokeDasharray="4 4"
              />
              {/* Curve */}
              <polyline points={polyline} fill="none" stroke="#42be65" strokeWidth={2} />
              {/* Live press marker */}
              {livePosX !== null && livePosY !== null ? (
                <g>
                  <line
                    x1={livePosX}
                    y1={PREVIEW_VIEW.padding}
                    x2={livePosX}
                    y2={PREVIEW_VIEW.height - PREVIEW_VIEW.padding}
                    stroke="#ff7eb6"
                    strokeOpacity={0.5}
                  />
                  <circle cx={livePosX} cy={livePosY} r={5} fill="#ff7eb6" />
                </g>
              ) : null}
              {/* Axis labels */}
              <text x={PREVIEW_VIEW.padding} y={PREVIEW_VIEW.height - 6} fontSize={10} fill="#94a3b8">
                input velocity (0 → 127)
              </text>
              <text
                x={6}
                y={PREVIEW_VIEW.padding + 6}
                fontSize={10}
                fill="#94a3b8"
                transform={`rotate(-90 6 ${PREVIEW_VIEW.padding + 6})`}
              >
                output (0 → 1)
              </text>
            </svg>
            <div className="maschine-curve-editor__legend">
              <Tag size="sm" type="green">Curve</Tag>
              <Tag size="sm" type="cyan">Linear reference</Tag>
              {livePos !== null ? (
                <Tag size="sm" type="magenta">Live press: v{liveVelocityForPad}</Tag>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Tile>
  )
}
