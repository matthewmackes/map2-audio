import '@testing-library/jest-dom'
import { act } from 'react'

import {
  SNAPSHOT_EDITOR_ACTIVE_STORAGE_KEY,
  SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_STORAGE_KEY,
  SNAPSHOT_EDITOR_FLOWS_STORAGE_KEY,
  SNAPSHOT_EDITOR_PLUGIN_CATEGORY_STORAGE_KEY,
  SNAPSHOT_EDITOR_ROUTING_STORAGE_KEY,
  readPersistedCollapsedCategories,
  readPersistedFlows,
  readPersistedSelectedCategory,
  useSnapshotEditorStore,
} from './snapshotEditorStore'

const PALETTE = [
  { label: 'Flow A', color: '#00d9ff' },
  { label: 'Flow B', color: '#ff006e' },
  { label: 'Flow C', color: '#ffd000' },
  { label: 'Flow D', color: '#00ff6e' },
]

const NORMALIZATION_OPTIONS = {
  palette: PALETTE,
  defaultCount: 4,
  maxFlows: 8,
}

function resetStoreToDefaults() {
  act(() => {
    useSnapshotEditorStore.setState({
      flowSlots: [],
      routing: {
        mode: 'parallel_blend',
        activeSlotId: null,
        blendPositions: {},
        morphProgress: 0,
        morphSourceSlotId: null,
        morphTargetSlotId: null,
        seriesOrder: [],
      },
      activeFlowIndex: 0,
      selectedCategory: 'all',
      collapsedCategories: new Set<string>(),
    })
  })
}

