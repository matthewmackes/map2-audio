/**
 * T2499-A slice 6 — bindings writer tests.
 *
 * Verifies the idempotent "list-before-post" upsert pattern, the
 * MidiLearnEvent → source descriptor mapping, and the structure of
 * the created brain-slot binding payload.
 */

import {
  buildBrainSlotPayload,
  eventToSource,
  stableStringify,
  submitBrainSlotBinding,
} from './bindingsWriter'
import type {
  MidiBindingCreate,
  MidiBindingRead,
} from '../../../map2/clients/midiBindings'
import type {
  BrainSlotChoice,
  MidiLearnEvent,
  MidiLearnSubmission,
} from './MidiLearnModule'

const SLOT: BrainSlotChoice = { id: 'slot-1', label: 'Brain slot 1' }

function makeSubmission(
  event: Partial<MidiLearnEvent>,
  notes = '',
  slot: BrainSlotChoice = SLOT,
): MidiLearnSubmission {
  return {
    slot,
    event: {
      status: 'cc',
      channel: 1,
      data1: 64,
      ...event,
    },
    notes,
  }
}

function makeRead(payload: MidiBindingCreate, id = 'b-001'): MidiBindingRead {
  return {
    binding_id: id,
    consumer_type: payload.consumer_type,
    consumer_id: payload.consumer_id,
    consumer_label: payload.consumer_label ?? '',
    source_type: payload.source_type,
    source_descriptor: payload.source_descriptor ?? {},
    target_type: payload.target_type,
    target_descriptor: payload.target_descriptor ?? {},
    device_id: payload.device_id ?? null,
    scope: payload.scope ?? 'global',
    scope_id: payload.scope_id ?? null,
    enabled: payload.enabled ?? true,
    source: payload.source ?? 'manual',
    metadata: payload.metadata ?? {},
    created_at: '2026-05-09T00:00:00Z',
    created_by: payload.created_by ?? 'unknown',
    modified_at: '2026-05-09T00:00:00Z',
    modified_by: payload.created_by ?? 'unknown',
  }
}

describe('stableStringify', () => {
  it('sorts object keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('sorts nested keys', () => {
    expect(stableStringify({ x: { z: 1, y: 2 } })).toBe('{"x":{"y":2,"z":1}}')
  })

  it('preserves array order', () => {
    expect(stableStringify({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}')
  })

  it('handles primitives + null', () => {
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify(42)).toBe('42')
    expect(stableStringify('hi')).toBe('"hi"')
  })

  it('treats reordered key sets as equal', () => {
    expect(stableStringify({ cc: 7, channel: 1 })).toBe(
      stableStringify({ channel: 1, cc: 7 }),
    )
  })
})

describe('eventToSource', () => {
  it('maps cc events to midi_cc with channel + cc fields', () => {
    expect(eventToSource({ status: 'cc', channel: 2, data1: 64 })).toEqual({
      source_type: 'midi_cc',
      source_descriptor: { channel: 2, cc: 64 },
    })
  })

  it('maps pc events to midi_pc with channel + program fields', () => {
    expect(eventToSource({ status: 'pc', channel: 5, data1: 12 })).toEqual({
      source_type: 'midi_pc',
      source_descriptor: { channel: 5, program: 12 },
    })
  })

  it('maps note_on events to midi_note', () => {
    expect(eventToSource({ status: 'note_on', channel: 1, data1: 60 })).toEqual({
      source_type: 'midi_note',
      source_descriptor: { channel: 1, note: 60 },
    })
  })

  it('falls back to midi_cc with an unrecognised_status field for unknown events', () => {
    expect(
      eventToSource({ status: 'sysex', channel: 1, data1: 0x12 }),
    ).toEqual({
      source_type: 'midi_cc',
      source_descriptor: { channel: 1, cc: 0x12, unrecognised_status: 'sysex' },
    })
  })
})

describe('buildBrainSlotPayload', () => {
  it('produces a brain_slot consumer + brain_slot target payload', () => {
    const payload = buildBrainSlotPayload(
      makeSubmission({ status: 'cc', channel: 1, data1: 7 }),
    )
    expect(payload.consumer_type).toBe('brain_slot')
    expect(payload.consumer_id).toBe('slot-1')
    expect(payload.target_type).toBe('brain_slot')
    expect(payload.target_descriptor).toEqual({ brain_slot_id: 'slot-1' })
  })

  it('records source="configurator" provenance', () => {
    expect(buildBrainSlotPayload(makeSubmission({})).source).toBe('configurator')
  })

  it('records scope="global" by default', () => {
    expect(buildBrainSlotPayload(makeSubmission({})).scope).toBe('global')
  })

  it('uses event.source_id as device_id when not overridden', () => {
    const payload = buildBrainSlotPayload(
      makeSubmission({ source_id: 'alsa-seq:Foo:0' }),
    )
    expect(payload.device_id).toBe('alsa-seq:Foo:0')
  })

  it('honors options.deviceId when supplied', () => {
    const payload = buildBrainSlotPayload(
      makeSubmission({ source_id: 'alsa-seq:Foo:0' }),
      { deviceId: 'override-device' },
    )
    expect(payload.device_id).toBe('override-device')
  })

  it('preserves notes in metadata when present', () => {
    expect(buildBrainSlotPayload(makeSubmission({}, 'expression pedal')).metadata).toEqual({
      notes: 'expression pedal',
    })
  })

  it('omits notes from metadata when absent', () => {
    expect(buildBrainSlotPayload(makeSubmission({})).metadata).toEqual({})
  })

  it('honors options.createdBy when supplied', () => {
    expect(
      buildBrainSlotPayload(makeSubmission({}), { createdBy: 'op@example.com' })
        .created_by,
    ).toBe('op@example.com')
  })
})

