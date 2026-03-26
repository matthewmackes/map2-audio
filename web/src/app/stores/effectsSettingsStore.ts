import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const REDUCED_EFFECTS_STORAGE_KEY = 'map2_reduce_effects_mode'
export const DEFAULT_PAGE_TRANSITION_PRESET = 'hyperactive-block'

export type PageTransitionPreset = 'hyperactive-block' | 'pager-slide'

export interface EffectsSettingsState {
  reducedEffectsEnabled: boolean
  pageTransitionPreset: PageTransitionPreset
  setReducedEffectsEnabled: (enabled: boolean) => void
  setPageTransitionPreset: (preset: PageTransitionPreset) => void
}

function isPageTransitionPreset(value: unknown): value is PageTransitionPreset {
  return value === 'hyperactive-block' || value === 'pager-slide'
}

function normalizePersistedEffectsSettingsState(
  state: Partial<Pick<EffectsSettingsState, 'reducedEffectsEnabled' | 'pageTransitionPreset'>> | undefined,
) {
  return {
    reducedEffectsEnabled: state?.reducedEffectsEnabled === true,
    pageTransitionPreset: isPageTransitionPreset(state?.pageTransitionPreset)
      ? state.pageTransitionPreset
      : DEFAULT_PAGE_TRANSITION_PRESET,
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
