import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RoutingProvider, useFilteredEndpoints, useRouting, useRoutingState } from './RoutingContext'
import { initialRoutingState } from '../types'
import type {
  AvbNode,
  ConnectionsResponse,
  Endpoint,
  EndpointsResponse,
  NetworkSyncStatus,
} from '../types'
import { NodeSelector } from '../components/TopBar/NodeSelector'
import { NodeTree } from '../components/NodeTree/NodeTree'

let mockEndpointsData: EndpointsResponse | undefined
let mockConnectionsData: ConnectionsResponse | undefined
let mockNodesData: AvbNode[] | undefined
let mockPtpStatus: NetworkSyncStatus | undefined
let mockLocalNodeId = 'local'

jest.mock('../hooks/useAvbApi', () => ({
  useEndpoints: () => ({
    data: mockEndpointsData,
    isLoading: false,
    error: null,
  }),
  useConnections: () => ({
    data: mockConnectionsData,
    isLoading: false,
    error: null,
  }),
}))

jest.mock('../hooks/useNodeApi', () => ({
  useNodes: () => ({
    data: mockNodesData,
    isLoading: false,
    error: null,
  }),
  usePtpStatus: () => ({
    data: mockPtpStatus,
  }),
  useLocalNodeId: () => mockLocalNodeId,
}))

function makeEndpoint(overrides: Partial<Endpoint>): Endpoint {
  return {
    endpoint_id: 'endpoint-1',
    entity_id: '001122fffe334455',
    unique_id: 1,
    direction: 'talker',
    device_type: 'map2',
    device_name: 'Endpoint',
    channels: 2,
    sample_rate: 48000,
    format: '24-bit PCM',
    mac_address: '00:11:22:33:44:55',
    node_address: 'http://127.0.0.1:8080',
    available: true,
    last_seen: '2026-02-17T00:00:00Z',
    node_id: 'local',
    tags: [],
    color: '#ffffff',
    group: 'Default',
    bank: 0,
    pinned: false,
    locked: false,
    ...overrides,
  }
}

function makeNode(overrides: Partial<AvbNode>): AvbNode {
  return {
    node_id: 'node-local',
    name: 'Local Node',
    type: 'map2_local',
    status: 'online',
    capabilities: {
      talker: true,
      listener: true,
      avdecc_controller: true,
      audio_processing: true,
      remote_control: true,
      max_talkers: 8,
      max_listeners: 8,
      sample_rates: [48000],
      formats: ['24-bit PCM'],
    },
    ptp: null,
    health: null,
    address: '192.168.1.10',
    api_url: 'http://192.168.1.10:8080',
    entity_id: null,
    talker_count: 0,
    listener_count: 0,
    active_routes: 0,
    version: '3.0.0',
    manufacturer: 'MAP2',
    model: 'Node',
    discovered_at: '2026-02-17T00:00:00Z',
    last_seen: '2026-02-17T00:00:00Z',
    color: '#00aaff',
    pinned: false,
    notes: '',
    ...overrides,
  }
}

function RoutingStateProbe() {
  const state = useRoutingState()
  const route = state.liveRoutes['talker-1→listener-1']
  const routeSummary = route
    ? `${route.state}:${route.talker_node_id ?? 'none'}:${route.listener_node_id ?? 'none'}:${route.cross_node ? 'cross' : 'local'}`
    : 'none'
  const nodeIds = Object.keys(state.network.nodes).sort().join('|') || 'none'
  const nodeBStatus = state.network.nodes['node-b']?.status ?? 'missing'
  const crossNodeRouteIds = Object.keys(state.network.crossNodeRoutes).sort().join('|') || 'none'

  return (
    <div>
      <span data-testid="route-summary">{routeSummary}</span>
      <span data-testid="node-ids">{nodeIds}</span>
      <span data-testid="local-node-id">{state.network.nodeSelection.local_node_id}</span>
      <span data-testid="node-b-status">{nodeBStatus}</span>
      <span data-testid="cross-route-ids">{crossNodeRouteIds}</span>
    </div>
  )
}

function MultiSelectProbe() {
  const state = useRoutingState()
  const filteredEndpointIds = useFilteredEndpoints()
    .map((endpoint) => endpoint.endpoint_id)
    .sort()
    .join('|') || 'none'
  const selectedNodeIds = [...state.network.nodeSelection.selected_node_ids].sort().join('|') || 'none'
  const nodeIds = Object.keys(state.network.nodes).sort().join('|') || 'none'
  const liveRouteIds = Object.keys(state.liveRoutes).sort().join('|') || 'none'
  const crossNodeRouteIds = Object.keys(state.network.crossNodeRoutes).sort().join('|') || 'none'

  return (
    <div>
      <span data-testid="multi-view-mode">{state.network.nodeSelection.view_mode}</span>
      <span data-testid="multi-selected-node-ids">{selectedNodeIds}</span>
      <span data-testid="multi-endpoint-ids">{filteredEndpointIds}</span>
      <span data-testid="multi-node-ids">{nodeIds}</span>
      <span data-testid="multi-live-route-ids">{liveRouteIds}</span>
      <span data-testid="multi-cross-route-ids">{crossNodeRouteIds}</span>
    </div>
  )
}

