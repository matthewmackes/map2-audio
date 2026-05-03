import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronDown, ChevronUp, Close } from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ToastContainer, toast, type ToastOptions } from 'react-toastify'

import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { useClusterSnapshotRuntimeLiveState } from '../hooks/useSnapshotRuntimeState'
import { useVuMeters } from '../hooks/useVuMeters'
import { audioApi } from '../../map2/clients/audio'
import { midiHubApi } from '../../map2/api'
import type { SnapshotRuntimeDisplayState, SnapshotRuntimeLiveState } from '../../map2/types'
import { withNodeQuery } from '../utils/clusterTransport'
import { usePersistedState, type PersistedKey } from '../utils/persistedState'
import { buildSnapshotActivationFailureStageToast } from '../utils/snapshotActivationToast'
import { StageChyronCard, type ChyronLiveState } from './StageChyronCard'
import { StageDateline, StageChyronStrap, StageEventTicker, StageMidiPanel, type StageMidiEvent, type TickerEvent } from './StageMissionChrome'
import './Toasts.css'
import 'react-toastify/dist/ReactToastify.css'

export type NotificationTone = 'info' | 'success' | 'warn' | 'error'
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'
export type NotificationClass =
  | 'critical_alert'
  | 'warning_alert'
  | 'live_snapshot'
  | 'workflow'
  | 'minor_transient'

export interface NotificationAction {
  label: string
  onClick: () => void
}

export interface NotificationResourceKey {
  kind: 'snapshot' | 'node' | 'device' | 'backend' | 'workflow' | 'generic'
  id: string
}

export interface StageNotificationConfig {
  kind?: NotificationClass
  severity?: NotificationSeverity
  resource?: NotificationResourceKey
  compactLabel?: string
  sourceLabel?: string
  route?: string
  routeLabel?: string
  liveSnapshotPinned?: boolean
  replaceLiveBanner?: boolean
  sticky?: boolean
  suppressTransient?: boolean
  meta?: string[]
}

export interface NotificationOptions {
  id?: string
  persistent?: boolean
  durationMs?: number
  action?: NotificationAction
  title?: string
  stage?: StageNotificationConfig
}

interface NotificationRecord {
  id: string
  title: string
  message: string
  tone: NotificationTone
  timestamp: number
  updatedAt: number
  persistent: boolean
  action?: NotificationAction
  stage?: Required<StageNotificationConfig> | null
}

interface NotificationContextValue {
  pushNotification: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
  dismissNotification: (id: string) => void
  clearNotifications: () => void
  notifications: NotificationRecord[]
}

const DEFAULT_STAGE_DURATION_MS = 6500
const ROOT_STAGE_NOTIFICATION_HEIGHT_VAR = '--stage-notification-reserved-height'
const STAGE_METER_FLOOR_DB = -60
const STAGE_METER_HISTORY_LIMIT = 240
const STAGE_CPU_HISTORY_LIMIT = 120
const STAGE_WARNING_HISTORY_LIMIT = 60
const KYRON_TRANSITION_DURATION_MS = 420
const KYRON_DWELL_DURATION_MS = 3000
const MINI_KYRON_ROTATION_MS = 2400

interface MeterHistorySample {
  left: number
  right: number
}

interface StageWarningEntry {
  id: string
  severity: NotificationSeverity
  title: string
  detail: string
  progressPercent?: number
}

interface StageWarningHistorySample {
  severity: NotificationSeverity | null
  count: number
}

interface StageKyronEntry {
  key: string
  record: NotificationRecord
}

interface StageMiniKyronFrame {
  key: string
  label: string
  text: string
}

function makeNotificationId() {
  return crypto?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
}

function severityFromTone(tone: NotificationTone): NotificationSeverity {
  switch (tone) {
    case 'error':
      return 'critical'
    case 'warn':
      return 'warning'
    case 'success':
      return 'success'
    default:
      return 'info'
  }
}

function titleFromTone(tone: NotificationTone): string {
  switch (tone) {
    case 'error':
      return 'Critical alert'
    case 'warn':
      return 'Warning'
    case 'success':
      return 'Update'
    default:
      return 'Info'
  }
}

function defaultKindForSeverity(severity: NotificationSeverity): NotificationClass {
  if (severity === 'critical') {
    return 'critical_alert'
  }
  if (severity === 'warning') {
    return 'warning_alert'
  }
  return 'workflow'
}

function normalizeStageConfig(
  tone: NotificationTone,
  options: NotificationOptions | undefined,
): Required<StageNotificationConfig> | null {
  if (!options?.stage) {
    return null
  }

  const severity = options.stage.severity ?? severityFromTone(tone)
  const kind = options.stage.kind ?? defaultKindForSeverity(severity)

  return {
    kind,
    severity,
    resource: options.stage.resource ?? { kind: 'generic', id: options.id ?? makeNotificationId() },
    compactLabel: options.stage.compactLabel ?? options.title ?? titleFromTone(tone),
    sourceLabel: options.stage.sourceLabel ?? '',
    route: options.stage.route ?? '',
    routeLabel: options.stage.routeLabel ?? 'Open related workspace',
    liveSnapshotPinned: Boolean(options.stage.liveSnapshotPinned),
    replaceLiveBanner: options.stage.replaceLiveBanner ?? kind !== 'live_snapshot',
    sticky: Boolean(options.stage.sticky),
    suppressTransient: options.stage.suppressTransient ?? true,
    meta: options.stage.meta ?? [],
  }
}

function shouldRenderTransient(
  stage: Required<StageNotificationConfig> | null,
  viewportMounted: boolean,
): boolean {
  if (!stage) return true
  // When the rich stage viewport isn't mounted on this route (see
  // STAGE_VIEWPORT_ROUTE_PREFIXES), critical/warning alerts must still
  // surface — fall back to the toastify transient so a backend-unreachable
  // or critical_alert is never silent.
  if (!viewportMounted && (stage.kind === 'critical_alert' || stage.kind === 'warning_alert')) {
    return true
  }
  return !stage.suppressTransient
}

function buildToastifyOptions(
  id: string,
  tone: NotificationTone,
  options: NotificationOptions | undefined,
): ToastOptions {
  const type =
    tone === 'error'
      ? 'error'
      : tone === 'warn'
        ? 'warning'
        : tone === 'success'
          ? 'success'
          : 'info'

  return {
    toastId: id,
    type,
    autoClose: options?.persistent ? false : options?.durationMs ?? 4000,
    closeOnClick: !options?.action,
    draggable: false,
    pauseOnHover: true,
  }
}

function stagePriority(record: NotificationRecord): number {
  const stage = record.stage
  if (!stage) return 0
  if (stage.kind === 'critical_alert') return 500
  if (stage.severity === 'critical') return 460
  if (stage.kind === 'warning_alert') return 420
  if (stage.severity === 'warning') return 390
  if (stage.kind === 'live_snapshot') return 320
  if (stage.kind === 'workflow') return 240
  return 100
}

function chooseLiveSnapshot(states: SnapshotRuntimeLiveState[]): SnapshotRuntimeLiveState | null {
  const liveStates = states.filter((state) => !state.is_offline && state.state === 'live' && state.snapshot_id != null)
  if (liveStates.length === 0) {
    return null
  }

  return liveStates.slice().sort((left, right) => {
    if (left.node_id === 'local') return -1
    if (right.node_id === 'local') return 1
    return (right.seq ?? 0) - (left.seq ?? 0)
  })[0] ?? null
}

function buildLiveSnapshotRecord(state: SnapshotRuntimeLiveState): NotificationRecord {
  return {
    id: `live-snapshot:${state.node_id}:${state.snapshot_id ?? 'none'}`,
    title: state.snapshot_name ?? (state.snapshot_id != null ? `Snapshot ${state.snapshot_id}` : 'Live snapshot'),
    message: state.display_label || 'Live',
    tone: state.is_warning ? 'warn' : 'success',
    timestamp: Date.now(),
    updatedAt: Date.now(),
    persistent: true,
    stage: {
      kind: 'live_snapshot',
      severity: state.is_warning ? 'warning' : 'success',
      resource: {
        kind: 'snapshot',
        id: String(state.snapshot_id ?? state.node_id),
      },
      compactLabel: state.snapshot_name ?? 'Live snapshot',
      sourceLabel: state.node_id,
      route: withNodeQuery('/snapshot-editor', state.node_id),
      routeLabel: `Open ${state.snapshot_name ?? 'live snapshot'} in Snapshot Editor`,
      liveSnapshotPinned: true,
      replaceLiveBanner: false,
      sticky: true,
      suppressTransient: true,
      meta: [
        state.snapshot_id != null ? `Snapshot ${state.snapshot_id}` : 'Live snapshot',
        state.snapshot_revision ? `Revision ${state.snapshot_revision}` : '',
        state.node_id,
      ].filter(Boolean),
    },
  }
}

function toneLabelForRecord(record: NotificationRecord): string {
  const severity = record.stage?.severity ?? severityFromTone(record.tone)
  if (severity === 'critical') return 'Critical'
  if (severity === 'warning') return 'Warning'
  if (severity === 'success') return 'Stable'
  return 'Info'
}

