import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

import { MapClusterFabricIcon } from './icons/map'
import { canonicalizeNavigationRoute } from '../data/advancedMenuItems'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { markRouteRenderReady, markRouteRenderStart, reportRouteRequestVolume } from '../performance/devDiagnostics'
import './PageTransition.css'

type TransitionScope = {
  id: 'home' | 'audio-artifacts' | 'juce-grid' | 'midi-hub'
}

type TransitionMode = 'block' | 'fade' | 'pager'
type TransitionDirection = 'forward' | 'backward'

interface PageTransitionProps {
  children: ReactNode
}

interface TransitionSnapshot {
  key: number
  mode: TransitionMode
  scope: TransitionScope
  direction: TransitionDirection
}

const BLOCK_REVEAL_DURATION_MS = 160
const FADE_DURATION_MS = 140
const PAGER_SLIDE_DURATION_MS = 160
const TRANSITION_BLOCK_COLUMNS = 8
const TRANSITION_BLOCK_ROWS = 5
const TRANSITION_BLOCK_MOBILE_COLUMNS = 5
const TRANSITION_BLOCK_COUNT = TRANSITION_BLOCK_COLUMNS * TRANSITION_BLOCK_ROWS
const FALLBACK_SCOPE: TransitionScope = { id: 'home' }
const TRANSITION_BLOCKS = Array.from({ length: TRANSITION_BLOCK_COUNT }, (_, index) => ({
  index,
  column: index % TRANSITION_BLOCK_COLUMNS,
  row: Math.floor(index / TRANSITION_BLOCK_COLUMNS),
  mobileColumn: index % TRANSITION_BLOCK_MOBILE_COLUMNS,
  mobileRow: Math.floor(index / TRANSITION_BLOCK_MOBILE_COLUMNS),
}))

export function getLandingTransitionScope(pathname: string): TransitionScope | null {
  const canonicalPathname = canonicalizeNavigationRoute(pathname)

  if (canonicalPathname === '/') {
    return { id: 'home' }
  }

  if (canonicalPathname === '/workspace/artifacts' || canonicalPathname.startsWith('/workspace/artifacts/')) {
    return { id: 'audio-artifacts' }
  }

  if (canonicalPathname.startsWith('/juce-grid')) {
    return { id: 'juce-grid' }
  }

  if (
    canonicalPathname === '/midi'
    || canonicalPathname === '/midi-hub'
    || canonicalPathname === '/midi-hub-2'
    || canonicalPathname.startsWith('/midi-hub/')
  ) {
    return { id: 'midi-hub' }
  }

  return null
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const { resolvedPageTransitionMode } = useReducedEffectsPreference()
  const previousPathnameRef = useRef(location.pathname)
  const timeoutRef = useRef<number | null>(null)
  const [transition, setTransition] = useState<TransitionSnapshot | null>(null)
  const currentScope = useMemo(() => getLandingTransitionScope(location.pathname), [location.pathname])

  useLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current

    if (previousPathname === location.pathname) {
      return undefined
    }

    previousPathnameRef.current = location.pathname

    const previousScope = getLandingTransitionScope(previousPathname)
    if (!previousScope && !currentScope) {
      return undefined
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    const mode: TransitionMode =
      resolvedPageTransitionMode === 'fade'
        ? 'fade'
        : resolvedPageTransitionMode === 'pager-slide'
          ? 'pager'
          : 'block'

    const nextTransition: TransitionSnapshot = {
      key: Date.now(),
      mode,
      scope: currentScope ?? previousScope ?? FALLBACK_SCOPE,
      direction: navigationType === 'POP' ? 'backward' : 'forward',
    }

    setTransition(nextTransition)

    timeoutRef.current = window.setTimeout(() => {
      setTransition(null)
      timeoutRef.current = null
    }, nextTransition.mode === 'fade'
      ? FADE_DURATION_MS
      : nextTransition.mode === 'pager'
        ? PAGER_SLIDE_DURATION_MS
        : BLOCK_REVEAL_DURATION_MS)

    return undefined
  }, [currentScope, location.pathname, navigationType, resolvedPageTransitionMode])

  useEffect(() => () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    markRouteRenderStart(location.pathname)

    let cancelled = false
    let firstFrameId = 0
    let secondFrameId = 0

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        if (cancelled) {
          return
        }

        markRouteRenderReady(location.pathname)
        reportRouteRequestVolume(location.pathname)
      })
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(firstFrameId)
      window.cancelAnimationFrame(secondFrameId)
    }
  }, [location.pathname])

  return (
    <div className={`page-transition-scope${transition?.mode === 'pager' ? ' page-transition-scope--pager-active' : ''}`}>
      <div
        className={`page-transition-scope__content${transition?.mode === 'pager' ? ` page-transition-scope__content--pager page-transition-scope__content--${transition.direction}` : ''}`}
      >
        {children}
      </div>
      {transition ? (
        <div
          key={transition.key}
          className={`landing-route-transition landing-route-transition--${transition.mode} landing-route-transition--${transition.scope.id} landing-route-transition--${transition.direction}`}
          data-testid="landing-route-transition"
          aria-hidden="true"
        >
          {transition.mode === 'block' ? (
            <div className="landing-route-transition__grid">
              {TRANSITION_BLOCKS.map((block) => (
                <span
                  key={`${transition.key}-${transition.scope.id}-${block.index}`}
                  className="landing-route-transition__block"
                  style={{
                    '--landing-route-transition-column': block.column,
                    '--landing-route-transition-row': block.row,
                    '--landing-route-transition-mobile-column': block.mobileColumn,
                    '--landing-route-transition-mobile-row': block.mobileRow,
                  } as CSSProperties}
                >
                  <MapClusterFabricIcon className="landing-route-transition__block-icon" aria-hidden />
                </span>
              ))}
            </div>
          ) : transition.mode === 'fade' ? (
            <span className="landing-route-transition__fade-panel" />
          ) : (
            <span className={`landing-route-transition__pager-band landing-route-transition__pager-band--${transition.direction}`} />
          )}
        </div>
      ) : null}
    </div>
  )
}
