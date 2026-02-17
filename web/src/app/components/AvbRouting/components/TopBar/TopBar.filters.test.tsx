import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { TopBar } from './TopBar'
import { initialRoutingState } from '../../types'

let mockState: any
let mockCanUndo = false
let mockCanRedo = false

const mockDispatch = jest.fn()
const mockMutate = jest.fn()
const mockNotify = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
}

jest.mock('../../context/RoutingContext', () => ({
  useRouting: () => ({ state: mockState, dispatch: mockDispatch }),
  useCanUndo: () => mockCanUndo,
  useCanRedo: () => mockCanRedo,
}))

jest.mock('../../hooks/useAvbApi', () => ({
  useBatchPatchMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}))

jest.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => mockNotify,
}))

jest.mock('./NodeSelector', () => ({
  NodeSelector: () => <div data-testid="mock-node-selector">node-selector</div>,
}))

jest.mock('../NetworkTopology/NetworkTopologyModal', () => ({
  NetworkTopologyModal: () => null,
}))

jest.mock('./SceneDiffPreview', () => ({
  SceneDiffPreview: () => null,
}))

describe('TopBar filter and search wiring', () => {
  beforeEach(() => {
    mockDispatch.mockReset()
    mockMutate.mockReset()
    mockNotify.success.mockReset()
    mockNotify.error.mockReset()
    mockNotify.warning.mockReset()
    mockNotify.info.mockReset()

    mockCanUndo = false
    mockCanRedo = false
    mockState = {
      ...initialRoutingState,
      filters: {
        ...initialRoutingState.filters,
      },
      search: '',
      safePatchMode: false,
      endpoints: {
        'endpoint-a': {
          sample_rate: 48000,
          channels: 2,
          group: 'Stage',
        },
        'endpoint-b': {
          sample_rate: 96000,
          channels: 8,
          group: 'FOH',
        },
      },
      liveRoutes: {},
      pendingRoutes: {},
    }
  })

  it('dispatches SET_SEARCH when the search input changes', () => {
    render(<TopBar />)

    fireEvent.change(screen.getByTestId('topbar-search-input'), {
      target: { value: 'listener-1' },
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_SEARCH',
      payload: 'listener-1',
    })
  })

  it('dispatches SET_FILTERS for available-only and show-locked toggles', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-filters-button'))
    fireEvent.click(screen.getByTestId('topbar-filter-available-only'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { availableOnly: true },
    })

    fireEvent.click(screen.getByTestId('topbar-filter-show-locked'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { showLocked: false },
    })
  })

  it('dispatches SET_FILTERS when device-type filters are toggled', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-filters-button'))
    fireEvent.click(screen.getByTestId('topbar-filter-device-unknown'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { deviceTypes: ['map2', 'avdecc', 'unknown'] },
    })

    fireEvent.click(screen.getByTestId('topbar-filter-device-map2'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { deviceTypes: ['avdecc'] },
    })
  })

  it('dispatches SET_FILTERS for sample-rate, channel, and group toggles', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-filters-button'))
    fireEvent.click(screen.getByTestId('topbar-filter-sample-96000'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { sampleRates: [96000] },
    })

    fireEvent.click(screen.getByTestId('topbar-filter-channels-8'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { channelCounts: [8] },
    })

    fireEvent.click(screen.getByTestId('topbar-filter-group-foh'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { groups: ['FOH'] },
    })
  })

  it('clears all filter constraints in one action', () => {
    mockState = {
      ...mockState,
      filters: {
        deviceTypes: ['map2'],
        sampleRates: [96000],
        channelCounts: [8],
        availableOnly: true,
        showLocked: false,
        groups: ['FOH'],
      },
    }

    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-filters-button'))
    fireEvent.click(screen.getByTestId('topbar-filters-clear-all'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: {
        deviceTypes: [],
        sampleRates: [],
        channelCounts: [],
        availableOnly: false,
        showLocked: true,
        groups: [],
      },
    })
  })

  it('resets filters to defaults from initial routing state', () => {
    mockState = {
      ...mockState,
      filters: {
        deviceTypes: ['map2'],
        sampleRates: [48000],
        channelCounts: [2],
        availableOnly: true,
        showLocked: false,
        groups: ['Stage'],
      },
    }

    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-filters-button'))
    fireEvent.click(screen.getByTestId('topbar-filters-reset'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { ...initialRoutingState.filters },
    })
  })

  it('shows active filter summary count when filters differ from defaults', () => {
    mockState = {
      ...mockState,
      filters: {
        ...mockState.filters,
        availableOnly: true,
        showLocked: false,
      },
    }

    render(<TopBar />)

    expect(screen.getByTestId('topbar-filter-summary').textContent).toContain('2 filters')
  })
})
