// JUCE-grid persisted-state hook (T2471). Owns the localStorage
// load + write-back ceremony for the three JUCE_GRID_* keys
// (selected plugin uri+position, effect modal open flag, scroll
// top). The state itself is held in the SnapshotEditor Zustand
// store; this hook just bridges that store to localStorage.

import { useEffect } from 'react'
import {
  JUCE_GRID_EFFECT_MODAL_OPEN_KEY,
  JUCE_GRID_SCROLL_TOP_KEY,
  JUCE_GRID_SELECTED_PLUGIN_KEY,
} from './snapshotEditorPageTypes'

export interface JuceGridPluginPersistence {
  selectedPluginUri: string | null
  selectedPluginPosition: number | null
  effectModalOpen: boolean
  scrollTop: number
}

const EMPTY_PERSISTENCE: JuceGridPluginPersistence = {
  selectedPluginUri: null,
  selectedPluginPosition: null,
  effectModalOpen: false,
  scrollTop: 0,
}

// Reads the three JUCE_GRID_* localStorage keys at call time and
// returns a normalized snapshot. Robust to JSON corruption (legacy
// string-only payloads) and missing entries.
export function loadInitialJuceGridPluginPersistence(): JuceGridPluginPersistence {
  try {
    const rawSelectedPlugin = localStorage.getItem(JUCE_GRID_SELECTED_PLUGIN_KEY)
    let selectedPluginUri: string | null = null
    let selectedPluginPosition: number | null = null

    if (rawSelectedPlugin) {
      try {
        const parsed = JSON.parse(rawSelectedPlugin)
        if (typeof parsed === 'string') {
          selectedPluginUri = parsed || null
        } else if (parsed && typeof parsed === 'object') {
          const uri = typeof parsed.uri === 'string' ? parsed.uri.trim() : ''
          if (uri) {
            selectedPluginUri = uri
          }
          const parsedPosition = Number.parseInt(String(parsed.position ?? ''), 10)
          if (Number.isFinite(parsedPosition) && parsedPosition >= 0) {
            selectedPluginPosition = parsedPosition
          }
        }
      } catch {
        selectedPluginUri = rawSelectedPlugin || null
      }
    }

    const effectModalOpen =
      localStorage.getItem(JUCE_GRID_EFFECT_MODAL_OPEN_KEY) === 'true'
    const rawScrollTop = Number.parseFloat(
      localStorage.getItem(JUCE_GRID_SCROLL_TOP_KEY) ?? '0',
    )
    return {
      selectedPluginUri,
      selectedPluginPosition,
      effectModalOpen,
      scrollTop: Number.isFinite(rawScrollTop) ? Math.max(0, rawScrollTop) : 0,
    }
  } catch {
    return { ...EMPTY_PERSISTENCE }
  }
}

interface UseJuceGridPersistedStateArgs {
  selectedPluginUri: string | null
  selectedPluginPosition: number | null
  effectModalOpen: boolean
}

// Write-back effects mirroring the inline useEffect blocks the
// monolith carried for the three JUCE_GRID_* keys (excluding
// scroll-top, which is handled by useRouteScrollRestoration with
// its own storageKey arg).
export function useJuceGridPersistedState({
  selectedPluginUri,
  selectedPluginPosition,
  effectModalOpen,
}: UseJuceGridPersistedStateArgs): void {
  useEffect(() => {
    try {
      if (selectedPluginUri) {
        localStorage.setItem(
          JUCE_GRID_SELECTED_PLUGIN_KEY,
          JSON.stringify({
            uri: selectedPluginUri,
            position: selectedPluginPosition,
          }),
        )
      } else {
        localStorage.removeItem(JUCE_GRID_SELECTED_PLUGIN_KEY)
      }
    } catch {
      /* ignore quota / JSON errors */
    }
  }, [selectedPluginPosition, selectedPluginUri])

  useEffect(() => {
    try {
      localStorage.setItem(
        JUCE_GRID_EFFECT_MODAL_OPEN_KEY,
        effectModalOpen ? 'true' : 'false',
      )
    } catch {
      /* ignore */
    }
  }, [effectModalOpen])
}
