// T2480-2 hardening: pure-function tests for the merge logic that joins
// onboarded MIDI Hub devices with raw ALSA enumeration into the wizard's
// Detect-phase device list.

import type { MidiHubDeviceState } from '@/map2/api'
import { buildDetectionEntries } from './useKeyboardDetectionList'

function deviceState(overrides: Partial<MidiHubDeviceState>): MidiHubDeviceState {
  return {
    device_id: 'test:1',
    profile_id: 'test',
    profile_name: 'Test Device',
    port_ids: ['p1'],
    port_names: ['Test KBD'],
    connected: true,
    responding: true,
    health: 'ok',
    latency_ms: 1.2,
    last_seen: '2026-04-30T00:00:00Z',
    vendor_id: null,
    product_id: null,
    manual_assignment: null,
    source: 'midi_hub',
    node_id: 'local',
    remote: false,
    ...overrides,
  }
}

describe('buildDetectionEntries — merge order + provenance', () => {
  it('returns empty result for no inputs', () => {
    const result = buildDetectionEntries([], [])
    expect(result.entries).toEqual([])
    expect(result.onboarded_count).toBe(0)
    expect(result.new_count).toBe(0)
  })

  it('places onboarded devices first, raw "New" ports after', () => {
    const onboarded = [deviceState({ port_names: ['Edirol PCR-300'] })]
    const raw = ['Edirol PCR-300', 'Some Random Port']
    const result = buildDetectionEntries(onboarded, raw)

    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]!.source).toBe('onboarded')
    expect(result.entries[0]!.port_name).toBe('Edirol PCR-300')
    expect(result.entries[1]!.source).toBe('new')
    expect(result.entries[1]!.port_name).toBe('Some Random Port')
    expect(result.onboarded_count).toBe(1)
    expect(result.new_count).toBe(1)
  })

  it('does NOT double-list a port that appears in both sources', () => {
    const onboarded = [deviceState({ port_names: ['Edirol PCR-300'] })]
    const raw = ['Edirol PCR-300']
    const result = buildDetectionEntries(onboarded, raw)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.source).toBe('onboarded')
  })

  it('dedupes raw inputs by port name', () => {
    const result = buildDetectionEntries([], ['Same', 'Same', 'Other'])
    expect(result.entries).toHaveLength(2)
    expect(result.new_count).toBe(2)
  })

  it('skips raw entries that are blank strings', () => {
    const result = buildDetectionEntries([], ['', '   ', 'Real'])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.port_name).toBe('Real')
  })

  it('multi-port onboarded device claims every alias port', () => {
    const onboarded = [
      deviceState({
        device_id: 'test:1',
        port_names: ['Primary Port', 'Secondary Port', 'Tertiary Port'],
      }),
    ]
    const raw = ['Primary Port', 'Secondary Port', 'Tertiary Port', 'Unrelated']
    const result = buildDetectionEntries(onboarded, raw)
    // Only the primary port surfaces as the onboarded entry; the others
    // are claimed (so they do not show up as "New") but no duplicate
    // onboarded rows are emitted.
    expect(result.onboarded_count).toBe(1)
    expect(result.entries[0]!.port_name).toBe('Primary Port')
    // The unrelated port appears as New.
    expect(result.new_count).toBe(1)
    expect(result.entries[1]!.source).toBe('new')
    expect(result.entries[1]!.port_name).toBe('Unrelated')
  })

  it('skips devices with empty port_names', () => {
    const onboarded = [
      deviceState({ device_id: 'test:1', port_names: [] }),
      deviceState({ device_id: 'test:2', port_names: ['Real Port'] }),
    ]
    const result = buildDetectionEntries(onboarded, [])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.device_id).toBe('test:2')
  })

  it('preserves onboarded order from the registry', () => {
    const onboarded = [
      deviceState({ device_id: 'test:b', port_names: ['B Port'], profile_name: 'B' }),
      deviceState({ device_id: 'test:a', port_names: ['A Port'], profile_name: 'A' }),
    ]
    const result = buildDetectionEntries(onboarded, [])
    expect(result.entries.map((e) => e.port_name)).toEqual(['B Port', 'A Port'])
  })

  it('surfaces VID:PID and bindings on onboarded entries', () => {
    const onboarded = [
      deviceState({
        port_names: ['KBD'],
        vendor_id: '041e',
        product_id: '0010',
        bindings: [
          {
            consumer_type: 'snapshot',
            consumer_id: '42',
            consumer_name: 'Brain — KBD (set up 2026-04-30)',
            bound_at: '2026-04-30T12:00:00Z',
            source: 'brain-setup-task',
          },
        ],
      }),
    ]
    const result = buildDetectionEntries(onboarded, [])
    const entry = result.entries[0]!
    expect(entry.source).toBe('onboarded')
    if (entry.source === 'onboarded') {
      expect(entry.vendor_id).toBe('041e')
      expect(entry.product_id).toBe('0010')
      expect(entry.bindings).toHaveLength(1)
      expect(entry.bindings[0]!.consumer_id).toBe('42')
    }
  })
})