describe('submitBrainSlotBinding (idempotent upsert)', () => {
  function makeClient() {
    const list = jest.fn().mockResolvedValue([] as MidiBindingRead[])
    const create = jest.fn(async (p: MidiBindingCreate) => makeRead(p, 'b-new'))
    return { list, create }
  }

  it('lists existing bindings filtered to (brain_slot, slot_id) before posting', async () => {
    const client = makeClient()
    await submitBrainSlotBinding(makeSubmission({}), { client })
    expect(client.list).toHaveBeenCalledTimes(1)
    expect(client.list).toHaveBeenCalledWith({
      consumer_type: 'brain_slot',
      consumer_id: 'slot-1',
    })
  })

  it('returns duplicate=false + the created binding when no match exists', async () => {
    const client = makeClient()
    const result = await submitBrainSlotBinding(makeSubmission({}), { client })
    expect(result.duplicate).toBe(false)
    expect(client.create).toHaveBeenCalledTimes(1)
    expect(result.binding.binding_id).toBe('b-new')
  })

  it('returns duplicate=true + the existing binding when a tuple-match exists', async () => {
    const client = makeClient()
    const sub = makeSubmission({ status: 'cc', channel: 1, data1: 7 })
    const existing = makeRead(buildBrainSlotPayload(sub), 'b-existing')
    client.list.mockResolvedValueOnce([existing])
    const result = await submitBrainSlotBinding(sub, { client })
    expect(result.duplicate).toBe(true)
    expect(result.binding.binding_id).toBe('b-existing')
    expect(client.create).not.toHaveBeenCalled()
  })

  it('treats key-reordered descriptors as duplicates (stableStringify)', async () => {
    const client = makeClient()
    const sub = makeSubmission({ status: 'cc', channel: 1, data1: 7 })
    const existing = makeRead(buildBrainSlotPayload(sub), 'b-existing')
    // Reorder keys on the existing record's descriptor — must still match.
    existing.source_descriptor = { cc: 7, channel: 1 }
    existing.target_descriptor = { brain_slot_id: 'slot-1' }
    client.list.mockResolvedValueOnce([existing])
    const result = await submitBrainSlotBinding(sub, { client })
    expect(result.duplicate).toBe(true)
    expect(client.create).not.toHaveBeenCalled()
  })

  it('does NOT match when source_type differs even if descriptor numbers coincide', async () => {
    const client = makeClient()
    // Submission is a CC event. Existing binding for the same slot is a PC event
    // with the same channel/data1 numbers — must be treated as distinct.
    const sub = makeSubmission({ status: 'cc', channel: 1, data1: 7 })
    const ccPayload = buildBrainSlotPayload(sub)
    const pcExisting = makeRead(
      { ...ccPayload, source_type: 'midi_pc', source_descriptor: { channel: 1, program: 7 } },
      'b-pc',
    )
    client.list.mockResolvedValueOnce([pcExisting])
    const result = await submitBrainSlotBinding(sub, { client })
    expect(result.duplicate).toBe(false)
    expect(client.create).toHaveBeenCalledTimes(1)
  })

  it('does NOT match when consumer_id differs (different slots)', async () => {
    const client = makeClient()
    const subA = makeSubmission({ status: 'cc', channel: 1, data1: 7 })
    const subB = makeSubmission(
      { status: 'cc', channel: 1, data1: 7 },
      '',
      { id: 'slot-2', label: 'Slot 2' },
    )
    const slotABinding = makeRead(buildBrainSlotPayload(subA), 'b-A')
    // list() must be filtered by consumer_id, so the SUT only sees slot-2's bindings.
    client.list.mockImplementation(async (filter) =>
      filter.consumer_id === 'slot-1' ? [slotABinding] : [],
    )
    const result = await submitBrainSlotBinding(subB, { client })
    expect(result.duplicate).toBe(false)
    expect(client.list).toHaveBeenCalledWith({
      consumer_type: 'brain_slot',
      consumer_id: 'slot-2',
    })
    expect(client.create).toHaveBeenCalledTimes(1)
  })

  it('propagates list() errors to the caller', async () => {
    const client = makeClient()
    client.list.mockRejectedValueOnce(new Error('authority unreachable'))
    await expect(
      submitBrainSlotBinding(makeSubmission({}), { client }),
    ).rejects.toThrow('authority unreachable')
    expect(client.create).not.toHaveBeenCalled()
  })

  it('propagates create() errors to the caller', async () => {
    const client = makeClient()
    client.create.mockRejectedValueOnce(new Error('upsert failed'))
    await expect(
      submitBrainSlotBinding(makeSubmission({}), { client }),
    ).rejects.toThrow('upsert failed')
  })
})
