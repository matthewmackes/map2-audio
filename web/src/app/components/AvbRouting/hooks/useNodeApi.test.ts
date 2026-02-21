import type { AvbNode } from '../types'
import { buildTopologyEdges, calculateSyncStatus, inferLocalNodeId } from './useNodeApi'

function makeNode(overrides: Partial<AvbNode>): AvbNode {
  return {
    node_id: 'node-a',
    name: 'Node A',
    type: 'map2_remote',
    status: 'online',
    capabilities: {
      talker: true,
      listener: true,
      avdecc_controller: false,
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
    talker_count: 1,
    listener_count: 1,
    active_routes: 0,
    version: '3.0.0',
    manufacturer: 'MAP2',
    model: 'Node',
    discovered_at: '2026-02-21T00:00:00Z',
    last_seen: '2026-02-21T00:00:00Z',
    color: '#1976d2',
    pinned: false,
    notes: '',
    ...overrides,
  }
}

describe('useNodeApi helpers', () => {
  afterEach(() => {
    window.localStorage.removeItem('map2.node_id')
  })

  it('calculates synchronized/total nodes and max offset from node PTP state', () => {
    const nodes = [
      makeNode({
        node_id: 'node-a',
        ptp: {
          state: 'master',
          domain: 0,
          is_master: true,
          master_clock_id: null,
          offset_ns: 10,
          last_sync: '2026-02-21T00:00:00Z',
          gptp_supported: true,
        },
      }),
      makeNode({
        node_id: 'node-b',
        ptp: {
          state: 'slave',
          domain: 0,
          is_master: false,
          master_clock_id: 'node-a',
          offset_ns: -75,
          last_sync: '2026-02-21T00:00:00Z',
          gptp_supported: true,
        },
      }),
      makeNode({
        node_id: 'node-c',
        ptp: {
          state: 'unsynced',
          domain: 0,
          is_master: false,
          master_clock_id: null,
          offset_ns: 300,
          last_sync: '2026-02-21T00:00:00Z',
          gptp_supported: true,
        },
      }),
    ]

    const status = calculateSyncStatus(nodes, {
      enabled: true,
      state: 'slave',
      domain: 0,
      is_master: false,
      master_clock_id: 'node-a',
      offset_ns: 999,
      last_sync: '2026-02-21T00:00:00Z',
      gptp_supported: true,
    })

    expect(status.synced_nodes).toBe(2)
    expect(status.total_nodes).toBe(3)
    expect(status.max_offset_ns).toBe(300)
    expect(status.master_node_id).toBe('node-a')
  })

  it('builds audio and ptp topology edges from router connections', () => {
    const nodes = [
      makeNode({
        node_id: 'node-a',
        entity_id: '0011223344556677',
      }),
      makeNode({
        node_id: 'node-b',
        name: 'Node B',
        entity_id: '8899aabbccddeeff',
        address: '192.168.1.11',
        api_url: 'http://192.168.1.11:8080',
      }),
      makeNode({
        node_id: 'node-c',
        name: 'Node C',
        entity_id: '0011111111111111',
        address: '192.168.1.12',
        api_url: 'http://192.168.1.12:8080',
      }),
    ]

    const edges = buildTopologyEdges(
      nodes,
      [
        {
          state: 'connected',
          talker: { endpoint_id: '0011223344556677:0', device_name: 'Node A' },
          listener: { endpoint_id: '8899aabbccddeeff:0', device_name: 'Node B' },
          bandwidth_mbps: 15.5,
        },
        {
          state: 'connected',
          talker: { endpoint_id: '0011223344556677:1', device_name: 'Node A' },
          listener: { endpoint_id: '8899aabbccddeeff:1', device_name: 'Node B' },
          bandwidth_mbps: 8.25,
        },
      ],
      'node-a'
    )

    const audioEdge = edges.find((edge) => edge.type === 'audio_route')
    expect(audioEdge).toMatchObject({
      from_node_id: 'node-a',
      to_node_id: 'node-b',
      route_count: 2,
      bandwidth_mbps: 23.75,
    })

    const ptpEdges = edges.filter((edge) => edge.type === 'ptp_sync')
    expect(ptpEdges).toHaveLength(2)
  })

  it('prefers explicit connection node_id metadata when provided', () => {
    const nodes = [
      makeNode({ node_id: 'node-a', name: 'Node A', entity_id: null }),
      makeNode({ node_id: 'node-b', name: 'Node B', entity_id: null }),
    ]

    const edges = buildTopologyEdges(
      nodes,
      [
        {
          state: 'connected',
          talker: { endpoint_id: 'unknown:0', node_id: 'node-a', device_name: 'Unknown Talker' },
          listener: { endpoint_id: 'unknown:1', node_id: 'node-b', device_name: 'Unknown Listener' },
        },
      ],
      null
    )

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      from_node_id: 'node-a',
      to_node_id: 'node-b',
      type: 'audio_route',
      route_count: 1,
    })
  })

  it('resolves local node id from configured value first', () => {
    const nodes = [
      makeNode({
        node_id: 'node-a',
        type: 'map2_local',
        api_url: 'http://localhost:8080',
      }),
      makeNode({
        node_id: 'node-b',
        name: 'Node B',
        type: 'map2_remote',
      }),
    ]

    window.localStorage.setItem('map2.node_id', 'node-b')
    expect(inferLocalNodeId(nodes)).toBe('node-b')
  })
})
