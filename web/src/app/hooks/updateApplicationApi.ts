import type {
  HybridApplicationStatusInfo,
  HybridApplicationUpdateStepInfo,
  PlatformVersionInfo,
  TriggerApplicationUpdateResult,
  UpdateHybridVersionInfo,
} from './useNodeOperations'
import { makePendingUpdateApplicationSteps } from './updateApplicationProgressModel'

type UpdateApplicationApiVariant = 'hybrid' | 'legacy'
type UpdateApplicationRequest = { version?: string; branch?: string; force?: boolean }
type LegacyOutcome = {
  status: 'failed' | 'completed'
  message: string
  completedAt: string
  targetVersion?: string
}

const UPDATE_APPLICATION_API_BASES: Record<UpdateApplicationApiVariant, string> = {
  hybrid: '/api/cluster/update/hybrid',
  legacy: '/api/cluster/update',
}

let preferredUpdateApplicationApiVariant: UpdateApplicationApiVariant = 'hybrid'
let lastLegacyOutcome: LegacyOutcome | null = null

function candidateVariants(): UpdateApplicationApiVariant[] {
  return preferredUpdateApplicationApiVariant === 'hybrid'
    ? ['hybrid', 'legacy']
    : ['legacy', 'hybrid']
}

function buildUrl(variant: UpdateApplicationApiVariant, path: string): string {
  return `${UPDATE_APPLICATION_API_BASES[variant]}${path}`
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function nowIso(): string {
  return new Date().toISOString()
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === 'HTTP 404'
}

async function requestWithFallback<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await requestWithFallbackDetailed(path, init)
  return result.payload as T
}

async function requestWithFallbackDetailed(path: string, init?: RequestInit): Promise<{ variant: UpdateApplicationApiVariant; payload: unknown }> {
  let lastNotFoundError: Error | null = null

  for (const variant of candidateVariants()) {
    try {
      const result = await requestJson<unknown>(buildUrl(variant, path), init)
      preferredUpdateApplicationApiVariant = variant
      return { variant, payload: result }
    } catch (error) {
      if (isNotFoundError(error)) {
        lastNotFoundError = error
        continue
      }
      throw error
    }
  }

  throw lastNotFoundError ?? new Error('HTTP 404')
}

function setStepState(
  steps: HybridApplicationUpdateStepInfo[],
  key: HybridApplicationUpdateStepInfo['key'],
  status: HybridApplicationUpdateStepInfo['status'],
  result: string,
): void {
  const step = steps.find((entry) => entry.key === key)
  if (!step) return
  const timestamp = nowIso()
  step.status = status
  step.result = result
  step.started_at = step.started_at ?? timestamp
  if (status !== 'running') {
    step.completed_at = timestamp
  }
}

function inferFailedStepKey(message: string): HybridApplicationUpdateStepInfo['key'] {
  const normalized = message.toLowerCase()
  if (normalized.includes('repository validation')) return 'validate-source'
  if (normalized.includes('stash')) return 'prepare-local-state'
  if (normalized.includes('fetch') || normalized.includes('remote')) return 'fetch-update-payload'
  if (normalized.includes('checkout') || normalized.includes('target application version')) return 'apply-target-version'
  if (normalized.includes('pip') || normalized.includes('requirements') || normalized.includes('dependency')) return 'refresh-runtime-dependencies'
  if (normalized.includes('frontend') || normalized.includes('bundle') || normalized.includes('build')) return 'rebuild-frontend-assets'
  if (normalized.includes('validation failed') || normalized.includes('post-update')) return 'validate-and-finalize'
  return 'validate-source'
}

