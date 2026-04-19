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
  useAvbDevices: () => ({
    data: {
      available: true,
      count: 0,
      device_names: [],
      discovered_count: 0,
      discovered_devices: [],
    },
  }),
  useAvbStreams: () => ({
    data: {
      available: true,
      streams: [],
    },
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
          host: 'stage.local',
          direction: 'talker',
          available: true,
          node_id: 'local',
        },
        'endpoint-b': {
          sample_rate: 96000,
          channels: 8,
          group: 'FOH',
          host: 'foh.local',
          direction: 'listener',
          available: true,
          node_id: 'local',
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

  it('dispatches SET_FILTERS for availability, issue, and lock toggles', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-filters-button'))
    fireEvent.click(screen.getByTestId('topbar-filter-available-only'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { availableOnly: true },
    })

    fireEvent.click(screen.getByTestId('topbar-filter-issues-only'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { issuesOnly: true },
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

  it('dispatches SET_FILTERS for host, direction, and quality toggles', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-filters-button'))
    fireEvent.click(screen.getByTestId('topbar-filter-host-foh-local'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { hostIds: ['foh.local'] },
    })

    fireEvent.click(screen.getByTestId('topbar-filter-direction-talker'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { directions: ['talker'] },
    })

    fireEvent.click(screen.getByTestId('topbar-filter-quality-critical'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { qualities: ['critical'] },
    })
  })

  it('toggles issues-only filter from the endpoint-issues status chip', () => {
    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-endpoint-issues-filter-chip'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { issuesOnly: true },
    })
  })

  it('clears issues-only filter from the endpoint-issues status chip when already active', () => {
    mockState = {
      ...mockState,
      filters: {
        ...mockState.filters,
        issuesOnly: true,
      },
    }

    render(<TopBar />)

    fireEvent.click(screen.getByTestId('topbar-endpoint-issues-filter-chip'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_FILTERS',
      payload: { issuesOnly: false },
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
        issuesOnly: true,
        showLocked: false,
        groups: ['FOH'],
        hostIds: ['foh.local'],
        directions: ['listener'],
        qualities: ['critical'],
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
        issuesOnly: false,
        showLocked: true,
        groups: [],
        hostIds: [],
        directions: [],
        qualities: [],
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
        issuesOnly: true,
        showLocked: false,
        groups: ['Stage'],
        hostIds: ['stage.local'],
        directions: ['talker'],
        qualities: ['warning'],
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