function SafePatchMultiSelectProbe() {
  const { state, dispatch } = useRouting()
  const selectedNodeIds = [...state.network.nodeSelection.selected_node_ids].sort().join('|') || 'none'
  const filteredEndpointIds = useFilteredEndpoints()
    .map((endpoint) => endpoint.endpoint_id)
    .sort()
    .join('|') || 'none'
  const pendingRouteIds = Object.keys(state.pendingRoutes).sort().join('|') || 'none'
  const liveRouteIds = Object.keys(state.liveRoutes).sort().join('|') || 'none'
  const nodeBStatus = state.network.nodes['node-b']?.status ?? 'missing'
  const nodeCStatus = state.network.nodes['node-c']?.status ?? 'missing'

  return (
    <div>
      <span data-testid="safe-view-mode">{state.network.nodeSelection.view_mode}</span>
      <span data-testid="safe-selected-node-ids">{selectedNodeIds}</span>
      <span data-testid="safe-endpoint-ids">{filteredEndpointIds}</span>
      <span data-testid="safe-mode">{state.safePatchMode ? 'on' : 'off'}</span>
      <span data-testid="safe-pending-route-ids">{pendingRouteIds}</span>
      <span data-testid="safe-live-route-ids">{liveRouteIds}</span>
      <span data-testid="safe-node-b-status">{nodeBStatus}</span>
      <span data-testid="safe-node-c-status">{nodeCStatus}</span>

      <button
        data-testid="safe-enter"
        type="button"
        onClick={() => dispatch({ type: 'ENTER_SAFE_MODE' })}
      >
        enter-safe
      </button>
      <button
        data-testid="safe-stage-connect"
        type="button"
        onClick={() => dispatch({ type: 'PATCH', payload: { talker_id: 'talker-1', listener_id: 'listener-1' } })}
      >
        stage-connect
      </button>
      <button
        data-testid="safe-stage-disconnect"
        type="button"
        onClick={() => dispatch({ type: 'UNPATCH', payload: { route_id: 'talker-1→listener-1' } })}
      >
        stage-disconnect
      </button>
      <button
        data-testid="safe-apply"
        type="button"
        onClick={() => dispatch({ type: 'APPLY_SAFE_CHANGES' })}
      >
        apply-safe
      </button>
      <button
        data-testid="safe-discard"
        type="button"
        onClick={() => dispatch({ type: 'DISCARD_SAFE_CHANGES' })}
      >
        discard-safe
      </button>
      <button
        data-testid="safe-undo"
        type="button"
        onClick={() => dispatch({ type: 'UNDO' })}
      >
        safe-undo
      </button>
      <button
        data-testid="safe-redo"
        type="button"
        onClick={() => dispatch({ type: 'REDO' })}
      >
        safe-redo
      </button>
    </div>
  )
}

