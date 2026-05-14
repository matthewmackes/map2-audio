// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Pivot-13d cycle 1 — pinned-id → meter-registry-id translation tests.

import {
  meterRegistryIdFromPinnedId,
  meterRegistryIdsFromPinnedIds,
} from './legacyDeviceManifest'

describe('meterRegistryIdFromPinnedId', () => {
  it('rewrites edirol-ua1000 (no dash) to edirol-ua-1000', () => {
    expect(meterRegistryIdFromPinnedId('edirol-ua1000')).toBe('edirol-ua-1000')
  })

  it('rewrites mpx1 to lexicon-mpx1', () => {
    expect(meterRegistryIdFromPinnedId('mpx1')).toBe('lexicon-mpx1')
  })

  it('passes through hotone-jogg unchanged', () => {
    expect(meterRegistryIdFromPinnedId('hotone-jogg')).toBe('hotone-jogg')
  })

  it('passes through tascam-us144mkii unchanged', () => {
    expect(meterRegistryIdFromPinnedId('tascam-us144mkii')).toBe('tascam-us144mkii')
  })

  it('returns null for non-metered devices (controller surfaces, LCDs)', () => {
    expect(meterRegistryIdFromPinnedId('lcd')).toBeNull()
    expect(meterRegistryIdFromPinnedId('maschine-mk1')).toBeNull()
    expect(meterRegistryIdFromPinnedId('ableton-push')).toBeNull()
    expect(meterRegistryIdFromPinnedId('tesira')).toBeNull()
    expect(meterRegistryIdFromPinnedId('not-a-real-device')).toBeNull()
  })
})

describe('meterRegistryIdsFromPinnedIds', () => {
  it('translates a mixed list and drops non-metered entries', () => {
    expect(
      meterRegistryIdsFromPinnedIds([
        'edirol-ua1000',
        'lcd',
        'tascam-us144mkii',
        'maschine-mk1',
        'mpx1',
      ]),
    ).toEqual(['edirol-ua-1000', 'tascam-us144mkii', 'lexicon-mpx1'])
  })

  it('returns an empty list for an empty input', () => {
    expect(meterRegistryIdsFromPinnedIds([])).toEqual([])
  })

  it('returns an empty list when none of the pinned ids are metered', () => {
    expect(
      meterRegistryIdsFromPinnedIds(['lcd', 'maschine-mk1', 'tesira']),
    ).toEqual([])
  })
})
