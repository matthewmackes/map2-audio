type UpdateApplicationApiVariant = 'hybrid' | 'legacy'

const UPDATE_APPLICATION_API_BASES: Record<UpdateApplicationApiVariant, string> = {
  hybrid: '/api/cluster/update/hybrid',
  legacy: '/api/cluster/update',
}

let preferredUpdateApplicationApiVariant: UpdateApplicationApiVariant = 'hybrid'

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

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === 'HTTP 404'
}

async function requestWithFallback<T>(path: string, init?: RequestInit): Promise<T> {
  let lastNotFoundError: Error | null = null

  for (const variant of candidateVariants()) {
    try {
      const result = await requestJson<T>(buildUrl(variant, path), init)
      preferredUpdateApplicationApiVariant = variant
      return result
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

export function fetchUpdateApplicationJson<T>(path: string): Promise<T> {
  return requestWithFallback<T>(path)
}

export function postUpdateApplicationJson<T>(path: string, body?: unknown): Promise<T> {
  return requestWithFallback<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export function resetUpdateApplicationApiVariantForTests(): void {
  preferredUpdateApplicationApiVariant = 'hybrid'
}