function kyronLabelForSeverity(severity: NotificationSeverity): string {
  if (severity === 'critical') return 'Error'
  if (severity === 'warning') return 'Warning'
  if (severity === 'success') return 'Update'
  return 'Info'
}

function buildKyronEntry(record: NotificationRecord): StageKyronEntry {
  return {
    key: `${record.id}:${record.updatedAt}`,
    record: {
      ...record,
      stage: record.stage ? {
        ...record.stage,
        resource: { ...record.stage.resource },
        meta: [...record.stage.meta],
      } : null,
    },
  }
}

function formatStageTimestamp(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(timestamp)
  } catch {
    return ''
  }
}

function clampStageMeterDb(value: number): number {
  if (!Number.isFinite(value)) {
    return STAGE_METER_FLOOR_DB
  }
  return Math.max(STAGE_METER_FLOOR_DB, Math.min(6, value))
}

function meterDbToPercent(value: number): number {
  return ((clampStageMeterDb(value) - STAGE_METER_FLOOR_DB) / Math.abs(STAGE_METER_FLOOR_DB)) * 100
}

function formatMeterDb(value: number): string {
  const normalized = clampStageMeterDb(value)
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(1)} dB`
}

function formatSampleRateLabel(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) {
    return '--'
  }
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : `${value}`
}

function trimHistory<T>(history: T[], next: T, limit: number): T[] {
  const appended = [...history, next]
  if (appended.length <= limit) {
    return appended
  }
  return appended.slice(appended.length - limit)
}

function countLiveBlocks(state: SnapshotRuntimeLiveState | null): number {
  const paths = state?.live_snapshot_payload?.paths ?? []
  if (!Array.isArray(paths) || paths.length === 0) {
    return 0
  }
  return paths.reduce((sum, path) => {
    const pluginCount = Array.isArray(path?.plugins) ? path.plugins.length : 0
    const loopCount = Array.isArray(path?.loop_insertions) ? path.loop_insertions.length : 0
    const effectsLoopCount = Array.isArray(path?.effects_loops) ? path.effects_loops.length : 0
    return sum + pluginCount + loopCount + effectsLoopCount
  }, 0)
}

function buildSparklinePath(values: number[]): string {
  if (values.length === 0) {
    return ''
  }
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100
      const y = 100 - (((value - min) / range) * 100)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function severityRank(value: NotificationSeverity | null | undefined): number {
  return value === 'critical' ? 4 : value === 'warning' ? 3 : value === 'success' ? 2 : value === 'info' ? 1 : 0
}

function activationProgressPercent(value: unknown): number | null {
  const phase = String(value || '').toUpperCase()
  if (!phase) {
    return null
  }
  if (phase === 'VALIDATING') {
    return 33
  }
  if (phase === 'APPLYING') {
    return 66
  }
  if (phase === 'LIVE') {
    return 100
  }
  return 12
}

function classifyRuntimeWarningTitle(code: unknown, message: unknown): { severity: NotificationSeverity; title: string } {
  const normalized = `${String(code || '')} ${String(message || '')}`.toLowerCase()
  if (normalized.includes('avb') || normalized.includes('clock') || normalized.includes('sync')) {
    return { severity: 'warning', title: 'AVB sync loss' }
  }
  if (
    normalized.includes('device')
    || normalized.includes('driver')
    || normalized.includes('engine_apply_failed')
    || normalized.includes('audio_input_missing')
    || normalized.includes('audio_output_missing')
  ) {
    return { severity: 'critical', title: 'Audio driver lost' }
  }
  return { severity: 'warning', title: String(code || 'Runtime warning') }
}

function normalizeWarningText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function buildActivationWarningEntry(
  liveSnapshotState: SnapshotRuntimeLiveState | null,
  activationProgress: Record<string, unknown> | undefined,
): StageWarningEntry | null {
  if (!activationProgress || activationProgress.current_phase === 'LIVE') {
    return null
  }

  const snapshotName = liveSnapshotState?.snapshot_name ?? 'Live snapshot'
  const progressStatus = String(activationProgress.status || '').toLowerCase()
  const progressNote = normalizeWarningText(activationProgress.note)
  if (progressStatus === 'failed' || normalizeWarningText(liveSnapshotState?.failure_reason)) {
    const failureDescriptor = buildSnapshotActivationFailureStageToast(
      snapshotName,
      liveSnapshotState?.failure_reason ?? progressNote ?? 'Activation failed.',
      {
        snapshotId: liveSnapshotState?.snapshot_id ?? null,
        nodeId: liveSnapshotState?.node_id ?? null,
      },
    )
    return {
      id: 'activation-failure',
      severity: 'critical',
      title: failureDescriptor.title,
      detail: failureDescriptor.message,
    }
  }

  const currentLabel = normalizeWarningText(activationProgress.current_snapshot_name) ?? 'Current rig'
  const targetLabel = normalizeWarningText(activationProgress.target_snapshot_name) ?? snapshotName
  return {
    id: 'activation-progress',
    severity: 'warning',
    title: `Activating ${currentLabel} -> ${targetLabel}`,
    detail: progressNote ?? 'Snapshot activation is still in progress.',
    progressPercent: activationProgressPercent(activationProgress.current_phase),
  }
}

function buildRuntimeWarningEntry(
  warning: Record<string, unknown>,
  index: number,
): StageWarningEntry {
  const operatorMessage = normalizeWarningText(warning.operator_message)
  const message = normalizeWarningText(warning.message)
  const classification = classifyRuntimeWarningTitle(warning.code, operatorMessage ?? message)

  let detail = operatorMessage ?? message ?? 'Live runtime warning reported.'
  if (classification.title === 'Audio driver lost' && !operatorMessage && !message) {
    detail = 'The active audio device stopped responding or was unplugged during the live run.'
  } else if (classification.title === 'AVB sync loss' && !operatorMessage && !message) {
    detail = 'Clock drift or sync loss was detected on the active AVB path.'
  }

  return {
    id: `runtime-warning:${index}:${String(warning.code || classification.title)}`,
    severity: warning.severity === 'blocking' ? 'critical' : classification.severity,
    title: normalizeWarningText(warning.title) ?? classification.title,
    detail,
  }
}

function useStageMeterTelemetry(nodeId: string | null, snapshotKey: string, isLive: boolean) {
  const { levels, peakHold, isConnected, isRunning } = useVuMeters({
    nodeId,
    useWebSocket: true,
    pollingInterval: 100,
  })
  const [history, setHistory] = useState<MeterHistorySample[]>([])
  const [clipCount, setClipCount] = useState(0)
  const [clipLatched, setClipLatched] = useState(false)
  const [silenceActive, setSilenceActive] = useState(false)
  const clippingRef = useRef(false)
  const silenceStartedAtRef = useRef<number | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setHistory([])
    setClipCount(0)
    setClipLatched(false)
    setSilenceActive(false)
    clippingRef.current = false
    silenceStartedAtRef.current = null
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [snapshotKey])

  useEffect(() => {
    if (!isLive) {
      return
    }
    setHistory((current) => trimHistory(current, {
      left: clampStageMeterDb(levels.outputLeft),
      right: clampStageMeterDb(levels.outputRight),
    }, STAGE_METER_HISTORY_LIMIT))
  }, [isLive, levels.outputLeft, levels.outputRight])

  useEffect(() => {
    if (!isLive || !isRunning) {
      clippingRef.current = false
      silenceStartedAtRef.current = null
      setSilenceActive(false)
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      return
    }

    const now = Date.now()
    const peakDb = Math.max(clampStageMeterDb(levels.outputLeft), clampStageMeterDb(levels.outputRight))
    const clippingNow = peakDb >= 0
    if (clippingNow && !clippingRef.current) {
      setClipCount((current) => current + 1)
      setClipLatched(true)
    }
    clippingRef.current = clippingNow

    if (peakDb <= STAGE_METER_FLOOR_DB) {
      if (silenceStartedAtRef.current == null) {
        silenceStartedAtRef.current = now
        silenceTimerRef.current = setTimeout(() => {
          setSilenceActive(true)
          silenceTimerRef.current = null
        }, 3000)
      }
      return
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    silenceStartedAtRef.current = null
    setSilenceActive(false)
  }, [isLive, isRunning, levels.outputLeft, levels.outputRight])

  return {
    levels,
    peakHold,
    history,
    clipCount,
    clipLatched,
    silenceActive,
    isConnected,
    isRunning,
  }
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function midiNoteLabel(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`
}

function midiCcLabel(cc: number): string {
  const CC_NAMES: Record<number, string> = {
    1: 'Mod Wheel', 7: 'Volume', 10: 'Pan', 11: 'Expression',
    64: 'Sustain', 65: 'Portamento', 66: 'Sostenuto', 67: 'Soft Pedal',
    71: 'Resonance', 74: 'Cutoff', 91: 'Reverb', 93: 'Chorus',
  }
  return CC_NAMES[cc] ?? `CC ${cc}`
}

