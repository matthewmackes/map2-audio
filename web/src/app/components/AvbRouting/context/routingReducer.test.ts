import {
  initialRoutingState,
  type AvbNode,
  type CrossNodeRoute,
  type Endpoint,
  type Route,
} from '../types'
import { routingReducer } from './routingReducer'

function cloneState() {
  return {
    ...initialRoutingState,
    selection: {
      ...initialRoutingState.selection,
    },
  }
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

function makeConnectedRoute(routeId: string): Route {
  const [talker_id, listener_id] = routeId.split('→')
  return {
    id: routeId,
    talker_id,
    listener_id,
    state: 'connected',
    established_time: '2026-02-17T00:00:00Z',
    error_message: null,
    connection_count: 1,
    srp_reservation_id: null,
    srp_admission_id: null,
    locked: false,
    valid: true,
    messages: [],
    cross_node: false,
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

function makeCrossNodeRoute(overrides: Partial<CrossNodeRoute>): CrossNodeRoute {
  return {
    route_id: 'talker-1→listener-1',
    source_node_id: 'node-a',
    dest_node_id: 'node-b',
    talker_id: 'talker-1',
    listener_id: 'listener-1',
    status: 'active',
    network_path: ['node-a', 'node-b'],
    latency_ms: 1.2,
    bandwidth_mbps: 12.5,
    ...overrides,
  }
}

function stateWithEndpoints() {
  const talker = makeEndpoint({
    endpoint_id: 'talker-1',
    direction: 'talker',
    unique_id: 1,
    device_name: 'Talker A',
  })
  const listener = makeEndpoint({
    endpoint_id: 'listener-1',
    direction: 'listener',
    unique_id: 2,
    device_name: 'Listener A',
  })

  return {
    ...cloneState(),
    endpoints: {
      [talker.endpoint_id]: talker,
      [listener.endpoint_id]: listener,
    },
  }
}

describe('routingReducer selection focus/hover behavior', () => {
  it('sets keyboard focus without changing hover', () => {
    const state = {
      ...cloneState(),
      selection: {
        ...cloneState().selection,
        hoveredCell: { talker_id: 'talker-hover', listener_id: 'listener-hover' },
      },
    }

    const next = routingReducer(state, {
      type: 'FOCUS_CELL',
      payload: { talker_id: 'talker-focus', listener_id: 'listener-focus' },
    })

    expect(next.selection.focusedCell).toEqual({
      talker_id: 'talker-focus',
      listener_id: 'listener-focus',
    })
    expect(next.selection.hoveredCell).toEqual({
      talker_id: 'talker-hover',
      listener_id: 'listener-hover',
    })
  })

  it('sets hover without changing keyboard focus', () => {
    const state = {
      ...cloneState(),
      selection: {
        ...cloneState().selection,
        focusedCell: { talker_id: 'talker-focus', listener_id: 'listener-focus' },
      },
    }

    const next = routingReducer(state, {
      type: 'HOVER_CELL',
      payload: { talker_id: 'talker-hover', listener_id: 'listener-hover' },
    })

    expect(next.selection.hoveredCell).toEqual({
      talker_id: 'talker-hover',
      listener_id: 'listener-hover',
    })
    expect(next.selection.focusedCell).toEqual({
      talker_id: 'talker-focus',
      listener_id: 'listener-focus',
    })
  })

  it('clear selection resets both hover and focus', () => {
    const state = {
      ...cloneState(),
      selection: {
        ...cloneState().selection,
        hoveredCell: { talker_id: 'talker-hover', listener_id: 'listener-hover' },
        focusedCell: { talker_id: 'talker-focus', listener_id: 'listener-focus' },
      },
    }

    const next = routingReducer(state, {
      type: 'CLEAR_SELECTION',
    })

    expect(next.selection.hoveredCell).toBeNull()
    expect(next.selection.focusedCell).toBeNull()
    expect(next.selection.selectedEndpoints).toEqual([])
    expect(next.selection.selectedRoutes).toEqual([])
  })
})

describe('routingReducer safe mode workflow history', () => {
  const routeId = 'talker-1→listener-1'

  it('applies staged safe-mode connect and supports undo/redo', () => {
    let state = stateWithEndpoints()

    state = routingReducer(state, { type: 'ENTER_SAFE_MODE' })
    state = routingReducer(state, {
      type: 'PATCH',
      payload: { talker_id: 'talker-1', listener_id: 'listener-1' },
    })

    expect(state.safePatchMode).toBe(true)
    expect(state.pendingRoutes[routeId]?.state).toBe('connecting')
    expect(state.liveRoutes[routeId]).toBeUndefined()

    const applied = routingReducer(state, { type: 'APPLY_SAFE_CHANGES' })
    expect(applied.safePatchMode).toBe(false)
    expect(applied.pendingRoutes[routeId]).toBeUndefined()
    expect(applied.liveRoutes[routeId]?.state).toBe('connected')

    const undone = routingReducer(applied, { type: 'UNDO' })
    expect(undone.safePatchMode).toBe(true)
    expect(undone.pendingRoutes[routeId]?.state).toBe('connecting')
    expect(undone.liveRoutes[routeId]).toBeUndefined()

    const redone = routingReducer(undone, { type: 'REDO' })
    expect(redone.safePatchMode).toBe(false)
    expect(redone.pendingRoutes[routeId]).toBeUndefined()
    expect(redone.liveRoutes[routeId]?.state).toBe('connected')
  })

  it('discards staged safe changes and supports undo/redo', () => {
    let state = stateWithEndpoints()

    state = routingReducer(state, { type: 'ENTER_SAFE_MODE' })
    state = routingReducer(state, {
      type: 'PATCH',
      payload: { talker_id: 'talker-1', listener_id: 'listener-1' },
    })

    const discarded = routingReducer(state, { type: 'DISCARD_SAFE_CHANGES' })
    expect(discarded.safePatchMode).toBe(false)
    expect(discarded.pendingRoutes[routeId]).toBeUndefined()

    const undone = routingReducer(discarded, { type: 'UNDO' })
    expect(undone.safePatchMode).toBe(true)
    expect(undone.pendingRoutes[routeId]?.state).toBe('connecting')

    const redone = routingReducer(undone, { type: 'REDO' })
    expect(redone.safePatchMode).toBe(false)
    expect(redone.pendingRoutes[routeId]).toBeUndefined()
  })

  it('applies staged safe-mode disconnect and restores via undo', () => {
    let state = stateWithEndpoints()
    state = {
      ...state,
      liveRoutes: {
        [routeId]: makeConnectedRoute(routeId),
      },
    }

    state = routingReducer(state, { type: 'ENTER_SAFE_MODE' })
    state = routingReducer(state, {
      type: 'UNPATCH',
      payload: { route_id: routeId },
    })

    expect(state.safePatchMode).toBe(true)
    expect(state.pendingRoutes[routeId]?.state).toBe('disconnecting')
    expect(state.liveRoutes[routeId]?.state).toBe('connected')

    const applied = routingReducer(state, { type: 'APPLY_SAFE_CHANGES' })
    expect(applied.safePatchMode).toBe(false)
    expect(applied.liveRoutes[routeId]).toBeUndefined()

    const undone = routingReducer(applied, { type: 'UNDO' })
    expect(undone.safePatchMode).toBe(true)
    expect(undone.pendingRoutes[routeId]?.state).toBe('disconnecting')
    expect(undone.liveRoutes[routeId]?.state).toBe('connected')
  })
})

describe('routingReducer multi-node route updates', () => {
  it('derives cross-node metadata when patching endpoints on different nodes', () => {
    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 1,
      node_id: 'node-a',
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 2,
      node_id: 'node-b',
    })

    const state = {
      ...cloneState(),
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
      },
    }

    const next = routingReducer(state, {
      type: 'PATCH',
      payload: { talker_id: 'talker-1', listener_id: 'listener-1' },
    })

    const route = next.liveRoutes['talker-1→listener-1']
    expect(route?.cross_node).toBe(true)
    expect(route?.talker_node_id).toBe('node-a')
    expect(route?.listener_node_id).toBe('node-b')
  })

  it('preserves lock metadata while accepting refreshed cross-node route fields', () => {
    const routeId = 'talker-1→listener-1'
    const state = {
      ...cloneState(),
      liveRoutes: {
        [routeId]: {
          ...makeConnectedRoute(routeId),
          locked: true,
          lock_reason: 'operator-lock',
          locked_by: 'ops-user',
          locked_at: '2026-02-17T01:00:00Z',
          valid: false,
          messages: ['stale validation'],
        },
      },
    }

    const refreshed: Route = {
      ...makeConnectedRoute(routeId),
      talker_node_id: 'node-a',
      listener_node_id: 'node-b',
      cross_node: true,
      latency_ms: 2.4,
      bandwidth_mbps: 9.8,
    }

    const next = routingReducer(state, {
      type: 'CONNECTIONS_UPDATED',
      payload: [refreshed],
    })

    expect(next.liveRoutes[routeId].cross_node).toBe(true)
    expect(next.liveRoutes[routeId].talker_node_id).toBe('node-a')
    expect(next.liveRoutes[routeId].listener_node_id).toBe('node-b')
    expect(next.liveRoutes[routeId].locked).toBe(true)
    expect(next.liveRoutes[routeId].lock_reason).toBe('operator-lock')
    expect(next.liveRoutes[routeId].locked_by).toBe('ops-user')
    expect(next.liveRoutes[routeId].valid).toBe(false)
    expect(next.liveRoutes[routeId].messages).toEqual(['stale validation'])
  })

  it('stores node map and cross-node route payload updates', () => {
    const nodeA = makeNode({
      node_id: 'node-a',
      name: 'Node A',
      type: 'map2_local',
    })
    const nodeB = makeNode({
      node_id: 'node-b',
      name: 'Node B',
      type: 'map2_remote',
    })

    const withNodes = routingReducer(cloneState(), {
      type: 'NODES_UPDATED',
      payload: [nodeA, nodeB],
    })
    expect(withNodes.network.nodes['node-a']).toEqual(nodeA)
    expect(withNodes.network.nodes['node-b']).toEqual(nodeB)

    const crossNodeRoute = makeCrossNodeRoute({
      route_id: 'talker-1→listener-1',
      source_node_id: 'node-a',
      dest_node_id: 'node-b',
    })

    const withCrossRoute = routingReducer(withNodes, {
      type: 'CROSS_NODE_ROUTE_UPDATED',
      payload: crossNodeRoute,
    })
    expect(withCrossRoute.network.crossNodeRoutes[crossNodeRoute.route_id]).toEqual(crossNodeRoute)
  })

  it('replaces stale cross-node routes on CROSS_NODE_ROUTES_SYNCED', () => {
    const staleRoute = makeCrossNodeRoute({
      route_id: 'stale-route',
      source_node_id: 'node-old-a',
      dest_node_id: 'node-old-b',
    })
    const freshRoute = makeCrossNodeRoute({
      route_id: 'fresh-route',
      source_node_id: 'node-a',
      dest_node_id: 'node-b',
    })

    const stateWithStale = {
      ...cloneState(),
      network: {
        ...cloneState().network,
        crossNodeRoutes: {
          [staleRoute.route_id]: staleRoute,
        },
      },
    }

    const next = routingReducer(stateWithStale, {
      type: 'CROSS_NODE_ROUTES_SYNCED',
      payload: [freshRoute],
    })

    expect(next.network.crossNodeRoutes[staleRoute.route_id]).toBeUndefined()
    expect(next.network.crossNodeRoutes[freshRoute.route_id]).toEqual(freshRoute)
  })
})

