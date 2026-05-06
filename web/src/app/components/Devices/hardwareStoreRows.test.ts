/**
 * Cycle 56 / audit Arch-13 — unit tests for the hardwareStoreRows
 * helpers extracted from HardwareStorePage.tsx.
 *
 * These tests pin behavior of the four pure helpers:
 *   - parseProfileKey: round-trips with indexProfiles' key shape
 *   - indexProfiles / indexPacks: dictionary builders are stable
 *   - toSequencerSnapshotBindings: filters non-snapshot consumers,
 *     returns undefined for empty / no-snapshot input
 *   - buildProfileRows: known-profile vs fallback branch, sort order
 */

import {
  buildProfileRows,
  indexPacks,
  indexProfiles,
  parseProfileKey,
  toSequencerSnapshotBindings,
  type ProfileRow,
} from './hardwareStoreRows'
import type {
  DeviceProfileSummary,
  PackSourceRow,
} from '../../../map2/clients/devices'
import type * as Api from '../../../map2/api'

describe('parseProfileKey', () => {
  it('parses a canonical key shape', () => {
    expect(parseProfileKey('lexicon/mpx1.audio')).toEqual({
      packId: 'lexicon',
      model: 'mpx1',
      kind: 'audio',
    })
  })

  it('round-trips with indexProfiles key shape', () => {
    const summary: DeviceProfileSummary = {
      pack_id: 'rocktron',
      model: 'intelfx',
      kind: 'audio',
    } as DeviceProfileSummary
    const indexed = indexProfiles([summary])
    const onlyKey = Object.keys(indexed)[0]
    expect(parseProfileKey(onlyKey)).toEqual({
      packId: 'rocktron',
      model: 'intelfx',
      kind: 'audio',
    })
  })

  it('falls back to "audio" kind when the kind segment is missing', () => {
    expect(parseProfileKey('vendor/model')).toEqual({
      packId: 'vendor',
      model: 'model',
      kind: 'audio',
    })
  })

  it('safely degrades to empty fields on a key with no slash', () => {
    // The fallback row needs *some* triple to render. If the key
    // doesn't conform to `<pack>/<model>.<kind>`, we surface empty
    // strings + the default `audio` kind rather than guessing —
    // letting the UI show "—" placeholders without crashing.
    expect(parseProfileKey('orphan')).toEqual({
      packId: '',
      model: '',
      kind: 'audio',
    })
  })
})

describe('indexProfiles', () => {
  it('builds a map keyed by `<pack>/<model>.<kind>`', () => {
    const summaries = [
      { pack_id: 'a', model: 'm1', kind: 'audio' } as DeviceProfileSummary,
      { pack_id: 'b', model: 'm2', kind: 'midi' } as DeviceProfileSummary,
    ]
    const out = indexProfiles(summaries)
    expect(Object.keys(out).sort()).toEqual(['a/m1.audio', 'b/m2.midi'])
    expect(out['a/m1.audio']).toBe(summaries[0])
    expect(out['b/m2.midi']).toBe(summaries[1])
  })

  it('returns an empty map for an empty input', () => {
    expect(indexProfiles([])).toEqual({})
  })
})

describe('indexPacks', () => {
  it('builds a map keyed by pack_id', () => {
    const rows = [
      { pack_id: 'lexicon', vendor: 'Lexicon' } as PackSourceRow,
      { pack_id: 'rocktron', vendor: 'Rocktron' } as PackSourceRow,
    ]
    const out = indexPacks(rows)
    expect(out['lexicon']).toBe(rows[0])
    expect(out['rocktron']).toBe(rows[1])
  })
})

