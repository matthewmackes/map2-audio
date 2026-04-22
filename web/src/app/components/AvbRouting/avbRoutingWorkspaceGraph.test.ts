import type { TesiraDeviceSummary } from '../Devices/Tesira/types'
import type { AvbNode } from './types'
import { buildAvbRoutingWorkspaceGraphModel } from './avbRoutingWorkspaceGraph'

function makeNode(overrides: Partial<AvbNode> = {}): AvbNode {
  return {
    node_id: 'node-a',
    name: 'Node A',
    type: 'map2_local',
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
    ptp: {
      state: 'master',
      domain: 0,
      is_master: true,
      master_clock_id: 'node-a',
      offset_ns: 0,
      last_sync: '2026-04-03T21:50:00.000Z',
      gptp_supported: true,
    },
    health: {
      cpu_usage: 12,
      memory_usage: 28,
      latency_ms: 1.5,
      packet_loss: 0,
      last_check: '2026-04-03T21:50:00.000Z',
      status: 'healthy',
    },
    address: '10.0.0.10',
    api_url: 'http://10.0.0.10:8080',
    entity_id: '0011aa22bb33cc44',
    talker_count: 2,
    listener_count: 1,
    active_routes: 1,
    version: '1.0.0',
    manufacturer: 'MAP2',
    model: 'Rack',
    discovered_at: '2026-04-03T21:40:00.000Z',
    last_seen: '2026-04-03T21:50:00.000Z',
    color: '#0f62fe',
    pinned: false,
    notes: '',
    ...overrides,
  }
}

function makeTesiraDevice(overrides: Partial<TesiraDeviceSummary> = {}): TesiraDeviceSummary {
  return {
    device_id: 'tesira-a',
    host: '10.0.0.20',
    port: 23,
    name: 'Forte AVB',
    connected: true,
    serial_number: 'serial-a',
    firmware_version: '4.5.1',
    fault_count: 0,
    avb_stream_count: 2,
    ptp_state: 'SLAVE',
    source_node_id: 'node-b',
    source_hostname: 'rack-b',
    discovered_by_node_ids: ['node-b'],
    discovered_by_hosts: ['rack-b'],
    ...overrides,
  }
}

describe('buildAvbRoutingWorkspaceGraphModel', () => {
  it('builds graph nodes, route edges, and summary tags for AVB and Tesira topology', () => {
    const model = buildAvbRoutingWorkspaceGraphModel({
      nodes: [
        makeNode(),
        makeNode({
          node_id: 'node-b',
          name: 'Node B',
          type: 'map2_remote',
          ptp: {
            state: 'slave',
            domain: 0,
            is_master: false,
            master_clock_id: 'node-a',
            offset_ns: 42,
            last_sync: '2026-04-03T21:50:00.000Z',
            gptp_supported: true,
          },
          color: '#1192e8',
        }),
      ],
      aggregatedRouteEdges: [
        { sourceNodeId: 'node-a', targetNodeId: 'node-b', routeCount: 3 },
      ],
      tesiraDevices: [makeTesiraDevice()],
      ptpMasterNodeId: 'node-a',
      selectedNodeId: 'node-b',
      selectedTesiraDeviceId: 'tesira-a',
      focusedEntityId: '0011aa22bb33cc44',
      summaryByNodeId: {
        'node-a': { endpointCount: 3, routeCount: 3, tesiraCount: 0 },
        'node-b': { endpointCount: 2, routeCount: 3, tesiraCount: 1 },
      },
      tesiraDevicesByNodeId: {
        'node-b': [makeTesiraDevice()],
      },
    })

    expect(model.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      'avb-routing-workspace:fabric',
      'node:node-a',
      'node:node-b',
      'tesira:tesira-a',
    ]))
    expect(model.edges.find((edge) => edge.id === 'route:node-a:node-b')).toMatchObject({
      animated: true,
      label: '3 routes',
    })
    expect(model.summaryTags.map((tag) => tag.label)).toEqual(expect.arrayContaining([
      '2/2 nodes online',
      '3 active routes',
      '1/1 Tesira ready',
    ]))
    expect(model.nodes.find((node) => node.id === 'node:node-b')?.data.selected).toBe(true)
    expect(model.nodes.find((node) => node.id === 'tesira:tesira-a')?.data.selected).toBe(true)
    expect(model.pulseCopy).toContain('grandmaster')
  })
})
