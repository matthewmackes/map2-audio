/**
 * T2473 cycle 19 — paired test for useSnapshotEditorCadences.
 *
 * The hook composes four useRealtimeCadence calls (standard, fast,
 * meter, slow) with distinct visible/hidden ms tuples. We mock
 * useRealtimeCadence and pin the four arg shapes + the returned
 * object's keys.
 */
import { renderHook } from '@testing-library/react'

const mockUseRealtimeCadence = jest.fn()

jest.mock('../../hooks/useRealtimeCadence', () => ({
  __esModule: true,
  useRealtimeCadence: (...args: unknown[]) => mockUseRealtimeCadence(...args),
}))

import { useSnapshotEditorCadences } from './useSnapshotEditorCadences'

describe('useSnapshotEditorCadences', () => {
  beforeEach(() => {
    mockUseRealtimeCadence.mockReset()
  })

  it('calls useRealtimeCadence four times with the four cadence tuples', () => {
    let callIndex = 0
    mockUseRealtimeCadence.mockImplementation(() => {
      callIndex += 1
      return callIndex * 1000
    })
    const { result } = renderHook(() =>
      useSnapshotEditorCadences({ routeActive: true }),
    )
    expect(mockUseRealtimeCadence).toHaveBeenCalledTimes(4)

    // Pin every call's full arg shape verbatim — these are the
    // canonical SnapshotEditor polling cadences.
    expect(mockUseRealtimeCadence).toHaveBeenNthCalledWith(1, {
      routeActive: true,
      visibleMs: 5_000,
      hiddenMs: 20_000,
      inactiveMs: false,
    })
    expect(mockUseRealtimeCadence).toHaveBeenNthCalledWith(2, {
      routeActive: true,
      visibleMs: 2_000,
      hiddenMs: 10_000,
      inactiveMs: false,
    })
    expect(mockUseRealtimeCadence).toHaveBeenNthCalledWith(3, {
      routeActive: true,
      visibleMs: 1_000,
      hiddenMs: 5_000,
      inactiveMs: false,
    })
    expect(mockUseRealtimeCadence).toHaveBeenNthCalledWith(4, {
      routeActive: true,
      visibleMs: 10_000,
      hiddenMs: 30_000,
      inactiveMs: false,
    })

    // Order in the returned object: standard, fast, meter, slow.
    expect(result.current.standard).toBe(1000)
    expect(result.current.fast).toBe(2000)
    expect(result.current.meter).toBe(3000)
    expect(result.current.slow).toBe(4000)
  })

  it('threads routeActive=false into every cadence call', () => {
    mockUseRealtimeCadence.mockReturnValue(false)
    renderHook(() => useSnapshotEditorCadences({ routeActive: false }))
    for (const args of mockUseRealtimeCadence.mock.calls) {
      expect(args[0]).toMatchObject({ routeActive: false, inactiveMs: false })
    }
  })

  it('returns a SnapshotEditorCadences-shaped object', () => {
    mockUseRealtimeCadence.mockReturnValue(0)
    const { result } = renderHook(() =>
      useSnapshotEditorCadences({ routeActive: true }),
    )
    expect(Object.keys(result.current).sort()).toEqual([
      'fast',
      'meter',
      'slow',
      'standard',
    ])
  })

  it('re-runs every cadence when routeActive flips', () => {
    mockUseRealtimeCadence.mockReturnValue(0)
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useSnapshotEditorCadences({ routeActive: active }),
      { initialProps: { active: true } },
    )
    const initial = mockUseRealtimeCadence.mock.calls.length
    rerender({ active: false })
    expect(mockUseRealtimeCadence.mock.calls.length).toBeGreaterThan(initial)
  })
})
