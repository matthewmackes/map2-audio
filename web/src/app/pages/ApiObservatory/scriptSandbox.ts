export interface ScriptRunContext {
  request: Record<string, unknown>
  response: Record<string, unknown> | null
  environment: Record<string, string>
  collectionVariables?: Record<string, string>
  globalVariables?: Record<string, string>
}

export interface ScriptTestResult {
  name: string
  pass: boolean
  message?: string
}

export interface ScriptRunResult {
  request: Record<string, unknown>
  environment: Record<string, string>
  tests: ScriptTestResult[]
  logs: string[]
  error?: { message: string; stack?: string }
}

export const SCRIPT_TEMPLATES: Array<{ id: string; label: string; script: string }> = [
  {
    id: 'set-auth-token',
    label: 'Set auth token from response',
    script: `if (pm.response && pm.response.body && pm.response.body.token) {\n  pm.environment.set('auth_token', pm.response.body.token)\n}\npm.test('token stored', () => {\n  pm.expect(pm.environment.get('auth_token')).toContain('')\n})`,
  },
  {
    id: 'chain-id',
    label: 'Chain response id to next request',
    script: `if (pm.response && pm.response.body && pm.response.body.id) {\n  pm.environment.set('last_id', String(pm.response.body.id))\n}\npm.test('stored id exists', () => {\n  pm.expect(pm.environment.get('last_id')).toContain('')\n})`,
  },
  {
    id: 'assert-latency',
    label: 'Assert response time < 500ms',
    script: `pm.test('response < 500ms', () => {\n  pm.expect(pm.response ? Number(pm.response.total_ms || 0) : 9999).toBeBelow(500)\n})`,
  },
  {
    id: 'validate-schema',
    label: 'Validate basic JSON body shape',
    script: `pm.test('body has status', () => {\n  pm.expect(pm.response?.body || {}).toHaveProperty('status')\n})`,
  },
  {
    id: 'log-fields',
    label: 'Log response fields',
    script: `pm.log('response keys', Object.keys(pm.response?.body || {}))`,
  },
]

export function runScriptInSandbox(
  script: string,
  context: ScriptRunContext,
  timeoutMs = 10_000,
): Promise<ScriptRunResult> {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const worker = new Worker(new URL('./scriptSandbox.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (event) => {
      if (!event.data || event.data.requestId !== requestId) {
        return
      }

      if (event.data.type === 'error') {
        resolve({
          ...(event.data.data as ScriptRunResult),
          error: event.data.error,
        })
      } else {
        resolve(event.data.data as ScriptRunResult)
      }
      worker.terminate()
    }

    worker.postMessage({
      type: 'run',
      requestId,
      script,
      timeoutMs,
      context,
    })
  })
}
