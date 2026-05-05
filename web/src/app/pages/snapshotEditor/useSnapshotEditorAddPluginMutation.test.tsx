/**
 * T2472 mutation extraction slice 16 — add-plugin mutation parity test.
 *
 * Asserts behavioral parity for addPluginMutation:
 *   - routes to snapshotsApi.addPlugin when activeSnapshot.id is set,
 *     using requireSnapshotChainId + pluginMeta name.
 *   - routes to chainsApi.addPlugin otherwise.
 *   - onMutate: cancels chains, captures rollback state for chains cache,
 *     selection, plugin-browser open state, search query, optimistically
 *     appends the plugin (using meta + computed next position), closes
 *     the browser and clears the search.
 *   - onSuccess: when active-snapshot path used, calls syncSnapshotMutationResult;
 *     if undoRedoDraft was provided, records 'Add block' (or custom)
 *     undo step; toasts 'Plugin added'.
 *   - onError: rolls back all four pieces of context, toasts the failure.
 *   - onSettled: invalidates chains, marks dirty.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { chainsApi } from '../../../map2/api'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorAddPluginMutation } from './useSnapshotEditorAddPluginMutation'
import type { Plugin, SnapshotDetail, SnapshotDraftData } from '../../../map2/types'

jest.mock('../../../map2/api', () => ({
  chainsApi: { addPlugin: jest.fn() },
}))
jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: { addPlugin: jest.fn() },
}))

const mockedChainsAdd = chainsApi.addPlugin as jest.MockedFunction<typeof chainsApi.addPlugin>
const mockedSnapshotsAdd = snapshotsApi.addPlugin as jest.MockedFunction<typeof snapshotsApi.addPlugin>

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

const ACTIVE = { id: 5 } as unknown as SnapshotDetail
const RESPONSE_SNAPSHOT = { id: 5, name: 'Lead' } as unknown as SnapshotDetail
const DRAFT = { tag: 'draft' } as unknown as SnapshotDraftData
const REVERB_META: Plugin = {
  uri: 'lv2:reverb',
  name: 'Reverb',
  in_ports: 2,
  out_ports: 2,
  format: 'lv2',
} as unknown as Plugin

function defaultArgs(overrides: Partial<Parameters<typeof useSnapshotEditorAddPluginMutation>[0]> = {}) {
  return {
    activeSnapshot: null,
    selectedPluginUri: null,
    selectedPluginPosition: null,
    showPluginBrowser: true,
    pluginSearchQuery: 'rev',
    pluginMeta: { 'lv2:reverb': REVERB_META },
    requireSnapshotChainId: jest.fn(() => 11),
    updateChainPluginsCache: jest.fn(),
    setSelectedPluginSelection: jest.fn(),
    setShowPluginBrowser: jest.fn(),
    setPluginSearchQuery: jest.fn(),
    syncSnapshotMutationResult: jest.fn(),
    recordSnapshotUndoRedoStep: jest.fn(),
    markSnapshotsDirty: jest.fn(),
    pushToast: jest.fn(),
    ...overrides,
  }
}

describe('useSnapshotEditorAddPluginMutation', () => {
  beforeEach(() => {
    mockedChainsAdd.mockReset()
    mockedSnapshotsAdd.mockReset()
  })

  it('routes to snapshotsApi.addPlugin when active snapshot is set, syncs and toasts', async () => {
    mockedSnapshotsAdd.mockResolvedValueOnce(RESPONSE_SNAPSHOT as never)
    const args = defaultArgs({ activeSnapshot: ACTIVE })
    const { Wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorAddPluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.addPluginMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
      })
    })

    await waitFor(() => expect(result.current.addPluginMutation.isSuccess).toBe(true))
    expect(args.requireSnapshotChainId).toHaveBeenCalledWith(99)
    expect(mockedSnapshotsAdd).toHaveBeenCalledWith(5, 11, {
      plugin_uri: 'lv2:reverb',
      plugin_name: 'Reverb',
      loader_state: {},
    })
    expect(mockedChainsAdd).not.toHaveBeenCalled()
    expect(args.syncSnapshotMutationResult).toHaveBeenCalledWith(RESPONSE_SNAPSHOT)
    expect(args.pushToast).toHaveBeenCalledWith('Plugin added', 'success')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chains'] })
    expect(args.markSnapshotsDirty).toHaveBeenCalled()
  })

  it('routes to chainsApi.addPlugin when there is no active snapshot, no sync', async () => {
    mockedChainsAdd.mockResolvedValueOnce({
      status: 'ok',
      chain_id: 99,
      plugin: 'lv2:reverb',
      plugins_count: 3,
    } as never)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorAddPluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.addPluginMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
      })
    })

    await waitFor(() => expect(result.current.addPluginMutation.isSuccess).toBe(true))
    expect(mockedChainsAdd).toHaveBeenCalledWith(99, 'lv2:reverb')
    expect(mockedSnapshotsAdd).not.toHaveBeenCalled()
    expect(args.syncSnapshotMutationResult).not.toHaveBeenCalled()
  })

  it('onMutate appends the optimistic plugin, closes the browser, and clears the search', async () => {
    mockedChainsAdd.mockResolvedValueOnce({
      status: 'ok',
      chain_id: 99,
      plugin: 'lv2:reverb',
      plugins_count: 1,
    } as never)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorAddPluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.addPluginMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
      })
    })

    await waitFor(() => expect(result.current.addPluginMutation.isSuccess).toBe(true))
    // updateChainPluginsCache was called with chainId + an updater function.
    expect(args.updateChainPluginsCache).toHaveBeenCalledWith(99, expect.any(Function))
    // Test the updater shape: empty list -> single entry at position 0
    const [, updater] = (args.updateChainPluginsCache as jest.Mock).mock.calls[0]
    const next = updater([])
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      uri: 'lv2:reverb',
      name: 'Reverb',
      position: 0,
      bypassed: false,
      parameters: {},
      in_ports: 2,
      out_ports: 2,
      format: 'lv2',
    })
    // Existing list -> appended at max(position)+1
    const next2 = updater([{ uri: 'lv2:eq', position: 0 }, { uri: 'lv2:gain', position: 2 }] as never)
    expect(next2[2].position).toBe(3)
    expect(args.setShowPluginBrowser).toHaveBeenCalledWith(false)
    expect(args.setPluginSearchQuery).toHaveBeenCalledWith('')
  })

  it('falls back to plugin uri when meta is missing', async () => {
    mockedChainsAdd.mockResolvedValueOnce({} as never)
    const args = defaultArgs({ pluginMeta: {} })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorAddPluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.addPluginMutation.mutate({ chainId: 99, pluginUri: 'lv2:unknown' })
    })

    await waitFor(() => expect(result.current.addPluginMutation.isSuccess).toBe(true))
    const [, updater] = (args.updateChainPluginsCache as jest.Mock).mock.calls[0]
    const next = updater([])
    expect(next[0].name).toBe('lv2:unknown')
  })

  it('records the undo step with custom description if provided', async () => {
    mockedChainsAdd.mockResolvedValueOnce({} as never)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorAddPluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.addPluginMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
        undoRedoDraft: DRAFT,
        undoRedoDescription: 'Custom add',
      })
    })

    await waitFor(() => expect(result.current.addPluginMutation.isSuccess).toBe(true))
    expect(args.recordSnapshotUndoRedoStep).toHaveBeenCalledWith(DRAFT, 'Custom add')
  })

  it('default undo description falls back to "Add block"', async () => {
    mockedChainsAdd.mockResolvedValueOnce({} as never)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorAddPluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.addPluginMutation.mutate({
        chainId: 99,
        pluginUri: 'lv2:reverb',
        undoRedoDraft: DRAFT,
      })
    })

    await waitFor(() => expect(result.current.addPluginMutation.isSuccess).toBe(true))
    expect(args.recordSnapshotUndoRedoStep).toHaveBeenCalledWith(DRAFT, 'Add block')
  })

  it('rolls back chains cache + selection + browser state on error and toasts', async () => {
    mockedChainsAdd.mockRejectedValueOnce(new Error('boom'))
    const args = defaultArgs({
      selectedPluginUri: 'lv2:other',
      selectedPluginPosition: 1,
      showPluginBrowser: true,
      pluginSearchQuery: 'rev',
    })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorAddPluginMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.addPluginMutation.mutate({ chainId: 99, pluginUri: 'lv2:reverb' })
    })

    await waitFor(() => expect(result.current.addPluginMutation.isError).toBe(true))
    expect(args.setSelectedPluginSelection).toHaveBeenCalledWith('lv2:other', 1)
    // setShowPluginBrowser fires twice: false (onMutate), then true (rollback)
    expect(args.setShowPluginBrowser).toHaveBeenCalledWith(true)
    expect(args.setPluginSearchQuery).toHaveBeenCalledWith('rev')
    expect(args.pushToast).toHaveBeenCalledWith(expect.stringContaining('Failed to add:'), 'error')
  })
})
