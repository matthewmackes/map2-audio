import { initialRoutingState, type Endpoint, type Route } from '../types'
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
