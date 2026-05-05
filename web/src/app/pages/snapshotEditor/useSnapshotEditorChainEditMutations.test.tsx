/**
 * T2472 mutation extraction slice 7 — chain-edit mutations parity test.
 *
 * Asserts behavioral parity for the reorder + bypass mutations after
 * extraction into useSnapshotEditorChainEditMutations.
 *
 * Coverage:
 *   - reorder: snapshot path vs cluster path; undoRedoDraft branch vs
 *     markSnapshotsDirty branch; setReorderPreview(null) settled hook;
 *     error toast.
 *   - bypass: snapshot path vs cluster path; undoRedoDraft branch with
 *     custom description vs default 'Bypass block'/'Enable block'; error
 *     toast.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { chainsApi } from '../../../map2/api'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorChainEditMutations } from './useSnapshotEditorChainEditMutations'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'

jest.mock('../../../map2/api', () => ({
  chainsApi: {
    reorderPlugins: jest.fn(),
    togglePluginBypass: jest.fn(),
  },
}))

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    reorderPlugins: jest.fn(),
    setPluginBypass: jest.fn(),
  },
}))

const mockedChainsReorder = chainsApi.reorderPlugins as jest.MockedFunction<typeof chainsApi.reorderPlugins>
const mockedChainsBypass = chainsApi.togglePluginBypass as jest.MockedFunction<typeof chainsApi.togglePluginBypass>
const mockedSnapReorder = snapshotsApi.reorderPlugins as jest.MockedFunction<typeof snapshotsApi.reorderPlugins>
const mockedSnapBypass = snapshotsApi.setPluginBypass as jest.MockedFunction<typeof snapshotsApi.setPluginBypass>

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
  requireSnapshotPluginOrderIds: jest.Mock
  requireSnapshotPluginId: jest.Mock
  syncSnapshotMutationResult: jest.Mock
  recordSnapshotUndoRedoStep: jest.Mock
  markSnapshotsDirty: jest.Mock
  setReorderPreview: jest.Mock
  pushToast: jest.Mock
}

function makeSetters(): Setters {
  return {
    requireSnapshotPluginOrderIds: jest.fn(() => ({ snapshotChainId: 100, snapshotPluginIds: [1, 2] })),
    requireSnapshotPluginId: jest.fn(() => ({ snapshotChainId: 100, snapshotPluginId: 5 })),
    syncSnapshotMutationResult: jest.fn(),
    recordSnapshotUndoRedoStep: jest.fn(),
    markSnapshotsDirty: jest.fn(),
    setReorderPreview: jest.fn(),
    pushToast: jest.fn(),
  }
}

const SNAPSHOT_42 = { id: 42 } as unknown as SnapshotDetail
const FAKE_DRAFT = { snapshot_data: { chains: [] } } as unknown as SnapshotDraftData

describe('useSnapshotEditorChainEditMutations', () => {
  beforeEach(() => {
    mockedChainsReorder.mockReset()
    mockedChainsBypass.mockReset()
    mockedSnapReorder.mockReset()
    mockedSnapBypass.mockReset()
  })

  it('reorder cluster path (no active snapshot) calls chainsApi.reorderPlugins and markSnapshotsDirty', async () => {
    mockedChainsReorder.mockResolvedValueOnce({ status: 'ok', chain_id: 7, plugins: [] } as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.reorderMutation.mutate({ chainId: 7, pluginOrder: [{ uri: 'a', position: 0 }] })
    })

    await waitFor(() => expect(result.current.reorderMutation.isSuccess).toBe(true))
    expect(mockedChainsReorder).toHaveBeenCalled()
    expect(mockedSnapReorder).not.toHaveBeenCalled()
    expect(setters.markSnapshotsDirty).toHaveBeenCalled()
    expect(setters.recordSnapshotUndoRedoStep).not.toHaveBeenCalled()
    expect(setters.setReorderPreview).toHaveBeenCalledWith(null)
  })

  it('reorder snapshot path calls snapshotsApi.reorderPlugins and syncSnapshotMutationResult', async () => {
    mockedSnapReorder.mockResolvedValueOnce(SNAPSHOT_42 as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: SNAPSHOT_42, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.reorderMutation.mutate({ chainId: 7, pluginOrder: [{ uri: 'a', position: 0 }] })
    })

    await waitFor(() => expect(result.current.reorderMutation.isSuccess).toBe(true))
    expect(mockedSnapReorder).toHaveBeenCalledWith(42, 100, [1, 2])
    expect(setters.requireSnapshotPluginOrderIds).toHaveBeenCalledWith(7, [{ uri: 'a', position: 0 }])
    expect(setters.syncSnapshotMutationResult).toHaveBeenCalledWith(SNAPSHOT_42)
    expect(setters.markSnapshotsDirty).toHaveBeenCalled()
  })

  it('reorder with undoRedoDraft records undo step instead of markSnapshotsDirty', async () => {
    mockedChainsReorder.mockResolvedValueOnce({ status: 'ok', chain_id: 7, plugins: [] } as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.reorderMutation.mutate({
        chainId: 7,
        pluginOrder: [],
        undoRedoDraft: FAKE_DRAFT,
        undoRedoDescription: 'custom desc',
      })
    })

    await waitFor(() => expect(result.current.reorderMutation.isSuccess).toBe(true))
    expect(setters.recordSnapshotUndoRedoStep).toHaveBeenCalledWith(FAKE_DRAFT, 'custom desc')
    expect(setters.markSnapshotsDirty).not.toHaveBeenCalled()
  })

  it('reorder error toasts the failure and still settles setReorderPreview(null)', async () => {
    mockedChainsReorder.mockRejectedValueOnce(new Error('reorder-boom'))
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.reorderMutation.mutate({ chainId: 7, pluginOrder: [] })
    })

    await waitFor(() => expect(result.current.reorderMutation.isError).toBe(true))
    expect(setters.pushToast.mock.calls[0][0]).toContain('Failed to reorder')
    expect(setters.setReorderPreview).toHaveBeenCalledWith(null)
  })

  it('bypass cluster path calls chainsApi.togglePluginBypass with all params', async () => {
    mockedChainsBypass.mockResolvedValueOnce({ status: 'ok', chain_id: 7, plugin: 'a', bypass: true } as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.bypassMutation.mutate({ chainId: 7, pluginUri: 'a', bypass: true, pluginPosition: 3 })
    })

    await waitFor(() => expect(result.current.bypassMutation.isSuccess).toBe(true))
    expect(mockedChainsBypass).toHaveBeenCalledWith(7, 'a', true, 3)
    expect(setters.markSnapshotsDirty).toHaveBeenCalled()
  })

  it('bypass snapshot path calls snapshotsApi.setPluginBypass with snapshot identity', async () => {
    mockedSnapBypass.mockResolvedValueOnce(SNAPSHOT_42 as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: SNAPSHOT_42, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.bypassMutation.mutate({ chainId: 7, pluginUri: 'a', bypass: false })
    })

    await waitFor(() => expect(result.current.bypassMutation.isSuccess).toBe(true))
    expect(mockedSnapBypass).toHaveBeenCalledWith(42, 100, 5, false)
    expect(setters.syncSnapshotMutationResult).toHaveBeenCalledWith(SNAPSHOT_42)
  })

  it('bypass with undoRedoDraft and bypass=true defaults to "Bypass block" description', async () => {
    mockedChainsBypass.mockResolvedValueOnce({ status: 'ok', chain_id: 7, plugin: 'a', bypass: true } as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.bypassMutation.mutate({
        chainId: 7,
        pluginUri: 'a',
        bypass: true,
        undoRedoDraft: FAKE_DRAFT,
      })
    })

    await waitFor(() => expect(result.current.bypassMutation.isSuccess).toBe(true))
    expect(setters.recordSnapshotUndoRedoStep).toHaveBeenCalledWith(FAKE_DRAFT, 'Bypass block')
  })

  it('bypass with undoRedoDraft and bypass=false defaults to "Enable block" description', async () => {
    mockedChainsBypass.mockResolvedValueOnce({ status: 'ok', chain_id: 7, plugin: 'a', bypass: false } as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.bypassMutation.mutate({
        chainId: 7,
        pluginUri: 'a',
        bypass: false,
        undoRedoDraft: FAKE_DRAFT,
      })
    })

    await waitFor(() => expect(result.current.bypassMutation.isSuccess).toBe(true))
    expect(setters.recordSnapshotUndoRedoStep).toHaveBeenCalledWith(FAKE_DRAFT, 'Enable block')
  })

  it('bypass error toasts the failure', async () => {
    mockedChainsBypass.mockRejectedValueOnce(new Error('bypass-boom'))
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorChainEditMutations({ activeSnapshot: null, ...setters }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.bypassMutation.mutate({ chainId: 7, pluginUri: 'a', bypass: true })
    })

    await waitFor(() => expect(result.current.bypassMutation.isError).toBe(true))
    expect(setters.pushToast.mock.calls[0][0]).toContain('Failed to toggle bypass')
  })
})
