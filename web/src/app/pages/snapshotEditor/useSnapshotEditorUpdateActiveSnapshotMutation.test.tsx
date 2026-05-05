/**
 * T2472 mutation extraction slice 10 — update-active-snapshot mutation parity test.
 *
 * Asserts behavioral parity for updateActiveSnapshotMutation:
 *   - throws when no active snapshot or when the snapshot is locked.
 *   - posts the flow-payload-shaped current draft via snapshotsApi.update
 *     with create_revision: true.
 *   - on success: syncs caches, invalidates the revisions query keyed by
 *     the returned snapshot id, and rehydrates with toastMessage
 *     'Snapshot updated', invalidateSnapshots: true, resetUndoHistory: false.
 *   - on error: pushes an error toast with the thrown message.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  flowSnapshotDataToSnapshotPayload,
  snapshotsApi,
} from '../../../map2/clients/snapshots'
import { useSnapshotEditorUpdateActiveSnapshotMutation } from './useSnapshotEditorUpdateActiveSnapshotMutation'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    update: jest.fn(),
  },
  flowSnapshotDataToSnapshotPayload: jest.fn(),
}))

const mockedUpdate = snapshotsApi.update as jest.MockedFunction<typeof snapshotsApi.update>
const mockedFlowToPayload = flowSnapshotDataToSnapshotPayload as jest.MockedFunction<
  typeof flowSnapshotDataToSnapshotPayload
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

const ACTIVE_SNAPSHOT = { id: 42, name: 'Lead', is_locked: false } as unknown as SnapshotDetail
const LOCKED_SNAPSHOT = { id: 42, name: 'Lead', is_locked: true } as unknown as SnapshotDetail
const RESPONSE_SNAPSHOT = { id: 42, name: 'Lead Updated' } as unknown as SnapshotDetail
const DRAFT = { tag: 'draft' } as unknown as SnapshotDraftData
const PAYLOAD = { channels: [], chains: [], routing: {}, midi_map: {} } as unknown as ReturnType<
  typeof flowSnapshotDataToSnapshotPayload
>

describe('useSnapshotEditorUpdateActiveSnapshotMutation', () => {
  beforeEach(() => {
    mockedUpdate.mockReset()
    mockedFlowToPayload.mockReset()
    mockedFlowToPayload.mockReturnValue(PAYLOAD)
  })

  it('saves the current draft, syncs caches, invalidates revisions, and rehydrates', async () => {
    mockedUpdate.mockResolvedValueOnce({ snapshot: RESPONSE_SNAPSHOT } as never)
    const syncSnapshotDetailCaches = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUpdateActiveSnapshotMutation({
          activeSnapshot: ACTIVE_SNAPSHOT,
          currentSnapshotDraft: DRAFT,
          syncSnapshotDetailCaches,
          hydrateEditorFromSnapshot,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateActiveSnapshotMutation.mutate()
    })

    await waitFor(() => expect(result.current.updateActiveSnapshotMutation.isSuccess).toBe(true))
    expect(mockedFlowToPayload).toHaveBeenCalledWith(DRAFT)
    expect(mockedUpdate).toHaveBeenCalledWith(42, {
      ...PAYLOAD,
      create_revision: true,
    })
    expect(syncSnapshotDetailCaches).toHaveBeenCalledWith(RESPONSE_SNAPSHOT)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'revisions', RESPONSE_SNAPSHOT.id],
    })
    expect(hydrateEditorFromSnapshot).toHaveBeenCalledWith(RESPONSE_SNAPSHOT, {
      toastMessage: 'Snapshot updated',
      invalidateSnapshots: true,
      resetUndoHistory: false,
    })
    expect(pushToast).not.toHaveBeenCalled()
  })

  it('errors when there is no active snapshot', async () => {
    const syncSnapshotDetailCaches = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUpdateActiveSnapshotMutation({
          activeSnapshot: null,
          currentSnapshotDraft: DRAFT,
          syncSnapshotDetailCaches,
          hydrateEditorFromSnapshot,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateActiveSnapshotMutation.mutate()
    })

    await waitFor(() => expect(result.current.updateActiveSnapshotMutation.isError).toBe(true))
    expect(mockedUpdate).not.toHaveBeenCalled()
    expect(syncSnapshotDetailCaches).not.toHaveBeenCalled()
    expect(hydrateEditorFromSnapshot).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith('No active snapshot to update', 'error')
  })

  it('errors when the active snapshot is locked', async () => {
    const syncSnapshotDetailCaches = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUpdateActiveSnapshotMutation({
          activeSnapshot: LOCKED_SNAPSHOT,
          currentSnapshotDraft: DRAFT,
          syncSnapshotDetailCaches,
          hydrateEditorFromSnapshot,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateActiveSnapshotMutation.mutate()
    })

    await waitFor(() => expect(result.current.updateActiveSnapshotMutation.isError).toBe(true))
    expect(mockedUpdate).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith('Unlock snapshot before updating it', 'error')
  })

  it('toasts the api failure when snapshotsApi.update rejects', async () => {
    mockedUpdate.mockRejectedValueOnce(new Error('update-boom'))
    const syncSnapshotDetailCaches = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUpdateActiveSnapshotMutation({
          activeSnapshot: ACTIVE_SNAPSHOT,
          currentSnapshotDraft: DRAFT,
          syncSnapshotDetailCaches,
          hydrateEditorFromSnapshot,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateActiveSnapshotMutation.mutate()
    })

    await waitFor(() => expect(result.current.updateActiveSnapshotMutation.isError).toBe(true))
    expect(syncSnapshotDetailCaches).not.toHaveBeenCalled()
    expect(hydrateEditorFromSnapshot).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith('update-boom', 'error')
  })
})
