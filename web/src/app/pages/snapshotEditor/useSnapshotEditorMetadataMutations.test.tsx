/**
 * T2472 mutation extraction slice 5 — metadata mutations parity test.
 *
 * Asserts behavioral parity for the four active-snapshot metadata
 * mutations (rename / program / description / tempo) after extraction
 * into useSnapshotEditorMetadataMutations.
 *
 * Each success path:
 *   - calls the matching snapshotsApi.update or snapshotsApi.setProgram
 *   - syncs snapshot detail caches via syncSnapshotDetailCaches
 *   - invalidates the matching cache keys
 *   - clears/sets the matching modal/program-value state
 *   - toasts the matching success message
 * Each error path routes through pushToast with 'error' tone.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import { useSnapshotEditorMetadataMutations } from './useSnapshotEditorMetadataMutations'
import type { SnapshotDetail } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    update: jest.fn(),
    setProgram: jest.fn(),
    get: jest.fn(),
  },
}))

const mockedUpdate = snapshotsApi.update as jest.MockedFunction<typeof snapshotsApi.update>
const mockedSetProgram = snapshotsApi.setProgram as jest.MockedFunction<typeof snapshotsApi.setProgram>
const mockedGet = snapshotsApi.get as jest.MockedFunction<typeof snapshotsApi.get>

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
  syncSnapshotDetailCaches: jest.Mock
  setEditingSnapshotName: jest.Mock
  setRenameSnapshotName: jest.Mock
  setSnapshotProgramValue: jest.Mock
  pushToast: jest.Mock
}

function makeSetters(): Setters {
  return {
    syncSnapshotDetailCaches: jest.fn(),
    setEditingSnapshotName: jest.fn(),
    setRenameSnapshotName: jest.fn(),
    setSnapshotProgramValue: jest.fn(),
    pushToast: jest.fn(),
  }
}

const SNAPSHOT_42 = { id: 42, name: 'Lead' } as unknown as SnapshotDetail
const SNAPSHOT_42_RENAMED = { id: 42, name: 'Solo' } as unknown as SnapshotDetail

describe('useSnapshotEditorMetadataMutations', () => {
  beforeEach(() => {
    mockedUpdate.mockReset()
    mockedSetProgram.mockReset()
    mockedGet.mockReset()
  })

  it('rename success syncs caches, invalidates, closes editing, clears name, toasts', async () => {
    mockedUpdate.mockResolvedValueOnce({ snapshot: SNAPSHOT_42_RENAMED } as never)
    const setters = makeSetters()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSnapshotEditorMetadataMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.renameActiveSnapshotMutation.mutate({ snapshotId: 42, name: 'Solo' })
    })

    await waitFor(() => expect(result.current.renameActiveSnapshotMutation.isSuccess).toBe(true))
    expect(mockedUpdate).toHaveBeenCalledWith(42, { name: 'Solo' })
    expect(setters.syncSnapshotDetailCaches).toHaveBeenCalledWith(SNAPSHOT_42_RENAMED)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshots'] })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'runtime', 'live-state', 'local'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'runtime', 'cluster-live-state'],
    })
    expect(setters.setEditingSnapshotName).toHaveBeenCalledWith(false)
    expect(setters.setRenameSnapshotName).toHaveBeenCalledWith('')
    expect(setters.pushToast).toHaveBeenCalledWith('Snapshot renamed to "Solo"', 'success')
  })

  it('rename error toasts the failure', async () => {
    mockedUpdate.mockRejectedValueOnce(new Error('rename-boom'))
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSnapshotEditorMetadataMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.renameActiveSnapshotMutation.mutate({ snapshotId: 42, name: 'x' })
    })

    await waitFor(() => expect(result.current.renameActiveSnapshotMutation.isError).toBe(true))
    expect(setters.pushToast).toHaveBeenCalledWith('rename-boom', 'error')
    expect(setters.syncSnapshotDetailCaches).not.toHaveBeenCalled()
  })

  it('program success calls setProgram, refetches, syncs, invalidates, sets value, toasts', async () => {
    mockedSetProgram.mockResolvedValueOnce({ program_number: 7 } as never)
    mockedGet.mockResolvedValueOnce(SNAPSHOT_42 as never)
    const setters = makeSetters()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSnapshotEditorMetadataMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.updateActiveSnapshotProgramMutation.mutate({
        snapshotId: 42,
        programNumber: 7,
      })
    })

    await waitFor(() =>
      expect(result.current.updateActiveSnapshotProgramMutation.isSuccess).toBe(true)
    )
    expect(mockedSetProgram).toHaveBeenCalledWith(42, 7)
    expect(mockedGet).toHaveBeenCalledWith(42)
    expect(setters.syncSnapshotDetailCaches).toHaveBeenCalledWith(SNAPSHOT_42)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshots'] })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'runtime', 'activation-events', 'local'],
    })
    expect(setters.setSnapshotProgramValue).toHaveBeenCalledWith('7')
    expect(setters.pushToast).toHaveBeenCalledWith('MIDI program updated', 'success')
  })

  it('program null clears the program value', async () => {
    mockedSetProgram.mockResolvedValueOnce({ program_number: null } as never)
    mockedGet.mockResolvedValueOnce(SNAPSHOT_42 as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSnapshotEditorMetadataMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.updateActiveSnapshotProgramMutation.mutate({
        snapshotId: 42,
        programNumber: null,
      })
    })

    await waitFor(() =>
      expect(result.current.updateActiveSnapshotProgramMutation.isSuccess).toBe(true)
    )
    expect(setters.setSnapshotProgramValue).toHaveBeenCalledWith('')
  })

  it('description success calls update, syncs, invalidates, toasts', async () => {
    mockedUpdate.mockResolvedValueOnce({ snapshot: SNAPSHOT_42 } as never)
    const setters = makeSetters()
    const { Wrapper, client } = makeWrapper()
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useSnapshotEditorMetadataMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.updateActiveSnapshotDescriptionMutation.mutate({
        snapshotId: 42,
        description: 'new desc',
      })
    })

    await waitFor(() =>
      expect(result.current.updateActiveSnapshotDescriptionMutation.isSuccess).toBe(true)
    )
    expect(mockedUpdate).toHaveBeenCalledWith(42, { description: 'new desc' })
    expect(setters.syncSnapshotDetailCaches).toHaveBeenCalledWith(SNAPSHOT_42)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshots'] })
    expect(setters.pushToast).toHaveBeenCalledWith('Snapshot notes updated', 'success')
  })

  it('tempo success calls update with tempo_bpm field', async () => {
    mockedUpdate.mockResolvedValueOnce({ snapshot: SNAPSHOT_42 } as never)
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSnapshotEditorMetadataMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.updateActiveSnapshotTempoMutation.mutate({ snapshotId: 42, tempoBpm: 120 })
    })

    await waitFor(() =>
      expect(result.current.updateActiveSnapshotTempoMutation.isSuccess).toBe(true)
    )
    expect(mockedUpdate).toHaveBeenCalledWith(42, { tempo_bpm: 120 })
    expect(setters.pushToast).toHaveBeenCalledWith('Snapshot tempo updated', 'success')
  })

  it('tempo error toasts the failure', async () => {
    mockedUpdate.mockRejectedValueOnce(new Error('tempo-boom'))
    const setters = makeSetters()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSnapshotEditorMetadataMutations(setters), {
      wrapper: Wrapper,
    })

    act(() => {
      result.current.updateActiveSnapshotTempoMutation.mutate({ snapshotId: 42, tempoBpm: 90 })
    })

    await waitFor(() =>
      expect(result.current.updateActiveSnapshotTempoMutation.isError).toBe(true)
    )
    expect(setters.pushToast).toHaveBeenCalledWith('tempo-boom', 'error')
  })
})
