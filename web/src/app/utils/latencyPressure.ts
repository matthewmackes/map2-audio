export const LATENCY_PRESSURE_BLUE = 'var(--cds-support-info)'
export const LATENCY_PRESSURE_RED = 'var(--cds-support-error)'

export type LatencyPressureTone = 'blue' | 'red'
export type LatencyPressureStatus = 'waiting' | 'offline' | 'stable' | 'watch' | 'critical'

export interface LatencyPressureInputs {
  running?: boolean | null
  totalLatencyMs?: number | null
  rtlP95Ms?: number | null
  jitterP95Ms?: number | null
  xrunCount?: number | null
  callbackBudgetMs?: number | null
  currentCallbackMs?: number | null
  headroomPercent?: number | null
}

export interface LatencyPressureAnalysis {
  isAvailable: boolean
  score: number | null
  scoreDisplay: string
  weightedScore: number | null
  pressurePercent: number | null
  tone: LatencyPressureTone
  toneColor: string
  fillColor: string
  status: LatencyPressureStatus
  statusLabel: string
  inputs: {
    running: boolean | null
    totalLatencyMs: number | null
    rtlP95Ms: number | null
    effectiveLatencyMs: number | null
    jitterP95Ms: number | null
    xrunCount: number | null
    callbackBudgetMs: number | null
    currentCallbackMs: number | null
    callbackRatio: number | null
    callbackLoadPercent: number | null
    headroomPercent: number | null
  }
  components: {
    callback: number
    latency: number
    jitter: number
    headroom: number
    xruns: number
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function toFiniteNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return value
}

function scoreBadMetric(value: number | null, goodThreshold: number, badThreshold: number): number {
  if (value == null) {
    return 10
  }

  if (value <= goodThreshold) {
    return 10
  }

  if (value >= badThreshold) {
    return 0
  }

  const normalized = (value - goodThreshold) / (badThreshold - goodThreshold)
  return clamp(10 * (1 - normalized), 0, 10)
}

function scoreGoodMetric(value: number | null, badThreshold: number, goodThreshold: number): number {
  if (value == null) {
    return 10
  }

  if (value >= goodThreshold) {
    return 10
  }

  if (value <= badThreshold) {
    return 0
  }

  const normalized = (value - badThreshold) / (goodThreshold - badThreshold)
  return clamp(10 * normalized, 0, 10)
}

function xrunScore(xrunCount: number | null): number {
  if (xrunCount == null || xrunCount <= 0) {
    return 10
  }

  return 0
}

function xrunScoreCap(xrunCount: number | null): number {
  if (xrunCount == null || xrunCount <= 0) {
    return 10
  }

  if (xrunCount === 1) {
    return 6
  }

  if (xrunCount <= 3) {
    return 4
  }

  return 2
}

function describeStatus(score: number | null, running: boolean | null, isAvailable: boolean): {
  status: LatencyPressureStatus
  statusLabel: string
} {
  if (!isAvailable || score == null) {
    return { status: 'waiting', statusLabel: 'Waiting' }
  }

  if (running === false) {
    return { status: 'offline', statusLabel: 'Offline' }
  }

  if (score <= 3) {
    return { status: 'critical', statusLabel: 'Critical' }
  }

  if (score <= 7) {
    return { status: 'watch', statusLabel: 'Watch' }
  }

  return { status: 'stable', statusLabel: 'Stable' }
}

export function formatLatencyPressureScore(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '--'
  }

  return String(clamp(Math.round(score), 0, 10)).padStart(2, '0')
}

