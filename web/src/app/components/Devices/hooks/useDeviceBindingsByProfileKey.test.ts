// T2480 Follow-up C: tests for the profile_key → registry-device join.

import type { MidiHubDeviceState } from '@/map2/api'
import {
  extractBindings,
  joinProfileKeysToDevices,
  profileKeyCandidates,
} from './useDeviceBindingsByProfileKey'

function deviceState(overrides: Partial<MidiHubDeviceState>): MidiHubDeviceState {
  return {
    device_id: 'test:1',
    profile_id: 'lexicon_mpx1',
    profile_name: 'Lexicon MPX1',
    port_ids: ['p1'],
    port_names: ['MPX1'],
    connected: true,
    responding: true,
    health: 'ok',
    latency_ms: 1.0,
    last_seen: '2026-04-30T00:00:00Z',
    vendor_id: null,
    product_id: null,
    manual_assignment: null,
    source: 'midi_hub',
    node_id: 'local',
    remote: false,
    bindings: [],
    ...overrides,
  }
}

describe('profileKeyCandidates', () => {
  it('returns empty for empty input', () => {
    expect(profileKeyCandidates('')).toEqual([])
  })

  it('extracts the model slug from a standard profile_key', () => {
    const cands = profileKeyCandidates('edirol-ua/ua-1000.midi')
    expect(cands).toContain('ua_1000')
  })

  it('also emits a pack-prefixed candidate for disambiguation', () => {
    const cands = profileKeyCandidates('edirol-ua/ua-1000.midi')
    expect(cands).toContain('edirol_ua_ua_1000')
  })

  it('emits a last-segment fallback for hyphenated models', () => {
    const cands = profileKeyCandidates('edirol-ua/ua-1000.midi')
    // last segment of "ua-1000" is "1000"
    expect(cands).toContain('1000')
  })

  it('handles models without hyphens (no last-segment candidate)', () => {
    const cands = profileKeyCandidates('lexicon/mpx1.midi')
    expect(cands).toContain('mpx1')
    // No hyphen → no extra last-segment slug.
    expect(cands).not.toContain('mpx')
  })

  it('handles malformed keys gracefully', () => {
    expect(profileKeyCandidates('no-slashes')).toEqual([])
  })
})

describe('joinProfileKeysToDevices', () => {
  it('returns empty map for no inputs', () => {
    expect(joinProfileKeysToDevices([], []).size).toBe(0)
    expect(joinProfileKeysToDevices(['x/y.midi'], []).size).toBe(0)
    expect(joinProfileKeysToDevices([], [deviceState({})]).size).toBe(0)
  })

  it('joins profile_key to a curated registry profile', () => {
    const result = joinProfileKeysToDevices(
      ['lexicon/mpx1.midi'],
      [deviceState({ device_id: 'lexicon_mpx1:abc', profile_id: 'lexicon_mpx1' })],
    )
    expect(result.has('lexicon/mpx1.midi')).toBe(true)
    expect(result.get('lexicon/mpx1.midi')).toHaveLength(1)
  })

  it('joins profile_key with hyphen to underscore-style profile_id', () => {
    const result = joinProfileKeysToDevices(
      ['edirol-ua/ua-1000.midi'],
      [deviceState({ device_id: 'ua_1000:abc', profile_id: 'ua_1000' })],
    )
    expect(result.get('edirol-ua/ua-1000.midi')).toHaveLength(1)
  })

  it('does NOT match unrelated profiles (no false positives)', () => {
    const result = joinProfileKeysToDevices(
      ['lexicon/mpx1.midi'],
      [deviceState({ device_id: 'beatstep_pro:abc', profile_id: 'beatstep_pro' })],
    )
    expect(result.size).toBe(0)
  })

  it('joins multiple devices to the same profile_key', () => {
    const result = joinProfileKeysToDevices(
      ['lexicon/mpx1.midi'],
      [
        deviceState({ device_id: 'lexicon_mpx1:a', profile_id: 'lexicon_mpx1' }),
        deviceState({ device_id: 'lexicon_mpx1:b', profile_id: 'lexicon_mpx1' }),
      ],
    )
    expect(result.get('lexicon/mpx1.midi')).toHaveLength(2)
  })

  it('joins the same device to multiple profile_keys when both match', () => {
    // Pathological case where two profile_keys both produce the same
    // candidate — both should match the single device.
    const result = joinProfileKeysToDevices(
      ['lexicon/mpx1.midi', 'other/mpx1.midi'],
      [deviceState({ device_id: 'lexicon_mpx1:a', profile_id: 'mpx1' })],
    )
    expect(result.get('lexicon/mpx1.midi')).toHaveLength(1)
    expect(result.get('other/mpx1.midi')).toHaveLength(1)
  })

  it('omits profile_keys with no matches from the result map', () => {
    const result = joinProfileKeysToDevices(
      ['lexicon/mpx1.midi', 'unmatched/x.midi'],
      [deviceState({ device_id: 'lexicon_mpx1:a', profile_id: 'lexicon_mpx1' })],
    )
    expect(result.has('lexicon/mpx1.midi')).toBe(true)
    expect(result.has('unmatched/x.midi')).toBe(false)
  })
})

describe('extractBindings', () => {
  it('returns empty for no devices / no bindings', () => {
    expect(extractBindings([])).toEqual([])
    expect(extractBindings([deviceState({ bindings: [] })])).toEqual([])
  })

  it('flattens bindings across devices', () => {
    const result = extractBindings([
      deviceState({
        device_id: 'd1',
        bindings: [
          { consumer_type: 'snapshot', consumer_id: '1', consumer_name: 'A', bound_at: 't', source: 's' },
        ],
      }),
      deviceState({
        device_id: 'd2',
        bindings: [
          { consumer_type: 'snapshot', consumer_id: '2', consumer_name: 'B', bound_at: 't', source: 's' },
        ],
      }),
    ])
    expect(result).toHaveLength(2)
    expect(result.map((b) => b.consumer_id).sort()).toEqual(['1', '2'])
  })

  it('dedupes bindings by (consumer_type, consumer_id)', () => {
    // Same snapshot bound to two devices → one extracted binding.
    const result = extractBindings([
      deviceState({
        device_id: 'd1',
        bindings: [
          { consumer_type: 'snapshot', consumer_id: '42', consumer_name: 'X', bound_at: 't', source: 's' },
        ],
      }),
      deviceState({
        device_id: 'd2',
        bindings: [
          { consumer_type: 'snapshot', consumer_id: '42', consumer_name: 'X', bound_at: 'u', source: 's' },
        ],
      }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.consumer_id).toBe('42')
  })
})
