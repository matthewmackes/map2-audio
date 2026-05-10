import { useEffect, useState } from 'react'

import { useEffectsSettingsStore } from '../stores/effectsSettingsStore'

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useReducedEffectsPreference() {
  const reducedEffectsEnabled = useEffectsSettingsStore((state) => state.reducedEffectsEnabled)
  const pageTransitionPreset = useEffectsSettingsStore((state) => state.pageTransitionPreset)
  const setReducedEffectsEnabled = useEffectsSettingsStore((state) => state.setReducedEffectsEnabled)
  const setPageTransitionPreset = useEffectsSettingsStore((state) => state.setPageTransitionPreset)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    setPrefersReducedMotion(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  return {
    reducedEffectsEnabled,
    pageTransitionPreset,
    prefersReducedMotion,
    shouldReduceEffects: reducedEffectsEnabled || prefersReducedMotion,
    setReducedEffectsEnabled,
    setPageTransitionPreset,
    resolvedPageTransitionMode: reducedEffectsEnabled || prefersReducedMotion ? 'fade' : pageTransitionPreset,
  }
}

export function useUniversalStaggerEnabled(): boolean {
  const pageTransitionPreset = useEffectsSettingsStore((state) => state.pageTransitionPreset)
  const reducedEffectsEnabled = useEffectsSettingsStore((state) => state.reducedEffectsEnabled)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches)
    setPrefersReducedMotion(mediaQuery.matches)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  // Reduced motion users still get the (very brief) fade variant of the
  // staggered reveal — see UniversalStagger — but the universal sweep
  // is otherwise gated on the preset being selected.
  return pageTransitionPreset === 'staggered-reveal' && !reducedEffectsEnabled && !prefersReducedMotion
}
