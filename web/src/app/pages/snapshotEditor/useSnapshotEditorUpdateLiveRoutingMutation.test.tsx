/**
 * T2472 mutation extraction slice 14 — update-live-routing mutation parity test.
 *
 * Asserts behavioral parity:
 *   - calls snapshotsApi.updateRouting with the .routing slice of the
 *     flow-payload-shaped nextDraft.
 *   - on success: syncs caches with updateAuthorityActiveSnapshot:true,
 *     flips state to 'live-applied', toasts 'Live routing mode updated'
 *     iff the response carries routing_mode_changed_live.
 *   - on error: resets state to 'idle' and toasts the failure.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  flowSnapshotDataToSnapshotPayload,
  snapshotsApi,
} from '../../../map2/clients/snapshots'
import { useSnapshotEditorUpdateLiveRoutingMutation } from './useSnapshotEditorUpdateLiveRoutingMutation'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: { updateRouting: jest.fn() },
  flowSnapshotDataToSnapshotPayload: jest.fn(),
}))

const mockedUpdateRouting = snapshotsApi.updateRouting as jest.MockedFunction<
  typeof snapshotsApi.updateRouting
>
const mockedFlowToPayload = flowSnapshotDataToSnapshotPayload as jest.MockedFunction<
  typeof flowSnapshotDataToSnapshotPayload
>

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestQueryClientProvider'
  return Wrapper
}

const DRAFT = { tag: 'draft' } as unknown as SnapshotDraftData
const ROUTING = { mode: 'series' } as unknown as ReturnType<typeof flowSnapshotDataToSnapshotPayload>['routing']
const SNAPSHOT_QUIET = { id: 5, name: 'X' } as unknown as SnapshotDetail
const SNAPSHOT_MODE_CHANGED = {
  id: 5,
  name: 'X',
  routing_mode_changed_live: true,
} as unknown as SnapshotDetail

describe('useSnapshotEditorUpdateLiveRoutingMutation', () => {
  beforeEach(() => {
    mockedUpdateRouting.mockReset()
    mockedFlowToPayload.mockReset()
    mockedFlowToPayload.mockReturnValue({ routing: ROUTING } as never)
  })

  it('updates routing, syncs caches, sets live-applied, no toast when mode unchanged', async () => {
    mockedUpdateRouting.mockResolvedValueOnce(SNAPSHOT_QUIET as never)
    const syncSnapshotDetailCaches = jest.fn()
    const setRoutingLiveApplyState = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUpdateLiveRoutingMutation({
          syncSnapshotDetailCaches,
          setRoutingLiveApplyState,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.updateLiveSnapshotRoutingMutation.mutate({
        snapshotId: 5,
        nextDraft: DRAFT,
      })
    })

    await waitFor(() =>
      expect(result.current.updateLiveSnapshotRoutingMutation.isSuccess).toBe(true),
    )
    expect(mockedFlowToPayload).toHaveBeenCalledWith(DRAFT)
    expect(mockedUpdateRouting).toHaveBeenCalledWith(5, ROUTING)
    expect(syncSnapshotDetailCaches).toHaveBeenCalledWith(SNAPSHOT_QUIET, {
      updateAuthorityActiveSnapshot: true,
    })
    expect(setRoutingLiveApplyState).toHaveBeenCalledWith('live-applied')
    expect(pushToast).not.toHaveBeenCalled()
  })

  it('toasts when routing_mode_changed_live is true', async () => {
    mockedUpdateRouting.mockResolvedValueOnce(SNAPSHOT_MODE_CHANGED as never)
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUpdateLiveRoutingMutation({
          syncSnapshotDetailCaches: jest.fn(),
          setRoutingLiveApplyState: jest.fn(),
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.updateLiveSnapshotRoutingMutation.mutate({
        snapshotId: 5,
        nextDraft: DRAFT,
      })
    })

    await waitFor(() =>
      expect(result.current.updateLiveSnapshotRoutingMutation.isSuccess).toBe(true),
    )
    expect(pushToast).toHaveBeenCalledWith('Live routing mode updated', 'success')
  })

  it('on error, resets state to idle and toasts the failure', async () => {
    mockedUpdateRouting.mockRejectedValueOnce(new Error('routing-boom'))
    const syncSnapshotDetailCaches = jest.fn()
    const setRoutingLiveApplyState = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUpdateLiveRoutingMutation({
          syncSnapshotDetailCaches,
          setRoutingLiveApplyState,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.updateLiveSnapshotRoutingMutation.mutate({
        snapshotId: 5,
        nextDraft: DRAFT,
      })
    })

    await waitFor(() =>
      expect(result.current.updateLiveSnapshotRoutingMutation.isError).toBe(true),
    )
    expect(syncSnapshotDetailCaches).not.toHaveBeenCalled()
    expect(setRoutingLiveApplyState).toHaveBeenCalledWith('idle')
    expect(pushToast).toHaveBeenCalledWith('routing-boom', 'error')
  })
})
