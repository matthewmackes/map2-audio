/**
 * ExpressionPage - Guided expression pedal workflow (T097).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { NumberInput } from '../components/Controls/NumberInput'

const C = {
  bg: '#161616',
  panel: '#262626',
  panelAlt: '#333333',
  panelDark: '#1f1f1f',
  border: '#525252',
  text: '#f4f4f4',
  muted: '#8d8d8d',
  subtle: '#c6c6c6',
  blue: '#0f62fe',
  teal: '#009d9a',
  purple: '#8a3ffc',
  green: '#24a148',
  amber: '#f1c21b',
  red: '#da1e28',
  mono: "var(--font-mono)",
  sans: "var(--font-ui)",
} as const

const API_BASE = (import.meta.env.VITE_API_BASE as string || '/api')

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...init,
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${path}`)
  }
  return response.json() as Promise<T>
}

interface CurvePoint {
  x: number
  y: number
}

interface Assignment {
  id: string
  cc: number
  channel: number
  cc_min: number
  cc_max: number
  param_id: string
  param_label: string
  out_min: number
  out_max: number
  curve: Curve
  custom_curve?: CurvePoint[]
  active: boolean
  source: string
}

interface EngineParam {
  id: string
  label: string
  unit: string
  min: number
  max: number
}

interface LiveStateItem {
  cc: number
  channel: number
  raw_value: number
  normalized: number
  curved: number
  mapped_value: number
  param_id: string
  param_label: string
  updated_at_ns: number
}

type LiveState = Record<string, LiveStateItem>

interface ListenResult {
  listener_id: string
  cc: number | null
  channel: number | null
  min_observed: number
  max_observed: number
  status: 'detected' | 'timeout' | 'cancelled'
}

interface RetimeStats {
  mean_ms: number
  p95_ms: number
  max_ms: number
  sample_count: number
  status: string
  gate: string
}

type Curve = 'linear' | 'log' | 'exp' | 'scurve' | 'custom'

const CURVES: Array<{ id: Curve; label: string }> = [
  { id: 'linear', label: 'Linear' },
  { id: 'log', label: 'Logarithmic' },
  { id: 'exp', label: 'Exponential' },
  { id: 'scurve', label: 'S-Curve' },
  { id: 'custom', label: 'Custom' },
]

export interface CcChannelPair {
  cc: number
  channel: number
}

export interface ExpressionViewProps {
  /** CC/channel pairs from MIDI table rows with cc !== null — used for highlighting */
  highlightedCcPairs?: CcChannelPair[]
  /** Pre-fill CC when "New assignment" is clicked */
  initialCc?: number | null
  /** Pre-fill channel when "New assignment" is clicked */
  initialChannel?: number | null
  /** Called after any save or delete mutation succeeds */
  onAssignmentMutated?: () => void
  /** When true activates tab-based layout for constrained width (~700px) */
  constrainedWidth?: boolean
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function applyCurve(value: number, curve: Curve): number {
  const t = clamp01(value)
  if (curve === 'log') return t * t
  if (curve === 'exp') return t ** 0.5
  if (curve === 'scurve') return t * t * (3 - 2 * t)
  return t
}

function sampleCustomCurve(t: number, p1: CurvePoint, p2: CurvePoint): number {
  const u = 1 - t
  const p0y = 0
  const p3y = 1
  return (
    (u ** 3) * p0y +
    3 * (u ** 2) * t * p1.y +
    3 * u * (t ** 2) * p2.y +
    (t ** 3) * p3y
  )
}

function curvePath(curve: Curve, customCurve: CurvePoint[], width: number, height: number): string {
  const pts: string[] = []
  const p1 = customCurve[0] || { x: 0.3, y: 0.3 }
  const p2 = customCurve[1] || { x: 0.7, y: 0.7 }
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40
    const y = curve === 'custom'
      ? sampleCustomCurve(t, p1, p2)
      : applyCurve(t, curve)
    const xPx = t * width
    const yPx = (1 - clamp01(y)) * height
    pts.push(`${xPx.toFixed(2)},${yPx.toFixed(2)}`)
  }
  return `M ${pts.join(' L ')}`
}

function CurvePreview({ curve, customCurve }: { curve: Curve; customCurve: CurvePoint[] }) {
  return (
    <svg width={120} height={120} style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
      <line x1={0} y1={60} x2={120} y2={60} stroke={C.border} strokeWidth={1} />
      <line x1={60} y1={0} x2={60} y2={120} stroke={C.border} strokeWidth={1} />
      <path d={curvePath(curve, customCurve, 120, 120)} fill="none" stroke={C.teal} strokeWidth={2} />
    </svg>
  )
}

