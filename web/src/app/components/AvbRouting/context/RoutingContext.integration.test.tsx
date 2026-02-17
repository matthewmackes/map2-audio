import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { RoutingProvider, useRoutingState } from './RoutingContext'
import { initialRoutingState } from '../types'
import type {
  AvbNode,
  ConnectionsResponse,
  Endpoint,
  EndpointsResponse,
  NetworkSyncStatus,
} from '../types'

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
})
