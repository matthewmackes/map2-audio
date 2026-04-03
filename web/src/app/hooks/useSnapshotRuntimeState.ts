import { useQuery, useQueryClient } from '@tanstack/react-query'

import { snapshotsApi } from '../../map2/clients/snapshots'
import { useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import type {
  SnapshotActivationAuditEvent,
  SnapshotActivationEventsResponse,
  SnapshotRuntimeClusterLiveStateResponse,
  SnapshotRuntimeLiveState,
} from '../../map2/types'

function runtimeLiveStateKey(nodeId?: string | null) {
  return ['snapshots', 'runtime', 'live-state', nodeId ?? 'local'] as const
}

function runtimeActivationEventsKey(nodeId?: string | null, limit = 100) {
  return ['snapshots', 'runtime', 'activation-events', nodeId ?? 'local', limit] as const
}

function invalidateAuthorityStateCaches(queryClient: ReturnType<typeof useQueryClient>, options?: { includeDesired?: boolean }) {
  void queryClient.invalidateQueries({ queryKey: ['audio-state', 'committed'] })
  void queryClient.invalidateQueries({ queryKey: ['audio-state', 'observed'] })
  void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', 'authority-active'] })

  if (options?.includeDesired) {
    void queryClient.invalidateQueries({ queryKey: ['audio-state', 'desired'] })
  }
}

export function useSnapshotRuntimeLiveState(
  nodeId?: string | null,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const { enabled = true, refetchInterval = 5_000 } = options
  const queryClient = useQueryClient()
  const queryKey = runtimeLiveStateKey(nodeId)

  useWebSocketTopic<SnapshotRuntimeLiveState>('snapshot_runtime_live_state', (data, message) => {
    if (message.type !== 'snapshot_runtime_live_state' || !data || !enabled) {
      return
    }
    const targetNodeId = nodeId ?? data.node_id
    if (data.node_id !== targetNodeId) {
      return
    }
    queryClient.setQueryData(queryKey, data)
    invalidateAuthorityStateCaches(queryClient)
  })

  return useQuery<SnapshotRuntimeLiveState>({
    queryKey,
    queryFn: () => snapshotsApi.getRuntimeLiveState(nodeId),
    enabled,
    staleTime: 1_000,
    refetchInterval,
  })
}

export function useSnapshotActivationEvents(
  nodeId?: string | null,
  options: { enabled?: boolean; limit?: number; refetchInterval?: number | false } = {},
) {
  const { enabled = true, limit = 100, refetchInterval = 10_000 } = options
  const queryClient = useQueryClient()
  const queryKey = runtimeActivationEventsKey(nodeId, limit)

  useWebSocketTopic<SnapshotActivationAuditEvent>('snapshot_activation_events', (data, message) => {
    if (message.type !== 'snapshot_activation_event' || !data || !enabled) {
      return
    }
    const targetNodeId = nodeId ?? data.node_id
    if (data.node_id !== targetNodeId) {
      return
    }

    queryClient.setQueryData<SnapshotActivationEventsResponse | undefined>(queryKey, (current) => {
      const existing = current?.events ?? []
      const nextEvents = [data, ...existing.filter((entry) => entry.request_id !== data.request_id)].slice(0, limit)
      return {
        node_id: targetNodeId,
        count: nextEvents.length,
        events: nextEvents,
      }
    })
    invalidateAuthorityStateCaches(queryClient, { includeDesired: true })
  })

  return useQuery<SnapshotActivationEventsResponse>({
    queryKey,
    queryFn: () => snapshotsApi.getActivationEvents(limit, nodeId),
    enabled,
    staleTime: 2_000,
    refetchInterval,
  })
}

export function useClusterSnapshotRuntimeLiveState(
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const { enabled = true, refetchInterval = 10_000 } = options
  return useQuery<SnapshotRuntimeClusterLiveStateResponse>({
    queryKey: ['snapshots', 'runtime', 'cluster-live-state'],
    queryFn: () => snapshotsApi.getClusterRuntimeLiveState(),
    enabled,
    staleTime: 2_000,
    refetchInterval,
  })
}
