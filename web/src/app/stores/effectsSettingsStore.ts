import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const REDUCED_EFFECTS_STORAGE_KEY = 'map2_reduce_effects_mode'
export const DEFAULT_PAGE_TRANSITION_PRESET: PageTransitionPreset = 'staggered-reveal'
export const DEFAULT_STAGGER_SPEED: StaggerSpeed = 'slow'

export type PageTransitionPreset = 'staggered-reveal' | 'pager-slide'
export type StaggerSpeed = 'slower' | 'slow' | 'normal' | 'faster'

const LEGACY_PAGE_TRANSITION_PRESET_REPLACEMENTS: Record<string, PageTransitionPreset> = {
  // 2026-05-09 — Hyperactive Block Reveal removed in favor of the slower,
  // universal Framer Motion staggered reveal. Existing persisted picks are
  // silently migrated so users do not get bumped back to a generic default.
  'hyperactive-block': 'staggered-reveal',
}

const STAGGER_SPEED_VALUES: ReadonlySet<StaggerSpeed> = new Set(['slower', 'slow', 'normal', 'faster'])

export interface StaggerTimings {
  perItemMs: number
  staggerStepMs: number
  totalBudgetMs: number
}

const STAGGER_SPEED_TIMINGS: Record<StaggerSpeed, StaggerTimings> = {
  slower: { perItemMs: 500, staggerStepMs: 80, totalBudgetMs: 1400 },
  slow: { perItemMs: 350, staggerStepMs: 50, totalBudgetMs: 900 },
  normal: { perItemMs: 240, staggerStepMs: 30, totalBudgetMs: 600 },
  faster: { perItemMs: 160, staggerStepMs: 18, totalBudgetMs: 400 },
}

export function getStaggerTimings(speed: StaggerSpeed): StaggerTimings {
  return STAGGER_SPEED_TIMINGS[speed]
}

export interface EffectsSettingsState {
  reducedEffectsEnabled: boolean
  pageTransitionPreset: PageTransitionPreset
  staggerSpeed: StaggerSpeed
  setReducedEffectsEnabled: (enabled: boolean) => void
  setPageTransitionPreset: (preset: PageTransitionPreset) => void
  setStaggerSpeed: (speed: StaggerSpeed) => void
}

export function isPageTransitionPreset(value: unknown): value is PageTransitionPreset {
  return value === 'staggered-reveal' || value === 'pager-slide'
}

export function isStaggerSpeed(value: unknown): value is StaggerSpeed {
  return typeof value === 'string' && STAGGER_SPEED_VALUES.has(value as StaggerSpeed)
}

function coercePageTransitionPreset(value: unknown): PageTransitionPreset {
  if (isPageTransitionPreset(value)) {
    return value
  }
  if (typeof value === 'string' && value in LEGACY_PAGE_TRANSITION_PRESET_REPLACEMENTS) {
    return LEGACY_PAGE_TRANSITION_PRESET_REPLACEMENTS[value]
  }
  return DEFAULT_PAGE_TRANSITION_PRESET
}

function coerceStaggerSpeed(value: unknown): StaggerSpeed {
  return isStaggerSpeed(value) ? value : DEFAULT_STAGGER_SPEED
}

function normalizePersistedEffectsSettingsState(
  state:
    | Partial<Pick<EffectsSettingsState, 'reducedEffectsEnabled' | 'pageTransitionPreset' | 'staggerSpeed'>>
    | undefined,
) {
  return {
    reducedEffectsEnabled: state?.reducedEffectsEnabled === true,
    pageTransitionPreset: coercePageTransitionPreset(state?.pageTransitionPreset),
    staggerSpeed: coerceStaggerSpeed(state?.staggerSpeed),
  }
}

export const useEffectsSettingsStore = create<EffectsSettingsState>()(
  persist(
    (set) => ({
      reducedEffectsEnabled: false,
      pageTransitionPreset: DEFAULT_PAGE_TRANSITION_PRESET,
      staggerSpeed: DEFAULT_STAGGER_SPEED,
      setReducedEffectsEnabled: (enabled) => set({ reducedEffectsEnabled: enabled }),
      setPageTransitionPreset: (preset) => set({ pageTransitionPreset: preset }),
      setStaggerSpeed: (speed) => set({ staggerSpeed: speed }),
    }),
    {
      name: REDUCED_EFFECTS_STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        reducedEffectsEnabled: state.reducedEffectsEnabled,
        pageTransitionPreset: state.pageTransitionPreset,
        staggerSpeed: state.staggerSpeed,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedEffectsSettingsState(
          persistedState as
            | Partial<Pick<EffectsSettingsState, 'reducedEffectsEnabled' | 'pageTransitionPreset' | 'staggerSpeed'>>
            | undefined,
        ),
      }),
    },
  ),
)
