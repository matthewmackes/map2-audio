import '@testing-library/jest-dom'
import { act } from '@testing-library/react'

import {
  DEFAULT_PAGE_TRANSITION_PRESET,
  REDUCED_EFFECTS_STORAGE_KEY,
  useEffectsSettingsStore,
} from './effectsSettingsStore'

type PersistApi = {
  persist: {
    rehydrate: () => Promise<void>
  }
}

describe('effectsSettingsStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useEffectsSettingsStore.setState({
      reducedEffectsEnabled: false,
      pageTransitionPreset: DEFAULT_PAGE_TRANSITION_PRESET,
    })
  })

  it('normalizes an invalid persisted page transition preset back to the safe default', async () => {
    window.localStorage.setItem(
      REDUCED_EFFECTS_STORAGE_KEY,
      JSON.stringify({
        state: {
          reducedEffectsEnabled: false,
          pageTransitionPreset: 'unknown-transition',
        },
        version: 0,
      }),
    )

    await act(async () => {
      await (useEffectsSettingsStore as typeof useEffectsSettingsStore & PersistApi).persist.rehydrate()
    })

    expect(useEffectsSettingsStore.getState().pageTransitionPreset).toBe(DEFAULT_PAGE_TRANSITION_PRESET)
  })
})
