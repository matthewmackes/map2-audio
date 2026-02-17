import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TopBar } from './TopBar'
import { RoutingProvider, useFilteredEndpoints, useRoutingState } from '../../context/RoutingContext'
import { initialRoutingState } from '../../types'
import type { AvbNode, ConnectionsResponse, Endpoint, EndpointsResponse, Route } from '../../types'

let mockEndpointsData: EndpointsResponse | undefined
let mockConnectionsData: ConnectionsResponse | undefined
let mockNodesData: AvbNode[] | undefined
let mockLocalNodeId = 'node-a'

const mockBatchMutate = jest.fn()
const mockNotify = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
}

jest.mock('../../hooks/useAvbApi', () => ({
  useEndpoints: () => ({
    data: mockEndpointsData,
    isLoading: false,
    error: null,
  }),
  useConnections: () => ({
    data: mockConnectionsData,
    isLoading: false,
    error: null,
  }),
  useBatchPatchMutation: () => ({
    mutate: mockBatchMutate,
    isPending: false,
  }),
}))

jest.mock('../../hooks/useNodeApi', () => ({
  useNodes: () => ({
    data: mockNodesData,
    isLoading: false,
    error: null,
  }),
  usePtpStatus: () => ({
    data: undefined,
  }),
  useLocalNodeId: () => mockLocalNodeId,
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

function makeNode(overrides: Partial<AvbNode>): AvbNode {
  return {
    node_id: 'node-a',
    name: 'Node A',
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
      sample_rates: [48000, 96000],
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

function makeSceneRoute(talker_id: string, listener_id: string): Route {
  return {
    id: `${talker_id}→${listener_id}`,
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

function TopBarFilterProbe() {
  const state = useRoutingState()
  const orderedEndpointIds = useFilteredEndpoints()
    .map((endpoint) => endpoint.endpoint_id)
    .join('|') || 'none'
  const endpointIds = orderedEndpointIds
    .split('|')
    .filter((id) => id.length > 0 && id !== 'none')
    .sort()
    .join('|') || 'none'
  const selectedNodeIds = [...state.network.nodeSelection.selected_node_ids].sort().join('|') || 'none'

  return (
    <div>
      <span data-testid="probe-view-mode">{state.network.nodeSelection.view_mode}</span>
      <span data-testid="probe-selected-node-ids">{selectedNodeIds}</span>
      <span data-testid="probe-endpoint-ids">{endpointIds}</span>
      <span data-testid="probe-endpoint-order">{orderedEndpointIds}</span>
    </div>
  )
}

describe('TopBar filter controls provider integration', () => {
  beforeEach(() => {
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockLocalNodeId = 'node-a'
    mockBatchMutate.mockReset()
    mockNotify.success.mockReset()
    mockNotify.error.mockReset()
    mockNotify.warning.mockReset()
    mockNotify.info.mockReset()
  })

  it('updates filtered endpoint output under multi-select node context when TopBar filters change', async () => {
    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      device_type: 'map2',
      sample_rate: 48000,
      channels: 2,
      group: 'Stage',
      available: true,
      locked: false,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      device_type: 'avdecc',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      available: false,
      locked: true,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      device_type: 'map2',
      sample_rate: 48000,
      channels: 2,
      group: 'Aux',
      available: true,
      locked: false,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarFilterProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('probe-view-mode').textContent).toBe('multi_select')
      expect(screen.getByTestId('probe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-button'))

    fireEvent.click(screen.getByTestId('topbar-filter-available-only'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-available-only'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-sample-96000'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-channels-8'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-group-foh'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-show-locked'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('none')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-clear-all'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })
  })

  it('keeps deterministic endpoint ordering when combining search text with expanded filters in multi-select mode', async () => {
    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      device_name: 'Zulu Vox',
      device_type: 'map2',
      sample_rate: 48000,
      channels: 2,
      group: 'Stage',
      pinned: false,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      device_name: 'Alpha Vox',
      device_type: 'avdecc',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      pinned: false,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-b',
      device_name: 'Bravo Vox',
      device_type: 'map2',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      pinned: true,
    })
    const endpointD = makeEndpoint({
      endpoint_id: 'endpoint-d',
      node_id: 'node-c',
      device_name: 'Alpha Vox Remote',
      device_type: 'map2',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      pinned: true,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
        [endpointD.endpoint_id]: endpointD,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarFilterProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b|endpoint-a')
    })

    fireEvent.change(screen.getByTestId('topbar-search-input'), {
      target: { value: 'vox' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b|endpoint-a')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-button'))

    fireEvent.click(screen.getByTestId('topbar-filter-sample-96000'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-channels-8'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-group-foh'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b')
    })

    fireEvent.change(screen.getByTestId('topbar-search-input'), {
      target: { value: 'alpha' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-clear-all'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-b')
    })

    fireEvent.change(screen.getByTestId('topbar-search-input'), {
      target: { value: '' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b|endpoint-a')
      expect(screen.getByTestId('probe-selected-node-ids').textContent).toBe('node-a|node-b')
    })
  })

  it('drives scene diff preview generation and clear actions through TopBar controls with provider state', async () => {
    const talkerOne = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 11,
      device_name: 'Talker One',
    })
    const listenerOne = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 12,
      device_name: 'Listener One',
    })
    const talkerTwo = makeEndpoint({
      endpoint_id: 'talker-2',
      direction: 'talker',
      unique_id: 13,
      device_name: 'Talker Two',
    })
    const listenerTwo = makeEndpoint({
      endpoint_id: 'listener-2',
      direction: 'listener',
      unique_id: 14,
      device_name: 'Listener Two',
    })

    const baselineRoute = makeSceneRoute('talker-1', 'listener-1')
    const compareOnlyRoute = makeSceneRoute('talker-2', 'listener-2')

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [talkerOne.endpoint_id]: talkerOne,
        [listenerOne.endpoint_id]: listenerOne,
        [talkerTwo.endpoint_id]: talkerTwo,
        [listenerTwo.endpoint_id]: listenerTwo,
      },
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [baselineRoute],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [baselineRoute, compareOnlyRoute],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    expect(screen.queryByTestId('scene-diff-preview')).toBeNull()

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Baseline Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compare Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene' }))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-preview')).toBeTruthy()
      expect(screen.getByTestId('scene-diff-preview-scope').textContent).toContain('Baseline Scene vs Compare Scene')
      expect(screen.getByTestId('scene-diff-preview-add-count').textContent).toContain('1 add')
      expect(screen.getByTestId('scene-diff-preview-remove-count').textContent).toContain('0 remove')
      expect(screen.getByTestId('scene-diff-preview-total-changes').textContent).toContain('Total changes: 1')
      expect(screen.getByTestId('scene-diff-preview-add-routes').textContent).toContain('Talker Two -> Listener Two')
    })

    expect(mockNotify.info).toHaveBeenCalledWith('Generated scene diff: Baseline Scene vs Compare Scene.')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-clear'))

    await waitFor(() => {
      expect(screen.queryByTestId('scene-diff-preview')).toBeNull()
    })
  })

  it('replaces active diff selections with newly saved scenes after lifecycle churn', async () => {
    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 21,
      device_name: 'Talker One',
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 22,
      device_name: 'Listener One',
    })
    const liveRoute = makeSceneRoute('talker-1', 'listener-1')

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
      },
      liveRoutes: {
        [liveRoute.id]: liveRoute,
      },
      scenes: {
        'scene-legacy-a': {
          id: 'scene-legacy-a',
          name: 'Legacy Baseline v1',
          description: '',
          routes: [liveRoute],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-legacy-b': {
          id: 'scene-legacy-b',
          name: 'Legacy Compare v1',
          description: '',
          routes: [liveRoute],
          timestamp: '2026-02-17T00:01:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: 'scene-legacy-a',
        compare_scene_id: 'scene-legacy-b',
        preview: null,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Legacy Baseline v1')
      expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Legacy Compare v1')
      expect(screen.getByTestId('topbar-scene-status-readiness').textContent).toContain('Diff selection ready')
    })

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))

    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Baseline Scene v2' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Compare Scene v2' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-count').textContent).toContain('4 scenes')
    })

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Legacy Baseline v1' }))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Legacy Compare v1' }))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-count').textContent).toContain('2 scenes')
      expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Baseline: None')
      expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Compare: None')
      expect(screen.getByTestId('topbar-scene-status-readiness').textContent).toContain('Diff selection incomplete')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Baseline Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene v2' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compare Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene v2' }))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Baseline Scene v2')
      expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Compare Scene v2')
      expect(screen.getByTestId('topbar-scene-status-readiness').textContent).toContain('Diff selection ready')
      expect(screen.getByTestId('scene-diff-preview')).toBeTruthy()
      expect(screen.getByTestId('scene-diff-preview-total-changes').textContent).toContain('Total changes: 0')
    })
  })
})
