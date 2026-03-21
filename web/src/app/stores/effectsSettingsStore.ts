import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const REDUCED_EFFECTS_STORAGE_KEY = 'map2_reduce_effects_mode'

interface EffectsSettingsState {
  reducedEffectsEnabled: boolean
  setReducedEffectsEnabled: (enabled: boolean) => void
}

export const useEffectsSettingsStore = create<EffectsSettingsState>()(
  persist(
    (set) => ({
      reducedEffectsEnabled: false,
      setReducedEffectsEnabled: (enabled) => set({ reducedEffectsEnabled: enabled }),
    }),
    {
      name: REDUCED_EFFECTS_STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        reducedEffectsEnabled: state.reducedEffectsEnabled,
      }),
    },
  ),
)
