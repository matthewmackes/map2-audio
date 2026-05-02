/**
 * T2483 loop 18 / iter 178 — usePeerMatrix scaffold tests (original).
 * T2484 loop 19 / iter 186 — refactored to mock the new
 *   /cluster/bindings/matrix endpoint shape (T2484-2).
 *
 * The hook is now a single-query consumer; tests verify the per-peer
 * cell aggregation, the empty-cluster fallback, and the error pass-through.
 */

import '@testing-library/jest-dom'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { usePeerMatrix } from './usePeerMatrix'

const EMPTY_LOCAL = { matrix: {}, total_bindings: 0 }

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return React.createElement(QueryClientProvider, { client }, children)
}

describe('usePeerMatrix (T2484 wired)', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch
  })

  function mockFetchResponse(payload: unknown) {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => payload,
      } as Response),
    ) as unknown as typeof globalThis.fetch
  }

  it('returns empty + hasPeerData=false when no peers in the response', async () => {
    mockFetchResponse({ local: EMPTY_LOCAL, peers: [], errors: {} })
    const { result } = renderHook(() => usePeerMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.peers).toEqual({})
    expect(result.current.totalPeerBindings).toBe(0)
    expect(result.current.hasPeerData).toBe(false)
  })

  it('aggregates cells across multiple peers', async () => {
    mockFetchResponse({
      local: EMPTY_LOCAL,
      peers: [
        {
          node_id: 'peer-a',
          hostname: 'peer-a.local',
          matrix: {
            midi_cc: { plugin_param: { count: 3, enabled_count: 2 } },
          },
          total_bindings: 3,
        },
        {
          node_id: 'peer-b',
          hostname: 'peer-b.local',
          matrix: {
            midi_cc: { plugin_param: { count: 2, enabled_count: 2 } },
            midi_note: { transport: { count: 1, enabled_count: 1 } },
          },
          total_bindings: 3,
        },
      ],
      errors: {},
    })
    const { result } = renderHook(() => usePeerMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // midi_cc → plugin_param: 3 + 2 = 5
    expect(result.current.peers.midi_cc?.plugin_param).toBe(5)
    // midi_note → transport: 1
    expect(result.current.peers.midi_note?.transport).toBe(1)
    expect(result.current.totalPeerBindings).toBe(6)
    expect(result.current.hasPeerData).toBe(true)
  })

  it('passes errors map through unchanged', async () => {
    mockFetchResponse({
      local: EMPTY_LOCAL,
      peers: [],
      errors: { 'peer-c': 'http 500', 'peer-d': 'network down' },
    })
    const { result } = renderHook(() => usePeerMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.errors).toEqual({
      'peer-c': 'http 500',
      'peer-d': 'network down',
    })
  })

  it('issues exactly one fetch (no fan-out)', async () => {
    mockFetchResponse({ local: EMPTY_LOCAL, peers: [], errors: {} })
    const { result } = renderHook(() => usePeerMatrix(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBe(1)
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/midi/cluster/bindings/matrix',
    )
  })
})
