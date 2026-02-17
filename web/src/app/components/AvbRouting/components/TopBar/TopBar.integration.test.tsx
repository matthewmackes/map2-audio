import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TopBar } from './TopBar'
import { RoutingProvider, useFilteredEndpoints, useRoutingState } from '../../context/RoutingContext'
import { initialRoutingState } from '../../types'
import type { AvbNode, ConnectionsResponse, Endpoint, EndpointsResponse } from '../../types'

let mockEndpointsData: EndpointsResponse | undefined
let mockConnectionsData: ConnectionsResponse | undefined
let mockNodesData: AvbNode[] | undefined
let mockLocalNodeId = 'node-a'

const mockBatchMutate = jest.fn()
const mockNotify = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
}

jest.mock('../../hooks/useAvbApi', () => ({
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
  useBatchPatchMutation: () => ({
    mutate: mockBatchMutate,
    isPending: false,
  }),
}))

jest.mock('../../hooks/useNodeApi', () => ({
  useNodes: () => ({
    data: mockNodesData,
    isLoading: false,
    error: null,
  }),
  usePtpStatus: () => ({
    data: undefined,
  }),
  useLocalNodeId: () => mockLocalNodeId,
}))

jest.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => mockNotify,
}))

jest.mock('./NodeSelector', () => ({
  NodeSelector: () => <div data-testid="mock-node-selector">node-selector</div>,
}))

jest.mock('../NetworkTopology/NetworkTopologyModal', () => ({
  NetworkTopologyModal: () => null,
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
    node_id: 'node-a',
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
    node_id: 'node-a',
    name: 'Node A',
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
      sample_rates: [48000, 96000],
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

function TopBarFilterProbe() {
  const state = useRoutingState()
  const endpointIds = useFilteredEndpoints()
    .map((endpoint) => endpoint.endpoint_id)
    .sort()
    .join('|') || 'none'
  const selectedNodeIds = [...state.network.nodeSelection.selected_node_ids].sort().join('|') || 'none'

  return (
    <div>
      <span data-testid="probe-view-mode">{state.network.nodeSelection.view_mode}</span>
      <span data-testid="probe-selected-node-ids">{selectedNodeIds}</span>
      <span data-testid="probe-endpoint-ids">{endpointIds}</span>
    </div>
  )
}

describe('TopBar filter controls provider integration', () => {
  beforeEach(() => {
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockLocalNodeId = 'node-a'
    mockBatchMutate.mockReset()
    mockNotify.success.mockReset()
    mockNotify.error.mockReset()
    mockNotify.warning.mockReset()
    mockNotify.info.mockReset()
  })

  it('updates filtered endpoint output under multi-select node context when TopBar filters change', async () => {
    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      device_type: 'map2',
      sample_rate: 48000,
      channels: 2,
      group: 'Stage',
      available: true,
      locked: false,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      device_type: 'avdecc',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      available: false,
      locked: true,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      device_type: 'map2',
      sample_rate: 48000,
      channels: 2,
      group: 'Aux',
      available: true,
      locked: false,
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

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarFilterProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('probe-view-mode').textContent).toBe('multi_select')
      expect(screen.getByTestId('probe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-button'))

    fireEvent.click(screen.getByTestId('topbar-filter-available-only'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-available-only'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-sample-96000'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-channels-8'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-group-foh'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-show-locked'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('none')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-clear-all'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })
  })
})
