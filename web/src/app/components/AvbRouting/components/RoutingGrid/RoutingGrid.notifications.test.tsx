import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { RoutingGrid } from './RoutingGrid'
import type { Endpoint, Route } from '../../types'

const mockDispatch = jest.fn()
const mockPatchMutate = jest.fn()
const mockUnpatchMutate = jest.fn()
const mockBatchMutateAsync = jest.fn()

const mockNotify = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  default: jest.fn(),
  close: jest.fn(),
  closeAll: jest.fn(),
}

let mockState: any
let mockTalkers: Endpoint[] = []
let mockListeners: Endpoint[] = []

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

function makeConnectedRoute(locked = false): Route {
  return {
    id: 'talker-1→listener-1',
    talker_id: 'talker-1',
    listener_id: 'listener-1',
    state: 'connected',
    established_time: '2026-02-17T00:00:00Z',
    error_message: null,
    connection_count: 1,
    srp_reservation_id: null,
    srp_admission_id: null,
    locked,
    valid: true,
    messages: [],
    cross_node: false,
  }
}

jest.mock('react-virtualized-auto-sizer', () => ({
  __esModule: true,
  default: ({ children }: any) => children({ height: 300, width: 300 }),
}))

jest.mock('react-window', () => ({
  FixedSizeGrid: ({ children, columnCount, rowCount }: any) => (
    <div data-testid="grid">
      {Array.from({ length: rowCount }).map((_, rowIndex) =>
        Array.from({ length: columnCount }).map((__, columnIndex) => (
          <div key={`${rowIndex}-${columnIndex}`}>
            {children({ columnIndex, rowIndex, style: {} })}
          </div>
        ))
      )}
    </div>
  ),
}))

jest.mock('../../context/RoutingContext', () => ({
  useRouting: () => ({ state: mockState, dispatch: mockDispatch }),
  useFilteredEndpoints: (direction?: 'talker' | 'listener') => {
    if (direction === 'talker') return mockTalkers
    if (direction === 'listener') return mockListeners
    return [...mockTalkers, ...mockListeners]
  },
}))

jest.mock('../../hooks/useAvbApi', () => ({
  usePatchMutation: () => ({ mutate: mockPatchMutate }),
  useUnpatchMutation: () => ({ mutate: mockUnpatchMutate, mutateAsync: jest.fn() }),
  useBatchPatchMutation: () => ({ mutateAsync: mockBatchMutateAsync }),
}))

jest.mock('../../hooks/useKeyboardNavigation', () => ({
  useKeyboardNavigation: jest.fn(),
  useFocusedCell: () => null,
}))

jest.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => mockNotify,
}))

jest.mock('../../hooks/useDragSelection', () => ({
  useDragSelection: () => ({
    isDragging: false,
    selectionRect: null,
    selectedCells: [],
    isMultiSelect: false,
    handleMouseDown: jest.fn(),
    handleMouseMove: jest.fn(),
    handleMouseUp: jest.fn(),
    clearSelection: jest.fn(),
    isCellSelected: () => false,
    getSelectedCells: () => [],
  }),
}))

jest.mock('./MatrixCell', () => ({
  MatrixCell: ({ talker, listener, onClick }: any) => (
    <button
      data-testid={`cell-${talker.endpoint_id}-${listener.endpoint_id}`}
      onClick={onClick}
      type="button"
    >
      cell
    </button>
  ),
}))

jest.mock('./StickyHeaders', () => ({ StickyHeaders: () => null }))
jest.mock('./ConnectionHighlight', () => ({ ConnectionHighlight: () => null }))
jest.mock('./CrosshairOverlay', () => ({ CrosshairOverlay: () => null }))
jest.mock('./SelectionOverlay', () => ({ SelectionOverlay: () => null }))
jest.mock('./BatchActionsBar', () => ({ BatchActionsBar: () => null }))

describe('RoutingGrid notification contracts', () => {
  beforeEach(() => {
    mockDispatch.mockReset()
    mockPatchMutate.mockReset()
    mockUnpatchMutate.mockReset()
    mockBatchMutateAsync.mockReset()
    Object.values(mockNotify).forEach((fn) => typeof fn === 'function' && fn.mockReset())

    mockTalkers = [
      makeEndpoint({
        endpoint_id: 'talker-1',
        direction: 'talker',
        unique_id: 1,
        device_name: 'Talker A',
      }),
    ]

    mockListeners = [
      makeEndpoint({
        endpoint_id: 'listener-1',
        direction: 'listener',
        unique_id: 2,
        device_name: 'Listener A',
      }),
    ]

    mockState = {
      network: {
        nodes: {},
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'local',
          view_mode: 'all_nodes',
          selected_node_ids: [],
          show_offline: false,
        },
        topology: null,
        syncStatus: null,
        crossNodeRoutes: {},
      },
      endpoints: {
        'talker-1': mockTalkers[0],
        'listener-1': mockListeners[0],
      },
      liveRoutes: {},
      pendingRoutes: {},
      selection: {
        selectedEndpoints: [],
        selectedRoutes: [],
        hoveredCell: null,
        focusedCell: null,
      },
      safePatchMode: false,
    }
  })

  it('shows connect success notification on PATCH success', () => {
    mockPatchMutate.mockImplementation((_payload: any, options: any) => {
      options?.onSuccess?.()
    })

    render(<RoutingGrid />)
    fireEvent.click(screen.getByTestId('cell-talker-1-listener-1'))

    expect(mockPatchMutate).toHaveBeenCalledWith(
      { talker_id: 'talker-1', listener_id: 'listener-1' },
      expect.any(Object)
    )
    expect(mockNotify.success).toHaveBeenCalledWith('Connected: Talker A -> Listener A')
  })

  it('shows connect failure notification and dispatches SET_ERROR', () => {
    mockPatchMutate.mockImplementation((_payload: any, options: any) => {
      options?.onError?.(new Error('Admission denied'))
    })

    render(<RoutingGrid />)
    fireEvent.click(screen.getByTestId('cell-talker-1-listener-1'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_ERROR',
      payload: 'Admission denied',
    })
    expect(mockNotify.error).toHaveBeenCalledWith('Connect failed: Admission denied')
  })

  it('shows disconnect success notification on UNPATCH success', () => {
    mockState.liveRoutes = {
      'talker-1→listener-1': makeConnectedRoute(false),
    }
    mockUnpatchMutate.mockImplementation((_payload: any, options: any) => {
      options?.onSuccess?.()
    })

    render(<RoutingGrid />)
    fireEvent.click(screen.getByTestId('cell-talker-1-listener-1'))

    expect(mockUnpatchMutate).toHaveBeenCalledWith(
      { talker_id: 'talker-1', listener_id: 'listener-1' },
      expect.any(Object)
    )
    expect(mockNotify.success).toHaveBeenCalledWith('Disconnected: Talker A -> Listener A')
  })

  it('shows lock warning and blocks UNPATCH for locked routes', () => {
    mockState.liveRoutes = {
      'talker-1→listener-1': makeConnectedRoute(true),
    }

    render(<RoutingGrid />)
    fireEvent.click(screen.getByTestId('cell-talker-1-listener-1'))

    expect(mockUnpatchMutate).not.toHaveBeenCalled()
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_ERROR',
      payload: 'Cannot disconnect locked route: talker-1→listener-1',
    })
    expect(mockNotify.warning).toHaveBeenCalledWith('Route is locked: Talker A -> Listener A')
  })
})
