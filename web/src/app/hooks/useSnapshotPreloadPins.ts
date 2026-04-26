/**
 * T2454 slice 1 — useSnapshotPreloadPins
 *
 * Typed wrapper around `useSpecialSettings()` that exposes the operator's
 * pinned-snapshot list with ergonomic operations (`pin`, `unpin`, `reorder`,
 * `isPinned`). The pinned set persists in Special Settings and replicates
 * across cluster nodes via Raft.
 *
 * Cap: 5 (`SNAPSHOT_PRELOAD_PIN_CAP`). Attempts to pin past the cap are no-ops
 * and report `{ ok: false, reason: 'cap_reached' }` so the UI can show a
 * tooltip/disabled affordance instead of silently swallowing.
 */

import { useCallback, useMemo } from 'react'
import {
  SNAPSHOT_PRELOAD_PIN_CAP,
  normalizeSnapshotPreloadPins,
  useSpecialSettings,
} from './useSpecialSettings'

export interface SnapshotPreloadPinsApi {
  /** Ordered snapshot ids in slot order. Always ≤ SNAPSHOT_PRELOAD_PIN_CAP. */
  pins: number[]
  /** True while the underlying useSpecialSettings is still loading. */
  isLoading: boolean
  /** Last error from a load or update operation. */
  error: string | null
  /** Whether `snapshotId` is currently pinned. */
  isPinned: (snapshotId: number) => boolean
  /** True if the cap is reached and no further pins will land. */
  isCapReached: boolean
  /** Append a snapshot to the pinned list. Idempotent if already pinned. */
  pin: (snapshotId: number) => Promise<{ ok: boolean; reason?: 'cap_reached' | 'already_pinned' }>
  /** Remove a snapshot from the pinned list. Idempotent if not pinned. */
  unpin: (snapshotId: number) => Promise<{ ok: boolean; reason?: 'not_pinned' }>
  /** Replace the entire ordered pin list (drag-to-reorder). */
  reorder: (nextPins: ReadonlyArray<number>) => Promise<void>
}

export const SNAPSHOT_PRELOAD_PIN_LIMIT = SNAPSHOT_PRELOAD_PIN_CAP

export function useSnapshotPreloadPins(): SnapshotPreloadPinsApi {
  const { settings, isLoading, error, updateSettings } = useSpecialSettings()
  const pins = useMemo(() => settings?.snapshotPreloadPins ?? [], [settings])
  const pinSet = useMemo(() => new Set(pins), [pins])
  const isCapReached = pins.length >= SNAPSHOT_PRELOAD_PIN_CAP

  const isPinned = useCallback((snapshotId: number) => pinSet.has(snapshotId), [pinSet])

  const persist = useCallback(
    async (nextPins: ReadonlyArray<number>) => {
      const normalized = normalizeSnapshotPreloadPins(nextPins)
      await updateSettings({ snapshotPreloadPins: normalized })
    },
    [updateSettings],
  )

  const pin = useCallback(
    async (snapshotId: number) => {
      if (pinSet.has(snapshotId)) {
        return { ok: false as const, reason: 'already_pinned' as const }
      }
      if (pins.length >= SNAPSHOT_PRELOAD_PIN_CAP) {
        return { ok: false as const, reason: 'cap_reached' as const }
      }
      await persist([...pins, snapshotId])
      return { ok: true as const }
    },
    [pinSet, pins, persist],
  )

  const unpin = useCallback(
    async (snapshotId: number) => {
      if (!pinSet.has(snapshotId)) {
        return { ok: false as const, reason: 'not_pinned' as const }
      }
      await persist(pins.filter((id) => id !== snapshotId))
      return { ok: true as const }
    },
    [pinSet, pins, persist],
  )

  const reorder = useCallback(
    async (nextPins: ReadonlyArray<number>) => {
      await persist(nextPins)
    },
    [persist],
  )

  return { pins, isLoading, error, isPinned, isCapReached, pin, unpin, reorder }
}
