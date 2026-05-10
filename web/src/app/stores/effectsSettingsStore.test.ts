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

  it('migrates the legacy hyperactive-block preset to staggered-reveal on rehydrate', async () => {
    window.localStorage.setItem(
      REDUCED_EFFECTS_STORAGE_KEY,
      JSON.stringify({
        state: {
          reducedEffectsEnabled: false,
          pageTransitionPreset: 'hyperactive-block',
        },
        version: 0,
      }),
    )

    await act(async () => {
      await (useEffectsSettingsStore as typeof useEffectsSettingsStore & PersistApi).persist.rehydrate()
    })

    expect(useEffectsSettingsStore.getState().pageTransitionPreset).toBe('staggered-reveal')
  })

  it('uses staggered-reveal as the default preset for fresh installs', () => {
    expect(DEFAULT_PAGE_TRANSITION_PRESET).toBe('staggered-reveal')
  })

  it('preserves the migrated value across a subsequent rehydrate', async () => {
    // Persisted state remains 'hyperactive-block' from a prior session;
    // every rehydrate must coerce to the new preset.
    window.localStorage.setItem(
      REDUCED_EFFECTS_STORAGE_KEY,
      JSON.stringify({
        state: { reducedEffectsEnabled: false, pageTransitionPreset: 'hyperactive-block' },
        version: 0,
      }),
    )

    await act(async () => {
      await (useEffectsSettingsStore as typeof useEffectsSettingsStore & PersistApi).persist.rehydrate()
    })
    expect(useEffectsSettingsStore.getState().pageTransitionPreset).toBe('staggered-reveal')

    // Second rehydrate after another setItem of the legacy value should
    // still land on staggered-reveal.
    window.localStorage.setItem(
      REDUCED_EFFECTS_STORAGE_KEY,
      JSON.stringify({
        state: { reducedEffectsEnabled: false, pageTransitionPreset: 'hyperactive-block' },
        version: 0,
      }),
    )

    await act(async () => {
      await (useEffectsSettingsStore as typeof useEffectsSettingsStore & PersistApi).persist.rehydrate()
    })
    expect(useEffectsSettingsStore.getState().pageTransitionPreset).toBe('staggered-reveal')
  })
})
