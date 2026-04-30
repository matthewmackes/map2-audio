/**
 * Unit tests for the reduced-motion variant flattener (T2466-3).
 * Covers static variants, function variants, and the
 * reducedMotionTransition helper.
 */

import {
  INSTANT_TRANSITION,
  flattenVariantsForReducedMotion,
  reducedMotionTransition,
} from './useReducedMotionSafeVariants'

describe('flattenVariantsForReducedMotion', () => {
  it('replaces transitions on every static variant with duration 0', () => {
    const variants = {
      initial: { opacity: 0, transition: { duration: 0.5 } },
      animate: { opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
      exit: { opacity: 0 },
    }
    const flat = flattenVariantsForReducedMotion(variants)
    expect((flat.initial as Record<string, unknown>).transition).toEqual({ duration: 0 })
    expect((flat.animate as Record<string, unknown>).transition).toEqual({ duration: 0 })
    expect((flat.exit as Record<string, unknown>).transition).toEqual({ duration: 0 })
  })

  it('preserves the destination values', () => {
    const variants = {
      animate: { x: 0, opacity: 1, transition: { type: 'spring' as const } },
    }
    const flat = flattenVariantsForReducedMotion(variants)
    expect(flat.animate).toMatchObject({ x: 0, opacity: 1 })
  })

  it('leaves function variants resolvable but instant', () => {
    const variants = {
      animate: (custom: number) => ({
        opacity: custom,
        transition: { duration: 0.4 },
      }),
    }
    const flat = flattenVariantsForReducedMotion(variants)
    const resolved = (flat.animate as (c: number) => Record<string, unknown>)(0.7)
    expect(resolved).toMatchObject({ opacity: 0.7 })
    expect(resolved.transition).toEqual({ duration: 0 })
  })
})

describe('reducedMotionTransition', () => {
  it('returns the base transition when reduced motion is off', () => {
    const base = { duration: 0.4, ease: 'easeOut' as const }
    expect(reducedMotionTransition(base, false)).toBe(base)
  })

  it('returns instant transition when reduced motion is on', () => {
    const base = { duration: 0.4 }
    expect(reducedMotionTransition(base, true)).toEqual({ duration: 0 })
  })
})

describe('INSTANT_TRANSITION', () => {
  it('is a frozen-shape duration: 0 transition', () => {
    expect(INSTANT_TRANSITION).toEqual({ duration: 0 })
  })
})
