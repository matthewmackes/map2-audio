import type { SnapshotDetail } from '../../map2/types'
import { ApiError } from '../../map2/http'
import { snapshotsApi } from '../../map2/clients/snapshots'

export async function fetchLiveSnapshotOrNull(): Promise<SnapshotDetail | null> {
  try {
    return await snapshotsApi.getLive()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export function removeRuntimeChainsFromLiveSnapshot(
  snapshot: SnapshotDetail | null | undefined,
  chainIds: readonly number[],
): SnapshotDetail | null | undefined {
  if (!snapshot || chainIds.length === 0) {
    return snapshot
  }

  const chainIdSet = new Set(chainIds)
  let changed = false

  const nextPaths = snapshot.paths.map((path) => {
    if (path.runtime_chain_id === null || !chainIdSet.has(path.runtime_chain_id)) {
      return path
    }
    changed = true
    return {
      ...path,
      runtime_chain_id: null,
    }
  })

  const nextLivePaths = snapshot.live_state.paths.filter((path) => {
    const shouldRemove = path.runtime_chain_id !== null && chainIdSet.has(path.runtime_chain_id)
    changed = changed || shouldRemove
    return !shouldRemove
  })

  const nextRuntimeChains = snapshot.live_state.runtime_chains.filter((chain) => {
    const shouldRemove = chainIdSet.has(chain.id)
    changed = changed || shouldRemove
    return !shouldRemove
  })

  if (!changed) {
    return snapshot
  }

  return {
    ...snapshot,
    paths: nextPaths,
    live_state: {
      ...snapshot.live_state,
      paths: nextLivePaths,
      runtime_chains: nextRuntimeChains,
    },
  }
}
