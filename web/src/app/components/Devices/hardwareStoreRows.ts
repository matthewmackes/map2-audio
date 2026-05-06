// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// hardwareStoreRows — pure helpers extracted from HardwareStorePage.tsx
// per audit Arch-13 (cycle 56).
//
// `HardwareStorePage` was carrying ~130 LOC of pure data-shaping helpers
// inline before the JSX. The audit asked for these to live in a
// standalone module so they can be unit-tested without mounting the page.
// All logic is unchanged from the inline implementation; only the
// location moved.

import type {
  DeviceProfileSummary,
  PackSourceRow,
} from '../../../map2/clients/devices'
import type * as Api from '../../../map2/api'
import type { DeviceCardRow } from './DeviceCard'

export type ProfileRow = DeviceCardRow

/**
 * Index a list of profile summaries by their canonical profile-key
 * (`<pack_id>/<model>.<kind>`). Inverse of `parseProfileKey`.
 */
export function indexProfiles(
  profiles: DeviceProfileSummary[],
): Record<string, DeviceProfileSummary> {
  const out: Record<string, DeviceProfileSummary> = {}
  for (const p of profiles) {
    out[`${p.pack_id}/${p.model}.${p.kind}`] = p
  }
  return out
}

/**
 * Index a list of pack-source rows by `pack_id`.
 */
export function indexPacks(rows: PackSourceRow[]): Record<string, PackSourceRow> {
  const out: Record<string, PackSourceRow> = {}
  for (const r of rows) out[r.pack_id] = r
  return out
}

/**
 * Parse a profile-key of the form `<packId>/<model>.<kind>` into its
 * three component fields. `indexProfiles` builds keys with exactly
 * this shape, so the parse is the structural inverse.
 *
 * Used by the buildProfileRows fallback branch when a profile-key is
 * known to the backend's connected/pinned/recent sets but no matching
 * `DeviceProfileSummary` is present in the local profile index — the
 * fallback row still needs the packId/model/kind triple to render.
 *
 * Audit Lat-18 (cycle 45): replaces an inline `key.split('/')` +
 * `(rest ?? '').split('.')` pair so the format is named, the safe-default
 * fields are co-located with the parse, and any future caller that
 * needs the same triple has one canonical helper to call.
 */
export function parseProfileKey(key: string): {
  packId: string
  model: string
  kind: ProfileRow['kind']
} {
  const slashIndex = key.indexOf('/')
  const packId = slashIndex >= 0 ? key.slice(0, slashIndex) : ''
  const rest = slashIndex >= 0 ? key.slice(slashIndex + 1) : ''
  const dotIndex = rest.indexOf('.')
  const model = dotIndex >= 0 ? rest.slice(0, dotIndex) : rest
  const kindRaw = dotIndex >= 0 ? rest.slice(dotIndex + 1) : ''
  return {
    packId,
    model,
    kind: (kindRaw as ProfileRow['kind']) || 'audio',
  }
}

/**
 * Filter a backend MidiHubDeviceBinding list down to the snapshot
 * consumers — the only kind the DeviceCard surface renders. Returns
 * `undefined` when there are no snapshot bindings, so callers can
 * use a single nullish check instead of distinguishing
 * "loaded but empty" from "not loaded".
 */
export function toSequencerSnapshotBindings(
  rawBindings: Api.MidiHubDeviceBinding[] | undefined,
): Array<{ snapshot_id: string; snapshot_name: string; source: string }> | undefined {
  if (!rawBindings || rawBindings.length === 0) return undefined
  const out: Array<{ snapshot_id: string; snapshot_name: string; source: string }> = []
  for (const b of rawBindings) {
    if (b.consumer_type !== 'snapshot') continue
    out.push({
      snapshot_id: b.consumer_id,
      snapshot_name: b.consumer_name,
      source: b.source,
    })
  }
  return out.length > 0 ? out : undefined
}

export interface BuildProfileRowsArgs {
  profileKeys: string[]
  profileIndex: Record<string, DeviceProfileSummary>
  packIndex: Record<string, PackSourceRow>
  connectedKeys: Set<string>
  pinnedKeys: Set<string>
  recentlyDisconnectedKeys: Set<string>
  knownLastSeen: Record<string, number | null>
  knownLastBound: Record<string, number | null>
  diagByPack: Record<string, { count: number; worst: 'info' | 'warning' | 'error' }>
  sequencerAssetCounts: Record<string, number>
  bindingsByProfileKey?: Map<string, Api.MidiHubDeviceBinding[]>
}

/**
 * Materialize a list of `ProfileRow`s for the HardwareStore device-card
 * grid. Two branches:
 *   - profile-key matches a known DeviceProfileSummary → rich row with
 *     `capabilities` from the registered profile.
 *   - profile-key has no matching profile (e.g. backend-known but local
 *     profile index hasn't loaded yet) → fallback row built from the
 *     parsed packId/model/kind triple.
 * Sorted alphabetically by `profileKey` so the grid is stable across
 * peer/profile churn.
 */
export function buildProfileRows(args: BuildProfileRowsArgs): ProfileRow[] {
  const {
    profileKeys, profileIndex, packIndex, connectedKeys, pinnedKeys,
    recentlyDisconnectedKeys, knownLastSeen, knownLastBound, diagByPack,
    sequencerAssetCounts, bindingsByProfileKey,
  } = args

  return profileKeys
    .map<ProfileRow>((key) => {
      const sequencerSnapshotBindings = toSequencerSnapshotBindings(bindingsByProfileKey?.get(key))
      const p = profileIndex[key]
      if (!p) {
        const { packId, model, kind } = parseProfileKey(key)
        const dx = diagByPack[packId]
        return {
          profileKey: key,
          packId,
          model,
          kind,
          vendor: packIndex[packId]?.vendor,
          source: packIndex[packId]?.source,
          isDegraded: packIndex[packId]?.is_degraded,
          isConnected: connectedKeys.has(key),
          isPinned: pinnedKeys.has(key),
          recentlyDisconnected: recentlyDisconnectedKeys.has(key),
          lastSeenAt: knownLastSeen[key] ?? null,
          lastBoundAt: knownLastBound[key] ?? null,
          diagnosticCount: dx?.count,
          diagnosticWorstSeverity: dx?.worst,
          sequencerAssetCount: sequencerAssetCounts[key],
          sequencerSnapshotBindings,
        }
      }
      const dx = diagByPack[p.pack_id]
      return {
        profileKey: key,
        packId: p.pack_id,
        model: p.model,
        kind: p.kind,
        vendor: packIndex[p.pack_id]?.vendor,
        source: packIndex[p.pack_id]?.source,
        isDegraded: packIndex[p.pack_id]?.is_degraded,
        isConnected: connectedKeys.has(key),
        isPinned: pinnedKeys.has(key),
        recentlyDisconnected: recentlyDisconnectedKeys.has(key),
        lastSeenAt: knownLastSeen[key] ?? null,
        lastBoundAt: knownLastBound[key] ?? null,
        diagnosticCount: dx?.count,
        diagnosticWorstSeverity: dx?.worst,
        capabilities: p?.capabilities,
        sequencerAssetCount: sequencerAssetCounts[key],
        sequencerSnapshotBindings,
      }
    })
    .sort((a, b) => a.profileKey.localeCompare(b.profileKey))
}
