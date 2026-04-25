import { useState, useCallback, useEffect } from 'react'
import type { DeviceRegistryEntry } from '../../data/deviceRegistry'
import { readPersisted, writePersisted, type PersistedKey } from '../../utils/persistedState'

const PINNED_DEVICES_KEY: PersistedKey<string[]> = {
  storageKey: 'map2:storefront:pinned',
  fallback: [],
  parse: (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return undefined
      return parsed.filter((entry): entry is string => typeof entry === 'string')
    } catch {
      return undefined
    }
  },
}

function readPinned(): Set<string> {
  return new Set(readPersisted(PINNED_DEVICES_KEY))
}

function writePinned(ids: Set<string>) {
  writePersisted(PINNED_DEVICES_KEY, Array.from(ids))
}

export type StockFilter = 'all' | 'in-stock' | 'detected' | 'planned'
export type KindFilter = 'all' | DeviceRegistryEntry['kind']

export interface StorefrontFilters {
  kind: KindFilter
  stock: StockFilter
  query: string
}

export function useStorefrontState() {
  const [pinned, setPinnedRaw] = useState<Set<string>>(() => readPinned())
  const [quickviewId, setQuickviewId] = useState<string | null>(null)
  const [filters, setFilters] = useState<StorefrontFilters>({
    kind: 'all',
    stock: 'all',
    query: '',
  })

  useEffect(() => {
    writePinned(pinned)
  }, [pinned])

  const togglePin = useCallback((id: string) => {
    setPinnedRaw((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const isPinned = useCallback((id: string) => pinned.has(id), [pinned])

  const openQuickview = useCallback((id: string) => setQuickviewId(id), [])
  const closeQuickview = useCallback(() => setQuickviewId(null), [])

  const setKind = useCallback((kind: KindFilter) => setFilters((f) => ({ ...f, kind })), [])
  const setStock = useCallback((stock: StockFilter) => setFilters((f) => ({ ...f, stock })), [])
  const setQuery = useCallback((query: string) => setFilters((f) => ({ ...f, query })), [])

  return {
    pinned,
    isPinned,
    togglePin,
    quickviewId,
    openQuickview,
    closeQuickview,
    filters,
    setKind,
    setStock,
    setQuery,
  }
}
