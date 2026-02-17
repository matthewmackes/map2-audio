import React from 'react'
import { render, screen } from '@testing-library/react'
import { InspectorPanel } from './InspectorPanel'
import { initialRoutingState, type Endpoint, type Route } from '../../types'

let mockState: any

jest.mock('../../context/RoutingContext', () => ({
  useRoutingState: () => mockState,
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

describe('InspectorPanel node-context filtering', () => {
  beforeEach(() => {
    mockState = makeBaseState()
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

    const { rerender } = render(<InspectorPanel />)

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

    const { rerender } = render(<InspectorPanel />)

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

    const { rerender } = render(<InspectorPanel />)

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

    const { rerender } = render(<InspectorPanel />)

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
})
