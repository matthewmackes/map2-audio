// Pure helpers extracted from useConnectKeyboardSnapshotJob so they
// can be unit-tested without mounting the hook (which talks to the
// backend). The hook re-exports these or imports them directly.

import type {
  BrainLibraryAssetModel,
  BrainLibraryStateModel,
} from './brainSetupTypes'

export function pickFirstAsset(
  library: BrainLibraryStateModel,
): BrainLibraryAssetModel | null {
  // Prefer a featured asset if any are flagged.
  if (library.featured_assets && library.featured_assets.length > 0) {
    for (const featuredId of library.featured_assets) {
      for (const collection of library.collections ?? []) {
        const hit = (collection.assets ?? []).find((a) => a.asset_id === featuredId)
        if (hit && hit.path && hit.path.trim() !== '') return hit
      }
    }
  }
  // Otherwise, first asset across all collections with a non-empty path.
  for (const collection of library.collections ?? []) {
    for (const asset of collection.assets ?? []) {
      if (asset.path && asset.path.trim() !== '') return asset
    }
  }
  return null
}

function todayIsoDate(now: Date = new Date()): string {
  // YYYY-MM-DD in local time.
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function buildSnapshotName(portName: string, now?: Date): string {
  return `Brain — ${portName} (set up ${todayIsoDate(now)})`
}
