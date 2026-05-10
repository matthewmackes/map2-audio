/**
 * Phase 0.4 — generic device-learn polling subscriber.
 *
 * Anchors on the sequence number observed at subscribe time and
 * emits exactly once when a strictly larger sequence arrives.
 */
import { createDeviceLearnPollingSubscriber } from './deviceLearnPollingSubscriber'
import type { DeviceLearnLastEventResponse } from '../../../map2/clients/deviceLearnEvents'
import type { DeviceLearnEvent } from './types'

/**
 * Wait long enough for the polling loop's `setTimeout(intervalMs)`
 * cycles to fire several times. The subscriber uses real timers, so
 * we sleep on the microtask queue and yield to the macrotask queue.
 */
async function waitMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe('createDeviceLearnPollingSubscriber', () => {
  it('does not emit the baseline sequence', async () => {
    const payload: DeviceLearnLastEventResponse = {
      pack_id: 'p',
      sequence: 7,
      observed_at: 1000,
      event: {
        kind: 'hid',
        vendor_id: 0,
        product_id: 0,
        control_id: 'pad-1',
        control_kind: 'pad',
        value: 0.1,
      },
    }
    const fetchLastEvent = jest.fn(async () => payload)
    const subscribe = createDeviceLearnPollingSubscriber('p', {
      intervalMs: 5,
      fetchLastEvent,
    })
    const onEvent = jest.fn()
    const teardown = subscribe(onEvent)
    await waitMs(40)
    teardown()
    expect(onEvent).not.toHaveBeenCalled()
    expect(fetchLastEvent.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('emits once when a strictly larger sequence arrives', async () => {
    const state: { seq: number; event: DeviceLearnEvent } = {
      seq: 7,
      event: {
        kind: 'hid',
        vendor_id: 0,
        product_id: 0,
        control_id: 'pad-1',
        control_kind: 'pad',
        value: 0.1,
      },
    }
    const fetchLastEvent = jest.fn(async () => ({
      pack_id: 'p',
      sequence: state.seq,
      observed_at: 1000,
      event: state.event,
    }))
    const subscribe = createDeviceLearnPollingSubscriber('p', {
      intervalMs: 5,
      fetchLastEvent,
    })
    const onEvent = jest.fn()
    const teardown = subscribe(onEvent)
    await waitMs(30)
    expect(onEvent).not.toHaveBeenCalled()
    state.seq = 8
    state.event = {
      kind: 'hid',
      vendor_id: 0,
      product_id: 0,
      control_id: 'pad-2',
      control_kind: 'pad',
      value: 0.7,
    }
    await waitMs(60)
    teardown()
    expect(onEvent).toHaveBeenCalledTimes(1)
    const ev = onEvent.mock.calls[0][0]
    expect(ev.kind).toBe('hid')
    expect(ev.control_id).toBe('pad-2')
  })

  it('survives transient fetch failures', async () => {
    let calls = 0
    const fetchLastEvent = jest.fn(async () => {
      calls += 1
      if (calls < 3) throw new Error('network blip')
      return {
        pack_id: 'p',
        sequence: 7,
        observed_at: 1000,
        event: null,
      } as DeviceLearnLastEventResponse
    })
    const subscribe = createDeviceLearnPollingSubscriber('p', {
      intervalMs: 5,
      fetchLastEvent,
    })
    const onEvent = jest.fn()
    const teardown = subscribe(onEvent)
    await waitMs(60)
    teardown()
    expect(fetchLastEvent.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('teardown halts further polling', async () => {
    const fetchLastEvent = jest.fn(async () => ({
      pack_id: 'p',
      sequence: 1,
      observed_at: 1000,
      event: null,
    }))
    const subscribe = createDeviceLearnPollingSubscriber('p', {
      intervalMs: 5,
      fetchLastEvent,
    })
    const onEvent = jest.fn()
    const teardown = subscribe(onEvent)
    await waitMs(15)
    const callsBefore = fetchLastEvent.mock.calls.length
    teardown()
    await waitMs(40)
    expect(fetchLastEvent.mock.calls.length).toBeLessThanOrEqual(callsBefore + 1)
  })
})
