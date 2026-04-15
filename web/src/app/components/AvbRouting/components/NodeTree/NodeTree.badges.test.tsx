import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NodeTree } from './NodeTree'
import type { AvbNode, Endpoint, AvbDevicesResponse, AvbStreamsResponse } from '../../types'

interface RoutingStateMock {
  endpoints?: Record<string, Endpoint>;
  network: {
    nodeSelection: {
      current_node_id: string | null;
      local_node_id: string;
      view_mode: 'single_node' | 'multi_select' | 'all_nodes';
      selected_node_ids: string[];
      show_offline: boolean;
    };
  };
}

let mockNodes: AvbNode[] = []
let mockLocalNodeId = 'node-local'
let mockState: RoutingStateMock
let mockFilteredEndpoints: Endpoint[] = []
let mockAvbDevicesData: AvbDevicesResponse
let mockAvbStreamsData: AvbStreamsResponse
const mockDispatch = jest.fn()

jest.mock('../../hooks/useNodeApi', () => ({
  useNodes: () => ({ data: mockNodes }),
  useLocalNodeId: () => mockLocalNodeId,
}))

jest.mock('../../context/RoutingContext', () => ({
  useRouting: () => ({ state: mockState, dispatch: mockDispatch }),
  useFilteredEndpoints: () => mockFilteredEndpoints,
}))

jest.mock('../../hooks/useAvbApi', () => ({
  useAvbDevices: () => ({
    data: mockAvbDevicesData,
  }),
  useAvbStreams: () => ({
    data: mockAvbStreamsData,
  }),
}))

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
    talker_count: 0,
    listener_count: 0,
    active_routes: 0,
    version: '3.0.0',
    manufacturer: 'MAP2',
    model: 'Node',
    discovered_at: '2026-02-17T00:00:00Z',
    last_seen: '2026-02-17T00:00:00Z',
    color: '#1976d2',
    pinned: false,
    notes: '',
    ...overrides,
  }
}

function getRenderedNodeOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="node-tree-item-"]'))
    .map((element) => element.getAttribute('data-testid') || '')
    .map((testId) => testId.replace('node-tree-item-', ''))
}

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
    node_id: 'node-local',
    tags: [],
    color: '#ffffff',
    group: 'Default',
    bank: 0,
    pinned: false,
    locked: false,
    ...overrides,
  }
}

