import { useState, useCallback, useEffect } from 'react'
import type { DeviceRegistryEntry } from '../../data/deviceRegistry'

const PINNED_KEY = 'map2:storefront:pinned'

function readPinned(): Set<string> {
  try {
    const raw = window.localStorage.getItem(PINNED_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function writePinned(ids: Set<string>) {
  try {
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(Array.from(ids)))
  } catch {}
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
