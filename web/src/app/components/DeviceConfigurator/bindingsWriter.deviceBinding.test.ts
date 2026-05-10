/**
 * Phase 0.4 — bindingsWriter generic submitDeviceBinding +
 * submitConfiguratorBinding.
 *
 * Covers the non-MIDI path: HID + AVDECC events route through the
 * per-pack YAML override store, idempotent on (slot_id, event).
 */
import {
  buildDeviceBindingEntry,
  submitConfiguratorBinding,
  submitDeviceBinding,
} from './bindingsWriter'
import type { BrainSlotChoice, DeviceLearnSubmission } from './LearnModule'
import type {
  AvdeccDeviceLearnEvent,
  HidDeviceLearnEvent,
  MidiDeviceLearnEvent,
} from './types'

const PACK_ID = 'maschine_mk1'
const SLOT_A: BrainSlotChoice = { id: 'slot-a', label: 'Pad A' }
const SLOT_B: BrainSlotChoice = { id: 'slot-b', label: 'Pad B' }

function hidSubmission(
  overrides: Partial<HidDeviceLearnEvent> = {},
  slot: BrainSlotChoice = SLOT_A,
  notes = '',
): DeviceLearnSubmission {
  return {
    slot,
    notes,
    event: {
      kind: 'hid',
      vendor_id: 0x17cc,
      product_id: 0x0808,
      control_id: 'pad-7',
      control_kind: 'pad',
      value: 0.5,
      ...overrides,
    } as HidDeviceLearnEvent,
  }
}

function avdeccSubmission(
  overrides: Partial<AvdeccDeviceLearnEvent> = {},
  slot: BrainSlotChoice = SLOT_A,
): DeviceLearnSubmission {
  return {
    slot,
    notes: '',
    event: {
      kind: 'avdecc',
      entity_id: '0xabc',
      descriptor_type: 0x0005,
      descriptor_index: 0,
      value_change: { format: '0xfeed' },
      ...overrides,
    } as AvdeccDeviceLearnEvent,
  }
}

function midiSubmission(): DeviceLearnSubmission {
  return {
    slot: SLOT_A,
    notes: '',
    event: {
      kind: 'midi',
      status: 'cc',
      channel: 1,
      data1: 7,
      data2: 64,
    } as MidiDeviceLearnEvent,
  }
}

interface FakeOverridesClient {
  get: jest.Mock
  put: jest.Mock
}

function fakeOverridesClient(initialPayload: Record<string, unknown> | null = null): FakeOverridesClient {
  let stored: Record<string, unknown> | null =
    initialPayload === null ? null : { ...initialPayload }
  return {
    get: jest.fn(async (packId: string) => ({
      pack_id: packId,
      path: '/tmp/test-overrides.yaml',
      payload: stored,
    })),
    put: jest.fn(async (packId: string, payload: Record<string, unknown>) => {
      stored = { ...payload }
      return { pack_id: packId, path: '/tmp/test-overrides.yaml' }
    }),
  }
}

describe('buildDeviceBindingEntry', () => {
  it('emits the canonical entry shape with provenance fields', () => {
    const entry = buildDeviceBindingEntry(
      hidSubmission({ control_id: 'pad-3', value: 0.9 }, SLOT_B, 'live show'),
      { createdBy: 'test-suite' },
    )
    expect(entry.schema_version).toBe(1)
    expect(entry.slot_id).toBe('slot-b')
    expect(entry.slot_label).toBe('Pad B')
    expect(entry.event_kind).toBe('hid')
    expect((entry.event as HidDeviceLearnEvent).control_id).toBe('pad-3')
    expect((entry.event as HidDeviceLearnEvent).value).toBeCloseTo(0.9, 6)
    expect(entry.notes).toBe('live show')
    expect(entry.source).toBe('configurator')
    expect(entry.created_by).toBe('test-suite')
  })

  it('omits notes when blank', () => {
    const entry = buildDeviceBindingEntry(hidSubmission())
    expect(entry.notes).toBeUndefined()
  })
})

