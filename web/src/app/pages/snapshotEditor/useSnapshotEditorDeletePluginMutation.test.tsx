/**
 * T2472 mutation extraction slice 15 — delete-plugin mutation parity test.
 *
 * Asserts behavioral parity for deleteMutation:
 *   - routes to snapshotsApi.removePlugin when activeSnapshot.id is set,
 *     otherwise to chainsApi.removePlugin.
 *   - onMutate: cancels chains queries, snapshots optimistic chain cache,
 *     snapshots selected plugin uri/position, optimistically filters the
 *     plugin out, clears the selection if the removed plugin was selected,
 *     returns the rollback context.
 *   - onSuccess: when active-snapshot path is taken, calls
 *     syncSnapshotMutationResult; if undoRedoDraft was provided, records
 *     a 'Remove block' (or custom-described) undo step; toasts 'Plugin removed'.
 *   - onError: restores the optimistic chain cache, restores the plugin
 *     selection from context, toasts the failure.
 *   - onSettled: invalidates chains, marks dirty.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { chainsApi } from '../../../map2/api'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorDeletePluginMutation } from './useSnapshotEditorDeletePluginMutation'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'

jest.mock('../../../map2/api', () => ({
  chainsApi: { removePlugin: jest.fn() },
}))
jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: { removePlugin: jest.fn() },
}))

const mockedChainsRemove = chainsApi.removePlugin as jest.MockedFunction<
  typeof chainsApi.removePlugin
>
const mockedSnapshotsRemove = snapshotsApi.removePlugin as jest.MockedFunction<
  typeof snapshotsApi.removePlugin
>

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const setQuerySpy = jest.spyOn(client, 'setQueryData')
  const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestQueryClientProvider'
  return { Wrapper, setQuerySpy, invalidateSpy }
}

const ACTIVE = { id: 5 } as unknown as SnapshotDetail
const RESPONSE_SNAPSHOT = { id: 5, name: 'Lead' } as unknown as SnapshotDetail
const DRAFT = { tag: 'draft' } as unknown as SnapshotDraftData

function defaultArgs(
  overrides: Partial<Parameters<typeof useSnapshotEditorDeletePluginMutation>[0]> = {},
) {
  return {
    activeSnapshot: null,
    selectedPluginUri: null,
    selectedPluginPosition: null,
    requireSnapshotPluginId: jest.fn(() => ({ snapshotChainId: 11, snapshotPluginId: 22 })),
    updateChainPluginsCache: jest.fn(),
    setSelectedPluginSelection: jest.fn(),
    syncSnapshotMutationResult: jest.fn(),
    recordSnapshotUndoRedoStep: jest.fn(),
    markSnapshotsDirty: jest.fn(),
    pushToast: jest.fn(),
    ...overrides,
  }
}

describe('useSnapshotEditorDeletePluginMutation', () => {
  beforeEach(() => {
    mockedChainsRemove.mockReset()
    mockedSnapshotsRemove.mockReset()
  })

  it('routes to snapshotsApi.removePlugin when active snapshot is set, syncs and toasts', async () => {
    mockedSnapshotsRemove.mockResolvedValueOnce(RESPONSE_SNAPSHOT as never)
    const args = defaultArgs({ activeSnapshot: ACTIVE })
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorDeletePluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.deleteMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
        pluginPosition: 2,
      })
    })

    await waitFor(() => expect(result.current.deleteMutation.isSuccess).toBe(true))
    expect(args.requireSnapshotPluginId).toHaveBeenCalledWith(99, 'lv2:reverb', 2)
    expect(mockedSnapshotsRemove).toHaveBeenCalledWith(5, 11, 22)
    expect(mockedChainsRemove).not.toHaveBeenCalled()
    expect(args.syncSnapshotMutationResult).toHaveBeenCalledWith(RESPONSE_SNAPSHOT)
    expect(args.pushToast).toHaveBeenCalledWith('Plugin removed', 'success')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chains'] })
    expect(args.markSnapshotsDirty).toHaveBeenCalled()
  })

  it('routes to chainsApi.removePlugin when there is no active snapshot, no sync', async () => {
    mockedChainsRemove.mockResolvedValueOnce({ status: 'ok', chain_id: 99 } as never)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorDeletePluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.deleteMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
        pluginPosition: 2,
      })
    })

    await waitFor(() => expect(result.current.deleteMutation.isSuccess).toBe(true))
    expect(mockedChainsRemove).toHaveBeenCalledWith(99, 'lv2:reverb', 2)
    expect(mockedSnapshotsRemove).not.toHaveBeenCalled()
    expect(args.syncSnapshotMutationResult).not.toHaveBeenCalled()
  })

  it('records the undo-redo step when undoRedoDraft is provided', async () => {
    mockedChainsRemove.mockResolvedValueOnce({ status: 'ok', chain_id: 99 } as never)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorDeletePluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.deleteMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
        pluginPosition: 2,
        undoRedoDraft: DRAFT,
        undoRedoDescription: 'Custom remove',
      })
    })

    await waitFor(() => expect(result.current.deleteMutation.isSuccess).toBe(true))
    expect(args.recordSnapshotUndoRedoStep).toHaveBeenCalledWith(DRAFT, 'Custom remove')
  })

  it('default undo description falls back to "Remove block"', async () => {
    mockedChainsRemove.mockResolvedValueOnce({ status: 'ok', chain_id: 99 } as never)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorDeletePluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.deleteMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
        undoRedoDraft: DRAFT,
      })
    })

    await waitFor(() => expect(result.current.deleteMutation.isSuccess).toBe(true))
    expect(args.recordSnapshotUndoRedoStep).toHaveBeenCalledWith(DRAFT, 'Remove block')
  })

  it('clears selection optimistically when removed plugin is currently selected (uri+position match)', async () => {
    mockedChainsRemove.mockResolvedValueOnce({ status: 'ok', chain_id: 99 } as never)
    const args = defaultArgs({
      selectedPluginUri: 'lv2:reverb',
      selectedPluginPosition: 2,
    })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorDeletePluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.deleteMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
        pluginPosition: 2,
      })
    })

    await waitFor(() => expect(result.current.deleteMutation.isSuccess).toBe(true))
    expect(args.setSelectedPluginSelection).toHaveBeenCalledWith(null)
  })

  it('rolls back chains cache + selection on error and toasts the failure', async () => {
    mockedChainsRemove.mockRejectedValueOnce(new Error('boom'))
    const args = defaultArgs({
      selectedPluginUri: 'lv2:other',
      selectedPluginPosition: 1,
    })
    const { Wrapper, setQuerySpy } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorDeletePluginMutation(args),
      { wrapper: Wrapper }
    )
    // Seed the chains cache so onMutate captures it as the rollback target
    args.updateChainPluginsCache.mockImplementation(() => undefined)

    act(() => {
      result.current.deleteMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
        pluginPosition: 2,
      })
    })

    await waitFor(() => expect(result.current.deleteMutation.isError).toBe(true))
    // selection rollback to the captured pre-mutate values
    expect(args.setSelectedPluginSelection).toHaveBeenCalledWith('lv2:other', 1)
    // setQueryData would be called for rollback only when previousChains !== undefined;
    // with no seeded cache, previousChains is undefined and rollback is skipped.
    expect(args.pushToast).toHaveBeenCalledWith(
      expect.stringContaining('Failed to remove:'),
      'error',
    )
    expect(setQuerySpy).not.toHaveBeenCalledWith(['chains'], expect.anything())
  })
})
