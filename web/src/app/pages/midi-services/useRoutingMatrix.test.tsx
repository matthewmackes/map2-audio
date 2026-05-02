/**
 * T2482 loop 12 / iter 119 — useRoutingMatrix aggregation tests (original).
 * T2483 loop 17 / iter 165 — refactored to mock the new
 *   GET /api/midi/bindings/matrix endpoint shape (T2483-8). The
 *   hook is now a single-query consumer; the test mock returns
 *   one BindingsMatrixResponse blob.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { useRoutingMatrix } from './useRoutingMatrix'

const FAKE_MATRIX = {
  matrix: {
    midi_cc: {
      plugin_param: { count: 2, enabled_count: 1 },
      device_pack: { count: 1, enabled_count: 1 },
    },
    midi_note: {
      plugin_param: { count: 1, enabled_count: 1 },
    },
    midi_clock: {
      transport: { count: 1, enabled_count: 1 },
    },
  },
  total_bindings: 5,
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return React.createElement(QueryClientProvider, { client }, children)
}

describe('useRoutingMatrix', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeEach(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => FAKE_MATRIX,
      } as Response),
    ) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch
  })

  it('aggregates bindings into the matrix shape', async () => {
    const { result } = renderHook(() => useRoutingMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.totalBindings).toBe(5)
  })

  it('counts cells per (source_type, consumer_type) pair', async () => {
    const { result } = renderHook(() => useRoutingMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // 2 midi_cc → plugin_param (one enabled, one disabled)
    expect(result.current.matrix.midi_cc.plugin_param.count).toBe(2)
    expect(result.current.matrix.midi_cc.plugin_param.enabledCount).toBe(1)
    // 1 midi_note → plugin_param (enabled)
    expect(result.current.matrix.midi_note.plugin_param.count).toBe(1)
    expect(result.current.matrix.midi_note.plugin_param.enabledCount).toBe(1)
    // 1 midi_clock → transport (enabled)
    expect(result.current.matrix.midi_clock.transport.count).toBe(1)
    expect(result.current.matrix.midi_clock.transport.enabledCount).toBe(1)
    // 1 midi_cc → device_pack (enabled)
    expect(result.current.matrix.midi_cc.device_pack.count).toBe(1)
  })

  it('computes row totals correctly', async () => {
    const { result } = renderHook(() => useRoutingMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // midi_cc: 2 (plugin_param) + 1 (device_pack) = 3
    expect(result.current.rowTotals.midi_cc).toBe(3)
    // midi_note: 1
    expect(result.current.rowTotals.midi_note).toBe(1)
    // midi_clock: 1
    expect(result.current.rowTotals.midi_clock).toBe(1)
  })

  it('computes column totals correctly', async () => {
    const { result } = renderHook(() => useRoutingMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.colTotals.plugin_param).toBe(3)
    expect(result.current.colTotals.transport).toBe(1)
    expect(result.current.colTotals.device_pack).toBe(1)
  })

  it('initializes empty cells for vocab pairs not in the response', async () => {
    const { result } = renderHook(() => useRoutingMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Backend's iter-163 test_omits_empty_groups confirms unknown
    // (source, consumer) pairs are not in the dict; the hook
    // initializes them as count=0 / enabledCount=0.
    expect(result.current.matrix.midi_pc.snapshot.count).toBe(0)
    expect(result.current.matrix.midi_pc.snapshot.enabledCount).toBe(0)
  })

  it('issues exactly one fetch (no fan-out)', async () => {
    const { result } = renderHook(() => useRoutingMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // T2483-8 win: one query, not 10. Confirms the iter-164 refactor.
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1)
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain('/midi/bindings/matrix')
  })
})
