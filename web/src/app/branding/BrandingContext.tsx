import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  DEFAULT_BRAND,
  fetchBrandManifest,
  patchBrandManifest,
  resetBrandManifest,
  type BrandManifest,
} from './brandingApi'

export const BRANDING_CHANGE_EVENT = 'map2:branding-change'

type BrandingContextValue = {
  brand: BrandManifest
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  patch: (partial: Partial<BrandManifest>) => Promise<BrandManifest>
  reset: () => Promise<BrandManifest>
}

const BrandingContext = createContext<BrandingContextValue | null>(null)

type BrandingProviderProps = {
  children: ReactNode
  /** Skip the network fetch on first render; useful in tests. */
  initialBrand?: BrandManifest
}

export function BrandingProvider({ children, initialBrand }: BrandingProviderProps) {
  const [brand, setBrand] = useState<BrandManifest>(initialBrand ?? DEFAULT_BRAND)
  const [loading, setLoading] = useState(!initialBrand)
  const [error, setError] = useState<string | null>(null)

  const refresh = useMemo(
    () => async () => {
      try {
        setLoading(true)
        setError(null)
        const next = await fetchBrandManifest()
        setBrand(next)
        window.dispatchEvent(new CustomEvent(BRANDING_CHANGE_EVENT, { detail: next }))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!initialBrand) {
      void refresh()
    }
  }, [initialBrand, refresh])

  // Keep <title> in sync with the manifest. Runtime-driven instead of the old
  // hardcoded index.html <title> element.
  useEffect(() => {
    if (brand?.productName) {
      document.title = brand.productName
    }
  }, [brand?.productName])

  const patch = useMemo(
    () => async (partial: Partial<BrandManifest>) => {
      const next = await patchBrandManifest(partial)
      setBrand(next)
      window.dispatchEvent(new CustomEvent(BRANDING_CHANGE_EVENT, { detail: next }))
      return next
    },
    [],
  )

  const reset = useMemo(
    () => async () => {
      const next = await resetBrandManifest()
      setBrand(next)
      window.dispatchEvent(new CustomEvent(BRANDING_CHANGE_EVENT, { detail: next }))
      return next
    },
    [],
  )

  const value = useMemo<BrandingContextValue>(
    () => ({ brand, loading, error, refresh, patch, reset }),
    [brand, loading, error, refresh, patch, reset],
  )

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext)
  if (!ctx) {
    // Tolerate missing provider (e.g. in isolated tests) by returning a
    // read-only view with the default brand.
    return {
      brand: DEFAULT_BRAND,
      loading: false,
      error: null,
      refresh: async () => {},
      patch: async () => DEFAULT_BRAND,
      reset: async () => DEFAULT_BRAND,
    }
  }
  return ctx
}
