/**
 * T2472 mutation extraction slice 1 — MIDI learn mutations parity test.
 *
 * Asserts that `useSnapshotEditorMidiMutations` reproduces the inline
 * mutation behavior it replaced in `SnapshotEditorPageContent.tsx`:
 *
 *   - startMidiLearnMutation calls `midiApiV2.startLearn(params)` and
 *     invalidates MIDI queries on success
 *   - stopMidiLearnMutation calls `midiApiV2.stopLearn()` and on
 *     success clears the learn-active flag and invalidates MIDI
 *     queries
 *   - both mutations route errors through `pushToast` with the
 *     'error' tone; start additionally clears the learn-active flag
 *     on error
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { midiApiV2 } from '../../../map2/api'
import { useSnapshotEditorMidiMutations } from './useSnapshotEditorMidiMutations'

jest.mock('../../../map2/api', () => ({
  midiApiV2: {
    startLearn: jest.fn(),
    stopLearn: jest.fn(),
  },
}))

const mockedStartLearn = midiApiV2.startLearn as jest.MockedFunction<typeof midiApiV2.startLearn>
const mockedStopLearn = midiApiV2.stopLearn as jest.MockedFunction<typeof midiApiV2.stopLearn>

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

describe('useSnapshotEditorMidiMutations', () => {
  beforeEach(() => {
    mockedStartLearn.mockReset()
    mockedStopLearn.mockReset()
  })

  it('start success calls startLearn and invalidates MIDI queries', async () => {
    mockedStartLearn.mockResolvedValueOnce({} as never)
    const invalidateMidiQueries = jest.fn()
    const setMidiLearnActive = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorMidiMutations({ invalidateMidiQueries, setMidiLearnActive, pushToast }),
      { wrapper: makeWrapper() }
    )

    const params = {
      chain_id: 1,
      plugin_uri: 'urn:test',
      param_symbol: 'p',
      param_index: 0,
    }
    act(() => {
      result.current.startMidiLearnMutation.mutate(params)
    })

    await waitFor(() => expect(result.current.startMidiLearnMutation.isSuccess).toBe(true))
    expect(mockedStartLearn).toHaveBeenCalledWith(params)
    expect(invalidateMidiQueries).toHaveBeenCalledTimes(1)
    expect(pushToast).not.toHaveBeenCalled()
    expect(setMidiLearnActive).not.toHaveBeenCalled()
  })

  it('start error clears learn-active flag and toasts the message', async () => {
    mockedStartLearn.mockRejectedValueOnce(new Error('boom-start'))
    const invalidateMidiQueries = jest.fn()
    const setMidiLearnActive = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorMidiMutations({ invalidateMidiQueries, setMidiLearnActive, pushToast }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.startMidiLearnMutation.mutate({
        chain_id: 1,
        plugin_uri: 'urn:test',
        param_symbol: 'p',
        param_index: 0,
      })
    })

    await waitFor(() => expect(result.current.startMidiLearnMutation.isError).toBe(true))
    expect(setMidiLearnActive).toHaveBeenCalledWith(false)
    expect(pushToast).toHaveBeenCalledWith('boom-start', 'error')
    expect(invalidateMidiQueries).not.toHaveBeenCalled()
  })

  it('stop success clears learn-active flag and invalidates MIDI queries', async () => {
    mockedStopLearn.mockResolvedValueOnce({} as never)
    const invalidateMidiQueries = jest.fn()
    const setMidiLearnActive = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorMidiMutations({ invalidateMidiQueries, setMidiLearnActive, pushToast }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.stopMidiLearnMutation.mutate()
    })

    await waitFor(() => expect(result.current.stopMidiLearnMutation.isSuccess).toBe(true))
    expect(mockedStopLearn).toHaveBeenCalled()
    expect(setMidiLearnActive).toHaveBeenCalledWith(false)
    expect(invalidateMidiQueries).toHaveBeenCalledTimes(1)
    expect(pushToast).not.toHaveBeenCalled()
  })

  it('stop error toasts the message and does not clear learn-active flag', async () => {
    mockedStopLearn.mockRejectedValueOnce(new Error('boom-stop'))
    const invalidateMidiQueries = jest.fn()
    const setMidiLearnActive = jest.fn()
    const pushToast = jest.fn()
    const { result } = renderHook(
      () =>
        useSnapshotEditorMidiMutations({ invalidateMidiQueries, setMidiLearnActive, pushToast }),
      { wrapper: makeWrapper() }
    )

    act(() => {
      result.current.stopMidiLearnMutation.mutate()
    })

    await waitFor(() => expect(result.current.stopMidiLearnMutation.isError).toBe(true))
    expect(pushToast).toHaveBeenCalledWith('boom-stop', 'error')
    expect(setMidiLearnActive).not.toHaveBeenCalled()
    expect(invalidateMidiQueries).not.toHaveBeenCalled()
  })
})
