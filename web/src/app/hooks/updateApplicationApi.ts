import type {
  HybridApplicationStatusInfo,
  TriggerApplicationUpdateResult,
  UpdateHybridVersionInfo,
} from './useNodeOperations'

type UpdateApplicationRequest = { version?: string; branch?: string; force?: boolean }

const UPDATE_APPLICATION_API_BASE = '/api/cluster/update/hybrid'

function buildUrl(path: string): string {
  return `${UPDATE_APPLICATION_API_BASE}${path}`
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function fetchUpdateApplicationStatus(): Promise<HybridApplicationStatusInfo> {
  return requestJson<HybridApplicationStatusInfo>(buildUrl('/application/status'))
}

export async function fetchUpdateApplicationVersion(): Promise<UpdateHybridVersionInfo> {
  return requestJson<UpdateHybridVersionInfo>(buildUrl('/application/version'))
}

export async function triggerUpdateApplication(request: UpdateApplicationRequest): Promise<TriggerApplicationUpdateResult> {
  return requestJson<TriggerApplicationUpdateResult>(buildUrl('/application'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'auto',
      version: request.version,
      branch: request.branch ?? 'master',
      force: request.force ?? false,
    }),
  })
}

export function resetUpdateApplicationApiVariantForTests(): void {
  return undefined
}
