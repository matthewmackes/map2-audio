/**
 * T2472 mutation extraction slice 13 — activate-current-snapshot mutation parity test.
 *
 * Asserts behavioral parity for activateCurrentSnapshotMutation:
 *   - onMutate: clears confirmed/failed state, sets pending snapshot id +
 *     requestedAt timestamp.
 *   - onSuccess: clears pending state, sets confirmed id, primes control
 *     plane caches, fans the four runtime invalidations
 *     (live-state/local, cluster-live-state, activation-events/local, plus
 *     control-plane-with-includeDesired), clears editor override, and
 *     rehydrates with the activation toast pair.
 *   - onError: extracts failure detail/reason, clears the pending id when
 *     it matches the rejected one, sets failed id, and pushes the
 *     activation-failure stage toast. Snapshot name resolution: prefer
 *     activeSnapshot.name when ids match, else snapshotsSummaryQuery list,
 *     else 'Snapshot'.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import {
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
  buildSnapshotActivationFailureStageToast,
  buildSnapshotActivationFailureToastMessage,
  buildSnapshotActivationStageToast,
  buildSnapshotActivationToastMessage,
  extractSnapshotActivationFailureDetail,
  extractSnapshotActivationFailureReason,
} from '../../utils/snapshotActivationToast'
import { useSnapshotEditorActivateCurrentMutation } from './useSnapshotEditorActivateCurrentMutation'
import type { SnapshotDetail } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: { activate: jest.fn() },
}))

jest.mock('../../utils/snapshotActivationToast', () => ({
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS: 7000,
  buildSnapshotActivationFailureStageToast: jest.fn(),
  buildSnapshotActivationFailureToastMessage: jest.fn(),
  buildSnapshotActivationStageToast: jest.fn(),
  buildSnapshotActivationToastMessage: jest.fn(),
  extractSnapshotActivationFailureDetail: jest.fn(),
  extractSnapshotActivationFailureReason: jest.fn(),
}))

const mockedActivate = snapshotsApi.activate as jest.MockedFunction<typeof snapshotsApi.activate>
const mockedSuccessToast = buildSnapshotActivationToastMessage as jest.MockedFunction<
  typeof buildSnapshotActivationToastMessage
>
const mockedSuccessStage = buildSnapshotActivationStageToast as jest.MockedFunction<
  typeof buildSnapshotActivationStageToast
>
const mockedFailureToast = buildSnapshotActivationFailureToastMessage as jest.MockedFunction<
  typeof buildSnapshotActivationFailureToastMessage
>
const mockedFailureStage = buildSnapshotActivationFailureStageToast as jest.MockedFunction<
  typeof buildSnapshotActivationFailureStageToast
>
const mockedExtractDetail = extractSnapshotActivationFailureDetail as jest.MockedFunction<
  typeof extractSnapshotActivationFailureDetail
>
const mockedExtractReason = extractSnapshotActivationFailureReason as jest.MockedFunction<
  typeof extractSnapshotActivationFailureReason
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

const ACTIVATED = { id: 42, name: 'Lead' } as unknown as SnapshotDetail
const ACTIVE_SNAPSHOT = { id: 42, name: 'Lead' } as unknown as SnapshotDetail

function defaultArgs(overrides: Partial<Parameters<typeof useSnapshotEditorActivateCurrentMutation>[0]> = {}) {
  return {
    activeSnapshot: null,
    snapshotsSummaryQuery: { data: undefined },
    setPendingGoLiveSnapshotId: jest.fn(),
    setPendingGoLiveRequestedAt: jest.fn(),
    setConfirmedGoLiveSnapshotId: jest.fn(),
    setFailedGoLiveSnapshotId: jest.fn(),
    setGoLiveFailureReason: jest.fn(),
    setGoLiveFailureDetail: jest.fn(),
    setControlPlaneSnapshotCaches: jest.fn(),
    invalidateControlPlaneSnapshotCaches: jest.fn(),
    setEditorSnapshotOverride: jest.fn(),
    hydrateEditorFromSnapshot: jest.fn(),
    pushToast: jest.fn(),
    ...overrides,
  }
}

describe('useSnapshotEditorActivateCurrentMutation', () => {
  beforeEach(() => {
    mockedActivate.mockReset()
    mockedSuccessToast.mockReset().mockReturnValue('Activated Lead')
    mockedSuccessStage.mockReset().mockReturnValue({
      message: 'stage-msg',
      title: 'Stage',
      options: { id: 'stage-id', stage: 'committed' },
    } as never)
    mockedFailureToast.mockReset().mockReturnValue('Activation failed: Lead')
    mockedFailureStage.mockReset().mockReturnValue({
      title: 'Failure',
      options: { id: 'fail-id', stage: 'rolled-back' },
    } as never)
    mockedExtractDetail.mockReset().mockReturnValue({ shape: 'detail' } as never)
    mockedExtractReason.mockReset().mockReturnValue('reason-text')
  })

  it('clears + pends on mutate and primes the full success fan-out on success', async () => {
    mockedActivate.mockResolvedValueOnce({
      snapshot_id: 42,
      snapshot_data: ACTIVATED,
      activation_intent: null,
    } as never)
    const args = defaultArgs({ activeSnapshot: ACTIVE_SNAPSHOT })
    const { Wrapper, setQuerySpy, invalidateSpy } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorActivateCurrentMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.activateCurrentSnapshotMutation.mutate(42)
    })

    await waitFor(() =>
      expect(result.current.activateCurrentSnapshotMutation.isSuccess).toBe(true),
    )

    // onMutate ran before mutationFn completed — verify both onMutate and onSuccess
    expect(args.setPendingGoLiveSnapshotId).toHaveBeenCalledWith(42)
    expect(args.setPendingGoLiveRequestedAt).toHaveBeenCalled()
    expect(args.setGoLiveFailureReason).toHaveBeenCalledWith(null)
    expect(args.setGoLiveFailureDetail).toHaveBeenCalledWith(null)
    expect(mockedActivate).toHaveBeenCalledWith(42)
    expect(args.setPendingGoLiveSnapshotId).toHaveBeenCalledWith(null)
    expect(args.setConfirmedGoLiveSnapshotId).toHaveBeenCalledWith(null)
    expect(args.setFailedGoLiveSnapshotId).toHaveBeenCalledWith(null)
    expect(args.setConfirmedGoLiveSnapshotId).toHaveBeenCalledWith(42)
    expect(args.setControlPlaneSnapshotCaches).toHaveBeenCalledWith(ACTIVATED)
    expect(setQuerySpy).toHaveBeenCalledWith(['snapshots', 'detail', 42], ACTIVATED)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'runtime', 'live-state', 'local'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'runtime', 'cluster-live-state'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'runtime', 'activation-events', 'local'],
    })
    expect(args.invalidateControlPlaneSnapshotCaches).toHaveBeenCalledWith({
      includeDesired: true,
    })
    expect(args.setEditorSnapshotOverride).toHaveBeenCalledWith(null)
    expect(args.hydrateEditorFromSnapshot).toHaveBeenCalledWith(ACTIVATED, {
      toastMessage: 'Activated Lead',
      toastDurationMs: 7000,
      toast: {
        message: 'stage-msg',
        title: 'Stage',
        options: { id: 'stage-id', stage: 'committed' },
        tone: 'success',
      },
      resetSelectedBlock: true,
      invalidateSnapshots: true,
    })
  })

  it('falls back to snapshot id when activate response omits snapshot_id', async () => {
    mockedActivate.mockResolvedValueOnce({
      snapshot_data: ACTIVATED,
    } as never)
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorActivateCurrentMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.activateCurrentSnapshotMutation.mutate(99)
    })

    await waitFor(() =>
      expect(result.current.activateCurrentSnapshotMutation.isSuccess).toBe(true),
    )
    expect(args.setConfirmedGoLiveSnapshotId).toHaveBeenCalledWith(99)
  })

  it('on error, resolves snapshot name from activeSnapshot when ids match', async () => {
    mockedActivate.mockRejectedValueOnce(new Error('activate-boom'))
    const args = defaultArgs({ activeSnapshot: ACTIVE_SNAPSHOT })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorActivateCurrentMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.activateCurrentSnapshotMutation.mutate(42)
    })

    await waitFor(() =>
      expect(result.current.activateCurrentSnapshotMutation.isError).toBe(true),
    )
    expect(args.setFailedGoLiveSnapshotId).toHaveBeenCalledWith(42)
    expect(args.setGoLiveFailureReason).toHaveBeenCalledWith('reason-text')
    expect(args.setGoLiveFailureDetail).toHaveBeenCalledWith({ shape: 'detail' })
    expect(mockedFailureStage).toHaveBeenCalledWith('Lead', expect.any(Error), { snapshotId: 42 })
    expect(args.pushToast).toHaveBeenCalledWith('Activation failed: Lead', 'warn', {
      durationMs: 7000,
      id: 'fail-id',
      title: 'Failure',
      stage: 'rolled-back',
    })
  })

  it('on error, resolves snapshot name from summary list when activeSnapshot id differs', async () => {
    mockedActivate.mockRejectedValueOnce(new Error('boom'))
    const args = defaultArgs({
      activeSnapshot: ACTIVE_SNAPSHOT,
      snapshotsSummaryQuery: { data: { snapshots: [{ id: 99, name: 'Other' }] } },
    })
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorActivateCurrentMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.activateCurrentSnapshotMutation.mutate(99)
    })

    await waitFor(() =>
      expect(result.current.activateCurrentSnapshotMutation.isError).toBe(true),
    )
    expect(mockedFailureStage).toHaveBeenCalledWith('Other', expect.any(Error), { snapshotId: 99 })
  })

  it('on error, falls back to "Snapshot" when no name source matches', async () => {
    mockedActivate.mockRejectedValueOnce(new Error('boom'))
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorActivateCurrentMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.activateCurrentSnapshotMutation.mutate(7)
    })

    await waitFor(() =>
      expect(result.current.activateCurrentSnapshotMutation.isError).toBe(true),
    )
    expect(mockedFailureStage).toHaveBeenCalledWith('Snapshot', expect.any(Error), { snapshotId: 7 })
  })

  it('on error, clears pending id only when it equals the failed id (functional updater)', async () => {
    mockedActivate.mockRejectedValueOnce(new Error('boom'))
    const args = defaultArgs()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () => useSnapshotEditorActivateCurrentMutation(args),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.activateCurrentSnapshotMutation.mutate(42)
    })

    await waitFor(() =>
      expect(result.current.activateCurrentSnapshotMutation.isError).toBe(true),
    )
    // The functional-updater path should have been invoked with a function
    const call = (args.setPendingGoLiveSnapshotId as jest.Mock).mock.calls.find(
      ([arg]) => typeof arg === 'function'
    )
    expect(call).toBeDefined()
    const updater = call![0] as (prev: number | null) => number | null
    expect(updater(42)).toBe(null) // matching id is cleared
    expect(updater(99)).toBe(99) // non-matching id is preserved
  })
})
