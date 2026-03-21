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
  const setReducedEffectsEnabled = useEffectsSettingsStore((state) => state.setReducedEffectsEnabled)
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
    prefersReducedMotion,
    shouldReduceEffects: reducedEffectsEnabled || prefersReducedMotion,
    setReducedEffectsEnabled,
  }
}
