import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { RoutingProvider, useRoutingDispatch, useRoutingState } from '../context/RoutingContext'
import { initialRoutingState, type Endpoint, type Route, type RoutingState } from '../types'
import { useKeyboardNavigation } from './useKeyboardNavigation'

const mockPatchMutate = jest.fn()
const mockUnpatchMutate = jest.fn()

jest.mock('./useAvbApi', () => ({
  useEndpoints: () => ({ data: undefined, isLoading: false, error: null }),
  useConnections: () => ({ data: undefined, isLoading: false, error: null }),
  usePatchMutation: () => ({ mutate: mockPatchMutate }),
  useUnpatchMutation: () => ({ mutate: mockUnpatchMutate }),
}))

jest.mock('./useNodeApi', () => ({
  useNodes: () => ({ data: undefined, isLoading: false, error: null }),
  usePtpStatus: () => ({ data: undefined }),
  useLocalNodeId: () => 'local',
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

function makeConnectedRoute(talkerId: string, listenerId: string): Route {
  return {
    id: `${talkerId}→${listenerId}`,
    talker_id: talkerId,
    listener_id: listenerId,
    state: 'connected',
    established_time: '2026-02-17T00:00:00Z',
    error_message: null,
    connection_count: 1,
    srp_reservation_id: null,
    srp_admission_id: null,
    locked: false,
    valid: true,
    messages: [],
  }
}

function buildInitialState(overrides?: Partial<RoutingState>): RoutingState {
  const endpoints = {
    'talker-1': makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 1,
      device_name: 'Talker A',
    }),
    'talker-2': makeEndpoint({
      endpoint_id: 'talker-2',
      direction: 'talker',
      unique_id: 2,
      device_name: 'Talker B',
    }),
    'listener-1': makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 11,
      device_name: 'Listener A',
    }),
    'listener-2': makeEndpoint({
      endpoint_id: 'listener-2',
      direction: 'listener',
      unique_id: 12,
      device_name: 'Listener B',
    }),
  }

  return {
    ...initialRoutingState,
    endpoints,
    ...overrides,
    selection: {
      ...initialRoutingState.selection,
      ...(overrides?.selection || {}),
    },
    liveRoutes: {
      ...((overrides?.liveRoutes as Record<string, Route>) || {}),
    },
    pendingRoutes: {
      ...((overrides?.pendingRoutes as Record<string, Route>) || {}),
    },
  }
}

function pressKey(key: string, options?: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey'>) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      })
    )
  })
}

function KeyboardHarness() {
  useKeyboardNavigation({ enabled: true })
  const state = useRoutingState()
  const dispatch = useRoutingDispatch()

  const focused = state.selection.focusedCell
    ? `${state.selection.focusedCell.talker_id}→${state.selection.focusedCell.listener_id}`
    : 'none'
  const hovered = state.selection.hoveredCell
    ? `${state.selection.hoveredCell.talker_id}→${state.selection.hoveredCell.listener_id}`
    : 'none'
  const pending = Object.values(state.pendingRoutes)
    .map((route) => `${route.id}:${route.state}`)
    .join('|') || 'none'
  const live = Object.values(state.liveRoutes)
    .map((route) => `${route.id}:${route.state}`)
    .join('|') || 'none'

  return (
    <div>
      <span data-testid="focused">{focused}</span>
      <span data-testid="hovered">{hovered}</span>
      <span data-testid="safe-mode">{state.safePatchMode ? 'on' : 'off'}</span>
      <span data-testid="pending-routes">{pending}</span>
      <span data-testid="live-routes">{live}</span>
      <button data-testid="apply-safe" onClick={() => dispatch({ type: 'APPLY_SAFE_CHANGES' })} type="button">
        apply
      </button>
      <button data-testid="discard-safe" onClick={() => dispatch({ type: 'DISCARD_SAFE_CHANGES' })} type="button">
        discard
      </button>
      <button data-testid="undo-action" onClick={() => dispatch({ type: 'UNDO' })} type="button">
        undo
      </button>
      <button data-testid="redo-action" onClick={() => dispatch({ type: 'REDO' })} type="button">
        redo
      </button>
    </div>
  )
}

