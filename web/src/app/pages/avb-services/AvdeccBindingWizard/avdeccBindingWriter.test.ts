/**
 * T2499-C Slice 6 — Brain-input binding writer tests.
 */
import {
  bindingShapeKey,
  composeBinding,
  submitAvdeccBrainBinding,
  type AvdeccBinding,
  type AvdeccBindingClient,
  type AvdeccBindingPayload,
} from './avdeccBindingWriter'
import type { AvbAvdeccEntity } from '../../../components/AvbRouting/types/endpoint'

function makeEntity(over: Partial<AvbAvdeccEntity> = {}): AvbAvdeccEntity {
  return {
    entity_id: '0010fa0000000001',
    entity_model_id: 'fa00000000000000',
    entity_name: 'Drum mic',
    firmware_version: '1.0.0',
    mac_address: '00:10:fa:00:00:01',
    capabilities: {
      talker_streams: 1,
      listener_streams: 0,
      is_audio_talker: true,
      is_audio_listener: false,
      gptp_supported: true,
    },
    ptp: { grandmaster_id: '0000000000000000', domain: 0 },
    available: true,
    last_seen: '2026-05-10T00:00:00Z',
    source_node_id: 'host',
    ...over,
  }
}

function makeClient(initial: AvdeccBinding[] = []): AvdeccBindingClient & {
  created: AvdeccBindingPayload[]
} {
  const store: AvdeccBinding[] = [...initial]
  const created: AvdeccBindingPayload[] = []
  return {
    list: jest.fn(async ({ consumer_id }) => {
      return store.filter(
        (b) => b.payload.consumer_descriptor.brain_slot_id === consumer_id,
      )
    }),
    create: jest.fn(async (payload) => {
      created.push(payload)
      const fresh = {
        id: `binding-${store.length + 1}`,
        payload,
        created_at: '2026-05-10T00:00:00Z',
      }
      store.push(fresh)
      return fresh
    }),
    created,
  } as AvdeccBindingClient & { created: AvdeccBindingPayload[] }
}

// ---------------------------------------------------------------------------
// composeBinding
// ---------------------------------------------------------------------------

