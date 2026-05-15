/**
 * T2473 cycle 37 — one-shot SnapshotEditor store hydration helper.
 *
 * Extracted from `SnapshotEditorPageContent.tsx` so the page
 * monolith stays focused on rendering + React-tree concerns. The
 * hydrator runs at module-import time before any React render
 * fires, reading the per-operator persistence keys out of
 * `localStorage` and seeding the global zustand store.
 *
 * The hydration call is wired in `SnapshotEditorPageContent.tsx`
 * via the module-top `if (typeof window !== 'undefined')` guard;
 * this module exposes the helper but does not auto-invoke (so
 * tests can call it explicitly without setting up `window`).
 *
 * Behavior preserved verbatim:
 *   • One-shot via the module-local `_hydrated` flag (Strict Mode
 *     double-invocation cannot re-trigger it).
 *   • Two-key reads (current + legacy) wrapped in a single safe
 *     accessor so a poisoned `localStorage` entry can't crash the
 *     editor on mount.
 *   • Selected category falls back to 'all' on read failure.
 *   • Collapsed categories falls back to an empty Set on parse
 *     failure (preserving the inline `try` / `catch` posture).
 */

import { useSnapshotEditorStore } from '../../stores/snapshotEditorStore'
import { createEmptyFootswitchLabelDrafts } from '../../utils/snapshotFootswitchLabels'
import { buildSnapshotIoModalState } from '../../utils/snapshotIoBindings'
import {
  loadInitialJuceGridState,
  // NB: `loadInitialJuceGridPluginPersistence` lives in
  // `./useJuceGridPersistedState` (sibling), and
  // `DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS` lives in
  // `./snapshotEditorPageTypes` (sibling). See the explicit imports
  // below.
} from './snapshotEditorBootstrap'
import { loadInitialJuceGridPluginPersistence } from './useJuceGridPersistedState'
import { DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS } from './snapshotEditorPageTypes'

let _hydrated = false

/**
 * Idempotent hydrator. After the first call the function is a
 * no-op; subsequent calls (e.g. in tests) get the early-return.
 *
 * Exposed for direct test use via `resetSnapshotEditorStoreHydration`
 * which clears the latch so the next call re-runs.
 */
export function hydrateSnapshotEditorStoreOnce(): void {
  if (_hydrated) return
  _hydrated = true

  const initialPersistedState = loadInitialJuceGridState()
  const initialPluginPersistence = loadInitialJuceGridPluginPersistence()

  const readSnapshotStorage = (currentKey: string, legacyKey: string): string | null => {
    try {
      return localStorage.getItem(currentKey) ?? localStorage.getItem(legacyKey)
    } catch {
      return null
    }
  }

  const selectedCategory =
    readSnapshotStorage('map2_juce_grid_plugin_category', 'map2_grid_plugin_category') || 'all'

  let collapsedCategories: Set<string> = new Set<string>()
  const collapsedRaw = readSnapshotStorage(
    'map2_juce_grid_collapsed_categories',
    'map2_grid_collapsed_categories',
  )
  if (collapsedRaw) {
    try {
      const parsed: unknown = JSON.parse(collapsedRaw)
      if (Array.isArray(parsed)) {
        collapsedCategories = new Set<string>(
          parsed.filter((entry): entry is string => typeof entry === 'string'),
        )
      }
    } catch {
      /* unparseable storage value — fall back to empty set */
    }
  }

  useSnapshotEditorStore.setState({
    flowSlots: initialPersistedState.flowSlots,
    routing: initialPersistedState.routing,
    activeFlowIndex: initialPersistedState.activeFlowIndex,
    selectedPluginUri: initialPluginPersistence.selectedPluginUri,
    selectedPluginPosition: initialPluginPersistence.selectedPluginPosition,
    effectModalOpen: initialPluginPersistence.effectModalOpen,
    selectedCategory,
    collapsedCategories,
    footswitchLabelDrafts: createEmptyFootswitchLabelDrafts(),
    snapshotIoModalState: buildSnapshotIoModalState(null, null),
    noiseGateThresholdDraft: DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS.thresholdDb,
    noiseGateReleaseDraft: DEFAULT_SYSTEM_NOISE_GATE_DEFAULTS.releaseMs,
  })
}

/**
 * Reset the one-shot latch. Used by tests that need to re-hydrate
 * the store with a fresh `localStorage` fixture. Not part of the
 * production runtime contract.
 */
export function resetSnapshotEditorStoreHydration(): void {
  _hydrated = false
}
