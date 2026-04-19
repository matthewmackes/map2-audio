import type { QueryClient } from '@tanstack/react-query'
import type { SnapshotDetail } from '../../map2/types'

export function setAuthorityAwareLiveSnapshot(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  snapshot: SnapshotDetail,
  authoritySnapshotId?: number | null,
) {
  if (authoritySnapshotId != null && authoritySnapshotId === snapshot.id) {
    queryClient.setQueryData(['snapshots', 'detail', 'authority-active', authoritySnapshotId], snapshot)
  }
}

export function restoreAuthorityAwareLiveSnapshot(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  snapshot: SnapshotDetail | null | undefined,
  authoritySnapshotId?: number | null,
) {
  if (authoritySnapshotId != null && snapshot?.id === authoritySnapshotId) {
    queryClient.setQueryData(['snapshots', 'detail', 'authority-active', authoritySnapshotId], snapshot)
  }
}

export function invalidateAuthorityAwareLiveSnapshot(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  options: { includeDesired?: boolean } = {},
) {
  void queryClient.invalidateQueries({ queryKey: ['audio-state', 'committed'] })
  void queryClient.invalidateQueries({ queryKey: ['audio-state', 'observed'] })
  void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', 'authority-active'] })

  if (options.includeDesired) {
    void queryClient.invalidateQueries({ queryKey: ['audio-state', 'desired'] })
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
