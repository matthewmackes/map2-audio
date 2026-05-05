/**
 * T2472 mutation extraction slice 9 — open-editor-snapshot mutation parity test.
 *
 * Asserts behavioral parity for openEditorSnapshotMutation:
 *   - opens via snapshotsApi.openDraft and on success either clears or
 *     sets the editor snapshot override depending on whether the loaded
 *     snapshot equals the control-plane authority.
 *   - hydrates the editor with the canonical "Loaded: <name>" toast and
 *     resetSelectedBlock=true.
 *   - error toasts the failure.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorOpenEditorSnapshotMutation } from './useSnapshotEditorOpenEditorSnapshotMutation'
import type { SnapshotDetail } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    openDraft: jest.fn(),
  },
}))

const mockedOpenDraft = snapshotsApi.openDraft as jest.MockedFunction<typeof snapshotsApi.openDraft>

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

const SNAPSHOT_42 = { id: 42, name: 'Lead' } as unknown as SnapshotDetail
const SNAPSHOT_99 = { id: 99, name: 'Other' } as unknown as SnapshotDetail

describe('useSnapshotEditorOpenEditorSnapshotMutation', () => {
  beforeEach(() => {
    mockedOpenDraft.mockReset()
  })

  it('clears override when loaded snapshot equals control plane authority', async () => {
    mockedOpenDraft.mockResolvedValueOnce({ snapshot: SNAPSHOT_42 } as never)
    const setEditorSnapshotOverride = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorOpenEditorSnapshotMutation({
          controlPlaneSnapshot: SNAPSHOT_42,
          setEditorSnapshotOverride,
          hydrateEditorFromSnapshot,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.openEditorSnapshotMutation.mutate(42)
    })

    await waitFor(() => expect(result.current.openEditorSnapshotMutation.isSuccess).toBe(true))
    expect(mockedOpenDraft).toHaveBeenCalledWith(42)
    expect(setEditorSnapshotOverride).toHaveBeenCalledWith(null)
    expect(hydrateEditorFromSnapshot).toHaveBeenCalledWith(SNAPSHOT_42, {
      toastMessage: 'Loaded: Lead',
      resetSelectedBlock: true,
    })
  })

  it('sets override when loaded snapshot differs from control plane authority', async () => {
    mockedOpenDraft.mockResolvedValueOnce({ snapshot: SNAPSHOT_99 } as never)
    const setEditorSnapshotOverride = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorOpenEditorSnapshotMutation({
          controlPlaneSnapshot: SNAPSHOT_42,
          setEditorSnapshotOverride,
          hydrateEditorFromSnapshot,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.openEditorSnapshotMutation.mutate(99)
    })

    await waitFor(() => expect(result.current.openEditorSnapshotMutation.isSuccess).toBe(true))
    expect(setEditorSnapshotOverride).toHaveBeenCalledWith(SNAPSHOT_99)
    expect(hydrateEditorFromSnapshot).toHaveBeenCalledWith(SNAPSHOT_99, {
      toastMessage: 'Loaded: Other',
      resetSelectedBlock: true,
    })
  })

  it('error toasts the failure', async () => {
    mockedOpenDraft.mockRejectedValueOnce(new Error('open-boom'))
    const setEditorSnapshotOverride = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorOpenEditorSnapshotMutation({
          controlPlaneSnapshot: null,
          setEditorSnapshotOverride,
          hydrateEditorFromSnapshot,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.openEditorSnapshotMutation.mutate(7)
    })

    await waitFor(() => expect(result.current.openEditorSnapshotMutation.isError).toBe(true))
    expect(pushToast).toHaveBeenCalledWith('open-boom', 'error')
    expect(hydrateEditorFromSnapshot).not.toHaveBeenCalled()
  })
})