function synthesizeLegacyStatus(
  payload: Record<string, unknown>,
  outcome: LegacyOutcome | null,
): HybridApplicationStatusInfo {
  const mode = asString(payload.mode) ?? 'unknown'
  const environment = asString(payload.environment) ?? 'unknown'
  const currentVersion = asString(payload.current_version)
  const running = asBoolean(payload.running)
  const message = asString(payload.message)
  const baseSteps = makePendingUpdateApplicationSteps()

  if (mode !== 'unknown') {
    setStepState(baseSteps, 'detect-mode', 'completed', `Using ${mode.toUpperCase()} update mode`)
  }
  if (currentVersion) {
    setStepState(baseSteps, 'identify-current-build', 'completed', `Current build: ${currentVersion}`)
  }

  if (running) {
    const runningMessage = message ?? 'Legacy backend is running the application update without detailed per-step telemetry.'
    setStepState(baseSteps, 'validate-source', 'running', runningMessage)
    return {
      status: 'running',
      mode,
      environment,
      running: true,
      current_version: currentVersion,
      current_step_key: 'validate-source',
      current_step_index: baseSteps.findIndex((step) => step.key === 'validate-source'),
      message: runningMessage,
      last_update: asString(payload.last_update) ?? null,
      steps: baseSteps,
    }
  }

  if (outcome) {
    if (outcome.status === 'completed') {
      for (const step of baseSteps) {
        if (step.status === 'pending') {
          setStepState(baseSteps, step.key, 'completed', 'Legacy backend completed the update without per-step telemetry.')
        }
      }
      setStepState(baseSteps, 'validate-and-finalize', 'completed', outcome.message)
      return {
        status: 'completed',
        mode,
        environment,
        running: false,
        current_version: currentVersion,
        current_step_key: 'validate-and-finalize',
        current_step_index: baseSteps.findIndex((step) => step.key === 'validate-and-finalize'),
        message: outcome.message,
        completed_at: outcome.completedAt,
        last_update: outcome.completedAt,
        steps: baseSteps,
      }
    }

    const failedStepKey = inferFailedStepKey(outcome.message)
    setStepState(baseSteps, failedStepKey, 'failed', outcome.message)
    return {
      status: 'failed',
      mode,
      environment,
      running: false,
      current_version: currentVersion,
      current_step_key: failedStepKey,
      current_step_index: baseSteps.findIndex((step) => step.key === failedStepKey),
      message: outcome.message,
      error: outcome.message,
      completed_at: outcome.completedAt,
      last_update: outcome.completedAt,
      steps: baseSteps,
    }
  }

  return {
    status: 'idle',
    mode,
    environment,
    running: false,
    current_version: currentVersion,
    message: message ?? 'Update workflow ready',
    last_update: asString(payload.last_update) ?? null,
    steps: baseSteps,
  }
}

function normalizeHybridStatusPayload(payload: unknown): HybridApplicationStatusInfo | null {
  const record = asRecord(payload)
  if (!record || !Array.isArray(record.steps)) return null
  return payload as HybridApplicationStatusInfo
}

async function fetchLegacyPlatformVersion(): Promise<PlatformVersionInfo> {
  return requestJson<PlatformVersionInfo>('/api/version')
}

export async function fetchUpdateApplicationStatus(): Promise<HybridApplicationStatusInfo> {
  const { variant, payload } = await requestWithFallbackDetailed('/application/status')
  if (variant === 'hybrid') {
    const normalized = normalizeHybridStatusPayload(payload)
    if (normalized) return normalized
  }

  return synthesizeLegacyStatus(asRecord(payload) ?? {}, lastLegacyOutcome)
}

export async function fetchUpdateApplicationVersion(): Promise<UpdateHybridVersionInfo> {
  const { variant, payload } = await requestWithFallbackDetailed('/application/version')
  const record = asRecord(payload)
  if (variant === 'hybrid' && record && asString(record.version) && asString(record.mode)) {
    return {
      version: asString(record.version) ?? '',
      mode: asString(record.mode) ?? 'unknown',
      updated_at: asString(record.updated_at),
      branch: asString(record.branch),
    }
  }

  const [platformVersion, legacyStatus] = await Promise.all([
    fetchLegacyPlatformVersion(),
    requestJson<Record<string, unknown>>(buildUrl('legacy', '/application/status')),
  ])

  return {
    version: platformVersion.version,
    mode: asString(legacyStatus.mode) ?? 'unknown',
    updated_at: asString(legacyStatus.last_update) ?? lastLegacyOutcome?.completedAt,
    branch: asString(legacyStatus.branch),
  }
}

export async function triggerUpdateApplication(request: UpdateApplicationRequest): Promise<TriggerApplicationUpdateResult> {
  const { variant, payload } = await requestWithFallbackDetailed('/application', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'auto',
      version: request.version,
      branch: request.branch ?? 'master',
      force: request.force ?? false,
    }),
  })

  const result = (asRecord(payload) ?? {}) as unknown as TriggerApplicationUpdateResult

  if (variant === 'legacy') {
    const status = asString((payload as Record<string, unknown> | null)?.status)
    const success = (payload as Record<string, unknown> | null)?.success
    if (status === 'ok' && success !== false) {
      lastLegacyOutcome = {
        status: 'completed',
        message: result.message || 'Legacy backend completed the application update.',
        completedAt: nowIso(),
        targetVersion: request.version ?? request.branch,
      }
    } else {
      lastLegacyOutcome = {
        status: 'failed',
        message: result.message || 'Legacy backend reported that the application update failed.',
        completedAt: nowIso(),
        targetVersion: request.version ?? request.branch,
      }
    }
  } else {
    lastLegacyOutcome = null
  }

  return result
}

export function resetUpdateApplicationApiVariantForTests(): void {
  preferredUpdateApplicationApiVariant = 'hybrid'
  lastLegacyOutcome = null
}
