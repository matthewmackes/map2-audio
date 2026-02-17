import React from 'react'
import { render, screen } from '@testing-library/react'
import { NetworkTopologyModal } from './NetworkTopologyModal'
import type { AvbNode, NetworkSyncStatus, RoutingState } from '../../types'

let mockNodesData: AvbNode[] = []
let mockPtpStatus: NetworkSyncStatus | undefined
let mockRoutingState: RoutingState

jest.mock('../../context/RoutingContext', () => ({
  useRouting: () => ({
    state: mockRoutingState,
    dispatch: jest.fn(),
  }),
}))

jest.mock('../../hooks/useNodeApi', () => ({
  useNodes: () => ({ data: mockNodesData }),
  usePtpStatus: () => ({ data: mockPtpStatus }),
}))

jest.mock('reactflow', () => {
  return {
    __esModule: true,
    default: ({ nodes, edges, nodeTypes, children }: any) => (
      <div data-testid="reactflow-mock">
        <div data-testid="topology-nodes-rendered">
          {nodes.map((node: any) => {
            const NodeComponent = nodeTypes?.[node.type]
            if (!NodeComponent) {
              return null
            }
            return <NodeComponent key={node.id} data={node.data} />
          })}
        </div>
        <span data-testid="topology-node-count">{nodes.length}</span>
        <span data-testid="topology-edge-count">{edges.length}</span>
        {children}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Panel: ({ children }: any) => <div>{children}</div>,
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    useReactFlow: () => ({ fitView: jest.fn() }),
    MarkerType: { ArrowClosed: 'arrow-closed' },
  }
})

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
      sample_rates: [48000],
      formats: ['24-bit PCM'],
    },
    ptp: {
      state: 'master',
      domain: 0,
      is_master: true,
      master_clock_id: null,
      offset_ns: 0,
      last_sync: '2026-02-17T00:00:00Z',
      gptp_supported: true,
    },
    health: null,
    address: '192.168.1.10',
    api_url: 'http://192.168.1.10:8080',
    entity_id: null,
    talker_count: 1,
    listener_count: 1,
    active_routes: 1,
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

describe('NetworkTopologyModal status badges', () => {
  beforeEach(() => {
    mockNodesData = []
    mockPtpStatus = undefined
    mockRoutingState = {
      endpoints: {},
      liveRoutes: {},
      pendingRoutes: {},
      scenes: [],
      filters: {
        showConnectedOnly: false,
        showWarningsOnly: false,
        nodeFilter: null,
      },
      searchQuery: '',
      selectedBank: 0,
      selection: {
        selectedEndpoints: [],
        selectedRoutes: [],
        hoveredCell: null,
        focusedCell: null,
      },
      safePatchMode: false,
      history: {
        past: [],
        future: [],
      },
      auditLog: [],
      loading: false,
      error: null,
      lastSync: null,
      network: {
        nodes: {},
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-a',
          view_mode: 'all_nodes',
          selected_node_ids: [],
          show_offline: false,
        },
        topology: null,
        syncStatus: null,
        crossNodeRoutes: {
          'talker-1→listener-1': {
            route_id: 'talker-1→listener-1',
            source_node_id: 'node-a',
            dest_node_id: 'node-b',
            talker_id: 'talker-1',
            listener_id: 'listener-1',
            status: 'active',
            network_path: ['node-a', 'node-b'],
            latency_ms: 1.4,
            bandwidth_mbps: 22.2,
          },
        },
      },
    }
  })

  it('renders node-online and cross-node-route badges from current network state', () => {
    mockNodesData = [
      makeNode({
        node_id: 'node-a',
        name: 'Node A',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-b',
        name: 'Node B',
        type: 'map2_remote',
        status: 'degraded',
        ptp: {
          state: 'slave',
          domain: 0,
          is_master: false,
          master_clock_id: 'master-1',
          offset_ns: 42,
          last_sync: '2026-02-17T00:00:00Z',
          gptp_supported: true,
        },
      }),
    ]
    mockPtpStatus = {
      synchronized: true,
      master_node_id: 'node-a',
      synced_nodes: 2,
      total_nodes: 2,
      max_offset_ns: 42,
      last_check: '2026-02-17T00:00:00Z',
    }

    render(<NetworkTopologyModal open onClose={() => {}} />)

    expect(screen.getByText('1/2 nodes online')).toBeTruthy()
    expect(screen.getByText('1 cross-node route')).toBeTruthy()
    expect(screen.getByText('PTP Sync Active')).toBeTruthy()
    expect(screen.getByTestId('topology-node-count').textContent).toBe('2')
    expect(screen.getByTestId('topology-edge-count').textContent).toBe('2')
  })

  it('renders per-node health metrics in topology cards', () => {
    mockNodesData = [
      makeNode({
        node_id: 'node-a',
        name: 'Node A',
        status: 'degraded',
        health: {
          cpu_usage: 73.2,
          memory_usage: 58.1,
          latency_ms: 1.7,
          packet_loss: 0.02,
          last_check: '2026-02-17T00:00:00Z',
          status: 'degraded',
        },
      }),
    ]
    mockPtpStatus = {
      synchronized: false,
      master_node_id: null,
      synced_nodes: 0,
      total_nodes: 1,
      max_offset_ns: null,
      last_check: '2026-02-17T00:00:00Z',
    }

    render(<NetworkTopologyModal open onClose={() => {}} />)

    expect(screen.getByText('Health: degraded · CPU 73.2% · Lat 1.7ms')).toBeTruthy()
  })
})
