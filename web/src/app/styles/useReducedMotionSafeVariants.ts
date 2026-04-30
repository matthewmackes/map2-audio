/**
 * useReducedMotionSafeVariants — T2466-3 reduced-motion compliance
 * for Framer Motion variants.
 *
 * Honors both the OS-level `prefers-reduced-motion` media query and
 * MAP2's in-app "Reduced effects" toggle (`useReducedEffectsPreference`).
 * When either is on, animated variants are flattened so transitions
 * apply instantly (`duration: 0`) but the destination state is still
 * reached — the UI still updates, it just doesn't tween.
 *
 * Usage:
 *   const drawerVariantsSafe = useReducedMotionSafeVariants(drawerVariants)
 *   <motion.aside variants={drawerVariantsSafe} ... />
 */

import { useMemo } from 'react'
import type { Transition, Variant, Variants } from 'framer-motion'

import { useReducedEffectsPreference } from '../hooks/useReducedEffectsPreference'

/** Shared instant-transition constant. Exported so consumers
 * can use it directly when wiring per-motion gates. */
export const INSTANT_TRANSITION: Transition = { duration: 0 }

function flattenVariant(variant: Variant): Variant {
  if (typeof variant === 'function') {
    // Variants can be value-resolver functions; wrap them to enforce instant
    // transitions on the resolved value.
    return ((custom: unknown) => {
      const resolved = (variant as (custom: unknown) => Variant)(custom)
      return flattenVariant(resolved)
    }) as unknown as Variant
  }

  if (variant && typeof variant === 'object') {
    return { ...variant, transition: INSTANT_TRANSITION }
  }

  return variant
}

export function flattenVariantsForReducedMotion(variants: Variants): Variants {
  const next: Variants = {}
  for (const key of Object.keys(variants)) {
    next[key] = flattenVariant(variants[key])
  }
  return next
}

export function useReducedMotionSafeVariants(variants: Variants): Variants {
  const { shouldReduceEffects } = useReducedEffectsPreference()
  return useMemo(
    () => (shouldReduceEffects ? flattenVariantsForReducedMotion(variants) : variants),
    [shouldReduceEffects, variants],
  )
}

/**
 * Helper for Framer Motion `transition` props that should still
 * fire (e.g. `layout` magic-move) but should be instant when the
 * user prefers reduced motion. Pair with a useReducedEffectsPreference
 * read at the call site.
 */
export function reducedMotionTransition(
  baseTransition: Transition,
  shouldReduceEffects: boolean,
): Transition {
  return shouldReduceEffects ? INSTANT_TRANSITION : baseTransition
}

/**
 * One-call hook for Framer Motion `transition` props. Returns the
 * caller's base transition, or {duration: 0} when reduced motion
 * is preferred. Equivalent to:
 *
 *   const { shouldReduceEffects } = useReducedEffectsPreference()
 *   const transition = shouldReduceEffects ? { duration: 0 } : baseTransition
 *
 * but condenses the two reads and the ternary into one expression.
 */
export function useReducedMotionSafeTransition(
  baseTransition: Transition,
): Transition {
  const { shouldReduceEffects } = useReducedEffectsPreference()
  return useMemo(
    () => (shouldReduceEffects ? INSTANT_TRANSITION : baseTransition),
    [shouldReduceEffects, baseTransition],
  )
}
