/**
 * Production generic Learn event source for the Configurator
 * (T2499 Phase 0.2).
 *
 * Polls `GET /api/devices/configurator/{pack_id}/learn/last-event` at
 * a short interval. Anchors on the sequence number observed at
 * subscribe time and only emits when a strictly larger sequence
 * arrives — so an event observed before the operator hit "Listen"
 * does not replay; the first qualifying event triggers the callback
 * once, after which further events are ignored until the caller
 * resubscribes.
 *
 * Kind-agnostic: forwards whatever `DeviceLearnEvent` shape the
 * backend reports (MIDI / HID / AVDECC). Each pack's
 * `LearnEventSource` is responsible for emitting events in the
 * canonical union shape.
 */

import {
  deviceLearnEventsApi,
  type DeviceLearnLastEventResponse,
} from '../../../map2/clients/deviceLearnEvents'
import type {
  DeviceEventSubscriber,
} from './types'

const DEFAULT_POLL_INTERVAL_MS = 250

interface PollingSubscriberOptions {
  /** ms between polls. Default 250. */
  intervalMs?: number
  /** Inject for tests. Defaults to the real backend client. */
  fetchLastEvent?: (packId: string) => Promise<DeviceLearnLastEventResponse>
}

export function createDeviceLearnPollingSubscriber(
  packId: string,
  options: PollingSubscriberOptions = {},
): DeviceEventSubscriber {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const fetchLastEvent =
    options.fetchLastEvent ?? ((p: string) => deviceLearnEventsApi.lastEvent(p))

  return (onEvent) => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let baselineSequence: number | null = null
    let emitted = false

    const tick = async () => {
      if (stopped) return
      try {
        const payload = await fetchLastEvent(packId)
        if (stopped) return
        if (payload != null) {
          if (baselineSequence === null) {
            baselineSequence = payload.sequence
          } else if (
            !emitted &&
            payload.event !== null &&
            payload.sequence > baselineSequence
          ) {
            emitted = true
            onEvent(payload.event)
          }
        }
      } catch {
        // Network or backend hiccups must not kill the poll loop.
      }
      if (!stopped && !emitted) {
        timer = setTimeout(tick, intervalMs)
      }
    }

    void tick()

    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
    }
  }
}
