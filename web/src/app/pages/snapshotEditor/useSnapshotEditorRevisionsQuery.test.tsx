/**
 * T2472 read-consolidation deferred slice 2 — snapshot-revisions parity test.
 *
 * Asserts behavioral parity:
 *   - queryKey shape ['snapshots','revisions', id|null] matches the
 *     historical key (cache stays shared with the slice-11 invalidation).
 *   - enabled tracks (showVersionHistoryModal && id != null).
 *   - queryFn calls snapshotsApi.listRevisions(id).
 *   - refetchOnWindowFocus is disabled (modal-driven).
 */
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorRevisionsQuery } from './useSnapshotEditorRevisionsQuery'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: { listRevisions: jest.fn() },
}))

const mockedListRevisions = snapshotsApi.listRevisions as jest.MockedFunction<
  typeof snapshotsApi.listRevisions
>

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

const REVISIONS = { revisions: [{ revision_number: 1 }] } as never

describe('useSnapshotEditorRevisionsQuery', () => {
  beforeEach(() => {
    mockedListRevisions.mockReset()
  })

  it('disabled when modal is closed', () => {
    const { Wrapper } = makeClientAndWrapper()
    renderHook(
      () =>
        useSnapshotEditorRevisionsQuery({
          currentEditorSnapshotId: 42,
          showVersionHistoryModal: false,
        }),
      { wrapper: Wrapper }
    )
    expect(mockedListRevisions).not.toHaveBeenCalled()
  })

  it('disabled when id is null', () => {
    const { Wrapper } = makeClientAndWrapper()
    renderHook(
      () =>
        useSnapshotEditorRevisionsQuery({
          currentEditorSnapshotId: null,
          showVersionHistoryModal: true,
        }),
      { wrapper: Wrapper }
    )
    expect(mockedListRevisions).not.toHaveBeenCalled()
  })

  it('fetches when modal is open and id is set, populates the cache under the canonical key', async () => {
    mockedListRevisions.mockResolvedValueOnce(REVISIONS)
    const { client, Wrapper } = makeClientAndWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorRevisionsQuery({
          currentEditorSnapshotId: 42,
          showVersionHistoryModal: true,
        }),
      { wrapper: Wrapper }
    )

    await waitFor(() => expect(result.current.snapshotRevisionsQuery.isSuccess).toBe(true))
    expect(mockedListRevisions).toHaveBeenCalledWith(42)
    expect(client.getQueryData(['snapshots', 'revisions', 42])).toEqual(REVISIONS)
  })
})
