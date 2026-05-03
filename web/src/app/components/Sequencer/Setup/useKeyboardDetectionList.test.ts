// T2480-2 hardening + Follow-up B: pure-function tests for the
// detection-list builder. Single-source after Follow-up B refactor —
// every device on the registry payload is partitioned into "onboarded"
// vs "new" by profile_id + manual_assignment.

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

describe('buildDetectionEntries — onboarded vs new partition', () => {
  it('returns empty result for no devices', () => {
    const result = buildDetectionEntries([])
    expect(result.entries).toEqual([])
    expect(result.onboarded_count).toBe(0)
    expect(result.new_count).toBe(0)
  })

  it('classifies a curated-profile device as onboarded', () => {
    const result = buildDetectionEntries([
      deviceState({
        profile_id: 'edirol_pcr_300',
        profile_name: 'Edirol PCR-300',
      }),
    ])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.source).toBe('onboarded')
    expect(result.onboarded_count).toBe(1)
    expect(result.new_count).toBe(0)
  })

  it('classifies a generic-fallback device as new', () => {
    const result = buildDetectionEntries([
      deviceState({
        device_id: 'generic_controller:my_kbd',
        profile_id: 'generic_controller',
        profile_name: 'Generic Controller',
        manual_assignment: null,
      }),
    ])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.source).toBe('new')
    expect(result.new_count).toBe(1)
    expect(result.onboarded_count).toBe(0)
  })

  it('a generic-profile device WITH manual_assignment is treated as onboarded', () => {
    const result = buildDetectionEntries([
      deviceState({
        device_id: 'generic_controller:my_kbd',
        profile_id: 'generic_controller',
        manual_assignment: 'My KBD',
      }),
    ])
    expect(result.entries[0]!.source).toBe('onboarded')
  })

  it('places onboarded devices before new ones in the result', () => {
    const result = buildDetectionEntries([
      deviceState({
        device_id: 'generic_controller:zzz',
        profile_id: 'generic_controller',
        port_names: ['Zzz New Port'],
      }),
      deviceState({
        device_id: 'edirol_pcr_300:abc',
        profile_id: 'edirol_pcr_300',
        port_names: ['Edirol Port'],
      }),
    ])
    expect(result.entries.map((e) => e.port_name)).toEqual([
      'Edirol Port', // onboarded first
      'Zzz New Port', // new second
    ])
  })

  it('skips devices with empty port_names', () => {
    const result = buildDetectionEntries([
      deviceState({ device_id: 'test:1', port_names: [] }),
      deviceState({ device_id: 'test:2', port_names: ['Real Port'], profile_id: 'edirol_pcr_300' }),
    ])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.port_name).toBe('Real Port')
  })

  it('multi-port-alias device claims every alias to prevent double-listing', () => {
    const result = buildDetectionEntries([
      deviceState({
        device_id: 'test:1',
        profile_id: 'edirol_pcr_300',
        port_names: ['Primary', 'Secondary', 'Tertiary'],
      }),
    ])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.port_name).toBe('Primary')
  })

  it('exposes VID:PID on both onboarded and new entries when known', () => {
    const result = buildDetectionEntries([
      deviceState({
        profile_id: 'edirol_pcr_300',
        port_names: ['Edirol'],
        vendor_id: '0582',
        product_id: '0033',
      }),
      deviceState({
        device_id: 'generic_controller:rack',
        profile_id: 'generic_controller',
        port_names: ['Random Rack USB'],
        vendor_id: '041e',
        product_id: '0010',
      }),
    ])
    const onboarded = result.entries[0]!
    expect(onboarded.source).toBe('onboarded')
    if (onboarded.source === 'onboarded') {
      expect(onboarded.vendor_id).toBe('0582')
      expect(onboarded.product_id).toBe('0033')
    }
    const newEntry = result.entries[1]!
    expect(newEntry.source).toBe('new')
    if (newEntry.source === 'new') {
      expect(newEntry.vendor_id).toBe('041e')
      expect(newEntry.product_id).toBe('0010')
      expect(newEntry.generic_device_id).toBe('generic_controller:rack')
    }
  })

  it('surfaces bindings on onboarded entries', () => {
    const result = buildDetectionEntries([
      deviceState({
        profile_id: 'edirol_pcr_300',
        port_names: ['Edirol'],
        bindings: [
          {
            consumer_type: 'snapshot',
            consumer_id: '42',
            consumer_name: 'Brain — Edirol (set up 2026-04-30)',
            bound_at: '2026-04-30T12:00:00Z',
            source: 'brain-setup-task',
          },
        ],
      }),
    ])
    const entry = result.entries[0]!
    expect(entry.source).toBe('onboarded')
    if (entry.source === 'onboarded') {
      expect(entry.bindings).toHaveLength(1)
      expect(entry.bindings[0]!.consumer_id).toBe('42')
    }
  })
})
