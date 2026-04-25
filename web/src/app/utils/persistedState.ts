// Single, typed entry point for browser persistence. Replaces hand-rolled
// `localStorage.getItem(...) ?? JSON.parse(... ?? '...')` chains scattered
// across the app with a small validator-shaped contract. Each call site
// supplies a `parse(raw)` that returns the typed value or `undefined` on
// invalid input — invalid stored values are dropped silently and the
// fallback is used, so a poisoned localStorage entry never crashes a
// reader.

export interface PersistedKey<T> {
  storageKey: string
  fallback: T
  parse: (raw: string) => T | undefined
  serialize?: (value: T) => string
}

const DEFAULT_SERIALIZE = <T,>(value: T): string =>
  typeof value === 'string' ? value : JSON.stringify(value)

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readPersisted<T>(key: PersistedKey<T>): T {
  const storage = safeStorage()
  if (!storage) return key.fallback
  try {
    const raw = storage.getItem(key.storageKey)
    if (raw == null) return key.fallback
    const parsed = key.parse(raw)
    return parsed === undefined ? key.fallback : parsed
  } catch {
    return key.fallback
  }
}

export function writePersisted<T>(key: PersistedKey<T>, value: T): void {
  const storage = safeStorage()
  if (!storage) return
  const serialize = key.serialize ?? DEFAULT_SERIALIZE
  try {
    storage.setItem(key.storageKey, serialize(value))
  } catch {
    // Storage quota or privacy mode; persistence is best-effort.
  }
}

export function clearPersisted<T>(key: PersistedKey<T>): void {
  const storage = safeStorage()
  if (!storage) return
  try {
    storage.removeItem(key.storageKey)
  } catch {
    // ignore
  }
}

// Common primitive parsers — call sites stay one line.
export function parseString(raw: string): string {
  return raw
}

export function parseTrimmedNonEmpty(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

export function parseBoolean(raw: string): boolean | undefined {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return undefined
}

export function parseJson<T>(predicate: (value: unknown) => value is T): (raw: string) => T | undefined {
  return (raw: string) => {
    try {
      const value: unknown = JSON.parse(raw)
      return predicate(value) ? value : undefined
    } catch {
      return undefined
    }
  }
}
