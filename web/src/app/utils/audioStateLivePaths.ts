import type {
  AudioStateClusterStatus,
  AudioStateDerivedStatus,
  AudioStatePathRecord,
  AuthoritativeAudioState,
  SnapshotPath,
  SubmitDesiredAudioStateRequest,
} from '../../map2/types'

interface LivePathCandidate {
  pathId: string
  label: string
  snapshotChainId: number | null
  runtimeChainId: number | null
  existingRecord?: AudioStatePathRecord
}

export interface AuthorityLivePathSelectionUpdate {
  nextCommittedState: AuthoritativeAudioState
  request: SubmitDesiredAudioStateRequest
}

function buildInactivePathMessage(path: AudioStatePathRecord): string {
  if (path.status === 'pending') {
    return `Channel ${path.label} pending apply.`
  }
  if (path.status === 'not_loaded') {
    return `Channel ${path.label} is not loaded.`
  }
  if (path.status === 'offline') {
    return `Channel ${path.label} is offline.`
  }
  if (path.status === 'degraded') {
    return `Channel ${path.label} is degraded.`
  }
  return `Channel ${path.label} status unknown.`
}

function mergeCandidate(
  candidateByPathId: Map<string, LivePathCandidate>,
  incoming: LivePathCandidate,
) {
  const current = candidateByPathId.get(incoming.pathId)
  if (!current) {
    candidateByPathId.set(incoming.pathId, incoming)
    return
  }

  candidateByPathId.set(incoming.pathId, {
    pathId: incoming.pathId,
    label: current.label || incoming.label,
    snapshotChainId: current.snapshotChainId ?? incoming.snapshotChainId,
    runtimeChainId: current.runtimeChainId ?? incoming.runtimeChainId,
    existingRecord: current.existingRecord ?? incoming.existingRecord,
  })
}

function buildLivePathCandidates(params: {
  authoritativeAudioState: AuthoritativeAudioState
  authoritySnapshotPaths: SnapshotPath[] | null | undefined
}): Map<string, LivePathCandidate> {
  const { authoritativeAudioState, authoritySnapshotPaths } = params
  const candidateByPathId = new Map<string, LivePathCandidate>()

  authoritativeAudioState.paths.forEach((path) => {
    mergeCandidate(candidateByPathId, {
      pathId: path.path_id,
      label: path.label,
      snapshotChainId: path.snapshot_chain_id ?? null,
      runtimeChainId: path.runtime_chain_id ?? null,
      existingRecord: path,
    })
  })

  ;(authoritySnapshotPaths ?? []).forEach((path) => {
    if (!path.id) {
      return
    }

    mergeCandidate(candidateByPathId, {
      pathId: path.id,
      label: path.label || path.name || path.id,
      snapshotChainId: path.snapshot_chain_id ?? null,
      runtimeChainId: path.runtime_chain_id ?? null,
    })
  })

  return candidateByPathId
}

function buildCandidateChainMap(candidateByPathId: Map<string, LivePathCandidate>): Map<number, LivePathCandidate> {
  const candidateByChainId = new Map<number, LivePathCandidate>()

  candidateByPathId.forEach((candidate) => {
    if (candidate.snapshotChainId != null && !candidateByChainId.has(candidate.snapshotChainId)) {
      candidateByChainId.set(candidate.snapshotChainId, candidate)
    }
    if (candidate.runtimeChainId != null && !candidateByChainId.has(candidate.runtimeChainId)) {
      candidateByChainId.set(candidate.runtimeChainId, candidate)
    }
  })

  return candidateByChainId
}

function buildNextPathRecord(
  candidate: LivePathCandidate,
  authoritativeAudioState: AuthoritativeAudioState,
): AudioStatePathRecord {
  if (candidate.existingRecord) {
    return {
      ...candidate.existingRecord,
      label: candidate.label,
      snapshot_chain_id: candidate.snapshotChainId ?? candidate.existingRecord.snapshot_chain_id ?? null,
      runtime_chain_id: candidate.runtimeChainId ?? candidate.existingRecord.runtime_chain_id ?? null,
    }
  }

  return {
    path_id: candidate.pathId,
    label: candidate.label,
    snapshot_chain_id: candidate.snapshotChainId,
    runtime_chain_id: candidate.runtimeChainId,
    owner_node_id: authoritativeAudioState.origin_node_id,
    status: 'pending',
    status_reason: 'Awaiting node observation after desired-state publish',
  }
}

function buildDerivedStatus(paths: AudioStatePathRecord[]): AudioStateDerivedStatus {
  return {
    active_channel_count: paths.filter((path) => path.status === 'active').length,
    total_channel_count: paths.length,
    inactive_messages: paths
      .filter((path) => path.status !== 'active')
      .map((path) => buildInactivePathMessage(path)),
  }
}

export function buildAuthorityLivePathSelectionUpdate(params: {
  authoritativeAudioState: AuthoritativeAudioState | null | undefined
  authoritySnapshotPaths?: SnapshotPath[] | null
  nextActiveChainIds: readonly number[]
  requestedBy: string
  committedAt?: string
}): AuthorityLivePathSelectionUpdate {
  const {
    authoritativeAudioState,
    authoritySnapshotPaths,
    nextActiveChainIds,
    requestedBy,
    committedAt = new Date().toISOString(),
  } = params

  if (!authoritativeAudioState?.source_snapshot) {
    throw new Error('No authority-backed snapshot is loaded.')
  }

  const candidateByPathId = buildLivePathCandidates({
    authoritativeAudioState,
    authoritySnapshotPaths,
  })
  const candidateByChainId = buildCandidateChainMap(candidateByPathId)
  const selectedPathIds = new Set<string>()
  const selectedCandidates: LivePathCandidate[] = []

  nextActiveChainIds.forEach((chainId) => {
    const candidate = candidateByChainId.get(chainId)
    if (!candidate) {
      throw new Error(`No authority path matches chain ${chainId}.`)
    }
    if (selectedPathIds.has(candidate.pathId)) {
      return
    }
    selectedPathIds.add(candidate.pathId)
    selectedCandidates.push(candidate)
  })

  const nextPathIds = selectedCandidates.map((candidate) => candidate.pathId)
  const nextPaths = selectedCandidates.map((candidate) => buildNextPathRecord(candidate, authoritativeAudioState))
  const nextCluster: AudioStateClusterStatus = {
    sync_status: 'pending_apply',
    applied_node_ids: [],
    degraded_node_ids: [],
  }
  const nextCommittedState: AuthoritativeAudioState = {
    ...authoritativeAudioState,
    state_version: authoritativeAudioState.state_version + 1,
    committed_at: committedAt,
    desired: {
      ...authoritativeAudioState.desired,
      compiled_at: committedAt,
      routing: {
        ...authoritativeAudioState.desired.routing,
        active_path_ids: nextPathIds,
        path_order: nextPathIds,
      },
    },
    cluster: nextCluster,
    paths: nextPaths,
    derived: buildDerivedStatus(nextPaths),
  }

  return {
    nextCommittedState,
    request: {
      requested_by: requestedBy,
      leader_epoch: nextCommittedState.leader_epoch,
      state_version: nextCommittedState.state_version,
      committed_at: nextCommittedState.committed_at,
      origin_node_id: nextCommittedState.origin_node_id,
      source_snapshot: nextCommittedState.source_snapshot,
      desired: nextCommittedState.desired,
      observed_summary: nextCommittedState.observed_summary,
      cluster: nextCommittedState.cluster,
      engine: nextCommittedState.engine,
      paths: nextCommittedState.paths,
      derived: nextCommittedState.derived,
    },
  }
}
