import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InspectorPanel } from './InspectorPanel'
import { initialRoutingState, type Endpoint, type Route } from '../../types'

let mockState: any
let mockAvbDevicesData: any
let mockAvbStreamsData: any
let mockAvdeccEntitiesData: any

jest.mock('../../context/RoutingContext', () => ({
  useRoutingState: () => mockState,
}))

jest.mock('../../hooks/useAvbApi', () => ({
  useAvbDevices: () => ({
    data: mockAvbDevicesData,
  }),
  useAvbStreams: () => ({
    data: mockAvbStreamsData,
  }),
  useAvdeccEntities: () => ({
    data: mockAvdeccEntitiesData,
  }),
}))

jest.mock('@/map2/api', () => ({
  audioApi: {
    getChainRouting: jest.fn(async () => ({
      available: true,
      chain_id: 1,
      input_ports: [],
      output_ports: [],
      input_avb_endpoints: [],
      output_avb_endpoints: [],
      input_bindings: [],
      output_bindings: [],
      is_override: false,
      chain_exists: true,
    })),
  },
  chainsApi: {
    list: jest.fn(async () => ({ chains: [] })),
  },
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

function makeRoute(overrides: Partial<Route>): Route {
  return {
    id: 'talker-b→listener-c',
    talker_id: 'talker-b',
    listener_id: 'listener-c',
    state: 'connected',
    established_time: '2026-02-17T00:00:00Z',
    error_message: null,
    connection_count: 1,
    srp_reservation_id: null,
    srp_admission_id: null,
    locked: false,
    valid: true,
    messages: [],
    cross_node: true,
    talker_node_id: 'node-b',
    listener_node_id: 'node-c',
    ...overrides,
  }
}

function makeBaseState() {
  return {
    ...initialRoutingState,
    network: {
      ...initialRoutingState.network,
      nodeSelection: {
        ...initialRoutingState.network.nodeSelection,
        show_offline: true,
      },
    },
    selection: {
      ...initialRoutingState.selection,
    },
    endpoints: {},
    liveRoutes: {},
    pendingRoutes: {},
  }
}

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function QueryWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('InspectorPanel node-context filtering', () => {
  beforeEach(() => {
    mockState = makeBaseState()
    mockAvbDevicesData = {
      available: true,
      count: 2,
      device_names: ['AVB Talker [eth0]', 'AVB Listener [eth0]'],
      discovered_count: 1,
      discovered_devices: [],
    }
    mockAvbStreamsData = {
      available: true,
      streams: [],
    }
    mockAvdeccEntitiesData = {
      enabled: true,
      entities: [],
    }
  })

  it('hides and restores selected route details as single-node context changes', () => {
    const talkerB = makeEndpoint({
      endpoint_id: 'talker-b',
      device_name: 'Talker B',
      direction: 'talker',
      node_id: 'node-b',
    })
    const listenerC = makeEndpoint({
      endpoint_id: 'listener-c',
      device_name: 'Listener C',
      direction: 'listener',
      node_id: 'node-c',
    })
    const route = makeRoute({})

    mockState = {
      ...makeBaseState(),
      network: {
        ...makeBaseState().network,
        nodeSelection: {
          ...makeBaseState().network.nodeSelection,
          view_mode: 'single_node',
          current_node_id: 'node-a',
        },
      },
      endpoints: {
        [talkerB.endpoint_id]: talkerB,
        [listenerC.endpoint_id]: listenerC,
      },
      liveRoutes: {
        [route.id]: route,
      },
      selection: {
        ...makeBaseState().selection,
        selectedRoutes: [route.id],
      },
    }

    const { rerender } = render(<InspectorPanel />, { wrapper: createQueryWrapper() })

    expect(screen.queryByText('Selected Route')).toBeNull()
    expect(screen.getByText('Click an endpoint or route to see details')).toBeTruthy()

    mockState = {
      ...mockState,
      network: {
        ...mockState.network,
        nodeSelection: {
          ...mockState.network.nodeSelection,
          current_node_id: 'node-b',
        },
      },
    }

    rerender(<InspectorPanel />)

    expect(screen.getByText('Selected Route')).toBeTruthy()
    expect(screen.getByText('Talker B')).toBeTruthy()
    expect(screen.getByText('Listener C')).toBeTruthy()
  })

  it('hides and restores selected endpoint details as single-node context changes', () => {
    const endpointB = makeEndpoint({
      endpoint_id: 'listener-b',
      direction: 'listener',
      device_name: 'Listener B',
      node_id: 'node-b',
    })

    mockState = {
      ...makeBaseState(),
      network: {
        ...makeBaseState().network,
        nodeSelection: {
          ...makeBaseState().network.nodeSelection,
          view_mode: 'single_node',
          current_node_id: 'node-a',
        },
      },
      endpoints: {
        [endpointB.endpoint_id]: endpointB,
      },
      selection: {
        ...makeBaseState().selection,
        selectedEndpoints: [endpointB.endpoint_id],
      },
    }

    const { rerender } = render(<InspectorPanel />, { wrapper: createQueryWrapper() })

    expect(screen.queryByText('Selected Endpoint')).toBeNull()
    expect(screen.getByText('Click an endpoint or route to see details')).toBeTruthy()

    mockState = {
      ...mockState,
      network: {
        ...mockState.network,
        nodeSelection: {
          ...mockState.network.nodeSelection,
          current_node_id: 'node-b',
        },
      },
    }

    rerender(<InspectorPanel />)

    expect(screen.getByText('Selected Endpoint')).toBeTruthy()
    expect(screen.getByText('Listener B')).toBeTruthy()
  })

  it('hides and restores selected route details as multi-select node context changes', () => {
    const talkerB = makeEndpoint({
      endpoint_id: 'talker-b',
      device_name: 'Talker B',
      direction: 'talker',
      node_id: 'node-b',
    })
    const listenerC = makeEndpoint({
      endpoint_id: 'listener-c',
      device_name: 'Listener C',
      direction: 'listener',
      node_id: 'node-c',
    })
    const route = makeRoute({})

    mockState = {
      ...makeBaseState(),
      network: {
        ...makeBaseState().network,
        nodeSelection: {
          ...makeBaseState().network.nodeSelection,
          view_mode: 'multi_select',
          selected_node_ids: ['node-a'],
        },
      },
      endpoints: {
        [talkerB.endpoint_id]: talkerB,
        [listenerC.endpoint_id]: listenerC,
      },
      liveRoutes: {
        [route.id]: route,
      },
      selection: {
        ...makeBaseState().selection,
        selectedRoutes: [route.id],
      },
    }

    const { rerender } = render(<InspectorPanel />, { wrapper: createQueryWrapper() })

    expect(screen.queryByText('Selected Route')).toBeNull()

    mockState = {
      ...mockState,
      network: {
        ...mockState.network,
        nodeSelection: {
          ...mockState.network.nodeSelection,
          selected_node_ids: ['node-a', 'node-b'],
        },
      },
    }

    rerender(<InspectorPanel />)

    expect(screen.getByText('Selected Route')).toBeTruthy()
    expect(screen.getByText('Talker B')).toBeTruthy()
  })

  it('hides and restores selected endpoint details as multi-select node context changes', () => {
    const endpointB = makeEndpoint({
      endpoint_id: 'listener-b',
      direction: 'listener',
      device_name: 'Listener B',
      node_id: 'node-b',
    })

    mockState = {
      ...makeBaseState(),
      network: {
        ...makeBaseState().network,
        nodeSelection: {
          ...makeBaseState().network.nodeSelection,
          view_mode: 'multi_select',
          selected_node_ids: ['node-a'],
        },
      },
      endpoints: {
        [endpointB.endpoint_id]: endpointB,
      },
      selection: {
        ...makeBaseState().selection,
        selectedEndpoints: [endpointB.endpoint_id],
      },
    }

    const { rerender } = render(<InspectorPanel />, { wrapper: createQueryWrapper() })

    expect(screen.queryByText('Selected Endpoint')).toBeNull()
    expect(screen.getByText('Click an endpoint or route to see details')).toBeTruthy()

    mockState = {
      ...mockState,
      network: {
        ...mockState.network,
        nodeSelection: {
          ...mockState.network.nodeSelection,
          selected_node_ids: ['node-a', 'node-b'],
        },
      },
    }

    rerender(<InspectorPanel />)

    expect(screen.getByText('Selected Endpoint')).toBeTruthy()
    expect(screen.getByText('Listener B')).toBeTruthy()
  })

  it('shows engine cache metadata for selected endpoint and transport stats', () => {
    const endpointA = makeEndpoint({
      endpoint_id: 'talker-a',
      device_name: 'Talker A',
      direction: 'talker',
      node_id: 'node-a',
    })

    mockState = {
      ...makeBaseState(),
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
      },
      selection: {
        ...makeBaseState().selection,
        selectedEndpoints: [endpointA.endpoint_id],
      },
    }

    mockAvbDevicesData = {
      available: true,
      count: 2,
      device_names: ['AVB Talker [eth0]', 'AVB Listener [eth0]'],
      discovered_count: 1,
      discovered_devices: [
        {
          endpoint_id: 'talker-a',
          device_name: 'AVB Talker [node-a::talker-a]',
          direction: 'talker',
          device_type: 'map2',
          node_address: 'http://192.168.1.10:8080',
          audio_format: '24-bit PCM',
          channels: 2,
          sample_rate: 48000,
          available: true,
        },
      ],
    }

    mockAvbStreamsData = {
      available: true,
      streams: [
        {
          stream_id: 'stream-1',
          state: 'running',
          health: { ready: true },
          diagnostics: {
            effective_config: {
              stream_id: 'stream-1',
              direction: 'talker',
              interface: 'eth0',
              channels: 2,
              sample_rate: 48000,
              buffer_size: 256,
              presentation_offset_us: 2000,
              priority: 3,
              dest_mac: null,
              failover_policy: 'prefer_primary',
              interface_candidates: ['eth0', 'eth1'],
            },
            ptp_lock: {
              locked: true,
              state: 'SLAVE',
              reason: null,
              offset_ns: 10,
              mean_path_delay_ns: 30,
              last_update: '2026-02-20T00:00:00Z',
            },
            tsn_qdisc: {
              available: true,
              interface: 'eth0',
              mqprio_configured: true,
              cbs_configured: true,
              etf_configured: true,
              vlan_configured: true,
              error: null,
            },
            srp: {
              enabled: true,
              required: true,
              bound: true,
              reservation_id: 'res-1',
              admission_id: 'adm-1',
              metadata: {},
            },
          },
        },
        {
          stream_id: 'stream-2',
          state: 'error',
          health: { ready: false },
          diagnostics: {
            effective_config: {
              stream_id: 'stream-2',
              direction: 'listener',
              interface: 'eth0',
              channels: 2,
              sample_rate: 48000,
              buffer_size: 256,
              presentation_offset_us: 2000,
              priority: 3,
              dest_mac: null,
              failover_policy: 'none',
              interface_candidates: ['eth0'],
            },
            ptp_lock: {
              locked: false,
              state: 'LISTENING',
              reason: 'PTP_STATE_LISTENING',
              offset_ns: null,
              mean_path_delay_ns: null,
              last_update: null,
            },
            tsn_qdisc: {
              available: false,
              interface: 'eth0',
              mqprio_configured: false,
              cbs_configured: false,
              etf_configured: false,
              vlan_configured: false,
              error: 'not configured',
            },
            srp: {
              enabled: true,
              required: true,
              bound: false,
              reservation_id: null,
              admission_id: null,
              metadata: {},
            },
          },
        },
      ],
    }

    render(<InspectorPanel />, { wrapper: createQueryWrapper() })

    expect(screen.getByText('Engine Cache')).toBeTruthy()
    expect(screen.getByText('Synced')).toBeTruthy()
    expect(screen.getByText('Cached Format')).toBeTruthy()
    expect(screen.getByText('Engine AVB Devices')).toBeTruthy()
    expect(screen.getByText('Transport Ready Streams')).toBeTruthy()
    expect(screen.getByText('Streams With Issues')).toBeTruthy()
    expect(screen.getByText('Diagnostics Coverage')).toBeTruthy()
    expect(screen.getByText('PTP Locked Streams')).toBeTruthy()
    expect(screen.getByText('TSN Fully Configured Streams')).toBeTruthy()
    expect(screen.getByText('SRP Bound Streams')).toBeTruthy()
    expect(screen.getByText('Failover Candidate Streams')).toBeTruthy()
    expect(screen.getByText('Failover Policies')).toBeTruthy()
    expect(screen.getByText('Failover Interfaces')).toBeTruthy()
  })

  it('renders AVB health snapshot scoped to the selected node context', () => {
    const talkerA = makeEndpoint({
      endpoint_id: 'talker-a',
      device_name: 'Talker A',
      direction: 'talker',
      host: 'stage.local',
      node_id: 'node-a',
      available: true,
    })
    const listenerB = makeEndpoint({
      endpoint_id: 'listener-b',
      device_name: 'Listener B',
      direction: 'listener',
      host: 'remote.local',
      node_id: 'node-b',
      available: false,
    })
    const route = makeRoute({
      id: 'talker-a→listener-b',
      talker_id: 'talker-a',
      listener_id: 'listener-b',
      talker_node_id: 'node-a',
      listener_node_id: 'node-b',
    })

    mockState = {
      ...makeBaseState(),
      network: {
        ...makeBaseState().network,
        nodes: {
          'node-a': { node_id: 'node-a', status: 'online' },
          'node-b': { node_id: 'node-b', status: 'degraded' },
        },
        nodeSelection: {
          ...makeBaseState().network.nodeSelection,
          view_mode: 'single_node',
          current_node_id: 'node-a',
        },
      },
      endpoints: {
        [talkerA.endpoint_id]: talkerA,
        [listenerB.endpoint_id]: listenerB,
      },
      liveRoutes: {
        [route.id]: route,
      },
    }

    mockAvbStreamsData = {
      available: true,
      streams: [
        {
          stream_id: route.id,
          state: 'running',
          ownership: {
            owner_node_id: 'node-a',
            peer_node_id: 'node-b',
            owner_endpoint_id: 'talker-a',
            peer_endpoint_id: 'listener-b',
            talker_node_id: 'node-a',
            listener_node_id: 'node-b',
            talker_endpoint_id: 'talker-a',
            listener_endpoint_id: 'listener-b',
            node_ids: ['node-a', 'node-b'],
            endpoint_ids: ['listener-b', 'talker-a'],
          },
          health: { ready: true },
          diagnostics: {
            effective_config: {
              stream_id: route.id,
              direction: 'talker',
              interface: 'eth0',
              channels: 2,
              sample_rate: 48000,
              buffer_size: 256,
              presentation_offset_us: 2000,
              priority: 3,
              dest_mac: null,
              failover_policy: 'prefer_primary',
              interface_candidates: ['eth0', 'eth1'],
            },
            ptp_lock: {
              locked: true,
              state: 'SLAVE',
              reason: null,
              offset_ns: 10,
              mean_path_delay_ns: 20,
              last_update: '2026-02-21T00:00:00Z',
            },
            tsn_qdisc: {
              available: true,
              interface: 'eth0',
              mqprio_configured: true,
              cbs_configured: true,
              etf_configured: true,
              vlan_configured: true,
              error: null,
            },
            srp: {
              enabled: true,
              required: true,
              bound: true,
              reservation_id: 'res-1',
              admission_id: 'adm-1',
              metadata: {},
            },
          },
        },
      ],
    }

    render(<InspectorPanel />, { wrapper: createQueryWrapper() })

    expect(screen.getByTestId('inspector-health-snapshot-title').textContent).toBe('AVB Health Snapshot')
    expect(screen.getByTestId('inspector-health-snapshot-status').textContent).toContain('Healthy')
    expect(screen.getByTestId('inspector-health-snapshot-context').textContent).toContain('Node node-a')
    expect(screen.getByTestId('inspector-health-snapshot-scope').textContent).toContain('Ownership-scoped')
    expect(screen.getByTestId('inspector-health-endpoints').textContent).toContain('1/1 healthy')
    expect(screen.getByTestId('inspector-health-hosts').textContent).toContain('1 in context')
    expect(screen.getByTestId('inspector-health-streams').textContent).toContain('1/1 ready')
    expect(screen.getByTestId('inspector-health-ptp').textContent).toContain('1/1 diagnostics')
    expect(screen.getByTestId('inspector-health-srp').textContent).toContain('1/1 diagnostics')
  })

  it('excludes streams without matching ownership in node-scoped health snapshots', () => {
    const talkerA = makeEndpoint({
      endpoint_id: 'talker-a',
      device_name: 'Talker A',
      direction: 'talker',
      node_id: 'node-a',
      available: true,
    })

    mockState = {
      ...makeBaseState(),
      network: {
        ...makeBaseState().network,
        nodeSelection: {
          ...makeBaseState().network.nodeSelection,
          view_mode: 'single_node',
          current_node_id: 'node-a',
        },
      },
      endpoints: {
        [talkerA.endpoint_id]: talkerA,
      },
    }

    mockAvbStreamsData = {
      available: true,
      streams: [
        {
          stream_id: 'stream-unscoped',
          direction: 'talker',
          state: 'running',
          health: { ready: true },
          diagnostics: {
            effective_config: {
              stream_id: 'stream-unscoped',
              direction: 'talker',
              interface: 'eth0',
              channels: 2,
              sample_rate: 48000,
              buffer_size: 256,
              presentation_offset_us: 2000,
              priority: 3,
              dest_mac: null,
              failover_policy: 'none',
              interface_candidates: ['eth0'],
            },
            ptp_lock: {
              locked: true,
              state: 'SLAVE',
              reason: null,
              offset_ns: 1,
              mean_path_delay_ns: 2,
              last_update: '2026-02-21T00:00:00Z',
            },
            tsn_qdisc: {
              available: true,
              interface: 'eth0',
              mqprio_configured: true,
              cbs_configured: true,
              etf_configured: true,
              vlan_configured: true,
              error: null,
            },
            srp: {
              enabled: true,
              required: true,
              bound: false,
              reservation_id: null,
              admission_id: null,
              metadata: {},
            },
          },
        },
      ],
    }

    render(<InspectorPanel />, { wrapper: createQueryWrapper() })

    expect(screen.getByTestId('inspector-health-snapshot-scope').textContent).toContain('Ownership-scoped')
    expect(screen.getByTestId('inspector-health-streams').textContent).toContain('0/0 ready')
    expect(screen.getByTestId('inspector-health-ptp').textContent).toContain('0/0 diagnostics')
    expect(screen.getByTestId('inspector-health-srp').textContent).toContain('0/0 diagnostics')
  })

  it('shows route-specific failover diagnostics when matching stream data exists', () => {
    const talker = makeEndpoint({
      endpoint_id: '001122fffe334455:1',
      device_name: 'Talker Stream Map2',
      direction: 'talker',
      node_id: 'node-b',
    });
    const listener = makeEndpoint({
      endpoint_id: '667788fffe99aabb:2',
      device_name: 'Listener Stream Map2',
      direction: 'listener',
      node_id: 'node-c',
    });
    const route = makeRoute({
      id: '001122fffe334455:1→667788fffe99aabb:2',
      talker_id: '001122fffe334455:1',
      listener_id: '667788fffe99aabb:2',
      talker_node_id: 'node-b',
      listener_node_id: 'node-c',
    });

    mockState = {
      ...makeBaseState(),
      network: {
        ...makeBaseState().network,
        nodeSelection: {
          ...makeBaseState().network.nodeSelection,
          view_mode: 'single_node',
          current_node_id: 'node-b',
        },
      },
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
      },
      liveRoutes: {
        [route.id]: route,
      },
      selection: {
        ...makeBaseState().selection,
        selectedRoutes: [route.id],
      },
    };

    mockAvbStreamsData = {
      available: true,
      streams: [
        {
          stream_id: 'map2-talker-001122fffe334455-1-667788fffe99aabb-2',
          direction: 'talker',
          state: 'running',
          ownership: {
            owner_node_id: 'node-b',
            peer_node_id: 'node-c',
            owner_endpoint_id: '001122fffe334455:1',
            peer_endpoint_id: '667788fffe99aabb:2',
            talker_node_id: 'node-b',
            listener_node_id: 'node-c',
            talker_endpoint_id: '001122fffe334455:1',
            listener_endpoint_id: '667788fffe99aabb:2',
            node_ids: ['node-b', 'node-c'],
            endpoint_ids: ['001122fffe334455:1', '667788fffe99aabb:2'],
          },
          health: { ready: true, issues: [], interface: 'eth0', ptp: null, tsn: null },
          diagnostics: {
            effective_config: {
              stream_id: 'map2-talker-001122fffe334455-1-667788fffe99aabb-2',
              direction: 'talker',
              interface: 'eth0',
              channels: 2,
              sample_rate: 48000,
              buffer_size: 256,
              presentation_offset_us: 2000,
              priority: 3,
              dest_mac: null,
              failover_policy: 'prefer_primary',
              interface_candidates: ['eth0', 'eth1'],
            },
            ptp_lock: {
              locked: true,
              state: 'SLAVE',
              reason: null,
              offset_ns: 10,
              mean_path_delay_ns: 20,
              last_update: '2026-02-21T00:00:00Z',
            },
            tsn_qdisc: {
              available: true,
              interface: 'eth0',
              mqprio_configured: true,
              cbs_configured: true,
              etf_configured: true,
              vlan_configured: true,
              error: null,
            },
            srp: {
              enabled: true,
              required: true,
              bound: true,
              reservation_id: 'res-1',
              admission_id: 'adm-1',
              metadata: {},
            },
          },
        },
      ],
    };

    render(<InspectorPanel />, { wrapper: createQueryWrapper() })

    expect(screen.getByText('Selected Route')).toBeTruthy()
    expect(screen.getByText('Talker Stream Map2')).toBeTruthy()
    expect(screen.getByText('Listener Stream Map2')).toBeTruthy()
    expect(screen.getByText('Route Failover Policies')).toBeTruthy()
    expect(screen.getByText(/Policy:\s*prefer_primary/)).toBeTruthy()
    expect(screen.getByText(/eth0, eth1/)).toBeTruthy()
    expect(screen.getByText('Failover Stream(s)')).toBeTruthy()
  })
})
