/**
 * Parity test for `useSnapshotEditorMidiMutations` after the T2459-H8
 * cutover to the canonical `MidiBinding` authority.
 *
 * The hook now (a) polls `midiBindingsApi.lastCc()` for an incoming CC
 * after `start.mutate(...)`, (b) writes a canonical `plugin_param`
 * binding scoped to the active snapshot via `midiBindingsApi.create`,
 * and (c) treats `stop.mutate()` as a local-only abort of the
 * in-flight poll (no backend round-trip).
 *
 * The tests below assert:
 *   1. Successful capture writes a canonical binding with the right
 *      consumer_id / scope / source_descriptor / target_descriptor
 *      shape, clears the learn-active flag, and invalidates the MIDI
 *      query cache.
 *   2. Poll timeout (no CC observed in 10s) routes through the error
 *      handler with a meaningful toast and clears the learn-active
 *      flag without writing a binding.
 *   3. `stop.mutate()` aborts the in-flight poll without firing an
 *      error toast and clears the learn-active flag.
 *   4. Starting with a null `activeSnapshotId` throws synchronously
 *      so we never accidentally write a global-scope binding from a
 *      snapshot-scoped surface.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { midiBindingsApi } from '../../../map2/clients/midiBindings'
import { useSnapshotEditorMidiMutations } from './useSnapshotEditorMidiMutations'

jest.mock('../../../map2/clients/midiBindings', () => ({
  midiBindingsApi: {
    lastCc: jest.fn(),
    create: jest.fn(),
  },
}))

const mockedLastCc = midiBindingsApi.lastCc as jest.MockedFunction<typeof midiBindingsApi.lastCc>
const mockedCreate = midiBindingsApi.create as jest.MockedFunction<typeof midiBindingsApi.create>

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

const SNAPSHOT_ID = 42
const START_PARAMS = {
  chain_id: 1,
  plugin_uri: 'urn:plugin:eg-amp',
  param_symbol: 'drive',
  param_index: 3,
  min_val: 0,
  max_val: 1,
}

const FAKE_BINDING = {
  binding_id: 'bind-xyz',
  consumer_type: 'plugin_param',
  consumer_id: '1:urn:plugin:eg-amp:3',
  consumer_label: 'chain 1 param 3',
  source_type: 'midi_cc',
  source_descriptor: { channel: 0, cc: 7, min: 0, max: 1 },
  target_type: 'engine_param',
  target_descriptor: {
    chain_id: 1,
    plugin_uri: 'urn:plugin:eg-amp',
    param_index: 3,
    parameter_symbol: 'drive',
  },
  device_id: null,
  scope: 'snapshot',
  scope_id: String(SNAPSHOT_ID),
  enabled: true,
  source: 'snapshot-editor',
  metadata: {},
  created_at: '2026-05-10T00:00:00Z',
  created_by: 'snapshot-editor',
  modified_at: '2026-05-10T00:00:00Z',
  modified_by: 'snapshot-editor',
} as const

describe('useSnapshotEditorMidiMutations (T2459-H8 canonical authority)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockedLastCc.mockReset()
    mockedCreate.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('on CC capture writes a canonical snapshot-scoped plugin_param binding', async () => {
    // First poll returns null (no CC yet); second poll returns a fresh CC.
    mockedLastCc
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        channel: 0,
        cc: 7,
        value: 64,
        // observed_at far in the future — anything > startedAtSec works.
        observed_at: Date.now() / 1000 + 5,
      })
    mockedCreate.mockResolvedValueOnce(FAKE_BINDING as never)

    const invalidateMidiQueries = jest.fn()
    const setMidiLearnActive = jest.fn()
    const pushToast = jest.fn()

    const { result } = renderHook(
      () =>
        useSnapshotEditorMidiMutations({
          activeSnapshotId: SNAPSHOT_ID,
          invalidateMidiQueries,
          setMidiLearnActive,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.startMidiLearnMutation.mutate(START_PARAMS)
    })

    // Drive the poll interval forward. `advanceTimersByTimeAsync`
    // flushes both queued setInterval callbacks AND the microtasks
    // they enqueue (the resolved `lastCc()` promises) — the sync
    // `advanceTimersByTime` doesn't drain microtasks under react@19's
    // fake-timer integration and produces a spurious `act(async)`
    // warning.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(250)
      await jest.advanceTimersByTimeAsync(250)
    })

    await waitFor(() => expect(result.current.startMidiLearnMutation.isSuccess).toBe(true))

    expect(mockedCreate).toHaveBeenCalledTimes(1)
    const payload = mockedCreate.mock.calls[0][0]
    expect(payload).toMatchObject({
      consumer_type: 'plugin_param',
      consumer_id: '1:urn:plugin:eg-amp:3',
      source_type: 'midi_cc',
      target_type: 'engine_param',
      scope: 'snapshot',
      scope_id: String(SNAPSHOT_ID),
      source: 'snapshot-editor',
      created_by: 'snapshot-editor',
    })
    expect(payload.source_descriptor).toMatchObject({ cc: 7, channel: 0, min: 0, max: 1 })
    expect(payload.target_descriptor).toMatchObject({
      chain_id: 1,
      plugin_uri: 'urn:plugin:eg-amp',
      param_index: 3,
      parameter_symbol: 'drive',
    })

    expect(setMidiLearnActive).toHaveBeenCalledWith(false)
    expect(invalidateMidiQueries).toHaveBeenCalledTimes(1)
    expect(pushToast).not.toHaveBeenCalled()
  })

  it('poll timeout routes through error handler without writing a binding', async () => {
    mockedLastCc.mockResolvedValue(null)

    const invalidateMidiQueries = jest.fn()
    const setMidiLearnActive = jest.fn()
    const pushToast = jest.fn()

    const { result } = renderHook(
      () =>
        useSnapshotEditorMidiMutations({
          activeSnapshotId: SNAPSHOT_ID,
          invalidateMidiQueries,
          setMidiLearnActive,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.startMidiLearnMutation.mutate(START_PARAMS)
    })

    // Drive the poll past the 10s timeout. `runAllTimersAsync` flushes
    // both queued setInterval/setTimeout callbacks and the microtasks
    // they enqueue (the resolved `lastCc()` promises), which a single
    // `advanceTimersByTime` call doesn't do under jest 30 fake timers.
    await act(async () => {
      await jest.runAllTimersAsync()
    })

    await waitFor(
      () => expect(result.current.startMidiLearnMutation.isError).toBe(true),
      { timeout: 1000 },
    )

    expect(mockedCreate).not.toHaveBeenCalled()
    expect(setMidiLearnActive).toHaveBeenCalledWith(false)
    expect(pushToast).toHaveBeenCalledWith(
      expect.stringMatching(/timed out/i),
      'error',
    )
    expect(invalidateMidiQueries).not.toHaveBeenCalled()
  })

  it('stop aborts the in-flight poll, clears learn-active, no error toast', async () => {
    mockedLastCc.mockResolvedValue(null)

    const invalidateMidiQueries = jest.fn()
    const setMidiLearnActive = jest.fn()
    const pushToast = jest.fn()

    const { result } = renderHook(
      () =>
        useSnapshotEditorMidiMutations({
          activeSnapshotId: SNAPSHOT_ID,
          invalidateMidiQueries,
          setMidiLearnActive,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.startMidiLearnMutation.mutate(START_PARAMS)
    })
    // One tick into the poll.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(250)
    })

    act(() => {
      result.current.stopMidiLearnMutation.mutate()
    })

    await waitFor(() => expect(result.current.stopMidiLearnMutation.isSuccess).toBe(true))
    // Start mutation resolves with null after abort — no binding, no error toast.
    await waitFor(() => expect(result.current.startMidiLearnMutation.isSuccess).toBe(true))

    expect(mockedCreate).not.toHaveBeenCalled()
    expect(setMidiLearnActive).toHaveBeenCalledWith(false)
    expect(pushToast).not.toHaveBeenCalled()
    expect(invalidateMidiQueries).toHaveBeenCalled()
  })

  it('start with null activeSnapshotId errors without polling or writing', async () => {
    const invalidateMidiQueries = jest.fn()
    const setMidiLearnActive = jest.fn()
    const pushToast = jest.fn()

    const { result } = renderHook(
      () =>
        useSnapshotEditorMidiMutations({
          activeSnapshotId: null,
          invalidateMidiQueries,
          setMidiLearnActive,
          pushToast,
        }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.startMidiLearnMutation.mutate(START_PARAMS)
    })

    await waitFor(() => expect(result.current.startMidiLearnMutation.isError).toBe(true))
    expect(mockedLastCc).not.toHaveBeenCalled()
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledWith(
      expect.stringMatching(/without an active snapshot/i),
      'error',
    )
    expect(setMidiLearnActive).toHaveBeenCalledWith(false)
  })
})
