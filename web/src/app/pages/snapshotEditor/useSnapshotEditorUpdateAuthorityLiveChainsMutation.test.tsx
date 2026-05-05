/**
 * T2472 mutation extraction slice 17 — update-authority-live-chains parity test.
 *
 * Asserts behavioral parity for updateAuthorityLiveChainsMutation:
 *   - mutationFn: calls audioStateApi.putDesired with variables.request.
 *   - onMutate: cancels chains + audio-state.committed + control-plane
 *     snapshot caches; captures rollback state for chains, committed
 *     audio state, authority-active snapshot (when authoritySnapshotId set);
 *     applies optimistic chains update via the injected helper, applies
 *     committed audio-state value, calls pruneLiveSnapshotCache.
 *   - onSuccess: setQueryData(['audio-state','committed'], response),
 *     invalidates ['chains'], invalidates control-plane caches with
 *     includeDesired: true, marks dirty if variables.markDirty, toasts
 *     successMessage with successKind.
 *   - onError: rolls back chains + committed + authority-active snapshot
 *     (via restoreAuthorityAwareLiveSnapshot), toasts the failure with the
 *     error message or variables.errorMessage fallback.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { audioStateApi } from '../../../map2/clients/audioState'
import { restoreAuthorityAwareLiveSnapshot } from '../snapshotLiveState'
import { useSnapshotEditorUpdateAuthorityLiveChainsMutation } from './useSnapshotEditorUpdateAuthorityLiveChainsMutation'
import type { AuthoritativeAudioStateEnvelope, SnapshotDetail } from '../../../map2/types'

jest.mock('../../../map2/clients/audioState', () => ({
  audioStateApi: { putDesired: jest.fn() },
}))
jest.mock('../snapshotLiveState', () => ({
  restoreAuthorityAwareLiveSnapshot: jest.fn(),
}))

const mockedPutDesired = audioStateApi.putDesired as jest.MockedFunction<
  typeof audioStateApi.putDesired
>
const mockedRestoreAuthority = restoreAuthorityAwareLiveSnapshot as jest.MockedFunction<
  typeof restoreAuthorityAwareLiveSnapshot
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
  return { client, Wrapper, setQuerySpy, invalidateSpy }
}

const RESPONSE = {
  value: { chains: ['ok'] },
} as unknown as AuthoritativeAudioStateEnvelope
const PREV_COMMITTED = {
  value: { chains: ['old'] },
} as unknown as AuthoritativeAudioStateEnvelope
const PREV_AUTHORITY_SNAPSHOT = { id: 5 } as unknown as SnapshotDetail
const VARIABLES = {
  nextActiveChainIds: [1, 2],
  nextCommittedState: { chains: ['next'] } as unknown as AuthoritativeAudioStateEnvelope['value'],
  request: { chains: { active: [1, 2] } } as never,
  pruneChainIds: [3, 4],
  successMessage: 'Live chains updated',
  successKind: 'success' as const,
  errorMessage: 'fallback-error',
  markDirty: true,
}

function defaultArgs(
  overrides: Partial<Parameters<typeof useSnapshotEditorUpdateAuthorityLiveChainsMutation>[0]> = {},
) {
  return {
    authoritySnapshotId: 5,
    cancelControlPlaneSnapshotCaches: jest.fn(async () => {}),
    invalidateControlPlaneSnapshotCaches: jest.fn(),
    pruneLiveSnapshotCache: jest.fn(),
    applyOptimisticJuceGridLiveChainSet: jest.fn(
      (_current, _ids) => ({ chains: [] }) as never,
    ),
    markSnapshotsDirty: jest.fn(),
    pushToast: jest.fn(),
    ...overrides,
  }
}

describe('useSnapshotEditorUpdateAuthorityLiveChainsMutation', () => {
  beforeEach(() => {
    mockedPutDesired.mockReset()
    mockedRestoreAuthority.mockReset()
  })

  it('on success: commits, invalidates, marks dirty when flagged, toasts the success message', async () => {
    mockedPutDesired.mockResolvedValueOnce(RESPONSE)
    const args = defaultArgs()
    const { client, Wrapper, setQuerySpy, invalidateSpy } = makeWrapper()
    // Seed the audio-state cache so onMutate captures it as the rollback target
    client.setQueryData(['audio-state', 'committed'], PREV_COMMITTED)
    const { result } = renderHook(
      () => useSnapshotEditorUpdateAuthorityLiveChainsMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateAuthorityLiveChainsMutation.mutate(VARIABLES)
    })

    await waitFor(() =>
      expect(result.current.updateAuthorityLiveChainsMutation.isSuccess).toBe(true),
    )

    expect(mockedPutDesired).toHaveBeenCalledWith(VARIABLES.request)
    expect(args.applyOptimisticJuceGridLiveChainSet).toHaveBeenCalled()
    expect(args.pruneLiveSnapshotCache).toHaveBeenCalledWith([3, 4])
    expect(setQuerySpy).toHaveBeenCalledWith(['audio-state', 'committed'], RESPONSE)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chains'] })
    expect(args.invalidateControlPlaneSnapshotCaches).toHaveBeenCalledWith({
      includeDesired: true,
    })
    expect(args.markSnapshotsDirty).toHaveBeenCalled()
    expect(args.pushToast).toHaveBeenCalledWith('Live chains updated', 'success')
  })

  it('omits markDirty call when flag is false', async () => {
    mockedPutDesired.mockResolvedValueOnce(RESPONSE)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorUpdateAuthorityLiveChainsMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateAuthorityLiveChainsMutation.mutate({ ...VARIABLES, markDirty: false })
    })

    await waitFor(() =>
      expect(result.current.updateAuthorityLiveChainsMutation.isSuccess).toBe(true),
    )
    expect(args.markSnapshotsDirty).not.toHaveBeenCalled()
  })

  it('on error: rolls back chains + committed + authority-active and toasts error.message', async () => {
    mockedPutDesired.mockRejectedValueOnce(new Error('chain-boom'))
    const args = defaultArgs()
    const { client, Wrapper, setQuerySpy } = makeWrapper()
    // Seed both chains + audio-state so previousChains and previousCommittedAudioState are set
    client.setQueryData(['chains'], { chains: ['orig'] } as never)
    client.setQueryData(['audio-state', 'committed'], PREV_COMMITTED)
    client.setQueryData(
      ['snapshots', 'detail', 'authority-active', 5],
      PREV_AUTHORITY_SNAPSHOT,
    )
    const { result } = renderHook(
      () => useSnapshotEditorUpdateAuthorityLiveChainsMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateAuthorityLiveChainsMutation.mutate(VARIABLES)
    })

    await waitFor(() =>
      expect(result.current.updateAuthorityLiveChainsMutation.isError).toBe(true),
    )
    // Rollback: chains restored
    expect(setQuerySpy).toHaveBeenCalledWith(['chains'], { chains: ['orig'] })
    // Rollback: committed restored
    expect(setQuerySpy).toHaveBeenCalledWith(['audio-state', 'committed'], PREV_COMMITTED)
    // Rollback: authority snapshot restored
    expect(mockedRestoreAuthority).toHaveBeenCalledWith(
      expect.anything(),
      PREV_AUTHORITY_SNAPSHOT,
      5,
    )
    expect(args.pushToast).toHaveBeenCalledWith('chain-boom', 'error')
  })

  it('on non-Error rejection, falls back to variables.errorMessage', async () => {
    mockedPutDesired.mockRejectedValueOnce('plain string')
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorUpdateAuthorityLiveChainsMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateAuthorityLiveChainsMutation.mutate(VARIABLES)
    })

    await waitFor(() =>
      expect(result.current.updateAuthorityLiveChainsMutation.isError).toBe(true),
    )
    expect(args.pushToast).toHaveBeenCalledWith('fallback-error', 'error')
  })

  it('skips authority-snapshot rollback when authoritySnapshotId is null', async () => {
    mockedPutDesired.mockRejectedValueOnce(new Error('boom'))
    const args = defaultArgs({ authoritySnapshotId: null })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorUpdateAuthorityLiveChainsMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.updateAuthorityLiveChainsMutation.mutate(VARIABLES)
    })

    await waitFor(() =>
      expect(result.current.updateAuthorityLiveChainsMutation.isError).toBe(true),
    )
    expect(mockedRestoreAuthority).not.toHaveBeenCalled()
  })
})
