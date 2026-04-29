import { renderHook } from '@testing-library/react'
import {
  loadInitialJuceGridPluginPersistence,
  useJuceGridPersistedState,
} from './useJuceGridPersistedState'
import {
  JUCE_GRID_EFFECT_MODAL_OPEN_KEY,
  JUCE_GRID_SCROLL_TOP_KEY,
  JUCE_GRID_SELECTED_PLUGIN_KEY,
} from './snapshotEditorPageTypes'

describe('loadInitialJuceGridPluginPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns defaults when nothing is stored', () => {
    const result = loadInitialJuceGridPluginPersistence()
    expect(result).toEqual({
      selectedPluginUri: null,
      selectedPluginPosition: null,
      effectModalOpen: false,
      scrollTop: 0,
    })
  })

  it('parses the structured selected-plugin payload', () => {
    localStorage.setItem(
      JUCE_GRID_SELECTED_PLUGIN_KEY,
      JSON.stringify({ uri: 'urn:test:plugin', position: 3 }),
    )
    const result = loadInitialJuceGridPluginPersistence()
    expect(result.selectedPluginUri).toBe('urn:test:plugin')
    expect(result.selectedPluginPosition).toBe(3)
  })

  it('falls back to the raw string for legacy URI-only payloads', () => {
    localStorage.setItem(JUCE_GRID_SELECTED_PLUGIN_KEY, 'legacy-uri-string')
    const result = loadInitialJuceGridPluginPersistence()
    expect(result.selectedPluginUri).toBe('legacy-uri-string')
    expect(result.selectedPluginPosition).toBeNull()
  })

  it('reads effect-modal-open as a boolean', () => {
    localStorage.setItem(JUCE_GRID_EFFECT_MODAL_OPEN_KEY, 'true')
    expect(loadInitialJuceGridPluginPersistence().effectModalOpen).toBe(true)
    localStorage.setItem(JUCE_GRID_EFFECT_MODAL_OPEN_KEY, 'false')
    expect(loadInitialJuceGridPluginPersistence().effectModalOpen).toBe(false)
  })

  it('reads scrollTop as a clamped non-negative number', () => {
    localStorage.setItem(JUCE_GRID_SCROLL_TOP_KEY, '342.5')
    expect(loadInitialJuceGridPluginPersistence().scrollTop).toBeCloseTo(342.5)
    localStorage.setItem(JUCE_GRID_SCROLL_TOP_KEY, '-10')
    expect(loadInitialJuceGridPluginPersistence().scrollTop).toBe(0)
    localStorage.setItem(JUCE_GRID_SCROLL_TOP_KEY, 'not-a-number')
    expect(loadInitialJuceGridPluginPersistence().scrollTop).toBe(0)
  })
})

describe('useJuceGridPersistedState write-back', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('writes the selected-plugin payload when a uri is set', () => {
    renderHook(() =>
      useJuceGridPersistedState({
        selectedPluginUri: 'urn:test:foo',
        selectedPluginPosition: 7,
        effectModalOpen: false,
      }),
    )
    const stored = localStorage.getItem(JUCE_GRID_SELECTED_PLUGIN_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored ?? '{}')).toEqual({ uri: 'urn:test:foo', position: 7 })
  })

  it('removes the selected-plugin entry when the uri is cleared', () => {
    localStorage.setItem(JUCE_GRID_SELECTED_PLUGIN_KEY, JSON.stringify({ uri: 'old', position: 0 }))
    renderHook(() =>
      useJuceGridPersistedState({
        selectedPluginUri: null,
        selectedPluginPosition: null,
        effectModalOpen: false,
      }),
    )
    expect(localStorage.getItem(JUCE_GRID_SELECTED_PLUGIN_KEY)).toBeNull()
  })

  it('writes the effect-modal-open flag as the literal "true" / "false" string', () => {
    const { rerender } = renderHook(
      ({ effectModalOpen }) =>
        useJuceGridPersistedState({
          selectedPluginUri: null,
          selectedPluginPosition: null,
          effectModalOpen,
        }),
      { initialProps: { effectModalOpen: false } },
    )
    expect(localStorage.getItem(JUCE_GRID_EFFECT_MODAL_OPEN_KEY)).toBe('false')
    rerender({ effectModalOpen: true })
    expect(localStorage.getItem(JUCE_GRID_EFFECT_MODAL_OPEN_KEY)).toBe('true')
  })
})