describe('NodeTree status badge behavior', () => {
  beforeEach(() => {
    mockDispatch.mockReset()
    mockLocalNodeId = 'node-local'
    mockFilteredEndpoints = []
    mockAvbDevicesData = {
      available: true,
      count: 0,
      device_names: [],
      discovered_count: 0,
      discovered_devices: [],
    }
    mockAvbStreamsData = {
      available: true,
      streams: [],
    }
    mockState = {
      endpoints: {},
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'all_nodes',
          selected_node_ids: [],
          show_offline: true,
        },
      },
    }
    mockNodes = [
      makeNode({
        node_id: 'node-local',
        name: 'Local Online',
        status: 'online',
        ptp: {
          state: 'master',
          domain: 0,
          is_master: true,
          master_clock_id: null,
          offset_ns: 0,
          last_sync: '2026-02-17T00:00:00Z',
          gptp_supported: true,
        },
      }),
      makeNode({
        node_id: 'node-degraded',
        name: 'Remote Degraded',
        type: 'map2_remote',
        status: 'degraded',
        ptp: null,
      }),
      makeNode({
        node_id: 'node-offline',
        name: 'Remote Offline',
        type: 'map2_remote',
        status: 'offline',
        ptp: null,
      }),
    ]
  })

  it('surfaces online/degraded/offline visibility in header and status tooltips', () => {
    render(<NodeTree />)

    expect(screen.getByText('1 of 3 online')).toBeTruthy()
    expect(screen.getByText('Local Online')).toBeTruthy()
    expect(screen.getByText('Remote Degraded')).toBeTruthy()
    expect(screen.getByText('Remote Offline')).toBeTruthy()

    expect(screen.getByLabelText('Online • PTP master')).toBeTruthy()
    expect(screen.getByLabelText('Online • No PTP sync')).toBeTruthy()
    expect(screen.getByLabelText('Offline')).toBeTruthy()
  })

  it('does not render a disabled manual Add Node affordance', () => {
    render(<NodeTree />)

    expect(screen.queryByText('Add Node')).toBeNull()
  })

  it('renders per-node AVB sync and issue chips from engine discovered cache', () => {
    const localEndpoint = makeEndpoint({
      endpoint_id: 'local-talker',
      node_id: 'node-local',
      direction: 'talker',
      available: true,
    })
    const degradedEndpoint = makeEndpoint({
      endpoint_id: 'degraded-listener',
      node_id: 'node-degraded',
      direction: 'listener',
      available: false,
    })

    mockFilteredEndpoints = [localEndpoint, degradedEndpoint]
    mockState = {
      endpoints: {
        [localEndpoint.endpoint_id]: localEndpoint,
        [degradedEndpoint.endpoint_id]: degradedEndpoint,
      },
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'all_nodes',
          selected_node_ids: [],
          show_offline: true,
        },
      },
    }
    mockAvbDevicesData = {
      available: true,
      count: 3,
      device_names: ['AVB Talker [eth0]', 'AVB Listener [eth0]', 'AVB Talker [node-local::local-talker]'],
      discovered_count: 1,
      discovered_devices: [
        {
          endpoint_id: 'local-talker',
          device_name: 'AVB Talker [node-local::local-talker]',
          direction: 'talker',
          device_type: 'map2',
          node_address: 'http://127.0.0.1:8080',
          audio_format: '24-bit PCM',
          channels: 2,
          sample_rate: 48000,
          available: true,
        },
      ],
    }

    render(<NodeTree />)

    expect(screen.getByTestId('node-tree-sync-chip-node-local').textContent).toContain('Sync 1/1')
    expect(screen.getByTestId('node-tree-issues-chip-node-local').textContent).toContain('Issues 0')
    expect(screen.getByTestId('node-tree-sync-chip-node-degraded').textContent).toContain('Sync 0/1')
    expect(screen.getByTestId('node-tree-issues-chip-node-degraded').textContent).toContain('Issues 1')
  })

  it('renders per-node AVB failover chips when stream diagnostics include candidate endpoints', () => {
    const localTalker = makeEndpoint({
      endpoint_id: '001122fffe334455:1',
      unique_id: 1,
      entity_id: '001122fffe334455',
      node_id: 'node-local',
      direction: 'talker',
      available: true,
    })
    const degradedListener = makeEndpoint({
      endpoint_id: '667788fffe99aabb:2',
      unique_id: 2,
      entity_id: '667788fffe99aabb',
      node_id: 'node-degraded',
      direction: 'listener',
      available: true,
    })

    mockFilteredEndpoints = [localTalker, degradedListener]
    mockState = {
      endpoints: {
        [localTalker.endpoint_id]: localTalker,
        [degradedListener.endpoint_id]: degradedListener,
      },
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'all_nodes',
          selected_node_ids: [],
          show_offline: true,
        },
      },
    }
    mockAvbStreamsData = {
      available: true,
      streams: [
        {
          stream_id: 'map2-talker-001122fffe334455-1-667788fffe99aabb-2',
          direction: 'talker',
          state: 'running',
          effective_config: {
            stream_id: 'map2-talker-001122fffe334455-1-667788fffe99aabb-2',
            direction: 'talker',
            interface: 'eth0',
            channels: 2,
            sample_rate: 48000,
            buffer_size: 512,
            presentation_offset_us: 0,
            priority: 2,
            dest_mac: null,
            failover_policy: 'prefer_primary',
            interface_candidates: ['eth0', 'eth1'],
          },
          health: { ready: true },
          diagnostics: {
            effective_config: {
              stream_id: 'map2-talker-001122fffe334455-1-667788fffe99aabb-2',
              direction: 'talker',
              interface: 'eth0',
              channels: 2,
              sample_rate: 48000,
              buffer_size: 512,
              presentation_offset_us: 0,
              priority: 2,
              dest_mac: null,
              failover_policy: 'prefer_primary',
              interface_candidates: ['eth0', 'eth1'],
            },
            ptp_lock: { locked: true },
            tsn_qdisc: {},
            srp: {},
          },
        },
      ],
    }

    render(<NodeTree />)

    expect(screen.getByTestId('node-tree-failover-chip-node-local').textContent).toContain('Failover 1')
    expect(screen.getByTestId('node-tree-failover-chip-node-degraded').textContent).toContain('Failover 1')
  })

  it('dispatches node selection actions when a node is clicked', () => {
    render(<NodeTree />)

    fireEvent.click(screen.getByText('Remote Offline'))

    expect(mockDispatch).toHaveBeenNthCalledWith(1, {
      type: 'SELECT_NODE',
      payload: 'node-offline',
    })
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'SET_VIEW_MODE',
      payload: 'single_node',
    })
  })

  it('dispatches node selection actions when a node row is keyboard-activated', () => {
    render(<NodeTree />)

    fireEvent.keyDown(screen.getByTestId('node-tree-item-node-offline'), { key: 'Enter' })

    expect(mockDispatch).toHaveBeenNthCalledWith(1, {
      type: 'SELECT_NODE',
      payload: 'node-offline',
    })
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'SET_VIEW_MODE',
      payload: 'single_node',
    })
  })

  it('dispatches multi-select toggle when view mode is multi_select', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local'],
          show_offline: true,
        },
      },
    }

    render(<NodeTree />)

    fireEvent.click(screen.getByText('Remote Offline'))

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-offline',
    })
  })

  it('dispatches multi-select toggle when a node row is keyboard-activated in multi_select mode', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local'],
          show_offline: true,
        },
      },
    }

    render(<NodeTree />)

    fireEvent.keyDown(screen.getByTestId('node-tree-item-node-offline'), { key: ' ' })

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-offline',
    })
  })

  it('toggles node expansion from keyboard in multi-select mode without dispatching row selection', async () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local'],
          show_offline: true,
        },
      },
    }

    mockFilteredEndpoints = [
      makeEndpoint({
        endpoint_id: 'endpoint-offline-talker',
        unique_id: 42,
        direction: 'talker',
        device_name: 'Offline Talker',
        node_id: 'node-offline',
      }),
    ]

    render(<NodeTree />)

    expect(screen.queryByText('Offline Talker')).toBeNull()
    const expandTrigger = screen.getByTestId('node-tree-expand-node-offline')
    expect(expandTrigger.getAttribute('aria-expanded')).toBe('false')
    expect(expandTrigger.getAttribute('aria-controls')).toBe('node-tree-endpoints-node-offline')
    expect(expandTrigger.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(expandTrigger, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText('Offline Talker')).toBeTruthy()
      expect(expandTrigger.getAttribute('aria-expanded')).toBe('true')
    })
    expect(mockDispatch).toHaveBeenCalledTimes(0)

    fireEvent.keyDown(expandTrigger, { key: ' ' })

    await waitFor(() => {
      expect(screen.queryByText('Offline Talker')).toBeNull()
      expect(expandTrigger.getAttribute('aria-expanded')).toBe('false')
    })
    expect(mockDispatch).toHaveBeenCalledTimes(0)
  })

  it('retains stable expand-control accessibility semantics under repeated rapid keyboard toggles', async () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local'],
          show_offline: true,
        },
      },
    }

    mockFilteredEndpoints = [
      makeEndpoint({
        endpoint_id: 'endpoint-offline-talker',
        unique_id: 42,
        direction: 'talker',
        device_name: 'Offline Talker',
        node_id: 'node-offline',
      }),
    ]

    render(<NodeTree />)

    const expandTrigger = screen.getByTestId('node-tree-expand-node-offline')
    expect(expandTrigger.getAttribute('aria-controls')).toBe('node-tree-endpoints-node-offline')
    expect(expandTrigger.getAttribute('aria-label')).toBe('Toggle endpoints for Remote Offline')
    expect(expandTrigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.keyDown(expandTrigger, { key: 'Enter' })
    fireEvent.keyDown(expandTrigger, { key: ' ' })
    fireEvent.keyDown(expandTrigger, { key: 'Enter' })
    fireEvent.keyDown(expandTrigger, { key: ' ' })
    fireEvent.keyDown(expandTrigger, { key: 'Enter' })

    await waitFor(() => {
      expect(expandTrigger.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByText('Offline Talker')).toBeTruthy()
    })

    fireEvent.keyDown(expandTrigger, { key: ' ' })

    await waitFor(() => {
      expect(expandTrigger.getAttribute('aria-expanded')).toBe('false')
      expect(screen.queryByText('Offline Talker')).toBeNull()
    })

    expect(mockDispatch).toHaveBeenCalledTimes(0)
  })

  it('hides degraded/offline nodes when show_offline is disabled', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'all_nodes',
          selected_node_ids: [],
          show_offline: false,
        },
      },
    }

    render(<NodeTree />)

    expect(screen.getByText('1 of 3 online')).toBeTruthy()
    expect(screen.getByText('Local Online')).toBeTruthy()
    expect(screen.queryByText('Remote Degraded')).toBeNull()
    expect(screen.queryByText('Remote Offline')).toBeNull()
  })

  it('keeps deterministic node ordering across status transitions', () => {
    mockNodes = [
      makeNode({
        node_id: 'node-local',
        name: 'Local Node',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-bravo',
        name: 'Bravo',
        type: 'map2_remote',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-alpha',
        name: 'Alpha',
        type: 'map2_remote',
        status: 'degraded',
      }),
      makeNode({
        node_id: 'node-charlie',
        name: 'Charlie',
        type: 'map2_remote',
        status: 'offline',
      }),
    ]

    const { container, rerender } = render(<NodeTree />)

    expect(getRenderedNodeOrder(container)).toEqual([
      'node-local',
      'node-bravo',
      'node-alpha',
      'node-charlie',
    ])

    mockNodes = [
      makeNode({
        node_id: 'node-local',
        name: 'Local Node',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-bravo',
        name: 'Bravo',
        type: 'map2_remote',
        status: 'offline',
      }),
      makeNode({
        node_id: 'node-alpha',
        name: 'Alpha',
        type: 'map2_remote',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-charlie',
        name: 'Charlie',
        type: 'map2_remote',
        status: 'degraded',
      }),
    ]

    rerender(<NodeTree />)

    expect(getRenderedNodeOrder(container)).toEqual([
      'node-local',
      'node-alpha',
      'node-bravo',
      'node-charlie',
    ])
  })

  it('retains single-node selection when filtered nodes shrink and expand', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-offline',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: ['node-offline'],
          show_offline: true,
        },
      },
    }

    const { rerender } = render(<NodeTree />)

    expect(screen.getByTestId('node-tree-item-node-offline').getAttribute('data-selected')).toBe('true')

    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-offline',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: ['node-offline'],
          show_offline: false,
        },
      },
    }

    rerender(<NodeTree />)

    expect(screen.queryByTestId('node-tree-item-node-offline')).toBeNull()

    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-offline',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: ['node-offline'],
          show_offline: true,
        },
      },
    }

    rerender(<NodeTree />)

    expect(screen.getByTestId('node-tree-item-node-offline').getAttribute('data-selected')).toBe('true')
  })

  it('marks multi-select node ids as selected', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local', 'node-degraded'],
          show_offline: true,
        },
      },
    }

    render(<NodeTree />)

    expect(screen.getByTestId('node-tree-item-node-local').getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('node-tree-item-node-degraded').getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId('node-tree-item-node-offline').getAttribute('data-selected')).toBe('false')
  })
})
