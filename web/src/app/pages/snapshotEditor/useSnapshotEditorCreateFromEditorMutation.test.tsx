/**
 * T2472 mutation extraction slice 12 — create-from-editor mutation parity test.
 *
 * Asserts behavioral parity for createSnapshotFromEditorMutation:
 *   - chains snapshotsApi.create then snapshotsApi.activate
 *   - on success: confirms go-live id, clears the editor override,
 *     primes control-plane caches, invalidates the runtime live-state
 *     queries (local + cluster), invalidates control-plane snapshot
 *     caches with includeDesired=true, rehydrates the editor with the
 *     activation toast pair, seeds the rename input, and optionally
 *     opens the plugin browser / focuses the snapshot name.
 *   - on error: toasts the activation-failure stage toast.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  flowSnapshotDataToSnapshotPayload,
  snapshotsApi,
} from '../../../map2/clients/snapshots'
import {
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
  buildSnapshotActivationFailureStageToast,
  buildSnapshotActivationFailureToastMessage,
  buildSnapshotActivationStageToast,
  buildSnapshotActivationToastMessage,
} from '../../utils/snapshotActivationToast'
import { useSnapshotEditorCreateFromEditorMutation } from './useSnapshotEditorCreateFromEditorMutation'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    create: jest.fn(),
    activate: jest.fn(),
  },
  flowSnapshotDataToSnapshotPayload: jest.fn(),
}))

jest.mock('../../utils/snapshotActivationToast', () => ({
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS: 7000,
  buildSnapshotActivationFailureStageToast: jest.fn(),
  buildSnapshotActivationFailureToastMessage: jest.fn(),
  buildSnapshotActivationStageToast: jest.fn(),
  buildSnapshotActivationToastMessage: jest.fn(),
}))

const mockedCreate = snapshotsApi.create as jest.MockedFunction<typeof snapshotsApi.create>
const mockedActivate = snapshotsApi.activate as jest.MockedFunction<typeof snapshotsApi.activate>
const mockedFlowToPayload = flowSnapshotDataToSnapshotPayload as jest.MockedFunction<
  typeof flowSnapshotDataToSnapshotPayload
>
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

const ACTIVE = { id: 5, tempo_bpm: 130 } as unknown as SnapshotDetail
const ACTIVATED_SNAPSHOT = { id: 200, name: 'New Lead' } as unknown as SnapshotDetail
const DRAFT = { tag: 'draft' } as unknown as SnapshotDraftData

describe('useSnapshotEditorCreateFromEditorMutation', () => {
  beforeEach(() => {
    mockedCreate.mockReset()
    mockedActivate.mockReset()
    mockedFlowToPayload.mockReset()
    mockedSuccessToast.mockReset()
    mockedSuccessStage.mockReset()
    mockedFailureToast.mockReset()
    mockedFailureStage.mockReset()
    mockedFlowToPayload.mockReturnValue({
      channels: [],
      chains: [],
      routing: {},
      midi_map: {},
    } as never)
    mockedSuccessToast.mockReturnValue('Activated New Lead')
    mockedSuccessStage.mockReturnValue({
      message: 'stage-msg',
      title: 'Stage',
      options: { id: 'stage-id', stage: 'committed' },
    } as never)
    mockedFailureToast.mockReturnValue('Activation failed: New Lead')
    mockedFailureStage.mockReturnValue({
      title: 'Failure',
      options: { id: 'fail-id', stage: 'rolled-back' },
    } as never)
  })

  it('creates, activates, primes caches, hydrates with toasts, and seeds the rename input', async () => {
    mockedCreate.mockResolvedValueOnce({ snapshot_id: 200 } as never)
    mockedActivate.mockResolvedValueOnce({
      snapshot_id: 200,
      snapshot_data: ACTIVATED_SNAPSHOT,
    } as never)

    const setConfirmedGoLiveSnapshotId = jest.fn()
    const setEditorSnapshotOverride = jest.fn()
    const setControlPlaneSnapshotCaches = jest.fn()
    const invalidateControlPlaneSnapshotCaches = jest.fn()
    const hydrateEditorFromSnapshot = jest.fn()
    const setRenameSnapshotName = jest.fn()
    const setEditingSnapshotName = jest.fn()
    const setShowPluginBrowser = jest.fn()
    const pushToast = jest.fn()

    const { Wrapper, setQuerySpy, invalidateSpy } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorCreateFromEditorMutation({
          activeSnapshot: ACTIVE,
          setConfirmedGoLiveSnapshotId,
          setEditorSnapshotOverride,
          setControlPlaneSnapshotCaches,
          invalidateControlPlaneSnapshotCaches,
          hydrateEditorFromSnapshot,
          setRenameSnapshotName,
          setEditingSnapshotName,
          setShowPluginBrowser,
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.createSnapshotFromEditorMutation.mutate({
        snapshotName: 'New Lead',
        sourceDraft: DRAFT,
        openPluginBrowser: true,
        focusSnapshotName: true,
      })
    })

    await waitFor(() =>
      expect(result.current.createSnapshotFromEditorMutation.isSuccess).toBe(true),
    )
    expect(mockedFlowToPayload).toHaveBeenCalledWith(DRAFT)
    expect(mockedCreate).toHaveBeenCalledWith({
      name: 'New Lead',
      description: 'Created from Snapshot Editor',
      tempo_bpm: 130,
      channels: [],
      chains: [],
      routing: {},
      midi_map: {},
    })
    expect(mockedActivate).toHaveBeenCalledWith(200)
    expect(setConfirmedGoLiveSnapshotId).toHaveBeenCalledWith(200)
    expect(setEditorSnapshotOverride).toHaveBeenCalledWith(null)
    expect(setControlPlaneSnapshotCaches).toHaveBeenCalledWith(ACTIVATED_SNAPSHOT)
    expect(setQuerySpy).toHaveBeenCalledWith(['snapshots', 'detail', 200], ACTIVATED_SNAPSHOT)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'runtime', 'live-state', 'local'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['snapshots', 'runtime', 'cluster-live-state'],
    })
    expect(invalidateControlPlaneSnapshotCaches).toHaveBeenCalledWith({ includeDesired: true })
    expect(hydrateEditorFromSnapshot).toHaveBeenCalledWith(ACTIVATED_SNAPSHOT, {
      toastMessage: 'Activated New Lead',
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
    expect(setRenameSnapshotName).toHaveBeenCalledWith('New Lead')
    expect(setEditingSnapshotName).toHaveBeenCalledWith(true)
    expect(setShowPluginBrowser).toHaveBeenCalledWith(true)
    expect(pushToast).not.toHaveBeenCalled()
  })

  it('does not open plugin browser or focus name when flags are false/absent', async () => {
    mockedCreate.mockResolvedValueOnce({ snapshot_id: 200 } as never)
    mockedActivate.mockResolvedValueOnce({
      snapshot_id: 200,
      snapshot_data: ACTIVATED_SNAPSHOT,
    } as never)

    const setShowPluginBrowser = jest.fn()
    const setEditingSnapshotName = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorCreateFromEditorMutation({
          activeSnapshot: ACTIVE,
          setConfirmedGoLiveSnapshotId: jest.fn(),
          setEditorSnapshotOverride: jest.fn(),
          setControlPlaneSnapshotCaches: jest.fn(),
          invalidateControlPlaneSnapshotCaches: jest.fn(),
          hydrateEditorFromSnapshot: jest.fn(),
          setRenameSnapshotName: jest.fn(),
          setEditingSnapshotName,
          setShowPluginBrowser,
          pushToast: jest.fn(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.createSnapshotFromEditorMutation.mutate({
        snapshotName: 'New Lead',
        sourceDraft: DRAFT,
      })
    })

    await waitFor(() =>
      expect(result.current.createSnapshotFromEditorMutation.isSuccess).toBe(true),
    )
    expect(setEditingSnapshotName).toHaveBeenCalledWith(false)
    expect(setShowPluginBrowser).not.toHaveBeenCalled()
  })

  it('falls back to tempo 120 when activeSnapshot is null', async () => {
    mockedCreate.mockResolvedValueOnce({ snapshot_id: 200 } as never)
    mockedActivate.mockResolvedValueOnce({
      snapshot_id: 200,
      snapshot_data: ACTIVATED_SNAPSHOT,
    } as never)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorCreateFromEditorMutation({
          activeSnapshot: null,
          setConfirmedGoLiveSnapshotId: jest.fn(),
          setEditorSnapshotOverride: jest.fn(),
          setControlPlaneSnapshotCaches: jest.fn(),
          invalidateControlPlaneSnapshotCaches: jest.fn(),
          hydrateEditorFromSnapshot: jest.fn(),
          setRenameSnapshotName: jest.fn(),
          setEditingSnapshotName: jest.fn(),
          setShowPluginBrowser: jest.fn(),
          pushToast: jest.fn(),
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.createSnapshotFromEditorMutation.mutate({
        snapshotName: 'Fresh',
        sourceDraft: DRAFT,
      })
    })

    await waitFor(() =>
      expect(result.current.createSnapshotFromEditorMutation.isSuccess).toBe(true),
    )
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tempo_bpm: 120, name: 'Fresh' }),
    )
  })

  it('toasts the activation-failure stage toast on error', async () => {
    mockedCreate.mockResolvedValueOnce({ snapshot_id: 200 } as never)
    mockedActivate.mockRejectedValueOnce(new Error('activate-boom'))

    const hydrateEditorFromSnapshot = jest.fn()
    const pushToast = jest.fn()
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(
      () =>
        useSnapshotEditorCreateFromEditorMutation({
          activeSnapshot: ACTIVE,
          setConfirmedGoLiveSnapshotId: jest.fn(),
          setEditorSnapshotOverride: jest.fn(),
          setControlPlaneSnapshotCaches: jest.fn(),
          invalidateControlPlaneSnapshotCaches: jest.fn(),
          hydrateEditorFromSnapshot,
          setRenameSnapshotName: jest.fn(),
          setEditingSnapshotName: jest.fn(),
          setShowPluginBrowser: jest.fn(),
          pushToast,
        }),
      { wrapper: Wrapper }
    )

    act(() => {
      result.current.createSnapshotFromEditorMutation.mutate({
        snapshotName: 'New Lead',
        sourceDraft: DRAFT,
      })
    })

    await waitFor(() =>
      expect(result.current.createSnapshotFromEditorMutation.isError).toBe(true),
    )
    expect(hydrateEditorFromSnapshot).not.toHaveBeenCalled()
    expect(mockedFailureStage).toHaveBeenCalledWith('New Lead', expect.any(Error))
    expect(pushToast).toHaveBeenCalledWith(
      'Activation failed: New Lead',
      'warn',
      {
        durationMs: 7000,
        id: 'fail-id',
        title: 'Failure',
        stage: 'rolled-back',
      },
    )
  })
})
