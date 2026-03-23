import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { MapClusterFabricIcon } from './icons/map'
import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import './PageTransition.css'

type TransitionScope = {
  id: 'home' | 'audio-artifacts' | 'juce-grid' | 'midi-hub'
}

type TransitionMode = 'block' | 'fade'

interface PageTransitionProps {
  children: ReactNode
}

interface TransitionSnapshot {
  key: number
  mode: TransitionMode
  scope: TransitionScope
}

const BLOCK_REVEAL_DURATION_MS = 880
const FADE_DURATION_MS = 220
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
  if (pathname === '/') {
    return { id: 'home' }
  }

  if (pathname.startsWith('/audio-artifacts') || pathname.startsWith('/artifacts')) {
    return { id: 'audio-artifacts' }
  }

  if (pathname.startsWith('/juce-grid')) {
    return { id: 'juce-grid' }
  }

  if (
    pathname === '/midi'
    || pathname === '/midi-hub'
    || pathname === '/midi-hub-2'
    || pathname.startsWith('/midi-hub/')
  ) {
    return { id: 'midi-hub' }
  }

  return null
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const { shouldReduceEffects } = useReducedEffectsPreference()
  const previousPathnameRef = useRef(location.pathname)
  const timeoutRef = useRef<number | null>(null)
  const [transition, setTransition] = useState<TransitionSnapshot | null>(null)
  const currentScope = useMemo(() => getLandingTransitionScope(location.pathname), [location.pathname])

  useEffect(() => {
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

    const nextTransition: TransitionSnapshot = {
      key: Date.now(),
      mode: shouldReduceEffects ? 'fade' : 'block',
      scope: currentScope ?? previousScope ?? FALLBACK_SCOPE,
    }

    setTransition(nextTransition)

    timeoutRef.current = window.setTimeout(() => {
      setTransition(null)
      timeoutRef.current = null
    }, nextTransition.mode === 'fade' ? FADE_DURATION_MS : BLOCK_REVEAL_DURATION_MS)

    return undefined
  }, [currentScope, location.pathname, shouldReduceEffects])

  useEffect(() => () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <div className="page-transition-scope">
      {children}
      {transition ? (
        <div
          key={transition.key}
          className={`landing-route-transition landing-route-transition--${transition.mode} landing-route-transition--${transition.scope.id}`}
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
          ) : (
            <span className="landing-route-transition__fade-panel" />
          )}
        </div>
      ) : null}
    </div>
  )
}