describe('toSequencerSnapshotBindings', () => {
  const mkBinding = (
    overrides: Partial<Api.MidiHubDeviceBinding>,
  ): Api.MidiHubDeviceBinding =>
    ({
      consumer_type: 'snapshot',
      consumer_id: 'snap-1',
      consumer_name: 'Snapshot 1',
      source: 'manual',
      ...overrides,
    } as Api.MidiHubDeviceBinding)

  it('returns undefined when input is undefined', () => {
    expect(toSequencerSnapshotBindings(undefined)).toBeUndefined()
  })

  it('returns undefined when input is empty', () => {
    expect(toSequencerSnapshotBindings([])).toBeUndefined()
  })

  it('returns undefined when no bindings are snapshot consumers', () => {
    const out = toSequencerSnapshotBindings([
      mkBinding({ consumer_type: 'rig' as Api.MidiHubDeviceBinding['consumer_type'] }),
    ])
    expect(out).toBeUndefined()
  })

  it('filters down to snapshot consumers only', () => {
    const out = toSequencerSnapshotBindings([
      mkBinding({ consumer_type: 'rig' as Api.MidiHubDeviceBinding['consumer_type'] }),
      mkBinding({ consumer_id: 'snap-2', consumer_name: 'Snapshot 2' }),
    ])
    expect(out).toEqual([
      { snapshot_id: 'snap-2', snapshot_name: 'Snapshot 2', source: 'manual' },
    ])
  })
})

describe('buildProfileRows', () => {
  const baseArgs = {
    profileKeys: [],
    profileIndex: {},
    packIndex: {},
    connectedKeys: new Set<string>(),
    pinnedKeys: new Set<string>(),
    recentlyDisconnectedKeys: new Set<string>(),
    knownLastSeen: {},
    knownLastBound: {},
    diagByPack: {},
    sequencerAssetCounts: {},
  }

  it('produces a rich row when the profile is known', () => {
    const summary = {
      pack_id: 'lexicon',
      model: 'mpx1',
      kind: 'audio',
      capabilities: ['preset_recall'],
    } as unknown as DeviceProfileSummary
    const rows = buildProfileRows({
      ...baseArgs,
      profileKeys: ['lexicon/mpx1.audio'],
      profileIndex: indexProfiles([summary]),
      packIndex: { lexicon: { pack_id: 'lexicon', vendor: 'Lexicon' } as PackSourceRow },
      connectedKeys: new Set(['lexicon/mpx1.audio']),
    })
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row.profileKey).toBe('lexicon/mpx1.audio')
    expect(row.vendor).toBe('Lexicon')
    expect(row.isConnected).toBe(true)
    expect((row as ProfileRow).capabilities).toEqual(['preset_recall'])
  })

  it('falls back to parseProfileKey when the profile is missing', () => {
    const rows = buildProfileRows({
      ...baseArgs,
      profileKeys: ['orphan-pack/orphan-model.audio'],
    })
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row.profileKey).toBe('orphan-pack/orphan-model.audio')
    expect(row.packId).toBe('orphan-pack')
    expect(row.model).toBe('orphan-model')
    expect(row.kind).toBe('audio')
    expect(row.vendor).toBeUndefined()
  })

  it('sorts rows alphabetically by profileKey for stable rendering', () => {
    const rows = buildProfileRows({
      ...baseArgs,
      profileKeys: ['z/zeta.audio', 'a/alpha.audio', 'm/mike.audio'],
    })
    expect(rows.map((r) => r.profileKey)).toEqual([
      'a/alpha.audio',
      'm/mike.audio',
      'z/zeta.audio',
    ])
  })

  it('threads diagnostic and connection state through the fallback branch', () => {
    const rows = buildProfileRows({
      ...baseArgs,
      profileKeys: ['vendor/model.audio'],
      connectedKeys: new Set(['vendor/model.audio']),
      pinnedKeys: new Set(['vendor/model.audio']),
      recentlyDisconnectedKeys: new Set(['vendor/model.audio']),
      knownLastSeen: { 'vendor/model.audio': 1234 },
      diagByPack: { vendor: { count: 3, worst: 'warning' } },
      sequencerAssetCounts: { 'vendor/model.audio': 7 },
    })
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row.isConnected).toBe(true)
    expect(row.isPinned).toBe(true)
    expect(row.recentlyDisconnected).toBe(true)
    expect(row.lastSeenAt).toBe(1234)
    expect(row.diagnosticCount).toBe(3)
    expect(row.diagnosticWorstSeverity).toBe('warning')
    expect(row.sequencerAssetCount).toBe(7)
  })
})