describe('routingReducer node filter selection retention', () => {
  it('retains current node, view mode, and multi-select set when toggling offline visibility', () => {
    const state = {
      ...cloneState(),
      network: {
        ...cloneState().network,
        nodeSelection: {
          ...cloneState().network.nodeSelection,
          current_node_id: 'node-offline',
          view_mode: 'single_node' as const,
          selected_node_ids: ['node-offline', 'node-online'],
          show_offline: true,
        },
      },
    }

    const hidden = routingReducer(state, {
      type: 'SET_SHOW_OFFLINE_NODES',
      payload: false,
    })

    expect(hidden.network.nodeSelection.current_node_id).toBe('node-offline')
    expect(hidden.network.nodeSelection.view_mode).toBe('single_node')
    expect(hidden.network.nodeSelection.selected_node_ids).toEqual(['node-offline', 'node-online'])
    expect(hidden.network.nodeSelection.show_offline).toBe(false)

    const restored = routingReducer(hidden, {
      type: 'SET_SHOW_OFFLINE_NODES',
      payload: true,
    })

    expect(restored.network.nodeSelection.current_node_id).toBe('node-offline')
    expect(restored.network.nodeSelection.view_mode).toBe('single_node')
    expect(restored.network.nodeSelection.selected_node_ids).toEqual(['node-offline', 'node-online'])
    expect(restored.network.nodeSelection.show_offline).toBe(true)
  })
})
