/**
 * T2499-C Slice 6 — Brain-input binding writer.
 *
 * Composes an AVDECC stream descriptor + a Brain input slot into a
 * binding the AVB Bindings authority accepts (POST /api/avb/bindings).
 *
 * Reuses the existing AVB binding contract — there is no new Brain-
 * input binding type; instead, we set:
 *
 *   consumer_type = 'brain_slot'
 *   consumer_descriptor = { brain_slot_id }
 *   source_type = 'avdecc_stream'
 *   source_descriptor = { entity_id, stream_id, direction }
 *   provenance = 'avdecc_binding_wizard'
 *
 * Idempotency: list-before-post by content equality. If a binding
 * with the same (source_type, normalized source_descriptor,
 * consumer_type, normalized consumer_descriptor) already exists for
 * the slot, return it with duplicate=true instead of creating a new
 * one. Mirrors the T2499-A bindings writer's idempotency story so
 * operator-managed conflicts stay operator-managed.
 *
 * Slice 6 ships:
 *  - composeBinding(entity, brain_slot_id) — pure function for tests.
 *  - submitAvdeccBrainBinding(entity, brain_slot_id, client) —
 *    list/upsert wrapper that the wizard's Bind button calls.
 *  - bindingShapeKey() — content-equality helper used by the upsert
 *    + by tests pinning the dedup behaviour.
 */
import type { AvbAvdeccEntity } from '../../../components/AvbRouting/types/endpoint'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AvdeccStreamDirection = 'talker' | 'listener'

export interface AvdeccBindingPayload {
  source_type: 'avdecc_stream'
  source_descriptor: {
    entity_id: string
    stream_id?: string
    direction: AvdeccStreamDirection
    talker_streams: number
    listener_streams: number
  }
  consumer_type: 'brain_slot'
  consumer_descriptor: {
    brain_slot_id: number
  }
  scope: 'global'
  provenance: 'avdecc_binding_wizard'
  metadata?: { notes?: string; [key: string]: unknown }
}

export interface AvdeccBinding {
  id: string
  payload: AvdeccBindingPayload
  created_at?: string
  duplicate?: boolean
}

export interface AvdeccBindingClient {
  list: (params: {
    consumer_type: 'brain_slot'
    consumer_id: number
  }) => Promise<AvdeccBinding[]>
  create: (payload: AvdeccBindingPayload) => Promise<AvdeccBinding>
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

export function composeBinding(
  entity: AvbAvdeccEntity,
  brain_slot_id: number,
  options: {
    direction?: AvdeccStreamDirection
    notes?: string
  } = {},
): AvdeccBindingPayload {
  // Direction defaults to 'talker' when the entity is an audio talker;
  // pure listeners are flagged as 'listener'. Bidir entities default to
  // 'talker' because Brain-input bindings consume sound coming OUT of
  // the entity (talker streams), not into it.
  const direction =
    options.direction ??
    (entity.capabilities.is_audio_talker ? 'talker' : 'listener')
  const payload: AvdeccBindingPayload = {
    source_type: 'avdecc_stream',
    source_descriptor: {
      entity_id: entity.entity_id,
      direction,
      talker_streams: entity.capabilities.talker_streams,
      listener_streams: entity.capabilities.listener_streams,
    },
    consumer_type: 'brain_slot',
    consumer_descriptor: { brain_slot_id },
    scope: 'global',
    provenance: 'avdecc_binding_wizard',
  }
  if (options.notes) {
    payload.metadata = { notes: options.notes }
  }
  return payload
}

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(',')}}`
}

export function bindingShapeKey(payload: AvdeccBindingPayload): string {
  return [
    payload.source_type,
    stableStringify(payload.source_descriptor),
    payload.consumer_type,
    stableStringify(payload.consumer_descriptor),
  ].join('|')
}

// ---------------------------------------------------------------------------
// Submit (idempotent upsert)
// ---------------------------------------------------------------------------

export async function submitAvdeccBrainBinding(
  entity: AvbAvdeccEntity,
  brain_slot_id: number,
  client: AvdeccBindingClient,
  options: { direction?: AvdeccStreamDirection; notes?: string } = {},
): Promise<AvdeccBinding> {
  if (!Number.isInteger(brain_slot_id) || brain_slot_id < 0) {
    throw new Error(
      `submitAvdeccBrainBinding: brain_slot_id must be a non-negative integer; got ${brain_slot_id}`,
    )
  }
  const payload = composeBinding(entity, brain_slot_id, options)
  const key = bindingShapeKey(payload)
  const existing = await client.list({
    consumer_type: 'brain_slot',
    consumer_id: brain_slot_id,
  })
  for (const candidate of existing) {
    if (bindingShapeKey(candidate.payload) === key) {
      return { ...candidate, duplicate: true }
    }
  }
  return await client.create(payload)
}
