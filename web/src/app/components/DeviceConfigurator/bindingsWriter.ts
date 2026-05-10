/**
 * T2499-A slice 6 — Configurator bindings writer.
 *
 * Submits operator-chosen bindings to the canonical store for the
 * event's kind:
 *
 *   - MIDI events  → `POST /api/midi/bindings` (canonical MIDI
 *     Services binding authority; mirrors `app/services/midi/schemas.py`).
 *   - HID + AVDECC events → per-pack overrides via
 *     `PUT /api/devices/configurator/{pack_id}/overrides` writing a
 *     `bindings.<slot_id>` entry into the pack's YAML override store.
 *
 * Both paths are idempotent: identical (slot, event) tuples never
 * create duplicate state.
 *
 * The MIDI path is unchanged from T2499-A — list-before-post by
 * content equality. The non-MIDI path is read-modify-write on the
 * pack's YAML override file, with shape equality short-circuiting
 * the write when the same binding already exists.
 *
 * **Author note (autonomous-10 cycle 7, 2026-05-09):** the locked
 * spec says the Configurator must write bindings "to MIDI Services
 * Bindings (canonical authority); not snapshot-scoped, not dual."
 * That rule still holds for MIDI bindings. The T2499 mega-epic
 * (2026-05-09) extends it: per-installation HID + AVDECC bindings
 * live in per-device YAML override stores under
 * `~/.map2/devices/<pack_id>-<slug>.yaml`, matching the 'per-
 * installation device override pattern' established for MeloAudio.
 */

import {
  type MidiBindingCreate,
  type MidiBindingRead,
  midiBindingsApi,
} from '../../../map2/clients/midiBindings'
import {
  deviceOverridesApi,
  type DeviceOverridesPayload,
} from '../../../map2/clients/deviceOverrides'
import type { DeviceLearnEvent, MidiDeviceLearnEvent } from './types'
import type {
  BrainSlotChoice,
  DeviceLearnSubmission,
} from './LearnModule'
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
  /** Override the per-pack overrides client (tests). */
  overridesClient?: Pick<typeof deviceOverridesApi, 'get' | 'put'>
}

export interface ConfiguratorBindingResult {
  binding: MidiBindingRead
  /** True if this exact (source, target) tuple already existed. */
  duplicate: boolean
}

export interface ConfiguratorDeviceBindingResult {
  /** The pack the binding was written to. */
  pack_id: string
  /** Slot id the binding was attached to. */
  slot_id: string
  /** True if this exact (slot, event) tuple already existed. */
  duplicate: boolean
  /** Path to the YAML file that holds the override (for audit). */
  override_path: string
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

// ---------------------------------------------------------------------------
// Phase 0 — generic device binding writer (HID, AVDECC)
// ---------------------------------------------------------------------------

/**
 * Build the canonical YAML override entry for a non-MIDI event +
 * brain slot. Stored under `bindings.<slot_id>` in the pack's
 * override file. Schema is intentionally permissive — packs that
 * need richer fields can extend the entry but `kind`, `slot_id`,
 * and `event` are required.
 */
export function buildDeviceBindingEntry(
  submission: DeviceLearnSubmission,
  options: BindingsWriterOptions = {},
): Record<string, unknown> {
  return {
    schema_version: 1,
    slot_id: submission.slot.id,
    slot_label: submission.slot.label,
    event_kind: submission.event.kind,
    event: submission.event,
    notes: submission.notes || undefined,
    device_id: options.deviceId ?? submission.event.source_id ?? null,
    source: PROVENANCE,
    created_by: options.createdBy ?? CREATED_BY_DEFAULT,
  }
}

/**
 * Submit a non-MIDI Learn submission to the pack's YAML override
 * store. Idempotent on `(slot_id, event)` — if the existing entry
 * has the same shape (computed via stableStringify of the relevant
 * fields), the write is short-circuited and `duplicate=true`
 * returned.
 *
 * MIDI events are rejected with an error: callers should use
 * `submitBrainSlotBinding()` for MIDI.
 */
export async function submitDeviceBinding(
  packId: string,
  submission: DeviceLearnSubmission,
  options: BindingsWriterOptions = {},
): Promise<ConfiguratorDeviceBindingResult> {
  if (submission.event.kind === 'midi') {
    throw new Error(
      'submitDeviceBinding rejected MIDI event; use submitBrainSlotBinding for MIDI.',
    )
  }
  const client = options.overridesClient ?? deviceOverridesApi

  const current = await client.get(packId)
  const existingBindings =
    (current.payload?.bindings as Record<string, unknown> | undefined) ?? {}

  const newEntry = buildDeviceBindingEntry(submission, options)
  const existingEntry = existingBindings[submission.slot.id]

  const newKey = stableStringify({
    slot_id: newEntry.slot_id,
    event_kind: newEntry.event_kind,
    event: newEntry.event,
  })
  const existingKey = existingEntry
    ? stableStringify({
        slot_id: (existingEntry as Record<string, unknown>).slot_id,
        event_kind: (existingEntry as Record<string, unknown>).event_kind,
        event: (existingEntry as Record<string, unknown>).event,
      })
    : null

  if (existingKey === newKey) {
    return {
      pack_id: packId,
      slot_id: submission.slot.id,
      duplicate: true,
      override_path: current.path,
    }
  }

  const nextPayload: DeviceOverridesPayload = {
    ...(current.payload ?? {}),
    bindings: {
      ...existingBindings,
      [submission.slot.id]: newEntry,
    },
  }

  const written = await client.put(packId, nextPayload)
  return {
    pack_id: packId,
    slot_id: submission.slot.id,
    duplicate: false,
    override_path: written.path,
  }
}

/**
 * Unified submission entrypoint. Routes MIDI events to the canonical
 * MIDI Services authority and HID/AVDECC events to the per-pack
 * YAML override store. Callers wire this directly to
 * `LearnModule.onSubmit`.
 */
export async function submitConfiguratorBinding(
  packId: string,
  submission: DeviceLearnSubmission,
  options: BindingsWriterOptions = {},
): Promise<
  | { kind: 'midi'; result: ConfiguratorBindingResult }
  | { kind: 'device'; result: ConfiguratorDeviceBindingResult }
> {
  if (submission.event.kind === 'midi') {
    const midiSubmission: MidiLearnSubmission = {
      slot: submission.slot,
      event: stripMidiKind(submission.event as MidiDeviceLearnEvent),
      notes: submission.notes,
    }
    const result = await submitBrainSlotBinding(midiSubmission, options)
    return { kind: 'midi', result }
  }
  const result = await submitDeviceBinding(packId, submission, options)
  return { kind: 'device', result }
}

function stripMidiKind(event: MidiDeviceLearnEvent): MidiLearnEvent {
  const { kind: _kind, ...rest } = event
  void _kind
  return rest
}

export type { BrainSlotChoice }
