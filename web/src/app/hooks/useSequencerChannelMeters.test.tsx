import { act, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useSequencerChannelMeters } from './useSequencerChannelMeters'

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_WS = global.WebSocket

interface PolledFetchOptions {
  payload: unknown
  status?: number
}

function mockFetchOnce({ payload, status = 200 }: PolledFetchOptions) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as unknown as typeof fetch
}

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  global.WebSocket = ORIGINAL_WS
})

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'SequencerChannelMetersTestWrapper'
  return Wrapper
}

function Probe(): JSX.Element {
  const state = useSequencerChannelMeters({ useWebSocket: false, pollingIntervalMs: 50 })
  return (
    <ul>
      {state.meters.map((meter) => (
        <li key={meter.slotId} data-testid={`slot-${meter.slotId}`}>
          {meter.peakDb.toFixed(2)}|{meter.rmsDb.toFixed(2)}|{meter.clipping ? 'clip' : 'ok'}|{meter.peakHoldDb.toFixed(2)}
        </li>
      ))}
    </ul>
  )
}

test('polling fallback hydrates per-slot meters from /api/engine/sequencer/metering', async () => {
  mockFetchOnce({
    payload: {
      running: true,
      slots: [
        { slot_id: 0, peak_db: -3.0, rms_db: -6.0, clipping: false },
        { slot_id: 1, peak_db: 0.5, rms_db: -1.0, clipping: true },
      ],
    },
  })

  const Wrapper = createWrapper()
  const { getByTestId } = render(
    <Wrapper>
      <Probe />
    </Wrapper>,
  )

  await waitFor(() => {
    expect(getByTestId('slot-0').textContent).toContain('-3.00|-6.00|ok')
  })
  expect(getByTestId('slot-1').textContent).toContain('0.50|-1.00|clip')
  // Slots not present in the payload stay at the floor.
  expect(getByTestId('slot-15').textContent).toContain('-60.00|-60.00|ok')
})

test('peak-hold dot remembers the recent maximum across consecutive payloads', async () => {
  let fetchCount = 0
  global.fetch = jest.fn().mockImplementation(async () => {
    fetchCount += 1
    if (fetchCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          running: true,
          slots: [{ slot_id: 0, peak_db: -3.0, rms_db: -6.0, clipping: false }],
        }),
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        running: true,
        slots: [{ slot_id: 0, peak_db: -20.0, rms_db: -25.0, clipping: false }],
      }),
    }
  }) as unknown as typeof fetch

  const Wrapper = createWrapper()
  const { getByTestId } = render(
    <Wrapper>
      <Probe />
    </Wrapper>,
  )

  await waitFor(() => {
    expect(getByTestId('slot-0').textContent).toContain('-3.00')
  })
  // Wait for the second poll to fire and the live peak to fall — the
  // hold value should still report the earlier max (-3.00).
  await waitFor(
    () => {
      expect(getByTestId('slot-0').textContent).toContain('-20.00')
    },
    { timeout: 1500 },
  )
  const text = getByTestId('slot-0').textContent ?? ''
  // Format is "peak|rms|clip|hold" — last segment is the hold value.
  const segments = text.split('|')
  expect(segments[segments.length - 1]).toBe('-3.00')
})

test('out-of-range slot ids in the payload are dropped silently', async () => {
  mockFetchOnce({
    payload: {
      running: true,
      slots: [
        { slot_id: 99, peak_db: 0, rms_db: 0, clipping: true },
        { slot_id: 0, peak_db: -5, rms_db: -8, clipping: false },
      ],
    },
  })

  const Wrapper = createWrapper()
  const { getByTestId, queryByTestId } = render(
    <Wrapper>
      <Probe />
    </Wrapper>,
  )

  await waitFor(() => {
    expect(getByTestId('slot-0').textContent).toContain('-5.00')
  })
  expect(queryByTestId('slot-99')).toBeNull()
})

test('useWebSocket: false skips the WS lifecycle and the hook still renders', async () => {
  mockFetchOnce({ payload: { running: false, slots: [] } })

  // Spy on WebSocket constructor — it must NOT be called when useWebSocket=false.
  const wsSpy = jest.fn()
  global.WebSocket = wsSpy as unknown as typeof WebSocket

  const Wrapper = createWrapper()
  const { getByTestId } = render(
    <Wrapper>
      <Probe />
    </Wrapper>,
  )

  await act(async () => {
    await Promise.resolve()
  })

  expect(wsSpy).not.toHaveBeenCalled()
  // All slots remain at the floor with no WS data.
  expect(getByTestId('slot-0').textContent).toContain('-60.00|-60.00|ok')
})