describe('useKeyboardNavigation integration (provider + reducer)', () => {
  beforeEach(() => {
    mockPatchMutate.mockReset()
    mockUnpatchMutate.mockReset()
  })

  it('moves keyboard focus across cells while preserving hover state', () => {
    const initialState = buildInitialState({
      selection: {
        ...initialRoutingState.selection,
        hoveredCell: {
          talker_id: 'talker-2',
          listener_id: 'listener-2',
        },
      },
    })

    render(
      <RoutingProvider initialState={initialState}>
        <KeyboardHarness />
      </RoutingProvider>
    )

    expect(screen.getByTestId('focused').textContent).toBe('none')
    expect(screen.getByTestId('hovered').textContent).toBe('talker-2→listener-2')

    pressKey('ArrowRight')
    expect(screen.getByTestId('focused').textContent).toBe('talker-1→listener-1')

    pressKey('ArrowDown')
    expect(screen.getByTestId('focused').textContent).toBe('talker-1→listener-2')
    expect(screen.getByTestId('hovered').textContent).toBe('talker-2→listener-2')

    pressKey('Escape')
    expect(screen.getByTestId('focused').textContent).toBe('none')
  })

  it('toggles safe mode and stages pending connect via reducer', () => {
    const initialState = buildInitialState()

    render(
      <RoutingProvider initialState={initialState}>
        <KeyboardHarness />
      </RoutingProvider>
    )

    expect(screen.getByTestId('safe-mode').textContent).toBe('off')
    expect(screen.getByTestId('pending-routes').textContent).toBe('none')

    pressKey('s', { ctrlKey: true })
    expect(screen.getByTestId('safe-mode').textContent).toBe('on')

    pressKey('ArrowLeft')
    pressKey('Enter')

    expect(screen.getByTestId('pending-routes').textContent).toContain('talker-1→listener-1:connecting')
    expect(mockPatchMutate).not.toHaveBeenCalled()
  })

  it('stages pending disconnect for an existing connected route in safe mode', () => {
    const initialState = buildInitialState({
      safePatchMode: true,
      liveRoutes: {
        'talker-1→listener-1': makeConnectedRoute('talker-1', 'listener-1'),
      },
    })

    render(
      <RoutingProvider initialState={initialState}>
        <KeyboardHarness />
      </RoutingProvider>
    )

    pressKey('ArrowUp')
    pressKey('Enter')

    expect(screen.getByTestId('pending-routes').textContent).toContain('talker-1→listener-1:disconnecting')
    expect(mockUnpatchMutate).not.toHaveBeenCalled()
  })

  it('applies keyboard-staged connect and restores via undo/redo', () => {
    const initialState = buildInitialState()

    render(
      <RoutingProvider initialState={initialState}>
        <KeyboardHarness />
      </RoutingProvider>
    )

    pressKey('s', { ctrlKey: true })
    pressKey('ArrowRight')
    pressKey('Enter')

    expect(screen.getByTestId('safe-mode').textContent).toBe('on')
    expect(screen.getByTestId('pending-routes').textContent).toContain('talker-1→listener-1:connecting')
    expect(screen.getByTestId('live-routes').textContent).toBe('none')

    fireEvent.click(screen.getByTestId('apply-safe'))
    expect(screen.getByTestId('safe-mode').textContent).toBe('off')
    expect(screen.getByTestId('pending-routes').textContent).toBe('none')
    expect(screen.getByTestId('live-routes').textContent).toContain('talker-1→listener-1:connected')

    fireEvent.click(screen.getByTestId('undo-action'))
    expect(screen.getByTestId('safe-mode').textContent).toBe('on')
    expect(screen.getByTestId('pending-routes').textContent).toContain('talker-1→listener-1:connecting')
    expect(screen.getByTestId('live-routes').textContent).toBe('none')

    fireEvent.click(screen.getByTestId('redo-action'))
    expect(screen.getByTestId('safe-mode').textContent).toBe('off')
    expect(screen.getByTestId('pending-routes').textContent).toBe('none')
    expect(screen.getByTestId('live-routes').textContent).toContain('talker-1→listener-1:connected')
  })

  it('discards keyboard-staged connect and restores via undo/redo', () => {
    const initialState = buildInitialState()

    render(
      <RoutingProvider initialState={initialState}>
        <KeyboardHarness />
      </RoutingProvider>
    )

    pressKey('s', { ctrlKey: true })
    pressKey('ArrowDown')
    pressKey('Enter')

    expect(screen.getByTestId('safe-mode').textContent).toBe('on')
    expect(screen.getByTestId('pending-routes').textContent).toContain('talker-1→listener-1:connecting')

    fireEvent.click(screen.getByTestId('discard-safe'))
    expect(screen.getByTestId('safe-mode').textContent).toBe('off')
    expect(screen.getByTestId('pending-routes').textContent).toBe('none')
    expect(screen.getByTestId('live-routes').textContent).toBe('none')

    fireEvent.click(screen.getByTestId('undo-action'))
    expect(screen.getByTestId('safe-mode').textContent).toBe('on')
    expect(screen.getByTestId('pending-routes').textContent).toContain('talker-1→listener-1:connecting')

    fireEvent.click(screen.getByTestId('redo-action'))
    expect(screen.getByTestId('safe-mode').textContent).toBe('off')
    expect(screen.getByTestId('pending-routes').textContent).toBe('none')
  })
})
