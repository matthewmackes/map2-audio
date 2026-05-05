/**
 * T2472 mutation extraction slice 6 — toggle-lock mutation parity test.
 *
 * Asserts behavioral parity for toggleActiveSnapshotLockMutation:
 *   - flip success calls snapshotsApi.update with !is_locked, syncs
 *     detail caches, invalidates the snapshots list, toasts the new
 *     lock state.
 *   - no-active-snapshot fails with "No active snapshot to lock".
 *   - api error toasts the failure.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorLockMutation } from './useSnapshotEditorLockMutation'
import type { SnapshotDetail } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    update: jest.fn(),
  },
}))

const mockedUpdate = snapshotsApi.update as jest.MockedFunction<typeof snapshotsApi.update>

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestQueryClientProvider'
  return { Wrapper, client }
}

const SNAPSHOT_42_UNLOCKED = { id: 42, is_locked: false } as unknown as SnapshotDetail
const SNAPSHOT_42_LOCKED = { id: 42, is_locked: true } as unknown as SnapshotDetail

describe('useSnapshotEditorLockMutation', () => {
  beforeEach(() => {
    mockedUpdate.mockReset()
  })

  it('lock success calls update with !is_locked, syncs caches, toasts "Snapshot locked"', async () => {
    mockedUpdate.mockResolvedValueOnce({ snapshot: SNAPSHOT_42_LOCKED } as never)
    const sync = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () =>
        useSnapshotEditorLockMutation({
          activeSnapshot: SNAPSHOT_42_UNLOCKED,
          syncSnapshotDetailCaches: sync,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.toggleActiveSnapshotLockMutation.mutate()
    })

    await waitFor(() =>
      expect(result.current.toggleActiveSnapshotLockMutation.isSuccess).toBe(true)
    )
    expect(mockedUpdate).toHaveBeenCalledWith(42, { is_locked: true })
    expect(sync).toHaveBeenCalledWith(SNAPSHOT_42_LOCKED)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshots'] })
    expect(pushToast).toHaveBeenCalledWith('Snapshot locked', 'success')
  })

  it('unlock success toasts "Snapshot unlocked"', async () => {
    mockedUpdate.mockResolvedValueOnce({ snapshot: SNAPSHOT_42_UNLOCKED } as never)
    const sync = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorLockMutation({
          activeSnapshot: SNAPSHOT_42_LOCKED,
          syncSnapshotDetailCaches: sync,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.toggleActiveSnapshotLockMutation.mutate()
    })

    await waitFor(() =>
      expect(result.current.toggleActiveSnapshotLockMutation.isSuccess).toBe(true)
    )
    expect(mockedUpdate).toHaveBeenCalledWith(42, { is_locked: false })
    expect(pushToast).toHaveBeenCalledWith('Snapshot unlocked', 'success')
  })

  it('no active snapshot fails with "No active snapshot to lock"', async () => {
    const sync = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorLockMutation({
          activeSnapshot: null,
          syncSnapshotDetailCaches: sync,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.toggleActiveSnapshotLockMutation.mutate()
    })

    await waitFor(() =>
      expect(result.current.toggleActiveSnapshotLockMutation.isError).toBe(true)
    )
    expect(mockedUpdate).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith('No active snapshot to lock', 'error')
  })

  it('api error toasts the failure', async () => {
    mockedUpdate.mockRejectedValueOnce(new Error('lock-boom'))
    const sync = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorLockMutation({
          activeSnapshot: SNAPSHOT_42_UNLOCKED,
          syncSnapshotDetailCaches: sync,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.toggleActiveSnapshotLockMutation.mutate()
    })

    await waitFor(() =>
      expect(result.current.toggleActiveSnapshotLockMutation.isError).toBe(true)
    )
    expect(pushToast).toHaveBeenCalledWith('lock-boom', 'error')
  })
})
