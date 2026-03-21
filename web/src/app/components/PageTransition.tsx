import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'
import './PageTransition.css'

type TransitionScope = {
  id: 'home' | 'audio-artifacts' | 'juce-grid' | 'midi-hub'
  label: string
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
const TRANSITION_BLOCK_COUNT = 24

export function getLandingTransitionScope(pathname: string): TransitionScope | null {
  if (pathname === '/') {
    return { id: 'home', label: 'Home' }
  }

  if (pathname.startsWith('/audio-artifacts')) {
    return { id: 'audio-artifacts', label: 'Audio Artifacts' }
  }

  if (pathname.startsWith('/juce-grid')) {
    return { id: 'juce-grid', label: 'JUCE Grid' }
  }

  if (
    pathname === '/midi'
    || pathname === '/midi-hub'
    || pathname === '/midi-hub-2'
    || pathname.startsWith('/midi-hub/')
  ) {
    return { id: 'midi-hub', label: 'MIDI Hub' }
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
      scope: currentScope ?? previousScope ?? { id: 'home', label: 'Home' },
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
            <>
              <div className="landing-route-transition__grid">
                {Array.from({ length: TRANSITION_BLOCK_COUNT }, (_, index) => (
                  <span
                    key={`${transition.key}-${transition.scope.id}-${index}`}
                    className="landing-route-transition__block"
                    style={{ '--landing-route-transition-index': index } as CSSProperties}
                  />
                ))}
              </div>
              <div className="landing-route-transition__copy">
                <span className="landing-route-transition__eyebrow">Route Shift</span>
                <strong className="landing-route-transition__label">{transition.scope.label}</strong>
              </div>
            </>
          ) : (
            <span className="landing-route-transition__fade-panel" />
          )}
        </div>
      ) : null}
    </div>
  )
}
