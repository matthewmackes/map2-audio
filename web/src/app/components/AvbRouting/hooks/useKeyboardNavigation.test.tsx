import { act, renderHook } from '@testing-library/react'
import type { Endpoint, Route, RoutingState } from '../types'
import { initialRoutingState } from '../types'
import { useKeyboardNavigation } from './useKeyboardNavigation'

const mockDispatch = jest.fn()
const mockPatchMutate = jest.fn()
const mockUnpatchMutate = jest.fn()

let mockState: RoutingState
let mockTalkers: Endpoint[]
let mockListeners: Endpoint[]

function makeEndpoint(overrides: Partial<Endpoint>): Endpoint {
  return {
    endpoint_id: 'endpoint-1',
    entity_id: '001122fffe334455',
    unique_id: 1,
    direction: 'talker',
    device_type: 'map2',
    device_name: 'Device',
    channels: 2,
    sample_rate: 48000,
    format: '24-bit PCM',
    mac_address: '00:11:22:33:44:55',
    node_address: 'http://127.0.0.1:8080',
    available: true,
    last_seen: '2026-02-17T00:00:00Z',
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

jest.mock('../context/RoutingContext', () => ({
  useRouting: () => ({ state: mockState, dispatch: mockDispatch }),
  useFilteredEndpoints: (direction?: 'talker' | 'listener') => {
    if (direction === 'talker') return mockTalkers
    if (direction === 'listener') return mockListeners
    return [...mockTalkers, ...mockListeners]
  },
}))

jest.mock('./useAvbApi', () => ({
  usePatchMutation: () => ({ mutate: mockPatchMutate }),
  useUnpatchMutation: () => ({ mutate: mockUnpatchMutate }),
}))

describe('useKeyboardNavigation', () => {
  beforeEach(() => {
    mockDispatch.mockReset()
    mockPatchMutate.mockReset()
    mockUnpatchMutate.mockReset()

    mockTalkers = [
      makeEndpoint({
        endpoint_id: 'talker-1',
        direction: 'talker',
        unique_id: 1,
        device_name: 'Talker 1',
      }),
      makeEndpoint({
        endpoint_id: 'talker-2',
        direction: 'talker',
        unique_id: 2,
        device_name: 'Talker 2',
      }),
    ]

    mockListeners = [
      makeEndpoint({
        endpoint_id: 'listener-1',
        direction: 'listener',
        unique_id: 11,
        device_name: 'Listener 1',
      }),
      makeEndpoint({
        endpoint_id: 'listener-2',
        direction: 'listener',
        unique_id: 12,
        device_name: 'Listener 2',
      }),
    ]

    mockState = {
      ...initialRoutingState,
      selection: {
        ...initialRoutingState.selection,
        focusedCell: null,
        hoveredCell: null,
      },
      safePatchMode: false,
      liveRoutes: {},
      pendingRoutes: {},
    }
  })

  it('focuses first cell on initial arrow navigation', () => {
    renderHook(() => useKeyboardNavigation({ enabled: true }))

    pressKey('ArrowRight')

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'FOCUS_CELL',
      payload: {
        talker_id: 'talker-1',
        listener_id: 'listener-1',
      },
    })
  })

  it('patches focused cell on Enter in direct mode', () => {
    renderHook(() => useKeyboardNavigation({ enabled: true }))

    pressKey('ArrowDown')
    pressKey('Enter')

    expect(mockPatchMutate).toHaveBeenCalledWith({
      talker_id: 'talker-1',
      listener_id: 'listener-1',
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'FOCUS_CELL',
      payload: {
        talker_id: 'talker-1',
        listener_id: 'listener-1',
      },
    })
  })

  it('stages patch on Enter in safe mode', () => {
    mockState = {
      ...mockState,
      safePatchMode: true,
    }

    renderHook(() => useKeyboardNavigation({ enabled: true }))

    pressKey('ArrowRight')
    pressKey('Enter')

    expect(mockPatchMutate).not.toHaveBeenCalled()
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'PATCH',
      payload: {
        talker_id: 'talker-1',
        listener_id: 'listener-1',
      },
    })
  })

  it('unpatches connected route on Enter', () => {
    mockState = {
      ...mockState,
      liveRoutes: {
        'talker-1→listener-1': makeConnectedRoute('talker-1', 'listener-1'),
      },
    }

    renderHook(() => useKeyboardNavigation({ enabled: true }))

    pressKey('ArrowLeft')
    pressKey('Enter')

    expect(mockUnpatchMutate).toHaveBeenCalledWith({
      talker_id: 'talker-1',
      listener_id: 'listener-1',
    })
  })

  it('clears focus on Escape', () => {
    renderHook(() => useKeyboardNavigation({ enabled: true }))

    pressKey('ArrowUp')
    pressKey('Escape')

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'FOCUS_CELL',
      payload: null,
    })
  })

  it('enters safe mode on Ctrl+S when not already active', () => {
    renderHook(() => useKeyboardNavigation({ enabled: true }))

    pressKey('s', { ctrlKey: true })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'ENTER_SAFE_MODE',
    })
  })
})
