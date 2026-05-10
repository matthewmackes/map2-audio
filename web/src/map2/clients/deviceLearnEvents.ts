/**
 * Generic per-pack Learn-event client (T2499 Phase 0.2).
 *
 * Each Configurator pack that wants the framework Learn module to
 * capture its events registers a `LearnEventSource` on the backend.
 * This client polls the latest event regardless of kind:
 *
 *   GET /api/devices/configurator/{pack_id}/learn/last-event
 *
 * Returns a `DeviceLearnEvent` discriminated union (or null when the
 * pack has not observed any event since service start).
 *
 * The MIDI Configurator path still uses the older
 * `/api/midi/bindings/learn/last-cc` endpoint via
 * `midiLearnPollingSubscriber.ts` to avoid disturbing existing tests
 * — both paths emit the same client-facing `DeviceLearnEvent` shape.
 */
import { fetchJson } from '../http'
import { API_BASE } from '../transport'

import type {
  DeviceLearnEvent,
} from '../../app/components/DeviceConfigurator/types'

export interface DeviceLearnLastEventResponse {
  pack_id: string
  /** Most recent event observed since service start; null if none. */
  event: DeviceLearnEvent | null
  /** Monotonic counter incremented on each new event (for change detection). */
  sequence: number
  /** Wall-clock unix timestamp seconds when the event was observed. */
  observed_at: number | null
}

const base = (packId: string) =>
  `${API_BASE}/devices/configurator/${encodeURIComponent(packId)}/learn/last-event`

export const deviceLearnEventsApi = {
  lastEvent: (packId: string) =>
    fetchJson<DeviceLearnLastEventResponse>(base(packId), { cache: 'no-store' }),
}