function trafficRowToMidiEvent(row: { timestamp_ns: number; decoded?: { message_type?: string; channel?: number | null; data1?: number | null; data2?: number | null } }, idPrefix: string): StageMidiEvent | null {
  const d = row.decoded
  if (!d) return null
  const msgType = String(d.message_type ?? '').toLowerCase()
  const ch = (d.channel ?? 0) + 1
  const a = d.data1 ?? 0
  const b = d.data2 ?? null

  let type: StageMidiEvent['type']
  let label: string

  if (msgType === 'control_change') {
    type = 'CC'
    label = midiCcLabel(a)
  } else if (msgType === 'program_change') {
    type = 'PC'
    label = `Program ${a + 1}`
  } else if (msgType === 'note_on' || msgType === 'note_off') {
    type = 'Note'
    label = midiNoteLabel(a)
  } else {
    return null
  }

  return {
    id: `${idPrefix}-${row.timestamp_ns}`,
    type,
    ch,
    a,
    b: type === 'PC' ? null : b,
    label,
    timestamp: Math.round(row.timestamp_ns / 1_000_000),
  }
}

function useStageMidiEvents(nodeId: string | null): StageMidiEvent[] {
  const trafficQuery = useQuery({
    queryKey: ['stage-notification', 'midi-traffic', nodeId ?? 'local'],
    queryFn: () => midiHubApi.getTrafficSnapshot({ limit: 20 }, nodeId),
    refetchInterval: 1500,
    staleTime: 500,
  })

  return useMemo<StageMidiEvent[]>(() => {
    const records = trafficQuery.data?.records ?? []
    const mapped = records
      .slice()
      .sort((a, b) => b.timestamp_ns - a.timestamp_ns)
      .map((row) => trafficRowToMidiEvent(row, nodeId ?? 'local'))
      .filter((ev): ev is StageMidiEvent => ev !== null)
      .slice(0, 5)

    if (mapped.length > 0) return mapped

    // fallback simulation when no live data
    const now = Date.now()
    return [
      { id: 'seed-1', type: 'CC',   ch: 3, a: 74, b: 96,  label: 'Cutoff',     timestamp: now - 420 },
      { id: 'seed-2', type: 'PC',   ch: 1, a: 17, b: null, label: 'Program 18', timestamp: now - 1180 },
      { id: 'seed-3', type: 'CC',   ch: 3, a: 1,  b: 48,  label: 'Mod Wheel',  timestamp: now - 2640 },
      { id: 'seed-4', type: 'Note', ch: 2, a: 60, b: 112, label: 'C4',          timestamp: now - 4100 },
      { id: 'seed-5', type: 'CC',   ch: 1, a: 64, b: 127, label: 'Sustain',     timestamp: now - 6800 },
    ]
  }, [trafficQuery.data?.records, nodeId])
}

function useStageCpuTelemetry(nodeId: string | null, snapshotKey: string) {
  const { metrics, isConnected } = useCPUMetrics({
    nodeId,
    useWebSocket: true,
    pollingInterval: 500,
  })
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [xrunHistory, setXrunHistory] = useState<number[]>([])
  const lastXrunRef = useRef(0)

  useEffect(() => {
    setCpuHistory([])
    setXrunHistory([])
    lastXrunRef.current = 0
  }, [snapshotKey])

  useEffect(() => {
    setCpuHistory((current) => trimHistory(current, metrics.totalCpuPercent, STAGE_CPU_HISTORY_LIMIT))
    const xrunDelta = Math.max(0, metrics.xrunCount - lastXrunRef.current)
    setXrunHistory((current) => trimHistory(current, xrunDelta, STAGE_CPU_HISTORY_LIMIT))
    lastXrunRef.current = metrics.xrunCount
  }, [metrics.totalCpuPercent, metrics.xrunCount])

  // dsp_load_percent comes through as metrics.dspLoadPercent when available
  const dspPressure = Number((metrics as unknown as Record<string, unknown>).dspLoadPercent ?? 0)

  return {
    metrics,
    cpuHistory,
    xrunHistory,
    isConnected,
    dspPressure,
  }
}

function shortenIdentity(value: string | null | undefined, maxLength = 7): string {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return '--'
  }
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength)
}

function glyphTokenLabel(raw: string | null | undefined): string {
  const normalized = String(raw || '').trim()
  if (!normalized) {
    return 'PATH'
  }
  const compact = normalized.replace(/[_-]+/g, ' ').trim()
  const words = compact.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase()
  }
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('').slice(0, 4)
}

function buildPathGlyphs(state: SnapshotRuntimeLiveState | null): string[] {
  const paths = state?.live_snapshot_payload?.paths ?? []
  if (!Array.isArray(paths) || paths.length === 0) {
    return ['▣ LIVE']
  }
  return paths.slice(0, 4).map((path) => {
    const label = glyphTokenLabel(
      (typeof path?.label === 'string' ? path.label : null)
      || (typeof path?.id === 'string' ? path.id : null)
      || null,
    )
    return `▣ ${label}`
  })
}

function StageSnapshotCard({
  state,
  fallbackRecord,
  routeAction,
  reducedMotion,
}: {
  state: SnapshotRuntimeLiveState | null
  fallbackRecord: NotificationRecord
  routeAction?: ReactNode
  reducedMotion: boolean
}) {
  const [identityExpanded, setIdentityExpanded] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle')

  const programNumber = state?.live_snapshot_payload?.program_number ?? null
  const snapshotName = state?.snapshot_name || fallbackRecord.title
  const revision = String(
    state?.live_snapshot_payload?.snapshot_revision
    || state?.snapshot_revision
    || '',
  ).trim()
  const nodeId = String(state?.node_id || fallbackRecord.stage?.sourceLabel || '').trim()
  const glyphs = buildPathGlyphs(state)
  const identityMeta = identityExpanded
    ? [
        revision ? `Revision ${revision}` : '',
        nodeId ? `Node ${nodeId}` : '',
      ].filter(Boolean)
    : [
        revision ? `Rev ${shortenIdentity(revision)}` : '',
        nodeId ? `Node ${shortenIdentity(nodeId)}` : '',
      ].filter(Boolean)

  const handleCopyIdentity = () => {
    const fullIdentity = [revision ? `revision=${revision}` : '', nodeId ? `node=${nodeId}` : '']
      .filter(Boolean)
      .join(' ')
    setIdentityExpanded(true)
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && fullIdentity) {
      void navigator.clipboard.writeText(fullIdentity)
    }
    setCopyStatus('copied')
    window.setTimeout(() => setCopyStatus('idle'), 1500)
  }

  return (
    <section className="stage-notification-card stage-notification-card--success stage-notification-card--snapshot">
      <div className="stage-notification-card__header">
        <div className="stage-notification-card__eyebrow">Snapshot</div>
        <div className="stage-notification-card__actions">
          {routeAction}
        </div>
      </div>
      <div className="stage-notification-snapshot__identity">
        <span
          className="stage-notification-snapshot__live-dot"
          aria-label="Live snapshot pulse"
          data-reduced-motion={reducedMotion ? 'true' : 'false'}
        />
        <div className="stage-notification-snapshot__program">
          {programNumber != null ? String(programNumber).padStart(2, '0') : 'LIVE'}
        </div>
        <div className="stage-notification-snapshot__name">{snapshotName}</div>
      </div>
      <div className="stage-notification-snapshot__glyphs" aria-label="Snapshot path thumbnail">
        {glyphs.map((glyph) => (
          <span key={`${snapshotName}:${glyph}`} className="stage-notification-snapshot__glyph">
            {glyph}
          </span>
        ))}
      </div>
      <div className="stage-notification-card__meta">
        {identityMeta.map((item) => (
          <span key={`${snapshotName}:${item}`}>{item}</span>
        ))}
      </div>
      <div className="stage-notification-snapshot__actions">
        <button
          type="button"
          className="stage-notification-snapshot__copy"
          aria-label="Copy full snapshot identity"
          onClick={handleCopyIdentity}
        >
          {copyStatus === 'copied' ? 'Copied' : 'Copy IDs'}
        </button>
      </div>
    </section>
  )
}

function clusterNodeTone(state: SnapshotRuntimeDisplayState): 'ok' | 'warning' | 'critical' {
  if (state === 'offline') return 'critical'
  if (state === 'live_warning' || state === 'stopped') return 'warning'
  return 'ok'
}

