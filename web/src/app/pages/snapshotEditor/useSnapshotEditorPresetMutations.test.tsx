/**
 * T2472 mutation extraction slice 2 — preset mutations parity test.
 *
 * Asserts behavioral parity for the save/load/delete preset
 * mutations after extraction into useSnapshotEditorPresetMutations.
 *   - save success calls chainsApi.savePreset, invalidates the
 *     ['chains', 'presets'] cache, closes the modal, clears the name
 *     input, and toasts the new preset name.
 *   - load success calls chainsApi.loadPreset, invalidates the
 *     ['chains'] cache, closes the browser, and toasts.
 *   - delete success calls chainsApi.deletePreset, invalidates the
 *     ['chains', 'presets'] cache, clears the pending-delete target,
 *     and toasts.
 *   - all three error paths route through pushToast with 'error' tone.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { chainsApi } from '../../../map2/api'
import { useSnapshotEditorPresetMutations } from './useSnapshotEditorPresetMutations'

jest.mock('../../../map2/api', () => ({
  chainsApi: {
    savePreset: jest.fn(),
    loadPreset: jest.fn(),
    deletePreset: jest.fn(),
  },
}))

const mockedSave = chainsApi.savePreset as jest.MockedFunction<typeof chainsApi.savePreset>
const mockedLoad = chainsApi.loadPreset as jest.MockedFunction<typeof chainsApi.loadPreset>
const mockedDelete = chainsApi.deletePreset as jest.MockedFunction<typeof chainsApi.deletePreset>

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
  setShowSavePresetModal: jest.Mock
  setSavePresetName: jest.Mock
  setShowPresetBrowser: jest.Mock
  setPresetPendingDelete: jest.Mock
  pushToast: jest.Mock
}

function makeSetters(): Setters {
  return {
    setShowSavePresetModal: jest.fn(),
    setSavePresetName: jest.fn(),
    setShowPresetBrowser: jest.fn(),
    setPresetPendingDelete: jest.fn(),
    pushToast: jest.fn(),
  }
}

describe('useSnapshotEditorPresetMutations', () => {
  beforeEach(() => {
    mockedSave.mockReset()
    mockedLoad.mockReset()
    mockedDelete.mockReset()
  })

  it('save success invalidates presets cache, closes modal, clears name, toasts', async () => {
    mockedSave.mockResolvedValueOnce({} as never)
    const setters = makeSetters()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSnapshotEditorPresetMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.savePresetMutation.mutate({ chainId: 7, name: 'Lead Preset' })
    })

    await waitFor(() => expect(result.current.savePresetMutation.isSuccess).toBe(true))
    expect(mockedSave).toHaveBeenCalledWith(7, 'Lead Preset')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chains', 'presets'] })
    expect(setters.setShowSavePresetModal).toHaveBeenCalledWith(false)
    expect(setters.setSavePresetName).toHaveBeenCalledWith('')
    expect(setters.pushToast).toHaveBeenCalledWith('Preset "Lead Preset" saved', 'success')
  })

  it('save error toasts the failure', async () => {
    mockedSave.mockRejectedValueOnce(new Error('save-boom'))
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSnapshotEditorPresetMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.savePresetMutation.mutate({ chainId: 1, name: 'x' })
    })

    await waitFor(() => expect(result.current.savePresetMutation.isError).toBe(true))
    expect(setters.pushToast.mock.calls[0][0]).toContain('Failed to save')
    expect(setters.pushToast.mock.calls[0][1]).toBe('error')
    expect(setters.setShowSavePresetModal).not.toHaveBeenCalled()
  })

  it('load success invalidates chains cache, closes browser, toasts', async () => {
    mockedLoad.mockResolvedValueOnce({} as never)
    const setters = makeSetters()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSnapshotEditorPresetMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.loadPresetMutation.mutate(42)
    })

    await waitFor(() => expect(result.current.loadPresetMutation.isSuccess).toBe(true))
    expect(mockedLoad).toHaveBeenCalledWith(42)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chains'] })
    expect(setters.setShowPresetBrowser).toHaveBeenCalledWith(false)
    expect(setters.pushToast).toHaveBeenCalledWith('Preset loaded', 'success')
  })

  it('load error toasts the failure', async () => {
    mockedLoad.mockRejectedValueOnce(new Error('load-boom'))
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSnapshotEditorPresetMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.loadPresetMutation.mutate(99)
    })

    await waitFor(() => expect(result.current.loadPresetMutation.isError).toBe(true))
    expect(setters.pushToast.mock.calls[0][0]).toContain('Failed to load preset')
    expect(setters.pushToast.mock.calls[0][1]).toBe('error')
    expect(setters.setShowPresetBrowser).not.toHaveBeenCalled()
  })

  it('delete success invalidates presets cache, clears pending-delete, toasts', async () => {
    mockedDelete.mockResolvedValueOnce({} as never)
    const setters = makeSetters()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSnapshotEditorPresetMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.deletePresetMutation.mutate(13)
    })

    await waitFor(() => expect(result.current.deletePresetMutation.isSuccess).toBe(true))
    expect(mockedDelete).toHaveBeenCalledWith(13)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chains', 'presets'] })
    expect(setters.setPresetPendingDelete).toHaveBeenCalledWith(null)
    expect(setters.pushToast).toHaveBeenCalledWith('Preset deleted', 'success')
  })

  it('delete error toasts the failure', async () => {
    mockedDelete.mockRejectedValueOnce(new Error('delete-boom'))
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSnapshotEditorPresetMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.deletePresetMutation.mutate(13)
    })

    await waitFor(() => expect(result.current.deletePresetMutation.isError).toBe(true))
    expect(setters.pushToast.mock.calls[0][0]).toContain('Failed to delete preset')
    expect(setters.pushToast.mock.calls[0][1]).toBe('error')
    expect(setters.setPresetPendingDelete).not.toHaveBeenCalled()
  })
})