function CustomCurveEditor({
  points,
  onChange,
}: {
  points: CurvePoint[]
  onChange: (points: CurvePoint[]) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragging = useRef<number | null>(null)
  const safePoints = points.length === 2 ? points : [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }]

  const applyPointer = useCallback((clientX: number, clientY: number) => {
    if (dragging.current == null || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const px = clamp01((clientX - rect.left) / rect.width)
    const py = clamp01(1 - ((clientY - rect.top) / rect.height))
    const next = safePoints.map((p) => ({ ...p }))
    const idx = dragging.current
    next[idx] = { x: px, y: py }

    // Keep point ordering stable.
    if (idx === 0 && next[0].x >= next[1].x) next[0].x = Math.max(0, next[1].x - 0.02)
    if (idx === 1 && next[1].x <= next[0].x) next[1].x = Math.min(1, next[0].x + 0.02)
    onChange(next)
  }, [onChange, safePoints])

  useEffect(() => {
    const onMove = (event: MouseEvent) => applyPointer(event.clientX, event.clientY)
    const onUp = () => { dragging.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [applyPointer])

  return (
    <svg
      ref={svgRef}
      width={200}
      height={200}
      style={{ background: C.panelAlt, border: `1px solid ${C.border}`, touchAction: 'none' }}
      onMouseLeave={() => { dragging.current = null }}
    >
      <line x1={0} y1={100} x2={200} y2={100} stroke={C.border} strokeWidth={1} />
      <line x1={100} y1={0} x2={100} y2={200} stroke={C.border} strokeWidth={1} />
      <path d={curvePath('custom', safePoints, 200, 200)} fill="none" stroke={C.purple} strokeWidth={2} />
      {safePoints.map((point, index) => (
        <circle
          key={index === 0 ? 'p1' : 'p2'}
          cx={point.x * 200}
          cy={(1 - point.y) * 200}
          r={6}
          fill={index === 0 ? C.teal : C.purple}
          stroke={C.text}
          strokeWidth={1}
          style={{ cursor: 'grab' }}
          onMouseDown={(event) => {
            event.preventDefault()
            dragging.current = index
            applyPointer(event.clientX, event.clientY)
          }}
        />
      ))}
    </svg>
  )
}

function RetimeFooter() {
  const [stats, setStats] = useState<RetimeStats | null>(null)
  const refresh = useCallback(async () => {
    try {
      const next = await apiFetch<RetimeStats>('/v2/expression/retime-stats')
      setStats(next)
    } catch {
      setStats(null)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const p95 = stats?.p95_ms ?? 0
  const statusColor = !stats
    ? C.muted
    : p95 < 3.0
      ? C.green
      : p95 <= 5.0
        ? C.amber
        : C.red

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>
          Control latency p95:{' '}
          <span style={{ color: statusColor }}>
            {stats ? `${stats.p95_ms.toFixed(2)}ms` : '--'}
          </span>
        </span>
        <button
          onClick={refresh}
          style={{
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            color: C.subtle,
            fontFamily: C.sans,
            fontSize: 11,
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  )
}

function LiveDualGraphic({
  assignment,
  paramUnit,
}: {
  assignment: Assignment | null
  paramUnit: string
}) {
  const [pedalNormalized, setPedalNormalized] = useState(0)
  const [paramNormalized, setParamNormalized] = useState(0)
  const [paramDisplay, setParamDisplay] = useState('--')
  const [history, setHistory] = useState<Array<{ pedal: number; param: number }>>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!assignment) return undefined

    const poll = async () => {
      try {
        const state = await apiFetch<LiveState>('/v2/expression/live-state')
        const item = state[assignment.id]
        if (!item) return
        const rangeLo = Math.min(assignment.out_min, assignment.out_max)
        const rangeHi = Math.max(assignment.out_min, assignment.out_max)
        const span = Math.max(0.0001, rangeHi - rangeLo)
        let mappedNorm = clamp01((item.mapped_value - rangeLo) / span)
        if (assignment.out_max < assignment.out_min) {
          mappedNorm = 1 - mappedNorm
        }
        setPedalNormalized(clamp01(item.normalized))
        setParamNormalized(mappedNorm)
        const suffix = paramUnit ? ` ${paramUnit}` : ''
        setParamDisplay(`${item.mapped_value.toFixed(2)}${suffix}`)
        setHistory((prev) => [...prev.slice(-299), { pedal: clamp01(item.normalized), param: mappedNorm }])
      } catch {
        // Keep UI responsive if polling temporarily fails.
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 33)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [assignment, paramUnit])

  if (!assignment) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: C.muted,
        fontFamily: C.sans,
        fontSize: 13,
        textAlign: 'center',
        padding: 16,
      }}>
        No assignment selected. Create an assignment to see live data.
      </div>
    )
  }

  const chartW = 260
  const chartH = 70
  const pathFor = (key: 'pedal' | 'param') => {
    if (history.length < 2) return ''
    const dx = chartW / (history.length - 1)
    return history
      .map((point, index) => {
        const x = index * dx
        const y = (1 - point[key]) * chartH
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }

  const meter = (
    value: number,
    color: string,
    label: string,
    valueLabel: string,
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text }}>{valueLabel}</span>
      <div style={{
        width: 40,
        height: 200,
        border: `1px solid ${C.border}`,
        background: C.panelAlt,
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: `${Math.round(clamp01(value) * 100)}%`,
          background: color,
          transition: 'height 30ms linear',
        }} />
      </div>
      <span style={{
        fontFamily: C.mono,
        fontSize: 10,
        color: C.muted,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
        {meter(pedalNormalized, C.teal, `Pedal (CC ${assignment.cc})`, `${Math.round(pedalNormalized * 100)}%`)}
        {meter(paramNormalized, C.purple, assignment.param_label || assignment.param_id, paramDisplay)}
      </div>
      <div>
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, marginBottom: 4 }}>
          10s overlay
        </div>
        <svg width={chartW} height={chartH} style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <line x1={0} y1={chartH * 0.25} x2={chartW} y2={chartH * 0.25} stroke={C.border} strokeDasharray="2,2" strokeWidth={1} />
          <line x1={0} y1={chartH * 0.75} x2={chartW} y2={chartH * 0.75} stroke={C.border} strokeDasharray="2,2" strokeWidth={1} />
          <path d={pathFor('pedal')} fill="none" stroke={C.teal} strokeWidth={1.5} />
          <path d={pathFor('param')} fill="none" stroke={C.purple} strokeWidth={1.5} />
        </svg>
      </div>
      <RetimeFooter />
    </div>
  )
}

function AssignmentForm({
  initial,
  params,
  onSave,
  onCancel,
  onDelete,
  onListenForCC,
  onCancelListen,
}: {
  initial: Assignment | null
  params: EngineParam[]
  onSave: (payload: Partial<Assignment>) => void
  onCancel: () => void
  onDelete: (assignmentId: string) => void
  onListenForCC: (listenerId: string) => Promise<ListenResult>
  onCancelListen: (listenerId: string) => Promise<void>
}) {
  const [cc, setCc] = useState<number>(initial?.cc ?? 0)
  const [channel, setChannel] = useState<number>(initial?.channel ?? 0)
  const [ccMin, setCcMin] = useState<number>(initial?.cc_min ?? 0)
  const [ccMax, setCcMax] = useState<number>(initial?.cc_max ?? 127)
  const [paramId, setParamId] = useState<string>(initial?.param_id ?? '')
  const [paramLabel, setParamLabel] = useState<string>(initial?.param_label ?? '')
  const [outMin, setOutMin] = useState<number>(initial?.out_min ?? 0)
  const [outMax, setOutMax] = useState<number>(initial?.out_max ?? 1)
  const [curve, setCurve] = useState<Curve>(initial?.curve ?? 'linear')
  const [customCurve, setCustomCurve] = useState<CurvePoint[]>(
    initial?.custom_curve?.length === 2
      ? initial.custom_curve
      : [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }],
  )
  const [active, setActive] = useState<boolean>(initial?.active ?? true)
  const [search, setSearch] = useState<string>('')
  const [listening, setListening] = useState<boolean>(false)
  const [listenerId, setListenerId] = useState<string | null>(null)
  const [detectMessage, setDetectMessage] = useState<string>('')

  useEffect(() => {
    setCc(initial?.cc ?? 0)
    setChannel(initial?.channel ?? 0)
    setCcMin(initial?.cc_min ?? 0)
    setCcMax(initial?.cc_max ?? 127)
    setParamId(initial?.param_id ?? '')
    setParamLabel(initial?.param_label ?? '')
    setOutMin(initial?.out_min ?? 0)
    setOutMax(initial?.out_max ?? 1)
    setCurve(initial?.curve ?? 'linear')
    setCustomCurve(
      initial?.custom_curve?.length === 2
        ? initial.custom_curve
        : [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }],
    )
    setActive(initial?.active ?? true)
    setDetectMessage('')
  }, [initial])

  const filteredParams = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return params
    return params.filter((param) =>
      param.label.toLowerCase().includes(q) || param.id.toLowerCase().includes(q),
    )
  }, [params, search])
  const selectedParam = useMemo(
    () => params.find((param) => param.id === paramId),
    [paramId, params],
  )

  const handleParamSelect = useCallback((param: EngineParam) => {
    setParamId(param.id)
    setParamLabel(param.label)
    setOutMin(param.min)
    setOutMax(param.max)
    setSearch('')
  }, [])

  const startListen = useCallback(async () => {
    const id = `expr-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    setListening(true)
    setListenerId(id)
    setDetectMessage('Move your expression pedal or controller. Waiting for signal...')
    try {
      const result = await onListenForCC(id)
      if (result.status === 'detected' && result.cc != null && result.channel != null) {
        setCc(result.cc)
        setChannel(result.channel)
        setCcMin(result.min_observed)
        setCcMax(result.max_observed)
        setDetectMessage(`Detected CC${result.cc} on channel ${result.channel}.`)
      } else if (result.status === 'timeout') {
        setDetectMessage('No pedal detected. Enter CC number manually.')
      } else {
        setDetectMessage('Listening cancelled.')
      }
    } catch {
      setDetectMessage('Detection failed. Enter CC number manually.')
    } finally {
      setListening(false)
      setListenerId(null)
    }
  }, [onListenForCC])

  const cancelListen = useCallback(async () => {
    if (!listenerId) return
    try {
      await onCancelListen(listenerId)
    } finally {
      setListening(false)
      setListenerId(null)
      setDetectMessage('Listening cancelled.')
    }
  }, [listenerId, onCancelListen])

  const fieldLabel: React.CSSProperties = {
    fontFamily: C.sans,
    color: C.muted,
    fontSize: 11,
    marginBottom: 4,
    display: 'block',
  }
  const inputBase: React.CSSProperties = {
    width: '100%',
    background: C.panelAlt,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    fontFamily: C.mono,
    fontSize: 13,
    padding: '6px 8px',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 0 20px' }}>
      <div style={{
        border: `1px solid ${listening ? C.blue : C.border}`,
        background: listening ? `${C.blue}18` : C.panelDark,
        borderRadius: 4,
        padding: '10px 12px',
      }}>
        <div style={{ fontFamily: C.sans, fontSize: 12, color: C.subtle }}>{detectMessage || 'Auto-detect MIDI CC by moving your pedal.'}</div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          {!listening ? (
            <button
              onClick={startListen}
              style={{
                background: C.blue,
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontFamily: C.sans,
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              Detect CC
            </button>
          ) : (
            <button
              onClick={cancelListen}
              style={{
                background: 'transparent',
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                color: C.subtle,
                fontFamily: C.sans,
                fontSize: 12,
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
        <div>
          <span style={fieldLabel}>CC</span>
          <NumberInput
            value={cc}
            min={0}
            max={127}
            step={1}
            profile="integer"
            onChange={setCc}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={C.blue}
          />
        </div>
        <div>
          <span style={fieldLabel}>Channel (0=Omni)</span>
          <NumberInput
            value={channel}
            min={0}
            max={16}
            step={1}
            profile="integer"
            onChange={setChannel}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={C.blue}
          />
        </div>
        <div>
          <span style={fieldLabel}>Input Min</span>
          <NumberInput
            value={ccMin}
            min={0}
            max={127}
            step={1}
            profile="integer"
            onChange={setCcMin}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={C.blue}
          />
        </div>
        <div>
          <span style={fieldLabel}>Input Max</span>
          <NumberInput
            value={ccMax}
            min={0}
            max={127}
            step={1}
            profile="integer"
            onChange={setCcMax}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={C.blue}
          />
        </div>
      </div>

      <div>
        <span style={fieldLabel}>Target parameter</span>
        <input
          style={{ ...inputBase, marginBottom: 4 }}
          value={search || paramLabel}
          placeholder="Search engine parameters..."
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.trim() && (
          <div style={{
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            overflow: 'hidden',
            maxHeight: 180,
            overflowY: 'auto',
            background: C.panelDark,
          }}>
            {filteredParams.length === 0 && (
              <div style={{ fontFamily: C.sans, fontSize: 12, color: C.muted, padding: 10 }}>No matching parameter.</div>
            )}
            {filteredParams.map((param) => (
              <button
                key={param.id}
                onClick={() => handleParamSelect(param)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${C.border}`,
                  color: param.id === paramId ? C.blue : C.text,
                  fontFamily: C.sans,
                  fontSize: 12,
                  padding: '7px 10px',
                  cursor: 'pointer',
                }}
              >
                {param.label}
                <span style={{ marginLeft: 8, color: C.muted, fontFamily: C.mono, fontSize: 11 }}>{param.unit}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <div>
          <span style={fieldLabel}>Output Min</span>
          <NumberInput
            value={outMin}
            min={selectedParam?.min ?? 0}
            max={selectedParam?.max ?? 1}
            step={
              selectedParam && Number.isInteger(selectedParam.min) && Number.isInteger(selectedParam.max)
                ? 1
                : 0.01
            }
            profile={
              selectedParam && Number.isInteger(selectedParam.min) && Number.isInteger(selectedParam.max)
                ? 'integer'
                : undefined
            }
            onChange={setOutMin}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={C.teal}
          />
        </div>
        <div>
          <span style={fieldLabel}>Output Max</span>
          <NumberInput
            value={outMax}
            min={selectedParam?.min ?? 0}
            max={selectedParam?.max ?? 1}
            step={
              selectedParam && Number.isInteger(selectedParam.min) && Number.isInteger(selectedParam.max)
                ? 1
                : 0.01
            }
            profile={
              selectedParam && Number.isInteger(selectedParam.min) && Number.isInteger(selectedParam.max)
                ? 'integer'
                : undefined
            }
            onChange={setOutMax}
            showLabel={false}
            size="small"
            fullWidth
            accentColor={C.teal}
          />
        </div>
        <button
          onClick={() => {
            const min = outMin
            setOutMin(outMax)
            setOutMax(min)
          }}
          style={{
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            color: C.subtle,
            fontFamily: C.sans,
            fontSize: 12,
            padding: '6px 10px',
            cursor: 'pointer',
            height: 34,
          }}
        >
          Swap
        </button>
      </div>

      <div>
        <span style={fieldLabel}>Response curve</span>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CURVES.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setCurve(entry.id)}
                style={{
                  background: curve === entry.id ? `${C.blue}22` : 'transparent',
                  border: curve === entry.id ? `1px solid ${C.blue}` : `1px solid ${C.border}`,
                  borderRadius: 4,
                  color: curve === entry.id ? C.blue : C.subtle,
                  fontFamily: C.sans,
                  fontSize: 12,
                  textAlign: 'left',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  minWidth: 130,
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CurvePreview curve={curve} customCurve={customCurve} />
            {curve === 'custom' && (
              <CustomCurveEditor points={customCurve} onChange={setCustomCurve} />
            )}
          </div>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: C.sans, fontSize: 12, color: C.subtle }}>
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          style={{ accentColor: C.blue }}
        />
        Assignment active
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSave({
            id: initial?.id,
            cc,
            channel,
            cc_min: ccMin,
            cc_max: ccMax,
            param_id: paramId,
            param_label: paramLabel || paramId,
            out_min: outMin,
            out_max: outMax,
            curve,
            custom_curve: customCurve,
            active,
            source: initial?.source || 'user',
          })}
          disabled={!paramId}
          style={{
            flex: 1,
            background: paramId ? C.blue : C.panelAlt,
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            fontFamily: C.sans,
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 12px',
            cursor: paramId ? 'pointer' : 'default',
          }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            color: C.subtle,
            fontFamily: C.sans,
            fontSize: 13,
            padding: '8px 12px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        {initial && initial.source !== 'performance_mode' && (
          <button
            onClick={() => onDelete(initial.id)}
            style={{
              background: 'transparent',
              border: `1px solid ${C.red}`,
              borderRadius: 4,
              color: C.red,
              fontFamily: C.sans,
              fontSize: 13,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

function AssignmentRow({
  assignment,
  selected,
  onSelect,
  isHighlighted,
}: {
  assignment: Assignment
  selected: boolean
  onSelect: () => void
  isHighlighted?: boolean
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        border: selected ? `1px solid ${C.blue}` : isHighlighted ? `1px solid ${C.teal}` : `1px solid ${C.border}`,
        background: selected ? `${C.blue}1f` : isHighlighted ? `${C.teal}0d` : C.panel,
        borderRadius: 4,
        padding: '8px 10px',
        paddingLeft: isHighlighted && !selected ? 8 : 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        borderLeft: isHighlighted && !selected ? `3px solid ${C.teal}` : undefined,
      }}
    >
      <span style={{ color: C.teal, fontFamily: C.mono, fontSize: 11, minWidth: 38 }}>
        CC{assignment.cc}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: C.text,
          fontFamily: C.sans,
          fontSize: 12,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {assignment.param_label || assignment.param_id}
        </div>
        <div style={{ color: C.muted, fontFamily: C.mono, fontSize: 10 }}>
          ch{assignment.channel || '*'} | {assignment.curve}
        </div>
      </div>
      {isHighlighted && !selected && (
        <span style={{
          fontFamily: C.mono,
          fontSize: 9,
          color: C.teal,
          background: `${C.teal}22`,
          border: `1px solid ${C.teal}44`,
          borderRadius: 3,
          padding: '1px 4px',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          MIDI
        </span>
      )}
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: assignment.active ? C.green : C.panelAlt,
        flexShrink: 0,
      }} />
    </button>
  )
}

// Tab IDs for constrained layout
type ConstrainedTab = 'assignments' | 'edit' | 'live'

export function ExpressionView({
  highlightedCcPairs,
  initialCc,
  initialChannel,
  onAssignmentMutated,
  constrainedWidth = false,
}: ExpressionViewProps) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState<boolean>(false)
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth < 1024)
  const [activeTab, setActiveTab] = useState<ConstrainedTab>('assignments')

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ['expression-assignments'],
    queryFn: () => apiFetch('/v2/expression/assignments'),
    refetchInterval: 2000,
  })

  const { data: paramData } = useQuery<{ parameters: EngineParam[] }>({
    queryKey: ['expression-engine-parameters'],
    queryFn: () => apiFetch('/v2/engine/parameters'),
    staleTime: 60_000,
  })
  const params = paramData?.parameters || []

  const selected = assignments.find((a) => a.id === selectedId) || null
  const selectedParam = params.find((param) => param.id === selected?.param_id)

  // Determine if an assignment's cc/channel matches the MIDI dialog's mapped pairs
  const isHighlighted = useCallback((a: Assignment): boolean => {
    if (!highlightedCcPairs || highlightedCcPairs.length === 0) return false
    return highlightedCcPairs.some(
      (p) =>
        p.cc === a.cc &&
        (p.channel === a.channel || p.channel === 0 || a.channel === 0),
    )
  }, [highlightedCcPairs])

  // Auto-select the first highlighted assignment when overlay opens
  const didAutoSelect = useRef(false)
  useEffect(() => {
    if (didAutoSelect.current || !highlightedCcPairs?.length || assignments.length === 0) return
    const match = assignments.find((a) => isHighlighted(a))
    if (match) {
      setSelectedId(match.id)
      setCreating(false)
      if (constrainedWidth) setActiveTab('edit')
      didAutoSelect.current = true
    }
  }, [assignments, highlightedCcPairs, isHighlighted, constrainedWidth])

  // Seed for new assignment from the MIDI dialog's focused row
  const newAssignmentSeed = useMemo((): Assignment | null => {
    if (initialCc == null) return null
    return {
      id: '',
      cc: initialCc,
      channel: initialChannel ?? 0,
      cc_min: 0,
      cc_max: 127,
      param_id: '',
      param_label: '',
      out_min: 0,
      out_max: 1,
      curve: 'linear',
      active: true,
      source: 'user',
    }
  }, [initialCc, initialChannel])

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<Assignment>) => apiFetch<Assignment>('/v2/expression/assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['expression-assignments'] })
      setSelectedId(saved.id)
      setCreating(false)
      if (constrainedWidth) setActiveTab('assignments')
      onAssignmentMutated?.()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: string) => apiFetch(`/v2/expression/assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expression-assignments'] })
      setSelectedId(null)
      setCreating(false)
      if (constrainedWidth) setActiveTab('assignments')
      onAssignmentMutated?.()
    },
  })

  const listenForCC = useCallback(async (listenerId: string): Promise<ListenResult> => {
    return apiFetch<ListenResult>('/v2/expression/listen-for-cc', {
      method: 'POST',
      body: JSON.stringify({ listener_id: listenerId, timeout_seconds: 10.0 }),
    })
  }, [])

  const cancelListenForCC = useCallback(async (listenerId: string): Promise<void> => {
    await apiFetch('/v2/expression/listen-for-cc/cancel', {
      method: 'POST',
      body: JSON.stringify({ listener_id: listenerId }),
    })
  }, [])

  const userAssignments = assignments.filter((assignment) => assignment.source === 'user')
  const perfAssignments = assignments.filter((assignment) => assignment.source === 'performance_mode')
  const highlightedCount = assignments.filter(isHighlighted).length

  const handleNewAssignment = () => {
    setCreating(true)
    setSelectedId(null)
    if (constrainedWidth) setActiveTab('edit')
  }

  const handleSelectAssignment = (id: string) => {
    setSelectedId(id)
    setCreating(false)
    if (constrainedWidth) setActiveTab('edit')
  }

  const handleCancel = () => {
    setCreating(false)
    setSelectedId(null)
    if (constrainedWidth) setActiveTab('assignments')
  }

  // --- Constrained tab layout ---
  if (constrainedWidth) {
    const tabStyle = (tab: ConstrainedTab): React.CSSProperties => ({
      flex: 1,
      padding: '8px 4px',
      border: 'none',
      borderBottom: activeTab === tab ? `2px solid ${C.blue}` : '2px solid transparent',
      background: 'transparent',
      color: activeTab === tab ? C.text : C.muted,
      fontFamily: C.sans,
      fontSize: 12,
      fontWeight: activeTab === tab ? 600 : 400,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    })

    const assignmentsTabLabel = `Assignments${highlightedCount > 0 ? ` (${highlightedCount} MIDI)` : userAssignments.length + perfAssignments.length > 0 ? ` (${userAssignments.length + perfAssignments.length})` : ''}`

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: C.bg,
        color: C.text,
        fontFamily: C.sans,
      }}>
        {/* Tab bar */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${C.border}`,
          background: C.panelDark,
          flexShrink: 0,
        }}>
          <button style={tabStyle('assignments')} onClick={() => setActiveTab('assignments')}>
            {assignmentsTabLabel}
          </button>
          <button style={tabStyle('edit')} onClick={() => setActiveTab('edit')}>
            {creating ? 'New' : selected ? 'Edit' : 'Edit'}
          </button>
          <button style={tabStyle('live')} onClick={() => setActiveTab('live')}>
            Live Signal
          </button>
        </div>

        {/* Assignments tab */}
        {activeTab === 'assignments' && (
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <button
              onClick={handleNewAssignment}
              style={{
                background: C.blue,
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontFamily: C.sans,
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              New assignment
            </button>

            {highlightedCount > 0 && (
              <div style={{ color: C.teal, fontFamily: C.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>
                Linked to this plugin
              </div>
            )}
            {userAssignments.filter(isHighlighted).map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                selected={selectedId === assignment.id}
                onSelect={() => handleSelectAssignment(assignment.id)}
                isHighlighted
              />
            ))}

            {userAssignments.filter((a) => !isHighlighted(a)).length > 0 && (
              <div style={{ color: C.muted, fontFamily: C.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: highlightedCount > 0 ? 10 : 6 }}>
                {highlightedCount > 0 ? 'Other assignments' : 'User assignments'}
              </div>
            )}
            {userAssignments.filter((a) => !isHighlighted(a)).map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                selected={selectedId === assignment.id}
                onSelect={() => handleSelectAssignment(assignment.id)}
                isHighlighted={false}
              />
            ))}

            {perfAssignments.length > 0 && (
              <div style={{ color: C.muted, fontFamily: C.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 10 }}>
                Performance mode defaults
              </div>
            )}
            {perfAssignments.map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                selected={selectedId === assignment.id}
                onSelect={() => handleSelectAssignment(assignment.id)}
                isHighlighted={isHighlighted(assignment)}
              />
            ))}
          </div>
        )}

        {/* Edit tab */}
        {activeTab === 'edit' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
            {creating || selected ? (
              <AssignmentForm
                initial={creating ? (newAssignmentSeed ?? null) : selected}
                params={params}
                onSave={(payload) => saveMutation.mutate(payload)}
                onCancel={handleCancel}
                onDelete={(assignmentId) => {
                  if (window.confirm('Delete this assignment?')) {
                    deleteMutation.mutate(assignmentId)
                  }
                }}
                onListenForCC={listenForCC}
                onCancelListen={cancelListenForCC}
              />
            ) : (
              <div style={{
                height: '100%',
                minHeight: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.muted,
                fontFamily: C.sans,
                fontSize: 13,
                textAlign: 'center',
                flexDirection: 'column',
                gap: 12,
              }}>
                <span>Select an assignment or create a new one.</span>
                <button
                  onClick={handleNewAssignment}
                  style={{
                    background: C.blue,
                    border: 'none',
                    borderRadius: 4,
                    color: '#fff',
                    fontFamily: C.sans,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '6px 14px',
                    cursor: 'pointer',
                  }}
                >
                  New assignment
                </button>
              </div>
            )}
          </div>
        )}

        {/* Live Signal tab */}
        {activeTab === 'live' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px 0', color: C.muted, fontFamily: C.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
              Live signal
            </div>
            <LiveDualGraphic
              assignment={selected}
              paramUnit={selectedParam?.unit || ''}
            />
          </div>
        )}
      </div>
    )
  }

  // --- Full-width layout (original) ---
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100%',
      background: C.bg,
      color: C.text,
      fontFamily: C.sans,
    }}>
      <div style={{ padding: '16px 22px 0' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: C.text }}>Expression Pedal Control</h1>
        <p style={{ margin: '6px 0 14px', fontSize: 13, color: C.muted }}>
          Map MIDI continuous controllers to any engine parameter.
        </p>
        <div style={{ height: 1, background: C.border }} />
      </div>

      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '300px 1fr 320px',
        overflow: 'hidden',
      }}>
        <div style={{
          borderRight: isMobile ? 'none' : `1px solid ${C.border}`,
          borderBottom: isMobile ? `1px solid ${C.border}` : 'none',
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: isMobile ? 220 : 0,
        }}>
          <button
            onClick={handleNewAssignment}
            style={{
              background: C.blue,
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontFamily: C.sans,
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 10px',
              cursor: 'pointer',
            }}
          >
            New assignment
          </button>

          {highlightedCount > 0 && (
            <div style={{ color: C.teal, fontFamily: C.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>
              Linked to this plugin
            </div>
          )}
          {userAssignments.filter(isHighlighted).map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              selected={selectedId === assignment.id}
              onSelect={() => handleSelectAssignment(assignment.id)}
              isHighlighted
            />
          ))}

          {userAssignments.filter((a) => !isHighlighted(a)).length > 0 && (
            <div style={{ color: C.muted, fontFamily: C.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: highlightedCount > 0 ? 10 : 6 }}>
              {highlightedCount > 0 ? 'Other assignments' : 'User assignments'}
            </div>
          )}
          {userAssignments.filter((a) => !isHighlighted(a)).map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              selected={selectedId === assignment.id}
              onSelect={() => handleSelectAssignment(assignment.id)}
              isHighlighted={false}
            />
          ))}

          {perfAssignments.length > 0 && (
            <div style={{ color: C.muted, fontFamily: C.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 10 }}>
              Performance mode defaults
            </div>
          )}
          {perfAssignments.map((assignment) => (
            <AssignmentRow
              key={assignment.id}
              assignment={assignment}
              selected={selectedId === assignment.id}
              onSelect={() => handleSelectAssignment(assignment.id)}
              isHighlighted={isHighlighted(assignment)}
            />
          ))}
        </div>

        <div style={{
          overflowY: 'auto',
          padding: isMobile ? '0 14px' : '0 22px',
          borderBottom: isMobile ? `1px solid ${C.border}` : 'none',
        }}>
          {creating || selected ? (
            <AssignmentForm
              initial={creating ? (newAssignmentSeed ?? null) : selected}
              params={params}
              onSave={(payload) => saveMutation.mutate(payload)}
              onCancel={handleCancel}
              onDelete={(assignmentId) => {
                if (window.confirm('Delete this assignment?')) {
                  deleteMutation.mutate(assignmentId)
                }
              }}
              onListenForCC={listenForCC}
              onCancelListen={cancelListenForCC}
            />
          ) : (
            <div style={{
              height: '100%',
              minHeight: 260,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.muted,
              fontFamily: C.sans,
              fontSize: 13,
              textAlign: 'center',
            }}>
              Select an assignment to edit, or create a new one.
            </div>
          )}
        </div>

        <div style={{
          borderLeft: isMobile ? 'none' : `1px solid ${C.border}`,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ padding: '14px 16px 0', color: C.muted, fontFamily: C.mono, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
            Live signal
          </div>
          <LiveDualGraphic
            assignment={selected}
            paramUnit={selectedParam?.unit || ''}
          />
        </div>
      </div>
    </div>
  )
}

export function ExpressionPage() {
  return <ExpressionView />
}

export default ExpressionPage
