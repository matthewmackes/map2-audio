/**
 * T2482 loop 12 / iter 119 — useRoutingMatrix aggregation tests.
 *
 * Mocks globalThis.fetch the same way iter-108 useDevicePackBindings.test
 * does. The hook fans out one fetch per consumer_type so the mock
 * inspects the URL and returns the appropriate slice.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { useRoutingMatrix } from './useRoutingMatrix'

interface Binding {
  binding_id: string
  consumer_type: string
  consumer_id: string
  source_type: string
  target_type: string
  device_id: string | null
  scope: string
  scope_id: string | null
  enabled: boolean
}

function makeBinding(overrides: Partial<Binding>): Binding {
  return {
    binding_id: overrides.binding_id ?? 'b',
    consumer_type: overrides.consumer_type ?? 'plugin_param',
    consumer_id: overrides.consumer_id ?? 'lv2:foo:0',
    source_type: overrides.source_type ?? 'midi_cc',
    target_type: overrides.target_type ?? 'engine_param',
    device_id: overrides.device_id ?? null,
    scope: overrides.scope ?? 'global',
    scope_id: overrides.scope_id ?? null,
    enabled: overrides.enabled ?? true,
  }
}

const FAKE_BINDINGS: Record<string, Binding[]> = {
  plugin_param: [
    makeBinding({ binding_id: 'p1', source_type: 'midi_cc', enabled: true }),
    makeBinding({ binding_id: 'p2', source_type: 'midi_cc', enabled: false }),
    makeBinding({ binding_id: 'p3', source_type: 'midi_note', enabled: true }),
  ],
  transport: [
    makeBinding({ binding_id: 't1', consumer_type: 'transport', source_type: 'midi_clock', enabled: true }),
  ],
  device_pack: [
    makeBinding({ binding_id: 'd1', consumer_type: 'device_pack', source_type: 'midi_cc', enabled: true }),
  ],
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
    globalThis.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      const params = new URLSearchParams(url.split('?')[1] ?? '')
      const consumerType = params.get('consumer_type') ?? ''
      const data = FAKE_BINDINGS[consumerType] ?? []
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => data,
      } as Response)
    }) as unknown as typeof globalThis.fetch
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

  it('initializes empty cells for vocab pairs with no bindings', async () => {
    const { result } = renderHook(() => useRoutingMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.matrix.midi_pc.snapshot.count).toBe(0)
    expect(result.current.matrix.midi_pc.snapshot.enabledCount).toBe(0)
  })
})
