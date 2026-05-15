/**
 * T2473 cycle 37 — store hydration helper parity tests.
 */
import {
  hydrateSnapshotEditorStoreOnce,
  resetSnapshotEditorStoreHydration,
} from './hydrateSnapshotEditorStore'
import { useSnapshotEditorStore } from '../../stores/snapshotEditorStore'

// JSDOM provides localStorage; we still scrub it between tests so the
// hydration logic sees a deterministic fixture.
function clearStorage(): void {
  try {
    localStorage.clear()
  } catch {
    /* ignored */
  }
}

beforeEach(() => {
  resetSnapshotEditorStoreHydration()
  clearStorage()
})

describe('hydrateSnapshotEditorStoreOnce', () => {
  it('runs exactly once — second call is a no-op latch', () => {
    hydrateSnapshotEditorStoreOnce()
    const stateAfterFirst = useSnapshotEditorStore.getState().selectedCategory
    // Poison the store between calls; if hydration re-ran the
    // second time it would clobber this value back to 'all'.
    useSnapshotEditorStore.setState({ selectedCategory: 'sentinel' })
    hydrateSnapshotEditorStoreOnce()
    expect(useSnapshotEditorStore.getState().selectedCategory).toBe('sentinel')
    expect(stateAfterFirst).toBe('all')
  })

  it('falls back to selectedCategory="all" when localStorage is empty', () => {
    hydrateSnapshotEditorStoreOnce()
    expect(useSnapshotEditorStore.getState().selectedCategory).toBe('all')
  })

  it('reads selectedCategory from the current-key localStorage entry', () => {
    localStorage.setItem('map2_juce_grid_plugin_category', 'EQ')
    hydrateSnapshotEditorStoreOnce()
    expect(useSnapshotEditorStore.getState().selectedCategory).toBe('EQ')
  })

  it('falls back to the legacy-key when the current-key is missing', () => {
    localStorage.setItem('map2_grid_plugin_category', 'Drums')
    hydrateSnapshotEditorStoreOnce()
    expect(useSnapshotEditorStore.getState().selectedCategory).toBe('Drums')
  })

  it('parses the collapsed-categories Set from JSON', () => {
    localStorage.setItem(
      'map2_juce_grid_collapsed_categories',
      JSON.stringify(['EQ', 'Drums']),
    )
    hydrateSnapshotEditorStoreOnce()
    const collapsed = useSnapshotEditorStore.getState().collapsedCategories
    expect(collapsed.has('EQ')).toBe(true)
    expect(collapsed.has('Drums')).toBe(true)
    expect(collapsed.size).toBe(2)
  })

  it('falls back to an empty Set when the stored JSON is invalid', () => {
    localStorage.setItem('map2_juce_grid_collapsed_categories', '{not json')
    hydrateSnapshotEditorStoreOnce()
    expect(useSnapshotEditorStore.getState().collapsedCategories.size).toBe(0)
  })

  it('falls back to an empty Set when the stored JSON is not an array', () => {
    localStorage.setItem('map2_juce_grid_collapsed_categories', '{"a":1}')
    hydrateSnapshotEditorStoreOnce()
    expect(useSnapshotEditorStore.getState().collapsedCategories.size).toBe(0)
  })

  it('drops non-string entries when filtering the parsed array', () => {
    localStorage.setItem(
      'map2_juce_grid_collapsed_categories',
      JSON.stringify(['EQ', 42, null, 'Drums']),
    )
    hydrateSnapshotEditorStoreOnce()
    const collapsed = useSnapshotEditorStore.getState().collapsedCategories
    expect(collapsed.size).toBe(2)
    expect(collapsed.has('EQ')).toBe(true)
    expect(collapsed.has('Drums')).toBe(true)
  })
})
