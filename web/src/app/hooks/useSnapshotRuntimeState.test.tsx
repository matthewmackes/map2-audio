import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

import type {
  SnapshotActivationAuditEvent,
  SnapshotActivationEventsResponse,
  SnapshotRuntimeClusterLiveStateResponse,
  SnapshotRuntimeLiveState,
} from '../../map2/types'
import {
  useClusterSnapshotRuntimeLiveState,
  useSnapshotActivationEvents,
  useSnapshotRuntimeLiveState,
} from './useSnapshotRuntimeState'

const mockTopicHandlers = new Map<string, (data: unknown, message: { type?: string }) => void>()

jest.mock('../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    getRuntimeLiveState: jest.fn(),
    getActivationEvents: jest.fn(),
    getClusterRuntimeLiveState: jest.fn(),
  },
}))

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketTopic: (topic: string, handler: (data: unknown, message: { type?: string }) => void) => {
    mockTopicHandlers.set(topic, handler)
  },
}))

const {
  snapshotsApi,
} = jest.requireMock('../../map2/clients/snapshots') as {
  snapshotsApi: {
    getRuntimeLiveState: jest.Mock
    getActivationEvents: jest.Mock
    getClusterRuntimeLiveState: jest.Mock
  }
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

const localRuntimeState: SnapshotRuntimeLiveState = {
  node_id: 'node-a',
  seq: 1,
  emitted_at: '2026-03-30T21:00:00Z',
  state: 'live',
  snapshot_id: 7,
  snapshot_revision: 'rev-a',
  snapshot_name: 'Local Snapshot',
  triggered_by: 'ui',
  live_snapshot_payload: null,
  last_successful_request_id: 'request-a',
  failure_reason: null,
  runtime_metrics: {},
  warning_threshold_seconds: 10,
  offline_threshold_seconds: 15,
  age_seconds: 0.1,
  is_warning: false,
  is_offline: false,
  display_state: 'live',
  display_label: 'Live',
}

const remoteRuntimeState: SnapshotRuntimeLiveState = {
  ...localRuntimeState,
  node_id: 'node-b',
  seq: 4,
  snapshot_id: 12,
  snapshot_revision: 'rev-b',
  snapshot_name: 'Remote Snapshot',
}

const firstActivationEvent: SnapshotActivationAuditEvent = {
  id: 1,
  node_id: 'node-b',
  request_id: 'request-1',
  snapshot_id: 12,
  snapshot_name: 'Remote Snapshot',
  snapshot_revision: 'rev-b',
  triggered_by: 'ui',
  requested_at: '2026-03-30T21:00:00Z',
  confirmed_live_at: '2026-03-30T21:00:01Z',
  outcome: 'success',
  failure_reason: null,
  activation_latency_ms: 100,
  runtime_metrics: { params_applied: 4 },
}

describe('useSnapshotRuntimeState hooks', () => {
  beforeEach(() => {
    mockTopicHandlers.clear()
    snapshotsApi.getRuntimeLiveState.mockReset()
    snapshotsApi.getActivationEvents.mockReset()
    snapshotsApi.getClusterRuntimeLiveState.mockReset()
  })

  it('hydrates local runtime live state from REST', async () => {
    snapshotsApi.getRuntimeLiveState.mockResolvedValue(localRuntimeState)
    const queryClient = makeQueryClient()

    const { result } = renderHook(
      () => useSnapshotRuntimeLiveState(undefined, { refetchInterval: false }),
      { wrapper: makeWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.data).toEqual(localRuntimeState))
    expect(snapshotsApi.getRuntimeLiveState).toHaveBeenCalledWith(undefined)
  })

  it('updates the scoped runtime live-state cache only for the matching node websocket event', async () => {
    snapshotsApi.getRuntimeLiveState.mockResolvedValue(remoteRuntimeState)
    const queryClient = makeQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () => useSnapshotRuntimeLiveState('node-b', { refetchInterval: false }),
      { wrapper: makeWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.data?.seq).toBe(4))
    invalidateSpy.mockClear()

    act(() => {
      mockTopicHandlers.get('snapshot_runtime_live_state')?.(
        { ...localRuntimeState, seq: 5 },
        { type: 'snapshot_runtime_live_state' },
      )
    })

    expect(result.current.data?.seq).toBe(4)

    act(() => {
      mockTopicHandlers.get('snapshot_runtime_live_state')?.(
        { ...remoteRuntimeState, seq: 6, display_state: 'live_warning', display_label: 'Live (warning)' },
        { type: 'snapshot_runtime_live_state' },
      )
    })

    await waitFor(() => expect(result.current.data?.seq).toBe(6))
    expect(result.current.data?.display_state).toBe('live_warning')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['audio-state', 'committed'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['audio-state', 'observed'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshots', 'detail', 'authority-active'] })
  })

  it('dedupes activation events by request id and ignores websocket events from other nodes', async () => {
    const initialEvents: SnapshotActivationEventsResponse = {
      node_id: 'node-b',
      count: 1,
      events: [firstActivationEvent],
    }
    snapshotsApi.getActivationEvents.mockResolvedValue(initialEvents)
    const queryClient = makeQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () => useSnapshotActivationEvents('node-b', { limit: 2, refetchInterval: false }),
      { wrapper: makeWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.data?.events).toHaveLength(1))
    invalidateSpy.mockClear()

    act(() => {
      mockTopicHandlers.get('snapshot_activation_events')?.(
        { ...firstActivationEvent, node_id: 'node-a', request_id: 'request-other' },
        { type: 'snapshot_activation_event' },
      )
    })

    expect(result.current.data?.events).toHaveLength(1)
    expect(result.current.data?.events[0]?.request_id).toBe('request-1')

    act(() => {
      mockTopicHandlers.get('snapshot_activation_events')?.(
        { ...firstActivationEvent, outcome: 'failed', failure_reason: 'boom' },
        { type: 'snapshot_activation_event' },
      )
    })

    await waitFor(() => expect(result.current.data?.events[0]?.outcome).toBe('failed'))
    expect(result.current.data?.events).toHaveLength(1)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['audio-state', 'committed'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['audio-state', 'desired'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['audio-state', 'observed'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshots', 'detail', 'authority-active'] })

    act(() => {
      mockTopicHandlers.get('snapshot_activation_events')?.(
        {
          ...firstActivationEvent,
          id: 2,
          request_id: 'request-2',
          outcome: 'success',
          failure_reason: null,
        },
        { type: 'snapshot_activation_event' },
      )
    })

    await waitFor(() => expect(result.current.data?.events).toHaveLength(2))
    expect(result.current.data?.events.map((event) => event.request_id)).toEqual(['request-2', 'request-1'])
    expect(result.current.data?.count).toBe(2)
  })

  it('loads cluster runtime state through the cluster endpoint hook', async () => {
    const clusterState: SnapshotRuntimeClusterLiveStateResponse = {
      local_node_id: 'node-a',
      generated_at: '2026-03-30T21:00:10Z',
      count: 2,
      nodes: [localRuntimeState, remoteRuntimeState],
    }
    snapshotsApi.getClusterRuntimeLiveState.mockResolvedValue(clusterState)
    const queryClient = makeQueryClient()

    const { result } = renderHook(
      () => useClusterSnapshotRuntimeLiveState({ refetchInterval: false }),
      { wrapper: makeWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.data).toEqual(clusterState))
    expect(snapshotsApi.getClusterRuntimeLiveState).toHaveBeenCalledTimes(1)
  })

  it('patches the cluster runtime state cache when live-state websocket events arrive', async () => {
    const clusterState: SnapshotRuntimeClusterLiveStateResponse = {
      local_node_id: 'node-a',
      generated_at: '2026-03-30T21:00:10Z',
      count: 2,
      nodes: [localRuntimeState, remoteRuntimeState],
    }
    snapshotsApi.getClusterRuntimeLiveState.mockResolvedValue(clusterState)
    const queryClient = makeQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () => useClusterSnapshotRuntimeLiveState({ refetchInterval: false }),
      { wrapper: makeWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.data?.nodes).toHaveLength(2))
    invalidateSpy.mockClear()

    act(() => {
      mockTopicHandlers.get('snapshot_runtime_live_state')?.(
        { ...localRuntimeState, seq: 9, snapshot_name: 'Rig20260417', snapshot_revision: 'rev-renamed' },
        { type: 'snapshot_runtime_live_state' },
      )
    })

    await waitFor(() => {
      expect(result.current.data?.nodes.find((node) => node.node_id === 'node-a')?.snapshot_name).toBe('Rig20260417')
    })
    expect(result.current.data?.nodes.find((node) => node.node_id === 'node-a')?.seq).toBe(9)
    expect(result.current.data?.count).toBe(2)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['audio-state', 'committed'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['audio-state', 'observed'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['snapshots', 'detail', 'authority-active'] })
  })
})
