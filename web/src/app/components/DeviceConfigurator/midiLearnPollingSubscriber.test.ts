/**
 * Unit tests for the MIDI Learn polling subscriber (cycle 8).
 *
 * Asserts the contract:
 *  - Subscribing starts a poll loop.
 *  - The subscriber anchors on the FIRST observation it sees, so a CC
 *    received before the operator hit "Listen" does not replay.
 *  - The first strictly-newer observation triggers the callback exactly
 *    once.
 *  - The teardown handle stops further polls + prevents post-stop
 *    callback delivery.
 *  - Network errors do not kill the loop.
 */

import { createMidiLearnPollingSubscriber } from './midiLearnPollingSubscriber'
import type { MidiLearnEvent } from './MidiLearnModule'

jest.useFakeTimers()

async function flushPromises(): Promise<void> {
  // Resolve a few microtask turns so promise.then chains inside the
  // poll loop settle. setImmediate is not available under jsdom.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function advance(ms: number) {
  jest.advanceTimersByTime(ms)
  await flushPromises()
  await flushPromises()
}

afterEach(() => {
  jest.clearAllTimers()
})

test('does not emit until a strictly-newer CC arrives after subscribe', async () => {
  const fetchLastCc = jest
    .fn()
    // First poll: observed_at=100 → anchored as baseline, NOT emitted.
    .mockResolvedValueOnce({ cc: 7, channel: 0, value: 64, observed_at: 100 })
    // Second poll: same observed_at → still not emitted (no new event).
    .mockResolvedValueOnce({ cc: 7, channel: 0, value: 65, observed_at: 100 })
    // Third poll: newer observed_at → emit.
    .mockResolvedValueOnce({ cc: 11, channel: 0, value: 90, observed_at: 200 })

  const subscriber = createMidiLearnPollingSubscriber({
    intervalMs: 50,
    fetchLastCc,
  })
  const events: MidiLearnEvent[] = []
  const unsubscribe = subscriber((e) => events.push(e))

  await advance(60)
  expect(events).toHaveLength(0)
  await advance(60)
  expect(events).toHaveLength(0)
  await advance(60)
  expect(events).toHaveLength(1)
  expect(events[0]).toEqual({
    status: 'cc',
    channel: 1,
    data1: 11,
    data2: 90,
    timestamp: new Date(200 * 1000).toISOString(),
  })

  unsubscribe()
})

test('emits at most once per subscription (slot-by-slot capture flow)', async () => {
  const fetchLastCc = jest
    .fn()
    .mockResolvedValueOnce({ cc: 1, channel: null, value: 0, observed_at: 100 })
    .mockResolvedValue({ cc: 2, channel: null, value: 0, observed_at: 300 })

  const subscriber = createMidiLearnPollingSubscriber({
    intervalMs: 30,
    fetchLastCc,
  })
  const events: MidiLearnEvent[] = []
  subscriber((e) => events.push(e))

  // Drive the loop several times after the first emission; only one
  // event should have been delivered.
  for (let i = 0; i < 6; i++) {
    await advance(40)
  }
  expect(events).toHaveLength(1)
})

test('teardown stops the poll loop', async () => {
  const fetchLastCc = jest.fn().mockResolvedValue(null)
  const subscriber = createMidiLearnPollingSubscriber({
    intervalMs: 20,
    fetchLastCc,
  })
  const onEvent = jest.fn()
  const unsubscribe = subscriber(onEvent)

  await advance(25)
  await advance(25)
  const callsBefore = fetchLastCc.mock.calls.length
  unsubscribe()
  await advance(200)
  // Teardown means no further fetches scheduled.
  expect(fetchLastCc.mock.calls.length).toBe(callsBefore)
  expect(onEvent).not.toHaveBeenCalled()
})

test('survives transient fetch failures without halting the loop', async () => {
  const fetchLastCc = jest
    .fn()
    .mockRejectedValueOnce(new Error('boom'))
    .mockResolvedValueOnce({ cc: 5, channel: 0, value: 1, observed_at: 100 })
    .mockResolvedValueOnce({ cc: 6, channel: 0, value: 2, observed_at: 300 })

  const subscriber = createMidiLearnPollingSubscriber({
    intervalMs: 25,
    fetchLastCc,
  })
  const events: MidiLearnEvent[] = []
  subscriber((e) => events.push(e))

  await advance(30) // failed fetch
  await advance(30) // baseline
  await advance(30) // emit
  expect(events).toHaveLength(1)
  expect(events[0].data1).toBe(6)
})

test('translates channel 0..15 → 1..16 and null → 1', async () => {
  const fetchLastCc = jest
    .fn()
    .mockResolvedValueOnce({ cc: 1, channel: null, value: 0, observed_at: 100 })
    .mockResolvedValueOnce({ cc: 1, channel: 5, value: 0, observed_at: 200 })

  const subscriber = createMidiLearnPollingSubscriber({
    intervalMs: 25,
    fetchLastCc,
  })
  const events: MidiLearnEvent[] = []
  subscriber((e) => events.push(e))

  await advance(30) // baseline (channel:null)
  await advance(30) // emit (channel:5 → 6)
  expect(events).toHaveLength(1)
  expect(events[0].channel).toBe(6)
})
