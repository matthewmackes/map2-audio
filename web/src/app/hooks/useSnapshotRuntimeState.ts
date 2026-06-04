import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { snapshotsApi } from '../../map2/clients/snapshots'
import { useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import type {
  SnapshotActivationAuditEvent,
  SnapshotActivationEventsResponse,
  SnapshotActivationStepEvent,
  SnapshotRuntimeClusterLiveStateResponse,
  SnapshotRuntimeLiveState,
} from '../../map2/types'

function runtimeLiveStateKey(nodeId?: string | null) {
  return ['snapshots', 'runtime', 'live-state', nodeId ?? 'local'] as const
}

function runtimeActivationEventsKey(nodeId?: string | null, limit = 100) {
  return ['snapshots', 'runtime', 'activation-events', nodeId ?? 'local', limit] as const
}

function clusterRuntimeLiveStateKey() {
  return ['snapshots', 'runtime', 'cluster-live-state'] as const
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
    // T2534: ignore ephemeral realtime step frames here — they belong to
    // useSnapshotActivationProgress, not the persisted audit-event list.
    if ((data as { kind?: string }).kind === 'activation_step') {
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

// --- T2534: realtime activation progress ---------------------------------

export interface SnapshotActivationProgressState {
  requestId: string | null
  snapshotId: number | null
  /** Latest frame per step, ordered by emission index. */
  steps: SnapshotActivationStepEvent[]
  /** True once steps have arrived and no terminal (authority confirmed / failed) yet. */
  isActivating: boolean
  /** True while any in-flight step is waiting on a still-warming subsystem. */
  warming: boolean
  /** Distinct subsystems currently warming (e.g. ['engine','etcd']). */
  warmingSubsystems: string[]
  failed: boolean
}

export interface ActivationProgressRun {
  requestId: string | null
  snapshotId: number | null
  byStep: Record<string, SnapshotActivationStepEvent>
  order: string[]
  terminal: boolean
  failed: boolean
}

export const EMPTY_ACTIVATION_RUN: ActivationProgressRun = {
  requestId: null,
  snapshotId: null,
  byStep: {},
  order: [],
  terminal: false,
  failed: false,
}

export function reduceActivationStep(
  run: ActivationProgressRun,
  event: SnapshotActivationStepEvent,
): ActivationProgressRun {
  // A new request_id starts a fresh run (only one activation per node at a time).
  const base: ActivationProgressRun =
    event.request_id && event.request_id !== run.requestId
      ? { ...EMPTY_ACTIVATION_RUN, requestId: event.request_id, snapshotId: event.snapshot_id }
      : { ...run, byStep: { ...run.byStep }, order: [...run.order] }

  const existing = base.byStep[event.step]
  // Keep the latest frame for a step (index increases monotonically per emission).
  if (!existing || event.index >= existing.index) {
    base.byStep[event.step] = event
    if (!base.order.includes(event.step)) {
      base.order.push(event.step)
    }
  }
  if (base.snapshotId == null && event.snapshot_id != null) {
    base.snapshotId = event.snapshot_id
  }
  if (event.status === 'failed') {
    base.failed = true
    base.terminal = true
  }
  if (event.phase === 'VERIFYING' && event.step === 'authority_confirm' && event.status === 'completed') {
    base.terminal = true
  }
  return base
}

/**
 * Accumulates the local node's most recent activation step stream into an
 * ordered, ephemeral progress view. Drives the realtime "what's happening now"
 * step list during a create/activate, including which steps are warming.
 */
export function useSnapshotActivationProgress(
  options: { enabled?: boolean } = {},
): SnapshotActivationProgressState {
  const { enabled = true } = options
  const [run, setRun] = useState<ActivationProgressRun>(EMPTY_ACTIVATION_RUN)

  const handler = useCallback(
    (data: SnapshotActivationStepEvent, message: { type: string }) => {
      if (
        message.type !== 'snapshot_activation_event' ||
        !data ||
        !enabled ||
        (data as { kind?: string }).kind !== 'activation_step'
      ) {
        return
      }
      setRun((current) => reduceActivationStep(current, data))
    },
    [enabled],
  )

  useWebSocketTopic<SnapshotActivationStepEvent>('snapshot_activation_events', handler)

  const steps = run.order
    .map((stepName) => run.byStep[stepName])
    .filter((entry): entry is SnapshotActivationStepEvent => Boolean(entry))
    .sort((a, b) => a.index - b.index)

  const warmingSubsystems = Array.from(
    new Set(
      steps
        .filter((entry) => entry.warming && entry.status !== 'completed')
        .map((entry) => entry.warming_subsystem || entry.subsystem)
        .filter((value): value is string => Boolean(value)),
    ),
  )

  return {
    requestId: run.requestId,
    snapshotId: run.snapshotId,
    steps,
    isActivating: steps.length > 0 && !run.terminal,
    warming: warmingSubsystems.length > 0,
    warmingSubsystems,
    failed: run.failed,
  }
}

export function useClusterSnapshotRuntimeLiveState(
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const { enabled = true, refetchInterval = 10_000 } = options
  const queryClient = useQueryClient()
  const queryKey = clusterRuntimeLiveStateKey()

  useWebSocketTopic<SnapshotRuntimeLiveState>('snapshot_runtime_live_state', (data, message) => {
    if (message.type !== 'snapshot_runtime_live_state' || !data || !enabled) {
      return
    }

    queryClient.setQueryData<SnapshotRuntimeClusterLiveStateResponse | undefined>(queryKey, (current) => {
      const currentNodes = current?.nodes ?? []
      const existingIndex = currentNodes.findIndex((node) => node.node_id === data.node_id)
      const nextNodes = existingIndex >= 0
        ? currentNodes.map((node, index) => (index === existingIndex ? data : node))
        : [...currentNodes, data]

      return {
        local_node_id: current?.local_node_id ?? data.node_id,
        generated_at: new Date().toISOString(),
        count: nextNodes.length,
        nodes: nextNodes,
      }
    })
    invalidateAuthorityStateCaches(queryClient)
  })

  return useQuery<SnapshotRuntimeClusterLiveStateResponse>({
    queryKey,
    queryFn: () => snapshotsApi.getClusterRuntimeLiveState(),
    enabled,
    staleTime: 2_000,
    refetchInterval,
  })
}
