import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

import { canonicalizeNavigationRoute } from '../data/advancedMenuItems'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import { markRouteRenderReady, markRouteRenderStart, reportRouteRequestVolume } from '../performance/devDiagnostics'
import './PageTransition.css'

type TransitionScope = {
  id: 'home' | 'audio-artifacts' | 'juce-grid' | 'midi-hub' | 'workspace'
}

type TransitionMode = 'staggered' | 'fade' | 'pager'
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

const STAGGERED_REVEAL_DURATION_MS = 600
const FADE_DURATION_MS = 140
const PAGER_SLIDE_DURATION_MS = 160
const FALLBACK_SCOPE: TransitionScope = { id: 'home' }

export function getLandingTransitionScope(pathname: string): TransitionScope | null {
  const canonicalPathname = canonicalizeNavigationRoute(pathname)

  if (canonicalPathname === '/') {
    return { id: 'home' }
  }

  // Nav reorg 2026-05-03 (second pass) — Audio Artifacts canonical
  // mount is `/artifacts`; legacy `/workspace/artifacts` paths still
  // resolve via redirect but we match both for transition semantics.
  if (
    canonicalPathname === '/artifacts'
    || canonicalPathname.startsWith('/artifacts/')
    || canonicalPathname === '/workspace/artifacts'
    || canonicalPathname.startsWith('/workspace/artifacts/')
  ) {
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

  // Generic fallback: any other navigation gets a minimal workspace
  // scope so the universal staggered overlay still renders.
  return { id: 'workspace' }
}

function resolveScopedTransitionMode(
  _scope: TransitionScope,
  preferredMode: TransitionMode,
): TransitionMode {
  // Operators who pick the React Staggered Reveal preset want it
  // everywhere — including MIDI Hub, JUCE grid, and other previously
  // light-fade scopes. We keep the universal in-content stagger across
  // every route and now run the matching subtle wash overlay alongside
  // it for consistent feel. A user who wants the lighter alternative
  // can always pick Pager Slide or enable Reduce Effects.
  return preferredMode
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

    const preferredMode: TransitionMode =
      resolvedPageTransitionMode === 'fade'
        ? 'fade'
        : resolvedPageTransitionMode === 'pager-slide'
          ? 'pager'
          : 'staggered'
    const scope = currentScope ?? previousScope ?? FALLBACK_SCOPE

    const nextTransition: TransitionSnapshot = {
      key: Date.now(),
      mode: resolveScopedTransitionMode(scope, preferredMode),
      scope,
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
        : STAGGERED_REVEAL_DURATION_MS)

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
          {transition.mode === 'staggered' ? (
            <span className="landing-route-transition__stagger-wash" />
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
