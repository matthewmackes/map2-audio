/**
 * T2472 mutation extraction slice 3 — undo/redo mutations parity test.
 *
 * Asserts the four observable invariants of the extracted hook:
 *   - undo success calls applyDraftPreview with the draft returned by
 *     snapshotUndoRedo.undo() and toasts 'Undo successful'.
 *   - undo error rolls the cursor back via snapshotUndoRedo.redo() and
 *     toasts the failure.
 *   - redo success calls applyDraftPreview with the draft returned by
 *     snapshotUndoRedo.redo() and toasts 'Redo successful'.
 *   - redo error rolls the cursor back via snapshotUndoRedo.undo() and
 *     toasts the failure.
 *   - undo/redo with no available draft fail with the expected
 *     'Nothing to undo/redo' message.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useSnapshotEditorUndoRedoMutations } from './useSnapshotEditorUndoRedoMutations'
import type { SnapshotEditorUndoRedoState } from '../../components/SnapshotEditor/useSnapshotEditorUndoRedo'
import type { SnapshotDraftData } from '../../../map2/types'

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

const FAKE_DRAFT = { snapshot_data: { chains: [] } } as unknown as SnapshotDraftData

function makeUndoRedo(overrides: Partial<SnapshotEditorUndoRedoState> = {}): SnapshotEditorUndoRedoState {
  return {
    canUndo: true,
    canRedo: true,
    current: null,
    push: jest.fn(),
    undo: jest.fn(() => FAKE_DRAFT),
    redo: jest.fn(() => FAKE_DRAFT),
    reset: jest.fn(),
    clear: jest.fn(),
    ...overrides,
  }
}

describe('useSnapshotEditorUndoRedoMutations', () => {
  it('undo success applies the draft and toasts success', async () => {
    const undoRedo = makeUndoRedo()
    const applyDraftPreview = jest.fn().mockResolvedValueOnce({})
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUndoRedoMutations({
          snapshotUndoRedo: undoRedo,
          applyDraftPreview,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.undoMutation.mutate()
    })

    await waitFor(() => expect(result.current.undoMutation.isSuccess).toBe(true))
    expect(undoRedo.undo).toHaveBeenCalled()
    expect(applyDraftPreview).toHaveBeenCalledWith(FAKE_DRAFT)
    expect(pushToast).toHaveBeenCalledWith('Undo successful', 'success')
    expect(undoRedo.redo).not.toHaveBeenCalled()
  })

  it('undo error rolls cursor forward and toasts the failure', async () => {
    const undoRedo = makeUndoRedo()
    const applyDraftPreview = jest.fn().mockRejectedValueOnce(new Error('apply-fail'))
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUndoRedoMutations({
          snapshotUndoRedo: undoRedo,
          applyDraftPreview,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.undoMutation.mutate()
    })

    await waitFor(() => expect(result.current.undoMutation.isError).toBe(true))
    expect(undoRedo.redo).toHaveBeenCalledTimes(1)
    expect(pushToast.mock.calls[0][0]).toContain('Undo failed')
    expect(pushToast.mock.calls[0][1]).toBe('error')
  })

  it('undo with no draft fails with "Nothing to undo"', async () => {
    const undoRedo = makeUndoRedo({ undo: jest.fn(() => null) })
    const applyDraftPreview = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUndoRedoMutations({
          snapshotUndoRedo: undoRedo,
          applyDraftPreview,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.undoMutation.mutate()
    })

    await waitFor(() => expect(result.current.undoMutation.isError).toBe(true))
    expect(applyDraftPreview).not.toHaveBeenCalled()
    expect(result.current.undoMutation.error?.message).toBe('Nothing to undo')
  })

  it('redo success applies the draft and toasts success', async () => {
    const undoRedo = makeUndoRedo()
    const applyDraftPreview = jest.fn().mockResolvedValueOnce({})
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUndoRedoMutations({
          snapshotUndoRedo: undoRedo,
          applyDraftPreview,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.redoMutation.mutate()
    })

    await waitFor(() => expect(result.current.redoMutation.isSuccess).toBe(true))
    expect(undoRedo.redo).toHaveBeenCalled()
    expect(applyDraftPreview).toHaveBeenCalledWith(FAKE_DRAFT)
    expect(pushToast).toHaveBeenCalledWith('Redo successful', 'success')
    expect(undoRedo.undo).not.toHaveBeenCalled()
  })

  it('redo error rolls cursor backward and toasts the failure', async () => {
    const undoRedo = makeUndoRedo()
    const applyDraftPreview = jest.fn().mockRejectedValueOnce(new Error('apply-fail'))
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUndoRedoMutations({
          snapshotUndoRedo: undoRedo,
          applyDraftPreview,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.redoMutation.mutate()
    })

    await waitFor(() => expect(result.current.redoMutation.isError).toBe(true))
    expect(undoRedo.undo).toHaveBeenCalledTimes(1)
    expect(pushToast.mock.calls[0][0]).toContain('Redo failed')
    expect(pushToast.mock.calls[0][1]).toBe('error')
  })

  it('redo with no draft fails with "Nothing to redo"', async () => {
    const undoRedo = makeUndoRedo({ redo: jest.fn(() => null) })
    const applyDraftPreview = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorUndoRedoMutations({
          snapshotUndoRedo: undoRedo,
          applyDraftPreview,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.redoMutation.mutate()
    })

    await waitFor(() => expect(result.current.redoMutation.isError).toBe(true))
    expect(applyDraftPreview).not.toHaveBeenCalled()
    expect(result.current.redoMutation.error?.message).toBe('Nothing to redo')
  })
})