describe('composeBinding', () => {
  it('builds the canonical brain-slot AVDECC binding shape', () => {
    const payload = composeBinding(makeEntity(), 4)
    expect(payload).toEqual({
      source_type: 'avdecc_stream',
      source_descriptor: {
        entity_id: '0010fa0000000001',
        direction: 'talker',
        talker_streams: 1,
        listener_streams: 0,
      },
      consumer_type: 'brain_slot',
      consumer_descriptor: { brain_slot_id: 4 },
      scope: 'global',
      provenance: 'avdecc_binding_wizard',
    })
  })

  it('uses listener direction for pure listeners', () => {
    const payload = composeBinding(
      makeEntity({
        capabilities: {
          talker_streams: 0,
          listener_streams: 8,
          is_audio_talker: false,
          is_audio_listener: true,
          gptp_supported: true,
        },
      }),
      0,
    )
    expect(payload.source_descriptor.direction).toBe('listener')
  })

  it('respects an explicit direction override', () => {
    const payload = composeBinding(makeEntity(), 0, { direction: 'listener' })
    expect(payload.source_descriptor.direction).toBe('listener')
  })

  it('attaches metadata.notes when notes are provided', () => {
    const payload = composeBinding(makeEntity(), 1, { notes: 'kick drum' })
    expect(payload.metadata).toEqual({ notes: 'kick drum' })
  })

  it('omits metadata when no notes are provided', () => {
    const payload = composeBinding(makeEntity(), 1)
    expect(payload.metadata).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// bindingShapeKey
// ---------------------------------------------------------------------------

describe('bindingShapeKey', () => {
  it('produces the same key for payloads with reordered descriptor keys', () => {
    const a: AvdeccBindingPayload = {
      source_type: 'avdecc_stream',
      source_descriptor: {
        entity_id: 'aaa',
        direction: 'talker',
        talker_streams: 1,
        listener_streams: 0,
      },
      consumer_type: 'brain_slot',
      consumer_descriptor: { brain_slot_id: 0 },
      scope: 'global',
      provenance: 'avdecc_binding_wizard',
    }
    const b: AvdeccBindingPayload = {
      source_type: 'avdecc_stream',
      source_descriptor: {
        listener_streams: 0,
        talker_streams: 1,
        direction: 'talker',
        entity_id: 'aaa',
      },
      consumer_type: 'brain_slot',
      consumer_descriptor: { brain_slot_id: 0 },
      scope: 'global',
      provenance: 'avdecc_binding_wizard',
    }
    expect(bindingShapeKey(a)).toBe(bindingShapeKey(b))
  })

  it('produces different keys for different brain_slot_id', () => {
    const a = composeBinding(makeEntity(), 0)
    const b = composeBinding(makeEntity(), 1)
    expect(bindingShapeKey(a)).not.toBe(bindingShapeKey(b))
  })

  it('produces different keys for different direction', () => {
    const a = composeBinding(makeEntity(), 0, { direction: 'talker' })
    const b = composeBinding(makeEntity(), 0, { direction: 'listener' })
    expect(bindingShapeKey(a)).not.toBe(bindingShapeKey(b))
  })
})

// ---------------------------------------------------------------------------
// submitAvdeccBrainBinding
// ---------------------------------------------------------------------------

describe('submitAvdeccBrainBinding', () => {
  it('creates a new binding when the slot has no match', async () => {
    const client = makeClient()
    const result = await submitAvdeccBrainBinding(makeEntity(), 0, client)
    expect(result.duplicate).toBeUndefined()
    expect(client.create).toHaveBeenCalledTimes(1)
    expect(result.payload.consumer_descriptor.brain_slot_id).toBe(0)
  })

  it('returns the existing binding (duplicate=true) when shape matches', async () => {
    const entity = makeEntity()
    const existing = composeBinding(entity, 0)
    const client = makeClient([
      { id: 'pre-existing-1', payload: existing },
    ])
    const result = await submitAvdeccBrainBinding(entity, 0, client)
    expect(result.duplicate).toBe(true)
    expect(result.id).toBe('pre-existing-1')
    expect(client.create).not.toHaveBeenCalled()
  })

  it('does not dedupe across different brain slots', async () => {
    const entity = makeEntity()
    const slot0 = composeBinding(entity, 0)
    const client = makeClient([
      { id: 'slot-0-binding', payload: slot0 },
    ])
    const result = await submitAvdeccBrainBinding(entity, 1, client)
    expect(result.duplicate).toBeUndefined()
    expect(client.create).toHaveBeenCalledTimes(1)
    expect(result.payload.consumer_descriptor.brain_slot_id).toBe(1)
  })

  it('does not dedupe across different entities', async () => {
    const entityA = makeEntity({ entity_id: '0010fa0000000001' })
    const entityB = makeEntity({ entity_id: '0010fa0000000002' })
    const slotA = composeBinding(entityA, 0)
    const client = makeClient([
      { id: 'entity-a-binding', payload: slotA },
    ])
    const result = await submitAvdeccBrainBinding(entityB, 0, client)
    expect(result.duplicate).toBeUndefined()
    expect(client.create).toHaveBeenCalledTimes(1)
  })

  it('rejects negative brain_slot_id', async () => {
    const client = makeClient()
    await expect(
      submitAvdeccBrainBinding(makeEntity(), -1, client),
    ).rejects.toThrow(/non-negative integer/)
  })

  it('rejects fractional brain_slot_id', async () => {
    const client = makeClient()
    await expect(
      submitAvdeccBrainBinding(makeEntity(), 1.5, client),
    ).rejects.toThrow(/non-negative integer/)
  })

  it('passes notes through to metadata when provided', async () => {
    const client = makeClient()
    await submitAvdeccBrainBinding(makeEntity(), 0, client, { notes: 'snare top' })
    expect(client.created[0].metadata).toEqual({ notes: 'snare top' })
  })
})
