/**
 * T2472 mutation extraction slice 8 — chain-rename mutation parity test.
 *
 * Asserts behavioral parity for the renameMutation:
 *   - cluster path (no active snapshot) calls chainsApi.rename, invalidates,
 *     dirties, closes modal, clears the input, toasts.
 *   - snapshot path calls snapshotsApi.renameChain with the resolved
 *     snapshot chain id and syncs via syncSnapshotMutationResult.
 *   - api error toasts the failure.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { chainsApi } from '../../../map2/api'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorChainRenameMutation } from './useSnapshotEditorChainRenameMutation'
import type { SnapshotDetail } from '../../../map2/types'

jest.mock('../../../map2/api', () => ({
  chainsApi: {
    rename: jest.fn(),
  },
}))

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    renameChain: jest.fn(),
  },
}))

const mockedChainsRename = chainsApi.rename as jest.MockedFunction<typeof chainsApi.rename>
const mockedSnapRenameChain = snapshotsApi.renameChain as jest.MockedFunction<
  typeof snapshotsApi.renameChain
>

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

interface Setters {
  requireSnapshotChainId: jest.Mock
  syncSnapshotMutationResult: jest.Mock
  markSnapshotsDirty: jest.Mock
  setShowRenameChainModal: jest.Mock
  setRenameChainName: jest.Mock
  pushToast: jest.Mock
}

function makeSetters(): Setters {
  return {
    requireSnapshotChainId: jest.fn(() => 99),
    syncSnapshotMutationResult: jest.fn(),
    markSnapshotsDirty: jest.fn(),
    setShowRenameChainModal: jest.fn(),
    setRenameChainName: jest.fn(),
    pushToast: jest.fn(),
  }
}

const SNAPSHOT_42 = { id: 42 } as unknown as SnapshotDetail

describe('useSnapshotEditorChainRenameMutation', () => {
  beforeEach(() => {
    mockedChainsRename.mockReset()
    mockedSnapRenameChain.mockReset()
  })

  it('cluster path calls chainsApi.rename, invalidates, dirties, closes modal, clears, toasts', async () => {
    mockedChainsRename.mockResolvedValueOnce({ status: 'ok', chain_id: 7, name: 'Solo' } as never)
    const setters = makeSetters()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainRenameMutation({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.renameMutation.mutate({ chainId: 7, name: 'Solo' })
    })

    await waitFor(() => expect(result.current.renameMutation.isSuccess).toBe(true))
    expect(mockedChainsRename).toHaveBeenCalledWith(7, 'Solo')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chains'] })
    expect(setters.markSnapshotsDirty).toHaveBeenCalled()
    expect(setters.setShowRenameChainModal).toHaveBeenCalledWith(false)
    expect(setters.setRenameChainName).toHaveBeenCalledWith('')
    expect(setters.pushToast).toHaveBeenCalledWith('Chain renamed', 'success')
    expect(setters.syncSnapshotMutationResult).not.toHaveBeenCalled()
  })

  it('snapshot path resolves snapshot chain id and syncs via syncSnapshotMutationResult', async () => {
    mockedSnapRenameChain.mockResolvedValueOnce(SNAPSHOT_42 as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainRenameMutation({
          activeSnapshot: SNAPSHOT_42,
          ...setters,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.renameMutation.mutate({ chainId: 7, name: 'Solo' })
    })

    await waitFor(() => expect(result.current.renameMutation.isSuccess).toBe(true))
    expect(setters.requireSnapshotChainId).toHaveBeenCalledWith(7)
    expect(mockedSnapRenameChain).toHaveBeenCalledWith(42, 99, 'Solo')
    expect(setters.syncSnapshotMutationResult).toHaveBeenCalledWith(SNAPSHOT_42)
  })

  it('error toasts the failure', async () => {
    mockedChainsRename.mockRejectedValueOnce(new Error('rename-boom'))
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainRenameMutation({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.renameMutation.mutate({ chainId: 7, name: 'x' })
    })

    await waitFor(() => expect(result.current.renameMutation.isError).toBe(true))
    expect(setters.pushToast.mock.calls[0][0]).toContain('Failed to rename')
    expect(setters.markSnapshotsDirty).not.toHaveBeenCalled()
  })
})
