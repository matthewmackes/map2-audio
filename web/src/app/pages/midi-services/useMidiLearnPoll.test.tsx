/**
 * T2483 loop 18 / iter 176 — useMidiLearnPoll tests.
 *
 * Mocks midiBindingsApi.lastCc + uses jest.useFakeTimers() to
 * step the 250ms poll loop deterministically.
 */

import '@testing-library/jest-dom'
import { act, renderHook } from '@testing-library/react'

const mockLastCc = jest.fn()

jest.mock('../../../map2/clients/midiBindings', () => {
  const actual = jest.requireActual('../../../map2/clients/midiBindings')
  return {
    ...actual,
    midiBindingsApi: {
      ...actual.midiBindingsApi,
      lastCc: (...args: unknown[]) => mockLastCc(...args),
    },
  }
})

import { useMidiLearnPoll } from './useMidiLearnPoll'

beforeEach(() => {
  jest.useFakeTimers()
  mockLastCc.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

async function flushPromises() {
  // Allow microtasks (resolved promises) to drain so the .then()
  // chain inside the polling fetch can run between fake-timer ticks.
  await Promise.resolve()
  await Promise.resolve()
}

describe('useMidiLearnPoll', () => {
  it('starts inactive and becomes active after start()', () => {
    const onCapture = jest.fn()
    const { result } = renderHook(() => useMidiLearnPoll({ onCapture }))
    expect(result.current.active).toBe(false)
    act(() => {
      result.current.start()
    })
    expect(result.current.active).toBe(true)
  })

  it('cancel() makes the hook inactive again', () => {
    const onCapture = jest.fn()
    const { result } = renderHook(() => useMidiLearnPoll({ onCapture }))
    act(() => {
      result.current.start()
    })
    act(() => {
      result.current.cancel()
    })
    expect(result.current.active).toBe(false)
  })

  it('does not fire onCapture when /last-cc returns null', async () => {
    const onCapture = jest.fn()
    mockLastCc.mockResolvedValue(null)
    const { result } = renderHook(() => useMidiLearnPoll({ onCapture }))
    act(() => {
      result.current.start()
    })
    await act(async () => {
      jest.advanceTimersByTime(250)
      await flushPromises()
    })
    expect(onCapture).not.toHaveBeenCalled()
    expect(result.current.active).toBe(true)
  })

  it('does not fire onCapture when observed_at is older than start time', async () => {
    const onCapture = jest.fn()
    // Stale observation (observed 100s before "now").
    mockLastCc.mockResolvedValue({
      cc: 7,
      channel: 0,
      value: 64,
      observed_at: Date.now() / 1000 - 100,
    })
    const { result } = renderHook(() => useMidiLearnPoll({ onCapture }))
    act(() => {
      result.current.start()
    })
    await act(async () => {
      jest.advanceTimersByTime(250)
      await flushPromises()
    })
    expect(onCapture).not.toHaveBeenCalled()
    expect(result.current.active).toBe(true)
  })

  it('fires onCapture and goes inactive when a fresh CC arrives', async () => {
    const onCapture = jest.fn()
    // Fresh observation (10s after "now" — definitely > startedAt).
    mockLastCc.mockResolvedValue({
      cc: 74,
      channel: 1,
      value: 100,
      observed_at: Date.now() / 1000 + 10,
    })
    const { result } = renderHook(() => useMidiLearnPoll({ onCapture }))
    act(() => {
      result.current.start()
    })
    await act(async () => {
      jest.advanceTimersByTime(250)
      await flushPromises()
    })
    expect(onCapture).toHaveBeenCalledWith({
      cc: 74,
      channel: 1,
      value: 100,
      observed_at: expect.any(Number),
    })
    expect(result.current.active).toBe(false)
  })

  it('times out and goes inactive after 10s without a fresh CC', async () => {
    const onCapture = jest.fn()
    mockLastCc.mockResolvedValue(null)
    const { result } = renderHook(() => useMidiLearnPoll({ onCapture }))
    act(() => {
      result.current.start()
    })
    // Advance past the 10s timeout.
    await act(async () => {
      jest.advanceTimersByTime(10_000)
      await flushPromises()
    })
    expect(result.current.active).toBe(false)
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('swallows fetch errors silently and keeps polling', async () => {
    const onCapture = jest.fn()
    mockLastCc.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useMidiLearnPoll({ onCapture }))
    act(() => {
      result.current.start()
    })
    await act(async () => {
      jest.advanceTimersByTime(250)
      await flushPromises()
    })
    // Still active — no crash.
    expect(result.current.active).toBe(true)
    expect(onCapture).not.toHaveBeenCalled()
  })
})
