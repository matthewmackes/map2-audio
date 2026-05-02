/**
 * ExpressionPage - Premium Audio Device UI for Expression Pedal Control (T097)
 * Redesigned with professional audio device aesthetic, enhanced visualizations,
 * and smooth animations using Framer Motion.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { INSTANT_TRANSITION } from '../styles/useReducedMotionSafeVariants'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { NumberInput } from '../components/ParameterControl'
import { EmptyState } from '../components/shared/EmptyState'
import styles from './ExpressionPage.module.css'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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

export interface CcChannelPair {
  cc: number
  channel: number
}

export interface ExpressionViewProps {
  highlightedCcPairs?: CcChannelPair[]
  initialCc?: number | null
  initialChannel?: number | null
  onAssignmentMutated?: () => void
  constrainedWidth?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = (import.meta.env.VITE_API_BASE as string || '/api')

const CURVES: Array<{ id: Curve; label: string }> = [
  { id: 'linear', label: 'Linear' },
  { id: 'log', label: 'Logarithmic' },
  { id: 'exp', label: 'Exponential' },
  { id: 'scurve', label: 'S-Curve' },
  { id: 'custom', label: 'Custom' },
]

const expressionTokens = {
  colors: {
    active: 'var(--support-success)',
    border: 'var(--border)',
    borderSubtle: 'var(--border)',
    curve: 'var(--primary-strong)',
    error: 'var(--support-danger)',
    liveIndicator: 'var(--accent)',
    panelSecondary: 'var(--surface-2)',
    primary: 'var(--primary)',
    textMuted: 'var(--muted-2)',
    textPrimary: 'var(--text-primary)',
    textSecondary: 'var(--text-secondary)',
    textTertiary: 'var(--text-tertiary)',
    warning: 'var(--support-warning)',
  },
  typography: {
    fontFamily: {
      ui: 'var(--font-ui)',
    },
  },
} as const

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

// ============================================================================
// CURVE PREVIEW COMPONENT
// ============================================================================

function CurvePreview({ curve, customCurve }: { curve: Curve; customCurve: CurvePoint[] }) {
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => shouldReduceEffects ? INSTANT_TRANSITION : trans,
    [shouldReduceEffects],
  )
  return (
    <motion.svg
      className={styles.curveSVG}
      width={120}
      height={120}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t({ duration: 0.3 })}
    >
      <line x1={0} y1={60} x2={120} y2={60} stroke={expressionTokens.colors.borderSubtle} strokeWidth={1} />
      <line x1={60} y1={0} x2={60} y2={120} stroke={expressionTokens.colors.borderSubtle} strokeWidth={1} />
      <path
        d={curvePath(curve, customCurve, 120, 120)}
        fill="none"
        stroke={expressionTokens.colors.liveIndicator}
        strokeWidth={2}
      />
    </motion.svg>
  )
}

// ============================================================================
// CUSTOM CURVE EDITOR COMPONENT
// ============================================================================

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
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => shouldReduceEffects ? INSTANT_TRANSITION : trans,
    [shouldReduceEffects],
  )

  const applyPointer = useCallback((clientX: number, clientY: number) => {
    if (dragging.current == null || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const px = clamp01((clientX - rect.left) / rect.width)
    const py = clamp01(1 - ((clientY - rect.top) / rect.height))
    const next = safePoints.map((p) => ({ ...p }))
    const idx = dragging.current
    next[idx] = { x: px, y: py }

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
    <motion.svg
      ref={svgRef}
      className={styles.curveSVG}
      width={200}
      height={200}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={t({ duration: 0.3 })}
      style={{ touchAction: 'none' }}
      onMouseLeave={() => { dragging.current = null }}
    >
      <line x1={0} y1={100} x2={200} y2={100} stroke={expressionTokens.colors.borderSubtle} strokeWidth={1} />
      <line x1={100} y1={0} x2={100} y2={200} stroke={expressionTokens.colors.borderSubtle} strokeWidth={1} />
      <path
        d={curvePath('custom', safePoints, 200, 200)}
        fill="none"
        stroke={expressionTokens.colors.curve}
        strokeWidth={2}
      />
      {safePoints.map((point, index) => (
        <motion.circle
          key={index === 0 ? 'p1' : 'p2'}
          cx={point.x * 200}
          cy={(1 - point.y) * 200}
          r={6}
          fill={index === 0 ? expressionTokens.colors.liveIndicator : expressionTokens.colors.curve}
          stroke={expressionTokens.colors.textPrimary}
          strokeWidth={1}
          whileHover={{ r: 8 }}
          style={{ cursor: 'grab' }}
          onMouseDown={(event) => {
            event.preventDefault()
            dragging.current = index
            applyPointer(event.clientX, event.clientY)
          }}
        />
      ))}
    </motion.svg>
  )
}

// ============================================================================
// RETIME FOOTER COMPONENT
// ============================================================================

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
    ? expressionTokens.colors.textMuted
    : p95 < 3.0
      ? expressionTokens.colors.active
      : p95 <= 5.0
        ? expressionTokens.colors.warning
        : expressionTokens.colors.error

  return (
    <div className={styles.retimeFooter}>
      <span className={styles.retimeStatsLabel}>
        Control latency p95:{' '}
        <span style={{ color: statusColor }} className={styles.retimeValue}>
          {stats ? `${stats.p95_ms.toFixed(2)}ms` : '--'}
        </span>
      </span>
      <motion.button
        className={styles.refreshButton}
        onClick={refresh}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        Refresh
      </motion.button>
    </div>
  )
}

// ============================================================================
// LIVE DUAL GRAPHIC COMPONENT
// ============================================================================

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
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => shouldReduceEffects ? INSTANT_TRANSITION : trans,
    [shouldReduceEffects],
  )

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
        color: expressionTokens.colors.textTertiary,
        textAlign: 'center',
        padding: 16,
      }}>
        <EmptyState
          title="No assignment selected"
          description="Create an assignment to see live data."
          compact
        />
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

  const Meter = (props: {
    value: number
    color: string
    label: string
    valueLabel: string
  }) => (
    <div className={styles.meterColumn}>
      <div className={styles.meterValueLabel}>{props.valueLabel}</div>
      <motion.div
        className={styles.meterContainer}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t({ duration: 0.3 })}
      >
        <motion.div
          className={styles.meterFill}
          style={{ background: props.color, height: '0%' }}
          animate={{ height: `${Math.round(clamp01(props.value) * 100)}%` }}
          transition={t({ duration: 0.03, ease: 'linear' })}
        />
      </motion.div>
      <span className={styles.meterLabel}>{props.label}</span>
    </div>
  )

  return (
    <motion.div
      className={styles.monitorContent}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t({ duration: 0.4 })}
    >
      <div className={styles.meterRow}>
        <Meter
          value={pedalNormalized}
          color={expressionTokens.colors.liveIndicator}
          label={`Pedal (CC ${assignment.cc})`}
          valueLabel={`${Math.round(pedalNormalized * 100)}%`}
        />
        <Meter
          value={paramNormalized}
          color={expressionTokens.colors.curve}
          label={assignment.param_label || assignment.param_id}
          valueLabel={paramDisplay}
        />
      </div>

      <div className={styles.waveformContainer}>
        <span className={styles.waveformLabel}>10s overlay</span>
        <motion.svg
          className={styles.waveformSVG}
          width={chartW}
          height={chartH}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={t({ duration: 0.3, delay: 0.1 })}
        >
          <line x1={0} y1={chartH * 0.25} x2={chartW} y2={chartH * 0.25} stroke={expressionTokens.colors.borderSubtle} strokeDasharray="2,2" strokeWidth={1} />
          <line x1={0} y1={chartH * 0.75} x2={chartW} y2={chartH * 0.75} stroke={expressionTokens.colors.borderSubtle} strokeDasharray="2,2" strokeWidth={1} />
          <path d={pathFor('pedal')} fill="none" stroke={expressionTokens.colors.liveIndicator} strokeWidth={1.5} />
          <path d={pathFor('param')} fill="none" stroke={expressionTokens.colors.curve} strokeWidth={1.5} />
        </motion.svg>
      </div>

      <RetimeFooter />
    </motion.div>
  )
}

// ============================================================================
// ASSIGNMENT FORM COMPONENT
// ============================================================================

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
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => shouldReduceEffects ? INSTANT_TRANSITION : trans,
    [shouldReduceEffects],
  )

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

  return (
    <motion.div
      className={styles.formSection}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t({ duration: 0.3 })}
    >
      {/* CC Detection Panel */}
      <motion.div
        className={`${styles.detectCCPanel} ${listening ? styles.detectCCPanelListening : ''}`}
        animate={{ borderColor: listening ? expressionTokens.colors.primary : expressionTokens.colors.border }}
        transition={t({ duration: 0.2 })}
      >
        <div className={styles.detectCCMessage}>
          {detectMessage || 'Auto-detect MIDI CC by moving your pedal.'}
        </div>
        <div className={styles.detectCCButtons}>
          {!listening ? (
            <motion.button
              className={styles.buttonPrimary}
              onClick={startListen}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ flex: 1 }}
            >
              Detect CC
            </motion.button>
          ) : (
            <motion.button
              className={styles.buttonSecondary}
              onClick={cancelListen}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ flex: 1 }}
            >
              Cancel
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* MIDI Input Fields */}
      <motion.div
        className={styles.fieldGrid}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.1 })}
      >
        <div>
          <label className={styles.fieldLabel}>CC</label>
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
            accentColor={expressionTokens.colors.primary}
          />
        </div>
        <div>
          <label className={styles.fieldLabel}>Channel (0=Omni)</label>
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
            accentColor={expressionTokens.colors.primary}
          />
        </div>
        <div>
          <label className={styles.fieldLabel}>Input Min</label>
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
            accentColor={expressionTokens.colors.primary}
          />
        </div>
        <div>
          <label className={styles.fieldLabel}>Input Max</label>
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
            accentColor={expressionTokens.colors.primary}
          />
        </div>
      </motion.div>

      {/* Parameter Selection */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.15 })}
      >
        <label className={styles.fieldLabel}>Target Parameter</label>
        <input
          type="text"
          className={styles.inputField}
          value={search || paramLabel}
          placeholder="Search engine parameters..."
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 4 }}
        />
        <AnimatePresence>
          {search.trim() && (
            <motion.div
              className={styles.parameterDropdown}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={t({ duration: 0.2 })}
            >
              {filteredParams.length === 0 && (
                <div className={styles.parameterEmptyMessage}>No matching parameter.</div>
              )}
              {filteredParams.map((param) => (
                <motion.button
                  key={param.id}
                  className={`${styles.parameterOption} ${paramId === param.id ? styles.parameterOptionSelected : ''}`}
                  onClick={() => handleParamSelect(param)}
                  whileHover={{ backgroundColor: expressionTokens.colors.panelSecondary }}
                >
                  <span>{param.label}</span>
                  <span className={styles.parameterOptionUnit}>{param.unit}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Output Range */}
      <motion.div
        className={styles.fieldGridThreeCol}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.2 })}
      >
        <div>
          <label className={styles.fieldLabel}>Output Min</label>
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
            accentColor={expressionTokens.colors.liveIndicator}
          />
        </div>
        <div>
          <label className={styles.fieldLabel}>Output Max</label>
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
            accentColor={expressionTokens.colors.liveIndicator}
          />
        </div>
        <motion.button
          className={styles.buttonSecondary}
          onClick={() => {
            const min = outMin
            setOutMin(outMax)
            setOutMax(min)
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ height: 34 }}
        >
          Swap
        </motion.button>
      </motion.div>

      {/* Response Curve */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.25 })}
      >
        <label className={styles.fieldLabel}>Response Curve</label>
        <div className={styles.curveSection}>
          <div className={styles.curveButtonList}>
            {CURVES.map((entry) => (
              <motion.button
                key={entry.id}
                className={`${styles.curveButton} ${curve === entry.id ? styles.curveButtonActive : ''}`}
                onClick={() => setCurve(entry.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {entry.label}
              </motion.button>
            ))}
          </div>
          <div className={styles.curvePreviewContainer}>
            <CurvePreview curve={curve} customCurve={customCurve} />
            <AnimatePresence>
              {curve === 'custom' && (
                <CustomCurveEditor points={customCurve} onChange={setCustomCurve} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Active Checkbox */}
      <motion.label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: expressionTokens.typography.fontFamily.ui,
          fontSize: '12px',
          color: expressionTokens.colors.textSecondary,
        }}
        whileHover={{ scale: 1.02 }}
      >
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          style={{
            accentColor: expressionTokens.colors.primary,
            cursor: 'pointer',
          }}
        />
        Assignment active
      </motion.label>

      {/* Action Buttons */}
      <motion.div
        className={styles.buttonGroup}
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={t({ duration: 0.3, delay: 0.3 })}
      >
        <motion.button
          className={styles.buttonPrimary}
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
          whileHover={paramId ? { scale: 1.02 } : {}}
          whileTap={paramId ? { scale: 0.98 } : {}}
          style={{ opacity: paramId ? 1 : 0.5 }}
        >
          Save
        </motion.button>
        <motion.button
          className={styles.buttonSecondary}
          onClick={onCancel}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Cancel
        </motion.button>
        {initial && initial.source !== 'performance_mode' && (
          <motion.button
            className={styles.buttonDanger}
            onClick={() => onDelete(initial.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Delete
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  )
}

// ============================================================================
// ASSIGNMENT ROW COMPONENT
// ============================================================================

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
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const t = useCallback(
    (trans: Record<string, unknown>) => shouldReduceEffects ? INSTANT_TRANSITION : trans,
    [shouldReduceEffects],
  )
  return (
    <motion.button
      className={`${styles.assignmentRow} ${selected ? styles.assignmentRowSelected : ''} ${isHighlighted && !selected ? styles.assignmentRowHighlighted : ''} ${selected && isHighlighted ? styles.assignmentRowSelectedHighlighted : ''}`}
      onClick={onSelect}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={t({ duration: 0.2 })}
    >
      <span className={styles.assignmentCCLabel}>CC{assignment.cc}</span>
      <div className={styles.assignmentContent}>
        <div className={styles.assignmentParamName}>
          {assignment.param_label || assignment.param_id}
        </div>
        <div className={styles.assignmentMetadata}>
          ch{assignment.channel || '*'} | {assignment.curve}
        </div>
      </div>
      {isHighlighted && !selected && (
        <motion.span
          className={styles.assignmentMidiLabel}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={t({ duration: 0.2 })}
        >
          MIDI
        </motion.span>
      )}
      <motion.div
        className={`${styles.assignmentStatusIndicator} ${assignment.active ? styles.assignmentStatusIndicatorActive : ''}`}
        animate={{
          boxShadow: assignment.active
            ? '0 0 8px color-mix(in srgb, var(--support-success) 30%, transparent)'
            : 'none',
        }}
        transition={t({ duration: 0.3 })}
      />
    </motion.button>
  )
}

// ============================================================================
// MAIN EXPRESSION VIEW COMPONENT
// ============================================================================

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
  const { shouldReduceEffects } = useReducedEffectsPreference()
  // t() maps raw Framer transition objects through the reduced-motion preference
  const t = useCallback(
    (trans: Record<string, unknown>) => shouldReduceEffects ? INSTANT_TRANSITION : trans,
    [shouldReduceEffects],
  )

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

  const isHighlighted = useCallback((a: Assignment): boolean => {
    if (!highlightedCcPairs || highlightedCcPairs.length === 0) return false
    return highlightedCcPairs.some(
      (p) =>
        p.cc === a.cc &&
        (p.channel === a.channel || p.channel === 0 || a.channel === 0),
    )
  }, [highlightedCcPairs])

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

  // Full-width layout for desktop
  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={t({ duration: 0.4 })}
    >
      <div className={styles.header}>
        <h1 className={styles.title}>Expression Pedal Control</h1>
        <p className={styles.subtitle}>
          Map MIDI continuous controllers to any engine parameter with real-time feedback and curve shaping.
        </p>
        <div className={styles.headerDivider} />
      </div>

      <div className={styles.mainGrid}>
        {/* Assignment List Column */}
        <motion.div
          className={styles.assignmentColumn}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={t({ duration: 0.4, delay: 0.1 })}
        >
          <motion.button
            className={styles.newAssignmentButton}
            onClick={handleNewAssignment}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            layoutId="new-button"
          >
            New assignment
          </motion.button>

          {highlightedCount > 0 && (
            <motion.div
              className={`${styles.assignmentGroupLabel} ${styles.assignmentGroupLabelHighlighted}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={t({ duration: 0.2 })}
            >
              Linked to this plugin
            </motion.div>
          )}

          <AnimatePresence>
            {userAssignments.filter(isHighlighted).map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                selected={selectedId === assignment.id}
                onSelect={() => handleSelectAssignment(assignment.id)}
                isHighlighted
              />
            ))}
          </AnimatePresence>

          {userAssignments.filter((a) => !isHighlighted(a)).length > 0 && (
            <motion.div
              className={styles.assignmentGroupLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={t({ duration: 0.2 })}
              style={{
                marginTop: highlightedCount > 0 ? 10 : 6,
              }}
            >
              {highlightedCount > 0 ? 'Other assignments' : 'User assignments'}
            </motion.div>
          )}

          <AnimatePresence>
            {userAssignments.filter((a) => !isHighlighted(a)).map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                selected={selectedId === assignment.id}
                onSelect={() => handleSelectAssignment(assignment.id)}
                isHighlighted={false}
              />
            ))}
          </AnimatePresence>

          {perfAssignments.length > 0 && (
            <motion.div
              className={styles.assignmentGroupLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={t({ duration: 0.2 })}
            >
              Performance mode defaults
            </motion.div>
          )}

          <AnimatePresence>
            {perfAssignments.map((assignment) => (
              <AssignmentRow
                key={assignment.id}
                assignment={assignment}
                selected={selectedId === assignment.id}
                onSelect={() => handleSelectAssignment(assignment.id)}
                isHighlighted={isHighlighted(assignment)}
              />
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Form Column */}
        <motion.div
          className={styles.formColumn}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={t({ duration: 0.4, delay: 0.15 })}
        >
          <AnimatePresence mode="wait">
            {creating || selected ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={t({ duration: 0.3 })}
              >
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
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                className={styles.emptyStateContainer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={t({ duration: 0.3 })}
              >
                <span>Select an assignment to edit, or create a new one.</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Live Monitor Column */}
        <motion.div
          className={styles.monitorColumn}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={t({ duration: 0.4, delay: 0.2 })}
        >
          <div className={styles.monitorHeader}>Live Signal</div>
          <LiveDualGraphic
            assignment={selected}
            paramUnit={selectedParam?.unit || ''}
          />
        </motion.div>
      </div>
    </motion.div>
  )
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export function ExpressionPage() {
  return (
    <>
      <ExpressionView />
    </>
  )
}

export default ExpressionPage