function truncateShortName(name: string, max = 10): string {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

function abbreviateSnapshotName(name: string | null | undefined, fallback = 'LIVE'): string {
  if (!name) return fallback
  const trimmed = name.trim()
  if (!trimmed) return fallback
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 11)}…`
}

function StageClusterHeartbeatRow({
  liveNodes,
  routeAction,
}: {
  liveNodes: SnapshotRuntimeLiveState[]
  routeAction?: ReactNode
}) {
  return (
    <section
      className="stage-notification-card stage-notification-card--warning stage-notification-card--snapshot stage-cluster-heartbeat"
      aria-label="Cluster live heartbeat"
    >
      <div className="stage-notification-card__header">
        <div className="stage-notification-card__eyebrow">Cluster</div>
        <div className="stage-notification-card__actions">{routeAction}</div>
      </div>
      <div className="stage-notification-card__title">{`${liveNodes.length} nodes live`}</div>
      <div
        className="stage-cluster-heartbeat__row"
        role="list"
        aria-label="Per-node cluster heartbeat"
      >
        {liveNodes.slice(0, 6).map((node) => {
          const tone = clusterNodeTone(node.display_state)
          const shortName = truncateShortName(node.node_id)
          const abbr = abbreviateSnapshotName(node.snapshot_name)
          const isLive = node.display_state === 'live' && !node.is_offline
          const card = `stage-cluster-node stage-cluster-node--${tone}${isLive ? ' stage-cluster-node--live' : ''}`
          return (
            <div
              key={node.node_id}
              role="listitem"
              className={card}
              aria-label={`${node.node_id} ${node.display_label}`}
              title={`${node.node_id}: ${node.snapshot_name ?? 'Live snapshot'} (${node.display_label})`}
            >
              <span className={`stage-cluster-node__dot stage-cluster-node__dot--${tone}`} />
              <span className="stage-cluster-node__name">{shortName}</span>
              <span className="stage-cluster-node__snapshot">{abbr}</span>
            </div>
          )
        })}
      </div>
      {liveNodes.length > 6 ? (
        <div className="stage-cluster-heartbeat__overflow">
          {`+${liveNodes.length - 6} more`}
        </div>
      ) : null}
    </section>
  )
}

function StageSparkline({
  values,
  label,
  className = '',
  reducedMotion,
}: {
  values: number[]
  label: string
  className?: string
  reducedMotion: boolean
}) {
  const path = useMemo(() => buildSparklinePath(values), [values])

  return (
    <svg
      className={`stage-notification-sparkline ${reducedMotion ? 'stage-notification-sparkline--reduced' : ''} ${className}`.trim()}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      <path className="stage-notification-sparkline__path" d={path || 'M 0 100 L 100 100'} />
    </svg>
  )
}

function StereoMeterCard({
  nodeLabel,
  levels,
  peakHold,
  history,
  clipCount,
  clipLatched,
  silenceActive,
  isRunning,
}: {
  nodeLabel: string
  levels: { outputLeft: number; outputRight: number }
  peakHold: { outputLeft: number; outputRight: number }
  history: MeterHistorySample[]
  clipCount: number
  clipLatched: boolean
  silenceActive: boolean
  isRunning: boolean
}) {
  const leftLevel = clampStageMeterDb(levels.outputLeft)
  const rightLevel = clampStageMeterDb(levels.outputRight)
  const leftHold = clampStageMeterDb(peakHold.outputLeft)
  const rightHold = clampStageMeterDb(peakHold.outputRight)
  const peakDb = Math.max(leftHold, rightHold)
  const audioTone: NotificationSeverity = clipLatched ? 'critical' : silenceActive ? 'warning' : 'success'

  return (
    <section
      className={`stage-notification-card stage-notification-card--${audioTone} stage-notification-card--audio`.trim()}
      data-cadence="audio-envelope"
      data-live={isRunning ? 'true' : 'false'}
    >
      {audioTone !== 'success' && (
        <div className="stage-notification-card__strap-label" aria-hidden="true">
          {clipLatched ? 'CLIP' : 'SILENCE'}
        </div>
      )}
      <div className="stage-notification-card__header">
        <div className="stage-notification-card__eyebrow">Audio</div>
        <div className="stage-notification-card__actions">
          <span className="stage-notification-audio__status">
            {clipLatched ? `Clip x${clipCount}` : silenceActive ? 'Silence >3s' : isRunning ? 'Flowing' : 'Standby'}
          </span>
        </div>
      </div>
      <div className="stage-notification-card__title">Master output</div>

      {/* Hero peak dB */}
      <div className="stage-notification-audio__hero">
        <span className="stage-notification-audio__peak-value" aria-label={`Peak ${formatMeterDb(peakDb)}`}>
          {formatMeterDb(peakDb)}
        </span>
        <span className="stage-notification-audio__peak-label">PEAK HOLD</span>
      </div>

      {/* L / R secondary */}
      <div className="stage-notification-audio__channels" aria-label="Stereo output meters">
        {[
          { ch: 'L', level: leftLevel },
          { ch: 'R', level: rightLevel },
        ].map(({ ch, level }) => (
          <div key={ch} className="stage-notification-audio__channel-col">
            <span className="stage-notification-audio__channel-label">{ch}</span>
            <span className="stage-notification-audio__channel-value">{formatMeterDb(level)}</span>
          </div>
        ))}
      </div>

      {history.length > 1 ? (
        <svg
          className="stage-notification-audio__history"
          viewBox="0 0 100 12"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points={history
              .map((s, i) => {
                const x = (i / Math.max(1, history.length - 1)) * 100
                const maxDb = Math.max(s.left, s.right)
                const norm = Math.max(0, Math.min(1, (maxDb + 60) / 60))
                const y = 12 - norm * 11
                return `${x.toFixed(2)},${y.toFixed(2)}`
              })
              .join(' ')}
            className="stage-notification-audio__history-line"
          />
        </svg>
      ) : null}

      <div className="stage-notification-card__meta">
        <span>{nodeLabel}</span>
        <span>{clipCount > 0 ? `${clipCount} clip latch${clipCount === 1 ? '' : 'es'}` : 'No clip latch'}</span>
      </div>
    </section>
  )
}

function StageVitalsCard({
  cpuPercent,
  dspPressure,
  xrunCount,
  xrunHistory,
  sampleRate,
  bufferSize,
  channelCount,
  blockCount,
  reducedMotion,
}: {
  cpuPercent: number
  dspPressure: number
  xrunCount: number
  xrunHistory: number[]
  sampleRate?: number | null
  bufferSize?: number | null
  channelCount: number
  blockCount: number
  reducedMotion: boolean
}) {
  const tone: NotificationSeverity = xrunCount > 0
    ? xrunCount >= 5 ? 'critical' : 'warning'
    : cpuPercent >= 90 ? 'critical' : cpuPercent >= 70 ? 'warning' : 'success'

  return (
    <section
      className={`stage-notification-card stage-notification-card--${tone} stage-notification-card--vitals`.trim()}
      data-cadence="xrun-silent"
      data-event={xrunCount > 0 ? 'true' : 'false'}
    >
      {tone !== 'success' && (
        <div className="stage-notification-card__strap-label" aria-hidden="true">
          {xrunCount > 0 ? 'XRUN' : 'CPU'}
        </div>
      )}
      <div className="stage-notification-card__header">
        <div className="stage-notification-card__actions">
          <span className="stage-notification-vitals__rate">{`${formatSampleRateLabel(sampleRate)} / ${bufferSize ?? '--'}`}</span>
        </div>
      </div>

      {/* Hero row: XRuns + DSP PRESSURE side-by-side */}
      <div className="stage-notification-vitals__hero-row">
        <div className="stage-notification-vitals__hero-block">
          <span className="stage-notification-vitals__hero-value" aria-label={`${xrunCount} xruns`}>
            {xrunCount}
          </span>
          <span className="stage-notification-vitals__hero-label">XRUNS</span>
        </div>
        <div className="stage-notification-vitals__hero-block">
          <span className="stage-notification-vitals__hero-value" aria-label={`DSP pressure ${dspPressure.toFixed(1)}%`}>
            {dspPressure.toFixed(1)}%
          </span>
          <span className="stage-notification-vitals__hero-label">DSP PRESSURE</span>
        </div>
      </div>

      {/* System stats */}
      <div className="stage-notification-vitals__stats">
        <div className="stage-notification-vitals__stat">
          <strong>{cpuPercent.toFixed(1)}%</strong>
          <span>CPU</span>
        </div>
        <div className="stage-notification-vitals__stat">
          <strong>{channelCount}</strong>
          <span>Paths</span>
        </div>
        <div className="stage-notification-vitals__stat">
          <strong>{blockCount}</strong>
          <span>Blocks</span>
        </div>
      </div>

      <StageSparkline
        values={xrunHistory}
        label="XRun history"
        className="stage-notification-vitals__sparkline stage-notification-vitals__sparkline--xruns"
        reducedMotion={reducedMotion}
      />
    </section>
  )
}

function StageWarningsCard({
  entries,
  updatedLabel,
  history,
  clipCount,
  controls,
}: {
  entries: StageWarningEntry[]
  updatedLabel: string
  history: StageWarningHistorySample[]
  clipCount: number
  controls?: ReactNode
}) {
  const top = entries[0] ?? null
  const tone = top ? top.severity : 'success'
  const remaining = Math.max(0, entries.length - 1)
  const hasProgress = top?.progressPercent != null

  return (
    <section
      className={`stage-notification-card stage-notification-card--${tone} stage-notification-card--warnings`.trim()}
      data-cadence="allclear-breath"
      data-live={tone === 'success' ? 'true' : 'false'}
    >
      {tone !== 'success' && (
        <div className="stage-notification-card__strap-label" aria-hidden="true">
          {tone === 'critical' ? 'CRITICAL' : 'WARN'}
        </div>
      )}
      <div className="stage-notification-card__header">
        <div className="stage-notification-card__eyebrow">Warnings</div>
        <div className="stage-notification-card__actions">
          <div className="stage-notification-warnings__summary">
            <span className="stage-notification-warnings__count">
              {top ? `${entries.length} active` : 'All clear'}
            </span>
            {clipCount > 0 ? (
              <span className="stage-notification-warnings__count stage-notification-warnings__count--badge">
                {`Clip x${clipCount}`}
              </span>
            ) : null}
          </div>
          {controls ? <div className="stage-notification-warnings__controls">{controls}</div> : null}
        </div>
      </div>

      {/* Progress bar hero — shown when activation in progress */}
      {hasProgress ? (
        <>
          <div className="stage-notification-card__title">{top!.title}</div>
          <div className="stage-notification-warnings__progress" aria-label="Activation progress">
            <span className="stage-notification-warnings__progress-fill" style={{ width: `${top!.progressPercent}%` }} />
          </div>
          <span className="stage-notification-warnings__progress-label">
            {top!.progressPercent}% complete
          </span>
          <p className="stage-notification-card__body">{top!.detail}</p>
        </>
      ) : (
        <>
          <div className="stage-notification-card__title">{top?.title ?? 'All clear'}</div>
          <p className="stage-notification-card__body">
            {top?.detail ?? 'No critical or warning notifications are currently owning the stage surface.'}
          </p>
          {/* Warning row list — secondary entries */}
          {entries.length > 1 ? (
            <div className="stage-notification-warnings__rows">
              {entries.slice(1, 4).map((entry) => (
                <div key={entry.id} className="stage-notification-warnings__row">
                  <span
                    className={`stage-status-led stage-status-led--${entry.severity === 'critical' ? 'critical' : entry.severity === 'warning' ? 'warning' : 'ok'}`}
                    aria-hidden="true"
                  />
                  <span className="stage-notification-warnings__row-title" title={entry.detail}>
                    {entry.title}
                  </span>
                  <span className="stage-notification-warnings__row-time">{updatedLabel}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      <div className="stage-notification-warnings__history" aria-label="Warning history">
        {history.map((sample, index) => (
          <span
            key={`warning-history:${index}`}
            className={`stage-notification-warnings__history-tick stage-notification-warnings__history-tick--${sample.severity ?? 'idle'}`}
            data-active={sample.count > 0 ? 'true' : 'false'}
          />
        ))}
      </div>

      <div className="stage-notification-card__meta">
        <span>{updatedLabel ? `Updated ${updatedLabel}` : 'Live'}</span>
        {remaining > 0 ? <span>{remaining} more</span> : null}
      </div>
    </section>
  )
}

function StageKyron({
  entry,
  phase,
}: {
  entry: StageKyronEntry
  phase: 'enter' | 'dwell' | 'exit'
}) {
  const severity = entry.record.stage?.severity ?? severityFromTone(entry.record.tone)
  const sourceLabel = entry.record.stage?.compactLabel || entry.record.title
  const headline = entry.record.message || entry.record.title
  const meta = [sourceLabel, formatStageTimestamp(entry.record.updatedAt)].filter(Boolean).join(' • ')

  return (
    <section
      className={`stage-notification-kyron stage-notification-kyron--${severity} stage-notification-kyron--${phase}`}
      role={severity === 'critical' ? 'alert' : 'status'}
      aria-live={severity === 'critical' ? 'assertive' : 'polite'}
      aria-label="Stage notification kyron"
    >
      <div className="stage-notification-kyron__strap">Live Alert</div>
      <div className="stage-notification-kyron__body">
        <span className="stage-notification-kyron__label">{kyronLabelForSeverity(severity)}</span>
        <div className="stage-notification-kyron__copy">
          <strong className="stage-notification-kyron__headline">{headline}</strong>
          <span className="stage-notification-kyron__meta">{meta}</span>
        </div>
      </div>
    </section>
  )
}

function StageMiniKyron({
  records,
  liveSnapshotState,
  channelCount,
  blockCount,
  prefersReducedMotion,
  onExpand,
  onRoute,
}: {
  records: NotificationRecord[]
  liveSnapshotState: SnapshotRuntimeLiveState | null
  channelCount: number
  blockCount: number
  prefersReducedMotion: boolean
  onExpand: () => void
  onRoute?: () => void
}) {
  const primaryRecord = records[0] ?? null
  const [frameIndex, setFrameIndex] = useState(0)

  const isLiveLayout = primaryRecord?.stage?.kind === 'live_snapshot'
  const severity = primaryRecord?.stage?.severity ?? (primaryRecord ? severityFromTone(primaryRecord.tone) : 'info')
  const headline = primaryRecord?.title ?? 'Live snapshot'
  const headlineShouldScroll = !prefersReducedMotion && headline.length > 26
  const routeLabel = primaryRecord?.stage?.routeLabel || 'Open related workspace'
  const layoutTone = isLiveLayout ? 'live' : severity
  const layoutMode = isLiveLayout ? 'live' : 'alert'
  const programNumber = liveSnapshotState?.live_snapshot_payload?.program_number
  const restoreLabel = isLiveLayout
    ? `Restore live snapshot panel for ${headline}`
    : `Restore notification panel for ${headline}`

  const frames = useMemo<StageMiniKyronFrame[]>(() => {
    if (!primaryRecord) {
      return []
    }

    if (isLiveLayout) {
      return [
        {
          key: `${primaryRecord.id}:status`,
          label: 'Status',
          text: primaryRecord.message || 'Live',
        },
        channelCount > 0
          ? {
              key: `${primaryRecord.id}:channels`,
              label: 'Channels',
              text: `${channelCount} channel${channelCount === 1 ? '' : 's'} active`,
            }
          : null,
        programNumber != null || blockCount > 0
          ? {
              key: `${primaryRecord.id}:routing`,
              label: 'Routing',
              text: [
                programNumber != null ? `Program ${programNumber}` : '',
                blockCount > 0 ? `${blockCount} block${blockCount === 1 ? '' : 's'} active` : '',
              ].filter(Boolean).join(' • '),
            }
          : null,
        primaryRecord.stage?.meta?.find((entry) => entry.startsWith('Revision '))
          ? {
              key: `${primaryRecord.id}:revision`,
              label: 'Revision',
              text: primaryRecord.stage.meta.find((entry) => entry.startsWith('Revision ')) ?? '',
            }
          : null,
      ].filter((frame): frame is StageMiniKyronFrame => Boolean(frame?.text))
    }

    return records.map((record, index) => ({
      key: `${record.id}:${record.updatedAt}:${index}`,
      label: kyronLabelForSeverity(record.stage?.severity ?? severityFromTone(record.tone)),
      text: record.message || record.title,
    }))
  }, [blockCount, channelCount, isLiveLayout, primaryRecord, programNumber, records])

  const framesKey = frames.map((frame) => frame.key).join('|')

  useEffect(() => {
    setFrameIndex(0)
  }, [framesKey])

  useEffect(() => {
    if (prefersReducedMotion || frames.length <= 1) {
      return
    }

    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length)
    }, MINI_KYRON_ROTATION_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [frames.length, framesKey, prefersReducedMotion])

  if (!primaryRecord) {
    return null
  }

  const currentFrame = frames[frameIndex] ?? frames[0] ?? { key: 'fallback', label: 'Live', text: primaryRecord.message || primaryRecord.title }
  const tickerShouldScroll = !prefersReducedMotion && currentFrame.text.length > 38
  const liveBugLabel = isLiveLayout ? 'LIVE' : kyronLabelForSeverity(severity).toUpperCase()

  return (
    <aside
      className={`stage-notification-mini-kyron stage-notification-mini-kyron--${layoutTone} stage-notification-mini-kyron--${layoutMode}`}
      role={severity === 'critical' ? 'alert' : 'status'}
      aria-live={severity === 'critical' ? 'assertive' : 'polite'}
    >
      <button
        type="button"
        className="stage-notification-mini-kyron__body"
        aria-label={restoreLabel}
        onClick={onExpand}
      >
        <div className="stage-notification-mini-kyron__broadcast">
          <span className="stage-notification-mini-kyron__eyebrow">{isLiveLayout ? 'Workspace Live' : 'Stage Alert'}</span>
          <span className="stage-notification-mini-kyron__bug">{liveBugLabel}</span>
        </div>
        <strong className="stage-notification-mini-kyron__headline" data-scroll={headlineShouldScroll ? 'true' : 'false'}>
          <span className="stage-notification-mini-kyron__headline-track">
            <span>{headline}</span>
            {headlineShouldScroll ? <span aria-hidden="true">{headline}</span> : null}
          </span>
        </strong>
        <div className="stage-notification-mini-kyron__ticker">
          <span className="stage-notification-mini-kyron__ticker-label">{currentFrame.label}</span>
          <span className="stage-notification-mini-kyron__ticker-track">
            <span className="stage-notification-mini-kyron__ticker-text" data-scroll={tickerShouldScroll ? 'true' : 'false'}>
              <span>{currentFrame.text}</span>
              {tickerShouldScroll ? <span aria-hidden="true">{currentFrame.text}</span> : null}
            </span>
          </span>
        </div>
      </button>
      <div className="stage-notification-mini-kyron__actions" aria-label="Notification rail actions">
        {onRoute ? (
          <button
            type="button"
            className="stage-notification-mini-kyron__action"
            aria-label={routeLabel}
            onClick={onRoute}
          >
            <ArrowRight size={16} />
          </button>
        ) : null}
        <button
          type="button"
          className="stage-notification-mini-kyron__action"
          aria-label="Expand live snapshot panel"
          onClick={onExpand}
        >
          <ChevronUp size={16} />
        </button>
      </div>
    </aside>
  )
}

function NotificationActionButton({ action }: { action: NotificationAction }) {
  return (
    <Button kind="ghost" size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  )
}

const noopContextValue: NotificationContextValue = {
  pushNotification: () => '',
  dismissNotification: () => {},
  clearNotifications: () => {},
  notifications: [],
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const location = useLocation()
  const viewportMounted = shouldMountStageViewport(location.pathname)
  const viewportMountedRef = useRef(viewportMounted)
  viewportMountedRef.current = viewportMounted

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    toast.dismiss(id)
  }, [])

  const pushNotification = useCallback((message: string, tone: NotificationTone = 'info', options: NotificationOptions = {}) => {
    const id = options.id ?? makeNotificationId()
    const title = options.title ?? titleFromTone(tone)
    const stage = normalizeStageConfig(tone, {
      ...options,
      id,
    })
    const timestamp = Date.now()
    const persistent = Boolean(options.persistent || stage?.sticky)

    setNotifications((prev) => {
      const existing = prev.find((notification) => notification.id === id)
      const nextRecord: NotificationRecord = {
        id,
        title,
        message,
        tone,
        timestamp: existing?.timestamp ?? timestamp,
        updatedAt: timestamp,
        persistent,
        action: options.action,
        stage,
      }
      return [...prev.filter((notification) => notification.id !== id), nextRecord]
    })

    const existingTimer = timersRef.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      timersRef.current.delete(id)
    }

    if (!persistent) {
      const timer = setTimeout(() => dismissNotification(id), options.durationMs ?? (stage ? DEFAULT_STAGE_DURATION_MS : 5000))
      timersRef.current.set(id, timer)
    }

    if (shouldRenderTransient(stage, viewportMountedRef.current)) {
      const content = (
        <div className="stage-notification-transient__body">
          <strong>{title}</strong>
          <span>{message}</span>
          {options.action ? <button type="button" onClick={options.action.onClick}>{options.action.label}</button> : null}
        </div>
      )
      if (toast.isActive(id)) {
        toast.update(id, {
          render: content,
          ...buildToastifyOptions(id, tone, options),
        })
      } else {
        toast(content, buildToastifyOptions(id, tone, options))
      }
    } else {
      toast.dismiss(id)
    }

    return id
  }, [dismissNotification])

  const clearNotifications = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
    setNotifications([])
    toast.dismiss()
  }, [])

  useEffect(() => () => {
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
  }, [])

  const value = useMemo<NotificationContextValue>(() => ({
    pushNotification,
    dismissNotification,
    clearNotifications,
    notifications,
  }), [pushNotification, dismissNotification, clearNotifications, notifications])

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <StageNotificationViewportGate />
      <ToastContainer
        position="top-right"
        newestOnTop
        closeButton={false}
        hideProgressBar
        theme="colored"
        className="stage-notification-transient-container"
        toastClassName="stage-notification-transient"
        bodyClassName="stage-notification-transient__wrap"
      />
    </NotificationContext.Provider>
  )
}

// Routes that should mount the stage chyron + live-snapshot rail. Anything
// not in this list does NOT instantiate StageNotificationViewport, which
// avoids spinning up its CPU/VU/MIDI/cluster-live-state subscriptions on
// dense editor surfaces (snapshot editor, MIDI Hub editors, device pages,
// etc.) where the chyron has nothing to show anyway. Toast pushes still
// work everywhere via NotificationContext + react-toastify.
const STAGE_VIEWPORT_ROUTE_PREFIXES: readonly string[] = [
  '/about',
  '/legacy',
  '/theme',
  '/welcome',
  // Nav reorg 2026-05-03 (second pass) — canonical Node Ops base
  // path; legacy `/workspace` retained for in-flight redirects.
  // /chains was absorbed into /node-ops/audio-engine.
  '/node-ops',
  '/artifacts',
  '/workspace',
]

function shouldMountStageViewport(pathname: string): boolean {
  if (pathname === '/' || pathname === '') return true
  return STAGE_VIEWPORT_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

type HeartbeatDensity = 'compact' | 'comfortable' | 'spacious'
const HEARTBEAT_DENSITY_KEY: PersistedKey<HeartbeatDensity> = {
  storageKey: 'map2_heartbeat_density',
  fallback: 'comfortable',
  parse: (raw) => (raw === 'compact' || raw === 'spacious' || raw === 'comfortable' ? raw : undefined),
}

function StageNotificationViewportGate() {
  const location = useLocation()
  if (!shouldMountStageViewport(location.pathname)) {
    return null
  }
  return <StageNotificationViewport />
}

function StageNotificationViewport() {
  const { notifications, dismissNotification } = useNotifications()
  const location = useLocation()
  const navigate = useNavigate()
  const bannerRef = useRef<HTMLDivElement | null>(null)
  const [liveSnapshotCollapsed, setLiveSnapshotCollapsed] = useState(false)
  // Slice I — heartbeat density toggle (persisted via usePersistedState hook).
  const [heartbeatDensity, setHeartbeatDensity] = usePersistedState(HEARTBEAT_DENSITY_KEY)
  const cycleHeartbeatDensity = useCallback(() => {
    setHeartbeatDensity(
      heartbeatDensity === 'comfortable'
        ? 'compact'
        : heartbeatDensity === 'compact'
          ? 'spacious'
          : 'comfortable',
    )
  }, [heartbeatDensity, setHeartbeatDensity])
  const [warningHistory, setWarningHistory] = useState<StageWarningHistorySample[]>([])
  const [kyronQueue, setKyronQueue] = useState<StageKyronEntry[]>([])
  const [activeKyron, setActiveKyron] = useState<StageKyronEntry | null>(null)
  const [kyronPhase, setKyronPhase] = useState<'enter' | 'dwell' | 'exit'>('enter')
  const processedKyronKeysRef = useRef<Set<string>>(new Set())
  // T2466-3: extend reduced-motion gating to honor the in-app
  // Reduced-effects toggle in addition to the OS-level
  // prefers-reduced-motion media query.
  const { prefersReducedMotion, shouldReduceEffects } = useReducedEffectsPreference()
  const clusterLiveStateQuery = useClusterSnapshotRuntimeLiveState({
    enabled: !location.pathname.startsWith('/snapshot-editor'),
    refetchInterval: 5_000,
  })

  const emittedStageNotifications = useMemo(
    () => notifications
      .filter((notification) => notification.stage)
      .sort((left, right) => {
        const priorityDelta = stagePriority(right) - stagePriority(left)
        if (priorityDelta !== 0) return priorityDelta
        return right.updatedAt - left.updatedAt
      }),
    [notifications],
  )

  const liveSnapshotState = useMemo(() => {
    if (location.pathname.startsWith('/snapshot-editor')) {
      return null
    }

    return chooseLiveSnapshot(clusterLiveStateQuery.data?.nodes ?? [])
  }, [clusterLiveStateQuery.data?.nodes, location.pathname])

  const liveSnapshotRecord = useMemo(() => {
    return liveSnapshotState ? buildLiveSnapshotRecord(liveSnapshotState) : null
  }, [liveSnapshotState])
  const liveNodes = useMemo(
    () => (clusterLiveStateQuery.data?.nodes ?? []).filter((state) => !state.is_offline && state.state === 'live' && state.snapshot_id != null),
    [clusterLiveStateQuery.data?.nodes],
  )
  const activeNodeId = liveSnapshotState?.node_id ?? null
  const snapshotKey = `${liveSnapshotState?.node_id ?? 'none'}:${liveSnapshotState?.snapshot_revision ?? liveSnapshotState?.snapshot_id ?? 'none'}`
  const meterTelemetry = useStageMeterTelemetry(activeNodeId, snapshotKey, Boolean(liveSnapshotState))
  const cpuTelemetry = useStageCpuTelemetry(activeNodeId, snapshotKey)
  const midiEvents = useStageMidiEvents(activeNodeId)
  const audioStatusQuery = useQuery({
    queryKey: ['stage-notification', 'audio-status', activeNodeId ?? 'local'],
    queryFn: () => audioApi.getStatus(activeNodeId),
    enabled: !location.pathname.startsWith('/snapshot-editor'),
    staleTime: 2_000,
    refetchInterval: 5_000,
  })

  const primaryStageRecord = emittedStageNotifications[0] ?? null
  const primaryRecord = primaryStageRecord ?? liveSnapshotRecord
  const railRecords = primaryStageRecord
    ? emittedStageNotifications.slice(0, 4)
    : liveSnapshotRecord
      ? [liveSnapshotRecord]
      : []
  const hasClusterSummary = liveNodes.length > 1
  const mode = !primaryStageRecord && liveSnapshotCollapsed && liveSnapshotRecord ? 'rail' : 'expanded'
  const showDismiss = Boolean(primaryStageRecord && !(primaryRecord?.stage?.liveSnapshotPinned ?? false))
  const showCollapse = !primaryStageRecord && Boolean(liveSnapshotRecord)

  useEffect(() => {
    const pendingEntries = emittedStageNotifications
      .slice()
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .map(buildKyronEntry)

    setKyronQueue((current) => {
      const next = [...current]
      const queuedKeys = new Set(next.map((entry) => entry.key))
      pendingEntries.forEach((entry) => {
        if (processedKyronKeysRef.current.has(entry.key) || queuedKeys.has(entry.key) || activeKyron?.key === entry.key) {
          return
        }
        next.push(entry)
        queuedKeys.add(entry.key)
        processedKyronKeysRef.current.add(entry.key)
      })
      return next
    })
  }, [activeKyron?.key, emittedStageNotifications])

  useEffect(() => {
    if (activeKyron || kyronQueue.length === 0) {
      return
    }
    setActiveKyron(kyronQueue[0] ?? null)
    setKyronQueue((current) => current.slice(1))
  }, [activeKyron, kyronQueue])

  useEffect(() => {
    if (!activeKyron) {
      return
    }

    setKyronPhase('enter')
    const settleTimer = window.setTimeout(() => setKyronPhase('dwell'), KYRON_TRANSITION_DURATION_MS)
    const exitTimer = window.setTimeout(
      () => setKyronPhase('exit'),
      KYRON_TRANSITION_DURATION_MS + KYRON_DWELL_DURATION_MS,
    )
    const clearTimer = window.setTimeout(
      () => {
        setActiveKyron(null)
        setKyronPhase('enter')
      },
      (KYRON_TRANSITION_DURATION_MS * 2) + KYRON_DWELL_DURATION_MS,
    )

    return () => {
      window.clearTimeout(settleTimer)
      window.clearTimeout(exitTimer)
      window.clearTimeout(clearTimer)
    }
  }, [activeKyron])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    if ((!primaryRecord && !activeKyron) || (mode === 'rail' && !activeKyron) || !bannerRef.current) {
      document.documentElement.style.setProperty(ROOT_STAGE_NOTIFICATION_HEIGHT_VAR, '0px')
      return
    }

    const updateHeight = () => {
      const height = bannerRef.current?.offsetHeight ?? 0
      document.documentElement.style.setProperty(ROOT_STAGE_NOTIFICATION_HEIGHT_VAR, `${height}px`)
    }

    updateHeight()
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(bannerRef.current)
    return () => {
      resizeObserver.disconnect()
      document.documentElement.style.setProperty(ROOT_STAGE_NOTIFICATION_HEIGHT_VAR, '0px')
    }
  }, [activeKyron, mode, primaryRecord])

  useEffect(() => {
    if (typeof window === 'undefined' || !primaryRecord || mode === 'rail') {
      return
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      if (showCollapse) {
        setLiveSnapshotCollapsed(true)
        return
      }
      if (showDismiss) {
        dismissNotification(primaryRecord.id)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [dismissNotification, mode, primaryRecord, showCollapse, showDismiss])

  const toneClass = primaryRecord?.stage?.severity ?? (primaryRecord ? severityFromTone(primaryRecord.tone) : 'success')
  const headline = primaryRecord?.title ?? 'Stage notification'
  const updatedLabel = primaryRecord ? formatStageTimestamp(primaryRecord.updatedAt) : ''
  const channelCount = liveSnapshotState?.live_snapshot_payload?.paths?.length ?? 0
  const blockCount = countLiveBlocks(liveSnapshotState)
  const stageWarnings = useMemo(() => {
    const entries: StageWarningEntry[] = []
    const activationProgress = (liveSnapshotState?.runtime_metrics as { activation_progress?: Record<string, unknown> } | undefined)?.activation_progress
    const runtimeMetrics = liveSnapshotState?.runtime_metrics as {
      blockers?: Array<Record<string, unknown>>
      warnings?: Array<Record<string, unknown>>
      activation_progress?: Record<string, unknown>
    } | undefined
    const runtimeFindings = [
      ...(Array.isArray(runtimeMetrics?.blockers) ? runtimeMetrics?.blockers ?? [] : []),
      ...(Array.isArray(runtimeMetrics?.warnings) ? runtimeMetrics?.warnings ?? [] : []),
    ]

    if (primaryStageRecord) {
      entries.push({
        id: primaryStageRecord.id,
        severity: primaryStageRecord.stage?.severity ?? severityFromTone(primaryStageRecord.tone),
        title: `${toneLabelForRecord(primaryStageRecord)} event active`,
        detail: primaryStageRecord.message,
      })
    }
    if (meterTelemetry.clipCount > 0) {
      entries.push({
        id: 'audio-clip',
        severity: 'critical',
        title: `Clip latch x${meterTelemetry.clipCount}`,
        detail: 'Master output has clipped during the current live run.',
      })
    }
    if (meterTelemetry.silenceActive) {
      entries.push({
        id: 'audio-silence',
        severity: 'warning',
        title: 'Silence detected',
        detail: 'Output has stayed below -60 dBFS for more than three seconds while live.',
      })
    }
    if (cpuTelemetry.metrics.xrunCount > 0) {
      entries.push({
        id: 'audio-xruns',
        severity: cpuTelemetry.metrics.xrunCount >= 5 ? 'critical' : 'warning',
        title: `${cpuTelemetry.metrics.xrunCount} XRuns detected`,
        detail: 'Audio callback overruns were reported by the engine.',
      })
    }
    if (liveSnapshotState?.is_offline) {
      entries.push({
        id: 'snapshot-offline',
        severity: 'critical',
        title: 'Live node offline',
        detail: liveSnapshotState.display_label || 'The active live node is offline.',
      })
    }
    const activationEntry = buildActivationWarningEntry(liveSnapshotState, activationProgress)
    if (activationEntry) {
      entries.push(activationEntry)
    }
    const driverUnavailable = Boolean(
      liveSnapshotState
      && audioStatusQuery.data
      && (!audioStatusQuery.data.available || Boolean(audioStatusQuery.data.error))
      && (!activationEntry || activationEntry.id !== 'activation-progress'),
    )
    if (driverUnavailable) {
      entries.push({
        id: 'audio-driver-lost',
        severity: 'critical',
        title: 'Audio driver lost',
        detail: normalizeWarningText(audioStatusQuery.data?.error)
          ?? `${audioStatusQuery.data?.audio_device ?? 'The active audio device'} is unavailable or was unplugged during the live run.`,
      })
    }
    runtimeFindings.slice(0, 3).forEach((warning, index) => {
      entries.push(buildRuntimeWarningEntry(warning, index))
    })
    if (cpuTelemetry.metrics.totalCpuPercent >= 90) {
      entries.push({
        id: 'audio-cpu',
        severity: 'critical',
        title: 'CPU at risk',
        detail: `Audio engine CPU is ${cpuTelemetry.metrics.totalCpuPercent.toFixed(1)}%.`,
      })
    } else if (cpuTelemetry.metrics.totalCpuPercent >= 70) {
      entries.push({
        id: 'audio-cpu',
        severity: 'warning',
        title: 'CPU elevated',
        detail: `Audio engine CPU is ${cpuTelemetry.metrics.totalCpuPercent.toFixed(1)}%.`,
      })
    }
    return entries.sort((left, right) => {
      return severityRank(right.severity) - severityRank(left.severity)
    })
  }, [
    audioStatusQuery.data,
    cpuTelemetry.metrics.totalCpuPercent,
    cpuTelemetry.metrics.xrunCount,
    liveSnapshotState,
    meterTelemetry.clipCount,
    meterTelemetry.silenceActive,
    primaryStageRecord,
  ])

  useEffect(() => {
    setWarningHistory([])
  }, [snapshotKey])

  useEffect(() => {
    const captureSample = () => {
      setWarningHistory((current) => trimHistory(current, {
        severity: stageWarnings[0]?.severity ?? null,
        count: stageWarnings.length,
      }, STAGE_WARNING_HISTORY_LIMIT))
    }

    captureSample()
    const interval = window.setInterval(captureSample, 1000)
    return () => {
      window.clearInterval(interval)
    }
  }, [stageWarnings.length, stageWarnings[0]?.severity])

  if (location.pathname.startsWith('/snapshot-editor')) {
    return null
  }

  const disconnected = clusterLiveStateQuery.isError || audioStatusQuery.isError
  const surfaceTone = disconnected
    ? 'critical'
    : primaryStageRecord?.stage?.severity
      ?? (primaryStageRecord ? severityFromTone(primaryStageRecord.tone) : toneClass)
  const routeTargetRecord = liveSnapshotRecord ?? primaryRecord
  const routeAction = routeTargetRecord?.stage?.route ? (
    <button
      type="button"
      className="stage-notification-surface__icon-button"
      aria-label={routeTargetRecord.stage!.routeLabel}
      onClick={() => navigate(routeTargetRecord.stage!.route)}
    >
      <ArrowRight size={16} />
    </button>
  ) : null
  const collapseAction = showCollapse ? (
    <button
      type="button"
      className="stage-notification-surface__icon-button"
      aria-label="Hide live snapshot banner"
      onClick={() => setLiveSnapshotCollapsed(true)}
    >
      <ChevronDown size={16} />
    </button>
  ) : null
  const dismissAction = showDismiss ? (
    <button
      type="button"
      className="stage-notification-surface__icon-button"
      aria-label={`Dismiss ${headline}`}
      onClick={() => dismissNotification(primaryRecord.id)}
    >
      <Close size={16} />
    </button>
  ) : null

  const chyronLiveState: ChyronLiveState = (() => {
    if (!liveSnapshotState || liveSnapshotState.is_offline) return 'offline'
    if (liveSnapshotState.display_state === 'live_warning') return 'armed'
    if (liveSnapshotState.state === 'live') return 'live'
    if (liveSnapshotState.state === 'stopped' && liveSnapshotState.snapshot_id != null) return 'standby'
    return 'standby'
  })()

  const formatSampleRate = (rate?: number | null): string => {
    if (!rate || rate <= 0) return '—'
    return `${(rate / 1000).toFixed(0)}k`
  }

  const cpuNow = cpuTelemetry.metrics.totalCpuPercent
  const datelineItems = [
    { label: 'REV', value: String(liveSnapshotState?.live_snapshot_payload?.snapshot_revision ?? liveSnapshotState?.snapshot_revision ?? '—').slice(0, 7) || '—' },
    { label: 'RATE', value: `${formatSampleRate(audioStatusQuery.data?.sample_rate)}/${audioStatusQuery.data?.buffer_size ?? '—'}` },
    { label: 'NODE', value: (liveSnapshotState?.node_id ?? primaryRecord?.stage?.sourceLabel ?? '—').toString().slice(0, 10) },
  ]

  const strapItems = [
    { label: 'CPU', value: `${cpuNow.toFixed(1)}%` },
    { label: 'XRUN', value: String(cpuTelemetry.metrics.xrunCount) },
    { label: 'PATHS', value: String(channelCount) },
    { label: 'BLOCKS', value: String(blockCount) },
    { label: 'RATE', value: `${formatSampleRate(audioStatusQuery.data?.sample_rate)}/${audioStatusQuery.data?.buffer_size ?? '—'}` },
    { label: 'NODE', value: (liveSnapshotState?.node_id ?? 'local').toString().slice(0, 10) },
    { label: 'CLIP', value: String(meterTelemetry.clipCount) },
  ]

const tickerEvents: TickerEvent[] = (() => {
    const out: TickerEvent[] = []
    const timeNow = new Date()
    const mono = `${String(timeNow.getHours()).padStart(2, '0')}:${String(timeNow.getMinutes()).padStart(2, '0')}:${String(timeNow.getSeconds()).padStart(2, '0')}`
    stageWarnings.slice(0, 5).forEach((w) => {
      out.push({
        time: mono,
        severity: w.severity === 'critical' ? 'crit' : w.severity === 'warning' ? 'warn' : w.severity === 'info' ? 'info' : 'ok',
        text: w.title,
      })
    })
    if (out.length === 0 && chyronLiveState === 'live') {
      out.push({ time: mono, severity: 'ok', text: `Live snapshot ${liveSnapshotState?.snapshot_name ?? ''} active`.trim() })
    }
    return out
  })()

  const rigLabel = liveSnapshotState?.snapshot_name ?? primaryRecord?.title ?? 'Stage'
  const normalTransitionClass = activeKyron
    ? kyronPhase === 'exit'
      ? ' stage-notification-transition--return'
      : kyronPhase === 'enter'
        ? ' stage-notification-transition--depart'
        : ' stage-notification-transition--hidden'
    : ''
  const showSceneDuringKyron = !activeKyron || kyronPhase !== 'dwell'

  if (!primaryRecord && activeKyron) {
    return (
      <>
        {showSceneDuringKyron ? (
          <aside className={`stage-notification-idle-rail${normalTransitionClass}`} aria-label="Node idle rail">
            <span className="stage-notification-idle-rail__dot" aria-hidden="true" />
            <span className="stage-notification-idle-rail__label">Node idle</span>
          </aside>
        ) : null}
        <div ref={bannerRef}>
          <StageKyron entry={activeKyron} phase={kyronPhase} />
        </div>
      </>
    )
  }

  if (!primaryRecord) {
    return (
      <aside className="stage-notification-idle-rail" aria-label="Node idle rail">
        <span className="stage-notification-idle-rail__dot" aria-hidden="true" />
        <span className="stage-notification-idle-rail__label">Node idle</span>
      </aside>
    )
  }

  if (mode === 'rail') {
    const railPrimaryRecord = railRecords[0] ?? null
    const railRoute = railPrimaryRecord?.stage?.route
    return (
      <>
        {showSceneDuringKyron ? (
          <aside className={`stage-notification-rail${normalTransitionClass}`} aria-label="Notification rail">
            <StageMiniKyron
              records={railRecords}
              liveSnapshotState={liveSnapshotState}
              channelCount={channelCount}
              blockCount={blockCount}
              prefersReducedMotion={prefersReducedMotion}
              onExpand={() => setLiveSnapshotCollapsed(false)}
              onRoute={railRoute ? () => navigate(railRoute) : undefined}
            />
          </aside>
        ) : null}
        {activeKyron ? (
          <div ref={bannerRef}>
            <StageKyron entry={activeKyron} phase={kyronPhase} />
          </div>
        ) : null}
      </>
    )
  }

  return (
    <>
      {showSceneDuringKyron ? (
        <div
          ref={activeKyron ? null : bannerRef}
          className={`stage-notification-surface stage-notification-surface--${mode} stage-notification-surface--${surfaceTone}${normalTransitionClass}`}
          role={surfaceTone === 'critical' || surfaceTone === 'warning' ? 'alert' : 'status'}
          aria-live={surfaceTone === 'critical' ? 'assertive' : 'polite'}
          data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
          data-live={chyronLiveState === 'live' ? 'true' : 'false'}
          data-density={heartbeatDensity}
        >
          {disconnected ? <div className="stage-notification-surface__disconnect">DISCONNECTED</div> : null}
          {/* Slice I — density toggle */}
          <button
            type="button"
            className="stage-notification-surface__density"
            onClick={cycleHeartbeatDensity}
            aria-label={`Heartbeat density: ${heartbeatDensity} (click to cycle)`}
            title={`Density: ${heartbeatDensity.toUpperCase()}`}
          >
            {heartbeatDensity === 'compact' ? '▪' : heartbeatDensity === 'spacious' ? '▬' : '▫'}
          </button>
          <div className="stage-notification-surface__grid stage-notification-surface__grid--mission" aria-label="Stage notification overview">
            <StereoMeterCard
              nodeLabel={primaryRecord.stage?.sourceLabel || 'active node'}
              levels={{
                outputLeft: meterTelemetry.levels.outputLeft,
                outputRight: meterTelemetry.levels.outputRight,
              }}
              peakHold={{
                outputLeft: meterTelemetry.peakHold.outputLeft,
                outputRight: meterTelemetry.peakHold.outputRight,
              }}
              history={meterTelemetry.history}
              clipCount={meterTelemetry.clipCount}
              clipLatched={meterTelemetry.clipLatched}
              silenceActive={meterTelemetry.silenceActive}
              isRunning={meterTelemetry.isRunning}
            />
            <div className="stage-notification-surface__chyron-wrap">
              {hasClusterSummary ? (
                <StageClusterHeartbeatRow liveNodes={liveNodes} routeAction={routeAction} />
              ) : (
                <StageChyronCard
                  state={liveSnapshotState}
                  fallback={{ title: primaryRecord.title, sourceLabel: primaryRecord.stage?.sourceLabel }}
                  liveState={chyronLiveState}
                  reducedMotion={shouldReduceEffects}
                  routeAction={routeAction}
                />
              )}
              <StageChyronStrap items={strapItems} reducedMotion={shouldReduceEffects} />
            </div>
            <StageVitalsCard
              cpuPercent={cpuNow}
              dspPressure={cpuTelemetry.dspPressure}
              xrunCount={cpuTelemetry.metrics.xrunCount}
              xrunHistory={cpuTelemetry.xrunHistory}
              sampleRate={audioStatusQuery.data?.sample_rate}
              bufferSize={audioStatusQuery.data?.buffer_size}
              channelCount={channelCount}
              blockCount={blockCount}
              reducedMotion={shouldReduceEffects}
            />
            <StageWarningsCard
              entries={stageWarnings}
              updatedLabel={updatedLabel}
              history={warningHistory}
              clipCount={meterTelemetry.clipCount}
              controls={
                <>
                  {primaryRecord.action ? <NotificationActionButton action={primaryRecord.action} /> : null}
                  {collapseAction}
                  {dismissAction}
                </>
              }
            />
            <StageMidiPanel events={midiEvents} reducedMotion={shouldReduceEffects} />
          </div>
          <StageEventTicker events={tickerEvents} reducedMotion={shouldReduceEffects} />
        </div>
      ) : null}
      {activeKyron ? (
        <div ref={bannerRef}>
          <StageKyron entry={activeKyron} phase={kyronPhase} />
        </div>
      ) : null}
    </>
  )
}

export function useNotifications() {
  return useContext(NotificationContext) ?? noopContextValue
}

export function useToasts() {
  const { pushNotification: pushToast, dismissNotification: dismissToast } = useNotifications()
  return { pushToast, dismissToast }
}

export { NotificationProvider as ToastProvider }
