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

  it('applies mixed staged batch connect/disconnect operations after rapid API re-sync churn', () => {
    const connectRouteId = 'talker-1→listener-1'
    const disconnectRouteId = 'talker-2→listener-2'

    const talkerA = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 1,
      node_id: 'node-a',
    })
    const listenerA = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 2,
      node_id: 'node-b',
    })
    const talkerB = makeEndpoint({
      endpoint_id: 'talker-2',
      direction: 'talker',
      unique_id: 3,
      node_id: 'node-a',
    })
    const listenerB = makeEndpoint({
      endpoint_id: 'listener-2',
      direction: 'listener',
      unique_id: 4,
      node_id: 'node-b',
    })

    let state = {
      ...cloneState(),
      endpoints: {
        [talkerA.endpoint_id]: talkerA,
        [listenerA.endpoint_id]: listenerA,
        [talkerB.endpoint_id]: talkerB,
        [listenerB.endpoint_id]: listenerB,
      },
      liveRoutes: {
        [disconnectRouteId]: makeConnectedRoute(disconnectRouteId),
      },
    }

    state = routingReducer(state, { type: 'ENTER_SAFE_MODE' })
    state = routingReducer(state, {
      type: 'BATCH_PATCH',
      payload: {
        operations: [
          { action: 'connect', talker_id: 'talker-1', listener_id: 'listener-1' },
          { action: 'disconnect', talker_id: 'talker-2', listener_id: 'listener-2' },
        ],
      },
    })

    expect(state.safePatchMode).toBe(true)
    expect(state.pendingRoutes[connectRouteId]?.state).toBe('connecting')
    expect(state.pendingRoutes[disconnectRouteId]?.state).toBe('disconnecting')
    expect(state.liveRoutes[disconnectRouteId]?.state).toBe('connected')

    state = routingReducer(state, {
      type: 'CONNECTIONS_UPDATED',
      payload: [],
    })
    expect(state.safePatchMode).toBe(true)
    expect(state.liveRoutes[disconnectRouteId]).toBeUndefined()
    expect(state.pendingRoutes[connectRouteId]?.state).toBe('connecting')
    expect(state.pendingRoutes[disconnectRouteId]?.state).toBe('disconnecting')

    state = routingReducer(state, {
      type: 'CONNECTIONS_UPDATED',
      payload: [makeConnectedRoute(disconnectRouteId)],
    })
    expect(state.safePatchMode).toBe(true)
    expect(state.liveRoutes[disconnectRouteId]?.state).toBe('connected')
    expect(state.pendingRoutes[connectRouteId]?.state).toBe('connecting')
    expect(state.pendingRoutes[disconnectRouteId]?.state).toBe('disconnecting')

    const applied = routingReducer(state, { type: 'APPLY_SAFE_CHANGES' })
    expect(applied.safePatchMode).toBe(false)
    expect(applied.pendingRoutes[connectRouteId]).toBeUndefined()
    expect(applied.pendingRoutes[disconnectRouteId]).toBeUndefined()
    expect(applied.liveRoutes[disconnectRouteId]).toBeUndefined()
    expect(applied.liveRoutes[connectRouteId]?.state).toBe('connected')
    expect(applied.liveRoutes[connectRouteId]?.talker_node_id).toBe('node-a')
    expect(applied.liveRoutes[connectRouteId]?.listener_node_id).toBe('node-b')
    expect(applied.liveRoutes[connectRouteId]?.cross_node).toBe(true)
  })

  it('restores mixed safe-batch staged intent via undo/redo after API re-sync churn', () => {
    const connectRouteId = 'talker-1→listener-1'
    const disconnectRouteId = 'talker-2→listener-2'
    const churnRouteId = 'talker-3→listener-3'

    const talkerA = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 1,
      node_id: 'node-a',
    })
    const listenerA = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 2,
      node_id: 'node-b',
    })
    const talkerB = makeEndpoint({
      endpoint_id: 'talker-2',
      direction: 'talker',
      unique_id: 3,
      node_id: 'node-a',
    })
    const listenerB = makeEndpoint({
      endpoint_id: 'listener-2',
      direction: 'listener',
      unique_id: 4,
      node_id: 'node-b',
    })

    let state = {
      ...cloneState(),
      endpoints: {
        [talkerA.endpoint_id]: talkerA,
        [listenerA.endpoint_id]: listenerA,
        [talkerB.endpoint_id]: talkerB,
        [listenerB.endpoint_id]: listenerB,
      },
      liveRoutes: {
        [disconnectRouteId]: makeConnectedRoute(disconnectRouteId),
      },
    }

    state = routingReducer(state, { type: 'ENTER_SAFE_MODE' })
    state = routingReducer(state, {
      type: 'BATCH_PATCH',
      payload: {
        operations: [
          { action: 'connect', talker_id: 'talker-1', listener_id: 'listener-1' },
          { action: 'disconnect', talker_id: 'talker-2', listener_id: 'listener-2' },
        ],
      },
    })
    state = routingReducer(state, {
      type: 'CONNECTIONS_UPDATED',
      payload: [makeConnectedRoute(churnRouteId)],
    })
    state = routingReducer(state, {
      type: 'CONNECTIONS_UPDATED',
      payload: [makeConnectedRoute(disconnectRouteId), makeConnectedRoute(churnRouteId)],
    })

    expect(state.safePatchMode).toBe(true)
    expect(state.pendingRoutes[connectRouteId]?.state).toBe('connecting')
    expect(state.pendingRoutes[disconnectRouteId]?.state).toBe('disconnecting')
    expect(state.liveRoutes[disconnectRouteId]?.state).toBe('connected')
    expect(state.liveRoutes[churnRouteId]?.state).toBe('connected')

    const applied = routingReducer(state, { type: 'APPLY_SAFE_CHANGES' })
    expect(applied.safePatchMode).toBe(false)
    expect(applied.pendingRoutes[connectRouteId]).toBeUndefined()
    expect(applied.pendingRoutes[disconnectRouteId]).toBeUndefined()
    expect(applied.liveRoutes[connectRouteId]?.state).toBe('connected')
    expect(applied.liveRoutes[disconnectRouteId]).toBeUndefined()
    expect(applied.liveRoutes[churnRouteId]?.state).toBe('connected')

    const undone = routingReducer(applied, { type: 'UNDO' })
    expect(undone.safePatchMode).toBe(true)
    expect(undone.pendingRoutes[connectRouteId]?.state).toBe('connecting')
    expect(undone.pendingRoutes[disconnectRouteId]?.state).toBe('disconnecting')
    expect(undone.liveRoutes[connectRouteId]).toBeUndefined()
    expect(undone.liveRoutes[disconnectRouteId]?.state).toBe('connected')
    expect(undone.liveRoutes[churnRouteId]?.state).toBe('connected')

    const redone = routingReducer(undone, { type: 'REDO' })
    expect(redone.safePatchMode).toBe(false)
    expect(redone.pendingRoutes[connectRouteId]).toBeUndefined()
    expect(redone.pendingRoutes[disconnectRouteId]).toBeUndefined()
    expect(redone.liveRoutes[connectRouteId]?.state).toBe('connected')
    expect(redone.liveRoutes[disconnectRouteId]).toBeUndefined()
    expect(redone.liveRoutes[churnRouteId]?.state).toBe('connected')
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

  it('uses runtime actor override when locking routes', () => {
    const runtime = globalThis as typeof globalThis & {
      __MAP2_AVB_ACTOR__?: unknown
    }
    const previousActor = runtime.__MAP2_AVB_ACTOR__
    runtime.__MAP2_AVB_ACTOR__ = 'ops@foh'

    try {
      const routeId = 'talker-1→listener-1'
      const state = {
        ...cloneState(),
        liveRoutes: {
          [routeId]: makeConnectedRoute(routeId),
        },
      }

      const next = routingReducer(state, {
        type: 'LOCK_ROUTE',
        payload: {
          route_id: routeId,
          reason: 'operator-lock',
        },
      })

      expect(next.liveRoutes[routeId]?.locked_by).toBe('ops@foh')
      expect(next.auditLog[next.auditLog.length - 1]?.actor).toBe('ops@foh')
    } finally {
      if (previousActor === undefined) {
        delete runtime.__MAP2_AVB_ACTOR__
      } else {
        runtime.__MAP2_AVB_ACTOR__ = previousActor
      }
    }
  })

  it('falls back to default actor when runtime actor override is blank', () => {
    const runtime = globalThis as typeof globalThis & {
      __MAP2_AVB_ACTOR__?: unknown
    }
    const previousActor = runtime.__MAP2_AVB_ACTOR__
    runtime.__MAP2_AVB_ACTOR__ = '   '

    try {
      const routeId = 'talker-1→listener-1'
      const state = {
        ...cloneState(),
        liveRoutes: {
          [routeId]: makeConnectedRoute(routeId),
        },
      }

      const next = routingReducer(state, {
        type: 'LOCK_ROUTE',
        payload: {
          route_id: routeId,
          reason: 'operator-lock',
        },
      })

      expect(next.liveRoutes[routeId]?.locked_by).toBe('user')
      expect(next.auditLog[next.auditLog.length - 1]?.actor).toBe('user')
    } finally {
      if (previousActor === undefined) {
        delete runtime.__MAP2_AVB_ACTOR__
      } else {
        runtime.__MAP2_AVB_ACTOR__ = previousActor
      }
    }
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

describe('routingReducer multi-select node toggles', () => {
  it('adds and removes selected node ids deterministically when toggled', () => {
    const state = {
      ...cloneState(),
      network: {
        ...cloneState().network,
        nodeSelection: {
          ...cloneState().network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: [],
        },
      },
    }

    const withNodeA = routingReducer(state, {
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-a',
    })
    expect(withNodeA.network.nodeSelection.selected_node_ids).toEqual(['node-a'])

    const withNodeB = routingReducer(withNodeA, {
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-b',
    })
    expect(withNodeB.network.nodeSelection.selected_node_ids).toEqual(['node-a', 'node-b'])

    const withoutNodeA = routingReducer(withNodeB, {
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-a',
    })
    expect(withoutNodeA.network.nodeSelection.selected_node_ids).toEqual(['node-b'])
    expect(withoutNodeA.network.nodeSelection.view_mode).toBe('multi_select')
  })

  it('deduplicates stale selected node ids and keeps lexical ordering', () => {
    const state = {
      ...cloneState(),
      network: {
        ...cloneState().network,
        nodeSelection: {
          ...cloneState().network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-b', 'node-a', 'node-b'],
        },
      },
    }

    const withNodeC = routingReducer(state, {
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-c',
    })
    expect(withNodeC.network.nodeSelection.selected_node_ids).toEqual(['node-a', 'node-b', 'node-c'])

    const withoutNodeB = routingReducer(withNodeC, {
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-b',
    })
    expect(withoutNodeB.network.nodeSelection.selected_node_ids).toEqual(['node-a', 'node-c'])
  })
})

describe('routingReducer scene diff foundations', () => {
  function makeScene(
    id: string,
    name: string,
    routes: Route[],
  ) {
    return {
      id,
      name,
      description: `${name} description`,
      routes,
      timestamp: '2026-02-17T02:00:00Z',
      tags: [],
    }
  }

  it('generates scene diff preview for selected baseline and compare scenes', () => {
    const baselineRoute = makeConnectedRoute('talker-1→listener-1')
    const compareOnlyRoute = makeConnectedRoute('talker-2→listener-2')
    const state = {
      ...cloneState(),
      endpoints: {
        'talker-1': makeEndpoint({
          endpoint_id: 'talker-1',
          direction: 'talker',
          unique_id: 1,
          device_name: 'Talker One',
        }),
        'listener-1': makeEndpoint({
          endpoint_id: 'listener-1',
          direction: 'listener',
          unique_id: 2,
          device_name: 'Listener One',
        }),
        'talker-2': makeEndpoint({
          endpoint_id: 'talker-2',
          direction: 'talker',
          unique_id: 3,
          device_name: 'Talker Two',
        }),
        'listener-2': makeEndpoint({
          endpoint_id: 'listener-2',
          direction: 'listener',
          unique_id: 4,
          device_name: 'Listener Two',
        }),
      },
      scenes: {
        'scene-a': makeScene('scene-a', 'Baseline Scene', [baselineRoute]),
        'scene-b': makeScene('scene-b', 'Compare Scene', [baselineRoute, compareOnlyRoute]),
      },
    }

    const withBaseline = routingReducer(state, {
      type: 'SET_SCENE_DIFF_BASELINE',
      payload: 'scene-a',
    })
    const withCompare = routingReducer(withBaseline, {
      type: 'SET_SCENE_DIFF_COMPARE',
      payload: 'scene-b',
    })
    const diffed = routingReducer(withCompare, {
      type: 'GENERATE_SCENE_DIFF',
    })

    expect(diffed.sceneDiff.baseline_scene_id).toBe('scene-a')
    expect(diffed.sceneDiff.compare_scene_id).toBe('scene-b')
    expect(diffed.sceneDiff.preview?.scene_id).toBe('scene-b')
    expect(diffed.sceneDiff.preview?.scene_name).toBe('Compare Scene')
    expect(diffed.sceneDiff.preview?.to_add).toEqual([
      {
        talker_id: 'talker-2',
        listener_id: 'listener-2',
        talker_name: 'Talker Two',
        listener_name: 'Listener Two',
      },
    ])
    expect(diffed.sceneDiff.preview?.to_remove).toEqual([])
    expect(diffed.sceneDiff.preview?.unchanged).toEqual(['talker-1→listener-1'])
    expect(diffed.sceneDiff.preview?.total_changes).toBe(1)
    expect(diffed.error).toBeNull()
  })

  it('clears scene diff preview when selection changes and supports full clear action', () => {
    const route = makeConnectedRoute('talker-1→listener-1')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [route]),
        'scene-b': makeScene('scene-b', 'Scene B', [route]),
      },
    }

    const diffed = routingReducer(
      routingReducer(
        routingReducer(
          routingReducer(state, {
            type: 'SET_SCENE_DIFF_BASELINE',
            payload: 'scene-a',
          }),
          {
            type: 'SET_SCENE_DIFF_COMPARE',
            payload: 'scene-b',
          }
        ),
        { type: 'GENERATE_SCENE_DIFF' }
      ),
      {
        type: 'SET_SCENE_DIFF_COMPARE',
        payload: null,
      }
    )

    expect(diffed.sceneDiff.baseline_scene_id).toBe('scene-a')
    expect(diffed.sceneDiff.compare_scene_id).toBeNull()
    expect(diffed.sceneDiff.preview).toBeNull()

    const cleared = routingReducer(diffed, { type: 'CLEAR_SCENE_DIFF' })
    expect(cleared.sceneDiff).toEqual({
      baseline_scene_id: null,
      compare_scene_id: null,
      preview: null,
      presets: [],
      active_preset_id: null,
    })
  })

  it('clears scene diff references when deleting a selected scene', () => {
    const routeA = makeConnectedRoute('talker-1→listener-1')
    const routeB = makeConnectedRoute('talker-2→listener-2')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [routeA]),
        'scene-b': makeScene('scene-b', 'Scene B', [routeA, routeB]),
      },
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Scene B',
          to_add: [{ talker_id: 'talker-2', listener_id: 'listener-2' }],
          to_remove: [],
          unchanged: ['talker-1→listener-1'],
          total_changes: 1,
        },
      },
    }

    const next = routingReducer(state, {
      type: 'DELETE_SCENE',
      payload: { scene_id: 'scene-b' },
    })

    expect(next.scenes['scene-b']).toBeUndefined()
    expect(next.sceneDiff.baseline_scene_id).toBe('scene-a')
    expect(next.sceneDiff.compare_scene_id).toBeNull()
    expect(next.sceneDiff.preview).toBeNull()
  })

  it('updates scene metadata deterministically and syncs preview scene name', () => {
    const routeA = makeConnectedRoute('talker-1→listener-1')
    const routeB = makeConnectedRoute('talker-2→listener-2')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [routeA]),
        'scene-b': makeScene('scene-b', 'Scene B', [routeA, routeB]),
      },
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Scene B',
          to_add: [{ talker_id: 'talker-2', listener_id: 'listener-2' }],
          to_remove: [],
          unchanged: ['talker-1→listener-1'],
          total_changes: 1,
        },
      },
    }

    const updated = routingReducer(state, {
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: 'scene-b',
        name: 'Scene B Renamed',
        description: 'Updated compare scene',
        tags: ['compare', 'critical'],
      },
    })

    expect(updated.scenes['scene-b'].name).toBe('Scene B Renamed')
    expect(updated.scenes['scene-b'].description).toBe('Updated compare scene')
    expect(updated.scenes['scene-b'].tags).toEqual(['compare', 'critical'])
    expect(updated.scenes['scene-b'].modified_at).toBeTruthy()
    expect(updated.scenes['scene-b'].modified_by).toBe('user')
    expect(updated.sceneDiff.preview?.scene_name).toBe('Scene B Renamed')
    expect(updated.auditLog[updated.auditLog.length - 1]?.event_type).toBe('UPDATE_SCENE')
    expect(updated.error).toBeNull()
    expect(updated.history.past.length).toBe(1)
  })

  it('saves, applies, and deletes scene diff presets deterministically', () => {
    const route = makeConnectedRoute('talker-1→listener-1')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [route]),
        'scene-b': makeScene('scene-b', 'Scene B', [route]),
        'scene-c': makeScene('scene-c', 'Scene C', [route]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
    }

    const saved = routingReducer(state, {
      type: 'SAVE_SCENE_DIFF_PRESET',
      payload: { name: 'Ops Pair' },
    })
    expect(saved.sceneDiff.presets).toHaveLength(1)
    const presetId = saved.sceneDiff.presets?.[0]?.id || ''
    expect(saved.sceneDiff.active_preset_id).toBe(presetId)
    expect(saved.sceneDiff.presets?.[0]?.baseline_scene_id).toBe('scene-a')
    expect(saved.sceneDiff.presets?.[0]?.compare_scene_id).toBe('scene-b')
    expect(saved.sceneDiff.presets?.[0]?.preset_version).toBe(1)
    expect(saved.sceneDiff.presets?.[0]?.notes).toBeUndefined()

    const withChangedCompare = routingReducer(saved, {
      type: 'SET_SCENE_DIFF_COMPARE',
      payload: 'scene-c',
    })
    const updated = routingReducer(withChangedCompare, {
      type: 'SAVE_SCENE_DIFF_PRESET',
      payload: {
        name: 'Ops Pair',
        notes: 'Revised compare pair',
        preset_version: 5,
        preferred_conflict_action: 'rename',
      },
    })
    expect(updated.sceneDiff.presets).toHaveLength(1)
    expect(updated.sceneDiff.presets?.[0]?.id).toBe(presetId)
    expect(updated.sceneDiff.presets?.[0]?.compare_scene_id).toBe('scene-c')
    expect(updated.sceneDiff.presets?.[0]?.notes).toBe('Revised compare pair')
    expect(updated.sceneDiff.presets?.[0]?.preset_version).toBe(5)
    expect(updated.sceneDiff.presets?.[0]?.preferred_conflict_action).toBe('rename')

    const applied = routingReducer(updated, {
      type: 'APPLY_SCENE_DIFF_PRESET',
      payload: { preset_id: presetId },
    })
    expect(applied.sceneDiff.baseline_scene_id).toBe('scene-a')
    expect(applied.sceneDiff.compare_scene_id).toBe('scene-c')
    expect(applied.sceneDiff.preview).toBeNull()
    expect(applied.sceneDiff.active_preset_id).toBe(presetId)

    const deleted = routingReducer(applied, {
      type: 'DELETE_SCENE_DIFF_PRESET',
      payload: { preset_id: presetId },
    })
    expect(deleted.sceneDiff.presets).toEqual([])
    expect(deleted.sceneDiff.active_preset_id).toBeNull()
  })

  it('swaps scene diff selections and clears preview context', () => {
    const state = {
      ...cloneState(),
      sceneDiff: {
        ...cloneState().sceneDiff,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Scene B',
          to_add: [],
          to_remove: [],
          unchanged: [],
          total_changes: 0,
        },
        presets: [
          {
            id: 'preset-a',
            name: 'Ops Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: 'preset-a',
      },
    }

    const swapped = routingReducer(state, { type: 'SWAP_SCENE_DIFF_SELECTION' })
    expect(swapped.sceneDiff.baseline_scene_id).toBe('scene-b')
    expect(swapped.sceneDiff.compare_scene_id).toBe('scene-a')
    expect(swapped.sceneDiff.preview).toBeNull()
    expect(swapped.sceneDiff.active_preset_id).toBeNull()
    expect(swapped.error).toBeNull()
  })

  it('drops scene diff presets that reference deleted scenes', () => {
    const route = makeConnectedRoute('talker-1→listener-1')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [route]),
        'scene-b': makeScene('scene-b', 'Scene B', [route]),
        'scene-c': makeScene('scene-c', 'Scene C', [route]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        presets: [
          {
            id: 'preset-ab',
            name: 'A/B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-ac',
            name: 'A/C',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-c',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: 'preset-ab',
      },
    }

    const next = routingReducer(state, {
      type: 'DELETE_SCENE',
      payload: { scene_id: 'scene-b' },
    })
    expect(next.sceneDiff.presets).toEqual([
      {
        id: 'preset-ac',
        name: 'A/C',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-c',
        updated_at: '2026-02-17T00:00:00Z',
      },
    ])
    expect(next.sceneDiff.active_preset_id).toBeNull()
  })

  it('remediates stale scene diff presets on apply when referenced scenes are missing', () => {
    const route = makeConnectedRoute('talker-1→listener-1')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [route]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        presets: [
          {
            id: 'preset-stale',
            name: 'Stale Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: 'preset-stale',
      },
    }

    const next = routingReducer(state, {
      type: 'APPLY_SCENE_DIFF_PRESET',
      payload: { preset_id: 'preset-stale' },
    })

    expect(next.error).toContain('references missing scenes and was removed')
    expect(next.sceneDiff.presets).toEqual([])
    expect(next.sceneDiff.active_preset_id).toBeNull()
    expect(next.auditLog[next.auditLog.length - 1]?.event_type).toBe('SCENE_DIFF')
    expect(next.auditLog[next.auditLog.length - 1]?.validation_outcome).toBe('warning')
    expect(next.history.past.length).toBe(1)
  })

  it('keeps scene-diff validity and scene-audit counters deterministic across remote-style save/update/delete churn', () => {
    const routeA = makeConnectedRoute('talker-1→listener-1')
    const routeB = makeConnectedRoute('talker-2→listener-2')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Baseline Scene', [routeA]),
        'scene-b': makeScene('scene-b', 'Compare Scene', [routeA, routeB]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Compare Scene',
          to_add: [{ talker_id: 'talker-2', listener_id: 'listener-2' }],
          to_remove: [],
          unchanged: ['talker-1→listener-1'],
          total_changes: 1,
        },
      },
      liveRoutes: {
        [routeA.id]: routeA,
      },
    }

    const withRemoteSave = routingReducer(state, {
      type: 'SAVE_SCENE',
      payload: {
        name: 'Remote Sync Scene',
        description: 'remote scene add',
        tags: ['remote'],
      },
    })

    const withRemoteUpdate = routingReducer(withRemoteSave, {
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: 'scene-b',
        name: 'Compare Scene Remote',
        description: 'remote compare update',
        tags: ['compare', 'remote'],
      },
    })

    const next = routingReducer(withRemoteUpdate, {
      type: 'DELETE_SCENE',
      payload: { scene_id: 'scene-a' },
    })

    expect(next.scenes['scene-a']).toBeUndefined()
    expect(Object.values(next.scenes).some((scene) => scene.name === 'Remote Sync Scene')).toBe(true)
    expect(next.scenes['scene-b']?.name).toBe('Compare Scene Remote')
    expect(next.sceneDiff.baseline_scene_id).toBeNull()
    expect(next.sceneDiff.compare_scene_id).toBe('scene-b')
    expect(next.sceneDiff.preview).toBeNull()

    const sceneOperationEntries = next.auditLog.filter((entry) => (
      entry.event_type === 'SAVE_SCENE' ||
      entry.event_type === 'UPDATE_SCENE' ||
      entry.event_type === 'DELETE_SCENE'
    ))
    expect(sceneOperationEntries).toHaveLength(3)
    expect(sceneOperationEntries.map((entry) => entry.event_type)).toEqual([
      'SAVE_SCENE',
      'UPDATE_SCENE',
      'DELETE_SCENE',
    ])
    expect(sceneOperationEntries.filter((entry) => entry.validation_outcome === 'warning')).toHaveLength(0)
    expect(sceneOperationEntries.filter((entry) => entry.validation_outcome === 'error')).toHaveLength(0)
    expect(sceneOperationEntries.filter((entry) => entry.event_type === 'DELETE_SCENE')).toHaveLength(1)
  })

  it('remediates active stale presets during remote compare-update plus baseline-delete sync windows', () => {
    const routeA = makeConnectedRoute('talker-1→listener-1')
    const routeB = makeConnectedRoute('talker-2→listener-2')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Baseline Scene', [routeA]),
        'scene-b': makeScene('scene-b', 'Compare Scene', [routeA, routeB]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Compare Scene',
          to_add: [{ talker_id: 'talker-2', listener_id: 'listener-2' }],
          to_remove: [],
          unchanged: ['talker-1→listener-1'],
          total_changes: 1,
        },
        presets: [
          {
            id: 'preset-live',
            name: 'Live Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-stale-active',
            name: 'Stale Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: 'preset-stale-active',
      },
      liveRoutes: {
        [routeA.id]: routeA,
      },
    }

    const withRemoteCompareUpdate = routingReducer(state, {
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: 'scene-b',
        name: 'Compare Scene Remote',
        description: 'remote compare update',
        tags: ['compare', 'remote'],
      },
    })

    expect(withRemoteCompareUpdate.sceneDiff.preview?.scene_name).toBe('Compare Scene Remote')
    expect(withRemoteCompareUpdate.sceneDiff.active_preset_id).toBe('preset-stale-active')

    const next = routingReducer(withRemoteCompareUpdate, {
      type: 'DELETE_SCENE',
      payload: { scene_id: 'scene-a' },
    })

    expect(next.scenes['scene-a']).toBeUndefined()
    expect(next.scenes['scene-b']?.name).toBe('Compare Scene Remote')
    expect(next.sceneDiff.baseline_scene_id).toBeNull()
    expect(next.sceneDiff.compare_scene_id).toBe('scene-b')
    expect(next.sceneDiff.preview).toBeNull()
    expect(next.sceneDiff.presets).toEqual([])
    expect(next.sceneDiff.active_preset_id).toBeNull()

    const sceneOperationEntries = next.auditLog.filter((entry) => (
      entry.event_type === 'UPDATE_SCENE' ||
      entry.event_type === 'DELETE_SCENE'
    ))
    expect(sceneOperationEntries).toHaveLength(2)
    expect(sceneOperationEntries.map((entry) => entry.event_type)).toEqual([
      'UPDATE_SCENE',
      'DELETE_SCENE',
    ])
    expect(sceneOperationEntries.filter((entry) => entry.validation_outcome === 'warning')).toHaveLength(0)
    expect(sceneOperationEntries.filter((entry) => entry.validation_outcome === 'error')).toHaveLength(0)
    expect(next.history.past.length).toBe(1)
  })

  it('keeps preview-cancellation audit ordering deterministic when remote stale-preset remediation occurs in the same sync window', () => {
    const routeA = makeConnectedRoute('talker-1→listener-1')
    const routeB = makeConnectedRoute('talker-2→listener-2')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Baseline Scene', [routeA]),
        'scene-b': makeScene('scene-b', 'Compare Scene', [routeA, routeB]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Compare Scene',
          to_add: [{ talker_id: 'talker-2', listener_id: 'listener-2' }],
          to_remove: [],
          unchanged: ['talker-1→listener-1'],
          total_changes: 1,
        },
        presets: [
          {
            id: 'preset-live',
            name: 'Live Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-stale-active',
            name: 'Stale Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: 'preset-stale-active',
      },
      liveRoutes: {
        [routeA.id]: routeA,
      },
    }

    const withPreviewOpened = routingReducer(state, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'opened',
        source_count: 5,
        accepted_count: 3,
        conflict_count: 1,
        skipped_count: 1,
        preferred_conflict_action: 'rename',
      },
    })
    const withRemoteCompareUpdate = routingReducer(withPreviewOpened, {
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: 'scene-b',
        name: 'Compare Scene Remote',
        description: 'remote compare update',
        tags: ['compare', 'remote'],
      },
    })
    const withRemoteBaselineDelete = routingReducer(withRemoteCompareUpdate, {
      type: 'DELETE_SCENE',
      payload: { scene_id: 'scene-a' },
    })
    const next = routingReducer(withRemoteBaselineDelete, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'cancelled',
        reason: 'popover_closed',
        source_count: 4,
        accepted_count: 2,
        conflict_count: 1,
        skipped_count: 1,
        preferred_conflict_action: 'rename',
      },
    })

    expect(next.scenes['scene-a']).toBeUndefined()
    expect(next.scenes['scene-b']?.name).toBe('Compare Scene Remote')
    expect(next.sceneDiff.baseline_scene_id).toBeNull()
    expect(next.sceneDiff.compare_scene_id).toBe('scene-b')
    expect(next.sceneDiff.preview).toBeNull()
    expect(next.sceneDiff.presets).toEqual([])
    expect(next.sceneDiff.active_preset_id).toBeNull()
    expect(next.history.past.length).toBe(1)
    expect(next.history.future.length).toBe(0)

    const sceneOperationEntries = next.auditLog.filter((entry) => (
      entry.event_type === 'UPDATE_SCENE' ||
      entry.event_type === 'DELETE_SCENE'
    ))
    expect(sceneOperationEntries).toHaveLength(2)
    expect(sceneOperationEntries.map((entry) => entry.event_type)).toEqual([
      'UPDATE_SCENE',
      'DELETE_SCENE',
    ])

    const previewLifecycleEntries = next.auditLog.filter((entry) => (
      entry.event_type === 'SCENE_DIFF' &&
      typeof entry.payload.mode === 'string' &&
      entry.payload.mode.startsWith('preset_import_preview_')
    ))
    expect(previewLifecycleEntries).toHaveLength(2)
    expect(previewLifecycleEntries.map((entry) => `${entry.payload.phase}:${entry.payload.reason || 'none'}`)).toEqual([
      'opened:none',
      'cancelled:popover_closed',
    ])
    expect(previewLifecycleEntries.map((entry) => entry.validation_outcome)).toEqual([
      'success',
      'warning',
    ])
  })

  it('keeps refreshed-to-cancelled preview lifecycle sequencing deterministic during remote inventory-reduction sync races', () => {
    const routeA = makeConnectedRoute('talker-1→listener-1')
    const routeB = makeConnectedRoute('talker-2→listener-2')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Baseline Scene', [routeA]),
        'scene-b': makeScene('scene-b', 'Compare Scene', [routeA, routeB]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Compare Scene',
          to_add: [{ talker_id: 'talker-2', listener_id: 'listener-2' }],
          to_remove: [],
          unchanged: ['talker-1→listener-1'],
          total_changes: 1,
        },
        presets: [
          {
            id: 'preset-live',
            name: 'Live Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-stale-active',
            name: 'Stale Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: 'preset-stale-active',
      },
      liveRoutes: {
        [routeA.id]: routeA,
      },
    }

    const withPreviewOpened = routingReducer(state, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'opened',
        source_count: 5,
        accepted_count: 3,
        conflict_count: 1,
        skipped_count: 1,
        preferred_conflict_action: 'rename',
      },
    })
    const withPreviewRefreshed = routingReducer(withPreviewOpened, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'refreshed',
        source_count: 4,
        accepted_count: 2,
        conflict_count: 1,
        skipped_count: 1,
        preferred_conflict_action: 'rename',
      },
    })
    const withRemoteCompareUpdate = routingReducer(withPreviewRefreshed, {
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: 'scene-b',
        name: 'Compare Scene Remote',
        description: 'remote compare update',
        tags: ['compare', 'remote'],
      },
    })
    const withRemoteBaselineDelete = routingReducer(withRemoteCompareUpdate, {
      type: 'DELETE_SCENE',
      payload: { scene_id: 'scene-a' },
    })
    const next = routingReducer(withRemoteBaselineDelete, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'cancelled',
        reason: 'transfer_draft_changed',
        source_count: 4,
        accepted_count: 2,
        conflict_count: 1,
        skipped_count: 1,
        preferred_conflict_action: 'rename',
      },
    })

    expect(next.scenes['scene-a']).toBeUndefined()
    expect(next.scenes['scene-b']?.name).toBe('Compare Scene Remote')
    expect(next.sceneDiff.baseline_scene_id).toBeNull()
    expect(next.sceneDiff.compare_scene_id).toBe('scene-b')
    expect(next.sceneDiff.preview).toBeNull()
    expect(next.sceneDiff.presets).toEqual([])
    expect(next.sceneDiff.active_preset_id).toBeNull()
    expect(next.history.past.length).toBe(1)
    expect(next.history.future.length).toBe(0)

    const sceneOperationEntries = next.auditLog.filter((entry) => (
      entry.event_type === 'UPDATE_SCENE' ||
      entry.event_type === 'DELETE_SCENE'
    ))
    expect(sceneOperationEntries).toHaveLength(2)
    expect(sceneOperationEntries.map((entry) => entry.event_type)).toEqual([
      'UPDATE_SCENE',
      'DELETE_SCENE',
    ])

    const previewLifecycleEntries = next.auditLog.filter((entry) => (
      entry.event_type === 'SCENE_DIFF' &&
      typeof entry.payload.mode === 'string' &&
      entry.payload.mode.startsWith('preset_import_preview_')
    ))
    expect(previewLifecycleEntries).toHaveLength(3)
    expect(previewLifecycleEntries.map((entry) => `${entry.payload.phase}:${entry.payload.reason || 'none'}`)).toEqual([
      'opened:none',
      'refreshed:none',
      'cancelled:transfer_draft_changed',
    ])
    expect(previewLifecycleEntries.map((entry) => entry.validation_outcome)).toEqual([
      'success',
      'success',
      'warning',
    ])
  })

  it('imports scene diff presets with deterministic upsert and skip behavior', () => {
    const route = makeConnectedRoute('talker-1→listener-1')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [route]),
        'scene-b': makeScene('scene-b', 'Scene B', [route]),
        'scene-c': makeScene('scene-c', 'Scene C', [route]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const next = routingReducer(state, {
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: {
        presets: [
          {
            name: 'Ops Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-c',
            notes: 'Updated note',
            preset_version: 4,
            preferred_conflict_action: 'rename',
          },
          {
            name: ' New Imported Pair ',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            notes: 'Imported note',
            preset_version: 2,
            preferred_conflict_action: 'skip',
          },
          {
            name: 'Missing Scene Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
          },
        ],
      },
    })

    expect(next.error).toBeNull()
    expect(next.sceneDiff.presets).toHaveLength(2)
    const updatedPreset = next.sceneDiff.presets?.find((preset) => preset.id === 'preset-existing')
    expect(updatedPreset?.compare_scene_id).toBe('scene-c')
    expect(updatedPreset?.notes).toBe('Updated note')
    expect(updatedPreset?.preset_version).toBe(4)
    expect(updatedPreset?.preferred_conflict_action).toBe('rename')
    const importedPreset = next.sceneDiff.presets?.find((preset) => preset.name === 'New Imported Pair')
    expect(importedPreset?.baseline_scene_id).toBe('scene-a')
    expect(importedPreset?.compare_scene_id).toBe('scene-b')
    expect(importedPreset?.notes).toBe('Imported note')
    expect(importedPreset?.preset_version).toBe(2)
    expect(importedPreset?.preferred_conflict_action).toBe('skip')
    expect(next.auditLog[next.auditLog.length - 1]?.payload).toMatchObject({
      mode: 'import',
      imported_count: 2,
      skipped_count: 1,
    })
  })

  it('imports mixed valid/invalid conflict-policy hints with deterministic fallback behavior', () => {
    const route = makeConnectedRoute('talker-1→listener-1')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [route]),
        'scene-b': makeScene('scene-b', 'Scene B', [route]),
        'scene-c': makeScene('scene-c', 'Scene C', [route]),
      },
      sceneDiff: {
        ...cloneState().sceneDiff,
        presets: [
          {
            id: 'preset-existing',
            name: 'Ops Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'skip',
          },
        ],
      },
    }

    const next = routingReducer(state, {
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: {
        presets: [
          {
            name: 'Ops Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-c',
            notes: 'Existing updated',
            // invalid hint should deterministically fall back to existing preset policy
            preferred_conflict_action: 'force-merge' as unknown as 'upsert',
          },
          {
            name: 'Explicit Rename',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            preferred_conflict_action: 'rename',
          },
          {
            name: 'Invalid Hint New',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            // invalid hint on new preset should not persist any explicit policy
            preferred_conflict_action: 'not-a-policy' as unknown as 'upsert',
          },
          {
            name: 'Missing Scene',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
            preferred_conflict_action: 'rename',
          },
        ],
      },
    })

    expect(next.error).toBeNull()
    expect(next.sceneDiff.presets).toHaveLength(3)

    const existingPreset = next.sceneDiff.presets?.find((preset) => preset.id === 'preset-existing')
    expect(existingPreset?.compare_scene_id).toBe('scene-c')
    expect(existingPreset?.preferred_conflict_action).toBe('skip')

    const explicitRenamePreset = next.sceneDiff.presets?.find((preset) => preset.name === 'Explicit Rename')
    expect(explicitRenamePreset?.preferred_conflict_action).toBe('rename')

    const invalidHintNewPreset = next.sceneDiff.presets?.find((preset) => preset.name === 'Invalid Hint New')
    expect(invalidHintNewPreset?.preferred_conflict_action).toBeUndefined()

    expect(next.auditLog[next.auditLog.length - 1]?.payload).toMatchObject({
      mode: 'import',
      imported_count: 3,
      skipped_count: 1,
    })
  })

  it('collapses duplicate normalized import names and resolves conflicting policy hints deterministically', () => {
    const route = makeConnectedRoute('talker-1→listener-1')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [route]),
        'scene-b': makeScene('scene-b', 'Scene B', [route]),
        'scene-c': makeScene('scene-c', 'Scene C', [route]),
      },
    }

    const next = routingReducer(state, {
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: {
        presets: [
          {
            name: '  Ops   Pair  ',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            preferred_conflict_action: 'rename',
          },
          {
            name: 'Ops Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-c',
            preferred_conflict_action: 'force-merge' as unknown as 'upsert',
          },
        ],
      },
    })

    expect(next.error).toBeNull()
    expect(next.sceneDiff.presets).toHaveLength(1)
    expect(next.sceneDiff.presets?.[0]).toMatchObject({
      name: 'Ops Pair',
      baseline_scene_id: 'scene-a',
      compare_scene_id: 'scene-c',
      preferred_conflict_action: 'rename',
    })
    expect(next.auditLog[next.auditLog.length - 1]?.payload).toMatchObject({
      mode: 'import',
      imported_count: 2,
      skipped_count: 0,
    })
  })

  it('applies last-row precedence for duplicate normalized names with conflicting valid policy hints', () => {
    const route = makeConnectedRoute('talker-1→listener-1')
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', [route]),
        'scene-b': makeScene('scene-b', 'Scene B', [route]),
        'scene-c': makeScene('scene-c', 'Scene C', [route]),
      },
    }

    const next = routingReducer(state, {
      type: 'IMPORT_SCENE_DIFF_PRESETS',
      payload: {
        presets: [
          {
            name: 'Ops Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            preferred_conflict_action: 'rename',
          },
          {
            name: '  Ops Pair  ',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-c',
            preferred_conflict_action: 'skip',
          },
        ],
      },
    })

    expect(next.error).toBeNull()
    expect(next.sceneDiff.presets).toHaveLength(1)
    expect(next.sceneDiff.presets?.[0]).toMatchObject({
      name: 'Ops Pair',
      baseline_scene_id: 'scene-a',
      compare_scene_id: 'scene-c',
      preferred_conflict_action: 'skip',
    })
    expect(next.auditLog[next.auditLog.length - 1]?.payload).toMatchObject({
      mode: 'import',
      imported_count: 2,
      skipped_count: 0,
    })
  })

  it('records scene-diff preset preview lifecycle audit events without mutating history', () => {
    const state = cloneState()

    const opened = routingReducer(state, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'opened',
        source_count: 4,
        accepted_count: 2,
        conflict_count: 1,
        skipped_count: 1,
        preferred_conflict_action: 'rename',
      },
    })
    expect(opened.history.past).toHaveLength(0)
    expect(opened.auditLog[opened.auditLog.length - 1]?.event_type).toBe('SCENE_DIFF')
    expect(opened.auditLog[opened.auditLog.length - 1]?.validation_outcome).toBe('success')
    expect(opened.auditLog[opened.auditLog.length - 1]?.payload).toMatchObject({
      mode: 'preset_import_preview_opened',
      phase: 'opened',
      source_count: 4,
      preferred_conflict_action: 'rename',
    })

    const refreshed = routingReducer(opened, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'refreshed',
        source_count: 3,
        accepted_count: 1,
        conflict_count: 1,
        skipped_count: 1,
      },
    })
    expect(refreshed.history.past).toHaveLength(0)
    expect(refreshed.auditLog[refreshed.auditLog.length - 1]?.payload).toMatchObject({
      mode: 'preset_import_preview_refreshed',
      phase: 'refreshed',
      source_count: 3,
    })

    const cancelled = routingReducer(refreshed, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'cancelled',
        reason: 'transfer_draft_changed',
        source_count: 3,
        accepted_count: 1,
        conflict_count: 1,
        skipped_count: 1,
      },
    })
    expect(cancelled.history.past).toHaveLength(0)
    expect(cancelled.auditLog[cancelled.auditLog.length - 1]?.validation_outcome).toBe('warning')
    expect(cancelled.auditLog[cancelled.auditLog.length - 1]?.payload).toMatchObject({
      mode: 'preset_import_preview_cancelled',
      phase: 'cancelled',
      reason: 'transfer_draft_changed',
    })
  })

  it('records all supported preview cancellation reasons as warning audit entries', () => {
    const state = cloneState()
    const reasons = ['transfer_draft_changed', 'popover_closed', 'exported_payload_reset'] as const

    const cancelledStates = reasons.map((reason) => routingReducer(state, {
      type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
      payload: {
        phase: 'cancelled',
        reason,
        source_count: 2,
        accepted_count: 1,
        conflict_count: 1,
        skipped_count: 0,
      },
    }))

    cancelledStates.forEach((next, index) => {
      expect(next.history.past).toHaveLength(0)
      expect(next.auditLog[next.auditLog.length - 1]?.event_type).toBe('SCENE_DIFF')
      expect(next.auditLog[next.auditLog.length - 1]?.validation_outcome).toBe('warning')
      expect(next.auditLog[next.auditLog.length - 1]?.payload).toMatchObject({
        mode: 'preset_import_preview_cancelled',
        phase: 'cancelled',
        reason: reasons[index],
      })
    })
  })

  it('returns a scene-not-found error when updating missing scene metadata', () => {
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', []),
      },
    }

    const next = routingReducer(state, {
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: 'scene-missing',
        name: 'Missing Scene',
        description: 'No-op',
        tags: ['none'],
      },
    })

    expect(next.error).toBe('Scene not found: scene-missing')
    expect(next.scenes).toEqual(state.scenes)
  })

  it('normalizes scene metadata on save and records duplicate-name warnings', () => {
    const state = {
      ...cloneState(),
      scenes: {
        'scene-existing': makeScene('scene-existing', 'Baseline Scene', []),
      },
      liveRoutes: {
        'talker-1→listener-1': makeConnectedRoute('talker-1→listener-1'),
      },
    }

    const next = routingReducer(state, {
      type: 'SAVE_SCENE',
      payload: {
        name: '  Baseline<Scene>  ',
        description: '  Front<of>House  ',
        tags: [' Main Stage ', 'main stage', 'ops|critical'],
      },
    })

    const createdScene = Object.values(next.scenes).find((scene) => scene.id !== 'scene-existing')
    expect(createdScene?.name).toBe('Baseline Scene')
    expect(createdScene?.description).toBe('Front of House')
    expect(createdScene?.tags).toEqual(['main-stage', 'ops-critical'])

    const lastAudit = next.auditLog[next.auditLog.length - 1]
    expect(lastAudit?.event_type).toBe('SAVE_SCENE')
    expect(lastAudit?.validation_outcome).toBe('warning')
    expect(next.error).toBeNull()
  })

  it('enforces scene metadata length limits during update', () => {
    const state = {
      ...cloneState(),
      scenes: {
        'scene-a': makeScene('scene-a', 'Scene A', []),
      },
    }

    const next = routingReducer(state, {
      type: 'UPDATE_SCENE_METADATA',
      payload: {
        scene_id: 'scene-a',
        name: 'x'.repeat(65),
        description: '',
        tags: [],
      },
    })

    expect(next.error).toBe('Scene name cannot exceed 64 characters.')
    expect(next.scenes['scene-a'].name).toBe('Scene A')
  })

  it('uses runtime actor override for audit and scene metadata attribution', () => {
    const runtime = globalThis as typeof globalThis & {
      __MAP2_AVB_ACTOR__?: unknown
    }
    const previousActor = runtime.__MAP2_AVB_ACTOR__
    runtime.__MAP2_AVB_ACTOR__ = 'ops@foh'

    try {
      const state = {
        ...cloneState(),
        scenes: {
          'scene-existing': makeScene('scene-existing', 'Baseline Scene', []),
        },
        liveRoutes: {
          'talker-1→listener-1': makeConnectedRoute('talker-1→listener-1'),
        },
      }

      const next = routingReducer(state, {
        type: 'SAVE_SCENE',
        payload: {
          name: 'Operator Snapshot',
          description: '',
          tags: [],
        },
      })

      const createdScene = Object.values(next.scenes).find((scene) => scene.id !== 'scene-existing')
      expect(createdScene?.created_by).toBe('ops@foh')
      expect(next.auditLog[next.auditLog.length - 1]?.actor).toBe('ops@foh')
    } finally {
      if (previousActor === undefined) {
        delete runtime.__MAP2_AVB_ACTOR__
      } else {
        runtime.__MAP2_AVB_ACTOR__ = previousActor
      }
    }
  })
})
