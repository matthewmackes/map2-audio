/**
 * T2472 slice 2 — cache-key parity test.
 *
 * Asserts that `useSnapshotEditorCatalogReadQueries` produces queries
 * with the exact same `queryKey` arrays as the inline calls it
 * replaced in `SnapshotEditorPageContent.tsx`. Cache-key identity is
 * the contract that lets the consolidation slice ship piecewise:
 * existing inline call sites that haven't migrated yet still hit the
 * same cache slot the new hook does, so React Query dedups them on
 * mount and the WS-driven invalidations from mutation `onSuccess`
 * callbacks continue to flow correctly.
 */
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  useSnapshotEditorCatalogReadQueries,
  useSnapshotEditorMidiReadQueries,
} from './useSnapshotEditorReadQueries'

jest.mock('../../../map2/api', () => ({
  chainsApi: {
    list: jest.fn().mockResolvedValue([]),
    listPresets: jest.fn().mockResolvedValue([]),
  },
  pluginsApi: {
    discover: jest.fn().mockResolvedValue([]),
  },
  midiApiV2: {
    getStatus: jest.fn().mockResolvedValue({}),
    getLearnStatus: jest.fn().mockResolvedValue({ learning: false }),
    getMappings: jest.fn().mockResolvedValue([]),
  },
}))

function withQueryClient(client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  Wrapper.displayName = 'TestQueryClientWrapper'
  return Wrapper
}

describe('useSnapshotEditorCatalogReadQueries — cache-key parity (T2472 slice 2)', () => {
  it('exposes chainsQuery, pluginsQuery, presetsQuery with the same queryKeys as the inline calls', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const cadences = { standard: 5_000 as number | false, fast: 2_000 as number | false, meter: 1_000 as number | false }
    renderHook(() => useSnapshotEditorCatalogReadQueries({ cadences }), {
      wrapper: withQueryClient(client),
    })

    const cacheKeys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)

    expect(cacheKeys).toEqual(
      expect.arrayContaining([
        ['chains'],
        ['plugins', 'discover'],
        ['chains', 'presets'],
      ]),
    )
    expect(cacheKeys).toHaveLength(3)
  })
})

describe('useSnapshotEditorMidiReadQueries — cache-key parity (T2472 slice 3)', () => {
  it('exposes midiStatusQuery, midiLearnStatusQuery, midiMappingsQuery with the inline queryKeys (default scope)', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const cadences = { standard: 5_000 as number | false, fast: 2_000 as number | false, meter: 1_000 as number | false }

    renderHook(
      () =>
        useSnapshotEditorMidiReadQueries({
          cadences,
          midiScope: 'all',
          midiLearnActive: false,
          activeFlowChainId: null,
          selectedPluginUri: null,
          selectedPluginPosition: null,
        }),
      { wrapper: withQueryClient(client) },
    )

    const cacheKeys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)

    expect(cacheKeys).toEqual(
      expect.arrayContaining([
        ['midi', 'status'],
        ['midi', 'learn', 'status'],
        ['midi', 'mappings', 'juce-grid', 'all', null, null, null],
      ]),
    )
    expect(cacheKeys).toHaveLength(3)
  })

  it('embeds (scope, chainId, plugin uri, position) into the mappings queryKey verbatim', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const cadences = { standard: 5_000 as number | false, fast: 2_000 as number | false, meter: 1_000 as number | false }

    renderHook(
      () =>
        useSnapshotEditorMidiReadQueries({
          cadences,
          midiScope: 'selected-plugin',
          midiLearnActive: false,
          activeFlowChainId: 7,
          selectedPluginUri: 'urn:test',
          selectedPluginPosition: 3,
        }),
      { wrapper: withQueryClient(client) },
    )

    const mappingsKey = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)
      .find((k) => Array.isArray(k) && k[1] === 'mappings')

    expect(mappingsKey).toEqual([
      'midi',
      'mappings',
      'juce-grid',
      'selected-plugin',
      7,
      'urn:test',
      3,
    ])
  })
})
