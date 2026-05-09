/**
 * T2499-A slice 6 — Configurator bindings writer.
 *
 * Submits operator-chosen bindings to the canonical MIDI Services
 * binding authority (`POST /api/midi/bindings`, schema mirrors
 * `app/services/midi/schemas.py`).
 *
 * Idempotency: the authority generates a fresh UUID on every
 * `create()`, so duplicate-detection lives client-side. We do this
 * via *list-before-post by content equality*:
 *
 *   1. List existing bindings filtered to `(consumer_type=brain_slot,
 *      consumer_id=<slot>)`.
 *   2. Check whether any existing binding has the same `(source_type,
 *      source_descriptor, target_type, target_descriptor)` tuple.
 *   3. If yes → return the existing binding unchanged ("already
 *      bound, nothing to do").
 *   4. If no → POST a new binding with `source='configurator'` so the
 *      provenance is traceable. Return the new binding.
 *
 * **Author note (autonomous-10 cycle 7, 2026-05-09):** the locked
 * spec says the Configurator must write bindings "to MIDI Services
 * Bindings (canonical authority); not snapshot-scoped, not dual."
 * This writer obeys: scope=`global`, consumer_type=`brain_slot`,
 * provenance=`configurator`. Schema decisions made here for
 * subsequent review:
 *   - Equality is by JSON-serialized descriptor — exact match. No
 *     semantic equivalence (e.g. `{cc:7,channel:1}` vs
 *     `{channel:1,cc:7}` ARE treated as equal because we sort keys
 *     before comparing).
 *   - We never `update()` an existing matching binding; if the
 *     operator wants to change the source/target, they delete + retry.
 *   - We never auto-disable conflicting bindings on the same slot
 *     (operator-managed: two bindings for the same slot = two valid
 *     ways to trigger the action).
 */

import {
  type MidiBindingCreate,
  type MidiBindingRead,
  midiBindingsApi,
} from '../../../map2/clients/midiBindings'
import type { MidiLearnEvent, MidiLearnSubmission } from './MidiLearnModule'

const PROVENANCE = 'configurator'
const CREATED_BY_DEFAULT = 'configurator-v1'

export interface BindingsWriterOptions {
  /** Override the `created_by` provenance for tests + audit. */
  createdBy?: string
  /** Override the `device_id` recorded with the binding. */
  deviceId?: string | null
  /** Override the entire MIDI bindings client (tests). */
  client?: Pick<typeof midiBindingsApi, 'list' | 'create'>
}

export interface ConfiguratorBindingResult {
  binding: MidiBindingRead
  /** True if this exact (source, target) tuple already existed. */
  duplicate: boolean
}

/** Stable JSON serializer — sorts object keys recursively so tuple
 *  comparisons aren't fooled by key ordering. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

function bindingShapeKey(payload: {
  source_type: string
  source_descriptor?: Record<string, unknown>
  target_type: string
  target_descriptor?: Record<string, unknown>
}): string {
  return [
    payload.source_type,
    stableStringify(payload.source_descriptor ?? {}),
    payload.target_type,
    stableStringify(payload.target_descriptor ?? {}),
  ].join('|')
}

/** Convert a captured MIDI Learn event into a `(source_type,
 *  source_descriptor)` pair for the bindings authority. */
export function eventToSource(event: MidiLearnEvent): {
  source_type: 'midi_cc' | 'midi_pc' | 'midi_note'
  source_descriptor: Record<string, unknown>
} {
  switch (event.status) {
    case 'cc':
      return {
        source_type: 'midi_cc',
        source_descriptor: { channel: event.channel, cc: event.data1 },
      }
    case 'pc':
      return {
        source_type: 'midi_pc',
        source_descriptor: { channel: event.channel, program: event.data1 },
      }
    case 'note_on':
    case 'note_off':
      return {
        source_type: 'midi_note',
        source_descriptor: { channel: event.channel, note: event.data1 },
      }
    default:
      // Fall through: store status verbatim so the authority's
      // unknown-source path surfaces a clean error.
      return {
        source_type: 'midi_cc',
        source_descriptor: {
          channel: event.channel,
          cc: event.data1,
          unrecognised_status: event.status,
        },
      }
  }
}

/** Build a `MidiBindingCreate` payload for a brain-slot binding. */
export function buildBrainSlotPayload(
  submission: MidiLearnSubmission,
  options: BindingsWriterOptions = {},
): MidiBindingCreate {
  const source = eventToSource(submission.event)
  return {
    consumer_type: 'brain_slot',
    consumer_id: submission.slot.id,
    consumer_label: submission.slot.label,
    source_type: source.source_type,
    source_descriptor: source.source_descriptor,
    target_type: 'brain_slot',
    target_descriptor: { brain_slot_id: submission.slot.id },
    device_id: options.deviceId ?? submission.event.source_id ?? null,
    scope: 'global',
    enabled: true,
    source: PROVENANCE,
    metadata: submission.notes ? { notes: submission.notes } : {},
    created_by: options.createdBy ?? CREATED_BY_DEFAULT,
  }
}

/**
 * Submit a MIDI Learn submission to the bindings authority,
 * idempotent on `(consumer_type, consumer_id, source_type,
 * source_descriptor, target_type, target_descriptor)`.
 *
 * Returns the binding (existing or newly created) plus a
 * `duplicate: boolean` flag.
 */
export async function submitBrainSlotBinding(
  submission: MidiLearnSubmission,
  options: BindingsWriterOptions = {},
): Promise<ConfiguratorBindingResult> {
  const client = options.client ?? midiBindingsApi
  const payload = buildBrainSlotPayload(submission, options)
  const newKey = bindingShapeKey(payload)
  const existing = await client.list({
    consumer_type: 'brain_slot',
    consumer_id: payload.consumer_id,
  })
  const dup = existing.find((b) => bindingShapeKey(b) === newKey)
  if (dup) {
    return { binding: dup, duplicate: true }
  }
  const created = await client.create(payload)
  return { binding: created, duplicate: false }
}
