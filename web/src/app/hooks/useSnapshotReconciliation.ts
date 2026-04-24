import { useQuery } from '@tanstack/react-query'

import { snapshotsApi } from '../../map2/clients/snapshots'
import type { SnapshotRuntimeReconciliationReport } from '../../map2/types'

/** T2450: derived badge state for the Snapshot Editor LIVE indicator. */
export type SnapshotLiveBadgeState = 'publishing' | 'live_confirmed' | 'engine_desync' | 'idle'

export interface UseSnapshotReconciliationOptions {
  enabled?: boolean
  refetchInterval?: number | false
  nodeId?: string | null
}

export function useSnapshotReconciliation(options: UseSnapshotReconciliationOptions = {}) {
  const { enabled = true, refetchInterval = 1_000, nodeId = null } = options
  return useQuery<SnapshotRuntimeReconciliationReport>({
    queryKey: ['snapshots', 'runtime', 'reconciliation', nodeId ?? 'local'],
    queryFn: () => snapshotsApi.getRuntimeReconciliation(nodeId),
    enabled,
    staleTime: 500,
    refetchInterval,
  })
}

/**
 * Decide whether backend + engine agree for the currently-expected snapshot.
 * Agreement requires:
 *   - report.reconciliation.status is "ok" or "applied_corrections"
 *   - no drift counts (parameter / bypass / missing-asset)
 *   - no topology drift flagged
 *   - backend-recorded snapshot id matches the expected id (if provided)
 */
export function computeLiveBadgeState(options: {
  expectedSnapshotId: number | null
  isActivating: boolean
  activationFailed: boolean
  report: SnapshotRuntimeReconciliationReport | null | undefined
}): SnapshotLiveBadgeState {
  const { expectedSnapshotId, isActivating, activationFailed, report } = options
  if (activationFailed) return 'engine_desync'
  if (isActivating) return 'publishing'
  if (!expectedSnapshotId || !report) return 'idle'
  if (report.snapshot_id != null && report.snapshot_id !== expectedSnapshotId) {
    return 'engine_desync'
  }
  const rec = report.reconciliation
  if (!rec) return 'idle'
  const statusOk = rec.status === 'ok' || rec.status === 'applied_corrections'
  const noDrift =
    !rec.topology_drift &&
    rec.parameter_drift_count === 0 &&
    rec.bypass_drift_count === 0 &&
    rec.missing_asset_count === 0
  if (statusOk && noDrift) return 'live_confirmed'
  if (rec.status === 'not_run' || rec.status === 'no_live_snapshot') return 'publishing'
  return 'engine_desync'
}
