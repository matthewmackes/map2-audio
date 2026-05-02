/**
 * T2483 loop 18 / iter 178 — usePeerMatrix scaffold tests.
 *
 * The hook is a placeholder today (returns empty + hasPeerData=false).
 * This test confirms that contract so future loops wiring real
 * cluster data have a baseline to compare against.
 */

import '@testing-library/jest-dom'
import { renderHook } from '@testing-library/react'

import { usePeerMatrix } from './usePeerMatrix'

describe('usePeerMatrix (T2483-9 scaffold)', () => {
  it('returns an empty peers map today', () => {
    const { result } = renderHook(() => usePeerMatrix())
    expect(result.current.peers).toEqual({})
  })

  it('reports zero total peer bindings today', () => {
    const { result } = renderHook(() => usePeerMatrix())
    expect(result.current.totalPeerBindings).toBe(0)
  })

  it('reports hasPeerData=false today', () => {
    const { result } = renderHook(() => usePeerMatrix())
    expect(result.current.hasPeerData).toBe(false)
  })

  it('peers map indexes by source_type then consumer_type (shape contract)', () => {
    const { result } = renderHook(() => usePeerMatrix())
    // Even though every cell is currently undefined, the type-system
    // contract is that consumers can index two levels deep without
    // crashing. This test confirms the shape stays Partial<Record>>>
    // so the iter-177 RoutingPage's `peers[src]?.[cons] ?? 0` pattern
    // compiles cleanly when peers becomes populated.
    const cell = result.current.peers.midi_cc?.plugin_param ?? 0
    expect(cell).toBe(0)
  })
})
