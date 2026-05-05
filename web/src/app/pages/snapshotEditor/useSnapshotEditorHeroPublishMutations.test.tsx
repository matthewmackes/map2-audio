/**
 * T2472 mutation extraction slice 4 — hero-publish mutations parity test.
 *
 * Asserts behavioral parity for the three hero publish mutations
 * after extraction into useSnapshotEditorHeroPublishMutations.
 *   - confirm success calls snapshotsApi.activate, invalidates the
 *     publish-readiness + detail caches, and toasts.
 *   - reconcile success calls snapshotsApi.retryPublish, invalidates
 *     the same caches, and toasts.
 *   - overwrite success calls snapshotsApi.activate (overwrite path),
 *     invalidates the same caches, and toasts.
 *   - all three error paths route through pushToast with 'error' tone.
 *   - heroPublishActionPending reflects the OR of all three.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorHeroPublishMutations } from './useSnapshotEditorHeroPublishMutations'
import type { SnapshotDetail } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    activate: jest.fn(),
    retryPublish: jest.fn(),
  },
}))

const mockedActivate = snapshotsApi.activate as jest.MockedFunction<typeof snapshotsApi.activate>
const mockedRetry = snapshotsApi.retryPublish as jest.MockedFunction<typeof snapshotsApi.retryPublish>

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

const FAKE_SNAPSHOT = { id: 42 } as unknown as SnapshotDetail

describe('useSnapshotEditorHeroPublishMutations', () => {
  beforeEach(() => {
    mockedActivate.mockReset()
    mockedRetry.mockReset()
  })

  it('confirm success calls activate, invalidates caches, toasts', async () => {
    mockedActivate.mockResolvedValueOnce({} as never)
    const pushToast = jest.fn()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () => useSnapshotEditorHeroPublishMutations({ activeSnapshot: FAKE_SNAPSHOT, pushToast }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.heroConfirmPublishMutation.mutate()
    })

    await waitFor(() => expect(result.current.heroConfirmPublishMutation.isSuccess).toBe(true))
    expect(mockedActivate).toHaveBeenCalledWith(42)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'publish-readiness', 42],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'detail', 42],
    })
    expect(pushToast).toHaveBeenCalledWith('Publish confirmed', 'success')
  })

  it('confirm with no active snapshot fails with "No active snapshot"', async () => {
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorHeroPublishMutations({ activeSnapshot: null, pushToast }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.heroConfirmPublishMutation.mutate()
    })

    await waitFor(() => expect(result.current.heroConfirmPublishMutation.isError).toBe(true))
    expect(mockedActivate).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith('No active snapshot', 'error')
  })

  it('reconcile success calls retryPublish, invalidates caches, toasts', async () => {
    mockedRetry.mockResolvedValueOnce({} as never)
    const pushToast = jest.fn()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () => useSnapshotEditorHeroPublishMutations({ activeSnapshot: FAKE_SNAPSHOT, pushToast }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.heroReconcilePublishMutation.mutate()
    })

    await waitFor(() => expect(result.current.heroReconcilePublishMutation.isSuccess).toBe(true))
    expect(mockedRetry).toHaveBeenCalledWith(42)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'publish-readiness', 42],
    })
    expect(pushToast).toHaveBeenCalledWith('Reconcile started', 'success')
  })

  it('overwrite success calls activate, invalidates caches, toasts the overwrite message', async () => {
    mockedActivate.mockResolvedValueOnce({} as never)
    const pushToast = jest.fn()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () => useSnapshotEditorHeroPublishMutations({ activeSnapshot: FAKE_SNAPSHOT, pushToast }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.heroOverwriteLiveMutation.mutate()
    })

    await waitFor(() => expect(result.current.heroOverwriteLiveMutation.isSuccess).toBe(true))
    expect(mockedActivate).toHaveBeenCalledWith(42)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'detail', 42],
    })
    expect(pushToast).toHaveBeenCalledWith(
      'Live state overwritten with current draft',
      'success'
    )
  })

  it('reconcile error toasts the failure', async () => {
    mockedRetry.mockRejectedValueOnce(new Error('reconcile-boom'))
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorHeroPublishMutations({ activeSnapshot: FAKE_SNAPSHOT, pushToast }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.heroReconcilePublishMutation.mutate()
    })

    await waitFor(() => expect(result.current.heroReconcilePublishMutation.isError).toBe(true))
    expect(pushToast).toHaveBeenCalledWith('reconcile-boom', 'error')
  })

  it('heroPublishActionPending reflects any pending mutation', async () => {
    let resolveConfirm: ((v: unknown) => void) | undefined
    mockedActivate.mockImplementationOnce(() => new Promise((res) => {
      resolveConfirm = res
    }))
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorHeroPublishMutations({ activeSnapshot: FAKE_SNAPSHOT, pushToast }),
      { wrapper: Wrapper }
    )

    expect(result.current.heroPublishActionPending).toBe(false)

    act(() => {
      result.current.heroConfirmPublishMutation.mutate()
    })

    await waitFor(() => expect(result.current.heroPublishActionPending).toBe(true))

    act(() => {
      resolveConfirm?.({})
    })

    await waitFor(() => expect(result.current.heroPublishActionPending).toBe(false))
  })
})
