import { useEffect, useState } from 'react'

const TABLET_TOUCH_MIN_WIDTH = 769
const TABLET_TOUCH_MAX_WIDTH = 1184

export interface TabletTouchRouteLayoutState {
  isTabletViewport: boolean
  isTouchCapable: boolean
  isTabletTouchRoute: boolean
}

function isTabletViewport() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.innerWidth >= TABLET_TOUCH_MIN_WIDTH && window.innerWidth <= TABLET_TOUCH_MAX_WIDTH
}

function isTouchCapableViewport() {
  if (typeof window === 'undefined') {
    return false
  }

  const navigatorTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0
  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false
  const ontouchstartSupported = 'ontouchstart' in window
  return navigatorTouchPoints > 0 || coarsePointer || ontouchstartSupported
}

function resolveLayoutState(pathname: string): TabletTouchRouteLayoutState {
  const tabletViewport = isTabletViewport()
  const touchCapable = isTouchCapableViewport()

  return {
    isTabletViewport: tabletViewport,
    isTouchCapable: touchCapable,
    isTabletTouchRoute: pathname === '/juce-grid' && tabletViewport && touchCapable,
  }
}

export function useTabletTouchRouteLayout(pathname: string): TabletTouchRouteLayoutState {
  const [layoutState, setLayoutState] = useState<TabletTouchRouteLayoutState>(() => resolveLayoutState(pathname))

  useEffect(() => {
    setLayoutState(resolveLayoutState(pathname))
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const updateLayoutState = () => {
      setLayoutState((current) => {
        const next = resolveLayoutState(pathname)
        return current.isTabletViewport === next.isTabletViewport
          && current.isTouchCapable === next.isTouchCapable
          && current.isTabletTouchRoute === next.isTabletTouchRoute
          ? current
          : next
      })
    }

    updateLayoutState()
    window.addEventListener('resize', updateLayoutState)

    let mediaQueryList: MediaQueryList | null = null
    if (typeof window.matchMedia === 'function') {
      mediaQueryList = window.matchMedia('(pointer: coarse)')
      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', updateLayoutState)
      } else {
        mediaQueryList.addListener(updateLayoutState)
      }
    }

    return () => {
      window.removeEventListener('resize', updateLayoutState)
      if (!mediaQueryList) {
        return
      }
      if (typeof mediaQueryList.removeEventListener === 'function') {
        mediaQueryList.removeEventListener('change', updateLayoutState)
      } else {
        mediaQueryList.removeListener(updateLayoutState)
      }
    }
  }, [pathname])

  return layoutState
}

export default useTabletTouchRouteLayout
