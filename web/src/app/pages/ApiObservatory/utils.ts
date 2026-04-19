import type { EnvironmentVariableSet, RequestDraft } from './types'

export function interpolateVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key: string) => vars[key] ?? _match)
}

export function draftToHeaders(draft: RequestDraft, vars: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {}

  draft.headers
    .filter((item) => item.enabled && item.key.trim())
    .forEach((item) => {
      headers[item.key.trim()] = interpolateVariables(item.value, vars)
    })

  if (draft.authMode === 'bearer' && draft.authValue.trim()) {
    headers.Authorization = `Bearer ${interpolateVariables(draft.authValue, vars)}`
  } else if (draft.authMode === 'api-key' && draft.authValue.trim()) {
    headers['X-API-Key'] = interpolateVariables(draft.authValue, vars)
  } else if (draft.authMode === 'basic' && draft.authValue.trim()) {
    headers.Authorization = `Basic ${btoa(interpolateVariables(draft.authValue, vars))}`
  }

  return headers
}

export function draftToUrl(draft: RequestDraft, vars: Record<string, string>): string {
  const base = interpolateVariables(draft.url, vars)
  const url = new URL(base, 'http://localhost:8080')

  draft.queryParams
    .filter((param) => param.enabled && param.key.trim())
    .forEach((param) => {
      url.searchParams.set(param.key.trim(), interpolateVariables(param.value, vars))
    })

  if (base.startsWith('/')) {
    return `${url.pathname}${url.search}`
  }
  return url.toString()
}

export function parseBody(draft: RequestDraft, vars: Record<string, string>): unknown {
  if (draft.bodyMode === 'none') {
    return null
  }

  const body = interpolateVariables(draft.bodyText || '', vars)

  if (draft.bodyMode === 'json') {
    if (!body.trim()) {
      return {}
    }
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  }

  return body
}

export function resolveEnvironmentMap(
  environments: EnvironmentVariableSet[],
  environmentId: string,
): Record<string, string> {
  const environment = environments.find((item) => item.id === environmentId) ?? environments[0]
  return { ...(environment?.values ?? {}) }
}

export function safeJsonPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function createDefaultDraft(index = 1): RequestDraft {
  return {
    id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Request ${index}`,
    method: 'GET',
    url: '{{base_url}}/api/health',
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
    ],
    queryParams: [],
    bodyMode: 'none',
    bodyText: '',
    authMode: 'none',
    authValue: '',
    preRequestScript: '',
    testScript: '',
    nodeTarget: 'local-node',
  }
}
