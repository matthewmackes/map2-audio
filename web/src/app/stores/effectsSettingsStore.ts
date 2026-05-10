import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const REDUCED_EFFECTS_STORAGE_KEY = 'map2_reduce_effects_mode'
export const DEFAULT_PAGE_TRANSITION_PRESET: PageTransitionPreset = 'staggered-reveal'

export type PageTransitionPreset = 'staggered-reveal' | 'pager-slide'

const LEGACY_PAGE_TRANSITION_PRESET_REPLACEMENTS: Record<string, PageTransitionPreset> = {
  // 2026-05-09 — Hyperactive Block Reveal removed in favor of the slower,
  // universal Framer Motion staggered reveal. Existing persisted picks are
  // silently migrated so users do not get bumped back to a generic default.
  'hyperactive-block': 'staggered-reveal',
}

export interface EffectsSettingsState {
  reducedEffectsEnabled: boolean
  pageTransitionPreset: PageTransitionPreset
  setReducedEffectsEnabled: (enabled: boolean) => void
  setPageTransitionPreset: (preset: PageTransitionPreset) => void
}

export function isPageTransitionPreset(value: unknown): value is PageTransitionPreset {
  return value === 'staggered-reveal' || value === 'pager-slide'
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

function normalizePersistedEffectsSettingsState(
  state: Partial<Pick<EffectsSettingsState, 'reducedEffectsEnabled' | 'pageTransitionPreset'>> | undefined,
) {
  return {
    reducedEffectsEnabled: state?.reducedEffectsEnabled === true,
    pageTransitionPreset: coercePageTransitionPreset(state?.pageTransitionPreset),
  }
}

export const useEffectsSettingsStore = create<EffectsSettingsState>()(
  persist(
    (set) => ({
      reducedEffectsEnabled: false,
      pageTransitionPreset: DEFAULT_PAGE_TRANSITION_PRESET,
      setReducedEffectsEnabled: (enabled) => set({ reducedEffectsEnabled: enabled }),
      setPageTransitionPreset: (preset) => set({ pageTransitionPreset: preset }),
    }),
    {
      name: REDUCED_EFFECTS_STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        reducedEffectsEnabled: state.reducedEffectsEnabled,
        pageTransitionPreset: state.pageTransitionPreset,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedEffectsSettingsState(
          persistedState as Partial<Pick<EffectsSettingsState, 'reducedEffectsEnabled' | 'pageTransitionPreset'>> | undefined,
        ),
      }),
    },
  ),
)
