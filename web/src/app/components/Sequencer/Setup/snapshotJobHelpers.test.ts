// T2480-4 hardening: pure-function tests for the snapshot job helpers.

import type {
  SequencerLibraryAssetModel,
  SequencerLibraryCollectionModel,
  SequencerLibraryStateModel,
} from './sequencerSetupTypes'
import { buildSnapshotName, pickFirstAsset } from './snapshotJobHelpers'

function asset(overrides: Partial<SequencerLibraryAssetModel>): SequencerLibraryAssetModel {
  return {
    asset_id: 'a1',
    name: 'Test Asset',
    asset_type: 'soundfont',
    source: 'shipped',
    path: '/data/sf/a1.sf2',
    description: '',
    default_slot_mode: 'chromatic',
    tags: [],
    authored_with_devices: [],
    ...overrides,
  }
}

function collection(
  id: string,
  assets: SequencerLibraryAssetModel[],
): SequencerLibraryCollectionModel {
  return { collection_id: id, label: id, asset_count: assets.length, assets }
}

function library(overrides: Partial<SequencerLibraryStateModel>): SequencerLibraryStateModel {
  return {
    collections: [],
    featured_assets: [],
    last_scan_iso: '2026-04-30T00:00:00Z',
    ...overrides,
  }
}

describe('pickFirstAsset', () => {
  it('returns null for an empty library', () => {
    expect(pickFirstAsset(library({}))).toBeNull()
  })

  it('returns null when collections exist but assets are missing paths', () => {
    const lib = library({
      collections: [collection('c1', [asset({ path: '' })])],
    })
    expect(pickFirstAsset(lib)).toBeNull()
  })

  it('picks the first asset across collections when no featured set', () => {
    const lib = library({
      collections: [
        collection('first', [asset({ asset_id: 'first-asset' })]),
        collection('second', [asset({ asset_id: 'second-asset' })]),
      ],
    })
    const picked = pickFirstAsset(lib)
    expect(picked).not.toBeNull()
    expect(picked!.asset_id).toBe('first-asset')
  })

  it('prefers a featured asset over the natural-order first', () => {
    const lib = library({
      featured_assets: ['second-asset'],
      collections: [
        collection('first', [asset({ asset_id: 'first-asset' })]),
        collection('second', [asset({ asset_id: 'second-asset' })]),
      ],
    })
    const picked = pickFirstAsset(lib)
    expect(picked!.asset_id).toBe('second-asset')
  })

  it('falls back to natural-order when the featured asset id is unknown', () => {
    const lib = library({
      featured_assets: ['ghost-asset'],
      collections: [collection('first', [asset({ asset_id: 'first-asset' })])],
    })
    const picked = pickFirstAsset(lib)
    expect(picked!.asset_id).toBe('first-asset')
  })

  it('skips featured assets whose path is empty', () => {
    const lib = library({
      featured_assets: ['featured-no-path'],
      collections: [
        collection('c', [
          asset({ asset_id: 'featured-no-path', path: '' }),
          asset({ asset_id: 'real-asset', path: '/data/real.sf2' }),
        ]),
      ],
    })
    const picked = pickFirstAsset(lib)
    expect(picked!.asset_id).toBe('real-asset')
  })
})

describe('buildSnapshotName', () => {
  it('formats with port + ISO date', () => {
    const fixed = new Date('2026-04-30T12:00:00')
    expect(buildSnapshotName('Edirol PCR-300', fixed)).toBe(
      'Brain — Edirol PCR-300 (set up 2026-04-30)',
    )
  })

  it('zero-pads single-digit month + day', () => {
    const fixed = new Date('2026-01-05T12:00:00')
    expect(buildSnapshotName('K', fixed)).toBe('Brain — K (set up 2026-01-05)')
  })

  it('handles port names with em-dashes / unicode without escaping', () => {
    const fixed = new Date('2026-04-30T12:00:00')
    expect(buildSnapshotName('Mäschine — MK1', fixed)).toBe(
      'Brain — Mäschine — MK1 (set up 2026-04-30)',
    )
  })
})
