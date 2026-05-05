/**
 * T2472 read-consolidation deferred slice 3 — authority-snapshot-detail
 * query parity test.
 *
 * Asserts behavioral parity with the historical inline `useQuery` block:
 *   - queryKey shape ['snapshots', 'detail', 'authority-active', id|null]
 *     matches the historical key (so cross-cache invalidation that targets
 *     the same key shape continues to hit it).
 *   - enabled tracks `id != null && !editorSnapshotOverride` (no fetch
 *     when null, no fetch when override is set).
 *   - queryFn calls `snapshotsApi.get(id)` when active.
 *   - 404 from snapshotsApi.get resolves to null instead of throwing.
 *   - non-404 errors propagate.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { ApiError } from '../../../map2/http'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorAuthoritySnapshotDetailQuery } from './useSnapshotEditorAuthoritySnapshotDetailQuery'
import type { SnapshotDetail } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: { get: jest.fn() },
}))

const mockedGet = snapshotsApi.get as jest.MockedFunction<typeof snapshotsApi.get>

function makeClientAndWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestQueryClientProvider'
  return { client, Wrapper }
}

const SNAPSHOT = {
  id: 42,
  name: 'Authority',
  chains: [],
} as unknown as SnapshotDetail

describe('useSnapshotEditorAuthoritySnapshotDetailQuery', () => {
  beforeEach(() => {
    mockedGet.mockReset()
  })

  it('disables the query when authoritySnapshotId is null', () => {
    const { Wrapper } = makeClientAndWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorAuthoritySnapshotDetailQuery({
          authoritySnapshotId: null,
          editorSnapshotOverride: false,
        }),
      { wrapper: Wrapper },
    )
    expect(mockedGet).not.toHaveBeenCalled()
    expect(result.current.authoritySnapshotDetail).toBe(null)
  })

  it('disables the query when editorSnapshotOverride is true (operator override active)', () => {
    const { Wrapper } = makeClientAndWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorAuthoritySnapshotDetailQuery({
          authoritySnapshotId: 42,
          editorSnapshotOverride: true,
        }),
      { wrapper: Wrapper },
    )
    expect(mockedGet).not.toHaveBeenCalled()
    expect(result.current.authoritySnapshotDetail).toBe(null)
  })

  it('fetches via snapshotsApi.get(id) when active and caches under the canonical key', async () => {
    mockedGet.mockResolvedValueOnce(SNAPSHOT as never)
    const { client, Wrapper } = makeClientAndWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorAuthoritySnapshotDetailQuery({
          authoritySnapshotId: 42,
          editorSnapshotOverride: false,
        }),
      { wrapper: Wrapper },
    )
    await waitFor(() =>
      expect(result.current.authoritySnapshotDetailQuery.isSuccess).toBe(true),
    )
    expect(mockedGet).toHaveBeenCalledWith(42)
    expect(result.current.authoritySnapshotDetail).toEqual(SNAPSHOT)

    // Cache key bit-identical to the historical inline shape.
    expect(
      client.getQueryData(['snapshots', 'detail', 'authority-active', 42]),
    ).toEqual(SNAPSHOT)
  })

  it('resolves to null when snapshotsApi.get throws ApiError(404)', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'not found', null))
    const { Wrapper } = makeClientAndWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorAuthoritySnapshotDetailQuery({
          authoritySnapshotId: 42,
          editorSnapshotOverride: false,
        }),
      { wrapper: Wrapper },
    )
    await waitFor(() =>
      expect(result.current.authoritySnapshotDetailQuery.isSuccess).toBe(true),
    )
    expect(result.current.authoritySnapshotDetail).toBe(null)
  })

  it('propagates non-404 errors', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom', null))
    const { Wrapper } = makeClientAndWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorAuthoritySnapshotDetailQuery({
          authoritySnapshotId: 42,
          editorSnapshotOverride: false,
        }),
      { wrapper: Wrapper },
    )
    await waitFor(() =>
      expect(result.current.authoritySnapshotDetailQuery.isError).toBe(true),
    )
    expect(result.current.authoritySnapshotDetail).toBe(null)
  })
})
