/**
 * T2472 mutation extraction slice 11 — restore-revision mutation parity test.
 *
 * Asserts behavioral parity for restoreSnapshotRevisionMutation:
 *   - calls snapshotsApi.restoreRevision with (snapshotId, revisionNumber).
 *   - on success: rebuilds the draft via buildSnapshotEditorLiveSnapshotHydration,
 *     syncs detail caches, invalidates the revisions query keyed by the
 *     returned snapshot id, closes the version-history workspace, rehydrates
 *     the editor with toastMessage "Restored revision N",
 *     invalidateSnapshots: true, resetUndoHistory: false, and pushes an
 *     undo-redo step "Restore revision N" with the rebuilt draft.
 *   - on error: pushes an error toast with the thrown message.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import { buildSnapshotEditorLiveSnapshotHydration } from '../../components/SnapshotEditor/snapshotEditorLiveSnapshotHydration'
import { useSnapshotEditorRestoreRevisionMutation } from './useSnapshotEditorRestoreRevisionMutation'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    restoreRevision: jest.fn(),
  },
}))

jest.mock('../../components/SnapshotEditor/snapshotEditorLiveSnapshotHydration', () => ({
  buildSnapshotEditorLiveSnapshotHydration: jest.fn(),
}))

const mockedRestore = snapshotsApi.restoreRevision as jest.MockedFunction<
  typeof snapshotsApi.restoreRevision
>
const mockedHydration = buildSnapshotEditorLiveSnapshotHydration as jest.MockedFunction<
  typeof buildSnapshotEditorLiveSnapshotHydration
>

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestQueryClientProvider'
  return { Wrapper, invalidateSpy }
}

const SNAPSHOT = { id: 42, name: 'Lead' } as unknown as SnapshotDetail
const RESTORED_DRAFT = { tag: 'restored-draft' } as unknown as SnapshotDraftData
const RESPONSE = {
  status: 'ok',
  snapshot_id: 42,
  restored_revision_number: 7,
  snapshot: SNAPSHOT,
}

describe('useSnapshotEditorRestoreRevisionMutation', () => {
  beforeEach(() => {
    mockedRestore.mockReset()
    mockedHydration.mockReset()
    mockedHydration.mockReturnValue({ snapshotData: RESTORED_DRAFT } as never)
  })

  it('restores, syncs caches, invalidates revisions, closes the workspace, rehydrates, and pushes an undo step', async () => {
    mockedRestore.mockResolvedValueOnce(RESPONSE as never)
    const syncSnapshotDetailCaches = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const closeVersionHistoryWorkspace = jest.fn()
    const recordSnapshotUndoRedoStep = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorRestoreRevisionMutation({
          syncSnapshotDetailCaches,
          hydrateEditorFromSnapshot,
          closeVersionHistoryWorkspace,
          recordSnapshotUndoRedoStep,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.restoreSnapshotRevisionMutation.mutate({
        snapshotId: 42,
        revisionNumber: 7,
      })
    })

    await waitFor(() =>
      expect(result.current.restoreSnapshotRevisionMutation.isSuccess).toBe(true),
    )
    expect(mockedRestore).toHaveBeenCalledWith(42, 7)
    expect(syncSnapshotDetailCaches).toHaveBeenCalledWith(SNAPSHOT)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'revisions', 42],
    })
    expect(closeVersionHistoryWorkspace).toHaveBeenCalledTimes(1)
    expect(hydrateEditorFromSnapshot).toHaveBeenCalledWith(SNAPSHOT, {
      toastMessage: 'Restored revision 7',
      invalidateSnapshots: true,
      resetUndoHistory: false,
    })
    expect(recordSnapshotUndoRedoStep).toHaveBeenCalledWith(
      RESTORED_DRAFT,
      'Restore revision 7',
    )
    expect(pushToast).not.toHaveBeenCalled()
  })

  it('error toasts the failure', async () => {
    mockedRestore.mockRejectedValueOnce(new Error('restore-boom'))
    const syncSnapshotDetailCaches = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const closeVersionHistoryWorkspace = jest.fn()
    const recordSnapshotUndoRedoStep = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorRestoreRevisionMutation({
          syncSnapshotDetailCaches,
          hydrateEditorFromSnapshot,
          closeVersionHistoryWorkspace,
          recordSnapshotUndoRedoStep,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.restoreSnapshotRevisionMutation.mutate({
        snapshotId: 42,
        revisionNumber: 7,
      })
    })

    await waitFor(() =>
      expect(result.current.restoreSnapshotRevisionMutation.isError).toBe(true),
    )
    expect(syncSnapshotDetailCaches).not.toHaveBeenCalled()
    expect(hydrateEditorFromSnapshot).not.toHaveBeenCalled()
    expect(closeVersionHistoryWorkspace).not.toHaveBeenCalled()
    expect(recordSnapshotUndoRedoStep).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith('restore-boom', 'error')
  })
})