describe('RoutingContext API/reducer integration', () => {
  beforeEach(() => {
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = undefined
    mockPtpStatus = undefined
    mockLocalNodeId = 'local'
  })

  it('syncs cross-node route lifecycle from API payloads into reducer state', async () => {
    mockLocalNodeId = 'node-a'
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote' }),
    ]

    mockEndpointsData = {
      count: 2,
      endpoints: [
        makeEndpoint({
          endpoint_id: 'talker-1',
          direction: 'talker',
          unique_id: 1,
          device_name: 'Talker A',
        }),
        makeEndpoint({
          endpoint_id: 'listener-1',
          direction: 'listener',
          unique_id: 2,
          device_name: 'Listener B',
        }),
      ],
    }

    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: {
            endpoint_id: 'talker-1',
            node_id: 'node-a',
          },
          listener: {
            endpoint_id: 'listener-1',
            node_id: 'node-b',
          },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const { rerender } = render(
      <RoutingProvider>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('route-summary').textContent).toBe('connecting:node-a:node-b:cross')
      expect(screen.getByTestId('node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('local-node-id').textContent).toBe('node-a')
    })

    mockConnectionsData = {
      ...mockConnectionsData,
      connections: [
        {
          ...mockConnectionsData.connections[0],
          state: 'connected',
          established_time: '2026-02-17T01:00:00Z',
        },
      ],
    }

    rerender(
      <RoutingProvider>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('route-summary').textContent).toBe('connected:node-a:node-b:cross')
    })
  })

  it('reconciles stale cross-node routes when a remote node goes offline', async () => {
    mockLocalNodeId = 'node-a'
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockEndpointsData = {
      count: 2,
      endpoints: [
        makeEndpoint({
          endpoint_id: 'talker-1',
          direction: 'talker',
          unique_id: 1,
        }),
        makeEndpoint({
          endpoint_id: 'listener-1',
          direction: 'listener',
          unique_id: 2,
        }),
      ],
    }
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T01:00:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const { rerender } = render(
      <RoutingProvider>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('route-summary').textContent).toBe('connected:node-a:node-b:cross')
      expect(screen.getByTestId('node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('cross-route-ids').textContent).toBe('talker-1→listener-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('route-summary').textContent).toBe('none')
      expect(screen.getByTestId('node-b-status').textContent).toBe('offline')
      expect(screen.getByTestId('cross-route-ids').textContent).toBe('none')
    })
  })

  it('replaces stale cross-node route ids when API sync publishes a different route set', async () => {
    mockLocalNodeId = 'node-a'
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockEndpointsData = {
      count: 4,
      endpoints: [
        makeEndpoint({ endpoint_id: 'talker-1', direction: 'talker', unique_id: 1 }),
        makeEndpoint({ endpoint_id: 'listener-1', direction: 'listener', unique_id: 2 }),
        makeEndpoint({ endpoint_id: 'talker-2', direction: 'talker', unique_id: 3 }),
        makeEndpoint({ endpoint_id: 'listener-2', direction: 'listener', unique_id: 4 }),
      ],
    }
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-2→listener-2',
          talker: { endpoint_id: 'talker-2', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-2', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T01:30:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        crossNodeRoutes: {
          staleRoute: {
            route_id: 'staleRoute',
            source_node_id: 'node-a',
            dest_node_id: 'node-b',
            talker_id: 'talker-1',
            listener_id: 'listener-1',
            status: 'active' as const,
            network_path: ['node-a', 'node-b'],
            latency_ms: 0.9,
            bandwidth_mbps: 8.8,
          },
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('cross-route-ids').textContent).toBe('talker-2→listener-2')
    })
  })

  it('retains multi-select node set and filtered endpoint results across node status churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })
  })

  it('retains multi-select state while nodes are removed and re-joined', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-c')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })
  })

  it('retains multi-select endpoint context during rapid API connection refresh churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-a→endpoint-b',
          talker: { endpoint_id: 'endpoint-a', node_id: 'node-a' },
          listener: { endpoint_id: 'endpoint-b', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('endpoint-a→endpoint-b')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('endpoint-a→endpoint-b')
    })

    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('none')
    })

    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-a→endpoint-b',
          talker: { endpoint_id: 'endpoint-a', node_id: 'node-a' },
          listener: { endpoint_id: 'endpoint-b', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T02:10:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('endpoint-a→endpoint-b')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('endpoint-a→endpoint-b')
    })
  })

  it('retains multi-select endpoint context during concurrent node-status and connection refresh churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-a→endpoint-b',
          talker: { endpoint_id: 'endpoint-a', node_id: 'node-a' },
          listener: { endpoint_id: 'endpoint-b', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T02:00:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('endpoint-a→endpoint-b')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('endpoint-a→endpoint-b')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-c→endpoint-b',
          talker: { endpoint_id: 'endpoint-c', node_id: 'node-c' },
          listener: { endpoint_id: 'endpoint-b', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('endpoint-c→endpoint-b')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('endpoint-c→endpoint-b')
    })
  })

  it('supports mixed NodeSelector + NodeTree edits during multi-select workflow', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'single_node' as const,
          current_node_id: 'node-a',
          selected_node_ids: [],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <NodeSelector />
        <NodeTree />
        <MultiSelectProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('node-selector-multi-select-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-view-mode').textContent).toBe('multi_select')
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a')
    })

    fireEvent.click(screen.getByTestId('node-selector-tab-node-b'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('node-tree-item-node-c'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b|node-c')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b|endpoint-c')
    })

    fireEvent.click(screen.getByTestId('node-tree-item-node-b'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-c')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-c')
    })

    fireEvent.click(screen.getByTestId('node-selector-multi-select-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-view-mode').textContent).toBe('all_nodes')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b|endpoint-c')
    })
  })

  it('preserves multi-select node context through safe-patch apply and discard cycles', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-connect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    fireEvent.click(screen.getByTestId('safe-discard'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('retains multi-select safe-patch context while API connection refresh overlaps staged disconnects', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:00:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    fireEvent.click(screen.getByTestId('safe-discard'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('retains multi-select safe-patch context during concurrent node-status and API refresh overlap', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:10:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('offline')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('degraded')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('retains safe-patch apply/discard behavior while selected-node inventories remove and rejoin', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-connect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:20:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-discard'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('handles mixed safe-patch apply/discard windows during node remove/rejoin and connection re-sync races', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-connect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('degraded')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:25:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-discard'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('retains multi-select context when safe mode exits during selected-node status transitions in the same sync window', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:35:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'degraded' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'offline' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    fireEvent.click(screen.getByTestId('safe-apply'))
    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('offline')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('degraded')
    })
  })

  it('retains multi-select context when safe-mode exit overlaps node remove/rejoin and route-id replacement sync', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:45:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-c→listener-1',
          talker: { endpoint_id: 'endpoint-c', node_id: 'node-c' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    fireEvent.click(screen.getByTestId('safe-apply'))
    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:46:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('degraded')
    })
  })

  it('preserves undo/redo consistency when safe-mode exit overlaps route-id replacement and node-status churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:55:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'degraded' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'offline' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-c→listener-1',
          talker: { endpoint_id: 'endpoint-c', node_id: 'node-c' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
    })

    fireEvent.click(screen.getByTestId('safe-undo'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
    })

    fireEvent.click(screen.getByTestId('safe-redo'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
    })
  })
})