describe('snapshotEditorStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetStoreToDefaults()
  })

  it('initializes with documented defaults', () => {
    const state = useSnapshotEditorStore.getState()

    expect(state.selectedCategory).toBe('all')
    expect(state.collapsedCategories.size).toBe(0)
    expect(state.activeFlowIndex).toBe(0)
    expect(state.routing.mode).toBe('parallel_blend')
    expect(state.midiScope).toBe('all')
    expect(state.compactTab).toBe('grid')
    expect(state.abSwitchMidiNumberDraft).toBe(80)
    expect(state.noiseGateThresholdDraft).toBe(-40)
    expect(state.noiseGateReleaseDraft).toBe(100)
  })

  it('setSelectedPluginSelection clears position when uri is null', () => {
    const { setSelectedPluginSelection } = useSnapshotEditorStore.getState()

    act(() => setSelectedPluginSelection('urn:plugin:x', 3))
    expect(useSnapshotEditorStore.getState().selectedPluginUri).toBe('urn:plugin:x')
    expect(useSnapshotEditorStore.getState().selectedPluginPosition).toBe(3)

    act(() => setSelectedPluginSelection(null, 5))
    expect(useSnapshotEditorStore.getState().selectedPluginUri).toBeNull()
    expect(useSnapshotEditorStore.getState().selectedPluginPosition).toBeNull()
  })

  it('setSelectedPluginSelection coerces non-finite positions to null', () => {
    const { setSelectedPluginSelection } = useSnapshotEditorStore.getState()

    act(() => setSelectedPluginSelection('urn:plugin:y', Number.NaN))
    expect(useSnapshotEditorStore.getState().selectedPluginPosition).toBeNull()

    act(() => setSelectedPluginSelection('urn:plugin:y'))
    expect(useSnapshotEditorStore.getState().selectedPluginPosition).toBeNull()
  })

  it('persistFlowSlots writes current flowSlots to localStorage under canonical key', () => {
    act(() => {
      useSnapshotEditorStore.setState({
        flowSlots: [{ id: 'slot-0', chainId: 12, label: 'A', color: '#00d9ff', muted: false, solo: false, dryWetMix: 100 }],
      })
      useSnapshotEditorStore.getState().persistFlowSlots()
    })

    const raw = window.localStorage.getItem(SNAPSHOT_EDITOR_FLOWS_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as Array<{ id: string; chainId: number }>
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ id: 'slot-0', chainId: 12 })
  })

  it('persistRouting and persistActiveFlowIndex write through to localStorage', () => {
    act(() => {
      useSnapshotEditorStore.setState({
        routing: {
          mode: 'series',
          activeSlotId: 'slot-1',
          blendPositions: {},
          morphProgress: 0,
          morphSourceSlotId: null,
          morphTargetSlotId: null,
          seriesOrder: ['slot-0', 'slot-1'],
        },
        activeFlowIndex: 2,
      })
      useSnapshotEditorStore.getState().persistRouting()
      useSnapshotEditorStore.getState().persistActiveFlowIndex()
    })

    expect(JSON.parse(window.localStorage.getItem(SNAPSHOT_EDITOR_ROUTING_STORAGE_KEY) ?? 'null')).toMatchObject({
      mode: 'series',
      seriesOrder: ['slot-0', 'slot-1'],
    })
    expect(window.localStorage.getItem(SNAPSHOT_EDITOR_ACTIVE_STORAGE_KEY)).toBe('2')
  })

  it('persistSelectedCategory and persistCollapsedCategories round-trip', () => {
    act(() => {
      useSnapshotEditorStore.setState({
        selectedCategory: 'Modulation',
        collapsedCategories: new Set(['Reverb', 'Delay']),
      })
      useSnapshotEditorStore.getState().persistSelectedCategory()
      useSnapshotEditorStore.getState().persistCollapsedCategories()
    })

    expect(window.localStorage.getItem(SNAPSHOT_EDITOR_PLUGIN_CATEGORY_STORAGE_KEY)).toBe('Modulation')
    const collapsed = JSON.parse(window.localStorage.getItem(SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_STORAGE_KEY) ?? '[]')
    expect(new Set(collapsed)).toEqual(new Set(['Reverb', 'Delay']))
  })

  it('hydrateBucketAFromLocalStorage rehydrates flow slots, routing, active index, category, collapsed set', () => {
    window.localStorage.setItem(
      SNAPSHOT_EDITOR_FLOWS_STORAGE_KEY,
      JSON.stringify([
        { id: 'slot-0', chainId: 5, label: 'A', color: '#00d9ff', muted: false, solo: false, dryWetMix: 100 },
        { id: 'slot-1', chainId: null, label: 'B', color: '#ff006e', muted: false, solo: false, dryWetMix: 100 },
      ]),
    )
    window.localStorage.setItem(
      SNAPSHOT_EDITOR_ROUTING_STORAGE_KEY,
      JSON.stringify({
        mode: 'ab_switch',
        activeSlotId: 'slot-0',
        blendPositions: {},
        morphProgress: 0,
        morphSourceSlotId: null,
        morphTargetSlotId: null,
        seriesOrder: [],
      }),
    )
    window.localStorage.setItem(SNAPSHOT_EDITOR_ACTIVE_STORAGE_KEY, '1')
    window.localStorage.setItem(SNAPSHOT_EDITOR_PLUGIN_CATEGORY_STORAGE_KEY, 'EQ')
    window.localStorage.setItem(SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_STORAGE_KEY, JSON.stringify(['Cabinet']))

    act(() => {
      useSnapshotEditorStore.getState().hydrateBucketAFromLocalStorage(NORMALIZATION_OPTIONS)
    })

    const state = useSnapshotEditorStore.getState()
    expect(state.flowSlots[0]?.chainId).toBe(5)
    expect(state.flowSlots[1]?.chainId).toBeNull()
    expect(state.routing.mode).toBe('ab_switch')
    expect(state.activeFlowIndex).toBe(1)
    expect(state.selectedCategory).toBe('EQ')
    expect(state.collapsedCategories.has('Cabinet')).toBe(true)
  })

  it('readPersistedFlows falls back to legacy keys and default routing/index when primary keys are absent', () => {
    window.localStorage.setItem(
      'map2_grid_flows_v2',
      JSON.stringify([
        { id: 'slot-0', chainId: 99, label: 'Legacy', color: '#00d9ff', muted: false, solo: false, dryWetMix: 100 },
      ]),
    )

    const result = readPersistedFlows(NORMALIZATION_OPTIONS)
    expect(result.flowSlots[0]?.chainId).toBe(99)
    expect(result.activeFlowIndex).toBe(0)
    expect(result.routing.mode).toBe('parallel_blend')
  })

  it('readPersistedFlows preserves sparse null chainIds after rehydrate', () => {
    window.localStorage.setItem(
      SNAPSHOT_EDITOR_FLOWS_STORAGE_KEY,
      JSON.stringify([
        { id: 'slot-0', chainId: null, label: 'A', color: '#00d9ff', muted: false, solo: false, dryWetMix: 100 },
        { id: 'slot-1', chainId: 7, label: 'B', color: '#ff006e', muted: false, solo: false, dryWetMix: 100 },
      ]),
    )

    const { flowSlots } = readPersistedFlows(NORMALIZATION_OPTIONS)
    expect(flowSlots[0]?.chainId).toBeNull()
    expect(flowSlots[1]?.chainId).toBe(7)
    expect(flowSlots.every((slot) => slot.chainId === null || typeof slot.chainId === 'number')).toBe(true)
  })

  it('readPersistedSelectedCategory returns "all" when neither primary nor legacy key exists', () => {
    expect(readPersistedSelectedCategory()).toBe('all')

    window.localStorage.setItem('map2_grid_plugin_category', 'Delay')
    expect(readPersistedSelectedCategory()).toBe('Delay')

    window.localStorage.setItem(SNAPSHOT_EDITOR_PLUGIN_CATEGORY_STORAGE_KEY, 'Reverb')
    expect(readPersistedSelectedCategory()).toBe('Reverb')
  })

  it('readPersistedCollapsedCategories returns empty set on corrupted JSON', () => {
    window.localStorage.setItem(SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_STORAGE_KEY, '{not-valid-json')
    expect(readPersistedCollapsedCategories().size).toBe(0)
  })

  it('readPersistedCollapsedCategories ignores non-string entries in the stored array', () => {
    window.localStorage.setItem(
      SNAPSHOT_EDITOR_COLLAPSED_CATEGORIES_STORAGE_KEY,
      JSON.stringify(['EQ', 42, null, 'Reverb']),
    )
    const result = readPersistedCollapsedCategories()
    expect(result.has('EQ')).toBe(true)
    expect(result.has('Reverb')).toBe(true)
    expect(result.size).toBe(2)
  })

  it('setters update independent buckets without clobbering each other', () => {
    const api = useSnapshotEditorStore.getState()

    act(() => {
      api.setMidiLearnActive(true)
      api.setShowPerformModal(true)
      api.setAutomationPlaying(true)
      api.setFocusedBranchId('branch-7')
    })

    const state = useSnapshotEditorStore.getState()
    expect(state.midiLearnActive).toBe(true)
    expect(state.showPerformModal).toBe(true)
    expect(state.automationPlaying).toBe(true)
    expect(state.focusedBranchId).toBe('branch-7')
    expect(state.selectedCategory).toBe('all')
    expect(state.flowSlots).toEqual([])
  })
})
