import { useEffect } from 'react'
import type { RefObject } from 'react'

type UseRouteScrollRestorationOptions = {
  storageKey: string
  enabled?: boolean
  elementRef?: RefObject<HTMLElement | null>
}

function readStoredScrollTop(storageKey: string): number {
  if (typeof window === 'undefined') {
    return 0
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey)
    const parsed = Number.parseFloat(rawValue ?? '0')
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  } catch {
    return 0
  }
}

function writeStoredScrollTop(storageKey: string, scrollTop: number) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(storageKey, String(Math.max(0, Math.round(scrollTop))))
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function readCurrentWindowScrollTop(): number {
  if (typeof window === 'undefined') {
    return 0
  }

  return Math.max(
    0,
    window.scrollY
      || window.pageYOffset
      || document.documentElement?.scrollTop
      || document.body?.scrollTop
      || 0,
  )
}

export function useRouteScrollRestoration({
  storageKey,
  enabled = true,
  elementRef,
}: UseRouteScrollRestorationOptions) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return undefined
    }

    const element = elementRef?.current ?? null
    let restoreFrame = window.requestAnimationFrame(() => {
      const storedScrollTop = readStoredScrollTop(storageKey)
      if (storedScrollTop <= 0) {
        return
      }

      if (element) {
        element.scrollTop = storedScrollTop
        return
      }

      try {
        window.scrollTo({ top: storedScrollTop, behavior: 'auto' })
      } catch {
        if (document.documentElement) {
          document.documentElement.scrollTop = storedScrollTop
        }
        if (document.body) {
          document.body.scrollTop = storedScrollTop
        }
      }
    })

    let persistFrame: number | null = null
    let latestScrollTop = 0

    const handleScroll = () => {
      latestScrollTop = element ? element.scrollTop : readCurrentWindowScrollTop()
      if (persistFrame !== null) {
        return
      }

      persistFrame = window.requestAnimationFrame(() => {
        persistFrame = null
        writeStoredScrollTop(storageKey, latestScrollTop)
      })
    }

    if (element) {
      element.addEventListener('scroll', handleScroll, { passive: true })
    } else {
      window.addEventListener('scroll', handleScroll, { passive: true })
    }

    return () => {
      window.cancelAnimationFrame(restoreFrame)
      if (persistFrame !== null) {
        window.cancelAnimationFrame(persistFrame)
      }
      if (element) {
        element.removeEventListener('scroll', handleScroll)
      } else {
        window.removeEventListener('scroll', handleScroll)
      }
    }
  }, [elementRef, enabled, storageKey])
}

export default useRouteScrollRestoration
