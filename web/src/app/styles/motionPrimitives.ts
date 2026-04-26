/**
 * T2444 motionPrimitives.ts — shared Framer Motion primitives for cross-workspace polish.
 *
 * Mirror of the durations/eases declared in design-language.css. Use these from TS so
 * both CSS-driven transitions and Framer-Motion-driven choreography stay coherent.
 *
 * Aesthetic: appliance-grade console — restrained, deliberate, snappy. No decorative
 * springs on UI surfaces a guitarist will look at mid-set; springs are reserved for
 * tab-indicator magic-move and drawer enter/exit.
 */

import type { Transition, Variants } from 'framer-motion'

/* ---------------- Durations ---------------- */
export const MAP2_DUR = {
  instant: 0.08,
  fast: 0.14,
  base: 0.22,
  slow: 0.38,
  cinematic: 0.56,
} as const

/* ---------------- Eases (cubic-bezier control points, matching CSS vars) ---------------- */
export const MAP2_EASE = {
  outSnap: [0.16, 1, 0.3, 1] as const,
  inOutRack: [0.65, 0, 0.35, 1] as const,
  inDecel: [0.22, 1, 0.36, 1] as const,
  springSoft: [0.34, 1.36, 0.64, 1] as const,
} as const

/* ---------------- Springs (for layoutId magic-move + drawer slides) ---------------- */
export const MAP2_SPRING = {
  /** Soft spring for tab indicator magic-move; settles in ~280ms with a faint overshoot. */
  tabIndicator: {
    type: 'spring',
    stiffness: 420,
    damping: 36,
    mass: 0.7,
  } satisfies Transition,
  /** Drawer enter/exit — snappy but deliberate, no bounce. */
  drawer: {
    type: 'spring',
    stiffness: 320,
    damping: 32,
    mass: 0.85,
  } satisfies Transition,
  /** Active-slot scale tap — minimal, just enough physical feedback. */
  slotTap: {
    type: 'spring',
    stiffness: 600,
    damping: 24,
    mass: 0.4,
  } satisfies Transition,
} as const

/* ---------------- Variants ---------------- */

/** Tab content cross-fade. Use with AnimatePresence + mode="wait". */
export const tabContentVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: MAP2_DUR.base, ease: MAP2_EASE.outSnap },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: MAP2_DUR.fast, ease: MAP2_EASE.outSnap },
  },
}

/** Drawer slide-in from right. Used by health drawers across workspaces. */
export const drawerVariants: Variants = {
  initial: { x: '100%', opacity: 0.6 },
  animate: {
    x: 0,
    opacity: 1,
    transition: MAP2_SPRING.drawer,
  },
  exit: {
    x: '100%',
    opacity: 0,
    transition: { duration: MAP2_DUR.base, ease: MAP2_EASE.inOutRack },
  },
}

/** Scrim fade for drawers + modals. */
export const scrimVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: MAP2_DUR.base, ease: MAP2_EASE.outSnap } },
  exit: { opacity: 0, transition: { duration: MAP2_DUR.fast, ease: MAP2_EASE.outSnap } },
}

/** Action-slot active glow swap (used when a button toggles into "armed" state). */
export const slotPressVariants: Variants = {
  rest: { scale: 1 },
  pressed: { scale: 0.97, transition: MAP2_SPRING.slotTap },
}

/** Kicker hero entrance — used at the top of pages with the aurora hero treatment. */
export const heroEnterVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MAP2_DUR.cinematic,
      ease: MAP2_EASE.inDecel,
      staggerChildren: 0.06,
    },
  },
}

export const heroChildVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: MAP2_DUR.slow, ease: MAP2_EASE.inDecel },
  },
}
