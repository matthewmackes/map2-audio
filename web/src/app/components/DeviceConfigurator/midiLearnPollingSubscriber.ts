/**
 * Production MIDI Learn event source for the Configurator.
 *
 * Cycle 8 / 2026-05-09 — replaces the no-op `NULL_SUBSCRIBER` in
 * MidiServicesConfiguratorPage.tsx. The MidiLearnModule expects a
 * subscriber: a function that takes a callback + returns a teardown
 * handle. Implementations call the callback once per inbound event.
 *
 * We poll the existing `GET /api/midi/bindings/learn/last-cc` endpoint
 * (added in T2483-5 iter 172) at a short interval. The endpoint
 * returns the most-recent CC observed by the MidiLearnManager singleton
 * since service start. We snapshot ``observed_at`` at subscribe time
 * and only emit when the latest observation has a strictly newer
 * timestamp — so a CC observed before the operator hit "Listen" does
 * NOT replay; the first qualifying event triggers the callback once,
 * after which further events are ignored until the caller resubscribes
 * (matching the slot-by-slot capture flow the module expects).
 *
 * Why polling (not WebSocket): the existing learn pipeline is already
 * polling-based for the in-Snapshot-Editor Learn button. Reusing the
 * same surface keeps the contract consistent, avoids a parallel WS
 * stack, and matches the latency budget the module is happy with
 * (~250 ms is below operator perception for "press a button →
 * captured" workflows).
 */

import type { MidiEventSubscriber, MidiLearnEvent } from './MidiLearnModule'
import type { LastCcResponse } from '../../../map2/clients/midiBindings'
import { midiBindingsApi } from '../../../map2/clients/midiBindings'

const DEFAULT_POLL_INTERVAL_MS = 250

interface PollingSubscriberOptions {
  /** ms between polls. Default 250. */
  intervalMs?: number
  /** Inject for tests. Defaults to the real backend client. */
  fetchLastCc?: () => Promise<LastCcResponse | null>
}

function lastCcToLearnEvent(payload: LastCcResponse): MidiLearnEvent {
  return {
    status: 'cc',
    // The module displays channels as 1..16; backend reports 0..15
    // (or null for "any"). Translate; default to 1 when unknown.
    channel: typeof payload.channel === 'number' ? payload.channel + 1 : 1,
    data1: payload.cc,
    data2: payload.value,
    timestamp: new Date(payload.observed_at * 1000).toISOString(),
  }
}

export function createMidiLearnPollingSubscriber(
  options: PollingSubscriberOptions = {},
): MidiEventSubscriber {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const fetchLastCc = options.fetchLastCc ?? (() => midiBindingsApi.lastCc())

  return (onEvent) => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let baseline: number | null = null
    let emitted = false

    const tick = async () => {
      if (stopped) return
      try {
        const payload = await fetchLastCc()
        if (stopped) return
        if (payload != null) {
          if (baseline === null) {
            // Anchor on the very first poll so a CC observed before
            // subscribe time does not replay.
            baseline = payload.observed_at
          } else if (!emitted && payload.observed_at > baseline) {
            emitted = true
            onEvent(lastCcToLearnEvent(payload))
          }
        }
      } catch {
        // Network or backend hiccups must not kill the poll loop.
        // Operators will see "no event captured" in the module if
        // the backend stays down; that's the same UX as a missed event.
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
