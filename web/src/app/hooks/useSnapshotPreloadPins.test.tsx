/**
 * T2454 slice 1 — useSnapshotPreloadPins tests.
 *
 * Mocks `useSpecialSettings` (the underlying transport) so we can exercise
 * the typed hook layer in isolation: cap enforcement, idempotent pin/unpin,
 * reorder threading.
 */

import { act, renderHook } from '@testing-library/react'

import { SNAPSHOT_PRELOAD_PIN_LIMIT, useSnapshotPreloadPins } from './useSnapshotPreloadPins'

const mockUpdateSettings = jest.fn()
let mockPins: number[] = []

jest.mock('./useSpecialSettings', () => ({
  __esModule: true,
  SNAPSHOT_PRELOAD_PIN_CAP: 5,
  normalizeSnapshotPreloadPins: (values: ReadonlyArray<unknown>) => {
    const out: number[] = []
    const seen = new Set<number>()
    for (const raw of values) {
      let candidate: number | null = null
      if (typeof raw === 'number' && Number.isInteger(raw)) candidate = raw
      else if (typeof raw === 'string' && raw.trim()) {
        const parsed = Number.parseInt(raw.trim(), 10)
        if (Number.isInteger(parsed)) candidate = parsed
      }
      if (candidate === null || candidate < 1 || seen.has(candidate)) continue
      seen.add(candidate)
      out.push(candidate)
      if (out.length >= 5) break
    }
    return out
  },
  useSpecialSettings: () => ({
    settings: {
      enabled: false,
      hiddenPlugins: [],
      menuLocation: 'hidden' as const,
      pinnedRoutes: [],
      landingTiles: [],
      snapshotSetlistMode: false,
      snapshotSetlistOrder: [],
      'snapshot_editor.flow_animation': 'cascade' as const,
      'snapshot_editor.grid_backdrop': true,
      'snapshot_editor.node_shape': 'square' as const,
      snapshotPreloadPins: mockPins,
    },
    isLoading: false,
    error: null,
    updateSettings: mockUpdateSettings,
    reload: jest.fn(),
  }),
}))

beforeEach(() => {
  mockPins = []
  mockUpdateSettings.mockReset()
  mockUpdateSettings.mockResolvedValue(undefined)
})

it('appends pins until the cap and reports cap_reached', async () => {
  const { result, rerender } = renderHook(() => useSnapshotPreloadPins())

  for (let i = 1; i <= SNAPSHOT_PRELOAD_PIN_LIMIT; i++) {
    let outcome: Awaited<ReturnType<typeof result.current.pin>> | null = null
    await act(async () => {
      outcome = await result.current.pin(i)
    })
    expect(outcome?.ok).toBe(true)
    expect(mockUpdateSettings).toHaveBeenLastCalledWith({
      snapshotPreloadPins: Array.from({ length: i }, (_, k) => k + 1),
    })
    // Reflect the persisted state for the next iteration since the test
    // mock is read-through only.
    mockPins = Array.from({ length: i }, (_, k) => k + 1)
    rerender()
  }

  let outcome: Awaited<ReturnType<typeof result.current.pin>> | null = null
  await act(async () => {
    outcome = await result.current.pin(SNAPSHOT_PRELOAD_PIN_LIMIT + 1)
  })
  expect(outcome).toEqual({ ok: false, reason: 'cap_reached' })
  expect(result.current.isCapReached).toBe(true)
})

it('rejects an already-pinned snapshot with already_pinned', async () => {
  mockPins = [4]
  const { result } = renderHook(() => useSnapshotPreloadPins())
  let outcome: Awaited<ReturnType<typeof result.current.pin>> | null = null
  await act(async () => {
    outcome = await result.current.pin(4)
  })
  expect(outcome).toEqual({ ok: false, reason: 'already_pinned' })
  expect(mockUpdateSettings).not.toHaveBeenCalled()
})

it('unpins existing entries and reports not_pinned otherwise', async () => {
  mockPins = [3, 4, 5]
  const { result } = renderHook(() => useSnapshotPreloadPins())
  let removed: Awaited<ReturnType<typeof result.current.unpin>> | null = null
  await act(async () => {
    removed = await result.current.unpin(4)
  })
  expect(removed?.ok).toBe(true)
  expect(mockUpdateSettings).toHaveBeenLastCalledWith({ snapshotPreloadPins: [3, 5] })

  let missing: Awaited<ReturnType<typeof result.current.unpin>> | null = null
  await act(async () => {
    missing = await result.current.unpin(99)
  })
  expect(missing).toEqual({ ok: false, reason: 'not_pinned' })
})

it('reorders by replacing the entire ordered list', async () => {
  mockPins = [1, 2, 3]
  const { result } = renderHook(() => useSnapshotPreloadPins())
  await act(async () => {
    await result.current.reorder([3, 1, 2])
  })
  expect(mockUpdateSettings).toHaveBeenLastCalledWith({ snapshotPreloadPins: [3, 1, 2] })
})