describe('submitDeviceBinding', () => {
  it('writes a new HID binding to an empty store', async () => {
    const client = fakeOverridesClient()
    const result = await submitDeviceBinding(PACK_ID, hidSubmission(), {
      overridesClient: client,
    })
    expect(result.duplicate).toBe(false)
    expect(result.slot_id).toBe('slot-a')
    expect(client.put).toHaveBeenCalledTimes(1)
    const written = client.put.mock.calls[0][1]
    expect((written.bindings as Record<string, unknown>)['slot-a']).toBeTruthy()
  })

  it('is idempotent on identical (slot, event) tuples', async () => {
    const client = fakeOverridesClient()
    const first = await submitDeviceBinding(PACK_ID, hidSubmission(), {
      overridesClient: client,
    })
    expect(first.duplicate).toBe(false)
    expect(client.put).toHaveBeenCalledTimes(1)

    const second = await submitDeviceBinding(PACK_ID, hidSubmission(), {
      overridesClient: client,
    })
    expect(second.duplicate).toBe(true)
    expect(client.put).toHaveBeenCalledTimes(1) // no second write
  })

  it('treats different slots independently', async () => {
    const client = fakeOverridesClient()
    await submitDeviceBinding(PACK_ID, hidSubmission(undefined, SLOT_A), {
      overridesClient: client,
    })
    const second = await submitDeviceBinding(PACK_ID, hidSubmission(undefined, SLOT_B), {
      overridesClient: client,
    })
    expect(second.duplicate).toBe(false)
    expect(client.put).toHaveBeenCalledTimes(2)
    const written = client.put.mock.calls[1][1]
    const bindings = written.bindings as Record<string, unknown>
    expect(bindings['slot-a']).toBeTruthy()
    expect(bindings['slot-b']).toBeTruthy()
  })

  it('updates a slot when the event payload changes', async () => {
    const client = fakeOverridesClient()
    await submitDeviceBinding(PACK_ID, hidSubmission({ value: 0.4 }), {
      overridesClient: client,
    })
    const second = await submitDeviceBinding(
      PACK_ID,
      hidSubmission({ value: 0.7 }),
      { overridesClient: client },
    )
    expect(second.duplicate).toBe(false)
    expect(client.put).toHaveBeenCalledTimes(2)
  })

  it('handles AVDECC events end-to-end', async () => {
    const client = fakeOverridesClient()
    const result = await submitDeviceBinding(PACK_ID, avdeccSubmission(), {
      overridesClient: client,
    })
    expect(result.duplicate).toBe(false)
    const written = client.put.mock.calls[0][1]
    const entry = (written.bindings as Record<string, unknown>)['slot-a'] as Record<
      string,
      unknown
    >
    expect(entry.event_kind).toBe('avdecc')
  })

  it('rejects MIDI submissions with a clear error', async () => {
    const client = fakeOverridesClient()
    await expect(
      submitDeviceBinding(PACK_ID, midiSubmission(), { overridesClient: client }),
    ).rejects.toThrow(/submitDeviceBinding rejected MIDI/)
    expect(client.put).not.toHaveBeenCalled()
  })

  it('preserves unrelated keys in the existing payload', async () => {
    const client = fakeOverridesClient({
      schema_version: 1,
      device: PACK_ID,
      calibration: { pad_sensitivity: 'high' },
    })
    await submitDeviceBinding(PACK_ID, hidSubmission(), { overridesClient: client })
    const written = client.put.mock.calls[0][1]
    expect((written.calibration as Record<string, unknown>).pad_sensitivity).toBe('high')
    expect((written.bindings as Record<string, unknown>)['slot-a']).toBeTruthy()
  })
})

describe('submitConfiguratorBinding', () => {
  it('routes MIDI events to the MIDI bindings authority', async () => {
    const midiClient = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'binding-1' }),
    }
    const overridesClient = fakeOverridesClient()
    const result = await submitConfiguratorBinding(PACK_ID, midiSubmission(), {
      client: midiClient,
      overridesClient,
    })
    expect(result.kind).toBe('midi')
    expect(midiClient.create).toHaveBeenCalledTimes(1)
    expect(overridesClient.put).not.toHaveBeenCalled()
  })

  it('routes HID events to the per-pack overrides store', async () => {
    const midiClient = { list: jest.fn(), create: jest.fn() }
    const overridesClient = fakeOverridesClient()
    const result = await submitConfiguratorBinding(PACK_ID, hidSubmission(), {
      client: midiClient,
      overridesClient,
    })
    expect(result.kind).toBe('device')
    expect(midiClient.create).not.toHaveBeenCalled()
    expect(overridesClient.put).toHaveBeenCalledTimes(1)
  })

  it('routes AVDECC events to the per-pack overrides store', async () => {
    const overridesClient = fakeOverridesClient()
    const result = await submitConfiguratorBinding('avdecc', avdeccSubmission(), {
      overridesClient,
    })
    expect(result.kind).toBe('device')
    if (result.kind === 'device') {
      expect(result.result.pack_id).toBe('avdecc')
    }
  })
})