export function computeLatencyPressure(inputs: LatencyPressureInputs): LatencyPressureAnalysis {
  const running = typeof inputs.running === 'boolean' ? inputs.running : null
  const totalLatencyMs = toFiniteNumber(inputs.totalLatencyMs)
  const rtlP95Ms = toFiniteNumber(inputs.rtlP95Ms)
  const jitterP95Ms = toFiniteNumber(inputs.jitterP95Ms)
  const xrunCount = toFiniteNumber(inputs.xrunCount)
  const callbackBudgetMs = toFiniteNumber(inputs.callbackBudgetMs)
  const currentCallbackMs = toFiniteNumber(inputs.currentCallbackMs)
  const headroomPercent = toFiniteNumber(inputs.headroomPercent)
  const effectiveLatencyMs = totalLatencyMs != null || rtlP95Ms != null
    ? Math.max(totalLatencyMs ?? 0, rtlP95Ms ?? 0)
    : null
  const callbackRatio = callbackBudgetMs != null && callbackBudgetMs > 0 && currentCallbackMs != null
    ? currentCallbackMs / callbackBudgetMs
    : null
  const callbackLoadPercent = callbackRatio != null ? clamp(Math.round(callbackRatio * 100), 0, 999) : null
  const hasAnyMetric = Boolean(
    effectiveLatencyMs != null ||
    jitterP95Ms != null ||
    callbackRatio != null ||
    headroomPercent != null ||
    (xrunCount != null && xrunCount > 0),
  )

  if (!hasAnyMetric) {
    const waitingStatus = describeStatus(null, running, false)

    return {
      isAvailable: false,
      score: null,
      scoreDisplay: formatLatencyPressureScore(null),
      weightedScore: null,
      pressurePercent: null,
      tone: 'blue',
      toneColor: LATENCY_PRESSURE_BLUE,
      fillColor: 'color-mix(in srgb, var(--cds-support-info) 18%, transparent)',
      status: waitingStatus.status,
      statusLabel: waitingStatus.statusLabel,
      inputs: {
        running,
        totalLatencyMs,
        rtlP95Ms,
        effectiveLatencyMs,
        jitterP95Ms,
        xrunCount,
        callbackBudgetMs,
        currentCallbackMs,
        callbackRatio,
        callbackLoadPercent,
        headroomPercent,
      },
      components: {
        callback: 10,
        latency: 10,
        jitter: 10,
        headroom: 10,
        xruns: 10,
      },
    }
  }

  if (running === false) {
    const offlineStatus = describeStatus(0, false, true)

    return {
      isAvailable: true,
      score: 0,
      scoreDisplay: formatLatencyPressureScore(0),
      weightedScore: 0,
      pressurePercent: 100,
      tone: 'red',
      toneColor: LATENCY_PRESSURE_RED,
      fillColor: 'color-mix(in srgb, var(--cds-support-error) 18%, transparent)',
      status: offlineStatus.status,
      statusLabel: offlineStatus.statusLabel,
      inputs: {
        running,
        totalLatencyMs,
        rtlP95Ms,
        effectiveLatencyMs,
        jitterP95Ms,
        xrunCount,
        callbackBudgetMs,
        currentCallbackMs,
        callbackRatio,
        callbackLoadPercent,
        headroomPercent,
      },
      components: {
        callback: 0,
        latency: 0,
        jitter: 0,
        headroom: 0,
        xruns: 0,
      },
    }
  }

  const componentScores = {
    callback: scoreBadMetric(callbackRatio, 0.45, 1.0),
    latency: scoreBadMetric(effectiveLatencyMs, 4.5, 12.0),
    jitter: scoreBadMetric(jitterP95Ms, 0.12, 0.8),
    headroom: scoreGoodMetric(headroomPercent, 10, 45),
    xruns: xrunScore(xrunCount),
  }

  const weightedScore =
    componentScores.callback * 0.32 +
    componentScores.latency * 0.30 +
    componentScores.jitter * 0.18 +
    componentScores.headroom * 0.10 +
    componentScores.xruns * 0.10

  const cappedScore = Math.min(weightedScore, xrunScoreCap(xrunCount))
  const score = clamp(Math.round(cappedScore), 0, 10)
  const rawPressurePercent = clamp(Math.round((1 - weightedScore / 10) * 100), 0, 100)
  const cappedPressurePercent = clamp(Math.round((1 - score / 10) * 100), 0, 100)
  const pressurePercent = Math.max(rawPressurePercent, cappedPressurePercent)
  const tone: LatencyPressureTone = score <= 3 ? 'red' : 'blue'
  const statusInfo = describeStatus(score, true, true)

  return {
    isAvailable: true,
    score,
    scoreDisplay: formatLatencyPressureScore(score),
    weightedScore: Number(weightedScore.toFixed(2)),
    pressurePercent,
    tone,
    toneColor: tone === 'red' ? LATENCY_PRESSURE_RED : LATENCY_PRESSURE_BLUE,
    fillColor: tone === 'red'
      ? 'color-mix(in srgb, var(--cds-support-error) 18%, transparent)'
      : 'color-mix(in srgb, var(--cds-support-info) 18%, transparent)',
    status: statusInfo.status,
    statusLabel: statusInfo.statusLabel,
    inputs: {
      running,
      totalLatencyMs,
      rtlP95Ms,
      effectiveLatencyMs,
      jitterP95Ms,
      xrunCount,
      callbackBudgetMs,
      currentCallbackMs,
      callbackRatio,
      callbackLoadPercent,
      headroomPercent,
    },
    components: componentScores,
  }
}
